# Design consult, round 6 — synthesis and decision: how a solution is laid out for one-module sessions

> **Amended by round 7 (same day).** The repository shape below stands. The wall changed: a session runs in a dedicated blob-filtered sparse clone (not a worktree beside a full checkout), the AI reads a generated, committed contract per module instead of sibling source, packages are committed, and the verifier refuses rather than counts. Slides 3 and 4 and the session list are superseded by `round7-synthesis.md`.

**Decided 2026-09-06 by the orchestrator under the standing unattended-work
directive**, after `round6-brief.md` was answered by Sol (`gpt-5.6-sol`,
`round6-sol.md`) and Gemini (`gemini-3.1-pro-preview`, `round6-gemini.md`).
Each claim below was checked against the tree before it was repeated. The
operator can overrule any of it; the reasoning is recorded so they need not
be interrupted for it.

## The question

The operator proposed: one repository with one long-lived branch per local
library; on a module's branch only that module's source is present and every
other module is a committed compiled artifact in its folder; git submodules
considered and set aside as too complicated; local artifacts rather than an
artifact repository because the point is to encapsulate small bites of code
for AI efficiency, with a separate bundling step for releases and release
candidates. And: a solution plan before the repository plan.

## The verdict, in one paragraph

**The goals stand; the branch mechanism does not.** Both advisors,
independently and for the same reasons, reject one-branch-per-module: it
assigns a context-window problem to version-control topology, and no team of
skilled developers organises a repository that way (rule a). Branches that
share no source have nothing to merge, pull requests have no base, CI has no
authoritative tree, `git log`/`blame`/`bisect` become branch-relative,
committed binaries bloat history, and every producer change fans out into
N-1 binary updates. What the proposal is *for* — one repository, one module
in view, the rest as black boxes, a solution plan first, bundling separate
from development — is delivered by a **monorepo with a directory per
module**, which is what the v1 module decision chose in July and what the
operator's own `D:\Projects\dabbler-csv-pipeline` already is.

## The design, as five slides

1. **One familiar trunk monorepo.** `modules/<slug>/` per module, shared
   `Directory.Build.props` / `Directory.Packages.props` at the root, one
   integration history, trunk-based, production is a tag. Nothing a .NET
   or Java team has not seen.
2. **A solution plan first, as a reviewed hypothesis.** Session 001 writes
   `docs/planning/solution-plan.md` (modules, responsibilities, the contract
   each exposes, dependency direction, the reason for each cut, the cuts
   deferred) and `docs/modules.yaml` (slug, title, code roots, package id,
   depends-on). Session 002 challenges it and breaks it into module
   sessions. Splitting or merging a module later is an ordinary session,
   cheap because day zero recorded *why* each boundary exists. The six-step
   `solution.yaml` workflow — which nothing advances and which shows
   `1/6 Plan` forever — is deleted; its decompose/contracts prompts move
   into sessions 001/002.
3. **Sibling modules are packages from one local feed.** A gitignored
   `.local-feed/` at the solution root, registered by a *relative* path in a
   tracked `nuget.config` (Maven: a solution-local repository, reactor
   `-pl :foo` without `-am`). Never committed. The framework rebuilds a
   producer's package when it lands and publishes it under an **immutable
   development version** (`1.3.0-dev.<content digest>`), so NuGet's cache
   can never serve old bytes under a current coordinate. "Artifacts in each
   module's folder" becomes a Solution Explorer grouping, not a disk layout.
4. **A session sees one module.** Every implementation session names a
   module; the driver refuses a step report that touches files outside the
   module's roots (plus bookkeeping); the verifier's scope *is* the module;
   the extension opens the module's solution filter (`.slnf`). And, because
   the engine's own reads are not mediated by the framework under the pull,
   the **focused workspace** is the physical wall the operator asked for:
   `dabbler module open <slug>` creates a git worktree on a short-lived
   session branch with a sparse checkout of that module, its tests, its
   contracts and the shared root build files — no sibling source on disk —
   populates the local feed, and starts the session there; the land merges
   back onto the trunk. Humans doing integration work keep the full
   checkout.
5. **Bundling is recorded, not executed.** `release/<bundle>/bundle.yaml`
   names the modules, exact versions, source commit and artifact digests
   that ship together; the Solution Explorer derives membership. A release
   session bumps versions, publishes each module through its own
   `packaging` block (module-keyed under `modules:` in the one root
   `dabbler.yaml`) to the real feed, and refuses to close against local
   bytes — round 5's one gate, finally built.

**The developer's day:** clone; `dabbler module open converter`; work in
`converter.slnf`; the module's tests run; land to trunk; the framework
rebuilds `converter`'s package into the local feed and the Solution Explorer
shows which consumers are now `stale-local`.

## Where the advisors split, and which side this decision takes

- **Physical wall vs. rule.** Sol ranks the sparse worktree first ("the
  current verifier only counts out-of-scope reads rather than preventing
  them", which is true: `agency.ts` records `in_scope`, it does not
  refuse). Gemini ranks the rule-based wall first and calls sparse checkout
  over-correction ("do not bend git to solve an AI context window
  problem"). **Both are built, in that order**: the rule is needed anyway
  (the driver and the verifier must know the module), and the worktree is
  the only thing that bounds the *engine's* context, which is where the
  $6,000 went. It is one command the framework runs, explained in one
  sentence ("the module opens in its own folder with only its source; the
  rest are packages") — it passes rule (b) as long as the developer never
  types a sparse-checkout command themselves.
- **Source mode.** Gemini would delete the reversible
  `PackageReference`→`ProjectReference` swap; Sol keeps it as the
  debugging escape hatch. **Kept**: stepping into a sibling's source while
  debugging is what a .NET developer does, and the swap's refusal of the
  run of record and the close is the guard that makes it safe.
- **Immutable dev versions.** Sol insists; Gemini agrees ("do not overwrite
  coordinates"). Adopted. The operator's round-5 instinct ("a human just
  rebuilds when it looks stale") is right about attestations and wrong
  about package caches: a rebuilt `1.3.0` with new bytes is served from
  the cache as the old bytes, silently. A digest suffix costs nothing to
  explain.

## What is deleted, kept, and left as a secondary mode

- **Deleted**: the six-step component workflow (`solution.ts`,
  `cli/workflow.ts`, `workflow/commands.ts`, `stepreview.ts`,
  `testphase.ts`, the `solution.yaml` scaffold and its projection's
  `step` fields), after its prompts are moved.
- **Kept, module-aware**: `dabbler deps check/show/feeds/restore`,
  `resolution.ts` source mode, the `packaging` substitutions and the
  folder-feed credential rule, `.dabbler/solution/projection.json` as the
  Explorer's read model.
- **Secondary mode, for solutions that really are several repositories**:
  `solution-dependencies.json`, the plan's `repositories` member,
  `deps locate/clone/scaffold`. Session 001 decides which shape a solution
  is; the four-repository trial is the shape nobody chooses by default.
- **Cost of breaking**: none outside this desk — the Marketplace serves
  1.0.4 and 2.0.x exists only on the operator's machine.

## The sessions this implies (day-sized; real dependencies marked →)

1. **Solution plan and module manifest.** Schemas for
   `docs/planning/solution-plan.md`'s structure and `docs/modules.yaml`;
   bootstrap writes sessions 001/002 around them; the six-step workflow's
   decompose/contracts prompts move into those sessions and the workflow,
   its verbs, tests, gates and `solution.yaml` are deleted.
2. **Module-aware configuration.** → 1. `modules:` in the root
   `dabbler.yaml`: roots, tests, contracts, allowed shared files, a
   per-module `packaging` block; validation of overlaps, missing roots,
   duplicate package ids, cycles.
3. **Module-scoped sessions.** → 2. A session names one module; the step
   report refuses files outside its roots; the verifier's scope is the
   module; the Work Explorer groups sessions by module again.
4. **Immutable local packages.** → 2. Root `.local-feed/`, tracked
   `nuget.config`, content-derived dev versions, a gitignored local
   override lock, rebuild of a landed producer through its own
   `pack`/`push`.
5. **Drift and restore.** → 4. `stale-local` in the projection and the
   Explorer; consumer restore when a producer's package changed.
6. **Focused workspace.** → 3, 4. `dabbler module open <slug>`: worktree,
   session branch, sparse patterns, `.slnf`, feed; the land merges to
   trunk; the full checkout stays for humans.
7. **Local-byte gate and bundle recording.** → 4, 5. Releasable close
   refuses local bytes; `release/<bundle>/bundle.yaml` and its Explorer
   read model; a release session publishes module-keyed.
8. **Maven parity and the secondary mode.** → 4. Reactor `-pl`, a
   solution-local repository, dev-version overrides; regression tests for
   `solution-dependencies.json`, `repositories`, `deps clone/scaffold`
   and source mode; the csv-pipeline tutorial re-cut to the monorepo
   shape.

Ordering 5 before 6 and 7 is convenience; everything else is a real
dependency. Session 99 (this tree) precedes all of them and touches none
of this.

## Which rules decided it

(a) monorepo + solution filters + a local feed is what skilled .NET/Java
teams do; branch-per-module is not. (b) five slides above; the one
unfamiliar part, the focused worktree, is one command and one sentence.
(c) no committed binaries, no fan-out, one integration history. (d) the
worktree spends framework effort to keep the engine's context small — AI
cost down, developer time untouched. (e) every element is .NET-first with a
Maven equivalent named. (f) two advisors, one disagreement, resolved above.
