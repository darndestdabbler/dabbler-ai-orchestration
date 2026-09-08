model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 1868 in / 12208 out
elapsed: 159.432s  truncated: false
---

## 1. Soundness

**Issue →** CI is not a pre-commit control if it starts only after a push to master. Before landing, assurance is limited to the selected change scope and approximately 12 sentinels; the other tests among the current 1263 contribute no assurance until CI runs [`packages/router/test/`; 1263 tests; Q1: trunk-based sessions land on master].

**Ranked residual regression classes by expected cost:**

1. **High — undeclared consumer contracts hidden by “contract absorption.”** A passing seam suite proves only the registered assertions, not every observable a consumer may depend on: error classification, ordering, serialization, timing, filesystem effects, or combinations of outputs. This is especially likely to matter while 28 of 57 modules remain mutually reachable in SCC-A; either the reverse closure is broad, or the cut depends heavily on incomplete contracts [`packages/router/src` dependency graph: SCC-A = 28 modules; 57 modules/324 edges].  
   **Fix →** Treat absorption as an optimization that must earn trust. Initially run the closure after a passing seam suite in shadow mode and compare its result with the proposed stop. Any downstream failure becomes a missing registered contract.

2. **High — cross-module or ambient regressions not exercised by a sentinel.** Twelve paths cannot cover the branch combinations represented by 1263 tests. A sentinel can be green while a failure exists in an unexercised gate, recovery path, provider response, or `.dabbler/runs/` state transition [1263 tests; diagnostic-tree question explicitly identifies `.dabbler/runs/` ambient coupling].  
   **Fix →** Design sentinels around adverse decisions and durable outcomes, not merely successful end-to-end completion; retain authored cross-cutting diagnostic sets.

3. **High impact, medium probability — a regression lands before the asynchronous verdict.** The current close prevents test-detectable regressions from landing by recording the whole suite green against the exact tree. Under the proposal, master can contain the change before GitHub Actions reports it [current evidence model; CI runs on every push to master]. The operational cost is amplified by the demonstrated ability for CI to remain red for weeks without action; session 66 fixed the prior CRLF/`core.autocrlf` failure with one `.gitattributes` line [session 66; `.gitattributes`].  
   **Fix →** Run CI against an immutable candidate SHA before updating master, or mark the session attestation `PENDING` rather than green until the exact-SHA run succeeds.

4. **Medium — selector errors caused by test/subject mismatch.** A changed shared fixture can affect many tests even though the production import DAG does not show that relationship. This is material because approximately 240 repositories are constructed through shared helpers in one full run [`packages/router/test/support/fixtures.ts`; approximately 240 repositories].  
   **Fix →** Add a test-dependency manifest covering shared fixtures, ambient resources, dynamic entry points, and production subjects; do not derive selection solely from production imports.

5. **Medium — real-git, Windows, process, and concurrency mismatches.** Recorded `journal.runGit` answers will remove substantial process behavior from most tests, while real runs currently involve 6–10 spawns per repository and Windows spawn latency of approximately 50–150 ms [`packages/router/src/journal.ts`; `packages/router/test/support/fixtures.ts`; sessions 76–77 plan]. Process contention is already demonstrated by 20 workers taking 94 seconds wall/873 seconds CPU and making the host unusable [20-worker measurement; `packages/router/vitest.config.ts` caps local runs at 2].  
   **Fix →** Ensure at least one sentinel uses a real repository and keep the planned approximately 15 real-git contract tests in pre-close scope whenever git-facing behavior changes [sessions 76–77 plan: approximately 15 contracts].

6. **Lower probability, potentially high impact — performance or resource regressions that preserve correctness.** Functional sentinels may not detect process leaks, pathological retries, or contention; those have already produced severe host impact [20-worker measurement: 94 seconds wall/873 seconds CPU; planned worker-priority and orphan reaping in sessions 76–77].  
   **Fix →** Record sentinel process count, timeout, and duration budgets, and keep dedicated resource-contract tests outside the logical diagnostic tree.

The CI backstop catches only regressions represented by the full suite and only after the full-suite step actually executes. The previous typecheck-first failure demonstrates that “workflow ran” and “suite ran” are not equivalent [session 66; CI was red for weeks because typecheck failed before the suite].

## 2. The knot

**Issue →** The reported levels are not current architectural layers: they explicitly ignore SCC-internal edges. For example, `identity`, `route`, `selection`, and `verifyjob` appear at L1 while also belonging to SCC-A with `cli`, `session`, `drive`, `workflow`, `verify`, and 22 other modules [`packages/router/src` graph: SCC-A and L1–L5]. Enforcing those levels literally would turn an analytical projection into an arbitrary architecture.

**Location →** SCC-A contains:

- Lifecycle/control: `cli`, `session`, `drive`, `workflow`, `progress`
- Verification/recovery: `gates`, `verify`, `verifyjob`, `testphase`, `stepreview`, `planReview`, `approvedPlan`, `fixloop`, `triage`
- Discovery/selection: `bootstrap`, `discovery`, `modules`, `selection`, `affected`, `owedDecisions`
- Execution/effects: `engines`, `transports`, `writers`, `packaging`
- Cross-cutting state/policy: `config`, `identity`, `route`, `metrics`

These group labels are **ASSUMPTION**, based only on module names; the brief provides SCC membership but not direct edge adjacency [`packages/router/src` graph: SCC-A = 28 modules].

**Fix →** Prefer an acyclic graph with declared ownership boundaries over strict numerical strata. Allow direct dependencies on stable leaves and allow layers to be skipped; prohibit only dependencies that violate ownership or create cycles. Use L0–L7 as reporting metadata, not as a rule that every dependency must pass through the immediately lower level.

Recommended cut order:

1. **Freeze expansion before rewriting.** Configure the existing `import/no-cycle` and boundary controls to prevent new SCC-A edges while tolerating an explicit baseline of existing violations [proposal: existing lint control; SCC-A = 28 modules]. Do not attempt a 28-module atomic rewrite.

2. **Cut coordinator back-dependencies first.** Establish the rule that lower-level policy and effect modules cannot depend on `cli`, `session`, `drive`, `workflow`, or `progress`; coordinators may depend inward through explicit ports or callbacks. **ASSUMPTION:** the exact violating direct edges must be selected from the unavailable 324-edge list [`packages/router/src` graph: 324 edges].

3. **Separate effectful adapters from decisions.** Candidate adapter-side modules are `engines`, `transports`, `writers`, and `packaging`; candidate decision-side modules include `selection`, `affected`, `gates`, and `route`. This decomposition is **ASSUMPTION** based on names and must be validated against behavior and direct imports [`packages/router/src` graph: SCC-A module names]. Keep `journal.runGit` stable while doing this: it is outside SCC-A, has fan-in 30, and is the sole production git seam [`packages/router/src/journal.ts`; graph fan-in: `journal` = 30].

4. **Make verification a one-way subgraph.** Define ownership among `gates`, `verify`, `verifyjob`, `testphase`, `stepreview`, `planReview`, `approvedPlan`, `fixloop`, and `triage`, then remove callbacks into planning or lifecycle state by passing results rather than importing coordinators. The proposed ownership is **ASSUMPTION**; all named modules are confirmed members of SCC-A [`packages/router/src` graph: SCC-A].

5. **Resolve cross-cutting state last, but constrain it early.** `config` has fan-in 21 while also residing in SCC-A, so moving it or changing its API can create broad churn [`packages/router/src` graph: `config` fan-in 21; SCC-A]. Prefer passing resolved values into libraries rather than allowing each library to reach back into lifecycle configuration. The implementation form is **ASSUMPTION**.

6. **Use SCC-B as a technique pilot.** `ledger`, `critique`, and `evidence` form a separate three-module cycle, making it a lower-blast-radius place to validate boundary rules and migration mechanics before applying them to 28 modules [`packages/router/src` graph: SCC-B = 3 modules].

Primary risks are semantic changes hidden inside dependency inversion, temporary duplication of state contracts, and replacing import cycles with ambient filesystem or callback coupling. The boundary control should therefore enforce an actual DAG while integration tests continue checking behavior; “strict levels” alone would not prevent ambient coupling.

## 3. Sentinel design

**Issue →** A sentinel is sensitive only to the decisions and observables it exercises. “Uses the real stack” does not imply that it detects arbitrary failures beneath it.

**Fix →** Each sentinel should have:

- An independent oracle for durable state, evidence, selected work, and failure status—not only “command returned successfully.”
- At least one forced adverse decision: stale evidence, rejected gate, failing verification, missing approval, provider disagreement, or persistence failure.
- Assertions at multiple boundaries: externally visible result, `.dabbler/runs/` state, evidence digest, provider identity, and absence of an invalid close where applicable [current evidence model; Q4 identifies `.dabbler/runs/`].
- Controlled fault injection at external seams while retaining the real internal path. `journal.runGit` is the natural git seam because all production git access passes through it [`packages/router/src/journal.ts`].
- Mutation calibration: deliberately perturb each claimed seam or decision and confirm that at least one sentinel fails. A module should not be listed as sentinel-covered merely because it was imported.
- A coverage claim listing the exact behavior and edges exercised. It must not claim “everything beneath this test.”

Concrete candidates:

1. **Successful exact-tree close:** drive a session through `session`/`drive`/`workflow`/`gates`/`testphase`/`verify`/`testEvidence`; independently compute the tracked-tree digest and assert that the accepted close records the same `testEvidence.surfaceDigest` [current evidence model; named modules are in the `packages/router/src` graph]. The exact direct call chain is **ASSUMPTION**.

2. **Freshness rejection:** obtain valid evidence, modify one tracked file, attempt close, and assert that the freshness gate refuses the evidence [current evidence model: every tracked file is hashed and stale evidence is refused].

3. **Verification failure cannot become green evidence:** force the test/verification result to fail and assert that `gates` and `session` do not record a successful close [current close records full-suite-green evidence; `gates`, `session`, `verify`, and `testphase` are graph modules].

4. **Cross-provider enforcement:** run a verification path and assert that the reviewer vendor identity differs from the work provider identity, including the negative case where they match [cross-provider verification is required and unchanged; `identity`, `engines`, `transports`, and `verify` are graph modules]. Mapping those modules to provider selection is **ASSUMPTION**.

5. **Change-scope closure:** change a library fixture and assert that `affected`/`selection` choose its tests plus registered reverse dependents; then perturb a registered seam observable and assert that absorption no longer stops the wave [proposal’s reverse-dependency and absorption behavior; `affected` and `selection` are SCC-A modules].

6. **Absorption blind-corner guard:** leave registered seam assertions passing while perturbing an unregistered observable in a controlled test fixture; the sentinel should demonstrate that such a mutation is not claimed as covered. This is a calibration test for the framework, not a production behavior assertion.

7. **Real-git path:** use one real scratch repository through `journal.runGit`, exercise success and failure output, and assert the resulting discovery/selection behavior rather than merely checking the git exit code [`packages/router/src/journal.ts`; `packages/router/test/support/fixtures.ts`; `discovery` and `selection` are graph modules]. The exact git operation matrix is **ASSUMPTION**.

8. **Approval gate:** exercise `planReview`/`approvedPlan`/`owedDecisions`/`gates` with an unresolved decision and assert that execution or close is refused; resolve it and assert the transition occurs. The intended behavior is **ASSUMPTION** based on module names [`packages/router/src` graph: SCC-A].

9. **Failed review and repair:** force `verify` to reject, assert that `triage`/`fixloop` route repair, and verify that old evidence cannot be reused after the repair changes the tree. Routing semantics are **ASSUMPTION**; stale-evidence rejection is grounded in the current evidence model [`packages/router/src` graph: `verify`, `triage`, `fixloop`; current freshness gate].

10. **Durable interruption/restart:** interrupt after a meaningful state transition, reconstruct from `.dabbler/runs/`, and assert that the session neither skips a gate nor records duplicate completion. Restart semantics are **ASSUMPTION**; ambient state under `.dabbler/runs/` is identified in Q4.

11. **Effect failure propagation:** force `writers`, `packaging`, or `transports` to fail and assert that `workflow`/`session` cannot report success. The expected propagation behavior is **ASSUMPTION** based on module names [`packages/router/src` graph: SCC-A].

12. **CI attention-row truthfulness:** at session registration, test green, red, pending, missing, stale, and “workflow failed before full-suite step” verdicts; assert that run ID, SHA, age, and whether the full-suite step executed are visible [proposal’s registration attention row; session 66 demonstrated typecheck preventing suite execution].

## 4. The diagnostic tree

**Issue →** The production import DAG answers “which modules import which modules,” not “which behavior this test establishes.” Those diverge in several ways:

- A test may import only a helper while invoking production through a CLI, subprocess, dynamic entry point, or filesystem protocol.
- Tests using `initRepo`, `makeSeededRepo`, or `makeSandboxRepo` share expensive setup without necessarily sharing a production subject [`packages/router/test/support/fixtures.ts`; approximately 240 repositories/full run].
- `.dabbler/runs/` creates ambient coupling invisible to TypeScript imports: one test can depend on cleanup, naming, ordering, or files left by another [Q4: ambient coupling through `.dabbler/runs/`].
- High-fan-in utilities cause poor partitions. `journal`, `pythonJson`, `config`, `ledger`, `textfile`, and `checks` have fan-ins of 30, 24, 21, 16, 16, and 14 respectively, so “halves” derived from node count can overlap in their true failure domains [`packages/router/src` graph fan-in numbers].
- SCC-A prevents useful internal localization until it is cut: all 28 modules are mutually reachable even though their projected levels range from L1 through L5 [`packages/router/src` graph: SCC-A and levels].
- A test can cover several subjects while importing only one directly, or import a module solely for types/setup while asserting another behavior. **ASSUMPTION:** the brief does not provide individual test imports or subjects.

A binary descent also assumes failures partition cleanly. Shared state, multiple simultaneous defects, and shared leaves can make both halves fail or make the nominally relevant half pass.

**Fix →** Use authored diagnostic sets with DAG-derived suggestions, not DAG-derived authority:

1. Give every retained test explicit metadata for primary behavior, production subjects, seam contracts, ambient resources, real-git use, serialization requirement, and expected cost.
2. Seed that metadata from imports, then review it against what the test actually asserts.
3. Permit overlap. Cross-cutting tests should appear in more than one diagnostic set rather than being forced into one quadrant.
4. Create explicit sets for shared fixture infrastructure, `.dabbler/runs/` persistence, real git, process lifecycle, evidence/freshness, provider verification, and entry-point integration.
5. Descend by failure domain and assertion ownership, not by equal module counts.
6. Record the diagnostic-map version and exact test IDs used so the same descent can be reconstructed later.
7. Validate the map continuously by comparing predicted sets against full-suite failures during the shadow period.

## 5. The evidence model

**Issue →** “Sentinels and scope green; delegated to CI run R” is honest only if R is bound to the exact attested tree and the full-suite step actually ran. “Latest master CI” is an operational signal, not evidence for a particular session.

**Fix →** Record at close:

### Candidate identity

- Session ID.
- Baseline commit SHA and candidate commit SHA.
- Git tree identity and `testEvidence.surfaceDigest`, including digest algorithm/version.
- A statement that the candidate commit’s tracked contents equal the surface digest.
- Whether the working tree had tracked modifications not represented by the candidate commit.

The current model hashes every tracked file and rejects stale evidence, so a CI checkout must correspond exactly to that tracked surface [current evidence model].

### Synchronous verification

- Sentinel IDs, source/test hashes, results, durations, and asserted behavior claims.
- Changed paths and baseline used to calculate the change.
- Dependency-graph snapshot/version.
- Reverse-dependency closure selected.
- Every absorption point, its registered contract tests, and their results.
- All selected test IDs, results, and runner command/config. The current full command is `npx vitest run --root packages/router`, with local worker configuration in `packages/router/vitest.config.ts` [1263-test suite; `packages/router/vitest.config.ts`].
- Diagnostic descent path and set versions whenever descent occurs.

### Delegated CI verdict

- GitHub Actions workflow run ID, attempt ID, job ID, URL, trigger, ref, and exact head SHA.
- Workflow/config revision.
- Platform and worker setting; current CI is `windows-latest` with one worker [CI configuration in brief].
- Start/end timestamps and conclusion.
- Step-level proof that the full-suite step started and completed.
- Full-suite command, discovered/executed test counts, failures, and report artifact identity.
- Separate status for prerequisite steps such as typecheck. A failed prerequisite must be recorded as “full suite not run,” not as a full-suite verdict; that distinction failed operationally before session 66 [session 66; `.gitattributes` fix].
- Final attestation state: `PENDING`, `PASSED`, `FAILED`, `CANCELLED`, `MISSING`, or `STALE`.

If run R does not yet exist when close occurs, the record cannot truthfully say that CI passed. Either run the immutable candidate SHA before landing or record a provisional close and append the immutable CI result later.

### Attention-row rule

At every registration, display and persist:

- Latest master run ID, SHA, age, conclusion, and attempt.
- Whether the full-suite step actually completed.
- Whether that SHA is the current master.
- Any pending or failed session attestations.
- Explicit `MISSING` or `STALE` status rather than a blank row.

A red, missing, stale, or “suite not run” row should require acknowledgement and should block another releasable close. A passive informational row is insufficient given that CI previously remained red for weeks [session 66].

**New failure mode →** The repository can contain a session marked closed—and master can contain its commit—while the only full-suite verdict is pending, later fails, is cancelled, targets the wrong SHA, or never executes. The current model does not have that temporal gap because it records the full suite green against the exact working tree before close [current evidence model].

## 6. What are we missing?

**Issue →** The strongest argument against the change is that it weakens the only deterministic exact-tree control while the selector’s architectural basis is least trustworthy: half the modules are in one SCC, test-to-subject mapping is not supplied, ambient filesystem coupling exists, and CI has already gone unnoticed while red [`packages/router/src` graph: SCC-A = 28/57; Q4: `.dabbler/runs/`; session 66]. At the same time, replacing most real-git tests with recorded answers changes another major source of confidence [sessions 76–77 plan; `packages/router/src/journal.ts`]. Doing all of these together makes a later miss difficult to attribute.

**Fix →** The cheapest alternative is:

1. Remove the redundant `preverify-targeted` close-phase run and retain one exact-tree `final-full`. That immediately removes a measured 353–625 seconds per session, including cases where targeting cost more than the full suite [measured `preverify-targeted`: 353–625 seconds; `final-full`: 590–698 seconds].
2. Complete the already planned recording work at `journal.runGit`, retaining approximately 15 real-git contract tests, then remeasure the full suite [sessions 76–77; `packages/router/src/journal.ts`; approximately 240 repositories with 6–10 spawns each].
3. Use sentinels and change-scoped suites for rapid iteration and diagnosis, but run them in shadow mode alongside the single final full close.
4. Build the boundary DAG incrementally and validate diagnostic selections against observed full-suite failures.
5. Surface CI health immediately, independent of whether the evidence model changes.

This captures the certain 353–625-second saving and attacks the dominant fixture cost without surrendering the exact-tree attestation.

RECOMMENDATION: Do not replace `final-full` with asynchronous CI delegation as currently written. Proceed with the layered-DAG refactor, authored sentinels, diagnostic metadata, CI attention row, and planned `journal.runGit` recordings, but first remove `preverify-targeted` and retain one exact-tree full close. Run the proposed selector and absorption cuts in shadow mode until they show no misses against repeated full runs and mutation calibration. Delegation should be allowed only when CI runs the immutable candidate SHA before master advances, records step-level proof that all 1263-current-suite tests actually ran, and makes any pending or failed verdict a non-green attestation [`packages/router/test/`; 1263 tests; current evidence model].

TOP RISKS:

- **False-green absorption or sentinel blind spot** → Keep downstream closure/full-suite comparison in shadow mode, register missing contracts from every discrepancy, and require mutation calibration before a seam can stop propagation.
- **Master advances while CI evidence is pending or silently unhealthy** → Run CI on the exact candidate SHA before updating master; otherwise record `PENDING`, block releasable close, and make red/missing/stale attention rows require acknowledgement [CI-on-master model; session 66].
- **SCC refactor causes broad semantic churn without improving diagnosability** → Use an incremental declared-boundary DAG, pilot the method on SCC-B’s three modules, freeze new SCC-A edges, and retain exact-tree full verification throughout the 28-module breakup [`packages/router/src` graph: SCC-A = 28; SCC-B = 3].