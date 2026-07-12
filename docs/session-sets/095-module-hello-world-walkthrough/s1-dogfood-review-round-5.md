# Set 095 S1 dogfood ROUND 5 — after the round-4 verification fixes

> Re-run after the round-4 remediation: evidence gathering now includes
> dated branch tips (for-each-ref committerdate) and per-branch
> divergence counts, with Principles 1/7 capped at ADVISORY without
> age/drift evidence. Planted violation unchanged (004-greeter-polish,
> module greeter, edits services/clock/clock.py). Raw routed output below.

---

# Module-Organized Workflow Review

This is a fantastic start to a module-organized workflow. The team has established excellent trunk hygiene, a robust CI process that correctly balances per-module and full-repo integration tests, and a textbook-perfect release tagging and hotfix process. The core area for improvement is in maintaining strict directory discipline within session-set branches, as there's one active example of scope creep that needs to be addressed.

### 1. Trunk Hygiene — PASS
*   **Evidence:** The `git branch -a` command shows that `main` and a single, active feature branch (`session-set/004-greeter-polish`) are the only branches in the repository. Dated branch tips show both branches were updated on the same day (`2026-07-12`), and the divergence count for the feature branch is minimal (`0` behind, `1` ahead). The `git log` shows a healthy pattern of frequent, small merges into `main`.
*   **Coaching:** Excellent work. Keeping the branch structure this clean is key to avoiding integration pain. Continue this practice of creating short-lived branches and merging them promptly to `main`.

### 2. Name Uniqueness & `module:` Correctness — PASS
*   **Evidence:** All session sets under `docs/session-sets/` have a unique name (`001-greeter-hello`, `002-clock-hello`, etc.). Each corresponding `spec.md` file contains a `module:` stamp whose value (`greeter`, `clock`, `integration`) is a valid module slug defined in `docs/modules.yaml`.
*   **Coaching:** This is great. Proper stamping ensures every piece of work is clearly owned and its scope can be validated, which is the foundation of this workflow.

### 3. Directory Discipline vs `codeRoots` — FAIL
*   **Evidence:** The branch `session-set/004-greeter-polish` violates the principle. Its session set (`004-greeter-polish`) is owned by the `greeter` module (`docs/session-sets/004-greeter-polish/spec.md`). The `greeter` module's declared `codeRoots` is `['services/greeter']` and it has no `touches` list (`docs/modules.yaml`). However, the diff (`git diff main...session-set/004-greeter-polish --name-only`) shows a change to `services/clock/clock.py`, which is outside the `greeter` module's scope.
*   **Coaching:** It's important to keep changes strictly within a module's declared boundaries. If a `greeter` session set needs to change `clock` code, that work should be planned in a separate set owned by the `clock` module, or as part of a larger change owned by the `integration` module, which explicitly `touches` both.

### 4. Integration `touches` & Owner Review — ADVISORY
*   **Evidence:** The `integration` module correctly declares `touches: [greeter, clock]` in `docs/modules.yaml`. The `.github/CODEOWNERS` file provides correct coverage by assigning the owners of all three modules (`@alex-gh @priya-gh @sam-gh`) to the `services/integration/` path. However, PR review data from `gh pr list` was not available in the evidence bundle. Without it, we can confirm the *intent* to review but not that reviews were completed.
*   **Coaching:** The setup for cross-module work is perfect in `modules.yaml` and `CODEOWNERS`. This makes intent clear and enables automated review requests. To move from `ADVISORY` to `PASS`, we would need to see evidence of completed reviews on a PR, such as output from the `gh pr list` command or a screenshot of GitHub's review panel.

### 5. CODEOWNERS Coverage — PASS
*   **Evidence:** Every `codeRoot` (`services/greeter`, `services/clock`, `services/integration`) and documentation path (`docs/modules/greeter`, etc.) from `docs/modules.yaml` has a corresponding, active rule in `.github/CODEOWNERS`. Critical shared files like `docs/modules.yaml` and `.github/` are also correctly owned by all module owners.
*   **Coaching:** This is textbook execution. Complete ownership coverage ensures that no code change can be proposed without automatically looping in the correct subject matter experts for review.

### 6. Tag Correctness / Production-as-a-Tag — PASS
*   **Evidence:** The tags `v0.1.0` and `v0.1.1` are annotated tags (`objecttype` `tag`), not lightweight ones (`git for-each-ref`). The `git log` graph shows that the hotfix for `v0.1.1` was correctly branched from the commit tagged `v0.1.0`. The range log (`git log --oneline v0.1.0..v0.1.1`) confirms that the hotfix tag contains only the intended fix commit (`dad0f9b fix(greeter): capitalize World...`), and nothing else from `main`.
*   **Coaching:** This is an outstanding example of a disciplined release and hotfix process. Using annotated tags that point to the exact commit being released (especially for hotfixes) provides a reliable audit trail and prevents accidental inclusion of unreleased work. Keep this up.

### 7. Integration-Bomb Symptoms — PASS
*   **Evidence:** There are no signs of deferred integration. The `git branch` and dated branch tip evidence shows only one active, very recent feature branch. The CI configuration in `.github/workflows/monorepo-ci.yml` includes an `all-modules` job that runs unconditionally on every push to the `main` branch, ensuring the entire codebase is validated immediately upon merge.
*   **Coaching:** The combination of short-lived branches and a mandatory, all-modules integration job on `main` is the best defense against integration problems. This proactive validation is a huge strength of your current workflow.

---

### Top 3 Next Actions

1.  **Address the scope violation**: In the `session-set/004-greeter-polish` branch, move the changes for `services/clock/clock.py` into a separate branch and session set owned by the `clock` module.
2.  **Reinforce directory discipline in review**: During code reviews, make it a standard checklist item to verify that a branch's changes are confined to the owning module's `codeRoots` (or sanctioned `touches` paths).
3.  **Enable PR review evidence**: Set up the `gh` CLI in your environment. This will allow future workflow reviews to confirm not just that owners are assigned, but that they are actively reviewing and approving cross-module changes as intended.
