ISSUES FOUND

### Issue 1: The declared-`default` guard remains unproven for the plan-import writer

- **Category:** Completeness / False Positive
- **Severity:** Major
- **Details:**
  - **Violation:** The settled Q6 ruling requires, for all three writer paths, that declared-`default` selection produce the literal frontmatter line `module: default`. The response also claims that “every writer stamps exactly that slug.”
  - **Impact:** A regression could remove or alter the plan-import module stamp while all added tests remain green. Decomposed session sets would then become unstamped or incorrectly attributed, violating the never-persist/provenance contract and changing their visible-module grouping.
  - **Evidence:** In `visibleModules.test.ts`, the declared-`default` provenance test verifies the bootstrap and session-generation paths using literal `module: default` assertions. For `buildPlanningPrompt`, however, it asserts only:
    ```ts
    assert.ok(plan.includes('the "Declared Default" module (`default`)'));
    ```
    This checks contextual prose, not a `module: default` stamp or instruction. The test would pass if the actual frontmatter-stamping instruction disappeared. No test invokes the production plan-import/decomposition flow and inspects resulting SessionSet frontmatter.
  - **Correct answer:** Pin the plan-import path to an exact `module: default` frontmatter instruction—or preferably execute the production decomposition flow and inspect the generated `spec.md`. Also assert that no other module stamp is emitted and that the slug originates from the selected manifest entry.