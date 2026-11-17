# Consult: Dabbler for developers who work in Visual Studio

## What Dabbler is

Dabbler is an AI-led session framework. A person plans numbered sessions
in prose. The framework drives each session one instruction at a time: an
authoring AI (Claude Code or the GitHub Copilot CLI, each a program in a
terminal) edits the files; the framework runs each step's checks and the
test suites, has a model from a different provider review the diff,
commits, pushes and closes. A session runs for many minutes to an hour or
more, mostly without the person.

It has two parts:

- **The router** (`dabbler <verb>`, a Node program, about 68,000 lines of
  TypeScript in 138 files). It owns everything that decides: the session
  lifecycle, the checks, the review, the record. It has no tie to any
  editor. Every action a person can take is a verb: `session start`,
  `status`, `session next`, `session waive`, `cancel`, `rollback`,
  `configure`, `consult`, `triage`, `transcript`.
- **The VS Code extension** (about 22,000 lines of TypeScript in 52
  files). It bundles the router and calls it in-process. It is the
  person's interface, and it installs the `dabbler` command on the PATH of
  VS Code's terminals. Today the router reaches a machine only inside this
  extension: it is not on the public npm registry.

What the extension gives a person, with the VS Code API each part uses:

- **Work Explorer** (a native tree view): the sessions of the plan in
  buckets by status, with each row's actions (Start Session, Continue,
  Stop, Cancel, Restore, Rollback, Open a Mechanic, Check this stop,
  Review exception, open the plan at this session, open the transcript).
  Its model is 1,160 lines that know nothing of VS Code; the provider that
  puts it on screen is 230.
- **Solution Explorer** (a native tree view): the repositories and modules
  of the solution, and a Configuration section where a person picks the
  authoring engine, the models, and the vehicle each is reached through.
  Model 1,440 lines, provider 310.
- **The Dabbler Terminal** (a pseudoterminal, 2,140 lines): one line per
  framework event while a session runs, with the time, the event and its
  fields.
- **Engine terminals**: Start Session opens the authoring AI's CLI in an
  integrated terminal and hands it the first instruction. The person can
  type to it while it works.
- **Commands and dialogs** (about 3,900 lines): set up a new project, open
  an existing repository, the session commands, configuration, a
  troubleshooter.
- No webview is used anywhere. Keys are environment variables.

The extension has its own test suite, and the repository has a standing
rule: one implementation of any rule. The interface renders, the router
decides.

## The situation

The operator leads a team that maintains .NET Framework (4.5 and later)
MVC applications, .NET Core applications and Java applications. Some of
the .NET developers use Visual Studio and insist they need it rather than
VS Code. The operator doubts they need it, and wants to know what a
Dabbler that works in Visual Studio would take. Java staff use IntelliJ
and Eclipse and may ask the same later.

The framework already supports these repositories as they are: it reads
an existing solution, keeps its target frameworks and project formats, and
builds and tests non-SDK projects through MSBuild and vstest, so a
solution a session changed still opens and builds in Visual Studio.

Three options were put to the operator:

1. **Visual Studio for the code, VS Code beside it as the Dabbler
   console.** Works today.
2. **No VS Code: drive Dabbler from a terminal** (Visual Studio's built-in
   one, or Windows Terminal). Needs an install route for the router that
   is not the VS Code extension. Every pane is lost; a person types the
   verbs and reads `dabbler status`. Whether the engine CLIs render well
   in Visual Studio's terminal has not been checked.
3. **A Visual Studio extension**: the person's interface built again for
   Visual Studio.

## Two instructions from the operator about how to answer

- **Do not let the time it would take decide anything.** The operator's
  experience is that strong models call something months of work that
  then takes two weeks. Your estimate of effort will likely be wrong, so
  do not give one in weeks or months and do not rank the options by it.
  You may say what an option obliges the maintainer to keep doing
  afterwards (for example, every interface change made twice), because
  that is a consequence and not an estimate.
- **What should decide is the developer's experience.** In particular:
  would it be frustrating to go back and forth between Visual Studio and
  VS Code all day? Judge each option by what a developer's day is like
  under it.

## What is wanted from you

Disagreement is worth a paragraph and agreement one line. Say when you
are unsure of a fact about Visual Studio's extension model or terminal,
and name the version you are speaking of. Answer in this shape:

1. **Verdict, first.** Which option, or which combination, and the one
   reason that decides it.

2. **The back and forth, moment by moment.** Take one developer through
   one day: plan a session, start it, watch it, answer a stop, read the
   diff, debug what it built, start the next. For options 1 and 2, name
   each moment they must leave Visual Studio, how often it happens, and
   which of those moments would actually grate. Name too what Visual
   Studio itself does badly when files change underneath it (reload
   prompts, an open designer, a locked build output, a running debugger).

3. **If a Visual Studio extension is built, how.** Which extension model
   (the older in-process VSSDK, or the newer out-of-process
   VisualStudio.Extensibility), and why. What from the list above can be
   reused as it is (the router as a Node process; the two tree models,
   which are TypeScript with no VS Code in them), and what must be
   written again. How the router gets onto the machine and how Node does.
   What the engine terminal and the Dabbler Terminal become in Visual
   Studio. How "one implementation of any rule" is kept with two
   interfaces.

4. **Is there a design that serves Visual Studio, IntelliJ and Eclipse
   from one interface?** For example: the router serves the person's
   interface as a local page and each editor shows it in a panel, or the
   router speaks a small protocol each editor's thin extension renders.
   Say whether that is better for the developer than a native extension
   in each, or merely tidier for the maintainer.

5. **What the terminal-only route needs** to be a fair offer and not a
   punishment: the install, and the two or three things that would have
   to exist in the router for a person with no panes.

6. **What to find out from the developers first.** The questions to ask
   them, and the one trial that would settle whether their objection is
   to writing code in VS Code, to having a second window open, or to
   something else.

7. **What would make this fail.**
