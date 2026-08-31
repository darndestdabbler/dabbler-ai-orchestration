# Driving a session

This is for the person who has never seen the framework run and is about
to press **Start Session** in the Work Explorer. It says what happens
when you do, what you will see, how to talk to the engine while it works,
and what to do when it stops. Every command below can be pasted into a
terminal at the repository root as it stands.

## What a driven session is

A session is a numbered block of work in `docs/sessions/session-plan.md`
with a lifecycle around it: register, declare, work, run the affected
tests, verify with a different provider, run the whole suite, commit and
push, close. In the typed lifecycle an engine (Claude Code, Codex, a
Copilot seat) reads `AGENTS.md`, follows that list itself and types the
`dabbler` commands. It wanders. A less capable engine wanders more.

In a **driven** session the framework owns the list and the engine is a
service it calls. `dabbler session drive` registers the session, asks the
engine for a work plan, declares from it, hands the engine one step at a
time, checks every report mechanically, runs the tests itself, calls the
verifier, routes findings back for the engine's decision, runs the suite,
commits, pushes and closes. The engine answers each ask through one verb,
`dabbler session report`, and every answer is JSON against a schema —
refused, with reasons, when it does not validate. The engine's prose is
for people; the framework never reads it.

**Start Session** in the Work Explorer is that command. Nothing is copied
to your clipboard and nothing waits for you to paste it.

## Before you press Start

- The repository has a `docs/sessions/session-plan.md` with a
  `### Session N of M:` block for the next session, and a `dabbler.yaml`
  at the root. (`dabbler bootstrap` makes both; see `quick-start.md`.)
- The engine's own CLI is installed and signed in on this machine:
  `claude`, `codex` or `copilot`. The driver spawns it; it does not embed
  it. Gemini has no driven shape yet and Start refuses it by name.
- The verifier needs a provider key in the environment —
  `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY` or
  `DABBLER_GEMINI_API_KEY` — for a provider *other* than the engine's.
  Verification is cross-provider and there is no way to skip it.
- Two keys in `dabbler.yaml` shape the run, both optional:

  ```yaml
  driver:
    max_invocations: 24     # how many times the engine may be called (default 24)
    engine_output: stream   # stream | quiet -- what you see, never what is recorded
  ```

## Pressing Start

The Work Explorer asks two things and then runs.

1. **Which engine?** Claude Code, Codex or GitHub Copilot. The session is
   attributed to it in the record, and the verifier is chosen from a
   different provider.
2. **Which model?** Optional for Claude Code and Codex (empty means the
   engine's default; `haiku` is a cheap way to watch the whole flow).
   Required for a Copilot seat — a seat is nothing without one, and the
   box says so before anything is launched.

From a terminal the same launch is:

```
dabbler session drive --engine claude-code --provider anthropic --model haiku
```

```
dabbler session drive --engine copilot --provider openai --model gpt-5-6-luna
```

The extension runs exactly that, as a separate process on the editor's
own Node, standing at the repository root, and opens the **Dabbler:
Engine** output channel. One drive per repository at a time: a second
Start on the same repository is refused before it spawns.

## What you will see

Everything the driver prints goes to **Dabbler: Engine** as it happens.
Two kinds of line:

```
drive [06:49:17] run-started session=001 engine=claude-code max_invocations=12
drive [06:49:17] instruction-issued seq=1 kind=step step=plan
drive [06:49:17] engine-invoked seq=1 invocation=1/12 first=true output=stream
  │ engine session started (claude-haiku-4-5-20251001)
  │ thinking: The user is asking me to: 1. Read a file at ...\driver\instruction.json 2. Do exactly what its "ask" says ...
  │ tool Read  {"file_path":"C:\\temp\\dabbler-drive-walk\\.dabbler\\runs\\s1\\driver\\instruction.json"}
  │   ← 1 { 2 "schema_version": 1, 3 "seq": 1, 4 "session_number": 1, ...
  │ tool Write  {"file_path":"C:\\temp\\dabbler-drive-walk\\.dabbler\\scratch\\plan.json","content":"{\n  \"task\": ...
  │ tool Bash  {"command":"dabbler session report --sessions-dir C:\\temp\\dabbler-drive-walk\\docs\\sessions --seq 1 --answer-file ...
drive [06:51:56] engine-returned seq=5 exit=0 seconds=65 transcript=.dabbler/runs/s1/driver/engine-04.log
drive [06:51:56] plan-accepted steps=["implement-greet","add-greeting-docs"] releasable=false
drive [06:51:56] phase phase=steps
drive [06:51:57] instruction-issued seq=6 kind=step step=implement-greet
drive [06:51:57] engine-invoked seq=6 invocation=5/12 first=false output=stream
```

(Those are lines from a real walk of a two-step scratch session with Haiku
on Claude Code, lightly cut for width; every example in this guide is.)

- `drive [time] event …` lines are the loop's own: which phase it is in,
  which instruction it issued, whether a report was accepted or refused
  and why, what the tests did, what the verifier said. They are always
  shown.
- `  │ …` lines are the engine's live output, rendered per engine: Claude
  Code's stream as `thinking` / `tool` / `text` / `result` lines (and its
  first `init` system event, nothing else from that stream), Copilot's own
  progress lines as they are, Codex's completed items. These appear only
  when `driver.engine_output` is `stream` (the default).

**What `quiet` hides.** With `engine_output: quiet` the `│` lines are
not shown; you see the driver's lines and nothing between an
`engine-invoked` and the next event. Nothing else changes: the engine is
run with the same arguments, and every line it printed — shown or not —
is on the transcript at `.dabbler/runs/s<N>/driver/engine-<NN>.log`, one
file per invocation. `quiet` is for when you are not watching, not for
saving anything.

The Work Explorer moves on its own while this runs. Its task rows —
Register, Declare, Work, Verify, Run of record, Close — are derived from
the lifecycle's own records, and every one of those is written by a verb
the driver calls. Nothing the engine types moves a row.

## Talking to the engine while it works

While a drive is running the status bar shows three items: the session
being driven (click it to open **Dabbler: Engine**), **Stop**, and **Send
to engine**. Both buttons are one router verb, `dabbler session
interrupt`, and both can be typed from a terminal at the repository root.

### Send: an instruction between steps

```
dabbler session interrupt --reason "Use the existing spawn helper in checks.ts instead of a new one"
```

The driver ends the engine's running invocation — through Claude Code's
own interrupt message where it has one, by ending the process tree where
it does not — writes `# interrupted (<your text>)` on the transcript, and
re-issues the **same** instruction under a new seq with your text first
among its `reasons`. Then it calls the engine again with the engine's
own `--continue`, so it keeps its context and reads what changed. In the
channel:

```
drive [06:52:06] engine-interrupting seq=6 invocation=5 reason=Keep greet() a one-line return; do not add a JSDoc block to src/greet.mjs.
drive [06:52:07] engine-interrupted seq=6 exit=1 seconds=10 transcript=.dabbler/runs/s1/driver/engine-05.log
drive [06:52:07] instruction-issued seq=7 kind=interrupt step=implement-greet reasons=1
drive [06:52:07] engine-invoked seq=7 invocation=6/12 first=false output=stream
```

(In that walk the engine did as it was told: `greet` came back as a
one-line return with no comment block, and the step was accepted.)

A Send made while no invocation is running — between steps, during a
verification round — has nothing to end. The driver discards it and says
so (`interrupt-discarded … why=no invocation was running`). Send while the
`│` lines are moving.

### Stop: halt the loop

```
dabbler session interrupt --stop --reason "Wrong approach; I want to change the plan"
```

Stop ends the invocation the same way and then halts the loop instead of
re-invoking:

```
drive [06:54:14] engine-stopping seq=9 invocation=8 reason=Walk done: a step was accepted after an interrupt; stopping before verification.
drive [06:54:15] engine-interrupted seq=9 exit=1 seconds=6 transcript=.dabbler/runs/s1/driver/engine-08.log
drive: STOPPED (interrupted) in phase 'steps' after 8 invocation(s) -- Walk done: a step was accepted after an interrupt; stopping before verification.
Session 001 stays in flight; the same command re-runs from this phase.
```

The stop is recorded on the session's run state with your reason, the
session stays in flight, the driver process exits, and the Work Explorer
shows the reason on the first task row not yet done — in that walk, the
Work row:

```
Driver stopped (interrupted): Walk done: a step was accepted after an interrupt; stopping before verification. -- `dabbler session drive` re-runs from this phase.
```

Unlike Send, a Stop asked for while nothing is running is not discarded:
the driver honours it at the next boundary (before the next invocation,
or when the phase it is in — a verification round, the suite — ends).

To continue, press **Start Session** again with the same engine, or type
the same `session drive` line. The loop re-enters the phase it reached,
skips the steps already accepted, and carries the invocation count on. A
different engine is refused: one engine's own session store holds the
context for the run.

Closing the VS Code window ends a driver it started, the same way, minus
the recorded reason: the session stays in flight and the same Start
continues it.

## What a rejection looks like

The driver judges every step report in one place: the seq must be the
outstanding one, the step the one asked for, every listed file must exist,
the listed files must be exactly what the tree changed since the last
accepted step, and the step's own checks (the `argv` the engine put in its
plan, at least one per step) must pass. A report that fails any of these is
refused with every reason:

```
drive [06:49:58] plan-rejected seq=1 rejection=1 reasons=["no work plan was written for instruction 1; the answer is `dabbler session report --sessions-dir C:\\temp\\dabbler-drive-walk\\docs\\sessions --seq 1 --answer-file <path to the JSON you wrote>`"]
drive [06:49:58] instruction-issued seq=2 kind=rejection step=plan reasons=1
...
drive [06:52:21] report-rejected seq=7 step=implement-greet rejection=1 reasons=["no report was written for instruction 7; the answer is `dabbler session report ... --seq 7 --step implement-greet --status done --files <every file you created or changed, comma-separated, repository-relative> --notes \"<one line>\" [--tests \"<the test command you ran>\"]`"]
drive [06:52:21] instruction-issued seq=8 kind=rejection step=implement-greet reasons=1
```

Both of those are from the walk: Haiku wrote the plan and then *printed*
the answer command as its reply instead of running it, twice, and did the
same with a step report once. Nothing was accepted on the engine's say-so;
the rejection carried the exact command, and the next turn ran it. (The
one-sentence prompt the driver hands the engine now says "RUN the shell
command" rather than "answer with the command", because of this.) A report
that names a stale seq is refused by the report verb itself, in the
engine's own shell:

```
  │   ← Exit code 3 report: refused -- the answer names seq 4; instruction 5 is outstanding.
```

The engine receives a `rejection` instruction: the same ask, the reasons
under `reasons`, and the note that the previous report was refused. It
fixes and reports again with the new seq. Other reasons a report is
refused: a listed file that does not exist, a file the tree changed that
the report omits, a step check that fails. Three refusals of one step stop
the loop (`rejected-thrice`); the reasons are on the run state and the
task row, and a re-run asks for the step afresh.

The same shape carries the verifier's findings. When a round is blocking,
the engine is asked for a **disposition** per finding — `fix`, or `reject`
with a reason and evidence paths — as JSON. A `fix` becomes a step named
`fix-round-<N>`, checked by every plan step's checks; a `reject` becomes a
dispute the next round must engage. Red affected tests and a red run of
record come back the same way, as steps named `fix-tests` and
`fix-run-of-record`.

## What each step costs on a seat

Every `engine-invoked` line says `invocation=N/max`. On a Copilot seat
each invocation is one premium request. A clean session costs one
invocation for the plan and one per step; every rejection, every Send,
every disposition round and every fix step is one more. The driver never
invokes the engine to read its final `done` instruction — on a seat that
would buy nothing.

## When the loop stops at its budget

```
drive: STOPPED (budget) in phase 'steps' after 24 invocation(s) -- the engine has been invoked 24 times, the limit set by driver.max_invocations (24); re-run with --max-invocations <larger> to continue, which is a decision to spend more
Session 059 stays in flight; the same command re-runs from this phase.
```

Nothing is closed and nothing is lost: the accepted steps, the tree and
the seq are on `.dabbler/runs/s<N>/driver/run.json`, and the task row says
`Driver stopped (budget): …`. Read the transcripts under the same
directory to see where the invocations went. To continue:

```
dabbler session drive --engine claude-code --provider anthropic --max-invocations 40
```

That is a person deciding to spend more, which is why the bound lives in
the tracked `dabbler.yaml` and not in a per-machine overlay. The other
stops read the same way and mean what they say: `rejected-thrice`,
`blocked` (the engine reported a step cannot be done, with its notes),
`engine` (its CLI could not be run), `tests`, `verification`, `land` (the
commit or push), `close` (a gate refused; the rows are above the stop),
`interrupted` (you pressed Stop).

## Where the record is

```
.dabbler/runs/s<N>/driver/
  run.json            where the loop is, and why it stopped
  instruction.json    the current ask
  report.json         the engine's current answer
  plan.json           the engine's work plan
  dispositions.json   its answer to the verifier's findings
  engine-01.log ...   one transcript per invocation, shown or not
```

Machine-owned, like everything under `.dabbler/runs/`: never hand-edited,
and not the place a verdict can be typed. The lifecycle's own records —
`docs/sessions/sessions.json`, `activity-log.json`, the rounds ledger —
are written by the same verbs a typed session uses, so a driven session
leaves exactly the record a typed one leaves.
