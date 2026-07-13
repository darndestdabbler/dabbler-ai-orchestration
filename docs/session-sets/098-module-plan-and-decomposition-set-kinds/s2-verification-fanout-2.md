ISSUES FOUND

- **Issue 1: The scaffold writer does not render the delivered template files, and the tests never validate those files**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A maintainer updates either shipped lifecycle template—as is normal when schema fields or authoring guidance evolve—and runs the suite. All tests still pass because both the writer and tests use separate hard-coded strings. Typical users then receive stale scaffolded specs that omit the updated contract or guidance. This is probable because the implementation deliberately creates two manually synchronized sources of truth with no parity test.
  - **Location:** `src/utils/moduleAuthoring.ts` (`renderModulePlanSetSpec`, `renderModuleDecompositionSetSpec`); `src/test/suite/moduleAuthoring.test.ts`; `docs/templates/consumer-bootstrap/README.md`
  - **Details:**
    - **Violation:** The task requires the writer to “**render both templates**” and requires a “**template rendering matrix**.” Instead, the README explicitly says the writer “embeds the equivalent content directly rather than reading this file at runtime” and that the copies are “kept hand-in-sync.”
    - **Impact:** The actual shipped template assets are disconnected from scaffold behavior and are not protected by the requested tests. Template defects, packaging drift, or later edits do not affect generated specs and cannot be caught by the current suite.
    - **Evidence:** Both renderer functions return large inline template literals. No production or test code reads `module-plan-set.spec.md.template` or `module-decomposition-set.spec.md.template`; tests only invoke the inline renderers.
    - **Correct answer:** Establish one canonical template source and render it in `scaffoldModuleLifecycleSets`. Tests must load and render the actual delivered template assets, parse those rendered results, and cover the required matrix.
  - **Fix:** Load the bundled templates through an appropriate resource/template abstraction—or generate both assets and runtime rendering from one canonical source—and add parity/rendering tests against the real files.

#### NITS

- **Nit:** `findExistingLifecycleSetSlug` treats any numerically prefixed directory whose name ends in `-<module>-plan` or `-<module>-decomposition` as a valid lifecycle set without parsing its `spec.md`. The test explicitly reuses `# hand-authored plan set\n`, which has neither `kind: plan` nor the required module configuration. A legacy, incomplete, or unrelated matching directory can therefore yield a result that does not satisfy the writer’s advertised kind/guidance guarantees. Validate existing candidates before reuse or refuse clearly.

- **Nit:** `writeSpecSkipExisting` is not a safe skip-existing primitive. `existsSync` followed by ordinary `writeFileSync` is a TOCTOU race and can overwrite a file created between the two calls; the subsequent read-back does not prevent that overwrite. Use the existing exclusive/no-replace writer.

- **Nit:** The claimed “refusal leaves the tree untouched” behavior is only tested for pre-write slug validation. Parse-after-write failure or failure while creating the decomposition spec leaves the plan and possibly malformed files behind, and a rerun can then misclassify those directories as valid existing lifecycle sets. Pre-render and parse temporary content before committing, or roll back files created by the failed invocation.

- **Nit:** `assertLifecycleSpecWritten` checks `kind` and the decomposition prerequisite but not the expected `module`, plan prerequisite absence, or other required configuration. Thus the parse guard does not fully enforce the advertised module identity and cross-link contract.