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

**Only a step change opens a new loop.** Sending work back or carrying it
forward resets the round count. Re-entering the step the work is already in
is inert — it moves nothing, so it changes nothing, and treating it as a move
would be the cheapest way to spend past the cap.

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
    DEFAULT_VERIFICATION_ROUNDS, load_config, verification_round_cap,
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

EVENTS = ("entered", "reviewed", "approved", "returned", "contract-changed")
SCOPES = ("solution", "component")

#: How each terminal state of the review loop reads. The keys are the closed
#: verdict vocabulary and nothing else: a fourth state would have to be added
#: to :data:`ai_router.verdict.SESSION_VERDICTS` first, which is the point.
TERMINAL_HEADLINES = {
    verdictmod.VERDICT_VERIFIED: "verified",
    verdictmod.VERDICT_ISSUES_FOUND: "unresolved at the cap",
    verdictmod.VERDICT_REMEDIATED_AT_CAP: "remediated at the cap",
}


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
            "lastLiveReview": None,
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
        elif kind == "approved":
            s["approved"] = True
            s["waitingOn"] = None
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
        elif kind == "contract-changed":
            s["waitingOn"] = "developer" if e.get("needsApproval") else None
    return state


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


def project(root) -> dict:
    """What the Explorer reads: the manifest, joined to live state."""
    try:
        solution = solmod.load(root)
    except ManifestError as e:
        raise WorkflowError(str(e)) from e

    state = fold(read(root))
    cap = review_cap(root)
    doc = solmod.as_dict(solution)
    sol_state = state.get("solution", {})
    doc["solution"]["waitingOn"] = sol_state.get("waitingOn")
    doc["solution"]["returns"] = sol_state.get("returns", 0)
    doc["solution"]["reviewers"] = sol_state.get("reviewers", [])
    doc["solution"]["findings"] = sol_state.get("findings", [])
    _project_review_loop(doc["solution"], root, sol_state, cap)
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


def file_review(root, target: str, step: str, raws: list) -> list:
    """Write each reviewer's reply verbatim. A summary is not a record, and a
    finding that only exists as someone's paraphrase cannot be re-read."""
    out_dir = reviews_dir(root)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = _now().replace(":", "").replace("-", "")
    written = []
    for i, raw in enumerate(raws, 1):
        path = out_dir / f"{target}-{step}-{stamp}-r{i}.md"
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


def _loop_label(node: dict) -> str:
    """Where the review loop stands, whether or not it has opened or closed.

    Shown unconditionally. A count is most useful before the loop ends —
    it is what says how much room is left — so hiding it until the first
    round or until the loop closes withholds it exactly when it is worth
    reading.
    """
    position = f"{node['reviewRounds']}/{node['reviewCap']} rounds"
    if node["reviewTerminal"]:
        return f"{node['reviewTerminalLabel']}, {position}"
    return f"open, {position}"


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
            for comp in doc["components"]:
                flag = ""
                if comp["waitingOn"] == "developer":
                    flag = "  ← needs you"
                elif comp["waitingOn"] == "author":
                    flag = "  ← back with the author"
                flag += f"  [review {_loop_label(comp)}]"
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
