# AI assignment — Set 015 per-repo migration plans

> **Authored:** 2026-05-06 by Set 015 Session 1 (audit).
> **Reviewer:** operator. Approve / edit / veto specific items per repo before Session 2 executes.
> **Scope:** two consumer repos in this set — `dabbler-access-harvester` (Session 2) and `dabbler-platform` (Session 3). `dabbler-homehealthcare-accessdb` is handled by Set 018 separately.

---

## Audit summary (cross-repo)

| Aspect | Harvester | Platform |
|---|---|---|
| Current layout | **Option D** (bare-repo + flat-worktree) | **Already Option B-compatible** (single working tree at repo root) |
| `ai_router/` directory present | ✓ (under `main/ai_router/`) | ✓ (at repo root) |
| `router-config.yaml` + `router-metrics.jsonl` | ✓ | ✓ |
| `dabbler-ai-router` version (pip metadata) | **0.1.0** (needs upgrade) | **0.1.0** (needs upgrade) |
| `import ai_router; __version__` | 0.1.1 (discrepancy with pip) | not probed; assume 0.1.0 from pip |
| Doc references in agent files | ✓ (use `ai_router/` underscore correctly) | ✓ (use `ai_router/` underscore correctly) |
| Worktree topology | Drift (Anomaly A from Set 016 still present) | Clean (single primary worktree) |
| In-flight branch state | Active branch `migrate/dabbler-ai-router-pip` with uncommitted ghost changes (operator-confirmed revertable) | Clean primary on `migrate/dabbler-ai-router-pip` |
| UAT DSL infrastructure | N/A | `uat_runner/` top-level package present (preserve) |

**Key takeaway:** The migration shape is sharply different between the two repos. Harvester is a real D→B migration with stateful preservation needs (active branch + stranded PoC worktree). Platform is essentially a `pip install -U` with smoke test.

---

## Repo 1: `dabbler-access-harvester` (Session 2)

### Findings

- **Layout:** Option D — `.bare/`, `.git` pointer file, `main/` as the active worktree, with the three anomalies from Set 016 still present:
  - Anomaly A: live registered worktree at `.claude/worktrees/vba-symbol-resolution-session-1/` on branch `worktree-vba-symbol-resolution-session-1` (HEAD `8ccabf0`, 3 unique commits never pushed, never merged into main).
  - Anomaly B: empty stranded directory at `docs/session-sets/workflow-package-pilot/`.
  - Anomaly C: empty stranded directory at `tmp/feedback/`.
- **Active branch on `main/`:** `migrate/dabbler-ai-router-pip` (HEAD `bfe54d0`). Branch is in active migration to PyPI install pattern, with recent commits including "Backfill session-state.json", "Update README + bootstrap doc", "Update agent files: canonical pip-install pattern", "Delete legacy ai-router/ directory", "Migrate tool scripts: drop importlib shim".
- **Working-tree state on `main/`:** dirty with ghost changes the operator confirmed are revertable:
  - 1 modified tracked file (`docs/session-sets/blazor-add-an-order/activity-log.json`)
  - 2 modified `.accdb` sample files
  - 3 deleted `.accdb` sample files
  - 2 untracked sample directories (`samples/DatabaseYaml/`, `samples/FormsAndReportsYaml/HomeHealthCare.accdb.yaml`)
- **Package metadata:** `pip show dabbler-ai-router` reports **0.1.0**, but `python -c "import ai_router; print(ai_router.__version__)"` reports **0.1.1**. Indicates an in-place modification of site-packages or a partial upgrade. Clean re-install via `pip install -U dabbler-ai-router` will reconcile the discrepancy.
- **Agent files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`):** all reference `ai_router/` (underscore) correctly. No drift in directory naming.
- **Session-set inventory in `main/docs/session-sets/`:** 20 sets present, including `vba-symbol-resolution-and-enrichment` — slug-similar to but distinct from the stranded worktree's `vba-symbol-resolution-session-1`. Likely the PoC was superseded by this successor session set; needs operator confirmation.

### Current layout

**Option D.** Confirmed by `.bare/`, `.git` pointer file, `main/` as primary worktree.

### Drift items vs canonical Option B

| ID | Drift | Rationale |
|---|---|---|
| D1 | Container layout is Option D; canonical is Option B | Migrate via clone-and-swap (per `docs/planning/repo-worktree-layout.md`) — main goes to `~/source/repos/dabbler-access-harvester/`, in-flight worktree goes to `~/source/repos/dabbler-access-harvester-worktrees/<slug>/` if preserved |
| D2 | Stranded worktree at `.claude/worktrees/vba-symbol-resolution-session-1` | Non-canonical path; branch likely superseded by `vba-symbol-resolution-and-enrichment` session set in main (operator confirms during execution) |
| D3 | Empty stranded directory `docs/` at container root | Not registered with git; container should hold no source files at top level under either Option D or Option B |
| D4 | Empty stranded directory `tmp/` at container root | Same as D3 |
| D5 | `dabbler-ai-router` pip metadata reports 0.1.0 (vs 0.1.1 importable) | Set 015 acceptance criterion requires `>=0.1.1`; the pip-metadata vs `__version__` discrepancy resolves via clean upgrade |

### Migration steps (Session 2 execution)

The recipe follows the Option D → Option B clone-and-swap from `docs/planning/repo-worktree-layout.md` with explicit in-flight-state preservation. Steps marked **operator-action** require operator participation.

1. **Pre-flight: confirm operator's UAT cadence allows the cutover window.** Migration takes 30-60 minutes; the harvester is parked, so timing is flexible.
2. **Revert ghost changes in `main/`.** Operator-approved per 2026-05-06: the .accdb modifications/deletions and the activity-log.json modification are recoverable filesystem detritus, not load-bearing work. Run from `main/`:
   ```powershell
   git -C "C:\Users\denmi\source\repos\dabbler-access-harvester\main" checkout -- docs/session-sets/blazor-add-an-order/activity-log.json
   git -C "C:\Users\denmi\source\repos\dabbler-access-harvester\main" checkout -- samples/
   git -C "C:\Users\denmi\source\repos\dabbler-access-harvester\main" clean -fd samples/
   git -C "C:\Users\denmi\source\repos\dabbler-access-harvester\main" status --short --branch
   ```
   Verify clean working tree before proceeding.
3. **Backup the active branch + the stranded PoC branch.** Belt-and-suspenders preservation per Set 016's recipe — branch refs AND bundle files. Both bundles go to the parent directory so they survive the container rename.
   ```powershell
   $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
   $repo = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
   git -C $repo branch "backup/migrate-pip-$stamp" migrate/dabbler-ai-router-pip
   git -C $repo branch "backup/vba-poc-$stamp" worktree-vba-symbol-resolution-session-1
   git -C $repo bundle create "..\harvester-migrate-pip-$stamp.bundle" migrate/dabbler-ai-router-pip
   git -C $repo bundle create "..\harvester-vba-poc-$stamp.bundle" worktree-vba-symbol-resolution-session-1
   ```
4. **Snapshot local-only git config from `.bare/config`.** Capture `credential.*`, `branch.<name>.*`, any `vscode-merge-base` hints. These will be re-applied to the new repo's `.git/config`.
5. **Operator decision on Anomaly A's PoC branch.** Before migration: does the operator want to (a) carry the `worktree-vba-symbol-resolution-session-1` branch to the new repo as a recoverable artifact, or (b) leave it behind in the bundle/backup and not check it out in the new repo? **Default proposal: (b)** — branch is likely superseded by the `vba-symbol-resolution-and-enrichment` session set, the bundle preserves it indefinitely if recovery is later needed, and skipping it from the new repo simplifies the migration. Operator overrides to (a) if the PoC is actively load-bearing.
6. **Build the new repo as a sibling.**
   ```powershell
   $old = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
   $new = 'C:\Users\denmi\source\repos\dabbler-access-harvester-new'
   git clone <origin-url> $new
   git -C $new switch migrate/dabbler-ai-router-pip
   ```
7. **Recreate the `migrate/dabbler-ai-router-pip` branch in the new repo from the bundle.** Even though `git clone` may have already pulled the branch from origin, this is a belt-and-suspenders consistency check:
   ```powershell
   git -C $new fetch "..\harvester-migrate-pip-$stamp.bundle" migrate/dabbler-ai-router-pip:migrate/dabbler-ai-router-pip
   ```
   (This fetch is idempotent if the branch is already at the same commit.)
8. **If operator chose (a) at step 5:** recreate the PoC branch in the new repo and create a worktree for it under the canonical Option B path.
   ```powershell
   $wts = 'C:\Users\denmi\source\repos\dabbler-access-harvester-worktrees'
   git -C $new fetch "$old\.bare" worktree-vba-symbol-resolution-session-1:worktree-vba-symbol-resolution-session-1
   New-Item -ItemType Directory -Force -Path $wts | Out-Null
   git -C $new worktree add (Join-Path $wts 'vba-symbol-resolution-session-1') worktree-vba-symbol-resolution-session-1
   ```
   **If operator chose (b):** skip step 8 entirely.
9. **Re-apply local-only git config** from step 4 against `$new/.git/config`.
10. **Recreate the `.venv/`** in the new repo and install `dabbler-ai-router>=0.1.1`:
    ```powershell
    cd $new
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install --upgrade dabbler-ai-router
    .venv\Scripts\python.exe -c "import ai_router; print('ai_router version:', ai_router.__version__)"
    .venv\Scripts\python.exe -m pip show dabbler-ai-router | Select-String -Pattern '^Version'
    ```
    Both must report 0.1.1 or later. Re-install other deps from `requirements.txt` if present.
11. **Smoke test from `$new`.** Run any tests that exist; verify `from ai_router import route` works; confirm worktree CLI sees the layout cleanly:
    ```powershell
    .venv\Scripts\python.exe -m ai_router.worktree list --json
    ```
    Expected: `counts.drift = 0`. If operator chose (a) at step 5, expect `counts.canonical = 1`; otherwise 0.
12. **Release file locks.**
    ```powershell
    python -m ai_router.utils cleanup-dev-orphans --dry-run --match-path dabbler-access-harvester
    python -m ai_router.utils cleanup-dev-orphans --yes --match-path dabbler-access-harvester
    dotnet build-server shutdown
    ```
    Operator closes any VS Code window or terminal with cwd inside `$old`.
13. **Atomic swap as separate rename operations.**
    ```powershell
    Rename-Item -LiteralPath $old -NewName 'dabbler-access-harvester-old'
    Rename-Item -LiteralPath $new -NewName 'dabbler-access-harvester'
    ```
14. **Repair worktree metadata (only if operator chose (a) at step 5).**
    ```powershell
    git -C 'C:\Users\denmi\source\repos\dabbler-access-harvester' worktree repair (Join-Path $wts 'vba-symbol-resolution-session-1')
    ```
15. **Smoke test the renamed repo.** Open in VS Code; verify extension activates without manifest-registration errors; Cost Dashboard populates; session-set tree shows the 20 session sets correctly bucketed.
16. **Keep `dabbler-access-harvester-old/` for ~1 week as rollback safety net.** Delete after the operator confirms the new repo is stable in regular work.

### Risk callouts

- **Windows file locks** during the swap. Mitigation: step 12.
- **`.venv/` recreation** drops any local mods. Operator should confirm no local-only edits to site-packages exist before the swap (the 0.1.0 vs 0.1.1 discrepancy hints at one).
- **Local-only git config in `.bare/config`** — step 4 captures it; missing items here mean credential prompts on first push from the new repo.
- **Operator decision at step 5** changes step 8's branching. Lock the choice before execution starts so the recipe runs deterministically.

### Out of scope (filed as backlog)

- **Disposition of the PoC branch's 3 commits** if operator chose (b) at step 5. Bundle preserves them; future work can `git apply` from the bundle if any of the PoC's findings turn out to need integration into a successor session set.
- **The `vba-symbol-resolution-and-enrichment` session set's relationship to the superseded PoC.** If operator wants the relationship documented in `main/docs/session-sets/vba-symbol-resolution-and-enrichment/spec.md` or `change-log.md`, that's a follow-up.
- **The pip-metadata vs `__version__` discrepancy's root cause.** The clean re-install in step 10 resolves it; investigating how the discrepancy arose (manual site-packages edit? interrupted upgrade?) is not in this set's scope.

---

## Repo 2: `dabbler-platform` (Session 3)

### Findings

- **Layout:** Already canonical Option B-compatible — single working tree at repo root, no `.bare/`, no `<repo>/main/` subdirectory, no `<repo>-worktrees/` container (because no worktrees are currently active).
- **`ai_router/` directory** at repo root with `router-config.yaml` and `router-metrics.jsonl`. ✓
- **`uat_runner/`** top-level package present (CLI: `cli.py`; runner: `runner.py`; triage: `triage.py`; plus `personas.json`/`personas.py`, `remediations/`, `test_cases/`). This IS the UAT DSL infrastructure per memory entry `project_uat_dsl.md`. **Migration must NOT touch this module.**
- **`pip show dabbler-ai-router` reports 0.1.0.** Needs upgrade to >=0.1.1.
- **Agent files** (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`): reference `ai_router/` (underscore) correctly. CLAUDE.md line 73-74 has historical context noting "`ai-router/uat_runner/` is now a top-level `uat_runner/` package alongside the pip-installed canonical router" — this is intentional, not drift.
- **Active branch:** `migrate/dabbler-ai-router-pip` (HEAD `f80ec18`), upstream tracked. Working tree clean per `git status --short --branch`.
- **Worktree topology:** single primary worktree, no in-flight worktrees. `git worktree list` shows just the one entry at the repo root.
- **`.tmp/`** at repo root — generated session-step caches (prompts, raw responses, route logs). Looks gitignored; not migration-relevant.
- **`.claude/`** at repo root — contains a `settings.json` (79 bytes). Worth inspecting briefly to confirm it's just per-workspace config, not anything load-bearing for the migration.

### Current layout

**Option B (already canonical-compatible).** No layout migration needed. The repo's directory shape is what we'd want at the end of a D→B or A→B migration. The only thing missing is "an active worktree under `<repo>-worktrees/<slug>/`" but that's an artifact of no parallel work being in flight, not a layout deficiency.

### Drift items vs canonical Option B

| ID | Drift | Rationale |
|---|---|---|
| D1 | `dabbler-ai-router` pip 0.1.0 | Set 015 acceptance criterion requires `>=0.1.1`; clean `pip install -U` resolves |
| D2 | Extension state unknown | Operator-probe required: `code --list-extensions --show-versions | Select-String dabbler` — confirm only `darndestdabbler.dabbler-ai-orchestration` is installed (no leftover `darndestdabbler.dabbler-session-sets@0.8.x`) |
| D3 | (potential) `.claude/settings.json` content | Inspect briefly to confirm no migration impact |

### Migration steps (Session 3 execution)

This migration is dramatically simpler than harvester's because the layout is already correct. Most of the work is verification.

1. **Pre-flight: confirm working tree is still clean** and on `migrate/dabbler-ai-router-pip` branch (or whichever branch the operator wants to be on at migration time).
   ```powershell
   git -C 'C:\Users\denmi\source\repos\dabbler-platform' status --short --branch
   ```
2. **Inspect `.claude/settings.json`** for anything that would be migration-relevant (e.g., a hardcoded path). Briefly:
   ```powershell
   Get-Content 'C:\Users\denmi\source\repos\dabbler-platform\.claude\settings.json'
   ```
3. **Operator-action: extension probe** — run in PowerShell:
   ```powershell
   code --list-extensions --show-versions | Select-String dabbler
   ```
   Expected: exactly one line, `darndestdabbler.dabbler-ai-orchestration@0.13.x`. If `dabbler-session-sets@0.8.x` is also listed, run:
   ```powershell
   code --uninstall-extension darndestdabbler.dabbler-session-sets
   ```
   And sweep `%USERPROFILE%\.vscode\extensions` for any `darndestdabbler.dabbler-session-sets-*` folder.
4. **Upgrade `dabbler-ai-router` in the workspace venv.**
   ```powershell
   cd 'C:\Users\denmi\source\repos\dabbler-platform'
   .venv\Scripts\python.exe -m pip install --upgrade dabbler-ai-router
   .venv\Scripts\python.exe -c "import ai_router; print('ai_router version:', ai_router.__version__)"
   .venv\Scripts\python.exe -m pip show dabbler-ai-router | Select-String -Pattern '^Version'
   ```
   Both must report 0.1.1 or later.
5. **Validate via the worktree CLI.**
   ```powershell
   .venv\Scripts\python.exe -m ai_router.worktree list --json
   ```
   Expected: `counts = {"main": 1, "canonical": 0, "drift": 0}`. Single primary worktree, zero drift.
6. **Smoke test the UAT DSL.** Confirm the DSL still imports and the CLI runs:
   ```powershell
   .venv\Scripts\python.exe -c "from uat_runner.runner import run_checklist; from uat_runner.triage import FailureRecord, TriageSession; print('uat_runner OK')"
   .venv\Scripts\python.exe -m uat_runner.cli --help
   ```
   Expected: both succeed.
7. **Smoke test in VS Code.** Open the platform workspace; confirm extension activates without manifest-registration errors; Cost Dashboard populates; UAT Checklist surface (if visible for any open session set) renders correctly; session-set tree shows correct bucketing.
8. **Commit any pip-related changes** (e.g., updated `requirements.txt` if pinned versions changed) directly on the `migrate/dabbler-ai-router-pip` branch. Push.

### Risk callouts

- **UAT DSL preservation.** Step 6's smoke test is the canary. If imports fail or the CLI errors, STOP — investigate before proceeding. The DSL's package data (`personas.json`, `test_cases/`, `remediations/`) must remain intact through the pip upgrade; pip should never touch these (they're in `uat_runner/`, not `dabbler-ai-router`), but verify.
- **Active migration branch.** If the operator has uncommitted work on `migrate/dabbler-ai-router-pip` at the time Session 3 runs, step 1 catches it. The migration is safe to defer if the operator is mid-iteration.
- **Operator-probe friction at step 3.** If the operator can't run the extension probe at the moment Session 3 executes (e.g., VS Code is in a separate session), defer that step and run it post-migration. The drift detection is read-only; it doesn't block step 4.

### Out of scope (filed as backlog)

- **Cleaning up `.tmp/` content.** Generated session-step caches; not migration-relevant. Operator can clean ad hoc.
- **Reviewing CLAUDE.md / AGENTS.md / GEMINI.md text quality.** Doc references are correct; copy editing is a separate concern.
- **The historical "`ai-router/uat_runner/` is now top-level `uat_runner/`" note in CLAUDE.md.** Intentional context, kept for posterity. Removing it would be a separate doc-cleanup task.

---

## Cross-repo summary for operator approval

**Recommended execution order (per amended spec):** harvester first (Session 2), platform second (Session 3).

**Key decisions operator should lock before Session 2 starts:**

1. **Anomaly A's PoC branch disposition.** Default proposal: option (b) — backup as ref + bundle, do NOT carry into the new repo. Branch is likely superseded by the `vba-symbol-resolution-and-enrichment` session set; bundle preserves the work indefinitely if recovery is later needed.
2. **Confirm ghost-change reversion is acceptable.** Already operator-confirmed 2026-05-06 ("ghost changes, mainly").
3. **Timing for Session 2.** 30-60 minutes of orchestrator work + brief Windows-rename window. Operator closes VS Code on the harvester at that time.

**Decisions for Session 3:**

1. **Operator-probe at step 3** (extension state) — ideally run during the session, but can be deferred.

**Key decision NOT needed:** layout migration approach for platform — it's already canonical-compatible, so no clone-and-swap is required. Platform is essentially a `pip install -U` plus smoke tests.

**Open question:** is the operator content with these plans, or are there specific items to edit/veto before Session 2 starts?
