"""Copilot CLI transport: seat-billed dispatch through the GitHub Copilot
CLI's headless mode, plus the seat-local catalog lockfile it selects from.

The CLI has no list-models command and no first-party provider field: a
model's provider is inferable only from its name prefix, and whether a model
is enabled on a seat is discoverable only by invoking it. The lockfile is
therefore seat-scoped, empirically-probed truth — the load-bearing record of
what this seat can dispatch — and this module is its only writer. A reader
without a writer leaves hand-editing as the only remedy for a stale file,
which destroys exactly the empirical signal the file exists to carry.

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
all" allows only read-only tools. The one write the verifier is granted is
not an exception to this: it is performed by the framework after the call
returns, from a block in the answer, precisely so that a path outside the
declared test root can be refused rather than merely discouraged. See
``ai_router.agency``. ``--no-custom-instructions`` is part of the same
parity: the CLI otherwise loads the workspace's ``AGENTS.md`` /
``CLAUDE.md`` into the system prompt, which would hand a routed verifier the
orchestrator's own instructions — text the API path never sends, that
inflates the payload, and that tells the verifier it is running the session
it was asked to judge.

Every tool the CLI executes is reported back in ``metadata['tool_calls']``,
paired from the CLI's own start and completion events. The CLI runs the
tools, so this is the only account of what a routed model looked at that the
model did not write itself, and ``ai_router.agency`` is what weighs it.

Large prompts travel as a PULL, not as argv. The CLI's only non-interactive
prompt input is ``-p <text>``, so the whole composed prompt would otherwise
be one argv element — and Windows ``CreateProcessW`` caps the entire rendered
command line at 32,767 UTF-16 code units, which a verification bundle clears
easily. Above a threshold the payload goes to a temp file and ``-p`` carries
only a short bootstrap pointing at it; an EOF nonce fails the call closed
when the model did not read the file through. See the handoff section below.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import queue
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import tomllib
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable, Optional, Protocol, Sequence

from .base import APIResult
from ..lockfile import (
    PROVENANCE_HAND_EDITED,
    PROVENANCE_MACHINE_WRITTEN,
    PROVENANCE_UNSTAMPED,
    digest_text,
    provenance as record_provenance,
    render_document,
    set_or_drop as _set_or_drop,
    utc_now as _utc_now,
    write_document,
    writer_id,
)

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
#: The handoff payload was dispatched but the response did not carry the
#: footer's acknowledgement — the model did not read the file through.
ERROR_CLASS_HANDOFF_INCOMPLETE = "handoff-incomplete"
#: The OS refused the spawn because the command line exceeded its ceiling.
#: The handoff exists to make this unreachable; it is named anyway, because
#: this failure spent a year wearing the generic-unknown mask.
ERROR_CLASS_ARGV_TOO_LARGE = "argv-too-large"

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


# --- Large-prompt file handoff ----------------------------------------------
#
# The whole composed prompt travels as ONE ``-p`` argv element, and Windows
# ``CreateProcessW`` caps the entire command line at 32,767 UTF-16 code units
# (quoting and the terminating NUL included). Linux has a per-argument limit
# too (``MAX_ARG_STRLEN``, 128 KiB); Windows just reaches it first. Above a
# conservative threshold the dispatch becomes a PULL: write the prompt to a
# per-request temp file, dispatch a short ``-p`` bootstrap pointing the
# agentic CLI at that file, and require an EOF nonce acknowledgement.
#
# The pull works because of two facts about the CLI, neither incidental: it
# has a file-read tool (``view``, in the read-only grant above), and the
# system temp directory is auto-allowed by default (``--disallow-temp-dir``
# is the opt-out, which this transport does not pass).

#: At or above this RENDERED command-line size (UTF-16 code units), switch to
#: the handoff. Measured on the rendered argv on EVERY OS: quoting expansion
#: and astral characters are otherwise miscounted, and one uniform rule gives
#: predictable behavior plus automatic cover for the Linux per-argument limit.
#: 24,000 leaves headroom below 32,767 for the executable path, quoting
#: expansion and future flags. A module constant by design — no config knob.
HANDOFF_THRESHOLD_UTF16_UNITS = 24000

#: The acknowledgement line shape. The nonce itself appears ONLY in the
#: payload file, never in argv, so a model that never read to EOF cannot
#: produce it.
_HANDOFF_ACK_PREFIX = "HANDOFF-ACK"

#: Retaining a payload file would weaken the transport's redaction posture,
#: so deletion is unconditional except under this explicit debug toggle.
_DIAGNOSTICS_ENV_VAR = "DABBLER_COPILOT_DIAGNOSTICS"
_DIAGNOSTICS_TRUTHY = frozenset({"1", "true", "yes", "on"})

#: Windows ERROR_FILENAME_EXCED_RANGE, raised as a FileNotFoundError whose
#: message is about filename length rather than a missing file.
_WINERROR_FILENAME_TOO_LONG = 206


def _diagnostics_retention_enabled(env: Optional[dict] = None) -> bool:
    """True only when the diagnostics toggle is explicitly truthy — the one
    condition under which a payload file is retained rather than deleted."""
    env = env if env is not None else os.environ
    raw = env.get(_DIAGNOSTICS_ENV_VAR)
    if raw is None:
        return False
    return raw.strip().lower() in _DIAGNOSTICS_TRUTHY


def _rendered_utf16_units(argv: Sequence[str]) -> int:
    """UTF-16 code units in the RENDERED command line for *argv*.

    ``subprocess.list2cmdline`` applies Windows quoting rules; encoding the
    result as UTF-16 and counting units measures exactly what
    ``CreateProcessW`` counts against its limit, and the ``+ 1`` is the
    terminating NUL that limit includes. Astral characters are two units
    each, which this counts correctly and ``len()`` on the str would not.
    """
    rendered = subprocess.list2cmdline(list(argv))
    return len(rendered.encode("utf-16-le")) // 2 + 1


def _is_argv_too_large(exc: BaseException) -> bool:
    """Did the OS refuse this spawn for command-line size? Decided from the
    OS error number, not from message text, which is localized."""
    if not isinstance(exc, OSError):
        return False
    if getattr(exc, "winerror", None) == _WINERROR_FILENAME_TOO_LONG:
        return True
    e2big = getattr(__import__("errno"), "E2BIG", None)
    return e2big is not None and exc.errno == e2big


def _build_handoff_footer(nonce: str) -> str:
    """The transport-control footer appended to the payload file. Carries the
    per-request nonce and the exact line the model must end its response
    with."""
    return (
        "\n\n"
        "===== TRANSPORT CONTROL FOOTER -- not part of the task =============\n"
        "You have now reached the END of the task specification file. Reaching\n"
        "this footer is what proves you read the file completely. The FINAL\n"
        "line of your response must be exactly the following line, with nothing\n"
        "after it:\n"
        f"{_HANDOFF_ACK_PREFIX} {nonce}\n"
        "===================================================================\n"
    )


def _build_handoff_bootstrap(posix_path: str) -> str:
    """The short ``-p`` bootstrap for a handoff dispatch. Names the payload in
    POSIX forward-slash form (models mangle backslashes), demands a complete
    sequential read before acting, and defers the ack line to the file's
    footer so the nonce stays out of argv. Contains NO nonce."""
    return (
        "Your complete and authoritative task instructions for this turn are in "
        "a UTF-8 text file. Before doing anything else, use your file-read tool "
        "to read the ENTIRE file at the path below, from the first byte through "
        "the end of file, reading in sequential chunks if it is large:\n"
        f"{posix_path}\n"
        "Execute the file's contents as your full instructions. Do not summarize "
        "the file back to me. The file ends with a transport-control footer that "
        "specifies an exact acknowledgement line; obey it -- the final line of "
        "your response must be exactly that acknowledgement line."
    )


def _sha256_file(path: str) -> Optional[str]:
    """Hex sha256 of the file at *path*, or None if it cannot be read. Never
    raises — it runs on already-failing paths."""
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def _best_effort_remove(path: str) -> None:
    """Delete *path*, swallowing a missing or locked file."""
    try:
        os.remove(path)
    except OSError:
        pass


@dataclass(frozen=True)
class _HandoffContext:
    """State a handoff dispatch threads through ``_run`` so the result
    builders can validate the ack, report ``payload_bytes``, and notice a
    payload-file mutation."""

    nonce: str
    payload_path: str
    payload_bytes: int
    hash_before: Optional[str]


def _payload_modified(handoff: "_HandoffContext") -> bool:
    """Did the payload file change between spawn and exit? An unreadable or
    removed file counts as modified."""
    after = _sha256_file(handoff.payload_path)
    if after is None:
        return True
    return after != handoff.hash_before


def _handoff_metadata_fields(
    handoff: Optional["_HandoffContext"], *, ack_outcome: Optional[str]
) -> dict:
    """The additive handoff metadata. Inline dispatches carry ``handoff:
    False`` and nothing else; the payload's content never appears here — only
    its byte length."""
    if handoff is None:
        return {"handoff": False}
    return {
        "handoff": True,
        "payload_bytes": handoff.payload_bytes,
        "handoff_ack": ack_outcome,
        "payload_file_modified": _payload_modified(handoff),
    }


def _validate_ack(content: str, nonce: str) -> tuple[Optional[str], str]:
    """Validate the EOF acknowledgement on a handoff response.

    Returns ``(stripped_content, outcome)`` where outcome is ``"validated"``,
    ``"mismatch"`` or ``"missing"``; ``stripped_content`` is non-None only
    when validated. The ack must be the final non-blank line — trailing blank
    lines are tolerated, anything else after it fails closed. Honest framing:
    this is a gross under-read detector, not proof of comprehension.
    """
    expected = f"{_HANDOFF_ACK_PREFIX} {nonce}"
    lines = content.splitlines()
    idx = len(lines) - 1
    while idx >= 0 and not lines[idx].strip():
        idx -= 1
    if idx < 0:
        return None, "missing"
    last = lines[idx].strip()
    if last == expected:
        return "\n".join(lines[:idx]).rstrip("\n"), "validated"
    if last.startswith(_HANDOFF_ACK_PREFIX):
        return None, "mismatch"
    return None, "missing"


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


_TOOL_START = "tool.execution_start"
_TOOL_COMPLETE = "tool.execution_complete"


def _tool_calls(events: Sequence[dict]) -> list[dict]:
    """The tool operations the CLI actually executed, in order, paired from
    its own start and completion events.

    The CLI is the executor, so this is the only account of what a routed
    model looked at that the model did not write itself. It is reported
    whatever the tools were, because the grant is policy rather than
    physics and a call outside the read-only allowlist is the first thing a
    reader of the round needs to see.

    ``result.content`` is kept and ``detailedContent`` dropped: the former
    is what the model was shown, which is the only copy any fidelity claim
    can be made against.
    """
    calls: dict = {}
    order: list = []
    for event in events:
        event_type = event.get("type")
        if event_type not in (_TOOL_START, _TOOL_COMPLETE):
            continue
        data = event.get("data")
        if not isinstance(data, dict):
            continue
        call_id = data.get("toolCallId")
        if not isinstance(call_id, str) or not call_id:
            continue
        if event_type == _TOOL_START:
            if call_id not in calls:
                order.append(call_id)
            tool = data.get("toolName")
            calls[call_id] = {
                "tool": tool if isinstance(tool, str) else "",
                "arguments": data.get("arguments"),
                "success": None,
                "result": None,
            }
            continue
        entry = calls.get(call_id)
        if entry is None:
            continue
        entry["success"] = data.get("success")
        result = data.get("result")
        if isinstance(result, dict):
            content = result.get("content")
            entry["result"] = {
                "content": content if isinstance(content, str) else ""
            }
        elif isinstance(result, str):
            entry["result"] = {"content": result}
    return [calls[call_id] for call_id in order]


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
        join into a single prompt. Below the size threshold that prompt is
        the ``-p`` argument; above it, ``-p`` carries a bootstrap and the
        prompt travels as a temp-file payload. *max_tokens* and
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
        inline_argv = self._build_argv(prompt, model_id)
        # Inline stays primary and highest-fidelity; the pull is taken only
        # when the rendered inline command line reaches the ceiling. One
        # helper owns the decision so both branches stay exercised.
        if _rendered_utf16_units(inline_argv) < HANDOFF_THRESHOLD_UTF16_UNITS:
            return self._run(inline_argv)
        return self._run_handoff(prompt, model_id)

    def _build_argv(self, prompt_text: str, model_id: str) -> list[str]:
        """The dispatch argv. Identical on both branches except for what
        ``-p`` carries: the whole prompt inline, or the handoff bootstrap."""
        return [
            self._binary,
            "-p", prompt_text,
            "--model", model_id,
            "--allow-all-tools",
            "--available-tools", ",".join(READ_ONLY_TOOLS),
            "--no-custom-instructions",
            "--output-format", "json",
            _NO_AUTO_UPDATE_FLAG,
        ]

    def _run_handoff(self, prompt: str, model_id: str) -> APIResult:
        """Dispatch a large prompt through a temp-file pull.

        The payload is written UTF-8 with no BOM, flushed and CLOSED before
        spawn — an open handle blocks the child's read on Windows — and the
        file is deleted in ``finally`` on every path.
        """
        nonce = secrets.token_hex(16)
        payload_text = prompt + _build_handoff_footer(nonce)
        payload_bytes = payload_text.encode("utf-8")
        fd, path = tempfile.mkstemp(
            suffix=".txt", prefix="dabbler-copilot-handoff-"
        )
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(payload_bytes)
                f.flush()
                os.fsync(f.fileno())
        except OSError as exc:
            _best_effort_remove(path)
            return self._error_result(
                error_class=ERROR_CLASS_GENERIC,
                raw_stdout="", raw_stderr=str(exc), argv=[],
            )
        # Hashed before spawn so a mutation by the agent — which holds no
        # write tools today, but the grant is policy, not physics — is
        # observable on the result.
        handoff = _HandoffContext(
            nonce=nonce,
            payload_path=path,
            payload_bytes=len(payload_bytes),
            hash_before=_sha256_file(path),
        )
        argv = self._build_argv(
            _build_handoff_bootstrap(Path(path).as_posix()), model_id
        )
        try:
            return self._run(argv, handoff=handoff)
        finally:
            # payload_file_modified is read inside _run, before this runs, so
            # the file still exists when the result is built.
            if _diagnostics_retention_enabled():
                print(
                    "[dabbler] Copilot handoff payload retained for "
                    f"diagnostics: {path}",
                    file=sys.stderr,
                )
            else:
                _best_effort_remove(path)

    def _run(
        self, argv: Sequence[str], handoff: Optional[_HandoffContext] = None
    ) -> APIResult:
        timeouts = self._timeouts

        try:
            proc = _spawn_with_timeout(
                self._spawner, argv, _NO_AUTO_UPDATE_ENV, timeouts.spawn_seconds
            )
        except _SpawnTimeout:
            return self._error_result(
                error_class=ERROR_CLASS_SPAWN_TIMEOUT,
                raw_stdout="", raw_stderr="", argv=argv, handoff=handoff,
            )
        except Exception as exc:  # noqa: BLE001 - any spawner failure is a
            # classified result, never an escaping exception.
            return self._error_result(
                error_class=(
                    ERROR_CLASS_ARGV_TOO_LARGE if _is_argv_too_large(exc)
                    else ERROR_CLASS_GENERIC
                ),
                raw_stdout="", raw_stderr=str(exc), argv=argv, handoff=handoff,
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
                argv=argv, handoff=handoff,
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
                argv=argv, handoff=handoff,
            )
        try:
            exit_code = proc.wait(timeout=remaining_total)
        except subprocess.TimeoutExpired:
            _kill_and_reap(proc)
            return self._error_result(
                error_class=ERROR_CLASS_TOTAL_TIMEOUT,
                raw_stdout="".join(stdout_lines),
                raw_stderr=_drain_queue(stderr_q, budget_seconds=5.0),
                argv=argv, handoff=handoff,
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
                reprobe_cli_version=reprobe_cli_version, handoff=handoff,
            )

        return self._success_result(
            raw_stdout=raw_stdout, raw_stderr=raw_stderr, exit_code=exit_code,
            handoff=handoff,
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
        handoff: Optional[_HandoffContext] = None,
        handoff_ack_outcome: Optional[str] = None,
    ) -> APIResult:
        metadata = {
            "error_class": error_class,
            "retryable": error_class in RETRYABLE_ERROR_CLASSES,
            "exit_code": exit_code,
            "stderr_tail": raw_stderr[-2000:],
            "reprobe_cli_version": reprobe_cli_version,
            "partial_output_discarded": bool(raw_stdout),
        }
        metadata.update(
            _handoff_metadata_fields(handoff, ack_outcome=handoff_ack_outcome)
        )
        return APIResult(
            content="",
            input_tokens=0,
            output_tokens=0,
            stop_reason=f"error:{error_class}",
            served_model_id=None,
            metadata=metadata,
        )

    def _success_result(
        self, *, raw_stdout: str, raw_stderr: str, exit_code: int,
        handoff: Optional[_HandoffContext] = None,
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
                argv=[], exit_code=exit_code, handoff=handoff,
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
                argv=[], exit_code=exit_code, handoff=handoff,
            )

        # Handoff integrity gate. The footer required an exact final line
        # carrying a nonce that exists only inside the payload file; without
        # it we cannot claim the model saw the whole task, so the content is
        # discarded rather than returned as if it answered the real prompt.
        # Non-retryable: the call is billed and tools may already have run.
        ack_outcome = None
        if handoff is not None:
            stripped, ack_outcome = _validate_ack(content, handoff.nonce)
            if stripped is None:
                return self._error_result(
                    error_class=ERROR_CLASS_HANDOFF_INCOMPLETE,
                    raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                    argv=[], exit_code=exit_code,
                    handoff=handoff, handoff_ack_outcome=ack_outcome,
                )
            content = stripped

        metadata = {
            "error_class": None,
            "retryable": False,
            "exit_code": exit_code,
            "session_id": session_id,
            "premium_requests": usage.get("premiumRequests"),
            "tool_calls": _tool_calls(events),
        }
        metadata.update(
            _handoff_metadata_fields(handoff, ack_outcome=ack_outcome)
        )
        return APIResult(
            content=content,
            input_tokens=0,  # never reported by the CLI
            output_tokens=output_tokens,
            stop_reason="end_turn",
            served_model_id=(
                echoed_model if echoed_model and echoed_model.strip() else None
            ),
            metadata=metadata,
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
ENABLEMENT_UNCONFIRMED = "unconfirmed"
KNOWN_PROVIDERS = frozenset({"anthropic", "openai", "google"})

# The verb whose absence is the whole incident: with no refresh command, the
# only remedy for a stale lockfile was hand-editing, and two people took it.
# No message may report a stale catalog without naming the invocation that
# resolves it -- an operator told "re-probe the seat" and given no verb does
# the only thing left.
REFRESH_COMMAND = "python -m ai_router.transports.copilot refresh"

# v1 lockfiles spell the probe sample `premium_request_weight`; v2 renamed it
# because "weight" reads as a rate and the value is a one-call sample. It is
# NOT a price and never feeds selection; absent means unknown, never free.
_LEGACY_PROBE_PREMIUM_KEY = "premium_request_weight"
_PROBE_PREMIUM_KEY = "probe_premium_requests"

# Provider is inferred from the model id and nothing else, because the CLI
# exposes no provider field. Every inference is stamped with this source so
# the guess is never read as first-party truth.
PROVIDER_SOURCE_HEURISTIC = "name-prefix-heuristic"
_PROVIDER_PREFIXES = (
    ("claude", "anthropic"),
    ("gpt", "openai"),
    ("o1", "openai"),
    ("o3", "openai"),
    ("o4", "openai"),
    ("gemini", "google"),
)

# One trivial turn is the only way to learn whether a model is enabled on a
# seat: an invalid model name and a policy-blocked one return the identical
# CLI error shape, so nothing may be inferred from the name.
PROBE_PROMPT = "Reply with the single word OK and nothing else."


def infer_provider(model_id: str) -> str:
    """Provider by name prefix, or ``""`` when the name says nothing.

    A declared heuristic: callers record :data:`PROVIDER_SOURCE_HEURISTIC`
    alongside it. Guessing wrong is worse than admitting ignorance, because
    provider is what a same-provider verification exclusion turns on.
    """
    normalized = str(model_id).strip().lower()
    for prefix, provider in _PROVIDER_PREFIXES:
        if normalized.startswith(prefix):
            return provider
    return ""


@dataclass
class ModelEntry:
    id: str
    provider: str = ""
    enablement: str = ENABLEMENT_UNCONFIRMED
    # A one-call sample of what this model cost, which the seat reports as an
    # integer for premium models and a fraction for sub-premium ones. Not a
    # price, never fed to selection; ``None`` is unknown and never free.
    probe_premium_requests: Optional[float] = None
    echoed_model: Optional[str] = None
    provider_source: str = ""
    confirmed_at: Optional[str] = None
    confirmed_on_cli_version: Optional[str] = None
    # The most recent probe that FAILED, with the failure's own error class.
    # A failed probe is not a withdrawn model, so it annotates rather than
    # replaces the confirmation above it.
    last_probe_error: Optional[str] = None
    last_probe_at: Optional[str] = None
    # Keys this version does not model, in file order, so a writer never
    # silently drops what a future version wrote. Not compared: it is the
    # unmodelled remainder, and byte-identity is asserted on rendered text.
    raw: dict = field(default_factory=dict, repr=False, compare=False)


@dataclass
class CatalogMeta:
    cli_version: str
    cli_version_pin_required: bool
    seat_id: str
    seat_label: str = ""
    probed_at: Optional[str] = None
    # The candidate universe lives in the file, not in code: the CLI cannot
    # enumerate its models, so this is a maintained list and adding a model
    # must be a data edit that leaves the file the whole truth about the seat.
    candidate_universe: tuple = ()
    # The writer stamp: what wrote the file, when, and a digest of what was
    # written. All three absent means no writer has ever touched it. See the
    # writer-stamp section below for why the digest and not the mtime.
    written_by: Optional[str] = None
    written_at: Optional[str] = None
    content_digest: Optional[str] = None
    raw: dict = field(default_factory=dict, repr=False, compare=False)


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


def _optional_str(value) -> Optional[str]:
    """A string off the wire or ``None``; anything else is not a string and
    must not become one by coercion."""
    return value if isinstance(value, str) and value else None


def _coerce_probe_premium_requests(value):
    """A request-count sample off the wire, or ``None`` for unknown.

    The seat reports ``usage.premiumRequests`` as ``0`` for included models
    and as a **fraction** for sub-premium ones — ``0.33`` measured on
    ``claude-haiku-4.5`` — so a float here is a measurement, not noise, and
    discarding it would file the cheapest models on the seat as the most
    uncertain. A bool, a string, a list, a negative or a non-finite value is
    not a count, and unknown is the honest answer for those — never zero,
    which would read as free.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value < 0 or not math.isfinite(value):
        return None
    return value


def _read_candidate_universe(meta_raw: dict, path) -> tuple:
    declared = meta_raw.get("candidate_universe")
    if declared is None:
        return ()
    if not isinstance(declared, list) or not all(
        isinstance(item, str) and item for item in declared
    ):
        raise ValueError(
            f"catalog lockfile {path!r} declares a malformed "
            "[meta].candidate_universe: it must be an array of model id "
            "strings"
        )
    return tuple(declared)


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
        probed_at=_optional_str(meta_raw.get("probed_at")),
        candidate_universe=_read_candidate_universe(meta_raw, path),
        written_by=_optional_str(meta_raw.get("written_by")),
        written_at=_optional_str(meta_raw.get("written_at")),
        content_digest=_optional_str(meta_raw.get("content_digest")),
        raw=dict(meta_raw),
    )
    entries = []
    for md in data.get("models", []):
        if not isinstance(md, dict) or "id" not in md:
            raise ValueError(f"catalog lockfile has a malformed [[models]] entry: {md!r}")
        raw_probe = md.get(
            _PROBE_PREMIUM_KEY, md.get(_LEGACY_PROBE_PREMIUM_KEY)
        )
        entries.append(ModelEntry(
            id=str(md["id"]),
            provider=str(md.get("provider", "")),
            enablement=str(md.get("enablement", ENABLEMENT_UNCONFIRMED)),
            probe_premium_requests=_coerce_probe_premium_requests(raw_probe),
            echoed_model=md.get("echoed_model"),
            provider_source=str(md.get("provider_source", "")),
            confirmed_at=_optional_str(md.get("confirmed_at")),
            confirmed_on_cli_version=_optional_str(
                md.get("confirmed_on_cli_version")
            ),
            last_probe_error=_optional_str(md.get("last_probe_error")),
            last_probe_at=_optional_str(md.get("last_probe_at")),
            raw=dict(md),
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

    Every message about a stale or unstamped catalog names the exact
    refresh invocation that resolves it. An operator told only that the
    file is wrong, and given no verb, edits the file.
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
                drift + " (strict pinning is on via cli_version_pin_required). "
                f"Re-date the lock with `{REFRESH_COMMAND} --quorum`, or turn "
                "strict pinning off."
            )
        else:
            warnings.append(
                drift + "; entries confirmed on the pinned version are still "
                f"trusted. Re-date the lock with `{REFRESH_COMMAND} --quorum` "
                f"(or `{REFRESH_COMMAND} --stale` to re-confirm every entry "
                "earned on another build)."
            )

    provenance = catalog_provenance(catalog)
    if provenance == PROVENANCE_HAND_EDITED:
        warnings.append(
            "hand-edited provenance: the contents do not match the digest "
            f"this file's own writer stamp records ({catalog.meta.written_by} "
            f"at {catalog.meta.written_at}). A hand edit is not evidence — "
            "the values here are empirical or they are nothing. Re-establish "
            f"them with `{REFRESH_COMMAND} --quorum`."
        )
    elif provenance == PROVENANCE_UNSTAMPED:
        warnings.append(
            "no writer stamp: this lockfile predates the writer, so a hand "
            f"edit cannot be ruled out. `{REFRESH_COMMAND} --quorum` writes "
            "one."
        )

    confirmed = catalog.confirmed_models()
    for entry in confirmed:
        if not entry.provider or entry.provider not in KNOWN_PROVIDERS:
            reasons.append(
                f"Missing/unknown provenance on confirmed entry {entry.id!r}: "
                f"provider={entry.provider!r}. Re-probe it with "
                f"`{REFRESH_COMMAND} --models {entry.id}`."
            )

    distinct = {e.provider for e in confirmed if e.provider in KNOWN_PROVIDERS}
    if len(distinct) < 2:
        reasons.append(
            "Same-provider-only catalog: confirmed entries resolve to "
            f"{sorted(distinct)} (need >= 2 distinct providers). A quorum "
            "refresh only re-probes what is already confirmed, so widen it: "
            f"`{REFRESH_COMMAND} --models <ids>`, or `{REFRESH_COMMAND} --all` "
            "for the whole declared universe."
        )

    return CatalogValidationResult(
        ok=not reasons, reasons=tuple(reasons), warnings=tuple(warnings)
    )


# --- Seat catalog writer ----------------------------------------------------
#
# The record format itself lives in ``ai_router.lockfile``, because the
# direct-API enumeration writes the same shape and a second renderer would let
# the two records disagree about how a value is written or how a hand edit is
# detected.


def _meta_mapping(meta: CatalogMeta) -> dict:
    out = dict(meta.raw)
    out["cli_version"] = meta.cli_version
    out["cli_version_pin_required"] = meta.cli_version_pin_required
    out["seat_id"] = meta.seat_id
    _set_or_drop(out, "seat_label", meta.seat_label or None)
    _set_or_drop(out, "probed_at", meta.probed_at)
    _set_or_drop(
        out, "candidate_universe", list(meta.candidate_universe) or None
    )
    _set_or_drop(out, "written_by", meta.written_by)
    _set_or_drop(out, "written_at", meta.written_at)
    _set_or_drop(out, "content_digest", meta.content_digest)
    return out


def _entry_mapping(entry: ModelEntry) -> dict:
    # Starting from the entry as read keeps unmodelled keys, and keeps every
    # key in its original position: an untouched entry re-renders byte for
    # byte, which is what makes a partial refresh safe.
    out = dict(entry.raw)
    out["id"] = entry.id
    _set_or_drop(out, "provider", entry.provider or None)
    _set_or_drop(out, "provider_source", entry.provider_source or None)
    out["enablement"] = entry.enablement
    _set_or_drop(out, "confirmed_at", entry.confirmed_at)
    _set_or_drop(
        out, "confirmed_on_cli_version", entry.confirmed_on_cli_version
    )
    # Write the sample back under the name it was read under, in place, so
    # a v1-spelled entry nobody probed re-renders unchanged.
    probe_key = (
        _LEGACY_PROBE_PREMIUM_KEY
        if _LEGACY_PROBE_PREMIUM_KEY in out and _PROBE_PREMIUM_KEY not in out
        else _PROBE_PREMIUM_KEY
    )
    out.pop(
        _PROBE_PREMIUM_KEY
        if probe_key == _LEGACY_PROBE_PREMIUM_KEY
        else _LEGACY_PROBE_PREMIUM_KEY,
        None,
    )
    _set_or_drop(out, probe_key, entry.probe_premium_requests)
    _set_or_drop(out, "echoed_model", entry.echoed_model)
    _set_or_drop(out, "last_probe_error", entry.last_probe_error)
    _set_or_drop(out, "last_probe_at", entry.last_probe_at)
    return out


def dumps_catalog(catalog: Catalog) -> str:
    """Render *catalog* back to the lockfile text the reader accepts.

    Round-trip is the contract: ``load_catalog`` of this text yields an
    equal catalog, and a catalog nothing has touched renders back to the
    bytes it was read from.
    """
    tables = [("[meta]", _meta_mapping(catalog.meta))]
    tables.extend(
        ("[[models]]", _entry_mapping(entry)) for entry in catalog.models
    )
    return render_document(tables)


def write_catalog(path, catalog: Catalog, *, written_at=None) -> Catalog:
    """Write the lockfile, stamped. The only writer there is — a lockfile
    with no writer leaves hand-editing as the sole remedy for staleness.
    Returns the stamped catalog that was written."""
    stamped = stamp_catalog(catalog, written_at=written_at)
    write_document(path, dumps_catalog(stamped))
    return stamped


# --- Writer stamp and hand-edit detection -----------------------------------
#
# The rule this repo already holds for ``.dabbler/runs/`` — machine-written,
# never hand-repaired — is checkable here instead of aspirational. The verdict
# itself is ``ai_router.lockfile.provenance``; what belongs to this module is
# only which fields of the seat catalog the digest covers.


def catalog_digest(catalog: Catalog) -> str:
    """SHA-256 over the catalog rendered with the digest key itself elided.

    Elided rather than blanked, so the digest is a function of the content it
    covers and of nothing else: the same content digests the same whether or
    not the file has been stamped before.
    """
    unstamped = Catalog(
        meta=replace(catalog.meta, content_digest=None), models=catalog.models
    )
    return digest_text(dumps_catalog(unstamped))


def stamp_catalog(catalog: Catalog, *, written_at=None) -> Catalog:
    """The catalog with a fresh writer stamp over its current contents."""
    meta = replace(
        catalog.meta,
        written_by=writer_id("ai_router.transports.copilot"),
        written_at=written_at or _utc_now(),
        content_digest=None,
    )
    unstamped = Catalog(meta=meta, models=catalog.models)
    return Catalog(
        meta=replace(meta, content_digest=catalog_digest(unstamped)),
        models=catalog.models,
    )


def catalog_provenance(catalog: Catalog) -> str:
    """How this file came to hold what it holds."""
    meta = catalog.meta
    return record_provenance(
        stored_digest=meta.content_digest,
        recomputed_digest=catalog_digest(catalog),
        written_by=meta.written_by,
        written_at=meta.written_at,
    )


# --- Seat catalog discovery -------------------------------------------------

def discover_models(
    model_ids: Sequence[str],
    *,
    transport,
    cli_version: Optional[str] = None,
    clock: Callable[[], str] = _utc_now,
) -> list[ModelEntry]:
    """Probe each id in *model_ids* and report what the seat did.

    One billed turn per id, in the order given, with no opinion about which
    ids are worth probing — scope selection is the caller's policy and its
    cost. Entries come back detached from any catalog; :func:`merge_catalog`
    decides what they do to the file.
    """
    stamp = clock()
    entries: list[ModelEntry] = []
    for model_id in model_ids:
        result = transport.dispatch(
            model_id=model_id, system_prompt="", user_message=PROBE_PROMPT,
        )
        provider = infer_provider(model_id)
        if result.ok:
            entries.append(ModelEntry(
                id=model_id,
                provider=provider,
                provider_source=PROVIDER_SOURCE_HEURISTIC if provider else "",
                enablement=ENABLEMENT_CONFIRMED,
                confirmed_at=stamp,
                confirmed_on_cli_version=cli_version,
                echoed_model=_optional_str(result.served_model_id),
                probe_premium_requests=_coerce_probe_premium_requests(
                    result.metadata.get("premium_requests")
                ),
            ))
            continue
        entries.append(ModelEntry(
            id=model_id,
            provider=provider,
            provider_source=PROVIDER_SOURCE_HEURISTIC if provider else "",
            enablement=ENABLEMENT_UNCONFIRMED,
            last_probe_error=str(
                result.metadata.get("error_class") or ERROR_CLASS_GENERIC
            ),
            last_probe_at=stamp,
        ))
    return entries


def _merge_entry(prior: ModelEntry, fresh: ModelEntry) -> ModelEntry:
    if fresh.enablement != ENABLEMENT_CONFIRMED:
        # A transient CLI failure is not a withdrawn model. Demoting a
        # confirmed entry on one bad probe would discard provenance that
        # cost a billed call to earn, so the failure annotates and the
        # confirmation stands, visibly stale, until an operator says
        # otherwise.
        return replace(
            prior,
            last_probe_error=fresh.last_probe_error,
            last_probe_at=fresh.last_probe_at,
        )
    return replace(
        prior,
        provider=fresh.provider or prior.provider,
        provider_source=fresh.provider_source or prior.provider_source,
        enablement=ENABLEMENT_CONFIRMED,
        confirmed_at=fresh.confirmed_at,
        confirmed_on_cli_version=fresh.confirmed_on_cli_version,
        # A run that reported no sample leaves the previous one standing:
        # the sample is a one-call observation, and losing it would blind
        # the cost preview that keeps a refresh from being all-or-nothing.
        probe_premium_requests=(
            fresh.probe_premium_requests
            if fresh.probe_premium_requests is not None
            else prior.probe_premium_requests
        ),
        echoed_model=fresh.echoed_model or prior.echoed_model,
        last_probe_error=None,
        last_probe_at=None,
    )


def merge_catalog(
    catalog: Catalog,
    probed: Sequence[ModelEntry],
    *,
    cli_version: Optional[str] = None,
    probed_at: Optional[str] = None,
) -> Catalog:
    """Fold *probed* results into *catalog*, touching nothing else.

    A refresh that probed three models rewrites those three; every other
    entry, including its provenance and any key this version does not
    model, survives unchanged. That is what makes a cheap partial refresh
    honest — a scoped run must never present itself as a full re-probe.
    """
    fresh_by_id = {entry.id: entry for entry in probed}
    existing_ids = {entry.id for entry in catalog.models}
    merged = [
        _merge_entry(entry, fresh_by_id[entry.id])
        if entry.id in fresh_by_id
        else entry
        for entry in catalog.models
    ]
    merged.extend(
        entry for entry in probed if entry.id not in existing_ids
    )
    meta = replace(
        catalog.meta,
        cli_version=cli_version or catalog.meta.cli_version,
        probed_at=probed_at or catalog.meta.probed_at,
    )
    return Catalog(meta=meta, models=merged)


def resolve_lockfile_path(config: dict) -> Path:
    """The lockfile ``transports.copilot-cli.lockfile`` names, resolved
    relative to the config that named it.

    One resolution, in the module that owns the file: a reader and a writer
    that disagree about which file they mean would let a refresh spend real
    requests updating a lockfile nothing dispatches from.
    """
    cli_cfg = (config.get("transports") or {}).get("copilot-cli")
    if not isinstance(cli_cfg, dict) or not cli_cfg.get("lockfile"):
        raise ValueError(
            "router-config.yaml has no transports.copilot-cli.lockfile, so "
            "no seat catalog is named"
        )
    lockfile = Path(cli_cfg["lockfile"])
    if lockfile.is_absolute():
        return lockfile
    config_path = config.get("_config_path")
    base = Path(config_path).parent if config_path else Path.cwd()
    return base / lockfile


def resolve_role_candidates(
    config: dict,
    catalog: Catalog,
    role: str,
    exclude_providers=None,
) -> list[tuple[str, str]]:
    """Ordered ``(model_id, provider)`` candidates for *role* on this seat.

    The seat's enumeration is the confirmed catalog — nothing infers
    availability from a name, so an unconfirmed entry is not a candidate.
    The role itself is applied by ``ai_router.selection``, which is the one
    implementation both transports resolve a role through.
    """
    from ..selection import resolve_role

    return resolve_role(
        config,
        role,
        [
            (entry.id, entry.provider)
            for entry in catalog.models
            if entry.enablement == ENABLEMENT_CONFIRMED
            and entry.provider
            and entry.provider in KNOWN_PROVIDERS
        ],
        exclude_providers=exclude_providers,
    )


# --- Seat catalog refresh ---------------------------------------------------
#
# Scope is the design, not a convenience. v1's refresh had exactly one mode --
# the whole universe, 39+ premium requests -- so it was run once and never
# again, and a lockfile whose only writer is too expensive to run is a
# lockfile people edit by hand. Every scope here is named, the cheap one is
# the default, and the expensive one has to be asked for.

SCOPE_QUORUM = "quorum"
SCOPE_MODELS = "models"
SCOPE_STALE = "stale"
SCOPE_ALL = "all"

# Projected premium requests above which the run asks before spending. The
# quorum's cost on a three-provider seat sits well under it: the cheap path
# must never acquire friction, or it stops being run for the same reason
# v1's did.
CONFIRM_THRESHOLD_PREMIUM_REQUESTS = 5


def _cost_order(entry: ModelEntry) -> tuple:
    """Sort key for "cheapest first". An unknown sample sorts after every
    known one: unknown means never measured, and never measured is never
    free."""
    sample = entry.probe_premium_requests
    return (1, 0) if sample is None else (0, sample)


def _sample_text(sample: Optional[float]) -> str:
    return "unknown" if sample is None else str(sample)


@dataclass(frozen=True)
class RefreshPlan:
    """What a refresh would probe and what the file says that costs."""

    scope: str
    # (model_id, recorded sample or None) in probe order.
    samples: tuple = ()
    threshold: int = CONFIRM_THRESHOLD_PREMIUM_REQUESTS

    @property
    def model_ids(self) -> tuple:
        return tuple(model_id for model_id, _ in self.samples)

    @property
    def known_premium_requests(self) -> float:
        return sum(s for _, s in self.samples if s is not None)

    @property
    def unknown_cost_ids(self) -> tuple:
        return tuple(model_id for model_id, s in self.samples if s is None)

    @property
    def needs_confirmation(self) -> bool:
        """An unknown-cost entry asks too. A plan that cannot bound its own
        spend has not been priced, and an unknown that turns out to be 15 is
        precisely what the threshold is for."""
        return (
            self.known_premium_requests > self.threshold
            or bool(self.unknown_cost_ids)
        )


def _quorum_ids(catalog: Catalog) -> list[str]:
    """The cheapest confirmed entry of each provider — the smallest probe
    that re-establishes the >=2-distinct-provider invariant and re-dates the
    CLI version, which is what "did my seat survive the auto-update?"
    actually asks."""
    cheapest: dict[str, ModelEntry] = {}
    for entry in catalog.confirmed_models():
        if entry.provider not in KNOWN_PROVIDERS:
            continue
        held = cheapest.get(entry.provider)
        if held is None or _cost_order(entry) < _cost_order(held):
            cheapest[entry.provider] = entry
    return [cheapest[provider].id for provider in sorted(cheapest)]


def _stale_ids(catalog: Catalog, live_cli_version: Optional[str]) -> list[str]:
    """Entries whose confirmation was earned on some other CLI build.

    An entry with no confirmation at all is not stale, it is unprobed, and
    sweeping it in here would quietly turn a targeted re-confirmation into a
    universe probe — the cost blowout this whole command exists to avoid.
    """
    if not live_cli_version:
        raise ValueError(
            "--stale needs the live CLI version to tell stale from current, "
            "and 'copilot --version' did not answer. Name the entries with "
            "--models instead."
        )
    stale = [
        entry for entry in catalog.models
        if entry.confirmed_on_cli_version
        and entry.confirmed_on_cli_version != live_cli_version
    ]
    return [entry.id for entry in sorted(stale, key=_cost_order)]


def _universe_ids(catalog: Catalog) -> list[str]:
    if not catalog.meta.candidate_universe:
        raise ValueError(
            "the lockfile declares no [meta].candidate_universe and the CLI "
            "has no list-models command to stand in for one. Add the ids to "
            "that array: it is a maintained list, and that data edit is how "
            "a model becomes probeable."
        )
    return list(catalog.meta.candidate_universe)


def _named_ids(catalog: Catalog, models) -> list[str]:
    requested: list[str] = []
    for raw in models:
        for token in str(raw).split(","):
            token = token.strip()
            if token and token not in requested:
                requested.append(token)
    if not requested:
        raise ValueError("--models needs at least one model id")
    universe = set(catalog.meta.candidate_universe)
    unknown = [m for m in requested if m not in universe] if universe else []
    if unknown:
        raise ValueError(
            "not in the lockfile's declared candidate universe: "
            + ", ".join(unknown)
            + ". Every probe costs a premium request, so a typo must not buy "
            "one -- add the id to [meta].candidate_universe first."
        )
    return requested


def plan_refresh(
    catalog: Catalog,
    *,
    scope: str = SCOPE_QUORUM,
    models=None,
    live_cli_version: Optional[str] = None,
    threshold: int = CONFIRM_THRESHOLD_PREMIUM_REQUESTS,
) -> RefreshPlan:
    """Select a scope and price it from the samples already in the file.

    That is what those samples are for: a refresh that cannot estimate its
    own cost has not read its own file, and an operator's only defence
    against an unpriced billed run is to never run it.
    """
    if scope == SCOPE_QUORUM:
        ids = _quorum_ids(catalog)
    elif scope == SCOPE_MODELS:
        ids = _named_ids(catalog, models or ())
    elif scope == SCOPE_STALE:
        ids = _stale_ids(catalog, live_cli_version)
    elif scope == SCOPE_ALL:
        ids = _universe_ids(catalog)
    else:
        raise ValueError(f"unknown refresh scope {scope!r}")

    by_id = {entry.id: entry for entry in catalog.models}
    samples = tuple(
        (
            model_id,
            by_id[model_id].probe_premium_requests
            if model_id in by_id else None,
        )
        for model_id in ids
    )
    return RefreshPlan(scope=scope, samples=samples, threshold=threshold)


def format_plan(plan: RefreshPlan) -> str:
    lines = [
        f"refresh plan: scope={plan.scope}, "
        f"{len(plan.samples)} model(s) to probe"
    ]
    lines.extend(
        f"  {model_id}  (sample: {_sample_text(sample)})"
        for model_id, sample in plan.samples
    )
    lines.append(
        f"projected cost: {plan.known_premium_requests} premium request(s) "
        "from recorded samples"
    )
    if plan.unknown_cost_ids:
        lines.append(
            f"  plus {len(plan.unknown_cost_ids)} of unknown cost "
            f"({', '.join(plan.unknown_cost_ids)}) -- unknown is not zero, so "
            "this projection is a floor"
        )
    return "\n".join(lines)


def diff_catalogs(before: Catalog, after: Catalog) -> tuple:
    """What the refresh changed, in the lockfile's own terms.

    A success message would be a claim about the seat; this is the evidence
    for one. Silence about an entry means the run did not touch it.
    """
    lines: list[str] = []
    if before.meta.cli_version != after.meta.cli_version:
        lines.append(
            f"cli version re-dated: {before.meta.cli_version!r} -> "
            f"{after.meta.cli_version!r}"
        )
    prior = {entry.id: entry for entry in before.models}
    for entry in after.models:
        was = prior.get(entry.id)
        if was is None:
            lines.append(f"added: {entry.id} ({entry.enablement})")
            continue
        confirmed_now = entry.enablement == ENABLEMENT_CONFIRMED
        if confirmed_now and was.enablement != ENABLEMENT_CONFIRMED:
            lines.append(f"confirmed: {entry.id}")
        elif (
            confirmed_now
            and was.confirmed_on_cli_version != entry.confirmed_on_cli_version
        ):
            lines.append(
                f"re-confirmed: {entry.id} on "
                f"{entry.confirmed_on_cli_version!r}"
            )
        if (
            entry.last_probe_error
            and entry.last_probe_error != was.last_probe_error
        ):
            kept = (
                "; the prior confirmation stands, visibly stale"
                if was.enablement == ENABLEMENT_CONFIRMED else ""
            )
            lines.append(
                f"probe failed: {entry.id} ({entry.last_probe_error}){kept}"
            )
        if was.probe_premium_requests != entry.probe_premium_requests:
            lines.append(
                f"sample moved: {entry.id} "
                f"{_sample_text(was.probe_premium_requests)} -> "
                f"{_sample_text(entry.probe_premium_requests)}"
            )
    return tuple(lines)


def _prompt_to_confirm(plan: RefreshPlan, out) -> bool:
    if not sys.stdin.isatty():
        print(
            "this plan needs confirmation and stdin is not a terminal. "
            "Re-run with --yes to authorize the spend, or --dry-run to see "
            "the plan without spending anything.",
            file=out,
        )
        return False
    unknown = " plus entries of unknown cost" if plan.unknown_cost_ids else ""
    answer = input(
        f"spend {plan.known_premium_requests} premium request(s)"
        f"{unknown}? [y/N] "
    )
    return answer.strip().lower() in ("y", "yes")


def run_refresh(
    *,
    catalog_path,
    transport,
    live_cli_version: Optional[str] = None,
    scope: str = SCOPE_QUORUM,
    models=None,
    dry_run: bool = False,
    assume_yes: bool = False,
    threshold: int = CONFIRM_THRESHOLD_PREMIUM_REQUESTS,
    confirm: Optional[Callable[[RefreshPlan], bool]] = None,
    clock: Callable[[], str] = _utc_now,
    out=None,
) -> int:
    """Plan, price, probe, merge, write, report. Returns a process exit code.

    The order is the point: nothing is spent before the projection is on
    screen, and nothing is written that the diff does not account for.
    """
    out = out or sys.stdout
    before = load_catalog(catalog_path)
    plan = plan_refresh(
        before,
        scope=scope,
        models=models,
        live_cli_version=live_cli_version,
        threshold=threshold,
    )
    print(format_plan(plan), file=out)
    if not plan.samples:
        print(
            "nothing to probe: this scope selects no entry.", file=out
        )
        return 0
    if dry_run:
        print("dry run: nothing probed, lockfile untouched.", file=out)
        return 0
    if plan.needs_confirmation and not assume_yes:
        approve = confirm or (lambda p: _prompt_to_confirm(p, out))
        if not approve(plan):
            print(
                "refresh declined: nothing probed, lockfile untouched.",
                file=out,
            )
            return 1

    stamp = clock()
    probed = discover_models(
        plan.model_ids,
        transport=transport,
        cli_version=live_cli_version,
        clock=lambda: stamp,
    )
    after = merge_catalog(
        before, probed, cli_version=live_cli_version, probed_at=stamp,
    )
    write_catalog(catalog_path, after, written_at=stamp)

    changes = diff_catalogs(before, after)
    if changes:
        print("changed:", file=out)
        for line in changes:
            print(f"  {line}", file=out)
    else:
        print(
            f"no change: all {len(plan.model_ids)} probed entr"
            f"{'y' if len(plan.model_ids) == 1 else 'ies'} answered exactly "
            "as the lockfile already records; provenance re-dated.",
            file=out,
        )
    return 0


def _build_refresh_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.transports.copilot",
        description="seat catalog lockfile maintenance",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    cmd = sub.add_parser(
        "refresh",
        help="re-probe the seat and rewrite the catalog lockfile",
        description=(
            "Probe a named scope of models and fold the answers into the "
            "lockfile. Merge, never clobber: an entry this run did not probe "
            "survives byte for byte, provenance included."
        ),
    )
    scope = cmd.add_mutually_exclusive_group()
    scope.add_argument(
        "--quorum", dest="scope", action="store_const", const=SCOPE_QUORUM,
        help="(default) the cheapest confirmed model of each provider -- "
             "enough to re-establish the >=2-provider invariant and re-date "
             "the CLI version",
    )
    scope.add_argument(
        "--stale", dest="scope", action="store_const", const=SCOPE_STALE,
        help="entries confirmed on a CLI version other than the live one, "
             "cheapest first",
    )
    scope.add_argument(
        "--all", dest="scope", action="store_const", const=SCOPE_ALL,
        help="the whole declared candidate universe; costs what it costs, "
             "which is why it must be asked for by name",
    )
    scope.add_argument(
        "--models", metavar="a,b,c",
        help="probe these ids only, comma-separated",
    )
    cmd.set_defaults(scope=SCOPE_QUORUM)
    cmd.add_argument(
        "--dry-run", action="store_true",
        help="print the plan and its projected cost; probe nothing",
    )
    cmd.add_argument(
        "--yes", action="store_true",
        help="authorize a plan that would otherwise ask first",
    )
    cmd.add_argument(
        "--confirm-threshold", type=int,
        default=CONFIRM_THRESHOLD_PREMIUM_REQUESTS,
        help="projected premium requests above which the run asks first "
             f"(default {CONFIRM_THRESHOLD_PREMIUM_REQUESTS})",
    )
    cmd.add_argument(
        "--lockfile",
        help="lockfile to refresh (default: the one router-config.yaml names)",
    )
    cmd.add_argument(
        "--binary",
        help="Copilot CLI binary (default: the one router-config.yaml names)",
    )
    return parser


def main(argv=None) -> int:
    args = _build_refresh_parser().parse_args(argv)
    from ..config import load_config

    try:
        config = load_config()
        cli_cfg = (config.get("transports") or {}).get("copilot-cli") or {}
        binary = args.binary or cli_cfg.get("binary", "copilot")
        lockfile = (
            Path(args.lockfile) if args.lockfile
            else resolve_lockfile_path(config)
        )
        return run_refresh(
            catalog_path=lockfile,
            transport=CopilotCliTransport(
                binary=binary,
                timeouts=resolve_transport_timeouts(cli_cfg),
                max_invocations=cli_cfg.get("max_invocations_per_session"),
            ),
            live_cli_version=get_cli_version(binary=binary),
            scope=SCOPE_MODELS if args.models else args.scope,
            models=[args.models] if args.models else None,
            dry_run=args.dry_run,
            assume_yes=args.yes,
            threshold=args.confirm_threshold,
        )
    except (OSError, ValueError) as exc:
        print(f"refresh: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    # ``python -m`` re-executes this file under the name ``__main__`` while
    # the package root has already imported it (ai_router -> route -> here),
    # so hand off to the canonical module: two copies of the catalog
    # dataclasses answering the same command is a trap worth not setting.
    from ai_router.transports.copilot import main as _canonical_main

    raise SystemExit(_canonical_main())
