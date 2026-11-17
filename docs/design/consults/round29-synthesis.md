# Round 29 synthesis: Dabbler for developers who work in Visual Studio

Asked 2026-11-17 of `gpt-6.1-sol` and `gemini-4-argon`, direct API, the
same brief (`round29-brief.md`). Their answers are `round29-sol.md` and
`round29-gemini.md`. Both were told not to estimate effort in time and not
to rank by it, and to judge each option by what a developer's day is like,
in particular the going back and forth between Visual Studio and VS Code.

The three options: (1) Visual Studio for the code with VS Code beside it
as the Dabbler console, which works today; (2) no VS Code, Dabbler driven
from a terminal; (3) the person's interface built for Visual Studio.

## Where they agree

- **The developers are right that they need Visual Studio** for .NET
  Framework MVC: debugging under IIS Express, designers, non-SDK project
  support, the older Razor tooling. Dabbler should not make changing
  editors part of adopting it.
- **Trial option 1 first, with real developers on real work,** all code,
  diffs and debugging in Visual Studio and VS Code used only as the
  console. Write down each switch of window and why it happened.
- **The switching is not constant. It is concentrated at stops.** A quiet
  session needs a visit to start it and a visit when it ends. A stop that
  needs the code read is the bad one: read the stop in VS Code, read the
  code in Visual Studio, go back to answer.
- **The worst trouble is not the interface at all.** Visual Studio and a
  session are two writers in one checkout: project reloads when a non-SDK
  `.csproj` gains a file, `bin` and `obj` locked by a design-time build, a
  test host, IIS Express or a debugger, an unsaved file or an open
  designer overwritten or overwriting. This happens under all three
  options, and an extension inside Visual Studio does not remove it.
- **Option 2 is a punishment as it stands.** It needs an install that is
  not the VS Code extension, a live view in place of typing `status`, and
  stops that say what to run next.
- **If an extension is built, the in-process VSSDK, with the router in its
  own Node process and a private Node shipped with it.** The Dabbler
  Terminal becomes an event list in a tool window, not a terminal.
- **The engine terminal is the hard part.** Neither is confident that
  Visual Studio offers a public way to open its own terminal and start a
  program in it. Both would open Windows Terminal or embed a terminal
  component, and neither would write one.
- **One implementation is kept by the router computing what is shown.**
  No second interface re-derives a tree or decides whether an action is
  allowed.

## Where they split

- **Native or shared.** Sol: for Visual Studio alone, native tool windows;
  a shared web page shown inside each editor only once three editors are a
  firm commitment. Argon: the shared page now, served by the router, with
  each editor a thin panel and a bridge for "open this file at this line",
  because the interface is status, buttons and a log and gains nothing
  from being native.
- **Where the tree models go.** Sol: run the existing TypeScript models in
  Node and send snapshots. Argon: move them into the router, as a verb
  that prints what an interface should show.
- **How much Sol leans to option 3.** Sol names it the target for Visual
  Studio users on principle: a stop's controls belong beside the files
  and the debugger needed to answer it. Argon builds nothing unless the
  trial shows the second window is the grievance.

## Their claims, not checked here

Both spoke of Visual Studio 2022. This machine has Visual Studio 2026,
and nothing they said about its extension models, its terminal or its
reload behaviour was verified. Argon's statements that the built-in
terminal lags under a redrawing CLI, and that git's index lock is
contended by Visual Studio's background status, are plausible and
untested. A walk on this machine with a non-SDK solution open would
settle the reload, lock and terminal questions at no design cost.

Sol's point that a session commits its work, so Visual Studio's Git
Changes pane is empty when the developer comes to look, is true of the
framework: the record holds the session's start commit, and nothing puts
the pair of commits in front of a person in Visual Studio.

## Recommended, for the operator to approve

1. **Tell the developers they keep Visual Studio.** Nobody writes or
   debugs code in VS Code.
2. **Walk it on this machine first:** a session run on the non-SDK
   ContosoUniversity fork with the solution open in Visual Studio, to find
   the reloads, the locks and what the engine CLIs do in its terminal, and
   to write the page that says how to work beside Visual Studio.
3. **Trial option 1 with two of the developers,** and take their list of
   switches that grated.
4. **Three small things serve every option and are planned from 2 and 3:**
   a notice when a session stops or ends, a file link that opens in the
   developer's own editor, and a session's start and end commits given for
   comparison.
5. **If the second window is still the grievance, the first step is the
   same whichever interface follows:** the router prints what an interface
   should show, and the VS Code extension reads that. Native tool windows
   or a shared page is decided then, not now.
