ISSUES FOUND

- **Issue 1: The main and direct-API scripts install the known-wrong Marketplace version**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Session 4 follows the checklist and installs the local 0.46.0 VSIX, so it does not perform scene 1 as written. A future recorder who literally follows either scene 1 before the operator-gated publish instead installs Marketplace 0.45.0 and later receives the old CODEOWNERS and CI scaffolds. This is probable because Marketplace installation is the primary scripted path and the release contract explicitly says 0.46.0 is not published.
  - **Details:** **Violation:** The checklist says each scene must be followed “AS WRITTEN” and Walk 13 must confirm every beat was performed, while both scene-1 variants say to install from Marketplace. **Impact:** S4 cannot truthfully pass the whole-script attestation, and the current public installation path breaks later scaffold expectations. **Evidence:** The checklist precondition explicitly states, “The Marketplace copy is 0.45.0 and carries the OLD scaffolded templates,” then Walk 1 overrides the script with “for THIS walk install the LOCAL 0.46.0 build instead.” **Location:** `scene-1-install-and-verify.md` beat 2; `scene-1-alt-direct-api.md` beat 2; checklist Walks 1 and 13. **Fix:** Script local VSIX installation and a 0.46.0 version check until publication, or make Marketplace installation conditional on confirming that 0.46.0 has actually been published.

- **Issue 2: Sam cannot merge the app lifecycle PR without an omitted approval**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Walk 8 reaches the PR created by Sam after Walk 7 enabled one required approval. GitHub blocks Sam from merging his own PR, but neither the scene nor checklist tells Priya to approve it. This is certain on the scripted branch-protection state, not an unusual configuration.
  - **Details:** **Violation:** Every beat and UAT action must be literal and followable from the established state. **Impact:** The operator cannot land the app implementation-set specification on `main`, so the prerequisite cannot enter the worktree and the rest of Walks 8–10 cannot proceed without improvisation. **Evidence:** Scene 5 beat 7 raises approvals to one; beat 8 already acknowledges that this blocks self-merge. Beat 12 then says Sam should open and “merge it” with no reviewer step. Checklist Walk 8 repeats the omission. **Location:** `scene-5-second-module.md` beat 12; checklist Walk 8 step 5. **Fix:** Add an explicit Priya review and approval before Sam merges this PR, including the account/browser-profile switch and expected approval state.

- **Issue 3: Scene 6 incorrectly expects a manual review request that CODEOWNERS should already have made**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Sam opens the app implementation PR after the CODEOWNERS rules have already landed on `main`. Because the PR changes `/services/app/`, GitHub automatically requests Priya as a code owner. The scripted next action—manually request Priya—and its narration therefore do not match the screen for the normal path.
  - **Details:** **Violation:** The scripts require literal actions and literal expected on-screen results. **Impact:** The recorder reaches an unperformable or redundant beat and falsely narrates that automatic routing is not being demonstrated, even though this PR is exactly where it should be demonstrated. **Evidence:** Scene 5 beat 6 installs `/services/app/ @sam-gh @priya-gh`; beat 8 merges that rule before Sam creates the implementation PR. Scene 6 beat 2 nevertheless says to request Priya manually and claims rules “added a moment ago” would not already route the review. **Location:** `scene-6-pr-and-merge.md` beat 2; checklist Walk 9 step 2. **Fix:** Expect Priya to be automatically requested. Make manual selection an `If this fails on camera` recovery that diagnoses invalid handles or CODEOWNERS configuration.

- **Issue 4: Scene 4 unconditionally creates a commit after the sessions have already committed their work**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** The plan and decomposition sessions complete normally and commit their outputs, leaving the authoring branch clean. Beat 8 then runs `git commit`, which exits with “nothing to commit,” producing an unscripted failure in the flagship scene.
  - **Details:** **Violation:** A scripted action on the normal path must succeed or carry an explicit expected no-op/recovery. **Impact:** A recorder must stop or improvise around a failed command, and Walk 4 cannot match its literal action sequence. **Evidence:** Scene 4 beat 5 explicitly says the plan session finishes “with a summary and a commit”; completion of the decomposition session similarly lands its generated set. Beat 8 nevertheless runs `git add -A` followed by an unconditional commit. Scene 5’s analogous lifecycle correctly proceeds directly to PR creation, reinforcing that completed sessions already committed. **Location:** `scene-4-first-module.md` beat 8; checklist Walk 4 step 7. **Fix:** Remove the extra commit, or first inspect `git status` and commit only if genuine residual changes exist, with both outcomes scripted.

- **Issue 5: The CI log cannot prove the two module paths required by Walk 9**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** The aggregate job passes normally. Its shell loop runs `pytest -q` twice, but successful quiet pytest output contains dots and summaries rather than the expanded `services/app/` and `services/greeter/` arguments. The operator therefore cannot establish the checklist’s required observation that the log names both modules.
  - **Details:** **Violation:** A UAT item must have an expectation that can be judged from what the walk displays. **Impact:** Walk 9 cannot reach a defensible PASS/FAIL verdict for the central claim that both modules were tested. **Evidence:** The workflow uses `python -m pytest -q "$module"` without `echo`, `set -x`, or verbose collection output, while Walk 9 requires that “the check log must show pytest running against BOTH services/app/ and services/greeter/.” GitHub’s run shell does not echo each expanded loop command. **Location:** CI block in `hello-world.md` and `scene-4-first-module.md` beat 13; checklist Walk 9 expectation. **Fix:** Echo each module path before invoking pytest, or change the expectation to an observation the existing log actually exposes.

- **Issue 6: The Azure DevOps spot check assumes a project, repository, and `main` branch that no walk creates**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The operator enters Walk 11 with the stated state—signed into a scratch Azure DevOps organization—but no project or repository. The requested repository policy pages, branch policies, and clone URL do not exist, so none of the four checks can be performed.
  - **Details:** **Violation:** Each checklist item must establish its dependencies in its “Where you are” preamble or through earlier walks. **Impact:** Walk 11 cannot produce a verdict without unplanned repository setup. **Evidence:** Walk 11 deliberately does not execute the alternate scene and its preamble mentions only a scratch organization. Its first action immediately requires `Project Settings > Repositories > a repo` and policies on `main`. No checklist precondition or earlier walk establishes that ADO repository. **Location:** Checklist Walk 11. **Fix:** Require a pre-created scratch project/repository with an initialized `main`, or include the minimal creation/initialization steps before checking policies.

- **Issue 7: The GitHub script asks the operator to set and observe an approval count of zero, which is not a selectable approval value**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** On a personal GitHub repository, the operator enables “Require a pull request before merging” and then looks for a required-approval value of zero. GitHub’s approval requirement is enabled separately and its selectable counts begin at one, so the scripted control and expected displayed `0` are absent.
  - **Details:** **Violation:** UI actions and expected labels must be literal rather than semantic paraphrases. **Impact:** Scene 3 and Walk 3 cannot be performed or observed as written, and the later “raise 0 → 1” instruction names the wrong UI transition. **Evidence:** The script says “set required approvals to 0” and expects the rule to show zero; GitHub represents this state by leaving the approval requirement disabled, not by selecting zero approvals. **Location:** `scene-3-dabbler-setup.md` beat 11; checklist Walk 3 step 9 and expectation; scene 5 beat 7. **Fix:** Say to leave **Require approvals** off initially, then enable it with one required approval in Part 5.

- **Issue 8: The personal-repository collaborator flow names a role selector that is not present**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Priya opens the collaborator dialog on the explicitly scripted personal-account repository and is told to choose the Write role. Personal-repository collaborators receive push access through the invitation; GitHub’s organization repository-role selector is not part of this flow.
  - **Details:** **Violation:** The scene promises literal GitHub UI actions. **Impact:** The future recorder encounters a missing control in a known high-risk host-UI beat and must improvise on camera. **Evidence:** Scene 2 establishes a personal-account repository, while scene 5 and Walk 7 instruct `Add people > Sam's handle > Write role`. **Location:** `scene-5-second-module.md` beat 2; checklist Walk 7 step 1. **Fix:** Script the personal-repository invitation UI as it actually appears and explain that accepting the collaborator invitation grants the needed write access.

- **Issue 9: The macOS direct-key probe is labeled as usable on macOS but fails in the default shell**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A macOS recorder pastes the “On macOS or Linux” snippet into VS Code’s default zsh terminal. `${!n}` is Bash indirect expansion and zsh reports a bad substitution, stopping the credential-presence beat.
  - **Details:** **Violation:** The alternate take promises a copy-pasteable action for macOS or Linux. **Impact:** A common supported platform cannot complete the direct-API scene as written. **Evidence:** Beat 4 uses `${!n}` without invoking Bash, while the surrounding instructions say only “On macOS or Linux.” **Location:** `scene-1-alt-direct-api.md` beat 4. **Fix:** Invoke `bash` explicitly or use a shell-portable lookup such as `printenv "$n"` without printing the value.

- **Issue 10: The Azure DevOps alternate invokes `az` without ever installing Azure CLI**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A viewer follows scene 1 and then substitutes the ADO scene as directed. Scene 1 installs `gh`, not Azure CLI. Beat 5 immediately runs `az login`, which fails with command not found on a normal clean machine.
  - **Details:** **Violation:** The alternate take must start from its declared state and provide literal actions needed to reach its goal. **Impact:** The ADO take stops before it can prove the CLI path used for pull requests. **Evidence:** Its starting state requires only “Scene 1 finished”; neither scene-1 variant installs Azure CLI. Beat 5 installs only the `azure-devops` extension, which itself requires an existing `az` executable. **Location:** `scene-2-alt-azure-devops.md` starting state and beat 5. **Fix:** Add literal Azure CLI installation and version verification before `az login`, with platform-specific commands or a clearly declared prerequisite.

- **Issue 11: The direct-API alternate’s AI-agent installation beat is not literal or reproducible**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A direct-key viewer reaches beat 5 without an AI agent installed. The script says to install “whichever agent you use—Claude Code, Codex, or Gemini Code Assist” but gives no extension/package identity, installation action, authentication path, or canonical choice. Every direct-key recorder must invent the beat.
  - **Details:** **Violation:** The session contract requires every beat to contain a “literal on-screen action” and “literal expected on-screen result,” with no paraphrase. **Impact:** The alternate take cannot be followed live as authored, and later scenes depend on the unspecified chat panel. **Evidence:** Beat 5’s `Do` is an open-ended product choice rather than a copy-pasteable command or UI sequence; its `See` merely says an unspecified agent panel is open. **Location:** `scene-1-alt-direct-api.md` beat 5. **Fix:** Choose one canonical agent and provide exact installation, opening, and sign-in actions; move other agents to a brief equivalence note.

#### NITS

- **Nit:** Scene 3 calls both CODEOWNERS and `monorepo-ci.yml` “comment-only,” and scene 4 calls the adapted PR run the workflow’s first execution. The supplied gate evidence says the scaffolded workflow is already active on pushes to `main`, and scene 3 performs such a push. The narration is false even though later CI still operates.
- **Nit:** `video/README.md` says the scripts “were dry-run end to end,” while the checklist repeatedly says “NOT YET WALKED.” This should become past tense only after Session 4 succeeds.
- **Nit:** Several checklist entries cite nonexistent `s3-literal-fidelity-check.md`; the committed artifact is `s3-authoring-gates.md`.
- **Nit:** The literal gate overstates its proof. It uses a hand-maintained allowlist and whitespace-normalized substring checks, so it does not prove that “every literal” is covered or that the 44 prose literals are byte-identical.
- **Nit:** `s3-authoring-gates.md` says the gates ran “on the committed tree,” but the supplied status shows all Session 3 deliverables still uncommitted at this pre-close step.
- **Nit:** Scene 3’s OBS note says browser beats are 9–10, but the browser work is beats 11–12. Scene 4 says the second window appears at beat 9, but it is opened at beat 11.
- **Nit:** Scene 1 never visibly verifies the VS Code version. Beat 3 says to use Help > About but also says not to open the dialog, and its `See` clause verifies only Python.
- **Nit:** Scene 2’s `hello-modules-1` fallback does affect downstream literal output: the canonical worktree directory would also inherit the changed repository-root name.
- **Nit:** The checklist requires the Copilot CLI to be authenticated before Walk 1, while Walk 1’s starting state requires it not to be signed in so that authentication can be tested.
- **Nit:** Scene 1’s smoke-test recovery says later scenes use whichever replacement model is named there, but later interactive sessions and router dispatch do not pass that smoke-test model selection forward automatically.