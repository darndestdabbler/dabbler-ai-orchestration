ISSUES FOUND

Fix verdict: L1 nested-parent repository handling -- fix-accepted  
Fix verdict: L2 false verification provenance -- fix-accepted  
Fix verdict: L3 -- duplicate-of L2  
Fix verdict: L4 canonical bundle enforcement remains incomplete -- fix-rejected  
Fix verdict: L5 extension/router delivery claim -- fix-accepted  
Fix verdict: L6 -- duplicate-of L4

- **Issue 1: The canonical metadata still does not enforce all rendered task instructions**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** During ordinary sample maintenance, a maintainer changes the exercise from `shout` to another function, updates `bundle.json`, the Python files, and the smoke test’s implementation, but misses the already-authored session specification. CI remains green because `missingFunction` is checked only against `hello/greeting.py` and `test_greeting.py`; the rendered `docs/session-sets/001-add-a-shout/spec.md` content is not checked. A typical user then starts the shipped session and follows a stale task, implements the wrong behavior, and remains red instead of completing the advertised first-run lifecycle. This is probable for the same maintenance-drift scenario underlying L4/L6: the remediation still leaves contract-bearing prose independently maintained.
  - **Details:**
    - **Violation:** The task requires “the **canonical sample bundle — one source of truth**,” while the new README claims “every field of `bundle.json` is read by a test, and no field is decorative” and that a drifting sample fails the build.
    - **Impact:** The shipped sample can present an internally inconsistent exercise while all new guards pass, materially breaking its primary red-to-green onboarding objective.
    - **Evidence:** In `sampleProjectCore.test.ts`, `missingFunction` is asserted only absent from `hello/greeting.py` and present somewhere in `test_greeting.py`. The rendered-document guard checks only `README.md` and `AGENTS.md`, and merely checks that the session specification path exists; it never checks the specification’s task text against `missingFunction`. The fix also introduces the stronger “EVERY field” claim even though `description` is absent from `SampleBundleMeta`, the required-key validation, and the enforcement table. This is new evidence that the remediation for Round 3’s L6 still covers only a subset, so the recorded settlement is being challenged rather than the finding being resurrected.
  - **Location:** `tools/dabbler-ai-orchestration/src/test/suite/sampleProjectCore.test.ts`; `docs/templates/sample-project/files/docs/session-sets/001-add-a-shout/spec.md`; `docs/templates/sample-project/README.md`; `docs/templates/sample-project/bundle.json`; `tools/dabbler-ai-orchestration/src/utils/sampleProject.ts`
  - **Fix:** Generate contract-bearing task text from metadata, or add assertions that the rendered session specification and every other contract-bearing bundled document match `missingFunction`, commands, paths, counts, and outputs. Replace substring-presence checks with checks that reject contradictory stale values, and either validate `description` or remove the unsupported “every field is enforced” claim.