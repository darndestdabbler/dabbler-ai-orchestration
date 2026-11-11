# Consult round 18 — no Resume button, and who governs an impasse

You are consulted on `dabbler-ai-orchestration`, an AI-led coding-session
framework: a TypeScript router (`dabbler <verb>`) bundled into a VS Code
extension, whose customers are .NET and Java teams in an IT shop. You have
NO tool access. Every claim about the repository must cite a fact from this
brief; mark anything else ASSUMPTION.

## The operator's three instructions to you

**(a) This is prompted by two failed beta tests.** The operator is running
two beta tests of the latest extension on a work computer, on real
repositories. Both had issues. In one, the framework treated a session as
releasable though the Authoring AI had labelled nothing releasable; the AI
then cancelled the session on its own and the session ended with uncommitted
code. In the other, the AI's waiter kept waiting for some action that never
came. The cause of the second is not yet known; the candidates found by
reading the code are listed below.

**(b) Do not over-engineer.** Keep it as simple as possible. A recommendation
to delete or to not build something is a first-class answer. A recommendation
to add a mechanism must say what it replaces and why nothing simpler covers
the case. It must be explainable on one slide without a state machine.

**(c) The developer experience is paramount.** If developers get frustrated
because the extension appears to be hanging, or does things that are not
correct, they will reject it. Human time outranks AI time.

## How the system works today

A developer works in an engine CLI (Claude Code, GitHub Copilot CLI or Codex)
in a VS Code terminal. The framework's **loop** (`dabbler session run
--mailbox`, a long-lived Node process the extension starts in its own
terminal) owns the lifecycle: it accepts the AI's work plan, issues each step
as an instruction, runs each step's checks, runs cross-provider verification
and its remediation rounds, the test suites, the commit, the push, the
release and the close. The **Authoring AI** keeps a background **waiter**
(`dabbler session wait`) that prints the next instruction when the loop
writes one; it does the work and answers with `dabbler session report`. The
loop refreshes a heartbeat file; the waiter and the extension's **Resume
Session** button read it to know whether a loop is driving.

Two reviewing roles exist, both cross-provider: the **Primary Reviewer** (not
the author) writes verdicts; the **Auxiliary Reviewer** (not the author and
not the primary) adjudicates a disputed finding. Each is one API or Copilot
seat call per round; neither writes code. A verifier "agency" protocol exists
(`agency.ts`): a reviewer may ask to read files and may make one write under
declared test roots, with an audit trail.

**A stop.** When the loop cannot continue it records a `Stop` (a kind, an
optional code, a reason) on `run.json` and the PROCESS ENDS. A table renders
who acts (operator, engine or either) and the "ways on", each a command. The
kinds: `budget`, `rejected-thrice` (an answer refused three times),
`blocked` (the AI said so), `tree`, `engine`, `tests`, `land`, `publish`,
`close`, `crash`, `interrupted`, and under `verification`: `no-verdict`,
`provider-unreachable`, `reviewer-unreachable`, `dispute-refused`,
`cap-unresolved`, `cap-disputed`, `cap-terminal-tree-moved`. After any stop a
person clicks Resume (or types the loop's command) to start a new loop
process, which re-enters the phase it stopped in.

**Gates.** The close asks six gates. `session close --force` "bypasses
bookkeeping gates, never evidence": it skips `working_tree_clean`,
`pushed_to_remote`, `test_run_fresh`; it never skips `verification_clean`,
`verdict_vocabulary` or `published_when_releasable`. So the code already
draws a line between rules that are process and rules that are evidence.

**Round 17, two days ago (2026-09-18).** Asked a narrower form of this, both
of you and the orchestrator agreed: build only a crash layer (a loop that
dies with NO stop recorded is restarted by the waiter, twice per progress
point, then a `crash` stop); a recorded stop is never auto-restarted; Resume
stays for a dead AI CLI; and an **"AI mechanic"** that troubleshoots a stop
was REJECTED as over-engineering -- Gemini: an AI troubleshooting a
deterministic crash "tends to blame its own code and mutate the tree"; Sol:
"defer until supervised sessions produce a measured set of repeated stops".
The recorded revisit condition: "after ten real sessions, if the record
shows stops that reached a person and needed no decision from one." That
layer shipped. The two beta failures are the first real evidence since, and
the operator is reopening the question. You may hold your round 17 position;
say what the new evidence does or does not change.

## What a read of the code found (2026-09-20, three audits, partly verified)

Verified by the orchestrator:
1. **The release rule is stated twice.** The driven plan reads the checkout's
   release setting (consumers default to "publish nothing unless the plan
   asks"); the typed `session declare` never reads it and ships unless held,
   and a declaration made first beats the plan. Once declared releasable,
   nothing can change it: the only exits from a release that cannot succeed
   are "publish" or "cancel".
2. **Every stop offers `dabbler session cancel --reason "<why>"`, and the
   verb refuses that form** (it needs a session number, and `--force` for a
   session in flight). An AI that reads the offer arrives at `cancel --force`
   by elimination. The guard that refuses `--force` to an engine recognises
   only Claude Code's environment marker, not Copilot's or Codex's.
   `close --force` has no engine guard at all.
3. **The loop never re-reads the session's status.** Cancelled underneath a
   live loop, the loop waits for ever with a live heartbeat while the waiter
   says nothing is in flight; cancelled during a framework phase, the loop
   goes on to commit and push the cancelled session's work.
4. **A refused close cannot go back for its evidence unless the session is
   releasable.** The rewind (gate -> the phase that remakes its evidence) is
   called only from the publish phase. A consumer's session that meets a
   stale test-evidence gate at the close stops; Resume re-enters `close` and
   the same gate refuses; the stop's way on names nothing anyone may run.
5. **Four framework messages tell the reader to run `dabbler session next`**,
   which takes the lease from the live mailbox loop; the loop's next save is
   refused, its own stop handler's save is refused too, and it dies with NO
   stop recorded and the accepted answer lost. After 60 s the waiter revives
   it and the same step arrives again with a new number and no explanation.

Reported by the audits, not yet verified:
6. An adjudication that upholds a finding is terminal; the stop then shown
   describes a different situation and offers a command that refuses. Cancel
   is the only exit.
7. A framework job (a verification round, a suite) is polled with no
   deadline: a hung job leaves a live heartbeat, nothing owed, no stop and no
   notice, indefinitely.
8. A stop under the mailbox loop may raise no notification; "instruction
   overdue" is only recorded while the loop is alive.
9. The managed guidance tells the AI "three kinds of instruction, and no
   fourth"; the waiter prints others, and its "no loop is driving" exit is
   not described, so an obedient AI re-arms the waiter every minute.
10. Closing the loop's terminal stops nothing: the waiter revives the loop
    detached and hidden, and it goes on to commit and push.

Candidate causes of beta failure two (the waiter that waited): 3, 5, 7, or a
recorded stop the operator never saw (8).

The orchestrator's first response was seven remediation sessions closing
these holes one by one (release rule and an operator hold; engine guard and
loop-notices-cancel; rewind at the close; a release preflight at plan
acceptance; every printed command parses; lost disputes lead somewhere; a
stop notifies and a Stop action). The operator stopped that: it is the hole-
by-hole path again, and wants the architecture assessed first.

## The operator's proposal

**Goal 1.** The only times a human is bothered in the middle of a session:
(a) at the beginning, during planning; (b) when an AI service is not
available; (c) when the human wants to ask a question or make a course
correction. "I am willing to entertain other situations, but to me the
concept of a Resume button seems ridiculous."

**Goal 2.** The framework has a very robust ability to recover. At an impasse
or a stall it tries a LIMITED set of actions. If those do not work, it
DELEGATES GOVERNANCE of the session to a Verifying AI, which is given the
general rules and one overarching principle: finish the session unless there
is a critical issue that requires human intervention. From then on the
Verifying AI "operates like the framework, but with the ability to grant
exceptions to rules" -- its goal is to get the Authoring AI over the finish
line without bypassing any rule for which a valid action exists. "The
framework should be able to handle most situations. When it cannot, it is
because it has not anticipated the current conditions. This is where AI can
help significantly." The operator is open to configuring this differently.

## The orchestrator's variant, for you to attack

Agrees with the goals. Differs on one thing: the governor should DECIDE, and
the framework should still EXECUTE.

- **The ladder.** (1) The framework's own bounded recovery (retry, rewind to
  the phase that remakes the evidence). (2) Where the Authoring AI can cure
  it, it is an INSTRUCTION to the author in the refusal's own words, not a
  stop. (3) The governor. (4) The human -- only for the governor's "critical
  issue", an unavailable AI service, or something only a person possesses (a
  credential, a remote, a spending decision), and those are asked for at the
  START wherever they can be known then.
- **The governor is a decision at an impasse, not a replacement driver.** The
  framework hands it the stop, the record's relevant rows, the rule that
  refused, and a CLOSED menu: one of the stop's existing ways on; "waive this
  rule for this session, with a reason"; "instruct the author: <text>";
  "hold the release"; "escalate to the human: <the critical issue>". It
  answers with one. The framework executes it, records it as a decision by
  that role, and the close reports every exception granted. No LLM runs git,
  gates or the ledger.
- **What may be waived** is the line `--force` already draws: process rules
  (a file list that does not match, evidence ordering, a wrong step check, a
  round cap, a non-goal), never evidence (no verdict without a round, no
  publish of unverified work, no edit to the record).
- **Which role.** The Auxiliary Reviewer already exists to break an impasse
  between the author and the primary; governing any impasse generalises that
  role rather than adding one, and it is not the judge of the work. Bounded:
  N governor decisions per session, then the human.
- **Stalls are a separate problem and come first.** A governor is only called
  if something NOTICES. Every wait should have an owner and a deadline: at
  any moment exactly one of {the author owes an answer, a framework job is
  running against a deadline, the human owes something from (a)-(c)} is
  true, the UI says which and for how long, and anything else is a stall that
  enters the ladder.
- **Resume.** If stops that need no human decision no longer end the process,
  Resume is left for a rebooted machine or a closed editor -- and the
  extension could continue an in-flight session on activation, so the button
  goes.
- **The known defects still get fixed**, but few of them by hand: the ones
  behind the incidents (1, 2, 3, 5). Every governor invocation is recorded,
  and that list -- not an audit -- is what earns a deterministic fix later.

## The questions

Answer each in this shape, one paragraph each, no preamble:
**Recommendation:** one sentence. · **Design:** the simplest thing that
works, citing this brief. · **The one risk:** the most likely way it fails a
developer. · **Mitigation:** one. · **Delete:** what you would remove or not
build.

1. **The goal.** Is "a human only at planning, when an AI service is down, or
   when the human chooses" the right target, and is it achievable? Name the
   SHORTEST list of other situations that genuinely need a person
   mid-session.
2. **Resume.** Can the Resume button go? What, concretely, replaces it for a
   dead loop, a rebooted machine, and a dead AI CLI (round 17 kept it for the
   last)?
3. **The governor.** Should an impasse be delegated to an AI at all (round 17
   said not yet)? If so: the operator's shape (it operates like the framework
   with exception power), the orchestrator's (closed menu, framework
   executes), or something simpler? Which role governs -- Primary Reviewer,
   Auxiliary Reviewer, or a fresh conversation of the author's model -- and
   what may it never do?
4. **Stalls.** What is the simplest mechanism that guarantees no silent wait,
   and what should the developer SEE while the framework is working so that
   slow never reads as hung?
5. **The known holes.** Fix each (seven sessions), or fix a few and build the
   net? Which few?
6. **The smallest first build.** One or two sessions that would have made
   BOTH beta tests end well. What is the proof experiment?
7. **What would you delete** from the system as described, given the goals?
