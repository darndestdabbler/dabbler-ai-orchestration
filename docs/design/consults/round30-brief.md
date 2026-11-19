# Consult: the engine inside Visual Studio, and a Dabbler layout

## What Dabbler is

Dabbler is an AI-led session framework. A person plans numbered sessions
in prose. The framework drives each session one instruction at a time: an
authoring AI (Claude Code or the GitHub Copilot CLI, each a full-screen
program in a terminal) edits the files; the framework runs the checks and
the test suites, has a model from a different provider review the diff,
commits, pushes and closes. A session runs for many minutes to an hour or
more, mostly without the person. The person talks to the authoring AI in
its terminal when they want to, and must act when a session stops.

The router (`dabbler <verb>`, a Node program) decides everything. Two
interfaces render what it prints: a VS Code extension, and a Visual Studio
extension that has just been finished as a draft.

## The Visual Studio extension as it stands

In-process VSSDK, C#, .NET Framework 4.7.2, WPF. It installs on Visual
Studio 2022 (17.14) and 2026; only 2026 has been walked. It has:

- **Work Explorer**, a tool window registered as a tab beside the Solution
  Explorer: the plan's sessions by status, each row's actions.
- **Configuration**, a tool window, also beside the Solution Explorer.
- **Dabbler Terminal**, a tool window registered as a tab beside Output:
  one line per framework event. Read-only.
- **The engine in Windows Terminal, outside Visual Studio.** Start Session
  runs `wt.exe -w Dabbler new-tab -d <folder> --title <title> <program>
  <arguments>`, with a plain console as the fallback. The router prints
  the launch line (program, arguments, folder, environment); one C# file
  decides where it runs.

The engine was put outside Visual Studio on 2026-11-17 for four reasons:
no undocumented service and no embedded terminal to maintain; a session's
engine outlives a Visual Studio that is closed, restarted for an update or
crashed; the engines appear in the terminal their makers test against; and
the same call serves both Visual Studio versions.

## What the operator now wants

1. **The AI CLI inside Visual Studio**, not in a separate Windows Terminal
   window.
2. **A standard Dabbler layout**, as the VS Code extension has: Solution
   Explorer and Work Explorer on the left, the AI CLI in the middle, the
   Dabbler Terminal on the right. And an easy way to switch between that
   and a coding layout: Solution Explorer on the left, the code in the
   middle, Class View or Test Explorer on the right, a terminal at the
   bottom.

The operator has agreed to both in principle. What is asked of you is how.

## What was found, and how sure it is

- **No documented way was found for an extension to open a tab in Visual
  Studio's own built-in terminal and start a program in it.** Searched
  twice, in round 29 and now.
- **A public MIT extension (dliedke/ClaudeCodeExtension) runs an agent's
  CLI in a tool window** on Visual Studio 2022 and 2026, hosting Command
  Prompt or, as an option, Windows Terminal. Its change log lists: the
  terminal visible but not accepting typing, arrow keys or paste after a
  click; a blank terminal after a restart; broken copy and paste; a
  runaway font size; closing one Visual Studio killing the terminal in
  another; Shift held down in another application. It later made a chat
  pane the default, speaking each agent's own protocol, and kept the
  terminal as an option. Our inference, not read from its source: the
  terminal is another process's window placed inside the tool window.
- **Microsoft's WPF terminal control** (`Microsoft.Terminal.Wpf`, in the
  Windows Terminal repository) with the `Microsoft.Windows.Console.ConPTY`
  package from NuGet is the other route. One third-party source says the
  WPF control is not officially packaged and that wrappers depend on beta
  packages. Not built here.
- **Window layouts** (Microsoft's documentation, current): a person saves
  up to ten named layouts with Window > Save Window Layout, applies them
  with Window > Apply Window Layout or Ctrl+Alt+1 to 0, and they roam with
  the account. Some tool windows can be docked as tabs in the editor
  area. No documented way was found for an extension to add a named
  layout to a person's list, or to apply one by name.
- An engine hosted inside Visual Studio is a child of it. If its process
  ends, the session's record survives and the engine can be opened again
  on the same session; the work in flight in that engine is lost.

## Two instructions from the operator about how to answer

- **Do not let the time it would take decide anything.** Give no estimate
  in weeks or months and do not rank options by effort. You may say what
  an option obliges the maintainer to keep doing afterwards.
- **What should decide is the developer's experience**: what their day is
  like under each choice.

## What is wanted from you

Disagreement is worth a paragraph and agreement one line. Say when you are
unsure of a fact about Visual Studio, and name the version you speak of.
Where you know an API, name it exactly (interface, method, package), and
say whether it is documented. Answer in this shape:

1. **Verdict, first.** How the engine should be hosted inside Visual
   Studio, and how the layout should be offered, in two sentences each.

2. **Hosting the engine.** Compare: (a) another process's window placed in
   a tool window; (b) `Microsoft.Terminal.Wpf` with ConPTY; (c) Visual
   Studio's own terminal through whatever service it has; (d) a WebView2
   with xterm.js over ConPTY; (e) anything better. For each: does it work
   in an in-process net472 extension on 2022 and 2026, what a developer
   meets day to day (keys Visual Studio takes before the terminal does:
   Esc, Shift+Tab, Ctrl+C, Ctrl+V with an image, arrows, Ctrl+Enter;
   focus; resize; theme and font; high-DPI), and what the maintainer must
   keep up with.

3. **When Visual Studio closes.** The engine dies with its host unless
   something is done. Should it be allowed to (with a warning and a clean
   way to reopen), or should the terminal's process be owned by a small
   host outside Visual Studio that the tool window attaches to, so a
   session survives a restart? Say what the developer experiences each
   way, and whether the second is worth what it obliges.

4. **Windows Terminal as it is today.** Keep it as a setting, keep it only
   as the fallback when the embedded terminal cannot start, or remove it?

5. **The layout.** How should an extension offer "Dabbler layout" and
   "back to coding"? Consider: the extension places only its own windows
   and hides them again; the extension tells the person to save two
   layouts and use Ctrl+Alt+1 and 2; the extension writes or applies
   layouts itself by some means you know of. Which API moves a tool window
   into the editor area and docks another on the right, and is it
   reliable? Should Start Session apply the Dabbler layout by itself, as
   Visual Studio changes layout when debugging starts, or is that an
   imposition? What happens to the layout when the debugger starts during
   a session?

6. **More than one engine.** A session's engine, a consult and a Mechanic
   can each be open at once. Tabs inside one tool window, one tool window
   each, or documents in the editor area?

7. **The first session to plan.** What should the first, proving session
   build and try, so that a wrong choice in 2 is found before anything is
   built on it?

8. **What would make this fail.**
