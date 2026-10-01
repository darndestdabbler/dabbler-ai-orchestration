# Design consult: replacing the full-suite close with layered libraries + lazy diagnosis

You are consulted as an outside reviewer on a testing-architecture decision
for `dabbler-ai-orchestration`, a TypeScript monorepo (`packages/router` =
a session-lifecycle CLI; `tools/dabbler-ai-orchestration` = a VS Code
extension bundling it). You have NO tool access. Everything you need is in
this brief, and it is measured ground truth, not summary. **Every claim you
make about this repository must cite a path or number from this brief.
Mark any claim you cannot ground here as ASSUMPTION.** Do not invent paths.

## The system today

- One test suite: 1263 vitest tests under `packages/router/test/`,
  run `npx vitest run --root packages/router`, capped at 2 workers locally
  (`packages/router/vitest.config.ts`) because a 4-worker run made the
  operator's 20-core Windows host unusable (measured: 20 workers = 94 s
  wall / 873 s CPU — contention).
- Per session (a unit of AI-driven work), the framework runs:
  `preverify-targeted` (blast-radius selection; measured 353–625 s — twice
  it cost MORE than the full suite) and `final-full` (whole suite;
  measured 590–698 s). Tests are ~18 min of a ~40 min session.
- ~240 scratch git repositories are built per full run
  (`packages/router/test/support/fixtures.ts`: `initRepo`, `makeSeededRepo`,
  `makeSandboxRepo` — 6–10 process spawns each, on Windows ~50–150 ms per
  spawn). All git access in production goes through ONE function:
  `journal.runGit` (`packages/router/src/journal.ts`).
- Evidence model: the close of a session records the full suite green
  against the exact working tree (`testEvidence.surfaceDigest` hashes every
  tracked file; a freshness gate refuses stale evidence). Verification is
  cross-provider (a different AI vendor reviews each session) and is NOT
  being changed by this proposal.
- CI (GitHub Actions, windows-latest, 1 worker) runs the full suite on
  every push to master. Lesson already paid for: CI was red for WEEKS
  without anyone noticing (a CRLF/`core.autocrlf` defect meant typecheck
  failed first and the suite never ran; fixed in session 66 with one
  `.gitattributes` line).
- Test budget rule (currently suspended, returns after the rebuild): 215
  tests ceiling, one test per behavior.
- Already planned (sessions 76–77, not in question here): worker priority +
  reaping orphaned test processes; converting most scratch-repo tests to
  recorded answers at the `runGit` seam, keeping ~15 real-git contract
  tests.

## Measured dependency graph (packages/router/src, top-level modules; subdirectories collapsed to one node)

57 modules, 324 import edges.

**Cycles (strongly connected components > 1):**
- SCC-A (28 modules — HALF the codebase is one knot): triage, engines,
  drive, packaging, planReview, modules, approvedPlan, verifyjob, session,
  gates, writers, verify, bootstrap, stepreview, testphase, progress,
  identity, selection, metrics, route, fixloop, workflow, owedDecisions,
  discovery, cli, transports, config, affected
- SCC-B (3): ledger, critique, evidence

**Levels (longest path to a leaf, SCC-internal edges ignored — i.e. the
stratification the graph would have IF the cycles were cut):**
- L0 (9): generated, paths, pythonJson, runtimeMode, seatCost,
  secretResolver, textfile, verdict, workdir
- L1 (9): contracts, identity, journal, route, schema, selection, solution,
  verifyjob, version
- L2 (11): checks, config, contractdoc, critique, evidence, ledger,
  lockfile, metrics, modules, solutionDeps, stepreview
- L3 (12): agency, approvedPlan, bootstrap, discovery, driver, engines,
  facts, owedDecisions, planReview, resolution, transports, writers
- L4 (7): fixloop, jobs, packaging, testEvidence, testphase, triage,
  workflow
- L5 (7): affected, cli, drive, gates, progress, session, verify
- L6/L7: inProcess, index
- Highest fan-in: journal=30, pythonJson=24, config=21, ledger=16,
  textfile=16, checks=14

## The proposal under review (operator's, with orchestrator's amendments)

**Bottom-up:** refactor into strictly layered libraries (leaves; level 2
depending only on leaves; etc.). On a change to library X: run X's new and
existing tests plus targeted tests of X's REVERSE-dependency closure
(dependents), with a "contract absorption" cut: if X's seam suite (the
assertions X's consumers registered against it) passes unmodified, the
wave stops at X. Layering enforced by the existing lint control
(`import/no-cycle` + a boundaries rule), not a new gate.

**Top-down ("Newtonian"):** ~12 authored sentinel tests through the real
stack that would likely fail if anything beneath them broke. Below them,
NO new tests: a diagnostic tree computed from the library DAG — level 2 =
two halves of the graph, level 3 = quadrants, level 4 ≈ per-library
suites — where each "set" is a selection of EXISTING tests. On a sentinel
failure the framework descends the tree mechanically and records the
descent path as evidence.

**The change of record:** pre-close `final-full` (10–11.5 min, every
session) is replaced by sentinels + lazy descent (~1 min green path).
The full suite still runs in CI on every push (the backstop), and locally
for sessions declared releasable. Because CI has silently rotted before,
the framework will surface the latest master CI verdict as an attention
row at each session registration.

## Questions — answer each, then give ONE overall recommendation

1. **Soundness:** with change-scoped depth (bottom-up) + sentinels
   (top-down) + CI full suite as async backstop, what regression classes
   remain uncovered before a commit lands? Rank them by expected cost on
   THIS system (single developer, trunk-based, sessions land on master).
2. **The knot:** SCC-A above has 28 modules. Judge the plan to cut it:
   what order of cuts, what risks, and is there a smarter decomposition
   than strict levels (e.g., accept a DAG with declared boundaries instead
   of strata)? Cite the module names above.
3. **Sentinel design:** what makes the ~12 sentinels actually sensitive
   ("would likely fail if anything in the chain failed") rather than
   happy-path smoke that passes over broken corners? Give concrete
   sentinel candidates for THIS system from the modules named above (e.g.
   what a sentinel through session/drive/gates/testEvidence would assert).
4. **The diagnostic tree:** derived-from-the-DAG selections vs authored
   diagnostic sets — where does the derived approach mislead (tests whose
   subject and whose imports diverge, shared fixtures, ambient coupling
   through `.dabbler/runs/` on disk)?
5. **The evidence model:** the close's attestation changes from "whole
   suite green on this tree" to "sentinels + change scope green; full
   verdict delegated to CI run R". What must be RECORDED for that
   delegation to be honest (IDs, digests, the attention-row rule), and
   what failure mode does the delegation create that the current model
   does not have?
6. **What are we missing?** The strongest argument against doing this at
   all, and the cheapest alternative that captures most of the win.

Format: number your answers 1–6; end with `RECOMMENDATION:` (one
paragraph) and `TOP RISKS:` (three bullets, each with a mitigation).
Be specific to this system; generic testing-pyramid advice is not useful.
