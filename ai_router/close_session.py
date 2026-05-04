"""``close_session`` — sole synchronization barrier between session work and close-out.

Usage::

    python -m ai_router.close_session --session-set-dir docs/session-sets/<slug>
    python -m ai_router.close_session --json
    python -m ai_router.close_session --manual-verify --reason-file reason.md
    python -m ai_router.close_session --repair         # diagnostic only
    python -m ai_router.close_session --repair --apply # corrective

    # ``--force`` is hard-scoped to incident-recovery only (Set 9 Session 3,
    # D-2). Both gates below are required and validated up front:
    AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1 \
        python -m ai_router.close_session --force --reason-file reason.md

What this script is (and is not)
--------------------------------
This is the **Set 3 Session 1 skeleton**. It ships the runnable CLI, the
flag-parsing surface, the disposition-presence check, the idempotency
short-circuit, the structured JSON output shape, and the
``closeout_requested`` / ``closeout_succeeded`` / ``closeout_failed``
ledger events.

Sessions 2 and 3 fill in the deterministic gate checks and the
queue-mediated verification-wait, respectively. Until then:

* :func:`_run_gate_checks` returns "all stubs passed" — the
  architectural shape (``(passed: bool, remediation: str)`` per check)
  is in place so Session 2 plugs in real predicates without restructuring
  the call site.
* :func:`_wait_for_verifications` is a no-op that returns "wait skipped"
  — Session 3 implements queue polling against ``queue_db`` and the
  ``--timeout`` budget.

Snapshot-flip on success lives in :func:`session_state._flip_state_to_closed`,
called from this script's success path after ``closeout_succeeded`` is
appended to the events ledger. The choice of the gate-bypass internal
flip helper (rather than the public :func:`mark_session_complete`)
mirrors the ``--repair --apply`` case-2 path: by the time we flip, the
events ledger already records the close-out as succeeded, so re-running
the gate via ``mark_session_complete`` would either redundantly validate
or fail on transient drift the gate would surface. ``--force`` was
originally listed as a transitional flag scheduled for removal; Set 9
Session 3 (D-2) instead hard-scoped it to incident-recovery use only —
see :func:`_validate_args` and ``ai_router/docs/close-out.md`` Section 5
for the full contract.

Exit codes
----------
* ``0`` — close-out succeeded (gates passed; verifications terminal). Or
  the session was already closed (idempotent no-op).
* ``1`` — gate failure (one or more deterministic gates rejected).
* ``2`` — invalid invocation (incompatible flags, missing
  ``disposition.json`` outside ``--force`` / ``--repair``, etc.).
* ``3`` — lock contention (another close-out is running on the same
  session set; reserved for Session 2 lock implementation).
* ``4`` — timeout waiting on queued verification (reserved for Session 3
  queue-wait implementation).
* ``5`` — repair drift detected and not applied (``--repair`` without
  ``--apply``).

JSON output shape
-----------------
When ``--json`` is set, the script writes a single JSON object to stdout
on exit. The shape is stable across exit codes so that the orchestrator
(and the VS Code Session Set Explorer in Set 5) can parse it without
branching on success::

    {
      "result": "succeeded" | "noop_already_closed" | "gate_failed"
                | "invalid_invocation" | "lock_contention"
                | "verification_timeout" | "repair_drift",
      "exit_code": <int>,
      "session_set_dir": "<absolute path>",
      "session_number": <int> | null,
      "messages": ["<human-readable line>", ...],
      "gate_results": [
        {"check": "<name>", "passed": <bool>, "remediation": "<str>"}
      ],
      "verification": {
        "method": "api" | "queue" | "manual" | "skipped",
        "message_ids": ["<id>", ...],
        "wait_outcome": "<string>"
      },
      "events_emitted": ["closeout_requested", "closeout_succeeded", ...]
    }

Future sessions extend the ``gate_results`` list and populate
``verification.wait_outcome`` with concrete values (``completed``,
``failed``, ``timed_out``); the surrounding shape stays stable.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, List, Optional


# Module logger for loud WARNING lines on the ``--force`` path. Emits to
# stderr via the default StreamHandler — keeping this separate from
# ``outcome.messages`` (which lands on stdout via ``_emit_output``)
# guarantees the warning is visible even in ``--json`` mode where the
# stdout payload is JSON and a tool may not surface inner ``messages``
# entries.
_logger = logging.getLogger("ai_router.close_session")
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)
_logger.setLevel(logging.WARNING)
_logger.propagate = False

if __name__ == "__main__" and __package__ in (None, ""):
    # Production CLI path: invoked as ``python -m ai_router.close_session``
    # but this module also has to be importable when ``ai_router/`` is
    # on sys.path directly (the test harness pattern). The parent
    # directory ``ai_router/`` is the package directory; adding it lets
    # the module's own siblings import-by-filename.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from disposition import (  # type: ignore[import-not-found]
        Disposition,
        read_disposition,
    )
    from session_events import (  # type: ignore[import-not-found]
        SessionLifecycleState,
        append_event,
        current_lifecycle_state,
        read_events,
    )
    from session_state import read_session_state  # type: ignore[import-not-found]
    from gate_checks import GATE_CHECKS  # type: ignore[import-not-found]
    from close_lock import (  # type: ignore[import-not-found]
        LockContention,
        acquire_lock,
        release_lock,
    )
    from queue_db import (  # type: ignore[import-not-found]
        DEFAULT_BASE_DIR as QUEUE_DEFAULT_BASE_DIR,
        TERMINAL_STATES,
        QueueDB,
        QueueMessage,
    )
except ImportError:
    from .disposition import (  # type: ignore[no-redef]
        Disposition,
        read_disposition,
    )
    from .session_events import (  # type: ignore[no-redef]
        SessionLifecycleState,
        append_event,
        current_lifecycle_state,
        read_events,
    )
    from .session_state import read_session_state  # type: ignore[no-redef]
    from .gate_checks import GATE_CHECKS  # type: ignore[no-redef]
    from .close_lock import (  # type: ignore[no-redef]
        LockContention,
        acquire_lock,
        release_lock,
    )
    from .queue_db import (  # type: ignore[no-redef]
        DEFAULT_BASE_DIR as QUEUE_DEFAULT_BASE_DIR,
        TERMINAL_STATES,
        QueueDB,
        QueueMessage,
    )


# Default poll interval (seconds) for the queue verification wait. Tests
# pass a smaller value via :func:`run` so the integration suite does not
# spend real wall-clock time on the wait.
DEFAULT_POLL_INTERVAL_SECONDS = 5.0


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

# Mapping from string result code → numeric exit code. Stable across
# sessions; downstream consumers (Set 5 VS Code extension, Set 6 fresh
# close-out turn) read the result string rather than the integer where
# they can.
RESULT_TO_EXIT_CODE = {
    "succeeded": 0,
    "noop_already_closed": 0,
    "gate_failed": 1,
    "invalid_invocation": 2,
    "lock_contention": 3,
    "verification_timeout": 4,
    "repair_drift": 5,
}


@dataclass
class GateResult:
    """One gate check's outcome.

    ``check`` is the function name without the ``check_`` prefix
    (``"working_tree_clean"``, ``"pushed_to_remote"``, etc.).
    ``passed`` is the boolean. ``remediation`` is non-empty when
    ``passed`` is False — a one-line hint the orchestrator surfaces to
    the human or includes in the JSON output.
    """

    check: str
    passed: bool
    remediation: str = ""


@dataclass
class CloseoutOutcome:
    """Aggregate result of a single ``close_session`` invocation.

    Built up step-by-step in :func:`run` and serialized to JSON (or
    human-readable lines) by :func:`_emit_output`. ``result`` is the
    canonical string in :data:`RESULT_TO_EXIT_CODE`; ``messages`` is
    free-form prose for the human-readable output mode.
    """

    result: str
    session_set_dir: str
    session_number: Optional[int] = None
    messages: List[str] = field(default_factory=list)
    gate_results: List[GateResult] = field(default_factory=list)
    verification_method: str = "skipped"
    verification_message_ids: List[str] = field(default_factory=list)
    verification_wait_outcome: str = "not_run"
    events_emitted: List[str] = field(default_factory=list)

    @property
    def exit_code(self) -> int:
        return RESULT_TO_EXIT_CODE.get(self.result, 2)

    def to_dict(self) -> dict:
        return {
            "result": self.result,
            "exit_code": self.exit_code,
            "session_set_dir": self.session_set_dir,
            "session_number": self.session_number,
            "messages": list(self.messages),
            "gate_results": [
                {
                    "check": g.check,
                    "passed": g.passed,
                    "remediation": g.remediation,
                }
                for g in self.gate_results
            ],
            "verification": {
                "method": self.verification_method,
                "message_ids": list(self.verification_message_ids),
                "wait_outcome": self.verification_wait_outcome,
            },
            "events_emitted": list(self.events_emitted),
        }


# ---------------------------------------------------------------------------
# CLI parsing & validation
# ---------------------------------------------------------------------------

def _load_close_out_section_2() -> Optional[str]:
    """Read Section 2 of ``ai_router/docs/close-out.md`` if available.

    The close-out doc is the single source of truth for invocation
    syntax. Surfacing its Section 2 verbatim in ``--help`` keeps the
    operator-facing reference and the CLI in sync without duplicating
    text. If the doc isn't found (consumer repo with this script
    vendored but the doc deliberately stripped), return ``None`` and
    fall back to argparse's default help output.

    Section boundaries: the body between ``## Section 2 — How to run
    close-out`` and the next ``## ``. We strip the header line itself
    so the epilog reads as a continuation of the flag list.
    """
    here = Path(__file__).resolve().parent
    candidates = [
        here / "docs" / "close-out.md",
        here.parent / "ai_router" / "docs" / "close-out.md",
    ]
    for path in candidates:
        if path.is_file():
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            marker = "## Section 2 — How to run close-out"
            start = text.find(marker)
            if start < 0:
                continue
            after_header = text.find("\n", start) + 1
            next_section = text.find("\n## ", after_header)
            body = text[after_header:next_section] if next_section > 0 else text[after_header:]
            return body.strip("\n")
    return None


def _build_parser() -> argparse.ArgumentParser:
    epilog = _load_close_out_section_2()
    p = argparse.ArgumentParser(
        prog="python -m ai_router.close_session",
        description=(
            "Run the close-out gate on a session set. This is the sole "
            "synchronization barrier between session work and the session "
            "being marked complete. Close-out runs gate checks, waits on "
            "verification (queue mode), and writes idempotent state — it "
            "does NOT run git commit / push or send notifications. The "
            "caller (orchestrator or fresh close-out turn agent) commits "
            "and pushes before invoking this script and fires "
            "send_session_complete_notification afterward; the gate's "
            "check_pushed_to_remote enforces the precondition. See "
            "ai_router/docs/close-out.md Section 1 for the full ownership "
            "contract."
        ),
        epilog=epilog,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--session-set-dir",
        type=str,
        default=None,
        help=(
            "Path to the session set directory. Defaults to the active "
            "session set in the current working directory (resolved "
            "via find_active_session_set)."
        ),
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit a single JSON object on stdout instead of human-readable lines.",
    )
    p.add_argument(
        "--interactive",
        action="store_true",
        help=(
            "Opt in to interactive prompts. Default is non-interactive — "
            "the script never blocks on stdin in default mode."
        ),
    )
    p.add_argument(
        "--force",
        action="store_true",
        help=(
            "Bypass all gate checks. Hard-scoped to incident-recovery use "
            "only: requires AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1 in the "
            "environment AND --reason-file naming the operator's narrative. "
            "Emits a closeout_force_used event to the session-events ledger "
            "with the reason text and writes forceClosed=true to "
            "session-state.json so the VS Code Session Set Explorer can "
            "surface a [FORCED] badge for forensic audit. See "
            "ai_router/docs/close-out.md Section 5 for the full contract."
        ),
    )
    p.add_argument(
        "--allow-empty-commit",
        action="store_true",
        help="Permit close-out for a session that produced no commits.",
    )
    p.add_argument(
        "--reason-file",
        type=str,
        default=None,
        help=(
            "Path to a file containing narrative fields (close-out reason, "
            "manual-verify attestation). Substitutes for interactive prompts."
        ),
    )
    p.add_argument(
        "--manual-verify",
        action="store_true",
        help=(
            "Skip queue verification blocking and treat verifications as "
            "completed by human attestation (bootstrapping window only)."
        ),
    )
    p.add_argument(
        "--repair",
        action="store_true",
        help=(
            "Diagnostic mode: walk the session set's state and report drift. "
            "Combine with --apply to actually fix detectable drift."
        ),
    )
    p.add_argument(
        "--apply",
        action="store_true",
        help=(
            "When combined with --repair, apply corrections to detected "
            "drift. Without --repair, has no effect."
        ),
    )
    p.add_argument(
        "--timeout",
        type=int,
        default=60,
        help=(
            "Maximum minutes to wait for queued verifications to reach a "
            "terminal state. Defaults to 60. Reserved for Session 3."
        ),
    )
    return p


def _prompt_manual_attestation(
    prompt_fn: Callable[[str], str] = input,
) -> Optional[str]:
    """Prompt for a manual-verify attestation on stdin.

    Returns the trimmed attestation text, or ``None`` if the operator
    aborted (Ctrl-C / EOF). Empty input is treated as no attestation
    (also returns ``None``) — silently accepting an empty string would
    defeat the audit-trail purpose of the prompt. The caller turns
    ``None`` into an ``invalid_invocation`` so the operator gets a
    clear error rather than a quietly-bypassed gate.

    The prompt callable is injectable so the integration tests can
    drive the interactive path without real stdin attachment.
    """
    try:
        text = prompt_fn(
            "Manual verification attestation (one line, "
            "describing how verification was performed out-of-band): "
        )
    except (EOFError, KeyboardInterrupt):
        return None
    text = (text or "").strip()
    return text if text else None


def _read_reason_file(path: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Read the contents of ``--reason-file`` if provided.

    Returns ``(reason_text, error_message)``. Exactly one of the two is
    non-None: a successful read returns the file contents and a None
    error; a failed read (missing file, permission error, decode error)
    returns a None reason and a short string suitable for the
    ``invalid_invocation`` messages list.

    Trailing whitespace is stripped — a reason file that ends in a
    newline (the common case from a text editor) shouldn't carry that
    newline into the audit-trail event payload.
    """
    if path is None:
        return None, None
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read().strip()
    except OSError as exc:
        return None, f"could not read --reason-file {path!r}: {exc}"
    return text, None


FORCE_CLOSE_OUT_ENV_VAR = "AI_ROUTER_ALLOW_FORCE_CLOSE_OUT"


def _validate_args(args: argparse.Namespace) -> Optional[str]:
    """Return an error string if *args* is an invalid combination, else None.

    Combination rules:

    * ``--force`` is bypass-everything: incompatible with ``--interactive``
      (which implies a human in the loop is reviewing the gate output)
      and with ``--manual-verify`` (which is a different bypass path with
      its own attestation requirement). Picking one bypass at a time
      keeps the audit trail unambiguous.
    * ``--force`` is also incompatible with ``--repair`` — repair already
      handles its own drift surface; combining the two would let a
      ``--force`` claim cover up the very drift ``--repair`` is meant to
      detect.
    * **``--force`` is hard-scoped to incident-recovery only** (Set 9
      Session 3, D-2). Two additional gates fire even when the
      compatibility rules above pass:
      - The ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT`` environment variable
        must be set to ``"1"``. Anything else (unset, empty, ``"0"``,
        ``"true"``, etc.) is rejected. The intent is that a normal
        terminal session does NOT have the env var set, so accidental
        ``--force`` invocations during day-to-day operation fail loudly
        before any state is touched.
      - ``--reason-file`` must be supplied with a non-empty narrative.
        The operator's reason becomes the payload of the
        ``closeout_force_used`` event so a forensic walk of the events
        ledger always answers "why was the gate bypassed?" without
        requiring a separate paper-trail. Refusing the silent-bypass
        case here mirrors ``--manual-verify``'s contract.
    * ``--apply`` is meaningful only under ``--repair``; using it alone
      is almost certainly a typo and should fail loudly.
    * ``--manual-verify`` is the bootstrapping-window escape hatch — it
      bypasses queue blocking on the operator's word. The operator's
      attestation must come from somewhere: either ``--interactive``
      (prompt on stdin) or ``--reason-file`` (file contents become the
      attestation). Refusing the silent-bypass case keeps the audit
      trail honest; an operator who genuinely has nothing to say can
      put a one-line reason in a file.
    * ``--timeout`` must be positive (a zero or negative timeout would
      either skip the wait entirely or hang forever depending on
      implementation; both are footguns).
    """
    if args.force and args.interactive:
        return "--force and --interactive are incompatible"
    if args.force and args.manual_verify:
        return "--force and --manual-verify are incompatible"
    if args.force and args.repair:
        return "--force and --repair are incompatible"
    if args.force:
        if os.environ.get(FORCE_CLOSE_OUT_ENV_VAR) != "1":
            return (
                f"--force is hard-scoped to incident-recovery only; set "
                f"{FORCE_CLOSE_OUT_ENV_VAR}=1 in the environment to opt "
                "in. See ai_router/docs/close-out.md Section 5."
            )
        if not args.reason_file:
            return (
                "--force requires --reason-file naming a non-empty "
                "narrative; the operator's reason is recorded in the "
                "closeout_force_used event for forensic audit"
            )
    if args.apply and not args.repair:
        return "--apply requires --repair"
    if args.manual_verify and not args.interactive and not args.reason_file:
        return (
            "--manual-verify requires either --interactive (prompt for "
            "attestation) or --reason-file (file containing attestation)"
        )
    if args.timeout is not None and args.timeout <= 0:
        return f"--timeout must be a positive integer (got {args.timeout})"
    return None


# ---------------------------------------------------------------------------
# Disposition / idempotency probes
# ---------------------------------------------------------------------------

def _resolve_session_set_dir(arg: Optional[str]) -> str:
    """Resolve the session-set directory argument to an absolute path.

    No active-session-set discovery here — that lives in
    ``find_active_session_set`` and the orchestrator passes the path
    explicitly when it invokes us. ``None`` falls back to the current
    working directory only in the unusual case that someone runs us
    inside a session set folder, which is also fine for ad-hoc local
    invocations.
    """
    if arg:
        return os.path.abspath(arg)
    return os.path.abspath(os.getcwd())


def _is_already_closed(session_set_dir: str) -> bool:
    """Return True iff the latest session in the events ledger is ``closed``.

    Idempotency rule: re-running ``close_session`` on a set whose most
    recent session has the ``closed`` lifecycle state is a no-op. The
    canonical source is ``session-events.jsonl`` (Set 1's append-only
    ledger). ``session-state.json`` is the in-memory snapshot consumers
    read; the ledger is the truth.

    Set 7 Session 2 note: the spec lists "the close-out gate's
    idempotency check" as a reader to collapse to ``read_status``.
    This function is the close-out gate's idempotency check, but it
    does not read coarse status — it derives the lifecycle state from
    the events ledger. The events ledger is intentionally
    authoritative here for the same reason the reconciler stays
    events-driven (Set 7 Session 2): a stale snapshot saying
    ``"complete"`` while the ledger still records ``closeout_pending``
    is exactly the drift the close-out machinery exists to catch.
    Switching to ``read_status`` here would mask that drift, and the
    tests that exercise repair (test_close_session_session4,
    test_close_session_skeleton) explicitly depend on the events-based
    derivation. The collapse is a no-op: there is no coarse-status
    read here to remove.
    """
    events = read_events(session_set_dir)
    state = current_lifecycle_state(events)
    return state == SessionLifecycleState.CLOSED


def _peek_session_number(session_set_dir: str) -> Optional[int]:
    """Return the session number from ``session-state.json`` if present.

    Best-effort and unauthoritative — used only for the JSON output
    payload. Real consumers of the session number look at the events
    ledger or the disposition; we just want a label for the output.
    """
    state = read_session_state(session_set_dir)
    if not state:
        return None
    sn = state.get("currentSession")
    return sn if isinstance(sn, int) else None


def _read_disposition_or_none(session_set_dir: str) -> Optional[Disposition]:
    """Return the parsed disposition, or None if the file is absent / malformed."""
    return read_disposition(session_set_dir)


# ---------------------------------------------------------------------------
# Gate-check skeleton (Session 2 fills in real checks)
# ---------------------------------------------------------------------------

# Names of the gate checks. Kept for backwards reference; the real
# (name, predicate) registry lives in :mod:`gate_checks`.
_GATE_CHECK_NAMES = tuple(name for name, _fn in GATE_CHECKS)


def _run_gate_checks(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool,
) -> List[GateResult]:
    """Run the deterministic gate checks against the session set.

    Each predicate from :data:`gate_checks.GATE_CHECKS` is invoked with
    the same three arguments. A predicate that raises is recorded as a
    failed gate with the exception text in the remediation — gates must
    not crash the close-out flow because a single buggy predicate could
    otherwise wedge every set in the repo. The wrapper preserves the
    declared order of :data:`gate_checks.GATE_CHECKS` so the JSON
    output's ``gate_results`` list is shape-stable across runs.
    """
    results: List[GateResult] = []
    for name, predicate in GATE_CHECKS:
        try:
            passed, remediation = predicate(
                session_set_dir,
                disposition,
                allow_empty_commit=allow_empty_commit,
            )
        except Exception as exc:  # pragma: no cover — defensive
            passed = False
            remediation = f"gate predicate raised {type(exc).__name__}: {exc}"
        results.append(
            GateResult(
                check=name,
                passed=bool(passed),
                remediation=remediation,
            )
        )
    return results


def run_gate_checks(
    session_set_dir: str,
    *,
    allow_empty_commit: bool = False,
) -> List[GateResult]:
    """Run the deterministic close-out gates and return their results.

    Public entry point used by ``mark_session_complete`` (Set 4 Session 3
    wiring). Mirrors the gate-only portion of :func:`run` — no lock, no
    event emission, no queue wait — so callers that already own those
    concerns (the snapshot-flip path) can probe the gate verdict
    directly without acquiring the close-out lock or appending duplicate
    ledger events.

    A missing ``disposition.json`` is surfaced as a synthetic gate
    failure named ``disposition_present`` rather than as an exception:
    callers want a single uniform "list of failures" surface so they can
    serialize all remediations in one error message.
    """
    disposition = read_disposition(session_set_dir)
    if disposition is None:
        return [
            GateResult(
                check="disposition_present",
                passed=False,
                remediation=(
                    "disposition.json is required for close-out — write it "
                    "before calling mark_session_complete (or pass force=True "
                    "to bypass the gate; incident-recovery use only)."
                ),
            )
        ]
    return _run_gate_checks(
        session_set_dir,
        disposition,
        allow_empty_commit=allow_empty_commit,
    )


# ---------------------------------------------------------------------------
# Verification wait (queue-mode polling)
# ---------------------------------------------------------------------------


@dataclass
class _MessageOutcome:
    """Snapshot of one queue message at the moment polling terminated.

    ``state`` is the terminal queue state (``completed`` / ``failed`` /
    ``timed_out``) when ``terminal`` is True, or the last observed
    non-terminal state when the wait timed out before resolution.
    ``failure_reason`` is set for the ``failed`` / ``timed_out`` cases
    and is ``None`` otherwise (including for ``completed`` and for
    "still pending at timeout"). ``provider`` records which
    per-provider queue directory the message resolved under, since the
    disposition records only the message id.
    """

    message_id: str
    provider: Optional[str]
    state: str
    terminal: bool
    failure_reason: Optional[str] = None


def _discover_queue_providers(queue_base_dir: str) -> List[str]:
    """Return the list of per-provider subdirectories under ``queue_base_dir``.

    The queue layout is ``<base>/<provider>/queue.db``. We don't know
    up front which provider holds a given message id (the disposition
    records only the id), so the wait logic enumerates providers and
    asks each. Empty list is acceptable — the caller treats it as "no
    queues exist; messages cannot resolve".

    Filters to directories containing a ``queue.db`` so an unrelated
    folder dropped under the queue root doesn't get probed. Returns
    providers in sorted order so the search is deterministic across
    runs (helps debugging and test stability).
    """
    if not os.path.isdir(queue_base_dir):
        return []
    out: List[str] = []
    try:
        entries = sorted(os.listdir(queue_base_dir))
    except OSError:
        return []
    for name in entries:
        candidate = os.path.join(queue_base_dir, name, "queue.db")
        if os.path.isfile(candidate):
            out.append(name)
    return out


def _lookup_message(
    message_id: str,
    queue_base_dir: str,
    providers: Iterable[str],
) -> tuple[Optional[QueueMessage], Optional[str]]:
    """Search every per-provider queue for *message_id*.

    Returns ``(message, provider_name)``. Both are ``None`` when the
    id is not present in any queue (treat as a logical drift — the
    disposition references an id we cannot resolve). Errors opening a
    specific provider's database are swallowed: the goal is "find this
    id somewhere", and a single corrupted queue should not blind us to
    the others.
    """
    for provider in providers:
        try:
            qdb = QueueDB(provider=provider, base_dir=queue_base_dir)
        except (ValueError, OSError):
            continue
        try:
            msg = qdb.get_message(message_id)
        except Exception:  # pragma: no cover — defensive
            continue
        if msg is not None:
            return msg, provider
    return None, None


def _wait_for_verifications(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    manual_verify: bool,
    timeout_minutes: int,
    queue_base_dir: str = QUEUE_DEFAULT_BASE_DIR,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    sleep: Optional[Callable[[float], None]] = None,
    monotonic: Optional[Callable[[], float]] = None,
) -> tuple[str, str, List[str], List[_MessageOutcome]]:
    """Wait for queued verifications to reach a terminal state.

    Returns ``(method, wait_outcome, message_ids, outcomes)``:

    * ``method`` — ``"api"`` (synchronous; nothing to wait on),
      ``"queue"`` (waited on the queue), ``"manual"``
      (``--manual-verify`` skipped the wait), or ``"skipped"`` (no
      disposition; nothing to do — the gate-failure path catches this
      separately).
    * ``wait_outcome`` — one of ``"not_run"`` (api / manual / skipped /
      empty queue list), ``"completed"`` (every queued message ended
      in ``completed``), ``"failed"`` (any message ended in ``failed``),
      ``"timed_out"`` (any message ended in ``timed_out`` OR the wait
      itself timed out before all messages resolved).
    * ``message_ids`` — verbatim copy of
      ``disposition.verification_message_ids`` (so the JSON output
      carries the audit trail even when the wait was skipped).
    * ``outcomes`` — per-message :class:`_MessageOutcome` snapshots,
      used by :func:`run` to emit ``verification_completed`` /
      ``verification_timed_out`` ledger events with structured
      payloads. Empty list when the wait did not run.

    Polling cadence is ``poll_interval_seconds`` (default 5 s) and the
    overall budget is ``timeout_minutes`` (multiplied by 60 to get
    seconds). The two clock primitives ``sleep`` and ``monotonic`` are
    injectable so tests don't pay real wall-clock latency for the wait.
    """
    sleep_fn = sleep if sleep is not None else time.sleep
    clock = monotonic if monotonic is not None else time.monotonic

    if manual_verify:
        return "manual", "skipped_via_manual_verify", [], []

    if disposition is None:
        return "skipped", "no_disposition", [], []

    method = disposition.verification_method or "skipped"
    message_ids = list(disposition.verification_message_ids)

    # outsource-first / synchronous API path: verification result is
    # already on disk by the time close-out runs. Nothing to wait on.
    if method != "queue":
        return method, "not_run", message_ids, []

    # outsource-last / queue-mediated path. An empty message list with
    # method=queue is a malformed disposition (validate_disposition
    # rejects it), but defensively we still return "not_run" rather
    # than spinning a zero-length poll loop.
    if not message_ids:
        return method, "not_run", message_ids, []

    providers = _discover_queue_providers(queue_base_dir)
    deadline = clock() + max(0, timeout_minutes) * 60.0

    # Per-message terminal outcome cache. As soon as a message reaches
    # a terminal state we record it and stop re-polling that id —
    # terminal states cannot transition back, so further reads would
    # waste DB roundtrips.
    resolved: dict[str, _MessageOutcome] = {}

    while True:
        for mid in message_ids:
            if mid in resolved:
                continue
            msg, provider = _lookup_message(mid, queue_base_dir, providers)
            if msg is None:
                # The id isn't present in any queue we can see. Record
                # a synthetic timed-out outcome with a reason naming
                # the drift; the caller treats this as a verification
                # failure surface (gate_failed) at the top of run().
                resolved[mid] = _MessageOutcome(
                    message_id=mid,
                    provider=None,
                    state="missing",
                    terminal=True,
                    failure_reason=(
                        f"queue message {mid!r} not found in any "
                        f"provider under {queue_base_dir!r}"
                    ),
                )
                continue
            if msg.state in TERMINAL_STATES:
                resolved[mid] = _MessageOutcome(
                    message_id=mid,
                    provider=provider,
                    state=msg.state,
                    terminal=True,
                    failure_reason=msg.failure_reason,
                )

        if len(resolved) == len(message_ids):
            break

        # Some messages still in flight. Sleep up to one full poll
        # interval, but never past the overall deadline — capping the
        # sleep at the remaining budget keeps the timeout sharp.
        remaining = deadline - clock()
        if remaining <= 0:
            break
        sleep_fn(min(poll_interval_seconds, remaining))

    # Decide the aggregate outcome based on the per-message states.
    # Order of severity (most severe wins): timed_out > failed > completed.
    # A "still pending at deadline" message is recorded as a synthetic
    # timed_out outcome below so the aggregate reflects "we couldn't
    # finish the wait".
    outcomes: List[_MessageOutcome] = []
    saw_failed = False
    saw_timed_out = False
    for mid in message_ids:
        out = resolved.get(mid)
        if out is None:
            # Wait deadline expired while this message was still
            # non-terminal. Reflect that as a synthetic timed_out
            # outcome rather than a missing record so the aggregate
            # logic treats it consistently.
            out = _MessageOutcome(
                message_id=mid,
                provider=None,
                state="pending_at_deadline",
                terminal=False,
                failure_reason="close_session timeout exceeded",
            )
        outcomes.append(out)
        if out.state == "failed" or out.state == "missing":
            saw_failed = True
        elif out.state == "timed_out" or not out.terminal:
            saw_timed_out = True

    if saw_timed_out:
        wait_outcome = "timed_out"
    elif saw_failed:
        wait_outcome = "failed"
    else:
        wait_outcome = "completed"

    return method, wait_outcome, message_ids, outcomes


# ---------------------------------------------------------------------------
# Repair stub
# ---------------------------------------------------------------------------

def _run_repair(
    session_set_dir: str,
    *,
    apply_changes: bool,
    queue_base_dir: str = QUEUE_DEFAULT_BASE_DIR,
) -> tuple[bool, List[str]]:
    """Walk the session set's state and report (or fix) detectable drift.

    Returns ``(drift_detected, messages)``. ``drift_detected`` is True
    iff at least one drift case fired; ``messages`` is the
    human-readable narrative the repair branch surfaces in
    ``outcome.messages`` and prints to stdout.

    Drift cases detected (cross-checking
    ``session-events.jsonl`` ↔ ``session-state.json`` ↔
    ``disposition.json`` ↔ queue messages):

    1. **State-says-closed-but-no-closeout-event.** Bootstrapping-window
       drift: ``session-state.json`` reports ``lifecycleState: closed``
       (or v1 ``status: complete``) but ``session-events.jsonl`` has no
       ``closeout_succeeded`` event for the current session. The old
       Step 8 path committed without emitting terminal lifecycle
       events. Repair: with ``--apply``, append a synthetic
       ``closeout_requested`` (if missing) and ``closeout_succeeded``
       so the events ledger is internally consistent and the
       reconciler stops considering the set "stranded".

    2. **Closeout-succeeded-but-state-not-closed.** The reverse drift:
       events ledger says the session closed, but
       ``session-state.json`` is still ``work_in_progress`` /
       ``work_verified``. Repair: with ``--apply``, call
       ``mark_session_complete`` so the snapshot tracks the ledger.

    3. **Disposition references missing queue messages.**
       ``disposition.json`` cites ``verification_message_ids`` that the
       queue databases do not contain. Reported but not auto-fixed —
       we cannot synthesize a verifier verdict, and the orchestrator
       must rebuild the disposition manually.

    4. **Stranded mid-closeout** (``closeout_requested`` without a
       terminal companion). Reported only. Recovery is the
       reconciler's job (re-run the gate); ``--repair --apply`` does
       not re-run the gate from inside itself.

    Never modifies git state. Never reaches into the queue databases
    (read-only inspection). Idempotent under repeat invocation: a set
    with no drift returns ``(False, ["repair: no drift detected"])``;
    a set whose drift is corrected by ``--apply`` reports
    ``(False, ["repair: ..."])`` on the next pass.
    """
    messages: List[str] = []
    drift_detected = False

    # Best-effort reads. A repair walk on a half-initialized set
    # should still produce a useful drift summary; missing files are
    # data points, not exceptions.
    events = read_events(session_set_dir)
    lifecycle = current_lifecycle_state(events)
    state = read_session_state(session_set_dir)
    disposition = read_disposition(session_set_dir)

    state_lifecycle = (state or {}).get("lifecycleState")
    state_session_number = (state or {}).get("currentSession")
    if not isinstance(state_session_number, int):
        state_session_number = None

    most_recent_session = max(
        (e.session_number for e in events), default=None,
    )
    target_session = state_session_number or most_recent_session

    # Helpers — gated by *apply_changes* so a diagnostic run never
    # touches the ledger.
    def _append(event_type: str, **fields) -> None:
        if target_session is None:
            return
        append_event(
            session_set_dir, event_type, target_session, **fields,
        )

    def _has_event(event_type: str, session_number: Optional[int]) -> bool:
        if session_number is None:
            return False
        return any(
            ev.event_type == event_type and ev.session_number == session_number
            for ev in events
        )

    # Case 1: state says closed, but events don't reflect it.
    state_says_closed = (
        state_lifecycle == SessionLifecycleState.CLOSED.value
        or (state or {}).get("status") == "complete"
    )
    if state_says_closed and lifecycle != SessionLifecycleState.CLOSED:
        drift_detected = True
        messages.append(
            "repair drift: session-state.json reports closed/complete but "
            "session-events.jsonl has no closeout_succeeded for the "
            f"current session (session {target_session})"
        )
        if apply_changes and target_session is not None:
            if not _has_event("closeout_requested", target_session):
                _append(
                    "closeout_requested",
                    repaired=True,
                    repair_reason="state_says_closed_but_no_closeout_event",
                )
                messages.append(
                    "repair applied: appended synthetic closeout_requested "
                    f"for session {target_session}"
                )
            if not _has_event("closeout_succeeded", target_session):
                _append(
                    "closeout_succeeded",
                    repaired=True,
                    repair_reason="state_says_closed_but_no_closeout_event",
                )
                messages.append(
                    "repair applied: appended synthetic closeout_succeeded "
                    f"for session {target_session}"
                )

    # Case 2: events say closed, state has not caught up.
    elif lifecycle == SessionLifecycleState.CLOSED and not state_says_closed:
        drift_detected = True
        messages.append(
            "repair drift: session-events.jsonl shows closeout_succeeded "
            "but session-state.json is not flipped to closed/complete"
        )
        if apply_changes:
            try:
                # Local import to avoid a top-level cycle. Use the
                # gate-bypass internal flip helper rather than the
                # public mark_session_complete: the events ledger
                # already records closeout_succeeded for this session,
                # so re-running the gate here would either redundantly
                # validate or, worse, fail on transient drift the gate
                # would surface (the work is already verified — we're
                # just resyncing the snapshot to the ledger).
                try:
                    from session_state import _flip_state_to_closed  # type: ignore[import-not-found]
                except ImportError:
                    from .session_state import _flip_state_to_closed  # type: ignore[no-redef]
                if _flip_state_to_closed(session_set_dir) is not None:
                    messages.append(
                        "repair applied: flipped session-state.json to "
                        "complete/closed via _flip_state_to_closed"
                    )
            except Exception as exc:  # pragma: no cover — defensive
                messages.append(
                    f"repair could not apply state fix: "
                    f"{type(exc).__name__}: {exc}"
                )

    # Case 4: stranded mid-closeout. Reported only — the reconciler
    # owns recovery here. Skip when case 1 already reported (their
    # symptoms overlap and the case-1 message is more actionable).
    if (
        not state_says_closed
        and lifecycle in (
            SessionLifecycleState.CLOSEOUT_PENDING,
            SessionLifecycleState.CLOSEOUT_BLOCKED,
        )
    ):
        drift_detected = True
        messages.append(
            f"repair drift: session {target_session} is in "
            f"{lifecycle.value} — closeout did not reach a terminal "
            "state. Recovery via reconciler / re-run close_session; "
            "--repair does not re-run the gate."
        )

    # Case 3: disposition cites message ids the queue does not contain.
    # Skip when case 1 already covered the set — a closed-but-
    # missing-events set is the bootstrapping case, and the queue
    # checks don't add information there.
    if (
        disposition is not None
        and disposition.verification_method == "queue"
        and disposition.verification_message_ids
        and not state_says_closed
    ):
        providers = _discover_queue_providers(queue_base_dir)
        unresolved: List[str] = []
        for mid in disposition.verification_message_ids:
            msg, _provider = _lookup_message(mid, queue_base_dir, providers)
            if msg is None:
                unresolved.append(mid)
        if unresolved:
            drift_detected = True
            joined = ", ".join(unresolved)
            messages.append(
                f"repair drift: disposition.json references queue "
                f"message ids that do not resolve under "
                f"{queue_base_dir!r}: {joined}. "
                "Auto-repair declined — verifier verdicts cannot be "
                "synthesized; rebuild the disposition manually."
            )

    if not drift_detected:
        messages.append("repair: no drift detected")

    return drift_detected, messages


# ---------------------------------------------------------------------------
# Event ledger helpers
# ---------------------------------------------------------------------------

def _emit_event(
    session_set_dir: str,
    event_type: str,
    session_number: Optional[int],
    outcome: CloseoutOutcome,
    **fields,
) -> None:
    """Append a lifecycle event and record the type on the outcome.

    Best-effort — a write failure (disk full, ledger directory removed
    mid-run) raises out of ``append_event`` and we let it propagate. The
    close-out gate's correctness depends on the ledger being durable;
    silently swallowing a write failure would break the idempotency
    invariant on a re-run.
    """
    if session_number is None:
        # The events ledger requires an integer session number. If we
        # don't have one (e.g., session-state.json was missing), default
        # to 0 — that's the documented "unknown session" sentinel and is
        # better than refusing to emit at all.
        session_number = 0

    append_event(
        session_set_dir,
        event_type,
        session_number,
        **fields,
    )
    outcome.events_emitted.append(event_type)


# ---------------------------------------------------------------------------
# Output emission
# ---------------------------------------------------------------------------

def _emit_output(outcome: CloseoutOutcome, *, json_mode: bool) -> None:
    """Write the outcome to stdout in either JSON or human-readable form.

    Human-readable mode prints one labeled line per material fact
    (result, gate failures, messages, events emitted). JSON mode writes
    a single object with no trailing newline beyond ``json.dumps``'s
    own — the structured output is meant to be consumed by other
    processes (the orchestrator, the VS Code extension), not eyeballed.
    """
    if json_mode:
        sys.stdout.write(json.dumps(outcome.to_dict(), indent=2))
        sys.stdout.write("\n")
        return

    print(f"close_session: {outcome.result}")
    print(f"  session_set_dir: {outcome.session_set_dir}")
    if outcome.session_number is not None:
        print(f"  session_number: {outcome.session_number}")
    if outcome.messages:
        print("  messages:")
        for msg in outcome.messages:
            print(f"    - {msg}")
    if outcome.gate_results:
        print("  gate_results:")
        for g in outcome.gate_results:
            mark = "PASS" if g.passed else "FAIL"
            line = f"    [{mark}] {g.check}"
            if not g.passed and g.remediation:
                line += f" — {g.remediation}"
            print(line)
    if outcome.events_emitted:
        print(f"  events_emitted: {', '.join(outcome.events_emitted)}")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------

def run(
    args: argparse.Namespace,
    *,
    queue_base_dir: str = QUEUE_DEFAULT_BASE_DIR,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    sleep: Optional[Callable[[float], None]] = None,
    monotonic: Optional[Callable[[], float]] = None,
    prompt_fn: Callable[[str], str] = input,
) -> CloseoutOutcome:
    """Execute the close-out flow for the given parsed args.

    Composed so callers (the reconciler, integration tests) can build
    an ``argparse.Namespace`` directly and skip the CLI parsing layer.
    Returns the :class:`CloseoutOutcome` rather than calling
    ``sys.exit`` so callers can inspect / re-emit it.

    The keyword-only knobs ``queue_base_dir``, ``poll_interval_seconds``,
    ``sleep``, and ``monotonic`` are injection points for the
    integration tests — production callers (the CLI ``main`` and the
    reconciler) leave them at their defaults.
    """
    session_set_dir = _resolve_session_set_dir(args.session_set_dir)
    outcome = CloseoutOutcome(
        result="succeeded",  # default; corrected below as we go
        session_set_dir=session_set_dir,
    )

    # Validate combinations early — bad invocations should not produce
    # ledger events. The argparse parser handled type-level validation;
    # this layer covers cross-flag rules.
    err = _validate_args(args)
    if err:
        outcome.result = "invalid_invocation"
        outcome.messages.append(err)
        return outcome

    # Session-set directory must exist. argparse can't enforce this
    # because the default is computed lazily.
    if not os.path.isdir(session_set_dir):
        outcome.result = "invalid_invocation"
        outcome.messages.append(
            f"session-set directory does not exist: {session_set_dir}"
        )
        return outcome

    outcome.session_number = _peek_session_number(session_set_dir)

    # Repair branch: short-circuits the gate flow. ``--repair`` is a
    # diagnostic / corrective tool that bypasses the normal close-out
    # gate; we run the repair walk and exit on its result. The lock is
    # held across the repair walk so a repair cannot race with a normal
    # close-out on the same set (and vice versa).
    if args.repair:
        try:
            lock_handle = acquire_lock(session_set_dir)
        except LockContention as exc:
            outcome.result = "lock_contention"
            outcome.messages.append(str(exc))
            return outcome
        try:
            outcome.messages.extend(lock_handle.warnings)
            drift, messages = _run_repair(
                session_set_dir,
                apply_changes=args.apply,
                queue_base_dir=queue_base_dir,
            )
            outcome.messages.extend(messages)
            if drift and not args.apply:
                outcome.result = "repair_drift"
            else:
                outcome.result = "succeeded"
        finally:
            release_lock(lock_handle)
        return outcome

    # Idempotency check before reading disposition — if the session is
    # already closed, we don't need disposition to be present (it may
    # have been pruned or the set may have been backfilled). Re-running
    # close-out on a closed set is always a clean no-op.
    if _is_already_closed(session_set_dir):
        outcome.result = "noop_already_closed"
        outcome.messages.append(
            "session is already closed; close_session is a no-op"
        )
        return outcome

    disposition = _read_disposition_or_none(session_set_dir)

    # ``--force`` accepts a missing disposition. By the time we reach
    # this branch ``_validate_args`` has confirmed ``--force`` is
    # opted-in via ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1`` and
    # ``--reason-file`` is supplied (Set 9 Session 3, D-2 hard-scoping).
    # In the normal path, refuse: the disposition is the structured
    # handoff the close-out script reads to know what was done and how
    # it was verified.
    if disposition is None and not args.force:
        outcome.result = "invalid_invocation"
        outcome.messages.append(
            "disposition.json is required (or pass --force to bypass; "
            "incident-recovery use only — see ai_router/docs/close-out.md "
            "Section 5)"
        )
        return outcome

    # Note: ``--force`` is hard-scoped (Set 9 Session 3, D-2) — the
    # env-var gate and ``--reason-file`` requirement are validated by
    # ``_validate_args`` above. By the time we reach here the operator
    # has opted in deliberately, so the WARNING/event emission path
    # below is the documented happy path for incident recovery rather
    # than an exception.

    # Read --reason-file, if provided. A read failure is an invalid
    # invocation — better to surface it now than to drop the operator's
    # narrative on the floor and proceed silently.
    reason_text, reason_err = _read_reason_file(args.reason_file)
    if reason_err is not None:
        outcome.result = "invalid_invocation"
        outcome.messages.append(reason_err)
        return outcome

    # Manual-verify attestation. ``--manual-verify`` bypasses the queue
    # wait entirely on the operator's word, so the audit trail must
    # record *what* the operator attested to. Source priority: reason
    # file (if already read above) wins; otherwise the interactive
    # prompt fires. ``_validate_args`` already rejected the
    # neither-source case, so reaching this branch with both empty
    # means the operator aborted the prompt mid-way.
    manual_attestation: Optional[str] = None
    if args.manual_verify:
        if reason_text is not None:
            manual_attestation = reason_text
        else:
            manual_attestation = _prompt_manual_attestation(prompt_fn)
        if not manual_attestation:
            outcome.result = "invalid_invocation"
            outcome.messages.append(
                "--manual-verify requires a non-empty attestation; "
                "got empty / aborted input"
            )
            return outcome

    # Acquire the concurrency lock around the rest of the flow. Two
    # close_session invocations on the same set must not interleave —
    # they would race on event emission and (eventually, in Set 4) on
    # mark_session_complete. Lock contention surfaces as result
    # ``lock_contention`` / exit code 3; the reclaim path emits
    # warnings into outcome.messages so the operator sees that a stale
    # lock was reclaimed.
    try:
        lock_handle = acquire_lock(session_set_dir)
    except LockContention as exc:
        outcome.result = "lock_contention"
        outcome.messages.append(str(exc))
        return outcome
    outcome.messages.extend(lock_handle.warnings)

    try:
        # Emit the start-of-closeout event before the gate runs so a crash
        # mid-gate leaves an auditable "we started" record. ``--force``
        # still emits this — the event is "we attempted close-out", not
        # "the gates passed". The reason text (if any) is captured in the
        # event payload so the audit trail records the operator's
        # narrative — this is what ``--reason-file`` is for.
        request_fields = {
            "force": args.force,
            "manual_verify": args.manual_verify,
        }
        if reason_text is not None:
            request_fields["reason"] = reason_text
        if manual_attestation is not None and reason_text is None:
            # Reason came from the interactive prompt rather than a
            # file — record it on the request event so the attestation
            # is part of the audit trail from t-zero.
            request_fields["manual_attestation"] = manual_attestation
        _emit_event(
            session_set_dir,
            "closeout_requested",
            outcome.session_number,
            outcome,
            **request_fields,
        )

        # Hard-scoped --force path (Set 9 Session 3, D-2): emit the
        # forensic ``closeout_force_used`` event with the operator's
        # reason so a forensic walk of the ledger can grep these
        # without inspecting every ``closeout_succeeded`` payload's
        # ``forced`` field. ``_validate_args`` guarantees ``args.force``
        # is True only when both the env-var gate and ``--reason-file``
        # are satisfied, so ``reason_text`` is always populated here.
        if args.force:
            outcome.messages.append(
                "WARNING: --force bypassed all close-out gates "
                "(incident-recovery only). The closeout_force_used "
                "event has been emitted with the operator's reason; "
                "session-state.json will record forceClosed=true on "
                "the next snapshot flip."
            )
            _logger.warning(
                "close_session --force used on %s (reason=%r). "
                "closeout_force_used event emitted; gate bypassed.",
                session_set_dir,
                reason_text,
            )
            _emit_event(
                session_set_dir,
                "closeout_force_used",
                outcome.session_number,
                outcome,
                reason=reason_text,
            )

        # Verification wait. ``--force`` short-circuits this entirely —
        # bypassing the gate is the point of ``--force``, and waiting on
        # queued verifications when the operator has already chosen to
        # skip the gate would just wedge the close-out unnecessarily.
        if args.force:
            method = "skipped"
            wait_outcome = "not_run"
            message_ids: List[str] = []
            wait_outcomes: List[_MessageOutcome] = []
        else:
            method, wait_outcome, message_ids, wait_outcomes = (
                _wait_for_verifications(
                    session_set_dir,
                    disposition,
                    manual_verify=args.manual_verify,
                    timeout_minutes=args.timeout,
                    queue_base_dir=queue_base_dir,
                    poll_interval_seconds=poll_interval_seconds,
                    sleep=sleep,
                    monotonic=monotonic,
                )
            )
        outcome.verification_method = method
        outcome.verification_wait_outcome = wait_outcome
        outcome.verification_message_ids = message_ids

        # Emit per-message ledger events for the queue path. One event
        # per message keeps the audit trail at message granularity so
        # observers (the reconciler, the VS Code extension) can answer
        # "which verification round terminated when" by walking the
        # ledger alone.
        for mo in wait_outcomes:
            if mo.state == "completed":
                _emit_event(
                    session_set_dir,
                    "verification_completed",
                    outcome.session_number,
                    outcome,
                    message_id=mo.message_id,
                    queue_provider=mo.provider,
                    queue_state=mo.state,
                )
            elif mo.state == "timed_out" or not mo.terminal:
                _emit_event(
                    session_set_dir,
                    "verification_timed_out",
                    outcome.session_number,
                    outcome,
                    message_id=mo.message_id,
                    queue_provider=mo.provider,
                    queue_state=mo.state,
                    failure_reason=mo.failure_reason,
                )
            else:
                # ``failed`` and the synthetic ``missing`` state both
                # fall here — both are verifier-side rejections that
                # the close-out gate must surface as failures.
                _emit_event(
                    session_set_dir,
                    "verification_completed",
                    outcome.session_number,
                    outcome,
                    message_id=mo.message_id,
                    queue_provider=mo.provider,
                    queue_state=mo.state,
                    failure_reason=mo.failure_reason,
                )

        # Manual-verify path: emit a single ``verification_completed``
        # event carrying the operator attestation. EVENT_TYPES is a
        # frozen Set 1 enum (per session 3 review), so the manual case
        # rides on the same event type as queue-mediated completions
        # — the ``method`` and ``attestation`` fields disambiguate.
        # Without this, the events ledger would jump from
        # ``closeout_requested`` straight to ``closeout_succeeded`` on
        # ``--manual-verify``, leaving a hole where the verification
        # decision should be.
        if method == "manual" and manual_attestation is not None:
            _emit_event(
                session_set_dir,
                "verification_completed",
                outcome.session_number,
                outcome,
                method="manual",
                attestation=manual_attestation,
                verdict="manual_attestation",
            )

        # If the wait timed out (deadline exceeded with non-terminal
        # messages OR any message ended in timed_out), surface a
        # verification_timeout result and stop. The session does not
        # transition to closed; the reconciler / a re-run picks it up
        # once the verifier finishes.
        if wait_outcome == "timed_out":
            outcome.result = "verification_timeout"
            reasons = [
                mo.failure_reason or mo.state
                for mo in wait_outcomes
                if mo.state == "timed_out" or not mo.terminal
            ]
            joined = "; ".join(reasons) if reasons else "wait deadline exceeded"
            outcome.messages.append(
                f"verification timed out after {args.timeout} minute(s): "
                f"{joined}"
            )
            _emit_event(
                session_set_dir,
                "closeout_failed",
                outcome.session_number,
                outcome,
                reason="verification_timeout",
                wait_outcome=wait_outcome,
            )
            return outcome

        # Verifier-side rejection (any message failed or went missing).
        # This is a gate failure — the work did not pass independent
        # review — so we surface it through the gate_failed exit code
        # rather than verification_timeout. ``failed`` is a verifier
        # decision; ``timed_out`` is an infrastructure outcome; they
        # deserve distinct exit codes so consumers can react
        # appropriately.
        if wait_outcome == "failed":
            outcome.result = "gate_failed"
            reasons = [
                mo.failure_reason or mo.state
                for mo in wait_outcomes
                if mo.state in ("failed", "missing")
            ]
            joined = "; ".join(r for r in reasons if r) or "verifier rejected"
            outcome.messages.append(
                f"verification failed: {joined}"
            )
            outcome.gate_results = [
                GateResult(
                    check="verification_passed",
                    passed=False,
                    remediation=joined,
                )
            ]
            _emit_event(
                session_set_dir,
                "closeout_failed",
                outcome.session_number,
                outcome,
                reason="verification_failed",
                failed_checks=["verification_passed"],
            )
            return outcome

        # Gate checks. ``--force`` skips the gate run entirely; we still
        # record an empty gate_results list so the JSON shape is
        # unambiguous in that case.
        if args.force:
            outcome.gate_results = []
        else:
            outcome.gate_results = _run_gate_checks(
                session_set_dir,
                disposition,
                allow_empty_commit=args.allow_empty_commit,
            )

        failed = [g for g in outcome.gate_results if not g.passed]
        if failed:
            outcome.result = "gate_failed"
            for g in failed:
                outcome.messages.append(
                    f"gate {g.check} failed: {g.remediation}"
                )
            _emit_event(
                session_set_dir,
                "closeout_failed",
                outcome.session_number,
                outcome,
                failed_checks=[g.check for g in failed],
            )
            return outcome

        outcome.result = "succeeded"
        _emit_event(
            session_set_dir,
            "closeout_succeeded",
            outcome.session_number,
            outcome,
            method=method,
        )

        # Flip session-state.json to complete/closed via the gate-bypass
        # internal helper. Mirrors the ``--repair --apply`` case-2 path
        # (lines ~1045–1075): the events ledger already records
        # closeout_succeeded for this session, so re-running the gate
        # via mark_session_complete would either redundantly validate
        # or fail on transient drift the gate would surface. The flip
        # is a snapshot resync, not a gate decision. Lazy-import to
        # avoid a top-level cycle (session_state imports close_session
        # in mark_session_complete's gate-running branch).
        #
        # ``forced=args.force`` propagates the forensic marker on the
        # ``--force`` path (Set 9 Session 3, D-2): the success path's
        # message above promises that ``session-state.json`` will record
        # ``forceClosed=true`` on the next snapshot flip. Without this
        # argument the snapshot would silently skip the marker and
        # forensic walks of the events + snapshot pair would lose the
        # bypass signal.
        try:
            from session_state import _flip_state_to_closed  # type: ignore[import-not-found]
        except ImportError:
            from .session_state import _flip_state_to_closed  # type: ignore[no-redef]
        flipped_path = _flip_state_to_closed(
            session_set_dir, forced=bool(args.force),
        )
        if flipped_path is not None:
            outcome.messages.append(
                "flipped session-state.json to complete/closed via "
                "_flip_state_to_closed"
            )
        else:
            # No state file to flip — surface a warning but do not
            # fail close-out. The events ledger is the canonical
            # record; the snapshot is the consumer-readable cache.
            outcome.messages.append(
                "warning: no session-state.json found to flip; "
                "events ledger remains the canonical record"
            )
        return outcome
    finally:
        release_lock(lock_handle)


def main(argv: Optional[List[str]] = None) -> int:
    """CLI entry point. Returns the exit code; never calls ``sys.exit``.

    Kept argv-parameterizable so the test suite can drive this end-to-end
    by passing a list rather than mocking out ``sys.argv``.
    """
    parser = _build_parser()
    args = parser.parse_args(argv)
    outcome = run(args)
    _emit_output(outcome, json_mode=args.json)
    return outcome.exit_code


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess
    sys.exit(main())
