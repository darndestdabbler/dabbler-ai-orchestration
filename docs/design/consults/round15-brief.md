# Consult, round 15: the critical junction — simple, reliable, and worth using

You are consulted on `dabbler-ai-orchestration`, the AI-led coding-session
framework: a TypeScript router (`dabbler <verb>`) bundled into a VS Code
extension, whose customers are .NET and Java teams in an IT shop. A session
is driven by `dabbler session next`: the engine (Claude Code, Gemini CLI or
Copilot CLI) answers one instruction at a time — a work plan, then each
step — and the framework runs each step's checks, a cross-provider review
(a different vendor's model reviews every session), the complete suite as
the run of record, the commit, the push, a release when the repository
declares packaging, and the close.

You have NO tool access. Every claim about the repository must cite a path
or a fact from this brief; mark anything else ASSUMPTION. Do not invent
paths.

## Why this round is different

**The framework is at a critical junction, and the operator has said so
plainly.** Their staff watched the framework drive a small CSV tutorial and
saw it deadlock. In the operator's words:

- "There is a ZERO DEADLOCK TOLERANCE. No more. My developers won't use it
  if there are any more deadlocks."
- "I could tell that they were thinking — why are we using this if it just
  results in deadlocks."
- "We have spent a huge amount of time and money on a solution that just
  looks overly complicated and doesn't work reliably."
- "If I just asked AI to create a CSV solution, it would do so pretty
  reliably in 15 minutes. The whole solution. But it took about 15 minutes
  for the Person Model to be created — just a simple Person class."
- On the module folder: "There is a lot of complexity here without a lot
  of benefit. It seems that we just substituted repos with folders that
  aren't repos."
- "If there is a way to simplify, maybe we need to do it."

What the operator needs from this round: **a framework that is simple AND
reliable for human developers, with minimal friction, whose value a
developer can see** — not deadlocks, not delays, not complexity standing in
the way of productive work. Recommending that something be deleted is a
first-class answer. Recommending a new mechanism must clear a high bar:
say what it replaces and why nothing simpler works.

## How the operator judges a design (standing rules)

- **(a)** What would really skilled human developers do — not what an ideal
  AI-designed system would do.
- **(b)** The PowerPoint test: a design that needs a state machine or
  protocol language to explain will be rejected by developers.
- **(c)** Simpler, more reliable, more performant, every time.
- **(d)** Human developer time outranks AI time.
- **(e)** The customer is a .NET or Java team. Java AND .NET are the
  minimum.
- **Do not over-gate AI process.** Gates the framework invented for itself
  can be overridden by the operator.
- **Kept regardless:** the author never reviews itself; the record under
  `.dabbler/runs/` is written only by the framework.

## Facts: the two deadlocks the staff saw

The tutorial is a four-module .NET solution (`person-model`, `csv-import`,
`person-store`, `csv-parser`) on Azure DevOps, logged by the engine in
`docs/framework-issues-log.md`.

**Deadlock 1 — a session closed by hand could never be collected.** After
several close gates failed, the engine ran `dabbler session close` directly
(a documented verb). It succeeded: the ledger showed the session complete
and VERIFIED. But the driver's own run file still said `phase: close`.
Every later `session next` found that run, re-entered the close phase, and
spawned `session close` again (`phaseClose` in
`packages/router/src/drive.ts` spawns the verb with no check of whether the
session is already closed), which refused "no session is in flight". The
driver labels the same stop on the same step for the same reason twice as
`DEADLOCK` (`judgeStopClass` in `drive.ts`). There are 47 places in
`drive.ts` that construct a stop.

**Deadlock 2 — a file outside the module folder was silently never
committed.** A module session runs in a "focused checkout" (below). The
function that decides which folders it holds (`checkoutCone` in
`packages/router/src/checkout.ts`) includes the module's code roots, every
dependency's and every consumer's contract folder — but not the module's
OWN contract folder. The package build then refused because
`modules/person-model/contract/README.md` was missing (it existed in git,
outside the checkout). The engine re-wrote it; `git add` printed "will not
be updated in the index" and skipped it; the land's tree check reads file
contents from disk, so it saw a tree git would not commit, and refused
"the tree is not the tree the run of record tested" on every re-run.

Other log entries: `dabbler modules create .` wrote a solution file named
`..slnx` (the name is `basename(root)` of the raw argument,
`packages/router/src/ecosystem.ts`); the bootstrapped session-1 plan tells
the engine to report the plan step `blocked` when no brief exists, but the
report verb refuses `blocked` for that step's schema; the repository's
`origin` remote was an Azure DevOps web page URL, found only at the push.

## Facts: where 15 minutes goes

Measured on the operator's other sample (`D:\Projects\csv-parser`, same
Person class, router 2.5.0), session 3 ran 14½ minutes start to close:

| where | time |
| --- | --- |
| registration and the engine writing a work plan (4 steps, each with its own build check) | ~2½ min |
| the engine writing `Person`, its tests, root build files | ~3½ min |
| cross-provider review, round 1 | ~40 s |
| the framework's own package job broke the build (below): a fix step, review round 2, re-run | ~5½ min |
| run of record, publish, close (`dotnet test` itself: 3 s) | ~2 min, mostly idle |

**Idle waits.** When `next` starts a long job it polls once and, if the job
has not ended, returns a `wait` telling the engine to call back after 60 s
(review, suite fallback, publish) or 15 s (close) — `longWork` in
`drive.ts`. A 3-second suite still costs the engine a 60-second sleep.

**The package job broke the build.** Before the run of record, a "candidate"
job packs each changed module into a committed `packages/` folder under an
immutable dev version (`1.0.0-dev.20260913.2.g21df11f`) and pins it in a
root `Directory.Packages.props`. Writing that file turned on NuGet Central
Package Management for the whole solution, and every test project's
versioned `PackageReference` failed restore (NU1008). Separately, the
package job refused a `contract: package` module with no notes page at
`modules/<slug>/contract/README.md`, a requirement nothing earlier in the
session named. (Both were patched in later releases; the operator's
tutorial above then met the contract page again in the checkout form.)

## Facts: the module machinery, and why it exists

It was designed in consult rounds 6–8 to stop an AI session reading far
more code than it needs (a past bill of about $6,000 was traced largely to
oversized contexts). The decisions, all built:

- **Monorepo, a directory per module**, declared in `docs/modules.yaml`:
  `slug`, `title`, `kind` (`shared-types` | `library` | `application`),
  `codeRoots`, `dependsOn`, `package`, `contract` (`designed` | `package` |
  `generated`), plus a `deployables:` block (`kind` service | job | cli,
  `runtime` container | archive | installer, `from` the application
  modules). Read by 27 router files and 5 extension files.
- **Siblings consumed as packages, never source.** In the sample,
  `modules/csv-deserializer/CsvParser.Csv/CsvParser.Csv.csproj` has
  `<PackageReference Include="CsvParser.Person" />` resolved from the
  committed `packages/` folder through `nuget.config`; Maven deploys to a
  solution-local repository, including the root parent POM.
- **A contract folder per module** with a notes page, so a consumer reads
  the promise instead of the implementation.
- **The focused checkout ("module folder").** A module session runs in a
  second git clone placed beside the repository (`<repo>.<slug>`),
  blob-filtered and sparse, holding only the module's roots, root build
  files, the record, the packages folder and the relevant contract folders.
  It is kept between sessions and reset at open, opened in its own VS Code
  window, pushed then pulled back into the main checkout at close. Widening
  it is a "grant" (`git sparse-checkout add`) or a `sharedFiles` entry in
  `dabbler.yaml`. Every session is FOCUSED (the plan names one module) or
  GLOBAL (the whole repository, no wall). A solution-wide `dotnet test
  CsvParser.sln` cannot run in a focused checkout, so the sample's operator
  re-declared one suite per module.
- **Test impact selection**: changed module's suites plus consumers'
  consumer-contract suites (`packages/router/src/impact.ts`).

Approximate sizes: `checkout.ts` 714 lines, `exposure.ts` 464, `policy.ts`
158, `packages.ts` 511 (module packing), `contractdoc.ts` 434, `impact.ts`
397, `modules.ts` 960, `ecosystem.ts` 2,265 (.NET/Maven scaffolding, pins,
API-surface reading), CLI verbs `module`/`modules` 961; extension
`solutionTreeModel.ts` 1,501 (the Solution Explorer, filled from
`docs/modules.yaml`) plus Open Module and Grant commands. Separate and not
in question here: `packaging.ts` 1,500 (the release: `dabbler.yaml`
`packaging.pack`/`push` argv, a feed, a credential NAME, a git tag) and
`solutionDeps.ts` 1,249 (a secondary mode for a solution spread across
several repositories), which already parses `.csproj` `PackageReference`
and `ProjectReference` and `pom.xml` `<dependency>` elements (no Gradle).

## Facts: planning today

Session 1 of every repository turns a brief into
`docs/planning/solution-plan.md` (objective, modules with responsibilities,
contracts, dependency direction, phases) and declares modules through
`dabbler modules create`. Nothing asks how the solution will run in
production.

## The directions under consideration

The orchestrator's draft, for you to attack, amend or replace:

1. **Zero deadlocks.** Fix both causes. Every late phase (land, publish,
   close) first checks whether its effect already exists and, if so,
   records it and moves on. Audit all 47 stops: each either recovers by
   itself or names one command that actually moves it; a stop naming a
   command that refuses is a defect. Walk the tutorial end to end, timed,
   on the built extension before any release.
2. **Delete the module folder.** Every session runs in the developer's own
   checkout. The plan still names which projects a session changes; the
   step report already lists every changed file, so a step that changes
   another project's files is rejected at that step with the files named
   (a rejection the engine fixes at once, not a stop).
3. **Project references instead of in-repo packages**, for .NET
   (`ProjectReference`, `.sln`/`.slnx`) and Java (Maven reactor sibling
   `<dependency>`; Gradle `project(':x')`). Packages only for what ships
   outside the repository. Delete the candidate job, the local package
   folder, central pinning of sibling packages, and contract pages.
4. **No abstraction layer over the solution.** Derive projects, references,
   package ids and project type (web/worker/exe; jar/war/Spring Boot) from
   the `.sln`/`.slnx`/`.csproj` and `pom.xml` files; fill the Solution
   Explorer from them; keep each module's purpose in the solution plan
   document. Retire most of `docs/modules.yaml`. Run the whole solution's
   tests (`dotnet test`, `mvn verify`) instead of impact selection.
5. **No idle waits.** `next` waits inside the call (up to about 90 s,
   polling each second) and returns the moment a short job ends.
6. **Tiers in planning.** Session 1 asks the developer how production is
   split: (1) three tiers — the application calls a separate service tier's
   APIs and only the service touches the database (the operator's staff,
   usually); (2) two tiers — the application talks to the database
   directly (enough for some shops); (3) other. A shop can set a default the
   developer confirms. The answer shapes the project layout and, for three
   tiers, one check read from project references: the client project never
   references the data project.
7. **Deployment artifacts, not deployment.** For the tutorial nothing is
   deployed, but each tier's artifact must be produced the way the operator
   hands it over (open question: IIS zip / Windows service / container
   image; self-contained exe; SQL migration script or DACPAC; Java jar/war
   or image), into a folder per tier.

## Ask

1. **Zero deadlocks.** Is the draft enough to make a stuck session
   structurally rare rather than patched case by case? What single
   principle would you hold every phase to? What would you delete from the
   driver instead of auditing it?
2. **The module folder.** Delete, keep, or replace with something smaller?
   What, if anything, should stop a session wandering into another
   project, and is a step-time rejection itself a new place to get stuck?
3. **Project references for .NET and Java.** Any trap for either
   ecosystem (Maven reactor builds of one module, Gradle, versioning, what
   ships outside)? What survives of "a consumer reads the promise, not the
   implementation"?
4. **The abstraction layer.** Can `docs/modules.yaml` go? What is the
   smallest set of facts the build files cannot give, and where should they
   live? Can the Solution Explorer be filled from the solution files alone
   for both ecosystems?
5. **Speed.** What should a one-class session cost in wall-clock time, and
   what would you cut to get there — the idle waits, the number of steps,
   review rounds, the run of record, a release every session?
6. **Tiers in planning.** The simplest way to ask, record and act on it
   without new machinery. Is the one reference check worth having?
7. **Deployment artifacts.** How should a .NET and a Java solution declare
   and produce per-tier artifacts without deploying? Keep the
   `deployables:` block, shrink it, or derive it?
8. **The value a developer can see.** In one paragraph: after these
   changes, what does a developer get from this framework that they would
   not get from asking an AI directly, and is that worth the time it adds?

---

## Answer shape

For EACH of the eight questions, in order:

- **Recommendation:** one sentence.
- **Design:** the simplest design, at most six sentences, naming what is
  deleted and the seam from the facts above that it attaches to.
- **The one risk** and its mitigation, one sentence each.
- **What a skilled human team does**, one sentence.

Then, overall:

- **Ordering:** sessions, one per line: what it does and what it deletes.
  Put what removes deadlocks and delay first.
- **What NOT to build:** anything in the draft or your own design to leave
  out, and why.
- **Where the draft is wrong:** be specific.
- **Disagreements you expect** the other advisor to raise, and your answer.

Plain language. No headings beyond the ones named here. Mark every claim
not grounded in this brief as ASSUMPTION.
