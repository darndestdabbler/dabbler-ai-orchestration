# Consult round 18 — synthesis

2026-09-20. Brief: `round18-brief.md`. Answers: `round18-gemini.md`
(`gemini-3.1-pro-preview`, direct API, 58 s) and `round18-sol.md`
(`gpt-5.6-sol` through the Copilot seat, 44 s). Claims below were checked
against the tree before they were repeated; where one was wrong it says so.

The frame, from the operator: two beta tests on a work computer both went
wrong -- one read a session as releasable that nobody had labelled, and the
AI cancelled it; in the other the waiter waited for something that never
came. A human should be bothered mid-session only at planning, when an AI
service is down, or when the human chooses; a Resume button is ridiculous;
an impasse the framework did not anticipate should go to a Verifying AI that
governs the session to the finish. Do not over-engineer. The developer
experience is paramount.

## Where both advisors agree, and so does the orchestrator

1. **The goal is right, with one more category.** Something only a person
   possesses or may authorise -- a credential, a remote, a spending or
   release decision -- and it is asked for at the START wherever it can be
   known then. Beyond that, only an irreversible risk nobody anticipated.
   Sol: every escalation states the irreversible consequence and why retry,
   rewind, an instruction to the author or a held release cannot resolve it;
   there is no general "ask the human" hatch.
2. **Resume goes.** A dead loop is the crash layer's (shipped in 205). A
   rebooted machine or a closed editor is continued on activation. A stop
   that a retry, a rewind or the author can cure does not end the process.
3. **Not a replacement driver.** Neither advisor would have an AI "operate
   like the framework". If an AI decides anything at an impasse it chooses
   from a closed menu and the framework executes and records; it never runs
   git, gates or the ledger, never waives evidence, never judges its own
   work. The role, if there is one, is the Auxiliary Reviewer.
4. **Every wait has an owner, a deadline and a last real progress**, and the
   developer can see them. "No silent wait" is the acceptance invariant --
   so whichever of the four candidate causes produced the second beta
   failure, it becomes a named, timed, visible state.
5. **Fix the four verified defects (release rule stated twice; a printed
   cancel that refuses and an engine that can force; a loop that never
   re-reads the session's status; messages that send the reader to `session
   next`), not seven sessions.**

## Where they split, and the call

**A governor now, or not yet.** Gemini: build the closed-menu governor now
and let it absorb the unverified holes. Sol: not yet -- both failures were
deterministic lifecycle defects, a governor now would mask them, and round
17's threshold was ten sessions, not two.

*The call: Sol's order, the operator's destination.* The fact that decides
it: **neither beta failure would have reached a governor.** In the first the
framework never recognised an impasse -- the AI acted on a printed command.
In the second nothing noticed the wait. A governor is only ever called by
something that notices, so the noticing comes first, and it is most of the
cure. But the operator's principle survives the defects: a framework stops
because it did not anticipate a condition, no audit closes that class, and
once Resume is gone every such stop lands on a person who has nothing to
decide. So the governor is the third build, straight after the first two and
not after ten sessions of evidence. What goes on the record instead is every
governor decision: each is a defect report, and that list, not an audit, is
what earns a deterministic fix.

**What handles a dead AI CLI.** Gemini: the waiter's crash layer. *Wrong on
the facts:* the waiter runs INSIDE the AI's CLI, so when the CLI is dead the
waiter is dead; the crash layer restarts the loop, not the AI. Sol: a
specific **Reconnect Authoring AI** action that says the AI is disconnected
and relaunches the engine with the waiter sentence. *Adopted.* One verb never
repaired three different failures.

**Delete `session next` and the typed `session declare`.** Gemini proposes
both. *`session declare`: adopted.* Nothing but one documentation page names
the typed verb; the loop calls the function directly. Removing the second
statement of the release rule is simpler than teaching it the setting.
*`session next`: not adopted.* It is wired through the extension's session
commands, the Dabbler terminal and the walks. It refuses under a live loop
and no message names it while one is driving.

## Refinements taken

- **Sol: a persisted running intent.** Activation continues a session only
  where the record says it was running; Stop and Cancel clear it; closing a
  terminal is not an instruction to anyone. This also closes the hidden
  detached revival the audit reported.
- **Sol: progress is a changed persisted milestone, never a heartbeat.** The
  UI shows owner, elapsed, deadline and last real progress: "Author owes
  step 4 -- 2:13", "Verification round 2 -- 3:42 of 10:00".
- **Sol: the proof is failure injection, not a green end-to-end run.**
- **Sol: a role that grants exceptions must not alter the evidence it
  governs** -- as governor the Auxiliary Reviewer has no write under the test
  roots.
- **Gemini: anything outside the closed menu is an escalation**, at once.
- **The orchestrator: the human is one more owner in the same wait
  contract.** The loop waits on a person exactly as it waits on the author,
  alive, and the person's answer is a click that writes an answer. A loop
  that never ends on a question needs no Resume to come back from one. An
  unreachable AI service is retried on a visible clock with "Retry now".

## The recommendation

Sessions 213-219 as planned on 2026-09-20 are withdrawn: they are the
hole-by-hole path. Three sessions replace them, in this order.

**1. One authority for each lifecycle fact.** The typed `session declare`
goes, so a release is decided in one place, under the checkout's setting. No
engine -- Claude Code, Copilot or Codex -- can force a cancel or a close, and
every way on a stop prints is a command that parses. The loop re-reads the
session's status before every transition and before the commit and the push.
`session next` refuses under a live loop and no message names it there. A
person's one-way `hold-release` gives a release that cannot succeed a
correct close.

**2. No silent wait, and no Resume.** One persisted wait contract -- owner,
activity, started, deadline, last progress -- written by the loop and shown
by the extension. Framework jobs get deadlines; an overdue author gets a
notice, not a failure. Stops that a retry, a rewind (at the close as well as
the publish) or an instruction to the author can cure stop being stops. What
only a person can supply is asked at plan acceptance, with a recommended
answer -- the release preflight is the first such question. The loop waits
on a person alive; activation continues a running session; Resume is
replaced by Stop Session and Reconnect Authoring AI.

**3. The governor.** At an impasse the ladder has not cured, the framework
asks the Auxiliary Reviewer one question with a closed menu -- one of the
stop's ways on; waive this process rule, with a reason; instruct the author;
hold the release; escalate, naming the irreversible consequence -- executes
the answer and records it. Process rules only, the line `close --force`
already draws. Two decisions a session, then the person. The close reports
every exception granted.

Proof, Sol's experiment, run on the installed extension: replay a
declaration made before the plan on a publish-nothing consumer; attempt a
forced cancel from each of the three engines; cancel between phases and
immediately before the commit; steal the lease; hang a verification job;
kill the loop, the editor and the AI CLI independently. Each run ends with
the correct release status, no unauthorised commit or push, one durable
instruction, and a visible named owner or a bounded failure.
