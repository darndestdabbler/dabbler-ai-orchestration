**ISSUES FOUND**

**Issue 1:** `Dabbler: Open Module Plan` is still exposed but no longer registered.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/package.json:189,340,350`, `tools/dabbler-ai-orchestration/src/extension.ts:291-337`, `tools/dabbler-ai-orchestration/src/commands/workExplorerTreeCommands.ts:101-114`, `tools/dabbler-ai-orchestration/src/providers/workExplorerTreeModel.ts:553-558`
- **Failure scenario:** A typical user right-clicks or uses the inline *Open Plan* action on a declared/default module row. The menu exists because the row emits `can-open-plan` and `package.json` contributes `dabbler.openModulePlan`, but activation never registers that command after `wizard/planImport.ts` was deleted, so VS Code reports the command as missing.
- **Acceptance criterion:** `JUDGMENT - The extension registers a surviving implementation for dabbler.openModulePlan during activation, and tree-row/palette invocations open the targeted module or repo-level plan without importing deleted wizard code.`
- **Details:** **Violation:** the deletion accepted loss of `Import Project Plan` and the two prompt generators, not the still-contributed module-row *Open Plan* command. **Impact:** a visible native-tree action on normal module rows is broken, which would change a merge decision. **Evidence:** `package.json` still contributes the command and menu entries; `workExplorerTreeModel.ts` still emits `can-open-plan`; `extension.ts` no longer imports/registers the deleted plan module, and `workExplorerTreeCommands.ts` registers only `activateSet` / `activateSession`.

**Issue 2:** Live onboarding/reference docs still direct users to retired setup/config/prompt surfaces.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/quick-start.md:36-80,228-232,325`, `docs/templates/consumer-bootstrap/getting-started.md.template:97-103,158-165`, `docs/repository-reference.md:823-825`, `tools/dabbler-ai-orchestration/package.json:53-60,62-291`
- **Failure scenario:** A new contributor follows the repo’s primary quick start or a freshly scaffolded consumer `getting-started.md`. They are told to use the Getting Started form, the Config Editor, or `Dabbler: Generate Parallel Session-Set Prompt (advanced)`, but this change removed the webview/form and those commands from the manifest. That is probable because the repo bootstrap explicitly sends new readers to `docs/quick-start.md`, and consumer projects receive the template.
- **Acceptance criterion:** `JUDGMENT - All live, non-historical docs and consumer templates stop instructing users to use retired webview/config-editor/dashboard/wizard/prompt surfaces and instead name the current terminal verify_type, setup command, native-tree, and surviving palette-command workflow.`
- **Details:** **Violation:** step 4 required grepping docs/templates/fixtures for retired-surface references, and the conventions say only historical records are exempt. **Impact:** onboarding remains anchored to UI and commands that no longer exist, so the deletion is not actually reflected in the user-facing path. **Evidence:** the live quick start still calls the form/config editor the recommended setup/tuning path, the shipped consumer template still says “From the form” and names a deleted parallel prompt command, while `package.json` now contributes only the native tree view and no deleted commands.

**NITS**

- **Nit:** `tools/dabbler-ai-orchestration/src/commands/gettingStartedDoc.ts:93-100` still tries `dabblerSessionSets.focus`; after the view deletion the focus command should be `dabblerWorkExplorerTree.focus` or the focus attempt should be removed. This is recoverable because it catches the failure and still opens the doc.