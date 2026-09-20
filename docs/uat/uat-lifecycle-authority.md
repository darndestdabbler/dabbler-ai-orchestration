# Lifecycle authority, proved by failure injection

Session 213, 2026-09-20. The router bundle was built from this session's
tree (`npm run build -w dabbler-ai-router`) and every injection below was run
through that bundle against a scratch repository outside this tree: one
commit, one planned session, a suite that exits 0, and `.dabbler/local-only`
so nothing could be pushed anywhere. The shell was Claude Code's own, so each
run that needed a person's shell cleared the five engine markers with
`env -u`, and each run that needed an engine's set exactly one.

What each injection had to end with: no unauthorised commit or push, one
durable instruction, and a sentence that names what to do.

## A. An engine tries to end a session by force

`session cancel --force --reason proof` and `session close --force`, once
under each marker `callerIsEngine` reads, with the other four cleared.

| marker set | `session cancel --force` | `session close --force` |
| --- | --- | --- |
| `CLAUDECODE` | exit 3, refused | exit 3, refused |
| `COPILOT_CLI` | exit 3, refused | exit 3, refused |
| `COPILOT_AGENT_SESSION_ID` | exit 3, refused | exit 3, refused |
| `DABBLER_ENGINE_TERMINAL` | exit 3, refused | exit 3, refused |
| `DABBLER_DRIVEN` | exit 3, refused | exit 3, refused |

Both refusals are one sentence with the verb changed: "`session close
--force` is a person's verb, never the engine's: it closes every open session
of the plan past its bookkeeping gates, and that judgement is not the
engine's to make. Report the step blocked and say why". After all ten the
ledger read `1:in-progress`, `forceClosed` false, and the history was the one
scratch commit.

`session hold-release --reason proof` from the engine's shell: exit 3, "whether
a session releases is decided by its plan before the work, and holding one
afterwards is a person's verb, never the engine's."

## B. `session next` against a live loop

`dabbler session run --mailbox` was started and left running; a waiter printed
instruction 1 (`step`, `plan`). Then, from another shell:

    dabbler session next --sessions-dir <scratch>/docs/sessions

Exit 3: "a loop is driving session 001 (`dabbler session run --mailbox`), and
`session next` would take its lease and end it. Run `dabbler session wait`
again and answer what it prints: under a loop the waiter is what the AI runs,
and it takes nothing from anybody." `run.json` before and after: the same
phase, the same seq, no stop. The loop went on running.

## C. A person cancels while the loop waits for an answer

The tracked file was changed, as an AI partway through its work would have
left it, and the cancel a stop prints was run exactly as printed, from a
shell with no marker:

    dabbler session cancel --force --reason "wrong repository"

Exit 0, `{"session": 1, "status": "cancelled"}`, and on stderr: "left
uncommitted, exactly as it was: src/widget.txt. The next `session start`
offers to commit it (--commit-changes) or to undo it, keeping a copy
(--undo-changes)."

Within two seconds the loop's own terminal read:

    session-ended status=cancelled phase=plan why=wrong repository
    instruction-issued seq=2 kind=done
    dabbler: session 001 was cancelled while this loop was driving it (wrong
    repository). The loop has ended; nothing was committed or pushed for it
    after that.

and the process exited 0. `run.json` carried no stop, so nothing offered a
way on and no waiter had a dead loop to revive. The history gained one commit,
`Cancel session 1 of sessions`, holding the record's three files and nothing
else; the changed file was still modified and uncommitted. The instruction
left in the run's folder:

> Session 001 was cancelled by a person, who said: wrong repository. The loop
> has ended and nothing more will be asked: change no file, answer nothing,
> start no waiter. What the working tree carries is left exactly as it is.
> Stop, and tell the operator the session was cancelled and what you had
> changed.

## A defect the injection found, fixed in this session

An AI is usually not waiting when a person cancels -- it is working, with an
instruction in hand. When it then answered, `session report` said: "no session
has been started under <dir>. Run `session start` first." To a loop that is
an invitation to start a session nobody asked for, and on a ledger with an
earlier closed session the answer was aimed at THAT session instead.

`report` now takes the session in flight and no other, and an answer with
nowhere to go is told what the ended session's own `done` said. Replayed on
the rebuilt bundle:

> report: refused -- no session is in flight under <dir>, so there is nothing
> to answer. Session 001 was cancelled by a person, who said: wrong
> repository. The loop has ended and nothing more will be asked [...]

Its test is `session.test.ts`, "a report that arrives after its session was
cancelled".

## What was not injected live, and where it is proved instead

- **A cancel immediately before the land**, and **a session stopped at the
  publish, held, and closed.** Reaching either phase in a scratch repository
  costs a real verification round, so neither was bought for a proof. Both are
  walked in the container suite, in `walk-session.test.ts`: "a session
  cancelled underneath its loop" drives a loop whose session is cancelled
  through the verb mid-invocation and finds no commit but the cancellation's
  own; "a run standing at the publish of a session a person has held" finds
  the run moved to the close with no publish job started. The read before the
  add and before the push is `refuseIfEnded`, the same reader the phase
  boundary uses.
- **A waiter that was watching at the moment of the cancel.** A waiter prints
  the instruction owed and exits, so while an answer is owed none is watching;
  one is watching only while a framework job runs. The grace it gives a
  session that left flight -- ten polls for the session's own `done` before it
  reports an idle repository -- was not exercised here. A waiter started after
  the cancel printed the idle `done`, which names no command.
- **Codex.** Not installed on this machine; it is covered by
  `DABBLER_ENGINE_TERMINAL`, which row four above shows refused.
