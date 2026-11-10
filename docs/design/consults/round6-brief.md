# Design consult, round 6: one repository, one branch per local library — or what?

You are consulted on `dabbler-ai-orchestration`, the AI-led coding-session
framework (a TypeScript router `dabbler <verb>` bundled into a VS Code
extension) whose customers are **.NET and Java teams**. You answered
rounds 1–5 on packaging, modularity and decomposition. This round asks a
new, concrete question the operator has put on the table: **how a solution
should be laid out on disk and in git so that an AI session works on one
small library at a time.**

You have NO tool access. **Every claim you make about this repository must
cite a path or a number from this brief. Mark any claim you cannot ground
here as ASSUMPTION.** Do not invent paths.

---

## The governing rules (the operator's, verbatim in substance)

Every recommendation is judged by these, in this order:

- **(a)** Ask what *really skilled human developers* would most likely do —
  not what an ideal AI-designed system would do. The framework is judged
  against the practice it replaces.
- **(b)** The PowerPoint test: if the design cannot be explained in a few
  slides, developers will reject it for something simpler.
- **(c)** Prefer simpler, more reliable, more performant over complex.
- **(d)** Keep AI costs lower, but *human developer time outranks AI time*.
- **(e)** The customer is a .NET or Java team, not this TypeScript repository.
- **(f)** Get informed input, then decide; do not wait.

And the measured lesson behind all of it: **this application has cost over
$6,000 in tokens**, and the operator attributes most of that to AI working
in oversized contexts. "Unless we break solutions down into blackboxed
libraries or services, AI gets overwhelmed." **The package boundary is the
AI context boundary.** That is the whole reason this question exists.

---

## The operator's proposal, as stated today (2026-09-06)

> I almost feel like we should start with a **solution plan before the repo
> plan**. The solution plan could identify how to break up the solution into
> a set of local libraries. This would be a breaking change, but potentially
> easier for developers.
>
> **One repo with multiple branches — each for one of the local libraries.**
> Within a branch, compiled artifacts for all dependencies (upstream and
> downstream) are available in their respective module folders. **Only in
> the owning branch for a module is the code available** to the developer
> and AI engine.
>
> Git submodules are an option, but my understanding is that they are so
> complicated that most developers don't use them.
>
> Remember that we are trying to model the framework against a baseline of
> what good developers would do. So why **local artifacts**, rather than just
> pushing them to an artifact repo? Because the local repos are about
> **encapsulating small bites of code for development purposes** — limiting
> the scope of work so that AI engines work efficiently. They aren't about
> how the ultimate solution architecture will end up. That's where a
> **solution bundling approach for releases and release candidates** would
> come into play.

Read the proposal for its goals before its mechanism. The goals, as we read
them:

1. An AI session sees **one module's source and nothing else** — a physical
   or near-physical wall, not a request to be disciplined.
2. The other modules are present only as **compiled, black-box artifacts**
   with a contract, the way a NuGet or Maven dependency is.
3. **One repository**, not N — the four-repository trial (below) cost a
   bootstrap, a plan and a session series per repository.
4. Nothing to install, no submodules, no ceremony a developer would not
   accept.
5. Development decomposition is **separate from** release architecture: a
   bundling step composes releases and release candidates later.

---

## What exists today, with paths

**Sessions and plans.** `dabbler bootstrap` writes the managed guidance
(`AGENTS.md`, imported by `CLAUDE.md`/`GEMINI.md`), `dabbler.yaml`, a
`solution.yaml`, and two setup sessions: session 001 authors
`docs/planning/project-plan.md`, session 002 breaks it into numbered
sessions appended to `docs/sessions/session-plan.md`. A session runs under
a pull loop (`dabbler session start`, then `dabbler session next` until
`done`): plan step, work steps with mechanical checks, cross-provider
verification, the complete suite as the run of record, commit, push,
optional publish, close. The verifier is granted a **scope** (the step's
files plus bookkeeping) and every read it makes is recorded with
`in_scope` and a fidelity grade (`packages/router/src/agency.ts`,
`recordForRound`/`readFidelity`); an out-of-scope read is *counted*, not
prevented.

**The plan can place sibling repositories.** The plan step's ask offers an
optional `repositories` member: "other repositories of this SOLUTION the
plan needs to exist … Each is placed when this plan is accepted — created
beside this one, declaring which solution it is in and nothing else"
(`packages/router/src/drive.ts` ~line 1624). The trial's agent left it out
because nothing said who decides.

**Cross-repository dependencies.** A repository declares what it consumes
in `solution-dependencies.json` (`packages/router/src/solutionDeps.ts`):
each edge names `id`, `kind` (`nuget` | `maven`), `producedBy {id, remote,
path}`, `resolve` (`feed` | `source`). It carries no versions — the pin is
read from the `.csproj`/POM. Consumers are **derived, never declared**.
`dabbler deps` has `check, show, feeds, source, restore, locate, clone,
scaffold`. **Source mode** swaps a `PackageReference` for a
`ProjectReference` reversibly, records every swap in `source-mode.jsonl`,
and "the run of record, packaging and the close all refuse while any
dependency is resolving from source" (`packages/router/src/resolution.ts`
header). The header also says why submodules were rejected: source mode is
"how someone steps into a dependency's source while debugging — the thing
git submodules were being considered for."

**Publishing.** Declared per repository in `dabbler.yaml` as `packaging:`
with `pack.argv` and `push.argv` substituting `{output}`, `{artifact}`,
`{feed}`, `{secret}`; `secret` is the NAME of an env var. A feed that is
unmistakably a folder on disk (`D:\feed`, `/feed`, `\\server\feed`,
`file://`) takes no credential (`packages/router/src/packaging.ts`,
`feedTakesCredential`). A session declared releasable publishes between
push and close; a non-releasable one publishes nothing.

**The round-5 decision, NOT YET BUILT.** After round 5 the operator chose
"Gemini's mechanics plus Sol's one gate": a local folder feed reached
through the existing `packaging` block, no new `resolve` mode, the
framework adding (i) rebuilding the local artifact when the producer
changes, (ii) a `stale-local` drift row in the Solution Explorer, (iii) one
rule — a releasable session may not close against local bytes. Sessions
90–98 were spent elsewhere (the pull loop's defects, an ACP client, the
csv-model findings). **None of (i)–(iii) exists in the tree today**
(no `stale-local` anywhere under `packages/router/src` or
`tools/dabbler-ai-orchestration/src`).

**The v1 module decision (2026-07, operator-approved, in a prior generation
of this framework).** "Monorepo — NOT git submodules (the operator's
instinct was right; submodules are for vendored deps) — with a directory
per module; trunk-based, `main` is the trunk and production is a tag;
`docs/modules.yaml` manifest (`slug`/`title`/`codeRoots`/`planPath`)."
And the reframing that followed: "a module is a UNIT OF WORK FOR AN
INDIVIDUAL DEVELOPER … NO TWO DEVELOPERS should work the same module at
the same time, because AI is fast and pervasive enough that concurrent
same-module work invites constant merge conflicts." That generation's
Explorer grouped sessions by module. The v2 rebuild dropped the module
tier; `solution.yaml` in v2 is the manifest of a separate six-step
component workflow (`plan → decompose → contracts → mocks → integration →
build`, `packages/router/src/solution.ts`) that nothing in the session
lifecycle advances, so every bootstrapped repository shows `step: plan`
forever. Rounds 4–5 both advised deleting that state machine and keeping
its decompose/contracts prompts.

**The trial that prompted this round.** `D:\Projects\csv-model` is the
first of **four separate repositories** forming a hello-world pipeline on
.NET 10: `csv-model` (a `Person` class library), `csv-deserializer`,
`csv-persister` (EF Core + SQLite), `csv-listener` (Quartz.NET console).
Repositories 1–3 publish NuGet packages to a local folder feed
(`D:\Projects\dabbler-local-feed`); 4 consumes them. csv-model alone took
**six sessions over one day** (bootstrap-written 001 and 002, then
scaffold, model, package metadata, publish) to produce one class with three
properties and push `CsvModel.0.2.0.nupkg` to the folder feed — the
framework, not the code, was under test, and every session also wrote a
notes file. Three more repositories would each need their own bootstrap,
plan, and session series. The operator's proposal is a reaction to that
shape.

**A monorepo the operator already built by hand.**
`D:\Projects\dabbler-csv-pipeline`: one `.slnx`, `Directory.Build.props`,
`Directory.Packages.props` (central package versions, one `ItemGroup` per
module), `modules/converter`, `modules/persistence`, `modules/watcher`
(each an ASP.NET Core app with `src/` and tests), `docs/design.md`,
`samples/`. Its README: "74 tests, about 9 seconds, and nothing to install
but the .NET 10 SDK." It is the "known-good reference solution that a
Dabbler tutorial is built around."

**Working-tree integrity.** The driver snapshots the working tree into a
git tree id around every step (`baseline_tree` in
`.dabbler/runs/s<N>/driver/run.json`); ignored paths (`bin/`, `obj/`) do
not move it. The close gate `working_tree_clean` refuses uncommitted work;
`test_run_fresh` hashes every tracked file (`testEvidence.surfaceDigest`).

**No public 2.x users.** The Marketplace serves extension 1.0.4; 2.0.x has
been built and installed only on the operator's machine. A "breaking
change" breaks nobody outside this desk today.

---

## The questions

### Q1 — The branch-per-module design, on its own terms

One repository; one long-lived branch per module; on branch `modules/foo`
the working tree holds `foo`'s source and, for every other module, only a
compiled artifact in that module's folder; the artifacts are committed.

- Does any team of skilled developers organise a repository this way? If
  not, say what breaks: merging (branches that share no source have
  nothing to merge), pull requests and code review, CI (which branch does
  a pipeline build?), `git log`/`blame` across the solution, binaries in
  history, the cost of "rebuild every downstream branch's copy of `foo`'s
  artifact" after each change to `foo`.
- Is there a reading of the proposal under which it is *not* branches —
  e.g. one trunk with **`git sparse-checkout`** or a **`git worktree`** per
  module — that gives the physical wall the operator wants while staying
  something a developer recognises? Say whether real teams use sparse
  checkout for this (large monorepos do; is it plausible for a 3–10 module
  .NET solution?).

### Q2 — Rank the alternatives by rules (a)–(e)

Give a verdict and a one-line reason for each:

1. **Monorepo, directory per module, local folder feed, framework-enforced
   scope** — the round-5 design plus v1's `codeRoots`: every module's
   source is on disk; a session is scoped to one module's directory; the
   other modules are consumed as packages from a gitignored local feed the
   framework keeps fresh; the verifier's agency record already counts reads
   outside scope. The wall is a rule, not a filesystem.
2. **Monorepo plus a physical wall** — (1) with a sparse checkout or a
   worktree per module so the AI's working directory literally lacks the
   other modules' source.
3. **The operator's branch-per-module** as written.
4. **Separate repositories plus the local feed** — the csv-model shape,
   made cheaper by the `repositories` member and `deps scaffold`.
5. **Git submodules.**

For .NET specifically: does a solution filter (`.slnf`) per module, with
`Directory.Packages.props` at the root and sibling modules referenced as
`PackageReference` from a local feed, give the black-box property without
any git trick at all? What is the Java/Maven equivalent (a reactor with
`-pl`, a local `~/.m2` install)? Be concrete; the customer is that team.

### Q3 — "Solution plan before repo plan"

The operator wants bootstrap's setup to begin with a **solution plan** that
identifies the local libraries, before any per-library plan. Rounds 4–5
both said month-zero decomposition is usually wrong and should be a
reviewed hypothesis with rationale, not a topology.

- What is the smallest honest shape of a solution plan at day zero: the
  modules, the dependency direction, the contract each exposes, the reasons
  for each cut, the cuts deferred? Where does it live in a monorepo
  (`docs/planning/solution-plan.md`? the module manifest?), and what does
  bootstrap write versus what session 001/002 author?
- How does a later "split this module in two" or "merge these" session
  happen, and what must day zero have recorded to make that cheap?

### Q4 — Where the artifacts live

The operator says "compiled artifacts for all dependencies are available
in their respective module folders."

- What does the package manager actually need? (NuGet: one folder source,
  registered by absolute path or by a **relative path in a tracked
  `nuget.config`**; Maven: a local repository or a `file://` repository in
  the POM.) Is "one gitignored feed folder at the solution root" simply the
  right answer, and the per-module folder idea a presentation detail the
  Solution Explorer can render?
- Are the artifacts ever committed? (Our reading: never; they are rebuilt
  by the framework when the producer changes, per round 5.) Say what a
  second developer on a differently shaped disk needs: is a tracked
  relative path enough?
- Versioning between modules during development: does the local feed hold
  one floating dev version per module (overwritten in place, which NuGet's
  cache fights) or a bumped version per rebuild? What do teams using local
  feeds actually do, and what did round 5's "never overwrite the same
  coordinate with different bytes" imply for the developer?

### Q5 — Making the scope real for the AI

If the wall is a rule (alternative 1), how does the framework make "this
session sees only module `foo`" true enough that the cost lesson holds?
Options we see: the session's plan names `codeRoots`; the managed guidance
says so; the driver's step report refuses files outside the module; the
verifier's scope is the module; the extension opens the module's `.slnf`.
Which of these are enough, and which is theatre? If the wall must be
physical (alternative 2), what is the one command a developer runs, and
what does the framework do for them?

### Q6 — Release bundling in a monorepo

Round 5 settled that the framework **records** bundles and never
**executes** them. In a monorepo, where does the bundle definition live
(`release/<bundle>/bundle.yaml`?), and does a release session simply bump
the modules' versions and publish them to the real feed through each
module's `packaging` block — is a module's `packaging` block then declared
per module directory rather than per repository, and what does that do to
`dabbler.yaml`, which is one file per repository today?

### Q7 — The breaking change

Given no public 2.x users, is "breaking" a cost at all? What in the tree
above (`solution-dependencies.json`, `deps`, `resolution.ts`'s source
mode, `solution.yaml`, the six-step workflow, the `repositories` member)
survives a monorepo-first design, what is deleted, and what is kept for the
multi-repository case that some customers will still have?

---

## What to answer

For Q1–Q7: **Soundness** (with a cited path or number per claim), **Risk**
(the failure you would bet on), **Recommendation** (one, concrete, small
enough to build). Then, once:

8. **One recommended design**, in the form of the slides you would show a
   .NET team lead — five bullets at most — and the developer's day: clone,
   open, work on one module, run its tests, land, see the others rebuild.

9. **A session decomposition** for the framework work implied by your
   recommendation, as an ordered list of day-sized sessions, each ending
   with a green suite, cross-provider verification and a commit. Say which
   orderings are real dependencies and which are convenience.

10. **The disagreement.** Say plainly where the operator's proposal is
    wrong, and where you expect the other reviewer (one of you is a GPT
    model, the other Gemini) to be wrong. Agreement is not the valuable
    output.

Be direct. The operator has asked for review, not endorsement.
