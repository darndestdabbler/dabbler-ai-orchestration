ISSUES FOUND

### Issue 1: The pipeline cannot be registered in the documented order
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A typical reader follows Part 7 literally, creates `azure-pipelines.yml` only in the local working tree, and then opens Azure DevOps’ “Existing Azure Pipelines YAML file” picker. The file is not present in any remote branch, so Azure DevOps cannot select or run it. This is certain on the documented path, not an edge case.
- **Details:**
  - **Violation:** The task requires an “executable ADO bootstrap,” but Part 7 instructs readers to register `/azure-pipelines.yml` before its first commit and push.
  - **Location:** `module-team-hello-world-copilot-ado.md`, Part 7 steps 1–4; repeated in UAT Walk 7.
  - **Impact:** Readers cannot create the pipeline, select it for Build validation, or complete the guardrails PR as instructed. This blocks the main tutorial path.
  - **Evidence:** Step 1 creates the file locally; step 2 registers it from Azure Repos; only step 4 creates `chore/guardrails`, commits the file, and invokes the push/PR command. UAT Walk 7 likewise registers in step 2 but does not commit until step 5.
  - **Fix:** Create the branch, commit, and push it first; then register the pipeline by selecting that branch and `/azure-pipelines.yml`, configure policies, and open or refresh the PR.

### Issue 2: PR change detection does not reliably fetch the target remote-tracking ref
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** On a normal fresh Azure Pipelines PR agent, checkout fetches the PR merge ref rather than creating `refs/remotes/origin/main`. The script runs `git fetch origin main`, which updates `FETCH_HEAD` but does not map the fetched branch to `origin/main`. `git merge-base HEAD origin/main` then fails under `set -e`, making the required Build-validation run red. Fresh hosted agents are the standard execution environment, so this is probable.
- **Details:**
  - **Violation:** The tutorial claims the embedded file is a “complete, final two-layer pipeline” whose PR jobs execute successfully.
  - **Location:** Embedded `azure-pipelines.yml`, `changes` job:
    ```bash
    git fetch --no-tags origin "$(System.PullRequest.TargetBranchName)"
    BASE="$(git merge-base HEAD "origin/$(System.PullRequest.TargetBranchName)")"
    ```
  - **Impact:** Required PR validation can fail before setting any module outputs, blocking the guardrails PR and subsequent session PRs.
  - **Evidence:** An explicit command-line refspec such as `git fetch origin main` fetches to `FETCH_HEAD`; it does not guarantee creation or refresh of `refs/remotes/origin/main`. Azure PR checkout is commonly a targeted merge-ref checkout.
  - **Fix:** Fetch with an explicit destination and then use that destination:
    ```bash
    TARGET="$(System.PullRequest.TargetBranch)"
    TARGET="${TARGET#refs/heads/}"
    git fetch --no-tags origin \
      "+refs/heads/$TARGET:refs/remotes/origin/$TARGET"
    BASE="$(git merge-base HEAD "refs/remotes/origin/$TARGET")"
    ```

### Issue 3: The UAT checklist omits the state required for Walks 9 and 10
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** An operator follows Walks 1–8 exactly and reaches Walk 9. No preceding action authored `002-clock-hello` or `003-integration-compose`, implemented and merged the clock module, or established the integration prerequisites. Opening the `003-integration-compose` worktree therefore fails because the set does not exist. Walk 10’s “all three sets Complete” precondition is likewise unattainable. This happens on every literal execution of the checklist.
- **Details:**
  - **Violation:** The task requires “literal copy-pasteable HumanAction,” a walk order mirroring the tutorial, and intentional omissions to be flagged. The checklist describes itself as the acceptance test and says its order mirrors the tutorial.
  - **Location:** `103-copilot-ado-hello-world-tutorial-uat-checklist.json`, especially Walks 5–10 and the checklist-level order map.
  - **Impact:** Session 2 cannot execute the authored acceptance walk linearly without inventing substantial unlisted steps, so the checklist does not validate the complete tutorial it claims to cover.
  - **Evidence:** Walk 5 creates only `001-greeter-hello`; Walk 6 implements only that set; Walk 8 finalizes only a session “e.g. greeter.” Part 5’s authoring of `002-clock-hello` and `003-integration-compose`, plus the clock implementation and merge, never appears. Walk 9 nevertheless starts with “greeter and clock merged to main; 003-integration-compose unblocked.”
  - **Fix:** Add explicit walks or numbered actions that author and merge the clock and integration specs, run and merge the clock session, and declare the integration prerequisites before Walk 9. Mark any intentionally compressed tutorial work explicitly and preserve all required repository state.

## NITS

- **Nit:** The discoverability links call the document a “validated-live draft” even though its banner says it has **not** been validated live. Locations: `docs/quick-start.md`, both edits to `module-team-hello-world.md`, and `tools/dabbler-ai-orchestration/README.md`. Replace with “draft pending live validation.”
- **Nit:** UAT Walk 4 creates a throwaway commit on `main` to prove push rejection but never removes it. Walk 5 then branches from that contaminated local `main`, so the authoring PR can include the throwaway change. Add `git reset --hard origin/main` after confirming rejection.
- **Nit:** Walk 5 does not explicitly switch back to `main`, pull the merged authoring PR, or delete the authoring branch before Walk 6. The next walk assumes the merged set is locally available; add the tutorial’s cleanup sequence.
- **Nit:** Walk 11 creates and pushes `session-set/uat-floor` but only restores the setting. Add cleanup for the PR, local branch, remote branch, and `floor.txt`.
- **Nit:** The promised ADO bootstrap names project creation, but the tutorial assumes an existing project and only teaches repository creation and membership. Add a concise Azure DevOps project-creation step or explicitly identify project provisioning as an operator-supplied prerequisite/exclusion.