# Dabbler in Visual Studio

The Visual Studio extension puts Dabbler's windows in Visual Studio, beside
the solution you already have open. It is the same framework the VS Code
extension carries, and it works the same way: the same `dabbler` command
decides everything, and the extension shows what that command prints and
runs the verbs it names. The engine, the AI that writes the code, runs in
Windows Terminal, and Visual Studio stays on your solution.

Everything on this page was walked on 2026-11-18 in Visual Studio 2026
(18.12), on an ASP.NET MVC 5 solution on .NET Framework 4.8.1 whose
projects are all in the old format. The full record of that walk, with
every dialog Visual Studio raised, is
[the Visual Studio UAT page](../uat/uat-visual-studio.md).

## What is not there

Read this first, because each one is a choice you would otherwise go
looking for:

- **No terminal inside Visual Studio.** The engine opens in a Windows
  Terminal tab beside Visual Studio, and you answer its own questions
  there. The **Dabbler Terminal** window shows the framework's lines,
  not the engine's.
- **No new-project set-up.** Dabbler sets itself up in a solution that
  already exists. It does not create a solution or a project for you.
- **The engine's tab is yours to close.** When a session closes, the
  engine's Windows Terminal tab stays open with the engine idle in it.
  The extension starts the tab and has no hold on it afterwards.
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
3. **Windows Terminal.** It comes with Windows 11. Without it, each
   session's engine opens in a console window of its own, and nothing
   else changes.
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

Windows Terminal then opens a tab with the engine in it and its first
instruction already typed. From there the session runs without you: the
framework hands the engine one step at a time, runs the checks and the
tests, has a model from another provider review the work, commits it and
closes the session. You watch it in the Work Explorer and the Dabbler
Terminal. When it closes, Visual Studio shows a bar across the editor,
*"Dabbler: session N is closed."*, with **Show in Work Explorer**.

**If you close the engine's tab mid-session**, choose **Continue Session**
on the session's row. It opens a new tab on the session where the record
stands.

**Compare With Its Start**, on a session's row, lists every file the
session changed and opens Visual Studio's own comparison window on the one
you choose.

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
