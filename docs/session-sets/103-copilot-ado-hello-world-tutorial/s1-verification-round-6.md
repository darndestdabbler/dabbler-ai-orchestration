ISSUES FOUND

### Issue 1: `Not set` does not close an inherited Azure DevOps bypass permission
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** The project creator follows the documented alternative and leaves **Bypass policies when pushing** as `Not set`. Because project administrators commonly inherit `Allow` through another group, `Not set` does not override that permission. The direct-push test then succeeds, placing the throwaway commit on `main` and defeating the protected-trunk guarantee. This is probable because the tutorial explicitly identifies the primary operator as the project administrator most likely to inherit bypass rights.
- **Details:**
  - **Violation:** The tutorial promises that direct pushes are rejected “for everyone — including Priya,” but says to set the bypass permissions to **“Deny (or ‘Not set’)”**. The UAT likewise accepts `Deny/Not set`.
  - **Impact:** A documented configuration can leave the administrator able to bypass branch policies. The test may also mutate `main` before the operator discovers the configuration is ineffective.
  - **Evidence:** `docs/tutorials/module-team-hello-world-copilot-ado.md`, Part 3 step 8, and UAT Walk 4 both present `Not set` as equivalent to `Deny`. In Azure DevOps ACL inheritance, `Not set` leaves an inherited `Allow` effective; only an applicable `Deny` overrides it.
  - **Correct answer:** Require `Deny` whenever the effective permission is inherited as `Allow`; only permit `Not set` after verifying the effective permission is not allowed.
- **Location:** Tutorial Part 3 step 8; UAT Walk 4 steps 5–6 and its expectation.
- **Fix:** Remove the unconditional “or Not set” alternative. Instruct the operator to inspect the effective permission and set an explicit `Deny` for the administrator or appropriate group when inherited `Allow` is present.

### Issue 2: The promised Azure DevOps project bootstrap is missing
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A team has a new Azure DevOps organization but no project and follows this standalone tutorial expecting the required project/repository/membership bootstrap. Part 1 cannot begin because repositories and project membership require a project, yet the tutorial supplies no project-creation action. This is a probable path for the stated new-team and brand-new-scratch-environment audience.
- **Details:**
  - **Violation:** The session plan explicitly requires an executable ADO bootstrap covering **“project/repo/membership.”**
  - **Impact:** The supposedly standalone bootstrap is not executable from the required starting state; the operator must independently invent a material setup step before repository or membership instructions apply.
  - **Evidence:** Part 0 instead makes an existing “Azure DevOps organization + project” a prerequisite. Part 1 creates only the repository and grants membership. UAT Walk 2 also assumes a new project already exists.
  - **Correct answer:** Include a literal project-creation step, including the scratch project name, visibility, version-control choice, and navigation into that project before repository creation.
- **Location:** Tutorial Parts 0 and 1; UAT Walk 2.
- **Fix:** Add project creation to Part 1 and mirror it in Walk 2, or explicitly revise the deliverable contract if project provisioning is intentionally operator-supplied.

### Issue 3: Every discoverability link falsely says the unvalidated draft was validated live
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A user discovers the tutorial through Quick Start, the base tutorial, or the Marketplace-facing README. Each surface affirmatively describes it as a **“validated-live draft,”** so the user reasonably treats the ADO and Copilot instructions as live-tested even though Session 2 has not occurred. This is certain for users reading those link descriptions and defeats the draft gate intended to prevent premature reliance.
- **Details:**
  - **Violation:** The task requires cross-links to remain **“behind the draft status”** and be explicitly marked. The document banner instead states **“DRAFT — not yet validated live.”**
  - **Impact:** Public onboarding surfaces misrepresent the tutorial’s validation status and undermine the two-session operator-validation gate.
  - **Evidence:** The contradictory phrase appears in `docs/quick-start.md`, twice in `docs/tutorials/module-team-hello-world.md`, and in `tools/dabbler-ai-orchestration/README.md`.
  - **Correct answer:** Describe it as a “draft pending live validation” until Session 2 passes.
- **Location:** Quick Start module-team link; base tutorial introductory link and Part 7 pointer; extension README link.
- **Fix:** Replace every “validated-live draft” occurrence with “draft pending live validation” or equivalent.

#### NITS

- **Nit:** UAT Walk 4 leaves the rejected throwaway commit on local `main`. Walk 5 branches from that state, so its authoring PR includes the unrelated throwaway change. Reset local `main` to `origin/main` after confirming rejection.
- **Nit:** UAT Walk 8 says the Open PR modal title defaults to `Session set <slug>`. That is the default PR title; the confirmation modal is titled `Push this branch and open a PR?`, as the tutorial itself correctly states.
- **Nit:** Optional Walk 11 restores the CLI setting but leaves the local and remote `session-set/uat-floor` branch, `floor.txt`, and potentially a draft PR behind. Add explicit cleanup.