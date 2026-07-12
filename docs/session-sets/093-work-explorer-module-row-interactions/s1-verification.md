ISSUES FOUND

- **Issue 1:** The fallback `Plan = missing` invariant is not enforced, and its test does not exercise the case it claims to cover.
  - **Category:** Correctness / Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The settled contract states: “Fallback groups: `Plan` is always `"missing"` (`planPath` is null).” The test further claims that even a leaked `planExists=true` must still yield `missing`.
    - **Impact:** `buildVisibleModulePayloads` can emit `plan: "present"` for a fallback with no plan path, producing a semantically impossible and misleading UI state. The TypeScript model permits this input, while the test gives false confidence that it is guarded.
    - **Evidence:** In `SessionSetsModel.ts`, state is derived solely from `module.planExists === true`; `module.planPath` is not checked:
      ```ts
      const children = deriveModuleChildren(
        module.planExists === true,
        module.sets.length,
      );
      ```
      Therefore a fallback with `planPath: null` and `planExists: true` produces `plan: "present"`. In `visibleModules.test.ts`, the fallback test comments that it covers a leaked `planExists=true`, but never sets `planExists: true`, so it only tests the ordinary undefined/false case.
    - **Fix:** Derive presence with the required null guard:
      ```ts
      const planPresent =
        module.planPath !== null && module.planExists === true;
      const children = deriveModuleChildren(planPresent, module.sets.length);
      ```
      Set `planExists: true` in the fallback test and assert that the resulting plan state remains `"missing"`.