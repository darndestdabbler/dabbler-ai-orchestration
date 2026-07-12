# ISSUES FOUND

## Issue 1: The tutorial’s integration set violates its own `codeRoots` discipline

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task requires a runnable walkthrough consistent with “directory discipline vs `codeRoots`.” The companion prompt likewise says changes must remain within the owning module’s `codeRoots`.
  - **Impact:** A team following the tutorial creates an integration set that the shipped review prompt should classify as a scope violation. This undermines both the walkthrough and its graduation review.
  - **Evidence:** In `docs/tutorials/module-team-hello-world.md`, the manifest declares:
    ```yaml
    - slug: integration
      codeRoots: []
    ```
    but Part 5 scopes the integration plan to a program, Part 7 defines ownership for `services/integration/`, and Part 9 says the integration branch created `services/integration/`. That path is not in the integration module’s empty `codeRoots`.
  - **Location:** `docs/tutorials/module-team-hello-world.md`, Parts 3, 5, 7, and 9.
  - **Fix:** Declare `services/integration` as the integration module’s `codeRoot`, update the cast table to show Alex owns it, and retain `touches: [greeter, clock]`.

## Issue 2: The hotfix procedure tags unreleased `main`, not the hotfix snapshot

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task explicitly requires “tag correctness / production-as-a-tag” and a branch-from-tag hotfix. The tutorial itself says the hotfix starts from `v0.1.0` because “`main` may contain unreleased work you do not want to ship.”
  - **Impact:** Following the instructions can make `v0.1.1` contain all unreleased commits already on `main`, defeating the purpose of branching from the production tag and potentially deploying unapproved work.
  - **Evidence:** Part 10 creates `hotfix/greeting-typo` from `v0.1.0`, but then instructs the user to merge it into `main` and “tag and push `v0.1.1` the same way as step 1.” Step 1 explicitly runs `git switch main && git pull` before creating the tag.
  - **Location:** `docs/tutorials/module-team-hello-world.md`, Part 10 steps 1 and 3.
  - **Fix:** Create and push `v0.1.1` on the isolated hotfix commit or a release branch based on `v0.1.0`, then separately merge or cherry-pick that fix forward into `main`.

## Issue 3: The review prompt cannot verify owner reviews and conflates CODEOWNERS coverage with enforcement

- **Category:** Completeness
- **Severity:** Major
- **Details:**
  - **Violation:** The required review principle is “integration `touches` + owner review” with cited evidence. The prompt’s final rule also says unavailable evidence must produce `ADVISORY`, not guessed conclusions.
  - **Impact:** The reusable review can report satisfactory owner-review practice without any evidence that the owners reviewed or approved a PR. This makes a central workflow score unreliable.
  - **Evidence:**
    - The routed evidence script gathers files, local branch diffs, tags, and `git log`, but no GitHub PR reviews, requested reviewers, branch-protection configuration, or ruleset data.
    - `.github/CODEOWNERS` identifies owners and can request reviews; by itself it does not prove that a review occurred or make that review mandatory.
    - The tutorial enables only one generic required approval, not a code-owner-review requirement, and the integration requirement is that both Priya and Sam review.
    - `s1-dogfood-review.md` claims merge commit `8e0e5e5` “indicates the correct owners reviewed it.” A local merge commit such as `Merge PR #3` does not establish reviewer identities, and the stated dogfood did not exercise GitHub-hosted reviews.
  - **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, routed evidence script and Principle 4; `s1-dogfood-review.md`, Principle 4.
  - **Fix:** Gather actual PR review data, for example through `gh pr view --json reviews,reviewRequests,author,files`, and relevant branch-protection/ruleset data. Distinguish ownership coverage, automatic review requests, required approvals, and completed approvals. Score owner review `ADVISORY` whenever that evidence is unavailable, and correct the dogfood report’s unsupported claim.

## Issue 4: The “parallel” integration session starts before its dependencies exist and is never synchronized

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough must be “copy-pasteable” and runnable end to end, including verified AI sessions and an integration set composing `greeter` and `clock`.
  - **Impact:** Alex’s integration worktree is based on `main` before either dependency’s implementation is merged. Its local integration program and tests cannot exercise those implementations, so the session cannot reliably complete its required verification. Later merging the dependency PRs does not update Alex’s existing worktree automatically.
  - **Evidence:** Part 6 opens all three worktrees and runs their sessions in parallel while only plans and not-started sets exist on `main`. Parts 8 and 9 merge `greeter` and `clock` afterward. No pull, rebase, merge from `origin/main`, or recreation of Alex’s worktree is included before Alex finishes and verifies the integration session.
  - **Location:** `docs/tutorials/module-team-hello-world.md`, Parts 6, 8, and 9.
  - **Fix:** Make the integration set depend on the first two sets and open it only after they merge, or explicitly synchronize Alex’s branch with updated `main` before implementation and final verification.