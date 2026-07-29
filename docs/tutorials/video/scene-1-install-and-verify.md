# Scene 1 — Install and verify the tools

Covers [`hello-world.md`](../hello-world.md) **Part 1**.
Alternate take: [`scene-1-alt-direct-api.md`](scene-1-alt-direct-api.md) replaces this whole
scene for viewers using direct provider API keys instead of a Copilot seat.

**Finished length:** ~6 minutes.

## Scene goal

The viewer ends with four tools installed and *proven working on camera*: VS Code, the
Dabbler extension, Python, and the GitHub Copilot CLI — plus the GitHub CLI so Dabbler can
open pull requests. Nothing here is a Dabbler action yet; this is the floor everything else
stands on.

## Starting state

- A machine with VS Code installed and **no folder open** (the VS Code welcome screen).
- The Dabbler AI Orchestration extension **not yet installed** — you install it on camera.
- Python already on `PATH`. Installing Python is out of scope for the video; if `python
  --version` fails, stop and fix it off camera.
- A GitHub account with an **active Copilot seat**, **not yet signed in** on this machine's
  Copilot CLI.
- Focus Assist / Do Not Disturb on. OBS scene: `Editor`.

---

## Beat 1 — Open on the goal *(Part 1, framing)*

**Do.** VS Code welcome screen, nothing else on screen.

**Say.** "In about an hour we're going to build a small program, two modules, written by AI
sessions, reviewed by a person, shipped through a real pull request gate on GitHub. First,
four tools. This part is just installing and proving they work — if you already have them,
skip ahead."

**See.** The VS Code welcome screen with no **Recent** entries visible.

---

## Beat 2 — Install the Dabbler extension *(Part 1 step 2)*

**Do.** Open the Extensions view (`Ctrl+Shift+X`), type `Dabbler AI Orchestration`, click
**Install** on the result published by **DarndestDabbler**.

**Say.** "The extension is on the VS Code Marketplace — Dabbler AI Orchestration. It adds a
Work Explorer and a set of commands that automate the mechanical git around AI sessions."

**See.** The extension page shows **Uninstall** instead of **Install**, and a new icon
appears in the Activity Bar on the left. Read the **version** on that page out loud.

> **Recording precondition: the Marketplace must show 0.46.0 or newer.** Scene 3 and scene 4
> depend on the scaffolded `CODEOWNERS` and `monorepo-ci.yml` templates re-cut in extension
> **0.46.0**; on an earlier version, scene 4 beat 13's "add two steps" edit will not match the
> file on screen. **Do not record this scene until the Marketplace is at 0.46.0 or newer** —
> the whole point of the video is a path a viewer can follow, and a local build is not one.
> Check the version on the extension page before you press record, not during the take.

---

## Beat 3 — Check VS Code and Python *(Part 1 steps 1 and 3)*

**Do.** Open a terminal inside VS Code — **Terminal > New Terminal** — and run, one at a time:

```bash
code --version
python --version
```

**Say.** "VS Code 1.85 or newer, and Python 3.10 or newer. Dabbler builds a virtual
environment for you in a moment, so this is the only Python you have to install yourself."

**See.** `code --version` prints three lines; the **first** is the VS Code version and must be
**1.85.0 or higher**. `python --version` prints a line like `Python 3.12.4`, and the number
must be **3.10 or higher**.

**If this fails on camera.** `python` not found, or a 3.9-or-lower version, is a stop. Cut
the recording, install Python off camera, and start the scene again — every later scene
assumes a working `python`. If `code` is not found, the shell command was not installed:
Command Palette > **Shell Command: Install 'code' command in PATH**, then re-run.

---

## Beat 4 — Install the GitHub Copilot CLI *(Part 1 step 4)*

**Do.** In the same terminal:

```bash
winget install GitHub.Copilot
```

**Say.** "This is the AI agent that will actually run the sessions. On Windows it installs
with winget and it's self-contained — no Node needed. On macOS or Linux you'd install it
from npm instead, `npm install -g @github/copilot`, and that one does need Node 22 or newer."

**See.** winget reports `Successfully installed`.

**If this fails on camera.** If winget reports the package is already installed, say so and
move on — that is a pass, not a failure. If winget itself is missing, cut; this scene cannot
be recorded without it on Windows.

---

## Beat 5 — Sign in to the Copilot CLI *(Part 1 step 4)*

**Do.** Run `copilot` with no arguments and follow the sign-in prompt it shows. **Switch OBS
to a scene that hides the device code**, or blur it in post — do not leave it legible.

**Say.** "Running `copilot` on its own the first time walks you through signing in. You need
an active Copilot seat on the account you sign in with."

**See.** The CLI reaches its interactive prompt without an authentication error. Type `/exit`
to leave it.

**If this fails on camera.** If you see `No authentication information found`, the sign-in
did not complete — re-run `copilot` and finish the browser step before continuing. Nothing
later in the video works without this.

---

## Beat 6 — Check the version, and say what to do when it drifts *(Part 1 step 4)*

**Do.** Run:

```bash
copilot --version
```

**Say.** "Note the version. The Copilot CLI updates itself, and Dabbler pins the version it
last probed your seat with, so routed calls fail closed rather than quietly changing
behaviour underneath you. When your version moves past the pin — and it will — you re-probe
with the command **Dabbler: Set Up Copilot Seat**. That command needs the virtual environment
we create in part three, so it's a note for later, not something to do now."

**See.** A line beginning `GitHub Copilot CLI ` followed by a version number.

---

## Beat 7 — Prove a real AI call works *(Part 1 step 4)*

**Do.** Run the smoke test exactly as the tutorial prints it:

```bash
copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6
```

**Say.** "One real call, to prove the seat works end to end before we depend on it. Pi to ten
places."

**See.** π printed to ten decimal places — `3.1415926536` — and the command exits without an
error.

**If this fails on camera.** `No authentication information found` means beat 5 did not
complete — go back and finish it. An error naming the model means your seat does not expose
`claude-sonnet-4.6`; pick another model your seat offers and say so on camera, because every
later scene uses whatever you name here.

---

## Beat 8 — Install and authenticate the GitHub CLI *(Part 1 step 5)*

**Do.** Install the GitHub CLI from [cli.github.com](https://cli.github.com), then run, one
at a time:

```bash
gh auth login
gh auth status
```

Run `gh auth login` with **OBS on a scene that hides the device code**.

**Say.** "Last one — the GitHub CLI. Dabbler uses it to open pull requests for you without a
trip to the browser. Everything still works without it; you just finish the pull request in
a browser tab instead."

**See.** `gh auth status` prints `Logged in to github.com account <your-handle>` and a line
reading `Token scopes:`. **Do not show the token itself** — `gh auth status` does not print
it by default, so do not add `--show-token`.

---

## Beat 9 — Close the scene *(Part 1, framing)* — **CUT**

**Do.** Clear the terminal.

**Say.** "Four tools, all proven working. Next: the repository."

**See.** A clean terminal.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1 | Part 1 opening framing |
| 2 | Part 1 step 2 |
| 3 | Part 1 steps 1 and 3 |
| 4–7 | Part 1 step 4, including the CLI-version-drift callout |
| 8 | Part 1 step 5 |
| 9 | Part 1 close |

The tutorial's **direct provider API keys** variant callout is not performed here — it is
[`scene-1-alt-direct-api.md`](scene-1-alt-direct-api.md).
