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
with a lifecycle around it: register, declare, work (each step proved by
its own checks), verify with a different provider, run the whole suite,
commit and push, close. Following that list in prose is what an engine is
worst at — it wanders, and a less capable engine wanders further.

So the framework owns the list, and drives it. **Start Session** registers
the session and starts the framework's loop in a terminal of its own:

```
dabbler session run --mailbox --sessions-dir docs/sessions
```

The loop judges whatever answer is outstanding, advances the session, runs
every check, review and job itself, and writes the next instruction. The
engine answers from its own chat, with one command kept in the background:

```
dabbler session wait --sessions-dir docs/sessions
```

It prints the instruction owed an answer and exits, consuming nothing. The
engine does what the instruction says, runs the command it names, and
starts the waiter again — until it prints `done`. Nobody calls anything to
move the session on: that is the loop's.

**A waiter holds the session it is watching.** When the close lands under
one, the waiter prints that session's own `done` — the one the close
wrote, with its `ask` — and not a fresh reading of an empty repository. A
waiter that never saw a session says nothing is in flight and to tell the
operator, and it names no command: a waiter is a loop, and a loop handed
`dabbler session start` starts a session nobody asked for. `session next`
and the terminal still name it, because a person reads those.

**The engine stays in its own CLI.** Nothing spawns Claude Code or a
Copilot seat; you are already talking to one, in the terminal you like,
with your own context, your own scrollback and your own interrupt key —
and because the waiter runs in the background, the chat stays yours to
type into while the session runs. The whole instruction an engine needs is
the sentence Start gives it: *run `dabbler session wait --sessions-dir
docs/sessions` as a background command; each time it prints an
instruction, do what its `ask` says and answer with its `answer_command`,
then run the waiter in the background again; stop when it prints `done`.*

The walks quoted below were printed under the earlier pull, where the
engine called `session next` itself. The instructions, the reports and the
framework's lines are the same under the loop; what differs is who moves
the session on, and that a `wait` never reaches the engine.

## Before the first call

- The repository has a `docs/sessions/session-plan.md` with a
  `### Session N of M:` block for the next session, and a `dabbler.yaml`
  at the root. (`dabbler bootstrap` makes both; see `quick-start.md`.)
- The Primary Reviewer needs a provider key in the environment —
  `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY` or
  `DABBLER_GEMINI_API_KEY` — for a provider *other* than the engine's.
  Verification is cross-provider and there is no way to skip it.
- **Start Session** registers the session before it opens anything, and
  registration is the one call that carries who is working. Outside VS
  Code it is typed:

  ```
  dabbler session start --sessions-dir docs/sessions \
      --engine claude-code --provider anthropic
  ```

  and the loop is started beside it with `dabbler session run --mailbox
  --sessions-dir docs/sessions`. A registration the router refuses opens
  nothing, and says why.

  The AI's own CLI is the third thing opened there, and outside VS Code it
  is opened by you. Nothing needs setting for it. The verbs that are a
  person's ask where a person is, and an AI's tool runs its commands with no
  terminal, whichever engine it is;
  `docs/design/engine-environment-markers.md` has the readings and the limit.

- The vehicle a review goes through is decided by configuration, not typed
  on a driving call: `dabbler configure --transport <vehicle>` sets this
  checkout's, and `dabbler configuration explain` says which layer decided
  it.

- **The round cap is not typeable on a driving call.** It is
  `verification.settings.max_rounds` in the configuration, and `next` and
  `drive` refuse `--max-rounds` rather than accepting it. It moved in both
  directions and recorded nothing: a cap at or below the rounds already run
  ends verification on the spot, which is a verification-reducing act
  reachable by anyone who typed a command and attributable to nobody.

  For one run it moves through one verb, `session plan amend --max-rounds`:

  ```
  dabbler session plan amend --sessions-dir docs/sessions \
      --max-rounds 4 --reason "<why this tree is worth another round>"
  ```

  which writes the cap to `run.json` and appends the before, the after, the
  rounds already run, the reason and who was working to `amendments.jsonl`.
  **State what that buys and no more.** Who was working is read from the
  record `session start` wrote, never typed: a name an engine types proves
  nothing, so there is no `--approver` — and no gate reads the row. What it
  buys is that the reason exists, next to the rounds it is being spent
  past, reviewable at the close, instead of a bare number appearing on
  `run.json` with no reason at all.

  `dabbler verify --max-rounds` is unchanged: that is the verb's own flag,
  for a round run by hand outside a driven session.

- **A non-goal the work falsifies is dropped, not disputed.** Non-goals are
  declared before the work, and the work can prove one of them wrong — the
  change the plan said it would not make turns out to be the only way the
  work can meet its own contract. Until there was a verb for that, the plan
  could not say so, and the rounds deadlocked: one round blocks the touch
  as a non-goal violation, the fix is reverted, and the next round blocks
  the reverted state because the thing no longer runs. Both rounds are
  right on their own terms and they demand opposite things, and the only
  exit anyone found was to dispute a finding that was true — which teaches
  the author to reject correct findings and launders a scope change
  through the adjudicator instead of recording it as one.

  ```
  dabbler session plan amend --sessions-dir docs/sessions \
      --drop-non-goal "<the non-goal, word for word as declared>" \
      --reason "<why the work falsified it>"
  ```

  Both arguments are required. The text must match a declared non-goal; one
  that matches none is refused and the refusal names every non-goal the plan
  declares, so the next call is typeable straight off it. It is refused
  beside `--step` and beside `--max-rounds` — one amendment per call, each
  with its own reason.

  **Drop-only: nothing adds a non-goal.** Adding one mid-session would put
  finished, reviewed work retroactively out of scope.

  **It is not a gate, and it does not settle anything.** Every round from
  there is shown the drop with the reason given, beside the non-goals still
  standing, and judges the reason — a reviewer that finds the reason poor
  blocks it the way it blocks any finding, and the dispute and adjudication
  path is unchanged. The AI runs the amendment itself: what keeps the record
  honest is what the reviewer is shown, not who is allowed to type.

## What comes back

Stdout carries exactly one thing — the instruction, as JSON. Everything
else the framework says goes to stderr, where you can read it and a
parser does not have to.

```
dabbler [11:31:20] run-started session=001 mode=pull
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

Three kinds reach the engine under the loop, and no fourth — the same
three the managed body names. A `wait` is the loop's own: it sleeps out the
framework's long work itself and never hands it to the engine. An
`interrupt` exists only under `session drive`, where the framework is the
one running the engine.

| `kind` | what it means | what you do |
| --- | --- | --- |
| `step` | work to do — the plan, or one step of it | do it, run `answer_command`, start the waiter again |
| `rejection` | your last answer was refused; `reasons` says why | put them right, answer again with **this** seq |
| `done` | the session is closed | stop |

`answer_command` is always literal and always right: run it as printed,
filling in the placeholders. It carries the seq the answer must name, so
an answer to a superseded instruction cannot be mistaken for the current
one.

## Answering

The first instruction asks for a work plan — the task in a paragraph,
the one plan member the checkout's `dabbler.release` reads (on request,
the default: `release` with the one reason the session publishes now,
without which it publishes nothing; ship by default: `hold_release` with
the one reason it waits, without which it ships), at least one non-goal
(what the session will NOT do, which the reviewer holds the work to), and
the ordered steps,
each with the files it will touch and at least one mechanical check that
proves it. Write it as JSON somewhere outside the tracked tree and hand
the file over:

```
dabbler session report --sessions-dir docs/sessions --seq 1 --answer-file /tmp/plan.json
report: session 001 seq 1 answered; work plan (1 step(s), ships) written to .dabbler/runs/s1/driver/plan.json; the driver reads it next.
```

The next call accepts it, declares the session from it, and asks for the
first step:

```
dabbler [11:31:21] plan-accepted steps=["widget"] hold=null non_goals=1
declare: session 001 declared; releasable=no; held: this repository declares no packaging, so there is nothing to publish.
dabbler [11:31:21] phase phase=work
dabbler [11:31:22] instruction-issued seq=2 kind=step step=widget
```

Every step's instruction repeats the plan's non-goals under its ask. A step
is answered with its status and a line of notes. `--files` may be left
out, and the framework takes the step's files from what changed since the
last accepted step, less what it wrote itself; named, they are exactly the
files you changed:

```
dabbler session report --sessions-dir docs/sessions --seq 3 --step widget \
    --status done --files "src/widget.mjs" --notes "widget returns 2"
```

Three facts about how a step is judged, each learned by a session that
planned without them:

- **A check runs in a built environment and sees no credential.** The
  framework spawns each check with PATH, HOME, the toolchain roots
  (`DOTNET_ROOT`, `JAVA_HOME`, …) and a scratch TEMP, and nothing else — a
  check is repository-declared argv, and inheriting the shell would hand
  every vendor key and feed PAT to code the framework did not write. A
  driver *job* (verification, the run of record, the publish) inherits
  the shell, so a credential set where `next` runs does reach the publish;
  a check asserting it is refused, correctly.
- **Ignored build output does not move the tree.** The framework hashes
  the working tree as a git tree, so what `.gitignore` covers — `bin/`,
  `obj/`, `node_modules/` — is invisible to it, and a check that compiles
  is safe. A check that writes a *tracked* file is a check that changed
  the tree under itself, and the report is refused for it.
- **The router's own state writes are in the change set.** Registering a
  session writes `docs/sessions/sessions.json`, and `dabbler affected`
  measures everything since `HEAD`, so a repository maps `docs/sessions`
  (or `docs`) to no test — the scaffolded `dabbler.yaml` does, and one
  that was narrowed by hand must keep doing it. The one file the framework
  installs at registration, `.claude/settings.json`, is mapped to no test
  by the framework itself.

The plan's optional `repositories` member is for a plan whose *steps*
need the solution's other repositories on disk — it places each beside
this one, declaring only which solution it belongs to. A plan for one
repository of a many-repository solution leaves it out: the other
repositories existing is not the same as this plan needing them.

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
    "[files-changed-unchanged] files_changed names 'tests/test_widget.mjs', which the tree did not change since the last accepted step"
  ],
  "answer_schema": "driver-report.schema.json",
  "answer_command": "dabbler session report --sessions-dir C:\\temp\\pull-walk-61\\repo\\docs\\sessions --seq 3 --step widget --status done --files ... "
}
```

The slug in brackets is the rule that refused it, and it is stable: the
same name reaches the `reasons` here, the `rejected-thrice` stop that
quotes the last reasons, and anyone — a person or `dabbler triage` — asked
to say what went wrong.

Answer it with the new seq. **Three refusals of one step stop the
session** (`rejected-thrice`) — the last reasons are on the run state.
Resuming it — **Resume Session**, which starts the loop again — does not
simply judge the failed answer a fourth time: that answer is left behind,
the count starts over, and the step is asked afresh under a new seq. A person deciding to carry
on is the intervention the bound exists to force. If a step genuinely
cannot be done, say so instead: `--status blocked` with the reason in
`--notes`.

The same shape carries the Primary Reviewer's findings. When a round is blocking
you are asked for a **disposition** per finding — `fix`, or `reject` with
a reason and evidence paths — as JSON. A `fix` becomes a step named
`fix-round-<N>`, checked by every plan step's checks; a `reject` becomes a
dispute the next round must engage. A red run of record comes back the
same way, as a step named `fix-run-of-record`: your fix is judged and
checked like any step, verified again, and only then is the suite run
again. The step the framework is waiting on is written on `run.json` as
`pending_step` until its report is accepted, which is what lets the call
that resumes the session judge it before the phase's own work.

### What the Primary Reviewer can see, and what it may ask for

A round on the **Copilot seat** holds three tools — list, search, read —
and the CLI runs them in its own process, so the framework can only
measure what was done. A round on the **direct-API path** holds none:
what it sees is the evidence bundle in front of it, and nothing else.

That second case has one opening, and it is off unless your repository
turns it on. With `verification.settings.api_file_requests: true`, an
API reviewer may **ask for files by path** — it emits a fenced
`file-request` block naming them, and the framework is what opens them.
Four things follow from the framework doing the opening rather than the
model:

- The request is **confined to the round's scope** and **counted against
  the same read budget** as a seat round's reads. A path outside either
  never reaches the filesystem: it is refused before a file is opened,
  and the refusal — with the boundary it met — is written onto the
  round's `agency` block. Nothing is dropped silently.
- What comes back is **the contents on disk**. There is no scrubbing
  layer between the file and the model on this path, so a read here is
  verbatim by construction and can never be recorded as `transformed`.
  The one thing a fenced block cannot express is a missing final
  newline, so a file without one arrives with one; nothing else is
  altered, and a file ending in blank lines keeps them.
- There is **exactly one further turn**. The files go back, and the
  answer to that turn is the verdict — not a loop, so a round costs at
  most twice its payload. A request the framework refused entirely buys
  no second turn at all: the first answer stands.
- The round records `mode: tools` **only if a file was actually
  delivered**. `operations_granted` says what was offered — `["read"]`
  where the setting is on — and `mode` says what the round had in front
  of it, so a reviewer that asked for nothing, or for nothing the
  framework could give it, records `mode: none` exactly as a blind round
  does. That is the distinction the measurement rests on: a round that
  saw only the evidence bundle is one of those, whatever it was offered.

`dabbler status` and the round's ledger row carry the whole account.
None of this is yours to drive: the framework decides, reads and records
it inside the verification job.

## `wait`: the framework's own long work

Three things take longer than a tool call: a verification round, the
complete suite as the run of record, and the close — four, for a session
that ships, whose publish runs between the push and the close. A session
ships when `dabbler.release` and its plan say it does (a `release` on
request, no `hold_release` by default), unless the repository declares no
packaging or its verdict is not VERIFIED; the close's
`published_when_releasable` row says which. (The preverify phase runs nothing: the tests that run are each
step's own checks with the tests named after what the step changed, and the
suites as the run of record — whole, or `final-targeted` where a whole run
costs more than a session should spend, with the whole suite before a
release — and the Primary Reviewer reviews without writing or running one.)
None
of them blocks an answer. The framework starts each one detached, and its
loop sleeps the wait out itself while the engine's waiter keeps waiting for
the next step. Under the bare pull, where an engine calls `next`, the wait
was handed to the engine instead, and this is what it looked like:

```
dabbler [11:31:30] phase phase=preverify
dabbler [11:31:30] phase phase=verify
dabbler [11:31:30] job-started name=verification pid=28444 log=.dabbler/runs/s1/driver/jobs/verification.log
dabbler [11:31:30] instruction-issued seq=4 kind=wait reasons=1
```

```json
{
  "seq": 4,
  "kind": "wait",
  "retry_after_seconds": 60,
  "log": ".dabbler/runs/s1/driver/jobs/verification.log",
  "answer_command": "dabbler session next --sessions-dir C:\\temp\\pull-walk-61\\repo\\docs\\sessions"
}
```

Nothing was owed there but a later look, and the look after the job
finished reported progress and collected the result:

```
dabbler [11:32:05] job-finished name=verification exit=0 log=.dabbler/runs/s1/driver/jobs/verification.log
dabbler [11:32:05] verification-passed
dabbler [11:32:05] phase phase=run-of-record
dabbler [11:32:05] job-started name=run of record: unit pid=49320 log=.dabbler/runs/s1/driver/jobs/run-of-record-unit.log
```

The log is the job's own output, whole:

```
running unit: node tests/run.mjs
widget ok
recorded unit [final-full]: passed in 1s (timed here)
```

`retry_after_seconds` is advice, not a floor: the driver judges the job's
real state on every look, and a look before the number is up is answered
with progress if the job has finished and with another `wait` if it has
not. The number is honest where it can be: a run-of-record wait names a
quarter over the suite's last recorded duration (floor ten seconds,
ceiling sixty), and a verification wait names sixty. Nothing needs
watching: `run.json` is the driver's state and only the driver moves it,
and the job writes its own status file beside its log
(`<job>.status.json`) at its exit.

**A `wait` is never the engine's to hold.** An engine that blocks for four
minutes waiting on a verification round hits whatever timeout its harness
puts on a command, and the harness kills the call rather than the work —
this is exactly how the driver spike died. The loop holds every wait, and
the engine's waiter is a background command that leaves its turn free.

Nothing holds the engine's turn for it: there is no hook. What tells a
person that nothing is answering an instruction is the Dabbler terminal's
silence watcher — a line once the engine has been quiet over an unmoved
tree for longer than the threshold, and again at each multiple of it — and
the Work Explorer's attention row. One session lost three hours to an
engine that answered a `wait` by polling `run.json` for a field only the
driver clears; the answer to that is a loop that owns the waits and a
person who can see the silence, not a hook that blocks every end of turn
in the repository. (`session start` for a
`claude-code` registration, and `bootstrap` under Claude Code, remove the
Stop hook an earlier framework installed: a hook whose verb no longer
exists would block every turn.)

**Under the loop, the silence is the loop's to notice.** Once an
instruction has waited past the threshold, and again at each multiple of
it, the loop records `instruction-overdue` in the session's
`supervision.jsonl`. The Dabbler terminal says it once and raises one VS
Code warning, which suggests asking the AI whether its waiter is still
running — the usual cause, and one the AI can put right itself. Nothing is
typed into the AI's chat on your behalf: a typed nudge would be logged as
your words.

### Who the session is waiting on, and for how long

At every moment exactly one thing is true, and `run.json` says which on its
`waiting` member: the **author** owes an answer, a framework **job** is
running against a deadline, or a **person** owes something. It carries what
the wait is for, since when, by when where there is a bound, and the last
REAL progress — the moment a persisted milestone changed (a phase, an
accepted step, a recorded round, a job started or collected), never a
heartbeat. `dabbler status`, the Work Explorer's session row and the
Dabbler terminal all read that one record and derive none of it a second
time:

```
Author owes step 4 — 2:13, no waiter has read it
Verification — 3:42 of 10:00
You: the reviewer is unreachable.
```

**"No waiter has read it" is its own sentence.** `dabbler session wait`
stamps a beacon beside the loop's heartbeat while it waits and again as it
hands an instruction over, so an instruction nothing ever picked up reads
differently from one an AI is working on. Delivery, not presence: a waiter
prints what it finds and exits, so "is one listening right now" is false
for every step an AI is busy answering. The second beta test spent six
hours with nobody reading its instruction and nothing on the screen could
say so.

**Every framework job runs against a deadline**, read from how long jobs of
that name have actually taken in this repository — three times the longest,
with a floor — or from a declared default for its family where this
repository has no history. Past it the job is ended and started once more,
because the framework cannot tell a hung job from a slow one and the cheap
way to ask is to run it again; a second deadline on the retry is a stop
that says which job, how long it ran, and where its log is. An author past
the threshold is told and is never failed: a person is not a job.

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
dabbler [11:31:38] run-resumed session=001 phase=verify mode=pull
dabbler: Session 001 paused (interrupted) in phase 'verify' after 0 invocation(s).
Somebody asked it to stop. I want to look at the diff first.
The dabbler command that met it has ended; session 001 remains in flight. Next: you. `dabbler session drive` resumes it from 'verify'; `dabbler session cancel` ends it instead.
```

**A Send reaches a stopped run too.** There is no invocation to end, so
the request is held and handed to the instruction that resumes the
session — which is exactly where you want a "and while you're at it"
to land. Only two things are refused: a session nothing ever drove, and
one whose drive completed, because a message queued for a closed session
would never be read and "Sent" would be a promise the framework broke.

**Stop Session** is the same verb as a click: it sits on the in-flight
session's row in the Work Explorer, asks for your reason, and runs
`session interrupt --stop` with it. The loop honours it **inside a job**
as well as between phases — a verification round or a whole suite ends
where you asked rather than minutes later — and the recorded stop is one
no waiter revives a loop over. Resume Session is the way back.

## When the framework stops

A stop closes nothing and loses nothing. The phase, the accepted steps,
the tree the next report is measured against and any job still running are
on `run.json` under `.dabbler/runs/s<N>/driver/`, and `stop` says in words which
bound was met. **The same call resumes** — there is no separate resume
verb, and no flag to remember:

```
dabbler [11:31:42] run-resumed session=001 phase=verify mode=pull after=interrupted
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
which only `session drive` below can meet), `tree` (the working tree
already carried changes when the declaration was made -- commit or revert
them; `session start` asks the same question first, so this one is met only
when the tree moved between the registration and the plan), `engine`,
`crash` (below).

**A loop that dies is started again, and a stop is not.** `session run
--mailbox` copies everything it writes to `.dabbler/runs/s<N>/driver/loop.log`,
whoever started it — the terminal the extension opens for it may never show a
word. An error it did not mean leaves `loop-crashed` on `supervision.jsonl`
and in the log, and **no stop** on `run.json`: nobody decided anything. The
waiter reads that absence. Finding the heartbeat stale and no stop recorded,
it starts the loop again itself, records `loop-restarted`, and goes on
waiting; the AI never sees the gap. It does this at most twice for one point
— the phase and the seq last issued — and the count starts afresh once the
loop gets past it. A third death at the same point is recorded as a `crash`
stop, whose ways on name the log and the restart, and the waiter prints it
like any other. **A recorded stop is never restarted**: every other kind was
meant, and Resume stays the way past one.

`stop_history` keeps the last few stops, oldest first, if you want to see
the shape of a run. A close or a publish that has already happened is
collected by the next call rather than made again, so running `next` after
closing or packaging by hand moves the session on.

**A close stop after the land** is the one stop that finds the work already
committed and pushed: a gate refused at the close, after the verified tree
reached the remote. The run of record asks the suite question before it
lands — a repository that builds code with no suite declared gets a
`fix-run-of-record` step there, before the commit — but a run that
reached the close before that, or a gate only the close can judge, still
leaves you here. The way out is to repair it and record the repair:
declare the suite (or fix what the gate named), then `dabbler session
rebaseline --reason "<what was repaired>"`, and the next call resumes and
takes the session back through the phase the refused gate owes. **Not
`session cancel --force`**: a cancel ends the session's record, and it
does not unpush what was pushed.

If a job **vanished** — no process and no recorded result, which is what a
machine restart leaves — that is a stop too, and deliberately: re-running
a verification round nobody recorded would spend another round's worth of
provider calls on a fact that was never written down.

### Who ends a session, and who holds a release

**Whether a session releases is decided in one place**: its accepted plan,
read under the checkout's `dabbler.release`. There is no typed declaration
and no second door. `on-request`, the default, publishes only a plan that
names `release`; `ship-by-default` publishes unless the plan names
`hold_release`.

**A release that cannot or should not happen is held, by a person:**

    dabbler session hold-release --reason "<why>"

The session then closes as held — landed, verified, nothing published — and
the close says so in your words. It is one way only: nothing releases a
hold, because releasing afterwards is deciding in hindsight what may reach a
feed, and it is refused once the session has published. The `publish` stop
offers it as its second way on. Before it existed a release that could not
succeed left two exits, publish or cancel.

**Ending a session by force is a person's act, whichever engine asks.**
`session cancel --force` and `session close --force` are refused to an
engine in the same words, as `session hold-release` is: report the step
blocked and say why. The router finds a person by what is there rather than
by what is missing: a click in the editor, or an interactive terminal with no
engine's marker in it. An AI's tool runs its commands with no terminal at
all, which holds for an engine nobody has measured; the markers — each
vendor's own, and `DABBLER_ENGINE_TERMINAL`, which the extension and the
framework set on every engine they start — are read first and make a known
engine an engine wherever it runs. So a person's verb typed into a script or
a pipe is refused too, and says where a person does it.
`docs/design/engine-environment-markers.md` has the readings and says what
this is not. The cancel a stop prints runs as
printed: `dabbler session cancel --force --reason "<why>"` means the session
in flight. It says what it left uncommitted, and the next `session start`
offers to commit that or undo it.

**A cancelled session ends its loop.** The loop reads the ledger at every
phase boundary, while it waits for an answer, while a job runs, and again
before the commit and before the push. A session cancelled or force-closed
from another process is not driven one phase further: nothing of its work is
added, committed or pushed, no stop is recorded, and the AI's waiter prints a
`done` that says the session was cancelled, by whom and why, and to stop.

**Under a live loop the waiter is what is run again — never `session
next`.** `session next` registers and takes the lease, which ends a mailbox
loop mid-save with no stop recorded and its last accepted answer lost, so it
refuses while a loop's heartbeat is live and says to run `dabbler session
wait`. A report that answers an instruction already replaced is refused with
the same advice; nothing already done is lost.

### When you ask your engine for help

Sooner or later you will type "it's stuck — sort it out" into your CLI.
This is the protocol the engine should follow, in this order, because the
order is what keeps it honest.

**1. Read the framework's own account first, and never the scrollback.**
There are four places and they are all files:

```
dabbler status --sessions-dir docs/sessions
```

`status` says where the session is. `run.json` under `.dabbler/runs/s<N>/driver/`
carries the `stop` — its `kind`, its `reason` in words, and the step it was
on. A run written before 2.9.0 may also carry a `class`; nothing reads it. The outstanding `instruction.json` carries `reasons` when
the last answer was refused, each one opening with the rule that refused
it in brackets. The transcripts, `engine-NN.log` beside them, are what the
engine actually did. The scrollback is what the engine *remembers*; these
are what happened, and the two differ exactly when it matters most.

**2. Verify the claim before acting on it.** A stop's reason is a
symptom. The rule slug it carries — `[files-changed-omits]`,
`[check-failed]`, `[no-work-plan]` — names a rule that is a readable line
of code, and the condition it describes can be reproduced. An engine that
skips this fixes the story it told itself about the failure. Nothing below
is worth doing until the diagnosis survives being checked.

**3. Then work out whose it is to fix**, because that is the question
that stalls a session:

- **On this repository, the framework is source in the tree.** The engine
  may fix it. The fix is ordinary work — it rides in the session's own
  diff and the reviewer reviews it with everything else. Sessions 60 and
  62 both did exactly that on the operator's word. This is written down
  because session 62's engine wrote a correct diagnosis of a framework
  defect and then waited, believing the change was somebody else's to
  make; the session stayed stopped on a gate that one edit would have moved.
- **On a consumer repository, the framework is an installed package** the
  session did not write, and editing it there is a fix that vanishes at
  the next `npm i`. Report the step `blocked` with the diagnosis in
  `--notes`, and raise an owed item pointing at dabbler. The fix ships as
  a release, and the session says plainly what it is waiting for.

**4. Four things are never touched, on either.** Anything under
`.dabbler/runs/`; `sessions.json`; a verification verdict; a gate. These
are the record and the judgment over it, and a session that edits them has
stopped being evidence of anything. If a gate is wrong, prove it is wrong
and say so — do not step around it.

**5. And stopping costs nothing.** If it is late, or the diagnosis needs
someone who is not at the keyboard, stop calling `next`. Nothing expires.
The session resumes from the phase it is in, and nothing already accepted
is asked for again.

### The one stop with no forward exit, and the verb that is one

There is a stop the four steps above cannot answer, because it is not a
wrong diagnosis — it is two correct refusals pointing at each other.

A session reaches the verification round cap. The loop records a terminal:
`remediated_at_cap` when the last round's blocking findings were each fixed
at the site they cited, or a cap-clean end when nothing was outstanding. The
tree then moves again — a repair to the repair, which is exactly what an
unreviewed fix tends to need. Now:

- the close's `verification_clean` gate refuses, correctly: this is not the
  tree that was reviewed, so **re-run `dabbler verify`**;
- `dabbler verify` refuses, correctly: a terminal row stands, so **close the
  session**;
- `session close --force` cannot help either, because `verification_clean`
  is an *evidence* gate and force bypasses only bookkeeping.

Session 137, 2026-09-09, sat in that loop. Raising the cap does not lift it:
the terminal is read **before** the cap, so `session plan amend
--max-rounds` was accepted, written to `amendments.jsonl` — and inert. It
now refuses instead, and names the verb below.

A cap terminal is a spent **budget**, not a judgment, so the operator may
buy the review it refused:

```
dabbler verify reopen --rounds 1 --reason "<why>"
```

That records a grant in `verification-reopens.jsonl` under `.dabbler/runs/s<N>/` and
reopens the loop. Read what it is carefully, because it is easy to mistake
for the waiver this framework does not have:

- **It buys rounds, never a verdict.** Nothing is verified until a round
  says so, and `verification_clean` refuses while a grant stands that no
  round has spent — so a session cannot close on the grant itself.
- **It buys named rounds, never a mode.** Reaching the new cap stops the
  session again and needs a new grant. There is no state in which the cap
  is off.
- **It never reaches an adjudication.** That is a third provider's judgment
  of the disputes, and no grant buys a different answer to a judged
  question. A cap reached with findings still *disputed* goes to `dabbler
  verify adjudicate` instead.
- **It is refused where nothing is stuck**, so it cannot quietly become the
  ordinary way a cap is raised. Before the cap is reached, the cap is what
  moves: `session plan amend --max-rounds`.
- **The reason is permanent**, beside who was working as the record from
  `session start` says it — there is no `--approver`, because a name an
  engine types proves nothing — and no gate reads either. What the row
  buys is that the reason exists, beside the rounds it authorised.

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
  "issued_at": "2026-09-05T11:31:48-04:00",
  "kind": "done",
  "ask": "Session 001 is closed: the work is landed, verified and recorded. This is the end of the loop -- there is nothing to answer and no waiter to start again. Stop, and tell the operator the session is done."
}
```

It states its own meaning, as every other instruction does: the session is
closed, the loop ends here, tell the operator. It carries no
`answer_command`, because a closed session is owed no answer — and it
names no command at all, so nothing in the loop is handed the next
`session start`. That one is the operator's to type.

Behind that, in the close's own log:

```
  verification_clean  PASS
  working_tree_clean  PASS
  pushed_to_remote    PASS
  test_run_fresh      PASS
  verdict_vocabulary  PASS
close: session 001 of sessions closed (VERIFIED).
```

## Starting from the Work Explorer

Everything above is what you type. The extension's job is to open the
right things and to be loud when the framework needs you — it does not
run the session for you, and it never stands between you and your engine.

### What Start opens

**Start Session** on a repository row asks which engine, registers the
session, and only then opens terminals at the repository root: *Framework
loop*, running the bundled router's `session run --mailbox`; *that engine's
own CLI*, interactively; and the Dabbler terminal beside the CLI. Where the
CLI takes an opening prompt in its arguments the sentence is already there;
where it does not, the sentence is typed at the prompt for you to press
Enter on. For the two engines whose CLIs were measured:

```
TERMINAL Framework loop
  command:  node <extension>/dist/dabbler.cjs session run --mailbox --sessions-dir docs/sessions

TERMINAL Claude Code
  command:  claude "Run `dabbler session wait --sessions-dir docs/sessions` as a background command, so this chat stays free. Each time it prints an instruction, do what its `ask` says and answer with its `answer_command`, then run the waiter in the background again. Stop when it prints `done`."
  typed:    (nothing; the sentence is in argv)

TERMINAL GitHub Copilot
  command:  copilot --model gpt-5-6-luna
  typed:    (the same sentence)
```

The identity — engine, provider, model — is on the registration, and the
sentence carries none of it.

Claude Code takes a positional prompt and starts interactive by default.
The Copilot CLI has no positional prompt — its `-p` is documented as
non-interactive — so the sentence is typed and left for you. Any engine
whose CLI has not been measured here is launched the same way, for a
plainer reason: an argument a CLI does not take is a launch that fails in
front of you, and a typed sentence costs one keypress instead.

**What Start does not do.** It spawns no engine. It copies nothing to the
clipboard and pastes nothing into a chat beyond the opening sentence. A
registration the router refuses opens nothing at all, and the error says
why. After it opens the terminals, the chat is yours: your scrollback,
your Esc, and a waiter in the background you can talk over.

### The Dabbler terminal

Start opens a second terminal beside your CLI, named *Dabbler — <your
repository>*, and shown without taking the caret from what you are typing.
A session started from your own CLI brings it into view too, the moment the
first `next` writes the run record. It shows what the framework is doing —
the phase the run moved to, the background job it started, and that job's
own output as it arrives. This is what that terminal printed on the walk:

```
────────────────────────── framework ──────────────────────────
14:21:30 terminal-opened repository=s62-walk

═══════════════════════════════════════════════════════════════
                          SESSION 001
═══════════════════════════════════════════════════════════════
14:21:30 phase session=001 now=preverify
14:21:30 job-started name=affected tests: unit log=.dabbler/runs/s1/driver/jobs/affected-tests-unit.log
14:21:30 working

──────────────────── affected-tests-unit ──────────────────────
running unit: node tests/run.mjs tests/test_widget.mjs
recorded unit [preverify-targeted]: passed in 1s (timed here)

────────────────────────── framework ──────────────────────────
14:21:31 tests suite=unit stage=preverify-targeted outcome=passed
14:21:31 job-collected name=affected tests: unit
```

(The lines are the walk's; the layout is the current one.) A session
opens under a banner of its own, whenever the run record moves to a new
one. Two voices speak beneath it, and a rule with the voice's name in it
is drawn wherever one gives way to the other, with an empty line before
it: `framework` over the framework's own lines, the job's name over its
output. The framework's lines are an outline: the
clock stands at the left edge, and a line that wraps — or carries git's own
newlines in a stop's reason — continues under the text rather than under
the clock. Both the rules and the wrapping follow the terminal's width,
and a resize lays the whole scrollback out again. The job's lines arrive
exactly as the runner wrote them — colours, checkmarks and spinner
included. That is the whole reason it is a terminal and not an output
channel.

A terminal opened part-way through a session, or after one, does not
replay the job logs. It says what the records say happened, one dated line
each in the order it happened — the verification rounds, this session's
test runs, and each job log already on disk as `earlier-job` with its exit
and where the log is — and then where the run is now. Only bytes a job
writes after that pass through.

`working` and `waiting` are the indicator: it says `working` while a
background job is running and `waiting` when there is none and the session
is between your calls. It says each of them once, when the state changes.

The two surfaces name the same events differently, and it is worth knowing
which you are reading. The Dabbler terminal says `job-started` and
`job-collected`; `dabbler session next` in your own CLI says `job-started`
and `job-finished … exit=0`, because the CLI is the side that collected the
exit code. Every block in this section says which of the two it came from.

**It never carries engine chat.** Not one line of it, ever. The framework
does not see your chat at all — you are reading it in your own CLI. Chat in
the CLI, work in the Dabbler terminal; there is no setting to get this
wrong.

### When the framework stops, it says so

A halt is printed where you are: the Dabbler terminal carries the stop's
own sentence — what happened, that the command ended and the session did
not, who acts next — its ways on with the command for each, and, where
triage proposed an amendment, the `plan amend` that makes it. Nothing is
raised for anyone to answer, and nothing waits. The next `session next`
resumes it, from the phase it stopped in, and nothing already accepted is
asked for again. That call is the one you make in your own CLI, and this
is what it printed there:

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

A third state is the one that used to read as `working`: the job the
record names has exited, its status file holds the exit code, and nothing
has made the call that collects it. The row, the `dabbler status` task row
and the Dabbler terminal all say so in the router's one wording:

```
ROW  Session 001 is in flight — finished, waiting to be collected
     Session 001: the framework's job 'run of record: unit' finished at 2026-09-05T15:37:41.973Z (exit 0) and its result has not been collected. Nothing is running, and collecting it takes a moment. Next: whoever calls `dabbler session next` -- the engine if its loop is still running, otherwise you; `dabbler session next` collects the result and carries on from 'run-of-record'.
```

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
Claude Code reports, whatever its own protocol calls the same thing on
another engine — never by asking for
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
  dispositions.json   the answer to the reviewer's findings
  jobs/*.log          what the framework's own long work printed
  jobs/*.status.json  the exit code it ended on
  engine-01.log ...   one transcript per invocation, under `session drive`
```

Machine-owned, like everything under `.dabbler/runs/`: never hand-edited,
and not the place a verdict can be typed. The lifecycle's own records —
`docs/sessions/sessions.json`, `activity-log.json`, the rounds ledger —
are written by the same verbs a typed session uses, so a driven session
leaves exactly the record a typed one leaves.
