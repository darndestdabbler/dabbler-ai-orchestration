ISSUES FOUND

- **Issue 1:** The new environment-fault Layer 3 test does not deterministically create an environment fault.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A maintainer runs the mandatory full Playwright suite in the normal configured development environment, where a provider key and system Python are available. The fixture then has no status fault, so `dabblerSessionSets.setupNeeded` remains false and `openSessionSetsView()` times out waiting for a pane that correctly does not exist. This is probable because the project’s routed development environment uses provider credentials and the test host inherits `process.env`.
  - **Details:** **Violation:** The session must end with “Layer 3 is green on the new view,” and the test claims that “no engine files and no venv fails the workspace-initialization probe.” **Impact:** The required full-suite gate can fail based on the runner’s environment rather than product correctness, blocking close or release. **Evidence:** In `src/test/playwright/system-status.spec.ts`, the fixture contains a session set. In `src/providers/systemStatus.ts`, `workspaceInitialized` is explicitly `hasAnySets || detectCompletion(...).structureBuilt`, so it is always `true` for this fixture. The remaining possible faults depend on inherited provider credentials, system Python, CLI presence, tier, and transport profile. The test’s stated reason for expecting the pane is therefore false. **Correct answer:** Use an empty workspace with no scaffold artifacts so `hasAnySets === false` and `workspaceInitialized === false`, or explicitly sanitize/inject the extension-host environment and assert the exact deterministic fault.

#### NITS

- **Nit:** The one-channel manifest contract is not fully asserted end to end → `src/test/playwright/system-status.spec.ts` claims the status strip “stays silent,” but the invalid-manifest test only checks `TreeView.message` and never verifies that `Setup & Status` remains absent → assert that no Setup & Status pane or manifest status item appears after corruption.

- **Nit:** A migrated unit assertion is ineffective → `src/test/suite/moduleLifecycleUi.test.ts` contains `/decomposition/`, using literal backspace characters rather than word-boundary escapes → replace it with `/\bdecomposition\b/` and also check that an ordinary set does not acquire a `plan` kind annotation.

- **Nit:** The deletion review mischaracterizes non-renderer coverage → `s3-deletion-review.json` says both `poc-nine-modules-*` files existed “solely to measure performance,” but the shown tests contain no performance measurements and assert parsing, manifest order, nine-module grouping, empty-module behavior, and slug uniqueness → document which equivalent surviving tests cover each behavior, or preserve/migrate the uncovered assertions.

- **Nit:** The seeded overlay is not flow-equivalent to the documented Set 108 regression → `overlay-click-swallow.spec.ts` describes an element occupying layout space, but `seedOverlay()` uses `position:absolute`, so it creates a static hit-test obstruction without affecting flow or moving content between mouse-down and mouse-up → either narrow the claim to pointer interception or seed an actual layout-shift/hover transition.

- **Nit:** The startup-harness handoff contradicts its stated protocol → `s3-implementation-notes.md` describes a median of at least three repetitions and an 8-set fixture, while `real-host-baseline.spec.ts` uses `REPS = 2` and scales `[10, 100, 500]` → reconcile the documentation and constants before Session 4 relies on the harness.

- **Nit:** Several rewritten Playwright teardowns swallow a failed VS Code close but then call `cleanupTmpDir()` without protection → on platforms with locked files, a close failure can be replaced by a cleanup exception that obscures the original test result → preserve and report both teardown errors or make cleanup best-effort consistently.