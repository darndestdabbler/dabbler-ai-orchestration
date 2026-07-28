ISSUES FOUND

- **Issue 1: Four AI-led lifecycle sets still run in the primary checkout instead of worktrees**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every reader following Parts 4–5 runs the `greeter` and `app` plan/decomposition sessions directly in the primary checkout after merely switching it to an `authoring/*` branch. An interrupted or dirty session therefore occupies the checkout intended for synchronized `main` operations, and the tutorial teaches the exact workflow the required worktree isolation was meant to prevent. This is certain on the documented path, not an edge case.
  - **Details:**
    - **Violation:** The authoritative design calls worktree isolation load-bearing: “Each AI work set runs in a worktree so its changes are isolated from `main`,” and warns that omitting it teaches readers to let AI sessions modify the trunk checkout.
    - **Impact:** Four of the six demonstrated AI sessions bypass the central isolation habit. A non-trunk branch protects `main`’s history, but it is not semantically equivalent to preserving the primary checkout on `main` in a separate folder while the AI works.
    - **Evidence:** `docs/tutorials/hello-world.md`, Part 4 creates `authoring/greeter-lifecycle` in the primary checkout and runs both lifecycle sets there. Part 5 repeats this with `authoring/app-lifecycle`. Only implementation sets use `ai_router.worktree open`.
    - **Location:** `docs/tutorials/hello-world.md`, Part 4 before steps 1–2 and Part 5 step 6.
    - **Fix:** Run each plan and decomposition set in its own worktree, merge and finalize it before opening the dependent set’s worktree, then open the implementation worktree from synchronized `main`.

- **Issue 2: The flagship tutorial materially exceeds its explicit size acceptance criterion**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every reader, S3 scene-script author, and S4 operator receives a 342-line tutorial rather than the required approximately 240-line walkthrough. The document is over 31% above the explicit maximum, materially preserving the complexity this set was created to remove and expanding every subsequent scene and live-walk task.
  - **Details:**
    - **Violation:** The session’s end condition requires “one tutorial ≤ ~260 lines,” while the authoritative design targets approximately 240 source lines.
    - **Impact:** This is not approximation-level drift: 82 lines beyond the ceiling materially misses the session’s primary simplification objective and should change the merge decision.
    - **Evidence:** The supplied complete diff adds `docs/tutorials/hello-world.md` as a 342-line file (`@@ -0,0 +1,342 @@`). The disposition’s claim of 314 lines is stale and does not match the actual deliverable.
    - **Location:** `docs/tutorials/hello-world.md`.
    - **Fix:** Reduce the tutorial to approximately 260 lines without removing performability requirements, primarily by consolidating repeated branch/PR mechanics, variant prose, and explanatory narration.

#### NITS

- **Nit:** `docs/tutorials/release-and-recovery.md` gives the required hotfix-validation loop only in Bash syntax, although the primary installation path is Windows/`winget`; provide a PowerShell equivalent or explicitly require Git Bash.
- **Nit:** Part 5 says the generated `app` implementation row “shows as blocked” until the greeter set completes, but the greeter set completed before `app` was created, so the row should already be unblocked.
- **Nit:** The final checklist supplies only the Windows worktree-list command despite explicitly supporting macOS/Linux earlier.