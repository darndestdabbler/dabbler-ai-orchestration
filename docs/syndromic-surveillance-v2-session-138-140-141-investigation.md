# Framework Investigation: `CT.DPH.Syndromic-Surveillance-V2` (Sessions 138, 140, 141) & Session Plan / JSON Syncing

**Date:** 2026-11-16  
**Target Repository Analyzed:** `C:\Users\adm.dennis.mitchell\source\repos\CT.DPH.Syndromic-Surveillance-V2` (running `dabbler-ai-router 3.29.0`)  
**Framework Repository:** `dabbler-ai-orchestration`

---

## Executive Summary

A forensic audit of `CT.DPH.Syndromic-Surveillance-V2` (specifically Sessions 119, 120, 138, 140, and 141) and the `dabbler-ai-router` source code identified **six distinct framework and instruction defects** that explain both why the Mechanic and Rollback were repeatedly needed and why staff observed the AI Author / Reviewer reporting or operating against the wrong session plan.

The two headline findings are:

1. **Why the AI Author submits the wrong session plan (and why rollbacks were required in S119, S120, S138, S140, and S141):**
   `drive.ts` (`planAsk`) explicitly instructs the AI Author to write its work plan to a generic scratch path: `(for example .dabbler/scratch/plan.json)`. Because `.dabbler/` is gitignored and never cleaned between sessions, `.dabbler/scratch/plan.json` persists from earlier sessions. When the AI Author uses its `create` tool (which refuses to overwrite an existing file) or runs `create` and `dabbler session report --answer-file .dabbler/scratch/plan.json --next` in parallel/sequence without noticing `create` failed, `session report` reads the **previous session's `plan.json`**, stamps the **new** `session_number` onto it (`stampAnswer`), and permanently locks the session's `activity-log.json` task declaration to the previous session's work plan. Because `dabbler session plan amend` cannot amend `task`, `steps` list, `id`, or `ask`, the Mechanic cannot repair it—forcing a full `dabbler session rollback`.
2. **Why the AI Author / Primary Reviewer appear to use the wrong session plan around review time:**
   - **During Verification (`verify/prompts.ts`):** `buildTaskBlock` sends the Primary Reviewer **both** `specExcerpt(sessionsDir, sessionNumber)` (from `docs/sessions/session-plan.md`) **and** `workPlanBlock(repoRoot, sessionNumber)` (from `.dabbler/runs/s<N>/driver/plan.json`, labeled *"The work plan the session was declared from"*). If `.dabbler/scratch/plan.json` was stale or drifted, or if the author edited `session-plan.md` mid-session (as in Session 140), the two plans in the review prompt disagree.
   - **Silent Whole-File Fallback in `extractSpecExcerpt` (`session.ts:689`):** If a session heading in `docs/sessions/session-plan.md` does not match `SESSION_HEAD_RE` (or hasn't been written yet), `extractSpecExcerpt` silently returns `specText.trim()`—the **entire 5,600-line `session-plan.md` file** containing all 141 sessions—both in `planAsk()` and in `buildTaskBlock()` during verification!
   - **Stale `sessions.json` Titles After Re-Planning (`writers.ts` / `progress.ts`):** When new sessions are added to `session-plan.md`, `sessions.json` is not updated until `dabbler session start` runs, and `healTitle` only updates `not-started` sessions. Furthermore, `dabbler session restore` restores a session with its corrupted `driver/plan.json` and `activity-log.json` declaration intact.

---

## Part 1: Forensic Timeline of Sessions 138, 140, and 141

### 1. Session 138 ("Keep one Results page and make run details reliably closable")
- **First & Second Rollbacks (`4fee519` at 16:21 and `bc0130e` at 16:33):**
  - Per the Mechanic Log (`729dcd9`) and `docs/session-plan-submission.md` (`b536f94`), Session 138 was hit by a stale `.dabbler/scratch/plan.json` left behind by an earlier session (and archived at 16:32). The operator had to roll back Session 138 twice (`4fee519`, `bc0130e`) before getting a clean start at 16:34 (`4bfc6dd`).
- **Two Step Rejections on Step `docs` during the third run (`session-138.html`):**
  - **Rejection 1 (`[files-changed-unchanged]`):** The author reported `docs/user-guide.docx` in `--files`, but had not actually regenerated it on disk before reporting.
  - **Rejection 2 (`[check-failed]` × 2):**
    1. The author's work plan declared a generator script (`pwsh -NoProfile -File scripts/build-user-guide.ps1`) as a **step check**. When the framework ran the check, it regenerated `docs/user-guide.docx` during check execution. Because the framework hashes the worktree before and after step checks, it rejected the check with: `exit 0 (the check changed the tree: docs/user-guide.docx)`.
    2. The author's work plan also declared `pwsh -NoProfile -File scripts/Test-TesterPackagingSafety.ps1` without its mandatory `-Output` parameter, which exited 1.
  - **Resolution:** The author used `dabbler session plan amend --step docs --checks-file ...` to replace the mutating generator check with the read-only `Test-UserGuideDocCurrent.ps1` and `Test-UserGuideContent.ps1` checks, and Session 138 verified and closed (`007f122`).

### 2. Session 140 ("Audit and correct documentation against implemented behavior")
- **Stale Plan Declaration (`21:51:07Z` → `21:51:29Z`):**
  - Only 22 seconds after `dabbler session next` issued the `plan` instruction for Session 140, the AI Author ran `dabbler session report --seq 1 --next --answer-file .dabbler/scratch/plan.json`.
  - Because `.dabbler/scratch/plan.json` still held **Session 138's work plan** (written at 16:35:22), `session report` read Session 138's JSON (`task: "Collapse the duplicate History/Results pages..."`, steps `results-page`, `nav-links`, `results-tests`, `docs`), stamped `session_number: 140` onto it, wrote it to `.dabbler/runs/s140/driver/plan.json`, and permanently recorded Session 138's task as Session 140's declaration in `docs/sessions/activity-log.json` and `docs/sessions/project-work-plan.md`.
  - Even though `docs/transcripts/session-140.html` showed **Session Plan: Session 140 (Audit and correct documentation...)**, the **Work Plan** section right below it was **Session 138's work plan**!
- **Mechanic Intervention (`729dcd9`):**
  - The operator opened the Mechanic. The Mechanic diagnosed that `.dabbler/scratch/plan.json` from Session 138 had been reused and moved `.dabbler/scratch/plan.json` into `.dabbler/scratch/archive-2026-11-06/plan-s138.json`.
  - However, **the Mechanic had no CLI verb to fix the session**: `dabbler session plan amend` only modifies a single step's `files` or `checks` (or `max_rounds` / `drop_non_goal`), and `declareSessionTask` in `writers.ts` refuses to overwrite an existing `task-declaration` entry in `activity-log.json`.
- **Cancel → Restore Trap → Rollback (`cd7f951` → `da520d8` → `bd59c5b`):**
  - The operator first cancelled Session 140 (`cd7f951`, reason: `"S140 declared from stale S138 scratch plan"`), which committed a cancelled transcript `docs/transcripts/session-140.html` (`29c0ce4`).
  - The operator then tried `dabbler session restore` (or reverted the cancel in `570949e` / `da520d8`), discovering that restoring a cancelled session keeps the exact same corrupted `.dabbler/runs/s140/driver/plan.json` and `activity-log.json` task declaration.
  - Finally, the operator ran `dabbler session rollback` (`bd59c5b`), which reset Session 140 to `not-started` and moved `s140` to `.dabbler/superseded-runs/`, allowing Session 140 to run cleanly (`6bfa843`, `0ac3fa4`).
  - *(Note: During `bd59c5b`, `rollback` also re-checked-out the cancelled `docs/transcripts/session-140.html` because `rollback` preserves any transcript page with `<div class="cancelled"`; see Defect 5 below.)*

### 3. Session 141 ("Gate validation and packaging on accurate, current documentation")
- **Rollback at Start of Session 141 (`a3fd898` and `be26536` at 17:20:26):**
  - As documented by the staff member in `docs/session-plan-submission.md` (`b536f94`: *"A stale file submitted by mistake blocks the session (this happened in Session 141 and three earlier ones)"*), Session 141's first attempt **again** submitted a stale plan file from `.dabbler/scratch/`!
  - Why? Because during Session 140's second (successful) run at 17:04, Session 140's author wrote a **new** `.dabbler/scratch/plan.json`! When Session 141 started at ~17:15, Session 141's author submitted Session 140's `.dabbler/scratch/plan.json`.
  - The operator had to revert `docs/transcripts/session-140.html` (`a3fd898`), roll back Session 141 (`be26536`), and manually commit `docs/session-plan-submission.md` (`b536f94`) warning the AI never to use `.dabbler/scratch/plan.json`.
  - Prior to this, the exact same collision also occurred in **Session 119** (`2e927a1`) and **Session 120** (`d3ba883`), prompting commit `48e3c2f` (*"Prevent stale .dabbler/scratch/plan.json collision in Sessions 120-124"*), where the staff member manually pasted *"Plan-file hygiene"* bullets into `session-plan.md` for Sessions 120–132. When Sessions 134–141 were planned in `22f2b95` and `65a0a1c` without that manual warning paragraph, the bug immediately recurred in Sessions 138, 140, and 141.

---

## Part 2: Root-Cause Analysis of Framework & Instruction Issues

### Defect 1: `.dabbler/scratch/plan.json` Collision Encouraged by `planAsk()` and Unchecked by `stampAnswer()`

- **Where:**
  - `packages/router/src/drive.ts:3308` (`planAsk()`)
  - `packages/router/src/session.ts:2419-2455` (`report()`)
  - `packages/router/src/driver.ts:2331-2347` (`stampAnswer()`)
- **What happens:**
  1. `planAsk()` tells the engine:
     > `"Answer with a work plan as JSON, written to a file outside the tracked tree (for example .dabbler/scratch/plan.json), then run the answer command."`
     > `"Do not include schema_version, session_number or recorded_at: the framework stamps them."`
  2. Because `.dabbler/` is gitignored and nothing cleans `.dabbler/scratch/` at `session start` or `phasePlan`, `.dabbler/scratch/plan.json` from the previous session remains on disk.
  3. In Copilot CLI / Claude Code, the AI Author either:
     - Calls the `create` tool on `.dabbler/scratch/plan.json` (which **fails** because `create` refuses to overwrite existing files) and, in the same parallel tool batch or without heeding the error, runs `dabbler session report --seq 1 --next --answer-file .dabbler/scratch/plan.json`; or
     - Checks `.dabbler/scratch/plan.json` and reuses/submits it.
  4. Because `planAsk()` explicitly forbade the AI from putting `session_number` in the JSON file, `stampAnswer()` cannot detect that the file on disk was written for an earlier session! It blindly stamps `session_number: target` onto the stale JSON, accepts the plan, and locks `activity-log.json` via `declareSessionTask`.
  5. Furthermore, `report()` does not delete or consume the `--answer-file` after copying it into `.dabbler/runs/s<N>/driver/plan.json`, nor does it check that the answer file's `mtime` is newer than `instruction.issued_at`.

### Defect 2: No Recovery Path When a Wrong Work Plan Is Accepted (Requires Full Rollback)

- **Where:**
  - `packages/router/src/driver.ts:749-831` (`amendPlanStep()`)
  - `packages/router/src/writers.ts:865-918` (`declareSessionTask()`)
  - `packages/router/src/session.ts:3520-3555` (`applyRestoration()`)
- **What happens:**
  - Once `phasePlan` accepts `plan.json`, it immediately calls `declare()` which writes `kind: "task-declaration"` to `docs/sessions/activity-log.json` and renders `docs/sessions/project-work-plan.md`.
  - If the work plan was stale or wrong, neither the AI Author nor the Mechanic can fix it:
    - `dabbler session plan amend` can only change an existing step's `files` or `checks`, drop a non-goal, or change `max-rounds`. It cannot replace the work plan or change `task`, `steps`, `id`, or `ask`.
    - `dabbler session cancel` followed by `dabbler session restore` restores `status: "in-progress"`, but leaves `.dabbler/runs/s<N>/driver/plan.json` and the `task-declaration` in `activity-log.json` untouched—so the restored session is still bound to the wrong plan.
    - Only `dabbler session rollback` clears the run record and reverts `activity-log.json`.

### Defect 3: Why the AI Author / Reviewer Appear to Use the Wrong Session Plan (.MD vs .JSON Sync & Prompt Issues)

There are **four concrete mechanisms** in the router that cause the AI Author or Primary Reviewer to see or report the wrong session plan during a session (especially around review/verification):

1. **Silent Whole-Document Fallback in `extractSpecExcerpt()` (`packages/router/src/session.ts:689-698`):**
   ```ts
   export function extractSpecExcerpt(specText: string, sessionNumber: number): string {
     SESSION_HEAD_RE.lastIndex = 0;
     const matches = [...specText.matchAll(SESSION_HEAD_RE)];
     for (let index = 0; index < matches.length; index += 1) {
       if (Number.parseInt(matches[index][1], 10) !== sessionNumber) continue;
       const end =
         index + 1 < matches.length ? matches[index + 1].index! : specText.length;
       return specText.slice(matches[index].index!, end).trim();
     }
     return specText.trim();
   }
   ```
   - Look at `drive.ts:3301`:
     `(excerpt.trim() || "(the plan has no section for this session; plan from the repository)")`
   - `drive.ts` expects `extractSpecExcerpt` to return `""` when `sessionNumber` is not found in `session-plan.md`. Instead, `extractSpecExcerpt` returns `specText.trim()`—the **entire `session-plan.md` file**!
   - If a session heading has a slight formatting mismatch (e.g. `## Session 140:` instead of `### Session 140:`, or an unparsed heading), both `planAsk()` and `verify/prompts.ts:specExcerpt()` feed the **entire 141-session markdown file** into the prompt under `"The session's plan, verbatim:"`. When given 140 sessions of text, models frequently latch onto the wrong session section (often the last section in the file or an adjacent one).
   - Even when `### Session 140` is the last numbered session in `session-plan.md`, any trailing unnumbered `###` subsections appended after it (such as `### Proposed follow-up (from Session 140, for operator review; not scheduled)` added in commit `6bfa843`) are swept into Session 140's excerpt during verification because `SESSION_HEAD_RE` only stops at the next `^###\s+Session\s+(\d+)`, whereas `transcript.ts:readPlanSection` stops at any `^###\s`!

2. **Two Different "Plans" Sent to the Reviewer (`verify/prompts.ts:365-396`):**
   - During `verify`, `buildTaskBlock()` sends:
     1. `"The session's plan, verbatim:"` → `specExcerpt(sessionsDir, sessionNumber)` read live from `docs/sessions/session-plan.md`.
     2. `"#### The work plan the session was declared from"` → `workPlanBlock(repoRoot, sessionNumber)` read from `.dabbler/runs/s<N>/driver/plan.json` (`Task: ...` and `Non-goals: ...`), which also gets rendered into `docs/sessions/project-work-plan.md`.
   - Furthermore, the instruction to the AI Author during `work` (`stepAsk()` in `drive.ts:3552`) **never re-shows `session-plan.md`**; it only shows the step's `ask` and `non_goals` from `driver/plan.json`.
   - When `driver/plan.json` was populated from a stale scratch file (or summarized differently from `session-plan.md`), the AI Author works solely from `driver/plan.json` steps, and then at verification time the Reviewer is handed both `session-plan.md` and `driver/plan.json`—immediately flagging that the session worked from the wrong plan.

3. **Mid-Session Edits to `docs/sessions/session-plan.md` Move the Target Under Verification:**
   - In `approvedPlan.ts:670`, `approvedContractChange()` carefully reads `session-plan.md` from `sessionStartCommit(sessionsDir, sessionNumber)` (`git show <startCommit>:docs/sessions/session-plan.md`) so mid-session edits cannot alter the contract.
   - However, `verify/prompts.ts:specExcerpt()` reads `docs/sessions/session-plan.md` **from the live working tree** (`readFileSync(join(sessionsDir, SESSION_PLAN_FILENAME))`).
   - In Session 140, the session plan itself asked the author to *"amend this session plan with a focused follow-up for operator review"*. When the author edits `docs/sessions/session-plan.md` during Step 3, two things happen:
     - `session-plan.md` is part of the git diff being reviewed; and
     - `specExcerpt()` reads the newly edited `session-plan.md` as the specification to hold the session against!

4. **Syncing Lag Between `session-plan.md`, `sessions.json`, and `project-work-plan.md`:**
   - There are three plan-related files in `docs/sessions/`:
     1. `session-plan.md` (prose sections authored in consultation)
     2. `sessions.json` (router state ledger)
     3. `project-work-plan.md` (rendered fold of `activity-log.json`)
   - When new sessions or title changes are committed to `session-plan.md` during a consultation (e.g., commits `22f2b95` and `65a0a1c`), **`sessions.json` and `project-work-plan.md` are not updated**. `sessions.json` only grows and heals titles when `dabbler session start` runs for the next session (`stateAfterStart` in `writers.ts`).
   - Worse, in `progress.ts:242`, `healTitle()` refuses to update the title of any session where `sessionHasHistory(entry)` is true (`status !== "not-started"` or any metadata key is non-null). And `project-work-plan.md` (`writers.ts:1278`) takes session titles from `sessions.json` (`records.get(number)?.title`), **not** from `session-plan.md`, and only lists sessions present in `sessions.json` or `activity-log.json`.
   - Consequently, if an AI Author or staff member inspects `sessions.json` or `project-work-plan.md` before `session start` (or after a re-cut of `session-plan.md`), `session-plan.md`, `sessions.json`, and `project-work-plan.md` are out of sync.

### Defect 4: Step Check Mutation Trap on Generated Documentation (`check-failed: the check changed the tree`)

- **Where:** `packages/router/src/drive.ts:3290-3355` (`planAsk()`) and `packages/router/src/checks.ts`
- **What happens:**
  - In Session 138 (and earlier in Session 26, per `activity-log.json` line 279), the AI Author put a doc-generator script (`scripts/build-user-guide.ps1` or `scripts/build-test-plans.ps1`) into a step's `checks` array in `plan.json`.
  - When the author reported the step, the framework ran the step's `checks` and compared the worktree tree hash before and after each check. Because the generator script rewrites `.docx` files (which are zip archives containing non-deterministic timestamps or relationship IDs), the check mutated the working tree and failed with:
    `check failed: pwsh -NoProfile -File scripts/build-user-guide.ps1 -> exit 0 (the check changed the tree: docs/user-guide.docx)`
  - `planAsk()` tells the author that *"Every step has at least one check, and a check is argv the framework spawns with no shell: exit 0 proves the step"*, and `AGENTS.md` says *"The framework hashes the tree before and after a step's checks, and an edit made while one is running refuses the report"*, which sounds like a warning against the *author* editing files concurrently in another terminal rather than a warning that **a step check itself must be read-only and must never be a build/generator script that writes tracked files**.

### Defect 5: `rollback` Re-Restores Stale Cancelled Transcripts Over Completed Sessions (`session.ts:4129-4161`)

- **Where:** `packages/router/src/session.ts:4129-4161` (`rollback()`)
- **What happens:**
  - In `rollback()`, the router scans all tracked files in `docs/transcripts/`:
    ```ts
    const cancelledPages = runGit(repoRoot, ["ls-files", "--", TRANSCRIPTS_DIRNAME]).stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((path) => path !== "" && isCancelledPage(runGit(repoRoot, ["show", `${headNow}:${path}`]).stdout));
    ```
  - Look at what happened in Session 140 → 141:
    1. Session 140 was cancelled (`cd7f951`), committing a cancelled transcript `docs/transcripts/session-140.html` (`29c0ce4`).
    2. The operator reverted that transcript (`570949e`) and rolled back Session 140 (`bd59c5b`). Because `commits.length === 0` (or `headNow` before the revert had the cancelled page), `bd59c5b` ("Roll back to the start of session 140 of sessions") re-committed the cancelled `docs/transcripts/session-140.html`!
    3. Session 140 then ran again and closed (`0ac3fa4`), and its `phaseLog` overwrote `docs/transcripts/session-140.html` with the completed, verified transcript (`95bcaac`) because `commitSessionTranscript` replaces a file when `isCancelledPage` is true.
    4. Then, when Session 141 failed its declaration and the operator had to roll back Session 141 (`be26536`), the operator first reverted `95bcaac` (`a3fd898`), which put `docs/transcripts/session-140.html` **back to its cancelled version**!
    5. As a result, in the current `master` branch of `CT.DPH.Syndromic-Surveillance-V2`, `docs/transcripts/session-140.html` is **still the CANCELLED transcript from attempt 1**, even though Session 140 completed and closed `VERIFIED` in `0ac3fa4`!

---

## Part 3: Recommended Framework Fixes (For Future Dabbler Sessions)

1. **Eliminate the `.dabbler/scratch/plan.json` Stale-Plan Trap (`drive.ts`, `session.ts`, `driver.ts`):**
   - **Per-session filename in `planAsk()`:** Change `planAsk()` in `drive.ts:3308` from `(for example .dabbler/scratch/plan.json)` to `(for example .dabbler/scratch/plan-s${this.sessionNumber}.json)`.
   - **Require or verify `session_number` and freshness on `--answer-file`:**
     - Allow (or require) `session_number` in the submitted work plan JSON, or require that the `--answer-file` was modified **after** `instruction.issued_at` (`statSync(source).mtimeMs >= Date.parse(instruction.issued_at)`). Refusing an `--answer-file` whose `mtime` predates the instruction (`seq=1`) makes submitting a leftover file from an earlier session mechanically impossible—even if `create` failed silently!
   - **Clean or consume scratch plan files:** Delete or move the `--answer-file` after `report()` copies it into `.dabbler/runs/s<N>/driver/plan.json`, or clean `.dabbler/scratch/` at `session start`.

2. **Fix `extractSpecExcerpt()` Silent Whole-File Fallback (`session.ts:689` & `transcript.ts:296`):**
   - Change `extractSpecExcerpt(specText, sessionNumber)` to return `""` when no heading matches `sessionNumber` instead of returning `specText.trim()` (the entire multi-thousand-line `session-plan.md`).
   - Align the section boundary regex between `session.ts` (`SESSION_HEAD_RE`) and `transcript.ts` (`SESSION_HEADING_RE` / `^###\s`) so unnumbered `###` subsections at the end of a session do not cause divergence between what `extractSpecExcerpt` and `readPlanSection` extract.

3. **Allow Replacing an Unstarted Work Plan Before Any Step Is Accepted (`driver.ts` / `session.ts`):**
   - If an author or operator realizes during step 1 (when `accepted_steps.length === 0` and no code changes have been made) that the wrong work plan was submitted, provide a lightweight way to re-plan (e.g. `dabbler session plan reset --reason "<why>"` or allowing `plan amend` to replace the plan before any step is accepted) without requiring a full `dabbler session rollback`.

4. **Freeze the Session Plan Excerpt at `startCommit` (or Warn on Mid-Session `session-plan.md` Edits):**
   - In `verify/prompts.ts:specExcerpt()`, read `session-plan.md` for the current session `N` from `sessionStartCommit` (just as `approvedContractChange` already does in `approvedPlan.ts:670`), or explicitly show the reviewer that `session-plan.md` was amended during the session only for future sessions `> N`.

5. **Clarify Read-Only Check Requirement in `planAsk()` (`drive.ts:3314`):**
   - State explicitly in `planAsk()` that a step's `checks` must be **read-only** verification commands that do not modify tracked files (generators must be run *during* the step before reporting, while the step's `checks` verify the generated output is current).

6. **Scope `cancelledPages` in `rollback()` Only to the Sessions Being Rolled Back (`session.ts:4129`):**
   - In `rollback()`, only preserve cancelled transcript pages for session numbers in `[target .. through]` that are actually being rolled back, and never leave a cancelled transcript standing for an earlier session `< target` that subsequently closed `COMPLETE`.
