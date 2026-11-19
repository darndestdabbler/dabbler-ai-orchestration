### 1. Verdict, first

Start with **Option 1 (VS Code beside Visual Studio)**, and if the trial proves window-switching is the real friction, build **a shared local web UI hosted inside thin native extensions** (a variant of Option 3 and Section 4).

The deciding reason: Dabbler is a long-running, out-of-band orchestrator, not an inline typing assistant, so its controls do not benefit from being woven into the code editor's text buffer—and building three separate native tree-and-terminal extensions (VS, IntelliJ, Eclipse) violates your single-implementation rule for zero gain in developer experience.

*(Note on the operator's doubt: The developers are right that they need Visual Studio for .NET Framework 4.5 MVC. VS Code has no classic ASP.NET MVC debugging via IIS Express, no EDMX/designer support, poor Roslyn support for non-SDK `.csproj` files, and weak `.vbhtml`/`.cshtml` legacy Razor tooling. Do not fight them on the editor for legacy .NET.)*

---

### 2. The back and forth, moment by moment

Here is a developer's day across the phases of a session.

**Planning a session**
*   *Happens:* 1–3 times a day.
*   *Option 1 (VS + VS Code):* Switch to VS Code, write Markdown plan, click Start in Work Explorer. Does not grate; planning is a distinct mental mode from coding.
*   *Option 2 (Terminal):* Edit Markdown in VS, Alt-Tab to Windows Terminal (or focus VS Terminal), type `dabbler session start`. Does not grate.

**Starting and watching**
*   *Happens:* Continuous background, glanced at every 5–15 minutes.
*   *Option 1:* Put VS Code on a second monitor showing the Dabbler Terminal and Engine Terminal. Zero friction. On a single monitor, Alt-Tabbing to check progress is normal (like checking a browser or CI build).
*   *Option 2:* Without the Dabbler Terminal pseudoterminal, the developer sees only the noisy authoring CLI, or has to open a second terminal tab to run `dabbler status` repeatedly. This grates immediately.

**Answering a stop (check failure, mechanic needed, review exception)**
*   *Happens:* Several times per session. **This is the friction point.**
*   *Option 1:* The developer sees the stop in VS Code. They read the transcript or failure in VS Code. If they just need to talk to the engine terminal or click "Waive", they stay in VS Code. If they need to inspect the broken C# code, use "Find All References", or fix a type error manually, they switch to VS, fix it, save, switch back to VS Code, and click "Continue". **What grates:** Clicking a file path in the VS Code transcript opens the file in VS Code, not Visual Studio. The developer ends up reading in VS Code and editing in VS, or copying file names and line numbers across windows.
*   *Option 2:* Read the failure in the terminal, memorize the file and line, switch to VS to inspect, switch back to terminal, type `dabbler session next` or `waive`. Remembering exact CLI verbs and session IDs when frustrated by a broken build grates heavily.

**Reading the diff and debugging what it built**
*   *Happens:* Once per session (or per major stop).
*   *Option 1 & 2:* Done entirely in Visual Studio (Git Changes window, F5 debugger). No switching required once the session stops or finishes.

**What Visual Studio 2022 does badly when Dabbler edits files underneath it:**
*(Note: Even with an inside-VS extension, Dabbler's engine CLI edits files on disk out-of-process, so these happen in all three options.)*
1.  **Non-SDK `.csproj` files (the .NET 4.5 MVC pain point):** In legacy `.csproj` format, every file in the project is explicitly listed in the XML. When Claude Code creates a new `.cs` file and edits the `.csproj` to include it, VS 2022 triggers a project reload. If the setting *"Reload modified projects unless there are unsaved changes"* is off, the user gets a modal dialog blocking the whole IDE. Even when automatic, reloading a large legacy `.csproj` freezes the VS UI thread for several seconds.
2.  **Locked build outputs (`bin/` and `obj/`):** When Dabbler runs `msbuild` and `vstest` in the background, and Visual Studio has the solution open, VS's background design-time builds and Test Explorer discovery compete for the same `obj/` and `bin/` folders. You will hit `MSB3021: Unable to copy file... being used by another process`.
3.  **Running debugger / IIS Express:** If the developer leaves IIS Express running or is paused in the debugger from testing the *previous* session, `bin/` is locked by `w3wp.exe` or `iisexpress.exe`. Dabbler's build check will fail immediately.
4.  **Unsaved files and Designers:** If a developer leaves an `.edmx` designer, `.resx` editor, or dirty `.cs` file open with unsaved changes, and the engine CLI modifies it on disk, VS pops up a conflicting-changes modal dialog.
5.  **Git index locks:** Visual Studio 2022 constantly runs `git status` in the background. When Dabbler commits and pushes automatically at the end of a step, VS and Dabbler will occasionally collide on `.git/index.lock`.

---

### 3. If a Visual Studio extension is built, how

**Which extension model**
Use the **classic in-process VSSDK (`Microsoft.VisualStudio.SDK`, targeting VS 2022 64-bit)**, not the newer out-of-process `VisualStudio.Extensibility`.
*   *Why:* As of Visual Studio 2022 (17.8–17.12), `VisualStudio.Extensibility` has immature tool window support, awkward interop when you need to manipulate the IDE's native terminal or open files at specific lines via `DTE`, and forces a proprietary Remote UI data-binding pattern. Classic VSSDK lets you host a standard WPF `UserControl` (or `WebView2`) in a `ToolWindowPane` with complete access to the IDE.

**What is reused vs. rewritten**
*   *Reused as-is:* The 68,000-line router (run as a long-lived child process or invoked per verb).
*   *What happens to the TypeScript tree models (2,600 lines) and pseudoterminal (2,140 lines):* If you build a native C#/WPF extension, **you cannot cleanly reuse them**. Running a headless Node sidecar just to execute 2,600 lines of UI tree-state TypeScript and marshaling that over JSON-RPC to C# `ObservableCollection` view models is more code than the models themselves. Better to move those 2,600 lines of tree model into the **router** (exposed as `dabbler ui-state --json` or a local SSE/WebSocket stream). Then the router owns the view-model shapes, and your "one implementation of any rule" law survives intact.
*   *Rewritten in C#/WPF:* The two tree providers (as WPF `TreeView` controls with context menus), the 3,900 lines of commands/dialogs (as VS `.vsct` command tables and WPF dialogs or VS QuickPick equivalents), and the terminal wiring.

**How the router and Node get onto the machine**
1.  Compile/bundle the router into a single JS file using `esbuild` or `rolldown`.
2.  Download the official standalone `node.exe` binary (Windows x64) during the extension build.
3.  Pack both `node.exe` and `router.cjs` directly inside the `.vsix` archive as content files.
4.  When the VSIX installs, they sit in the extension's install folder (`%LocalAppData%\Microsoft\VisualStudio\17.0_...\Extensions\...`). Your C# extension always knows the exact path to its own bundled `node.exe` and `router.cjs`, and adds a shim folder to the `PATH` of any terminal it spawns. No global Node install required.

**What the terminals become in Visual Studio**
This is the weakest part of the Visual Studio 2022 SDK:
*   **The Dabbler Terminal:** Do not use a terminal for this in VS. It is a read-only event log. In Visual Studio, write Directly to a custom **Output Window pane** (`IVsOutputWindowPane`), or render it as a virtualized WPF `ListView` inside the Dabbler tool window.
*   **Engine terminals (Claude Code / Copilot CLI):** These are interactive TUI programs that require a real Windows ConPTY (`CreatePseudoConsole`). Visual Studio 2022 has a built-in Terminal window (Whack Whack Terminal), *I am unsure whether Microsoft has exposed a public VSSDK service in 17.x to programmatically create a new tab in the built-in Terminal and inject a startup command into it—historically, that service (`ITerminalService`) has been internal.*
    *   *The reliable path:* Spawn `wt.exe` (Windows Terminal) or a standalone console window configured with your environment variables and working directory, or embed a `WebView2` running `xterm.js` connected to a `node-pty` / C# `ConPTY` backend inside a VS ToolWindow. Spawning an external Windows Terminal tab (`wt -w dabbler new-tab ...`) is by far the cleanest and renders Claude Code's TUI without bugs.

---

### 4. One interface for Visual Studio, IntelliJ and Eclipse

Yes: **Move the UI into a local web server inside the router, and make each IDE extension a 300-line wrapper around a browser panel plus an IDE bridge.**

Here is the architecture:
1.  **The Router serves the UI:** When `dabbler daemon` runs, it serves a local web app (HTML/CSS/TypeScript—no heavy framework needed, just the exact tree models and dialogs you already have in TypeScript). It also renders the Dabbler event log and can even render the engine terminals via `xterm.js` + `node-pty`.
2.  **The Thin IDE Extension (VS, IntelliJ, Eclipse, VS Code):**
    *   Starts the router daemon for the current solution directory.
    *   Opens a single dockable tool window containing a webview (`WebView2` in VS 2022, `JCEF` in IntelliJ, `SWT Browser` in Eclipse, `WebviewView` in VS Code) pointing to `http://127.0.0.1:<port>`.
    *   Listens for 3 messages from the webview over WebSocket/postMessage:
        1.  `openFile(path, line)` -> calls the native IDE API to open the file in the editor.
        2.  `openDiff(path)` -> opens the native IDE diff viewer.
        3.  `runInIdeTerminal(command, env)` -> opens a native IDE terminal (where supported, like VS Code and IntelliJ) or spawns Windows Terminal.

**Is this better for the developer, or merely tidier for the maintainer?**
Normally, webviews inside IDEs feel foreign and worse than native trees. **Here, it is genuinely as good for the developer**, for two reasons:
1.  The developer's primary interaction with Dabbler is reading status, clicking "Start/Continue/Waive", filling out configuration forms, and reading event logs. None of these benefit from deep native IDE tree integration (like drag-and-drop refactoring onto code files).
2.  With the `openFile(path, line)` bridge, clicking a file or failed test in the Dabbler panel immediately jumps the native Visual Studio / IntelliJ editor to that exact line. That solves the single biggest annoyance of Option 1.

*(Constraint note: You stated "No webview is used anywhere" in the current VS Code extension. If that is a permanent design principle rather than a description of today's state, skip the local web UI and instead build a **JSON-RPC UI Protocol** into the router: the router computes the exact `WorkExplorerTree` and `SolutionExplorerTree` JSON nodes, and each IDE writes a 500-line native tree renderer in C# or Kotlin that blindly renders those nodes and sends action IDs back.)*

---

### 5. What the terminal-only route needs

If you offer Option 2 (Windows Terminal alongside Visual Studio—do not use VS's built-in terminal for Claude Code; its ConPTY resize and ANSI redraw behavior under heavy TUI output in VS 2022 is noticeably laggy compared to Windows Terminal), it is a punishment today. To make it a fair offer, you need:

1.  **Single-file distribution:** Bundle the router (`esbuild`) and either package it with `pkg`/`sea` (Node Single Executable Applications) into `dabbler.exe`, or distribute it via an internal npm registry / PowerShell installer script that drops `node.exe` and `dabbler.cmd` into `%LocalAppData%\Dabbler\bin` and adds it to the user's `PATH`.
2.  **`dabbler watch` (or `dabbler top`):** A live-updating terminal dashboard (split-screen or compact header) that combines the Work Explorer's active session state and the Dabbler Terminal's live event stream in one pane, updating in place. No one will type `dabbler status` fifty times an hour.
3.  **Interactive action menu on stops:** When a session stops in `dabbler watch`, present an arrow-key selectable menu right there in the terminal (`[1] Continue  [2] Waive check  [3] Open Mechanic  [4] View transcript  [5] Rollback`). Requiring the developer to look up verb syntax and session IDs breaks their flow.
4.  **Editor-opening hooks (`dabbler open`):** When a check fails or a stop occurs, let the user press a key in `dabbler watch` to open the offending file or transcript directly in Visual Studio (`devenv.exe /edit <file> /command "Edit.GoTo <line>"`).

---

### 6. What to find out from the developers first

**Questions to ask them:**
1.  "How many monitors do you use?" (With two monitors, Option 1's window-switching cost drops by 80%. On a single laptop screen, Option 1 is painful.)
2.  "Which exact project types in our repos are you working in?" (Confirm whether they are actually touching `.NET 4.5` non-SDK projects, `.edmx` files, or classic IIS Express debugging, or only modern `.NET 8` SDK-style projects.)
3.  "When you debug these apps, do you run them under IIS Express from inside Visual Studio, or from the command line?"

**The one trial to run:**
Pick two Visual Studio holdouts. Have them use **Option 1 (VS 2022 for code and debugging, VS Code strictly as the Dabbler console)** on a real task for **three days**, with one rule: *they are forbidden from opening any `.cs` file in VS Code*.

At the end of three days, ask them to show you the exact moments that annoyed them.
*   If they complain about MSBuild file locks (`bin/obj` contention) or `.csproj` reload dialogs, **building a VS extension (Option 3) will not fix their problem**, because Dabbler's background builds will collide with VS either way.
*   If they complain that clicking a file in a Dabbler transcript or check failure opens it in VS Code instead of Visual Studio, and that Alt-Tabbing to click "Continue" is tedious, then an inside-VS interface (or a terminal dashboard with `devenv /edit` hooks) is justified.
*   If they quietly get their work done and stop complaining once they realize nobody is taking away their VS debugger, you are done. Keep Option 1.

---

### 7. What would make this fail

1.  **MSBuild and IIS Express file-lock wars between Visual Studio and Dabbler.** This is the #1 technical risk for legacy .NET Framework solutions, regardless of which UI option you pick. When Dabbler runs `msbuild` and `vstest` in the background while the solution is open in VS 2022, they share `bin/` and `obj/`. If Dabbler does not isolate its build output (or if legacy `.csproj` hardcodes `<OutputPath>bin\</OutputPath>` in a way that resists overriding), builds will fail randomly with file-in-use errors whenever the developer touches VS.
2.  **Legacy `.csproj` merge conflicts and reload storms.** In .NET 4.5 non-SDK projects, every added or deleted file modifies `.csproj`. As the authoring AI adds files step by step, Visual Studio will repeatedly pause to reload the project, or refuse to reload if the developer changed a project property or NuGet package in the IDE.
3.  **Porting the 2,600-line tree models into C# and then into Kotlin.** If you duplicate the state logic of Work Explorer and Solution Explorer in TypeScript, C#, and Java/Kotlin, the three extensions will drift within months. If you build native extensions, the router *must* take over computing the exact tree state.
4.  **Relying on Visual Studio's built-in terminal to host Claude Code or Copilot CLI.** VS's integrated terminal is not as battle-tested for heavy TUI redraws as VS Code's `xterm.js` or Windows Terminal, and its extension APIs for programmatic control are undocumented/internal. Plan from day one to launch engine CLIs in Windows Terminal (`wt.exe`) or an embedded `xterm.js` webview when running from Visual Studio.