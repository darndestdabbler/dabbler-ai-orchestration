# UAT: an engine pane in Visual Studio

What this page covers: whether Claude Code and the Copilot CLI can be
typed to inside the Dabbler Engine pane of Visual Studio as they are in
Windows Terminal. The pane is a WebView2 control drawing xterm.js, joined
to the engine through ConPTY, and opened with **Tools > Dabbler: Open
Engine Here**. Start Session still opens Windows Terminal.

Nothing here is published. The extension is built from this checkout as
`docs/uat/uat-visual-studio.md` section 1 says (`npm ci` at the root now
also brings xterm.js) and installed as its section 2 says.

This machine has Visual Studio 2026 only. Visual Studio 2022 was not
walked here, and the pane is claimed for it only once someone has walked
it on a machine that has it.

## 1. Which WebView2 Visual Studio loads

The package references `Microsoft.Web.WebView2` 1.0.3967.48, the version
Visual Studio 2026 carries, and ships its assemblies in the .vsix. Walked
2026-11-19 on Visual Studio Community 2026 (18.12.0, installed under
`C:\Program Files\Microsoft Visual Studio\18\Community`): the .vsix was
installed, Visual Studio started with `devenv /Command
Dabbler.OpenEngineHere`, and the files mapped into `devenv.exe` were
listed once the pane was open.

| File | Loaded from | Version |
| --- | --- | --- |
| `Microsoft.Web.WebView2.Wpf.dll` | Visual Studio's `Common7\IDE\PrivateAssemblies` | 1.0.3967.48 |
| `Microsoft.Web.WebView2.Core.dll` | Visual Studio's `Common7\IDE\PrivateAssemblies` | 1.0.3967.48 |
| `WebView2Loader.dll` | Visual Studio's `Common7\IDE\PrivateAssemblies` | 1.0.3967.48 |
| `Dabbler.VisualStudio.dll` | the extension's own folder | |

**Visual Studio's copy loads, not the package's.** The copies the .vsix
carries are never read in Visual Studio 2026; they are the same version,
so the pane is built against exactly what runs. A Visual Studio that
carries a different version would give the pane that version instead.

The WebView2 runtime that drew the page was the machine's evergreen
runtime, `msedgewebview2.exe` 157.0.4341.60, started with Dabbler's own
data folder, `%LOCALAPPDATA%\Dabbler\WebView2`.

## 2. Claude Code in the pane

Walked 2026-11-19 in `dabbler-visual-studio.slnx` at this repository's
root, with Claude Code 2.1.328 opened by **Tools > Dabbler: Open Engine
Here** and Windows Terminal running `claude` beside it. Visual Studio was
started from the Start menu, so the engine had the operator's own
sign-in. The keys were first pressed by the session through
`SendKeys`, with Visual Studio in front, and then by the operator, who
reported what they saw.

| What was tried | In the pane | Against Windows Terminal |
| --- | --- | --- |
| Typing a prompt, Enter | Reaches Claude; Enter sends | Same |
| Shift+Tab | Cycles Claude's mode; Visual Studio never sees it | Same |
| Up, Left, Right, Backspace | Recall and edit the prompt | Same |
| Esc, Esc twice | Interrupts; twice clears the input | Same |
| Ctrl+C with nothing selected | Interrupts (clears the input) | Same |
| Ctrl+O | Goes to Claude; Visual Studio's Open File does not open | Same |
| Ctrl+V with text on the clipboard | Pastes the text as one paste (`abPASTED-TEXT`) | Same |
| Ctrl+V with an image on the clipboard | Pastes nothing | Same: Claude Code on Windows takes an image with Alt+V, not Ctrl+V |
| Alt+V with an image on the clipboard | Pastes the image, and Claude reads it correctly | Same |
| Ctrl+Tab | Leaves the pane and cycles Visual Studio's tabs (the engine tab and Test Explorer) | Windows Terminal has no such key; this is the one Visual Studio keeps |
| Mouse wheel | Scrolls, and stays responsive when scrolled quickly | Same |
| Shift+Enter | Sent the prompt: the pane sent it as a plain Enter. Fixed: see section 4 | A new line in the prompt |
| Alt+Enter, Ctrl+J | A new line in the prompt | Same |
| Scroll bar | None shown: the engine draws full-screen and leaves no scrollback for one to move | The same scrollback, none |
| Dark and light themes | Both draw well, and the light (blue) theme was walked by the session too | Windows Terminal keeps its own scheme |
| Moving the pane and opening it again | Works | Not applicable |
| Closing Visual Studio | Ends `claude.exe` | Not applicable |

## 3. The Copilot CLI in the pane

Walked the same day in the ContosoUniversity fork at
`C:\temp\s310-contosouniversity`, with the engine set to `copilot` in
that checkout's Dabbler Configuration, so this repository's settings were
not changed, and with `copilot` in Windows Terminal beside it. The keys of
section 2 were tried again, while the engine answered and while it asked.
The operator found the two engines work very much alike, and the
Copilot CLI behaves as Claude Code does in every row above. Two rows are
its own:

- **Shift+Enter** sent the prompt here too, where Windows Terminal makes
  a new line, and Alt+Enter and Ctrl+J made a new line here as there.
- **No scroll bar either.** Copilot CLI 1.0.114 also draws full-screen,
  in the terminal's alternate screen (its `--mouse` option is "mouse
  support in alt screen mode"), and handles the mouse itself: dragging in
  the pane's right-hand gutter scrolls Copilot's own view. Claude Code
  does not take the mouse that way, so dragging there selects text.

## 4. What the walk fixed

**Shift+Enter is a new line.** A terminal sends Shift+Enter as a plain
Enter, so neither engine could tell the two apart. The page the pane
draws (`tools/dabbler-visual-studio/Dabbler.VisualStudio/engine/engine.js`) now sends Shift+Enter as Alt+Enter (`ESC CR`),
the new line both engines read, and leaves Enter as it was. It was first
tried in Microsoft Edge with no window, against the same xterm.js, where
Shift+Enter sent one `ESC CR` and Enter one `CR`; then the .vsix was
rebuilt and installed, and the operator typed a two-line prompt with
Shift+Enter to both engines in the pane.

A change that kept xterm.js's scroll bar shown was tried too, and taken
out again: with both engines drawing full-screen there is no scrollback
in the pane for it to show, so it changed nothing a person could see.

## 5. The rest of the walk, after verification's first round

The first review round asked for the observations the walk had not yet
recorded, and found three small faults, fixed before these were made:
an engine could still start after its tab was closed while it was being
found; an engine's last words, such as an error printed just before it
exits, could be dropped ahead of the exit line (proved fixed by starting
a `.cmd` that prints an error and exits through the pane's own
`PseudoConsole`, five times out of five); and Shift+Alt+Enter was kept by
the pane. The .vsix was rebuilt and installed, and the operator reported:

| What was tried | In the pane |
| --- | --- |
| Ctrl+C with text selected, pasted into Notepad | The selected text arrives |
| A long answer, while printing and after | Redraws cleanly; nothing garbled or overlapping |
| The window's edge dragged quickly back and forth | Redraws to the new width without garbling |
| Split beside a code file | Not walked: the engine tab's menu has no New Vertical Document Group. The pane is a tool window shown in the editor area, not a document |
| A monitor of another scaling | Not walked: the operator's two monitors share one scale |
| Shift+Alt+Enter | Nothing happens. The pane lets the key go, and Visual Studio does not run its full screen from it |
| Ctrl+F4 on the engine tab | Does not close it. Ctrl+F4 closes a document window, and the pane is a tool window; its tab's close button closes it |
| Closing the tab while the engine starts | Not walked: Ctrl+F4 does not close the tab |

**Where the two keys stop.** Shift+Alt+Enter and Ctrl+F4 are Visual
Studio's own, and the pane lets both go, but neither does anything from
the pane. That is Visual Studio's key routing from a tool window, and not
the engine's keys: every key an engine is answered with reaches it. Ctrl+F4
not closing a tool window is how Visual Studio treats tool windows. The
full screen is a convenience that the menu (**View > Full Screen**) still
gives. Both are left for session 370, which moves Start Session into this
pane: a document window, rather than a tool window, is where both keys
behave as they do on a code file.

**An npm launcher.** The review also asked whether an engine installed
with npm, which leaves a `.cmd` on `PATH`, starts in the pane. It does.
The built `Dabbler.VisualStudio.dll` was loaded in Windows PowerShell 5.1
and its `PseudoConsole` given `C:\Users\<you>\AppData\Roaming\npm\copilot.cmd
--version`, which printed `GitHub Copilot CLI 1.0.114.` and exited 0.
`CreateProcessW`, given no application name, hands a `.cmd` to `cmd.exe`
itself. A `.cmd` that echoes what it is given printed the router's
`--model` argument and the backquoted consult sentence whole, the folder
it was started in, and `DABBLER_ENGINE_TERMINAL=1`.

The operator then closed the walk: what is left is Visual Studio's own
window keys, and the next thing worth the time is using the extension.

## 6. Seen beside the pane, outside this session

The walk was done with Dabbler's other tool windows open. Two things the
operator saw belong to the Work Explorer and the Configuration pane, which
session 371 lays out, and are recorded here so that session starts from
them:

- **The status pictures are not drawn.** The router names each picture
  with its extension (`done.svg`), and `StatusPictures.cs` adds `.svg`
  again, so it looks for `done.svg.svg`, finds nothing, and the row shows
  no icon. The pictures themselves are in the .vsix under `media\light`
  and `media\dark`.
- **The text is too small for the operator to read comfortably.** Both
  windows set no font of their own and take Visual Studio's environment
  font, so **Tools > Options > Environment > Fonts and Colors**, *Show
  settings for: Environment*, sets their size. The operator raised it
  there, and both windows followed. The guide should say so.

Session 368's answer: **Go**.

## 7. Coming back to a running engine

From session 369 the engine runs in an engine host, a small program of
the package's own (`tools/dabbler-visual-studio/Dabbler.EngineHost/Program.cs`)
that Visual Studio starts and that is not Visual Studio's child, and the
pane attaches to the host over a named pipe. A pane that attaches to an
engine that is already running starts with an empty terminal, and it has
to show the engine's screen as it is now and take typing at once.

**How it was tried.** Two ways were measured against both engines, each
started by the built host in this repository at 100 by 30. A pane was a
headless xterm.js (`@xterm/headless` 5.5.0, the same terminal the pane
draws with, without a window), joined to the host's pipe as the pane is
and answering the engine's terminal queries as the pane does. The first
pane attached, waited for the engine's prompt, typed `hello there`
without Enter, and detached. Three seconds later a second, new pane
attached at the same size, and its screen and terminal modes were read;
then it typed `X`.

- **Redraw:** the host made the engine draw again by resizing its console
  by one column and back. Both engines redrew their screen, but the new
  terminal stayed on its normal screen, with bracketed paste and the
  mouse off, because an engine sets those modes once, when it starts, and
  a redraw does not set them again. A paste would no longer arrive as one
  paste, and Copilot's mouse would be gone. The rules across the screen
  were also drawn a column short of the right edge.
- **Replay:** the host gives an attaching pane what the engine has
  printed, before anything it prints after. The second pane's screen was
  the first pane's, line for line, the full-screen prompt with
  `hello there` in it included, on the alternate screen with bracketed
  paste and the mouse on, exactly as the first pane had them. `X` landed
  after `hello there` in both engines, so typing was taken at once.

| Engine | Redraw: screen | Redraw: modes | Replay: screen | Replay: modes | Typing after |
| --- | --- | --- | --- | --- | --- |
| Claude Code 2.1.328 | Drawn, a column short | Lost | As it was | As they were | Taken at once |
| Copilot CLI 1.0.114 | Drawn, a column short | Lost | As it was | As they were | Taken at once |

**Replay is kept, and nothing else.** The host keeps the last million
characters the engine printed, trimming by half that at a time, and
remembers the private modes (`ESC [ ? n h` and `l`) set in what it
trimmed, so that a pane attaching after an hour of output still gets the
alternate screen, bracketed paste and the mouse first. That trimmed path
was run once against Claude Code with the limit set to two thousand
characters for the run, and the second pane came back on the alternate
screen with bracketed paste and the mouse on, and took typing. A pane of
a different size than the engine's is replayed to and then resized, and
the engine draws again at its size.

**What replay cannot give back.** The host keeps what the engine printed,
not the screen it drew. A part of the screen drawn once and then left
unchanged while more than a million characters were printed elsewhere,
such as a prompt sitting under a long-running spinner, is no longer in
what is kept: a pane attaching then shows the rest of the screen, and
that part only once the engine draws it again (a keystroke or a resize
makes both engines draw their prompt). This was reasoned from how the
replay works and not reproduced; giving back the screen itself would take
a terminal emulator in the host, which this session does not build.

Visual Studio itself was not walked here: until closing a pane detaches
rather than ends, the pane in Visual Studio never attaches to an engine
that is already running. Section 8 walks it there.

## 8. An engine outlives Visual Studio: the walk

Walked 2026-11-19 on Visual Studio Community 2026 with the .vsix built
from this session installed, Visual Studio started from the Start menu,
and `dabbler-visual-studio.slnx` at this repository's root open, whose
engine is Claude Code. The operator worked Visual Studio and reported
what the screen showed; the session read the processes and the host's
record (`%LOCALAPPDATA%\Dabbler\engines`) between the steps.

| What was done | Engine kept running | The bar offered it | Live prompt back, typing taken |
| --- | --- | --- | --- |
| Claude Code mid-answer, the engine tab closed, then Visual Studio closed with File > Exit, and Visual Studio reopened on the same solution | Yes: the same host and the same `claude.exe` before and after | Yes: "Consult — Claude Code — dabbler-ai-orchestration is still running for this folder." with Open its pane | Yes: the screen as the engine had drawn it, the prompt included, and typed characters appeared at once |
| Claude Code mid-answer, `devenv.exe` ended from Task Manager (End task), and Visual Studio reopened | Yes: the same host and engine again | Yes | Yes: the answer it was writing had finished meanwhile, and was there; typing appeared at once |

**The first close.** Closing the engine's tab, the first time on this
machine, showed the message box saying the engine is still running and
that Tools > Dabbler: End Engine ends it.

**Where the host runs.** Read after each of the two endings: the host's
parent process was the copy of the host that Visual Studio started, which
had already exited, so the host is no child of Visual Studio's and
nothing that walks Visual Studio's process tree reaches it. Windows
reports the host as in a job; that job is not one that ends with Visual
Studio, since the host outlived both an exit and a Task Manager kill.

**Not walked in Visual Studio,** at the operator's word, the walk having
shown what it was for:

- **The Copilot CLI.** Nothing in the host or the pipe differs by engine:
  the host runs the launch line it is given. Section 7 measured Copilot
  CLI 1.0.114 coming back through the same host, screen and modes
  included, outside Visual Studio; it was not closed, killed or reopened
  in Visual Studio.
- **Two Visual Studio windows on two solutions,** each with an engine,
  one closed and reopened. The offer is made per repository folder from
  each host's record, which section 8's runs read.
- **A second Visual Studio window on the same folder.** The refusal was
  proved against the built host with a pipe client of its own: the first
  pane attached, the second was answered "This engine is open in another
  Visual Studio window." and closed, and the first went on taking input.
- **End Engine** from the menu. The end message it sends was proved
  against the built host the same way: the engine ended, the pane was
  told its exit, the host exited and its record was removed.
- **The idle end after 24 hours** without output or a pane.

The Claude Code engine of the walk was left running for the operator, in
the first Visual Studio's pane.

Go, on what was walked and with the rest waived by the operator: with Claude Code, an engine outlived Visual Studio closing and being killed from Task Manager and came back live in its pane each time; the Copilot CLI, two Visual Studio windows on two solutions, the same-folder refusal and End Engine were not walked in Visual Studio.
