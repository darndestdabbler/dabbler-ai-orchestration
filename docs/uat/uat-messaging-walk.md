# UAT: the messaging walk

Session 179 walked the loop sessions 177 and 178 built — Start Session
registers the session and starts the framework's loop, and the AI keeps
`dabbler session wait` running in the background — through the VSIX this tree
builds, on Claude Code CLI and on GitHub Copilot CLI, with Playwright playing
the operator. The question asked of every action: could a rule have taken it?
Every deterministic action taken by anyone but the framework is a defect.

## The summary

**Before the fixes, neither engine could run a session from Start.** On Claude
Code the framework's loop never started (defect 1) — the session registered
and nothing ever issued it an instruction — and once that was fixed, Start
refused the model the box itself suggests (defect 3). On Copilot, Start refused
on every machine that had not yet read its catalog (defect 2). The count of
deterministic actions before the fixes is therefore not a number: the operator
had to restart the session by hand from a terminal to get anywhere.

**After the fixes, both engines ran a whole session from one Start**: the plan,
two steps, verification, the run of record, the land and the close, with the
framework moving every step, the AI answering from its own chat with a waiter
in the background, and two operator questions — one while the AI worked, one
while it waited — answered without the loop missing a beat.

| engine | session, by the ledger | verdict | deterministic actions by anyone but the framework | `session next` by the AI |
| --- | --- | --- | --- | --- |
| Claude Code CLI (`sonnet`) | 2 min 25 s | VERIFIED, round 1 | **0** (Claude ran in the operator's own auto mode) | 0 |
| Copilot CLI (`gpt-5.6-luna`) | 3 min 35 s | ISSUES_FOUND, one non-blocking nit | **8**: one Enter on the typed sentence, seven approvals of `session wait` and `session report` | 0 |

Six defects in all: four fixed here with their tests, and two written up as
sessions 184 and 185 because both widen what reaches an AI without a person's
keypress. One more thing was learned about the harness, not the product:
Claude Code's trust prompt changed its wording and dropped its numbering, and a
walk that reads prompts off the screen has to be told.

## Repeating the walk

1. Build the router and the VSIX: `npm run build -w dabbler-ai-router`, then
   `npm run package` in `tools/dabbler-ai-orchestration`.
2. Make a scratch repository under `C:\temp`: `git init -b master`, a README
   and a `package.json` whose test script is `node --test`, committed; a bare
   origin beside it; `dabbler bootstrap --remote <origin>`; a session plan of
   your own with a small session, committed and pushed.
3. From this repository, one walk per engine — each needs its own scratch
   repository, and a repository whose session registered cannot be walked
   again without being made anew:

   ```
   node docs/design/messaging-poc/walk-vsix.cjs --engine claude --vsix <the .vsix> --repo C:/temp/<repo> --run claude-walk --model sonnet --human "turn:What are you working on right now? One sentence, then carry on.|wait:Are you still waiting on the framework? One sentence."
   ```

   with `--engine copilot --model gpt-5.6-luna` for Copilot.
4. The walk's actions are `walk.jsonl` in `<repo>-results/<run>`; count the
   rows with `"actor":"operator"` and `"deterministic":true`. What the AI ran
   is the Claude transcript under `~\.claude\projects` or Copilot's session
   events under `~\.copilot\session-state`.

## What was built

- **The router**, `npm run build -w dabbler-ai-router`, and **the VSIX**,
  `npm run package` in `tools/dabbler-ai-orchestration`:
  `dabbler-ai-orchestration-3.2.1.vsix`, carrying the router built from the
  same tree (sessions 177 and 178 on top of 3.2.1).

## How the walk was run

- **The harness**, `docs/design/messaging-poc/walk-vsix.cjs`: the harness's own
  VS Code 1.137.0 with a fresh user data directory, extensions directory and
  AppData per walk; the VSIX installed with `code --install-extension`, and no
  `--extensionDevelopmentPath`. `HOME` is the real one, so the CLIs find their
  logins; the `DABBLER_` keys reach the window, so the reviewers can be reached.
- **Start Session from the repository's Work Explorer row**, the engine picked
  and the model entered in the boxes Start puts up. From there the harness
  answers only what the CLI puts on its screen, types two operator questions —
  one 20 s after the first work step is issued, while the AI works, and one
  when the session reaches verification, while the AI waits — and follows the
  framework's own records until the session completes.
- **Every action is logged** with who took it and whether it was
  deterministic. What the AI ran is read from the engine's own log.

## The scratch repositories

Each began as `git init -b master` with a one-line README and a
`package.json` whose test script is `node --test`, and a bare origin beside it.
`dabbler bootstrap --remote` declared the node suite, committed and pushed; the
scaffolded session plan was replaced with the developer's own two-step session
(`greet(name)`, then `shout(name)`, each with tests in
`greet.test.mjs` under `test/`), committed and pushed.

| engine | repository | origin |
| --- | --- | --- |
| Claude Code CLI | `C:\temp\s179-claude` | `C:\temp\s179-claude-origin.git` |
| GitHub Copilot CLI | `C:\temp\s179-copilot` | `C:\temp\s179-copilot-origin.git` |

## The defects, and what became of each

| # | defect | found on | became |
| --- | --- | --- | --- |
| 1 | Start's loop terminal ran the editor's executable without `ELECTRON_RUN_AS_NODE`, so a second editor started and the loop never ran; Resume the same | Claude | fixed: the terminal carries the variable (`sessionCommands.ts`), asserted in `commandFlows.test.ts` |
| 2 | `session start` resolved a seat's model against the catalog before its own free refresh, so a machine that had never read its catalog was refused and told to run the refresh by hand | Copilot | fixed: the refresh runs before any check that can refuse (`session.ts`), asserted in `session.test.ts` |
| 3 | `session start` refused `sonnet`, a name `claude` always accepts, once the catalog listed the key's dated ids | Claude | fixed: an engine's own aliases are not held to the catalog's list (`session.ts`), asserted in `configuration.test.ts` |
| 4 | Bootstrap, the quick start and the extension README told the operator to tell the AI to "start the next session" | both | fixed: they name Start Session on the repository's row |
| 5 | Copilot asks the operator to approve every `dabbler session wait` and `dabbler session report` — seven of the eight deterministic actions on that walk | Copilot | session 184: the loop's own commands are approved at launch, and nothing wider |
| 6 | Copilot has no argument for an opening prompt, so Start types the sentence and the operator presses Enter | Copilot | session 185: the sentence is submitted once the CLI is ready to take it |

Numbers 5 and 6 are written up rather than fixed because both change what
reaches an AI without a person's keypress. What Claude Code or Copilot may run
unasked is a permission the operator grants, and a pattern too wide — Copilot
matches a prefix on the first subcommand, so `shell(dabbler:*)` would also
approve `session cancel --force`, which is a person's verb — is worse than the
prompt it removes. Each wants its own session and its own walk.

## Claude Code CLI

Claude Code CLI on `sonnet`, from `C:\temp\s179-claude`.

**Before the session could start.** Three product defects stood between Start
Session and a running session, each found here and fixed where it blocked:

- **The framework's loop never ran** (defect 1). Start registered the session
  and opened the loop terminal, and the terminal showed `Code` and nothing
  else. The loop's program is the editor's own executable, and without
  `ELECTRON_RUN_AS_NODE` that starts a second editor rather than the router:
  the process tree held a renderer, a GPU process and a crashpad handler under
  `Code.exe … dabbler.cjs session run --mailbox`, and no run record was ever
  written. The AI's waiter would have waited on a loop that did not exist.
  Resume opens the same terminal and had the same defect.
- **Start refused `sonnet`** (defect 3), once the catalog had been read:
  *"The authoring model is set to 'sonnet', which is not one it can be. It
  offers 11: claude-fable-5, …"*. `sonnet` is a name `claude` always accepts
  and is not an enumerated id, and the Start box's own placeholder offers
  `haiku`. It had passed before only because this machine's catalog was empty.
- The rest of the reruns were the harness: the row, the menu, a stale trust
  pattern — the prompt now reads *"Quick safety check: Is this a project you
  created or one you trust?"* over unnumbered `No, exit` and
  `Yes, I trust this folder`.

**The session, by the framework's own record.** Registered 08:21:49 and closed
08:24:14 — **2 min 25 s**. From Start Session: the plan instruction at 33 s,
work at 89 s, the second step at 111 s, verification at 145 s, done at 179 s.
Verification round 1 was VERIFIED from `gpt-5.6-terra` over the API, with one
nit (other whitespace-only names). Nothing was published: the repository
declares no packaging.

**What the AI ran**, from the Claude transcript: `dabbler session wait` 4 times,
each with `run_in_background`, and each finish arriving as a task notification
that woke it; `dabbler session report` 3 times; `node --test` twice; the file
writes and edits — and **`session next` never**. It held no turn open while
the framework worked: between the last report and the done, its only action
was reading the waiter's output when the notification came. The question
typed while it worked arrived as a queued message and was answered in the
same turn (*"I'm implementing and testing shout(name) in src/greet.mjs for
session 1's "shout" step — tests just passed, now reporting the step as
done."*); the question typed while it waited was answered at once (*"Yes, the
background waiter is still running for the next Dabbler instruction
(verification/suite/close-out are next)."*).

**No tool approvals were asked for**, and that is this machine rather than the
product: the transcript records `permissionMode: auto` — the operator's own
Claude Code setting. On a default install every `dabbler` command the loop
needs would prompt, as it did on Copilot below.

**Every action anyone but the framework took.**

| actor | action | count | deterministic |
| --- | --- | --- | --- |
| operator | Start Session, the engine pick, the model | 3 | no — the decision to start, and with what |
| operator | a question to the AI | 2 | no |
| operator | "Yes, I trust this folder", once for a folder Claude had not seen | 1 | a permissions choice |
| AI | `session next`, or any other framework sequencing | 0 | — |

No deterministic action by anyone but the framework.

## Copilot CLI

GitHub Copilot CLI 1.0.83 on `gpt-5.6-luna`, from `C:\temp\s179-copilot`.

**Before the session could start.** The first three runs stopped in the
harness — a row by the same name in the Solution Explorer, a context-menu
click that only highlighted the entry, a pick that had not yet opened — and are
not product defects. The fourth reached Start Session and was refused:
*"orchestrator model 'gpt-5.6-luna' is not in this machine's model catalog …
Run `dabbler discovery refresh` … and start the session again"* (defect 2
below). A machine that has never read its catalog is every developer's first
Start; the refresh costs nothing and is the framework's to run. After the fix,
the fifth run went from Start Session to a closed session with nobody but the
framework moving it.

**The session, by the framework's own record.** Registered 08:16:39 and closed
08:20:14 — **3 min 35 s**. From Start Session: the plan instruction at 34 s,
work at 98 s, verification at 202 s, the run of record at 230 s, the land at
235 s (`67043f2`), the close at 241 s, done at 251 s. Verification round 1 was
ISSUES_FOUND with one non-blocking nit (no test for an empty-string or missing
name) from `claude-sonnet-5` over the API, which stops the loop by severity
rather than asking for a fix. Nothing was published: the repository declares
no packaging. The CLI's status line read **2.01 AI credits** for the session.

**What the AI ran**, from Copilot's session events: `dabbler session wait` 4
times (each as an asynchronous shell), `dabbler session report` 3 times (the
plan and the two steps), `node --test` twice, the file edits — and **`session
next` never**. It answered both operator questions, one while working (*"I'm
implementing the repository's Dabbler session plan for the greeter module and
will continue with the next framework instruction."*) and one while waiting
(*"Yes—I'm waiting for the framework to issue the next instruction, then I'll
execute it and restart the waiter."*), and re-armed its waiter after each
answer with nobody's help. One reading: while verification ran, it held its
turn polling the waiter's output five times (1 s to 30 s apart) rather than
ending the turn and taking the completion notice.

**Every action anyone but the framework took.**

| actor | action | count | deterministic |
| --- | --- | --- | --- |
| operator | Start Session, the engine pick, the model | 3 | no — the decision to start, and with what |
| operator | a question to the AI | 2 | no |
| operator | Enter on the sentence Start typed at the prompt | 1 (pressed twice: the first landed while the CLI was starting) | **yes** |
| operator | approve `dabbler session wait` | 4 | **yes** |
| operator | approve `dabbler session report` | 3 | **yes** |
| operator | approve a file the AI wrote | 5 | a permissions choice |
| operator | approve `node --test` | 2 | a permissions choice |
| AI | `session next`, or any other framework sequencing | 0 | — |

Eight deterministic actions, all the operator's, and all of them prompts: the
typed sentence's Enter and the approvals of the framework's own two commands.

**The evidence.** The harness's actions and screenshots are in
`C:\temp\s179-copilot-results\copilot-walk` (`walk.jsonl`, with the earlier
attempts kept beside it as `walk-attempt<N>.jsonl`); the AI's own record is
Copilot's session `6f9ce452-d29e-42af-a463-f1d642bd756d` under
`~\.copilot\session-state`; the framework's is the scratch repository's
`.dabbler\runs\s1`. The screenshot taken after the question asked while the
AI waited shows the Dabbler terminal beside the chat, with verification's job
started at the moment the question was answered.
