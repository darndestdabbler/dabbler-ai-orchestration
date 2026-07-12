# Set 095 S1 dogfood — review prompt vs planted-violation scratch repo

> Scratch repo: hello-modules (built to the walkthrough's end-state; planted
> violation: set 004-greeter-polish, module greeter, edits services/clock/clock.py
> on its in-flight session-set branch). Raw routed output below.

---

# Module-Organized Workflow Review

Your team has established a very strong foundation for a healthy module-organized workflow. The adherence to trunk-based development, comprehensive CI, and correct release tagging is excellent and sets you up for success. The key area to focus on now is tightening directory discipline to ensure module boundaries are consistently respected, which will prevent unexpected side effects as the codebase grows.

### 1. Trunk Hygiene — PASS
*   **Evidence:** The `git branch -a` output shows `main` is the primary branch, with only one active, short-lived branch (`session-set/004-greeter-polish`). The `git log` shows a healthy pattern of frequent, small merges into `main` (e.g., `8e0e5e5 Merge PR #3`, `1143e3a Merge PR #2`).
*   **Coaching:** Excellent work. Maintaining `main` as the single source of truth and using short-lived branches is the cornerstone of this workflow and you're doing it perfectly.

### 2. Name Uniqueness & `module:` Correctness — PASS
*   **Evidence:** All session sets found in `docs/session-sets/` have a `spec.md` file containing a `module:` stamp whose value corresponds to a valid module `slug` in `docs/modules.yaml`. (e.g., `docs/session-sets/001-greeter-hello/spec.md` correctly specifies `module: greeter`).
*   **Coaching:** This is great. Proper stamping ensures every piece of work is correctly attributed to a module owner and its scope can be validated.

### 3. Directory Discipline vs `codeRoots` — FAIL
*   **Evidence:** The branch `session-set/004-greeter-polish` violates module boundaries. Its session set is owned by the `greeter` module (`docs/session-sets/004-greeter-polish/spec.md`), whose `codeRoots` is defined as `['services/greeter']` in `docs/modules.yaml`. However, the diff (`git diff main...session-set/004-greeter-polish --name-only`) shows a modification to `services/clock/clock.py`, which belongs to the `clock` module.
*   **Coaching:** This is the most critical issue to address. Unintended cross-module changes can lead to surprising regressions. The change to `services/clock/clock.py` should be reverted from this branch and moved into a new session set owned by the `clock` module.

### 4. Integration `touches` & Owner Review — ADVISORY
*   **Evidence:** The team correctly used this pattern for session set `003-integration-compose`. The owning `integration` module declares `touches: [greeter, clock]` in `docs/modules.yaml`, and the merge commit log (`8e0e5e5`) indicates the correct owners reviewed it. However, the violation in `session-set/004-greeter-polish` (a `greeter`-owned set touching `clock` code) occurred because the `greeter` module lacks a `touches: [clock]` declaration, and the change was made anyway.
*   **Coaching:** You've demonstrated you understand how to declare intentional integrations. Now, let's apply that discipline consistently. Any work that needs to touch another module's code must be owned by a module that explicitly declares that dependency via `touches`.

### 5. CODEOWNERS Coverage — PASS
*   **Evidence:** Every `codeRoot` and `docs/modules/<slug>/` path declared in `docs/modules.yaml` has a corresponding active rule in `.github/CODEOWNERS`. Critical shared files like `docs/modules.yaml` and `.github/` are also correctly owned by all module owners.
*   **Coaching:** Fantastic. This complete coverage ensures that no code change can be merged without review from the appropriate module owner, which is a vital safety net.

### 6. Tag Correctness / Production-as-a-Tag — PASS
*   **Evidence:** The output from `git for-each-ref` shows that `v0.1.0` and `v0.1.1` are annotated tags (`objecttype` is `tag`), not lightweight commits. The `git log` also shows a hotfix (`6c82693`) was correctly branched from `v0.1.0` and merged back to `main`, demonstrating a robust release and hotfix process.
*   **Coaching:** This is textbook execution. Using annotated tags for releases creates a permanent, trustworthy record of what was deployed, which is invaluable for debugging and hotfixes.

### 7. Integration-Bomb Symptoms — PASS
*   **Evidence:** The CI configuration (`.github/workflows/monorepo-ci.yml`) includes an `all-modules` job that runs unconditionally on every push to the `main` branch. The branch list (`git branch -a`) is clean, showing only one active feature branch, with no "convoy" of unmerged work piling up.
*   **Coaching:** Your CI setup is ideal. Running a full integration test on every merge to `main` is the best way to catch integration issues immediately, preventing the pain of a large, deferred "integration bomb."

---

### Top 3 Next Actions

1.  **Fix Scope Violation**: For branch `session-set/004-greeter-polish`, move the change in `services/clock/clock.py` to a new, separate session set owned by the `clock` module. This reinforces the rule that only a module's owner can change its code.
2.  **Formalize Discipline in Review**: Add a checkbox to your Pull Request template: "I have verified that all changed files are within the owning module's `codeRoots` or are covered by an explicit `touches` declaration."
3.  **Clarify the `touches` Rule**: Reinforce with the team that *any* cross-module change requires its parent module to have a `touches` declaration in `docs/modules.yaml`. Small, "harmless" edits are the most common source of future scope creep.
