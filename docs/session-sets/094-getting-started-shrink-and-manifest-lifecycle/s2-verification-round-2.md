# ISSUES FOUND

- **Issue 1: The shipping onboarding sequence remains circular**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The required docs pass must describe the shipped module-first workflow correctly. In `tools/dabbler-ai-orchestration/README.md`, project-plan and first-session-set creation are said to live on “per-module rows in the tree,” yet the same paragraph says the form gives way to the Work Explorer tree only “as soon as the first session set exists.”
    - **Impact:** Following the documented primary path, an operator cannot reach **AI Sets** until after creating the first session set—the very artifact **AI Sets** is supposed to create. This makes the principal onboarding instructions for the release unusable or materially misrepresents when zero-set module rows become available.
    - **Evidence:** The current README explicitly gives both claims in consecutive paragraphs and emphasizes that the transition is keyed on session-set presence. The release metadata instead says the Getting Started completion model was reduced to `structureBuilt`, further demonstrating that the documentation and claimed shipped behavior are not aligned.
    - **Correct answer:** Document exactly when zero-set module rows become accessible. If they coexist with the form, say so explicitly; if the form transitions after structure creation, state that trigger. If the implementation actually hides module rows until a session set exists, change the implementation or restore a reachable first-session-set creation action. Then retain the corrected sequence: build structure → create/import plan → run **AI Sets** → save generated specs → start the next session.