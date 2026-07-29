# Alternate take — Scene 1 with direct provider API keys

**Replaces:** [`scene-1-install-and-verify.md`](scene-1-install-and-verify.md) **entirely**.
**Rejoin at:** [`scene-2-create-and-clone.md`](scene-2-create-and-clone.md) beat 1, unchanged.

Covers the *direct provider API keys* variant callout in
[`hello-world.md`](../hello-world.md) **Part 1**.

**Finished length:** ~5 minutes.

## What this take changes downstream

Recording this take instead of scene 1 changes four later things. Say each of them where they
happen; do not save them all for the end.

| Where | Change |
| --- | --- |
| [Scene 3](scene-3-dabbler-setup.md) beat 3 | Leave **Provider access (how routed calls run)** on its **first** option, and fill in the **Verification budget (USD, not-to-exceed)** box that stays visible underneath it. |
| Scene 3 beats 4–5 | Only **one** progress notification (**Building project structure…**) and **one** toast. There is no Copilot seat probe and no `transport.profile: copilot-cli` message. |
| [Scene 5](scene-5-second-module.md) beat 3 | Sam's one-time setup is **this take**, not the Copilot one: his three `DABBLER_*` keys set off camera, and Claude Code installed and signed in in his clone. He does **not** sign in to the Copilot CLI. `Dabbler: Install ai-router` is unchanged. |
| Scenes 4, 5, 6 | Wherever a beat says *paste it into `copilot`*, paste it into Claude Code's chat panel instead. No terminal, no `copilot` command. |

Everything else — every Dabbler command, every dialog, every git step — is identical.

## Scene goal

The viewer ends with VS Code, the Dabbler extension, Python, an AI agent inside VS Code, and
three provider API keys set in their environment — with the keys proven present **without ever
showing one**.

## Starting state

- VS Code installed, no folder open.
- The Dabbler extension **not yet installed**.
- Python on `PATH`.
- API keys for Anthropic, Google, and OpenAI **already obtained and set off camera** — see
  the warning below.
- Focus Assist / Do Not Disturb on. OBS scenes used: `Editor`, and `Privacy` at beats 5
  and 6.

> ## Set the keys off camera. All three. Before you press record.
>
> This is the one take in the whole video with a real credential-leak risk, and it leaks in
> more ways than people expect: the terminal scrollback, a `setx` command line, the
> environment-variable dialog, an editor autocomplete popup, a `.env` file left open in a
> background tab.
>
> **Set all three keys before recording, in a terminal you then close.** The beats below only
> ever prove a key is *present* — never what it says. If you find yourself about to type a key
> on camera, stop the recording.

---

## Beat 1 — Open on the goal *(Part 1, framing)*

**Do.** VS Code welcome screen, nothing else on screen.

**Say.** "In about an hour we're going to build a small program, two modules, written by AI
sessions, reviewed by a person, shipped through a real pull request gate on GitHub. First, the
tools. This version of part one uses provider API keys directly — if you have a GitHub Copilot
seat instead, watch the other take, it's shorter."

**See.** The VS Code welcome screen with no **Recent** entries visible.

---

## Beat 2 — Install the Dabbler extension *(Part 1 step 2)*

**Do.** Extensions view (`Ctrl+Shift+X`), search `Dabbler AI Orchestration`, click **Install**
on the result published by **DarndestDabbler**.

**Say.** "The extension is on the VS Code Marketplace — Dabbler AI Orchestration."

**See.** The extension page shows **Uninstall**, and a new Activity Bar icon appears. Read the
**version** on that page out loud.

> **Recording precondition: the Marketplace must show 0.46.0 or newer**, exactly as in the main
> take — scenes 3 and 4 depend on the scaffolded templates re-cut in extension **0.46.0**. **Do
> not record until it is**; check before you press record.

---

## Beat 3 — Check VS Code and Python *(Part 1 steps 1 and 3)*

**Do.** **Terminal > New Terminal**, then, one at a time:

```bash
code --version
python --version
```

**Say.** "VS Code 1.85 or newer, Python 3.10 or newer."

**See.** `code --version` prints three lines; the **first** must be **1.85.0 or higher**.
`python --version` prints a line like `Python 3.12.4`, **3.10 or higher**.

**If this fails on camera.** A missing or too-old Python is a stop — cut, fix it off camera,
and restart the scene. If `code` is not found: Command Palette > **Shell Command: Install
'code' command in PATH**, then re-run.

---

## Beat 4 — Prove the three keys are present *(Part 1, direct-API variant)*

**Do.** In the same terminal, run **exactly this** — it prints only whether each variable is
set, never its value:

```powershell
foreach ($n in 'DABBLER_ANTHROPIC_API_KEY','DABBLER_GEMINI_API_KEY','DABBLER_OPENAI_API_KEY') {
  if ([Environment]::GetEnvironmentVariable($n)) { "$n = set" } else { "$n = MISSING" }
}
```

On macOS or Linux — this form works in both `bash` and `zsh` (macOS defaults to `zsh`, where
bash's `${!n}` indirect expansion is a syntax error):

```bash
for n in DABBLER_ANTHROPIC_API_KEY DABBLER_GEMINI_API_KEY DABBLER_OPENAI_API_KEY; do
  if [ -n "$(printenv "$n")" ]; then echo "$n = set"; else echo "$n = MISSING"; fi
done
```

**Say.** "Three provider keys — Anthropic, Google, OpenAI. I set these before I started
recording, and I'm checking they're *there*, not what they say. You want more than one
provider, because Full tier verifies every session with a second AI on a *different*
provider. One key gets you a router that can't verify anything."

**See.** Three lines, each ending `= set`. **No key value anywhere on screen.**

**If this fails on camera.** A `MISSING` line is a stop. Cut, set it off camera in a terminal
you then close, restart VS Code so it inherits the new environment, and re-record the beat.
**Do not fix it on camera.**

---

## Beat 5 — Install an AI agent inside VS Code *(Part 1, direct-API variant)*

**This take uses Claude Code as its one canonical agent**, so every later beat has something
literal to name. Codex and Gemini Code Assist work identically for this tutorial's purposes; if
you record with one of those, substitute its install command here and its chat panel
everywhere this take says "Claude Code", and say so on camera at this beat.

**Do.**

1. Extensions view (`Ctrl+Shift+X`), type `Claude Code`, click **Install** on the extension
   published by **Anthropic**.
2. Open its panel from the Activity Bar icon that appears.
3. If it asks you to sign in, **switch OBS to the `Privacy` scene** first, complete the
   sign-in, then switch back.

**Say.** "You still need an AI agent living inside VS Code to run the sessions. I'm using
Claude Code; Codex and Gemini Code Assist work the same way. Everywhere the main walkthrough
says 'paste it into Copilot', I'll be pasting into this panel instead. That's the only
difference."

**See.** The Claude Code panel is open beside the editor and accepts typing at its prompt — no
sign-in banner and no error.

**If this fails on camera.** If the panel still shows a sign-in prompt, the login did not
complete; finish it off camera and re-record the beat. Do not continue with an unauthenticated
panel — every session beat from scene 4 onward depends on it.

---

## Beat 6 — Install and authenticate the GitHub CLI *(Part 1 step 5)*

**Do.** Install the GitHub CLI from [cli.github.com](https://cli.github.com), then:

```bash
gh auth login
gh auth status
```

Run `gh auth login` with **OBS switched to the `Privacy` scene**.

**Say.** "One more — the GitHub CLI, so Dabbler can open pull requests without a browser trip.
It's optional; without it you just finish the pull request in a browser tab."

**See.** `gh auth status` prints `Logged in to github.com account <your-handle>` and a
`Token scopes:` line. **Never use `--show-token`.**

---

## Beat 7 — Close the scene *(Part 1, framing)* — **CUT**

**Do.** Clear the terminal.

**Say.** "Tools installed, keys in place, agent ready. Next: the repository."

**See.** A clean terminal, and no credential anywhere in the scrollback.

> **Before you publish:** scrub back through this take at speed and check the terminal
> scrollback in every frame. This is the take to check twice.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1 | Part 1 opening framing |
| 2 | Part 1 step 2 |
| 3 | Part 1 steps 1 and 3 |
| 4–5 | Part 1's *Variant — direct provider API keys instead of a Copilot seat* callout |
| 6 | Part 1 step 5 |
| 7 | Part 1 close |

Part 1 step 4 (the Copilot CLI: install, sign-in, version check, smoke test) is **deliberately
skipped** — the tutorial's own variant callout says to skip it. That is the whole point of
this take, not an omission.
