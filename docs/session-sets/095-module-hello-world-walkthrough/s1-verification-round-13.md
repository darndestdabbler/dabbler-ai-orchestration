ISSUES FOUND

## Issue 1: Fresh teammate clones cannot run the documented worktree commands

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough must be “copy-pasteable, runnable” for Priya, Sam, and Alex.
  - **Impact:** Sam’s Part 6 and Alex’s Part 9 commands fail because their fresh clones do not contain the ignored `.venv` created only on Priya’s machine. They cannot open their worktrees or run their sessions as instructed.
  - **Evidence:** Part 1 adds `.venv/` to `.gitignore`; Part 2 creates the environment on Priya’s machine; Part 5 has Sam and Alex clone the repository without installing `ai_router`; Parts 6 and 9 then invoke `.venv\Scripts\python.exe` or `.venv/bin/python`. An ignored, untracked virtual environment is not transferred by `git clone`.
  - **Correct answer:** After Sam and Alex clone, explicitly have each run **`Dabbler: Install ai-router`** or provide equivalent copy-pasteable environment installation commands, then verify the local `.venv` command works before opening a worktree.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Parts 1, 2, 5, 6, and 9.

## Issue 2: The hotfix is tagged and deployed before any documented test or CI run

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The tutorial promises a runnable guarded release workflow, but its hotfix drill publishes and deploys `v0.1.1` without validating the exact tagged snapshot.
  - **Impact:** A broken hotfix can be released to production before review or tests. Because the annotated tag is already pushed, review-requested corrections would require a new release tag rather than safely fixing the pending release.
  - **Evidence:** Part 10 commits the fix, immediately creates and pushes `v0.1.1`, says to deploy it, and only afterward opens the PR. It includes no local test command before tagging. The Part 7 workflow runs on pull requests and pushes to `main`; pushing `hotfix/greeting-typo` or `v0.1.1` does not trigger it because `push.branches` is restricted to `main`.
  - **Correct answer:** Run the complete test suite against the isolated hotfix commit before creating the immutable tag, or add a CI trigger that validates hotfix/tag commits and wait for it to pass. Then create and push `v0.1.1`, deploy it, and merge the fix forward to `main`.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 7 workflow trigger and Part 10 step 3.