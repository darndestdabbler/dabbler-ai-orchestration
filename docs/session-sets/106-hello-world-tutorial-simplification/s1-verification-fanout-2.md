# ISSUES FOUND

## Issue 1: The required AI interaction surface is never installed or launched

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A new reader installs exactly the listed tools, including the standalone Copilot CLI, then reaches Part 4 and is told to paste into “a Copilot chat in VS Code.” Installing `@github/copilot` does not create the VS Code Copilot Chat surface, and the tutorial never tells the reader to launch `copilot` in the integrated terminal. This is probable on the advertised clean-start path and stops the first AI-led session.
- **Location:** `docs/tutorials/hello-world.md`, Part 1 step 4 and Part 4 steps 1–4.
- **Details:**
  - **Violation:** The task requires a “GitHub + Copilot CLI worked path” and applies the rule “never teach an unrunnable step.”
  - **Impact:** The reader cannot start the plan, decomposition, or implementation sessions.
  - **Evidence:** Part 1 installs only the standalone CLI, while Part 4 repeatedly instructs use of “a Copilot chat in VS Code.” The retired tutorial explicitly treated **Copilot Chat in VS Code** and the **Copilot CLI seat** as separate prerequisites, confirming they are not interchangeable setup steps.
- **Fix:** Either consistently teach the CLI path—open the VS Code terminal, run `copilot`, and paste the starter line there, including in each new worktree window—or add the GitHub Copilot VS Code extension as a separate prerequisite. The direct-API variant must also name the path-aware orchestrator used to run sessions.

## Issue 2: The sole Copilot CLI installation command assumes an undeclared Node/npm prerequisite

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A reader satisfying the stated audience contract—Git knowledge plus the explicitly listed VS Code and Python prerequisites—runs `npm install -g @github/copilot` on a machine without Node.js. The first command fails with `npm` not found, before the tutorial can begin. Node is not implied by VS Code, Python, or Git, so this is probable for a meaningful portion of first-time users.
- **Location:** `docs/tutorials/hello-world.md`, Part 1 step 4.
- **Details:**
  - **Violation:** The tutorial says “Nothing else is assumed” but relies on an unlisted executable.
  - **Impact:** The main Copilot CLI path stops during installation.
  - **Evidence:** The only installation command is `npm install -g @github/copilot`; Node/npm is absent from the prerequisites and no alternative installer is supplied.
- **Fix:** Add the supported Node.js/npm prerequisite and verification command, or use/link a Copilot CLI installation route that does not silently assume npm.

## Issue 3: AI-generated implementation-set names are treated as fixed literals

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** The decomposition session generates a valid name other than `005-greeter-hello`, which the tutorial explicitly admits may happen by saying “or similar.” The reader then copies the literal worktree command or later prerequisite YAML. The worktree command targets a nonexistent set, or the `app` set references a nonexistent prerequisite and remains blocked. AI-generated naming is inherently variable, making this probable rather than hypothetical.
- **Location:** `docs/tutorials/hello-world.md`, Part 4 steps 2–3 and Part 5 step 6.
- **Details:**
  - **Violation:** The document must contain runnable literal commands and must not assume runtime-generated identifiers.
  - **Impact:** The first implementation cannot start, or the second implementation is blocked by an invalid prerequisite.
  - **Evidence:** Part 4 says to expect “`005-greeter-hello` or similar” and to note the actual name, but the next command hard-codes `005-greeter-hello`. Part 5 again hard-codes that slug in `prerequisites:`.
- **Fix:** Use an explicit placeholder such as `<greeter-implementation-set>` in both locations and instruct the reader to substitute the exact name produced in Part 4.

## Issue 4: The Part 5 module-declaration pull request is not performable as written

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Priya follows steps 2–4 in her synchronized `main` checkout, then reaches “Land the manifest and CODEOWNERS edits as their own small pull request.” No branch creation, commit, or PR-opening sequence is provided. A direct push is rejected by the protection configured in Part 3, while `Dabbler: Open PR for this set` cannot be used from `main`. The tutorial assumes only commit/push knowledge and has not taught a manual authoring-branch flow, so readers are likely to stop or bypass the guardrail.
- **Location:** `docs/tutorials/hello-world.md`, Part 5 steps 2–5.
- **Details:**
  - **Violation:** The tutorial must keep branch protection hands-on and must not teach an unrunnable transition.
  - **Impact:** The `app` declaration, CODEOWNERS rules, plan stub, and lifecycle sets cannot be landed through the required PR flow.
  - **Evidence:** Part 3 says every later change reaches `main` through a PR. Part 5 performs edits and then gives only the sentence “Land … as their own small pull request,” with no non-`main` branch or executable sequence. `Dabbler: New Module` also creates more than the two named files: its plan stub and lifecycle sets must be included.
- **Fix:** Create an authoring branch before the edits, explicitly stage all `New Module` outputs plus `docs/modules.yaml` and `.github/CODEOWNERS`, commit, run `Dabbler: Open PR for this set`, obtain approval, merge, and finalize or manually resynchronize the main checkout.

## Issue 5: Sam’s clone predates the `app` module and is never updated

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Sam clones in Part 5 step 1. Priya then creates and merges the `app` module and its lifecycle sets in steps 2–5. Step 6 immediately tells Sam to run those sets, but his checkout still predates them. They do not appear in his Work Explorer and their specs do not exist locally. This occurs on every literal execution of the stated ordering.
- **Location:** `docs/tutorials/hello-world.md`, Part 5 steps 1–6.
- **Details:**
  - **Violation:** The severity rubric explicitly identifies “a forward reference to something never created” in the reader’s current state as material.
  - **Impact:** Sam cannot run the `app` plan or decomposition set.
  - **Evidence:** Clone occurs before `Dabbler: New Module app` and before its PR is merged; no `git pull --ff-only` or equivalent synchronization is present before “Sam now runs `app`’s lifecycle.”
- **Fix:** Move Sam’s clone after the declaration PR merges, or explicitly have Sam run `git pull --ff-only` and refresh/open the Work Explorer before running the lifecycle.

## Issue 6: Sam’s required per-machine Copilot setup is omitted

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A real teammate follows Part 5 exactly: accepts the invitation, clones, and runs only `Dabbler: Install ai-router`. His `.venv` exists, but his machine may have neither an authenticated Copilot CLI nor a refreshed seat catalog matching its CLI version. Starting the plan session then fails authentication or the router’s fail-closed version check. Per-machine credentials and CLI versions make this a probable teammate-onboarding failure.
- **Location:** `docs/tutorials/hello-world.md`, Part 5 step 1.
- **Details:**
  - **Violation:** The primary path is Copilot CLI and the runtime findings say seat setup/version reconciliation is machine-specific.
  - **Impact:** Sam cannot run routed AI sessions and may also lack authenticated `gh` for opening his PR.
  - **Evidence:** The tutorial gives Sam only `Dabbler: Install ai-router`. The runtime artifact states that the CLI version pin commonly differs and directs readers to `Dabbler: Set Up Copilot Seat`; the retired walkthrough also explicitly required each teammate to authenticate and preflight their seat.
- **Fix:** Require Sam to satisfy the Part 1 CLI prerequisites, authenticate `copilot` and `gh`, run `Dabbler: Install ai-router`, then run `Dabbler: Set Up Copilot Seat` or the documented preflight before his first session.

## Issue 7: The CODEOWNERS example is presented as active configuration without requiring real handles

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A typical reader copies or uncomments `@priya-gh` and `@sam-gh`, although those are fictional tutorial handles. GitHub cannot route reviews to the actual collaborators, yet the document states that the rules route the correct reviewers. This will happen for virtually every reader unless their accounts coincidentally use those names.
- **Location:** `docs/tutorials/hello-world.md`, Part 5 step 3.
- **Details:**
  - **Violation:** The tutorial claims, “On a real team repository these rules request the right reviewers automatically.”
  - **Impact:** The repository ends with ineffective ownership routing, undermining the teammate-review objective while giving the reader false confidence.
  - **Evidence:** The literal block contains `@priya-gh` and `@sam-gh`, but no instruction says to replace them with the actual GitHub handles used when inviting collaborators.
- **Fix:** Label the handles as placeholders and explicitly require substitution with Priya’s and Sam’s actual repository-visible GitHub usernames before committing.

## NITS

- **Nit:** `docs/tutorials/hello-world.md`, Part 5 step 6 says the `app` set “shows as blocked … until `greeter`’s set is complete,” but the greeter set was completed in Part 4 before `app` exists. The dependency is still valid, but the promised blocked state will not be observable.
- **Nit:** The final worktree check uses only `.venv\Scripts\python.exe`; unlike the earlier worktree command, it omits the macOS/Linux `.venv/bin/python` equivalent.
- **Nit:** `docs/tutorials/release-and-recovery.md` supplies only a Bash `for …; do` hotfix-validation command. A reader using the tutorial’s Windows-first PowerShell path cannot run it without switching shells; the retired material included a PowerShell equivalent.
- **Nit:** `docs/quick-start.md` still promises “Setup and the raw commands each action runs,” but the replacement release document contains the raw commands and no host-CLI setup procedure.
- **Nit:** The Azure DevOps CI callout tells readers to add an “equivalent pipeline” but supplies neither the same test command nor a link to the named Azure host setup guide. This is weaker than the binding cut-list replacement, though it affects only the secondary host variant.
- **Nit:** The disclosed 269-line tutorial remains nine lines beyond the approximately 260-line ceiling. The permanent-numbering explanation in Part 3 and repeated confirmation-dialog narration in Part 4 are concrete candidates for trimming without removing a load-bearing step.