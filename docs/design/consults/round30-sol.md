## 1. Verdict

**Hosting.** Put the real Claude Code and Copilot CLI in a Dabbler tool window, using WebView2 with xterm.js for display and input, and ConPTY for the terminal connection. Put the running CLI and its ConPTY in a small process outside Visual Studio, so closing the IDE closes the view, not the session.

**Layout.** Make **Dabbler** and **Coding** user-saved Visual Studio window layouts, and give the operator a setup walkthrough that uses Visual Studio’s own layout commands. Do not rearrange the IDE on Start Session; make switching layouts an explicit action.

## 2. Hosting the engine

I would choose by how the terminal feels after the developer has clicked from code to the CLI, used a shortcut, pasted an image, and gone back to code. A clean screenshot of a blinking prompt proves almost nothing. The version targets below are **Visual Studio 2022 17.14** and **Visual Studio 2026**; I would not call any new host verified on either until it has been walked there.

### (a) Put another process’s window inside a tool window

**Can it work?** Yes in principle on both versions: a net472 extension can call the documented Win32 `SetParent` API and bridge an HWND into WPF with the documented `System.Windows.Interop.HwndHost`. That does not make an arbitrary console or Windows Terminal window a supported embeddable control. Inspect the MIT extension’s source before treating it as evidence for this exact implementation; the change log establishes the symptoms, not the mechanism.

**What the developer gets.** When it works, the developer gets the other terminal’s renderer, settings, and input behavior. When it fails, the developer gets a window they can see but cannot reliably type into. Cross-process focus and activation make click-to-type, returning from a VS command, and preserving modifiers particularly suspect. Reparenting is not a guarantee that Esc, Shift+Tab, arrows, or Ctrl+Enter will reach the CLI; nor is it a guarantee that Ctrl+C and clipboard paste, especially an image gesture, will behave as they do in standalone Windows Terminal. The child owns its fonts and theme. Docking and resizing require coordinating two windows, and `SetParent` has documented DPI-awareness caveats. Moving a docked or floating pane between monitors is a real test, not a polish item.

**What the maintainer owns.** Window discovery and ownership, activation, DPI behavior, resizing, and every regression caused by a change in the other program’s window structure. I would reject this for the standard developer experience: it can look the most like Windows Terminal and still be the least dependable place to type.

### (b) `Microsoft.Terminal.Wpf` with ConPTY

**Can it work?** Plausible, not established on either target. The documented Win32 APIs are `CreatePseudoConsole`, `ResizePseudoConsole`, and `ClosePseudoConsole`; `Microsoft.Windows.Console.ConPTY` is a separate NuGet dependency to evaluate, not evidence of a supported pairing with the WPF renderer. I would treat `Microsoft.Terminal.Wpf` as a Windows Terminal source dependency until a build proves exactly which managed and native artifacts can be shipped and loaded in the net472 VS process on both versions. I do not know of a supported distribution of that control for this use.

**What the developer gets.** A native terminal renderer is attractive, but using code from Windows Terminal does not bring along the Windows Terminal application’s focus handling, settings, or shortcut routing. Dabbler still has to get terminal keys past VS and WPF, implement selection versus interrupt for Ctrl+C, and preserve the CLI’s image-clipboard gesture rather than turning it into plain-text paste. The control’s actual rendering host determines how docking, font changes, theme changes, resize, and per-monitor DPI behave. I would test those rather than infer them from standalone Windows Terminal.

**What the maintainer owns.** The renderer build and native dependencies, the renderer-to-ConPTY bridge, and compatibility with two VS hosts. I would keep it as a candidate if the web renderer fails a real interaction test, not prefer it merely because it shares Windows Terminal code.

### (c) Use Visual Studio’s built-in terminal

**Can it work?** I do not know of a documented launch-and-attach API for VS 2022 17.14 or VS 2026. Showing the built-in terminal window, if you can do it, is not the same as opening a particular tab with Dabbler’s executable, arguments, working directory, and environment and tying that tab to a session.

**What the developer gets.** A *supported* integration here would be attractive: familiar focus, terminal settings, and shell behavior. An internal service gives no promise about those behaviors for an extension-created terminal, including keys, image paste, tab ownership, and what happens on close. Sending keystrokes to a visible shell to get around the missing API would be worse: the developer could end up typing into the wrong prompt or Dabbler could start in the wrong shell context.

**What the maintainer owns.** Private service discovery and regressions across VS updates. I would not ship this route. Reconsider it if Microsoft publishes an API that covers launch, identity, focus, and lifetime.

### (d) WebView2, xterm.js, and ConPTY

**Can it work?** This is the best-supported set of pieces for the job. `Microsoft.Web.WebView2` supplies the documented `Microsoft.Web.WebView2.Wpf.WebView2` control for .NET Framework, including net472; xterm.js runs inside it, and the broker uses the documented ConPTY APIs. That establishes a viable architecture, not compatibility proof for either VS version. Verify WebView2 SDK loading and runtime discovery in the actual VSIX on both, and test WPF hosting rather than assuming its behavior from a standalone sample.

**What the developer gets.** A real terminal, with scrollback, selection, and the CLI’s full-screen UI, without someone else’s top-level window inside the IDE. Use a deliberate **terminal focus** policy: once the terminal has focus, Esc, Shift+Tab, arrows, and any CLI-supported Ctrl+Enter gesture belong to it; provide a discoverable way back to the IDE. xterm.js’s documented `Terminal.attachCustomKeyEventHandler` can arbitrate keys that reach the page, but it cannot recover a key already consumed by VS or WebView2. The documented `CoreWebView2Controller.AcceleratorKeyPressed` event is another interception point where the host exposes the controller; it is not a VS-wide key-routing solution.

Make Ctrl+C copy a selection and otherwise send the terminal interrupt input. Treat text paste and image paste as different paths: an image is not terminal text. Verify each CLI’s Windows clipboard gesture against standalone Windows Terminal, then make sure VS and WebView2 do not swallow it or replace it with browser text paste. Likewise, do not assume Ctrl+Enter has a portable encoding or that both CLIs use it the same way. Compare the actual behavior with the standalone reference. Fit the terminal to the pane in rows and columns and propagate those dimensions to ConPTY. Follow the VS theme by default, give terminal font and size their own settings, and test mixed-DPI monitors and docking overlays; normal WPF WebView2 hosting has HWND airspace constraints.

**What the maintainer owns.** The WebView2 runtime and SDK compatibility, pinned xterm.js assets, input routing, the terminal transport, and fidelity tests after CLI updates. Serve only local UI assets, keep terminal output as data, and prevent unrequested navigation or clipboard writes. Of the choices, this one gives Dabbler the best control over the interactions that matter without depending on a private VS service or another application’s window.

### (e) Anything better?

Not for the stated goal. An agent-protocol chat pane can give excellent IDE-native input, accessible controls, and explicit image attachments, but it replaces the CLI experience rather than hosting it. It also makes Dabbler responsible for keeping up with two agents’ interaction models. A future supported VS API would be worth revisiting; a chat pane is a separate product choice.

## 3. When Visual Studio closes

**Warning and reopen** is defensible as an explicitly labelled mode. It means that when the developer closes VS, the extension can warn that the active engine will stop; after reopening, Dabbler can recover the session record and offer to restart the engine. It cannot restore the live CLI turn or terminal state, and there may be partially edited files or an interrupted check. A crash or forced restart gives no opportunity to warn. Also, Windows does not automatically kill every child when a parent exits; whether an engine stops depends on who owns the ConPTY, its pipes, and the process-lifetime policy. Make stopping intentional, not incidental.

**Use the outside broker for the normal embedded experience.** Dabbler sessions are specifically meant to run unattended; an IDE restart should not silently turn an ongoing session into one that needs human recovery. Let the broker own the engine, ConPTY, and output drain even when no view is attached. After restart, the tool window should rediscover the session, show the current terminal state, and resume interaction. The UI should distinguish **Detach** from **Stop engine**, and distinguish **Reattach to running engine** from **Restart stopped engine**. If the CLI needed a person while VS was closed, it will still be waiting; surviving a restart is not the same as making progress without input.

That is worth the obligation, but only if reattachment is real: a full-screen CLI needs its current screen and modes, not just the last few output lines. Define snapshot/replay behavior, bounded buffering, a single input owner, per-user IPC access, and cleanup when a session ends. No promise of survival across Windows sign-out, reboot, or broker failure. Keep session decisions in the router; the broker owns processes and terminal I/O, not the workflow.

## 4. Windows Terminal as it is today

**Keep it as a setting and as a recovery route.** Some developers will prefer the known keyboard behavior or a dedicated terminal window. Offer **Embedded** and **Windows Terminal** as explicit launch choices. If embedded startup fails *before an engine exists*, explain the failure and offer Windows Terminal. If an engine already exists, offer to reconnect or explicitly stop and relaunch; do not silently start a second engine for the same session. The current `wt.exe` launch is not a way to attach Windows Terminal to an existing broker-owned ConPTY.

## 5. The layout

**Let the developer save two native layouts.** Give Dabbler a **Set up layouts** command or walkthrough. Open the Dabbler panes, then show the developer how to place Work Explorer with Solution Explorer on the left, dock the engine as a tab in the editor area, and dock the read-only Dabbler Terminal to the right. Save that as **Dabbler**. Then arrange code in the center, Class View or Test Explorer to the right, and the terminal at the bottom, and save **Coding**. Use **Window > Apply Window Layout** and the shortcuts shown there. Ctrl+Alt+1 and Ctrl+Alt+2 are good examples if those slots are free, not assignments the extension should take over. Check the exact placements on both VS versions, especially with a floating window or second monitor.

**Place only your own windows by default; don’t call that a layout switch.** The documented `Microsoft.VisualStudio.Shell.ProvideToolWindowAttribute` supports initial docking hints, for example `Style = VsDockStyle.Tabbed` with `Window` identifying the Solution Explorer anchor. `AsyncPackage.ShowToolWindowAsync` and `IVsWindowFrame.Hide` are documented ways to show and hide panes without redefining the workspace. Opening or hiding those panes is a useful command in its own right, but it cannot restore Class View, editor groups, and the developer’s bottom terminal to their previous positions. Hiding an engine pane should detach the view, not stop the session.

**There are public window APIs, but I would not use them to compose the whole workbench.** `IVsWindowFrame.SetFramePos` is documented frame positioning, not a reliable contract for “make this tool window a tab in the active editor group and dock that other tool window on the right of this monitor.” I do not know a documented API that guarantees those exact placements on either VS 2022 17.14 or VS 2026. Use Visual Studio’s own docking UI for those placements. There is also a documented legacy automation surface: `EnvDTE._DTE.WindowConfigurations`, `EnvDTE.WindowConfigurations.Item`, and `EnvDTE.WindowConfiguration.Apply()`. I have not verified that it exposes and applies entries from the current **Window > Save Window Layout** list on either target. Test that against two *user-saved* layouts; if it works on both, optional **Switch to Dabbler** / **Switch to Coding** commands can apply a layout the user has selected. Do not write private layout files or rely on inferred command names.

**Start Session should not switch layouts.** The developer may be starting a long run and going straight back to code. Start it, show status, and let **Focus Engine** or an explicit layout command move their attention. Debugging is a separate IDE mode: VS can change visible panes and focus on entry and restore its design-time arrangement on exit. I would not promise exactly what a named layout applied during debugging does on either target without testing it. Do not have Dabbler fight the debugger or reapply a layout on mode changes. The engine keeps running, events keep accumulating, and **Focus Engine** brings the view back when wanted.

## 6. More than one engine

**Use tabs inside one Engine tool window.** Give the session engine, consult, and Mechanic clear labels, running or waiting status, and attention indicators. A background tab asking for input must not steal focus. Switching tabs should preserve the live terminal, and closing a view tab should be distinct from stopping its process.

One tool window per engine makes the layout depend on which engines happen to be open. Editor documents put engines among code tabs and give ordinary document-close gestures ambiguous consequences. A single tool window docked as a tab in the editor area gives the center position the operator wants without making each engine an IDE document. Add separate panes only if seeing two live engines side by side turns out to be a real need.

## 7. The first proving session

Build **one disposable VSIX with one engine pane**. Feed it the router’s real launch specification and run stock Claude Code and Copilot CLI through WebView2/xterm.js and ConPTY. Keep Windows Terminal as the reference. Don’t build the multi-engine UI or layout automation on top of the pane until this passes.

Walk the same script on **VS 2022 17.14 and VS 2026**:

1. **Input and focus.** Move between code, Work Explorer, and the engine by mouse and keyboard. Exercise Esc, Shift+Tab, arrows, Ctrl+C with and without a selection, text paste, the real image-paste gesture, and Ctrl+Enter where the CLI supports it. Include a multiline prompt and a full-screen redraw. Record whether a mismatch occurs in VS routing, the WebView, terminal encoding, or the CLI.
2. **Rendering and docking.** Dock the engine in the editor area, resize it repeatedly, hide and reopen it, change theme and font, and move the window between different DPI monitors. Compare selection, cursor placement, scrollback, and redraw with Windows Terminal.
3. **Lifetime.** Use a minimal outside host to keep a CLI producing output while the view is detached and VS is closed. Reopen VS and recover a live full-screen prompt, then type successfully. Repeat with VS terminated, not just gracefully closed. A surviving PID with a blank or stale terminal does not pass.
4. **Layout and debugging.** Manually save the two layouts, switch between them during a session, then enter and leave debugging. Separately probe whether `EnvDTE.WindowConfiguration.Apply()` can apply those same named entries. Failure of the automation probe should leave the manual workflow intact.

The acceptance test is whether a developer can use either CLI without keeping Windows Terminal open to do the things that matter. If VS irrevocably captures an essential gesture, or if rendering or focus fails in a way the developer will encounter routinely, isolate that failure and test an alternative renderer against it. Don’t commit to a renderer because ordinary typing works.

## 8. What would make this fail

- **The engine looks embedded but doesn’t behave like a terminal.** Lost Esc, intermittent focus, or image paste that silently becomes text will send the developer back to Windows Terminal.
- **Reattach is just relaunch with a nicer label.** Losing the live turn, returning to a stale screen, or creating a second authoring process against the same worktree breaks trust in long-running sessions.
- **The layout takes over the IDE.** Starting work, receiving an event, or hitting a breakpoint should not unexpectedly move windows or take focus from code.
- **The proof uses a shell instead of the two agents.** A command prompt can look fine while full-screen redraw, clipboard gestures, or modified keys fail in real use.
- **Compatibility is inferred from one machine.** Passing on VS 2026 does not establish VS 2022 17.14 behavior, and passing with a single monitor and a familiar runtime installation does not establish the experience on another developer’s workstation.
