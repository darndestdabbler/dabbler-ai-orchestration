ISSUES FOUND

- **Issue 1: A throwing write can partially modify `spec.md` while the flow reports “No files were changed”**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The D4 ruling requires a phase-two I/O failure to be surfaced as the partial-state path: “unrollable OS failure surfaced loudly.” The implementation instead assumes any `writeFileSync` exception means “the write threw before landing.”
    - **Impact:** Filesystem writes are not transactional; a write may truncate or partially replace a file before throwing, such as on disk exhaustion. If this happens on the first set, the report marks `fileModified: false`, the UI says **“No files were changed,”** and no refresh occurs, concealing an operator-owned `spec.md` that may need manual recovery.
    - **Evidence:** In `assignLegacySetsToModule()`, the direct write exception path returns:
      ```ts
      try {
        io.writeFileSync(item.specAbs, item.next);
      } catch (err) {
        return fail(item.name, ..., false);
      }
      ```
      The injected `SpecFileIo` contract also permits a writer to mutate data and then throw. `runAssignLegacySetsFlow()` consequently computes `anythingChanged === false` when no earlier item succeeded and emits `"No files were changed."`
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → phase-two write exception handling in `assignLegacySetsToModule()`; `src/commands/assignLegacySets.ts` → `runAssignLegacySetsFlow()`
  - **Fix:** Treat a write exception as potentially modifying the current file. Attempt rollback to `item.original` and verify the restored bytes; report `fileModified: false` only after confirmed restoration. Otherwise set `fileModified: true`, identify the file as requiring manual recovery, force refresh, and never claim no files changed. Add a regression test whose writer partially changes its backing store and then throws.