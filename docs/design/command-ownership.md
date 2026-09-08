# Who owns a command: the framework, the UI, or a person

*Written 2026-09-08, session 123. The operator read the two UAT walkthroughs
— forty commands a person is asked to type, between them — and stated the
rule below. This page records the rule, applies it to every command those
documents contain, and says which of the findings were documentation, which
were product gaps, and what became of each gap once design rounds 10 and 11
(`docs/design/consults/round10-synthesis.md`,
`docs/design/consults/round11-synthesis.md`) moved the wall between an engine
and a sibling's source from the disk to a hook. Every claim about a button
below was checked against `tools/dabbler-ai-orchestration/package.json` and
the command's implementation, not against the walkthroughs' own wording. It
does not rewrite the walkthroughs: session 124 does that, after session 129,
in the three registers this page ends by describing.*

## The principle, as the operator stated it

> Any command that is always the same except for parameters the framework can
> determine should be a framework command. If that command always occurs at a
> specific point in the lifecycle of a solution, project or session — and the
> framework could execute it at the appropriate time, perhaps with a user
> prompt — the framework should execute it, not the human operator. Where the
> command's timing or optionality precludes that, but the command is either
> constant or constant-with-parameters, the UI should generate and execute it,
> prompting for the parameters.

## Three buckets, and how a command is placed in one

Two questions decide it. *Is the command constant, or constant once its
parameters are known?* If not — if the substance of it is a person's
judgement — it is nobody's to automate. If so, *does it always happen at one
moment of a lifecycle?*

1. **The framework runs it.** Constant or parameterised, and lifecycle-timed:
   at bootstrap, at registration, at the declaration, at the candidate, at the
   land, at the close. A parameter the framework cannot determine is a prompt
   the framework raises at that moment, not a reason to hand the whole
   command to a person.
2. **The UI offers it.** Constant or parameterised, but optional or without a
   fixed moment. It is a button or a row command; the UI prompts for the
   parameters and runs the same verb a person would type. The verb is still
   the framework's — the UI generates a line, never a second implementation.
3. **A person does it.** Only what needs a person's judgement: writing a
   plan, writing a POM, deciding which tests speak for which code, running
   the program they built to see whether it works.

A command in the wrong bucket is not a style problem. The walkthroughs were
dogfooded from a terminal, which is how the operator drives sessions, and that
habit went into the text: work the framework already does for itself became
invisible, and every visible line read as a person's. Placing each command
was what exposed the three gaps that nobody had noticed while reading the
documents as prose.

## The audit: `docs/uat/uat-dotnet-json-solution.md`

| step | what the person types | bucket | what already covers it, and where that was checked |
| --- | --- | --- | --- |
| prerequisites | `dotnet --list-sdks`, `git --version`, `node --version`, `dabbler version`, `copilot --version`, `echo %DABBLER_TRANSPORT%` | UI | Diagnostics. **Troubleshoot** (`tools/dabbler-ai-orchestration/src/commands/troubleshoot.ts`) is the extension's diagnostic command; its six items cover activation, a stuck session, worktrees, a missing API key, cost and the folder layout, and not the toolchain versions. A person still types these, which the walkthrough may say plainly. |
| 1 | `mkdir`, `cd`, `git init -b master` | framework | **Set Up New Project** (`tools/dabbler-ai-orchestration/src/commands/bootstrapProject.ts`): with no folder open it asks where and what the project is called, makes the folder, runs `dabbler bootstrap`, and when bootstrap refuses for want of a repository it initialises one through VS Code's own git and runs bootstrap again. |
| 1 | `git init --bare <origin>`, `git remote add origin <path>` | framework, with a prompt — **not covered** | The walkthrough's bare repository stands in for the remote a real project has. The remote is lifecycle-timed: the land runs `git push` (`packages/router/src/drive.ts`, the land phase) and the close's `pushed_to_remote` gate reads it, so the first session cannot land without one. The URL is the one parameter the framework cannot determine, which under the principle is a prompt at set-up, not a line in a walkthrough. Set Up New Project asks no such question today. Left to session 124's walk to report. |
| 2 | `dabbler modules create` × 3, each with `--slug --title --kind --code-root --package [--depends-on]` | UI | **New Module** (`tools/dabbler-ai-orchestration/src/commands/newModule.ts`) prompts for four of those six — slug, title, kind, depends-on — and runs `modules create` with them. It does **not** ask for the code root or the package, and the router writes only what it is given (`packages/router/src/cli/modules.ts`): a module made by the button has neither until someone edits the manifest by hand. Those two are exactly what a module session and a pack need. Left to session 124's walk to report. |
| 2 | `dabbler modules show .` | UI | The **Solution Explorer** renders the same projection: each module, its kind, its *Depends on* and *Used by* rows (`tools/dabbler-ai-orchestration/src/providers/solutionTreeModel.ts`). The command is the check the walkthrough makes of what it just typed; the tree is where a person looks. |
| 2b | `dabbler bootstrap --no-transport-detect` | framework | Set Up New Project runs bootstrap with `noTransportDetect: true`, deliberately: setting up one project is not a statement about how the machine routes every other one. |
| 2b | `git add -A`, `git commit -m "Bootstrap: …"` | **dead text** | See below. Bootstrap commits its own scaffold when no session is in flight. |
| 3 | write `session-plan.md`, write `items.json` | person | The plan's substance is the operator's. (The bootstrap-written session 1 is *the solution plan*, in which the AI asks the person what the solution is; this walkthrough writes the plan by hand instead and skips that session, which is a legitimate shortcut and should be named as one.) |
| 3 | `git add -A`, `git commit`, `git push -u origin master` | framework, with a prompt — **not covered** | Lifecycle-timed: the declaration refuses a dirty tree, so a hand-written plan must be committed before `session start`, and the land's bare `git push` needs the upstream that `-u` sets. Neither the commit nor the upstream is offered by Start Session today. Left to session 124's walk to report, with the remote above. |
| 4 | edit `dabbler.yaml` (a `selection.rules` entry) | person | Which tests speak for which code is a declaration only the author can make; `covers:` does not select tests, and the walkthrough is right to insist on the rule. |
| 4 | `dabbler affected --path <file>` | UI | **Show Impact** on a module row (`tools/dabbler-ai-orchestration/src/commands/showImpact.ts`) plans a hypothetical change under the module's code roots and shows the router's plan. The walkthrough's form names one file; the button names the roots. Same verb. |
| 5 | `dabbler module open model`, `dir <clone>\modules` | UI — **goes with the clone** | **Open Module** (`tools/dabbler-ai-orchestration/src/commands/openModule.ts`) is this command. Rounds 10 and 11 drop the clone; session 128 deletes both. |
| 6 | `dabbler session start --sessions-dir … --engine … --provider … [--model …]` | UI | **Start Session** (`tools/dabbler-ai-orchestration/src/commands/sessionCommands.ts`) picks the engine and, for a seat, the model, opens the engine's CLI at the repository root, and hands it the sentence to run exactly this line once. **Start Unattended Session** runs `session drive` with the same identity. |
| 6 | `dabbler session next --sessions-dir …`, repeated until `done` | framework | The engine calls it; a person never does. The walkthrough's warning that a `wait` means *call next again yourself* is addressed to the engine, and the enforcement of it is the stop hook (`hook-stop`), which since session 95 holds a Claude Code turn on a past-due wait. |
| 7 | `dabbler module pack model` | UI — **gap B, built here** | The framework packs a module itself at the candidate, before the run of record. Out of band — so that the *next* session can consume the package, which is what step 7 is for — there was no button. **Pack Module** on the module row is this session's addition. |
| 8 | `git pull origin master` | **gap C, eliminated** | Fetching a module session's work back into the full checkout exists only because the work happened in a clone. With one checkout there is nothing to fetch. |
| 9 | steps 5–8 again for `store` and `app` | as above | — |
| 10 | `dotnet run --project … -- items.json people.db` × 2 | person | Running what was built is the test. |

Not in the numbered steps, but in the reference run the walkthrough
describes: **Answer Owed Decision** (`tools/dabbler-ai-orchestration/src/commands/owedDecisionCommands.ts`)
runs `dabbler owed answer` with the option a person picks, and **Close
Session** runs `session close`. Neither appears as a typed line in either
document, which is right; they are here because the principle applies to
them and both already satisfy it.

## The audit: `docs/uat/uat-java-json-solution.md`

The Java document is the same walk with these differences.

| step | what the person types | bucket | note |
| --- | --- | --- | --- |
| 3 | write `modules\model\pom.xml` | person | The POM's three load-bearing lines are the walkthrough's to teach. A scaffolded POM would be a framework command — `dabbler module contract` scaffolds the `-api` and `-contract-tests` POMs for a designed contract, and `modules create` writes none for the module itself — but this walkthrough deliberately wants the person to see the parent, the missing version and `${revision}`. |
| 4, 5 | `dabbler module pack model`, twice | UI — **gap B** | The first pack is where the root build files appear (`ensureRootFiles` in `packages/router/src/cli/module.ts` runs before the pack), because `modules create` waits for the first project file. That moment is lifecycle-timed and the framework already owns it; Pack Module reaches it from the row. |
| 5 | `findstr /C:"json-model" pom.xml` | person | A check of the pack's third line. |
| 6 | `dabbler session start … --module model`, `cd C:\temp\uat-java.model` | UI — **gap A, moved to 128** | See below. |
| 8 | `dir`, `type .mvn\maven.config`, `mvn -B test` | UI — **goes with the clone** | The first two check the clone's shape, which session 128 deletes. `mvn -B test` is the suite the framework runs as the run of record; a person running it by hand is optional and fine. |
| 9 | `git pull origin master` | **gap C, eliminated** | As above. |

## Dead text: the commit after bootstrap

Both documents follow `dabbler bootstrap` with a manual `git add -A` and a
commit, and both explain it: *a session's declaration is refused while the
working tree carries changes.* The refusal is real. The instruction is not:
`commitOwnScaffold` in `packages/router/src/cli/bootstrap.ts` stages exactly
the files bootstrap wrote and commits them, with its own message, whenever no
session is in flight — which, on a folder set up a moment ago, is always. The
walkthrough's commit therefore finds nothing to stage on the reference
machine, and a reader who runs it sees `nothing to commit` and wonders which
of them is wrong. Bootstrap says what it did on stdout (*committed N file(s)
it wrote; the declaration a session makes comes before its work*), and that
sentence is what the walkthrough should quote. Only when a session is in
flight does bootstrap leave its files uncommitted, and then it says whose land
will commit them.

Session 124 removes the two commits and puts the fact in its first register.

## The three gaps, and what became of them

Three commands failed the principle when this session was planned: each was
constant-with-parameters, each had a lifecycle moment or a row it belonged
on, and none had a button. Between the planning and the work, rounds 10 and
11 changed the ground under two of them.

**A — Start Session cannot name a module.** `--module` appears nowhere in
the extension: `openingSentence` in `sessionCommands.ts` writes the start
line with the engine, the provider and a seat's model, and never a module;
`engineTerminalFor` opens at the repository root. On the clone design that
made the primary button unable to produce a closable session in exactly the
solution shape the modules feature exists for, because sessions 118–120
proved a module session started in the full checkout cannot close once a
sibling has source. Under the hook design there is one checkout and the
engine opens at its root, so the button's working directory is right today;
what it still lacks is the module, because `session start --module <slug>` is
how a module session declares its scope. **Session 128** adds the pick, in
the same diff that deletes the clone, the module-session marker and the
clone's sessions root — so that a button and the code it replaces are never
both true at once.

**B — no Pack on a module row.** Every mention of *pack* in the extension
was a comment or a `package` field. The framework runs `packModule`
(`packages/router/src/packages.ts`) itself at the candidate, so the
operation is the framework's and its parameters are determined; what was
missing was the operator's way to ask for it out of band, which is what step
7 types by hand so the next session can consume the package. **This
session** adds `pack` to the router's in-process module verbs beside `open`,
`grant` and `revoke`, and **Pack Module** to the module row of a multi-module
solution, running `dabbler module pack <slug>` with the slug the row carries
and showing the router's answer — the version, the artefacts, the pin — or
its refusal, in the router's own sentence. Open Module and Widen for
Debugging, which it was to sit beside, are the clone's commands and go in
128.

**C — the pull-back after a module session.** `sessionNext` in
`packages/router/src/drive.ts` reads the module-session marker, sees the
clone's session closed, calls `clearModuleSessionMarker`
(`packages/router/src/checkout.ts`) — standing at the exact lifecycle moment
the principle names, and fetching nothing, so the full checkout's Work
Explorer went on saying *not started* until a person typed `git pull`. Under
the hook design the engine and the developer share the one checkout; nothing
lands elsewhere and nothing needs fetching. **Eliminated.** The marker and
that moment in `sessionNext` go with the clone in 128.

## What the audit found that the plan did not list

Four things, none of them built here; each is a labelled place for session
124's walk to be wrong in, rather than a line that blends into the shell.

- **New Module asks for four values and a module needs six.** Code root and
  package are the two it does not ask for, and the two a module session and
  a pack cannot do without. Either the button prompts for them or the router
  defaults them from the slug; which is 124's to find out by walking it.
- **The remote, and the upstream.** The land pushes and the close checks the
  push; the first session cannot close without a remote, and nothing in the
  UI asks for one. Under the principle this is a prompt at set-up.
- **Committing a hand-written plan.** The declaration refuses a dirty tree,
  so a plan written by hand must be committed before the first `session
  start`. Bootstrap's own session 1 makes this moot by writing the plan
  inside a session; a walkthrough that hand-writes the plan instead should
  say that it is skipping that session, and what it is committing in its
  place.
- **The prerequisite checks.** Toolchain versions are a diagnostic, and
  Troubleshoot is the diagnostic command; it does not run them. Whether it
  should is a small question the walk can answer.

## What this leaves to session 124

The revised walkthroughs are written in three registers per step — what the
framework already did and at which moment; what the operator does in the UI,
by exact command title and prompt answer; and what that operation runs
underneath — and a step that cannot fill the first two reports itself as a
gap in the operator's terms: lifecycle-timed means the framework should run
it, optional means the UI should offer it, judgement means neither and the
document says so. That format is the test of this page: every row above
becomes either a register or a labelled gap, and the four findings just
listed are the rows most likely to move once the path is walked with the
buttons that will exist after session 129. `docs/quick-start.md` and
`docs/tutorials/csv-solution/csv-multi-module-walkthrough.md` carry the same
manual commit after bootstrap and are reached in the same pass.
