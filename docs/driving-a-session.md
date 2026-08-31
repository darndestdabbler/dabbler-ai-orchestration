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
dabbler [09:23:17] run-started session=001 engine=claude-code max_invocations=24
dabbler [09:23:17] instruction-issued seq=1 kind=step step=plan
dabbler [09:23:17] engine-invoked seq=1 invocation=1/24 first=true output=stream
  │ engine session started (claude-haiku-4-5-20251001)
  │ thinking: The user is asking me to: 1. Read a specific JSON file from a path 2. Do exactly what its "ask" says ...
  │ tool Read  {"file_path":"C:\\temp\\dabbler-guide-walk\\.dabbler\\runs\\s1\\driver\\instruction.json"}
  │   ← 1 { 2 "schema_version": 1, 3 "seq": 1, 4 "session_number": 1, 5 "issued_at": "2026-08-31T09:23:17.890 ...
  │ engine: I'll read the repository to understand its structure, create a work plan, write it to a JSON file, ...
  │ tool Glob  {"pattern":"**","path":"C:\\temp\\dabbler-guide-walk"}
  │   ← dabbler.yaml tests\run.mjs .gitignore src\greet.mjs docs\sessions\session-plan.md ...
dabbler [09:23:49] engine-returned seq=1 exit=0 seconds=31 transcript=.dabbler/runs/s1/driver/engine-01.log
dabbler [09:23:49] plan-accepted steps=["implement-greet"] releasable=false
dabbler [09:23:49] phase phase=steps
dabbler [09:23:49] instruction-issued seq=2 kind=step step=implement-greet
dabbler [09:23:49] engine-invoked seq=2 invocation=2/24 first=false output=stream
dabbler [09:24:06] check-passed step=implement-greet argv=["node","tests/run.mjs"]
dabbler [09:24:07] report-accepted seq=2 step=implement-greet files=["src/greet.mjs"]
```

(Those are lines from a real walk of a one-step scratch session with Haiku
on Claude Code, lightly cut for width; every example in this guide is.)

- `dabbler [time] event …` lines are the loop's own: which phase it is in,
  which instruction it issued, whether a report was accepted or refused
  and why, what the tests did, what the verifier said. They are always
  shown. The framework speaks in a word; the engine speaks under a glyph.
- `  │ …` lines are the engine's live output, rendered per engine: Claude
  Code's stream as `thinking:` (its reasoning), `engine:` (its own words
  to a person), `tool <name>` with the call's argument, `  ← ` for what
  the tool returned, and `result:` when the turn ends — plus its first
  `init` system event as `engine session started`, and nothing else from
  that stream. Copilot's own progress lines appear as they are; Codex's
  completed items render the same way, with `edit <paths>` for a file
  change. These appear only when `driver.engine_output` is `stream` (the
  default).

**How it reads in colour.** The channel is created under a language of
its own, and the extension contributes a grammar for it, so the classes
above are told apart at a glance: the driver's clock and its `key=` names
recede into the theme's dimmed comment colour while their values stay
plain — `1/24` reads, `invocation=` does not — and event names take the
keyword colour. Anything that refused or stopped — `plan-rejected`,
`report-rejected`, `check-failed`, `tests-failed`, the `dabbler:`
diagnostics, `stderr:` and `error:` — takes the theme's error colour, so
a refusal in two hundred lines is seen rather than found. On the engine's
lines `thinking:` and the `←` results are dimmed, a tool's name is
picked out from its argument, and `engine:` is given no colour at all,
which leaves the engine's own words the brightest text in the block.
Every one of those is a scope the themes already paint: the extension
chooses no colours, so a light theme and a dark one each look like
themselves.

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
dabbler [06:52:06] engine-interrupting seq=6 invocation=5 reason=Keep greet() a one-line return; do not add a JSDoc block to src/greet.mjs.
dabbler [06:52:07] engine-interrupted seq=6 exit=1 seconds=10 transcript=.dabbler/runs/s1/driver/engine-05.log
dabbler [06:52:07] instruction-issued seq=7 kind=interrupt step=implement-greet reasons=1
dabbler [06:52:07] engine-invoked seq=7 invocation=6/12 first=false output=stream
```

(In that walk the engine did as it was told: `greet` came back as a
one-line return with no comment block, and the step was accepted.)

A Send made while no invocation is running — between steps, while the
tests or a verification round run — has nothing to end, and it is not
lost: the driver keeps it (`interrupt-deferred … it travels with the next
instruction`) and the next instruction carries it first among its
`reasons` as `sent: <your text>`, so the engine reads it exactly as it
would have after an interrupt. Two Sends in a row both arrive, in order.

### Stop: halt the loop

```
dabbler session interrupt --stop --reason "Wrong approach; I want to change the plan"
```

Stop ends the invocation the same way and then halts the loop instead of
re-invoking:

```
dabbler [09:24:36] engine-stopping seq=3 invocation=3 reason=The driver read the invoking repository's dabbler.yaml, not this one's ...
  │ interrupt acknowledged
  │ result: error_during_execution in 24831 ms, $0.0499
dabbler [09:24:37] engine-interrupted seq=3 exit=1 seconds=28 transcript=.dabbler/runs/s1/driver/engine-03.log
dabbler: STOPPED (interrupted) in phase 'preverify' after 3 invocation(s) -- The driver read the invoking repository's ...
Session 001 stays in flight; the same command re-runs from this phase.
```

`interrupt acknowledged` is Claude Code answering the driver's own
control message: the engine ended its turn when asked, rather than being
killed. Where a CLI has no such message — or does not answer within ten
seconds — the driver ends the process tree instead, and the only
difference you see is that no acknowledgement is printed.

The stop is recorded on the session's run state with your reason, the
session stays in flight, the driver process exits, and the Work Explorer
shows the reason on the first task row not yet done — in that walk, the
Work row:

```
Driver stopped (interrupted): The driver read the invoking repository's dabbler.yaml, not this one's ... -- `dabbler session drive` re-runs from this phase.
```

A Stop asked for while nothing is running is honoured at the next
boundary (before the next invocation, or when the phase it is in — a
verification round, the suite — ends); nothing is invoked in between.

To continue, press **Start Session** again with the same engine, or type
the same `session drive` line. Its first line says where it is picking
up, and after what:

```
dabbler [09:24:59] run-resumed session=001 phase=preverify invocations=3 max_invocations=24 after=interrupted
```

The loop re-enters the phase it reached, skips the steps already
accepted, and carries the invocation count on. A different engine is
refused: one engine's own session store holds the context for the run.

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
dabbler [06:49:58] plan-rejected seq=1 rejection=1 reasons=["no work plan was written for instruction 1; the answer is `dabbler session report --sessions-dir C:\\temp\\dabbler-drive-walk\\docs\\sessions --seq 1 --answer-file <path to the JSON you wrote>`"]
dabbler [06:49:58] instruction-issued seq=2 kind=rejection step=plan reasons=1
...
dabbler [06:52:21] report-rejected seq=7 step=implement-greet rejection=1 reasons=["no report was written for instruction 7; the answer is `dabbler session report ... --seq 7 --step implement-greet --status done --files <every file you created or changed, comma-separated, repository-relative> --notes \"<one line>\" [--tests \"<the test command you ran>\"]`"]
dabbler [06:52:21] instruction-issued seq=8 kind=rejection step=implement-greet reasons=1
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
dabbler: STOPPED (budget) in phase 'steps' after 24 invocation(s) -- the engine has been invoked 24 times, the limit set by driver.max_invocations (24); re-run with --max-invocations <larger> to continue, which is a decision to spend more
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
