# UAT: the Visual Studio extension

What this page covers: installing the Visual Studio extension built from
`tools/dabbler-visual-studio/`, proving it reaches the router with
**Tools > Dabbler: Version**, the sentence it shows when Node is missing,
what Windows Terminal does with the tabs the later sessions open in it,
and what Visual Studio does when an engine edits files under a solution it
has open.

Nothing here is published. The extension is built from this checkout.

## 1. Build the .vsix

From the repository root, in PowerShell:

```powershell
npm ci
npm run build -w dabbler-ai-router
$msbuild = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
& $msbuild dabbler-visual-studio.slnx /restore /t:Build /p:Configuration=Release /nologo /v:minimal
```

**Expect** a last line ending in
`tools\dabbler-visual-studio\Dabbler.VisualStudio\bin\Release\net472\Dabbler.VisualStudio.vsix`.
The router has to be built first: the .vsix carries `packages/router/dist/dabbler.cjs`
as `router/dabbler.cjs`, and the build fails without it.

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

## What was not walked

- Visual Studio 2022: this machine has only Visual Studio Community 2026
  (18.12). The manifest claims 17.14 and later; session 360 walks what it
  can and the listing claims only what was walked.
- Steps 2 to 4 above need a person at Visual Studio: there are no tests
  that run inside it.
- Section 6 was tried with this machine's settings as they are. It did
  not turn any of them off to see what each one changes, and it did not
  try Visual Studio 2022.
- Start Session's question before a start (unsaved documents, a running
  debugger, a build in progress) and Compare With Its Start on a
  complete session's row are built and tested in the library only.
  Seeing them in Visual Studio also waits for session 360.
