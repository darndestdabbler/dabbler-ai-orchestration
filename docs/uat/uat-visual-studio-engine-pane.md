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

**Go**
