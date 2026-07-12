ISSUES FOUND

- **Issue 1:** The “never hide work” remediation still ignores actual bucket rows.
  - **Category:** Correctness / Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The contract requires `sets.length > 0 → "bucketed"` and says existing work must never be hidden. The round-3 remediation specifically required inferring `"bucketed"` when a bucket “has rows or a positive count,” and the current source comments claim it does so “if any bucket actually carries rows.”
    - **Impact:** A supported legacy/pre-093 payload whose bucket contains rows but has a missing, zero, or stale `count` still becomes `"blocked-until-plan"`. The Session sets node is rendered as a leaf, so its existing rows disappear. This leaves the previous Major defect unresolved for a structurally type-valid payload.
    - **Evidence:** In `media/session-sets-tree/client.js`, the guard examines only `count`:
      ```js
      const hasRows = (mod.buckets || []).some(function (b) {
        return b && b.count > 0;
      });
      ```
      It never examines `b.rows`. `BucketPayload` carries `count` and `rows` separately, with no enforcement shown that `count === rows.length`. The added test in `moduleTier.test.ts` is only a source-string scan, so it passes despite this incomplete logic; there is no runtime regression test using an omitted `sessionSets` field with populated rows.
    - **Correct answer / Fix:** Infer work from either representation:
      ```js
      const hasRows = (mod.buckets || []).some(function (b) {
        return b && (
          b.count > 0 ||
          (Array.isArray(b.rows) && b.rows.length > 0)
        );
      });
      ```
      Add a renderer-level regression test with `sessionSets` omitted and a bucket containing a row, including the `count: 0` case, and assert that the node is `"bucketed"` and the row remains visible.

## NITS

- **Nit:** `093-work-explorer-module-row-interactions-uat-checklist.json`, Walk 2, tells the operator to click an already-expanded `Default` module before pressing Arrow Down. The client wires `.module-header` clicks to collapse the module, as the Playwright test itself demonstrates, so the Plan and Session sets children will be hidden. Add an `ArrowRight` step after clicking to guarantee expansion, or use a focus method that does not toggle the module.