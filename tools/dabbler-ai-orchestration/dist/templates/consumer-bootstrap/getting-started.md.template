# Getting Started

> Step-by-step instructions for setting up a Dabbler AI-led-workflow
> project. The interactive controls live in the **Session Set
> Explorer**'s Getting Started form (the Dabbler icon in the Activity
> Bar) — this document is the static companion that explains each
> step. The copy is the operator's teaching text (Set 060 D8), lifted
> from the design mockup.

## 1. Scaffold Project Structure

To get the project started, the AI orchestration extension needs to
download some Python scripts and markdown files and create some
folders. There are two options for the orchestration. Choose an
option and then click **Build project structure**.

**Full tier.** The full tier uses an AI router to "outsource" much of
the work via AI APIs. By outsourcing most of the work, you pay more
money but you are less subject to AI capacity limitations. Also,
assuming that you have set up accounts with multiple AI engines, each
session is automatically cross-verified with a different AI engine
than the one that did the development work.

The AI router requires that you have accounts with at least one API
(should be a different provider from the one that you use for your
sessions) and that your provider-issued account keys are stored in Dabbler-named
environment variables (`DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY`, or
`DABBLER_GEMINI_API_KEY`). These are the same keys you get from Anthropic,
Google, or OpenAI; only the environment variable names are Dabbler-prefixed to
avoid collisions with provider-owned tools. For more information on setting up the accounts
and environment variables, see the tier model documentation:
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>.

**Lightweight tier.** The lightweight tier does not outsource any AI
work. It is better suited to users who can't (or don't want to)
spend extra money on projects and who are OK with some workarounds
for verifying AI output.

## 2. Create/Import Project Plan

To know *what* to build and *how* to build it, the AI orchestration
needs a project plan. Typically, you work interactively with an AI
engine (either within Visual Studio Code or elsewhere) to build a
markdown file with the project's objectives, assumptions, solution
features (scope), design constraints ... etc.

The project plan must be named `project-plan.md` and must be placed
in `{project root}/docs/planning`. If you already have one, use
**Import project-plan.md** in the form; if you don't, use **Copy
prompt for planning** and paste the prompt into an AI chat to author
one.

## 3. Decompose Plan Into Session Sets

To ensure that AI agents work incrementally toward a solution and
have seamless continuity across chat sessions, a project plan is
broken down into session sets. Each session set has a `spec.md` file
that describes what will be done in each session.

For the full tier option, work within each session is automatically
cross-verified with a different provider. For the lightweight tier
option, each session set has some follow-on sessions for
cross-provider verification.

Note that the AI orchestration does support parallel session sets
(but not parallel sessions within the same set). If you would like
for the AI engine to look for opportunities for parallel session
sets, check the **Create parallel session sets where possible** box.
Parallel session sets use git worktrees: each parallel set works in
its own worktree and is merged back to the main branch when the sets
complete.

## 4. Start the First Session

After you have done steps 1–3 above, you can start using the AI
orchestration. To get things started, **right-click** on the session
set with prefix `001-` and choose **Copy Prompt > Start Next
Session**. Then open an AI chat window from within VS Code, paste
(CTRL-V) your prompt, and press ENTER.

You will repeat the above process for each session within each
session set.

Note that you can use the same AI engine or different AI engines for
each session. For the lightweight tier, you are asked to use a
different AI engine for verification sessions.

Also, sometimes the AI orchestration will recommend use of a more
capable (but more expensive) or less capable (and less expensive) AI
engine for certain sessions. The recommendations are not foolproof.
When in doubt, it is better to stick with a more capable AI engine.

Especially for larger projects, you will often need to create new
session sets and/or cancel session sets that are no longer needed.
The AI orchestration can help you with this. Just tell it what you
want to do in the chat window.

## 5. Trust But Verify

Although AI is the engine behind the development, *you* are in the
driver's seat. You have the ability to review each `spec.md` file
(just left-click on the session set) and review the work that was
done. If you don't understand what the AI engine is doing, ask it to
explain it to you. If it gives you choices that you don't
understand, ask it to clarify the options. If you don't trust the
direction you are headed, stop and get input from other AI engines
and/or ask for recommendations with rationale.

When discussing nuclear disarmament treaties with the Soviet Union
in the 1980s, Ronald Reagan famously used the phrase "trust but
verify." With AI orchestration, this is a sound philosophy. *Trust*
that — with clear instructions, sufficient time, and proper
testing — an AI engine will eventually produce what you need;
however, *verify* the output — with other AI engines and with your
own inspection — so that the AI engine produces a usable solution
that meets your expectations without overengineering.

## Troubleshooting

### Python must be installed first

**Build project structure** creates a *virtual environment* (`.venv/`),
not a standalone Python. A virtual environment still depends on a base
Python interpreter being installed on the machine — `.venv/pyvenv.cfg`
points back at it (e.g. `home = C:\Python311`), and the venv borrows
that install's runtime and standard library. So Python **does** need to
be installed on every machine, even though the venv is created for you.

- Install Python from <https://www.python.org/downloads/> (tick *Add
  python.exe to PATH*). Avoid the Microsoft Store build — its app-
  execution-alias redirection causes separate virtual-environment
  headaches. The extension's Python check also deliberately skips that
  alias, so the "Python was not found" warning can appear even when
  typing `python` in a terminal seems to do something.
- If Python is installed but not on `PATH`, point the
  `dabblerSessionSets.pythonPath` setting at the interpreter
  (e.g. `C:\Python311\python.exe`); the scaffold uses it to build
  the venv.

### `.venv\Scripts\` has the `.exe` files but no `activate` scripts

On managed / corporate laptops, endpoint-security software (antivirus,
EDR, DLP) often **quarantines freshly-written, unsigned script files** —
exactly `Activate.ps1`, `activate`, `activate.bat`, and
`deactivate.bat`. The `python.exe` / `pip.exe` files are code-signed by
the Python Software Foundation, so they pass; the generated activate
scripts get stripped right after the venv is created. This is why the
same scaffold works on a personal machine but loses the activate scripts
on a work machine.

**This does not break anything.** Nothing in this workflow needs
`activate`. The extension and the AI router always call the interpreter
by its full path (`.venv\Scripts\python.exe -m …`). The `activate`
scripts are only a terminal convenience for shortening `python`. As long
as `python.exe` and `pip.exe` landed in `.venv\Scripts\`, the install and
the router work normally.

To confirm it's the security software, check the endpoint's quarantine
log for `Activate.ps1` / `activate.bat` under the `.venv\Scripts\` path
right after building. If you need the activate scripts back, ask IT to
allow-list the project's `.venv\Scripts\` directory.

### `.venv\Scripts\activate` fails with "running scripts is disabled"

On a fresh Windows install, PowerShell's default execution policy
(`Restricted`) blocks `Activate.ps1`:

```
.venv\Scripts\Activate.ps1 cannot be loaded because running scripts
is disabled on this system.
```

Either skip activation entirely and call Python by full path
(`.venv\Scripts\python.exe -m …`), or allow local scripts for your user
account (no admin needed):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
