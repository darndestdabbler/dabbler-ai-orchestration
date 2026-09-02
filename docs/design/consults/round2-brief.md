# Design consult, ROUND 2: the merge gate, the Newtonian layer, and workflow-shaped boundaries

You are one of two outside reviewers (GPT-5.6 Sol and Gemini 3.1 Pro) on a
testing-architecture decision for `dabbler-ai-orchestration`. This is the
second round; you have no memory of the first, so this brief is
self-contained. You have NO tool access. **Every claim about this
repository must cite a path or number from this brief; mark anything you
cannot ground here as ASSUMPTION.** Generic advice is not useful; the
operator is deciding session scope this week.

## The system (measured ground truth)

- TypeScript monorepo: `packages/router` (a session-lifecycle CLI driving
  AI coding sessions) + `tools/dabbler-ai-orchestration` (VS Code extension
  bundling it). Single developer, trunk-based, sessions land on master.
- 1263 vitest tests in `packages/router/test/`; full run 590–698 s at the
  2-worker local cap (`packages/router/vitest.config.ts`); a targeted
  pre-verification run measured 353–625 s — twice MORE than the full suite.
  Tests are ~18 min of a ~40 min session.
- ~240 scratch git repos built per full run
  (`packages/router/test/support/fixtures.ts`), 6–10 process spawns each;
  all production git access flows through ONE function, `journal.runGit`
  (`packages/router/src/journal.ts`).
- Evidence model today: a session's close records the full suite green
  against the exact tracked tree (`testEvidence.surfaceDigest`; a freshness
  gate refuses stale evidence). Cross-provider AI verification of each
  session exists and is NOT in question.
- CI: GitHub Actions, windows-latest, 1 worker, full suite on every push
  to master. Historical incident: CI red for WEEKS unnoticed (typecheck
  failed first, so the suite step never ran; one `.gitattributes` line
  fixed it — "workflow ran" and "suite ran" are not equivalent).
- Dependency graph of `packages/router/src` (57 modules, 324 edges): one
  28-module strongly-connected knot (SCC-A: cli, drive, session, verify,
  gates, progress, config, transports, engines, workflow, fixloop,
  testphase, selection, identity, route, metrics, writers, packaging,
  planReview, approvedPlan, stepreview, verifyjob, triage, bootstrap,
  discovery, modules, owedDecisions, affected) and one 3-module knot
  (SCC-B: ledger, critique, evidence). New since round 1 — the exact
  back-edge count: **52 back-edges create the knots**, and they cluster:
  ~7 are lower modules importing `cli` (likely one leaf file,
  `cli/output.ts` print helpers), ~10 are everything importing `progress`
  (a state reader trapped high), 1 is `config -> transports` (frees ~6
  when cut), 4 are SCC-B, and ~20 are the genuinely entangled "L5 club"
  (cli/drive/session/verify/gates/progress mutual).
- Test-suite character, verified this round: only 16 mock/spy call sites
  across 10 of 63 test files — the suite runs real code and real
  processes almost everywhere. No test touches the repo's own
  `.dabbler/runs/`; all scratch state is per-test temp dirs.
- Already committed plan (not in question): session 76 = worker priority,
  orphan-process reaping, console-window fixes, CI-health attention row;
  session 77 = convert most scratch-repo tests to recorded answers at the
  `journal.runGit` seam, keep ~15 real-git contract tests, re-measure.

## Round 1, compressed honestly

Both reviewers were asked whether to replace the local pre-close full
suite with ~12 sentinels + a lazily-descended diagnostic tree (derived
from the library DAG), with CI-on-master as the async backstop.

- **Sol recommended:** do NOT replace the exact-tree full close with async
  CI delegation as written; first drop the redundant targeted
  pre-verification run (certain 353–625 s saving), do the seam recording,
  run selection/absorption in shadow mode; delegation only if CI runs the
  immutable candidate SHA BEFORE master advances, with step-level proof
  the suite step executed and non-green attestations blocking. Also:
  derive diagnostic sets from authored metadata seeded by the DAG, never
  from the DAG alone; prefer a declared-ownership DAG over strict strata;
  pilot on SCC-B.
- **Gemini recommended:** halt the Newtonian tree and async delegation
  entirely; do the seam recording first — if the suite then runs fast,
  the apparatus is zero-ROI; untangle via bounded contexts (cycles
  tolerated inside, forbidden across), not strata. Gemini's premise that
  existing tests are mock-heavy was CHECKED and is FALSE (16 mock sites /
  63 files); its estimate "under 30 seconds post-seam" is optimistic (an
  older 2-worker benchmark of a smaller suite measured 138 s).

## Operator decisions since round 1 (these are settled; stress-test, don't relitigate)

1. **The merge gate.** The operator, reversing an earlier anti-branching
   stance: "Branch -> Full Test -> Merge — all within CI. And the
   framework can wait and act on the result." Master only advances on a
   full-suite-green exact SHA. The framework's existing detached-job +
   `wait`/`retry_after_seconds` machinery does the waiting; a red run's
   failure list routes back into remediation.
2. **Workflow-shaped boundaries.** The lifecycle decomposes into
   mini-workflows treated as isolated solutions with recorded handoffs —
   startup; instruction/execution loop; testing/fixing loop;
   verification/remediation loop; close-out. The handoff artifacts
   already exist on disk (`instruction.json`, `report.json`, `run.json`,
   `test-runs.jsonl`, the rounds ledger, `sessions.json`); the proposal
   promotes them to the ONLY interface between phases. These become the
   bounded contexts for the 28-module knot's entangled core.
3. **The Newtonian descent tree stays in the design.** The operator's two
   reasons, verbatim: "1. Not every project will have CI. We can still
   run the full test suite before a release or a merge to master. And we
   can keep all non-releasable code off master. 2. CI takes time to run.
   Newtonian should be `fail fast`." So: sentinels + descent as the
   fail-fast local layer in front of the merge gate; the full suite as
   the merge gate's authority, in CI where it exists and locally where it
   does not; master holds only full-suite-green code either way.

## Questions — answer each, then ONE recommendation

1. **The dual-mode merge gate.** One rule — "master advances only on a
   full-suite-green exact SHA" — with two executors (CI where present, a
   local full run where not). Design the smallest honest mechanism: what
   is recorded in each mode so the two are indistinguishable to the close
   gate (run identity, SHA binding, step-level suite proof, merge
   commit)? Where does it break — e.g., a local-mode operator machine
   that lies about time, an interrupted local run, a CI mode where the
   merge races a manual push? What is the CI-down escape hatch and how is
   it recorded so it cannot become a routine skip?
2. **Fail-fast arithmetic.** Post-77 the local full suite is expected
   between ~90 s (optimistic) and ~300 s (conservative); the sentinel
   layer is ~60 s; CI authority is 15–25 min away. Descent's value =
   (local-full-time − descent-time) × failure-rate − build/maintenance
   cost. Under what measured conditions does the descent TREE (not the
   sentinels — those are cheap) pay for itself vs the degenerate
   alternative "sentinels, then just run the local full suite on red"?
   Give the crossover as a formula the operator can evaluate after 77's
   re-measurement, and say plainly which side you expect this repo to
   land on.
3. **Sentinels per mini-workflow.** Given decision 2, the sentinel set
   maps one-per-workflow (startup, instruction/execution, testing/fixing,
   verification/remediation, close-out) plus one whole-pipeline. For THIS
   system, specify each sentinel's forced adverse decision and its oracle
   (what durable artifact it asserts on), using the module and artifact
   names in this brief. Which of the five workflows is hardest to
   sentinel honestly, and why?
4. **Workflow-shaped bounded contexts.** Critique decision 2 as the
   untangling principle for the ~20-edge L5 club: where does
   "phases communicate only through recorded handoff artifacts" break
   down (shared config, the ledger as a common substrate, `drive`
   re-entering `cli` by spawning verbs)? Does it change round 1's cut
   order (mechanical clusters first, SCC-B pilot, L5 club last)?
5. **No-CI mode's branch discipline.** "Keep all non-releasable code off
   master" in a single-dev, session-driven repo: per-session candidate
   branches that die on merge, or one long-lived integration branch?
   Argue one, with the failure modes of each (stale candidates, branch
   litter, divergence during multi-session features, interaction with
   the framework's session-numbered history).
6. **What would you veto?** Each reviewer: the single element of the
   now-assembled design (76, 77, dual-mode merge gate, sentinels,
   descent tree, workflow contexts, preverify-drop) you would remove or
   change first, and the concrete evidence that would prove you right or
   wrong within two sessions.

Format: number answers 1–6; end with `RECOMMENDATION:` (one paragraph)
and `TOP RISKS:` (three bullets with mitigations). Cite paths and numbers
from this brief; mark ungrounded claims ASSUMPTION.
