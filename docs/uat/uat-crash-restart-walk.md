# UAT walk: a crashed loop comes back by itself (session 205)

Walked 2026-09-18, 03:48–03:55 local, on Windows 11 with the router built from
this session's tree (`npm run build -w dabbler-ai-router`, 3.13.0) and run as
`node packages/router/dist/dabbler.cjs`. The scratch repository was
`C:\temp\s205-walk`, with a bare origin at `C:\temp\s205-walk-origin.git`;
both can be deleted.

This is Sol's experiment from consult round 17: kill the loop at the
incident's boundary and pass only if the waiter starts exactly one
replacement, the accepted plan is reused and the first step is issued exactly
once; a third death at one point becomes a recorded `crash` stop; a loop
ended by a stop that was meant is not restarted.

## Staging

```
git init -b master C:\temp\s205-walk       # README.md, package.json with "test": "node --test", committed
git init --bare C:\temp\s205-walk-origin.git
git -C C:\temp\s205-walk remote add origin C:/temp/s205-walk-origin.git
git -C C:\temp\s205-walk push -u origin master
dabbler bootstrap --remote C:/temp/s205-walk-origin.git
dabbler session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
dabbler session run --mailbox --sessions-dir docs/sessions      # the loop, in the background
```

Every `dabbler` command ran with `C:\temp\s205-walk` as its working directory.
The loop issued seq 1, the plan instruction, at 03:48:15. Its heartbeat named
pid 30492.

## Claim 1 — one replacement, the plan reused, step 1 issued once: PASS

The incident's state, rebuilt: the loop was killed, and only then was the plan
answered, so the plan was on disk while no loop was running:

```
taskkill /F /PID 30492
dabbler session report --sessions-dir docs/sessions --seq 1 --answer-file .dabbler/scratch/plan.json
```

`run.json` then read phase `plan`, seq 1, `stop: null`, with a heartbeat that
had stopped at 07:48:24Z. This is what `../csv-parser` session 002 was left in
on 2026-09-17. A waiter was started at 03:48:48:

```
dabbler session wait --sessions-dir docs/sessions
```

At 03:49:50 it printed seq 2, the step `write-plan`, and exited 0. It printed
nothing about the gap. `supervision.jsonl`:

```
{"at":"2026-09-18T07:48:14.865Z","event":"session-run-started","engine":"claude-code","mode":"mailbox"}
{"at":"2026-09-18T07:49:49.074Z","event":"loop-restarted","attempt":1,"phase":"plan","seq":1}
{"at":"2026-09-18T07:49:49.178Z","event":"session-run-started","engine":"claude-code","mode":"mailbox"}
{"at":"2026-09-18T07:49:49.663Z","event":"lease-taken","lease_epoch":2,"phase":"plan"}
```

`driver/loop.log` has the lines from both loops. Grepping it for issued
instructions shows one plan and one step:

```
dabbler [03:48:15] instruction-issued seq=1 kind=step step=plan
dabbler [03:49:49] run-resumed session=001 phase=plan invocations=0 max_invocations=24
dabbler [03:49:49] plan-accepted steps=["write-plan"] ...
declare: session 001 declared; releasable=no; ...
dabbler [03:49:50] instruction-issued seq=2 kind=step step=write-plan
```

The results:

- The waiter started exactly one replacement (pid 6724).
- The replacement accepted the plan that was already on disk and did not ask
  for it again.
- It declared the task, the step the dead loop never reached.
- It issued `write-plan` exactly once.

The gap lasted about 60 seconds, which is the time the heartbeat takes to go
stale. On 2026-09-17 the gap lasted until the operator clicked Resume.

## Claim 2 — the third death at one point is a `crash` stop: PASS

The replacement was killed too (`taskkill /F /PID 6724`). The step was then
answered with no loop running, so the waiter had nothing to print and had to
read that no loop was running:

```
dabbler session report --sessions-dir docs/sessions --seq 2 --step write-plan --status done --files docs/planning/solution-plan.md --notes "wrote the plan"
```

A watcher (`kill-replacements.cjs`, kept in the session scratchpad and not
shipped) polled `loop.json` every 20 ms. It killed each new loop as soon as
that loop's heartbeat named it, which was before the loop could take its lease
and collect the report. A waiter was then started at 03:50:32. It exited 3 at
03:53:34 and printed:

```
wait: no loop is driving session 001, so no instruction is coming. Session 001 paused (crash). The loop died at phase 'work' (seq 2) after it was started again 2 times; its log is .dabbler/runs/s1/driver/loop.log. The loop died with no stop recorded, and starting it again twice did not get it past this point.
Tell the operator. The ways on:
  - Resume Session in VS Code, or in a terminal of its own: dabbler session run --mailbox --sessions-dir docs/sessions
    The loop starts again from phase 'work'.
  - Read .dabbler/runs/s1/driver/loop.log, put right what it names, then start the loop again: dabbler session run --mailbox
    Nothing but the restart: the loop re-enters 'work' and nothing already accepted is asked for again.
  - Cancel the session: dabbler session cancel --reason "<why>"
    The session ends with your reason on the record. What the working tree already carries stays where it is; nothing is unwound.
```

The new rows in `supervision.jsonl`:

```
{"at":"2026-09-18T07:51:33.329Z","event":"loop-restarted","attempt":1,"phase":"work","seq":2}
{"at":"2026-09-18T07:51:33.435Z","event":"session-run-started","engine":"claude-code","mode":"mailbox"}
{"at":"2026-09-18T07:52:33.871Z","event":"loop-restarted","attempt":2,"phase":"work","seq":2}
{"at":"2026-09-18T07:52:33.976Z","event":"session-run-started","engine":"claude-code","mode":"mailbox"}
```

The watcher's log:

```
2026-09-18T07:51:33.806Z killed replacement pid=47136 (1/2)
2026-09-18T07:52:34.228Z killed replacement pid=10832 (2/2)
```

The final `run.json`:

```
phase work, seq 2, accepted_steps []
stop {"kind":"crash","code":null,"reason":"the loop died at phase 'work' (seq 2) after it was started again 2 times; its log is .dabbler/runs/s1/driver/loop.log","at":"2026-09-18T03:53:34.468-04:00","step_id":null}
```

The results:

- The waiter made two restarts at `(work, 2)`.
- It recorded the third death at that point as a `crash` stop.
- The ways on name both the log and the restart command.
- The count started afresh at the new point: the restart at `(plan, 1)` in
  claim 1 counted as attempt 1 there, and did not count toward `(work, 2)`.

## Claim 3 — a stop that was meant is never restarted: PASS

Next came a stop somebody meant: an interrupt was queued, and the loop was
resumed so it could meet the interrupt:

```
dabbler session interrupt --stop --reason "walk: a stop that was meant" --sessions-dir docs/sessions
dabbler session run --mailbox --sessions-dir docs/sessions
```

The interrupt verb said the session had already stopped (`crash`) and that it
would hold the request. The resumed loop cleared the crash
(`run-resumed ... after=crash`, `lease-taken` epoch 3). It then met the held
interrupt, recorded `interrupted`, printed that stop and exited. The heartbeat
was removed on the way out. A waiter was started at 03:54:04. At 03:55:05 it
exited 3 with the stop in the stop's own words:

```
wait: no loop is driving session 001, so no instruction is coming. Session 001 paused (interrupted). Walk: a stop that was meant. Somebody asked it to stop.
```

It started nothing: `supervision.jsonl` had 3 `loop-restarted` rows before the
waiter and 3 after, and no `loop.json` was written.

## Also seen

- **A killed process leaves no `loop-crashed` row.** `taskkill /F` ends the
  process before any `catch` can run, so what a kill leaves behind is a stale
  heartbeat and nothing else. The waiter restarts on that stale heartbeat,
  which is how the walk works. `loop-crashed` is written only when an error
  is thrown out of the drive, and `drive.test.ts` proves that case. The walk
  did not throw one.
- **The first loop's output reached `loop.log`**, even though that loop was
  started from a shell whose output went elsewhere. Its three opening lines
  are in the log, along with every loop after it.
- **The crash stop's second way on leaves out `--sessions-dir`**
  (`dabbler session run --mailbox`). The command still works from the
  repository root, where the session directory is derived. The waiter's own
  restart line above it gives the flag. This is left as found: the situation
  table spells commands from `MoveParts`, and `MoveParts` does not carry the
  sessions directory. `dispute-refused` spells this restart the same way.
- **Resume after a `crash` behaves like Resume after any other stop.** The
  resumed loop clears the stop and carries on from the phase it recorded.
