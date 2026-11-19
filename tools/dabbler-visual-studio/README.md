# AI writes the code. The framework holds it to the rules.

Dabbler lets an AI write the code in your solution and keeps everything
else out of its hands. The framework, which is ordinary code that does the
same thing every time, hands the AI one instruction at a time, runs your
build and your tests itself, has a model from another provider review the
work, and commits only what passed. The plan, the record and the reasons
stay in your repository after the conversation that produced them is gone.

This extension brings Dabbler's windows into Visual Studio, beside the
solution you already have open. The AI, Claude Code or the GitHub Copilot
CLI, works in a tab of its own in Visual Studio's editor area, and
**Dabbler Layout** (Ctrl+Shift+Alt+L) arranges the Work Explorer, the
engine and the Dabbler Terminal around it, then, used again, puts back
the windows you had.

**Walked on Visual Studio 2026.** A whole session and a stop were taken
from start to finish in Visual Studio 2026 on an ASP.NET MVC 5 solution on
.NET Framework 4.8.1, with old-style projects. The extension installs on
Visual Studio 2022 17.14 and later, but nobody has walked a session in
Visual Studio 2022 yet.

## What you get

- **Dabbler Work Explorer**: your repository's sessions, planned, in
  progress and complete, with each one's steps, its review and its
  findings. Right-click a session to start it, roll it back, cancel it,
  or compare it with its start in Visual Studio's own diff window.
- **Dabbler Configuration**: which AI writes the code, which models review
  it, and through what. A choice is saved in the repository and travels
  with the next clone.
- **Dabbler Terminal**: the framework's own account of the session in
  flight, line by line, with times: each step, each check, each review
  round, the test run and the close.
- **The engine's tab**: one per session, in the editor area. Closing it
  ends nothing, and the session's row brings it back. Tools > Options >
  Dabbler opens engines in Windows Terminal instead, if you prefer.
- **Set Up Dabbler in This Solution**: one click reads your solution,
  finds its build and its tests, and commits the few files Dabbler needs.
- **A bar across the editor** when a session closes or needs you, and
  **Check this stop**, which asks a model that did not write the code
  whose move it is.

## What it holds the AI to

- The framework, not the AI, runs the checks, the build, the tests, the
  review and the commit, and records a SHA-256 hash of the code it
  checked. A passing result cannot be claimed for code that changed
  afterwards.
- A model from a different provider reviews every session. The two work
  through findings and fixes on their own; the verdict is the reviewer's,
  and there is no command anyone can use to type one.
- Each session states what it will and will not do before the work
  starts, and the reviewer holds the work to it.
- Committing, rolling back and cancelling are yours. The AI cannot do
  them.

## What you need

- Node.js 22.18 or later on PATH, from [nodejs.org](https://nodejs.org).
- An engine CLI you are logged in to: Claude Code or the GitHub Copilot
  CLI.
- API keys for the reviewing providers, as user environment variables.
  The Configuration window shows which ones this machine has.
- A solution in a git repository.

## What is not there

- No new-project set-up: Dabbler sets itself up in a solution that already
  exists.
- No coding layout of Dabbler's: which windows you code with is yours, and
  Visual Studio's own **Window > Save Window Layout** keeps as many
  arrangements as you like.
- When the engine changes an old-style project file, Visual Studio raises
  its own **File Modification Detected** dialog. Answer **Reload All**.

## Read more

- [Dabbler in Visual Studio](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/visual-studio.md):
  installing, the three windows, starting a session, answering a stop,
  and what Visual Studio itself does while the engine works.
- [The guide](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/README.md):
  the rules the AI works inside, the two reviewers, the record, and what a
  session costs.
- Source and issues:
  [github.com/darndestdabbler/dabbler-ai-orchestration](https://github.com/darndestdabbler/dabbler-ai-orchestration).
