ISSUES FOUND

## Issue 1: The all-modules guardrail can skip an untested module and still pass

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough promises an **“all-modules guardrail”** that tests the entire integrated codebase and says the job iterates module directories “with the same count guard.” A green job must not omit one module merely because other modules have tests.
  - **Impact:** If one module has zero discoverable tests while another has tests, the zero-test module is silently skipped and the aggregate job succeeds. This produces a false-green integration result despite claiming that all modules were tested.
  - **Evidence:** In `docs/tutorials/module-team-hello-world.md`, Part 7, the loop runs a module only when its count is positive:
    ```bash
    if [ "$n" -gt 0 ]; then
      total=$((total + n))
      python -m unittest discover -s "${d%/}" -v
    fi
    ```
    It fails only when the aggregate `total` is zero:
    ```bash
    if [ "$total" -eq 0 ]; then
      exit 1
    fi
    ```
    Therefore, counts such as `greeter=0`, `clock=1`, and `integration=1` produce a green job without running any greeter tests.
  - **Correct answer:** Fail inside the loop whenever any expected module directory collects zero tests, then run that module’s suite. Alternatively, iterate an explicit list of expected modules and require a positive test count for each one.

## Issue 2: The hotfix cleanup omits the required post-merge synchronization

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The tutorial must be **“copy-pasteable, runnable”** and its final checklist requires that no merged branches linger. Browser merges update `origin/main`, so local `main` must be pulled before deleting a branch with `git branch -d`.
  - **Impact:** Following Part 10 literally leaves local `main` stale and can make `git branch -d hotfix/greeting-typo` fail with “not fully merged.” The walkthrough therefore cannot reliably reach its promised clean end state.
  - **Evidence:** Part 10 says to merge the hotfix PR and immediately clean up with:
    ```bash
    git branch -d hotfix/greeting-typo
    ```
    Unlike Parts 4, 5, 7, 8, and 9, it provides no intervening:
    ```bash
    git switch main
    git pull --ff-only
    ```
    If the local checkout remains on the hotfix branch, deletion also fails because Git cannot delete the currently checked-out branch.
  - **Correct answer:** After the browser merge, explicitly run:
    ```bash
    git switch main
    git pull --ff-only
    git branch -d hotfix/greeting-typo
    git fetch --prune
    ```
    The walkthrough should also specify a merge strategy compatible with `-d`, or explain safe cleanup after a squash/rebase merge.