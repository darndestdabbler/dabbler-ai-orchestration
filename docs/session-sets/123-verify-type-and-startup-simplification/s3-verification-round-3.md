ISSUES FOUND

- Fix verdict: L1 Open Module Plan command restored and registered -- fix-accepted
- Fix verdict: L2 -- duplicate-of L1
- Fix verdict: L3 live onboarding docs cleanup -- fix-rejected
- Fix verdict: L4 Copilot seat setup failure messages no longer assert `api` fallback -- fix-accepted

**Issue 1:** Primary quick-start still claims `Dabbler: Set Up New Project` scaffolds `ai_router/budget.yaml`, but the command path deliberately writes no budget file.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/quick-start.md:66,223-226`, `tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts:283-290,332-335,452-509`, `tools/dabbler-ai-orchestration/src/test/suite/budgetYaml.test.ts:266-278`
- **Failure scenario:** A new adopter follows the primary setup checklist, runs `Dabbler: Set Up New Project`, and then `verify_type`. The docs say `budget.yaml` was scaffolded, so they do not hand-author it; the command has no budget input and passes no budget, so no file is written. This is probable because it is the documented first-run path, and it leaves the required project-level budget/NTE declaration missing.
- **Acceptance criterion:** `JUDGMENT - docs/quick-start.md must either stop claiming Set Up New Project writes ai_router/budget.yaml and add an explicit hand-author/edit step, or the setup command must actually write the documented file.`
- **Details:** **Violation:** the fix says project setup is now terminal/YAML-based, and `docs/budget-yaml-schema.md` says `Dabbler: Set Up New Project` “scaffolds without a budget and writes no file,” but `docs/quick-start.md` still says the setup command scaffolds `ai_router/budget.yaml`. **Impact:** the replacement onboarding path is incomplete for the main new-user flow. **Evidence:** `gitScaffold.ts` registers `dabbler.setupNewProject` with no budget argument, documents that the palette path “has no budget input and leaves it unset,” and the test suite pins “without a budget writes nothing (palette path).”