# The messaging proof of concept

The harness behind `docs/design/messaging-design.md`: it drives a real engine
CLI (Claude Code CLI or GitHub Copilot CLI) in a real VS Code terminal, plays the
operator with Playwright, plays the framework with a script, and reads what
happened from the engine's own session log.

It is a measurement tool, not part of the product. Nothing here is built,
linted or tested with the repository.

## The files

| file | what it does |
| --- | --- |
| protocol-AGENTS.md | The protocol the AI follows: arm the waiter in the background, do each message's task, reply, re-arm, answer the operator. Copied into the scratch folder as AGENTS.md — it is not named AGENTS.md here, because an engine working in this repository could read it as its own instructions. |
| wait-inbox.mjs | The AI's background waiter: checks the inbox folder twice a second (no model call) until a message newer than its cursor appears, advances the cursor, prints the message and exits. Because the cursor moves when it prints, a waiter re-armed after a lost step skips that message; the waiter the framework builds (session 177) consumes nothing. `--timeout <seconds>`, or a `waiter.config.json` holding `timeoutSeconds`, makes it exit with `NO MESSAGE` (a keep-alive). |
| post.mjs | The AI's reply to the framework: `node post.mjs <message id> <text>`. |
| framework.mjs | The stand-in framework: posts tasks on a schedule (`--schedule 60,240,...` seconds) and times each reply. |
| drive-poc.cjs | The driver: resets the scratch folder, launches VS Code with a fresh profile, starts the CLI in a terminal, answers its folder-trust prompt, types the opening, starts the framework, types the operator's questions (`--human "<seconds>:<text>\|..."`), kills the waiter on cue (`--kill <seconds>,...`), and saves the logs, screenshots and terminal text. |
| report.mjs | The analyzer: one run's findings and timeline from the harness logs and the engine's own log (the Claude project transcript, or Copilot's session events and usage store). |
| *exchange mode* | The same five files carry the next-instruction proof (`docs/design/next-instruction-poc-results.md`); the mailbox mode above stays as its comparison control. See "The exchange mode" below. |
| walk-vsix.cjs | The walk of the product rather than the protocol: installs a built VSIX into a fresh VS Code profile, runs Start Session from the repository's Work Explorer row, answers the engine and model picks and every prompt the CLI puts up, types the operator's questions while the AI waits and while it works, and follows the framework's records until the session completes. Every action goes to `walk.jsonl` with who took it and whether a rule could have. |

## Running it

The driver uses Playwright from the extension's own dependencies and the VS Code
binary under the extension's test downloads, through
`tools/dabbler-ai-orchestration/scripts/vscode-launch.js`. It finds the extension
from `--tools <path>`, else the `DABBLER_EXTENSION_DIR` environment variable, else
its own place in this repository. A copy run from a scratch folder has no
repository around it, so give it one of the first two, pointing at
`tools/dabbler-ai-orchestration` in your checkout (with its dependencies
installed and `npm run test:playwright` run once, which downloads VS Code).
`--repo` defaults to the folder the driver runs in and `--vscode-state` to that
folder's path with `-vscode` appended.

1. Make a scratch folder under C:\temp and `git init` it.
2. Copy in the five scripts; copy protocol-AGENTS.md in as AGENTS.md; add a
   CLAUDE.md whose only line is `@AGENTS.md`; add a .gitignore listing `mail/`,
   `work/` and `results/`.
3. From that folder, one run:

   ```
   node drive-poc.cjs --engine claude --run claude-check --repo C:/temp/<folder> \
     --vscode-state C:/temp/<folder>-vscode --schedule 60,150 \
     --human "100:Are you still waiting? One sentence, and keep waiting." --deadline 330
   node report.mjs claude-check
   ```

4. A soak is the same command with a long schedule, questions every ~15 minutes
   (some timed a few seconds after a message lands, to arrive mid-turn), two
   `--kill` cues, and a deadline past the last message. Two engines can soak at
   once when each has its own folder and `--vscode-state`: the driver only kills
   its own folder's processes.

A run longer than a tool call's limit belongs in the background; the driver's
log gains a `done` event when it finishes.

## The exchange mode

The question it answers: can one visible, interactive CLI conversation ask for
an instruction, do the work, answer with ONE background command, stay free for
the person while that command builds, tests and calls a reviewer, and get its
next instruction from that same command -- with no waiter to re-arm?

- `node framework.mjs request --exchange <run>-x0 --answers 0` is the first
  request: it prints one JSON instruction and exits.
- Every instruction names one `answer_command`, `node post.mjs --exchange
  <run>-x<seq> --answers <seq>`. It accepts the answer, runs the phase the answer
  caused, prints exactly one JSON instruction (or `done`) on stdout and exits.
  Progress goes to `events.jsonl` in the disposable repository's `state` folder,
  never stdout.
- No process lives between exchanges. `exchange.json` there is written whole and
  renamed into place, and it alone decides the next move: a repeated request
  collects the response already produced or resumes the first unfinished step,
  and an answer is accepted once. `exchange.lock` admits one live request;
  a second is refused on stderr with exit 3, and a wrong or malformed answer
  with exit 4 and the same instruction still owed.
- `node framework.mjs watch` is the Dabbler-style terminal: an observer that
  replays the persisted events, says who owns the move, and follows the log.
- The scenario: three authoring instructions in a disposable TypeScript
  repository. Answer 1 runs the real `tsc` build, the real `node --test`, one
  real reviewer call through `dabbler agent prompt --permissions deny` (Copilot
  reviews Claude's run, Claude Code reviews Copilot's), a hold standing in for a
  long check, and a commit; answer 2 runs build, test, hold and commit; answer
  3 commits and returns `done`.

One run, from this checkout (the driver builds and wipes the disposable
repository itself, and refuses to wipe a folder it did not make):

```
node docs/design/messaging-poc/drive-poc.cjs --mode exchange --engine claude \
  --run claude-a2 --repo C:/temp/s218-next-instruction-poc/claude-a2
node docs/design/messaging-poc/report.mjs claude-a2 --mode exchange \
  --repo C:/temp/s218-next-instruction-poc/claude-a2 \
  --out C:/temp/s218-next-instruction-poc/results/claude-a2
```

The driver types the engine's command, its folder-trust answer, the opening
sentence and two questions, and nothing else. On the framework's own events it
asks the first question while the author works, the second while answer command
1 waits on the framework, kills that command once its build, test and review
are durable, runs a duplicate of the live answer command 2, and closes and
reopens the Dabbler-style terminal. `report.mjs` holds the run to ten criteria
and writes `report.md` and `summary.json` beside the driver's log. Do not nest
the scratch folder under another folder that holds an `AGENTS.md` or
`CLAUDE.md`: Claude Code reads its parents'. Run the engines one after the
other: the drivers share the clipboard, and the end-of-run process check is
machine-wide.

## Walking the VSIX

`walk-vsix.cjs` needs a repository the extension can start a session in:
bootstrapped, with a session planned, committed and pushed to a remote. It
writes its evidence to a folder beside the repository, `<repo>-results/<run>`,
so nothing it writes moves the repository's tree, and it keeps each run's VS
Code profile in `<repo>-vscode/<run>`, which it deletes before that run
launches: every run starts on a fresh profile of its own, so no earlier run's
terminals are restored into it.

```
node walk-vsix.cjs --engine claude --vsix <extension>/dabbler-ai-orchestration-<version>.vsix \
  --repo C:/temp/<scratch repo> --run claude-walk --model sonnet \
  --human "turn:What are you working on? One sentence.|wait:Are you still waiting? One sentence."
```

Copilot needs `--model`. The `DABBLER_` keys in the environment reach the
window, so the reviewers can be reached; `HOME` is the real one, so the CLIs
find their logins. Which actions a person had to take is `walk.jsonl` filtered
to `"actor":"operator"`; which commands the AI ran is the engine's own log,
which the walk copies beside `walk.jsonl` when it ends or stops on an error,
under a name carrying the attempt's start time. A rerun under the same `--run`
keeps the previous log as `walk-attempt<N>.jsonl` rather than adding to it, and
the previous engine log under its own name.

Copilot's screen cannot be read, so an Enter the walk presses on it is logged
as answering either Copilot's folder-trust prompt or the sentence Start typed,
with a screenshot taken just before it. Tell them apart from the records: an
Enter that submitted the sentence is followed within a second by a
`user.message` in Copilot's session events, and one that answered the trust
prompt is followed by nothing. Or answer the trust prompt once for the scratch
folder before the walk, and there is only one kind.

## What to know first

- **Copilot drops a prompt given with `-i`** in this terminal. The driver starts
  both CLIs without a prompt and types the opening into the chat.
- **Claude Code's trust prompt defaults to "No, exit"**, and Escape cancels it.
  The driver reads the prompt and moves to "Yes"; it never sends a bare Enter or
  Escape to it, and it clears the terminal selection with VS Code's own command
  rather than a key the CLI would receive.
- **Copilot draws on the terminal's alternate screen**, so the driver cannot read
  its screen text; take Copilot's evidence from its events log. Answer its trust
  prompt once (it can remember the folder) before an unattended run.
- **Use a fresh VS Code profile per run.** A reused one restores the last run's
  terminals, and the driver ends up typing into one terminal and reading another.
- **Type after focus settles.** The driver clicks into the terminal and pauses
  before typing; without it the first characters of a message were lost.
- **Check the CLI is alive before waiting for a question's moment, not after.**
  The check takes seconds, and a question meant to land mid-turn arrived late.
