# Consult: is this the right remediation, before the sessions start

## What Dabbler is

Dabbler is an AI-led session framework: a VS Code extension with a Node
router inside it (`dabbler <verb>`). A person plans numbered sessions in
prose, in `docs/sessions/session-plan.md`. The framework drives each
session one instruction at a time. An authoring AI (Claude Code or the
GitHub Copilot CLI, in a terminal) answers each instruction: first with a
work plan as a JSON file, then with one report per step. The framework runs
each step's checks and the test suites, has a model from a different
provider review the diff against the session's section of the plan,
commits, pushes and closes. Its record (`.dabbler/runs/`, `sessions.json`,
an append-only `activity-log.json`) is written by the router only.

A person has three ways to end a session that went wrong: cancel, restore
a cancelled one, and roll back to the commit the session started on.

## Why you are being asked

Staff using the framework on their own repositories have begun to meet
stops that end in a rollback. An investigation of one staff repository,
written by another model against an older router (3.29.0), names six
defects. The orchestrator checked each against the current source
(3.34.1) and planned three sessions and a release from it. None has
started. The operator wants two independent readings before they do.

You are given, whole:

1. The investigation report, with the staff repository's name removed.
2. The plan text of sessions 334 to 337 as committed.
3. What the orchestrator found when it checked each defect, and the five
   calls it made that depart from the report's recommendations.
4. The source the calls rest on, by excerpt.

## The five calls to test

1. **Replacing a declared work plan is not planned (report's fix 3).** The
   orchestrator's reasoning: with the stale-file cause closed, a rollback
   before any step is accepted discards nothing committed, and a verb that
   rewrites an append-only declaration should wait until the release has
   run on staff machines.
2. **A mid-session edit to the plan is shown to the reviewer, not frozen
   out (report's fix 4).** The reviewer gets the section as committed at
   the session's start, and where the working tree's differs, both. The
   operator's standing rule is that a plan may be amended at any time with
   approval, so the start-commit text alone would hide an approved
   amendment.
3. **The rollback's handling of cancelled transcript pages is not changed
   (report's fix 6).** The orchestrator could not find a path in
   `rollback` that produces the stale page; the report's own timeline has
   it put back by a revert made by hand.
4. **The reviewer keeps receiving both the session's section and the
   declared work plan.** Their disagreement is what exposed the stale plan.
5. **`sessions.json` is not written when the plan is committed.** The
   status reading already takes a not-started session's title from the
   plan.

Also planned, and worth your reading: the freshness guard in session 334
compares an answer file's modification time with the time its instruction
was issued; an accepted answer file under `.dabbler/scratch/` is removed;
and the one reader of a session's section in session 335 ends a section at
the next heading of level three or above.

## What is wanted from you

Disagreement is worth a paragraph and agreement one line. Check a claim
against the excerpts before you make it, and say when you are inferring
what the source does without having seen it. Answer in this shape:

1. **Verdict, first.** One of: start as planned; start with changes;
   do not start. Then the changes that matter most, at most three.
2. **Each of the five calls.** Agree or disagree, and why.
3. **What the plan misses.** A way the stale plan, or the wrong text in
   front of the author or the reviewer, still gets through after these
   three sessions. Be concrete: name the sequence of events.
4. **What the plan gets wrong or over-builds.** Anything that will break
   something that works today, and anything that could be left out.
5. **The order.** Cause first (334), then the plan's reading (335), then
   the report offered at a rollback (336): is that the right order, and is
   one release for all three right?
