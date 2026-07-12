ISSUES FOUND

- **Issue 1:** The optional wire states can cause valid legacy payloads to hide existing session sets.
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The contract requires that “sets.length > 0 → `bucketed`” and that real work is “always shown.” It also requires every module to show the child nodes with correct states. However, `ModulePayload.plan` and `ModulePayload.sessionSets` are optional specifically for legacy producers.
    - **Impact:** A type-valid payload from the explicitly supported legacy `buildModulePayloads` or a pre-093 fixture can contain nonempty buckets while omitting `sessionSets`. The renderer converts that payload to `blocked-until-plan`, renders a leaf, and never renders its buckets. Existing work therefore disappears from the tree, contradicting the fail-loud/never-hide-work requirement and warranting a pre-merge fix.
    - **Evidence:** In `src/types/sessionSetsWebviewProtocol.ts`, both fields use `?`, with the comment: “Optional only for the legacy `buildModulePayloads` / pre-093 fixture payloads.” In `media/session-sets-tree/client.js`, `renderSessionSetsNode` maps every missing or unknown value to `"blocked-until-plan"`:
      ```js
      const state =
        mod.sessionSets === "bucketed" || mod.sessionSets === "empty"
          ? mod.sessionSets
          : "blocked-until-plan";
      ```
      Buckets are rendered only in the `"bucketed"` branch. Thus a valid legacy payload with rows is silently hidden. Calling this the “safe” fallback is false confidence.
    - **Correct answer / Fix:** Make `plan` and `sessionSets` required and update all producers and fixtures. If legacy payload compatibility must remain, infer `"bucketed"` whenever any bucket has rows or a positive count before falling back to `"blocked-until-plan"`, and add a regression test for an omitted-state payload containing rows.