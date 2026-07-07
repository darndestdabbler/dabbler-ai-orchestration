"""``close_session`` — close-out gate for Full-tier session sets.

**Who uses this:** All Full-tier consumers (dabbler-platform, dabbler-access-harvester).
**Not used by:** Lightweight-tier projects (no ai_router at all).
**See also:** ``gate_checks.py`` (the deterministic predicates this script runs).

---

``close_session`` — sole synchronization barrier between session work and close-out.

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

Set 026 Session 1 removed the queue-mediated verification-wait path
along with the rest of the daemon infrastructure. Verification is now
resolved synchronously from the disposition's ``verification_method``
field and the ``--manual-verify`` flag; there is no queue to poll.

Snapshot-flip on success lives in :func:`session_state._flip_state_to_closed`,
called from this script's success path after ``closeout_succeeded`` is
appended to the events ledger. ``--force`` is hard-scoped to incident-
recovery use only — see :func:`_validate_args` and
``ai_router/docs/close-out.md`` Section 5 for the full contract.

Exit codes
----------
* ``0`` — close-out succeeded (gates passed). Or the session was already
  closed (idempotent no-op).
* ``1`` — gate failure (one or more deterministic gates rejected).
* ``2`` — invalid invocation (incompatible flags, missing
  ``disposition.json`` outside ``--force`` / ``--repair``, etc.).
* ``3`` — lock contention (another close-out is running on the same
  session set).
* ``5`` — repair drift detected and not applied (``--repair`` without
  ``--apply``).

JSON output shape
-----------------
When ``--json`` is set, the script writes a single JSON object to stdout
on exit. The shape is stable across exit codes so that the orchestrator
(and the VS Code Session Set Explorer) can parse it without branching
on success::

    {
      "result": "succeeded" | "noop_already_closed" | "gate_failed"
                | "invalid_invocation" | "lock_contention"
                | "repair_drift",
      "exit_code": <int>,
      "session_set_dir": "<absolute path>",
      "session_number": <int> | null,
      "messages": ["<human-readable line>", ...],
      "gate_results": [
        {"check": "<name>", "passed": <bool>, "remediation": "<str>"}
      ],
      "verification": {
        "method": "api" | "manual" | "manual-via-other-engine" | "skipped"
      },
      "events_emitted": ["closeout_requested", "closeout_succeeded", ...]
    }

``method: "manual"`` is the ``--manual-verify`` / ``--no-router``
attestation path's event vocabulary; ``"manual-via-other-engine"``
flows through verbatim when the disposition declares it (Set 083 —
the disposition vocabulary is ``api`` / ``manual-via-other-engine`` /
``skipped``; see ``disposition.py``).
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
from typing import Callable, Iterable, List, Optional, Tuple


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
        VERIFICATION_METHODS,
        read_disposition,
    )
    from progress import (  # type: ignore[import-not-found]
        SessionStateInvariantError,
        read_progress,
    )
    from session_events import (  # type: ignore[import-not-found]
        SessionLifecycleState,
        append_event,
        current_lifecycle_state,
        read_events,
    )
    from session_state import read_session_state  # type: ignore[import-not-found]
    from gate_checks import (  # type: ignore[import-not-found]
        GATE_CHECKS,
        VERIFICATION_INTEGRITY_CHECK_NAME,
        check_verification_integrity,
        check_verification_method_vocabulary,
    )
    from close_lock import (  # type: ignore[import-not-found]
        LockContention,
        acquire_lock,
        release_lock,
    )
    from check_migrations import summarize_drift  # type: ignore[import-not-found]
    from guidance_config import discover_guidance_files  # type: ignore[import-not-found]
    from guidance_meta import find_entry  # type: ignore[import-not-found]
    from guidance_report import summarize_overhead  # type: ignore[import-not-found]
except ImportError:
    from .disposition import (  # type: ignore[no-redef]
        Disposition,
        VERIFICATION_METHODS,
        read_disposition,
    )
    from .progress import (  # type: ignore[no-redef]
        SessionStateInvariantError,
        read_progress,
    )
    from .session_events import (  # type: ignore[no-redef]
        SessionLifecycleState,
        append_event,
        current_lifecycle_state,
        read_events,
    )
    from .session_state import read_session_state  # type: ignore[no-redef]
    from .gate_checks import (  # type: ignore[no-redef]
        GATE_CHECKS,
        VERIFICATION_INTEGRITY_CHECK_NAME,
        check_verification_integrity,
        check_verification_method_vocabulary,
    )
    from .close_lock import (  # type: ignore[no-redef]
        LockContention,
        acquire_lock,
        release_lock,
    )
    from .check_migrations import summarize_drift  # type: ignore[no-redef]
    from .guidance_config import discover_guidance_files  # type: ignore[no-redef]
    from .guidance_meta import find_entry  # type: ignore[no-redef]
    from .guidance_report import summarize_overhead  # type: ignore[no-redef]


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

# Mapping from string result code → numeric exit code. Stable across
# sessions; downstream consumers (Set 5 VS Code extension, Set 6 fresh
# close-out turn) read the result string rather than the integer where
# they can.
#
# ``aborted_at_soft_gate`` (Set 077 S4, S1 bundle D): the operator
# answered "no" at the interactive external-verification.md soft gate.
# Previously unmapped, so it fell through to the default exit code 2 —
# indistinguishable from ``invalid_invocation``. It gets its own code
# (4) because it is neither a usage error nor a deterministic gate
# failure: the invocation was valid and the gates passed; the operator
# chose to stop.
RESULT_TO_EXIT_CODE = {
    "succeeded": 0,
    "noop_already_closed": 0,
    "gate_failed": 1,
    "invalid_invocation": 2,
    "lock_contention": 3,
    "aborted_at_soft_gate": 4,
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
            "being marked complete. Close-out runs gate checks, verifies "
            "the recorded verification evidence, and writes idempotent state — it "
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
            "Bypass the bookkeeping gate checks (NOT the "
            "verification-integrity check — force bypasses gates, not "
            "evidence; Set 083). Hard-scoped to incident-recovery use "
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
            "Treat verification as completed by human attestation. Used "
            "for the zero-budget tier and for any session whose "
            "verification ran out-of-band (e.g., manual cross-provider "
            "review via the IDE-agent paste path). Also the ONLY "
            "sanctioned bypass of the Set 083 verification-integrity "
            "check (requires the written attestation; logged)."
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
    # Set 048 Session 2: --no-router mode flag. Highest-precedence
    # source for runtime_mode.resolve_no_router_mode (CLI > env >
    # spec tier > default). Under --no-router, close_session skips
    # routed verification calls and accepts a pre-supplied
    # verificationVerdict (default "manual") for the session's record.
    # See Set 048 §3.1 A3 + §3.5 for the close-out short-circuit
    # contract.
    p.add_argument(
        "--no-router",
        action="store_true",
        dest="no_router",
        help=(
            "Run in Lightweight tier --no-router mode: skip routed "
            "verification calls; accept a pre-supplied verdict (default "
            "'manual'). Highest-precedence activation source per Set "
            "048 §3.1 (overrides env var DABBLER_NO_ROUTER and "
            "spec.md tier field)."
        ),
    )
    # Set 048 Session 2: --accept-suggestions forces non-interactive
    # behavior for the external-verification.md soft gate (Set 048
    # §3.5). Useful for batch / CI invocations that want the soft-
    # gate emit-to-stderr branch without a TTY prompt.
    p.add_argument(
        "--accept-suggestions",
        action="store_true",
        dest="accept_suggestions",
        help=(
            "Force non-interactive behavior for the external-"
            "verification.md soft gate (Set 048 §3.5). When the gate "
            "fires and this flag is set, the close-out emits a stderr "
            "warning and proceeds without prompting, regardless of "
            "TTY status."
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

    * ``--force`` bypasses the bookkeeping gates (but NOT the Set 083
      verification-integrity check — force bypasses gates, not
      evidence): incompatible with ``--interactive``
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
        * ``--manual-verify`` is the attested operator escape hatch — it
            bypasses the verification-evidence layer on the operator's word. The operator's
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

    Set 030 Session 3: routes through ``read_progress`` so this reader
    sees the v3 ``sessions[]`` ledger (or a synthesized view for legacy
    v2 files) rather than the raw legacy field. Mirrors the v2 "in
    flight OR most recently closed" semantic so idempotent close
    retries still produce a useful label.
    """
    state = read_session_state(session_set_dir)
    if not state:
        return None
    spec_md_path = os.path.join(session_set_dir, "spec.md")
    try:
        view = read_progress(state, spec_md_path)
    except (SessionStateInvariantError, TypeError, ValueError):
        return None
    if view.current_session is not None:
        return view.current_session
    if view.completed_sessions:
        return max(view.completed_sessions)
    return None


def _peek_orchestrator_identity(session_set_dir: str) -> dict:
    """Snapshot the orchestrator block's identity fields for the audit trail.

    The ``closeout_succeeded`` event payload carries ``engine``,
    ``provider``, and ``model`` alongside the existing ``method``
    field so a forensic walk of the events ledger can answer
    "who closed this session?" without consulting the snapshot.

    Returns a dict with keys ``engine``, ``provider``, ``model``.
    Missing or null fields land as ``None`` in the returned dict;
    callers feed the whole dict through ``**fields`` to
    ``append_event`` so the keys with None values still appear in the
    payload.

    Returns an empty dict when the state file is absent or the
    orchestrator block is missing (legacy state file, or a re-run
    against a set whose snapshot pre-dates per-session orchestrator
    metadata). In the empty-dict case, the audit payload has no
    orchestrator-identity component — the forensic value is degraded
    but the close itself still completes.

    Set 049: ``chatSessionId`` is no longer captured (P3 — field
    dropped from the on-disk shape and the writer code paths). Set
    033 Session 6's H1/H3 check-in semantic (nulling the orchestrator
    block on close) is also retired; under v4 the per-session
    orchestrator block on the closed session survives as a historical
    record.
    """
    state = read_session_state(session_set_dir) or {}
    orch = state.get("orchestrator") if isinstance(state, dict) else None
    if not isinstance(orch, dict):
        return {}
    return {
        "engine": orch.get("engine"),
        "provider": orch.get("provider"),
        "model": orch.get("model"),
    }


def _read_disposition_or_none(session_set_dir: str) -> Optional[Disposition]:
    """Return the parsed disposition, or None if the file is absent / malformed."""
    return read_disposition(session_set_dir)


def _resolve_lessons_cited(
    disposition: Optional[Disposition],
    repo_root: Optional[str] = None,
) -> Tuple[List[str], List[str]]:
    """Return ``(cited_ids, unknown_ids)`` from ``disposition.lessons_cited``.

    Set 064 D3: ``close_session`` records which guidance lessons the work
    agent cited so the ``closeout_succeeded`` event carries the audit
    trail. It also **validates** each id against the on-disk guidance
    files — an id present in no file is returned in *unknown_ids* and
    surfaced as a **non-blocking** mismatch (a typo'd citation must not
    fail close-out; the cite_lessons CLI is where a missing id has
    already been reported at commit time).

    Fail-open: any error discovering or reading the guidance files yields
    an empty *unknown_ids* (we never block a close on a metadata read).
    """
    if disposition is None or not disposition.lessons_cited:
        return [], []
    cited = list(disposition.lessons_cited)
    try:
        found = discover_guidance_files(repo_root)
        texts: List[str] = []
        for path in found.values():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    texts.append(f.read())
            except OSError:
                continue
        unknown = [
            lid
            for lid in cited
            if not any(find_entry(t, lid) is not None for t in texts)
        ]
    except Exception:
        # Never let a guidance-metadata read disrupt close-out.
        unknown = []
    return cited, unknown


def _close_is_terminal(session_set_dir: str, session_number: Optional[int]) -> bool:
    """Return True iff closing *session_number* finalizes the whole set.

    Set 057 Q6: the dedicated-verification close-out gate only fires on the
    **set-terminal** close (the close that brings ``completedSessions`` up
    to the runtime ``totalSessions``) — a non-terminal work-session close
    must not be blocked merely because the verification session has not run
    yet. Mirrors ``_flip_state_to_closed``'s own final-session detection
    (``len(completed-after-append) == totalSessions``).

    Best-effort and fail-open in the *non*-terminal direction: any read
    error returns ``False`` so the gate cannot wedge a close on a garbled
    or unusual state file.
    """
    if session_number is None:
        return False
    state = read_session_state(session_set_dir)
    if not state:
        return False
    spec_md_path = os.path.join(session_set_dir, "spec.md")
    try:
        view = read_progress(state, spec_md_path)
    except (SessionStateInvariantError, TypeError, ValueError):
        return False
    total = getattr(view, "total_sessions", None)
    if not isinstance(total, int) or total <= 0:
        return False
    completed = set(getattr(view, "completed_sessions", None) or [])
    completed.add(session_number)
    return len(completed) >= total


def resolve_close_verdict(disposition: Optional[Disposition]) -> Optional[str]:
    """Derive the close-session verdict from the disposition.

    Precedence (Q2 locked design):

    1. ``disposition.verification_verdict`` verbatim — wins even under
       ``--force`` (force bypasses gates, not evidence).
    2. ``api``-status-derived fallback — only when
       ``verification_method == "api"``:
       ``completed`` → ``"VERIFIED"``; ``failed`` / ``requires_review``
       → ``"ISSUES_FOUND"``.  A soft stderr note is printed so the
       operator can see which fallback fired.
    3. ``None`` — no verdict recorded (manual / skipped / --no-router /
       missing disposition).
    """
    if disposition is None:
        return None
    explicit = disposition.verification_verdict
    if explicit is not None and isinstance(explicit, str) and explicit != "":
        return explicit
    if disposition.verification_method == "api":
        if disposition.status == "completed":
            print(
                "NOTE: disposition has no explicit verification_verdict; "
                "deriving VERIFIED from api status=completed",
                file=sys.stderr,
            )
            return "VERIFIED"
        if disposition.status in ("failed", "requires_review"):
            print(
                "NOTE: disposition has no explicit verification_verdict; "
                f"deriving ISSUES_FOUND from api status={disposition.status!r}",
                file=sys.stderr,
            )
            return "ISSUES_FOUND"
    return None


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
    manual_verify: bool = False,
    extra_clean_ignore: Optional[List[str]] = None,
) -> List[GateResult]:
    """Run the deterministic gate checks against the session set.

    Each predicate from :data:`gate_checks.GATE_CHECKS` is invoked with
    the same three arguments. A predicate that raises is recorded as a
    failed gate with the exception text in the remediation — gates must
    not crash the close-out flow because a single buggy predicate could
    otherwise wedge every set in the repo. The wrapper preserves the
    declared order of :data:`gate_checks.GATE_CHECKS` so the JSON
    output's ``gate_results`` list is shape-stable across runs.

    ``manual_verify`` narrows the verification-integrity check (Set 083)
    to its vocabulary layer: ``--manual-verify`` is the sanctioned,
    attested, logged bypass of the EVIDENCE corroboration, but an
    illegal ``verification_method`` token still fails closed on every
    path (the S2 round-2 finding — an attested close must not persist
    the incident's retired token). The result row stays in the list so
    the JSON shape (and the audit trail of *why* it passed) is stable.

    ``extra_clean_ignore`` (Set 084 S2): paths the close backstop wrote
    mid-close (artifacts, issues envelope, the patched disposition).
    They are close-out bookkeeping — the same category as
    ``session-events.jsonl`` — tolerated by the working-tree gate for
    THIS close and committed in the follow-up close-out commit.
    """
    results: List[GateResult] = []
    for name, predicate in GATE_CHECKS:
        if manual_verify and name == VERIFICATION_INTEGRITY_CHECK_NAME:
            try:
                vocab_passed, vocab_remediation = (
                    check_verification_method_vocabulary(
                        session_set_dir,
                        disposition,
                        allow_empty_commit=allow_empty_commit,
                    )
                )
            except Exception as exc:  # pragma: no cover — defensive
                vocab_passed = False
                vocab_remediation = (
                    f"gate predicate raised {type(exc).__name__}: {exc}"
                )
            results.append(
                GateResult(
                    check=name,
                    passed=bool(vocab_passed),
                    remediation=(
                        vocab_remediation
                        if not vocab_passed
                        else (
                            "evidence corroboration bypassed by "
                            "--manual-verify (sanctioned, attested "
                            "override; attestation recorded in the events "
                            "ledger); method vocabulary still enforced"
                        )
                    ),
                )
            )
            continue
        try:
            predicate_kwargs = {"allow_empty_commit": allow_empty_commit}
            if extra_clean_ignore and name == "working_tree_clean":
                predicate_kwargs["extra_ignore_paths"] = extra_clean_ignore
            passed, remediation = predicate(
                session_set_dir,
                disposition,
                **predicate_kwargs,
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
        disposition_path = os.path.join(session_set_dir, "disposition.json")
        return [
            GateResult(
                check="disposition_present",
                passed=False,
                remediation=(
                    f"disposition.json is required for close-out at "
                    f"{disposition_path}. Required fields: status, summary, "
                    "verification_method, files_changed, next_orchestrator "
                    "(when status='completed' and not the final session), "
                    "blockers (when reason='switch-due-to-blocker'). "
                    "Schema: docs/disposition-schema.md "
                    "(or the Disposition dataclass in ai_router/disposition.py). "
                    "Pass force=True to bypass — incident-recovery only; "
                    "emits closeout_force_used event."
                ),
            )
        ]
    return _run_gate_checks(
        session_set_dir,
        disposition,
        allow_empty_commit=allow_empty_commit,
    )


# ---------------------------------------------------------------------------
# Repair stub
# ---------------------------------------------------------------------------

def _run_repair(
    session_set_dir: str,
    *,
    apply_changes: bool,
) -> tuple[bool, List[str]]:
    """Walk the session set's state and report (or fix) detectable drift.

    Returns ``(drift_detected, messages)``. ``drift_detected`` is True
    iff at least one drift case fired; ``messages`` is the
    human-readable narrative the repair branch surfaces in
    ``outcome.messages`` and prints to stdout.

    Drift cases detected (cross-checking
    ``session-events.jsonl`` ↔ ``session-state.json`` ↔
    ``disposition.json`` ↔ queue messages):

    1. **State-says-closed-but-no-closeout-event-for-``currentSession``.**
       ``session-state.json`` reports ``lifecycleState: closed`` (or v1
       ``status: complete``) but ``session-events.jsonl`` has no
       ``closeout_succeeded`` event for the session number that state
       claims is closed. Two real-world variants both reduce to this
       check:

         - *Bootstrapping-window drift.* The old Step 8 path committed
           without emitting terminal lifecycle events at all.
         - *Mixed-mode drift.* Earlier sessions in the set ran
           through ``close_session`` (events ledger has their
           closeouts) but a later session was hand-authored — the
           snapshot was edited directly to ``currentSession: N`` /
           ``status: complete`` without anyone running the gate for
           session ``N``. Observed 2026-05-12 on
           ``unified-master-details-composite``: snapshot claimed
           session 5 complete with VERIFIED verdict, ledger had
           closeouts for sessions 1-4 only. The older
           ``lifecycle != CLOSED`` check missed this case because
           the ledger's most-recent lifecycle was CLOSED (just for
           session 4, not session 5).

       Repair: with ``--apply``, append a synthetic
       ``closeout_requested`` (if missing) and ``closeout_succeeded``
       for the claimed-closed session so the events ledger is
       internally consistent, the reconciler stops considering the
       set "stranded", and the extension's tree-view guard stops
       downgrading the set to In Progress.

    2. **Closeout-succeeded-but-state-not-closed.** The reverse drift:
       events ledger says the session closed, but
       ``session-state.json`` is still ``work_in_progress`` /
       ``work_verified``. Repair: with ``--apply``, call
       ``mark_session_complete`` so the snapshot tracks the ledger.

    3. **Stranded mid-closeout** (``closeout_requested`` without a
       terminal companion). Reported only. Recovery is the
       reconciler's job (re-run the gate); ``--repair --apply`` does
       not re-run the gate from inside itself.

    Never modifies git state. Idempotent under repeat invocation: a
    set with no drift returns ``(False, ["repair: no drift detected"])``;
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
    # noqa: D13 - repair walk is a v2-compat path that reconciles legacy fields
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

    # Case 1: state says closed, but events have no closeout for the
    # session the state claims is closed. The trigger is session-number-
    # specific (per Set 020 Session 1, 2026-05-13): the older
    # ``lifecycle != CLOSED`` check matched the bootstrapping-window
    # variant but missed mixed-mode drift, where earlier sessions in the
    # set ran through close_session (so the most-recent lifecycle was
    # already CLOSED — for an earlier session) and a later session was
    # hand-authored. Both variants now reduce to "no closeout event for
    # state_session_number." If state_session_number is None (malformed
    # state file), fall back to the lifecycle check so the original
    # bootstrapping detection still fires.
    state_says_closed = (
        state_lifecycle == SessionLifecycleState.CLOSED.value
        or (state or {}).get("status") == "complete"
    )
    if state_session_number is not None:
        case1_drift = state_says_closed and not _has_event(
            "closeout_succeeded", state_session_number,
        )
    else:
        case1_drift = state_says_closed and lifecycle != SessionLifecycleState.CLOSED

    if case1_drift:
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

            # Set 022 + 023: backfill completedSessions[] as the UNION
            # of (a) the snapshot's existing array and (b) the
            # ``closeout_succeeded`` session numbers in the (now-
            # repaired) events ledger. The union is monotone-up:
            # repair adds session numbers to bring the snapshot up to
            # ledger reality, but never removes a session number the
            # operator hand-authored.
            #
            # We read ``closeout_succeeded`` events directly rather
            # than going through ``compute_effective_completed_sessions``
            # because the helper short-circuits on a non-empty snapshot
            # array and would miss the session we just synthesized.
            # Direct events read picks up the synthetic closeout; the
            # union then adds it to whatever the snapshot already had.
            #
            # Set 023 motivation: an operator hand-migrating a pre-
            # Set-022 set adds ``completedSessions=[1..N]`` to a
            # snapshot whose events ledger only ever recorded the
            # final session's closeout (or, as on Set 004 of this
            # repo, only an early session's closeout). The previous
            # overwrite-with-ledger-view regressed the operator's
            # count from ``[1..N]`` to a partial subset; the union
            # preserves the hand-authored intent while still healing
            # the ledger.
            events_now = read_events(session_set_dir)
            from_events = sorted({
                ev.session_number for ev in events_now
                if ev.event_type == "closeout_succeeded"
                and isinstance(ev.session_number, int)
                and not isinstance(ev.session_number, bool)
                and ev.session_number > 0
            })
            # noqa: D13 - repair walk is a v2-compat path that reconciles legacy fields
            existing_completed = (state or {}).get("completedSessions")
            # ``existing_clean`` is the sanitized view used for the
            # union math (drops non-int, booleans, non-positive).
            # ``existing_raw_list`` is the snapshot's literal value,
            # used to decide whether the *file on disk* needs a
            # rewrite — a malformed entry in the raw array (e.g.,
            # ``[1, -1]``) means the file is not already correct
            # even when ``existing_clean`` happens to equal
            # ``merged``, so the preserved/no-rewrite branch must
            # not fire. This is the round-1 verifier finding fix.
            existing_raw_list = (
                existing_completed
                if isinstance(existing_completed, list)
                else None
            )
            existing_clean = (
                sorted({
                    c for c in existing_completed
                    if isinstance(c, int)
                    and not isinstance(c, bool)
                    and c > 0
                })
                if isinstance(existing_completed, list)
                else []
            )
            merged = sorted(set(existing_clean) | set(from_events))
            # Rewrite the snapshot whenever the raw on-disk value
            # does not already equal the canonical merged form.
            # That covers three apply outcomes: backfilled (no array
            # before), merged (array existed but differed cleanly),
            # and normalized (array existed but had malformed /
            # duplicate / unsorted entries that need cleaning up).
            # Only the truly-equal case takes the no-rewrite branch.
            needs_rewrite = bool(merged) and existing_raw_list != merged
            if needs_rewrite:
                try:
                    state_path = os.path.join(
                        session_set_dir, "session-state.json"
                    )
                    # Use read_session_state() so a corrupt-or-missing
                    # snapshot does not crash the repair walk
                    # (read_session_state returns None on JSONDecodeError
                    # and missing files). Case 1 only fires when
                    # ``state_says_closed`` is True, which implies the
                    # file was readable at trigger time, but a
                    # concurrent writer or external mutation could
                    # break it between then and now — fall back to an
                    # empty dict and write a snapshot that records the
                    # merged completedSessions.
                    snapshot = read_session_state(session_set_dir) or {}
                    snapshot["completedSessions"] = merged
                    with open(state_path, "w", encoding="utf-8") as f:
                        json.dump(snapshot, f, indent=2)
                        f.write("\n")
                    # Distinguish three apply outcomes:
                    #   - "backfilled" — snapshot had no array at all
                    #   - "merged"     — snapshot had a clean array
                    #                    that differed cleanly from
                    #                    the union view
                    #   - "normalized" — snapshot's array had
                    #                    malformed / duplicate /
                    #                    unsorted entries that we
                    #                    cleaned up while also
                    #                    applying the union
                    if existing_raw_list is None or existing_raw_list == []:
                        messages.append(
                            "repair applied: backfilled "
                            f"completedSessions={merged} into "
                            "session-state.json"
                        )
                    elif existing_raw_list == existing_clean:
                        # Clean input, just augmented by the events
                        # reconstruction.
                        messages.append(
                            "repair applied: merged "
                            f"completedSessions={merged} into "
                            "session-state.json (union of snapshot "
                            f"{existing_clean} and events "
                            f"{from_events})"
                        )
                    else:
                        # Malformed or unsorted input. Report both
                        # the raw existing and the cleaned merged so
                        # the operator sees what was normalized away.
                        messages.append(
                            "repair applied: normalized "
                            f"completedSessions={merged} into "
                            "session-state.json (raw snapshot "
                            f"{existing_raw_list} cleaned + unioned "
                            f"with events {from_events})"
                        )
                except Exception as exc:  # pragma: no cover — defensive
                    messages.append(
                        f"repair could not backfill completedSessions[]: "
                        f"{type(exc).__name__}: {exc}"
                    )
            elif merged and existing_raw_list == merged and from_events:
                # Snapshot's array already covers everything the
                # ledger reconstruction would add AND its raw on-disk
                # form is exactly the canonical merged value — no
                # rewrite needed. Surface this as a distinct outcome
                # so an operator who hand-migrated a set sees that
                # their array was preserved verbatim.
                messages.append(
                    "repair preserved completedSessions="
                    f"{merged} in session-state.json "
                    "(snapshot already a superset of the events-"
                    "ledger reconstruction)"
                )

    # Case 2: events say closed, state has not caught up.
    #
    # Set 022 narrows the trigger: under the new completedSessions[]
    # invariant, "state has not caught up" means specifically that the
    # currentSession's closeout event exists in the ledger but the
    # snapshot's ``completedSessions[]`` does not record it. The
    # pre-Set-022 trigger (``lifecycle == CLOSED and not
    # state_says_closed``) conflated session-level closedness with
    # set-level completion, which broke idempotency for mid-set
    # close-outs: _flip_state_to_closed (Set 022) no longer flips the
    # SET to complete on a mid-set session, so the snapshot's
    # ``status`` stays in-progress while ``completedSessions`` grows.
    # The narrower trigger fires exactly once per drifted session and
    # stops firing once the helper has recorded the closure.
    #
    # Known gap (deferred): a distinct "set-finalization lag" — events
    # show closeouts for ALL totalSessions sessions and the snapshot
    # already has them in completedSessions[], but ``status`` is still
    # ``in-progress`` despite a present ``change-log.md`` — is not
    # detected here. _flip_state_to_closed writes status and
    # completedSessions atomically in one file write, so this drift
    # only occurs from external hand-edits or a crash mid-write. If it
    # surfaces in practice, add a third repair branch that calls
    # _flip_state_to_closed when len(completedSessions)==totalSessions
    # and change-log.md is present and ``status != complete``.
    # noqa: D13 - repair walk is a v2-compat path that reconciles legacy fields
    completed_in_state = [
        c for c in ((state or {}).get("completedSessions") or [])
        if isinstance(c, int)
        and not isinstance(c, bool)
        and c > 0
    ]
    session_closeout_lag = (
        state_session_number is not None
        and _has_event("closeout_succeeded", state_session_number)
        and state_session_number not in completed_in_state
    )
    if (
        not case1_drift
        and lifecycle == SessionLifecycleState.CLOSED
        and not state_says_closed
        and session_closeout_lag
    ):
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

    # Case 3 (queue-message reference drift) was removed in Set 026
    # Session 1 along with the rest of the queue-mediated daemon path —
    # ``disposition.verification_method == "queue"`` is no longer a
    # valid value, so the previous repair branch is unreachable.

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

def _resolve_no_router_for_run(
    args: argparse.Namespace,
    session_set_dir: str,
) -> bool:
    """Resolve the effective --no-router mode for this close-out.

    Set 077 S4 (A3 root cause, S1 bundle D Critical): ``main()``
    resolved ``resolve_no_router_mode(...)`` and **discarded the return
    value**, so every ``getattr(args, "no_router")`` branch in
    :func:`run` — the soft gate, the stock manual attestation, and the
    ``method="manual"`` selection — was dead for sets whose Lightweight
    mode comes from ``spec.md`` (``tier: lightweight``) or the
    ``DABBLER_NO_ROUTER`` env var rather than the raw CLI flag. This
    helper is the single resolution point :func:`run` consults;
    ``resolve_no_router_mode`` caches, so the ``main()`` entry-point
    resolution and this call agree within one process.

    Errors are surfaced (stderr note), never swallowed silently, and
    never fatal: on failure the raw CLI flag is the fallback — exactly
    the pre-Set-077 behavior.
    """
    cli_flag = bool(getattr(args, "no_router", False))
    if cli_flag:
        # The explicit CLI flag is the highest-precedence source and is
        # unambiguous on its own — return it directly rather than
        # consulting the resolver, whose module-level cache could have
        # been populated False by an earlier same-process resolution
        # (API callers like the reconciler and the test suite invoke
        # run() without a fresh process per invocation).
        return True
    try:
        # runtime_mode is a Set 048 module: bare imports are forbidden
        # (test_production_imports — they silently no-op under
        # pip-install). Relative resolves in the package context
        # (pip-install, `python -m ai_router.close_session`);
        # package-absolute is the fallback for the top-level-module
        # context the test harness imports this file under.
        try:
            from .runtime_mode import (
                _env_var_truthy,
                _spec_says_lightweight,
            )
        except ImportError:
            from ai_router.runtime_mode import (  # type: ignore[no-redef]
                _env_var_truthy,
                _spec_says_lightweight,
            )

        # Same precedence as resolve_no_router_mode (env var, then the
        # spec's tier), computed directly against THIS set — the
        # resolver's module-level cache is deliberately not consulted,
        # because a multi-set process (the reconciler sweep, pytest)
        # would otherwise pin every later set to the first set's
        # resolution.
        return _env_var_truthy() or _spec_says_lightweight(
            Path(session_set_dir)
        )
    except Exception as exc:  # noqa: BLE001
        print(
            "WARNING: --no-router mode resolution failed "
            f"({exc.__class__.__name__}: {exc}); falling back to the raw "
            "CLI flag. A spec/env-activated Lightweight set may not get "
            "its soft gate this close.",
            file=sys.stderr,
        )
        return cli_flag


def run(
    args: argparse.Namespace,
    *,
    prompt_fn: Callable[[str], str] = input,
) -> CloseoutOutcome:
    """Execute the close-out flow for the given parsed args.

    Composed so callers (the reconciler, integration tests) can build
    an ``argparse.Namespace`` directly and skip the CLI parsing layer.
    Returns the :class:`CloseoutOutcome` rather than calling
    ``sys.exit`` so callers can inspect / re-emit it.
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
    # Snapshot the orchestrator identity before the close-out flow
    # runs so the ``closeout_succeeded`` event below carries
    # engine/provider/model in its audit payload. Under v4 the
    # per-session orchestrator block survives the close (it's a
    # historical record, not a check-out flag), so re-reads after the
    # flip would still see it; the pre-flip read is kept for the
    # symmetry with the events ledger's "wrote this at close-out
    # time" contract.
    orchestrator_identity = _peek_orchestrator_identity(session_set_dir)

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

    # Set 077 S4 (A3): resolve the effective Lightweight mode ONCE and
    # thread it through every branch below. The raw ``args.no_router``
    # flag misses spec/env-activated Lightweight sets. Sits below the
    # repair/idempotency short-circuits — those paths never consume it.
    no_router = _resolve_no_router_for_run(args, session_set_dir)

    disposition = _read_disposition_or_none(session_set_dir)

    # ``--force`` accepts a missing disposition. By the time we reach
    # this branch ``_validate_args`` has confirmed ``--force`` is
    # opted-in via ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1`` and
    # ``--reason-file`` is supplied (Set 9 Session 3, D-2 hard-scoping).
    # In the normal path, refuse: the disposition is the structured
    # handoff the close-out script reads to know what was done and how
    # it was verified.
    if disposition is None and not args.force:
        disposition_path = os.path.join(session_set_dir, "disposition.json")
        outcome.result = "invalid_invocation"
        outcome.messages.append(
            f"disposition.json is required at {disposition_path}. "
            "Required fields: status, summary, verification_method, "
            "files_changed, next_orchestrator (when status='completed' "
            "and not the final session), blockers (when "
            "reason='switch-due-to-blocker'). Schema: "
            "docs/disposition-schema.md (or the Disposition dataclass in "
            "ai_router/disposition.py). Pass --force to bypass — "
            "incident-recovery use only; see ai_router/docs/close-out.md "
            "Section 5."
        )
        return outcome

    # Resolve the verification verdict from the disposition now —
    # before any events are emitted — so every downstream emitter
    # (closeout_succeeded, verification_completed) and the snapshot
    # flip all use the same resolved value.
    verdict: Optional[str] = resolve_close_verdict(disposition)

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
    # Set 048 Session 2: --no-router treats the close-out as manual-
    # attestation by construction (Lightweight tier skips routed
    # verification per §3.1 A3). The attestation comes from
    # --reason-file when provided; absent that, a stock attestation
    # documents that Lightweight mode is active so the audit trail
    # still records what happened.
    if no_router and not args.manual_verify:
        if reason_text is not None:
            manual_attestation = reason_text
        else:
            manual_attestation = (
                "Set 048 Lightweight tier (--no-router mode): "
                "routed verification skipped per §3.1 A3. "
                "Operator runs external verification via copyable-"
                "prompt commands."
            )
    elif args.manual_verify:
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
        # Set 077 S4 (S1 bundle D, TOCTOU): re-check idempotency INSIDE
        # the lock. The pre-lock check above races with a concurrent
        # close_session that completes between our check and our
        # acquire; without this re-check we would emit a duplicate
        # closeout_requested event and re-run gates against an
        # already-closed session.
        if _is_already_closed(session_set_dir):
            outcome.result = "noop_already_closed"
            outcome.messages.append(
                "session was closed by a concurrent close-out between "
                "the idempotency check and lock acquisition; no-op"
            )
            return outcome

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
                "WARNING: --force bypassed the bookkeeping close-out gates "
                "(incident-recovery only). The verification-integrity "
                "check still runs — force bypasses gates, not evidence "
                "(Set 083). The closeout_force_used event has been "
                "emitted with the operator's reason; session-state.json "
                "will record forceClosed=true on the next snapshot flip."
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

        # Set 084 S2 — the close backstop (the structural move). On a
        # Full-tier close with no valid stamped verification evidence,
        # the framework runs Step 6 itself, in-process, through the
        # same F1/F2/F3 machinery as verify_session, and its verdict
        # governs: proceed on VERIFIED (the fresh stamped row satisfies
        # the evidence gate below), refuse with the findings on a
        # blocking ISSUES_FOUND, block explicitly on
        # verification_unavailable / provider failure — never a pass.
        # Scope: the normal close path only. --manual-verify is the
        # attested operator bypass; --force bypasses bookkeeping gates
        # (the verification-integrity check still refuses an
        # unverified force-close, so the floor holds without metering
        # a surprise call on the incident-recovery path); Lightweight
        # closes have their own per-set gates; the zero-budget tier is
        # honored inside the backstop itself.
        backstop_written_paths: List[str] = []
        if not args.force and not args.manual_verify and not no_router:
            try:
                from close_backstop import (  # type: ignore[import-not-found]
                    BACKSTOP_CHECK_NAME,
                    STATUS_BLOCKING,
                    STATUS_IDENTITY_UNRESOLVABLE,
                    STATUS_ROUTE_FAILED,
                    STATUS_UNAVAILABLE,
                    STATUS_VERIFIED,
                    run_close_backstop,
                )
            except ImportError:
                from .close_backstop import (  # type: ignore[no-redef]
                    BACKSTOP_CHECK_NAME,
                    STATUS_BLOCKING,
                    STATUS_IDENTITY_UNRESOLVABLE,
                    STATUS_ROUTE_FAILED,
                    STATUS_UNAVAILABLE,
                    STATUS_VERIFIED,
                    run_close_backstop,
                )

            backstop = run_close_backstop(
                session_set_dir, outcome.session_number, disposition,
            )
            outcome.messages.extend(backstop.messages)
            if backstop.status in (
                STATUS_BLOCKING,
                STATUS_UNAVAILABLE,
                STATUS_ROUTE_FAILED,
                STATUS_IDENTITY_UNRESOLVABLE,
            ):
                outcome.result = "gate_failed"
                outcome.gate_results = [
                    GateResult(
                        check=BACKSTOP_CHECK_NAME,
                        passed=False,
                        remediation=backstop.remediation,
                    )
                ]
                outcome.messages.append(
                    f"gate {BACKSTOP_CHECK_NAME} failed: "
                    f"{backstop.remediation}"
                )
                _emit_event(
                    session_set_dir,
                    "closeout_failed",
                    outcome.session_number,
                    outcome,
                    failed_checks=[BACKSTOP_CHECK_NAME],
                    backstop_status=backstop.status,
                )
                return outcome
            if backstop.status == STATUS_VERIFIED:
                # The backstop's artifacts + disposition patch are
                # close-out bookkeeping written mid-close (the
                # session-events.jsonl precedent): the working-tree
                # gate tolerates them for THIS close, and the operator
                # commits them in the close-out commit.
                backstop_written_paths = list(backstop.written_paths)
                disposition = _read_disposition_or_none(session_set_dir)
                verdict = resolve_close_verdict(disposition)
                _emit_event(
                    session_set_dir,
                    "verification_completed",
                    outcome.session_number,
                    outcome,
                    method="api",
                    source="close_session_backstop",
                    verdict=verdict,
                )

        # Resolve the verification method from disposition + flags.
        # Set 026 Session 1 removed the queue path; this is now a
        # synchronous resolution. ``--manual-verify`` is the
        # operator-attestation path; otherwise we honor
        # ``disposition.verification_method`` (``api`` /
        # ``manual-via-other-engine`` / ``skipped`` — Set 083 vocabulary).
        if args.force:
            # Force bypasses bookkeeping gates, not evidence (Set 083):
            # when the disposition declares a legal method, the audit
            # record reflects it verbatim — the verification-integrity
            # check above this close has corroborated any claimed
            # verdict on that method, so recording "skipped" would
            # falsify the trail (S2 round-3 finding). Only a force
            # close with no usable disposition method falls back to
            # "skipped".
            if (
                disposition is not None
                and disposition.verification_method in VERIFICATION_METHODS
            ):
                method = disposition.verification_method
            else:
                method = "skipped"
        elif args.manual_verify:
            method = "manual"
        elif no_router:
            # Set 048 Session 2 §3.1 A3: Lightweight tier skips routed
            # verification. Method records as "manual" so the events
            # ledger + state file converge with the existing manual
            # attestation path; the attestation text (set above)
            # documents the --no-router invocation explicitly.
            method = "manual"
        elif disposition is not None and disposition.verification_method:
            method = disposition.verification_method
        else:
            method = "skipped"
        outcome.verification_method = method

        # Manual-verify path: emit a ``verification_completed`` event
        # carrying the operator attestation so the audit trail records
        # the verification decision rather than jumping straight from
        # ``closeout_requested`` to ``closeout_succeeded``.
        if method == "manual" and manual_attestation is not None:
            vc_fields: dict = {
                "method": "manual",
                "attestation": manual_attestation,
            }
            if verdict is not None:
                vc_fields["verdict"] = verdict
            _emit_event(
                session_set_dir,
                "verification_completed",
                outcome.session_number,
                outcome,
                **vc_fields,
            )

        # Gate checks. ``--force`` skips the bookkeeping gates but NOT the
        # verification-integrity check (Set 083): force bypasses gates,
        # not evidence — an uncorroborated claimed verdict is refused even
        # on the incident-recovery path. ``--manual-verify`` is that
        # check's only sanctioned bypass, and it bypasses the EVIDENCE
        # layer only — the method-vocabulary rule still runs (an attested
        # close must not persist an illegal token; S2 round-2 finding).
        if args.force:
            try:
                vi_passed, vi_remediation = check_verification_integrity(
                    session_set_dir,
                    disposition,
                    allow_empty_commit=args.allow_empty_commit,
                )
            except Exception as exc:  # pragma: no cover — defensive
                vi_passed = False
                vi_remediation = (
                    f"gate predicate raised {type(exc).__name__}: {exc}"
                )
            outcome.gate_results = [
                GateResult(
                    check=VERIFICATION_INTEGRITY_CHECK_NAME,
                    passed=bool(vi_passed),
                    remediation=vi_remediation,
                )
            ]
        else:
            outcome.gate_results = _run_gate_checks(
                session_set_dir,
                disposition,
                allow_empty_commit=args.allow_empty_commit,
                manual_verify=bool(args.manual_verify),
                extra_clean_ignore=backstop_written_paths,
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

        # The dedicated_verification imports serve BOTH the Set 077 A8
        # stand-down inside the soft gate below and the Set 057 Q6 gate
        # that follows, so the import lives above both.
        try:
            from dedicated_verification import (  # type: ignore[import-not-found]
                VERIFICATION_MODE_DEDICATED,
                read_verification_mode,
                validate_dedicated_verification,
            )
        except ImportError:
            from .dedicated_verification import (  # type: ignore[no-redef]
                VERIFICATION_MODE_DEDICATED,
                read_verification_mode,
                validate_dedicated_verification,
            )

        # Set 077 S4 (S1 bundle D): the set-terminal predicate is
        # computed ONCE for the whole gate chain — the dedicated-
        # verification, path-aware-critique, and contract gates all key
        # on the same value, and re-deriving it three times invited
        # drift between the gates within a single close.
        close_is_terminal = _close_is_terminal(
            session_set_dir, outcome.session_number
        )

        # Set 048 Session 2 §3.5: external-verification.md soft gate,
        # reworked in Set 077 S4 (A3/A4/A8):
        #   * keys off the RESOLVED Lightweight mode (``no_router``
        #     above), so spec/env-activated Lightweight sets get the
        #     gate too — not only raw ``--no-router`` invocations (A3);
        #   * STANDS DOWN when the recorded ``verificationMode`` is
        #     ``dedicated-sessions`` — there the Set 057 Q6 typed-
        #     session gate below is the authority, and double-gating
        #     produced contradictory correctives (A8). The stand-down
        #     keys off ``read_verification_mode`` (the durable
        #     activity-log record, same source the Q6 gate uses);
        #   * content-aware but still SOFT (A4): an empty file, an
        #     unreadable file, or one with no recognizable verdict line
        #     (per ``ai_router.external_verification``) gets the same
        #     soft prompt/warn as absence. Posture is unchanged:
        #     --accept-suggestions or no TTY warns and proceeds; an
        #     interactive TTY prints the corrective guidance FIRST,
        #     then prompts "[y/N]".
        # Set 048 keeps this OUT of the gate_checks framework because
        # gate_checks contract is deterministic / non-interactive; the
        # soft gate is by-design interactive.
        if no_router:
            dv_mode_dedicated = False
            try:
                dv_mode_dedicated = (
                    read_verification_mode(session_set_dir)
                    == VERIFICATION_MODE_DEDICATED
                )
            except Exception:  # noqa: BLE001
                dv_mode_dedicated = False
            if dv_mode_dedicated:
                outcome.messages.append(
                    "external-verification.md soft gate stood down: the "
                    "recorded verificationMode is dedicated-sessions, so "
                    "the typed-session close-out gate is the authority "
                    "(Set 077 A8)."
                )
            else:
                ext_verify_path = os.path.join(
                    session_set_dir, "external-verification.md"
                )
                gate_problem: Optional[str] = None
                if not os.path.exists(ext_verify_path):
                    gate_problem = (
                        f"external-verification.md missing at "
                        f"{ext_verify_path}"
                    )
                else:
                    # Same dual-context pattern as runtime_mode above
                    # (the parser is on the pip-installed Lightweight
                    # close path, so a bare import is forbidden).
                    try:
                        from .external_verification import (
                            VERDICT_ISSUES_FOUND,
                            VERDICT_WAIVED,
                            parse_external_verification,
                        )
                    except ImportError:
                        from ai_router.external_verification import (  # type: ignore[no-redef]
                            VERDICT_ISSUES_FOUND,
                            VERDICT_WAIVED,
                            parse_external_verification,
                        )
                    try:
                        with open(
                            ext_verify_path, "r", encoding="utf-8"
                        ) as f:
                            ext_text = f.read()
                    except (OSError, UnicodeError) as exc:
                        gate_problem = (
                            f"external-verification.md at "
                            f"{ext_verify_path} is unreadable "
                            f"({exc.__class__.__name__})"
                        )
                    else:
                        parsed = parse_external_verification(ext_text)
                        if not parsed.has_recognizable_verdict:
                            gate_problem = (
                                f"external-verification.md at "
                                f"{ext_verify_path} has no recognizable "
                                f"verdict line (empty or template-only)"
                            )
                        elif parsed.is_specification_scope:
                            # Set 077 S4 (code-review auto-verify Major):
                            # a spec review runs BEFORE the work exists —
                            # its verdict reviews the plan, not delivered
                            # work, and must not launder the gate.
                            gate_problem = (
                                f"external-verification.md at "
                                f"{ext_verify_path} records only a "
                                f"specification review (latest round "
                                f"{parsed.round or 1}, Scope: "
                                f"specification) — no work-review "
                                f"verdict is recorded"
                            )
                        elif parsed.verdict == VERDICT_WAIVED:
                            outcome.messages.append(
                                "external-verification.md verdict: WAIVED "
                                f"(round {parsed.round or 1}) — reason: "
                                f"{parsed.waive_reason}"
                            )
                        elif parsed.verdict == VERDICT_ISSUES_FOUND:
                            # Recorded evidence exists, so the gate is
                            # satisfied — but say out loud that the
                            # latest round leaves remediation owed so a
                            # terminal close over open issues is a
                            # visible decision, not an oversight.
                            note = (
                                "NOTE: external-verification.md latest "
                                f"round ({parsed.round or 1}) verdict is "
                                "ISSUES_FOUND — remediation/response is "
                                "still owed. Closing is allowed (soft "
                                "gate), but review the open findings."
                            )
                            print(note, file=sys.stderr)
                            outcome.messages.append(note)
                        else:
                            outcome.messages.append(
                                "external-verification.md verdict: "
                                f"VERIFIED (round {parsed.round or 1})"
                            )
                if gate_problem is not None:
                    non_interactive = bool(
                        getattr(args, "accept_suggestions", False)
                    ) or not sys.stdin.isatty()
                    guidance = (
                        f"{gate_problem} (Lightweight mode). To produce "
                        f"a verdict: in the Dabbler 'Session Sets' view, "
                        f"right-click the set row -> Copy Prompt -> "
                        f"Evaluate Session Set (or Evaluate Most Recent "
                        f"Session mid-set) and paste it into a path-aware "
                        f"AI assistant on a DIFFERENT provider than the "
                        f"one that did the work; the prompt instructs the "
                        f"reviewing engine to write its verdict into this "
                        f"file itself (canonical instructions: "
                        f"docs/dabbler/cross-provider-verification.md). "
                        f"Per Set 048 section 3.5 this is a soft gate, "
                        f"not a hard failure."
                    )
                    if non_interactive:
                        print(f"WARNING: {guidance}", file=sys.stderr)
                        outcome.messages.append(guidance)
                    else:
                        # Set 077 S4 (S1 bundle D Minor): the corrective
                        # guidance prints BEFORE the [y/N] prompt so the
                        # operator decides with the remediation path in
                        # front of them, not after aborting to find it.
                        print(f"NOTE: {guidance}", file=sys.stderr)
                        prompt = (
                            f"{gate_problem}. Continue closing session "
                            f"without a recorded verification verdict? "
                            f"[y/N]: "
                        )
                        answer = (prompt_fn(prompt) or "").strip().lower()
                        if answer not in ("y", "yes"):
                            outcome.result = "aborted_at_soft_gate"
                            outcome.messages.append(
                                "close-out aborted by operator at the "
                                "external-verification.md soft gate "
                                "(Set 048 §3.5); create the artifact and "
                                "re-run, or pass --accept-suggestions to "
                                "bypass non-interactively."
                            )
                            _emit_event(
                                session_set_dir,
                                "closeout_failed",
                                outcome.session_number,
                                outcome,
                                failed_checks=[
                                    "external_verification_soft_gate"
                                ],
                            )
                            return outcome
                        outcome.messages.append(
                            "operator confirmed close-out without "
                            "external-verification.md at the soft gate "
                            "(Set 048 §3.5)"
                        )

        # Set 057 Q6 close-out gate (validator landed S2; gate STRENGTH
        # wired here in S3). When verificationMode=dedicated-sessions, the
        # content-aware close-time validator confirms a *different-engine*
        # verification session ran before the SET-TERMINAL close. Operator
        # decision (engines split): HARD-block in an interactive TTY (refuse
        # the close, print corrective), SOFT-warn in non-TTY / headless or
        # under --accept-suggestions (mirrors the established soft posture of
        # the external-verification.md gate while strengthening the
        # interactive path). The gate fires ONLY on the set-terminal close —
        # a non-terminal work-session close is never blocked for "no
        # verification yet". Fail-open in the non-block direction: any
        # internal error here never wedges close-out. D3 is left unchanged
        # (content-blind, inert on Lightweight); this validator + the
        # blessed writers are the enforcement surface (see spec S1 Audit
        # Lock -> Concrete defect).
        dv_gate_failed = False
        dv_detail = ""
        try:
            if (
                read_verification_mode(session_set_dir) == VERIFICATION_MODE_DEDICATED
                and close_is_terminal
            ):
                dv = validate_dedicated_verification(
                    session_set_dir,
                    closing_session_number=outcome.session_number,
                )
                if dv.applicable and not dv.ok:
                    dv_detail = f"{dv.reason} {dv.corrective}".strip()
                    non_interactive = bool(
                        getattr(args, "accept_suggestions", False)
                    ) or not sys.stdin.isatty()
                    if non_interactive:
                        soft = (
                            "WARNING (Set 057 dedicated-sessions soft gate, "
                            f"non-TTY/--accept-suggestions): {dv_detail}"
                        )
                        print(soft, file=sys.stderr)
                        outcome.messages.append(soft)
                    else:
                        dv_gate_failed = True
        except Exception:
            dv_gate_failed = False
        if dv_gate_failed:
            outcome.result = "gate_failed"
            outcome.messages.append(
                "gate dedicated_verification failed (Set 057 Q6, "
                f"hard-TTY): {dv_detail} Pass --accept-suggestions to "
                "bypass non-interactively (incident/headless only)."
            )
            _emit_event(
                session_set_dir,
                "closeout_failed",
                outcome.session_number,
                outcome,
                failed_checks=["dedicated_verification_gate"],
            )
            return outcome

        # Set 066 S2 path-aware-critique close-out gate (net-new, tier-
        # ORTHOGONAL). When the durable ``pathAwareCritique`` record is
        # ``advisory`` or ``required``, confirm a valid multi-provider
        # critique artifact exists at the SET-TERMINAL close. Posture mirrors
        # the Set 057 Q6 split for ``required`` (HARD-block in an interactive
        # TTY, SOFT-warn non-TTY / headless / --accept-suggestions);
        # ``advisory`` ALWAYS soft-warns and never blocks; ``none`` skips
        # entirely. This is NET-NEW wiring reaching the Full-tier close path:
        # the dedicated_verification gate above is Lightweight-only (it gates
        # on verificationMode), so this attribute could not reuse it (Set 066
        # spec Erratum). Fires ONLY on the set-terminal close, and fail-open
        # in the non-block direction — any internal error here never wedges
        # close-out.
        pac_gate_failed = False
        pac_detail = ""
        # The module import lives INSIDE the broad fail-open guard (a
        # deliberate strengthening over the Set 057 dedicated_verification
        # block, which imports before its guard): the "any internal error
        # never wedges close-out" contract must also cover a non-ImportError
        # failure during module import/initialization, not only the
        # bare-vs-relative ImportError shim. S2 verifier Major.
        try:
            try:
                from path_aware_critique import (  # type: ignore[import-not-found]
                    PATH_AWARE_CRITIQUE_NONE,
                    PATH_AWARE_CRITIQUE_REQUIRED,
                    path_aware_critique_record_unreadable,
                    read_path_aware_critique,
                    validate_path_aware_critique_gate,
                )
            except ImportError:
                from .path_aware_critique import (  # type: ignore[no-redef]
                    PATH_AWARE_CRITIQUE_NONE,
                    PATH_AWARE_CRITIQUE_REQUIRED,
                    path_aware_critique_record_unreadable,
                    read_path_aware_critique,
                    validate_path_aware_critique_gate,
                )
            pac_level = read_path_aware_critique(session_set_dir)
            # Set 077 S4: reuse the gate chain's compute-once terminal
            # predicate rather than re-deriving it per gate.
            pac_is_terminal = close_is_terminal
            # A corrupt/unreadable activity-log silently collapses the durable
            # policy to ``none`` (read_path_aware_critique never raises), which
            # would let a set that opted into ``required`` close as if it had
            # no gate. Surface that as a loud, non-blocking warning at the
            # set-terminal close rather than disarming silently (GPT-5.4
            # path-aware critique, S3 dogfood). Warning, not a hard block: the
            # gate's "any internal error never wedges close-out" contract
            # stands; the fix removes the *silence*, not the fail-open posture.
            if pac_is_terminal and path_aware_critique_record_unreadable(
                session_set_dir
            ):
                warn = (
                    "WARNING (Set 066 path-aware-critique): activity-log.json "
                    "exists but could not be parsed, so the pathAwareCritique "
                    "policy could not be read; if this set opted into "
                    "'advisory' or 'required', its close-out gate could NOT be "
                    "verified. Repair the activity log and re-run close_session."
                )
                print(warn, file=sys.stderr)
                outcome.messages.append(warn)
            if (
                pac_level != PATH_AWARE_CRITIQUE_NONE
                and pac_is_terminal
            ):
                pac = validate_path_aware_critique_gate(session_set_dir)
                if pac.applicable and not pac.ok:
                    pac_detail = f"{pac.reason} {pac.corrective}".strip()
                    if pac_level == PATH_AWARE_CRITIQUE_REQUIRED:
                        non_interactive = bool(
                            getattr(args, "accept_suggestions", False)
                        ) or not sys.stdin.isatty()
                        if non_interactive:
                            soft = (
                                "WARNING (Set 066 path-aware-critique soft "
                                "gate, non-TTY/--accept-suggestions): "
                                f"{pac_detail}"
                            )
                            print(soft, file=sys.stderr)
                            outcome.messages.append(soft)
                        else:
                            pac_gate_failed = True
                    else:
                        # advisory: never blocks; always soft-warns so a
                        # missing/invalid artifact is visible at close.
                        soft = (
                            "WARNING (Set 066 path-aware-critique advisory): "
                            f"{pac_detail}"
                        )
                        print(soft, file=sys.stderr)
                        outcome.messages.append(soft)
        except Exception:
            pac_gate_failed = False
        if pac_gate_failed:
            outcome.result = "gate_failed"
            outcome.messages.append(
                "gate path_aware_critique failed (Set 066, hard-TTY): "
                f"{pac_detail} Pass --accept-suggestions to bypass "
                "non-interactively (incident/headless only)."
            )
            _emit_event(
                session_set_dir,
                "closeout_failed",
                outcome.session_number,
                outcome,
                failed_checks=["path_aware_critique_gate"],
            )
            return outcome

        # Set 068 S5 contract-test / CDC gate (net-new, tier-ORTHOGONAL). When
        # the durable ``contractGate`` record is ``advisory`` or ``required``,
        # confirm a valid contract manifest + a PASSING, identity-matched contract
        # floor result exists at the SET-TERMINAL close, with every probeable
        # defect class covered by a contract test (the deterministic floor that
        # Experiment A's H4 supports; the residual is reserved for the path-aware
        # critique). Posture MIRRORS the Set 066 path-aware gate exactly:
        # ``required`` HARD-blocks in an interactive TTY, SOFT-warns
        # non-TTY/headless/--accept-suggestions; ``advisory`` ALWAYS soft-warns;
        # ``none`` skips. Fires ONLY on the set-terminal close, and fail-open in
        # the non-block direction - any internal error here never wedges close-out
        # (the module import lives INSIDE the broad guard, like the Set 066 block).
        contract_gate_failed = False
        contract_detail = ""
        try:
            try:
                from contract_gate import (  # type: ignore[import-not-found]
                    CONTRACT_GATE_NONE,
                    CONTRACT_GATE_REQUIRED,
                    contract_gate_record_unreadable,
                    read_contract_gate,
                    validate_contract_gate,
                )
            except ImportError:
                from .contract_gate import (  # type: ignore[no-redef]
                    CONTRACT_GATE_NONE,
                    CONTRACT_GATE_REQUIRED,
                    contract_gate_record_unreadable,
                    read_contract_gate,
                    validate_contract_gate,
                )
            contract_level = read_contract_gate(session_set_dir)
            # Set 077 S4: reuse the gate chain's compute-once terminal
            # predicate rather than re-deriving it per gate.
            contract_is_terminal = close_is_terminal
            # A corrupt/unreadable activity-log silently collapses the durable
            # policy to ``none`` (read_contract_gate never raises), which would
            # let a set that opted into ``required`` close as if it had no gate.
            # Surface that as a loud, non-blocking warning at the set-terminal
            # close rather than disarming silently (mirrors the Set 066 S3
            # dogfood fix). Warning, not a hard block: the fail-open posture
            # stands; the fix removes the *silence*.
            if contract_is_terminal and contract_gate_record_unreadable(
                session_set_dir
            ):
                warn = (
                    "WARNING (Set 068 contract-gate): activity-log.json exists "
                    "but could not be parsed, so the contractGate policy could "
                    "not be read; if this set opted into 'advisory' or "
                    "'required', its close-out gate could NOT be verified. "
                    "Repair the activity log and re-run close_session."
                )
                print(warn, file=sys.stderr)
                outcome.messages.append(warn)
            if (
                contract_level != CONTRACT_GATE_NONE
                and contract_is_terminal
            ):
                cg = validate_contract_gate(session_set_dir)
                if cg.applicable and not cg.ok:
                    contract_detail = f"{cg.reason} {cg.corrective}".strip()
                    if contract_level == CONTRACT_GATE_REQUIRED:
                        non_interactive = bool(
                            getattr(args, "accept_suggestions", False)
                        ) or not sys.stdin.isatty()
                        if non_interactive:
                            soft = (
                                "WARNING (Set 068 contract-gate soft gate, "
                                "non-TTY/--accept-suggestions): "
                                f"{contract_detail}"
                            )
                            print(soft, file=sys.stderr)
                            outcome.messages.append(soft)
                        else:
                            contract_gate_failed = True
                    else:
                        # advisory: never blocks; always soft-warns so a
                        # missing/invalid/non-passing floor is visible at close.
                        soft = (
                            "WARNING (Set 068 contract-gate advisory): "
                            f"{contract_detail}"
                        )
                        print(soft, file=sys.stderr)
                        outcome.messages.append(soft)
        except Exception:
            contract_gate_failed = False
        if contract_gate_failed:
            outcome.result = "gate_failed"
            outcome.messages.append(
                "gate contract_gate failed (Set 068, hard-TTY): "
                f"{contract_detail} Pass --accept-suggestions to bypass "
                "non-interactively (incident/headless only)."
            )
            _emit_event(
                session_set_dir,
                "closeout_failed",
                outcome.session_number,
                outcome,
                failed_checks=["contract_gate"],
            )
            return outcome

        outcome.result = "succeeded"
        # Include the orchestrator-identity snapshot in the
        # closeout_succeeded payload so the audit trail records
        # engine + provider + model alongside the verification
        # method. ``**orchestrator_identity`` is empty when the state
        # file lacked an orchestrator block entirely; the payload
        # then degrades gracefully to a method-only shape. Set 049
        # dropped ``chatSessionId`` from this payload along with the
        # rest of the coordination layer. ``verdict`` uses omit-null
        # (Q6 locked design): absent when the session had no routed
        # verifier, present with the VERIFIED/ISSUES_FOUND token when
        # it did.
        cs_fields: dict = {"method": method, **orchestrator_identity}
        if verdict is not None:
            cs_fields["verdict"] = verdict
        # Set 064 D3: stamp the cited-lesson ids into the audit event so
        # the close record names which guidance lessons this set used.
        # Unknown ids (present in no guidance file) are recorded as a
        # non-blocking mismatch — never fail close-out on a typo'd id.
        cited_ids, unknown_cited = _resolve_lessons_cited(disposition)
        if cited_ids:
            cs_fields["lessons_cited"] = cited_ids
        if unknown_cited:
            cs_fields["lessons_cited_unknown"] = unknown_cited
            outcome.messages.append(
                "warning: disposition.lessons_cited names id(s) not found "
                f"in any guidance file: {', '.join(unknown_cited)} "
                "(recorded as a non-blocking mismatch)"
            )
        _emit_event(
            session_set_dir,
            "closeout_succeeded",
            outcome.session_number,
            outcome,
            **cs_fields,
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
            session_set_dir,
            verification_verdict=verdict,
            forced=bool(args.force),
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
    # Set 048 Session 2: resolve --no-router mode at entry-point start
    # so verification short-circuit + soft-gate logic downstream can
    # read the cached resolution. Side-effect: emits a log.info line.
    #
    # Set 048 S5 UAT fix: relative import resolves under pip-install
    # mode. The original bare `from runtime_mode import …` worked under
    # the test sys.path shim but silently no-op'd in production via the
    # try/except below — and the soft-gate + verification short-circuit
    # both depend on this resolution running.
    # Set 077 S4 (A3): ``run()`` makes its own deterministic per-set
    # resolution via ``_resolve_no_router_for_run`` (CLI flag, else a
    # direct env+spec read — deliberately NOT this resolver's cache, so
    # a multi-set process cannot pin later sets to the first set's
    # answer). The two paths apply the same precedence and must be kept
    # in lockstep manually. This early call still populates the cache
    # for downstream ``is_no_router_mode()`` consumers and emits the
    # override log line at process start.
    try:
        from .runtime_mode import resolve_no_router_mode

        ssd = getattr(args, "session_set_dir", None)
        resolve_no_router_mode(
            cli_flag=bool(getattr(args, "no_router", False)),
            session_set_dir=Path(ssd) if ssd else None,
        )
    except Exception as exc:  # noqa: BLE001
        # Resolution must never block close_session (full-tier is the
        # safe default) — but say so instead of swallowing silently
        # (Set 077 S4): a spec/env-activated Lightweight set that loses
        # its soft gate this close should be a visible event.
        print(
            "WARNING: --no-router mode resolution failed at entry "
            f"({exc.__class__.__name__}: {exc}); proceeding with the raw "
            "CLI flag only.",
            file=sys.stderr,
        )
    outcome = run(args)
    _emit_output(outcome, json_mode=args.json)

    # Set 053: schema-drift advisory at the close boundary (soft note;
    # start_session is the primary trigger). Same non-blocking, fail-open
    # contract as start_session: printed to stderr, never affects the exit
    # code, swallows its own errors. Scan the sibling sets under this set's
    # parent dir.
    try:
        if outcome.session_set_dir:
            drift_line = summarize_drift(
                os.path.dirname(os.path.abspath(outcome.session_set_dir))
            )
            if drift_line:
                print(drift_line, file=sys.stderr)
        # Set 064 D5 backstop: soft guidance over-ceiling advisory
        # (non-blocking, fail-open, stderr-only; never affects exit code).
        overhead_line = summarize_overhead()
        if overhead_line:
            print(overhead_line, file=sys.stderr)
    except Exception:  # noqa: BLE001
        pass

    return outcome.exit_code


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess
    sys.exit(main())
