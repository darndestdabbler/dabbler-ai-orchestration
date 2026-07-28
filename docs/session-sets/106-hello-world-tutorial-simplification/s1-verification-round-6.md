ISSUES FOUND

- **Issue 1: Plan and decomposition sessions are run directly on protected `main`, without the required worktree/PR flow**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A typical reader enables branch protection exactly as instructed in Part 3, including preventing administrator bypass, then starts `003-greeter-plan` from the main checkout. The session commits its artifacts on `main` but cannot push them through the required session close because protected `main` rejects direct pushes. The reader cannot honestly reach the claimed **Complete** state or proceed cleanly to decomposition. The same failure recurs for Sam’s `app` plan and decomposition sets after protection requires both CI and another person’s approval.
  - **Details:**
    - **Violation:** The governing worktree requirement says, “Each AI work set runs in a worktree so its changes are isolated from `main`.” The tutorial itself also states, “From here on, every change reaches `main` through a pull request.”
    - **Impact:** The main tutorial path stalls at its first AI-led lifecycle session, before any implementation is produced. This materially defeats the tutorial’s core plan → decomposition → implementation objective.
    - **Evidence:** `docs/tutorials/hello-world.md`, Part 3 step 5 protects `main`; Part 4 steps 1–2 then run the plan and decomposition sets from the main VS Code window. The first worktree is not opened until Part 4 step 3, exclusively for the implementation set. Part 5 step 6 repeats the same direct-main lifecycle for `app`.
    - **Fix:** Run each plan and decomposition set on a non-trunk worktree/branch, open and merge its PR, finalize it, and synchronize `main` before starting the dependent set. Alternatively, delay branch protection until those lifecycle artifacts have landed, though that weakens the stated isolation requirement.

- **Issue 2: The manually added `app` prerequisite is never committed into the implementation worktree**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Sam follows Part 5 literally: after decomposition, he edits the generated implementation set’s `spec.md` in the main checkout, then opens an implementation worktree “exactly as in Part 4.” Git worktrees are created from committed `HEAD`; they do not copy an unstaged edit from another checkout. The tool may refuse the dirty checkout, or the new worktree receives the old spec without the prerequisite. Consequently, the implementation PR cannot preserve the required dependency and the main checkout remains dirty.
  - **Details:**
    - **Violation:** The authoritative design requires the `app` implementation set to declare the completed greeter set as a prerequisite.
    - **Impact:** A required teaching artifact is deterministically omitted from the committed repository, and the documented worktree/finalization flow may be blocked by the dirty main checkout.
    - **Evidence:** `docs/tutorials/hello-world.md`, Part 5 step 6 instructs the reader to edit the new set’s `spec.md`, then immediately run the implementation set in a worktree. There is no branch, `git add`, commit, push, PR, merge, or synchronization step between the edit and worktree creation.
    - **Fix:** Have the decomposition session generate the prerequisite using the actual greeter-set slug, or commit the edited spec on a non-trunk branch and merge/pull it before opening the implementation worktree.

#### NITS

- **Nit:** `docs/tutorials/hello-world.md` is 314 lines, materially above the explicit `≤ ~260` session target, although the overall reduction remains substantial.
- **Nit:** The final checklist gives only the Windows worktree-list command, while the release guide’s hotfix validation loop is Bash-only despite Windows being the primary installation path. Both have straightforward platform equivalents but should state them.