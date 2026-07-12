ISSUES FOUND

## Issue 1: The walkthrough never cleans up merged branches, contradicting its own trunk-hygiene contract

- **Category:** Completeness
- **Severity:** Major
- **Details:**
  - **Violation:** The companion review defines healthy trunk practice as branches being “created, merged to `main`, and then deleted,” while the walkthrough claims to teach a trunk-based workflow with short-lived branches.
  - **Impact:** Following the walkthrough literally leaves numerous merged local and remote branches behind. The resulting repository does not match the clean branch state used by the dogfood and can later be flagged by the shipped review prompt as branch accumulation or integration-bomb drift. Therefore, the dogfood does not substantiate the claim that it exercised the walkthrough’s exact end state.
  - **Evidence:** Part 4 creates and pushes `authoring/001-greeter-hello`, Part 7 creates and pushes `chore/guardrails`, Parts 8–9 push three `session-set/*` branches, and Part 10 pushes `hotfix/greeting-typo`. None of these steps deletes the remote branch; the explicitly created local authoring, guardrail, and hotfix branches are not deleted either. GitHub does not automatically delete merged branches unless that repository setting is enabled, which the tutorial never configures. In contrast, the dogfood reports only `main` plus the deliberately active violation branch.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Parts 4, 5, 7–10 and the final self-check; dogfood reports’ Principles 1 and 7.
- **Fix:** After each merge, instruct the author to delete the remote branch using GitHub’s **Delete branch** action or `git push origin --delete <branch>`, delete the local branch with `git branch -d <branch>`, and prune remote-tracking refs. Alternatively, explicitly enable GitHub’s automatic head-branch deletion and still include local cleanup. Add branch cleanliness to the final checklist and dogfood the documented cleanup path.

## Issue 2: “Production-as-a-tag” can receive a PASS without any deployment evidence

- **Category:** False Positive
- **Severity:** Major
- **Details:**
  - **Violation:** The required review principle is “tag correctness / production-as-a-tag,” and the prompt’s final rule requires `ADVISORY` whenever evidence for a principle is unavailable.
  - **Impact:** A repository may have perfectly formed annotated tags while its production deployment still tracks `main`, a branch, or an untagged commit. The shipped prompt can score that repository `PASS`, falsely assuring the team that its production rollback and release model is sound.
  - **Evidence:** Principle 6’s PASS criteria require only annotated tags, a consistent scheme, and tag ancestry/range logs. The evidence recipe gathers tag refs and Git history but no deployment workflow trigger, deployed SHA/tag, release-environment record, or other evidence showing that production actually runs a tag. The dogfood reports `PASS` from tag history even though the stated scratch exercise did not perform or evidence a real deployment.
- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, evidence-gathering recipe and Principle 6; `s1-dogfood-review-round-4.md` through `s1-dogfood-review-round-7.md`, Principle 6.
- **Fix:** Split the assessment into tag correctness and production-target evidence, or retain one score but cap it at `ADVISORY` unless deployment evidence identifies the deployed tag/commit. Gather relevant deployment workflows and environment/release records where available, and require proof that production resolves to an annotated release tag rather than merely proving that tags exist.