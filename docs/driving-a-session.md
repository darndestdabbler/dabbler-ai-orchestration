# Driving a session

This is for the person about to run a session with an AI engine for the
first time. It says what to type, what comes back, what to do with it, how
to interrupt, and what to do when the framework stops.

Every example line below came from one walk on a scratch repository on
2026-08-31 — a single-step session taken from `session next` through to
`done`, with one refused report, one message sent mid-session and one halt
— and the lines are as they were printed. Nothing here is illustrative.

**"Starting from the Work Explorer" below came from a second walk**, on
2026-08-31 after session 62, on a scratch repository at `C:\temp\s62-walk`
with the Copilot seat named as the engine: a session registered, one step
done, a `wait` while the affected tests ran, a halt from `session
interrupt --stop`, and the decision that halt raised — answered, after
which the session resumed. Its lines are as they were printed too.

## The shape of it

A session is a numbered block of work in `docs/sessions/session-plan.md`
with a lifecycle around it: register, declare, work, run the affected
tests, verify with a different provider, run the whole suite, commit and
push, close. Following that list in prose is what an engine is worst at —
it wanders, and a less capable engine wanders further.

So the framework owns the list, and the engine asks it what to do next:

```
dabbler session next --sessions-dir docs/sessions
```

One call, one move. It judges whatever answer is outstanding, advances the
session by one step, and prints the next instruction on stdout. You do
what the instruction says, run the command it names, and call `next`
again — until it says `done`.

**The engine stays in its own CLI.** Nothing spawns Claude Code or Codex
or a Copilot seat; you are already talking to one, in the terminal you
like, with your own context, your own scrollback and your own interrupt
key. The whole instruction an engine needs is one sentence: *call `dabbler
session next` and do what it says until it says `done`.*

## Before the first call

- The repository has a `docs/sessions/session-plan.md` with a
  `### Session N of M:` block for the next session, and a `dabbler.yaml`
  at the root. (`dabbler bootstrap` makes both; see `quick-start.md`.)
- The verifier needs a provider key in the environment —
  `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY` or
  `DABBLER_GEMINI_API_KEY` — for a provider *other* than the engine's.
  Verification is cross-provider and there is no way to skip it.
- The first call registers the session, so it needs to know who is
  working:

  ```
  dabbler session next --sessions-dir docs/sessions \
      --engine claude-code --provider anthropic
  ```

  Leave both off on every later call: the session is in flight and its
  identity is on the record.

- `--max-rounds` and `--transport`, if you want them, go on that first
  call too. They are the *run's*, not the call's: the call that eventually
  starts verification is whichever `next` happens to reach that phase,
  following an `answer_command` that names neither, so they are kept on
  `run.json` and used when the round is finally started. Naming them again
  on a later call changes them.

## What comes back

Stdout carries exactly one thing — the instruction, as JSON. Everything
else the framework says goes to stderr, where you can read it and a
parser does not have to.

```
dabbler [11:31:20] run-started session=001 engine=claude-code max_invocations=24
dabbler [11:31:20] instruction-issued seq=1 kind=step step=plan
```

```json
{
  "schema_version": 1,
  "seq": 1,
  "session_number": 1,
  "kind": "step",
  "step_id": "plan",
  "ask": "Plan session 001 of this repository. Its section of the session plan (session-plan.md) follows between the markers...",
  "answer_schema": "driver-work-plan.schema.json",
  "answer_command": "dabbler session report --sessions-dir C:\\temp\\pull-walk-61\\repo\\docs\\sessions --seq 1 --answer-file <path to the JSON you wrote>"
}
```

Five kinds and no sixth.

| `kind` | what it means | what you do |
| --- | --- | --- |
| `step` | work to do — the plan, or one step of it | do it, run `answer_command`, call `next` |
| `rejection` | your last answer was refused; `reasons` says why | put them right, answer again with **this** seq |
| `wait` | the framework is running something long | leave it `retry_after_seconds`, call `next` |
| `interrupt` | your invocation was ended; the reason is in `reasons` | read it, then answer what was still owed |
| `done` | the session is closed | stop |

`answer_command` is always literal and always right: run it as printed,
filling in the placeholders. It carries the seq the answer must name, so
an answer to a superseded instruction cannot be mistaken for the current
one.

## Answering

The first instruction asks for a work plan — the task in a paragraph,
whether the session may publish, and the ordered steps, each with the
files it will touch and at least one mechanical check that proves it. Write
it as JSON somewhere outside the tracked tree and hand the file over:

```
dabbler session report --sessions-dir docs/sessions --seq 1 --answer-file /tmp/plan.json
report: session 001 seq 1 answered; work plan (1 step(s), releasable=no) written to .dabbler/runs/s1/driver/plan.json; the driver reads it next.
```

The next call accepts it, declares the session from it, and asks for the
first step:

```
dabbler [11:31:21] plan-accepted steps=["widget"] releasable=false
declare: session 001 declared; releasable=no.
dabbler [11:31:21] phase phase=steps
dabbler [11:31:22] instruction-issued seq=2 kind=step step=widget
```

A step is answered with the files you actually changed:

```
dabbler session report --sessions-dir docs/sessions --seq 3 --step widget \
    --status done --files "src/widget.mjs" --notes "widget returns 2"
```

## When an answer is refused

The framework judges every report against the tree, not against your word
for it. Name a file the tree did not change, omit one it did, or fail the
step's own check, and the next `next` hands the step back:

```json
{
  "seq": 3,
  "kind": "rejection",
  "step_id": "widget",
  "ask": "Change `widget()` in src/widget.mjs to return 2.\n\n...The previous report for this step was refused for the reasons listed under `reasons`. Put them right and report again, with THIS instruction's seq.",
  "reasons": [
    "files_changed names 'tests/test_widget.mjs', which the tree did not change since the last accepted step"
  ],
  "answer_schema": "driver-report.schema.json",
  "answer_command": "dabbler session report --sessions-dir C:\\temp\\pull-walk-61\\repo\\docs\\sessions --seq 3 --step widget --status done --files ... "
}
```

Answer it with the new seq. **Three refusals of one step stop the
session** (`rejected-thrice`) — the last reasons are on the run state.
Calling `next` again resumes it, and does not simply judge the failed
answer a fourth time: that answer is left behind, the count starts over,
and the step is asked afresh under a new seq. A person deciding to carry
on is the intervention the bound exists to force. If a step genuinely
cannot be done, say so instead: `--status blocked` with the reason in
`--notes`.

The same shape carries the verifier's findings. When a round is blocking
you are asked for a **disposition** per finding — `fix`, or `reject` with
a reason and evidence paths — as JSON. A `fix` becomes a step named
`fix-round-<N>`, checked by every plan step's checks; a `reject` becomes a
dispute the next round must engage. Red affected tests and a red run of
record come back the same way, as steps named `fix-tests` and
`fix-run-of-record`.

## `wait`: the framework's own long work

Four things take longer than a tool call: the affected tests, a
verification round, the complete suite, and the close. None of them runs
inside a `next` call. The framework starts each one detached and comes
straight back:

```
dabbler [11:31:30] phase phase=preverify
dabbler [11:31:30] preverify suite=unit command=node tests/run.mjs tests/test_widget.mjs
dabbler [11:31:30] job-started name=affected tests: unit pid=49320 log=.dabbler/runs/s1/driver/jobs/affected-tests-unit.log
dabbler [11:31:30] instruction-issued seq=4 kind=wait reasons=1
```

```json
{
  "seq": 4,
  "kind": "wait",
  "retry_after_seconds": 60,
  "log": ".dabbler/runs/s1/driver/jobs/affected-tests-unit.log",
  "answer_command": "dabbler session next --sessions-dir C:\\temp\\pull-walk-61\\repo\\docs\\sessions"
}
```

Nothing is owed here. Do something else for `retry_after_seconds`, read
`log` if you want to watch, and call `next` again; the call after it
reports progress or collects the result:

```
dabbler [11:31:37] job-finished name=affected tests: unit exit=0 log=.dabbler/runs/s1/driver/jobs/affected-tests-unit.log
dabbler [11:31:37] phase phase=verify
dabbler [11:31:37] job-started name=verification pid=28444 log=.dabbler/runs/s1/driver/jobs/verification.log
```

The log is the job's own output, whole:

```
running unit: node tests/run.mjs tests/test_widget.mjs
widget ok
recorded unit [preverify-targeted]: passed in 1s (timed here)
```

**A `wait` is a tool call, not a sleep,** and that is the point of it. An
engine that blocks for four minutes waiting on a verification round hits
whatever timeout its harness puts on a command, and the harness kills the
call rather than the work — this is exactly how the driver spike died. A
`wait` gives the engine its turn back and lets it come to the framework
when it is ready.

## Talking to the engine, and stopping the framework

They are two different things. Your CLI's own Esc or Ctrl+C interrupts the
engine; `dabbler session interrupt --stop` halts the framework. Neither
does the other's job.

**Talking to the engine is between you and your CLI.** It is your session:
press Esc or Ctrl+C, say what you meant, let it carry on. The framework
is not involved and does not need to be — nothing of yours is lost,
because the framework's state only moves when `next` is called.

**Stopping the framework** is `session interrupt`. Without `--stop` it is
a message that travels with the next instruction, so it reaches an engine
that is working from a script rather than reading your terminal:

```
dabbler session interrupt --sessions-dir docs/sessions --reason "the release notes want the version bumped too"
interrupt: requested for session 001 (instruction 3); the driver ends the running invocation and re-invokes the engine with the reason.
```

```
dabbler [11:31:29] interrupt-deferred reason=the release notes want the version bumped too why=no invocation was running; it travels with the next instruction
```

and it arrives first among the next instruction's `reasons`:

```json
  "reasons": [
    "sent: the release notes want the version bumped too"
  ]
```

With `--stop` it halts the session instead:

```
dabbler session interrupt --sessions-dir docs/sessions --reason "I want to look at the diff first" --stop
interrupt: stop requested for session 001 (instruction 5); the driver ends the running invocation and halts -- the session stays in flight, and `session drive` re-runs it.
```

The stop lands on the next call, which prints no instruction and exits 1:

```
dabbler [11:31:38] run-resumed session=001 phase=verify invocations=0 max_invocations=24
dabbler: STOPPED (interrupted) in phase 'verify' after 0 invocation(s) -- I want to look at the diff first
Session 001 stays in flight; the same command re-runs from this phase.
```

## When the framework stops

A stop closes nothing and loses nothing. The phase, the accepted steps,
the tree the next report is measured against and any job still running are
on `.dabbler/runs/s<N>/driver/run.json`, and `stop` says in words which
bound was met. **The same call resumes** — there is no separate resume
verb, and no flag to remember:

```
dabbler [11:31:42] run-resumed session=001 phase=verify invocations=0 max_invocations=24 after=interrupted
dabbler [11:31:42] job-finished name=verification exit=0 log=.dabbler/runs/s1/driver/jobs/verification.log
dabbler [11:31:42] verification-passed
```

Note what the second line says: the verification round the stop
interrupted kept running, and the resuming call collected its result. A
stop halts the framework's *loop*, not work already in flight.

The stop kinds mean what they say: `rejected-thrice`, `blocked` (a step
was reported as impossible, with its notes), `tests`, `verification`,
`land` (the commit or push), `close` (a gate refused; its rows are in the
close's log), `interrupted` (you asked), `budget` (the invocation bound,
which only `session drive` below can meet), `engine`.

If a job **vanished** — no process and no recorded result, which is what a
machine restart leaves — that is a stop too, and deliberately: re-running
a verification round nobody recorded would spend another round's worth of
provider calls on a fact that was never written down.

## The end

```
dabbler [11:31:48] job-finished name=close exit=0
dabbler [11:31:48] instruction-issued seq=8 kind=done
dabbler [11:31:48] phase phase=complete
dabbler: session 001 complete.
```

```json
{
  "schema_version": 1,
  "seq": 8,
  "session_number": 1,
  "kind": "done"
}
```

Behind that, in the close's own log:

```
  verification_clean  PASS
  working_tree_clean  PASS
  pushed_to_remote    PASS
  test_run_fresh      PASS
  owed_decisions      PASS
  verdict_vocabulary  PASS
close: session 001 of sessions closed (VERIFIED).
```

## Starting from the Work Explorer

Everything above is what you type. The extension's job is to open the
right things and to be loud when the framework needs you — it does not
run the session for you, and it never stands between you and your engine.

### What Start opens

**Start Session** on a repository row asks which engine, then opens a VS
Code terminal at the repository root running *that engine's own CLI*,
interactively. Where the CLI takes an opening prompt in its arguments the
sentence is already there; where it does not, the sentence is typed at the
prompt for you to press Enter on. From the walk, the three engines:

```
TERMINAL Claude Code
  cwd:      C:\temp\s62-walk
  command:  claude "Call `dabbler session next --sessions-dir docs/sessions --engine claude-code --provider anthropic` and do what it says until it says `done`."
  typed:    (nothing; the sentence is in argv)

TERMINAL GitHub Copilot
  cwd:      C:\temp\s62-walk
  command:  copilot
  typed:    Call `dabbler session next --sessions-dir docs/sessions --engine copilot --provider openai --model gpt-5-6-luna` and do what it says until it says `done`.
```

Claude Code takes a positional prompt and starts interactive by default.
The Copilot CLI has no positional prompt — its `-p` is documented as
non-interactive — so the sentence is typed and left for you. Codex is
treated the same way, and for a plainer reason: its help was not read on
the machine this was built on, and an argument a CLI does not take is a
launch that fails in front of you.

**What Start does not do.** It spawns no driver. It copies nothing to the
clipboard and pastes nothing into a chat. After it opens the terminal, the
session is yours: your scrollback, your chat, your Esc.

### The Dabbler terminal

Start opens a second terminal beside your CLI, named *Dabbler*, split off
the same panel and shown without taking the caret from what you are
typing. It shows what the framework is doing — the phase the run moved to,
the background job it started, and that job's own output as it arrives.
This is what that terminal printed on the walk:

```
dabbler [14:21:30] terminal-opened repository=s62-walk
dabbler [14:21:30] phase session=001 phase=preverify
dabbler [14:21:30] job-started name=affected tests: unit log=.dabbler/runs/s1/driver/jobs/affected-tests-unit.log
running unit: node tests/run.mjs tests/test_widget.mjs
recorded unit [preverify-targeted]: passed in 1s (timed here)
dabbler [14:21:30] working
```

The framework's own lines carry a band behind them; the job's lines do
not, because they arrive exactly as the runner wrote them — colours,
checkmarks and spinner included. That is the whole reason it is a terminal
and not an output channel.

`working` and `waiting` are the indicator: it says `working` while a
background job is running and `waiting` when there is none and the session
is between your calls. It says each of them once, when the state changes.

The two surfaces name the same events differently, and it is worth knowing
which you are reading. The Dabbler terminal says `job-started` and
`job-collected`; `dabbler session next` in your own CLI says `job-started`
and `job-finished … exit=0`, because the CLI is the side that collected the
exit code. Every block in this section says which of the two it came from.

**It never carries engine chat.** Not one line of it, ever. Under `session
next` the framework does not see your chat at all — you are reading it in
your own CLI — and under unattended `drive` the engine's stream goes to
the "Dabbler: Engine" output channel instead. Chat in the CLI, work in the
Dabbler terminal; there is no setting to get this wrong.

### Start Unattended Session

**Start Unattended Session** is the other launcher: headless `session
drive`, as a child process, streaming into "Dabbler: Engine". It is for CI
and overnight runs — the case where nobody is at a keyboard.

**Stop** and **Send** belong to that and to nothing else. They are
`session interrupt`, which ends an invocation the *framework* made; when
your own CLI is the engine there is no such invocation, and the interrupt
is your own Esc.

### When the framework stops, it says so

A halt is raised as a decision, so one kind of row serves every "waiting
on you". It appears above the session buckets with a warning glyph, a
toast offers the recommended answer, and the activity-bar badge carries
the count. After `session interrupt --stop` on the walk, this is the row
and the badge the Explorer built — printed here as the model carries them,
since a screenshot cannot be pasted into a text file:

```
ROW  Session 001 stopped (interrupted) in phase 'preverify'. Run it again, or cancel it?
     Nothing happens. The session stays in flight and its record stops moving until someone resumes it or cancels it.
     icon={"kind":"theme","id":"warning","color":"charts.yellow"} command=dabbler.answerOwedDecision

BADGE {"value":1,"tooltip":"Dabbler is waiting on you: Session 001 stopped (interrupted) in phase 'preverify'. Run it again, or cancel it?"}
```

The row's tooltip is the whole brief — the question, what the framework
already established, and each option with what follows from it:

```
**Session 001 stopped (interrupted) in phase 'preverify'. Run it again, or cancel it?**

the widget needs a rethink

- **Run `next` again** — *recommended*: The session resumes from 'preverify'. The steps it has already accepted are not asked for again.
- **Cancel the session**: `dabbler session cancel` ends it with a reason on the record. What the working tree already carries stays where it is.

If nobody answers: Nothing happens. The session stays in flight and its record stops moving until someone resumes it or cancels it.
```

The toast offers the recommended option by its own label, *Other…* and
*Later*. **Later records nothing** — dismissing a toast is not a decision,
and the row stays. *Other…*, or a click on the row, opens a picker whose
items carry each consequence:

```
Run `next` again  ◀ default
  detail: The session resumes from 'preverify'. The steps it has already accepted are not asked for again. (recommended)
Cancel the session
  detail: `dabbler session cancel` ends it with a reason on the record. What the working tree already carries stays where it is.
```

Choosing records the answer through `dabbler owed answer`, which is the
same one writer the command line uses:

```
owed: 'driver-stop-s1' answered 'Run `next` again'.
```

Answering does not itself resume the session — the next `session next`
does, from the phase it stopped in, and nothing already accepted is asked
for again. That call is the one you make in your own CLI, and this is what
it printed there:

```
dabbler [14:22:18] run-resumed session=001 phase=preverify invocations=0 max_invocations=24 after=interrupted
dabbler [14:22:19] job-finished name=affected tests: unit exit=0 log=.dabbler/runs/s1/driver/jobs/affected-tests-unit.log
dabbler [14:22:19] phase phase=verify
```

The liveness row beside it says which of the two states the session is in
— `working` while a job is running, `waiting` between calls:

```
ROW  Session 001 is in flight — waiting
     Nothing is running; the session is between calls. Last written less than 2 minutes ago. This is the record moving, not the work.
```

It reports the record moving, not the thinking. A `waiting` session is one
the framework is not running something for; it is not a judgment about
whether the work is going well.

## `session drive`: the same loop, unattended

`dabbler session drive` is this loop with the framework invoking a
headless engine between the moves instead of waiting for you to call back.
It is the same code — the same phases, the same judging, the same
detached jobs — and it exists for the case where nobody is at a keyboard:
CI, an overnight run.

```
dabbler session drive --engine claude-code --provider anthropic
```

It is the only mode with an invocation budget, because it is the only mode
where the *framework* is spending: `driver.max_invocations` in
`dabbler.yaml` (default 24), and on a Copilot seat each invocation is one
premium request. Reaching it is a `budget` stop, and continuing is
`--max-invocations <larger>` — a person deciding to spend more, which is
why the bound is in the tracked `dabbler.yaml` and not a per-machine
overlay.

Under the pull there is no such bound. The engine is your own CLI, and its
bill is yours.

An engine's conversation is resumed **by its id** — the `session_id`
Claude Code reports, the `thread_id` Codex reports — never by asking for
the most recent conversation in the directory. Session 60 asked for the
most recent one and got an interactive session somebody had opened in the
same working directory since.

A Copilot seat reports no id, so there is nothing to name: every
invocation of it is a fresh conversation, carrying only what the
instruction file carries. That costs a re-read per step, and it is the
right way round — a seat you also use interactively in the same
repository is exactly where continuing "whatever ran last" goes wrong.
Resume-by-id for the seat is owed, once one is measured.

## Where the record is

```
.dabbler/runs/s<N>/driver/
  run.json            where the loop is, and why it stopped
  instruction.json    the current ask
  report.json         your current answer
  plan.json           the work plan
  dispositions.json   the answer to the verifier's findings
  jobs/*.log          what the framework's own long work printed
  jobs/*.status.json  the exit code it ended on
  engine-01.log ...   one transcript per invocation, under `session drive`
```

Machine-owned, like everything under `.dabbler/runs/`: never hand-edited,
and not the place a verdict can be typed. The lifecycle's own records —
`docs/sessions/sessions.json`, `activity-log.json`, the rounds ledger —
are written by the same verbs a typed session uses, so a driven session
leaves exactly the record a typed one leaves.
