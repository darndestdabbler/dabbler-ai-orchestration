# Consult: the session plan for the modules block (sessions 100–108)

You are consulted on `dabbler-ai-orchestration`, the AI-led coding-session
framework (a TypeScript router `dabbler <verb>` bundled into a VS Code
extension) whose customers are .NET and Java teams. You answered design
rounds 6, 7 and 8 on this block; round 8's synthesis is the decision and it
is NOT re-opened here. What is asked now is a review of the **session plan**
that implements it — nine numbered sessions the orchestrator will run back
to back, unattended, tonight, under the framework's own pull loop (each
session: a work plan with steps and mechanical checks, cross-provider
verification, the complete suite as the run of record, a commit and push,
the close).

You have NO tool access. Every claim about the repository must cite a path
or a fact from this brief or from the plan text below; mark anything else
ASSUMPTION. Do not invent paths.

## The governing requirement (new since round 8)

A solution with ONE module must keep working exactly as today, with nothing
new asked of its developer. csv-model (the trial repository) is such a
solution, and so is every repository bootstrapped so far, and so is this
repository (it declares no `docs/modules.yaml`). Multi-module behaviour
switches on only when `docs/modules.yaml` declares more than one module;
with one — declared, or implied by an absent manifest — the repository *is*
the module.

## Facts about the tree the plan relies on

- `packages/router/src/modules.ts`: `ModuleEntry {slug, title, planPath,
  codeRoots, touches, specSections, contextAssets}`, unknown keys refused;
  written by `dabbler modules create`; read by `approvedPlan.ts`.
- The six-step component workflow to delete: `solution.ts` (405 lines),
  `cli/workflow.ts` (381), `cli/solution.ts` (121), `workflow/commands.ts`
  (593), `workflow/log.ts` (523), `workflow/terminal.ts` (302),
  `stepreview.ts` (348), `testphase.ts` (412), `fixloop.ts` (679, imported
  only by `workflow/commands.ts`), tests `solution.test.ts`,
  `workflow.test.ts` (1057), `stepreview.test.ts`, `testphase.test.ts`,
  `fixloop.test.ts`. `workflow/project.ts` (442) writes
  `.dabbler/solution/projection.json` the extension's Solution Explorer
  renders (`tools/dabbler-ai-orchestration/src/providers/solutionTreeModel.ts`,
  node kinds `solution`, `component`, `contract`, `usedBy`, `consumer`,
  `progress`, `external*`, `member*`).
- Suites in `dabbler.yaml`: `{name, command, expensive, covers, test_roots,
  test_glob}`; `expensive: true` makes a suite the run of record
  (`drive.ts` `expensiveSuites()`, `phaseRunOfRecord` runs each whole via
  `test-evidence run --stage final-full`) and `testEvidence.evaluateFreshness`
  judges per-suite freshness by a digest over `covers`. Selection rules
  name test FILES. The close gate `test_run_fresh` reads the same records.
- The work plan schema (`driver-work-plan.schema.json`): `task`,
  `releasable`, `steps[{id, ask, files, checks[{argv}]}]`, optional
  `repositories`. `sessions.schema.json` records have no module field.
- Verifier scope: `agency.ts` `sessionScope` (changed paths + declared
  dependencies + the sessions dir), `inScope`, `recordForRound` marks
  out-of-scope reads and the round records `out_of_scope` (counts).
- Owed decisions: `owedDecisions.ts`, `dabbler owed`, the extension's
  Answer Owed Decision.
- The land: `drive.ts` `phaseLand` — direct push, or `candidate/s<N>` when
  `release.gate: candidate` (`gateIsCandidate`, `phaseGateWait`).
- Packaging: `packaging.ts` `loadDeclaration` reads one root `packaging`
  block (`pack`/`push` argv, `{output}`, `{artifact}`, `{feed}`, `{secret}`).
- The POC (`docs/design/module-checkout-poc.md`): a blob-filtered sparse
  clone of one module builds and tests against a committed sibling package
  in `packages/` (relative source in `nuget.config`, pin in
  `Directory.Packages.props`) in 6 s; `git sparse-checkout add` is the
  grant; fetched blobs stay in the clone's store, so a session clone is
  disposable.
- Claude Code has `permissions.blockReadsOutsideWorkingDirectories`
  (documented; on by default).
- Test budget rule of the repository: one test per behaviour; no test runs
  the real toolchain; no source-text assertions; no tests asserting
  wording.
- The suite: 1,165 router tests (node:test) + 209 extension tests (mocha).

## What is asked of you

Review the plan below and answer with **at most eight corrections**, each
one paragraph, each citing the session and step it corrects and saying
what to write instead. Prefer corrections of these kinds, in this order:

1. Anything that would break the governing requirement (a single-module
   repository behaving differently).
2. A step whose mechanism is wrong for .NET as skilled teams practise it
   (the grant overlay via `Directory.Build.props` importing an untracked
   `.dabbler/overlay.targets`; central package pins; `dotnet pack` with
   `-p:PackageVersion`; the `-dev.<yyyymmdd>.<digest>` version's NuGet
   ordering).
3. A session that is too large to finish in one unattended run of a few
   hours, and what to move where — the sessions run in order, so a cut
   that lands early costs less than one that lands late.
4. A vocabulary that will not survive Maven parity in session 108.
5. A test the plan asks for that cannot be written under the budget rules.

Then, separately, in at most five lines: **what you would cut first** if the
block had to finish in fewer than nine sessions, and what you would never
cut. Do not restate the design; do not praise; ground every sentence.

---

# The plan, as drafted

## Why sessions 100–108 exist: one repository, one module per session, a solution plan first

*The design is decided and recorded: consult rounds 6–8
(`docs/design/consults/round8-synthesis.md` amends round 7, which amends
round 6), the developer's walkthrough
(`docs/design/developer-walkthrough-modules.md`) and the module-checkout
POC (`docs/design/module-checkout-poc.md`, 16 s end to end at
`C:\temp\modules-poc`). Both advisors converged; the operator's three
objectives — convenient for the developer, fewer unnecessary reads, a
testing surface that stops at the module — are the block's acceptance
criterion. Nothing below re-opens the design.*

**The requirement the design records were written without, and that
governs every session here.** A solution with ONE module keeps working
exactly as today, with nothing new asked of its developer. csv-model is
such a solution, and so is every repository bootstrapped so far, and so is
this one (it declares no `docs/modules.yaml`). Multi-module behaviour
switches on only when `docs/modules.yaml` declares more than one module.
With one — declared, or implied by an absent manifest — the repository
*is* the module: no focused clone, no `packages/` folder, no contracts, the
run of record is the module's own suites as today, the Solution Explorer
shows one module row. One function answers the question
(`solutionShape`, in `modules.ts`), every multi-module code path asks it,
and the walkthrough test (`walk-session.test.ts`) is csv-model's stand-in:
it passes through every session unchanged.

**What the block is built on, and what it deletes.** The module manifest
(`modules.ts`, `dabbler modules create`, the extension's New Module) is
extended, never replaced. The verifier's scope (`agency.ts`), per-suite
freshness (`testEvidence.ts`), the run of record (`drive.ts`), the two land
shapes (direct push and `release.gate: candidate`), owed decisions,
packaging and the secondary many-repository mode (`solutionDeps.ts`,
`resolution.ts`, `dabbler deps`) all stay and gain a module form. The
six-step component workflow — `solution.ts`, `cli/workflow.ts`,
`cli/solution.ts`, `workflow/commands.ts`, `workflow/log.ts`,
`workflow/terminal.ts`, `stepreview.ts`, `testphase.ts`, `fixloop.ts`,
their five test files and the `solution.yaml` scaffold — is deleted in
session 100, after its plan/decompose/contracts deliverables move into the
two setup-session templates. About 5,700 lines go, and they pay for every
module this block adds under the ground rule that returns with it.

**The nine sessions, with their real dependencies.** 100 solution plan and
manifest (and the deletion). 101 module configuration, the exception
schema and the test-impact vocabulary → 100. 102 designed contracts and
contract-test source → 100. 103 committed immutable packages → 102. 104 the
focused checkout and the Windows preflight → 100–103. 105 module-scoped
sessions, the hard verifier scope, the exposure manifest and grants → 104.
106 the impact plan and the selected run of record → 101, 103, 104. 107 the
atomic land → 106. 108 Maven parity and the hardened profiles → 100–103,
106. Each session ends as every session does: verification, the run of
record, the land, the close. .NET is built first and proven with the POC's
shape; Java is a stated customer and gets parity in 108.

**Operating notes carried from session 99.** A task paragraph starts with
the work, never with `Session N:`. A report names only files the tree
changed. A schema change drags `packages/router/schemas/*.json` and
`packages/router/src/generated/*.ts` into the step (regenerate with `node
packages/router/scripts/run-ts.mjs packages/router/scripts/generate-types.ts`).
A `wait` is answered by a later `next`, after watching the job's
`<job>.status.json`. Nothing touches the tree between a report and the
`next` that judges it.

### Session 100 of 108: The solution plan and the module manifest; the six-step workflow deleted

*The manifest today is `ModuleEntry {slug, title, planPath, codeRoots,
touches, specSections, contextAssets}` in `modules.ts`, unknown keys
refused, written by `dabbler modules create` and read by `approvedPlan.ts`.
The Solution Explorer renders `.dabbler/solution/projection.json`, written
by `workflow/project.ts` from `solution.yaml` and the six-step event log.
Bootstrap writes `solution.yaml` (`scaffoldSolutionManifest`) and two
setup sessions whose prompts are `PLAN_PROMPT` / `DECOMPOSITION_PROMPT` and
`BOOTSTRAP_PLAN` in `bootstrap/templates.ts`. The verb registry
(`cli/registry.ts`, `contracts/verbs.ts`) names `workflow` and `solution`;
`dabbler.yaml`'s selection rules name `workflow.test.ts` and
`testphase.test.ts`, and the lint control refuses a rule naming a file
that does not exist. This session is the block's largest single change
and the one that makes room.*

1. Register; declare `--not-releasable`.
2. **The manifest gains the module vocabulary, and one module is the
   default.** `modules.ts`: four new keys, unknown keys still refused —
   `kind` (`shared-types` | `library` | `application`, default `library`),
   `dependsOn` (slugs that must exist; a cycle is refused by name),
   `package` (the package id a sibling consumes; optional), and `contract`
   (`abstractions` | `package` | `generated`; default `package` when a
   package is declared, absent otherwise). Reverse consumers are derived
   (`consumersOf`, transitive, in dependency order) and never declared.
   One function, `solutionShape(root)`, says whether the solution is
   single-module — an absent manifest, or one entry — and returns the one
   module (implicit: slug the repository's folder name, `codeRoots: ["."]`)
   or the many; every later session asks it and nothing else. `dabbler
   modules create` takes `--kind`, `--depends-on`, `--package`,
   `--contract`; `dabbler modules show` prints the manifest with each
   module's derived consumers, in dependency order, as JSON. Four tests:
   the four keys parse and a cycle is refused; consumers are derived
   transitively; an absent manifest is one implicit module and two entries
   are many; `create` with the new flags round-trips through `show`.
3. **Bootstrap writes a valid one-module manifest and the two setup
   sessions around the solution plan.** `scaffoldModuleManifest` in
   `bootstrap/index.ts` replaces `scaffoldSolutionManifest`: one entry
   named for the repository, `codeRoots: ["."]`, `kind: application`, with
   a comment that says the second entry is what switches the module
   machinery on. The templates: session 1 is *the solution plan*
   (`docs/planning/solution-plan.md` — what the solution is for, the
   modules and what each is responsible for, the contract each exposes,
   the dependency direction, the reason for each cut and the cuts
   deferred; one module is a fine answer and says so — plus the manifest
   through `dabbler modules create`), session 2 *challenges the cuts and
   breaks the plan into numbered sessions, each naming one module*; the
   plan, decompose and contracts deliverables from `solution.ts`'s
   `STEP_DELIVERABLES` move into these two templates as the standard the
   engine is held to. `PLAN_PROMPT` and `DECOMPOSITION_PROMPT` say the
   same. The existing project-plan path stays readable: a repository that
   already has `docs/planning/project-plan.md` is not asked for a second
   file. One test: a fresh bootstrap writes a manifest `solutionShape`
   reads as single-module, and its session plan names the solution plan.
4. **The six-step workflow is deleted.** `solution.ts`, `cli/workflow.ts`,
   `cli/solution.ts`, `workflow/commands.ts`, `workflow/log.ts`,
   `workflow/terminal.ts`, `stepreview.ts`, `testphase.ts`, `fixloop.ts`;
   their tests (`solution.test.ts`, `workflow.test.ts`,
   `stepreview.test.ts`, `testphase.test.ts`, `fixloop.test.ts`); the
   `workflow` and `solution` verbs from `cli/registry.ts` and
   `contracts/verbs.ts`; the selection rules in `dabbler.yaml` that name
   the deleted tests; the `solution.yaml` scaffold and its projection
   write in `cli/bootstrap.ts`; the extension's `workflow.*` router
   surface in its test helpers. `contractdoc.ts` loses its import of
   `solution.ts` and renders a contract file standing alone until session
   102 repoints it. `workflow/project.ts` moves to `projection.ts` at the
   source root and projects **modules** from `docs/modules.yaml`
   (`solutionShape`, dependency order, `dependsOn` and derived `usedBy`),
   with the secondary mode's `external` and `members` kept as they are;
   the event-log fold, the loop counters and `needsYou` go with the
   workflow. `README.md` stops naming the six-step workflow. No test
   asserts an absence; the deletion is proven by the suite that remains
   and by the `schema` test that reads the verb registry.
5. **The Solution Explorer renders modules.** `solutionTreeModel.ts`: the
   `component` and `progress` node kinds become `module` (label the slug,
   description `kind · package: <id> | none yet`, tooltip the title), rows in
   dependency order under the solution row, each expanding to **depends
   on** and **used by** children derived from the projection; the six-step
   description, the progress bar and the "written at step 3" contract text
   go. A single-module solution shows one module row and no dependency
   children. An empty manifest (nothing declared, nothing implied — only
   possible before bootstrap) says *no modules yet — session 1 writes the
   solution plan*. The `contract` child stays and opens
   `modules/<slug>/contract/` when it exists. The extension's `newModule`
   flow offers `kind` and `dependsOn` after slug and title. Three
   extension tests: a projection with three modules renders them in
   dependency order with used-by derived; one module renders one row and
   no children; the empty state says what session 1 does.
6. Affected; verify; full suite as `final-full`; close. The walkthrough
   test is unchanged and green, which is the single-module requirement's
   first proof.

### Session 101 of 108: Module configuration, the exception schema and the test-impact vocabulary

*A suite in `dabbler.yaml` is `{name, command, expensive, covers,
test_roots, test_glob}` (`checks.ts` `SUITE_FIELDS`, `testEvidence.ts`
`loadSuitesChecked`); `expensive` means both "the run of record" and "worth
selecting a subset of", and `evaluateFreshness` skips a non-expensive
suite outright. Selection rules name test FILES (`selection.rules[].select`,
`isTestFile` over `test_roots`/`test_glob`). The work plan
(`driver-work-plan.schema.json`) carries `task`, `releasable`, `steps` and
the optional `repositories`; a session record (`sessions.schema.json`) has
no module. `packaging` is one root block (`packaging.ts`,
`loadDeclaration`).*

1. Register; declare `--not-releasable`.
2. **A suite says which module it proves and what it is required for.**
   Three optional suite fields in `dabbler.yaml` and `dabbler.schema.json`:
   `module` (a manifest slug; refused when the manifest does not declare
   it), `role` (`unit` | `provider-contract` | `consumer-contract`, default
   `unit`), and `against` (the provider slug a `consumer-contract` suite
   runs against; required for that role, refused for the others). And one
   word beside `expensive`: `requiredForClose`, default the value of
   `expensive`, read by `evaluateFreshness` and the close gate
   (`gates.ts`) where they read `expensive` today, so a suite can be run
   and recorded as information (`requiredForClose: false`) without being
   the close's obligation. A single-module repository declares none of
   them and nothing changes. Generated types regenerated. Two tests: the
   three fields load and their refusals name the suite; a suite with
   `requiredForClose: false` is recorded and not demanded by the gate.
3. **The plan and the record name the module.** The work plan gains
   `modules` (a list of slugs) and `reason` (required when it names more
   than one; the reason is recorded verbatim, and `cross-module` is what
   the walkthrough calls it). A plan naming a slug the manifest does not
   declare is refused at acceptance with the slug; a single-module
   solution's plan may omit it and is recorded as the one module. The
   accepted plan's modules go on the session record (`sessions.schema.json`
   gains `modules`, written by the declaring writer only) and are printed
   by `dabbler status`. Two tests: a two-module plan without a reason is
   refused, with one is accepted and recorded; an undeclared slug is
   refused by name.
4. **`modules:` in the root `dabbler.yaml`.** A mapping keyed by slug,
   each entry optional: `packaging` (the same `pack`/`push` shape as the
   root block, used for that module's publish), `sharedFiles` (paths
   outside the module's roots a session on it may change —
   `Directory.Packages.props`, `packages/`), and `contract.generate` (argv
   for session 102's marked fallback). `loadDeclaration` in `packaging.ts`
   takes a module slug and answers the module's block when there is one,
   the root block otherwise; the config loader refuses a slug the
   manifest does not declare. One test: a module's packaging block is
   answered for its slug and the root block for a slug without one.
5. **Selection gains the module form.** `dabbler affected` maps each
   changed path to the module whose `codeRoots` contains it (a path in no
   module is `selection_unknown` as today, unless a module's
   `sharedFiles` names it), and selects that module's suites by their
   `module` field plus each transitive consumer's `consumer-contract` suite
   whose `against` is a changed module. The rules vocabulary gains
   `select: [{module: <slug>}]`, expanding to that module's suites, so a
   rule never hand-lists suites that go stale. Single-module: the file form
   as today. `affected` prints the modules reached beside the tests. Two
   tests: a path under a module's root selects its suites and its
   consumers' contract suites and nothing else; a `{module}` rule expands.
6. Affected; verify; full suite as `final-full`; close.

### Session 102 of 108: Designed contracts and contract-test source

*`contractdoc.ts` renders a YAML contract (`preconditions`,
`postconditions`, `retained`, `sideEffects`, `errors`) to markdown; after
session 100 it stands alone. `docs/modules.yaml` carries `contract`
(`abstractions` | `package` | `generated`) from session 100 and
`modules.<slug>.contract.generate` from 101. The POC's contract page was
hand-written (`modules/model/contract/CsvModel.api.md`).*

1. Register; declare `--not-releasable`.
2. **The contract bundle has one shape.** `modules/<slug>/contract/` holds
   `README.md` (the human notes page: what the module promises beyond its
   signatures, in `contractdoc`'s five sections plus *examples* and *what
   callers must not depend on*), and, for `contract: abstractions` or
   `generated`, `<Package>.api.md` (the public surface with its doc
   comments). `contractdoc.ts` is repointed: `dabbler contractdoc <slug>`
   renders the notes page from a `contract.yaml` beside it when one exists
   (the existing renderer), and for `abstractions` appends the surface
   read from the abstractions project's source — every `public` type and
   member with its `///` summary, in file order — marked *designed*; for
   `generated` it runs `modules.<slug>.contract.generate` and marks the
   page *generated from the built assembly — shape, not behaviour*; for
   `package` it renders the notes page alone. A module that declares a
   contract and has no notes page is refused, naming the path. Two tests:
   the abstractions surface is read from source with its summaries; the
   generated mode marks the page and refuses without a command.
3. **`dabbler module contract <slug>` scaffolds the designed seam.** For a
   .NET module with `contract: abstractions`: `<Package>.Abstractions`
   (the interfaces and types, a project with no test framework),
   `<Package>.ContractTests` (an abstract xunit class per interface with
   one placeholder fact, referencing the abstractions project), the
   implementation's test project gaining a `ProjectReference` to the
   contract tests and a subclass, and the notes page — each written only
   where absent, each named in the output. `--against <provider>` scaffolds
   a consumer compatibility test project under the consumer's `contract/`
   area that references the provider's *package* (`<PackageReference>`,
   pinned centrally) and never its source. The scaffolded xunit projects
   are real: `dotnet build` on the POC repository is the check. Two tests:
   the scaffold writes the three projects and the page and refuses to
   overwrite; `--against` writes a package reference and no project
   reference.
4. **The notes page is part of the module's surface.** A suite whose
   `module` is `<slug>` has `modules/<slug>/contract/` under its `covers`
   by derivation (`loadSuitesChecked`), so a contract change moves the
   suite's freshness digest the way a source change does. One test.
5. Affected; verify; full suite as `final-full`; close.

### Session 103 of 108: Committed immutable packages

*The POC consumes a sibling as `<PackageReference Include="CsvModel" />`
pinned once in `Directory.Packages.props`, from a tracked `packages/`
folder registered by relative path in `nuget.config`; restore, build and
test took 6 s. `packaging.ts` runs `pack`/`push` argv with `{output}`,
`{artifact}`, `{feed}`, `{secret}` substituted. Nothing writes the root
build files today.*

1. Register; declare `--not-releasable`.
2. **The root build files appear with the second module.** When a manifest
   becomes multi-module (`dabbler modules create` writing the second
   entry, or session 1's acceptance), the framework writes what is absent
   and never rewrites what exists: `nuget.config` (the `packages` source by
   relative path, then nuget.org), `Directory.Packages.props`
   (`ManagePackageVersionsCentrally`, no pins yet), `Directory.Build.props`
   (a conditional import of `.dabbler/overlay.targets` for session 105's
   grant overlay, and `EnableSourceLink=false` under `DABBLER_DRIVEN`),
   `packages/.gitattributes` (LFS for `*.nupkg` above the ceiling, see 4),
   and an empty `packages/` with a `README.md` saying what it is. A
   single-module repository gets none of them. One test: the second
   entry writes the five, and a third entry rewrites nothing.
3. **`dabbler module pack <slug>` produces the immutable dev package.**
   The version is `<base>-dev.<yyyymmdd>.<digest>` — base from the module's
   project (`<Version>` / `<VersionPrefix>`, default `0.1.0`), the date
   UTC, the digest the first seven hex characters of the module's source
   tree digest (`treeDigest` over its `codeRoots`), so two packs of one
   tree are one version and a moved tree is a new one that sorts after.
   The pack runs the module's `packaging.pack` argv (session 101) or the
   .NET default `dotnet pack <project> -c Release -o {output}
   -p:PackageVersion={version}` into `packages/`, writes the pin to
   `Directory.Packages.props` (add or replace that one `PackageVersion`),
   and records `packages/<Package>.<version>.json` — the source digest,
   the contract digest and the producing commit — so source, contract and
   package correspond exactly and a package whose source digest does not
   match the tree is refused at the land (session 107). A module whose
   source is not on disk (a focused clone, session 104) is refused with
   the grant named as the way to it. Two tests: the version is a pure
   function of tree and date and sorts after its predecessor; the pin is
   replaced in place and the correspondence record written.
4. **The ceiling.** `modules.packages.ceilingBytes` in `dabbler.yaml`,
   default 5 MB: a package over it is refused unless `packages/.gitattributes`
   tracks `*.nupkg` with LFS, and the message says both ways out. One
   test.
5. **The contract-test and abstractions packages ride with the
   implementation.** `module pack` packs every packable project under the
   module's roots (the abstractions, the contract tests, the
   implementation) under the one version, and `packages/` is what the
   consumer's contract project restores from — proven by `dotnet test` on
   the POC's consumer against a pack made here. One test, over a scripted
   `dotnet`: three projects, three packages, one version.
6. Affected; verify; full suite as `final-full`; close.

### Session 104 of 108: The focused checkout, and the Windows preflight

*The POC: `git clone --filter=blob:none --no-checkout --sparse <origin>`,
`git sparse-checkout set <cone>`, `git checkout <branch>`; eleven files on
disk for the persister and the model's blobs absent from the object
store; 2 s. Claude Code blocks reads outside its working directory by
default (`permissions.blockReadsOutsideWorkingDirectories`). The
extension's Open in New Window exists over repositories
(`commands/openRepository.ts`).*

1. Register; declare `--not-releasable`.
2. **The cone is derived from the manifest.** `checkoutCone(shape, slug)`
   in `checkout.ts` (a new module, paid for by the deletion): the module's
   `codeRoots`; the root build files (`global.json`, `Directory.Build.*`,
   `Directory.Packages.props`, `nuget.config`, the solution file); `packages/`;
   `docs/` (the plan, the manifest, the sessions — the framework's own
   record); each transitive dependency's `modules/<dep>/contract/`; each
   reverse consumer's `modules/<consumer>/contract/` (its consumer-contract
   assets, never its implementation); and the module's `sharedFiles`. Never
   any sibling `codeRoots`. One test: a three-module manifest's cone for
   the middle module names the right folders and no sibling source.
3. **`dabbler module open <slug>` makes the disposable clone.** Under
   `modules.checkout.parent` (default: beside the repository, as
   `<repo>.<slug>`), it clones the repository's `origin` blob-filtered,
   sparse and unchecked-out, sets the cone, checks out the trunk (or the
   session branch when `--branch` names one), writes `<slug>.slnf` at the
   clone's root listing the module's projects, writes the engine's
   working-directory block for Claude Code (`.claude/settings.json`,
   untracked) and prints the path as JSON. `--reset` on an existing clone
   fetches, resets to the trunk and re-narrows the cone (the persistent
   fallback the preflight may choose). A single-module solution refuses:
   the repository is the module, and the message says to open it. The
   extension gains **Open Module** on a module row: `module open`, then a
   new window at the path. Two tests, one of them a walkthrough over a
   local bare origin: the clone holds the cone and no sibling blob
   (`rev-list --missing=print`); a single-module solution is refused.
4. **The Windows preflight, measured here.** `dabbler module preflight`
   times, on this machine: clone and sparse checkout; `dotnet restore`,
   `build`, `test` in the clone; the same on a `--reset` of an existing
   clone; five clones in sequence; with Defender's real-time scan as it
   is. The numbers and the decision — a fresh clone per session, or the
   persistent per-module clone reset at open — are recorded in
   `docs/design/module-checkout-preflight.md`, and `module open`'s default
   follows the decision. The measurement is a recorded run, not a test.
5. Affected; verify; full suite as `final-full`; close.

### Session 105 of 108: Module-scoped sessions, the hard verifier scope, the exposure manifest and grants

*The verifier's scope is `sessionScope` (`agency.ts`: the changed paths,
their declared dependencies, the sessions directory); `recordForRound`
counts an out-of-scope read (`inScope: false`) and the round records
`out_of_scope`. Owed decisions (`owedDecisions.ts`, `dabbler owed`, the
extension's Answer Owed Decision) carry a subject and a default. The Work
Explorer groups sessions by status bucket.*

1. Register; declare `--not-releasable`.
2. **A session on a module runs in its clone and is scoped to it.**
   `session start` in a multi-module solution reads the plan's `modules`
   (session 101) and, when the working directory is the full checkout,
   opens (or resets) the focused clone and says so — the session's
   working directory is the clone, and `next` refuses to advance from the
   full checkout while a module session is in flight there. The verifier's
   scope is the module's `codeRoots`, its `contract/`, its dependencies'
   `contract/` folders, the root build files and `sharedFiles` — never a
   sibling's source. Single-module: `sessionScope` as today. One test.
3. **The verifier refuses, and the round records it.** On the API and
   Copilot transports the tool executor answers a read outside the scope
   with a refusal naming the scope instead of the bytes, the operation is
   recorded `refused`, and `rounds.jsonl` gains `refused_reads` beside
   `out_of_scope` (schema and generated type). A refusal is not a finding
   against the tree. One test over a scripted round.
4. **The exposure manifest.** `.dabbler/runs/s<N>/exposure.json`, written
   at `session start` and again at the close: for each sibling module,
   the implementation bytes present under its `codeRoots` in the session's
   working directory (target zero; `contract/` excluded), the grants in
   force with their reasons, and the files changed outside the session's
   scope. `dabbler status` prints it for the session in flight. Two tests:
   a clean focused clone records zero for every sibling; a widened one
   records the bytes and the grant.
5. **`dabbler module grant` and `revoke`.** `grant <sibling> --reason …
   [--debug]` raises an owed decision (subject `module-grant`, default
   deny) that the operator answers through `dabbler owed answer` or the
   extension; on *grant* the framework runs `git sparse-checkout add` for
   the sibling's `codeRoots`, and with `--debug` writes
   `.dabbler/overlay.targets` (untracked, imported by
   `Directory.Build.props` from session 103) that turns that sibling's
   `PackageReference` into a `ProjectReference` for this clone only,
   records the grant in the exposure manifest, and prints that the window
   reloads. `revoke <sibling>` refuses while the sibling's roots hold
   changes, removes the overlay, re-narrows the cone and records it. The
   engine may raise the request itself: a `next` in a module session
   accepts `--request-grant <sibling> --reason …` and answers with a
   `wait` on the decision. Two tests: a grant widens, records and lays the
   overlay outside tracked files; a revoke with changes present refuses.
6. **The Work Explorer groups by module.** Sessions whose record names a
   module sit under a module row inside their status bucket
   (`workExplorerTreeModel.ts`); a grant request renders as the owed
   decision it is, on the session, with Grant / Deny as the two answers.
   The Solution Explorer's module row gains **Widen for debugging** and
   **End grant**, and a badge while a grant is in force. Two extension
   tests: grouping by module with the single-module case ungrouped; the
   grant decision renders on its session.
7. Affected; verify; full suite as `final-full`; close.

### Session 106 of 108: The impact plan and the selected run of record

*`phaseRunOfRecord` (`drive.ts`) runs every `expensive` suite whole through
`test-evidence run --stage final-full`; `evaluateFreshness` judges each by
its `covers` digest; the close gate `test_run_fresh` reads the same records.
`dabbler affected` has the module form from session 101; `module pack` from
103 makes the candidate.*

1. Register; declare `--not-releasable`.
2. **One impact plan.** `impact.ts` (new, paid for): `planImpact(shape,
   suites, changedPaths)` → the changed modules; each one's `unit` and
   `provider-contract` suites; each transitive consumer's
   `consumer-contract` suite whose `against` is a changed module; the
   modules whose candidate must be packed first; and the paths that
   belong to no module. A shared-types change reaches every transitive
   consumer and is listed as such. Single-module: every `requiredForClose`
   suite, as today. `dabbler affected` prints this plan (modules, suites
   and why each is reached) and nothing computes it a second time. Two
   tests: a leaf change reaches its own suites and its consumers' contract
   suites only; a shared-types change reaches every consumer.
3. **Candidate bytes before the run of record.** In a multi-module
   session `phaseRunOfRecord` first packs each changed module's candidate
   (`module pack`, into `packages/`, pins moved in
   `Directory.Packages.props`) and regenerates its contract page
   (`contractdoc`), as one job whose output is on the record; then runs
   each suite the impact plan names, whole, as `final-full`, with
   per-suite freshness as today — the package path and the contract
   folder sit under the consuming suites' `covers` by derivation, so the
   candidate is inside the digest. A suite the plan does not reach is not
   run and is not demanded by the close gate, which reads the same plan
   (`test_run_fresh` takes the plan's suites, not every required suite).
   Single-module: unchanged. Two tests over the walkthrough with scripted
   suites: the candidate job precedes the suites and the reached suites
   alone run; the gate demands the reached suites and no other.
4. **The Solution Explorer shows the run of record per module.** The
   module row's description gains *run of record: green | red | none* from
   the latest `final-full` records of its suites, and a consumer whose
   contract suite is red against a producer's candidate reads *blocking*
   under that producer's **used by**. **Show impact** on a module row runs
   `dabbler affected` for a hypothetical change under its roots and shows
   the plan. Two extension tests.
5. Affected; verify; full suite as `final-full`; close.

### Session 107 of 108: The atomic land

*`phaseLand` commits everything, pushes directly or pushes
`candidate/s<N>` for the gate (`gateIsCandidate`, `phaseGateWait`), and
writes the gate receipt. The exposure manifest (105) and the correspondence
record (103) exist. A releasable session publishes between the push and the
close (`packaging.ts`).*

1. Register; declare `--not-releasable`.
2. **Tested bytes are the landed bytes.** The land refuses when the tree
   digest at the last green run of record is not the tree it is about to
   commit, naming the paths that moved; when a changed module's
   correspondence record (source digest, contract digest) does not match
   the tree; or when any suite the impact plan reached is stale. Direct
   push for the repository that declares no gate, the candidate branch for
   `release.gate: candidate`, as today. One test: a tree that moved after
   the run of record is refused by path.
3. **Drift and the exposure ceiling at the close.** Two gates.
   `pins_current`: every consumer's pin of a changed module names the
   candidate this session packed (a consumer left on an older pin is
   drift, and the gate names it). `exposure_within_ceiling`: the closing
   exposure manifest shows zero sibling implementation bytes outside a
   recorded grant, and no file changed outside the session's scope and
   `sharedFiles`. Both are single-module no-ops that say so in the close
   log. Two tests.
4. **Module-keyed publish and the bundle record.** A releasable session on
   a module publishes through `modules.<slug>.packaging` (session 101);
   a releasable session on an `application` module also writes
   `release/<bundle>/bundle.yaml` — the application's version, each
   dependency's package id, version and digest as pinned, the source
   commit, the date — and refuses the close if any pin is a `-dev`
   version. Bundling is recorded, never executed. The Solution Explorer
   gains a **bundles** node and each module's *shipped in* derived from
   the records. One router test (the bundle record and the dev-pin
   refusal), one extension test.
5. Affected; verify; full suite as `final-full`; close.

### Session 108 of 108: Maven parity, and the hardened profiles designed against a named customer

*Every .NET-specific piece is behind one seam per session: the root files
(103 step 2), the pack default (103 step 3), the contract scaffold (102
step 3), the surface reader (102 step 2), the `.slnf` (104 step 3), the
grant overlay (105 step 5). `bootstrap/detect.ts` already reads a POM.*

1. Register; declare `--not-releasable`.
2. **The ecosystem seam.** `ecosystem.ts` (new, paid for) names the two:
   `dotnet` and `maven`, chosen per module from what its roots contain
   (`*.csproj` / `pom.xml`), and every seam above asks it. Maven: the
   root files are a parent `pom.xml` with `<modules>` and a
   `<repository>` of `file://${maven.multiModuleProjectDirectory}/packages`;
   the pack default `mvn -pl :<artifact> -am=false package
   deploy:deploy-file` into `packages/` with the dev version; the contract
   scaffold is an `<artifact>-api` module and an `<artifact>-contract-tests`
   module with an abstract JUnit class; the surface reader reads `public`
   declarations and Javadoc from the api module's source; the focused
   checkout's convenience file is `.mvn/maven.config` with `-pl
   :<artifact>`; the grant overlay is a `.mvn/dabbler-overlay.xml` profile
   activated by a file that exists only in the clone. Three tests: the
   ecosystem is chosen per module; the Maven root files and pack argv
   are what the POC's shape says; the Maven surface reader reads Javadoc.
3. **The hardened profiles, designed and not built.**
   `docs/design/hardened-profiles.md`: what a customer who needs sibling
   source hidden from a *machine* rather than from a model is asking for,
   the two profiles (encrypted custody with an external key and
   authenticated encryption, never a one-time pad; a container per
   session), what each costs an ordinary .NET team, the trigger for
   building one (a named customer with the requirement in writing), and
   the seams in this tree it would attach to. The document's check is that
   every path it names exists.
4. Affected; verify; full suite as `final-full`; close.

---

## Test budget for sessions 100–108

The suite at session 100 is 1,165 router tests (1,161 passing, 4 skipped)
and 209 extension tests. Session 100 deletes five router test files with
the workflow they proved. The block adds at most **48 router tests and 12
extension tests**, one per behaviour, at the counts each session states.

The banned kinds still apply: no falsifier twins, no source-text assertions,
no migration-path tests, no tests of test infrastructure, no tests asserting
exact markdown strings, no test asserting the wording of a brief, a stop or
a projection's rendered layout. Two additions for this block: **no test
asserts an absence** — the deletion is proven by the suite that remains —
and **no test runs `dotnet` or `mvn`**; a scripted program stands in, and
the real toolchains are exercised by a step's own check against the POC
repository and by the recorded preflight.

