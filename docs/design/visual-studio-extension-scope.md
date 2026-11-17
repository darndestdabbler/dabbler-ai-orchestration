# A Dabbler extension for Visual Studio: what would be involved

Written 2026-11-17 for the operator, after consult round 29
(`consults/round29-synthesis.md`). It scopes the work; it plans no session
and decides nothing. No estimate of time is given anywhere in it. Facts
about this repository were read from the source today. Facts about Visual
Studio come from Microsoft's documentation and from other extensions'
source, and none was tried on this machine: each is marked where it
matters.

## What the operator asked for

Four things inside Visual Studio:

1. A way to run the authoring AI's CLI and talk to it.
2. The Dabbler Terminal's output.
3. The Configuration section of the Solution Explorer.
4. The Work Explorer.

Node is a stated prerequisite, installed by the developer and on PATH, as
the engine CLIs already are. The extension carries no Node of its own.

## What the VS Code extension is today

11,886 lines of production TypeScript, and about as much again in tests.

| Part | Lines | Uses the VS Code API? |
|---|---|---|
| Work Explorer: the model, the rule for which action a row offers, labels | 1,720 | No |
| Work Explorer: putting rows on screen, refreshing | 335 | Yes |
| Solution Explorer model, of which Configuration is about 870 | 1,497 | No |
| Solution Explorer: putting rows on screen, watching files | 339 | Yes |
| Configuration: the pickers and writes | 794 | Yes |
| Dabbler Terminal: reading the run's records and formatting lines | about 1,900 | About a dozen lines |
| Dabbler Terminal: the VS Code terminal around it | about 260 | Yes |
| Session commands: start, stop, close, cancel, restore, rollback, waive, report, consult, Mechanic | 1,933 | Yes |
| Set up a project, open and clone repositories, the troubleshooter | 1,269 | Yes |
| The rest: activation, the `dabbler` command on PATH, opening files | about 1,800 | Mostly |

Three facts shape everything below.

- **The parts that decide what a person sees are already free of VS
  Code.** The two tree models take the router's reading and return plain
  rows: a label, a description, a tooltip, an icon, whether it opens, and
  the actions it offers. The Dabbler Terminal reads files under
  `.dabbler/runs/` every half second and formats lines; it takes no input
  from the person.
- **They live in the wrong place for a second interface.** They are in the
  extension, not in the router, and the router's command line cannot print
  them. `dabbler status` prints the session reading as JSON; the
  Configuration reading has no JSON form at all; four commands' results
  are picked out of printed text by pattern.
- **Start Session is two steps any interface can do.** It runs `dabbler
  session start` and waits, then opens a terminal whose program is
  `claude` or `copilot`, with the model and one opening sentence as
  arguments, the repository as the working directory and one environment
  variable. The session is then driven by the engine's own answer
  commands. The extension does not drive it, so closing the interface
  does not end a session whose terminal lives elsewhere.

## The shape of it

**The router computes; each interface renders.** The models move from the
VS Code extension into the router, and the router gains verbs that print
what an interface should show:

- the Work Explorer's rows, with each row's actions;
- the Configuration rows, with the values each may be set to;
- the Dabbler Terminal's lines, followed live;
- the line that launches an engine: program, arguments, working
  directory, environment and the opening sentence, which today are built
  inside the extension.

The VS Code extension then reads the same output and loses the code it
gave up, so there is still one implementation of every rule, and the
change is worth having with no Visual Studio extension at all: it is also
what a person at a bare terminal lacks today, and what an IntelliJ or
Eclipse panel would read.

**The Visual Studio extension is C# that renders and asks.** It starts
`node` on the router's bundle, reads JSON, draws two tool windows and a
log, shows dialogs, and calls the same verbs a person could type. It
decides nothing: whether an action is offered comes with the row, and the
router checks again when the action is called.

**Which extension model.** Microsoft's guidance is to start with the newer
out-of-process model and go in-process when an interface is missing. This
extension needs several that the newer model's documentation does not
show: opening a file at a line, a comparison between two commits, an
information bar, knowing whether a build or a debugger is running, and
anything to do with a terminal. So it is an in-process extension, written
against the older SDK or the documented mix of the two. One package
installs on Visual Studio 2022 (17.14) and 2026 (18.x). *(From the
documentation; not built here.)*

## Where the engine runs: Windows Terminal, beside Visual Studio

Claude Code and the Copilot CLI are full-screen terminal programs. VS Code
gives an extension a terminal to run them in. Visual Studio has a built-in
terminal, and no documented way was found for an extension to open a tab
in it and start a program.

The operator's decision, 2026-11-17: the engine does not run inside Visual
Studio. The extension opens it in Windows Terminal, as a new tab in a
window named for Dabbler, with the repository as its folder and `claude`
or `copilot` as its program; where that window is already open, the tab
is added to it. Windows Terminal takes all of this on its command line.

What that gains:

- **No undocumented service and no embedded terminal to maintain.**
- **A session outlives Visual Studio.** Closed, restarted for an update or
  crashed, the engine carries on. Inside Visual Studio it would end with
  it.
- **The engines appear as their makers ship them,** in the terminal they
  are tested against.
- **The same call serves Visual Studio 2022 and 2026,** and any other
  editor later.

What it costs:

- **The engine's tab is not docked in Visual Studio.** Everything needed
  to answer a stop is: the Work Explorer, the Dabbler Terminal's output,
  Configuration and the stop's actions. The tab is where a developer
  talks to the AI.
- **The extension cannot close a finished session's tab.** The developer
  does, or it idles.
- **Windows Terminal must be there.** It ships with Windows 11. Without
  it the engine opens in a plain console window.
- **The environment is to be checked.** A tab added to a window that is
  already open may not inherit the caller's environment, and Start
  Session sets one variable and needs `dabbler` on PATH. If so, the
  command the tab runs sets them itself. *(Not tried here.)*

Two routes are set aside and stay possible later, since the router prints
the engine's launch line and where it runs is then a contained change:
the built-in terminal through its undocumented service, and a terminal
embedded in a tool window, which other people's Claude Code extensions
for Visual Studio do today.

The operator's first words were "a chat interface". A chat pane in place
of a terminal means speaking each engine's own protocol, one for Claude
Code and another for the Copilot CLI, and keeping up with both. It is
left out.

The Dabbler Terminal's output stays inside Visual Studio, as a window of
its own. It takes no input, and it is what a developer looks at when a
session stops.

## The work, as sessions

Counted in sessions of three to six steps, not in time. Release sessions
are extra.

**The router prints what an interface shows (5).** Each is releasable on
its own, and after each the VS Code extension is smaller.

1. The Dabbler Terminal's lines as a verb that follows a session.
2. The Work Explorer's rows and actions as JSON.
3. The Configuration rows and the values on offer as JSON.
4. The engine's launch line from the router; results the extension now
   reads out of printed text returned as data.
5. A follow mode that prints the rows again when a record changes, so no
   interface keeps its own list of files to watch.

**The Visual Studio extension (10).**

6. The package, installing on Visual Studio 2026 and 2022: the Node check
   with a plain sentence when it fails, the router process, a pane that
   echoes each command run, the C# test project, the build in CI. It also
   settles the Windows Terminal questions above: a tab in a named window,
   the environment, the fallback.
7. The Work Explorer window: rows, icons, tooltips, refresh.
8. Opening the plan at a session, the logs and a transcript; Start
   Session with the configured engine and models, and the engine opened
   in Windows Terminal for a session, a consult and a Mechanic.
9. The Dabbler Terminal window.
10. Stop, Continue, Close, Cancel and Restore, with their dialogs.
11. Rollback, Check this stop, Review exception and Report this stop.
12. The Configuration window: the rows, the pickers, keep as machine
    default.
13. Update the catalog, store a key, Start Session with Different Models.
14. Set up Dabbler in the solution that is open.
15. A notice when a session stops, is overdue or ends; light, dark and
    blue themes; the keyboard.

**Working beside the IDE, and shipping (3).**

16. Before a session starts, say what is in its way: unsaved files, a
    running debugger, a build. After it, open the comparison between the
    session's first and last commits, since Git Changes is empty by then.
17. A walk on the non-SDK ContosoUniversity fork in both Visual Studio
    versions, with a developer's eyes, and what it finds.
18. The guide page, the Marketplace listing and the first publication.

That is eighteen. The operator's own figure was about twenty.

## What is left out

- The repositories and modules of the Solution Explorer: Visual Studio
  has a Solution Explorer.
- Set Up New Project, cloning and creating repositories, the solution
  workspace file, the troubleshooter and the walkthrough.
- A chat pane, and an engine terminal inside Visual Studio.
- Anything for IntelliJ or Eclipse. Sessions 1 to 5 are what either would
  start from.

## What it changes in this repository

- **A second language.** `AGENTS.md` says there is no Python here; there
  would be C#. The rule that matters is "one implementation of any rule",
  and it holds only if the C# never decides. Sessions 1 to 5 are what
  make that possible, which is why they come first.
- **A second test suite.** C# view code can be tested without Visual
  Studio. Tests that run inside Visual Studio need it installed, so they
  run on a developer's machine and not on a hosted CI runner. *(From the
  documentation.)*
- **Every later interface change is made in two places** where it is
  about how a thing looks, and in one where it is about what is shown.
- **The checkout still has two writers.** An extension inside Visual
  Studio does not stop project reloads, locked `bin` and `obj` folders or
  an open designer colliding with a session. Session 16 says so before a
  session starts; nothing here removes it.

## What was decided, 2026-11-17

1. The engine runs in Windows Terminal, not inside Visual Studio, and
   there is no chat pane. (The operator.)
2. It is built on `master`, in `tools/dabbler-visual-studio/`, and is not
   published until the walk says it works. No feature branch: the ledger
   cannot be merged by hand, so a branch would freeze `master` for as long
   as it lived. (The operator, on the orchestrator's recommendation.)
3. The sessions that make the router print each view go first, and are
   released on their own. (The operator: "update the plan".)

Taken by the orchestrator in writing the plan, for the operator to
overturn by amending it:

4. One version number for the router and both extensions.
5. The package installs on Visual Studio 2022 (17.14) and 2026, and the
   listing claims a version only once it has been walked. This machine
   has 2026 only.
6. The list under "What is left out" stands.

## Where it is planned

`docs/sessions/session-plan.md`, sessions 343 to 362. The numbers in this
page map onto it so:

| This page | The plan |
|---|---|
| 1 to 5, the router prints each view | 343 to 347, released as 3.36.0 in 348 |
| 6 to 15, the Visual Studio extension | 349 to 358 |
| 16, before and after a session | 359 |
| 17, the walk | 360 |
| 18, the guide and publication | 361, released as 3.37.0 in 362 |
