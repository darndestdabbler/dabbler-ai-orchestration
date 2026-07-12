ISSUES FOUND

## Issue 1: The `changes` job denies `actions/checkout` the repository permission it requires

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task requires a “copy-pasteable, runnable” walkthrough with functioning path-scoped CI.
  - **Impact:** The `changes` job can fail at `actions/checkout@v4`, blocking every PR once `changes` becomes a required check. GitHub sets every unspecified `GITHUB_TOKEN` permission to `none` when a job declares any explicit permission, so granting only `pull-requests: read` removes `contents: read`.
  - **Evidence:** The complete workflow in `docs/tutorials/module-team-hello-world.md` Part 7 defines:
    ```yaml
    changes:
      permissions:
        pull-requests: read
      steps:
        - uses: actions/checkout@v4
    ```
    `actions/checkout` requires repository-content access, particularly for private repositories, but this job explicitly provides none.
  - **Correct answer:** Grant both permissions:
    ```yaml
    permissions:
      contents: read
      pull-requests: read
    ```
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 7 step 2, `changes` job.
- **Fix:** Add `contents: read` to the job’s permissions and validate the complete workflow with GitHub Actions or an appropriate workflow checker.

## Issue 2: Every path-scoped required check can pass without executing a test

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The tutorial claims each module PR “is tested before merge” and must provide runnable path-scoped CI.
  - **Impact:** `unittest discover` exits successfully when it discovers zero tests. A module PR can therefore receive a green required check despite having no discoverable tests—for example, when an AI omits the promised test or places it under a non-package nested directory. The all-modules guardrail runs only after merge, so it cannot prevent that untested PR from landing.
  - **Evidence:** All three PR jobs run only:
    ```yaml
    python -m unittest discover -s services/<module> -v
    ```
    Unlike the later `all-modules` job, none checks that at least one test was collected. The walkthrough requires “a unit test” but does not prescribe a file/package layout that guarantees discovery.
  - **Correct answer:** Give each module job a deterministic test layout or runner and fail when `countTestCases()` is zero, while also failing on ordinary test failures.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 7 step 2, `greeter`, `clock`, and `integration` jobs.
- **Fix:** Add a nonzero-test assertion to every path-scoped job or prescribe and validate an explicit test layout that cannot produce a vacuous green check.