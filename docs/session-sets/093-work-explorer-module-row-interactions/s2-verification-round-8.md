ISSUES FOUND

- **Issue 1: The assignment writer does not validate the target against the manifest at write time**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The authoritative D4 ruling requires: **“Target slug MUST be manifest-declared, validated against the current manifest at write time (not the stale picker snapshot).”**
    - **Impact:** `docs/modules.yaml` can change while phase-one validation reads multiple selected sets. If the target module is removed, renamed, or the manifest becomes invalid before phase two, the writer still stamps every queued `spec.md` with the obsolete slug. Those sets are then incorrectly regrouped under a fallback module, contrary to the manifest-validation and stale-target fail-loud guarantees.
    - **Evidence:** `assignLegacySetsToModule()` calls `classifyModulesManifest(root)` only once, before phase-one set validation. Phase two re-reads each `spec.md`, but never re-reads or revalidates `docs/modules.yaml` before writing:
      ```ts
      const classified = classifyModulesManifest(root);
      // ...
      for (const set of sets) {
        // potentially lengthy phase-one reads and validation
      }
      // ...
      for (const item of queued) {
        current = io.readFileSync(item.specAbs);
        // only spec.md is revalidated
        io.writeFileSync(item.specAbs, item.next);
      }
      ```
      Thus the manifest used to authorize the writes can be stale by the time any write occurs.
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → `assignLegacySetsToModule()`
  - **Fix:** Reclassify the manifest after phase-one validation and immediately before phase-two writes, refusing before any write if it is invalid or no longer declares `targetSlug`. For stronger protection during a multi-file phase two, capture the validated manifest state and verify it remains unchanged before each write; report a partial-state failure if it changes after earlier files were written. Add a regression test that removes the target module between phase one and phase two and proves no `spec.md` is written.