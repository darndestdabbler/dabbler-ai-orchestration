ISSUES FOUND

- **Issue 1: Atomic staging reintroduces a concurrent-edit overwrite window**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The writer must preserve operator edits and ensure that only the intended `module:` insertion changes. The implementation itself states that a file changed after validation “must NOT be overwritten,” while D4 requires the on-disk mutation to equal the intended splice with nothing else changed.
    - **Impact:** An editor or external tool saving `spec.md` while the extension stages the replacement can have its changes silently erased. The operation then reports success, making this an operator-data-loss path that should block merge.
    - **Evidence:** Phase two checks the target before staging, but the actual target replacement happens only after two additional filesystem operations:
      ```ts
      current = io.readFileSync(item.specAbs);
      if (current !== item.original) return fail(...);

      io.writeFileSync(tmp, item.next);
      if (io.readFileSync(tmp) !== item.next) throw ...;
      io.renameSync(tmp, item.specAbs);
      ```
      If `spec.md` changes after the first read but before `renameSync`, the rename unconditionally replaces those new bytes with `item.next`. Verifying the temporary file proves only the staged source contents; it does not prove the destination still equals `item.original`. This can be reproduced deterministically with the injectable `SpecFileIo` by changing the target as a side effect of the temporary-file write.
    - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → phase two of `assignLegacySetsToModule()`
    - **Fix:** Re-read and compare the target after temporary-file verification and immediately before the rename, aborting and deleting the temp if it changed. Also serialize assignments targeting the same file or use a versioned/conditional replacement mechanism where available. Add a regression that modifies the target during the staged write and verifies the concurrent edit survives and the assignment fails.