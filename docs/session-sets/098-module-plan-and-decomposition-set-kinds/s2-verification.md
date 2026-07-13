ISSUES FOUND

- **Issue 1:** The decomposition template directs authors to create runtime-owned state files.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Every generated decomposition set unconditionally instructs the AI to create `session-state.json` for each newly authored child set. An AI following the generated specification will therefore pre-create lifecycle state outside the blessed runtime writer. This is probable because it is an explicit main-path instruction, not an edge case. Invented, copied, or stale state can then conflict with registration or `start_session`, materially undermining the objective that the resulting sets be ready to run.
  - **Details:**
    - **Violation:** The task states that lifecycle scaffolding is “`spec.md only — state files are the blessed runtime writers' job`.” The same state-ownership rule is contradicted by the generated decomposition guidance.
    - **Impact:** The decomposition workflow can produce child sets with unauthorized or invalid lifecycle state, causing runtime state conflicts or preventing those sets from starting normally. This warrants blocking the merge because the faulty instruction is emitted for every decomposition set.
    - **Evidence:** Both `renderModuleDecompositionSetSpec` in `src/utils/moduleAuthoring.ts` and `module-decomposition-set.spec.md.template` say:
      ```text
      docs/session-sets/<NNN-slug>/spec.md + session-state.json
      ```
      The correct guidance is to author only each child set’s `spec.md` and leave `session-state.json` creation to the blessed runtime writer.

### NITS

- **Nit:** Existing lifecycle sets are accepted solely by basename, without requiring `spec.md`, matching `kind`, or matching `module` → `findExistingLifecycleSetSlug` and `scaffoldModuleLifecycleSets` → Parse and validate candidates before reuse; otherwise refuse safely or create a valid set. As written, an empty or legacy `005-greeter-plan/` directory causes a successful result pointing to a missing or invalid plan spec.

- **Nit:** Reused decomposition sets are not checked for the required sibling-plan prerequisite → `scaffoldModuleLifecycleSets` skips `assertLifecycleSpecWritten` whenever `existingDecompositionSlug` is found → Validate that an existing decomposition spec links to the selected plan before returning it. Otherwise the promised cross-link can be absent or target another plan.

- **Nit:** Multiple legitimate plan/decomposition sets are resolved by lexicographically selecting the earliest matching basename → `findExistingLifecycleSetSlug(...).sort()[0]` → Identify the actual scaffold pair through parsed metadata and prerequisite linkage, or define and enforce a latest/current selection rule. The current behavior conflicts with the supported amendment and continuation model once multiple lifecycle sets exist.

- **Nit:** The claimed skip-existing write is vulnerable to a check/write race → `writeSpecSkipExisting` uses `existsSync` followed by ordinary `writeFileSync` → Use the existing exclusive, symlink-safe no-replace primitive. A concurrent creator can currently have its file overwritten, despite the comment claiming defense against that race.

- **Nit:** Set-number allocation is not serialized → `scaffoldModuleLifecycleSets` lists directories and then creates independently named directories without a lock or reservation → Protect allocation and creation with a repository lifecycle lock. Concurrent calls for different modules can both allocate the same numeric prefixes.

- **Nit:** Failures after the first write can leave a partial scaffold → plan writing occurs before decomposition writing and there is no rollback → Pre-render and validate both specs, reserve both destinations, then commit them transactionally or remove newly created artifacts on failure. The current “refusal leaves the tree untouched” test covers only invalid slug validation, not write or parse refusal.

- **Nit:** The source template files are not actually rendered or tested → `moduleAuthoring.ts` duplicates their contents as template literals, while tests call only those render functions → Establish one canonical template source and make the writer and parser-validation tests consume it. The checked-in `.template` files can currently drift or break without any test failing.