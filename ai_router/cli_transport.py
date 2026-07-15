"""The Copilot CLI transport (Set 078 S2) — a seat-billed dispatch path that
runs calls through the GitHub Copilot CLI's headless mode instead of a
provider HTTPS API.

Full design contract:
``docs/session-sets/078-copilot-cli-hybrid-tier/s1-design-adjudication.md``
(routed, ``task_type: architecture``) and the "Architecture" section of
``docs/session-sets/078-copilot-cli-hybrid-tier/spec.md``.

This module ships two things:

1. :class:`Transport` — a minimal interface so a future ``route()`` caller
   (Session 3) can dispatch through either the existing API path or this CLI
   path without branching on profile at every call site.
2. :class:`CopilotCliTransport` — the CLI implementation: an invocation state
   machine (three-tier timeout, stderr-substring error classification,
   no-retry-after-content, partial-output-discard) that spawns the CLI via
   an **injected spawner** (defaults to a thin ``subprocess.Popen`` wrapper)
   so the entire state machine is testable with a fake process and never
   invokes the real CLI in the test suite (Feature 1 Standards).

Honest non-accounting (Critique-2 M6): the CLI reports no dollar cost, no
token price, and no remaining balance — only a per-call ``premiumRequests``
count. :class:`TransportResult` therefore always carries
``usage_authoritative=False`` for this transport; ``input_tokens`` is always
``0`` (never observed) and ``output_tokens`` reflects the CLI's own
``outputTokens`` field when present, but is not billing-authoritative.

``dispatch()`` never raises for an operational failure (bad model, auth
failure, timeout, malformed output) — it always returns a
:class:`TransportResult`, with the failure recorded in
``transport_metadata['error_class']`` and ``.ok`` / ``.retryable`` as
convenience reads. This mirrors the result-object style already used by
:mod:`ai_router.podman_sandbox` and :mod:`ai_router.run_test_sandbox` rather
than an exception-per-failure-class scheme, so a caller can inspect a
uniform return type regardless of outcome. ``dispatch()`` never retries
internally — the taxonomy below is all non-retryable today (design lock
Section 4), and retry orchestration across dispatch calls belongs to the
``route()`` integration layer (Session 3), not this module.
"""

from __future__ import annotations

import hashlib
import json
import os
import queue
import secrets
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional, Protocol, Sequence


# ---------------------------------------------------------------------------
# Error-class taxonomy (design lock Section 4). Nothing is retryable today —
# the CLI is premium-request-billed and quota-blind, so a retry storm has
# real cost and no local guard sees it. The set stays empty (not simply
# unused) so a future promotion is a one-line, deliberate change, not a
# silent behavior flip.
# ---------------------------------------------------------------------------

ERROR_CLASS_INVALID_MODEL = "invalid-model"
ERROR_CLASS_AUTH = "auth-class"
ERROR_CLASS_QUOTA = "quota-rate-class"
ERROR_CLASS_GENERIC = "generic-unknown"
ERROR_CLASS_SPAWN_TIMEOUT = "spawn-timeout"
ERROR_CLASS_FIRST_BYTE_TIMEOUT = "first-byte-timeout"
ERROR_CLASS_TOTAL_TIMEOUT = "total-timeout"
# Set 104: the large-prompt file-handoff error class. The whole task
# specification is dispatched via a temp file (see the handoff section below);
# a random per-request nonce lives ONLY in that file's footer, so echoing it
# back proves EOF access. Absence or mismatch of the acknowledgement is a
# gross under-read (NOT proof of comprehension) and fails closed here: the
# call is already billed and tools may already have run, so this is
# deliberately NON-retryable (kept out of RETRYABLE_ERROR_CLASSES, like every
# other class today).
ERROR_CLASS_HANDOFF_INCOMPLETE = "handoff-incomplete"

# The load-bearing rule (design lock Section 4): any unclassifiable non-zero
# exit is auth-class-or-worse, never silently retryable. Kept empty, not
# absent, so "nothing retries" is a visible, tested invariant rather than an
# accident of an unpopulated set.
RETRYABLE_ERROR_CLASSES: frozenset[str] = frozenset()

# Conservative, case-insensitive substring heuristic (GAP-1: the positive
# match is unvalidated against a real auth failure — S1 could not
# non-destructively reproduce one). Any match classifies as auth-class.
_AUTH_SUBSTRINGS = (
    "auth", "login", "credential", "unauthorized", "authentication",
    "401", "403", "not logged in",
)

# GAP-2: no real quota/rate-exhaustion shape was ever captured (S1 saw no
# throttling in 5 sequential calls). This heuristic is a placeholder for a
# future promotion once a real sample is captured — it is deliberately never
# added to RETRYABLE_ERROR_CLASSES.
_QUOTA_SUBSTRINGS = ("rate limit", "quota", "429", "too many requests")

_INVALID_MODEL_SUBSTRING = "from --model flag is not available"

# design lock Section 3. Constraint: spawn < first_byte < total.
DEFAULT_SPAWN_TIMEOUT_SECONDS = 10.0
DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS = 30.0
DEFAULT_TOTAL_TIMEOUT_SECONDS = 300.0

_NO_AUTO_UPDATE_FLAG = "--no-auto-update"
_NO_AUTO_UPDATE_ENV = {"COPILOT_AUTO_UPDATE": "false"}


# ---------------------------------------------------------------------------
# Large-prompt file handoff (Set 104, consult-locked design — see
# docs/session-sets/104-copilot-cli-large-prompt-handoff/spec.md and
# authoring-consult-synthesis.md; do not re-litigate at runtime).
#
# The whole system+user prompt travels as ONE ``-p`` argv element, and Windows
# ``CreateProcessW`` caps the entire command line at 32,767 UTF-16 code units
# (quoting and the terminating NUL included). Linux has a per-arg limit too
# (``MAX_ARG_STRLEN``, 128 KiB); Windows just hits it first. Above a
# conservative threshold we switch to a PULL: write the prompt to a per-request
# temp file, dispatch a short ``-p`` bootstrap that points the agentic CLI at
# the file (the system temp dir is auto-allowed and ``--allow-all-tools`` is
# already passed), and require an EOF nonce acknowledgement.
# ---------------------------------------------------------------------------

# At or above this RENDERED-command-line size (UTF-16 code units), switch to
# handoff. Measured on the rendered argv (``subprocess.list2cmdline``) on EVERY
# OS -- quoting expansion and astral chars are otherwise miscounted, and the
# uniform rule gives predictable behavior plus automatic protection from the
# Linux per-arg limit. 24,000 leaves ample headroom below Windows' 32,767 for
# the executable path, quoting expansion, and future flags. A module constant
# by design (consult: no config knob initially).
HANDOFF_THRESHOLD_UTF16_UNITS = 24000

# The acknowledgement line shape. The bootstrap tells the model the file's
# footer specifies an exact ack line; the nonce itself appears ONLY in the
# file (never in argv), so a model that never read to EOF cannot produce it.
_HANDOFF_ACK_PREFIX = "HANDOFF-ACK"

# Retention affordance: by default the payload file is deleted on every path
# (retention would weaken the transport's existing ``-p`` redaction posture).
# Only when the Set 086 diagnostics toggle is enabled do we retain the file and
# log its path. This mirrors the env-truthy semantics of
# ``transport_diagnostics.diagnostics_enabled`` (env wins) but reads ONLY the
# env var -- the transport does not consult the config dict -- so retention is
# an explicit, process-level debug affordance. The canonical config+env
# resolution lives in ``ai_router.transport_diagnostics``.
_DIAGNOSTICS_ENV_VAR = "DABBLER_COPILOT_DIAGNOSTICS"
_DIAGNOSTICS_TRUTHY = frozenset({"1", "true", "yes", "on"})


def _diagnostics_retention_enabled(env: Optional[dict] = None) -> bool:
    """True iff the diagnostics env toggle is explicitly truthy -- the only
    condition under which a handoff payload file is retained rather than
    deleted."""
    env = env if env is not None else os.environ
    raw = env.get(_DIAGNOSTICS_ENV_VAR)
    if raw is None:
        return False
    return raw.strip().lower() in _DIAGNOSTICS_TRUTHY


def _rendered_utf16_units(argv: Sequence[str]) -> int:
    """UTF-16 code units in the RENDERED command line for ``argv``.

    ``subprocess.list2cmdline`` applies Windows quoting rules; encoding the
    result UTF-16 and counting units (``// 2``) measures exactly what
    ``CreateProcessW`` counts against its 32,767 limit. ``+ 1`` accounts for
    the terminating NUL the limit includes. Astral (non-BMP) characters are
    two UTF-16 units each, which this counts correctly and a raw ``len()`` on
    the Python string would not."""
    rendered = subprocess.list2cmdline(list(argv))
    return len(rendered.encode("utf-16-le")) // 2 + 1


def _build_handoff_footer(nonce: str) -> str:
    """The transport-control footer appended to the payload file. Carries the
    per-request nonce (which never appears in argv) and the exact ack line the
    model must end its response with."""
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
    """The short ``-p`` bootstrap for a handoff dispatch. Names the payload
    path in POSIX forward-slash form (models mangle backslashes), instructs a
    complete sequential read BEFORE acting, and defers the ack line to the
    file's footer (so the nonce stays out of argv). Contains NO nonce."""
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
    """Hex sha256 of the file at ``path``, or ``None`` if it cannot be read
    (removed/unreadable). Never raises -- it runs on already-failing paths."""
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def _best_effort_remove(path: str) -> None:
    """Delete ``path``, swallowing a missing/locked file. The agent may have
    already deleted it (it holds write tools); that is not an error here."""
    try:
        os.remove(path)
    except OSError:
        pass


@dataclass(frozen=True)
class _HandoffContext:
    """State a handoff dispatch threads through ``_run`` so the result builders
    can validate the ack, record ``payload_bytes``, and detect a payload-file
    mutation (the agent has write tools; a mutation is recorded, not gated)."""

    nonce: str
    payload_path: str
    payload_bytes: int
    hash_before: Optional[str]


def _payload_modified(handoff: "_HandoffContext") -> bool:
    """Did the payload file change between spawn and exit? A removed/unreadable
    file counts as modified (the agent deleting it is a mutation)."""
    after = _sha256_file(handoff.payload_path)
    if after is None:
        return True
    return after != handoff.hash_before


def _handoff_metadata_fields(
    handoff: Optional["_HandoffContext"], *, ack_outcome: Optional[str]
) -> dict:
    """The additive ``transport_metadata`` handoff fields. Inline dispatches
    carry ``handoff: False`` and nothing else; handoff dispatches also carry
    ``payload_bytes``, the ack outcome, and ``payload_file_modified``."""
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

    Returns ``(stripped_content, outcome)`` where ``outcome`` is one of
    ``"validated"`` / ``"mismatch"`` / ``"missing"``. ``stripped_content`` is
    the response with the ack line removed, and is only non-``None`` when the
    outcome is ``"validated"``. The ack must be the final NON-BLANK line
    (trailing blank lines are tolerated); a model that appended anything else
    after it fails closed. Honest framing: this is a gross under-read detector,
    not proof that every intervening byte was read."""
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


@dataclass(frozen=True)
class TransportResult:
    """The outcome of one transport dispatch.

    The first four fields mirror :class:`ai_router.providers.APIResult` so a
    future ``route()`` caller can read either result type uniformly for the
    fields that exist on both. The remaining fields are the extended
    contract (Critique-2 M2): the discard decision and usage-authoritativity
    live on the result, not implicit in caller logic.
    """

    content: str
    input_tokens: int
    output_tokens: int
    stop_reason: str
    usage_authoritative: bool
    finish_reason_known: bool
    content_complete: bool
    partial_output_discarded: bool
    raw_stdout: str
    raw_stderr: str
    transport_metadata: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        """True iff no error class was recorded for this dispatch."""
        return self.transport_metadata.get("error_class") is None

    @property
    def retryable(self) -> bool:
        return bool(self.transport_metadata.get("retryable", False))

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "stop_reason": self.stop_reason,
            "usage_authoritative": self.usage_authoritative,
            "finish_reason_known": self.finish_reason_known,
            "content_complete": self.content_complete,
            "partial_output_discarded": self.partial_output_discarded,
            "ok": self.ok,
            "retryable": self.retryable,
            "transport_metadata": self.transport_metadata,
        }


class Transport(Protocol):
    """The seam a future ``route()`` caller dispatches through.

    Session 3 wires this in: under the ``api`` profile the existing
    ``providers.call_model`` path stays untouched (Critique-2 nit — the
    dispatch path is regression-suite-identical, not reshaped into this
    interface); under ``copilot-cli`` the resolved role/alias model is
    dispatched through :class:`CopilotCliTransport`.
    """

    def dispatch(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_message: str,
    ) -> TransportResult:
        ...


# ---------------------------------------------------------------------------
# The injected-spawner seam. A fake spawner returns a fake process object
# implementing the same three members the state machine reads, so the whole
# state machine is testable without ever invoking the real CLI.
# ---------------------------------------------------------------------------


class ProcessHandle(Protocol):
    """The subset of ``subprocess.Popen`` the state machine depends on."""

    stdout: object  # a line-iterable text stream
    stderr: object

    def poll(self) -> Optional[int]:
        ...

    def kill(self) -> None:
        ...

    def wait(self, timeout: Optional[float] = None) -> int:
        ...


Spawner = Callable[[Sequence[str], Optional[dict]], ProcessHandle]


def default_spawner(argv: Sequence[str], env: Optional[dict]) -> ProcessHandle:
    """The real spawner: a thin ``subprocess.Popen`` wrapper. ``shell=False``
    always — the model/role names are the only variable part of ``argv``.

    S4 live-dogfood finding (severe): ``text=True`` without an explicit
    ``encoding`` decodes the child's stdout/stderr using
    ``locale.getpreferredencoding()`` -- ``cp1252`` on this Windows seat. The
    real CLI's JSONL is UTF-8 and routinely contains non-cp1252-safe bytes
    (an em dash, a curly quote -- ordinary in real model output). A decode
    failure raised ``UnicodeDecodeError`` inside ``_reader_thread``'s
    ``readline()`` loop, which the thread's broad ``except (OSError,
    ValueError)`` swallowed -- silently killing that reader mid-stream,
    *before* the process had actually finished writing. With nobody left to
    drain it, the child blocked on a full OS pipe once its own stdout buffer
    filled, never exited on its own, and the caller's total-timeout fired
    ~300s later and force-killed it -- misclassifying a local decode bug as
    ``total-timeout`` and masking the real cause entirely. Force UTF-8
    (JSON's own encoding) explicitly, with ``errors="replace"`` so a
    genuinely malformed byte is never fatal to the reader either.
    """
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
    """Raised internally when the spawner call itself does not return in
    time (e.g. a real-world AV-scan-stalled process creation)."""


def _spawn_with_timeout(
    spawner: Spawner, argv: Sequence[str], env: Optional[dict], timeout: float
) -> ProcessHandle:
    """Call ``spawner`` on a bounded thread.

    A ``gave_up`` flag (guarded by ``lock``) closes the leak a bare
    daemon-thread abandonment would leave: if the spawner eventually
    returns a real, billed CLI process *after* the caller has already
    declared a spawn-timeout, nobody else owns that process — the
    background thread itself kills and reaps it before returning, instead
    of leaving a live child with unread pipes.
    """
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


def _has_utf8_replacement(*texts: str) -> bool:
    """True if any text carries a U+FFFD replacement character.

    S4 live-dogfood follow-up (code-review finding): ``default_spawner``
    decodes with ``errors="replace"`` so a genuinely malformed byte from the
    CLI is never fatal to the reader thread -- but that silently substitutes
    U+FFFD with no other signal, which could mask real content corruption
    from a caller with no way to notice. This flag makes the substitution
    observable on the result without changing the never-hang guarantee: a
    caller that cares can check it; nothing today treats it as blocking.
    """
    replacement_char = chr(0xFFFD)
    return any(replacement_char in text for text in texts)


def _classify_stderr(stderr_text: str) -> str:
    """Map raw stderr text to an error class per the design-lock taxonomy.

    The load-bearing rule: anything that does not match a known positive
    signal falls to ``ERROR_CLASS_GENERIC`` (auth-class-or-worse), never a
    speculative retryable bucket.
    """
    lowered = stderr_text.lower()
    if _INVALID_MODEL_SUBSTRING in lowered:
        return ERROR_CLASS_INVALID_MODEL
    if any(s in lowered for s in _AUTH_SUBSTRINGS):
        return ERROR_CLASS_AUTH
    if any(s in lowered for s in _QUOTA_SUBSTRINGS):
        return ERROR_CLASS_QUOTA
    return ERROR_CLASS_GENERIC


def _reader_thread(stream, out_queue: "queue.Queue") -> threading.Thread:
    def _run() -> None:
        try:
            # iter(readline, "") already stops at the "" EOF sentinel, so
            # every line handed to the loop body is non-empty by construction.
            for line in iter(stream.readline, ""):
                out_queue.put(line)
        except (OSError, ValueError):
            pass
        finally:
            out_queue.put(None)  # EOF sentinel

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t


@dataclass(frozen=True)
class TransportTimeouts:
    spawn_seconds: float = DEFAULT_SPAWN_TIMEOUT_SECONDS
    first_byte_seconds: float = DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS
    total_seconds: float = DEFAULT_TOTAL_TIMEOUT_SECONDS


class CopilotCliTransport:
    """Dispatches one call through the GitHub Copilot CLI's headless mode.

    ``binary`` is the CLI executable name (default ``"copilot"``);
    ``spawner`` defaults to :func:`default_spawner` and is the sole seam
    tests replace with a fake process to drive every branch of the state
    machine without touching a real CLI.
    """

    def __init__(
        self,
        *,
        binary: str = "copilot",
        spawner: Spawner = default_spawner,
        timeouts: Optional[TransportTimeouts] = None,
        version_probe: Optional[Callable[[], Optional[str]]] = None,
    ) -> None:
        self._binary = binary
        self._spawner = spawner
        self._timeouts = timeouts or TransportTimeouts()
        # The auth-class re-probe (Feature 1 Standards): a cheap, unbilled
        # ``--version`` check run only on an auth-class classification, to
        # distinguish "the whole CLI/auth stack is down" from "just this one
        # call failed" before the operator-visible stop. Never a retry of
        # the billed dispatch itself (GAP-1: the positive auth heuristic is
        # unvalidated, and auth-class is never retryable regardless of what
        # the re-probe finds). Defaults to a real subprocess call; tests
        # inject a fake so the re-probe path never shells out either.
        self._version_probe = version_probe or self._default_version_probe

    def _default_version_probe(self) -> Optional[str]:
        try:
            result = subprocess.run(
                [self._binary, "--version"],
                capture_output=True, text=True, timeout=30,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        return result.stdout.strip() if result.returncode == 0 else None

    def dispatch(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_message: str,
    ) -> TransportResult:
        """Run one non-interactive turn against ``model_id``.

        The CLI has no separate system-prompt flag (S1 finding): system and
        user text are joined into the single ``-p`` prompt argument.
        """
        prompt = (
            f"{system_prompt}\n\n{user_message}" if system_prompt else user_message
        )
        inline_argv = [
            self._binary,
            "-p", prompt,
            "--model", model_id,
            "--allow-all-tools",
            "--output-format", "json",
            _NO_AUTO_UPDATE_FLAG,
        ]
        # Threshold-gated handoff (Set 104): inline stays primary and
        # highest-fidelity; switch to the file pull only when the rendered
        # inline command line reaches the size ceiling. One helper owns the
        # decision so both branches stay tested.
        if _rendered_utf16_units(inline_argv) < HANDOFF_THRESHOLD_UTF16_UNITS:
            return self._run(inline_argv)
        return self._run_handoff(prompt, model_id)

    def _run_handoff(self, prompt: str, model_id: str) -> TransportResult:
        """Dispatch a large prompt via a temp-file pull.

        The payload (composed prompt + nonce footer) is written UTF-8 (no BOM),
        flushed and CLOSED before spawn (an open handle blocks the child from
        reading it on Windows), then a short bootstrap ``-p`` points the CLI at
        the file. The payload file is deleted in ``finally`` on EVERY path --
        success, spawn failure, either timeout class, malformed output -- with
        retention only under the diagnostics toggle."""
        nonce = secrets.token_hex(16)
        payload_text = prompt + _build_handoff_footer(nonce)
        payload_bytes = payload_text.encode("utf-8")  # UTF-8, no BOM
        fd, path = tempfile.mkstemp(suffix=".txt", prefix="dabbler-copilot-handoff-")
        with os.fdopen(fd, "wb") as f:
            f.write(payload_bytes)
            f.flush()
            os.fsync(f.fileno())
        # The handle is now closed -- required for a reliable child read on
        # Windows. Hash the payload before spawn so a mutation by the agent
        # (it holds write tools) is observable on the result.
        handoff = _HandoffContext(
            nonce=nonce,
            payload_path=path,
            payload_bytes=len(payload_bytes),
            hash_before=_sha256_file(path),
        )
        argv = [
            self._binary,
            "-p", _build_handoff_bootstrap(Path(path).as_posix()),
            "--model", model_id,
            "--allow-all-tools",
            "--output-format", "json",
            _NO_AUTO_UPDATE_FLAG,
        ]
        try:
            return self._run(argv, handoff=handoff)
        finally:
            # payload_file_modified is read inside _run (before this finally),
            # so the file still exists when the result is built. Cleanup runs
            # last, on every path, unless diagnostics retention is enabled.
            if _diagnostics_retention_enabled():
                print(
                    "[dabbler] Copilot handoff payload retained for diagnostics: "
                    f"{path}",
                    file=sys.stderr,
                )
            else:
                _best_effort_remove(path)

    def _run(
        self, argv: Sequence[str], handoff: Optional[_HandoffContext] = None
    ) -> TransportResult:
        timeouts = self._timeouts

        try:
            proc = _spawn_with_timeout(
                self._spawner, argv, _NO_AUTO_UPDATE_ENV, timeouts.spawn_seconds
            )
        except _SpawnTimeout:
            return self._error_result(
                error_class=ERROR_CLASS_SPAWN_TIMEOUT,
                raw_stdout="", raw_stderr="",
                partial_output_discarded=False,
                argv=argv, handoff=handoff,
            )
        except Exception as exc:  # noqa: BLE001 - any spawner failure is a
            # classified result, never an escaping exception (a bad-argv
            # ValueError from a real Popen, or anything a fake spawner in a
            # future caller might raise, not just OSError).
            return self._error_result(
                error_class=ERROR_CLASS_GENERIC,
                raw_stdout="", raw_stderr=str(exc),
                partial_output_discarded=False,
                argv=argv, handoff=handoff,
            )

        # Anchored AFTER the spawn tier resolves: first-byte and total budget
        # measure the live process's own behavior, not wall-clock stolen by
        # however long the spawn tier itself took.
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
            deadline = (
                first_byte_deadline if not stdout_lines else total_deadline
            )
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
            raw_stdout = "".join(stdout_lines)
            raw_stderr = _drain_queue(stderr_q, budget_seconds=5.0)
            return self._error_result(
                error_class=timed_out_class,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                partial_output_discarded=bool(stdout_lines),
                argv=argv, handoff=handoff,
            )

        # stdout hit EOF cleanly. Bound the exit wait by whatever remains of
        # the total budget (never a fixed constant) so a process that closes
        # stdout but never actually exits cannot hold the caller past the
        # configured total timeout.
        remaining_total = total_deadline - time.monotonic()
        if remaining_total <= 0:
            _kill_and_reap(proc)
            raw_stdout = "".join(stdout_lines)
            raw_stderr = _drain_queue(stderr_q, budget_seconds=5.0)
            return self._error_result(
                error_class=ERROR_CLASS_TOTAL_TIMEOUT,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                partial_output_discarded=bool(stdout_lines),
                argv=argv, handoff=handoff,
            )
        try:
            exit_code = proc.wait(timeout=remaining_total)
        except subprocess.TimeoutExpired:
            _kill_and_reap(proc)
            raw_stdout = "".join(stdout_lines)
            raw_stderr = _drain_queue(stderr_q, budget_seconds=5.0)
            return self._error_result(
                error_class=ERROR_CLASS_TOTAL_TIMEOUT,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                partial_output_discarded=bool(stdout_lines),
                argv=argv, handoff=handoff,
            )

        raw_stdout = "".join(stdout_lines)
        raw_stderr = _drain_queue(stderr_q, budget_seconds=5.0)

        if exit_code != 0:
            error_class = _classify_stderr(raw_stderr)
            reprobe_cli_version = None
            if error_class == ERROR_CLASS_AUTH:
                # Diagnostic only — never a retry of the billed call, and
                # auth-class stays non-retryable regardless of the outcome.
                reprobe_cli_version = self._version_probe()
            return self._error_result(
                error_class=error_class,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                partial_output_discarded=bool(stdout_lines),
                argv=argv,
                exit_code=exit_code,
                reprobe_cli_version=reprobe_cli_version,
                reprobed=error_class == ERROR_CLASS_AUTH,
                handoff=handoff,
            )

        return self._success_result(
            raw_stdout=raw_stdout, raw_stderr=raw_stderr, argv=argv,
            exit_code=exit_code, handoff=handoff,
        )

    def _error_result(
        self,
        *,
        error_class: str,
        raw_stdout: str,
        raw_stderr: str,
        partial_output_discarded: bool,
        argv: Sequence[str],
        exit_code: Optional[int] = None,
        reprobed: bool = False,
        reprobe_cli_version: Optional[str] = None,
        handoff: Optional[_HandoffContext] = None,
        handoff_ack_outcome: Optional[str] = None,
    ) -> TransportResult:
        metadata = {
            "error_class": error_class,
            "retryable": error_class in RETRYABLE_ERROR_CLASSES,
            "argv": list(argv),
            "exit_code": exit_code,
            "reprobed": reprobed,
            "reprobe_cli_version": reprobe_cli_version,
            "reprobe_cli_alive": reprobe_cli_version is not None
            if reprobed else None,
            "utf8_replacement_seen": _has_utf8_replacement(raw_stdout, raw_stderr),
        }
        metadata.update(
            _handoff_metadata_fields(handoff, ack_outcome=handoff_ack_outcome)
        )
        return TransportResult(
            content="",
            input_tokens=0,
            output_tokens=0,
            stop_reason=f"error:{error_class}",
            usage_authoritative=False,
            finish_reason_known=False,
            content_complete=False,
            partial_output_discarded=partial_output_discarded,
            raw_stdout=raw_stdout,
            raw_stderr=raw_stderr,
            transport_metadata=metadata,
        )

    def _success_result(
        self, *, raw_stdout: str, raw_stderr: str, argv: Sequence[str],
        exit_code: int, handoff: Optional[_HandoffContext] = None,
    ) -> TransportResult:
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
                partial_output_discarded=bool(events or malformed_lines),
                argv=argv, exit_code=exit_code, handoff=handoff,
            )

        # Every field below came off the wire as arbitrary JSON — a
        # well-formed event with an unexpected field SHAPE (a number where
        # a string was expected, a list where a dict was expected) must
        # never escape as an uncaught TypeError/ValueError/AttributeError;
        # it is exactly as untrustworthy as a missing event (session-
        # verification finding, Set 078 S2).
        try:
            # S4 live-dogfood finding: the real CLI wraps every message-type
            # event's payload (content/model/outputTokens/...) under a
            # "data" key -- {"type": "assistant.message", "data": {...},
            # "id": ..., "ephemeral": ...} -- unlike the terminal "result"
            # event, whose fields (sessionId/exitCode/usage) sit at the
            # envelope's top level. The fake-spawner suite (S2/S3) modeled
            # assistant.message with its fields flattened onto the envelope,
            # which never exercised this and let every real dispatch return
            # a silently "successful" empty content. Round-2/3 verification
            # findings below still apply to the unwrapped payload dict.
            # S5 path-aware critique finding: an assistant.message event with
            # no "data" key at all is structurally malformed, not a legitimate
            # empty response -- the real CLI always wraps message payload
            # fields under "data" (see the S4 finding above), so an absent
            # key is a wire-shape anomaly indistinguishable from truncation
            # unless it fails closed like every other malformed shape here.
            if "data" not in final_message:
                raise TypeError("assistant.message missing required 'data' key")
            message_data = final_message["data"]
            if not isinstance(message_data, dict):
                raise TypeError("assistant.message data is not a dict")
            # Round-2 verification finding: validate the RAW value before
            # any coercion. The prior `.get(..., "") or ""` applied the
            # falsy-coalescing `or` before the type check, so an explicitly
            # present but wrong-typed falsy value (0, False, [], {}) was
            # silently masked into an empty-but-"valid" string instead of
            # being caught as malformed.
            content = message_data.get("content", "")
            if not isinstance(content, str):
                raise TypeError("content is not a string")
            echoed_model = message_data.get("model")
            if echoed_model is not None and not isinstance(echoed_model, str):
                raise TypeError("model is not a string")
            # Round-3 verification finding: int() itself coerces a numeric
            # string ("7") or a float (1.5) without complaint, silently
            # normalizing a wrong-typed wire value into a plausible-looking
            # success instead of the malformed classification every sibling
            # field above already gets. Require the raw JSON type to be
            # exactly int (bool excluded despite being an int subclass).
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
        except (TypeError, ValueError, AttributeError):
            return self._error_result(
                error_class=ERROR_CLASS_GENERIC,
                raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                partial_output_discarded=True,
                argv=argv, exit_code=exit_code, handoff=handoff,
            )

        # Handoff integrity gate (Set 104): the payload's footer required the
        # response to END with the exact nonce ack line. Validate it and strip
        # it before returning content; on absence/mismatch fail closed as
        # handoff-incomplete (non-retryable -- the call is billed and tools may
        # have run). A gross under-read detector, not proof of comprehension.
        ack_outcome: Optional[str] = None
        if handoff is not None:
            stripped, ack_outcome = _validate_ack(content, handoff.nonce)
            if stripped is None:
                return self._error_result(
                    error_class=ERROR_CLASS_HANDOFF_INCOMPLETE,
                    raw_stdout=raw_stdout, raw_stderr=raw_stderr,
                    partial_output_discarded=True,
                    argv=argv, exit_code=exit_code,
                    handoff=handoff, handoff_ack_outcome=ack_outcome,
                )
            content = stripped

        metadata = {
            "error_class": None,
            "retryable": False,
            "argv": list(argv),
            "exit_code": exit_code,
            "echoed_model": echoed_model,
            "session_id": session_id,
            "premium_requests": usage.get("premiumRequests"),
            "total_api_duration_ms": usage.get("totalApiDurationMs"),
            "session_duration_ms": usage.get("sessionDurationMs"),
            "utf8_replacement_seen": _has_utf8_replacement(raw_stdout, raw_stderr),
        }
        metadata.update(_handoff_metadata_fields(handoff, ack_outcome=ack_outcome))
        return TransportResult(
            content=content,
            input_tokens=0,  # never reported by the CLI (S1 finding)
            output_tokens=output_tokens,
            stop_reason="end_turn",
            usage_authoritative=False,  # honest non-accounting (Critique-2 M6)
            finish_reason_known=True,
            content_complete=True,
            partial_output_discarded=False,
            raw_stdout=raw_stdout,
            raw_stderr=raw_stderr,
            transport_metadata=metadata,
        )


def _kill_and_reap(proc: ProcessHandle) -> None:
    """Kill a timed-out process AND reap it, every time.

    Every kill site must reap (``wait()`` after ``kill()``) or the child
    becomes a zombie on POSIX; this is the single place that rule is
    enforced so a future kill site cannot forget the second half.
    """
    proc.kill()
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:  # pragma: no cover - defensive
        pass


def _drain_queue(q: "queue.Queue", *, budget_seconds: float) -> str:
    """Collect whatever lines are already available (or arrive within the
    budget) from a reader-thread queue, stopping at the EOF sentinel."""
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
    """Parse JSONL text into ``(events, malformed_lines)``. Blank lines are
    skipped silently; any non-blank line that fails to parse as a JSON
    object is recorded as malformed rather than raising.
    """
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
    """Return the last non-ephemeral event of ``event_type``, or ``None``.

    Streaming deltas (``assistant.message_delta``) are marked
    ``"ephemeral": true`` and are a distinct event type from the canonical
    final ``assistant.message`` this reads, but the ephemeral check is kept
    here too as a defensive filter in case a future CLI build reuses the
    type name for both.
    """
    for event in reversed(events):
        if event.get("type") == event_type and not event.get("ephemeral"):
            return event
    return None
