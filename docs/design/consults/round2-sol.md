model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 2339 in / 16499 out
elapsed: 220.521s  truncated: false
---

## 1. Dual-mode merge gate

Use one normalized `GateReceipt`, with executor-specific proof attached. Persist attempts in `test-runs.jsonl`, the accepted receipt in `run.json`, and the final session-to-landed-SHA mapping in `sessions.json` (brief: `test-runs.jsonl`, `run.json`, `sessions.json`).

| Section | Required fields |
|---|---|
| Identity | schema version, session number, globally unique run ID, attempt number, executor=`ci\|local` |
| Candidate | expected master/base SHA, candidate head SHA, tested/landing SHA, `testEvidence.surfaceDigest` |
| Suite step | trusted command identity, `packages/router/vitest.config.ts` digest, started marker, completed marker, exit code, observed test count, log/artifact digest |
| Executor proof | CI run/job/step IDs and conclusions, or local runner identity and atomic result-file digest |
| Landing | expected old master SHA, landed master SHA, merge method, compare-and-swap result |
| Exception | normal/CI-unavailable, failed CI run ID, reason, operator acknowledgement, expiry SHA |

The close gate accepts only this normalized predicate:

1. The trusted runner checked out the recorded tested SHA.
2. The full, unfiltered suite step started, completed, and exited zero.
3. The resulting `testEvidence.surfaceDigest` matches the tracked candidate tree.
4. The tested SHA is exactly the SHA being landed.
5. Master moved from the recorded base SHA to that SHA through a compare-and-swap update.
6. Master still resolves to the landed SHA when close-out is recorded.

Do not hard-code 1263 as the expected count: the current suite has 1263 tests, but the count can legitimately change (`packages/router/test/`; 1263 tests). Record the count for audit and enforce the full-suite command/configuration instead.

**CI mode**

- The current workflow runs on pushes to master, which is too late for the new rule; add a candidate-branch or gate-ref trigger before master advances (brief: GitHub Actions, every push to master, 1 worker).
- Run the suite through a trusted wrapper whose definition comes from protected gate configuration, not from arbitrary candidate code. **ASSUMPTION:** GitHub protected/reusable workflows or equivalent controls are available.
- Query the Actions API for the specific run, job, and suite step rather than accepting a generic workflow conclusion. The weeks-long failure caused by typecheck preventing the suite step proves that workflow success/execution and suite execution require separate evidence (brief: CI red for weeks; `.gitattributes`; suite step never ran).
- Prefer fast-forward landing: candidate head equals tested SHA equals landed SHA.
- If a merge commit is required, create the prospective merge commit first on a gate ref, test that exact merge SHA, and then fast-forward master to it. Never let GitHub generate a new, untested merge commit afterward.
- The framework can wait on this proof using the stated detached-job and `wait`/`retry_after_seconds` machinery.

**Local mode**

- Use a clean detached checkout/worktree at the recorded SHA and invoke the same trusted full-suite wrapper. Production git operations should continue through `journal.runGit` (`packages/router/src/journal.ts`).
- Write an in-progress record first, but only atomically publish the completed receipt after the suite process exits zero.
- Timestamps are informational, not authorization inputs. A machine lying about wall time therefore cannot make stale evidence fresh.
- An interrupted or rebooted run has no completed marker and cannot be accepted. Session 76's orphan-process reaping reduces cleanup damage but must not synthesize completion (brief: session 76).

Local execution cannot defend against a malicious machine owner fabricating both execution and evidence. Signing with a key controlled by that same operator does not solve this. The honest trust boundary is accidental failure and auditability; resisting a dishonest operator requires an independent runner.

**Races and bypasses**

- Protect master from ordinary manual pushes and require the framework/gate principal. **ASSUMPTION:** GitHub branch protection or rulesets can enforce this.
- Use compare-and-swap against the tested base SHA. If another push wins, landing fails and the new prospective landing SHA must be rebuilt and retested.
- If an authorized owner bypasses protection, master can advance incorrectly before the close gate notices. No repository-local mechanism can prevent its sole administrator from deliberately overriding policy.

**CI-down escape**

The escape is executor failover, not authority bypass:

1. CI must first have a recorded infrastructure failure, cancellation, or provider timeout—not a test failure.
2. The exception is bound to one base/candidate SHA pair.
3. A local full suite must still produce a valid exact-SHA receipt.
4. Record `ci_unavailable`, failed CI run IDs, reason, local proof, and one-use expiry in `run.json`; surface an unresolved CI-health item through the session 76 attention row.
5. Block a second consecutive automatic escape until CI recovers or the operator records an explicit project-mode change.

A sole operator can deliberately normalize exceptions, so “cannot become routine” can only mean conspicuous, one-use, and policy-blocked—not cryptographically impossible.

## 2. Fail-fast arithmetic

Let:

- \(F\) = expected time from a sentinel failure to an equally actionable failure list using the local full suite.
- \(T\) = descent execution time before any fallback.
- \(r\) = probability that descent produces an equally actionable diagnosis without needing the full suite.
- \(D = T + (1-r)F\) = effective descent time, including fallback.
- \(p\) = probability per candidate that sentinels fail and diagnosis is required.
- \(B\) = one-time tree construction cost, converted to the same value unit as waiting time.
- \(M\) = maintenance cost per candidate.
- \(H\) = amortization horizon in candidate sessions.

The approximately 60-second sentinel cost appears in both alternatives and cancels. The tree pays when:

\[
p(F-D) > \frac{B}{H}+M
\]

Equivalently:

\[
p > \frac{B/H+M}{F-D}
\]

Since \(F-D=rF-T\), descent can never pay if \(T \ge rF\), regardless of failure rate.

Measure these after session 77:

- Full-suite p50 and p90, not a single best run.
- Descent p50/p90 for forced failures in each workflow.
- Diagnosis success rate \(r\), with any missed or incomplete failure list charged as a fallback.
- Actual authoring and update minutes for ownership metadata.
- Sentinel-red frequency from durable session/test history. **ASSUMPTION:** `test-runs.jsonl` contains enough historical attempts to estimate this frequency.

Illustratively, if amortized construction plus maintenance is 8 minutes per candidate and descent takes 60 seconds with no fallback—**ASSUMPTION:** those two cost values—then the crossover failure rates are:

- \(F=90s\): \(8/(1.5-1)=26.7\%\)
- \(F=180s\): \(8/(3-1)=6.7\%\)
- \(F=300s\): \(8/(5-1)=3.3\%\)

Do not credit the 15–25 minute CI latency unless descent demonstrably prevents an otherwise attempted red CI gate. Both descent and the degenerate local-full alternative can diagnose before CI, so CI latency normally cancels.

I expect this repository initially to land on the **degenerate “sentinels, then local full on red” side**, especially if session 77 gets the full suite near 90 seconds. Existing targeted execution already costs 353–625 seconds, while the full suite costs 590–698 seconds, showing that selected execution is not automatically cheap (`packages/router/vitest.config.ts`; measured 353–625 s and 590–698 s). The suite also exercises real processes and approximately 240 scratch repositories with 6–10 spawns each rather than cheap isolated mocks (`packages/router/test/support/fixtures.ts`; 16 mock/spy sites across 10 of 63 files). The tree becomes plausible near the 300-second outcome only if sentinel-red frequency is several percent and descent has high diagnostic recall.

## 3. Sentinels per mini-workflow

Each sentinel should assert only durable artifacts in a temporary `.dabbler/runs/` equivalent, never call counts. Existing tests use per-test temporary state and do not touch the repository's own `.dabbler/runs/` (`packages/router/test/`; `.dabbler/runs/`; 16 mock/spy sites).

| Workflow | Forced adverse decision | Durable oracle |
|---|---|---|
| Startup | Supply a configuration selecting an unavailable or invalid transport/engine; startup must block before instruction execution. This exercises `config`, `transports`, `engines`, `bootstrap`, `discovery`, and `selection` (`packages/router/src`; SCC-A's 28 modules). | Require `run.json` to record a startup-blocked state, reason, config identity, and tree SHA; require `sessions.json` not to claim a running/closed session; require no `instruction.json`. **ASSUMPTION:** these fields must be added or versioned if absent. |
| Instruction/execution | Make the selected transport/engine return a deterministic retryable failure followed by a terminal failure; the workflow must wait/retry and must not claim successful execution. This targets `drive`, `session`, `workflow`, `transports`, and `engines` (`packages/router/src`; SCC-A). | `instruction.json` contains the immutable instruction identity/digest; `report.json` references it and records attempts plus the adverse outcome; `run.json` remains in or exits the workflow with the correct failed state. |
| Testing/fixing | Run a fixture with one known failing test; the system must route to fixing rather than verification or close. This targets `testphase`, `fixloop`, `gates`, and `affected` (`packages/router/src`; SCC-A). | `test-runs.jsonl` has a completed non-green entry with the expected failure identity and candidate digest; `run.json` records the transition into testing/fixing. A second deterministic attempt may prove that a green rerun exits the loop. |
| Verification/remediation | Make the cross-provider verifier reject an otherwise test-green candidate and produce one owed decision; the workflow must route to remediation, not close. Cross-provider verification already exists and remains required. | The rounds ledger records the rejection/critique and candidate identity; `run.json` records remediation pending; no close/landing receipt appears. This covers `verify`, `verifyjob`, `triage`, `critique`, `evidence`, and `owedDecisions` (`packages/router/src`; SCC-A and the 3-module SCC-B). |
| Close-out | Record green evidence, mutate the tracked tree, and request close. The close gate must reject stale evidence. | `run.json` records the old and current `testEvidence.surfaceDigest` values and a stale-evidence rejection; `sessions.json` does not claim the candidate landed; no merge receipt exists. This directly tests the existing exact-tree freshness rule (`testEvidence.surfaceDigest`). |
| Whole pipeline | Force one test failure and recovery, then one verification rejection and remediation, followed by an accepted gate receipt. | Assert coherent session, attempt, instruction, report, round, test-run, candidate-SHA, and surface-digest identities across `instruction.json`, `report.json`, `run.json`, `test-runs.jsonl`, the rounds ledger, and `sessions.json`. Finish by asserting landed SHA equals tested SHA. Use one of session 77's retained approximately 15 real-git contracts for branch/landing behavior; use deterministic recordings for expensive provider interactions (brief: session 77; ~15 real-git tests; `packages/router/src/journal.ts`). **ASSUMPTION:** deterministic provider recordings are available or will be introduced. |

**Hardest:** verification/remediation. Its adverse decision comes from a different AI provider, so a deterministic recording proves orchestration and artifact semantics but not live judgment; a live sentinel risks nondeterministic decisions and latency. **ASSUMPTION:** live provider output is not deterministic enough for a merge-critical sentinel. The rounds ledger is also part of the 3-module `ledger`/`critique`/`evidence` knot with 4 back-edges, making an artifact-only oracle especially important (`packages/router/src`; SCC-B, 3 modules, 4 back-edges).

## 4. Workflow-shaped bounded contexts

The principle is sound only if “recorded handoffs are the only interface” means **phase-to-phase domain data**, not literally every dependency.

It breaks in four places:

1. **The tracked workspace is already a hidden handoff.** A later phase reads code changed by an earlier phase even if no JSON object is passed. Every handoff therefore needs candidate SHA, `testEvidence.surfaceDigest`, and relevant workspace status. Otherwise the declared artifact boundary omits the most important mutable input.

2. **Configuration can become ambient shared state.** The measured `config -> transports` back-edge is one example and cutting it frees approximately 6 more edges (`packages/router/src`; 1 back-edge freeing ~6). Startup should produce a versioned configuration snapshot or identifier that later workflows consume; later workflows must not import startup/config resolution logic directly.

3. **The ledger cannot be a common writable database API.** If all workflows directly mutate `ledger`, the rounds ledger becomes a shared substrate rather than a handoff. Give each workflow ownership of its records, append immutable events, and let consumers build projections. That is the right pilot for the 3-module `ledger`/`critique`/`evidence` SCC and its 4 back-edges (`packages/router/src`; SCC-B).

4. **Spawning CLI verbs is still an interface.** If `drive` re-enters `cli` by spawning verbs, coupling moves from TypeScript imports into command names, environment variables, exit codes, and filesystem side effects. Define a versioned command envelope and result artifact; keep `cli` as an outer adapter rather than a callable domain module. This matters because approximately 7 back-edges are lower modules importing `cli`, while approximately 20 are in the genuinely entangled L5 club (`packages/router/src`; 52 total back-edges).

A small shared platform kernel remains necessary for filesystem access, process execution/reaping, git, artifact atomicity, cancellation, and logging. It should be stateless or append-only and sit below every workflow. Cross-workflow reads of mutable `progress` state should instead derive from artifacts/events; approximately 10 back-edges currently involve imports of `progress` (`packages/router/src`; 52 back-edges). Session 76's orphan reaping belongs in this platform layer, not one workflow (brief: session 76).

The cut order should **not materially change**:

1. Extract the likely `cli/output.ts` leaf dependency behind an output port: approximately 7 edges.
2. Move the `progress` reader/event contract below workflows: approximately 10 edges.
3. Cut `config -> transports`: 1 edge freeing approximately 6.
4. Pilot the versioned artifact/event rule on SCC-B: 3 modules and 4 back-edges.
5. Untangle the approximately 20-edge L5 club through workflow ownership last.

Before step 4, define artifact schemas, producer ownership, schema versions, candidate/session IDs, atomic publication, and idempotent replay. **ASSUMPTION:** the existing artifacts do not already specify all these guarantees. Cycles may remain inside a workflow context; imports and mutable state sharing across contexts should be forbidden.

## 5. No-CI branch discipline

Use **per-session candidate branches**, not one long-lived integration branch.

Proposed naming is `candidate/session-<number>`—**ASSUMPTION:** no conflicting branch convention exists. Each candidate records:

- base master SHA,
- session number,
- immutable candidate head SHA,
- predecessor candidate SHA for stacked work,
- gate receipt,
- landed or superseded disposition.

This aligns branch identity with the existing session-numbered lifecycle and `sessions.json` history (brief: sessions 76 and 77; `sessions.json`). Branch names are disposable; durable history should refer to commit SHAs and session numbers.

For a multi-session feature:

1. Session N creates a candidate from master.
2. Session N+1 may branch from N's candidate SHA.
3. Keep the candidate chain off master until its head is releasable.
4. Run the local full gate against the final prospective landing SHA.
5. Land that exact SHA and delete all candidate branches in the chain.
6. Record intermediate sessions as superseded/continued rather than landed. **ASSUMPTION:** `sessions.json` needs a new disposition if it currently assumes every close lands.

**Per-session failure modes**

- **Stale candidates:** master may move after testing. Mitigate with base-SHA compare-and-swap; any rebase or merge creates a new SHA and invalidates evidence.
- **Branch litter:** abandoned sessions leave refs. Mitigate by deleting merged/superseded branches after their SHAs are recorded in `sessions.json`.
- **Stacked-feature complexity:** later sessions depend on unmerged earlier candidates. Mitigate with one active candidate lineage and explicit predecessor SHAs; test only the final prospective landing SHA.
- **Session attribution:** a final merge may contain several sessions. Preserve each session's artifact records and have the landing receipt list all included session IDs.

A long-lived integration branch avoids temporary branch count but creates worse failure modes: persistent divergence from master, accumulation of unrelated red work, unclear attribution of the exact tested tree to one session, and temptation to treat the branch as an ungoverned shadow master. In this single-developer, session-numbered model, temporary branch litter is easier to control than semantic accumulation (brief: sessions 76–77; exact-SHA evidence model).

## 6. What I would veto

**Sol — change first:** do not build the generalized descent tree as a production dependency yet. Keep it in the architecture, but implement it first as a shadow diagnostic prototype with authored workflow ownership rather than deriving it directly from the 57-module/324-edge graph. The graph's 28-module SCC and 52 back-edges make direct DAG-derived selection structurally unreliable (`packages/router/src`; 57 modules, 324 edges, 28-module SCC, 52 back-edges).

Within the first two measurement sessions after session 77:

1. Measure full-suite \(F\) after the `journal.runGit` recording conversion (`packages/router/src/journal.ts`; session 77).
2. Run one forced adverse case per five workflows plus the whole-pipeline case.
3. Measure \(T\), fallback rate, and whether the tree returns an equally actionable failure set.
4. Record actual authoring and maintenance time.
5. Estimate \(p\) from available `test-runs.jsonl` history. **ASSUMPTION:** sufficient history exists.
6. Evaluate the crossover over a declared 20-candidate horizon. **ASSUMPTION:** 20 candidates is an acceptable planning horizon.

The veto is proven right if descent misses any safety-critical route, requires fallback often enough that \(T \ge rF\), or yields non-positive value under the measured crossover. It is proven wrong if all six adverse cases route correctly, effective \(D\) is below half of \(F\), and the measured benefit exceeds amortized build/maintenance cost by at least 2×. The existing 353–625-second targeted run is prior evidence against assuming that selected execution will be cheap (`packages/router/vitest.config.ts`; measured targeted run).

RECOMMENDATION: Complete sessions 76 and 77, drop the redundant targeted pre-verification run immediately, and make the exact-SHA dual-mode gate the next authority change: candidate branch, trusted full-suite step receipt, compare-and-swap landing, and explicit CI-unavailable local failover. Define and test the six durable workflow sentinels while versioning the handoff artifacts, then perform the mechanical `cli`/`progress`/`config` cuts and the SCC-B pilot. Retain Newtonian descent as a shadow, authored-metadata experiment until post-77 measurements satisfy the crossover; do not combine production descent or the approximately 20-edge L5 refactor with this week's gate work.

TOP RISKS:
- **Attestation theater:** a workflow can appear green without running the suite, as happened for weeks. **Mitigation:** trusted suite wrapper, exact step-level completion proof, live CI validation, and tested-SHA-equals-landed-SHA enforcement (`.gitattributes`; CI 1-worker incident).
- **Artifact boundaries hide mutable coupling:** shared workspace, config, progress, or ledger state can bypass the promised workflow interfaces. **Mitigation:** include SHA/surface digest and config identity in every handoff, assign single-writer artifact ownership, and isolate shared platform services (`packages/router/src`; 52 back-edges).
- **Descent costs more than it saves or misroutes failures:** current targeted execution already takes 353–625 seconds. **Mitigation:** shadow measurement, authored ownership metadata, mandatory fallback to the local full suite, and the explicit \(p(F-D) > B/H+M\) promotion threshold (`packages/router/vitest.config.ts`).