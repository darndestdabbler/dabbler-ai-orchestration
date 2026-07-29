ISSUES FOUND

### Issue 1: The manually added prerequisite is never committed before the pull request
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** On every normal Walk 8 run, the decomposition session commits the generated implementation-set spec, after which the operator manually adds the `prerequisites:` block. The next action immediately opens a pull request without committing that edit. `Dabbler: Open PR for this set` pushes commits; it does not commit working-tree changes. It will therefore either refuse the dirty checkout or create a PR that omits the prerequisite. After merging, the worktree is cut from `main` without the prerequisite—the exact failure the instructions claim to prevent.
- **Details:**
  - **Violation:** The session requires Scene 5 to cover “prerequisites, its session,” with literal, performable actions. The tutorial itself says: “The prerequisite has to be on `main` before the worktree is cut, or the worktree gets a spec without it.”
  - **Impact:** The mandatory main-path script breaks late in the two-hour walk, or silently runs the implementation session from a spec missing its declared dependency. This materially defeats the prerequisite demonstration and makes the scene/checklist unperformable without operator improvisation.
  - **Evidence:**  
    - `docs/tutorials/video/scene-5-second-module.md`, Beat 11 manually edits the new implementation set’s `spec.md`; Beat 12 goes directly to `gh auth switch` and `Dabbler: Open PR for this set`, with no `git add` or `git commit`.  
    - `docs/tutorials/hello-world.md`, Part 5 step 6 has the same omission between adding `prerequisites:` and landing the branch.  
    - The UAT checklist, Walk 8 steps 4–5, likewise edits the spec and immediately opens the PR.  
    - Scene 4’s Open PR dialog explicitly lists only `git push` and `gh pr create`, confirming that Open PR does not commit the edit.
  - **Correct answer:** After adding the prerequisite, run `git add` for the implementation set’s `spec.md` and commit it before invoking `Dabbler: Open PR for this set`. Add the same literal commit step to the tutorial, Scene 5, and Walk 8.

#### NITS

- **Nit:** Checklist Walk 4 still unconditionally runs `git commit -m "docs: greeter plan and its implementation set"` even though the corrected tutorial and Scene 4 say to commit only when `git status --short` is non-empty. On the normal path the sessions already committed, so the checklist’s literal command exits with “nothing to commit.”
- **Nit:** `docs/tutorials/video/README.md` says the scripts “were dry-run end to end by a human,” while the checklist explicitly says they are “NOT YET WALKED.” That claim is currently false.
- **Nit:** Scene 3 Beat 6 calls both GitHub templates “comment-only,” and Scene 4 Beat 16 calls the adapted workflow run its first execution. The scaffolded workflow already has an active `push`/`pull_request` trigger and `test` job, and Scene 3 pushes it to `main`, so it executes before Beat 16.
- **Nit:** Walk 13 says “Eight of the nine scripts were executed beat by beat,” but scenes 1–6 plus the Azure DevOps alternate total seven walked scene scripts; the direct-API alternate is reviewed only. Scene 6 Beat 9 is also absent from Walks 9–10, so the claimed beat-by-beat coverage is not literal.