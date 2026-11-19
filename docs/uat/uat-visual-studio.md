# UAT: the Visual Studio extension

What this page covers: installing the Visual Studio extension built from
`tools/dabbler-visual-studio/`, proving it reaches the router with
**Tools > Dabbler: Version**, the sentence it shows when Node is missing,
what Windows Terminal does with the tabs the later sessions open in it,
what Visual Studio does when an engine edits files under a solution it
has open, and what it does with Dabbler Layout's window arrangements.

Nothing here is published. The extension is built from this checkout.

## 1. Build the .vsix

From the repository root, in PowerShell:

```powershell
npm ci
npm run build -w dabbler-ai-router
npm run compile -w dabbler-ai-orchestration
$msbuild = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
& $msbuild dabbler-visual-studio.slnx /restore /t:Build /p:Configuration=Release /nologo /v:minimal /nodeReuse:false
```

**Expect** a last line ending in
`tools\dabbler-visual-studio\Dabbler.VisualStudio\bin\Release\net472\Dabbler.VisualStudio.vsix`.
The router has to be built first, and then the VS Code extension's copy of
it: the .vsix carries `tools/dabbler-ai-orchestration/dist/dabbler.cjs`,
with the `package.json`, `router-config.yaml`, `schemas/` and
`prompt-templates/` beside it, under `router/`, and the build fails
without them. That copy has the router's dependencies bundled in; the
router's own `packages/router/dist/dabbler.cjs` does not, and runs only
where a `node_modules` holds them.

`/nodeReuse:false` matters: without it MSBuild leaves a node running, and
the installer below waits on that `MSBuild.exe` as if it were Visual
Studio.

## 2. Install it

Close every Visual Studio window, then:

```powershell
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath
& "$vs\Common7\IDE\VSIXInstaller.exe" (Resolve-Path tools\dabbler-visual-studio\Dabbler.VisualStudio\bin\Release\net472\Dabbler.VisualStudio.vsix)
```

**Expect** the installer to offer "Dabbler AI Orchestration" for each
Visual Studio 2022 (17.14 or later) and 2026 installed, and to finish with
"Install complete". Double-clicking the .vsix does the same.

To take it off again:

```powershell
& "$vs\Common7\IDE\VSIXInstaller.exe" /uninstall:DarndestDabbler.DabblerAiOrchestration.VisualStudio
```

## 3. Dabbler: Version

1. Start Visual Studio. No solution needs to be open.
2. Open **Tools** and choose **Dabbler: Version**.

**Expect** a message box titled "Dabbler" that reads:

```
dabbler-ai-router 3.36.0
```

(the VS Code extension's terminal adds a line for itself; the bundle run
here has no extension beside it). Then open **View > Output** and choose
**Dabbler Commands** in "Show output from". **Expect**, with the time it
ran:

```
[1:23:45 AM] Running:
dabbler version
  dabbler-ai-router 3.36.0
```

The command has a line of its own so it can be copied and run.

## 4. Dabbler: Version with no Node

Visual Studio reads PATH when it starts, so the way to see this is to
start it with Node taken off PATH. Close Visual Studio, then:

```powershell
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -and -not (Test-Path (Join-Path $_ 'node.exe')) }) -join ';'
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath
& "$vs\Common7\IDE\devenv.exe"
```

Choose **Tools > Dabbler: Version**. **Expect** a warning that reads:

> Dabbler needs Node.js 22.18 or later and Node.js was not found on PATH:
> install Node.js 22.18 or later from https://nodejs.org, then restart
> Visual Studio, which reads PATH only when it starts.

and nothing in **Dabbler Commands**. An older Node names its version in
place of "Node.js was not found on PATH". Close that Visual Studio when
done: it is the only one started without Node.

## 5. Windows Terminal: what session 351 can rely on

Tried by hand on 2026-11-18 on Windows 11 Pro 10.0.26200, Windows Terminal
1.25.3131.0, settings untouched (`closeOnExit` is `automatic`). The probe
folder was `C:\temp\wt-probe`, and `probe.cmd` there writes
`set DABBLER_WT_PROBE` to the file it is given, so it reports the
variable as the tab's own process sees it.

### A tab in a window named for Dabbler

```powershell
$env:DABBLER_WT_PROBE = 'first'
wt -w Dabbler new-tab -d C:\temp\wt-probe --title probe1 cmd /k "echo %DABBLER_WT_PROBE%> env1.txt && echo %CD%> cwd1.txt"
```

With no Windows Terminal window open, this opened one window holding one
tab titled `probe1`; `cwd1.txt` read `C:\temp\wt-probe`. Every later
`wt -w Dabbler new-tab ...` call added a tab to that same window: the
count of Windows Terminal windows stayed at 1 across eight calls. So
`-w Dabbler` both finds the window and opens it when it is not there, and
`-d` sets the tab's folder.

### The environment of a tab added to an open window

**The tab gets the environment of the process that ran `wt`, whole, even
when the window was already open.** Three calls into the open window:

```powershell
$env:DABBLER_WT_PROBE = 'sixth'
wt -w Dabbler new-tab -d C:\temp\wt-probe --title probe6 cmd /k ".\probe.cmd script6.txt && echo [%DABBLER_WT_PROBE%]> echo6.txt"
$env:DABBLER_WT_PROBE = 'seventh'
wt -w Dabbler new-tab -d C:\temp\wt-probe --title probe7 cmd /k ".\probe.cmd script7.txt && echo [%DABBLER_WT_PROBE%]> echo7.txt"
Remove-Item Env:DABBLER_WT_PROBE
wt -w Dabbler new-tab -d C:\temp\wt-probe --title probe8 cmd /k ".\probe.cmd script8.txt 2>&1 & set DABBLER_WT_PROBE > set8.txt 2>&1"
```

| File | Read | What it shows |
| --- | --- | --- |
| `script6.txt` | `DABBLER_WT_PROBE=sixth` | the caller's value reached the tab's process |
| `script7.txt` | `DABBLER_WT_PROBE=seventh` | and again after it changed |
| `set8.txt` | `Environment variable DABBLER_WT_PROBE  not defined` | a variable the caller dropped is gone, although the window was opened with it: nothing is merged |
| `echo6.txt`, `echo7.txt` | `[first]` | **the trap**: see below |

**The trap: never write `%NAME%` into the command line.** Windows
Terminal expands `%NAME%` in the command line itself, against the window's
own environment -- the one the window was opened with by the first call --
before the tab's process starts. That is why `echo6.txt` and `echo7.txt`
read `[first]` while the process beside them saw `sixth` and `seventh`.
A variable the window does not have is left as written, and the tab's
`cmd` expands it from the passed environment, which is why a variable new
to the second caller seemed to arrive while a changed one did not.

**The form session 351 uses:** set the variables on the process that runs
`wt.exe` (its `ProcessStartInfo` environment, with `UseShellExecute`
false) and name no variable in the command line. Nothing else is needed:

```
wt.exe -w Dabbler new-tab -d <repository folder> --title <session> <program> <arguments>
```

Two forms that also set a variable inside the tab, should a later version
of Windows Terminal stop passing the environment:

```powershell
# cmd: works, but a value with a space or a quote did not survive the
# quoting from PowerShell through wt to cmd (probe 3 wrote nothing).
wt -w Dabbler new-tab -d C:\temp\wt-probe --title probe4 cmd /k ".\probe.cmd plain4.txt && set DABBLER_WT_PROBE=third&& .\probe.cmd env4.txt"

# PowerShell with -EncodedCommand: no quoting reaches wt at all.
$ps = '$env:DABBLER_WT_PROBE = ''fifth value; with a semicolon & an ampersand''; & .\probe.cmd env5.txt'
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($ps))
wt -w Dabbler new-tab -d C:\temp\wt-probe --title probe5 powershell -NoExit -NoProfile -EncodedCommand $enc
```

`env4.txt` read `DABBLER_WT_PROBE=third` and `env5.txt` read
`DABBLER_WT_PROBE=fifth value; with a semicolon & an ampersand`. A bare
`;` in a `wt` command line separates `wt` subcommands, so a command
holding one must be encoded as above or escaped as `\;`.

`.\probe.cmd` rather than `probe.cmd`: the shell these probes ran from
sets `NoDefaultCurrentDirectoryInExePath=1`, the tab inherited it, and
`cmd` then does not look in the current folder. A tab started from Visual
Studio inherits Visual Studio's environment instead, and a launcher that
names its program by full path does not depend on either.

### When Windows Terminal is not installed

`wt.exe` is an app execution alias in
`%LOCALAPPDATA%\Microsoft\WindowsApps`. Started from .NET with that
folder off PATH:

```powershell
$env:PATH = 'C:\Windows\System32;C:\Windows'
$si = [Diagnostics.ProcessStartInfo]::new('wt.exe', '-w Dabbler new-tab'); $si.UseShellExecute = $false
[Diagnostics.Process]::Start($si)
```

it failed with `Win32Exception`, NativeErrorCode 2, "The system cannot
find the file specified". That exception is how the launcher knows, and
it then starts the program in a console window of its own:

```powershell
$env:DABBLER_WT_PROBE = 'console'
Start-Process -FilePath cmd.exe -ArgumentList '/k', '.\probe.cmd console9.txt' -WorkingDirectory C:\temp\wt-probe
```

`console9.txt` read `DABBLER_WT_PROBE=console`: a console window gets the
environment of the process that started it. From Visual Studio the same
is a `ProcessStartInfo` for the program with `UseShellExecute` false: a
console program started from a process with no console of its own is
given a new console window.

Where it opens is Windows' choice, by the Windows 11 "Default terminal
application" setting. On this machine that is "Let Windows decide", and
with Windows Terminal installed the console above opened as a **separate,
unnamed Windows Terminal window**, not a tab in the Dabbler one.

**With no Windows Terminal installed** the console host is the only
terminal Windows has, so the fallback opens in it. Windows Terminal could
not be uninstalled here, nor Windows Sandbox started (it is not enabled on
this machine), so the default terminal was set to the console host for
this user for one launch -- the same two values the Settings page writes
when "Windows Console Host" is chosen -- and removed again straight after:

```powershell
$key = 'HKCU:\Console\%%Startup'; $conhost = '{B23D10C0-E52E-411E-9D5B-C09FDF709C7D}'
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
New-ItemProperty -Path $key -Name DelegationConsole -Value $conhost -PropertyType String -Force | Out-Null
New-ItemProperty -Path $key -Name DelegationTerminal -Value $conhost -PropertyType String -Force | Out-Null
$env:DABBLER_WT_PROBE = 'conhost'
Start-Process -FilePath cmd.exe -ArgumentList '/k', 'title probe10 & .\probe.cmd console10.txt' -WorkingDirectory C:\temp\wt-probe
# afterwards, back to "Let Windows decide":
Remove-ItemProperty -Path $key -Name DelegationConsole, DelegationTerminal
```

The new window was a classic console window -- window class
`ConsoleWindowClass`, titled `probe10`, beside the two Windows Terminal
windows (`CASCADIA_HOSTING_WINDOW_CLASS`) already open -- and
`console10.txt` read `DABBLER_WT_PROBE=conhost`. So on a machine without
Windows Terminal: starting `wt.exe` fails with NativeErrorCode 2, the
engine is started directly with its environment on the `ProcessStartInfo`,
and it opens in a console window of its own with that environment. There
is no window to add tabs to, so each session's engine gets a window of
its own.

## 6. An engine edits files under an open solution, from outside Visual Studio

A session's engine writes the same files Visual Studio has open, and it
writes them from outside Visual Studio. Start Session asks first where a
document has unsaved changes, the debugger is running or a build is in
progress. It offers Save All and Go On, Go On Anyway and Not Now, and it
stops and closes nothing. This section covers what Visual Studio itself
does once the engine has written, and which of its own options decide it.

### What this machine's Visual Studio is set to

Visual Studio Community 2026 (18.12), instance `18.0_61d713b8`. These
values were read from that instance's own settings file,
`%LOCALAPPDATA%\Microsoft\VisualStudio\18.0_61d713b8\Settings\CurrentSettings.vssettings`,
which Visual Studio last wrote on 2026-11-11:

| Tools > Options | Setting | This machine |
| --- | --- | --- |
| Environment > Documents | Detect when file is changed outside the environment (`DetectFileChangesOutsideIDE`) | on |
| Environment > Documents | Reload modified files unless there are unsaved changes (`AutoloadExternalChanges`) | on |
| Environment > Documents | Check for consistent line endings on load (`CheckForConsistentLineEndings`) | on |
| Projects and Solutions > Build and Run | Before building (`OnRunOrPreview`) | `0`, Save all changes |

To read them again, close Visual Studio so that it writes the file, then:

```powershell
Select-String -Path "$env:LOCALAPPDATA\Microsoft\VisualStudio\18.0_*\Settings\CurrentSettings.vssettings" `
  -Pattern 'name="(DetectFileChangesOutsideIDE|AutoloadExternalChanges|CheckForConsistentLineEndings|OnRunOrPreview)">[^<]*' -AllMatches |
  ForEach-Object { $_.Matches.Value }
```

### What was seen

Tried on 2026-11-18 with those settings, untouched. The probe was
`C:\temp\vs-probe\Probe.sln`, opened in Visual Studio, holding two
projects:

- `ProbeSdk`, an SDK-style project (`<Project Sdk="Microsoft.NET.Sdk">`)
  with `Program.cs`;
- `ProbeOld`, an old-style project (`ToolsVersion="15.0"`, .NET Framework
  4.7.2, `<Compile Include="Class1.cs" />`).

Both `.cs` files were open in the editor. Each change below was written
from outside Visual Studio, the way an engine writes, and then Visual
Studio's window was brought to the front. The prompts' words and buttons
were read with UI Automation and checked on a screenshot.

| What changed outside | What Visual Studio did |
| --- | --- |
| `Program.cs`, open with no unsaved changes | Reloaded it without asking: the editor showed the new line at once. |
| `Program.cs` again, with a CRLF line appended to a file that used LF | After the silent reload, a dialog titled **Inconsistent Line Endings**: *"The line endings in the following file are not consistent. Do you want to normalize the line endings?"*, with the file's path, a **Line ending** list set to `Windows (CR LF)`, **Yes**, **No**, and an **Always show this dialog** box. It came back each time the file was loaded again, including when the old-style project was reloaded. |
| `ProbeSdk.csproj` (a property added) | Nothing appeared: no dialog and no bar. The project stayed loaded. |
| `ProbeOld.csproj` (a property added) | A dialog titled **File Modification Detected**: *"The project 'ProbeOld' has been modified outside the environment. Press Reload to load the updated project from disk. Press Reload All after all external changes and operations are complete to reload all items from disk. Press Ignore to ignore the external changes. The changes will be used the next time you open the project."*, with **Reload**, **Reload All**, **Ignore** and **Ignore All**. It appeared with *Reload modified files unless there are unsaved changes* on, so that setting does not cover old-style project files. |
| `Class1.cs`, with unsaved changes typed in the editor | A dialog titled **Microsoft Visual Studio**: the file's path, then *"The file has unsaved changes inside this editor and has been changed externally. Do you want to reload it and lose the changes made in the source editor?"*, with **Yes**, **Yes to All**, **No** and **No to All**. |

### What a developer should set, and what to answer

- **An open document the engine changes, and you have not changed.**
  With *Detect when file is changed outside the environment* and *Reload
  modified files unless there are unsaved changes* both on, as here, the
  document reloads silently. That is the setting to keep. The probe did
  not try them turned off.
- **An open document the engine changes while you have unsaved changes
  in it.** The reload question appears, and no setting answers it for
  you. **Yes** drops your edits. **No** keeps them, and your next save
  overwrites the engine's work. Save All and Go On, offered before a
  start, is how to avoid this question.
- **A project file the engine changes.** An SDK-style project needs
  nothing. An old-style project asks **File Modification Detected** every
  time, and this probe found no Tools > Options setting that quiets it.
  Answer **Reload All** when the session has finished writing. **Ignore**
  keeps the project as Visual Studio last read it, so a build in Visual
  Studio does not see the engine's change until the solution is opened
  again.
- **Inconsistent Line Endings** appears where an engine writes line
  endings unlike the rest of the file. To quiet it, clear *Always show
  this dialog* in the dialog itself, or turn off *Check for consistent
  line endings on load* under Environment > Documents. A repository whose
  `.gitattributes` or `.editorconfig` settles line endings stops it at
  the source. **No** leaves the file as the engine wrote it.
- **Before building: Save all changes** (`0`, as here) means a build
  you start in Visual Studio saves every open document first. So a build
  started while the engine is working writes your unsaved editor contents
  over anything the engine wrote to the same files. Start Session's
  question names a build in progress for the same reason.

## 7. The walk: a session in Visual Studio on an old-style solution

Walked on 2026-11-18 by session 360, to decide whether the extension is
published. A developer's day was the yardstick: Visual Studio open on a
.NET Framework solution, the engine in Windows Terminal beside it, and
nothing else.

### The machine as found

| What | This machine |
| --- | --- |
| Windows | Windows 11 Pro 10.0.26200 |
| Visual Studio | Visual Studio 2026, Community edition, 18.12 (`18.12.12405.243`), instance `18.0_61d713b8`; no Visual Studio 2022 |
| Node | 25.8.1, `C:\Program Files\nodejs` |
| Windows Terminal | 1.25.3131.0, settings untouched |
| git | 2.51.0.windows.2 |
| The solution | the ContosoUniversity fork of the maintenance walk (`darndestdabbler/ContosoUniversity`, cloned at `C:\temp\s310-contosouniversity`), commit `e968946`, `src\ContosoUniversity.sln` |
| Its projects | `ContosoUniversity` (ASP.NET MVC 5, .NET Framework 4.8.1), `IntegrationTests` (4.8.1, Fixie 1), `DBDeployment` (4.8); all old-style (`ToolsVersion` 15.0 and 12.0, `<Compile Include>` items) |
| Dabbler in it | already set up by the maintenance walk: `dabbler.yaml` with `posture: maintenance`, sessions 1 to 4 closed under 3.31.0, a session 5 planned and not started |

**VS Code stayed running.** This walk was driven from a Claude Code
session that runs inside VS Code, so VS Code could not be closed without
ending the walk. What closing it stands for was done instead: Visual
Studio was started with the environment Explorer gives a new program --
this machine's and this user's variables read fresh, so the API keys and
Claude Code's own login variable were there -- and with VS Code's folders
taken off PATH (its `bin` and the VS Code extension's `dabbler` shim,
which that extension adds to the user's PATH), so nothing it started could
reach VS Code's copy of the router.

**Start Visual Studio from the Start menu or Explorer, never from an
engine's terminal.** Started from one, it inherits the variable that
terminal carries to say an engine is at work (`DABBLER_ENGINE_TERMINAL`,
or `CLAUDECODE`), and the router then takes every click in Visual Studio
for an engine's: Start Session's **Commit and Push** was refused with
*"`session start --commit-changes` is a person's verb, never the
engine's"*. The walk met this by starting Visual Studio from its own
shell, and restarted it as above.

### Installing

The .vsix built by section 1 was installed with the installer's own
window, as a developer double-clicking it would. It offered **Visual
Studio Community 2026** checked, showed *Digital Signature: None*, and
asked for nothing else. The first try found the build's own
`MSBuild.exe` node still running and waited on it under *"There are open
instances of Visual Studio"*, offering **End Tasks**; that is why
section 1 now builds with `/nodeReuse:false`. With the node gone it
finished with *Install Complete*.

### Opening the solution

`src\ContosoUniversity.sln` opened with no prompt and no information bar:
Visual Studio restored the documents the solution had open, and the Git
Changes window showed `master` with nothing to commit. **Tools** carried
**Dabbler: Version**; **View > Other Windows** carried the Dabbler Work
Explorer, Configuration and Terminal.

**Found at once, and fixed here: the installed extension could not run its
router.** The first **Dabbler: Version** showed Node's own error in the
message box -- `Error: Cannot find module 'yaml'`, from
`...\Extensions\<folder>\router\dabbler.cjs`. The .vsix carried the
router's npm bundle, which leaves `yaml`, `ajv` and `smol-toml` to a
`node_modules` and finds its data by the `package.json` above it. Built and
run inside this checkout, both were found in the repository, so every
earlier session saw it work; installed, neither exists. The .vsix now
carries the copy the VS Code extension ships, built to be dropped
anywhere (see section 1), and `.github/workflows/test.yml` builds it before
the extension. After reinstalling, **Dabbler: Version** read
`dabbler-ai-router 3.36.0`.

### Set Up, on a solution Dabbler has never seen

The fork already had Dabbler, so Set Up was walked on a throwaway local
clone of it at `5c4e4ec`, its last commit before Dabbler arrived, with no
remote, opened in a second Visual Studio. Its Work Explorer said *"This
repository is not set up for Dabbler yet"* and offered **Set Up Dabbler
in This Solution**. One click wrote and committed the same five files the
maintenance walk's bootstrap wrote (`.gitignore`, `AGENTS.md`,
`CLAUDE.md`, `dabbler.yaml`, `docs/sessions/session-plan.md`): the
maintenance posture, the Fixie suite and the MSBuild compile control
were all read from the solution. Visual Studio raised no prompt; the
Work Explorer turned to *"2 planned · nothing has run here yet"*, and a
dialog said *"Dabbler is set up in this solution, and committed"* with
**Start Session 1** and **Later**.

### Choosing the models

The Configuration window listed every choice as *machine default*.
Right-clicking **Authoring Model** offered **Set the Authoring Model** and
**Keep as Machine Default**; the first opened a list of the Anthropic
models this machine's catalog holds, with the current one marked *what
you chose*. Choosing `claude-sonnet-5-5` wrote `.vscode/settings.json`
in the fork, committed it as `Configure authoringModel` and pushed it, and
the row turned to *"claude-sonnet-5-5 (anthropic) · this repository"*.
The reviewers were left as they were: `gpt-5.6-terra` (OpenAI) as the
Primary Reviewer and `gemini-3.8-flash` (Google) as the Auxiliary.

A Visual Studio solution now carries a `.vscode` folder. Visual Studio
shows nothing of it, because it belongs to no project, but a developer
reading the commit will ask what it is.

### A session, from start to close

The walk added two sessions to the fork's `session-plan.md` ahead of the
LocalDB session already planned there: 5, a percentage page with its
test, and 6, a step whose check fails on purpose (below). The plan was
open in Visual Studio with nothing unsaved, and Visual Studio reloaded it
without asking; the Work Explorer turned to `4/7` with both new sessions
under **Not Started**.

**Start Session** on session 5's row said *"You can't start a session
while there are new or changed files that haven't been committed:
docs/sessions/session-plan.md"* with **Commit and Push**, **Undo the
Changes** and **Close**. **Commit and Push** committed the plan as
`Commit changes made before session 5 started`, pushed it, registered the
session and opened Windows Terminal with Claude Code on Sonnet 5.5, its
first instruction already typed, auto mode on.

Claude Code's own questions came first in that tab: *"Is this a project
you created or one you trust?"* for the checkout, answered **Yes, I trust
this folder**, and, the first time, *"Not logged in · run /login"* --
because the walk had started Visual Studio without the user's
`CLAUDE_CODE_OAUTH_TOKEN`. Both are the engine's, answered where the
engine is.

**Closing the engine's tab mid-session has one way back, and it is not
on the session's row.** After that tab was closed, session 5's row
offered Cancel Session, Rollback to Start of This Session, Consult with
AI, Stop Session and Open a Mechanic -- nothing that reopens the engine.
The repository's row did: its **Start Session** re-registers the session
in flight, which is how a session continues, and it opened a new tab on
session 5 where the record stood. A developer looks on the session's row
first.

From there the session ran without a person. Its own times, from its run
record: the plan at 12:08:13, accepted 26 seconds later; work 12:08 to
12:09 (three steps: the `Percentage` class, the
page, the tests), cross-provider verification 12:09 to 12:11, the run of
record and the close by 12:11:22. Verdict **VERIFIED** with one nit;
landed as `700daa4`, closed as `5ea50c9`, transcript `a23bf8f`. The run of
record's Fixie suite was 5 passed and 1 failed: `CreateTests`, the
failure the maintenance walk recorded before any change, which does not
hold a close here.

What Visual Studio did meanwhile:

| When | What Visual Studio showed |
| --- | --- |
| The engine added `Compile` and `Content` items to `ContosoUniversity.csproj` | **File Modification Detected** for the project `ContosoUniversity`, the first time Visual Studio's window was brought forward. It is modal: until it is answered, the Work Explorer and the Dabbler Terminal behind it can be read and not used. **Reload All** cleared it, and it did not come back for the rest of the session. |
| The session closed | An information bar across the editor: *"Dabbler: session 005 is closed."* with **Show in Work Explorer**. The Dabbler Terminal carried the close's own lines; the Work Explorer moved session 5 under **Complete**, `5/7`. |
| After the close | **Build Solution** in Visual Studio: 0 failures, `Features\Percentage\Percentage.cs` in the project. |

No lock: nothing the framework built while Visual Studio had the solution
open failed on a file Visual Studio held, and Visual Studio's own build
afterwards found nothing held by the framework. The engine's Windows
Terminal tab stays open after the close, with the engine idle in it; it is
closed by hand.

**Leaving Visual Studio.** Other than to answer the engine in its tab,
the walk did not have to leave Visual Studio for this session: set-up,
the model, the commit of the plan, the start, the restart, watching and
the close were all in it.

**Compare With Its Start** on session 5's row listed the eleven files the
session changed, *"from 77dccce6 (before its first commit) to 5ea50c98
(its last)"*, each marked added or changed, with a box to narrow the
list. Choosing the web project's `ContosoUniversity.csproj` opened
Visual Studio's own comparison window: two changes, the new `Compile`
items.

**Fixed here: a screen reader read every row as a class name.** The Work
Explorer's and the Configuration window's rows were named
`Dabbler.VisualStudio.Core.WorkExplorerNode` to UI Automation, which is
what a screen reader says, because WPF names a tree item by its data's
`ToString`. Both node types now say their label and description
(`WorkExplorerTree.cs`, `ConfigurationTree.cs`, a test for each).

### A stop, read, checked and rolled back

Session 6 in the fork was planned to fail: one step adds a test that
`Percentage.Of(1, 3)` is `33.34` (it is `33.33`), declares the Fixie run as
its check, and tells the engine to change neither the code nor the
expected value and to report the step blocked. It was started from its
own row with **Start Session**, which asked nothing this time (the plan
was committed), and Windows Terminal opened a tab on it.

It went as planned in two minutes: the plan at 12:15, the check failing,
and at 12:16 the engine reported the step blocked. The framework called
the Mechanic once on that stop by itself; it made no change. In Visual
Studio, with nothing touched:

- **A warning bar across the editor:** *"Dabbler: session 006 is paused
  (blocked) -- the engine reported step 'failing-percentage-test'
  blocked: ..."*, with **Show in Work Explorer**.
- **The Work Explorer:** session 6 under **In Progress**, its row's text
  beginning *"You: the engine reported step ... blocked"*, so whose move
  it is reads first, and its Work phase open on the step.
- **The Dabbler Terminal:** the failed check's own lines (`5 passed, 2
  failed`, naming `PercentageTests.OfRoundsUp`) and the stop's ways on --
  clear the blocker and carry on, open a Mechanic, roll back, or cancel.

Session 6's menu then held **Check this stop**, **Review exception** and
**Report this stop to Dabbler** beside Rollback, Stop, Cancel, Consult with
AI and Open a Mechanic.

**Check this stop** asked first -- *"This is one provider call: a model
that is not the author's reads the record and says whose the stop is ...
It is advice only"* -- and on **Check this stop** the call ran, its
answer recorded at 12:20:49, within a minute. The Work Explorer then said *"Check this stop: its
answer is in the Dabbler Session pane of the Output window"*, and that pane
held it: *"triage: plan-defect · adviser: gpt-5.6-terra (openai); excluded
anthropic"*, the reasoning (the test is meant to make Fixie fail, and the
same Fixie run is the step's passing check), and a check amendment that
accepts Fixie's exit code 2, marked *"It RELAXES A GATE. The framework
will not apply it; a person decides, on the record."* The advice is
right: the plan contradicted itself, on purpose.

**Review exception refused a stop its own menu offered it on.** It ran
`session waive` to show the card, and the router answered *"waive:
refused -- a 'blocked' stop has nothing to go past; its own ways on are
the ones it printed."* A waiver goes past a gate; a blocked step has no
gate to go past. The menu item is the router's (the VS Code extension
offers it on the same row), and it is offered on every standing stop
because the Work Explorer's rows say who a stop waits on and not what
kind of stop it is.

**Rollback to Start of This Session** ran the dry run and asked *"Roll
back to the start of session 6 ...?"*: *"Session 6 is undone: uncommitted
work is kept on a safety branch; the session returns to not-started. The
session plan is kept."*, with **Report, Then Roll Back**, **Roll Back** and
**Keep**. **Roll Back** committed *"Roll back to the start of session 6 of
sessions"* and pushed it, kept the step's work on
`dabbler/rolled-back/s6-2026-11-18T17-25-04-396Z`, and moved session 6
back under **Not Started**, all in under ten seconds.

**Fixed here: the rollback's result was said as JSON.** The Work
Explorer's bar showed the router's printed result word for word,
`{"session": 6, "through": 6, "status": "not-started", "anchor": ...,
"reverted": 0}`. It now says what the VS Code extension says, *"Rolled
back to the start of session 6; amend the plan, then Start Session."*
(`RollbackAsk.Done`, tested in `RollbackAskTests.cs`).

**The editor's warning bar outlived the stop.** *"session 006 is paused
(blocked)"* stayed across the editor after the rollback, until closed by
hand. An information bar stays until it is closed; VS Code's
notification of the same thing fades.

**Leaving Visual Studio.** None: reading the stop, checking it and rolling
it back were all done in Visual Studio. The engine's tab was not needed
after the stop -- the engine says, rightly, that a rollback is the
person's -- and was closed by hand.

Session 6 was left planned and not started, ahead of the fork's LocalDB
session: cancelling it is a person's verb, and this walk left it to the
fork's owner.

### What the walk found

Each finding, and what became of it. *Fixed here* names the files
changed in session 360; *planned* names the session that takes it
before the release; *a limit* is one the guide written in session 362
states, because no change to Dabbler removes it.

| # | Finding | What became of it |
| --- | --- | --- |
| 1 | The installed extension could not run its router: `Cannot find module 'yaml'` on the first command. | Fixed here: the .vsix carries the VS Code extension's self-contained copy (`Dabbler.VisualStudio.csproj`), built first in CI (`.github/workflows/test.yml`); section 1 says to build it. |
| 2 | The installer waited on an `MSBuild.exe` node the build left running, as if it were Visual Studio. | A limit: section 1 builds with `/nodeReuse:false`. |
| 3 | A screen reader read every Work Explorer and Configuration row as a class name. | Fixed here: `WorkExplorerTree.cs`, `ConfigurationTree.cs`, a test in each one's test file. |
| 4 | A rollback's result was said as the router's JSON. | Fixed here: `RollbackAsk.cs` (`Done`, tested in `RollbackAskTests.cs`), used by `LifecycleActions.cs`. |
| 5 | Review exception is offered on a `blocked` stop, and `session waive` refuses it. | Planned: session 361, step 1. It is the router's, so the VS Code extension shows the same. |
| 6 | With the engine's tab closed mid-session, the session's own row had no way back to it; the repository row's Start Session did. | Planned: session 361, step 2. |
| 7 | The editor's *"session N is paused"* bar stayed after the stop was gone. | Planned: session 361, step 3. |
| 8 | An old-style project the engine changes raises **File Modification Detected**, a modal dialog, while the session works. | A limit (section 6): answer **Reload All**; it is Visual Studio's own prompt and no option quiets it. |
| 9 | The engine's Windows Terminal tab stays open, idle, after its session closes. | A limit: close it by hand. The extension starts the tab and has no hold on it afterwards. |
| 10 | Choosing a model writes `.vscode/settings.json` into a Visual Studio solution, and commits it. | A limit: it is where a repository's choices are kept for every interface; Visual Studio does not show it. |
| 11 | Visual Studio started from an engine's terminal takes every click for the engine's, and Start Session's **Commit and Push** is refused. | A limit: start Visual Studio from the Start menu or Explorer. |
| 12 | Claude Code asks whether to trust the folder, and to log in, in its own tab the first time. | A limit: the engine's own questions, answered in its tab. |
| 13 | The Configuration window's bar ran the router's three `configure:` lines together into one. | A limit: words only, and all of them there. |
| 14 | The Dabbler Terminal showed a `SESSION 005` heading above session 4's history as well as below it. | A limit: words only; noted for whoever next works on the terminal's lines. |

Nothing found stops a developer from setting up, choosing models,
starting, watching, closing, reading a stop, checking it and rolling it
back, all from Visual Studio, once finding 1's fix is in the package.

## 8. Visual Studio 2022, and walks on other machines

**This machine has Visual Studio 2026 only** (18.12), so Visual Studio
2022 has not been walked. The manifest installs on 17.14 and later, but
**the listing claims Visual Studio 2022 only once someone has walked it
on a machine that has it**; until then it claims 2026. A walk on another
developer's machine is also the better test of everything above, which
was walked by the person who built it, on the machine it was built on.

Ask two developers who work in Visual Studio -- one of them on Visual
Studio 2022 17.14 or later -- to do this on their own machines.

**What they need first.** Node.js 22.18 or later; Windows Terminal; an
engine CLI they are logged in to (Claude Code, or the GitHub Copilot CLI);
the three reviewer keys as user environment variables
(`DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY`,
`DABBLER_GEMINI_API_KEY`); the .NET Framework 4.8.1 Developer Pack; and
`Dabbler.VisualStudio.vsix` from the operator, built by section 1. VS Code
need not be installed, and is better not running.

**The solution.** Their own copy of the walk's fork, with a remote of
their own, so nothing the sessions commit and push leaves their machine:

```powershell
git clone --bare https://github.com/darndestdabbler/ContosoUniversity.git C:\dabbler-walk\origin.git
git clone C:\dabbler-walk\origin.git C:\dabbler-walk\ContosoUniversity
```

A developer who has a solution of their own with old-style projects, and
a throwaway copy of it, may walk that instead as well: it is the better
test, and section 7 says what to look for.

**What to walk,** starting Visual Studio from the Start menu:

1. Install the .vsix by double-clicking it (section 2), then
   **Tools > Dabbler: Version** (section 3).
2. Open `C:\dabbler-walk\ContosoUniversity\src\ContosoUniversity.sln`, and
   open the Dabbler Work Explorer, Configuration and Terminal from **View >
   Other Windows**. Choose an authoring model in Configuration.
3. **The stop first.** The fork's next session is 6, which fails on
   purpose. Start it from its row, wait for the stop, then from Visual
   Studio: read it, **Check this stop**, and **Rollback to Start of This
   Session**, as section 7's *A stop, read, checked and rolled back* did.
   Then **Cancel Session** on session 6, with any reason.
4. **A whole session.** Add a session of your own to
   `docs/sessions/session-plan.md`, ahead of session 7, that adds a small
   page with its test (session 5's text in the same file is the pattern),
   save it, and **Start Session** on it. Take it to its close from Visual
   Studio, with the solution open throughout, and then **Compare With Its
   Start** on its row.

**What to send back,** in one message:

- Visual Studio's edition and version (**Help > About Microsoft Visual
  Studio**), and Windows', Node's and the engine CLI's versions.
- At each numbered step: every dialog or bar Visual Studio or Dabbler
  showed, with its words and the button chosen; every time they had to
  leave Visual Studio for anything other than answering the engine in its
  tab, and why; anything that waited on a lock or said a file was in use.
- How long each session took, start to close.
- `git log --oneline -10` of their copy at the end.
- One sentence: would they use this for their own work, and if not, what
  stops them.

Visual Studio 2022 joins the listing's claim when one of these walks on
it comes back with nothing that stops a developer; anything that does is
a finding like those in section 7, planned before the release that would
claim it.

## 9. Window layouts: what Visual Studio 2026 will do

Tried on 2026-11-19 in Visual Studio Community 2026 18.12.12405.243, before
Dabbler Layout was written, to settle two questions: whether
`EnvDTE.WindowConfigurations` still records an arrangement and puts it
back (its documentation is for Visual Studio 2015, and round 30's two
advisors disagreed), and which call docks a window on the right.

**How.** A second Visual Studio with a profile of its own, so the
developer's own layouts were never touched, opened on a scratch folder so
its main window was showing (behind the start window, nothing is drawn):

```powershell
& "C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\devenv.exe" /rootsuffix DabblerProbe C:\scratch\probe-folder
```

It was driven from Windows PowerShell 5.1 (`-STA`) through a small C# class
compiled with `Add-Type`, referencing `envdte.dll` and
`Microsoft.VisualStudio.Interop.dll` from `Common7\IDE\PublicAssemblies`
(EnvDTE's types are forwarded to the second), and finding that instance's
`DTE` in the running object table as `!VisualStudio.DTE.18.0:<process id>`.
PowerShell's own late binding of the same object returned empty
properties, and `Marshal.GetActiveObject` would have taken whichever
Visual Studio registered first; the compiled class was the reliable way.
Windows were watched through Solution Explorer, Output, Properties and
Error List, each window's `Visible`, `IsFloating`, `Left`, `Top`, `Width`
and `Height`, and a screenshot of the main window.

### What each call did

| Call | What it did |
| --- | --- |
| `WindowConfigurations` before anything | Three: `Design` (active), `Debug`, `NoToolWin`. A developer's own saved layouts are not among them. |
| `WindowConfigurations.Add("Dabbler before layout")` | Recorded the current arrangement as a fourth configuration. `Design` stayed active. |
| Hiding Properties and Error List, then `Item("Dabbler before layout").Apply(true)` | Both came back, at their sizes and places. The record became the active configuration. |
| `Item("Design").Update()`, `Item("Design").Apply(true)`, then `Item("Dabbler before layout").Delete()` | Every window where it was before the record was made, to the pixel; three configurations again, `Design` active. |
| `Delete()` of the record while it is the active one | Visual Studio re-applied `Design` -- which had taken in every change made while it was active, so the windows went back to the moved arrangement, not the recorded one. |
| `Window.ApplyWindowLayout1`, before, while a record existed, and after | Not available throughout: the record never became one of the layouts **Window > Apply Window Layout** lists. |
| A docked window's `LinkedWindowFrame.LinkedWindows.Add(Output)` | Refused: *"targetView is not a valid target for docking"* (the frame is the main window). |
| `Windows.CreateLinkedWindowFrame(Solution Explorer, Output, tabbed)` | Made a new **floating** frame holding both. |
| That frame's `IsFloating = false` | Refused: *"The IsFloating property cannot be set or retrieved on this type of window."* |
| Each window's own `IsFloating = false` | Each went back to where it was last docked: Solution Explorer on the right, Output at the bottom. |

### What the layout builds on

- **An arrangement can be recorded and put back exactly**, without writing
  into the developer's saved layouts. The active configuration is live --
  it takes in whatever is moved while it is active -- so the way back is
  four calls in this order: apply the record, update the configuration
  that was active when the record was made with what is now showing,
  apply that configuration, and delete the record. Deleting the record
  while it is still active is the one order that loses the arrangement.
- **No call docks a window somewhere new in a profile that has already
  placed it.** Visual Studio remembers each tool window's place; the only
  thing that chooses a new one is the package's `ProvideToolWindow`
  registration, read the first time a profile shows that window. So the
  Dabbler Terminal is registered on the right, under the Solution
  Explorer, and under a window identity of its own that no profile has
  placed yet -- a profile that put the earlier one under Output would
  otherwise keep it there. After its first showing it stays wherever the
  developer leaves it, as any window does.
- **Debugging is Visual Studio's own switch** between `Design` and `Debug`,
  and the record is never the active configuration except inside the way
  back, so starting and stopping a debugger should not touch Dabbler
  Layout. That is a reading of the calls above, not yet a walk: the
  layout's own walk, section 10, starts and stops a debugger under it.

## 10. Dabbler Layout, with a debugger under it

### What was tried on 2026-11-19

The build of session 371 was installed into the section 9 instance only
(`VSIXInstaller.exe /quiet /rootSuffix:DabblerProbe <the .vsix>`, then
`devenv /rootsuffix DabblerProbe /updateconfiguration`, since a fresh
install registered no command until that), and driven by its commands
through the same DTE: `ExecuteCommand("Dabbler.Layout")`, and
`Debugger.Go` on a console project that sleeps 20 seconds.

| Move | What Visual Studio showed |
| --- | --- |
| Before | Solution Explorer on the right, Output at the bottom; three window configurations. |
| **Dabbler: Layout** | The Work Explorer in front of the Solution Explorer's tab group, with a toolbar carrying the layout button; the Dabbler Terminal docked under it on the right; Output unmoved. A fourth configuration, *Dabbler: before the layout, over Design*. |
| **Dabbler: Layout** again | The Solution Explorer in front again, both Dabbler windows gone, every other window where it was; three configurations. |
| **Dabbler: Layout**, then the debugger started | Visual Studio made `Debug` active: the Dabbler windows were not shown while it ran. |
| The program ended | `Design` active again, the Work Explorer and the Dabbler Terminal back where the layout put them. Dabbler did nothing on either change. |
| **Dabbler: Layout** again | The arrangement from before the layout, and *Diagnostic Tools* added as an auto-hidden tab on the right edge: Visual Studio opened that window during the debug run, and the record, made before it existed, does not move it. |

No engine was running in that instance, so the engine's tab coming to
the front was not seen there.

### The walk, for a person

On a solution with Dabbler set up and a session that can be started,
with the extension installed from section 1's build:

1. Note where your windows are. **Tools > Options > Dabbler > Engine**:
   *Open engines in* says **Visual Studio**, and *Apply the Dabbler
   layout when a session starts* is **False**.
2. **Start Session** on the session's row. **Expect** an Engine tab in
   the editor area, in front, and no other window moved or shown: the
   Dabbler Terminal is not brought up.
3. Press **Ctrl+Shift+Alt+L**. **Expect** the Work Explorer beside the
   Solution Explorer, the engine's tab in front, and the Dabbler Terminal
   on the right, under the Solution Explorer -- on a machine where an
   earlier version put it under Output, too, since it is a new window to
   Visual Studio.
4. Start your own project under the debugger (**F5**), let it run a
   moment, and stop it (**Shift+F5**). **Expect** Visual Studio's
   debugging arrangement while it runs, and the Dabbler layout back when
   it stops, with nothing from Dabbler on either.
5. Press the Work Explorer toolbar's layout button. **Expect** your
   windows as they were at step 1, the engine's tab still open, and the
   engine still working in it.
6. Turn *Apply the Dabbler layout when a session starts* to **True**,
   close the engine's tab, and **Continue Session** on the row. **Expect**
   the tab back, attached to the same engine, and the layout applied.
   Press **Ctrl+Shift+Alt+L** to put your windows back.
7. Turn the option back to **False**.

Send back what each step showed where it differs from **Expect**, and a
screenshot after steps 3 and 5.

## What was not walked

- Visual Studio 2022: this machine has only Visual Studio 2026. See
  section 8.
- Fixes 3 and 4 were tested in the library; the walk did not reinstall
  the extension to see them in Visual Studio.
- Start Session's question before a start (unsaved documents, a running
  debugger, a build in progress): nothing was unsaved, debugging or
  building at either start, so the question did not come up.
- A waiver: the walk's stop was `blocked`, which nothing waives. A stop
  that can be waived (a failed suite, a verification refused) was not
  produced.
- Stop Session, Consult with AI, Open a Mechanic, Report this stop to
  Dabbler, Restore, Close Session, and Set Up's **Start Session 1**.
- Section 6's Tools > Options settings turned off one by one.
- Visual Studio started with VS Code uninstalled: VS Code ran throughout,
  kept out of Visual Studio's environment instead.
- Installing from the Visual Studio Marketplace: nothing is published.
- Section 10's walk by a person, with a session's engine in its tab: the
  layout, its way back and a debugger run were tried in an isolated
  instance with no engine running.

Publish: the walk found nothing that stops a developer once session 361 lands, and the listing claims Visual Studio 2026 only.
