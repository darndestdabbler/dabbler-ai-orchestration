ISSUES FOUND

## Issue 1: The hotfix CI does not validate the commit that is tagged and deployed

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough says, “Tag the validated hotfix commit and deploy it first,” and requires a guarded, tag-correct hotfix release.
  - **Impact:** For a `pull_request` event, `actions/checkout@v4` checks out GitHub’s synthetic PR merge commit by default, not `hotfix/greeting-typo`’s head commit. Tests can therefore pass only with unreleased changes from `main`, while the isolated commit tagged as `v0.1.1` remains broken. A team following the tutorial could deploy an untested release snapshot.
  - **Evidence:** Part 7 defines `pull_request:` and each module job uses plain `actions/checkout@v4`. Part 10 relies exclusively on the resulting PR check before tagging `hotfix/greeting-typo`; the workflow’s push trigger covers only `main`, so pushing the hotfix branch or tag does not test that exact SHA.
  - **Correct answer:** Validate the exact hotfix head before tagging—for example, add a `push` trigger for `hotfix/**` and wait for that run, explicitly check out `github.event.pull_request.head.sha` in PR module jobs, or run the complete tests locally at the hotfix commit. Keep the PR merge-ref run as a separate compatibility check.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 7 workflow and Part 10 step 3.

## Issue 2: Cleanup fails after squash or rebase merges at every non-hotfix merge point

- **Category:** Completeness
- **Severity:** Major
- **Details:**
  - **Violation:** The tutorial must be “copy-pasteable, runnable” and its final checklist requires: “No merged branches linger.”
  - **Impact:** GitHub repositories commonly use squash or rebase merging. Those strategies create commits with different identities, so the original branch tip is not an ancestor of local `main`; every documented `git branch -d` then refuses deletion. Literal followers cannot reach the promised clean branch state.
  - **Evidence:** Parts 4, 5, 7, 8, and 9 say only to “merge” and then use `git branch -d`, without specifying a merge-commit strategy or explaining safe forced deletion. Part 10 correctly documents this exact squash/rebase failure and the verify-then-`git branch -D` remedy, but that remedy is absent from all earlier authoring, guardrail, and session-set cleanup steps.
  - **Correct answer:** Either require **Create a merge commit** throughout, or apply the Part 10 guidance at every cleanup point: verify the PR’s changes landed on updated `main`, then use `git branch -D` when `-d` refuses after a squash/rebase merge.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Parts 4, 5, and 7–9.