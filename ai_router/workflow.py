"""The six-step driver: where work is, and every time it moved.

State is folded from an append-only event log rather than stored, so "how did
this get here" is always answerable and no field can be quietly corrected.

**Going backwards is ordinary.** There is no seventh step for it. Every step can
return work to an earlier one, and ``returned`` events are first-class: they
carry the reason and name the components affected. A process that models only
forward motion is one people work around the moment reality disagrees with it.

**The log is judged, not merely recorded.** One ``validate_transition`` decides
whether a move is legal and both the writer and the reader call it, so an
impossible move cannot be written and one that arrived by some other route
cannot be read back as history.

**The review loop is bounded and ends by itself.** A step gets at most
``verification.settings.max_rounds`` review rounds, resolved against the
workspace under discussion rather than the process's working directory. It
stops early the moment no blocking finding remains, and it then reaches
exactly one of the three terminal states of the session framework's code
review loop — verified, unresolved, or remediated at the cap. The terminal
state is computed from the log and the artifacts on disk; no event asserts it
and no caller can type one. Only rounds that reached a vendor are counted,
because the bound exists to stop an unattended loop spending on vendors.

**The tests loop is the same shape and a different meter.** The verifier
authors the tests and the framework runs them, so a test round is judged by
an exit code rather than by an opinion, and its bound is
``verification.settings.max_test_rounds``. It lands on the same three
terminal states, computed the same way: green is verified, and at the cap a
tree that has moved since the failing run is a repair the cap left unrun.

**The complete suite runs on that same meter, and a red one opens a fix
loop whose scope the framework holds.** A fix round is handed the failing
tests and nothing else, and may write only inside an envelope of the
session's own diff plus the files those failures implicate. Nothing here
asks a fix round for a finding: what it noticed on the way past is recorded
word for word and acted on by nobody.

**Only a step change opens a new loop.** Sending work back or carrying it
forward resets the round count. Re-entering the step the work is already in
is inert — it moves nothing, so it changes nothing, and treating it as a move
would be the cheapest way to spend past the cap. Authoring more tests does
not reset it either: re-authoring at the cap would be the same evasion
wearing a different name.

**The bound binds the writer, not the reader.** ``validate_transition`` does
not refuse a round for being over the cap: an operator who lowers the cap
would otherwise make yesterday's log unreadable, and a record the machine
cannot read back is the failure this log exists to prevent.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ai_router import verdict as verdictmod
from ai_router.config import (
    DEFAULT_TEST_ROUNDS, DEFAULT_VERIFICATION_ROUNDS, load_config,
    run_round_cap, verification_round_cap,
)
from ai_router.solution import (
    APPROVAL_STEPS, STEPS, STEP_TITLES, ManifestError,
)
from ai_router import solution as solmod

EXIT_OK = 0
EXIT_REFUSED = 1

LOG_RELPATH = Path(".dabbler") / "solution" / "events.jsonl"
PROJECTION_RELPATH = Path(".dabbler") / "solution" / "projection.json"
REVIEWS_RELDIR = Path(".dabbler") / "solution" / "reviews"

EVENTS = (
    "entered", "reviewed", "approved", "returned", "contract-changed",
    "tests-authored", "tested", "suite-run", "fixed",
)
SCOPES = ("solution", "component")

#: How each terminal state of the review loop reads. The keys are the closed
#: verdict vocabulary and nothing else: a fourth state would have to be added
#: to :data:`ai_router.verdict.SESSION_VERDICTS` first, which is the point.
TERMINAL_HEADLINES = {
    verdictmod.VERDICT_VERIFIED: "verified",
    verdictmod.VERDICT_ISSUES_FOUND: "unresolved at the cap",
    verdictmod.VERDICT_REMEDIATED_AT_CAP: "remediated at the cap",
}

#: How much of a red run's output the loop echoes. Enough to name what
#: failed; the whole run is in the record either way.
TEST_OUTPUT_TAIL_LINES = 40


class WorkflowError(Exception):
    pass


def log_path(root) -> Path:
    return Path(root) / LOG_RELPATH


def projection_path(root) -> Path:
    return Path(root) / PROJECTION_RELPATH


def reviews_dir(root) -> Path:
    return Path(root) / REVIEWS_RELDIR


def write_projection(root) -> Path:
    """Publish the projection the extension renders.

    TypeScript renders; Python decides. The extension never folds the event log
    itself, because two implementations of one rule disagree eventually and the
    disagreement shows up as a wrong status nobody can explain.
    """
    p = projection_path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(project(root), indent=2) + "\n", encoding="utf-8")
    return p


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _step_index(step, where: str) -> int:
    if step not in STEPS:
        raise WorkflowError(
            f"{where}: '{step}' is not one of {', '.join(STEPS)}")
    return STEPS.index(step)


def validate_transition(state, event: dict) -> None:
    """The one judge of whether a move is legal — on the write side and the
    read side both.

    ``append`` calls it so an impossible move is never written, and ``fold``
    calls it so an impossible move that reached the file by some other route
    cannot be read back as history. A log the writer guards and the reader
    trusts is a log that can be edited by hand.

    ``state`` is the folded state of this event's target, or ``None`` when
    the target has no history yet. A target with no history has not entered
    anything, so its first ``entered`` event is held to the first step: a
    log that may open at any step is a target recorded at the end with no
    history of getting there.
    """
    kind = event.get("event")
    if kind not in EVENTS:
        raise WorkflowError(f"unknown event '{kind}'")

    target = event.get("target") or "solution"
    current = (state or {}).get("step", STEPS[0])
    current_index = _step_index(current, f"{target}: current step")

    if kind == "entered":
        to = event.get("step")
        to_index = _step_index(to, f"{target}: entered")
        if state is None:
            if to_index != 0:
                raise WorkflowError(
                    f"{target}: cannot begin at {STEP_TITLES[to]} — work "
                    f"begins at {STEP_TITLES[STEPS[0]]} ('{STEPS[0]}') and "
                    f"reaches {STEP_TITLES[to]} one step at a time. The "
                    f"manifest's `step:` says where a target is shown before "
                    f"it has a log; it does not open one partway through."
                )
            return
        if to_index < current_index:
            raise WorkflowError(
                f"{target}: cannot enter {STEP_TITLES[to]} from "
                f"{STEP_TITLES[current]} — entering only moves forward. Going "
                f"back is `send-back --to {to} --reason ...`, which records "
                f"why it went back and what else it affects."
            )
        if to_index > current_index + 1:
            nxt = STEPS[current_index + 1]
            raise WorkflowError(
                f"{target}: cannot enter {STEP_TITLES[to]} from "
                f"{STEP_TITLES[current]} — steps are entered in order and the "
                f"next one is {STEP_TITLES[nxt]} ('{nxt}'). A skipped step is "
                f"work nobody did and nobody reviewed."
            )
        return

    if kind == "returned":
        to = event.get("toStep")
        to_index = _step_index(to, f"{target}: returned")
        if to_index >= current_index:
            raise WorkflowError(
                f"{target}: cannot return to {STEP_TITLES[to]} from "
                f"{STEP_TITLES[current]} — a return moves work backwards, and "
                f"forward is `enter`."
            )
        return

    if kind == "approved":
        if current not in APPROVAL_STEPS:
            raise WorkflowError(
                f"{target}: {STEP_TITLES[current]} is not a step a developer "
                f"signs off. The approval steps are "
                f"{', '.join(STEP_TITLES[s] for s in APPROVAL_STEPS)}."
            )
        if not (state or {}).get("reviewed"):
            raise WorkflowError(
                f"{target}: nothing live has been reviewed at "
                f"{STEP_TITLES[current]}, so there is no reading to approve "
                f"over. A scripted review does not count as one."
            )
        return

    step = event.get("step")
    if step is not None:
        _step_index(step, f"{target}: {kind}")
        if step != current:
            raise WorkflowError(
                f"{target}: a '{kind}' event names {STEP_TITLES[step]} but the "
                f"work is at {STEP_TITLES[current]}. An event about a step the "
                f"work is not in is an event about other work."
            )

    if kind == "tested" and not (state or {}).get("testsAuthored"):
        raise WorkflowError(
            f"{target}: no test has been authored at {STEP_TITLES[current]}, "
            f"so there is nothing here the verifier wrote. The tests phase "
            f"runs tests the author did not write — a run of the author's "
            f"own tests recorded as this phase would prove the one thing the "
            f"split exists to stop it proving. Run `workflow author-tests` "
            f"first."
        )

    if kind == "suite-run" and not (state or {}).get("testsAuthored"):
        raise WorkflowError(
            f"{target}: no test has been authored at {STEP_TITLES[current]}, "
            f"so this would be the suite as it stood before the verifier "
            f"read anything. The complete suite runs against the tree "
            f"including the tests it wrote. Run `workflow author-tests` "
            f"first."
        )

    if kind == "fixed":
        last = (state or {}).get("lastSuiteRun") or {}
        if not last or last.get("green"):
            raise WorkflowError(
                f"{target}: no failing suite run at {STEP_TITLES[current]}, "
                f"so this round would have no named failure to answer. A fix "
                f"round without one is a model invited to revise whatever it "
                f"notices, which is the one thing the envelope exists to "
                f"prevent. Run `workflow suite` first."
            )


def append(root, event: dict) -> dict:
    """Machine-written only. Never edited, never corrected in place."""
    target = event.get("target") or "solution"
    validate_transition(fold(read(root)).get(target), event)
    p = log_path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    event = dict(event)
    event.setdefault("at", _now())
    with p.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, sort_keys=True) + "\n")
    return event


def read(root) -> list:
    p = log_path(root)
    if not p.is_file():
        return []
    out = []
    for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError as e:
            raise WorkflowError(f"{p}:{i} is not valid JSON: {e}") from e
    return out


def fold(events: list) -> dict:
    """Current state per target, plus what is waiting on a person."""
    state = {}
    for e in events:
        key = e.get("target") or "solution"
        validate_transition(state.get(key), e)
        s = state.setdefault(key, {
            "step": STEPS[0], "reviewed": False, "approved": False,
            "returns": 0, "history": [], "waitingOn": None,
            "findings": [], "reviewers": [], "reviewRounds": 0,
            "lastLiveReview": None, "reviewWaitingOn": None,
            "testsAuthored": [], "testRounds": 0, "lastTestRun": None,
            "suiteRounds": 0, "lastSuiteRun": None, "fixRounds": 0,
        })
        kind = e["event"]
        s["history"].append(e)
        if kind == "entered":
            if e["step"] == s["step"]:
                # Re-entering the step the work is already in moves nothing,
                # so it changes nothing. Clearing the review here while the
                # round that produced it still stood left the step unable to
                # be approved (no live review) and unable to be reviewed
                # again (the loop had closed) -- refused twice, for opposite
                # reasons. The event stays in the history; it just is not a
                # move.
                continue
            s["step"] = e["step"]
            s["reviewed"] = False
            s["approved"] = False
            s["waitingOn"] = None
            s["findings"] = []
            s["reviewers"] = []
            # A step change opens a new loop: the rounds spent on what the
            # last step produced are not spent against this one.
            s["reviewRounds"] = 0
            s["lastLiveReview"] = None
            s["reviewWaitingOn"] = None
            _open_test_loop(s)
        elif kind == "reviewed":
            # A scripted review is a rehearsal, not a reading. It is recorded
            # in full and it satisfies nothing a live review satisfies -- the
            # flag was written here and never read, so a response served from
            # a file cleared the same gate two vendors clear.
            s["reviewed"] = not e.get("simulated", False)
            s["findings"] = e.get("findings", [])
            s["reviewers"] = e.get("reviewers", [])
            if reached_a_vendor(e):
                s["reviewRounds"] += 1
                s["lastLiveReview"] = e
            # The gate outranks the block. A step the developer signs off
            # reaches the developer even when the reviewers are still
            # objecting -- that is the whole reason the gate exists. Left the
            # other way round, a reviewer that keeps finding new Major issues
            # holds the work forever and the human who could settle it is
            # never asked.
            if e.get("needsApproval"):
                s["waitingOn"] = "developer"
            elif e.get("verdict") == "blocked":
                s["waitingOn"] = "author"
            else:
                s["waitingOn"] = None
            # Kept so a green test round can hand the work back to whoever
            # the review left it with, instead of clearing a gate the tests
            # know nothing about.
            s["reviewWaitingOn"] = s["waitingOn"]
        elif kind == "approved":
            s["approved"] = True
            s["waitingOn"] = None
            s["reviewWaitingOn"] = None
        elif kind == "returned":
            s["step"] = e["toStep"]
            s["reviewed"] = False
            s["approved"] = False
            s["returns"] += 1
            s["waitingOn"] = "author"
            s["findings"] = []
            s["reviewers"] = []
            s["reviewRounds"] = 0
            s["lastLiveReview"] = None
            s["reviewWaitingOn"] = "author"
            _open_test_loop(s)
        elif kind == "tests-authored":
            # Accumulated, never replaced: a second hand-off adds files, and
            # a file the first round wrote still has to pass.
            s["testsAuthored"] = sorted(set(s["testsAuthored"]).union(
                e.get("written") or []
            ))
        elif kind == "tested":
            s["testRounds"] += 1
            s["lastTestRun"] = e
            # A red run leaves the work with the author. A green one is not
            # an answer about who is waited on: the review's own answer, gate
            # or block, still stands, and clearing it here would make an
            # approval a developer owes disappear because a suite passed.
            s["waitingOn"] = (
                s["reviewWaitingOn"] if e.get("green") else "author"
            )
        elif kind == "suite-run":
            s["suiteRounds"] += 1
            s["lastSuiteRun"] = e
            s["waitingOn"] = (
                s["reviewWaitingOn"] if e.get("green") else "author"
            )
        elif kind == "fixed":
            # Counted, not judged. A fix round proves nothing by itself --
            # the suite run after it does -- but a step that took six fixes
            # to go green reads differently at planning time than one that
            # took one, and the count is what says so.
            s["fixRounds"] += 1
        elif kind == "contract-changed":
            s["waitingOn"] = "developer" if e.get("needsApproval") else None
    return state


def _open_test_loop(s: dict) -> None:
    """Start this target's tests phase and its suite loop over.

    Called wherever the work moves, and nowhere else. Tests authored against
    what the last step produced answer for that step, so carrying them
    forward would run yesterday's proof against today's code and read the
    result as this step's. The suite loop goes with them: it is the same
    tests, run whole.
    """
    s["testsAuthored"] = []
    s["testRounds"] = 0
    s["lastTestRun"] = None
    s["suiteRounds"] = 0
    s["lastSuiteRun"] = None
    s["fixRounds"] = 0


def _project_review_loop(node: dict, root, state: dict, cap: int) -> None:
    """Publish the loop's position, decided here.

    TypeScript renders; Python decides. The extension is handed the round
    count, the bound and the terminal token rather than the events, because
    a second implementation of "has this loop finished" disagrees with the
    first eventually, and the disagreement shows up as a status nobody can
    explain.
    """
    terminal = review_terminal(root, state, cap)
    node["reviewRounds"] = state.get("reviewRounds", 0)
    node["reviewCap"] = cap
    node["reviewTerminal"] = terminal
    node["reviewTerminalLabel"] = (
        TERMINAL_HEADLINES[terminal] if terminal else None
    )


def _project_test_loop(node: dict, root, state: dict, cap: int) -> None:
    """The tests phase's position, on the same terms and for the same
    reason."""
    terminal = run_terminal(root, state, cap)
    node["testsAuthored"] = list(state.get("testsAuthored") or [])
    node["testRounds"] = state.get("testRounds", 0)
    node["testCap"] = cap
    node["testTerminal"] = terminal
    node["testTerminalLabel"] = (
        TERMINAL_HEADLINES[terminal] if terminal else None
    )


def _project_suite_loop(node: dict, root, state: dict, cap: int) -> None:
    """The complete suite's position, and how many fix rounds it cost.

    The fix count is published beside the round count because the two answer
    different questions: how close the loop came to its bound, and how much
    repair the step needed to get there.
    """
    terminal = suite_terminal(root, state, cap)
    node["suiteRounds"] = state.get("suiteRounds", 0)
    node["suiteCap"] = cap
    node["fixRounds"] = state.get("fixRounds", 0)
    node["suiteTerminal"] = terminal
    node["suiteTerminalLabel"] = (
        TERMINAL_HEADLINES[terminal] if terminal else None
    )


def project(root) -> dict:
    """What the Explorer reads: the manifest, joined to live state."""
    try:
        solution = solmod.load(root)
    except ManifestError as e:
        raise WorkflowError(str(e)) from e

    state = fold(read(root))
    cap = review_cap(root)
    tcap = run_cap(root)
    doc = solmod.as_dict(solution)
    sol_state = state.get("solution", {})
    doc["solution"]["waitingOn"] = sol_state.get("waitingOn")
    doc["solution"]["returns"] = sol_state.get("returns", 0)
    doc["solution"]["reviewers"] = sol_state.get("reviewers", [])
    doc["solution"]["findings"] = sol_state.get("findings", [])
    _project_review_loop(doc["solution"], root, sol_state, cap)
    _project_test_loop(doc["solution"], root, sol_state, tcap)
    _project_suite_loop(doc["solution"], root, sol_state, tcap)
    if sol_state.get("step"):
        doc["solution"]["step"] = sol_state["step"]
        doc["solution"]["stepTitle"] = STEP_TITLES[sol_state["step"]]
        doc["solution"]["stepNumber"] = STEPS.index(sol_state["step"]) + 1

    for c in doc["components"]:
        cs = state.get(c["name"], {})
        if cs.get("step"):
            c["step"] = cs["step"]
            c["stepTitle"] = STEP_TITLES[cs["step"]]
            c["stepNumber"] = STEPS.index(cs["step"]) + 1
        c["waitingOn"] = cs.get("waitingOn")
        c["returns"] = cs.get("returns", 0)
        c["reviewed"] = cs.get("reviewed", False)
        c["approved"] = cs.get("approved", False)
        c["reviewers"] = cs.get("reviewers", [])
        c["findings"] = cs.get("findings", [])
        _project_review_loop(c, root, cs, cap)
        _project_test_loop(c, root, cs, tcap)
        _project_suite_loop(c, root, cs, tcap)

    waiting = [c["name"] for c in doc["components"] if c["waitingOn"] == "developer"]
    if doc["solution"]["waitingOn"] == "developer":
        waiting.insert(0, doc["solution"]["name"])
    doc["needsYou"] = waiting
    return doc



def require_state(root, target: str) -> dict:
    """The folded state of a target that has begun, or a refusal.

    Reviewing work that has not entered a step records a verdict about
    nothing, so every caller that needs the target's position comes through
    here and gets the same refusal.
    """
    state = fold(read(root)).get(target)
    if not state:
        raise WorkflowError(
            f"'{target}' has not entered a step yet. Run "
            f"`workflow enter <step>` first — reviewing work that has not "
            f"begun records a verdict about nothing."
        )
    return state


def current_step(root, target: str) -> str:
    """Where the target is now, per the log. A review is of the step the work
    is actually in, never of a step named on the command line — a caller who
    can name the step can review the wrong one and file it as the right one."""
    return require_state(root, target)["step"]


# --- The bounded review loop -------------------------------------------------

def reached_a_vendor(event: dict) -> bool:
    """Whether a ``reviewed`` event cost anything to produce.

    The cap exists to stop an unattended loop calling vendors, so a round
    served entirely from a script is not counted against it — and a round
    with one scripted reader and one live one is, because it spent. An event
    that says neither is counted: a bound a malformed record can decline is
    not a bound.
    """
    if "live" in event:
        return bool(event["live"])
    reviewers = event.get("reviewers")
    if reviewers:
        return any(not r.get("simulated") for r in reviewers)
    return not event.get("simulated", False)


def review_cap(root) -> int:
    """The bound configured for ``root``, resolved through the one resolver
    every loop uses.

    The workspace is passed rather than assumed. ``--workspace-root`` and
    ``project(root)`` are first-class entrypoints, so reading the overlay
    from whatever directory the process happens to be sitting in would let a
    repository's configured cap be enforced against a different repository's
    number — and displayed as that number too.

    A config that cannot be loaded falls back to the shipped default rather
    than to no bound, because the projection is a view and a config problem
    must not make it unreadable.
    """
    try:
        return verification_round_cap(load_config(project_dir=str(root)))
    except Exception:
        return DEFAULT_VERIFICATION_ROUNDS


def run_cap(root) -> int:
    """How many times the tests phase may run before its loop terminates,
    resolved on the same terms as :func:`review_cap` and from the same
    workspace.

    Named for what it counts rather than for the phase: a ``test_``-prefixed
    module attribute is collected by pytest wherever it is imported, and a
    bound that reports itself as a failing test is worse than a clumsy name.
    """
    try:
        return run_round_cap(load_config(project_dir=str(root)))
    except Exception:
        return DEFAULT_TEST_ROUNDS


def blocking_findings(event: dict) -> list:
    """The findings of a round that block, decided by
    :mod:`ai_router.verdict`. There is one implementation of "does this
    finding block" and this module is not it."""
    return [
        f for f in event.get("findings") or []
        if verdictmod.is_blocking_issue(f)
    ]


def changed_artifacts(root, digests: dict) -> list:
    """The reviewed artifacts whose content is no longer what the round read.

    An artifact that has gone counts as changed, on the same terms a diff
    would report a deletion: the thing the round looked at is not there any
    more. What that proves is decided per finding by
    :func:`ai_router.verdict.unremediated_findings`, not here.
    """
    from ai_router.stepreview import digest_text

    changed = []
    for path, recorded in (digests or {}).items():
        p = Path(path)
        if not p.is_absolute():
            p = Path(root) / path
        try:
            current = digest_text(p.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            changed.append(path)
            continue
        if current != recorded:
            changed.append(path)
    return changed


def review_terminal(root, state: dict, cap: int) -> Optional[str]:
    """Which terminal state this target's current step has reached, or
    ``None`` while its loop is still open.

    Derived from the folded log and the artifacts on disk. Nothing writes it,
    no event asserts it, and the answer goes back through the closed verdict
    vocabulary on the way out — so there is no terminal state a caller can
    type and no fourth one this module can invent.

    The three, and how each is decided:

    - **Verified** — the last live round left no blocking finding. Minor-only
      lands here, which is the early stop: prose review has no bottom and
      grinding rounds against wording is what the severity vocabulary exists
      to prevent.
    - **Remediated at the cap** — the cap is reached, and every blocking
      finding of the last round cited an artifact that has changed since that
      round read it. The work stands, labelled unreviewed. It is not a
      waiver: nothing was accepted over a finding that still stood, and what
      is unproved is the repair rather than the complaint.
    - **Unresolved** — the cap is reached and at least one blocking finding
      cannot be shown answered. A round that blocked without naming a single
      parseable finding lands here too, because there is nothing to have
      fixed and a clean-looking exit off an unreadable round is the laundering
      route the fail-closed rule exists to shut.
    """
    last = (state or {}).get("lastLiveReview")
    if not last:
        return None
    if last.get("verdict") != "blocked":
        return verdictmod.validate_session_verdict(verdictmod.VERDICT_VERIFIED)
    if (state.get("reviewRounds") or 0) < cap:
        return None
    blocking = blocking_findings(last)
    changed = changed_artifacts(root, last.get("artifactDigests") or {})
    token = (
        verdictmod.VERDICT_ISSUES_FOUND
        if not blocking or verdictmod.unremediated_findings(blocking, changed)
        else verdictmod.VERDICT_REMEDIATED_AT_CAP
    )
    return verdictmod.validate_session_verdict(token)


def _terminal_refusal(target: str, step: str, state: dict,
                      terminal: str, cap: int) -> str:
    rounds = state.get("reviewRounds") or 0
    detail = ""
    if terminal == verdictmod.VERDICT_ISSUES_FOUND:
        unshown = blocking_findings(state.get("lastLiveReview") or {})
        detail = "".join(
            f"\n  - [{f.get('severity')}] {str(f.get('description', ''))[:160]}"
            for f in unshown
        )
    return (
        f"{target} — {STEP_TITLES[step]}: {TERMINAL_HEADLINES[terminal]} "
        f"after {rounds} round(s), cap {cap}. This step's review loop is "
        f"closed and no further round opens on it.{detail}\n"
        "Nobody is asked whether it should continue — that is the bound "
        "doing its job, not a decision waiting on someone. Move the work "
        "instead: `workflow send-back --to <step> --reason ...` returns it "
        "to the author, `workflow enter <next step>` carries it forward. "
        "Either one opens a new loop with its rounds back at zero."
    )


# --- The bounded tests loop --------------------------------------------------

def _print_runs(target: str, step: str, runs) -> None:
    """One line per suite that ran. Named per suite rather than summarised:
    a repository with two ecosystems has two commands, and a reader told
    only the aggregate cannot tell which runner said what."""
    for run in runs:
        print(f"{target} — {STEP_TITLES[step]}: {run.command}")
        print(f"  exit {run.exit_code} in {run.duration_seconds}s "
              f"({'green' if run.green else 'red'})")
        if run.tree_mutated:
            print("  the run changed the tree it was measuring, so it did "
                  "not measure the tree anyone is about to commit")


def _run_rows(runs) -> dict:
    """One event's worth of fields from however many suite runs it took.

    A repository running two ecosystems has two runners, so a round is a
    tuple of runs rather than one. The scalars are the aggregate and say so:
    green is every run green, and the exit code and command are the first
    failing run's, because that is the one a reader has to go and look at.
    ``postTreeDigest`` is the tree the *last* run left, which is what the
    terminal-state comparison means by "the tree the run left behind".
    ``runs`` carries each suite's own row, so nothing is summarised away.
    """
    failed = next((r for r in runs if not r.green), None)
    speaker = failed or runs[-1]
    return {
        "green": all(r.green for r in runs),
        "exitCode": speaker.exit_code,
        "outcome": speaker.outcome,
        "command": speaker.command,
        "suite": speaker.check.name,
        "treeDigest": runs[0].tree_digest,
        "postTreeDigest": runs[-1].post_tree_digest,
        "treeMutated": any(r.tree_mutated for r in runs),
        "timedOut": any(r.timed_out for r in runs),
        "durationSeconds": sum(r.duration_seconds or 0 for r in runs),
        "runs": [
            {"suite": r.check.name, "command": r.command,
             "green": r.green, "exitCode": r.exit_code,
             "outcome": r.outcome, "treeDigest": r.tree_digest,
             "postTreeDigest": r.post_tree_digest,
             "treeMutated": r.tree_mutated, "timedOut": r.timed_out,
             "durationSeconds": r.duration_seconds}
            for r in runs
        ],
    }



def run_terminal(root, state: dict, cap: int, *,
                 run_key: str = "lastTestRun",
                 rounds_key: str = "testRounds") -> Optional[str]:
    """Which terminal state a run loop has reached, or ``None`` while it is
    still open.

    One implementation for both loops that are decided by an exit code — the
    tests phase and the complete suite — because they differ only in which
    run they read. A second copy would eventually disagree with this one,
    and the disagreement would appear as two loops that ended differently on
    the same facts.

    The same three states as the review loop and the same closed vocabulary,
    decided against an exit code instead of an opinion:

    - **Verified** — the last run was green. Green is green: there is no
      severity to weigh and no early stop to make, because a passing suite
      is already the cheapest possible ending.
    - **Remediated at the cap** — the cap is reached on a red run, and the
      tree has moved since that run finished. Something was repaired and the
      bound left the repair unrun. It is not a waiver: no failure was
      accepted, and what is unproved is the fix.
    - **Unresolved** — the cap is reached, and the tree is the one the run
      left behind. Nothing has been done about it, and a run that could not
      name the tree it left lands here too: a state that cannot be compared
      is not evidence of a repair.

    The comparison is against the tree **after** the run rather than the one
    it was measuring, so a suite that dirties the worktree cannot label its
    own side effect a repair. Such a run is already failed evidence; it must
    not also be the cheapest way out of an unresolved loop.
    """
    last = (state or {}).get(run_key)
    if not last:
        return None
    if last.get("green"):
        return verdictmod.validate_session_verdict(verdictmod.VERDICT_VERIFIED)
    if (state.get(rounds_key) or 0) < cap:
        return None
    from ai_router.checks import snapshot_worktree_tree

    left = last.get("postTreeDigest")
    current = snapshot_worktree_tree(root)
    token = (
        verdictmod.VERDICT_REMEDIATED_AT_CAP
        if left and current and current != left
        else verdictmod.VERDICT_ISSUES_FOUND
    )
    return verdictmod.validate_session_verdict(token)


def suite_terminal(root, state: dict, cap: int) -> Optional[str]:
    """The complete suite's loop, on the tests loop's own terms. §3.d ends
    "same cap and same ending as c.ii", so it is the same function."""
    return run_terminal(
        root, state, cap, run_key="lastSuiteRun", rounds_key="suiteRounds"
    )


def _run_terminal_refusal(target: str, step: str, state: dict,
                          terminal: str, cap: int, *, what: str = "tests",
                          rounds_key: str = "testRounds",
                          run_key: str = "lastTestRun") -> str:
    rounds = state.get(rounds_key) or 0
    last = state.get(run_key) or {}
    detail = ""
    if terminal == verdictmod.VERDICT_ISSUES_FOUND:
        detail = (
            f"\n  last run: exit {last.get('exitCode')} on "
            f"{last.get('command')}"
        )
    return (
        f"{target} — {STEP_TITLES[step]}: {what} "
        f"{TERMINAL_HEADLINES[terminal]} after {rounds} round(s), cap {cap}. "
        f"This step's {what} loop is closed and no further round opens on "
        f"it.{detail}\n"
        "Authoring more tests does not reopen it — that would be spending "
        "past the bound by another name. Move the work instead: "
        "`workflow send-back --to <step> --reason ...` returns it to the "
        "author, `workflow enter <next step>` carries it forward."
    )


def file_review(root, target: str, step: str, raws: list, kind: str = "") -> list:
    """Write each model's reply verbatim. A summary is not a record, and a
    finding — or a test file — that only exists as someone's paraphrase
    cannot be re-read."""
    out_dir = reviews_dir(root)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = _now().replace(":", "").replace("-", "")
    stem = f"{target}-{step}" + (f"-{kind}" if kind else "")
    written = []
    for i, raw in enumerate(raws, 1):
        path = out_dir / f"{stem}-{stamp}-r{i}.md"
        path.write_text(raw, encoding="utf-8")
        written.append(str(path))
    return written


def _run_review(args, root) -> int:
    from ai_router import stepreview

    target = _target(args)
    state = require_state(root, target)
    step = state["step"]
    cap = review_cap(root)
    terminal = review_terminal(root, state, cap)
    if terminal is not None:
        raise WorkflowError(
            _terminal_refusal(target, step, state, terminal, cap)
        )

    outcome, raws = stepreview.review(
        target=target, step=step, artifact_paths=args.artifact,
        author_provider=args.author_provider, transport=args.transport,
    )
    filed = file_review(root, target, step, raws)

    append(root, {
        "event": "reviewed", "target": target, "step": step,
        "verdict": outcome.verdict,
        "reviewers": [r.as_dict() for r in outcome.reviewers],
        "findings": outcome.findings,
        "artifacts": outcome.artifacts,
        # What each artifact contained when this round read it. The next
        # terminal decision compares against these rather than asking
        # anyone whether a finding was addressed.
        "artifactDigests": dict(outcome.artifact_digests),
        "records": filed,
        "simulated": outcome.simulated,
        # Whether this round reached a vendor, and so whether it counts
        # against the cap. Recorded rather than inferred later.
        "live": outcome.live,
        "needsApproval": step in APPROVAL_STEPS,
    })
    try:
        write_projection(root)
    except (WorkflowError, ManifestError):
        pass

    if outcome.simulated:
        print("  SCRIPTED REVIEW — served from a response file, not a vendor. "
              "This round is not cross-vendor evidence.")
    for r in outcome.reviewers:
        mark = "blocks" if r.blocking else "clear"
        print(f"  {r.model}/{r.provider}: {r.verdict} ({mark})")
    print(f"{target} — {STEP_TITLES[step]}: {outcome.verdict}")
    kept = len(outcome.findings)
    if kept:
        print(f"  {kept} finding(s) recorded, every severity kept")
    for path in filed:
        print(f"  filed {path}")

    after = fold(read(root)).get(target) or {}
    reached = review_terminal(root, after, cap)
    spent = after.get("reviewRounds") or 0
    if reached is not None:
        print(f"  loop closed: {TERMINAL_HEADLINES[reached]} "
              f"({spent}/{cap} rounds)")
    elif outcome.live:
        print(f"  round {spent} of {cap}")

    if step in APPROVAL_STEPS:
        if outcome.blocked:
            print("  waiting on you: approve over these, or send it back")
        else:
            print("  waiting on you to approve")
    elif outcome.blocked:
        print("  back with the author")
    return EXIT_OK


def _loop_label(node: dict, prefix: str = "review") -> str:
    """Where a loop stands, whether or not it has opened or closed.

    Shown unconditionally. A count is most useful before the loop ends —
    it is what says how much room is left — so hiding it until the first
    round or until the loop closes withholds it exactly when it is worth
    reading.
    """
    position = f"{node[prefix + 'Rounds']}/{node[prefix + 'Cap']} rounds"
    if node[prefix + "Terminal"]:
        return f"{node[prefix + 'TerminalLabel']}, {position}"
    return f"open, {position}"


def _tests_position(root, target: str, cap: int) -> None:
    after = fold(read(root)).get(target) or {}
    reached = run_terminal(root, after, cap)
    spent = after.get("testRounds") or 0
    if reached is not None:
        print(f"  loop closed: tests {TERMINAL_HEADLINES[reached]} "
              f"({spent}/{cap} rounds)")
    else:
        print(f"  round {spent} of {cap}")


def _suite_position(root, target: str, cap: int) -> None:
    after = fold(read(root)).get(target) or {}
    reached = suite_terminal(root, after, cap)
    spent = after.get("suiteRounds") or 0
    if reached is not None:
        print(f"  loop closed: suite {TERMINAL_HEADLINES[reached]} "
              f"({spent}/{cap} rounds)")
    else:
        print(f"  round {spent} of {cap}")


def _refuse_if_tests_loop_closed(root, target: str, state: dict,
                                 cap: int) -> None:
    terminal = run_terminal(root, state, cap)
    if terminal is not None:
        raise WorkflowError(_run_terminal_refusal(
            target, state["step"], state, terminal, cap
        ))


def _refuse_if_suite_loop_closed(root, target: str, state: dict,
                                 cap: int) -> None:
    terminal = suite_terminal(root, state, cap)
    if terminal is not None:
        raise WorkflowError(_run_terminal_refusal(
            target, state["step"], state, terminal, cap, what="suite",
            rounds_key="suiteRounds", run_key="lastSuiteRun",
        ))


def _run_author_tests(args, root) -> int:
    """The hand-off. The verifier is asked for files and nothing else, and
    the framework is what opens one."""
    from ai_router import testphase

    target = _target(args)
    state = require_state(root, target)
    step = state["step"]
    cap = run_cap(root)
    _refuse_if_tests_loop_closed(root, target, state, cap)

    try:
        authoring, raw = testphase.author(
            root, target, step, args.artifact,
            load_config(project_dir=str(root)),
            author_provider=args.author_provider, transport=args.transport,
        )
    except testphase.PhaseError as exc:
        raise WorkflowError(str(exc)) from exc

    filed = file_review(root, target, step, [raw], kind="tests")
    append(root, {
        "event": "tests-authored", "target": target, "step": step,
        "written": list(authoring.written),
        "author": authoring.as_dict(),
        "records": filed,
        "simulated": authoring.simulated,
    })
    try:
        write_projection(root)
    except (WorkflowError, ManifestError):
        pass

    if authoring.simulated:
        print("  SCRIPTED AUTHORING — served from a response file, not a "
              "vendor. These tests were not written by another vendor.")
    print(f"{target} — {STEP_TITLES[step]}: tests authored by "
          f"{authoring.model}/{authoring.provider}")
    for write in authoring.writes:
        if write.accepted:
            print(f"  {write.action} {write.path} ({write.bytes_written} bytes)")
        else:
            print(f"  refused {write.path}: {write.reason}")
    for path in filed:
        print(f"  filed {path}")
    if not authoring.written:
        print("  nothing was written, so there is nothing to run. The record "
              "carries every refusal above.")
    return EXIT_OK


def _run_tests(args, root) -> int:
    """The framework's half: run what the verifier wrote and record what the
    exit code said. No opinion is solicited and none is recorded."""
    from ai_router import testphase

    target = _target(args)
    state = require_state(root, target)
    step = state["step"]
    cap = run_cap(root)
    _refuse_if_tests_loop_closed(root, target, state, cap)
    # The same judge the log is read back through. A run with nothing
    # authored is refused here rather than after it has already happened.
    validate_transition(state, {"event": "tested", "target": target,
                                "step": step})

    authored = list(state.get("testsAuthored") or [])
    try:
        runs = testphase.run_authored(
            root, load_config(project_dir=str(root)), authored
        )
    except testphase.PhaseError as exc:
        raise WorkflowError(str(exc)) from exc

    # The tree the runs measured, and the one they left behind. Whether a
    # later fix is unrun is decided against the second: a suite that dirtied
    # the worktree must not be able to call its own side effect a repair.
    append(root, {
        "event": "tested", "target": target, "step": step,
        "tests": authored, **_run_rows(runs),
    })
    try:
        write_projection(root)
    except (WorkflowError, ManifestError):
        pass

    _print_runs(target, step, runs)
    if not all(r.green for r in runs):
        tail = [
            line for r in runs
            for line in (r.output or "").splitlines() if line.strip()
        ]
        for line in tail[-TEST_OUTPUT_TAIL_LINES:]:
            print(f"  | {line}")
        print("  back with the author")
    _tests_position(root, target, cap)
    return EXIT_OK


def _run_suite(args, root) -> int:
    """The complete suite against the tree the verifier's tests are in, and
    what its exit code said. No opinion is solicited and none is recorded."""
    from ai_router import fixloop

    target = _target(args)
    state = require_state(root, target)
    step = state["step"]
    cap = run_cap(root)
    _refuse_if_suite_loop_closed(root, target, state, cap)
    # The same judge the log is read back through, applied before the suite
    # runs rather than after it has already been paid for.
    validate_transition(state, {"event": "suite-run", "target": target,
                                "step": step})

    config = load_config(project_dir=str(root))
    authored = list(state.get("testsAuthored") or [])
    try:
        selection = fixloop.selection_for(config)
        runs = fixloop.run_suite(root, config, authored)
    except fixloop.FixLoopError as exc:
        raise WorkflowError(str(exc)) from exc

    # Every suite's output, in order. A fix round reads all of it: a failure
    # in the second ecosystem is not less of a failure for arriving second.
    output = "\n".join(r.output or "" for r in runs)
    failing = fixloop.failures(output, selection, root)
    # Filed verbatim: the fix round reads this, and a summary is not a
    # record of what a runner said.
    filed = file_review(root, target, step, [output], kind="suite")
    append(root, {
        "event": "suite-run", "target": target, "step": step,
        "tests": authored,
        "failures": [{"name": f.name, "path": f.path} for f in failing],
        "records": filed, **_run_rows(runs),
    })
    try:
        write_projection(root)
    except (WorkflowError, ManifestError):
        pass

    _print_runs(target, step, runs)
    for failure in failing:
        print(f"  failed {failure.name}")
    if not all(r.green for r in runs) and not failing:
        print("  the run failed and named no test this parser recognised, "
              "so no fix round can be scoped to a failure")
    for path in filed:
        print(f"  filed {path}")
    _suite_position(root, target, cap)
    return EXIT_OK


def _last_suite_output(root, event: dict) -> str:
    """What the failing run said, read back from the file it was filed to.

    The event carries the path rather than the text. A run's output is
    unbounded and the log is read whole on every fold; the fix round is the
    only reader that needs the bytes.
    """
    for path in event.get("records") or []:
        try:
            return Path(path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
    return ""


def _run_fix(args, root) -> int:
    """One fix round, confined to the envelope. The framework decides what
    may be written; the prompt only describes what it decided."""
    from ai_router import fixloop

    target = _target(args)
    state = require_state(root, target)
    step = state["step"]
    cap = run_cap(root)
    _refuse_if_suite_loop_closed(root, target, state, cap)
    validate_transition(state, {"event": "fixed", "target": target,
                                "step": step})

    config = load_config(project_dir=str(root))
    last = state["lastSuiteRun"]
    output = _last_suite_output(root, last)
    try:
        selection = fixloop.selection_for(config)
        failing = fixloop.failures(output, selection, root)
        envelope = fixloop.build_envelope(root, args.base, output, selection)
        round_, raw = fixloop.fix(
            root, config, failing=failing, output=output, envelope=envelope,
            transport=args.transport,
        )
    except fixloop.FixLoopError as exc:
        raise WorkflowError(str(exc)) from exc

    filed = file_review(root, target, step, [raw], kind="fix")
    append(root, {
        "event": "fixed", "target": target, "step": step,
        "failures": [f.name for f in failing],
        "envelope": envelope.as_dict(),
        "fixer": round_.as_dict(),
        "written": list(round_.written),
        # Recorded and acted on by nobody. An erased observation leaves
        # nothing a human can overrule.
        "observations": list(round_.observations),
        "records": filed,
        "simulated": round_.simulated,
    })
    try:
        write_projection(root)
    except (WorkflowError, ManifestError):
        pass

    if round_.simulated:
        print("  SCRIPTED FIX — served from a response file, not a vendor.")
    print(f"{target} — {STEP_TITLES[step]}: fix round by "
          f"{round_.model}/{round_.provider}")
    print(f"  envelope: {len(envelope.paths)} path(s), "
          f"{len(envelope.implicated)} implicated by the failures")
    for write in round_.writes:
        if write.accepted:
            print(f"  {write.action} {write.path} ({write.bytes_written} bytes)")
        else:
            print(f"  refused {write.path}: {write.reason}")
    for note in round_.observations:
        print(f"  observed (not acted on): {note[:160]}")
    for path in filed:
        print(f"  filed {path}")
    print("  run `workflow suite` again: what a fix proves is the next run, "
          "not the fix")
    return EXIT_OK


def _target_args(ap):
    ap.add_argument("--component", help="omit for the solution as a whole")
    ap.add_argument("--workspace-root", default=".")

def _target(args) -> str:
    return args.component or "solution"


def _main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m ai_router.workflow")
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("enter", help="begin a step")
    e.add_argument("step", choices=STEPS)
    _target_args(e)

    r = sub.add_parser(
        "review",
        help="send this step's output to two vendors and record what they said")
    r.add_argument("--artifact", action="append", default=[], required=True,
                   help="a file this step produced; repeatable")
    r.add_argument("--author-provider",
                   help="the provider that wrote the work, excluded from review")
    r.add_argument("--transport")
    _target_args(r)

    a = sub.add_parser("approve", help="record the developer's approval")
    _target_args(a)

    at = sub.add_parser(
        "author-tests",
        help="ask a verifier for this step's tests and write the ones the "
             "boundary allows")
    at.add_argument("--artifact", action="append", default=[], required=True,
                    help="a file this step produced; repeatable")
    at.add_argument("--author-provider",
                    help="the provider that wrote the work, excluded from "
                         "authoring its tests")
    at.add_argument("--transport")
    _target_args(at)

    t = sub.add_parser(
        "test", help="run the authored tests and record the exit code")
    _target_args(t)

    su = sub.add_parser(
        "suite",
        help="run the complete suite against the tree including the "
             "authored tests")
    _target_args(su)

    fx = sub.add_parser(
        "fix",
        help="one fix round for the failing suite, confined to the envelope")
    fx.add_argument("--base", default="HEAD",
                    help="the tree the session's own diff is measured "
                         "against; defaults to HEAD")
    fx.add_argument("--transport")
    _target_args(fx)

    b = sub.add_parser("send-back", help="return work to an earlier step")
    b.add_argument("--to", required=True, choices=STEPS, dest="to_step")
    b.add_argument("--reason", required=True)
    b.add_argument("--affects", default="", help="comma-separated components")
    _target_args(b)

    c = sub.add_parser("contract-changed", help="a contract moved; name the consumers")
    c.add_argument("--version", required=True)
    c.add_argument("--affects", default="")
    c.add_argument("--needs-approval", action="store_true")
    _target_args(c)

    s = sub.add_parser("status")
    s.add_argument("--workspace-root", default=".")
    s.add_argument("--json", action="store_true")

    args = ap.parse_args(argv)
    root = args.workspace_root

    try:
        if args.cmd == "status":
            doc = project(root)
            if args.json:
                print(json.dumps(doc, indent=2))
                return EXIT_OK
            head = doc["solution"]
            print(f"{head['title']} — step {head['stepNumber']}/{head['stepCount']}: "
                  f"{head['stepTitle']}")
            print(f"  review {_loop_label(head)}")
            print(f"  tests  {_loop_label(head, 'test')}")
            print(f"  suite  {_loop_label(head, 'suite')}"
                  f", {head['fixRounds']} fix round(s)")
            for comp in doc["components"]:
                flag = ""
                if comp["waitingOn"] == "developer":
                    flag = "  ← needs you"
                elif comp["waitingOn"] == "author":
                    flag = "  ← back with the author"
                flag += f"  [review {_loop_label(comp)}]"
                flag += f"  [tests {_loop_label(comp, 'test')}]"
                loops = f"  ({comp['returns']} sent back)" if comp["returns"] else ""
                print(f"  {comp['name']:<20} {comp['stepNumber']}/6 "
                      f"{comp['stepTitle']:<34}{loops}{flag}")
            if doc["needsYou"]:
                print(f"\nWaiting on you: {', '.join(doc['needsYou'])}")
            return EXIT_OK

        if args.cmd == "enter":
            append(root, {"event": "entered", "scope":
                          "component" if args.component else "solution",
                          "target": _target(args), "step": args.step})
            print(f"{_target(args)} → {STEP_TITLES[args.step]}")
        elif args.cmd == "review":
            return _run_review(args, root)
        elif args.cmd == "author-tests":
            return _run_author_tests(args, root)
        elif args.cmd == "test":
            return _run_tests(args, root)
        elif args.cmd == "suite":
            return _run_suite(args, root)
        elif args.cmd == "fix":
            return _run_fix(args, root)
        elif args.cmd == "approve":
            open_findings = fold(read(root)).get(_target(args), {}).get(
                "findings", [])
            append(root, {"event": "approved", "target": _target(args),
                          "by": "developer",
                          # Kept, not erased: an approval that overrode live
                          # objections must be legible later as having done so.
                          "overFindings": len(open_findings)})
            print(f"{_target(args)} approved")
            if open_findings:
                print(f"  over {len(open_findings)} open finding(s), which stay "
                      f"on the record")
        elif args.cmd == "send-back":
            affects = [x.strip() for x in args.affects.split(",") if x.strip()]
            append(root, {"event": "returned", "target": _target(args),
                          "toStep": args.to_step, "reason": args.reason,
                          "affects": affects})
            print(f"{_target(args)} sent back to {STEP_TITLES[args.to_step]}: "
                  f"{args.reason}")
            if affects:
                print(f"  affected: {', '.join(affects)}")
        elif args.cmd == "contract-changed":
            affects = [x.strip() for x in args.affects.split(",") if x.strip()]
            append(root, {"event": "contract-changed", "target": _target(args),
                          "version": args.version, "affects": affects,
                          "needsApproval": bool(args.needs_approval)})
            print(f"{_target(args)} contract → {args.version}")
            print(f"  affected: {', '.join(affects) if affects else 'nobody'}")
        try:
            write_projection(root)
        except (WorkflowError, ManifestError):
            # The event is recorded either way; a manifest problem must not
            # swallow it. `status` will surface the manifest error plainly.
            pass
    except (WorkflowError, ManifestError) as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return EXIT_REFUSED
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(_main())
