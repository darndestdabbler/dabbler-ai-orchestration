# Dabbler in Visual Studio

The Visual Studio extension puts Dabbler's windows in Visual Studio, beside
the solution you already have open. It is the same framework the VS Code
extension carries, and it works the same way: the same `dabbler` command
decides everything, and the extension shows what that command prints and
runs the verbs it names. The engine, the AI that writes the code, runs in
a tab of its own in Visual Studio's editor area, beside your files.

The windows, the set-up, a session and a stop were walked on 2026-11-18 in
Visual Studio 2026 (18.12), on an ASP.NET MVC 5 solution on .NET Framework
4.8.1 whose projects are all in the old format, with the engine in Windows
Terminal. The engine's tab and Dabbler Layout came in 3.40.0; what Visual
Studio does with the layout was tried on 2026-11-19, and the layout has a
walk of its own. Both records, with every dialog Visual Studio raised, are
on [the Visual Studio UAT page](../uat/uat-visual-studio.md).

## What is not there

Read this first, because each one is a choice you would otherwise go
looking for:

- **The Dabbler Terminal is not the engine.** The engine's tab is where
  the AI works and where you answer its own questions. The **Dabbler
  Terminal** window shows the framework's lines, not the engine's.
- **No new-project set-up.** Dabbler sets itself up in a solution that
  already exists. It does not create a solution or a project for you.
- **No coding layout of Dabbler's.** Dabbler Layout arranges Dabbler's
  own windows and, used again, puts back exactly what you had. Which
  windows you code with is yours.
- **Visual Studio 2022 has not been walked.** The extension installs on
  Visual Studio 2022 17.14 and later, but nobody has walked a session on
  it yet. Only Visual Studio 2026 has been walked.

## What to install

1. **Node.js 22.18 or later**, from [nodejs.org](https://nodejs.org).
   Visual Studio reads PATH only when it starts, so restart it after
   installing. Without Node, every Dabbler command says so and names the
   version it needs.
2. **An engine CLI you are logged in to**: Claude Code, or the GitHub
   Copilot CLI. The first time it runs in a folder it asks its own
   questions, such as whether to trust the folder, in its own tab.
3. **Windows Terminal**, only if you want engines there instead (see
   *The engine's tab*, below). It comes with Windows 11.
4. **The extension**, from the Visual Studio Marketplace: in Visual Studio,
   **Extensions > Manage Extensions**, search for Dabbler, install, and
   restart Visual Studio.

The reviewers are models from other providers than the engine's, reached
with API keys. The Configuration window shows which keys this machine
has and stores one for you. See [The Configuration](configuration.md).

To check the install, choose **Tools > Dabbler: Version**. It shows the
router's version, and the **Dabbler Commands** pane of the Output window
shows the command it ran, so you can copy it and run it yourself.

## The three windows

All three are under **View > Other Windows**:

- **Dabbler Work Explorer**: the sessions of the repository your solution
  is in, under Not Started, In Progress and Complete, with each session's
  steps, its review and its findings. Right-click a row for what you can do
  with it: Start Session, Rollback to Start of This Session, Cancel
  Session, Compare With Its Start, and the rest. A row offers only what
  its command accepts at that moment.
- **Dabbler Configuration**: who writes the code and who reviews it, with
  which model and through what, and which setting decided each. Right-click
  a row to change it. A choice is the repository's own: it is written to
  `.vscode/settings.json` in the repository and committed, so it travels
  with the next clone. Visual Studio does not show that folder in Solution
  Explorer, because it belongs to no project.
- **Dabbler Terminal**: the framework's own lines for the session in
  flight, each with its time: the plan, each step it hands the engine, the
  checks, the review, the tests and the close.

## Setting up a solution

Open a solution in a git repository that Dabbler has never seen. The Work
Explorer says the repository is not set up yet and offers **Set Up Dabbler
in This Solution**. One click reads the solution, writes and commits
Dabbler's few files (its instructions for the engine, `dabbler.yaml` with
the test suite and the build it found, and a first session plan), and
offers to start session 1. It refuses to start while the repository has
uncommitted changes, and says which.

Then choose the models in the Configuration window, or keep this machine's
defaults.

## Starting a session

Write the session into the plan, `docs/sessions/session-plan.md`, or let
the engine write it with you. Then right-click the session's row and
choose **Start Session**.

- If you have uncommitted changes, Start Session lists them and offers
  **Commit and Push**, **Undo the Changes** and **Close**.
- If a document has unsaved changes, the debugger is running or a build is
  in progress, it asks first and offers **Save All and Go On**, **Go On
  Anyway** and **Not Now**. It never stops a build or closes a document.

The engine then opens in a tab of its own in the editor area, with its
first instruction already typed, and nothing else moves. From there the
session runs without you: the
framework hands the engine one step at a time, runs the checks and the
tests, has a model from another provider review the work, commits it and
closes the session. You watch it in the Work Explorer and the Dabbler
Terminal. When it closes, Visual Studio shows a bar across the editor,
*"Dabbler: session N is closed."*, with **Show in Work Explorer**.

**Compare With Its Start**, on a session's row, lists every file the
session changed and opens Visual Studio's own comparison window on the one
you choose.

## The engine's tab

Each engine Dabbler starts -- a session's, a consult's or a Mechanic's --
has a tab of its own in the editor area, titled with the engine. A
session never has two: choosing Start Session or Continue Session while
its engine runs brings its tab forward and starts nothing.

- **Closing the tab ends nothing.** The engine carries on, and the first
  time, the tab says so. **Continue Session** on the session's row brings
  its tab back, attached to the same engine. **Tools > Dabbler: End
  Engine** ends the engine of the tab in front.
- **When the session closes**, its engine ends and its tab closes.
- **Closing Visual Studio ends nothing either.** It says once that the
  session carries on, and when you open the solution again a bar offers
  the engine's tab.

**Tools > Options > Dabbler > Engine**, *Open engines in*, says where an
engine opens: **Visual Studio**, the default, or **Windows Terminal**,
where each engine is a tab in a Dabbler window beside Visual Studio (or a
console window of its own, without Windows Terminal), and stays open with
the engine idle in it after its session closes. If an engine cannot open
in Visual Studio, it opens in Windows Terminal, and Dabbler says why in
one sentence.

## Dabbler Layout

**Tools > Dabbler: Layout**, or **Ctrl+Shift+Alt+L**, or the button on
the Work Explorer's toolbar, arranges Dabbler's windows for a session:

- the **Work Explorer** beside the Solution Explorer,
- the session's **engine tab** in the middle, in front,
- the **Dabbler Terminal** on the right, under the Solution Explorer.

Before it moves anything it records your arrangement, and **using it
again puts back exactly what you had**, every window where it was. The
engine keeps running either way. The record is Dabbler's own: it never
appears among your saved layouts.

The Dabbler Terminal goes on the right the first time Visual Studio
shows it. After that it stays wherever you put it, as any window does,
and the layout shows it there.

**Tools > Options > Dabbler > Engine**, *Apply the Dabbler layout when a
session starts*, off in a new install, makes Start Session and Continue
Session apply the layout once the engine's tab is open. A start never
takes the layout back off; the command does. With it off, a start opens
the engine's tab and moves nothing else.

**Debugging is Visual Studio's own.** Starting a debugger switches Visual
Studio to its debugging arrangement, without the Dabbler windows, and
stopping it switches back, with them. Dabbler applies nothing on either.
Use the command again after the debugger stops to put your windows back.

For more than these two arrangements, Visual Studio's own
**Window > Save Window Layout** keeps as many as you like, and
**Window > Apply Window Layout** brings one back.

## Answering a stop

When a session needs a person, Visual Studio shows a warning bar across
the editor, *"Dabbler: session N is paused"*, with the reason and **Show
in Work Explorer**. The session's row in the Work Explorer starts with
*"You:"*, and the Dabbler Terminal shows what failed and the ways on. The
bar closes by itself once the session has moved on.

Right-click the session's row:

- **Check this stop** asks a model that did not write the code to read the
  record and say whose the stop is. It is one call to a provider, it asks
  before it runs, and its answer is advice only: it appears in the
  **Dabbler Session** pane of the Output window, and nothing is changed
  for you.
- **Review exception** shows the card for `session waive`, which goes
  past a stop that has a gate to go past, such as failed tests. It never
  changes a reviewer's verdict, and it is offered only on a stop it can
  go past.
- **Rollback to Start of This Session** shows what it will do first. The
  work is kept on a safety branch, and the session goes back to Not
  Started with its plan kept, so you can amend the plan and start it
  again.
- **Consult with AI**, **Open a Mechanic**, **Stop Session** and **Cancel
  Session** are there too, as in VS Code. See
  [Consult with AI, and the Mechanic](consult-and-mechanic.md).

## Working beside an open solution

The engine writes files under the solution you have open, from outside
Visual Studio. Visual Studio reacts in its own way, and these are its
prompts, not Dabbler's:

- **An open file you have not changed** reloads without asking, as long
  as **Tools > Options > Environment > Documents** has *Detect when file
  is changed outside the environment* and *Reload modified files unless
  there are unsaved changes* on, which is how Visual Studio ships.
- **An open file you have changed** makes Visual Studio ask whether to
  reload it and lose your edits. **No** keeps your edits, and your next
  save overwrites the engine's work. Use **Save All and Go On** before a
  start, and leave the session's files alone while it runs.
- **File Modification Detected** appears when the engine changes an
  old-style project file, for example by adding a `Compile` item. The
  dialog is modal, so the Dabbler windows behind it cannot be used until
  you answer it. Answer **Reload All**. No Visual Studio option quiets it,
  and SDK-style projects do not raise it.
- **Inconsistent Line Endings** appears where the engine writes line
  endings unlike the rest of a file. A `.gitattributes` or `.editorconfig`
  that settles line endings stops it at the source.
- **A build you start in Visual Studio saves every open document first**,
  by default. A build started while the engine is working can write your
  unsaved editor contents over its work.

The walk met no lock: nothing the framework built failed on a file Visual
Studio held, and Visual Studio's own build afterwards found nothing the
framework held.

**Start Visual Studio from the Start menu or Explorer, never from an
engine's terminal.** Started from one, it inherits the variable that says
an engine is at work, and the framework then takes every click in Visual
Studio for the engine's. Start Session's **Commit and Push** is refused,
for example, because committing your changes is a person's act.
