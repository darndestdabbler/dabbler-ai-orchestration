# The shim that ships, walked

**Session 160, 2026-09-13.** The `dabbler` command inside the VSIX, driven
the way an operator reaches it before 2.4.1 was published: the artifact this
tree builds, installed into a VS Code as a VSIX, a real integrated terminal
typing `dabbler version`, a session started and its first instruction
answered with the command exactly as the framework printed it, and the
Configuration section's catalog refresh, which runs the same file in a
terminal of its own.

It is the walk that sessions 158 and 159 did not take. Both drove the
extension in a running editor from `--extensionDevelopmentPath`, which loads
the extension bundle, dist/extension.js, and never the bundle beside it, and both closed VERIFIED
while every VSIX since 2.3.0 shipped a `dabbler.cjs` that died on its first
require. The build now runs the file it wrote before `vsce package` sees it;
this walk is the reading that the shipped artifact, installed the way a
developer installs it, runs the verbs the protocol prints.

## What was walked

- **The crash, first**, through the operator's own installed 2.4.0 shim, so
  the "before" is a measurement and not a story.
- **The VSIX this tree packaged**, `dabbler-ai-orchestration-2.4.1.vsix`,
  installed with `code --install-extension` into a fresh extensions
  directory of the harness's own VS Code binary. Not a development host: the
  file the extension activates from is the one inside the VSIX.
- **The shim at activation** — the two launchers the extension writes into
  its global storage, read back, with the paths they bake in.
- **A real integrated terminal.** The command palette opened a PowerShell
  terminal; `dabbler version` was typed into it, and what it printed and
  what `Get-Command dabbler` resolved to were written to files, because an
  xterm renders to a canvas that Playwright cannot read.
- **Bootstrap, start, next, report, next, options and status through the
  shim**, in a scratch repository with a bare local origin, each command run
  as `dabbler <verb>` with the shim directory first on `PATH` — the
  resolution a terminal does, from a shell the walk could read. The answer
  command was run exactly as `next` printed it, with only its placeholder
  filled.
- **Update the Catalog from the Configuration row**, which is the one
  action in the section that opens a terminal on the bundled router rather
  than calling it in-process, with the custom dialog style so the
  confirmation could be clicked.

## What was NOT walked, and why

- **The operator's own editor.** The VSIX was installed into a scratch
  extensions directory and a scratch user data directory of the harness's
  Code binary, with `HOME`, `APPDATA` and `LOCALAPPDATA` scoped to a
  temporary root. Nothing here rewrote the operator's shim, catalog,
  preferences or extensions; their 2.4.0 install is what the "before"
  reading ran. Their editor picks the fix up from the Marketplace like every
  other seat.
- **Start Unattended Session.** It spawns the same `dabbler.cjs` this walk
  ran through the shim, so the file is proved; what it does after the spawn
  is the driver, walked in sessions 130 through 158.
- **`auth set` from the pane.** It goes through the same terminal seam as
  the catalog refresh and then asks for a key with the echo off; the seam is
  what this walk needed to see run, and the refresh runs it without a
  prompt.
- **macOS and Linux.** One machine, and it runs Windows. The POSIX launcher
  was read back and is the same two lines it has always been; the `.cmd`
  launcher is the one that changed nothing and was run.
- **A verification round in the scratch session.** The session was started,
  declared and issued its first work step; it was left in flight in a
  directory under `D:\tmp` and the directory discarded. Verification spends
  a seat and proves nothing about the shim.

## This machine

Windows 11 Pro 10.0.26200 · Node 25.8.1 · VS Code 1.137.0 (the harness's own
install under `.vscode-test`, and the operator's, same version) · router
2.4.1 as built from this tree · PowerShell 7.6.5 · GitHub Copilot CLI 1.0.83
on `PATH`, and the Claude CLI beside it.

## The readings

**1. The 2.4.0 shim crashes on `version`, as the sample said.** The
operator's installed launcher, run from a shell:

    Error: Cannot find module './impl/format'
    Require stack:
    - c:\Users\...\.vscode\extensions\darndestdabbler.dabbler-ai-orchestration-2.4.0\dist\dabbler.cjs

The stack is Node's module loader, before any verb runs. Note the exit: the
`.cmd` launcher returns `%ERRORLEVEL%`, and the crash is exit 1 — which is
the exit the pre-commit hook let through until this session.

**2. The build refuses to hand over a bundle that does not run.** The
extension's build now ends by running `node dist/dabbler.cjs version` and
prints what it answered:

    built D:\...\tools\dabbler-ai-orchestration\dist\dabbler.cjs: dabbler-ai-router 2.4.1
    dabbler-ai-orchestration 2.4.1 (extension)

A non-zero exit there is a build failure with the child's output, before
`vsce package`. The `--watch` path is unchanged: it writes bundles as files
change and nothing packages those.

**3. The VSIX installs and the extension activates from it.**
`code --install-extension dabbler-ai-orchestration-2.4.1.vsix` into a fresh
`--extensions-dir` → *"Extension 'dabbler-ai-orchestration-2.4.1.vsix' was
successfully installed."* The directory holds one entry,
`darndestdabbler.dabbler-ai-orchestration-2.4.1`, and clicking the Dabbler
icon in a window on an empty repository activated it: the Solution Explorer
drew its first-run text and a *Set Up New Project* button, and a toast said
the workspace had no sessions yet.

**4. Activation writes both launchers, and they point into the VSIX.** In
the scratch user data directory's global storage, the file bin\dabbler.cmd:

    @echo off
    setlocal
    set "ELECTRON_RUN_AS_NODE=1"
    "…\vscode-win32-x64-archive-1.137.0\Code.exe" "…\darndestdabbler.dabbler-ai-orchestration-2.4.1\dist\dabbler.cjs" %*
    exit /b %ERRORLEVEL%

and bin\dabbler, the POSIX one, with the same two paths in forward
slashes. The interpreter is the editor that was launched and the command is
the file inside the installed extension: nothing on the machine had to be
installed for either.

**5. A VS Code terminal runs `dabbler version` through the shim.** Typed
into the PowerShell terminal the palette opened:

    dabbler version 2>&1 | Out-File -Encoding utf8 '…/terminal-version.txt'
    (Get-Command dabbler).Source | Out-File -Encoding utf8 '…/terminal-where.txt'

The first file:

    dabbler-ai-router 2.4.1
    dabbler-ai-orchestration 2.4.1 (extension)

The second: the `bin\dabbler.cmd` under the scratch global storage — so the
terminal's `PATH` carried the prepend and the name resolved to the
extension's launcher, not to anything else on the machine.

**6. `dabbler bootstrap --remote <bare origin>` through the shim, exit 0.**
Eighteen lines, the same ones a checkout gets: the managed sections in the
three instruction files, `.dabbler/` ignored, the round refspecs, the commit
guard installed, `dabbler.yaml`, the module manifest and the two scaffolded
sessions, and the push that set master to track the origin. It ends with
the discovery note that no catalog exists at the scoped `LOCALAPPDATA` path
and names `dabbler discovery refresh` — which is the next reading.

**7. Update the Catalog opens its terminal on the bundled router, and the
router writes the record.** After *Refresh Work Explorer*, the Solution
Explorer showed the repository and a Configuration node. Its context menu
offered exactly one entry, *Update the Catalog*. The dialog said what the
refresh costs — *Nothing.* — and that it runs `dabbler discovery refresh`
in a terminal, where you can watch it. Clicking *Refresh* opened a second
terminal, and under the scoped `LOCALAPPDATA` a file appeared:

    "written_by": "dabbler-ai-router 2.4.1",
    "written_at": "2026-09-13T10:05:57Z",
    "source": "acp-session-new",
    "source_version": "GitHub Copilot CLI 1.0.83.",

with the seat's models under it. The window's environment carries no
provider key, so the api block was not read from that terminal; the seat
block is the reading that proves the verb ran to its end. The tree then
repainted: *Reviewing AI copilot-cli · gpt-5.6-terra*, both reviewer models
resolved, where a moment earlier every model row said *nothing resolves*.

**8. `dabbler session start` through the shim, exit 0.** It pulled from
the bare origin, re-read the seat block (26 models, free) and the api block
(196 models, this shell holds the keys), and registered session 001.

**9. `dabbler session next` prints the plan instruction with its
answer_command.** Seq 1, `step_id` `plan`, the scaffolded session 1 between
the markers, and:

    dabbler session report --sessions-dir docs/sessions --seq 1 --answer-file <path to the JSON you wrote>

**10. The printed answer_command runs as printed.** With the one
placeholder filled — `.dabbler/scratch/plan.json`, a one-step plan — and
nothing else changed:

    report: session 001 seq 1 answered; work plan (1 step(s), releasable=no) written to .dabbler/runs/s1/driver/plan.json; the driver reads it next.

The next `next` accepted the plan, declared the session and issued seq 2,
the work step, with its own report command. That is the loop the protocol
describes, and in the sample no line of it could be run as printed.

**11. `dabbler configuration options` and `dabbler status` through the
shim, exit 0.** Options listed the authoring vehicle as `claude-code` with
`copilot` beside it and the reviewing vehicle `copilot-cli` with
`gpt-5.6-terra`; status showed session 1 current, 2 total, nothing stalled.

## Found

**Fixed in this session, before the walk.** The bundle (step 1) and the hook
(step 2) — the walk is the acceptance of both, and reading 1 is the
measurement they answer.

**Found and not fixed here, because this release is the shim alone:**

- **A machine with two engine CLIs reads "Vehicle none installed" in the
  pane.** Reading 7's tree said *Authoring AI not read · Vehicle none
  installed · Model not chosen* before and after the refresh, while reading
  11, from the same launcher under the same allowlisted environment, listed
  `claude-code` and `copilot` as both installed. The tree renders a null
  choice with the words "none installed" whatever the reason for the null,
  and where two CLIs are on `PATH` the router leaves the choice to a person
  rather than defaulting — so the one machine most likely to have both, a
  developer's, is told it has neither. The wording is
  `tools/dabbler-ai-orchestration/src/providers/solutionTreeModel.ts`'s, one
  ternary; it belongs in the next plan, not in a patch that ships one fix.
- **The refresh's terminal is labelled "Code".** The terminal `runVerb`
  creates is named after the record, but the tab shows the shell process,
  which is `Code.exe` running as Node. The dialog told the operator to watch
  a terminal; the tab they must find is the one called *Code*. Cosmetic, and
  a matter of the terminal's title setting rather than the extension's;
  recorded so the sample's next walk does not report it as a mystery.

## What is left on disk

Under this tree: `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.4.1.vsix`,
gitignored, and the rebuilt `dist/`. The scratch user data, extensions and
state directories under the system temp, and `D:\tmp\walk-160`, are the
walk's and hold no key: the terminal that wrote the catalog had none, and
the shell that ran `session start` read them from the environment and wrote
none. The operator's editor, shim, catalog, preferences and extensions were
not touched.
