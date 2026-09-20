# The next-instruction proof: results

The bootstrap proof the session plan asks for before Session 218, run on
2026-09-20 outside any Dabbler session. It changed no production code and no
router-owned state: the harness is the existing messaging proof of concept
under `docs/design/messaging-poc/`, extended in place, and this page.

## The question, and the answer

Can one visible, interactive Claude Code or Copilot CLI conversation request an
instruction from a short-lived framework process, do the work, submit its
answer by starting ONE background command, keep talking to the person while
that command builds, tests and calls a reviewer, and receive its next
instruction from that same command -- with no waiter to re-arm and no Resume?

**Yes, on both engines.** Each engine ran the same scenario in a real VS Code
terminal and reached `done` with all ten criteria held. No engine ever ran a
second request, a waiter, a sleep or a poll; each learned of its next
instruction from its own background task's completion, which is the
notification both engines already gave the mailbox waiter in sessions 176-180.

## What was built

The five harness files carry an exchange mode beside the old mailbox mode,
which stays as the comparison control:

| file | what the exchange mode added |
| --- | --- |
| `docs/design/messaging-poc/framework.mjs` | `request` (the first request), the exchange engine the answer command calls, and `watch` (the Dabbler-style terminal). No process lives between exchanges. |
| `docs/design/messaging-poc/post.mjs` | `--exchange <id> --answers <seq>`: the answer command. It accepts the answer, runs the phase the answer caused, prints exactly one JSON instruction or `done` on stdout, exits. |
| `docs/design/messaging-poc/protocol-AGENTS.md` | The author's seven rules for the exchange, beside the mailbox rules; the driver copies one section. |
| `docs/design/messaging-poc/drive-poc.cjs` | `--mode exchange`: builds the disposable repository, opens the AI's terminal and the Dabbler-style terminal, and plays the person and the saboteur off the framework's own events. |
| `docs/design/messaging-poc/report.mjs` | `--mode exchange`: ten criteria, each with its evidence, from the framework's events, the driver's log, the repository's git log and the engine's own transcript. |

The contract, as built. State is one file written whole and renamed into place;
it alone decides the next move. Each request carries an exchange id
(`<run>-x<seq>`) and the sequence number it answers. A request whose response
exists collects it; one whose answer is durable resumes the first unfinished
step; an answer is accepted once. One lock file admits one live request: a
second is refused on stderr with exit 3, stdout empty. A wrong sequence or
missing work is refused with exit 4 and the same instruction still owed.
Progress goes to an event log, never stdout.

The scenario, in a disposable repository that installs nothing (the checkout's
own TypeScript 5.9.3 and node types): instruction 1 asks for a `slugify`
function, a re-export and a three-case test; answer 1 runs the real `tsc`
build, the real `node --test`, **one real reviewer call through `dabbler agent
prompt --permissions deny`** with the staged diff in the prompt and the
disposable repository as `--cwd`, a 75-second hold standing in for a long
check, and a commit. Instruction 2 carries the reviewer's finding; answer 2
runs build, test, a 90-second hold and a commit. Instruction 3 asks for a
summary file; answer 3 commits and returns `done`. Copilot reviewed the
Claude-authored run and Claude Code reviewed the Copilot-authored run; both
returned the one prescribed finding (no test for the empty string).

## The runs of record

Both on the identical final harness, one after the other.

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| run | `claude-a2` | `copilot-a2` |
| engine | Claude Code 2.1.278, model `claude-fable-5-1` | GitHub Copilot CLI 1.0.86, model `gpt-5.6-sol` |
| engine command | `claude --permission-mode acceptEdits --allowedTools "Bash(node:*)" "PowerShell(node:*)" "Read" "Write" "Edit" "Glob" "Grep"` | `copilot --allow-all` |
| reviewer | Copilot, over `copilot --acp` | Claude Code, over stream-json |
| driver started / ended (UTC) | 22:39:27 / 22:46:05 | 22:46:19 / 22:52:24 |
| opening typed | 22:41:04 | 22:47:37 |
| instructions issued | step 1 22:41:09, step 2 22:43:13, step 3 22:44:59, done 4 22:45:09 | step 1 22:47:43, step 2 22:49:45, step 3 22:51:24, done 4 22:51:31 |
| accepted sequence numbers | 1, 2, 3 -- each once | 1, 2, 3 -- each once |
| refused answers / rejections | 0 / 0 | 0 / 0 |
| first requests run by the AI | 1 | 1 |
| answer commands, in the background | 4 of 4 (three answers and the rerun) | 4 of 4 |
| waiter, sleep or poll commands | 0 | 0 |
| reviewer invocations | 1 started, 1 completed (6.9 s, exit 0) | 1 started, 1 completed (4.9 s, exit 0) |
| builds / tests | 2 / 2, all exit 0 | 2 / 2, all exit 0 |
| commits | 3, one per stage (`288955a`, `e2d07cf`, `24fada1`) | 3 (`96bf4dd`, `aa5570f`, `1dc4f9f`) |
| exchange process exits | x0:0, x1:0 (the rerun), x2:0, x3:0; the killed x1 was terminated | the same |
| framework child exits | build, test, review, hold, commit: all 0 | all 0 |
| tool approvals by the driver | 0 | 0 |
| framework processes 25 s after `done` / after the editor closed | 0 / 0 | 0 / 0 |
| seat cost of the authoring conversation | not metered here | 18 model calls, 20.99 AI credits |

Router `dabbler-ai-router 3.15.0`; Node v25.8.1; VS Code 1.138.0 (the
extension's test download, a fresh profile per run); Windows 11, PowerShell
terminals.

Command lines, from the checkout's root:

```
node docs/design/messaging-poc/drive-poc.cjs --mode exchange --engine claude --run claude-a2 --repo C:/temp/s218-next-instruction-poc/claude-a2
node docs/design/messaging-poc/report.mjs claude-a2 --mode exchange --repo C:/temp/s218-next-instruction-poc/claude-a2 --out C:/temp/s218-next-instruction-poc/results/claude-a2
node docs/design/messaging-poc/drive-poc.cjs --mode exchange --engine copilot --run copilot-a2 --repo C:/temp/s218-next-instruction-poc/copilot-a2
node docs/design/messaging-poc/report.mjs copilot-a2 --mode exchange --repo C:/temp/s218-next-instruction-poc/copilot-a2 --out C:/temp/s218-next-instruction-poc/results/copilot-a2
```

### The person's two questions

The driver typed each on a framework event, into the AI's own terminal.

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| q1, while the author worked on instruction 1 | typed 3.0 s after the instruction was issued, 8.5 s before its answer was accepted. *"I'm on instruction sequence number 1 (the slugify step); the files are written and I'm now starting its answer command in the background."* | typed 3.0 s after, 6.3 s before. *"I'm working on instruction sequence 1."* |
| q2, while answer command 1 waited on the framework | typed 14 s into a 112 s phase. *"Yes — as far as I know it's still running (I've had no exit notification for background task `bzho0p2va`, and I'm not polling it), and when it exits its output ..."* | typed 16 s into a 112 s phase. *"Yes—the answer command is still running in the background, and when it exits I'll act on the JSON instruction it outputs while leaving it undisturbed."* |
| the instruction owed | answer 1 accepted after q1; instruction 2 delivered after q2 | the same |

### The kill

Once answer 1, its build, its test and its review were all durable and the
phase was in its hold, the driver terminated the answer command's process and
told the author nothing.

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| killed | pid 59692 at 22:41:51, confirmed dead | pid 37800 at 22:48:25, confirmed dead |
| what the engine saw | *Background command ... failed with exit code 1*, no output | `shell_completed`, no output |
| the exact command run again, by the AI | pid 37640, 6.0 s later, `resumed=true`, the dead owner's lock taken | pid 35532, 3.5 s later, `resumed=true` |
| answer 1 accepted | once | once |
| build / test / review / commit for answer 1 | 1 started and 1 completed, each | the same |
| the step in flight at the kill | the hold ran again from its start | the same |

### The duplicate

During phase B's hold the driver ran the live answer command a second time,
`node post.mjs --exchange <run>-x2 --answers 2`, beside the AI's own. Both
engines: exit 3, stdout empty, stderr *"refused: another exchange (pid N) is
live for this session and will deliver the next instruction to whoever started
it. Nothing was accepted and nothing ran."* One `request-refused` event; answer
2 accepted once; build, test and commit for answer 2 started once each. The
AI's own command was the winner and delivered instruction 3.

### The Dabbler-style terminal

Also during phase B's hold the driver killed the observer's terminal, waited,
opened a new one and ran `node framework.mjs watch` again. It replayed the
persisted events with their original times (52 on both engines, of 54 and 55
on disk by the time the screen was read), printed *"stage 2; the framework owns
the move (hold for answer 2)"*, and followed the log from there. The framework
phase was still running before and after, and was not affected: nothing in the
exchange knows the observer exists.

## What came before the runs of record

Two earlier runs, `claude-a1` and `copilot-a1`, are kept beside them. The
protocol behaved identically in both -- same accepted sequence numbers, one
reviewer call, the killed command run again in 5.8 s and 2.9 s, the duplicate
refused, `done`, nothing left running -- and each failed one criterion for a
reason in the harness:

- `claude-a1`: the report counted the AI's read of its finished background
  command's output file as "a tool call after done". That read is how `done`
  reaches the AI. The criterion now counts shell commands after `done` and
  still lists anything else.
- `copilot-a1`: Copilot wrote instruction 1's files and started its answer
  command in 5.1 s, and the driver's first question landed 2.1 s after the
  answer was accepted -- so it was not asked while the author worked. The
  criterion was kept. The driver now types the first question straight into
  the already-focused terminal, and instruction 1 asks for one more small file.

Both engines were then rerun on that one harness; those are the runs above.

## What this does and does not prove

Proven, on both engines: the five numbered capabilities in the plan's
question; exactly-once acceptance and side effects across a killed client; one
winner and one explicit refusal for a duplicate; an observer rebuilt from
persisted events; `done` with no `session wait`, no Resume, no daemon, and
nothing typed by the driver but the engine's command, its folder-trust answer,
the opening sentence and the two questions.

Held to the record, for Session 218 to carry:

- **The rerun is the AI's.** Rule 5 of the protocol tells the author to start
  the exact answer command again if it ends without an instruction. Both
  engines did, unprompted, within six seconds. That is the one recovery rule
  the managed instruction needs; it is not a waiter, because the command is the
  answer and is idempotent.
- **A step in flight at a kill runs again.** The hold did. A reviewer call in
  flight at a kill would be made twice here; the proof killed only after the
  review was durable. 218's existing job records decide what a resumed
  exchange does with a job that was running.
- **The lock is a proof's lock.** Liveness is a pid check; 218 uses the
  driver lease and its stale-owner checks instead.
- **The kill took the answer command's process**, not a tree with a child
  running under it.
- **The longest single wait was 112 s.** The two-hour soak of session 180
  measured the same background-completion notification over long waits for
  the mailbox waiter; this proof did not repeat it. Session 219's installed
  walk is where a long framework job meets the real router.
- **The hold is a stand-in.** The build, the test, the reviewer call and the
  commits are real; the long check is a timed wait that writes progress events.

## Where the evidence is

Outside the product tree, under the scratch folder
`C:\temp\s218-next-instruction-poc\results\<run>\`: the driver's log, the
framework's event log and final state, each child's captured output, the
repository's git log and status, the AI terminal's text, the observer's text
before the close, after the reopen and at the end, screenshots (the startup
trust prompt, both terminals, each question, the reopened observer, the end),
and the report with its full timeline and `summary.json`. The disposable
repositories are beside it, one per run.

The engines' own transcripts:

- Claude Code: `C:\Users\denmi\.claude\projects\C--temp-s218-next-instruction-poc-claude-a2\e158358a-701e-41f6-b138-8bd15e111997.jsonl`
- Copilot CLI: `C:\Users\denmi\.copilot\session-state\2fb71a8d-b287-45cb-b6fd-ac0de80cb8e1\events.jsonl`

Entry-gate fact read from the router, not written: `dabbler status` on
2026-09-20 shows sessions 215, 216 and 217 `cancelled`, no session in flight,
and 218 as the next session.

PROVEN ON CLAUDE AND COPILOT -- SESSION 218 MAY START
