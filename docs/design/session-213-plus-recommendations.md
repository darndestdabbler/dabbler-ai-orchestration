# Review of Sessions 213–217

Date: 2026-09-20

## Recommendation

Do not restore Session 215 and do not implement Sessions 216 or 217 before the
staff handoff. Replace the remaining block with one small corrective session,
then run the four soak tests against one packaged artifact.

The corrective session has only two product changes:

1. Start Session uses the existing direct `dabbler session run` path instead
   of `dabbler session run --mailbox`.
2. The Authoring AI may cancel the current in-flight session.

Do not add a governor, a persistent person-waiting loop, Retry Now, Reconnect
Authoring AI, more lifecycle states, or another recovery protocol before the
soaks.

## Evidence

### Session 213 deliberately created the cancellation bug

Session 213 made `session cancel --force` a person's verb. The relevant path
is:

- `packages/router/src/cli/session.ts` sets `engine: !personIsPresent()`.
- `packages/router/src/session.ts` refuses a forced cancellation when
  `options.engine` is true.
- `packages/router/src/session.ts` still requires `--force` to cancel a
  session whose status is `in-progress`.

Those rules together mean an AI cannot cancel the session it is authoring.
`session interrupt --stop` does not substitute for cancellation: it halts the
loop, records an `interrupted` stop, and deliberately leaves the session in
flight.

The restriction is not authentication. `personIsPresent` guesses from
environment variables, terminal interactivity, and a process-global
`asAPersonsClick` counter. Session 213's own UAT says that an unmarked AI shell
was first mistaken for a person. Adding more markers made the heuristic deny
the known engines, but did not make the caller's identity trustworthy.

Keep the parts of 213 that address concrete failures:

- one release decision through the accepted plan;
- re-reading session status before phases, `git add`, commit, and push;
- ending a loop cleanly when its session was cancelled;
- preventing `session next` from taking a live loop's lease;
- leaving uncommitted work untouched on cancellation.

Change the cancellation rule. Cancellation is a safe author exit because it
records the reason, preserves the working tree, and the loop's status checks
prevent later commits and pushes. Forced close is different: it promotes every
open session and bypasses bookkeeping gates. Do not weaken forced close as
part of this correction.

### Session 214 made the hang visible but did not prevent it

Session 214 added useful protections:

- a waiting owner and elapsed time;
- lease checks while waiting for an answer;
- interruption during a framework job;
- executable validation for planned checks;
- bounded framework jobs;
- retrying the reviewer the operator actually selected;
- automatic rewinds for gates the framework knows how to remake.

Keep those changes for the handoff. Reverting the whole session now would
discard fixes for observed beta failures and create unnecessary risk.

However, the session added 1,710 source and test lines, plus generated schemas,
extension UI, and documentation, without closing the author-delivery failure.
The waiter beacon answers whether an instruction was read. The overdue event
reports that no answer arrived. Neither mechanism delivers the next
instruction.

Session 215 is the direct reproduction:

- The plan completed at 14:45:24.
- Step 1 was issued at 14:45:29.
- The run accepted zero work steps.
- No report or engine output arrived for 55 minutes.
- The loop logged quiet and overdue events, then the operator stopped it.
- The run record contains no rejection or framework-job failure.

The one-shot waiter was not re-armed after the planning answer. This is a
protocol failure, not a hard implementation task and not a reason to keep the
loop alive while waiting for a person.

### Session 215 was aimed at the wrong failure

Session 215 proposed keeping a stopped loop alive, watching for a person to
change the tree or run a way-on command, adding Retry Now, preflighting six
release conditions, auto-starting loops on editor activation, replacing Resume
with Reconnect Authoring AI, and removing Resume in a major release.

None of that would have completed Session 215. Its loop was already alive. It
was waiting for the Authoring AI to run another one-shot waiter.

Do not restore this session. A Reconnect button is a Resume button with a more
specific name, and an indefinitely living loop adds process and state
management without removing the delivery dependency.

### Session 216 should be deferred

Ending a genuine author/reviewer dispute inside the session is a reasonable
goal, but it did not cause either failed beta test or the Session 215 hang. It
changes reviewer output, adjudication timing, round state, and author
instructions. That is too much new behavior immediately before four soak
tests.

Move it to the post-handoff backlog. Re-plan it only after a soak or staff run
actually reaches the dispute dead end. If it is restored later, keep its
narrow rule: one Auxiliary Reviewer call chooses between the author's
evidenced position and the Primary Reviewer's concrete resolution; the result
becomes the next author instruction. Do not combine it with generic recovery.

### Session 217 should be dropped

The proposed governor adds another model call at poorly classified failures,
asks an LLM to choose a process exception, automatically executes that choice,
tracks a decision budget, and creates another class of records to interpret.
It increases cost and makes failure handling less deterministic.

It also treats missing deterministic behavior as an AI judgment problem. A
hung test should become a failed test result for the author to fix. A transient
provider failure should retry the selected provider. A stale loop should be
restarted. A missing credential may require the person. These are explicit
cases and should remain explicit.

Do not replace reliable state transitions with a general-purpose reviewer
decision.

## Replacement plan

### Cancel the unused planned work

The operator should cancel Sessions 216 and 217 as deferred work. Do not restore
215.

Suggested reasons:

- 216: `Deferred until post-handoff evidence reaches the dispute dead end; no beta or soak has required it.`
- 217: `Dropped: generic AI governance adds cost and nondeterminism where explicit recovery rules are required.`

### Session 218: One Start runs to done, and the author can end it

**Why.** Session 215 proved that the mailbox requires the Authoring AI to
re-arm a one-shot waiter after every answer. The loop stayed alive and
correctly diagnosed the missing answer, but the AI never received step 1.
Session 213 also prevents the Authoring AI from cancelling its current
in-flight session.

**What.**

1. In
   `tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`,
   `loopTerminalFor` runs:

       dabbler session run --sessions-dir docs/sessions

   It does not pass `--mailbox`.

2. Start Session does not open a second interactive Authoring AI terminal and
   does not give it `openingSentence()`. The framework terminal shows the
   output from the existing direct invocation path. The model and engine
   selected at Start remain recorded exactly as today.

   Claude Code and Codex resume a named conversation when their CLIs supply
   one. Copilot supplies no conversation id on this path, so each instruction
   starts a fresh Copilot conversation. The Copilot soaks must measure the
   resulting re-read cost and elapsed time.

3. Keep `session run --mailbox` and `session wait` as an explicit command-line
   fallback. They are not the extension's default and are not used by the
   four acceptance soaks.

4. In `packages/router/src/session.ts`, remove only the refusal that prevents
   an engine from force-cancelling the current in-flight session. Remove the
   corresponding `engine` option from cancellation and its CLI call. Do not
   alter `close --force`.

5. Cancellation continues to preserve the working tree, commit only the
   cancellation record, and rely on the existing status reads to stop the
   loop before add, commit, or push.

6. Update the shipped guidance so the normal extension path says one Start
   runs the session. This includes the managed body generated from
   `packages/router/src/bootstrap/templates.ts`; leaving its waiter instruction
   in place would tell a directly invoked author to start an unnecessary
   mailbox reader. Do not add a replacement button or a second delivery
   protocol.

**Non-goals.**

- No work from cancelled Session 215.
- No change to forced close.
- No governor or generic AI recovery.
- No dispute redesign.
- No new schema, lifecycle state, role, record, command, setting, button, or
  environment marker.
- No refactor of Session 214's waiting/deadline implementation before the
  soaks.
- No attempt to prove caller identity.

**Tests.**

Add or change only tests that pin these two behaviors:

1. Start Session launches `session run` without `--mailbox` and does not open
   an interactive Authoring AI terminal.
2. A registered built-in engine advances from plan to the first work step
   without `session wait`.
3. An engine-marked caller can cancel the current in-flight session; the loop
   exits, the working tree remains uncommitted, and no later commit or push is
   made.
4. `close --force` remains unchanged.

Do not add tests for the waiter fallback unless an existing test must be
updated. Do not add another UAT harness.

**Release.** Patch release. This restores intended behavior and changes the
extension to an existing execution path; it does not add a capability.

## Four-soak acceptance gate

Build and package once. Install that same artifact for all four soaks:

| Machine | Authoring engine | Required result |
| --- | --- | --- |
| Personal | Claude Code | Start to closed with no human action after Start |
| Personal | Copilot CLI | Start to closed with no human action after Start |
| Work | Claude Code | Start to closed with no human action after Start |
| Work | Copilot CLI | Start to closed with no human action after Start |

For every soak, record:

- wall-clock time from Start to closed;
- authoring invocations and reviewing calls;
- AI credits or API cost;
- human actions after Start;
- stops, retries, duplicate loops, and orphaned processes;
- final commit, push, verdict, and release/hold result.

At least one soak must include a real remediation round and still close with
headroom below the default limit of 24 author invocations. Both Copilot soaks
must separately record the cost and elapsed-time effect of starting a fresh
conversation for each instruction. All four packaged launches must establish
that the framework terminal inherits the PATH, authentication, model, and
credential environment needed by the selected CLI.

The artifact is not ready for staff if any soak has:

- a Resume, Reconnect, waiter, retry, or terminal-restart action by the human;
- an unexplained stop;
- a second loop;
- an orphaned author, reviewer, test, or publish process;
- a commit or push after cancellation;
- a false success, missing verdict, or dirty completion;
- an ordinary run reaching the 24-invocation budget;
- wall-clock time or AI spend at or above three times the direct-AI baseline
  for the same task.

Target at most twice the direct-AI wall-clock time and spend. Treat two to
three times as a performance defect to investigate after reliability is
established; three times is a release blocker.

Run one additional cancellation check on either personal-machine soak: while
the author is working, instruct it to cancel its own current session. It must
finish as cancelled without a human command, preserve its uncommitted files,
and leave no author or framework process running.

## Work order for the deadline

1. Cancel 216 and 217; leave 215 cancelled.
2. Implement only Session 218 above.
3. Package one artifact.
4. Run both personal-machine soaks.
5. If both pass, install the same artifact on the work machine and run both
   work-machine soaks.
6. Fix only a failure that blocks or misrepresents a soak. Re-run the failed
   soak and one previously passing soak on the same engine.
7. Defer every feature request and cleanup that is not required by those
   results.
