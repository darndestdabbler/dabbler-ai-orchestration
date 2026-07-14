ISSUES FOUND

- **Issue 1: The branch-policy bootstrap does not account for Azure DevOps’ separate push-bypass permission**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Priya follows the main path as the creator/administrator of the new Azure DevOps project, enables the reviewer policy, and then performs Walk 4’s direct-push test. Azure DevOps administrators commonly have or inherit **Bypass policies when pushing**, so the push can succeed instead of being rejected. This is probable because the tutorial explicitly makes Priya the policy administrator in a brand-new organization—the identity most likely to hold bypass permissions.
  - **Details:**
    - **Violation:** The tutorial promises, “**from this point on, a direct `git push` of a `main` commit is rejected**,” and the UAT expects “the direct push to main is **REJECTED**.” The required executable branch-policy bootstrap must establish that condition.
    - **Impact:** The tutorial’s protected-trunk guarantee is false for its primary operator, Walk 4 fails on the documented path, and the throwaway test commit may be pushed directly to `main`, bypassing the PR/review workflow the tutorial is intended to validate.
    - **Evidence:** Part 3 configures only the minimum-reviewer policy and discusses **Bypass policies when completing pull requests**. It never checks or removes the distinct Azure DevOps permission **Bypass policies when pushing**. UAT Walk 4 then asks the same project-admin operator to prove rejection without first establishing that the account lacks push bypass.
    - **Location:** `docs/tutorials/module-team-hello-world-copilot-ado.md`, Part 3 step 8; `103-copilot-ado-hello-world-tutorial-uat-checklist.json`, Walk 4.
    - **Fix:** Explicitly inspect and remove/deny **Bypass policies when pushing** for normal team accounts, or perform the rejection test using a Contributors account known not to have that permission. Document push bypass separately from completion bypass and verify both intended restrictions.

#### NITS

- **Nit:** The discoverability links call the document a “validated-live draft,” contradicting its banner, “DRAFT — not yet validated live.” Locations: `docs/quick-start.md`, both links in `module-team-hello-world.md`, and `tools/dabbler-ai-orchestration/README.md`. Use “draft pending live validation.”

- **Nit:** UAT Walk 8 conflates the PR-title prompt with the confirmation modal title. It says the modal title defaults to `Session set <slug>`, while the tutorial correctly identifies the modal title as `Push this branch and open a PR?`; `Session set <slug>` is the default PR title. This can produce a false UAT failure.

- **Nit:** UAT Walk 4 never removes the rejected throwaway commit from local `main`. Walk 5 therefore branches from it and includes it in the authoring PR. Add `git reset --hard origin/main` after confirming rejection.

- **Nit:** The task explicitly requested an executable ADO bootstrap covering “project/repo/membership,” but Part 0 makes an existing project a prerequisite and Part 1 only creates the repository and membership. Add a concise project-creation step or clearly narrow the bootstrap contract to an operator-supplied project.

- **Nit:** Optional Walk 11 leaves the pushed `session-set/uat-floor` branch and possible draft PR behind, conflicting with the tutorial’s final no-lingering-branches check. Add local/remote branch and PR cleanup.