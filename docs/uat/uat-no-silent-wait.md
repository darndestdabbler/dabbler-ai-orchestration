# No silent wait — session 214's proof

Measured on 2026-09-20 on the operator's Windows 11 machine, against the
router bundle built from this session's tree (`npm run build -w
dabbler-ai-router`, `packages/router/dist/dabbler.cjs`), in two scratch
repositories outside this tree:

- `D:\tmp\uat214-deadline` — a session whose declared suite is a program
  that never exits (`tests/hang.mjs`), so the run of record really hangs.
- `D:\tmp\uat214-waiter` — the same repository, used for the waiter
  readings, the revived loop and a stop asked for while a job runs.

Both verify through the **offline transport**, which answers a round from a
file: no provider is called and no round is invented. Every line below is
as it was printed or as the record held it.

Two things this proof does not measure, because they are an editor's and
are held by the extension suite instead: the VS Code notification a stop
raises (`dabblerTerminal.test.ts`, "raises a stop where the operator is")
and the Stop Session menu entry (`actionRegistry.test.ts`, "Stop Session is
offered on the session in flight"). What the click RUNS — `session
interrupt --stop`, honoured inside a job — is measured here.

## A defect this proof found, and the fix it carries

The first reading was taken with the waiter's beacon meaning "a waiter is
listening **right now**", and the sentence read `no waiter listening`. It
was wrong, and the proof is what showed it: a waiter prints the instruction
it finds and **exits**, so "listening right now" is false for every step an
AI is busy answering. The warning would have been on the screen for every
normal step — a sentence that cries wolf is a sentence nobody reads, which
is the failure this session exists to remove.

The beacon now stamps **delivery**: `session wait` stamps it while it waits
and again as it hands an instruction over, and the reading asks whether a
stamp is later than *this* wait began (`waiterSeenSince`). The sentence is
`no waiter has read it`. Fixed in `driver.ts`, `drive.ts` and `progress.ts`
with their tests, and in this session's own pages.

## 1. Nobody has read it, and then somebody has

`D:\tmp\uat214-waiter`, with the loop driving and no waiter run yet:

```
BEFORE ANY WAITER: Author owes step plan — 0:16, no waiter has read it
```

Then one `dabbler session wait --sessions-dir docs/sessions` — which
printed the instruction and exited, as a waiter does:

```
waiter exited
AFTER THE WAITER READ IT: Author owes step plan — 0:46 | waiter: true
```

The warning is gone the moment the AI has the instruction, and it stays
gone while the AI works: the beacon is evidence of delivery, and a waiter
that has exited does not unsay it.

## 2. Every framework job has a deadline, one retry, and then a stop

`D:\tmp\uat214-deadline`. The repository's history for this job was one
recorded run of 60 s, so the deadline is the floor: 300 s (`3 × 60` is
under it). The suite hangs.

The job starts, and the record says who is waited on and under what bound:

```
dabbler [14:03:23] job-started name=run of record: unit pid=50460 log=.dabbler/runs/s1/driver/jobs/run-of-record-unit.log
```

```json
{"owner":"job","for":"run of record: unit","since":"2026-09-20T14:03:23.367-04:00",
 "by":"2026-09-20T18:08:23.365Z","last_progress":"2026-09-20T14:03:23.365-04:00",
 "says":"Run of record: unit — 0:07 of 4:59"}
```

Exactly 300 s later the deadline ends it and buys it one retry:

```
dabbler [14:08:24] job-overdue name=run of record: unit ran=300s deadline=300s retry=once
```

```json
{"at":"2026-09-20T18:08:24.789Z","event":"job-deadline-exceeded","name":"run of record: unit",
 "ran_seconds":300,"deadline_seconds":300,"restarted_at":"2026-09-20T14:08:24.788-04:00"}
```

The new job has a new pid (`50460` → `3924`) and its own deadline, and
**the last real progress does not move with it** — it still names 14:03:23,
the moment the phase changed:

```json
{"owner":"job","for":"run of record: unit","since":"2026-09-20T14:08:24.789-04:00",
 "by":"2026-09-20T18:13:24.788Z","last_progress":"2026-09-20T14:03:23.365-04:00"}
```

300 s after that, the second deadline is the stop, and it names the job,
how long it ran and where its log is:

```json
{"kind":"tests","code":null,
 "reason":"run of record: unit passed its deadline of 300s twice -- it ran 300s this time -- and was ended both times; its log is .dabbler/runs/s1/driver/jobs/run-of-record-unit.log",
 "at":"2026-09-20T14:13:25.474-04:00","step_id":null}
```

`dabbler status` at that moment:

```
STATUS says: You: run of record: unit passed its deadline of 300s twice -- it ran 300s this time -- and was ended both times; its log is .dabbler/runs/s1/driver/jobs/run-of-record-unit.log
stopActor: either
```

and the loop's own last words carry the ways on:

```
  - Put right what stopped the run, then carry on: dabbler session run --mailbox
    The suite runs again -- your machine's time, and no provider call.
  - Cancel the session -- yours to run, never the engine's: dabbler session cancel --force --reason "<why>"
```

No hung `node` survived either ending: a process-table sweep for
`hang.mjs` after the stop found nothing but the sweep's own command.

## 3. A loop killed is a loop revived, where it can be seen

`D:\tmp\uat214-waiter`. The loop's heartbeat named pid 26328; it was killed
with `taskkill /PID 26328 /T /F`. With the outstanding instruction answered
and nothing owed, one `dabbler session wait` sat out its grace and started a
loop again:

```json
{"at":"2026-09-20T18:11:06.999Z","event":"loop-restarted","attempt":1,"phase":"plan","seq":1}
{"at":"2026-09-20T18:11:07.115Z","event":"session-run-started","engine":"claude-code","mode":"mailbox"}
{"at":"2026-09-20T18:11:08.531Z","event":"lease-taken","lease_epoch":2,"phase":"plan"}
```

The revived loop is detached and has no terminal of its own, and its output
is in `loop.log` beside its heartbeat — which grew from 633 to 2,345 bytes
across the restart, carrying the loop's own lines:

```
dabbler [14:08:23] run-started session=001 engine=cli max_invocations=24
dabbler [14:08:23] instruction-issued seq=1 kind=step step=plan
```

That file is what the Dabbler terminal now follows (`drainLoopLog`), so a
revived loop is read there like any other.

**A reading nobody arranged.** The revived loop met a working tree carrying
an untracked file this proof had left in the repository, and the
declaration refused it. The record said who was waited on and why, in the
refusal's own first sentence:

```json
{"owner":"person",
 "for":"the declaration was refused: You can't start a session while there are new or changed files that haven't been committed: .uat-loglen-before-revive.txt.",
 "since":"2026-09-20T14:11:08.906-04:00","by":null,"last_progress":"2026-09-20T14:08:23.727-04:00"}
```

## 4. A stop asked for while a job runs ends the job

`D:\tmp\uat214-waiter`, with the hanging suite running as the run of record
— which is what Stop Session runs when the operator clicks it:

```
BEFORE THE STOP — job: run of record: unit pid 56660
  waiting: {"owner":"job","for":"run of record: unit","since":"2026-09-20T14:13:30.502-04:00","by":"2026-09-20T19:43:30.501Z",...}
```

```
dabbler session interrupt --sessions-dir docs/sessions --reason "I need the machine back" --stop
interrupt: stop requested for session 001 (instruction 2); the driver ends the running invocation and halts -- the session stays in flight, and `session drive` re-runs it.
```

Seconds later — not at the next phase boundary, which is the end of the
very job being asked to end:

```json
{"kind":"interrupted","code":null,"reason":"I need the machine back","at":"2026-09-20T14:13:52.412-04:00","step_id":null}
  job on the record: null
  waiting: {"owner":"person","for":"I need the machine back","since":"2026-09-20T14:13:52.412-04:00","by":null,"last_progress":"2026-09-20T14:13:30.501-04:00"}
```

The session stays in flight, and the job is off the record and off the
machine.

## 5. At no moment could `dabbler status` not name an owner and a clock

Every reading taken across the two repositories, in the order they were
taken. Four are `dabbler status`'s own sentence, read from its projection;
five are the `waiting` record the sentence is rendered from, read where the
reading was taken off `run.json` rather than through `status`. Each names
an owner, and each names a clock — a `since`, and a `by` wherever the wait
has a bound.

| stage | what was read |
| --- | --- |
| registered, plan owed, no waiter yet | `status`: `Author owes step plan — 0:16, no waiter has read it` |
| the waiter has taken it | `status`: `Author owes step plan — 0:46`, `waiter: true` |
| the step owed, after the revive | record: `owner: author`, `for: step widget`, `since 14:12:51`, `waiter: false` |
| the run of record running | `status`: `Run of record: unit — 0:07 of 4:59` |
| the same job, on its one retry | record: `owner: job`, `since 14:08:24`, `by 18:13:24Z`, `last_progress 14:03:23` |
| the deadline's stop | `status`: `You: run of record: unit passed its deadline of 300s twice …` |
| the hanging job, before the stop | record: `owner: job`, `since 14:13:30`, `by 19:43:30Z` |
| a person's stop during a job | record: `owner: person`, `for: I need the machine back` |
| a declaration refused | record: `owner: person`, `for: the declaration was refused: …` |

Nothing was read that said only "in flight", and no reading found the
member absent while something was waiting. A verification round was
running in the deadline repository for eight seconds and was not sampled:
its job wait is the same `longWork` record as the run of record's, written
by the same call.
