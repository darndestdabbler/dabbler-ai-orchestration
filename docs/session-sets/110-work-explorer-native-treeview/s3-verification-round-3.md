VERIFIED

Fix verdict: L1 deterministic environment-fault fixture -- fix-accepted

The fixture now forces a missing configured Python executable and asserts the exact `python` fault code, eliminating dependence on inherited credentials or host tooling.

#### NITS

- **Nit:** `electronLaunch.ts` documents `openDabblerContainer()` as idempotent and “guarded on the activity-bar item's checked state,” but its implementation still clicks unconditionally. Update the comment or implement the stated guard; current callers must use `workExplorerPane(page, { reveal: false })` when the container is already open.