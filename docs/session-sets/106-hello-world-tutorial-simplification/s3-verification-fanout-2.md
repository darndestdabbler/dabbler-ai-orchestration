ISSUES FOUND

### Issue 1: Walk 1 has mutually exclusive mandatory preconditions
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** The Session 4 operator follows the checklist’s explicit “if any is missing, STOP AND RESCHEDULE” rule. They cannot begin Walk 1 because the global preconditions require the extension and Copilot CLI authentication to already exist, while Walk 1 requires both to be absent so it can install and authenticate them. This contradiction occurs on the mandatory first walk and prevents literal execution without improvisation.
- **Location:** Checklist `Notes`, under `OPERATOR-SUPPLIED PRECONDITIONS`, versus Walk 1 `HumanAction`.
- **Details:**
  - **Violation:** The checklist must provide a reachable per-walk starting state. Notes require “the Dabbler extension installed from a LOCAL BUILD” and a Copilot seat “authenticated before the walk starts,” while Walk 1 starts with the extension “NOT yet installed” and Copilot CLI “NOT yet signed in.”
  - **Impact:** The operator cannot satisfy the checklist’s own mandatory start conditions, so Walk 1 cannot receive a literal PASS/FAIL verdict as authored.
  - **Evidence:** Walk 1 explicitly installs the VSIX and runs `copilot` to complete sign-in.
- **Fix:** Require the local 0.46.0 VSIX to be **available but not installed**, and require an active Copilot seat with credentials available but the CLI **not yet authenticated**.

### Issue 2: The main script installs the known-incompatible Marketplace version
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A recorder follows Scene 1 today and installs Marketplace version 0.45.0. Later, Scene 4 expects Session 2’s 0.46.0 CI scaffold and CODEOWNERS changes, so the promised add-steps-only CI edit no longer matches the file on screen. This is probable because Marketplace installation is the script’s literal main-path instruction and the release contract explicitly says 0.46.0 remains unpublished.
- **Location:** `scene-1-install-and-verify.md`, Beat 2; checklist Walk 1; release baseline.
- **Details:**
  - **Violation:** Scripts must carry literal actions whose later `See` clauses match reality. Scene 1 says to install from Marketplace, while the checklist admits that Marketplace carries “the OLD scaffolded templates” and silently substitutes a local VSIX.
  - **Impact:** A future recorder reaches Scene 4 with the wrong generated repository, and Session 4 does not test the actual Marketplace action as scripted.
  - **Evidence:** Checklist Notes state Marketplace is 0.45.0 and local 0.46.0 is required; Walk 1 says “but for THIS walk install the LOCAL 0.46.0 build instead.”
- **Fix:** Make Scene 1 version-aware: require 0.46.0, install the local VSIX until Marketplace publication, and verify the installed version on screen. Remove the UAT-only deviation so the walk executes the script literally.

### Issue 3: Scene 5 cannot merge the lifecycle PR after approvals are raised to one
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Sam opens the app lifecycle PR in Scene 5 Beat 12 and immediately attempts to merge it. The PR changes planning/session-set files, not either `/services/...` CODEOWNERS path, so no owner is automatically requested; branch protection requires one approval and Sam cannot approve his own PR. The scripted merge is therefore blocked on every correctly configured run.
- **Location:** `scene-5-second-module.md`, Beats 7 and 12; checklist Walk 8, step 5.
- **Details:**
  - **Violation:** Beat 12 says “Open PR … merge it” after Beat 7 changes required approvals from zero to one.
  - **Impact:** The operator cannot land the prerequisite on `main`, so the following worktree must not be cut and Walk 8 cannot reach its expected state.
  - **Evidence:** The only CODEOWNERS rules are `/services/greeter/` and `/services/app/`; the lifecycle PR contains the plan, decomposition output, implementation-set spec, and prerequisite declaration.
- **Fix:** Add an explicit Priya review request and approval before Sam merges, with literal `Do`, `Say`, and `See` clauses. Add the same action and expected approval to Walk 8.

### Issue 4: The Azure DevOps alternate invokes `az` without installing Azure CLI
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A recorder starts from either Scene 1 take on a clean machine. Both install `gh`, not Azure CLI. Scene 2’s alternate then runs `az login`, which fails with command-not-found. Azure CLI is not bundled with VS Code or the GitHub CLI, so this is probable for the stated clean setup.
- **Location:** `scene-2-alt-azure-devops.md`, Starting state and Beat 5.
- **Details:**
  - **Violation:** The alternate’s goal promises “the Azure CLI able to open pull requests,” but no beat installs or verifies Azure CLI before invoking it.
  - **Impact:** The alternate take cannot be performed as written and cannot reach its stated goal.
  - **Evidence:** Beat 5 begins directly with `az login` and `az extension add --name azure-devops`; neither Scene 1 variant establishes `az`.
- **Fix:** Add a literal Azure CLI installation and `az --version` verification before authentication, including platform-specific commands or a documented prerequisite.

### Issue 5: The checklist cannot reach a verdict on the Azure DevOps scene
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Session 4 completes Walk 11 by inspecting four policy controls in an existing ADO repository. None of the alternate scene’s create-project, initialize-README, clone, `az` authentication, or rejoin beats is executed. Walk 13 then asks for whole-script followability even though those beats were never performed. A broken alternate—such as the missing Azure CLI installation—can therefore receive no actionable verdict.
- **Location:** Checklist Walk 11 and Walk 13; `scene-2-alt-azure-devops.md`.
- **Details:**
  - **Violation:** The checklist claims “THE WALK DOUBLES AS THE VIDEO DRY RUN” and Walk 13’s item label claims “Every scene script is followable as written.” Walk 11 explicitly performs only a settings-label spot check.
  - **Impact:** Session 4 cannot accept or reject the Azure DevOps alternate based on its actual scripted behavior.
  - **Evidence:** Walk 11 never follows Beats 1–6. Its rationale that doing so would “mean scaffolding the repository twice” is incorrect: the alternate only creates and clones a separate ADO repository and does not run Dabbler scaffolding.
- **Fix:** Execute the six alternate-scene beats against a disposable ADO project, then separately inspect the downstream policy substitutions. Add a scratch ADO organization/project capability to the global preconditions.

### Issue 6: Scene 6 promises a manual review request that CODEOWNERS already performs
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Sam opens the implementation PR containing files under `/services/app/`. Since the CODEOWNERS rule is already on `main`, GitHub automatically requests Priya. Scene 6 Beat 2 then instructs Sam to request Priya manually and narrates that automatic routing is not being demonstrated. The expected UI action is already complete and the explanation falsely attributes review routing to `touches:`.
- **Location:** `scene-5-second-module.md`, Beat 6; `scene-6-pr-and-merge.md`, Beats 2 and 4; checklist Walk 9.
- **Details:**
  - **Violation:** Scene beats must promise the result that actually appears. The scripts manually add `/services/app/ @sam-gh @priya-gh` to CODEOWNERS and merge it before the implementation PR.
  - **Impact:** The recorder encounters a different reviewer state than scripted and the video misteaches a core distinction: `touches:` authorizes cross-module work, while CODEOWNERS—not `touches:`—requests reviewers.
  - **Evidence:** Scene 6 says “Not because someone remembered to add me — because the module declared the dependency and the ownership map followed it,” despite Scene 5 requiring the user to add Priya manually to CODEOWNERS.
- **Fix:** Make Beat 2 show Priya already auto-requested by CODEOWNERS. Explain separately that `touches:` permits the cross-module dependency and that the manually authored CODEOWNERS rule performs review routing.

### Issue 7: Scene 1 never actually checks the VS Code version
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A recorder reaches Beat 3 on an unknown VS Code version. The script tells them to “say the VS Code version out loud from Help > About rather than opening the dialog,” but provides no action that obtains or displays it and no expected version result. The checklist likewise has no VS Code-version expectation, so Session 4 cannot decide whether this required tool check passed.
- **Location:** `scene-1-install-and-verify.md`, Beat 3; checklist Walk 1.
- **Details:**
  - **Violation:** The task requires version checks from the VS Code terminal and literal expected on-screen results. The scene only runs `python --version`.
  - **Impact:** One of the required tool checks is neither performable nor attestable as written.
  - **Evidence:** Beat 3’s only `See` result is Python 3.10 or higher; Walk 1’s expectation covers Python, Copilot CLI, smoke output, and `gh`, but not VS Code.
- **Fix:** Run `code --version` in the integrated terminal, show the first version line, and require 1.85 or higher in both the scene and Walk 1 expectation.

#### NITS

- **Nit:** The checklist repeatedly cites nonexistent `s3-literal-fidelity-check.md`; the actual artifact is `s3-authoring-gates.md`.
- **Nit:** `video/README.md` says the scripts “were dry-run end to end” even though the checklist’s first sentence says “NOT YET WALKED.”
- **Nit:** `s3-authoring-gates.md` says both gates ran “on the committed tree,” but the supplied status shows all Session 3 deliverables staged against `HEAD`, not committed.
- **Nit:** Scene 3 Beat 6 calls CODEOWNERS and the CI workflow “both comment-only,” while Scene 4 and the gate documentation state the CI workflow already has an active `on:` block and `test` job.
- **Nit:** The literal-fidelity gate overstates its coverage. It checks a hard-coded `SHARED` list; it does not discover every shared literal, so “Every literal the scene scripts share” is unsubstantiated.
- **Nit:** The checklist gate claims it detects every unflagged out-of-order walk, but it only searches `Subarea` values already containing `OUT OF`; an unlabelled out-of-order walk cannot be detected.
- **Nit:** Several closing beats omit the required `Do` field entirely, including Scene 2 Beat 6, Scene 3 Beat 13, Scene 5 Beat 13, and Scene 6 Beat 9.
- **Nit:** The macOS direct-key probe uses Bash-only `${!n}` syntax without telling users of the default zsh terminal to invoke Bash.
- **Nit:** The personal GitHub repository flow says to choose Sam’s “Write role”; personal-repository collaborator invitations normally grant write access without exposing the organization-style role selector.
- **Nit:** If the deliberate direct push in Scene 6 succeeds, `git reset --hard HEAD~1` only repairs the local branch. The unwanted commit remains on remote `main`, and the script provides no safe remote cleanup.
- **Nit:** Multiple authentication beats require “a scene that hides the device code,” but the README defines no privacy/slate OBS scene. Recorders must invent one or risk capturing the code.
