ISSUES FOUND

Fix verdict: L1 nested parent-repository isolation -- fix-accepted  
Fix verdict: L2 false cross-engine verification provenance -- fix-accepted  
Fix verdict: L3 -- duplicate-of L2  
Fix verdict: L4 canonical bundle single-source enforcement -- fix-rejected  
Fix verdict: L5 VSIX/router delivery claim separation -- fix-accepted

### Issue 1: The canonical bundle still is not enforced as the single source of truth

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** During normal sample maintenance, a maintainer changes the test surface or tutorial expectations while updating the smoke test or rendered sample documentation independently. CI can remain green even though Session 2’s tutorial or another rendered document gives users stale test counts or expected behavior. This remains probable because those claims are hand-maintained in multiple consumers, while the added guard covers only a subset of them.
- **Location:** `docs/templates/sample-project/bundle.json`; `tools/dabbler-ai-orchestration/src/test/suite/sampleProjectCore.test.ts`
- **Details:**
  - **Violation:** The task requires a “**canonical sample bundle — one source of truth, consumed by the command, by S2's tutorial, and by the smoke test**.” The new test itself claims to check “every prose copy of the contract,” but only examines `README.md` and `AGENTS.md`.
  - **Impact:** The original drift path remains open, undermining the explicit single-source-of-truth requirement and allowing a user-facing tutorial to disagree with the actual sample.
  - **Evidence:** `expectedTests` was removed rather than connected to consumers or replaced with derived assertions. The new test checks output lines, entry point, and test command only in `README.md` and `AGENTS.md`; it does not inspect `docs/tutorials/hello-world.md`, test totals, before/after test state, or every rendered document identified by L4. No tutorial remediation appears in the fix delta despite `bundle.json` continuing to name that tutorial as a consumer.
- **Fix:** Make the test-state expectations authoritative and derived—either retain machine-readable expectations in `bundle.json` or derive them from the canonical rendered test tree—and assert every consumer, including `docs/tutorials/hello-world.md`, against those values. Do not label the check as covering every prose copy until it actually enumerates all contract-bearing documents.