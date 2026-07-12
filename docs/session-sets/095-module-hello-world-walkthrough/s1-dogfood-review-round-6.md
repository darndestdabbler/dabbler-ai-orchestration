# Set 095 S1 dogfood ROUND 6 — after the verification R7/R8 fixes

> Re-run with the recipe's latest gathering: policy files read from the
> resolved review base commit (git show, one coherent state), commit-id
> remote dedupe, branch-added specs gathered from their branches, and
> the guarded all-modules CI teaching. Planted violation unchanged
> (004-greeter-polish, module greeter, edits services/clock/clock.py).
> Raw routed output below.

---

# Module-Organized Workflow Review

This repository shows a strong and disciplined adoption of the module-organized workflow. The team's trunk hygiene, CI setup, and release tagging process are excellent examples of trunk-based development done right. The key area for improvement is in maintaining strict directory discipline on feature branches, where a minor scope violation was found. By addressing this, the team can fully realize the benefits of decoupled, parallel work.

### 1. Trunk Hygiene — PASS
*   **Evidence:** The `git branch -a` command shows only `main` and a single, active feature branch (`session-set/004-greeter-polish`). Branch tip data confirms both are recent (`2026-07-12`). The `git log` graph shows a clean history of frequent, small merges to `main`, which is the sole long-lived branch.
*   **Coaching:** Excellent work. Keeping the branch structure this clean is fundamental to trunk-based development. It minimizes merge conflicts and keeps the integration pipeline flowing smoothly. Keep it up.

### 2. Name Uniqueness & `module:` Correctness — PASS
*   **Evidence:** All four session sets found in `docs/session-sets/` (`001-greeter-hello`, `002-clock-hello`, `003-integration-compose`, `004-greeter-polish`) contain a `spec.md` with a `module:` stamp whose value is a valid slug from `docs/modules.yaml`.
*   **Coaching:** Great job on this foundational step. Correctly stamping every session set ensures that all work is properly attributed to a module, which is essential for tooling, ownership, and CI.

### 3. Directory Discipline vs `codeRoots` — FAIL
*   **Evidence:** The branch `session-set/004-greeter-polish` violates directory discipline. This branch's work belongs to session set `004-greeter-polish`, which is stamped `module: greeter` in its `spec.md`. The `greeter` module's `codeRoots` are defined as `services/greeter`. However, the diff (`git diff main...session-set/004-greeter-polish --name-only`) shows a modification to `services/clock/clock.py`, a path owned by the `clock` module. The `greeter` module manifest does not declare `touches: [clock]` to sanction this change.
*   **Coaching:** This cross-module change is a scope violation. The purpose of this workflow is to make such dependencies explicit. The fix is to either (a) move the change to `services/clock/clock.py` into its own session set owned by the `clock` module, or (b) re-scope this work to an integration module that explicitly `touches` both `greeter` and `clock`.

### 4. Integration `touches` & Owner Review — ADVISORY
*   **Evidence:** The `integration` module correctly declares `touches: [greeter, clock]` in `docs/modules.yaml`. The corresponding `CODEOWNERS` rule (`services/integration/ @alex-gh @priya-gh @sam-gh`) correctly lists the owners for the integration module (`@alex-gh`), `greeter` (`@priya-gh`), and `clock` (`@sam-gh`), ensuring proper coverage. However, evidence of completed reviews is unavailable as the `gh pr list` command failed (`no git remotes found`).
*   **Coaching:** The configuration for integration work is perfect. You've made the dependency explicit and set up the ownership map correctly. To move from advisory to a full pass, we need to confirm that these owners are required to review and are actually approving the changes. This can be verified with access to PR history or by configuring branch protection rules on your git host.

### 5. CODEOWNERS Coverage — PASS
*   **Evidence:** All `codeRoots` (`services/greeter/`, `services/clock/`, `services/integration/`), module documentation paths (`docs/modules/*/`), and shared files (`docs/modules.yaml`, `.github/`) have a corresponding rule in `.github/CODEOWNERS`. There are no later, broader rules that override these specific ownership assignments. For example, `services/greeter/` correctly resolves to its final and effective owner `@priya-gh`.
*   **Coaching:** This is a well-written `CODEOWNERS` file. The coverage is comprehensive, and the rule ordering is correct, ensuring every piece of the codebase has a clear owner who will be looped into changes.

### 6. Tag Correctness / Production-as-a-Tag — PASS
*   **Evidence:** Releases `v0.1.0` and `v0.1.1` are annotated tags, confirmed by `git for-each-ref` (`objecttype` is `tag`). The hotfix for `v0.1.1` demonstrates ideal practice: the log (`git log v0.1.0..v0.1.1`) shows it contains only the single intended fix commit (`dad0f9b`), and ancestry checks confirm it was correctly branched from `v0.1.0`.
*   **Coaching:** This is a textbook-perfect release and hotfix process. Using annotated tags that point to the exact state of the release provides a reliable audit trail and enables safe, targeted hotfixes without accidentally shipping unrelated work from `main`.

### 7. Integration-Bomb Symptoms — PASS
*   **Evidence:** There is no "merge convoy" of waiting branches; `git branch -a` shows only one active session-set branch. The `monorepo-ci.yml` workflow includes an `all-modules` job that runs unconditionally on every push to the `main` branch, ensuring the entire codebase is validated upon integration.
*   **Coaching:** The combination of short-lived branches and a mandatory, all-modules CI job on `main` is the best defense against the dreaded "integration bomb." This practice ensures that integration issues are found immediately, on the commit that caused them.

---

### Top 3 Next Actions

1.  **Address the Scope Violation**: Re-scope the work on branch `session-set/004-greeter-polish` to respect module boundaries. This reinforces the core discipline of the workflow.
2.  **Add Scope Checks to Code Review**: Update your PR template or team checklist to include an explicit step: "Verify that all file changes are within the owning module's `codeRoots` (or are sanctioned by a `touches` declaration)."
3.  **Confirm Review Enforcement**: Gain access to PR history (e.g., via the `gh` CLI) or configure branch protection rules to verify that the owners defined in `CODEOWNERS` are required to approve changes before merging. This will harden the review process.
