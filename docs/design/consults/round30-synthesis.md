# Round 30 synthesis: the engine inside Visual Studio, and a Dabbler layout

Asked 2026-11-19 of `gpt-6.2-sol` and `gemini-4-argon`, direct API, the
same brief (`round30-brief.md`). Their answers are `round30-sol.md` and
`round30-gemini.md`. Both were told not to estimate effort in time and to
judge by what a developer's day is like.

The operator had already agreed to both things in principle: the AI CLI
inside Visual Studio, and a standard Dabbler layout with an easy way back
to a coding layout. The round asked how.

## Where they agree

- **The terminal is a WebView2 control showing xterm.js, joined to the
  engine through ConPTY.** WebView2's WPF control is documented for .NET
  Framework 4.7.2, ConPTY is a documented Windows API, and xterm.js is the
  terminal the engines already run in inside VS Code.
- **Not another program's window placed in a tool window.** Typing that
  stops after a click, stuck modifier keys and broken scaling between
  monitors come with that route and do not go away.
- **Not Visual Studio's own terminal.** No documented way to open a tab
  in it and start a program; an internal service changes without notice.
- **Not Microsoft's WPF terminal control as the first choice.** It has no
  supported package, and it brings a native library to build and ship.
  Sol keeps it as the second candidate if the web terminal fails the
  walk.
- **The keys are the thing that decides it.** Visual Studio takes Esc,
  Shift+Tab, Ctrl+C, Ctrl+V and others before a pane sees them. The pane
  must keep them while the terminal has focus and still let the person
  leave by keyboard.
- **The engine must not die with Visual Studio.** A small program outside
  Visual Studio owns the engine and its terminal connection; the pane
  attaches to it and attaches again after a restart or a crash. Sessions
  are meant to run without the person, and Visual Studio restarts often.
- **Windows Terminal stays**, as a choice and as the way out when the
  embedded terminal cannot start. Never a second engine for a session
  that already has one.
- **The first session proves the terminal with the two real engines,**
  not with a shell, before anything is built on it.

## Where they split

- **How the layout is offered.** Sol: the person arranges and saves two
  layouts with Visual Studio's own commands, and the extension only shows
  and hides its own windows; no documented call is known to place windows
  exactly. Argon: one toggle; the extension records the current
  arrangement through `EnvDTE.WindowConfigurations`, arranges the Dabbler
  windows, and puts the recorded arrangement back.
- **Whether Start Session changes the layout.** Sol: never; the developer
  may be going straight back to code. Argon: yes by default, with a line
  that says so and a setting.
- **More than one engine.** Sol: tabs inside one Engine window. Argon:
  each engine a window of its own, docked as a tab in the editor area, so
  Visual Studio's own tab handling applies (side by side, another
  monitor, Ctrl+F4).
- **When the outside program is built.** Sol: in the proving session,
  with a test that Visual Studio is killed and the live prompt comes
  back. Argon: in the second session, once the keys are proved.
- **What comes back on reattaching.** Argon: the last few thousand bytes
  replayed. Sol: that is not enough for a full-screen program, which
  needs its current screen and modes.

## Their claims, checked and not

Checked on this machine (Visual Studio 2026, 18.12):

- Visual Studio ships `Microsoft.Terminal.Wpf.dll` (1.22) for its own
  terminal, as Argon said. It is Visual Studio's private copy, not
  something an extension is offered.
- Visual Studio's own terminal keeps `conpty.dll` and `OpenConsole.exe`
  in a service folder apart from the IDE's process, which reads as
  Microsoft making the same choice both advisors recommend. Inferred from
  the folder layout, not from running it.
- `Microsoft.Web.WebView2.Wpf.dll` is in Visual Studio's private
  assemblies. An extension that ships its own copy may be given Visual
  Studio's instead: the proving session must find out which version
  loads.

Not checked, or wrong:

- Argon's `Style = vsDockStyle.Right` is not a value of `VsDockStyle`.
  The documented values include `MDI`, which is the one that opens a tool
  window as a tab in the editor area.
- Whether `EnvDTE.WindowConfigurations` still records and restores an
  arrangement in Visual Studio 2022 and 2026. Its documentation is for
  Visual Studio 2010 and 2015. Sol says plainly it is unverified; Argon
  states it as fact.
- Argon's account of what the debugger does to open tool windows.
- That the WebView2 runtime is on every machine Visual Studio is on.
- Argon's "very low" for what the maintainer must keep up with is an
  estimate of effort and is set aside, as the brief asked.

## Recommended, for the operator to approve

1. **WebView2 with xterm.js over ConPTY.** This replaces the
   recommendation made before the round, which was Microsoft's WPF
   terminal control: both advisors reject it as the first choice for a
   reason that holds, and it becomes the second candidate.
2. **Prove the keys first, alone.** The first session builds one engine
   pane and walks it with Claude Code and the Copilot CLI in Visual
   Studio 2026: Esc, Shift+Tab, arrows, Ctrl+C with and without a
   selection, pasted text, a pasted image, resize, theme, two monitors.
   Its page ends "go" or names what failed. Argon's order, because a
   failure here changes the choice of terminal and nothing built on it
   should exist yet.
3. **Then the program outside Visual Studio,** as a session of its own,
   held to Sol's test: Visual Studio is killed, reopened, and the live
   prompt is there and takes typing. It owns processes and bytes and
   decides nothing. What it obliges: one more program shipped in the
   package, and engines that must be ended when their session ends so
   none is left running.
4. **Each engine is its own tab in the editor area** (Argon). It is where
   the operator asked for the engine to be, it is how VS Code shows
   engine terminals, and a session's engine can sit beside a consult.
   Closing a tab leaves the engine running; the session's row brings it
   back.
5. **One command, Dabbler Layout, and the same command back** (Argon's
   toggle, on Sol's condition). The layout session's first step tries
   `EnvDTE.WindowConfigurations` on this machine. If it puts an
   arrangement back, the toggle restores exactly what the person had. If
   it does not, the toggle shows and hides Dabbler's own windows and
   moves nothing of the person's. Nobody is asked to arrange windows by
   hand; the guide says Visual Studio's saved layouts exist for those who
   want them.
6. **Start Session opens the engine's tab and moves nothing else** (Sol).
   A new tab in the editor area is what opening any file does. Applying
   the whole layout at the start is an option, off unless the person
   turns it on.
7. **Windows Terminal remains a choice** in the extension's options, and
   is what opens when the embedded terminal cannot start.
8. **Visual Studio 2022 is claimed only when someone has walked it,** as
   now.
