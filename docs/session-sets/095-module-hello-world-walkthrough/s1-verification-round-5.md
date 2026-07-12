# ISSUES FOUND

## Issue 1: Browser merges are not synchronized before subsequent local worktree operations

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough must be “copy-pasteable, runnable” and promises that completed sets visibly move to **Complete**. Part 8 says to merge the PR in GitHub and immediately run `worktree close`, then expects the main checkout’s Work Explorer to show the completed state.
  - **Impact:** A browser merge updates `origin/main`, not the local `main` checkout. Without pulling, the main workspace still contains the pre-session `session-state.json`, so the Work Explorer cannot show the merged set as **Complete**. Cleanup may also operate while local `main` does not contain the merged branch. The same synchronization gap affects Sam after landing `002` in Part 5 before he opens its worktree in Part 6.
  - **Evidence:** Part 4 correctly says “Merge, then `git pull` on `main`.” Parts 5 and 8 omit that synchronization. Part 8 proceeds directly from “Merge when green” to `python -m ai_router.worktree close 001-greeter-hello`, followed by the unsupported expectation that the set moves to **Complete**.
  - **Location:** `docs/tutorials/module-team-hello-world.md`, Part 5 step 1 and Part 8 steps 2–3.
  - **Fix:** After every browser merge that precedes local work, explicitly run:
    ```bash
    git switch main
    git pull --ff-only
    ```
    Do this before Sam opens `002` and before each owner closes a merged worktree or checks the Work Explorer state.

## Issue 2: The review prompt can falsely report CODEOWNERS coverage because it ignores last-match-wins semantics

- **Category:** Completeness
- **Severity:** Major
- **Details:**
  - **Violation:** The reusable review must provide evidence-based scoring for “CODEOWNERS coverage.” GitHub applies the **last matching CODEOWNERS pattern**, with later rules replacing—not adding to—the owners from earlier matches.
  - **Impact:** A repository can contain an apparently correct module-specific rule that is later overridden by a broad rule. The prompt’s current “has a corresponding active rule” test can therefore return `PASS` even though the module owner will not be requested and the effective coverage is wrong. That materially invalidates Principles 4 and 5.
  - **Evidence:** Principle 5 checks only whether every `codeRoot` “has an active rule,” while Principle 4 treats coverage as established when rules list the owners. Neither principle instructs the reviewer to resolve rules in file order or cite the final effective owners. The evidence script merely supplies the raw file and performs no effective-rule evaluation. For example:
    ```text
    services/greeter/ @greeter-team
    services/         @platform-team
    ```
    leaves `services/greeter/` effectively owned only by `@platform-team`, despite the earlier matching greeter rule.
  - **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, evidence gathering and Principles 4–5.
  - **Fix:** Require evaluation of each concrete `codeRoot`, module documentation path, integration path, and changed path using CODEOWNERS’ ordered last-match-wins behavior. Reports should cite the final matching pattern and effective owner set, not merely the existence of any matching rule.