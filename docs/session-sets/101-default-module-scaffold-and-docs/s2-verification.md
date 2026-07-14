ISSUES FOUND

## Issue 1: The scaffolded `modules.yaml` points to a guide that does not exist in consumer repositories

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A typical fresh-project user reads the generated `docs/modules.yaml` comments when reorganizing modules and follows `docs/module-reorganization.md`. That path does not exist in the scaffolded consumer project, so the required guidance is unreachable from the promised pointer. This is probable because the comment is emitted into every generated manifest and is specifically intended for users editing that manifest.
- **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts`, `MODULES_YAML_HEADER_COMMENTS`
- **Details:**
  - **Violation:** The task requires the new guide to be “pointed to from … the modules.yaml header comments.”
  - **Impact:** The resulting cross-reference is broken on the main fresh-scaffold path, materially undermining a required entry point to the reorganization workflow.
  - **Evidence:** The comment emits the repository-relative path `docs/module-reorganization.md`, but the guide is added only to this source repository. No consumer-bootstrap template or cold-start fixture adds that file. Conversely, `getting-started.md.template` correctly uses the absolute GitHub URL because the guide is external to consumer repositories.
- **Fix:** Put the canonical GitHub URL in `MODULES_YAML_HEADER_COMMENTS`, or add the guide to the consumer scaffold and corresponding goldens.

## Issue 2: The required affected screenshots were not retaken

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A typical reader follows the rewritten tutorial while its existing Set 095 screenshots still depict the pre-Set-100 form/tree sequence, retired child nodes, or retired row actions. The visual instructions then contradict the new prose exactly where the tutorial’s flow changed. This is probable because Parts 2–5 were substantially rewritten around those UI changes and the specification explicitly identifies their screenshots as affected.
- **Location:** `docs/tutorials/module-team-hello-world.md` and its screenshot assets
- **Details:**
  - **Violation:** The task explicitly requires “Retake affected screenshots” and lists “updated tutorial/quick-start + screenshots” as an end-of-set deliverable.
  - **Impact:** The primary hands-on tutorial ships with stale visual guidance for the replaced workflow, so the documentation portion of the release gate is incomplete.
  - **Evidence:** The complete `git status --short` contains no changed or added screenshot asset, while the tutorial now replaces the Getting Started-form sequence, removes `Plan`/`Session sets` nodes, and replaces the `AI Plan`/`Import Plan`/`AI Sets` action strip.
- **Fix:** Retake and commit every screenshot affected by the changed Parts 2–5 flow, updating references where filenames change.

## NITS

- **Nit:** The legacy migration recipe says users can declare modules via “**Add Module…** per module from the tree,” but the same diff’s changelog states lifecycle actions are available only on declared-module rows and the pseudo-module retains only `Open Plan` and `Assign legacy sets to module…`. A legacy repository with no declared module therefore cannot use that tree action for its first module. Direct users first to `Dabbler: New Module`, the form, or manual editing; tree-based Add can be used afterward.

- **Nit:** `ai-assignment.md` says the raw routed analysis recommends `claude-sonnet-5`, while `s2-next-set-analysis.json` actually recommends `claude-3-5-sonnet-20240620`. If the newer model is an intentional normalization or substitution, record it as such rather than attributing it to the raw analysis.

- **Nit:** The tutorial says deleting a module “never touches sets with real work” and immediately says those sets are cancelled. Cancellation does modify them; use “never deletes sets with real work” to match the documented behavior.