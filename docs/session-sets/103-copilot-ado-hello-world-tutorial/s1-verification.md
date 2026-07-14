ISSUES FOUND

- **Issue 1: The pipeline is registered before its YAML exists in Azure Repos**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Every reader following Part 7 creates `azure-pipelines.yml` only in the local working tree, then immediately asks Azure DevOps to select `/azure-pipelines.yml` from the repository. Azure DevOps cannot see an uncommitted, unpushed file, so pipeline registration—and consequently Build validation and Walk 7—stops on the main path.
  - **Details:**
    - **Violation:** The task requires an “executable ADO bootstrap.” Part 7 says to create the file locally, then use **Existing Azure Pipelines YAML file**, and only afterward commit and push it. Walk 7 repeats the same ordering.
    - **Impact:** The required pipeline cannot be created, so the guardrails PR cannot receive the required Build-validation run and the tutorial cannot proceed as written.
    - **Evidence:** `module-team-hello-world-copilot-ado.md`, Part 7 steps 1–4, and UAT Walk 7 both place repository registration before `git switch -c chore/guardrails`, `git add`, commit, push, and PR creation.
    - **Location:** `docs/tutorials/module-team-hello-world-copilot-ado.md`, Part 7; UAT Walk 7.
    - **Fix:** Commit and push `azure-pipelines.yml` to `chore/guardrails` first, open the PR, register the pipeline by selecting that branch and YAML path, then add Build validation and queue/requeue the PR validation before completion.

- **Issue 2: The UAT walk omits the actions needed to create and complete the clock and integration sets**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** An operator follows the checklist linearly. Walk 5 creates only `001-greeter-hello`; Walk 6 runs only that set. Walk 9 then assumes `002-clock-hello` has been created, implemented, and merged and that `003-integration-compose` exists and is unblocked. None of those transitions occurred, so Walk 9 cannot be performed. Even if the operator improvises them, Walk 9 never completes/finalizes the integration PR, while Walk 10 assumes all three sets are Complete.
  - **Details:**
    - **Violation:** The checklist was required to mirror the tutorial’s natural order with literal, executable actions and to flag intentional omissions. Its order map skips Part 5 entirely without marking it intentional.
    - **Impact:** Session 2 cannot execute the authored acceptance test linearly, and the checklist cannot substantiate end-to-end validation of the three-person workflow.
    - **Evidence:** Walk 5 creates only the greeter set; Walk 6 implements only greeter; Walk 8 finalizes only greeter; Walk 9 starts with “greeter and clock merged to main; `003-integration-compose` unblocked”; Walk 10 starts with “all three sets Complete.” There are no intervening actions that create/run/merge clock or create/complete integration.
    - **Location:** `103-copilot-ado-hello-world-tutorial-uat-checklist.json`, checklist order map and Walks 5–10.
    - **Fix:** Add the Part 5 clock/integration plan-and-set authoring flow, run both greeter and clock sessions before guardrail activation, merge/finalize both before Walk 9, and complete/finalize the integration PR before Walk 10.

- **Issue 3: A brand-new Azure DevOps organization is not prepared to run `ubuntu-latest`**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Session 2 follows the checklist’s stated requirement to use a brand-new scratch Azure DevOps organization. New organizations commonly have no Microsoft-hosted parallel-job grant by default. The first pipeline using `vmImage: ubuntu-latest` therefore remains unqueued with the hosted-parallelism error. Obtaining the free grant can require an external request and delay, so the promised half-day live walk cannot proceed.
  - **Details:**
    - **Violation:** The tutorial promises an executable pipeline bootstrap and says no plan upgrade is needed, but omits the hosted-agent-capacity prerequisite or a self-hosted alternative.
    - **Impact:** Walk 7’s required first PR and `main` runs cannot execute, preventing Build validation and the remainder of the acceptance walk.
    - **Evidence:** The checklist mandates a “BRAND-NEW scratch Azure DevOps organization/project”; the YAML unconditionally selects `pool: vmImage: ubuntu-latest`; prerequisites never require checking **Organization settings → Pipelines → Parallel jobs**, obtaining the free hosted grant, or configuring a self-hosted pool.
    - **Location:** Tutorial Part 0 and Part 7; UAT Notes and Walk 7.
    - **Fix:** Add a prerequisite to verify hosted parallel capacity and request the free grant in advance, or document a self-hosted agent pool and the corresponding YAML replacement.

#### NITS

- **Nit:** The quick-start, base tutorial, and README call the new document a “validated-live draft,” which says the opposite of its banner, “DRAFT — not yet validated live.” Replace it with “not-yet-live-validated draft” or equivalent.

- **Nit:** The promised ADO “project/repo/membership” bootstrap does not actually teach project creation and gives no concrete repository-creation UI path; Part 0 instead requires an already-created project. This is recoverable but leaves part of the specified bootstrap outsourced to the reader.

- **Nit:** UAT Walk 4 creates a throwaway commit on local `main`, confirms its push is rejected, and never resets it. Walk 5 consequently branches from that commit and can include the throwaway change in the authoring PR. Add `git reset --hard origin/main` after confirming rejection.

- **Nit:** Walk 5 leaves the checkout on `authoring/001-greeter-hello` after completing its PR, while Walks 6–7 assume an updated main checkout. Add the tutorial’s `git switch main`, `git pull --ff-only`, and authoring-branch cleanup.

- **Nit:** YAML `pr:` triggers do not provide PR validation for Azure Repos Git; the Build-validation branch policy does. Keeping `pr:` is harmless but misleading and should be removed or explicitly described as inapplicable to Azure Repos.

- **Nit:** The claim that the vacuous `all_modules` path runs “exactly once” is not enforced. It runs on every push to `main` until a `services/` directory exists.

- **Nit:** Walk 10 omits the tutorial’s hotfix PR, integrated-suite validation, PR completion, and branch cleanup while claiming it matches Part 10. Those host-facing steps therefore receive no UAT coverage.

- **Nit:** Optional Walk 11 leaves an open PR and local/remote `session-set/uat-floor` branch, conflicting with the tutorial’s cleanup end state. Add PR closure and branch deletion.

- **Nit:** Several supposedly copy-pasteable UAT commands require unstated substitution (`{org}`, `{project}`, `{repo}`), and expectations use `...` or `<number>` while describing themselves as literal. Define concrete scratch values or distinguish exact stable fragments from dynamic fields.

- **Nit:** The tutorial supplies Unix commands such as `rm -rf` and `&&` without PowerShell equivalents despite explicitly supporting Windows elsewhere. This is a recoverable obstacle for users on the common Windows PowerShell 5.1 setup.

- **Nit:** Part 1 says a fresh Azure DevOps repository “belongs to its creator alone.” Repository permissions normally inherit from project groups, so existing Contributors may already have access. The instruction to verify/add teammates remains valid, but the rationale is factually overstated.