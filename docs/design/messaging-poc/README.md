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
