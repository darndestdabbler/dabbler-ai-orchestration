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
| walk-vsix.cjs | The walk of the product rather than the protocol: stages a disposable repository, installs a built VSIX into a fresh VS Code profile, runs Start Session from the repository's Work Explorer row, and plays the operator -- and once, the saboteur -- through a whole session of the chained exchange, a cancellation, or a no-framework baseline. See "Walking the VSIX". |

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

`walk-vsix.cjs` walks the installed extension through one session of the
chained exchange. It stages its own disposable repository, so it needs only a
built VSIX and a scratch folder -- one it made itself, or one that does not
exist yet; it refuses to wipe any other:

```
node docs/design/messaging-poc/walk-vsix.cjs --engine claude --model sonnet \
  --vsix tools/dabbler-ai-orchestration/dabbler-ai-orchestration-<version>.vsix \
  --scratch C:/temp/<scratch folder> --run claude-main --scenario main
```

Everything of a run lives under `<scratch>/<run>`: the repository and its bare
remote, a fresh VS Code profile, extensions folder and AppData, and `results`
-- `walk.jsonl` (every action, who took it, and whether a rule could have),
`summary.json`, the engine's own transcript, the AI terminal's text, the
Dabbler Terminal's text before it was closed, after it was reopened and at
the end, screenshots, the run's records, the ledger, the git log and the
remote's refs. Nothing is written into a product tree, and no environment or
credential is copied into any of it: the `DABBLER_` keys reach the window as
they reach a person's, and `HOME` is the real one so the CLIs find their logins.

The repository is a small TypeScript package with a real build and test (the
checkout's own compiler and node types, so it installs nothing), `dabbler
bootstrap` run through the VSIX's OWN bundled router, a three-step releasable
session, a declared suite that takes 40 seconds so the run of record is a long
framework job, and a pack-only `packaging` block, so the session packages and
tags and pushes its artifact nowhere.

| `--scenario` | what the walk does |
| --- | --- |
| `main` | Starts the session from the Work Explorer row and types only what a person would: the engine and model picks, a CLI's trust and tool prompts, a question while the author works, a question while an answer command waits on verification, and one `session interrupt` course correction. Off the framework's own records it closes and reopens the Dabbler Terminal during a framework job, and kills the live chained `session report --next` once the run of record is running -- then watches for the engine to run the exact command again -- and follows the session to its close. |
| `cancel` | Asks the AI, in its chat, to cancel the session it is working with a stated reason, then reads the ledger, the working tree, the git log, the remote, the tags and the packaging record, and reads them again a minute later. |
| `direct` | No framework and no extension: the same engine is given the same three-step change in one prompt, for the wall-time and cost baseline. |

**A walk fails closed.** It judges its own run against the scenario's
acceptance cases -- closed VERIFIED from one `session next` and chained
background answers, both questions heard and answered, the correction on the
next instruction, the Dabbler Terminal rebuilt with every line one way, the
killed command repeated as the same command, everything once, the package
clean, nothing left running; or, for a cancellation, the reason recorded, the
files kept and nothing landed -- writes each case with its evidence into
`summary.json`, and exits non-zero unless every one holds. A run that hit its
deadline leaves the same files a passing one does, and is not evidence.

`--compare <a.vsix> <b.vsix>` says whether two packages hold the same files
with the same bytes. Two builds of one tree never share a checksum -- a zip
carries its own timestamps -- so this is how the package a release pipeline
built is tied to the one that was walked.

Copilot needs `--model`. Run one walk at a time: they share the clipboard. What
a run cost is read from the engine's own record -- Copilot's usage store in AI
credits, Claude Code's transcript in tokens. Every run ends by listing the
processes that still name it after the editor has closed.

Copilot's screen cannot be read, so an Enter the walk presses before Copilot's
first user message is logged as answering either its folder-trust prompt or
nothing, with a screenshot taken just before it.
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
