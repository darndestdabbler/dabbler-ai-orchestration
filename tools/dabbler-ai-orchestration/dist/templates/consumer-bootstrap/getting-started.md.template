# Getting Started

> Step-by-step instructions for setting up a Dabbler AI-led-workflow
> project. The interactive controls live in the **Work Explorer**'s
> two-section Getting Started form (the Dabbler icon in the Activity
> Bar) — this document is the static companion that explains each
> step. The copy is the operator's teaching text (Set 060 D8; re-cut
> for the module-first Work Explorer in Set 095).

## 1. Scaffold Project Structure

To get the project started, the AI orchestration extension needs to
download some Python scripts and markdown files and create some
folders. There are two options for the orchestration. Choose an
option and then click **Build project structure**.

**Full tier.** The full tier uses an AI router to "outsource" much of
the work via AI APIs. By outsourcing most of the work, you pay more
money but you are less subject to AI capacity limitations. The full
tier needs access to more than one AI provider family, so the Step 6
verification command can send work done under one provider to a
different one.

There are two ways to give the router that access. The default is
**direct provider API keys**: you have an account with at least one
provider (it should be a different provider from the one that runs
your sessions) and your provider-issued keys are stored in
Dabbler-named environment variables (`DABBLER_ANTHROPIC_API_KEY`,
`DABBLER_OPENAI_API_KEY`, or `DABBLER_GEMINI_API_KEY`). These are the
same keys you get from Anthropic, Google, or OpenAI; only the
environment variable names are Dabbler-prefixed to avoid collisions
with provider-owned tools. The alternative, for users whose only AI
access is a GitHub Copilot subscription, is the **GitHub Copilot CLI
seat** option in the form: calls run through the `copilot`
command-line tool instead, and no provider API keys are needed — but
the GitHub Copilot CLI must be installed on your machine. When you
pick the Copilot option, the Build step configures and checks the
seat automatically: it confirms the seat can dispatch models from at
least two different provider families, and tells you honestly if it
cannot (some enterprise-managed seats expose only one). One thing to
know when running sessions on a Copilot seat: because a seat can relay
any provider's model, each session must name its model
(`start_session --model …`) so verification can pick a genuinely
different provider — the orchestrator docs cover this and the tool
refuses a Copilot start without it. Before you run sessions on a
Copilot seat, work through the one-time per-machine setup checklist
(install the CLI, log in to your tenant, run the auth-preflight):
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/copilot-seat-setup-checklist.md>
— an unauthenticated seat is blocked at session start rather than
silently faking verification. For more
information on either option, see the tier model documentation:
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>.

**Lightweight tier.** The lightweight tier does not outsource any AI
work. It is better suited to users who can't (or don't want to)
spend extra money on projects and who are OK with some workarounds
for verifying AI output.

## 2. Define Modules (Optional)

If your project is split across areas or teams — say two developers
each own a service — you can declare **modules** in
`docs/modules.yaml`, and the Work Explorer groups your session sets
by module. The form's second section, **Define modules (optional)**,
has two buttons: **Open modules.yaml** creates the file from a
commented template (only on that explicit click — the extension
never writes it just because you opened the repo) and opens it to
edit; **Copy AI decomposition prompt** copies a ready-made prompt
that has your AI assistant fill the file in for you. Save the file
when it's filled in.

Solo or single-area projects can skip this entirely — your work
stays under one default group. Two rules to know if you do use
modules: session-set names stay globally unique across ALL modules,
and `module` is just a grouping label, never part of a set's
identity. For a hands-on team tutorial (three people, three modules,
CODEOWNERS, monorepo CI, tags), see
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/module-team-hello-world.md>;
its companion — a reusable AI review prompt that coaches your team on
the same workflow afterward — is
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/module-team-hello-world-review-prompt.md>.

## 3. Create the Project Plan and First Session Set

To know *what* to build and *how* to build it, the AI orchestration
needs a **project plan** — a markdown file with the project's
objectives, assumptions, solution features (scope), design
constraints ... etc. — which is then **decomposed into session
sets**, each with a `spec.md` describing what each work session will
do.

The Getting Started form shows only while the repo has no session
sets yet; the Work Explorer switches to its tree view the moment the
first session set exists. So the *first* plan and session set are
created from the **Command Palette** (Ctrl+Shift+P), which works
while the form is still up:

1. **`Dabbler: Import Project Plan`** — import a plan file you
   already have (if you declared modules, it first asks which module
   the plan belongs to). Don't have one? Ask your AI assistant in
   chat to draft it with you and save it — `docs/planning/project-plan.md`
   for a plain project, or the module's own plan path (e.g.
   `docs/modules/<slug>/project-plan.md`) if you declared modules.
2. **`Dabbler: Generate Session-Set Prompt`** — copies a
   decomposition prompt (module-aware when modules are declared).
   Paste it into your AI chat; the AI writes the session-set folders
   under `docs/session-sets/`, which you review and save.

Saving the first set flips the Explorer from the form to the tree.
From then on, the same actions are one click away on each module's
row in the tree (**AI Plan**, **Import Plan…**, **Open Plan**,
**AI Sets**) — that's how you add more plans and sets later.

For the full tier option, every session runs the router's `verify_session`
command for cross-provider verification before it closes — verification is
mandatory, not optional. For the lightweight tier option, each session set
has some follow-on sessions for cross-provider verification.

Note that the AI orchestration does support parallel session sets
(but not parallel sessions within the same set). Parallel session
sets use git worktrees: each parallel set works in its own worktree
and is merged back to the main branch when the sets complete. The
normal decomposition keeps sets sequential via `prerequisites:`; when
you deliberately want a parallel decomposition, use the
**`Dabbler: Generate Parallel Session-Set Prompt (advanced)`**
command from the Command Palette.

## 4. Start the First Session

After steps 1–3 above, you can start using the AI orchestration.
**Left-click** the session set with prefix `001-` in the Work
Explorer: its spec opens, and the starter line — ``Start the next
session of `001-...`.`` — is copied to your clipboard. Open an AI
chat window from within VS Code, paste (CTRL-V), and press ENTER.
(The same prompt is also on the row's right-click menu under
**Copy Eval**.)

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

### "The GitHub Copilot CLI was not found on this machine"

The **GitHub Copilot CLI seat** option in step 1 runs AI calls through
the `copilot` command-line tool, which is a separate install from the
Copilot features inside VS Code — having Copilot chat in your editor
does *not* mean the CLI is installed. If you pick the seat option and
see this warning:

- Install the GitHub Copilot CLI (see the Copilot CLI guide at
  <https://docs.github.com/copilot>) and make sure the `copilot`
  command is on your `PATH`, **or** point the
  `dabblerSessionSets.copilotCliPath` setting at the installed
  executable. If that setting is set, it decides alone — a wrong path
  there makes the CLI count as missing even when `copilot` works in a
  terminal.
- Then reload the VS Code window (changes made after launch are not
  visible until you reload).

If seat setup later fails even though the CLI is present (for example,
your seat confirms models from only one AI provider family), the
message you see explains the specific cause and gives the exact
command to re-run just the seat check — the project scaffold itself is
already complete, and you never need to re-run **Build project
structure** for this. The per-machine setup checklist walks the whole
chain (install, tenant login, auth-preflight) if you need it:
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/copilot-seat-setup-checklist.md>.

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
