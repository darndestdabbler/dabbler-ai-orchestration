# Set 095 S1 dogfood ROUND 8 — after the verification R10 fixes

> Re-run after P6 gained the production-target rule: with no
> tag-triggered deploy workflow in the scratch repo, P6 is EXPECTED to
> return ADVISORY (mechanics reported, production-target unevidenced) —
> the honest-cap behavior, not a regression. Planted violation
> unchanged (004-greeter-polish, module greeter, edits
> services/clock/clock.py). Raw routed output below.

---

# Module-Organized Workflow Review

This is a great start to a well-disciplined monorepo workflow. The team's trunk hygiene, CI setup, and release tagging mechanics are exemplary and provide a solid foundation for clean, continuous integration. The primary area for improvement is in enforcing directory discipline on session-set branches to prevent unintended cross-module changes, which is the core goal of this workflow.

### 1. Trunk Hygiene — PASS
*   **Evidence:** `git branch -a` shows only `main` and a single, active feature branch (`session-set/004-greeter-polish`). The `git log` shows a clean history of frequent, small merges to `main`. Dated branch tips (`2026-07-12T...`) confirm that no stale branches exist.
*   **Coaching:** Excellent work. Maintaining `main` as the single source of truth and keeping feature branches short-lived is the key to avoiding integration pain. Keep this up.

### 2. Name Uniqueness & `module:` Correctness — PASS
*   **Evidence:** All session sets (`001-greeter-hello`, `002-clock-hello`, `003-integration-compose`, `004-greeter-polish`) have a `spec.md` file containing a `module:` stamp. Each stamp (`greeter`, `clock`, `integration`) corresponds to a valid module `slug` declared in `docs/modules.yaml`.
*   **Coaching:** Perfect. This consistent stamping ensures every piece of work has a clear owner and scope, which is fundamental to tracking work and ownership in the monorepo.

### 3. Directory Discipline vs `codeRoots` — FAIL
*   **Evidence:** The branch `session-set/004-greeter-polish` violates directory discipline.
    *   The session set `004-greeter-polish` is owned by the `greeter` module (`docs/session-sets/004-greeter-polish/spec.md`).
    *   The `greeter` module's declared `codeRoots` is `services/greeter` (`docs/modules.yaml`) and it has no `touches` declaration.
    *   The diff (`git diff main...session-set/004-greeter-polish --name-only`) shows a change to `services/clock/clock.py`, which is outside the `greeter` module's allowed scope.
*   **Coaching:** This is a scope bleed, where work for one module modifies the code of another without explicit permission. To fix this, the change to `services/clock/clock.py` should be moved to its own session set owned by the `clock` module. Catching this during code review is the most important guardrail for this workflow.

### 4. Integration `touches` & Owner Review — ADVISORY
*   **Evidence:** The `integration` module correctly declares `touches: [greeter, clock]` in `docs/modules.yaml`. The `CODEOWNERS` file correctly assigns all three module owners to `services/integration/`, ensuring coverage for the touched modules. However, PR review data was unavailable (`gh pr list` failed: `no git remotes found`). The merge commit message for PR #3 mentions reviews, but this is not verifiable proof.
*   **Coaching:** The configuration for integration work is set up perfectly. The `touches` declaration and `CODEOWNERS` coverage are exactly right. To move from `ADVISORY` to `PASS`, we need to confirm that code owners are not just listed but are required to approve PRs via repository branch protection rules.

### 5. CODEOWNERS Coverage — PASS
*   **Evidence:** All declared `codeRoots` and documentation paths have clear, effective ownership with no overrides.
    *   `services/greeter/` is owned by `@priya-gh`.
    *   `services/clock/` is owned by `@sam-gh`.
    *   `services/integration/` is owned by `@alex-gh @priya-gh @sam-gh`.
    *   Shared files like `docs/modules.yaml` and `.github/` are correctly owned by all three.
    The rules are ordered from most specific to most general, avoiding common "last-match-wins" pitfalls.
*   **Coaching:** This `CODEOWNERS` file is a model of clarity and correctness. It precisely maps the ownership defined in `docs/modules.yaml` to paths in the repository, ensuring changes are always routed to the right experts.

### 6. Tag Correctness / Production-as-a-Tag — ADVISORY
*   **Evidence:** Tag mechanics are excellent. `git for-each-ref` confirms that `v0.1.0` and `v0.1.1` are annotated tags (`objecttype: tag`). The log (`git log --oneline v0.1.0..v0.1.1`) shows that the `v0.1.1` hotfix contains only the intended fix commit. The git graph shows it was correctly branched from `v0.1.0` and merged back to `main`. However, there is no evidence (e.g., a `on: push: tags:` workflow in `.github/workflows/monorepo-ci.yml`) that production deployments are triggered from these tags.
*   **Coaching:** Your tagging and hotfix process is technically perfect. To make this process fully robust, connect it to your deployment pipeline. A CI/CD job that automatically deploys on the creation of a `v*` tag would provide definitive proof that "production is a tag," closing the loop on a fully auditable release process.

### 7. Integration-Bomb Symptoms — PASS
*   **Evidence:** The repository shows no signs of deferred integration. There is only one active, recent branch besides `main`. The `git log` shows a steady rhythm of merges. Crucially, `.github/workflows/monorepo-ci.yml` contains an `all-modules` job that runs unconditionally on every push to `main`, ensuring the entire codebase is tested together continuously.
*   **Coaching:** This is the payoff for good trunk-based discipline. By merging small changes often and validating the entire system on every merge to `main`, the team completely avoids the "integration bomb" that plagues teams with long-lived branches.

---

### Top 3 Next Actions

1.  **Fix the Directory Discipline Violation**: Address the scope bleed in the `session-set/004-greeter-polish` branch by moving the change in `services/clock/clock.py` to a new session set owned by the `clock` module. Reinforce this principle in code reviews going forward.
2.  **Connect Deployments to Tags**: Add a deployment job to your CI workflow that triggers when a new version tag (e.g., `v*.*.*`) is pushed. This will make releases auditable and ensure what's tested is what's deployed.
3.  **Confirm Branch Protection Rules**: While `CODEOWNERS` is set up correctly, verify in your repository settings that branch protection is enabled for `main` and requires review from Code Owners before merging. This enforces the ownership you've so carefully defined.
