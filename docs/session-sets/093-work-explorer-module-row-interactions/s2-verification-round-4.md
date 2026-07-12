ISSUES FOUND

- **Issue 1: Failed rollback can leave a modified `spec.md` while reporting that no files changed**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The D4 contract requires post-write anomalies to be rolled back and reported loudly; the implementation also claims that “the file was rolled back.”
    - **Impact:** If post-write verification fails and the rollback write also fails, the operator-owned file remains modified or corrupt. For the first file in a batch, the UI then explicitly reports **“No files were changed.”** This conceals the file requiring manual recovery and should block merge.
    - **Evidence:** In `assignLegacySetsToModule()`, rollback failure is discarded:
      ```ts
      try {
        io.writeFileSync(item.specAbs, item.original);
      } catch {
        /* best-effort rollback */
      }
      ```
      The returned reason nevertheless says:
      ```ts
      "post-write verification failed and the file was rolled back"
      ```
      The failed current item is absent from `written`. Consequently, `runAssignLegacySetsFlow()` emits `"No files were changed."` when no earlier item succeeded and returns `false`, so the view is not refreshed despite the current file potentially remaining changed.
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → `assignLegacySetsToModule()`; `src/commands/assignLegacySets.ts` → `runAssignLegacySetsFlow()`
  - **Fix:** Track whether rollback succeeded. If it fails, return an explicit high-severity state identifying the file as potentially modified, never claim it was rolled back or that no files changed, and force a refresh. Add a regression test whose verification read fails or mismatches and whose rollback write throws.

- **Issue 2: The two-phase writer can overwrite edits made after validation**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The format-preserving contract requires that only the `module:` line be inserted and “nothing else changed.” The validation/write split must not erase operator changes made after phase-one validation.
    - **Impact:** With multiple selected sets—or any concurrent editor/tool write—the file can change after its original text is read. Phase two then writes `item.next`, constructed from the stale original, silently deleting the intervening edits. The post-write guard passes because it compares the result against that same stale original and intended splice.
    - **Evidence:** Phase one stores `original` and `next`. Phase two immediately performs:
      ```ts
      io.writeFileSync(item.specAbs, item.next);
      ```
      There is no pre-write re-read or comparison with `item.original`. The only re-read occurs after the overwrite, where `readBack === item.next` merely proves that the stale replacement landed successfully.
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → phase two of `assignLegacySetsToModule()`
  - **Fix:** Immediately before each write, re-read the file and require byte-for-byte equality with `item.original`. If it differs, abort without writing that file and report a concurrent-modification refusal. Add a test that changes the in-memory file between phase-one validation and phase-two writing and verifies the external edit is preserved.