ISSUES FOUND

- **Issue 1: The mandatory live GitHub dogfood was replaced by a local simulation but marked complete**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The session closes with `dogfood-pass` treated as complete, making the first real GitHub operator the first person to exercise authenticated `gh pr create`, host-side PR creation and merge, and the resulting finalize flow. This omission is certain on the current close path—not merely possible—because the committed harness explicitly does not contact GitHub, while the activity log and disposition mark dogfood complete.
  - **Details:**
    - **Violation:** Session step 7 requires: **“Live dogfood against a scratch GitHub repo: open a real PR, merge it, run finalize; assert the local end-state.”** Only Azure DevOps may instead be recorded as an armed UAT walk.
    - **Impact:** A mandatory acceptance gate for the primary end-to-end host integration has not run, yet the session reports it as passed. That materially changes the merge decision because mocked CLI calls and a local bare repository cannot validate authentication, actual GitHub PR creation, host-side merge behavior, or returned live-host output.
    - **Evidence:** `src/test/dogfood/gitWorkflow.dogfood.ts` rewrites the GitHub-shaped URL to a local bare repository, injects `probeCli` as absent, manually updates `refs/heads/main`, and explicitly states it **“does NOT prove: a real `gh`/`az` PR creation.”** The UAT checklist leaves the GitHub walk empty and labels it optional. Nevertheless, `activity-log.json` marks `session-001/dogfood` complete and `disposition.json` reports the dogfood harness green. The documented operator deferral in `ai-assignment.md` specifically concerns live Azure DevOps dogfood and does not supersede the explicit live GitHub requirement.
    - **Location:** `tools/dabbler-ai-orchestration/src/test/dogfood/gitWorkflow.dogfood.ts`; `docs/session-sets/102-git-workflow-automation/activity-log.json`; `disposition.json`; `102-git-workflow-automation-uat-checklist.json`.
    - **Fix:** Run the required flow against a real scratch GitHub repository using authenticated `gh`: create and push the branch, create a real PR, merge it on GitHub, run finalize, and record the asserted local end state. Do not mark `dogfood-pass` complete until that succeeds.

#### NITS

- **Nit:** The promised Azure CLI preflight remains incomplete. `src/utils/hostCli.ts` checks only whether an `az` file exists; it does not detect the required `azure-devops` extension or authentication state. The later failure path opens the browser and supplies guidance, so this is recoverable and non-blocking, but it does not satisfy the stated `az` + extension preflight contract. Add injected extension/authentication probes or describe the feature as executable discovery rather than full preflight.