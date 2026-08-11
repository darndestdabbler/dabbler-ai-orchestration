**ISSUES FOUND**

- **Issue 1:** The current tree has Playwright-scoped code changes after the last recorded full Playwright run.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-sets/115-work-explorer-session-node-ux/spec.md:323-329`, `docs/session-sets/115-work-explorer-session-node-ux/activity-log.json:373-378`, `docs/session-sets/115-work-explorer-session-node-ux/test-runs.jsonl`, `tools/dabbler-ai-orchestration/package.json`, `tools/dabbler-ai-orchestration/src/test/playwright/session-menu.spec.ts`, `tools/dabbler-ai-orchestration/src/commands/openFile.ts`, `tools/dabbler-ai-orchestration/src/providers/ActionRegistry.ts`
  - **Failure scenario:** The artifact-menu removal changed the VS Code package/menu surface and Layer 3 specs at 14:12, but the last recorded full `npm run test:playwright` is 11:18. A merge/close decision would rely on stale GUI coverage for exactly the package/real-host surface the spec says must be fully rerun after the last edit.
  - **Acceptance criterion:** `JUDGMENT - test-runs.jsonl records a passing full npm run test:playwright run after the artifact-entry-removal/package-menu changes, or those post-run Playwright-scope changes are reverted.`
  - **Details:** **Violation:** the spec says, “`package.json` and the tree model are both in scope, so **L-064-12 applies**: full `npm run test:playwright` after the last edit.” **Impact:** this changes the merge decision because the current package/menu surface is not backed by the required full real-host validation. **Evidence:** the activity log records the artifact-entry removal after the prior run, while `test-runs.jsonl` has no later Playwright run.

**NITS**

- **Nit:** `s4-verification-conventions.md` still says `Obligation.volatile` is true exactly for `GIT_BACKED_CHECKS`, but the code now uses `SET_LOCAL_CHECKS` and marks repo-wide digest/stamp checks volatile too.
- **Nit:** several TypeScript comments/tooltips describe all volatile rows as “read from git,” which is inaccurate for `verification_integrity`, `test_run_fresh`, and the backstop; the behavior is safe, but the explanation is narrower than the code.
- **Nit:** the symlink parity unit test’s `landProjection()` helper still uses `Dirent.isFile()`, so on hosts where symlink creation succeeds it writes a simulated projection that omits the symlink while the production reader includes it.