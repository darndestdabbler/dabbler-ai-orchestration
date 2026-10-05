# The chained exchange — session 218's proof

Measured on 2026-09-20 on the operator's Windows 11 machine, against the
router bundle built from this session's tree (`npm run build -w
dabbler-ai-router`, which writes the bundle the proof runs), by one script:

```
node packages/router/scripts/prove-chained-exchange.mjs --keep --json <file>
```

`dabbler-ai-router 3.15.0`, Node v25.8.1. The script exits 0 only when every
one of its twenty readings holds, and it is this session's step check, so the
framework ran it again before it took the step.

## What it drives

A disposable repository under the system temp folder with a local bare
remote as `origin`: a session plan, a `dabbler.yaml`, a widget, and one
declared suite that takes 20 seconds and writes a line to a file outside the
repository every time it *finishes*. Verification goes through the **offline
transport**, which answers a round from a file: no provider is called and no
round is invented.

The engine is a fake that knows nothing but what stdout tells it. It runs
`dabbler session start`, then `dabbler session next` **once**, and from there
only the `answer_command` each instruction names — every one of which the
framework wrote with `--next`. It never runs `session next` again, never runs
`session wait`, and starts no `session run --mailbox`. Every stdout is parsed
whole as JSON; anything else fails the proof.

## The run

| the call the engine made | exit | what stdout was |
| --- | --- | --- |
| `session next` | 0 | `step` 1, the plan; its `answer_command` carries `--next` |
| answer 1 — `session report --seq 1 --next --answer-file <plan>` | 0 | `step` 2, `widget` |
| answer 2 — `session report --seq 2 --next --step widget ...`, interrupted while its check ran | 0 | `step` 3, `notes`, `reasons: ["sent: keep the notes to one line"]` |
| answer 3 — `session report --seq 3 --next --step notes ...`, **killed** during the run of record | killed (SIGTERM) | nothing |
| answer 3 again, the exact command | 0 | `done` 4: *Session 001 is closed: the work is landed, verified and recorded.* |
| answer 3 once more, after the close | 0 | the same `done` 4 |

Between answer 3 and its `done` the one repeated call carried the session
through the step's check, verification (one round, VERIFIED), the run of
record, the land commit, the push, and the close with its own commit and
push. No call returned a `wait`.

## The interruption

The first step's own check takes eight seconds. While it ran, `dabbler
session interrupt --reason "keep the notes to one line"` was accepted, and
the instruction that same chained call returned — the next step — carried it
first among its reasons as `sent: keep the notes to one line`. The person's
words reached the AI on the instruction it was about to get, with nothing
waiting for them and nothing re-issued.

## The kill, and the exact command again

The third answer's process was killed once `run.json` showed the step
accepted and the job `run of record: unit` running — so the answer was
durable and framework work was in flight. It had printed nothing. The same
argv was then run again. What the record shows:

| | |
| --- | --- |
| the answer accepted | **one** time: one `report-accepted ... step=notes` line from the process that was killed, none from the repeat |
| the run of record | **one** completed run of the suite (one line in its file, `2026-09-20T23:39:28.752Z`); the repeat re-entered the job the killed process had started rather than starting another |
| framework jobs | one status file each: verification, run of record, close |
| commits | **one commit** landing the work (`da7087b Session 1: The widget`) and one close commit (`843d668 Close session 1 of sessions`) |
| pushes | **one push** of each: the remote's `main` is `843d668`, which is the checkout's `HEAD`, and its log holds exactly those two commits over the seed |
| the ledger | session 1 `complete`, `VERIFIED` |

The remote's refs at the end: `refs/heads/main 843d668`, and
`refs/dabbler/rounds/s1/r1 5237262`, the round's own pin.

Repeated a third time, after the close, the command was told that session's
own `done` again and moved nothing. It is never told the idle instruction:
that one names `dabbler session start`, and a reader that follows
instructions would begin the next session.

## What the unit tests hold beside it

`walk-session.test.ts` drives the same path in-process with real child jobs:
a refused report chains nothing and leaves the instruction owed; a plan's
answer repeated after its next instruction was issued prints that instruction
under its own seq; and a chained call that loses the run's lease to another
stands down before the land — the test fails without the lease being read
where the framework is about to act. `session.test.ts` holds the rule a
repeat is judged by, `cli.test.ts` that chained stdout is one instruction
while a plain report prints its confirmation there as before.

## What this does not prove

- **No real engine ran.** Whether Claude Code and the Copilot CLI start a
  chained command in the background, stay free while it runs, read its output
  when it exits and run it again when it is killed was proved on the protocol
  in `docs/design/next-instruction-poc-results.md`, with a stand-in framework.
  The two have not met: the real router under a real interactive engine is
  session 219's installed walk.
- **No extension ran.** Start Session opening the AI and the Dabbler Terminal
  and no loop is held by the extension's own suite, not by a window.
- **The kill took the router's process**, as a closed terminal does. A step's
  own check runs inside that process, so a kill *during a step's check* runs
  the check again on the repeat; framework jobs — verification, the suites,
  the close — are separate processes the repeat re-enters, and the kill here
  was made under one of those.
- **One machine, one run of record.** The proof is rerun by this session's
  step check; it has not been soaked.
