ISSUES FOUND

## Issue 1: Sam’s and Alex’s authoring PR workflow is not runnable as written

- **Category:** Completeness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough must be “copy-pasteable, runnable” and teach small PRs to protected `main`.
  - **Impact:** Sam and Alex create plans and session sets while still on `main`, but the tutorial never gives either person the commands to create, commit, and push an authoring branch. A literal follower therefore cannot open the required PR; attempting to push the changes from `main` is rejected by the protection configured in Part 3. Sam’s cleanup command also references `<your-authoring-branch>`, although no branch was ever named or created.
  - **Evidence:** Part 5 instructs Sam only to “Land the plan + set on `main` as a small PR (branch, push, teammate approves, merge)” and Alex to land his work “like Sam did.” Unlike Parts 4 and 7, neither path supplies `git switch -c`, `git add`, `git commit`, or `git push` commands.
  - **Correct answer:** Give Sam and Alex explicit, distinct authoring branch sequences, including commit, push, browser approval/merge, synchronization, local deletion, and pruning.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 5 steps 1–2.
- **Fix:** Add complete commands using names such as `authoring/002-clock-hello` and `authoring/003-integration-compose`, then include the existing post-merge synchronization and cleanup steps.

## Issue 2: The “all-modules” guardrail ignores declared modules whose directories are entirely absent

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** Part 7 claims that the `all-modules` job tests the entire integrated codebase, that “every module must be tested,” and that the workflow cannot go green while testing nothing relevant.
  - **Impact:** A module implementation PR can omit its entire promised `services/<module>/` directory and still merge green. Its path filter remains false, so its required module job is skipped; afterward, `all-modules` iterates only directories that happen to exist and never notices the missing declared module. This leaves a false-green trunk despite `docs/modules.yaml` declaring the omitted module.
  - **Evidence:** The guardrail derives its universe solely from:
    ```bash
    dirs=(services/*/)
    ```
    It fails for an empty `services/` and for zero tests inside an existing directory, but never compares those directories with the declared `greeter`, `clock`, and `integration` `codeRoots`. For example, if only `services/greeter/` exists, the job tests greeter and exits successfully without detecting that `services/clock/` or `services/integration/` is absent.
  - **Correct answer:** Add a staged but explicit completeness check. For example, create testable placeholders for all declared module directories before activating the guardrail, or add a final hardening step that validates every declared `codeRoot` exists and collects tests once implementation rollout is complete.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 7 step 2, `all-modules` job.
- **Fix:** Validate the expected module list rather than only globbing existing directories, while explicitly handling the tutorial’s intentional incremental rollout.