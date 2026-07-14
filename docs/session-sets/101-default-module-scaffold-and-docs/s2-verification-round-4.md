ISSUES FOUND

- **Issue 1: The legacy migration recipe does not provide the required manual/AI path for adopting lifecycle sets**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A legacy multi-module repository follows the guide’s recommended bulk AI or hand-edited declaration path, assigns its legacy sets, and then wants to adopt the new lifecycle-set workflow. This is probable because the guide explicitly recommends those declaration paths for multiple modules. Such modules never receive `plan` and `decomposition` lifecycle sets; the guide instead redirects them to ordinary work-set authoring.
  - **Details:**
    - **Violation:** The task requires the migration recipe to cover “**adopt lifecycle sets going forward — manual/AI, never forced**.”
    - **Impact:** The principal legacy-migration deliverable is incomplete for two of its three documented declaration paths. A reasonable reviewer would not approve the release documentation while the promised lifecycle adoption path is unavailable or undocumented.
    - **Evidence:** In `docs/module-reorganization.md`, migration step 1 offers AI-prompt and manual declaration, but step 3 says only **Add Module…** or fresh Build creates lifecycle sets. AI/manually declared modules are told to use **`Dabbler: Generate Session-Set Prompt`** and that they are “not missing anything by skipping the lifecycle sets.” That is an alternative to adoption, not a manual/AI method of adopting lifecycle sets.
    - **Location:** `docs/module-reorganization.md`, **Adopting modules in a legacy repo (optional)**, steps 1 and 3.
    - **Fix:** Document how AI/manual declarations create correctly stamped `plan` and prerequisite-linked `decomposition` sets, or require lifecycle-seeking users to declare each module through a supported scaffolding command before assignment. If no supported adoption path exists for already-declared modules, that implementation/documentation gap must be resolved rather than described as direct-authoring equivalence.

- **Issue 2: The primary tutorial bypasses the new lifecycle flow it was required to teach**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every team following the hands-on Hello World tutorial deletes the Default lifecycle scaffolds before running them, then returns to direct plan and session-set authoring through AI chat and palette commands. Those users therefore never exercise or learn the release’s central Build → plan lifecycle set → decomposition lifecycle set → reorganization workflow.
  - **Details:**
    - **Violation:** The task explicitly requires: “**Update the hello-world tutorial + quick-start to the new flow: Build → Default module with Sets 001/002 → run the plan set → run the decomposition set → rename/delete Default when real modules arrive.**”
    - **Impact:** The designated deep-teaching tutorial does not deliver the promised walkthrough of the shipped lifecycle UX. Mentioning the flow in a side note and linking to the quick start is not equivalent to executing it in the tutorial; this materially misses the documentation objective and would change a reasonable reviewer’s merge decision.
    - **Evidence:** `docs/tutorials/module-team-hello-world.md` Part 3 instructs users to delete Default and remove `001-default-plan` and `002-default-decomposition` while unstarted. Parts 4–5 then teach direct AI/palette plan and set generation. The required lifecycle sequence appears only as a hypothetical solo-project note.
    - **Location:** `docs/tutorials/module-team-hello-world.md`, Parts 2–5.
    - **Fix:** Make the walkthrough run `001-default-plan` and `002-default-decomposition`, then preserve the resulting work by renaming Default, adding the remaining modules, and using the documented split/re-home path for sets belonging to those modules.

- **Issue 3: “Full suite green” is asserted without running the current full Python suite**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The operator relies on the session’s “publish-ready” and “suite green” claims at the sequence’s release boundary, even though the mandatory full-suite gate was replaced with an earlier baseline result. Reliance is probable because operator publication is the explicitly stated next action and the disposition presents the gate as complete.
  - **Details:**
    - **Violation:** Session step 6 requires “**Build + full suite**,” and the end state requires “**suite green**.”
    - **Impact:** Release readiness is unsubstantiated: the current integrated tree has not passed the required full test gate. A historical result cannot establish that the current tree is green, so a reasonable reviewer would require the suite to run before allowing close and publication.
    - **Evidence:** `activity-log.json` and `disposition.json` record only Python cold-start acceptance `2/2`, followed by “no `ai_router/` touched → pytest `3030/6` baseline unchanged.” That explicitly substitutes a prior baseline for a current full pytest execution while still claiming the full suite is green.
    - **Location:** `docs/session-sets/101-default-module-scaffold-and-docs/activity-log.json`, session 2 step 7; `disposition.json`, `summary`.
    - **Fix:** Run the repository’s complete current Python suite and record its actual result. If scoped testing is permitted instead, cite the governing rule and stop calling the result the “full suite.”

#### NITS

- **Nit:** `docs/module-reorganization.md` offers “**Add Module… per module from the tree**” to a legacy repository, but the release changelog says the pseudo Default/Unassigned row does not expose Add. Direct first-module creation to `Dabbler: New Module`, the form, or manual editing.
- **Nit:** `tools/dabbler-ai-orchestration/CHANGELOG.md` still summarizes the main sequence as “run the decomposition set → rename/delete Default,” despite the remediation establishing that deletion after decomposition cancels generated work. The release-note shorthand should preserve the rename-after-work/delete-before-work distinction.