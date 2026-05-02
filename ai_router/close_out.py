"""Mode-aware fresh close-out turn — orchestrator-driven Step 8 router.

After a session's work-doing turn writes ``disposition.json`` with
``status: "completed"`` AND verification has terminated, the
orchestrator wrapper calls :func:`route_fresh_close_out_turn` to
trigger close-out. Behavior is split by ``outsourceMode``:

* **outsource-first** — a fresh turn is routed via :func:`ai_router.route`
  with ``task_type="session-close-out"``. The routed agent reads
  ``ai_router/docs/close-out.md`` and runs ``python -m
  ai_router.close_session``. The fresh turn exists so the close-out
  agent encounters the close-out instructions at the moment they are
  needed (the workflow doc's Step 8 was collapsed in Session 1; the
  detail lives in close-out.md, and the prompt for this task type
  explicitly references it).
* **outsource-last** — no fresh API turn is routed. The orchestrator's
  primary CLI session already holds the queue context and the working
  tree; spawning a separate routed turn would (a) cost a subscription
  call we are explicitly avoiding in outsource-last and (b) double up
  the gate-running work since the orchestrator can run
  ``close_session.run`` in-process. The hook calls ``close_session.run``
  directly and returns the :class:`CloseoutOutcome`.

Both branches are designed to be **non-fatal**. A close-out turn that
crashes (provider outage, transient lock contention, queue still
draining) leaves the session in ``closeout_pending`` /
``closeout_blocked``, where the reconciler from
:mod:`ai_router.reconciler` picks it up on the next sweep. The hook's
contract is therefore *best-effort one-shot*: try to close, return the
outcome, never raise. Callers inspect the return value to decide
whether to log, notify, or move on.

What this module is NOT
-----------------------
This module does not own *when* the hook fires. The decision to invoke
``route_fresh_close_out_turn`` lives in the orchestrator's wrapper /
session-driver code, which examines disposition.json and the lifecycle
state. The hook just executes the right action for the resolved mode.

Reconciler relationship
-----------------------
The reconciler's ``register_sweeper_hook`` runs at orchestrator startup
(Set 6 wires that into the wrapper). The fresh-turn hook here runs at
session-end, immediately after work verification. Together they form
the two-pronged recovery story:

* Happy path: fresh-turn hook runs, close-out succeeds, session is
  ``closed`` before the session ends.
* Sad path: fresh-turn hook fails (provider outage, etc.), session is
  left ``closeout_pending``. Next session's startup runs the reconciler,
  which re-attempts close-out. If that also fails, the next sweep
  retries, until the underlying issue is fixed.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, List, Optional

if __name__ == "__main__" and __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from disposition import (  # type: ignore[import-not-found]
        Disposition,
        read_disposition,
    )
    from session_state import (  # type: ignore[import-not-found]
        DEFAULT_OUTSOURCE_MODE,
        OUTSOURCE_MODES,
        read_mode_config,
        validate_mode_config,
    )
    import close_session  # type: ignore[import-not-found]
except ImportError:
    from .disposition import (  # type: ignore[no-redef]
        Disposition,
        read_disposition,
    )
    from .session_state import (  # type: ignore[no-redef]
        DEFAULT_OUTSOURCE_MODE,
        OUTSOURCE_MODES,
        read_mode_config,
        validate_mode_config,
    )
    from . import close_session  # type: ignore[no-redef]


SESSION_CLOSE_OUT_TASK_TYPE = "session-close-out"

# The prompt sent to the routed close-out agent in outsource-first mode.
# Deliberately short: the agent's job is to commit/push/run-the-CLI/
# notify in the right order, not to reason about the gate semantics.
# Embedding the whole close-out.md into the prompt would defeat the
# doc-collapse work from Set 6 Session 1; the pointer is what keeps the
# single source of truth.
#
# Commit / push / notification ownership (Set 9 Session 1, drift item
# D-3 from the alignment audit): the close_session CLI does NOT run git
# commit, git push, or notifications — the gate's check_pushed_to_remote
# enforces the push precondition, and notification fires from this
# routed agent after close_session succeeds. The prompt therefore
# orders the steps explicitly so the agent does not skip the commit /
# push or fire the notification before close-out has actually closed.
_CLOSE_OUT_TURN_CONTENT = (
    "Run end-of-session close-out for the session set at "
    "{session_set_dir}.\n\n"
    "Steps:\n"
    "1. Read ai_router/docs/close-out.md (the canonical close-out "
    "reference) for the procedure, expected outputs, ownership "
    "contract (Section 1), and remediation.\n"
    "2. Stage, commit, and push the session's work BEFORE invoking "
    "close_session. The gate's check_pushed_to_remote will fail "
    "closed if the push has not landed, so this step is a "
    "precondition rather than something close_session does itself. "
    "Use a descriptive commit message that names the session set "
    "and session number.\n"
    "3. Invoke `python -m ai_router.close_session "
    "--session-set-dir {session_set_dir}` and capture its exit code, "
    "result string, and gate-result list.\n"
    "4. If the gate fails on a transient signal (lock contention, "
    "verification timeout), do not retry — report the result. The "
    "reconciler will sweep the session set on the next startup.\n"
    "5. If the gate fails on a hard signal (uncommitted files, push "
    "rejected, missing nextOrchestrator), surface the remediation "
    "string verbatim so the human can address it. Do not fire the "
    "session-complete notification when the gate has failed.\n"
    "6. ONLY when close_session returns result=='succeeded' and exit "
    "code 0, fire the session-complete notification by calling "
    "`ai_router.notifications.send_session_complete_notification(...)` "
    "(or running it via the venv Python). Notification failure is "
    "non-fatal — log and continue; the session work is preserved in "
    "git regardless.\n\n"
    "Return a one-paragraph summary: what close_session reported, "
    "which gates passed/failed, whether the session reached `closed` "
    "lifecycle state, and whether the notification was sent."
)


_logger = logging.getLogger("ai_router.close_out")
if not _logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_h)
_logger.setLevel(logging.INFO)
_logger.propagate = False


CLOSE_OUT_RESULTS = (
    "skipped_disposition_missing",
    "skipped_disposition_not_completed",
    "skipped_invalid_mode_config",
    "first_routed",
    "first_route_failed",
    "last_invoked",
    "last_invocation_failed",
)


@dataclass
class FreshCloseOutResult:
    """Outcome of one ``route_fresh_close_out_turn`` invocation.

    The hook never raises; failures of the routed turn or the in-process
    invocation surface as a populated ``error`` plus a ``*_failed``
    result string. ``close_session_outcome`` is populated only on the
    outsource-last branch (the only branch that holds the
    :class:`CloseoutOutcome` directly); the outsource-first branch's
    routed agent is the one that runs ``close_session``, so the hook
    only sees the routed agent's content/cost via ``route_result``.
    """

    result: str
    session_set_dir: str
    mode: Optional[str] = None
    messages: List[str] = field(default_factory=list)
    # outsource-first: populated when the route() call returned a result.
    route_result: Optional[Any] = None
    # outsource-last: populated when close_session.run() returned a result.
    close_session_outcome: Optional[Any] = None
    error: Optional[str] = None


def _resolve_mode(session_set_dir: str) -> tuple[Optional[str], Optional[str]]:
    """Return ``(mode, error)``. ``mode`` is ``None`` when validation failed.

    Parses the spec's Session Set Configuration block. A missing /
    malformed block surfaces as an explicit error rather than a silent
    fallback to first mode — the hook is mode-aware and a wrong mode
    decision either spawns an unwanted API call (cost) or skips a
    needed one (stranded session).
    """
    try:
        cfg = read_mode_config(session_set_dir)
    except Exception as exc:  # noqa: BLE001 — defensive
        return None, f"failed to read mode config: {type(exc).__name__}: {exc}"
    ok, errors = validate_mode_config(cfg)
    if not ok:
        return None, "invalid mode config: " + "; ".join(errors)
    mode = cfg.outsource_mode or DEFAULT_OUTSOURCE_MODE
    if mode not in OUTSOURCE_MODES:
        return None, f"unknown outsourceMode {mode!r}"
    return mode, None


def _disposition_says_completed(
    disposition: Optional[Disposition],
) -> bool:
    """Pre-flight check: only fire close-out for completed sessions.

    A session that ends in ``failed`` or ``requires_review`` is not
    eligible for close-out — those land on the human's desk via the
    Step 7 path, not the close-out gate. We refuse the hook rather than
    routing a turn that close_session itself would reject, because
    surfacing the right reason at the right layer keeps the audit trail
    legible.
    """
    return disposition is not None and disposition.status == "completed"


def route_fresh_close_out_turn(
    session_set_dir: str,
    *,
    route_fn: Optional[Callable[..., Any]] = None,
    close_session_runner: Optional[Callable[[argparse.Namespace], Any]] = None,
) -> FreshCloseOutResult:
    """Mode-aware fresh close-out turn.

    Reads ``disposition.json`` and the spec's mode config, then dispatches
    to the appropriate branch. Returns a :class:`FreshCloseOutResult`
    describing what happened. Never raises — every failure path
    populates ``result`` and ``error`` instead.

    Injection points:

    * ``route_fn`` — defaults to :func:`ai_router.route`. Tests inject
      a fake to avoid real API calls.
    * ``close_session_runner`` — defaults to a wrapper around
      :func:`close_session.run` with the standard non-interactive
      argparse Namespace. Tests inject a fake to assert which branch ran.
    """
    out = FreshCloseOutResult(
        result="",
        session_set_dir=session_set_dir,
    )

    disposition = read_disposition(session_set_dir)
    if disposition is None:
        out.result = "skipped_disposition_missing"
        out.messages.append(
            f"disposition.json not found in {session_set_dir}; "
            "close-out routing skipped"
        )
        return out

    if not _disposition_says_completed(disposition):
        out.result = "skipped_disposition_not_completed"
        out.messages.append(
            f"disposition.status={disposition.status!r}; "
            "close-out routing only fires for status=='completed'"
        )
        return out

    mode, mode_err = _resolve_mode(session_set_dir)
    if mode is None:
        out.result = "skipped_invalid_mode_config"
        out.error = mode_err
        out.messages.append(mode_err or "unknown mode resolution failure")
        return out
    out.mode = mode

    if mode == "first":
        # Outsource-first: route a fresh turn to the close-out agent.
        # Importing ai_router lazily avoids a circular import at module
        # load time (ai_router/__init__.py imports from this module
        # transitively via the public API).
        if route_fn is None:
            try:
                from . import route as _route  # type: ignore[no-redef]
            except ImportError:
                # Bare-script test path. The test conftest puts ai_router
                # on sys.path; the package import succeeds via importlib.
                import importlib
                ai_router_mod = importlib.import_module("ai_router")
                _route = ai_router_mod.route
            route_fn = _route

        prompt = _CLOSE_OUT_TURN_CONTENT.format(
            session_set_dir=session_set_dir
        )
        try:
            rr = route_fn(
                content=prompt,
                task_type=SESSION_CLOSE_OUT_TASK_TYPE,
                session_set=session_set_dir,
            )
        except Exception as exc:  # noqa: BLE001 — never raise from the hook
            out.result = "first_route_failed"
            out.error = f"{type(exc).__name__}: {exc}"
            out.messages.append(
                "route_fn raised; reconciler will retry on next startup"
            )
            return out

        out.route_result = rr
        out.result = "first_routed"
        out.messages.append(
            "fresh close-out turn routed; the routed agent is "
            "responsible for invoking close_session"
        )
        return out

    # outsource-last: no fresh API turn. The orchestrator runs
    # close_session in-process, in its own primary CLI session.
    if close_session_runner is None:
        close_session_runner = _default_close_session_runner

    args = argparse.Namespace(
        session_set_dir=session_set_dir,
        json=False,
        interactive=False,
        force=False,
        allow_empty_commit=False,
        reason_file=None,
        manual_verify=False,
        repair=False,
        apply=False,
        # In outsource-last, verification ran asynchronously through
        # the queue. By the time disposition.json reports completed,
        # the queue rows are at terminal state — but the close-out
        # gate still calls _wait_for_verifications to confirm. A short
        # timeout is fine; a real outage surfaces as
        # ``verification_timeout`` and the reconciler retries.
        timeout=30,
    )
    try:
        result = close_session_runner(args)
    except Exception as exc:  # noqa: BLE001 — never raise from the hook
        out.result = "last_invocation_failed"
        out.error = f"{type(exc).__name__}: {exc}"
        out.messages.append(
            "close_session.run raised; reconciler will retry on next startup"
        )
        return out

    out.close_session_outcome = result
    out.result = "last_invoked"
    out.messages.append(
        f"close_session.run returned result={getattr(result, 'result', None)!r}"
    )
    return out


def _default_close_session_runner(args: argparse.Namespace):
    """Production runner — invokes :func:`close_session.run` in-process."""
    return close_session.run(args)


# ---------------------------------------------------------------------------
# CLI — exposed so operators can manually trigger the hook for debugging.
# Production wiring calls ``route_fresh_close_out_turn`` from Python.
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m ai_router.close_out",
        description=(
            "Manually fire the mode-aware fresh close-out hook for one "
            "session set. Used for debugging the orchestrator-side "
            "wiring; production calls invoke route_fresh_close_out_turn "
            "directly from Python."
        ),
    )
    p.add_argument(
        "--session-set-dir",
        required=True,
        help="Path to the session-set directory.",
    )
    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    out = route_fresh_close_out_turn(args.session_set_dir)
    print(f"result: {out.result}")
    if out.mode is not None:
        print(f"mode: {out.mode}")
    if out.error:
        print(f"error: {out.error}")
    for msg in out.messages:
        print(f"  - {msg}")
    if out.close_session_outcome is not None:
        cs = out.close_session_outcome
        print(
            f"close_session: result={getattr(cs, 'result', None)} "
            f"exit_code={getattr(cs, 'exit_code', None)}"
        )
    # Exit 0 for any non-error result; the hook is best-effort and
    # most "skipped_*" outcomes are normal flow rather than failures.
    return 1 if out.error else 0


__all__ = [
    "CLOSE_OUT_RESULTS",
    "FreshCloseOutResult",
    "SESSION_CLOSE_OUT_TASK_TYPE",
    "route_fresh_close_out_turn",
    "main",
]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
