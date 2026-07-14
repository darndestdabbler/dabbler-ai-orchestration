ISSUES FOUND

- **Issue 1: The legacy migration recipe tells users to run lifecycle sets that its recommended declaration paths never create**
  - **Category:** Correctness / Completeness
  - **Severity:** Major
  - **Failure scenario:** A legacy-repo user follows the prominently documented **Copy AI decomposition prompt** or manual-manifest path, assigns legacy sets, and then reaches “run each module’s `plan` then `decomposition` set.” Those sets do not exist: the evidence says only **Add Module…** scaffolds them. This is probable for multi-module legacy repositories because the guide explicitly recommends the AI prompt as “handy for declaring several modules at once.” The user cannot complete the documented lifecycle-adoption path without inventing an undocumented scaffold procedure.
  - **Details:**
    - **Violation:** The required recipe must cover “adopt lifecycle sets going forward — **manual/AI**, never forced.” Instead, `docs/module-reorganization.md` says to declare modules through the form or by hand, then later says: “run each module’s `plan` then `decomposition` set,” without explaining how those declaration paths create either set.
    - **Impact:** A core path in the new migration guide leads to nonexistent runnable sets, materially impairing the session’s legacy-migration deliverable.
    - **Evidence:** The same document and changelog explicitly state that **Add Module…** scaffolds lifecycle sets, while **Copy AI decomposition prompt** fills `docs/modules.yaml` and hand editing only changes the manifest. Nothing shown auto-scaffolds lifecycle sets after those edits.
    - **Location:** `docs/module-reorganization.md`, “Adopting modules in a legacy repo (optional),” steps 1 and 3.
    - **Fix:** Document the manual/AI procedure for creating correctly stamped `kind: plan` and prerequisite-linked `kind: decomposition` sets, or restructure the recipe so modules requiring lifecycle scaffolds are created through `Dabbler: New Module` before any bulk manifest editing.

- **Issue 2: The required affected screenshots were not retaken**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A typical reader follows the visual Hello World tutorial and encounters screenshots from the prior UI showing the Getting Started form after Build, retired `Plan` / `Session sets` nodes, or retired module-row actions, while the rewritten prose describes the new tree. Because Parts 2–5 changed specifically around those visuals, stale screenshots would directly contradict the shipped flow.
  - **Details:**
    - **Violation:** The specification explicitly requires “Retake affected screenshots (the Set 095 convention)” and lists “updated tutorial/quick-start + screenshots” as a deliverable.
    - **Impact:** The primary hands-on tutorial remains visually inconsistent with the released UI, defeating the requirement that documentation contain no retired-UI guidance.
    - **Evidence:** The complete `git status --short` and diff contain no changed or added screenshot assets despite substantial UI-flow rewrites in the tutorial.
    - **Location:** Screenshot assets associated with `docs/tutorials/module-team-hello-world.md`, especially Parts 2–5.
    - **Fix:** Retake and replace every screenshot affected by Build creating the Default tree, flattened status buckets, and the new module-row actions; verify image references and rendered documentation.

#### NITS

- **Nit:** `docs/module-reorganization.md` says a legacy repository can declare modules using **Add Module… per module from the tree**, but the changelog says the pseudo Default/Unassigned row does not expose Add—it keeps only **Open Plan** and **Assign legacy sets to module…**. Direct users to `Dabbler: New Module` from the Command Palette until a declared module row exists.

- **Nit:** The promised workflow-document and authoring-guide pointer updates are absent. The conventions identify `docs/ai-led-session-workflow.md` and `docs/planning/session-set-authoring-guide.md` as literal pointer touches, but neither appears in the complete status or diff. Add links to the new reorganization guide where appropriate.

- **Nit:** `ai-assignment.md` says the routed next-set analysis recommends `claude-sonnet-5`, while `s2-next-set-analysis.json` actually recommends `claude-3-5-sonnet-20240620`. Preserve the raw recommendation accurately or rerun the analysis for the newer model.

- **Nit:** The tutorial says deleting a module “never touches sets with real work” and immediately explains that such sets are cancelled. Cancellation modifies those sets; replace “never touches” with “never hard-deletes.”

- **Nit:** The migration guide says completed sets “stay exactly as they are,” while the preceding assignment step can write a `module:` stamp into completed legacy sets. Clarify that retrofitting completed sets is optional and that assigning one changes only its stamp.