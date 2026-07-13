ISSUES FOUND

### Issue 1: Existing repositories with session sets but no modules manifest are mutated by Build

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A user upgrades a legacy repository containing real `docs/session-sets/*` work but no `docs/modules.yaml`, then re-runs Build. This is a probable compatibility path for the legacy repositories explicitly protected by the specification. Build creates `docs/modules.yaml`, treats that creation as proof the repository is fresh, and injects `default`, its plan stub, and two additional lifecycle sets into the established project.
- **Details:**
  - **Violation:** The specification requires: “re-running Build on a repo that already has modules or sets makes no module/set writes.”
  - **Impact:** Existing users can receive an unwanted module and workflow sets in an active repository, materially violating the skip-existing/idempotency posture and changing the merge decision.
  - **Evidence:** `buildProjectStructureNoPrompt` gates solely on:
    ```ts
    result.written.includes(MODULES_MANIFEST_DISPLAY)
    ```
    It never checks whether session sets or module artifacts existed before Build. Moreover, the test titled `"a repo with no modules.yaml at all still succeeds"` confirms that this state invokes the writers rather than protecting existing content.
- **Location:** `tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts`, default-module gate after `runScaffold`.
- **Fix:** Record pre-Build repository state and invoke the default scaffold only when the manifest was absent **and** no module artifacts or session-set directories existed. Add a test with pre-existing session sets but no manifest and assert byte-for-byte non-interference with all module/set paths.

### Issue 2: The mandatory locally built VSIX dogfood was not performed

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** The session is accepted with `dogfood-pass`, but an actual extension user encounters broken packaging, command registration, webview wiring, or Work Explorer row actions. This matters on the main path because every extension user runs the packaged VSIX and interactive commands, while the recorded dogfood bypasses all of those layers.
- **Details:**
  - **Violation:** The task requires: “walk Default → rename → delete → re-add a real module — the full first-run loop against the locally built VSIX.”
  - **Impact:** The required main-path acceptance check remains undone, so the session cannot substantiate its `dogfood-pass` progress key.
  - **Evidence:** `s1-dogfood.md` explicitly says it ran `buildProjectStructureNoPrompt` from compiled output and called `renameModule`, `deleteModule`, `scaffoldNewModule`, and `scaffoldModuleLifecycleSets` directly. Its “Known, named gap” confirms it did **not** exercise the interactive VS Code command-flow layer or a locally installed VSIX.
- **Location:** `docs/session-sets/101-default-module-scaffold-and-docs/s1-dogfood.md`.
- **Fix:** Build/package the VSIX, install it into a scratch VS Code instance, invoke Build through the extension, and perform rename, delete, and re-add through the Work Explorer UI. Record the resulting manifest/tree/set state.

### Issue 3: Required Work Explorer end-state tests are missing

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A fresh user Builds successfully at the filesystem layer but sees a pseudo-Default alongside the real module, wrong pending states, or missing lifecycle sets in Work Explorer. Conversely, a legacy empty-manifest repository could lose its pseudo-Default presentation. These are probable user-visible paths because Work Explorer is the specified interface, yet neither the new automated suite nor the dogfood exercises its rendering.
- **Details:**
  - **Violation:** The task explicitly requires tests proving:
    - the fresh tree has one declared module, two pending sets, and no pseudo-module;
    - an empty `modules: []` legacy repository renders pseudo-Default exactly as before;
    - both tiers are covered.
  - **Impact:** The central user-visible acceptance contract is unverified, so file creation tests can pass while the promised tree behavior is wrong.
  - **Evidence:** `gitScaffoldDefaultModule.test.ts` imports no Work Explorer/tree provider and makes no tree-node or pending-state assertions. Its legacy tests only inject a fake scaffold result and assert that `scaffoldDefaultModule` was not called. Its tier tests likewise validate only that synthetic gate.
- **Location:** `tools/dabbler-ai-orchestration/src/test/suite/gitScaffoldDefaultModule.test.ts`.
- **Fix:** Add Full and Lightweight integration cases that scaffold into temporary repositories and invoke the real tree provider. Assert exactly one real `default` module with two pending lifecycle sets and no pseudo-module. Add empty pre-existing-manifest cases asserting the unchanged pseudo-Default tree.

#### NITS

- **Nit:** The Build summary and returned `ScaffoldResult` omit the plan stub and lifecycle-set files written after `runScaffold`; `result.written.length` therefore under-reports the completed Build.
- **Nit:** `scaffoldDefaultModuleAndLifecycleSets` swallows writer failures after potentially making partial writes. Because later Builds skip whenever the manifest already exists, a transient failure can leave a permanently incomplete Default module unless the user repairs it manually.
- **Nit:** `DefaultModuleScaffoldOutcome.ran` is documented as true when content “already existed identically,” but the direct second-call test requires `ran === false` for that condition.
- **Nit:** `ai-assignment.md` records the routed recommendation as `claude-sonnet-5`, while `s1-next-set-analysis.json` actually recommends `claude-3-5-sonnet-20240620`; the ledger does not faithfully reproduce its cited raw recommendation.