ISSUES FOUND

- **Issue 1: The PR change-detection fetch lacks Azure Pipelines credentials**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A typical reader uses the default private Azure Repos repository and a fresh Microsoft-hosted agent. After checkout, the `changes` job executes `git fetch` without persisted OAuth credentials, so authentication fails and required Build validation remains red. Private repositories and clean hosted agents are the documented main path, making this probable.
  - **Details:**
    - **Violation:** Part 7 calls the YAML a “complete, final two-layer pipeline” and promises that it runs as required Build validation.
    - **Impact:** Every PR pipeline can fail in change detection before any test job runs, blocking PR completion and the live tutorial walk.
    - **Evidence:** In `docs/tutorials/module-team-hello-world-copilot-ado.md`, Part 7, the `changes` job uses:
      ```yaml
      - checkout: self
        fetchDepth: 0
      ```
      and subsequently executes:
      ```bash
      git fetch --no-tags origin "$(System.PullRequest.TargetBranchName)"
      ```
      Azure Pipelines does not leave its checkout OAuth token in Git configuration unless `persistCredentials: true` is requested.
    - **Location:** `module-team-hello-world-copilot-ado.md`, Part 7, `changes` job checkout.
    - **Fix:** Add `persistCredentials: true` to that checkout step, alongside the separately required target-ref correction already identified in the prior pass.

- **Issue 2: Walk 4 leaves the decomposition-generated practice sets behind**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every operator following Walk 4 runs `002-default-decomposition`, which the tutorial says authors the next batch of session-set specs. The checklist then deletes only `001-default-plan`, `002-default-decomposition`, and `docs/modules/default`. Generated `NNN-default-*` sets remain, so the Work Explorer does not return to the Getting Started form as the next instruction assumes, and the final repository contains unexpected practice sets.
  - **Details:**
    - **Violation:** The checklist was required to provide “literal copy-pasteable HumanAction” that mirrors the tutorial. Its next instruction explicitly depends on “the returned Getting Started form.”
    - **Impact:** Walk 4 cannot proceed literally as written, and later acceptance requiring exactly the three real session sets cannot pass without operator improvisation.
    - **Evidence:** The tutorial’s Part 3 says the decomposition session “authors the next batch of session-set specs” and explicitly instructs removal of “any `NNN-default-*` specs the decomposition set wrote.” Walk 4 in `103-copilot-ado-hello-world-tutorial-uat-checklist.json` omits that cleanup and removes only:
      ```bash
      rm -rf docs/session-sets/001-default-plan docs/session-sets/002-default-decomposition docs/modules/default
      ```
    - **Location:** UAT checklist, Walk 4, `HumanAction` steps 1–2.
    - **Fix:** Delete all generated default-module sets, for example with `rm -rf docs/session-sets/*-default-* docs/modules/default`, before expecting the Getting Started form to return.

- **Issue 3: Walk 10 does not validate the tutorial’s hotfix workflow**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every literal Session 2 walk creates a hotfix commit and immediately tags it. It never opens the hotfix PR, observes path-scoped Build validation, obtains approval, runs the full integrated suite on the exact tagged commit, deploys the tag, completes the PR, or cleans up the branch. The checklist can therefore pass while a substantial ADO-clothed release path in Part 10 is broken or misleading.
  - **Details:**
    - **Violation:** The UAT checklist is described as “the acceptance test” and was required to mirror the tutorial’s natural order, including the hotfix drill.
    - **Impact:** Removing the draft banner after this checklist passes would falsely imply that the documented hotfix PR, validation, merge, deployment, and cleanup flow was exercised live.
    - **Evidence:** Tutorial Part 10 requires, after committing the fix: `Dabbler: Open PR for this set`, teammate approval and green CI, the full local integrated suite, tagging, deployment, PR completion, and branch cleanup. Walk 10 step 2 instead jumps directly from:
      > “Make a small greeter fix, git commit …”
      
      to:
      > “Then run 'Dabbler: Cut release tag' for v0.1.1”
    - **Location:** UAT checklist, Walk 10, `HumanAction` step 2 and its expectation.
    - **Fix:** Add the omitted hotfix PR, approval/CI, exact-commit integrated validation, deployment, PR completion, and cleanup actions and corresponding literal expectations.

#### NITS

- **Nit:** The staged links in `docs/quick-start.md`, `module-team-hello-world.md`, and the extension README call the document a “validated-live draft,” contradicting its banner and Session 1 status. Use “not-yet-live-validated draft” or equivalent.