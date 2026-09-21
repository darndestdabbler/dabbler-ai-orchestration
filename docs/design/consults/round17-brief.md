# Consult round 17 — when the framework stops, who gets it moving again

You are consulted on `dabbler-ai-orchestration`, an AI-led coding-session
framework: a TypeScript router (`dabbler <verb>`) bundled into a VS Code
extension, whose customers are .NET and Java teams in an IT shop. You have
NO tool access. Every claim about the repository must cite a path or a fact
from this brief; mark anything else ASSUMPTION.

## The operator's instruction to you, verbatim in spirit

**Do not over-engineer.** The operator's words: "AI models often *try* to
prove their value by adding sophistication, which just complicates the
design. If there is a simpler solution, we should go with that. If there was
a way to just ensure that AI always followed directions, we wouldn't need the
framework." A recommendation to delete or to not build something is a
first-class answer. A recommendation to add a mechanism must say what it
replaces and why nothing simpler covers the case. Designs are judged by:
what really skilled human developers would do; whether it can be explained
on one slide without a state machine; simpler and more reliable every time;
human time outranks AI time.

## How the system works today

A developer works in an engine CLI (Claude Code or GitHub Copilot CLI) in a
VS Code terminal. The framework's **loop** (`dabbler session run --mailbox`,
a long-lived Node process the extension starts in its own terminal) owns the
session's lifecycle: it accepts the AI's work plan, issues each step as an
instruction, runs each step's checks, runs cross-provider verification, the
test suites, the commit, the push, the release, the close. The AI keeps a
background **waiter** (`dabbler session wait`) that prints the next
instruction when the loop writes one; the AI does the work and answers with
`dabbler session report`. The loop refreshes a heartbeat file while it runs;
the waiter and the extension's **Resume Session** button read that heartbeat
to know whether a loop is driving.

The operator's fixed principles:

1. Every deterministic, rule-governed operation is the framework's. Neither a
   person nor the AI does anything a rule could do.
2. The AI does the non-deterministic work — code, plans, remediation,
   critical evaluation, **troubleshooting including workarounds for
   deterministic operations the framework does not handle yet**.
3. The operator sees everything, can interrupt and override any rule at any
   time, and has final authority on architecture and acceptance.
4. **Zero deadlock tolerance.** Every stop must have a forward exit.
5. The record under `.dabbler/runs/` and the session ledger are written only
   by the framework. No AI and no person hand-edits a verdict, a gate or a
   run file.

## What the framework already has for stops (facts, from the tree)

- The loop halts short of the close by throwing a `Stop` with a closed
  **kind**: `budget`, `rejected-thrice`, `blocked`, `engine`, `tree`,
  `tests`, `verification`, `land`, `publish`, `close`, `interrupted`
  (`packages/router/src/generated/driver-run.ts`), and where the kind is too
  coarse a closed **code** (`no-verdict`, `provider-unreachable`,
  `reviewer-unreachable`, `dispute-refused`, `cap-unresolved`,
  `cap-disputed`, `cap-terminal-tree-moved`). A `Stop` is written to
  `driver/run.json` with its reason and rendered for a person with "the ways
  on" — each way is a command (`packages/router/src/drive.ts`, the catch at
  the end of the drive; `renderStop`).
- **Any error that is not a `Stop` is rethrown**, the CLI entry prints one
  line to the terminal and exits 1, and **nothing is written to the record**
  (`drive.ts` ~line 3424; `packages/router/src/cli/dabbler.ts`).
- Every loop event is appended to `driver/supervision.jsonl`
  (`session-run-started`, `instruction-overdue`, `continuation-spent`, …).
- The waiter, finding a stale heartbeat, prints "no loop is driving session
  NNN … Tell the operator; Resume Session starts it, or in a terminal of its
  own: `dabbler session run --mailbox …`" and exits (`drive.ts`,
  `noLoopMessage`). Resume checks the heartbeat and starts a loop only if
  none is alive (`tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`,
  `runResumeSession`). Restarting is idempotent: the loop re-reads
  `run.json`, and an accepted plan is not re-asked.
- **The cross-provider verifier already has bounded, framework-routed
  agency** (`packages/router/src/agency.ts`): list files, search contents,
  read a file (via the CLI's own tools on the seat path, or a file request on
  the API path), and ONE write — the verifier emits the file it wants in its
  answer and the framework writes the bytes, refusing any path outside the
  declared test roots. A read budget (default 40), an out-of-scope counter,
  a fidelity check that the bytes shown match the disk, and every operation
  on the round's record.

## The incident that prompted this round (2026-09-17, a tutorial repository)

Session 002's loop accepted the AI's work plan at 19:52:20 and then died
before declaring the task — no `Stop` recorded, phase still `plan`,
heartbeat stale. The AI's waiter correctly reported "no loop is driving",
the AI correctly told the operator, and the operator had to click Resume.
Resume works (tested on a copy: it accepted the existing plan and issued
the first work step). **Why the loop died is unrecoverable**: the loop's
terminal shows nothing, because the extension runs the loop as the editor's
own executable (a Windows GUI-subsystem binary) told to behave as Node, and
such a process is not attached to the terminal's console, so its output
never reaches the tab. Nothing wrote the cause anywhere else.

The operator's reaction: "Whenever a human has to click Resume, the
framework should be able to detect this and just resume itself." And, more
broadly: the deterministic layer made sessions far more uniform than AI-led
ones were, "but it doesn't have the ability to self-heal and continue …
Right now it has holes like swiss cheese." Earlier sessions each fixed one
hole (three release deadlocks; a cap terminal with no exit; Resume itself).
The operator wants the *class* fixed, simply.

## The proposal under consideration (critique it; delete from it freely)

Three layers, built in this order, each small:

**1. Supervisor (deterministic).** A loop whose heartbeat is stale and whose
`run.json` records no stop is a crash, and a crash is restarted by the
framework itself — bounded (say twice for the same outstanding instruction),
each restart on `supervision.jsonl`, and after the bound a real `Stop`
naming the crash. A stop that IS recorded (budget spent, tree dirty,
operator's Stop, cancel) is never auto-restarted: it was meant. Plus: every
loop writes its output to a log file under `driver/`, so a dead loop leaves
an account whoever started it; and an uncaught error is written to
`run.json` as a stop before the process exits. Open question: who does the
restarting — the AI's waiter (it already detects the case and is a process
the framework wrote), the extension, or the loop re-launching itself
detached?

**2. Owner table (deterministic).** One table in code assigns every stop
kind/code an owner — *supervisor*, *framework* (a known cure applied
automatically, e.g. a transient provider error retried), *AI*, or *human* —
and one test asserts every kind has a row, so a new stop cannot ship without
an owner. Only the *human* row reaches the operator.

**3. Mechanic (AI, bounded).** For the *AI* row and for a supervisor whose
restarts are spent: the framework opens a **lease** to a fresh AI
conversation — ideally not the authoring conversation, whose assumptions are
often the problem — of N operations (say 20; writes and commands counted,
reads nearly free) through the same framework-routed channel the verifier
already uses, extended with write-anywhere-in-the-tree and run-a-command.
The mechanic reads the same record a person would (`run.json`,
`supervision.jsonl`, transcripts, the new loop log); it never touches the
record, a verdict or a gate; it never declares success — the lease ends in
"retry from phase X" or "blocked: <why>", the framework re-runs the thing
that failed and its own check judges; its edits ride in the session's diff
and get cross-provider verification like everything else; in a repository
where the framework is an installed package it fixes the session (tree,
config, a bad check), not the framework. Triggered by state (a stop's row,
or restarts exhausted), never by a timer.

Explicitly NOT proposed: escalation timers, a third model, mechanic-only
diagnostics, a global "AI-driven mode" toggle.

## Questions

Answer each in this shape: **Recommendation** (one sentence) · **Design**
(the mechanism in a few sentences) · **The one risk** · **Mitigation** ·
**Delete** (what in the proposal you would not build, and what you would
build instead if anything).

1. **The shape.** Is three layers the simplest thing that fixes the *class*
   ("a human clicks Resume for something no human needed to decide"), or is
   there a simpler design? For instance: would "record every uncaught error
   as a stop + the waiter restarts a crashed loop, bounded" alone retire
   most of the holes, with nothing else built until evidence says otherwise?
2. **The supervisor.** Who restarts a crashed loop, and why that process
   rather than the others? Is a bound of two right, and what happens at the
   bound? Should the loop's output go to a log file, the terminal, or both?
3. **The owner table.** Is it worth building, or is the existing closed
   kind/code list already the table and only the *uncaught → recorded* gap
   needs closing? If you keep it, which of the eleven kinds go to which
   owner?
4. **The mechanic.** Build it now, or defer until layers 1–2 have run in
   real sessions and shown which stops remain? If built: is the verifier's
   agency channel the right base, what is the minimum operation set, what is
   the budget unit, and should it be a different model or just a different
   conversation? What must it never be allowed to do?
5. **The AI side.** The AI's own CLI can die too (its waiter was killed; its
   chat closed). Should anything change there, or does Resume remain the
   right answer for that case?
6. **The one thing to prove first.** Before building, what single measurement
   or experiment most reduces the risk of this design being wrong?
