# The proof of the module folder: two modules, two sessions, one afternoon

*Run 2026-09-08 by the operator, with the orchestrator preparing the
scaffold and reading the records, on router and extension 2.0.14 as
installed — nothing in this repository changed for it. It is the proof the
operator asked for after the design rounds of that day: "a very, very, very
small solution with instructions to AI that this is a test of the framework
only and should be purposely narrow and underengineered." What it tested
is the developer's day under the folder-per-module design that sessions
100–120 built and the operator kept that afternoon: Open Module, Start
Session in the module's window, the land, the pull. The plan it feeds is
sessions 126–127 in `docs/sessions/session-plan.md`.*

## The solution

`C:\temp\optiona-poc`, a bare origin beside it, two .NET modules under
`modules/`: `model`, a class library with one record `Greeting(string Name)`
and one test; `app`, a console program with one static `Greeter.Greet` and
one test, consuming `model` as a package from the committed `packages/`
feed. The tests were written first and red; each session's sentence was
"make it compile and pass". The plan's rule for every session, verbatim:
*this solution exists to test the framework, not to be used; build the
smallest thing that satisfies the session's sentence; no configuration, no
README, no error handling, no logging, no extra files; the other module is
the package the framework gives you; do not look for its source; stop when
the test passes.* Each session's section carried a `**Module:**` line, as
the .NET walkthrough's does. Bootstrap, two `modules create` with
`--code-root` and `--package`, two suites in `dabbler.yaml` (one per
module, `expensive: true`, a selection rule each), and one pack of the
empty model so the root build files existed. Scaffold in three commits;
the scaffold's own lesson is below as finding 1.

## What happened, in order

| when | what |
| --- | --- |
| 11:33 | Session 1 registered in `optiona-poc.model` (Claude Code); verified in round 1 at 11:35 (gpt-5.4 through the Copilot seat); candidate packed and the model suite green at 11:36. |
| 11:38 | The run of record also ran the **app** suite in model's folder, where app's tests are not on disk: `MSB1009 Project file does not exist`, in one second. The framework handed the AI a `fix-run-of-record` step. |
| 11:40–11:41 | The AI reported the step blocked, twice, with an exact diagnosis; the run stopped as a deadlock. Eight minutes from registration, one of them the AI's own work. |
| 11:46 | The orchestrator repaired the configuration in the main folder (finding 1), pushed, pulled it into the module folder and recorded the repair with `session rebaseline`; the operator chose to start over instead. The module folder could not be deleted until its window was closed. |
| 11:55–12:00 | Session 1 again, in a fresh module folder: registered, one work step, round 1 VERIFIED, candidate, model suite only, land, close. **4 min 37 s.** |
| 12:52 | The operator opened `app` (Open Module): `optiona-poc.app` made from the origin, already holding session 1's close. |
| 12:53 | Start Session was pressed — in the **model** window. That AI registered session 2 in model's folder, read the plan's `Module: app`, cancelled its own registration with `--force`, changed directory into `optiona-poc.app`, and started session 2 there from the model window's tab. |
| 12:59–13:03 | Session 2 in the app folder: registered, one work step, round 1 VERIFIED, candidate, app suite only, land, close. **4 min 24 s.** The app window never had an AI tab; the operator looked for it there. |
| 13:26 | The pull by hand in the main folder, then `dotnet run --project modules/app/src/PocGreeter -- Ada` printed `Hello, Ada`. Until the pull, the main folder's Work Explorer showed session 2 as not started. The proof's exit condition was met. |

## Findings

**1. The run of record ran a sibling's suite in a focused folder, and could not.**
Two declaration gaps, both in the scaffold and both silent: a suite that
does not say `module:` is *repository-wide* and reached by every change
(`impact.ts`, `reason: "repository-wide"`); and a `shared-types` module,
which the scaffold copied from the walkthrough, reaches every consumer's
whole suite by rule (`reason: "shared-types"`). Neither can run where the
consumer's tests are not on disk. The walkthroughs never met this because
they declare one root-level suite, which runs whatever is there. Fixed in
the proof by `module: <slug>` on each suite and `kind: library`. For the
framework, session 127: a suite whose covers and tests lie under one
module's code roots is that module's suite unless it says otherwise, so
nobody types `module:`; and in a focused folder a reached suite whose tests
are not on disk is skipped and recorded as owed to that module's own
session, never run and failed. The `fix-run-of-record` step was handed to
an AI that could not fix the cause, and it said so well; a cause outside
the session's scope should stop with the diagnosis rather than ask.

**2. A session whose plan names one module was registered in another
module's folder.** Start Session in the model window registered "The
greeter" (`Module: app`) in `optiona-poc.model`. Nothing refused it. Session
127's kind-from-the-plan is exactly this refusal: a start in a focused
folder whose module is not the plan's module says so and stops, and the
extension does not offer Start Session there.

**3. The AI cancelled a session on its own, with `--force`, and drove
another folder's session from the wrong window.** Resourceful, correct in
outcome, and invisible to the person watching the app window. Under the
command-ownership principle a cancel is a person's judgement; the engine
should not hold `session cancel --force`, or its use by an engine should be
an owed decision. The visibility half is what 126 and 127 build: the kind
line in the terminal, the Solution Explorer marking the module in play, and
the one-click start that opens the module's window with its AI in it.

**4. The AI's terminal could not be found, and closing it would have ended
the AI.** It is an editor tab named after the engine, beside the Dabbler
terminal, by `dabbler.terminalLocation`'s default; the operator looked in
the chat panel and the terminal panel. There is no command to bring it
back, and Start Session hides while a session is in flight. Two commands
recover today — `dabbler session run` (the framework drives the rest with
the registered engine) and `claude --continue` — and a **Resume Session**
row command running the first belongs on the in-flight session's row.

**5. Time.** A session is about four and a half minutes: two for the
verification round on the seat, forty seconds for each `dotnet test` with
its restore, the rest the driver's polling waits of thirty to sixty seconds
between phases. What felt slow was the first attempt's dead end, not the
framework's pace. The verification transport was the Copilot seat because
the machine's `DABBLER_TRANSPORT` says so; the API would have been faster
and is one flag on the first `next`.

**6. The pull by hand is the moment the plan removes**, and the proof saw
it: the main folder's Work Explorer said session 2 was not started while
the app folder had closed it. Session 127's close pulls the main folder
forward.

**7. `session rebaseline` did its job** for a repair made while the run
was stopped, and its record listed the framework's own bookkeeping and the
candidate's files among the repaired paths — seven paths for a two-file
repair. Noise, not a fault; a papercut for whoever touches it next.

**8. The folder is kept open by its window.** Deleting a module folder
needs its VS Code window closed first; `EXISTING_CLONE = "fresh"` would
have hit the same lock when re-opening a module whose folder is open.
Session 127's `reset` policy never deletes a folder.

**9. The scaffold's own notes.** Central package versions are written by
the first pack, so a test project made by `dotnet new xunit` must move its
versions into `Directory.Packages.props`; `modules create` waits for the
first project file before it writes root files; `bin/` and `obj/` need
their own ignore lines; `dotnet run -- Ada` prints the greeting, and
anything else after `--` is greeted too.

## What the operator saw

In the operator's words, after the run: *"steps were not printed at all"*
— the Dabbler terminal printed no line for any work step, which is session
126's step 2; and *"I couldn't tell where the Work Explorer's steps were
updated"* — the person watching could not find the row that was moving,
which is more than the repaint defect of 126's step 1: the in-flight
session's current step must be visible without expanding anything, and it
must be obvious which window's Work Explorer is showing the session at all.
Asked whether a window per module is a day they want their developers to
have, the operator's first answer was that the phrase itself was not
understood; the verdict is open, and session 127's changes — the kind said
in the terminal, the module marked in the Solution Explorer, one click that
opens the module's window with its AI in it, no pull to remember — are what
would make the day legible enough to judge.

## Exit

Two sessions closed VERIFIED in their module folders, one round each, the
program printing the greeting from the main folder after the pull. The
design held; what did not hold was around it, and every item above is on
session 126's or 127's list.
