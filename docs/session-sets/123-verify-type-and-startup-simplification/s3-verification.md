**ISSUES FOUND**

**Issue 1:** `Dabbler: Open Module Plan` is still contributed and shown on module rows, but its implementation was deleted with `wizard/planImport.ts`.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/package.json:189,340,350`, `tools/dabbler-ai-orchestration/src/extension.ts:291-323`, `tools/dabbler-ai-orchestration/src/commands/workExplorerTreeCommands.ts:101-113`, `tools/dabbler-ai-orchestration/src/providers/workExplorerTreeModel.ts:550-589`
- **Failure scenario:** A typical scaffolded project has module rows; `moduleDescriptor()` emits `;can-open-plan;`, so VS Code shows the inline/context `dabbler.openModulePlan` action. Clicking it fails with command-not-found because activation no longer registers that command. This is probable for any user using the Work Explorer module plan affordance.
- **Acceptance criterion:** `JUDGMENT - From both a declared-module row and the pseudo-module row, invoking Dabbler: Open Module Plan must call a registered command and open the correct plan file or the existing missing-plan import prompt, not command-not-found.`
- **Details:** Violation: the handoff explicitly calls out “Did anything surviving lose its backing?” and says shared code for surviving commands should be relocated, not deleted. Impact: a visible surviving Work Explorer action is broken on the main module workflow, which should block merge. Evidence: `package.json` still declares and menus `dabbler.openModulePlan`, module rows still emit `can-open-plan`, but the registration formerly supplied by deleted `wizard/planImport.ts` is absent from the remaining activation registrations. Correct fix is to extract/register the module-plan opener outside `wizard/`, or fully retire every manifest/menu/context affordance if the operator explicitly decides that action is gone.

#### NITS

- **Nit:** `Dabbler: Get Started` still tries to focus the deleted `dabblerSessionSets` view id (`dabblerSessionSets.focus`) instead of the surviving tree view id. It catches the error and still opens the doc, so this is recoverable, but it is a missed retired-surface reference.
- **Nit:** `scripts/activation-harness.ts` still imports deleted `CustomSessionSetsView` and `scanState`, so the script’s documented `ts-node` invocation is now broken. It is not product runtime, but the edited script was not made coherent with the deletion.
- **Nit:** Live docs still describe deleted setup/config/cost surfaces, especially `docs/quick-start.md`, `docs/adoption-bootstrap.md`, and `docs/ai-led-session-workflow.md`.
- **Nit:** The bootstrap files now say this repo has a committed root `project-verify-type.txt`, but the file is absent and the session’s own decision log says this repo should not commit one.