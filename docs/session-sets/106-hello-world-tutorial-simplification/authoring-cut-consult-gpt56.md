# Authoring consult — GPT-5.6 "Sol" on what to cut

> Raw verdict, pinned model `gpt-5.6` (openai), task_type `analysis`,
> reasoning_effort high. Requested by the operator during spec authoring
> (2026-07-28) in answer to "which heavy parts get cut?".

---

# Recommended disposition

| Item | Decision | Reason and concrete replacement |
|---|---|---|
| **A. Monorepo CI** | **KEEP-BUT-SHRINK** | Testing is load-bearing; path filtering is not. Replace the ~100-line workflow with one always-running job that runs every module’s tests on every PR and push to `main`; `pytest` already fails when a module collects zero tests. |
| **B. CODEOWNERS / required reviewers** | **KEEP-BUT-SHRINK** | Keep ownership as a short team-project callout, not a full guardrail exercise. Show two CODEOWNERS lines, manually request the teammate’s review in the tutorial, and delete the separate module→owner roster entirely. |
| **C. Branch protection** | **KEEP-BUT-SHRINK** | Without enforcement, the PR flow looks ceremonial. Configure “require PR” after initial setup, add the `test` required check after its first run, and enable one approval only in the teammate section; retain one sentence about GitHub Free requiring a public repo. |
| **D. Release, deploy, hotfix, rollback** | **MOVE-TO-A-SEPARATE-DOC** | None of this belongs in hello world, and checking out a tag is not an honest deployment tutorial. Rework it into a focused “Release and recovery operations” guide. |
| **E. Practice run, then delete everything** | **CUT** | This is the worst section in the tutorial: it spends two AI sessions teaching readers that generated work is disposable ceremony. Rename `Default` to the real first module, adapt the starter sets, and run the plan/decomposition lifecycle once as real work whose outputs are kept. |
| **F. Git worktrees** | **KEEP-BUT-SHRINK** | Worktree isolation prevents the actively harmful habit of letting an AI session modify `main`, and it remains useful for a solo developer. Teach only: open worktree, open its VS Code window, run the set, then finalize it after merge; stop explaining folder internals and parallel-window theory. |
| **G. Release command coverage and “Git under the hood” appendix** | **MOVE-TO-A-SEPARATE-DOC** | Move the three release commands into the release/recovery guide. Delete the raw-git appendix from this tutorial entirely; confirmation dialogs already show the exact commands, while stable command semantics belong in command reference documentation. |
| **H. Fifteen-item self-check** | **KEEP-BUT-SHRINK** | Fifteen checks turn completion into an audit. Keep five outcome checks covering module declaration, completed sets, working output, green protected PRs, and cleaned-up worktrees. |
| **I. 390-line workflow review prompt** | **CUT** | Delete the prompt and remove all “graduation check” links. A 390-line meta-audit for a hello-world repository is indefensible; salvage the seven principles as a one-page advanced checklist only if they have independent value. |
| **J. Other material** | **CUT** | Delete the separate CLI part, repeated UI narration, edge-case catalog, duplicated authoring mechanics, and long host-specific instructions. The tutorial should demonstrate the happy path and link to troubleshooting/reference material rather than impersonating it. |

## A. Exact replacement CI

Use approximately this workflow—one aggregate required check, no `dorny/paths-filter`, no per-module jobs, and no separate `all-modules` job:

```yaml
name: Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python -m pip install pytest
      - name: Test every module
        run: |
          for module in services/*/; do
            python -m pytest -q "$module" || exit 1
          done
```

Add it on the first implementation branch, when at least one module and test exist. Because each module directory is tested separately, a new module with zero tests fails instead of passing behind another module’s tests.

The entire Azure variant should be one callout:

> **Azure DevOps:** Put the same test command in your organization’s standard pipeline and require that pipeline through Build Validation. See the Azure DevOps host setup guide.

Do not include Azure Pipelines YAML here.

## B. Exact replacement ownership text

In the teammate section, use only:

```text
/services/greeter/  @priya-gh
/services/app/      @sam-gh @priya-gh
```

Then say:

> On a real team repository, add equivalent CODEOWNERS rules so module reviews are routed automatically. This tutorial requests Priya’s review manually because rules added by the same PR are not a useful demonstration of routing.

Delete:

- Ownership rules for plans and shared documentation.
- The separate owner roster.
- The audit rationale for comparing the roster with CODEOWNERS.
- The explanation of author self-review behavior.
- The tutorial discussion of “Require review from Code Owners.”

Generic branch protection requiring one teammate approval is sufficient here.

## C. Exact branch-protection sequence

Branch protection must accommodate the solo path:

1. **After initial framework setup:** require changes to `main` to arrive through a PR. Require **zero approvals** so a solo owner can merge.
2. **After the first module’s CI has run:** make the single `test` job required.
3. **When the teammate is added:** change required approvals from zero to one.

One variant callout is enough:

> **GitHub Free:** This exercise requires a public repository for branch protection. For a private practice repository, follow the same PR flow voluntarily and enable the rule when using a plan that supports it.

Do not include click-by-click descriptions of every GitHub setting or branch-cleanup option.

## E. Replacement for the throwaway lifecycle

The new flow should be:

1. Scaffold the repository.
2. Rename **Default** to **Greeter**.
3. Set its code root to `services/greeter`.
4. Adapt `001-default-plan` to the actual greeting scope.
5. Run the plan set and decomposition set as real work.
6. Keep the generated plan and implementation set.
7. Run the implementation set in a worktree.

Do not delete and recreate anything. Do not separately hand-author another plan and then invoke another session-set-generation prompt—the starter lifecycle already exists to do that work.

## F. Exact worktree coverage

The entire conceptual explanation should be approximately:

> Each AI work set runs in a worktree so its changes are isolated from `main`. Open the set’s worktree, run the session in the new VS Code window, and finalize the worktree after its PR merges.

Then show:

```bash
python -m ai_router.worktree open <set-slug>
```

Followed by only three actions:

1. Open the created folder in a new VS Code window.
2. Click the set, paste its starter line into Copilot CLI, and review the session.
3. After merge, run **Dabbler: Finalize merged set** from the main checkout.

Use one short Windows virtual-environment callout if invocation actually differs. Do not duplicate full Windows and Unix blocks repeatedly.

## H. Exact five-item final check

Replace the existing checklist with:

- [ ] `docs/modules.yaml` declares the expected module or modules, and each generated set is assigned to the correct module.
- [ ] The implementation sets appear as **Complete** in the Work Explorer.
- [ ] The program on `main` prints the expected greeting; after the teammate section, the app output includes the composed second-module behavior.
- [ ] The PR’s `test` check passed and branch protection prevented bypassing the PR flow.
- [ ] `Dabbler: Finalize merged set` removed the session worktree and synchronized the local `main`.

---

# J. Additional cuts

Delete all of the following.

### Prerequisite and transport bloat

- Delete **Part 0.5** as a separate part.
- Make GitHub Copilot CLI the primary prerequisite and show one install/authenticate/verify sequence.
- Remove the requirement for three provider API keys from the primary path.
- Keep direct provider access as a three-line variant callout.
- Fold `gh auth status` into prerequisites; do not explain host detection, executable path overrides, browser fallback internals, PAT validation, or confirmation-dialog wording.

### Introductory bureaucracy

Delete:

- The required primer reading.
- The formal recommendation link from the opening.
- The “graduation check.”
- The tutorial-pair maintainer note and synchronization discipline.
- The cast table from the solo portion.
- Claims about taking half a day.
- Every reference to the deleted three-person and Azure-specific cuts.

A hello-world tutorial must be independently usable without prerequisite architecture reading.

### Repeated UI narration

Delete most instances of:

- “Where you are.”
- “Expect.”
- “Good to know.”
- Exact bucket and action-strip inventories.
- Descriptions of the form disappearing and reappearing.
- Refresh instructions.
- Repair commands.
- Import-plan alternatives.
- Settings names and fallback behavior.
- “The human decision is to click…” repeated at every remote action.

Keep only observable results that tell the reader whether a major step succeeded.

### Git ceremony

Delete:

- Separate manual authoring branches for every plan and generated set where the real starter lifecycle can produce them.
- Repeated `git switch main`, `git pull`, and `git branch -d` sequences.
- The long squash/rebase branch-deletion warning.
- Branch-name collision theory.
- Remote-branch hygiene lectures.
- The explanation that deleting branches does not delete PR history.

Show one ordinary branch/commit example and let Dabbler own the session branch cleanup it advertises.

### Product edge cases

Delete from hello world:

- `Unassigned` behavior.
- Missing-module-plan warning behavior.
- Detached-HEAD refusal behavior.
- Idempotency details.
- Exact confirmation-dialog titles.
- Custom GitHub Enterprise host settings.
- Azure legacy URL detection.
- Missing CLI browser fallback behavior.
- Discussion of code-less integration modules.
- The “one developer per module” conflict essay.
- The exhaustive distinction between autonomous local and gated remote operations.

Those are reference or troubleshooting topics.

---

# Cuts ranked by lines saved per teaching lost

Approximate savings are directional and should not be added mechanically because some current sections overlap.

1. **E — Delete the practice-and-reset cycle:** saves roughly **90–120 lines plus two wasted AI sessions**; teaching quality improves.
2. **J — Delete repeated UI narration and edge cases:** saves roughly **200–300 lines**; essentially no happy-path teaching is lost.
3. **I — Delete the workflow review prompt:** saves **390 maintained lines** outside the tutorial; no hello-world teaching is lost.
4. **D/G — Remove release operations and the raw-git appendix:** saves roughly **150–220 tutorial lines**; only advanced operational material is displaced.
5. **J — Collapse host and transport setup:** saves roughly **100–150 lines**; variants remain discoverable without dominating the path.
6. **A — Replace monorepo CI with one test job:** saves roughly **75–90 lines** while retaining the actual lesson: untested changes cannot merge.
7. **B — Reduce ownership machinery to two example lines:** saves roughly **20–35 lines**; review ownership remains visible.
8. **H — Reduce fifteen checks to five:** saves roughly **10–15 lines** with no meaningful loss.
9. **F — Shrink worktree explanation:** saves roughly **20–30 lines**, but do not remove the workflow itself.
10. **C — Shrink branch-protection instructions:** modest savings, but the underlying guardrail must remain.

---

# K. Shortest honest new part list

Target: **240 source lines total**, including commands, YAML, inline variants, and the checklist. No appendices.

1. **Part 1 — Install and verify the tools**  
   **Video scene 1:** install/verify prerequisites.

2. **Part 2 — Create and clone the GitHub repository**  
   **Video scene 2:** create and clone the remote.

3. **Part 3 — Set up Dabbler and name your first module**  
   **Video scene 3:** initial framework setup.  
   Rename `Default` to `Greeter`, adapt rather than discard the starter lifecycle, commit setup, and require PRs on `main`.

4. **Part 4 — Build and ship the first module**  
   **Video scene 4:** build the first module.  
   Run the real plan/decomposition lifecycle, implement in a worktree, add the minimal CI job, open and merge the PR, finalize the set, and require the `test` check. End with: **“Solo repositories can stop here.”**

5. **Part 5 — Add a teammate and a composing module**  
   **Video scene 5:** add the second module.  
   Invite and clone, add `app`, declare `touches: [greeter]`, create its set with a prerequisite on the completed greeter set, require one approval, and run the set using the already-taught worktree flow.

6. **Part 6 — Review, merge, and clean up**  
   **Video scene 6:** pull request and merge.  
   Priya reviews the composition, CI runs all module tests, Sam merges, finalizes, runs the composed app, and completes the five-item check.

In this tutorial, “ship” should explicitly mean **merged and green on `main`**, not deployed to an environment. Actual releases belong in the release guide.

---

# L. Load-bearing material

## Must remain hands-on

### Minimal CI

**Do not drop it.** A tutorial that asks readers to merge AI-authored code without an automated test gate teaches exactly the wrong habit.

The simple all-tests job is better for this toy than path filtering:

- It is understandable.
- It runs every module.
- It is one required check.
- It avoids skipped-check semantics.
- It still rejects a module with zero tests.

Path-scoped optimization should survive only as one pointer:

> Large repositories can add path filtering, but should retain one always-running aggregate required check.

### Branch protection

**Do not drop it.** Otherwise the PR is merely theater and readers can bypass the entire workflow with a push.

Keep it hands-on, but stage it correctly:

- Solo: require PR and green `test`; no approval.
- Team: additionally require one approval.

### Worktree isolation

**Do not drop it.** Without it, the flagship tutorial implicitly teaches readers to let an AI modify the trunk checkout directly.

Keep the behavior; delete the lecture. Its primary justification in the solo section is isolation, not parallelism.

### Human-reviewed PR and finalization

**Keep both.** Opening the PR and finalizing the merged set are the framework’s visible development loop and should be demonstrated at least once in full. The second module should say “repeat the same open/finalize flow” rather than re-explaining every dialog.

### Plan → decomposition → implementation

**Keep the lifecycle once, using real work.** Cutting the throwaway exercise is correct; cutting the lifecycle itself would hide how the framework turns a project idea into runnable session sets.

The second module should refer back to the first module’s steps rather than repeat their explanation.

## May become a one-line real-project pointer

- **CODEOWNERS:** one short example/pointer in the teammate section.
- **Path-scoped CI:** one sentence pointing large monorepos to an advanced CI guide.
- **Azure branch policies and Build Validation:** one inline equivalent per GitHub-specific guardrail.
- **Direct provider API keys:** one transport-variant callout.
- **Release commands:** one “Next: release and recovery operations” link after completion.

## Should vanish entirely from this tutorial

- Separate module-owner roster.
- Full path-filter implementation.
- Per-job hand-written zero-test scripts.
- Vacuous rollout exceptions.
- Skipped-required-check analysis.
- Workflow-review graduation prompt.
- Raw-git appendix.
- Hotfix and rollback drills.
- Detached-HEAD teaching.
- Branch cleanup theory.
- Numbering-race theory.
- Form/tree implementation details.
- Repeated claims about human authorization.
- Detailed Azure CLI/PAT setup.

---

# M. Use a composing second module

**Choose composition. Two independent modules would be wasted repetition.**

Use:

- **Module A: `greeter`**, owned by Priya, under `services/greeter`.
- **Module B: `app`**, owned by Sam, under `services/app`.
- `app` imports `greeter`, adds the time or presentation behavior, and prints the final line.
- `app` declares:

```yaml
- slug: app
  title: "App"
  codeRoots:
    - services/app
  planPath: docs/modules/app/project-plan.md
  touches:
    - greeter
```

Its implementation set should declare the completed greeter set as a prerequisite.

This teaches, for only a few additional lines:

- A real module dependency.
- `touches:`.
- Session prerequisites.
- Cross-owner review.
- Why CI runs all modules.
- Composition without inventing a third “integration owner.”

Do not claim that these two particular implementation sets run in parallel; they intentionally do not. Worktrees are introduced first as isolation, while parallelism remains a capability readers can use later for independent sets.

The owner’s “two modules” and “one document” decisions are correct. The failure was not merely having three people; it was combining quickstart, UI reference, monorepo governance, host administration, release engineering, incident drills, and a workflow audit into one supposed hello world.
