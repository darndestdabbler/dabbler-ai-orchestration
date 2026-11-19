### 1. Verdict, first

**Hosting the engine:** Use a `WebView2` control rendering `xterm.js`, wired to a background daemon that owns the Windows Pseudo Console (`ConPTY`). This is the exact architecture VS Code uses to run Claude Code and Copilot CLI; it avoids the keyboard-focus nightmares of Win32 window parenting and the packaging rot of Microsoft's abandoned WPF terminal control.

**Offering the layout:** Provide a single toolbar toggle button ("Dabbler View") that uses the EnvDTE `WindowConfigurations` API (or direct `IVsWindowFrame` frame manipulation) to snapshot the user's current coding layout, switch to the Dabbler layout by docking the engine as a tabbed document in the center editor well, and restore their exact coding layout when toggled off. Do not automatically hijack their layout when a session starts unless they opt into it, and rely on Visual Studio's native layout engine to handle debugging transitions.

---

### 2. Hosting the engine

Every option hosted inside a Visual Studio `ToolWindowPane` faces the same core enemy: Visual Studio's main message loop (`IVsFilterKeys2` and `IOleComponent.FPreTranslateMessage`) aggressively intercepts keystrokes like `Esc`, `Shift+Tab`, `Ctrl+C`, `Ctrl+V`, and `Ctrl+Enter` to trigger IDE commands before a child control ever sees them. 

To give the developer a normal terminal experience under *any* of these options, your `ToolWindowPane` must override `PreProcessMessage(ref Message m)` (documented in `Microsoft.VisualStudio.Shell.ToolWindowPane`) or implement `IOleCommandTarget` to swallow keystrokes when the terminal has focus and pass them directly to the control, preventing Visual Studio from stealing `Esc` (which normally jumps focus to the active code editor) or `Ctrl+V`.

#### (a) Another process's window placed in a tool window (Win32 `SetParent`)
*   **Does it work in net472 on 2022 and 2026?** Yes, via WPF's `HwndHost` and P/Invoke `SetParent` (documented Win32, unsupported for cross-process terminal embedding).
*   **The developer's day-to-day:** Miserable, just as the `dliedke/ClaudeCodeExtension` changelog shows. `SetParent` across processes breaks the Windows input queue. Typing stops working after clicking outside and back in; `Shift` and `Ctrl` modifier states get stuck; DPI scaling changes when dragging across monitors cause runaway font sizes or black bars; and Windows 11's default terminal (`WindowsTerminal.exe`) uses a single-instance WinUI3 architecture that resists having its child HWND stolen, forcing you to fall back to the legacy `conhost.exe` (which breaks modern ANSI rendering used by Claude Code).
*   **Maintainer's burden:** Endless whack-a-mole with Win32 focus hooks (`AttachThreadInput`), DPI messages, and Windows update regressions. Do not do this.

#### (b) `Microsoft.Terminal.Wpf` with ConPTY
*   **Does it work in net472 on 2022 and 2026?** Yes, technically, because Visual Studio 2022 ships an internal copy of it to run its own terminal, and you can build it from the `microsoft/terminal` source.
*   **The developer's day-to-day:** Good text rendering and automatically inherits VS themes and fonts if wired to `VSColorTheme`. However, the control has known bugs with IME input, high-DPI airspace issues when floating tool windows, and does not natively support pasting images from the clipboard (Claude Code supports image paste where terminals allow it, or via file path drops). Once `PreProcessMessage` is overridden, `Esc`, `Shift+Tab`, and arrows work reliably.
*   **Maintainer's burden:** Heavy. Microsoft has never published an official, supported NuGet package for `Microsoft.Terminal.Wpf`. Third-party NuGet packages are out-of-date betas. Because the control wraps a native C++ DLL (`TerminalCore.dll`), you must either compile and bundle the native x64/ARM64 binaries from the Windows Terminal repo yourself, or take a brittle dependency on the internal binaries located in Visual Studio's installation folder (which can change signatures between VS 2022 and VS 2026 minor updates).

#### (c) Visual Studio's own terminal through its internal service
*   **Does it work in net472 on 2022 and 2026?** Only via undocumented, internal reflection. 
*   **The developer's day-to-day:** It behaves identically to the built-in Developer PowerShell—keyboard handling, themes, and fonts are native. However, the developer loses separation: their normal shell tabs and Dabbler's AI engines are mixed together in the same tool window, making it impossible to put the AI in the center editor while keeping a standard terminal at the bottom.
*   **Maintainer's burden:** You must reflect against `Microsoft.VisualStudio.Terminal.dll` (undocumented, internal to VS 2022 and 2026) to grab the internal `ITerminalService` via MEF, create a pty session, and pass startup arguments. Microsoft changes these internal interfaces without warning in minor updates. Furthermore, because all instances share the single built-in Terminal tool window, it fails the operator's layout requirement.

#### (d) WebView2 with xterm.js over ConPTY
*   **Does it work in net472 on 2022 and 2026?** Yes. `Microsoft.Web.WebView2.Wpf` is officially supported on .NET Framework 4.7.2, and the WebView2 runtime is guaranteed to be installed by both VS 2022 and VS 2026. ConPTY is called via documented Win32 APIs (`CreatePseudoConsole`, `ResizePseudoConsole`, `ClosePseudoConsole` in `kernel32.dll`, available since Windows 10 1809).
*   **The developer's day-to-day:** Seamless. Claude Code and Copilot CLI are built and tested daily against `xterm.js` because that is what powers VS Code's terminal. Full-screen TUI redraws, box-drawing characters, 24-bit color, mouse scrolling, and resize via `xterm-addon-fit` work without glitches. Because you control the JavaScript layer inside WebView2:
    *   **Keys:** When WebView2 has focus, your `ToolWindowPane.PreProcessMessage` bypasses VS's command filter so `Esc`, `Shift+Tab`, `Ctrl+C`, `Ctrl+Enter`, and arrows go straight to `xterm.js`, which encodes them into exact VT sequences for ConPTY.
    *   **Image paste / Drag-and-drop:** You can intercept `Ctrl+V` in JS; if the clipboard contains an image, you can save it to a temp file in C# and feed the file path to Claude Code, or let text paste straight through.
    *   **Theme and font:** You read Visual Studio's current theme colors (`VSColorTheme.GetThemedColor`, documented) and Editor font (`IVsFontAndColorStorage`, documented) in C# and pass them as a JSON config to `xterm.js` on load and on `VSColorTheme.ThemeChanged`.
    *   **High-DPI:** Chromium (WebView2) handles per-monitor DPI changes and WebGL font rendering better than WPF.
*   **Maintainer's burden:** Very low. `xterm.js` is bundled as static HTML/JS assets inside the VSIX. The ConPTY P/Invoke wrapper is ~200 lines of standard C# that never changes. You must ensure your WebView2 user-data folder is pointed to `%LocalAppData%\Dabbler\WebView2` so it doesn't collide with other extensions.

#### (e) Anything better?
No. Unless you drop the terminal entirely and build a custom WPF chat UI on top of Claude/Copilot protocols (which violates the operator's requirement to host the actual AI CLI), **WebView2 + xterm.js + ConPTY** is the cleanest, most reliable architecture available on Windows.

---

### 3. When Visual Studio closes

Do **not** let the engine die with Visual Studio. In C# and C++ development on Visual Studio, restarts are routine: switching big git branches, installing a VSIX update, recovering from an OutOfMemory crash or a hung Roslyn analyzer, or restarting elevated as Administrator. If an hour-long session loses its in-flight AI engine because Visual Studio needed a restart, the developer will lose trust in the embedded terminal and switch back to external Windows Terminal.

**How to build the external host:**
When Dabbler needs to start an engine, the extension starts (or connects to) a tiny headless process—`dabbler-pty-host` (this can be a Node script run by the existing Dabbler router, or a 300-line C# console app compiled with your extension)—outside the Visual Studio process tree (spawned with `CREATE_NEW_PROCESS_GROUP` and `DETACHED_PROCESS`).
1. `dabbler-pty-host` creates the `ConPTY`, spawns Claude Code / Copilot CLI, and opens a local Named Pipe (`\\.\pipe\dabbler-session-<id>`).
2. It keeps a small ring buffer in memory (e.g., the last 10,000 bytes of raw VT output, or uses a headless `xterm` instance in Node to serialize screen state).
3. The Visual Studio tool window connects to that Named Pipe and pipes bytes between the pipe and `xterm.js` in the WebView2.

**What the developer experiences:**
If Visual Studio closes, crashes, or restarts for an update, the engine keeps running untouched in the background. When the developer reopens Visual Studio and opens the solution, the Dabbler tool window automatically reconnects to the Named Pipe, replays the ring buffer into `xterm.js`, sends a `ResizePseudoConsole` packet to match the pane size, and the developer is looking at their live Claude Code prompt right where they left it. It also solves the multi-instance bug seen in other extensions: closing one Visual Studio instance never kills a terminal in another.

This is well worth what it obliges. Because you already have a Node router (`dabbler <verb>`), hosting the pty or a tiny C# pipe server requires almost no ongoing maintenance once the pipe protocol (stdin, stdout, resize, exit) is written.

---

### 4. Windows Terminal as it is today

**Keep it as a setting (and use it as an automatic fallback if WebView2 fails to initialize).**

A developer with a two- or three-monitor setup often prefers having their AI engine full-screen on a second monitor in Windows Terminal while keeping all of Visual Studio dedicated to code and debugging on their primary monitor. Keeping a `"Run engine in: [Visual Studio (Integrated) | Windows Terminal (External)]"` option in your Configuration window costs one `if` statement in the C# file that already launches `wt.exe`, satisfies multi-monitor developers, and gives a working escape hatch on locked-down corporate machines where WebView2 might be broken by policy.

---

### 5. The layout

#### How to offer "Dabbler layout" and "back to coding"
Do not ask the developer to manually save layouts and press `Ctrl+Alt+1` / `Ctrl+Alt+2`; developers hate manual setup steps and will overwrite their numbered slots. Instead, give them a single toggle button on the Dabbler toolbar and in the Work Explorer header: **"Dabbler Layout"** (with a single keyboard shortcut).

While there is no documented VSSDK API to read or write the user's named `Window > Apply Window Layout` roaming list (that is handled by an internal `WindowLayoutService` in `Microsoft.VisualStudio.Platform.WindowManagement`), there are **two documented APIs** in `EnvDTE` and `Microsoft.VisualStudio.Shell.Interop` that let an extension switch layouts cleanly in both VS 2022 and VS 2026:

1.  **Saving and restoring the "Coding" layout:** Use `EnvDTE80.DTE2.WindowConfigurations` (documented in `EnvDTE`). Before switching into the Dabbler layout, call `dte.WindowConfigurations.Add("Dabbler_SavedCodingLayout")` (or overwrite it if it exists). This takes an immediate snapshot of every tool window's current dock position and visibility. When the user clicks "Back to Coding", call `config.Apply()` on `"Dabbler_SavedCodingLayout"`, and programmatically hide the Dabbler AI engine window.
2.  **Applying the "Dabbler" layout (Left: Solution/Work Explorer, Middle: AI CLI, Right: Dabbler Terminal):**
    *   **Middle (Editor Area):** To place a tool window reliably in the center editor well, mark its `ProvideToolWindowAttribute` with `DocumentLikeTool = true`, or take its `IVsWindowFrame` (`ToolWindowPane.Frame as IVsWindowFrame`, documented in `Microsoft.VisualStudio.Shell.Interop`) and call:
        ```csharp
        frame.SetProperty((int)__VSFPROPID.VSFPROPID_FrameMode, VSFRAMEMODE.VSFM_MdiChild);
        ```
        (Alternatively, using `EnvDTE.Window`, set `window.Linkable = false;` and `window.IsFloating = false;`, which forces a tool window into the center tabbed document well). This puts the AI CLI right in the middle where code editors live.
    *   **Left and Right:** Declare default positions on your classes via `[ProvideToolWindow(typeof(WorkExplorerPane), Style = vsDockStyle.Tabbed, Window = EnvDTE.Constants.vsWindowKindSolutionExplorer)]` for the left, and `[ProvideToolWindow(typeof(DabblerTerminalPane), Style = vsDockStyle.Right, Orientation = ToolWindowOrientation.Right)]` for the right. Once arranged, save a `"Dabbler_ActiveLayout"` configuration in `dte.WindowConfigurations` so that if the user tweaks the splitter widths in Dabbler mode, their tweaks are remembered next time they toggle it on.

*(Caveat on `WindowConfigurations` vs. internal `WindowManager` in VS 2022/2026: `WindowConfigurations` reliably restores tool window visibility and dock zones, though it does not always move a tool window out of the center document well if a user manually dragged a normal code file next to it. Explicitly calling `IVsWindowFrame.Show()` / `Hide()` and setting `VSFPROPID_FrameMode` alongside `WindowConfigurations.Apply()` makes the toggle rock-solid.)*

#### Should "Start Session" apply the Dabbler layout by itself?
Make it a three-way setting in Configuration: **"Switch to Dabbler layout on Start Session: [Always | Ask first time | Never]"**, defaulting to **Always** on the very first run with a subtle banner in the tool window saying *"Switched to Dabbler layout (Switch back / Don't auto-switch)"*. Unlike starting a debugger, starting a Dabbler session shifts the developer from *writing code* to *supervising the AI*; moving straight to the supervision view makes sense, provided they have a one-click button to jump back to their code.

#### What happens when the debugger starts during a session?
Visual Studio stores completely separate window layout profiles for `Design` mode and `Debug` mode. The moment the user presses `F5` (or when a test run attaches the debugger), Visual Studio automatically switches from the `Design` layout to its `Debug` layout—showing Call Stack, Locals, and Exception Settings, and hiding tool windows that haven't been explicitly opened during a debug session.
*   Because your AI CLI is docked as an `MdiChild` (tabbed document in the center editor well), **it remains visible in the center tab bar during debugging**, just like a `.cs` file does.
*   Your Work Explorer and Dabbler Terminal tool windows will hide when `F5` is pressed unless they have been marked visible in the `Debug` context, or unless you register them with `[ProvideToolWindowVisibility]` (if tied to a UIContext). Leave them unforced in Debug mode: when a developer hits `F5` during a session, they *want* to see the debugger panels, and when they press `Shift+F5` (Stop Debugging), Visual Studio automatically restores the `Design` mode layout—returning immediately to their Dabbler layout.

---

### 6. More than one engine

Use **multiple instances of the Engine tool window (`MultiInstances = true` on `[ProvideToolWindow]`), each docked as a separate document tab in the center editor area** (`VSFM_MdiChild`).

Why this beats tabs-inside-one-tool-window or real documents:
*   If you build your own tab bar *inside* a single tool window, the developer cannot use Visual Studio's native side-by-side split view (dragging the "Consult" tab next to the "Session 3 Engine" tab to compare them, or dragging the "Mechanic" onto a second monitor).
*   If you register a formal `IVsPersistDocData` custom document editor, Visual Studio thinks the terminal is a file on disk, prompts "Save changes to item?" on close, and clutters the Recent Files list.
*   By using `MultiInstances = true` on a `ToolWindowPane` and setting each instance's frame to `VSFM_MdiChild` via `IVsUIShell.CreateToolWindow` (passing a unique instance ID per engine/consult/mechanic), each engine acts like a first-class tab in the center well. The developer can view one at a time, split them side-by-side with each other or with a C# file, tear one off to another monitor, and close a finished Consult tab with `Ctrl+F4` just like any other tab in Visual Studio.

---

### 7. The first session to plan

Do not touch layouts, background daemons, or Dabbler session routing in the first session. The first session must be a **vertical spike of the terminal control and Visual Studio's keyboard routing**:

1.  Create a single multi-instance `ToolWindowPane` set to open in the center document well (`VSFM_MdiChild`).
2.  Host a `WebView2` loading a local `xterm.js` with `xterm-addon-fit` and `xterm-addon-webgl`.
3.  Spawn a local `ConPTY` running the actual **Claude Code CLI** (and test **GitHub Copilot CLI** second).
4.  Implement the `PreProcessMessage` keyboard override in the `ToolWindowPane`.
5.  **Run the Gauntlet inside Visual Studio 2022 and 2026:**
    *   Press `Esc` while Claude Code is streaming (must cancel the stream in Claude, *not* move focus to a C# file).
    *   Press `Shift+Tab`, `Up`/`Down` arrows, and `Ctrl+Enter` inside Claude Code's interactive prompts.
    *   Select text with the mouse, copy with `Ctrl+C`, and also send `SIGINT` (`Ctrl+C`) when no text is selected.
    *   Paste a multi-line code block and an image with `Ctrl+V`.
    *   Split the terminal tab side-by-side with a `.cs` file and drag the splitter rapidly to verify `ResizePseudoConsole` doesn't corrupt Claude Code's TUI layout.
    *   Switch Visual Studio from Dark theme to Light theme and drag the window between two monitors with different DPI scaling (e.g., 150% laptop to 100% external).

If that gauntlet passes cleanly, the riskiest 80% of the feature is proven, and session two can move the `ConPTY` ownership into the out-of-process Named Pipe daemon and wire up the layout toggle.

---

### 8. What would make this fail

1.  **Incomplete keyboard interception (`IVsFilterKeys2` / `PreProcessMessage`):** This is the #1 killer of embedded terminals in Visual Studio. If you miss certain WM_KEYDOWN / WM_SYSKEYDOWN messages or let Visual Studio's global command bindings (`Edit.SelectionCancel` on `Esc`, `View.SynchronizeClassView`, chorded shortcuts like `Ctrl+K`, `Ctrl+E`) execute while WebView2 has focus, the developer will constantly trigger random Visual Studio panels while trying to talk to the AI. Conversely, you *must* let a few window-switching shortcuts through (like `Ctrl+Tab` or your layout toggle shortcut) so the user doesn't feel trapped inside the terminal with the keyboard.
2.  **Orphaned background processes (`dabbler-pty-host` leaks):** If you detach the pty host so it survives Visual Studio restarts, you risk leaving zombie AI processes eating RAM if a user abandons a solution for days. The background host must auto-terminate when the underlying AI CLI exits, and should enforce an idle timeout if no Visual Studio pipe has connected and no child process output has occurred after a configurable period.
3.  **PTY resize race conditions on reconnect:** Full-screen TUIs like Claude Code rely on exact `SIGWINCH` / `ResizePseudoConsole` dimensions. When reconnecting to an existing background session, or when toggling between "Coding Layout" (where the terminal tab is hidden, width/height = 0) and "Dabbler Layout", sending a `0x0` resize to `ConPTY` will crash or severely corrupt the TUI rendering. Never send a resize call to ConPTY when the WPF control's `ActualWidth` or `ActualHeight` is zero or collapsed.
4.  **WebView2 initialization freezes on the UI thread:** Calling `EnsureCoreWebView2Async` improperly or waiting on it synchronously (`GetAwaiter().GetResult()`) inside a Visual Studio `ToolWindowPane` will deadlock Visual Studio's UI thread. All WebView2 initialization and Named Pipe reads must run asynchronously via `JoinableTaskFactory` without blocking the main thread.
