"""Set 119 S2 — what stands between "work done" and "closed", knowable early.

**Who uses this:** the orchestrator, at any point in a session. Run it as
often as you like::

    python -m ai_router.close_preflight --session-set-dir docs/session-sets/<slug>

**See also:** ``close_session.py`` (the close this predicts);
``gate_checks.py`` (the predicates, called not copied);
``close_backstop.decide_backstop`` (the expensive question, answered
without spending the round that answering it used to cost).

The measurement this exists for
-------------------------------
Close-out is not slow — it **fails**. Across 104 sets / 295 sessions the
median close takes 0.1 min, but **122 sessions (41%) fail at least once**,
mean 1.6 attempts, max 9. Every one of those failures has the same shape:
an obligation the orchestrator did not know it had until a gate refused.
Nothing here changes *what* is required. Only *when you can find out*.

The most expensive of them is ``verification_backstop`` — 78 of the 212
recorded check-failures — and each firing spends a **routed call at close
time** to say something that was knowable minutes earlier. That question
is answered here for free.

What this is not
----------------
**Not a gate.** Set 116 reduced ten checks to three gates plus two
write-integrity preconditions, and this set's spec is explicit: *a set
about cheaper closes that adds a gate has failed on its own terms.* The
preflight **reports**; only the existing gates refuse. Two consequences
that are design, not omission:

- Its verdict is derived entirely from what ``close_session`` would do —
  ``gate_checks.is_blocking_check`` decides which rows are blocking, so a
  check demoted to advisory is advisory here too, automatically.
- It never invents a refusal the close does not have. A row that the
  close would step over is printed and then stepped over here as well.

**Not a second implementation.** Every verdict comes from calling the
same predicate the close calls. The alternative — a preflight with its
own spelling of the rules — drifts from the close it predicts, and a
preflight that disagrees with the gate is worse than no preflight,
because it teaches orchestrators to distrust it. That is why
``decide_backstop`` was extracted from ``run_close_backstop`` rather than
copied out of it (L-066-1 / L-069-1: one rule, one spelling).

Running it mid-session
----------------------
``working_tree_clean`` and ``pushed_to_remote`` are *supposed* to be unmet
while you are still working — they are the last two things a session does.
A non-zero exit mid-session is the tool working: it is a to-do list, not
an accusation. Read the rows, not just the exit code.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional

try:
    from .disposition import Disposition, read_disposition  # type: ignore[import-not-found]
    from .gate_checks import (  # type: ignore[import-not-found]
        GATE_CHECKS,
        VERIFICATION_INTEGRITY_CHECK_NAME,
        _verify_session_command,
        is_blocking_check,
    )
    from .progress import (  # type: ignore[import-not-found]
        SessionStateInvariantError,
        read_progress,
    )
    from .resolve_set import (  # type: ignore[import-not-found]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from .session_state import read_session_state  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - direct-script fallback
    from disposition import Disposition, read_disposition  # type: ignore[no-redef]
    from gate_checks import (  # type: ignore[no-redef]
        GATE_CHECKS,
        VERIFICATION_INTEGRITY_CHECK_NAME,
        _verify_session_command,
        is_blocking_check,
    )
    from progress import (  # type: ignore[no-redef]
        SessionStateInvariantError,
        read_progress,
    )
    from resolve_set import (  # type: ignore[no-redef]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from session_state import read_session_state  # type: ignore[no-redef]


# Exit codes. Deliberately the same three shapes close_session uses, so a
# script that wraps both does not need two vocabularies.
EXIT_OK = 0
EXIT_BLOCKING_UNMET = 1
EXIT_INVALID_INVOCATION = 2

DISPOSITION_PRESENT_CHECK_NAME = "disposition_present"

# The two SET-TERMINAL gates ``close_session`` evaluates after the
# GATE_CHECKS chain (Set 066 / Set 068). They are not in the registry
# because they are policy-gated and fire only on the set-terminal close,
# which is exactly why a preflight that walked only ``GATE_CHECKS`` could
# claim to have named everything and still miss them.
PATH_AWARE_CRITIQUE_CHECK_NAME = "path_aware_critique_gate"
CONTRACT_GATE_CHECK_NAME = "contract_gate"

# The three answers the preflight can give. Two of them are the close's
# deterministic verdicts; the third exists because collapsing "the
# backstop has not run yet" into either one is a lie in one direction or
# the other.
VERDICT_WOULD_CLOSE = "would-close"
VERDICT_WOULD_REFUSE = "would-refuse"
VERDICT_UNDECIDED = "undecided-backstop-would-route"

# The name close_session reports the backstop under, restated here rather
# than imported at module scope: close_backstop imports verify_session,
# which is heavy, and the preflight must stay cheap enough to run on a
# whim. The import happens inside _backstop_obligation. A parity test
# pins this constant to close_backstop.BACKSTOP_CHECK_NAME.
BACKSTOP_CHECK_NAME = "verification_backstop"


# The action for checks whose remediation states a CONDITION rather than a
# command. Checks whose predicate already names its own command (
# ``verification_integrity``, ``test_run_fresh``) are deliberately absent:
# a second spelling of a command is a second thing to keep true.
_ACTIONS: Dict[str, str] = {
    DISPOSITION_PRESENT_CHECK_NAME: (
        "author disposition.json in the session-set dir "
        "(schema: docs/disposition-schema.md)"
    ),
    "working_tree_clean": (
        "commit the listed paths (`git add` + `git commit`) -- the close is "
        "computed against the committed tree, so a dirty surface would "
        "record something that was never true"
    ),
    "pushed_to_remote": "`git push` the current branch to its upstream",
    "activity_log_entry": (
        "log this session's steps as you do them (SessionLog.log_step, "
        "using the spec's own step numbers)"
    ),
    "next_orchestrator_present": (
        "add disposition.next_orchestrator (engine/provider/model/effort "
        "plus a reason) -- required on every non-final session"
    ),
    "change_log_fresh": (
        "write change-log.md for the set -- final session only"
    ),
    "checklist_posted": (
        "post the step checklist at each transition: "
        "python -m ai_router.session_checklist"
    ),
    "uat_walk_recorded": (
        "record the UAT walk in disposition.uat, or an operator-attested "
        "waiver -- a skipped UAT is a visible decision, not an evaporation"
    ),
    "verification_method_vocabulary": (
        "set disposition.verification_method to a legal token"
    ),
    PATH_AWARE_CRITIQUE_CHECK_NAME: (
        "run the end-of-set multi-provider path-aware critique and save "
        "path-aware-critique.json before the set-terminal close"
    ),
    CONTRACT_GATE_CHECK_NAME: (
        "produce a passing, identity-matched contract floor result before "
        "the set-terminal close"
    ),
}


@dataclass
class Obligation:
    """One thing the close will look at, and whether it is satisfied yet.

    ``blocking`` mirrors ``gate_checks.is_blocking_check`` — an advisory
    check is reported and stepped over here exactly as the close steps
    over it. ``detail`` is the predicate's own remediation text, verbatim:
    the preflight never paraphrases a gate, because a paraphrase is a
    second spelling that can go stale.

    ``cost_warning`` is the one thing a gate result cannot say: closing
    right now would *succeed* but would spend a routed verification round
    doing it. That is not a refusal, so it never affects the exit code —
    it is the 78-of-212 line item this tool exists to surface early.
    """

    check: str
    met: bool
    blocking: bool
    detail: str = ""
    action: str = ""
    cost_warning: str = ""

    def to_dict(self) -> dict:
        return {
            "check": self.check,
            "met": self.met,
            "blocking": self.blocking,
            "detail": self.detail,
            "action": self.action,
            "cost_warning": self.cost_warning,
        }


@dataclass
class PreflightReport:
    """Every obligation in one pass, plus the verdict the close would give."""

    session_set_dir: str
    session_number: Optional[int]
    obligations: List[Obligation] = field(default_factory=list)
    backstop_would_route: bool = False

    @property
    def unmet_blocking(self) -> List[Obligation]:
        return [o for o in self.obligations if not o.met and o.blocking]

    @property
    def unmet_advisory(self) -> List[Obligation]:
        return [o for o in self.obligations if not o.met and not o.blocking]

    @property
    def cost_warnings(self) -> List[Obligation]:
        return [o for o in self.obligations if o.cost_warning]

    @property
    def verdict(self) -> str:
        """What the close would do, in three values rather than two.

        ``would-refuse`` and ``would-close`` are the deterministic
        answers. ``undecided`` is the honest third: everything a human
        can fix by hand is done, but the backstop runs first and **its**
        verdict -- which does not exist until the round is paid for --
        settles the close. Collapsing that into a boolean is what made
        the human report and the JSON report disagree.
        """
        if self.unmet_blocking:
            return VERDICT_WOULD_REFUSE
        if self.backstop_would_route:
            return VERDICT_UNDECIDED
        return VERDICT_WOULD_CLOSE

    @property
    def exit_code(self) -> int:
        return EXIT_BLOCKING_UNMET if self.unmet_blocking else EXIT_OK

    def to_dict(self) -> dict:
        return {
            "session_set_dir": self.session_set_dir,
            "session_number": self.session_number,
            "verdict": self.verdict,
            # Tri-state ON PURPOSE: null means "not decided yet", and a
            # consumer that naively tests truthiness gets the safe answer
            # (not closeable) rather than the dangerous one. A plain
            # boolean here said `true` while the human report said "NOT
            # yet decided" -- the two surfaces of one report contradicting
            # each other on the single case this tool exists for.
            "would_close": (
                None
                if self.verdict == VERDICT_UNDECIDED
                else self.verdict == VERDICT_WOULD_CLOSE
            ),
            "backstop_would_route": self.backstop_would_route,
            "exit_code": self.exit_code,
            "obligations": [o.to_dict() for o in self.obligations],
            "unmet_blocking": [o.check for o in self.unmet_blocking],
            "unmet_advisory": [o.check for o in self.unmet_advisory],
            "cost_warnings": [o.check for o in self.cost_warnings],
        }


def resolve_session_number(session_set_dir: str) -> Optional[int]:
    """The session this close would be about.

    ``session-state.json`` is the single source of truth for progress, so
    the in-flight session wins; a set with none falls back to the most
    recently closed one, mirroring the "in flight OR most recently
    closed" semantic every close-out reader uses -- ``close_session``'s
    own ``_peek_session_number`` included.

    Returns ``None`` when the state file is absent or malformed: the
    preflight degrades to the checks that do not need a session number
    rather than refusing.
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


def check_session_number(
    session_set_dir: str, requested: Optional[int]
) -> Optional[str]:
    """Validate a caller-supplied session number. ``None`` means fine.

    ``--session-number`` is an **assertion, not an override** — the one
    shape that is both usable and honest.

    An override cannot work: ``close_session`` has no session flag, and
    each registry predicate resolves the session in focus for itself, so
    a number threaded in from outside would relabel the report and steer
    the backstop row while every other obligation went on answering about
    whatever ``session-state.json`` says. That is a mixed-session report
    wearing a single-session label, and it is worse than no flag.

    Deleting the flag was not right either: the spec asks for a preflight
    runnable "against a session set and session number", and a script
    that names the session it means should be able to say so.

    So the number is accepted and **checked**. When it matches the
    session the close would close, everything proceeds and the report
    carries it. When it does not, the invocation is refused with the
    real number — which is strictly more useful than silently reporting
    on a different session than the caller asked about.
    """
    if requested is None:
        return None
    actual = resolve_session_number(session_set_dir)
    if actual is None:
        return (
            f"--session-number {requested} was requested, but this set's "
            "session cannot be resolved from session-state.json (absent or "
            "malformed), so the request cannot be honored. Omit the flag to "
            "preflight whatever the close would close."
        )
    if requested != actual:
        return (
            f"--session-number {requested} does not match the session this "
            f"close would close ({actual}). The flag is an ASSERTION, not an "
            "override: close_session has no session flag and each gate "
            "predicate resolves the session in focus itself, so honoring a "
            "different number would report on two sessions at once. Omit the "
            f"flag, or pass --session-number {actual}."
        )
    return None


def _disposition_obligation(
    session_set_dir: str, disposition: Optional[Disposition]
) -> Obligation:
    """The synthetic gate ``close_session`` raises for a missing disposition.

    ``run_gate_checks`` returns this INSTEAD of the whole chain, because
    its callers want one uniform failure surface. The preflight cannot
    afford that short-circuit: the entire point is to name everything in
    one pass, and "you have no disposition yet" is the normal state of a
    session that is still working. So it is reported as one row among
    many and the rest of the chain still runs — every predicate tolerates
    a ``None`` disposition, either passing trivially or naming what the
    missing file costs it.
    """
    if disposition is not None:
        return Obligation(
            check=DISPOSITION_PRESENT_CHECK_NAME, met=True, blocking=True
        )
    return Obligation(
        check=DISPOSITION_PRESENT_CHECK_NAME,
        met=False,
        blocking=True,
        detail=(
            "disposition.json is required for close-out at "
            f"{os.path.join(session_set_dir, 'disposition.json')}"
        ),
        action=_ACTIONS[DISPOSITION_PRESENT_CHECK_NAME],
    )


def _backstop_written_paths(decision) -> List[str]:
    """The bookkeeping a prior backstop round already wrote, if any.

    ``close_session`` feeds exactly these to ``working_tree_clean`` as
    ``extra_clean_ignore`` (I-084-S2-9): a backstop-VERIFIED run whose
    close then fails a different gate leaves its artifacts, findings
    envelope, round ledger and patched disposition uncommitted, and the
    rerun -- which skips the backstop -- must keep tolerating them.
    ``decide_backstop`` rediscovers them from the settling row rather
    than remembering them, so the preflight inherits the tolerance free.
    """
    outcome = getattr(decision, "outcome", None)
    return list(getattr(outcome, "written_paths", None) or [])


def _backstop_obligation(
    session_set_dir: str,
    session_number: Optional[int],
    disposition: Optional[Disposition],
):
    """Would the verification backstop fire -- and would it refuse?

    Returns ``(obligation, decision)``. The decision is handed back so
    the caller can mirror ``close_session``'s ordering with it: both the
    ``extra_clean_ignore`` paths and the verification-integrity deferral
    depend on knowing what the backstop will do *before* the gate chain
    is evaluated, which is the order the close itself uses.

    The spec's expensive case. ``decide_backstop`` walks the same
    sequence ``run_close_backstop`` walks before its metered call, and
    every branch of it is a read, so the answer costs nothing. Three
    shapes come back:

    - **It will not run.** Settling stamped evidence already covers this
      close, or the repo declared the zero-budget tier, or the method
      token is illegal so no round could help. Met; no round; free.
    - **It will refuse before routing.** Unresolvable orchestrator
      identity, a spent round budget, or no resolvable diff base. Unmet
      and blocking, carrying the backstop's own remediation verbatim.
    - **It will route.** The close would spend a verification round, and
      its verdict is exactly what cannot be known without spending it.
      That is a **cost warning, not a refusal** — a backstop round that
      returns VERIFIED closes fine. Reported as met, with the warning,
      because inventing a refusal here would make this a gate.

    The one pre-metered refusal it cannot predict is an oversized
    evidence bundle (``EvidenceTooLargeError``), which is raised by the
    assembly *after* the decision — the single expensive read in the
    sequence, deliberately not performed here.
    """
    try:
        from .close_backstop import (  # type: ignore[import-not-found]
            STATUS_ROUND_BOUND_REACHED,
            STATUS_SKIPPED_EVIDENCE_PRESENT,
            STATUS_SKIPPED_VOCABULARY,
            STATUS_SKIPPED_ZERO_BUDGET,
            decide_backstop,
        )
    except ImportError:  # pragma: no cover - direct-script fallback
        from close_backstop import (  # type: ignore[no-redef]
            STATUS_ROUND_BOUND_REACHED,
            STATUS_SKIPPED_EVIDENCE_PRESENT,
            STATUS_SKIPPED_VOCABULARY,
            STATUS_SKIPPED_ZERO_BUDGET,
            decide_backstop,
        )

    try:
        decision = decide_backstop(
            session_set_dir, session_number, disposition
        )
    except Exception as exc:  # pragma: no cover - defensive
        # A reporting tool that crashes teaches nobody anything. Fail
        # OPEN here and say so: an unpredictable backstop is a smaller
        # harm than a preflight that cannot be run at all, and the close
        # itself is unaffected either way.
        return (
            Obligation(
                check=BACKSTOP_CHECK_NAME,
                met=True,
                blocking=is_blocking_check(BACKSTOP_CHECK_NAME),
                detail=(
                    f"could not predict the backstop ({type(exc).__name__}: "
                    f"{exc}); the close is unaffected, but this question is "
                    "unanswered"
                ),
            ),
            None,
        )

    if decision.would_route:
        return (
            Obligation(
                check=BACKSTOP_CHECK_NAME,
                met=True,
                blocking=is_blocking_check(BACKSTOP_CHECK_NAME),
                detail=(
                    "this close carries no settling verification evidence, so "
                    "close_session would run the backstop itself: one routed "
                    f"verification round (round {decision.round_number}) at "
                    "close time, BEFORE the gate chain"
                ),
                cost_warning=(
                    "closing now SPENDS a routed verification round, and ITS "
                    "verdict -- not anything else on this list -- decides the "
                    "close. Run the verification yourself first, where you can "
                    "iterate on the findings instead of meeting them inside a "
                    f"close: {_verify_session_command(session_set_dir)}"
                ),
            ),
            decision,
        )

    outcome = decision.outcome
    status = getattr(outcome, "status", "")
    if status in (
        STATUS_SKIPPED_EVIDENCE_PRESENT,
        STATUS_SKIPPED_ZERO_BUDGET,
        STATUS_SKIPPED_VOCABULARY,
    ):
        detail = "; ".join(getattr(outcome, "messages", []) or []) or (
            "settling verification evidence already covers this close"
        )
        return (
            Obligation(
                check=BACKSTOP_CHECK_NAME,
                met=True,
                blocking=is_blocking_check(BACKSTOP_CHECK_NAME),
                detail=detail,
            ),
            decision,
        )

    # Everything else is a refusal the close would make, before routing.
    action = _verify_session_command(session_set_dir)
    if status == STATUS_ROUND_BOUND_REACHED:
        # The bound is the operator's to pass, never the orchestrator's:
        # naming the sanctioned command here would read as permission.
        action = (
            "STOP -- the round budget is spent. Both exits are the "
            "operator's; the detail above states them."
        )
    return (
        Obligation(
            check=BACKSTOP_CHECK_NAME,
            met=False,
            blocking=is_blocking_check(BACKSTOP_CHECK_NAME),
            detail=getattr(outcome, "remediation", "") or status,
            action=action,
        ),
        decision,
    )


def _terminal_policy_obligations(
    session_set_dir: str, session_number: Optional[int]
) -> List[Obligation]:
    """The two SET-TERMINAL gates that live outside ``GATE_CHECKS``.

    ``close_session`` evaluates the Set 066 path-aware-critique gate and
    the Set 068 contract gate **after** the registry chain, each keyed on
    the same compute-once "is this the set-terminal close?" predicate. A
    preflight that walked only the registry could truthfully say it had
    named every *registered* obligation while silently omitting two that
    really do refuse a close — which is precisely the completeness
    promise this tool makes.

    Both mirror the close's own posture rather than inventing one:

    - ``none`` produces **no row at all**, and neither does a
      non-terminal close: the gates do not fire there, and two
      permanently-met rows would be noise.
    - ``advisory`` is reported and never blocks.
    - ``required`` blocks **only where the close would block** — in an
      interactive TTY. ``close_session`` soft-warns a failed ``required``
      terminal gate when stdin is not a TTY or ``--accept-suggestions``
      was passed, and agents and CI run headless, so treating
      ``required`` as unconditionally blocking would report a refusal the
      close does not make on the most common invocation path.

    Both are **fail-open**: the close contracts that an internal error
    here never wedges close-out, so an error here must never wedge the
    report either.
    """
    if not session_number:
        return []
    try:
        from .close_session import _close_is_terminal  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - direct-script fallback
        try:
            from close_session import _close_is_terminal  # type: ignore[no-redef]
        except ImportError:  # pragma: no cover - defensive
            return []
    try:
        if not _close_is_terminal(session_set_dir, session_number):
            return []
    except Exception:  # pragma: no cover - defensive, fail open
        return []

    interactive = _close_would_be_interactive()
    rows: List[Obligation] = []
    for check, loader in (
        (PATH_AWARE_CRITIQUE_CHECK_NAME, _path_aware_critique_policy),
        (CONTRACT_GATE_CHECK_NAME, _contract_gate_policy),
    ):
        try:
            level, required_level, none_level, verdict = loader(session_set_dir)
        except Exception:  # pragma: no cover - defensive, fail open
            continue
        if level == none_level or verdict is None:
            continue
        applicable, ok, detail = verdict
        if not applicable or ok:
            rows.append(Obligation(check=check, met=True, blocking=False))
            continue
        blocking = (level == required_level) and interactive
        if level == required_level and not interactive:
            detail = (
                f"{detail} (Reported, not blocking: this stdin is not a TTY, "
                "and close_session SOFT-WARNS a failed 'required' terminal "
                "gate on the non-TTY / --accept-suggestions path. From an "
                "interactive terminal the same state hard-blocks.)"
            )
        rows.append(
            Obligation(
                check=check,
                met=False,
                blocking=blocking,
                detail=detail,
                action=_ACTIONS.get(check, ""),
            )
        )
    return rows


def _close_would_be_interactive() -> bool:
    """Whether the close would take its hard-blocking terminal-gate path.

    ``close_session`` decides with ``not sys.stdin.isatty()`` (plus
    ``--accept-suggestions``, which the preflight cannot see and which
    only ever moves the answer toward soft-warn). Reading the same signal
    keeps the preflight from claiming a refusal the close would not make,
    and a stdin that cannot be interrogated is treated as non-interactive
    — the direction that under-claims rather than over-claims.
    """
    try:
        return bool(sys.stdin.isatty())
    except Exception:  # pragma: no cover - defensive
        return False


def _path_aware_critique_policy(session_set_dir: str):
    try:
        from .path_aware_critique import (  # type: ignore[import-not-found]
            PATH_AWARE_CRITIQUE_NONE,
            PATH_AWARE_CRITIQUE_REQUIRED,
            read_path_aware_critique,
            validate_path_aware_critique_gate,
        )
    except ImportError:  # pragma: no cover - direct-script fallback
        from path_aware_critique import (  # type: ignore[no-redef]
            PATH_AWARE_CRITIQUE_NONE,
            PATH_AWARE_CRITIQUE_REQUIRED,
            read_path_aware_critique,
            validate_path_aware_critique_gate,
        )
    level = read_path_aware_critique(session_set_dir)
    if level == PATH_AWARE_CRITIQUE_NONE:
        return level, PATH_AWARE_CRITIQUE_REQUIRED, PATH_AWARE_CRITIQUE_NONE, None
    gate = validate_path_aware_critique_gate(session_set_dir)
    return (
        level,
        PATH_AWARE_CRITIQUE_REQUIRED,
        PATH_AWARE_CRITIQUE_NONE,
        (
            gate.applicable,
            gate.ok,
            f"{gate.reason} {gate.corrective}".strip(),
        ),
    )


def _contract_gate_policy(session_set_dir: str):
    try:
        from .contract_gate import (  # type: ignore[import-not-found]
            CONTRACT_GATE_NONE,
            CONTRACT_GATE_REQUIRED,
            read_contract_gate,
            validate_contract_gate,
        )
    except ImportError:  # pragma: no cover - direct-script fallback
        from contract_gate import (  # type: ignore[no-redef]
            CONTRACT_GATE_NONE,
            CONTRACT_GATE_REQUIRED,
            read_contract_gate,
            validate_contract_gate,
        )
    level = read_contract_gate(session_set_dir)
    if level == CONTRACT_GATE_NONE:
        return level, CONTRACT_GATE_REQUIRED, CONTRACT_GATE_NONE, None
    gate = validate_contract_gate(session_set_dir)
    return (
        level,
        CONTRACT_GATE_REQUIRED,
        CONTRACT_GATE_NONE,
        (
            gate.applicable,
            gate.ok,
            f"{gate.reason} {gate.corrective}".strip(),
        ),
    )


def evaluate(
    session_set_dir: str,
    *,
    allow_empty_commit: bool = False,
) -> PreflightReport:
    """Every close-out obligation for one session, evaluated in one pass.

    No side effects: no lock is taken, no event is appended, no file is
    written, and nothing is routed. Every predicate below is the close's
    own, invoked exactly the way ``close_session._run_gate_checks``
    invokes it, so a demotion or a rule change lands here for free.

    **The order is ``close_session``'s order, and that is load-bearing.**
    The close runs the backstop FIRST and the gate chain after, which has
    two consequences a preflight that reversed them would get wrong in
    the tool's single most important case:

    - A close with no stamped evidence is *not* refused by
      ``verification_integrity``. The backstop runs first and, on
      ``VERIFIED``, writes the artifact and stamped row that gate wants.
      Evaluating the gate against a tree where the backstop has not run
      yet reports a refusal the close would not make.
    - The bookkeeping a prior backstop round wrote (artifacts, findings
      envelope, round ledger, the patched disposition) is passed to
      ``working_tree_clean`` as ``extra_clean_ignore`` on a rerun. Without
      it the preflight sends the reader off to commit files the close
      deliberately tolerates, hiding the real blocker.

    The session is resolved the way the close resolves it, from
    ``session-state.json``. There is deliberately no session override:
    ``close_session`` has no such flag, and the registry predicates each
    read the session in focus themselves, so an override could only
    produce a mixed-session report -- some rows about session N and the
    rest about whatever the state file says.

    A predicate that raises is reported as unmet with the exception text,
    mirroring the close's own defensive wrapper -- a single buggy
    predicate must not wedge the report any more than it wedges a close.
    """
    disposition = read_disposition(session_set_dir)
    session_number = resolve_session_number(session_set_dir)

    obligations: List[Obligation] = [
        _disposition_obligation(session_set_dir, disposition)
    ]

    backstop_row, decision = _backstop_obligation(
        session_set_dir, session_number, disposition
    )
    would_route = bool(decision is not None and decision.would_route)
    extra_ignore = _backstop_written_paths(decision)

    for name, predicate in GATE_CHECKS:
        kwargs = {"allow_empty_commit": allow_empty_commit}
        if extra_ignore and name == "working_tree_clean":
            kwargs["extra_ignore_paths"] = extra_ignore
        try:
            passed, remediation = predicate(
                session_set_dir, disposition, **kwargs
            )
        except Exception as exc:  # pragma: no cover - defensive
            passed, remediation = (
                False,
                f"gate predicate raised {type(exc).__name__}: {exc}",
            )
        if (
            name == VERIFICATION_INTEGRITY_CHECK_NAME
            and not passed
            and would_route
        ):
            # Not yet decidable, and reporting it as unmet would be a
            # refusal the close does not make: close_session runs the
            # backstop BEFORE this gate, and a VERIFIED backstop writes
            # the very artifact and stamped row this gate looks for. What
            # it will see does not exist yet. The real message -- that
            # closing now buys a round whose verdict decides it -- is on
            # the backstop row, where it can be priced instead of
            # mistaken for a chore.
            obligations.append(
                Obligation(
                    check=name,
                    met=True,
                    blocking=is_blocking_check(name),
                    detail=(
                        "not yet decidable: close_session runs the "
                        "verification backstop BEFORE this gate, and a "
                        "VERIFIED backstop writes the artifact and stamped "
                        "row this gate wants. See the "
                        f"{BACKSTOP_CHECK_NAME} row -- the close is decided "
                        "there, at the price of a routed round. (Standing "
                        f"verdict: {remediation})"
                    ),
                )
            )
            continue
        obligations.append(
            Obligation(
                check=name,
                met=bool(passed),
                blocking=is_blocking_check(name),
                detail="" if passed else remediation,
                action="" if passed else _ACTIONS.get(name, ""),
            )
        )

    obligations.append(backstop_row)
    obligations.extend(
        _terminal_policy_obligations(session_set_dir, session_number)
    )
    return PreflightReport(
        session_set_dir=session_set_dir,
        session_number=session_number,
        obligations=obligations,
        backstop_would_route=would_route,
    )


def render(report: PreflightReport) -> str:
    """The human report. ASCII-only glyphs (Windows cp1252 consoles)."""
    lines: List[str] = []
    session = (
        f"session {report.session_number}"
        if report.session_number is not None
        else "session (unresolved)"
    )
    lines.append(f"close preflight: {report.session_set_dir} [{session}]")
    lines.append("")
    for ob in report.obligations:
        mark = "[x]" if ob.met else "[ ]"
        tag = "" if ob.blocking else "  (advisory)"
        lines.append(f"  {mark} {ob.check}{tag}")
        if ob.detail:
            lines.append(f"        {ob.detail}")
        if ob.action:
            lines.append(f"        -> {ob.action}")
        if ob.cost_warning:
            lines.append(f"        $  {ob.cost_warning}")
    lines.append("")

    if report.cost_warnings:
        lines.append(
            f"COST: {len(report.cost_warnings)} obligation(s) would make "
            "this close spend a routed call. Not a refusal -- a bill."
        )
    if report.unmet_advisory:
        names = ", ".join(o.check for o in report.unmet_advisory)
        lines.append(f"ADVISORY (reported, does not refuse): {names}")
    if report.verdict == VERDICT_WOULD_REFUSE:
        names = ", ".join(o.check for o in report.unmet_blocking)
        lines.append(f"BLOCKING: {len(report.unmet_blocking)} unmet -- {names}")
        lines.append(
            "close_session would refuse. Nothing here is new policy: these "
            "are the same predicates the close runs."
        )
    elif report.verdict == VERDICT_UNDECIDED:
        # Honest third answer. Everything a human can fix by hand is
        # done, but the close is NOT yet decided: the backstop runs
        # first, and its verdict -- which does not exist until the round
        # is paid for -- is what settles it. Claiming "would proceed"
        # here would be the same overclaim in the opposite direction as
        # refusing on the missing evidence.
        lines.append(
            "BLOCKING: none unmet deterministically -- but this close is NOT "
            "yet decided. close_session runs the verification backstop first; "
            "its verdict settles the close, at the price above."
        )
    else:
        lines.append("BLOCKING: none unmet. close_session would proceed.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Step 4 — prove it against history
# ---------------------------------------------------------------------------

# The checks the preflight evaluates. Derived from the same registry the
# evaluation walks, so a check added to GATE_CHECKS is covered by the
# replay automatically and cannot silently inflate the pre-empted count.
def preflight_check_names() -> List[str]:
    """Every check name this preflight reports on.

    Includes the two set-terminal policy gates, which only *appear* in a
    report when the set opted into them and the close is terminal — but
    are always covered for replay purposes, because a historical failure
    of one of them is a failure this tool would have named.
    """
    return (
        [DISPOSITION_PRESENT_CHECK_NAME]
        + [name for name, _fn in GATE_CHECKS]
        + [
            BACKSTOP_CHECK_NAME,
            PATH_AWARE_CRITIQUE_CHECK_NAME,
            CONTRACT_GATE_CHECK_NAME,
        ]
    )


@dataclass
class ReplayResult:
    """What the preflight would have pre-empted, measured not predicted.

    Three counts, because conflating them is how the spec's own
    ``~148 of 212`` figure became unfalsifiable:

    - ``total`` — every check-failure recorded in every
      ``closeout_failed`` event in the corpus.
    - ``still_blocking`` — those whose check still refuses a close today.
      Set 116 S3 demoted four checks to advisory; pre-empting those is
      worth nothing now, so they are excluded from the headline.
    - ``preempted`` — still-blocking failures whose check the preflight
      evaluates. This is the honest measure of the tool's reach.

    **What the replay does NOT claim.** It replays *coverage*, not
    outcomes: the repo states that produced these failures are gone, so
    it cannot re-run a predicate against a 2026-05 working tree. It
    answers "would the preflight have named this obligation before the
    close?", which for a deterministic read-only predicate is the same
    question — and says so rather than implying a stronger result.
    """

    total: int = 0
    still_blocking: int = 0
    preempted: int = 0
    events: int = 0
    sessions_with_failures: int = 0
    unnumbered_events: int = 0
    by_check: Dict[str, int] = field(default_factory=dict)
    uncovered: Dict[str, int] = field(default_factory=dict)
    demoted: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "events": self.events,
            "sessions_with_failures": self.sessions_with_failures,
            "unnumbered_events": self.unnumbered_events,
            "total_check_failures": self.total,
            "still_blocking": self.still_blocking,
            "preempted": self.preempted,
            "by_check": dict(sorted(self.by_check.items())),
            "demoted_since": dict(sorted(self.demoted.items())),
            "not_covered": dict(sorted(self.uncovered.items())),
        }


def replay_history(session_sets_root: str = "docs/session-sets") -> ReplayResult:
    """Replay the preflight's coverage over every recorded close failure.

    Reads ``closeout_failed`` events from every set's
    ``session-events.jsonl`` — the same ledger this set's spec drew its
    numbers from — and classifies each recorded check-failure by whether
    the preflight names that obligation today and whether the check can
    still refuse a close.

    Tolerant by construction: a missing, unreadable or partly-malformed
    ledger contributes what it can rather than voiding the measurement.
    """
    covered = set(preflight_check_names())
    result = ReplayResult()
    pattern = os.path.join(session_sets_root, "*", "session-events.jsonl")
    seen_sessions = set()
    for path in sorted(glob.glob(pattern)):
        try:
            text = open(path, "r", encoding="utf-8").read()
        except OSError:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict):
                continue
            if event.get("event_type") != "closeout_failed":
                continue
            failed = event.get("failed_checks")
            if not isinstance(failed, list) or not failed:
                continue
            result.events += 1
            number = event.get("session_number")
            if isinstance(number, int) and not isinstance(number, bool) and number >= 1:
                seen_sessions.add((path, number))
            else:
                # Session numbers are 1-based everywhere in this repo, so a
                # 0 (or absent) one is not a session. Set 047's first close
                # attempt recorded `"session_number": 0` -- a legacy writer
                # artifact -- and counting it as a session is how a
                # per-session rate quietly gains a session that never
                # existed. Its CHECK-failures still count: a close really
                # did fail and really did name them.
                result.unnumbered_events += 1
            for name in failed:
                if not isinstance(name, str):
                    continue
                result.total += 1
                result.by_check[name] = result.by_check.get(name, 0) + 1
                if not is_blocking_check(name):
                    result.demoted[name] = result.demoted.get(name, 0) + 1
                    continue
                result.still_blocking += 1
                if name in covered:
                    result.preempted += 1
                else:
                    result.uncovered[name] = result.uncovered.get(name, 0) + 1
    result.sessions_with_failures = len(seen_sessions)
    return result


def render_replay(result: ReplayResult) -> str:
    """The replay report. ASCII-only glyphs."""
    lines = [
        "close-preflight historical replay",
        "",
        f"  closeout_failed events            : {result.events}",
        f"  sessions with >=1 failure         : {result.sessions_with_failures}",
        f"  ... plus unnumbered-event closes  : {result.unnumbered_events}",
        f"  recorded check-failures           : {result.total}",
        f"  ... demoted since (worth nothing) : {result.total - result.still_blocking}",
        f"  ... still blocking today          : {result.still_blocking}",
        f"  ... of those, preflight covers    : {result.preempted}",
        "",
        "  by check:",
    ]
    for name, count in sorted(
        result.by_check.items(), key=lambda kv: (-kv[1], kv[0])
    ):
        if not is_blocking_check(name):
            state = "demoted (advisory since Set 116 S3)"
        elif name in set(preflight_check_names()):
            state = "covered"
        else:
            state = "NOT COVERED"
        lines.append(f"    {count:>4}  {name:<32} {state}")
    lines.append("")
    lines.append(
        "  Coverage, not outcomes: the working trees that produced these "
        "failures are gone,"
    )
    lines.append(
        "  so this answers 'would the preflight have named this obligation "
        "first?', which for"
    )
    lines.append("  a deterministic read-only predicate is the same question.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _emit(text: str) -> None:
    """Print *text*, degrading rather than crashing on a legacy codepage.

    L-079-1. The preflight prints remediation text authored by OTHER
    modules, and it does not get to choose their punctuation:
    ``close_backstop``'s diff-base refusal is spelled "(fails closed
    <em dash> I-084-S2-6)". An em dash survives cp1252, but **cp437 and
    cp850 -- still live Windows console codepages -- cannot encode it**,
    and a stdout on one of those raises mid-print. That is the worst
    possible failure for this tool: it is invoked precisely when someone
    is trying to find out what is wrong.

    This module's OWN strings are ASCII by convention (there is a test);
    this guard covers the ones it merely relays, and it degrades the
    character rather than losing the line.
    """
    try:
        print(text)
    except UnicodeEncodeError:
        encoding = getattr(sys.stdout, "encoding", None) or "ascii"
        print(text.encode(encoding, "replace").decode(encoding, "replace"))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="close_preflight",
        description=(
            "Report every unmet close-out obligation for a session, in one "
            "pass, with no side effects and no routed call. Runnable at any "
            "time. Reports only -- it never refuses a close, and adds no "
            "gate: the verdict is derived from the same predicates "
            "close_session runs."
        ),
    )
    parser.add_argument(
        "--session-set-dir",
        required=True,
        help=(
            "Session-set directory, or a bare set number (e.g. 119) "
            "resolved against docs/session-sets."
        ),
    )
    parser.add_argument(
        "--session-number",
        type=int,
        default=None,
        help=(
            "The session you mean. An ASSERTION, not an override: the "
            "preflight always reports on the session close_session would "
            "close, and refuses the invocation when this does not match it "
            "(a number that steered only some rows would report on two "
            "sessions at once)."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the report as JSON on stdout.",
    )
    parser.add_argument(
        "--replay-history",
        action="store_true",
        help=(
            "Instead of preflighting a session, replay this preflight's "
            "coverage over every closeout_failed event in the corpus and "
            "report how many still-blocking failures it would have named "
            "first."
        ),
    )
    parser.add_argument(
        "--session-sets-root",
        default="docs/session-sets",
        help="Corpus root for --replay-history (default: docs/session-sets).",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.replay_history:
        result = replay_history(args.session_sets_root)
        if args.json:
            _emit(json.dumps(result.to_dict(), indent=2))
        else:
            _emit(render_replay(result))
        # A measurement is not a verdict: the replay always exits 0.
        return EXIT_OK

    try:
        session_set_dir = resolve_session_set_dir(args.session_set_dir)
    except SetResolutionError as exc:
        print(f"close_preflight: {exc}", file=sys.stderr)
        return EXIT_INVALID_INVOCATION
    if not os.path.isdir(session_set_dir):
        print(
            f"close_preflight: not a directory: {session_set_dir}",
            file=sys.stderr,
        )
        return EXIT_INVALID_INVOCATION

    mismatch = check_session_number(session_set_dir, args.session_number)
    if mismatch:
        print(f"close_preflight: {mismatch}", file=sys.stderr)
        return EXIT_INVALID_INVOCATION

    report = evaluate(session_set_dir)
    if args.json:
        _emit(json.dumps(report.to_dict(), indent=2))
    else:
        _emit(render(report))
    return report.exit_code


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
