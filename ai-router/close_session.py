"""``close_session`` — sole synchronization barrier between session work and close-out.

Usage::

    python -m ai_router.close_session --session-set-dir docs/session-sets/<slug>
    python -m ai_router.close_session --json
    python -m ai_router.close_session --force          # transitional, emits DEPRECATION
    python -m ai_router.close_session --manual-verify --reason-file reason.md
    python -m ai_router.close_session --repair         # diagnostic only
    python -m ai_router.close_session --repair --apply # corrective

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

**This script does not yet wire into ``mark_session_complete``.** Set 4
adds that wiring along with the ``--force`` deprecation transition. For
now, ``close_session`` runs to completion with stub gates and emits the
expected ledger events; the orchestrator's existing Step 8 path is
unchanged.

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
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

if __name__ == "__main__" and __package__ in (None, ""):
    # Production CLI path: invoked as ``python -m ai_router.close_session``
    # but this module also has to be importable when ``ai-router/`` is
    # on sys.path directly (the test harness pattern). The parent
    # directory ``ai-router/`` is the package directory; adding it lets
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

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m ai_router.close_session",
        description=(
            "Run the close-out gate on a session set. This is the sole "
            "synchronization barrier between session work and close-out."
        ),
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
            "Bypass all gate checks. Transitional only; emits a "
            "DEPRECATION warning. Set 4 will tighten this further."
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
    * ``--apply`` is meaningful only under ``--repair``; using it alone
      is almost certainly a typo and should fail loudly.
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
    if args.apply and not args.repair:
        return "--apply requires --repair"
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

# Names of the gate checks Session 2 will implement. Listed here so the
# skeleton's stub output is shape-stable and downstream JSON consumers
# can rely on the keys appearing in the same order regardless of session.
_GATE_CHECK_NAMES = (
    "working_tree_clean",
    "pushed_to_remote",
    "activity_log_entry",
    "next_orchestrator_present",
    "change_log_fresh",
)


def _run_gate_checks(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool,
) -> List[GateResult]:
    """Run the deterministic gate checks. Skeleton: every check passes.

    Session 2 replaces the stubbed body with real predicates. Each real
    check returns ``(passed, remediation)``; the wrapper here just turns
    that into a :class:`GateResult`. Until then we emit a passing
    GateResult for each named check so downstream callers (and the JSON
    output schema) see the shape they expect.

    Why a stub rather than skipping outright: skipping would make the
    JSON output's ``gate_results`` list empty during the skeleton phase
    and then non-empty in Session 2, which would force every consumer to
    handle two shapes. The stub stays shape-stable from day one.
    """
    # Disposition-derived checks are deferred to Session 2; we just
    # acknowledge the parameters here so the signature is stable.
    _ = disposition
    _ = allow_empty_commit
    _ = session_set_dir

    return [
        GateResult(
            check=name,
            passed=True,
            remediation="",
        )
        for name in _GATE_CHECK_NAMES
    ]


# ---------------------------------------------------------------------------
# Verification wait skeleton (Session 3 fills in queue polling)
# ---------------------------------------------------------------------------

def _wait_for_verifications(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    manual_verify: bool,
    timeout_minutes: int,
) -> tuple[str, str, List[str]]:
    """Wait for queued verifications to reach a terminal state.

    Returns ``(method, wait_outcome, message_ids)``:

    * ``method`` — ``"api"`` (synchronous; nothing to wait on),
      ``"queue"`` (waited on the queue), ``"manual"``
      (``--manual-verify`` skipped the wait), or ``"skipped"`` (no
      disposition; nothing to do — the gate-failure path catches this
      separately).
    * ``wait_outcome`` — Session 3 will populate with ``"completed"`` /
      ``"failed"`` / ``"timed_out"`` depending on terminal queue state.
      Skeleton always returns ``"not_run"``.
    * ``message_ids`` — passed through from the disposition for the
      JSON output. Empty in the skeleton's stub.

    Session 3 implements the actual blocking poll against
    ``queue_db.get_message_state`` and uses ``timeout_minutes`` as the
    upper bound. Until then we return immediately, regardless of the
    ``verification_method`` declared in the disposition — the skeleton
    is documentation that the wait would happen here.
    """
    # Reference parameters so future sessions can plug in without the
    # signature changing.
    _ = session_set_dir
    _ = timeout_minutes

    if manual_verify:
        return "manual", "skipped_via_manual_verify", []

    if disposition is None:
        return "skipped", "no_disposition", []

    method = disposition.verification_method or "skipped"
    message_ids = list(disposition.verification_message_ids)
    return method, "not_run", message_ids


# ---------------------------------------------------------------------------
# Repair stub
# ---------------------------------------------------------------------------

def _run_repair(
    session_set_dir: str,
    *,
    apply_changes: bool,
) -> tuple[bool, List[str]]:
    """Walk the session set's state and report (or fix) detectable drift.

    Returns ``(drift_detected, messages)``. Skeleton: never detects drift.
    Session 4 replaces the body with the real walk that compares
    ``session-events.jsonl``, ``disposition.json``, the queue, and git
    state.

    ``apply_changes`` is a no-op in the skeleton but accepted in the
    signature so downstream sessions can switch behavior without
    touching the call site.
    """
    _ = session_set_dir
    _ = apply_changes
    return False, [
        "repair: skeleton implementation; Session 4 will populate this walk"
    ]


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

def run(args: argparse.Namespace) -> CloseoutOutcome:
    """Execute the close-out flow for the given parsed args.

    Composed so callers (the reconciler in Session 3, integration tests
    in Session 4) can build an ``argparse.Namespace`` directly and skip
    the CLI parsing layer. Returns the :class:`CloseoutOutcome` rather
    than calling ``sys.exit`` so callers can inspect / re-emit it.
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
    # gate; we run the repair walk and exit on its result.
    if args.repair:
        drift, messages = _run_repair(
            session_set_dir, apply_changes=args.apply,
        )
        outcome.messages.extend(messages)
        if drift and not args.apply:
            outcome.result = "repair_drift"
        else:
            outcome.result = "succeeded"
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

    # ``--force`` accepts a missing disposition (transitional only).
    # In the normal path, refuse: the disposition is the structured
    # handoff the close-out script reads to know what was done and how
    # it was verified.
    if disposition is None and not args.force:
        outcome.result = "invalid_invocation"
        outcome.messages.append(
            "disposition.json is required (or pass --force to bypass; "
            "transitional only)"
        )
        return outcome

    if args.force:
        outcome.messages.append(
            "DEPRECATION: --force bypasses all close-out gates. "
            "This flag is transitional and will be tightened in Set 4."
        )

    # Read --reason-file, if provided. A read failure is an invalid
    # invocation — better to surface it now than to drop the operator's
    # narrative on the floor and proceed silently.
    reason_text, reason_err = _read_reason_file(args.reason_file)
    if reason_err is not None:
        outcome.result = "invalid_invocation"
        outcome.messages.append(reason_err)
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
    _emit_event(
        session_set_dir,
        "closeout_requested",
        outcome.session_number,
        outcome,
        **request_fields,
    )

    # Verification wait (Session 3 fills in real polling).
    method, wait_outcome, message_ids = _wait_for_verifications(
        session_set_dir,
        disposition,
        manual_verify=args.manual_verify,
        timeout_minutes=args.timeout,
    )
    outcome.verification_method = method
    outcome.verification_wait_outcome = wait_outcome
    outcome.verification_message_ids = message_ids

    # Gate checks (Session 2 fills in real checks). ``--force`` skips
    # the gate run entirely; we still record an empty gate_results list
    # so the JSON shape is unambiguous in that case.
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
    return outcome


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
