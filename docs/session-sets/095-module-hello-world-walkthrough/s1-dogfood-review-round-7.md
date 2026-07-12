# Set 095 S1 dogfood ROUND 7 — after the verification R9 fixes

> Re-run on the rebuilt scratch repo carrying the complete final
> monorepo-ci.yml (three path-scoped module jobs + the never-vacuously-
> green all-modules guardrail that iterates module dirs and fails on
> zero tests). Planted violation unchanged (004-greeter-polish, module
> greeter, edits services/clock/clock.py). Raw routed output below.

---

# Module-Organized Workflow Review

This is a fantastic start to a module-organized workflow. The team shows strong discipline in its trunk hygiene, configuration files, CI setup, and release tagging process. These are the foundational pillars of a healthy monorepo. The primary area for growth is in consistently enforcing directory discipline on feature branches, which will ensure module boundaries remain clear and prevent unintended coupling.

### 1. Trunk Hygiene — PASS
*   **Evidence:** The repository has a single long-lived branch, `main`. The only other branch, `session-set/004-greeter-polish`, is new (`2026-07-12T12:52:09-04:00`) and has minimal divergence from `main` (1 commit ahead). The `git log` shows a clean history of feature branches being merged to `main` and a hotfix being correctly applied and merged back.
*   **Coaching:** Excellent work. Maintaining a clean trunk with short-lived branches is the single most important practice for reducing integration friction. Keep it up.

### 2. Name Uniqueness & `module:` Correctness — PASS
*   **Evidence:** All four session sets found in `docs/session-sets/` (`001-greeter-hello`, `002-clock-hello`, `003-integration-compose`, `004-greeter-polish`) contain a `spec.md` file. Each `spec.md` has a `module:` stamp whose value (`greeter`, `clock`, `integration`) is a valid module `slug` declared in `docs/modules.yaml`.
*   **Coaching:** Great job on stamping every session set. This explicit ownership is crucial for tracking work, scoping CI, and routing code reviews correctly.

### 3. Directory Discipline vs `codeRoots` — FAIL
*   **Evidence:** The branch `session-set/004-greeter-polish`, which implements session set `004-greeter-polish`, is owned by the `greeter` module. The `greeter` module's declared `codeRoots` in `docs/modules.yaml` is `services/greeter`. However, the diff against `main` shows a modification to `services/clock/clock.py`, which is outside the `greeter` module's scope and is not sanctioned by a `touches` declaration.
*   **Coaching:** This is a scope violation. When a module's branch modifies another module's code, it creates a hidden dependency that undermines the purpose of clear boundaries. The work affecting the `clock` module should be moved to a separate session set owned by a module that explicitly `touches: [clock]` (like the existing `integration` module).

### 4. Integration `touches` & Owner Review — ADVISORY
*   **Evidence:** The `integration` module correctly declares `touches: [greeter, clock]` in `docs/modules.yaml`. The corresponding `CODEOWNERS` rule for `services/integration/` correctly lists the owners of all three modules (`@alex-gh @priya-gh @sam-gh`), ensuring proper review coverage. However, evidence of completed reviews is unavailable because the `gh pr list` command failed ("no git remotes found").
*   **Coaching:** The configuration for cross-module work is set up perfectly. The `touches` list and the `CODEOWNERS` file work together to make the dependency explicit. To move from `ADVISORY` to `PASS`, we need to see evidence that the touched owners actually approve these PRs, which can be gathered by configuring the `gh` CLI or checking the PR review history on the hosting platform.

### 5. CODEOWNERS Coverage — PASS
*   **Evidence:** All declared `codeRoots`, module documentation folders, and shared files have clear ownership defined in `.github/CODEOWNERS`. There are no broad, trailing rules that override the more specific module rules.
    *   `services/greeter/` is owned by `@priya-gh`.
    *   `services/clock/` is owned by `@sam-gh`.
    *   `services/integration/` is owned by `@alex-gh @priya-gh @sam-gh`.
    *   `docs/modules.yaml` and `.github/` are correctly owned by all module owners.
*   **Coaching:** This is a well-maintained `CODEOWNERS` file. Complete and correct coverage ensures that no code change can be merged without the right experts being involved in the review.

### 6. Tag Correctness / Production-as-a-Tag — PASS
*   **Evidence:** The repository uses annotated tags (`objecttype: tag`) for releases (`v0.1.0`, `v0.1.1`), which is the correct practice. The hotfix release `v0.1.1` was created correctly: the tag points directly to the fix commit (`1581faa`), and the range log (`git log v0.1.0..v0.1.1`) confirms that only the intended fix was included in the release, with no unrelated work from `main`.
*   **Coaching:** This is exemplary release and hotfix management. By tagging the exact fix commit, you ensure your releases contain precisely what you intend them to, which is critical for stability and auditing.

### 7. Integration-Bomb Symptoms — PASS
*   **Evidence:** There is no evidence of deferred integration. There are no stale or long-running feature branches; the single active branch is very new. Furthermore, the CI configuration in `.github/workflows/monorepo-ci.yml` includes an `all-modules` job that is configured to run unconditionally on every push to `main`, ensuring the entire codebase is validated continuously.
*   **Coaching:** The combination of short-lived branches and a CI job that tests the fully integrated product on `main` is the perfect defense against the "integration bomb." This practice keeps the codebase healthy and deployable at all times.

---

### Top 3 Next Actions

1.  **Add a scope check to code reviews**: For all new pull requests, make it a required checklist item for the reviewer to confirm that the changed files are within the owning module's declared scope (`codeRoots` plus any `touches` declarations). This will prevent scope bleed violations like the one currently on branch `004-greeter-polish`.
2.  **Resolve the scope violation in `session-set/004-greeter-polish`**: Address the out-of-bounds change to `services/clock/clock.py`. Either revert that change or move the work into a new session set owned by the `integration` module, which is properly configured to touch the `clock` module.
3.  **Enable PR review data collection**: Configure the repository with a `git remote` and authenticate the `gh` CLI. This will allow gathering data on completed code reviews, which is necessary to fully validate that the `touches` and `CODEOWNERS` policies are being enforced in practice (Principle 4).
