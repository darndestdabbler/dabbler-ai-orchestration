"""Copilot CLI transport: seat-billed dispatch through the GitHub Copilot
CLI's headless mode, plus the seat-local catalog lockfile it selects from.

The CLI has no list-models command and no first-party provider field: a
model's provider is inferable only from its name prefix, and whether a model
is enabled on a seat is discoverable only by invoking it. The lockfile is
therefore seat-scoped, empirically-probed truth — the load-bearing record of
what this seat can dispatch — and is read (stdlib ``tomllib``), never written
here.

Dispatch is an invocation state machine: three-tier timeouts
(spawn < first_byte < total), JSONL event parsing, stderr-substring error
classification, and a per-process invocation breaker. ``dispatch()`` never
raises for an operational failure — it returns an :class:`APIResult` whose
``metadata['error_class']`` names the failure — and never retries internally:
the CLI is premium-request-billed and quota-blind, so a retry storm has real
cost no local guard can see.

Honest non-accounting: the CLI reports no dollar cost and no input tokens.
``input_tokens`` is always 0 and nothing from this transport is
billing-authoritative; real seat spend is measured by ``ai_router.seat_cost``
via the conversation id in ``metadata['session_id']``.

A routed call cannot mutate the workspace on either transport. The API path
sends no tools; here the agentic CLI gets a read-only tool allowlist
(``--available-tools view,grep,glob``) — ``--allow-all-tools`` stays because
it governs auto-approval, and once the tool universe is read-only, "allow
all" allows only read-only tools.
"""

from __future__ import annotations

import json
import queue
import subprocess
import threading
import time
import tomllib
from dataclasses import dataclass, field
from typing import Callable, Optional, Protocol, Sequence

from .base import APIResult

# --- Error-class taxonomy. Nothing is retryable today; the set stays empty
# (not absent) so a future promotion is a one-line, deliberate change.
ERROR_CLASS_INVALID_MODEL = "invalid-model"
ERROR_CLASS_AUTH = "auth-class"
ERROR_CLASS_QUOTA = "quota-rate-class"
ERROR_CLASS_GENERIC = "generic-unknown"
ERROR_CLASS_SPAWN_TIMEOUT = "spawn-timeout"
ERROR_CLASS_FIRST_BYTE_TIMEOUT = "first-byte-timeout"
ERROR_CLASS_TOTAL_TIMEOUT = "total-timeout"
ERROR_CLASS_BREAKER = "invocation-breaker"

RETRYABLE_ERROR_CLASSES: frozenset[str] = frozenset()

_AUTH_SUBSTRINGS = (
    "auth", "login", "credential", "unauthorized", "authentication",
    "401", "403", "not logged in",
)
_QUOTA_SUBSTRINGS = ("rate limit", "quota", "429", "too many requests")
_INVALID_MODEL_SUBSTRING = "from --model flag is not available"

DEFAULT_SPAWN_TIMEOUT_SECONDS = 10.0
DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS = 30.0
DEFAULT_TOTAL_TIMEOUT_SECONDS = 1200.0

_NO_AUTO_UPDATE_FLAG = "--no-auto-update"
_NO_AUTO_UPDATE_ENV = {"COPILOT_AUTO_UPDATE": "false"}

#: The only tools a routed call may use. Read-only by construction.
READ_ONLY_TOOLS: tuple[str, ...] = ("view", "grep", "glob")


def _classify_stderr(stderr_text: str) -> str:
    """Map raw stderr to an error class. Anything unmatched falls to
    generic-unknown (auth-class-or-worse), never a speculative retryable
    bucket."""
    lowered = stderr_text.lower()
    if _INVALID_MODEL_SUBSTRING in lowered:
        return ERROR_CLASS_INVALID_MODEL
    if any(s in lowered for s in _AUTH_SUBSTRINGS):
        return ERROR_CLASS_AUTH
    if any(s in lowered for s in _QUOTA_SUBSTRINGS):
        return ERROR_CLASS_QUOTA
    return ERROR_CLASS_GENERIC


# --- Timeouts ---------------------------------------------------------------

@dataclass(frozen=True)
class TransportTimeouts:
    spawn_seconds: float = DEFAULT_SPAWN_TIMEOUT_SECONDS
    first_byte_seconds: float = DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS
    total_seconds: float = DEFAULT_TOTAL_TIMEOUT_SECONDS


TIMEOUT_FIELD_DEFAULTS = (
    ("spawn_seconds", DEFAULT_SPAWN_TIMEOUT_SECONDS),
    ("first_byte_seconds", DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS),
    ("total_seconds", DEFAULT_TOTAL_TIMEOUT_SECONDS),
)


def validate_transport_timeouts(block: object) -> None:
    """Raise ``ValueError`` unless *block* is a valid ``timeouts:`` mapping.

    Unknown keys are rejected rather than ignored: a typo'd ``total_second``
    silently keeping the default is exactly the failure this exists to end.
    The trio must satisfy spawn < first_byte < total, or an inner ceiling
    can never fire and a stall is misclassified at the outer one.
    """
    if block is None:
        return
    if not isinstance(block, dict):
        raise ValueError(
            "transports.copilot-cli.timeouts must be a mapping, got "
            f"{type(block).__name__}"
        )
    known = {name for name, _ in TIMEOUT_FIELD_DEFAULTS}
    unknown = sorted(set(block) - known)
    if unknown:
        raise ValueError(
            f"transports.copilot-cli.timeouts has unknown key(s): {unknown}. "
            f"Known: {sorted(known)}"
        )
    for name, _default in TIMEOUT_FIELD_DEFAULTS:
        if name not in block:
            continue
        value = block[name]
        # bool is an int in Python; True here is a config error, not 1s.
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(
                f"transports.copilot-cli.timeouts.{name} must be a number, "
                f"got {type(value).__name__}"
            )
        if value <= 0:
            raise ValueError(
                f"transports.copilot-cli.timeouts.{name} must be > 0, got {value}"
            )
    resolved = resolve_transport_timeouts({"timeouts": block})
    if not (
        resolved.spawn_seconds
        < resolved.first_byte_seconds
        < resolved.total_seconds
    ):
        raise ValueError(
            "transports.copilot-cli.timeouts must satisfy spawn_seconds < "
            "first_byte_seconds < total_seconds; got "
            f"{resolved.spawn_seconds} / {resolved.first_byte_seconds} / "
            f"{resolved.total_seconds}"
        )


def resolve_transport_timeouts(cli_cfg: Optional[dict]) -> TransportTimeouts:
    """Effective timeouts for a ``transports.copilot-cli`` block; each field
    falls back to its shipped default."""
    block = (cli_cfg or {}).get("timeouts") or {}
    if not isinstance(block, dict):
        block = {}
    values = {}
    for name, default in TIMEOUT_FIELD_DEFAULTS:
        raw = block.get(name, default)
        try:
            values[name] = float(raw)
        except (TypeError, ValueError):
            values[name] = float(default)
    return TransportTimeouts(**values)


# --- Spawner seam -----------------------------------------------------------

class ProcessHandle(Protocol):
    """The subset of ``subprocess.Popen`` the state machine depends on."""

    stdout: object
    stderr: object

    def poll(self) -> Optional[int]: ...
    def kill(self) -> None: ...
    def wait(self, timeout: Optional[float] = None) -> int: ...


Spawner = Callable[[Sequence[str], Optional[dict]], ProcessHandle]


def default_spawner(argv: Sequence[str], env: Optional[dict]) -> ProcessHandle:
    """The real spawner. ``shell=False`` always. Encoding is forced to UTF-8
    (JSON's own encoding) with ``errors="replace"``: without it, Windows
    decodes the child's streams with the locale codepage, a decode error
    kills the reader thread mid-stream, the child blocks on a full pipe,
    and a local decode bug is misclassified as a total-timeout."""
    import os

    merged_env = None
    if env:
        merged_env = dict(os.environ)
        merged_env.update(env)
    return subprocess.Popen(
        list(argv),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=merged_env,
    )


class _SpawnTimeout(Exception):
    pass


def _spawn_with_timeout(
    spawner: Spawner, argv: Sequence[str], env: Optional[dict], timeout: float
) -> ProcessHandle:
    """Call *spawner* on a bounded thread. If the spawner returns a real,
    billed process after the caller has given up, the background thread
    kills and reaps it rather than leaving a live child with unread pipes."""
    box: dict = {}
    lock = threading.Lock()
    gave_up = False

    def _run() -> None:
        try:
            proc = spawner(argv, env)
        except BaseException as exc:  # noqa: BLE001 - re-raised on the caller's thread
            with lock:
                box["exc"] = exc
            return
        with lock:
            already_gave_up = gave_up
            if not already_gave_up:
                box["proc"] = proc
        if already_gave_up:
            try:
                proc.kill()
                proc.wait(timeout=15)
            except Exception:  # noqa: BLE001 - best-effort orphan cleanup
                pass

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    thread.join(timeout)
    with lock:
        still_running = thread.is_alive()
        if still_running:
            gave_up = True
    if still_running:
        raise _SpawnTimeout(f"spawner did not return within {timeout}s")
    if "exc" in box:
        raise box["exc"]
    return box["proc"]


def _reader_thread(stream, out_queue: "queue.Queue") -> threading.Thread:
    def _run() -> None:
        try:
            for line in iter(stream.readline, ""):
                out_queue.put(line)
        except (OSError, ValueError):
            pass
        finally:
            out_queue.put(None)  # EOF sentinel

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t


def _kill_and_reap(proc: ProcessHandle) -> None:
    """Kill AND reap, every time — an unkilled wait leaves a zombie on
    POSIX. This is the single place that rule is enforced."""
    proc.kill()
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:  # pragma: no cover - defensive
        pass


def _drain_queue(q: "queue.Queue", *, budget_seconds: float) -> str:
    lines: list[str] = []
    deadline = time.monotonic() + budget_seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            item = q.get(timeout=remaining)
        except queue.Empty:
            break
        if item is None:
            break
        lines.append(item)
    return "".join(lines)


def _parse_jsonl(raw_stdout: str) -> tuple[list[dict], list[str]]:
    """Parse JSONL into ``(events, malformed_lines)``. Blank lines are
    skipped; any other unparseable line is recorded rather than raised."""
    events: list[dict] = []
    malformed: list[str] = []
    for line in raw_stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            obj = json.loads(stripped)
        except json.JSONDecodeError:
            malformed.append(stripped)
            continue
        if isinstance(obj, dict):
            events.append(obj)
        else:
            malformed.append(stripped)
    return events, malformed


def _last_event(events: Sequence[dict], event_type: str) -> Optional[dict]:
    for event in reversed(events):
        if event.get("type") == event_type and not event.get("ephemeral"):
            return event
    return None


class CopilotCliTransport:
    """Dispatches one call through the Copilot CLI's headless mode.

    *spawner* is the sole seam tests replace with a fake process, so the
    whole state machine runs without touching a real CLI.
    *max_invocations* is a per-process hard circuit breaker on CLI spawns —
    a safety ceiling on what we DID, never a fabricated cap on what GitHub
    billed. The slot is reserved before dispatch, so a failed dispatch
    still consumes it.
    """

    def __init__(
        self,
        *,
        binary: str = "copilot",
        spawner: Spawner = default_spawner,
        timeouts: Optional[TransportTimeouts] = None,
        max_invocations: Optional[int] = None,
        version_probe: Optional[Callable[[], Optional[str]]] = None,
    ) -> None:
        self._binary = binary
        self._spawner = spawner
        self._timeouts = timeouts or TransportTimeouts()
        self._max_invocations = max_invocations
        self._invocation_count = 0
        self._invocation_lock = threading.Lock()
        # Cheap, unbilled --version probe run only on an auth-class failure,
        # to distinguish "the whole CLI is down" from "this call failed".
        # Never a retry of the billed dispatch.
        self._version_probe = version_probe or (
            lambda: get_cli_version(binary=self._binary)
        )

    @property
    def invocation_count(self) -> int:
        return self._invocation_count

    def dispatch(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 0,
        generation_params: Optional[dict] = None,
    ) -> APIResult:
        """Run one non-interactive turn against *model_id*.

        The CLI has no separate system-prompt flag: system and user text
        join into the single ``-p`` argument. *max_tokens* and
        *generation_params* are accepted for Transport-protocol parity and
        ignored — the CLI exposes neither knob.
        """
        with self._invocation_lock:
            if (
                self._max_invocations is not None
                and self._invocation_count >= self._max_invocations
            ):
                return self._error_result(
                    error_class=ERROR_CLASS_BREAKER,
                    raw_stdout="",
                    raw_stderr=(
                        f"max_invocations_per_session ({self._max_invocations}) "
                        "reached for this process; raise the config value or "
                        "restart the process to continue"
                    ),
                    argv=[],
                )
            self._invocation_count += 1

        prompt = (
            f"{system_prompt}\n\n{user_message}" if system_prompt else user_message
        )
        argv = [
            self._binary,
            "-p", prompt,
            "--model", model_id,
            "--allow-all-tools",
            "--available-tools", ",".join(READ_ONLY_TOOLS),
            "--output-format", "json",
            _NO_AUTO_UPDATE_FLAG,
        ]
        return self._run(argv)

    def _run(self, argv: Sequence[str]) -> APIResult:
        timeouts = self._timeouts

        try:
            proc = _spawn_with_timeout(
                self._spawner, argv, _NO_AUTO_UPDATE_ENV, timeouts.spawn_seconds
            )
        except _SpawnTimeout:
            return self._error_result(
                error_class=ERROR_CLASS_SPAWN_TIMEOUT,
                raw_stdout="", raw_stderr="", argv=argv,
            )
        except Exception as exc:  # noqa: BLE001 - any spawner failure is a
            # classified result, never an escaping exception.
            return self._error_result(
                error_class=ERROR_CLASS_GENERIC,
                raw_stdout="", raw_stderr=str(exc), argv=argv,
            )

        # Deadlines anchor AFTER the spawn tier resolves, so first-byte and
        # total measure the live process, not wall-clock the spawn stole.
        spawn_returned = time.monotonic()
        stdout_q: "queue.Queue" = queue.Queue()
        stderr_q: "queue.Queue" = queue.Queue()
        _reader_thread(proc.stdout, stdout_q)
        _reader_thread(proc.stderr, stderr_q)

        stdout_lines: list[str] = []
        first_byte_deadline = spawn_returned + timeouts.first_byte_seconds
        total_deadline = spawn_returned + timeouts.total_seconds
        timed_out_class: Optional[str] = None
        stdout_eof = False

        while not stdout_eof:
            now = time.monotonic()
            deadline = first_byte_deadline if not stdout_lines else total_deadline
            remaining = deadline - now
            if remaining <= 0:
                timed_out_class = (
                    ERROR_CLASS_FIRST_BYTE_TIMEOUT
                    if not stdout_lines
                    else ERROR_CLASS_TOTAL_TIMEOUT
                )
                break
            try:
                item = stdout_q.get(timeout=remaining)
            except queue.Empty:
                continue
            if item is None:
                stdout_eof = True
                break
            stdout_lines.append(item)

        if timed_out_class is not None:
            _kill_and_reap(proc)
            return self._error_result(
                error_class=timed_out_class,
                raw_stdout="".join(stdout_lines),
                raw_stderr=_drain_queue(stderr_q, budget_seconds=5.0),
                argv=argv,
            )

        # stdout hit EOF cleanly. Bound the exit wait by what remains of the
        # total budget so a process that closes stdout but never exits
        # cannot hold the caller past the configured ceiling.
        remaining_total = total_deadline - time.monotonic()
        if remaining_total <= 0:
            _kill_and_reap(proc)
            return self._error_result(
                error_class=ERROR_CLASS_TOTAL_TIMEOUT,
                raw_stdout="".join(stdout_lines),
                raw_stderr=_drain_queue(stderr_q, budget_seconds=5.0),
                argv=argv,
            )
        try:
            exit_code = proc.wait(timeout=remaining_total)
        except subprocess.TimeoutExpired:
            _kill_and_reap(proc)
            return self._error_result(
                error_class=ERROR_CLASS_TOTAL_TIMEOUT,
                raw_stdout="".join(stdout_lines),
                raw_stderr=_drain_queue(stderr_q, budget_seconds=5.0),
                argv=argv,
            )

        raw_stdout = "".join(stdout_lines)
        raw_stderr = _drain_queue(stderr_q, budget_seconds=5.0)

        if exit_code != 0:
            error_class = _classify_stderr(raw_stderr)
            reprobe_cli_version = None
            if error_class == ERROR_CLASS_AUTH:
                reprobe_cli_version = self._version_probe()
            return self._error_result(
                error_class=error_class,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                argv=argv, exit_code=exit_code,
                reprobe_cli_version=reprobe_cli_version,
            )

        return self._success_result(
            raw_stdout=raw_stdout, raw_stderr=raw_stderr, exit_code=exit_code,
        )

    def _error_result(
        self,
        *,
        error_class: str,
        raw_stdout: str,
        raw_stderr: str,
        argv: Sequence[str],
        exit_code: Optional[int] = None,
        reprobe_cli_version: Optional[str] = None,
    ) -> APIResult:
        return APIResult(
            content="",
            input_tokens=0,
            output_tokens=0,
            stop_reason=f"error:{error_class}",
            served_model_id=None,
            metadata={
                "error_class": error_class,
                "retryable": error_class in RETRYABLE_ERROR_CLASSES,
                "exit_code": exit_code,
                "stderr_tail": raw_stderr[-2000:],
                "reprobe_cli_version": reprobe_cli_version,
                "partial_output_discarded": bool(raw_stdout),
            },
        )

    def _success_result(
        self, *, raw_stdout: str, raw_stderr: str, exit_code: int
    ) -> APIResult:
        events, malformed_lines = _parse_jsonl(raw_stdout)
        final_message = _last_event(events, "assistant.message")
        result_event = _last_event(events, "result")

        if final_message is None or malformed_lines:
            # A zero exit with no parseable final message (or any malformed
            # line) is not trustworthy content — never patch together a
            # partial answer.
            return self._error_result(
                error_class=ERROR_CLASS_GENERIC,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                argv=[], exit_code=exit_code,
            )

        # Every field below came off the wire as arbitrary JSON. A
        # well-formed event with an unexpected field shape must fail closed
        # like a missing event, never escape as an uncaught TypeError.
        # Message payload fields are wrapped under "data"; the terminal
        # "result" event's fields sit at the envelope's top level.
        try:
            if "data" not in final_message:
                raise TypeError("assistant.message missing required 'data' key")
            message_data = final_message["data"]
            if not isinstance(message_data, dict):
                raise TypeError("assistant.message data is not a dict")
            content = message_data.get("content", "")
            if not isinstance(content, str):
                raise TypeError("content is not a string")
            echoed_model = message_data.get("model")
            if echoed_model is not None and not isinstance(echoed_model, str):
                raise TypeError("model is not a string")
            # int() would silently coerce "7" or 1.5; require the raw JSON
            # type to be exactly int (bool excluded).
            raw_output_tokens = message_data.get("outputTokens", 0)
            if raw_output_tokens is None:
                output_tokens = 0
            elif type(raw_output_tokens) is not int:
                raise TypeError("outputTokens is not an int")
            else:
                output_tokens = raw_output_tokens
            usage_raw = (
                result_event.get("usage") if result_event is not None else None
            )
            if usage_raw is not None and not isinstance(usage_raw, dict):
                raise TypeError("usage is not a dict")
            usage = usage_raw or {}
            session_id = (
                result_event.get("sessionId") if result_event is not None else None
            )
            if session_id is not None and not isinstance(session_id, str):
                session_id = None
        except (TypeError, ValueError, AttributeError):
            return self._error_result(
                error_class=ERROR_CLASS_GENERIC,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                argv=[], exit_code=exit_code,
            )

        return APIResult(
            content=content,
            input_tokens=0,  # never reported by the CLI
            output_tokens=output_tokens,
            stop_reason="end_turn",
            served_model_id=(
                echoed_model if echoed_model and echoed_model.strip() else None
            ),
            metadata={
                "error_class": None,
                "retryable": False,
                "exit_code": exit_code,
                "session_id": session_id,
                "premium_requests": usage.get("premiumRequests"),
            },
        )


# --- CLI preflight ----------------------------------------------------------

def get_cli_version(*, binary: str = "copilot") -> Optional[str]:
    """First line of ``copilot --version``, or ``None`` when the CLI is
    absent or failing. The banner's second line is an update nag."""
    try:
        result = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    stripped = result.stdout.strip()
    if not stripped:
        return None
    return stripped.splitlines()[0].strip() or None


def preflight(
    *, binary: str = "copilot", transport: Optional[CopilotCliTransport] = None
) -> tuple[bool, str]:
    """CLI-on-PATH check plus a one-token probe. Returns ``(ok, detail)``."""
    version = get_cli_version(binary=binary)
    if version is None:
        return False, f"{binary!r} is not on PATH or failed --version"
    transport = transport or CopilotCliTransport(binary=binary)
    result = transport.dispatch(
        model_id="claude-sonnet-4.6",
        system_prompt="",
        user_message="Reply with the single word OK and nothing else.",
    )
    if not result.ok:
        return False, (
            f"probe dispatch failed: {result.metadata.get('error_class')}"
        )
    return True, version


# --- Seat catalog lockfile --------------------------------------------------

ENABLEMENT_CONFIRMED = "confirmed"
KNOWN_PROVIDERS = frozenset({"anthropic", "openai", "google"})

# v1 lockfiles spell the probe sample `premium_request_weight`; v2 renamed it
# because "weight" reads as a rate and the value is a one-call sample. It is
# NOT a price and never feeds selection; absent means unknown, never free.
_LEGACY_PROBE_PREMIUM_KEY = "premium_request_weight"


@dataclass
class ModelEntry:
    id: str
    provider: str = ""
    enablement: str = "unconfirmed"
    probe_premium_requests: Optional[int] = None
    echoed_model: Optional[str] = None


@dataclass
class CatalogMeta:
    cli_version: str
    cli_version_pin_required: bool
    seat_id: str
    seat_label: str = ""


@dataclass
class Catalog:
    meta: CatalogMeta
    models: list = field(default_factory=list)

    def confirmed_models(self) -> list:
        return [m for m in self.models if m.enablement == ENABLEMENT_CONFIRMED]

    def provider_of(self, model_id: str) -> Optional[str]:
        """Provider of a CONFIRMED entry only. A bare, unconfirmed model id
        has no trustworthy provenance, and this value can drive a
        same-provider safety exclusion — callers fail closed on ``None``."""
        for entry in self.confirmed_models():
            if entry.id == model_id:
                return entry.provider
        return None


def load_catalog(path) -> Catalog:
    """Read a seat catalog lockfile (TOML) via stdlib ``tomllib``."""
    with open(path, "rb") as f:
        data = tomllib.load(f)
    meta_raw = data.get("meta")
    if not isinstance(meta_raw, dict):
        raise ValueError(f"catalog lockfile {path!r} has no [meta] table")
    for required in ("cli_version", "seat_id"):
        if required not in meta_raw:
            raise ValueError(
                f"catalog lockfile [meta] is missing required key {required!r}"
            )
    meta = CatalogMeta(
        cli_version=str(meta_raw["cli_version"]),
        # Default off: the seat CLI updates itself, so a pin that defaults
        # to strict turns every routine auto-update into a dead seat.
        cli_version_pin_required=bool(
            meta_raw.get("cli_version_pin_required", False)
        ),
        seat_id=str(meta_raw["seat_id"]),
        seat_label=str(meta_raw.get("seat_label", "")),
    )
    entries = []
    for md in data.get("models", []):
        if not isinstance(md, dict) or "id" not in md:
            raise ValueError(f"catalog lockfile has a malformed [[models]] entry: {md!r}")
        raw_probe = md.get(
            "probe_premium_requests", md.get(_LEGACY_PROBE_PREMIUM_KEY)
        )
        entries.append(ModelEntry(
            id=str(md["id"]),
            provider=str(md.get("provider", "")),
            enablement=str(md.get("enablement", "unconfirmed")),
            probe_premium_requests=(
                raw_probe
                if isinstance(raw_probe, int) and not isinstance(raw_probe, bool)
                else None
            ),
            echoed_model=md.get("echoed_model"),
        ))
    return Catalog(meta=meta, models=entries)


@dataclass(frozen=True)
class CatalogValidationResult:
    ok: bool
    reasons: tuple = ()
    warnings: tuple = ()

    def __bool__(self) -> bool:
        return self.ok


def validate_catalog(
    catalog: Catalog, *, live_cli_version: Optional[str] = None
) -> CatalogValidationResult:
    """Fail-closed catalog rules: provenance on every confirmed entry and
    provider diversity (cross-provider verification needs >= 2 distinct
    providers). Never raises — callers branch on ``.ok``/``.reasons``.

    CLI version drift is a **warning**, not a failure. The seat CLI
    auto-updates on its own schedule, so a pinned lockfile goes stale
    with no action by the operator; refusing the whole seat for that
    stranded two people on a working seat and taught both to hand-edit
    the pin, which is the one outcome that destroys the signal. A model
    that genuinely vanished from the seat fails its own dispatch with a
    real error — per-model and honest, rather than all-or-nothing on a
    version string. Strict pinning remains available for an operator who
    wants it via ``cli_version_pin_required = true``.
    """
    reasons: list = []
    warnings: list = []

    if live_cli_version is not None and live_cli_version != catalog.meta.cli_version:
        drift = (
            f"CLI version drift: lock pinned to {catalog.meta.cli_version!r}, "
            f"live CLI reports {live_cli_version!r}"
        )
        if catalog.meta.cli_version_pin_required:
            reasons.append(
                drift + " (strict pinning is on via cli_version_pin_required)"
            )
        else:
            warnings.append(
                drift + "; entries confirmed on the pinned version are still "
                "trusted. Re-probe the seat to refresh the lockfile."
            )

    confirmed = catalog.confirmed_models()
    for entry in confirmed:
        if not entry.provider or entry.provider not in KNOWN_PROVIDERS:
            reasons.append(
                f"Missing/unknown provenance on confirmed entry {entry.id!r}: "
                f"provider={entry.provider!r}"
            )

    distinct = {e.provider for e in confirmed if e.provider in KNOWN_PROVIDERS}
    if len(distinct) < 2:
        reasons.append(
            "Same-provider-only catalog: confirmed entries resolve to "
            f"{sorted(distinct)} (need >= 2 distinct providers)"
        )

    return CatalogValidationResult(
        ok=not reasons, reasons=tuple(reasons), warnings=tuple(warnings)
    )


def resolve_role_candidates(
    config: dict,
    catalog: Catalog,
    role: str,
    exclude_providers=None,
) -> list[tuple[str, str]]:
    """Ordered ``(model_id, provider)`` candidates for a catalog role.

    Walks ``transports.copilot-cli.roles.<role>.prefer`` in declared order;
    an entry qualifies when it is confirmed on the catalog, its provider is
    in ``require_provider_in`` (when set), and its provider is not excluded.
    When an exclusion is active, the prefer list is a preference order, not
    the candidate universe: remaining confirmed entries (in catalog order)
    that survive follow the preferred ones, so an exclusion only fails when
    the seat truly has no surviving candidate.
    """
    exclude = {str(p).strip().lower() for p in (exclude_providers or []) if p}
    roles_cfg = (
        (config.get("transports") or {}).get("copilot-cli") or {}
    ).get("roles") or {}
    role_cfg = roles_cfg.get(role) or {}
    prefer = role_cfg.get("prefer") or []
    require_provider_in = set(role_cfg.get("require_provider_in") or [])

    def _qualifies(entry: ModelEntry) -> bool:
        if entry.enablement != ENABLEMENT_CONFIRMED:
            return False
        if not entry.provider or entry.provider not in KNOWN_PROVIDERS:
            return False
        if require_provider_in and entry.provider not in require_provider_in:
            return False
        return entry.provider not in exclude

    by_id = {e.id: e for e in catalog.models}
    candidates: list[tuple[str, str]] = []
    for model_id in prefer:
        entry = by_id.get(model_id)
        if entry is not None and _qualifies(entry):
            candidates.append((entry.id, entry.provider))
    if exclude:
        for entry in catalog.models:
            if _qualifies(entry) and (entry.id, entry.provider) not in candidates:
                candidates.append((entry.id, entry.provider))
    return candidates
