ISSUES FOUND

- **Issue 1: The post-write guard does not verify the on-disk file equals the intended splice**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** D4 explicitly requires that “the on-disk file re-read equals the intended spliced content byte-for-byte.” The implementation claims this invariant but does not enforce it.
    - **Impact:** A post-write anomaly or concurrent rewrite that leaves the original text plus one valid `module:` line elsewhere in the configuration block is accepted. The required first-line placement and exact-write guarantee are therefore not protected on this operator-owned file mutation path.
    - **Evidence:** `assignLegacySetsToModule()` re-reads the file and calls:
      ```ts
      assertStampedTextValid(item.original, readBack, slug);
      ```
      It never compares `readBack` with `item.next`. `assertStampedTextValid()` only proves that `readBack` is the original plus one valid module line somewhere in the parsed block. For example, both the intended:
      ```yaml
      module: greeter
      tier: full
      ```
      and this unintended result:
      ```yaml
      tier: full
      module: greeter
      ```
      pass its prefix/suffix, YAML, and line-count checks.
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → `assignLegacySetsToModule()` and `assertStampedTextValid()`
  - **Fix:** After re-reading, require `readBack === item.next`; otherwise roll back and report failure. Add a regression test proving a valid module line inserted at a different block position is rejected.

- **Issue 2: The promised never-hide-work assignment integration test is missing**
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The session plan explicitly requires an assign-flow test proving “`Unassigned` disappears from a module only when emptied — work never vanishes.”
    - **Impact:** The high-value regrouping invariant is not tested across the writer, refresh, provider model, and rendered module buckets. The current tests can pass even if assigning one set incorrectly removes the entire `Unassigned` group or drops/misgroups remaining work.
    - **Evidence:** `assignLegacySets.test.ts` tests file stamping, candidate filtering, cancellation, and manifest errors. `moduleAuthoring.test.ts` tests the pure writer and phase-one refusal. The added Playwright test only renders an initial `Unassigned` strip; it never performs assignment or verifies post-assignment regrouping and total row preservation.
  - **Location:** `tools/dabbler-ai-orchestration/src/test/suite/assignLegacySets.test.ts`, `src/test/suite/moduleAuthoring.test.ts`, and `src/test/playwright/module-tier.spec.ts`
  - **Fix:** Add an integration test starting with multiple unassigned sets, assign a subset and verify the remaining `Unassigned` rows persist, then assign the final set and verify only the empty pseudo group disappears while every set remains visible under its target module.

- **Issue 3: The recorded dogfood does not substantiate the required end-to-end strip-action exercise**
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 6 requires live dogfood to “drive every strip action end-to-end.”
    - **Impact:** The required acceptance gate for the actual host/webview action paths remains unmet. In particular, the evidence does not demonstrate end-to-end execution of `AI Plan`, `Import Plan`, `Open Plan`, and `AI Sets` through their strip dispatch and handler wiring.
    - **Evidence:** The activity log’s 12 checks enumerate direct preselection outcomes and stamp-writer properties: declared/empty/stale resolution, no QuickPick/notice, spec stamping, comment preservation, YAML parsing, idempotence, and default refusal. It records no invocation or observable result for any of the four strip actions. The Playwright addition likewise checks only visibility and keyboard focus, not action execution.
  - **Location:** `docs/session-sets/093-work-explorer-module-row-interactions/activity-log.json` → Session 2 dogfood entry; `src/test/playwright/module-tier.spec.ts`
  - **Fix:** Run and record each strip action through the compiled host path against the scratch repository, including its observable result and confirmation that no module-selection QuickPick or auto-select notice appears.