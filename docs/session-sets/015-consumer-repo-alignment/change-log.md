# Change log — Set 015 (consumer-repo alignment)

> **Status at end of Session 2:** Harvester migration to canonical
> Option B layout complete via clone-and-swap. Old container
> preserved as `dabbler-access-harvester-old/` for ~1 week as
> rollback safety net. Operator-confirmed VS Code smoke test green.
> Session 3 (platform pip upgrade) is the only remaining session
> in this set.
>
> **Status at end of Session 1:** Audit complete; per-repo migration
> plans authored in [ai-assignment.md](ai-assignment.md) and operator-
> approved (with the proposed default for Anomaly A's PoC branch
> ratified: backup-and-leave-behind). Sessions 2 and 3 are unlocked
> for execution; healthcare-accessdb migration deferred to
> [Set 018](../018-healthcare-accessdb-migration/) per the spec
> amendment.

## Session 1 deliverables

- **Audit data** for both consumer repos in scope:
  - `dabbler-access-harvester` — confirmed Option D layout, three Set-016 anomalies still present, active `migrate/dabbler-ai-router-pip` branch with revertable ghost changes, stranded PoC worktree on `worktree-vba-symbol-resolution-session-1` branch (3 unique commits, never pushed).
  - `dabbler-platform` — confirmed already canonical Option B-compatible (single working tree at repo root, `ai_router/` underscore directory, no in-flight worktrees, doc references correct), `dabbler-ai-router` at 0.1.0 needing pip upgrade, UAT DSL `uat_runner/` top-level package present.
- **Per-repo migration plans** with the uniform six-section shape (Findings / Current layout / Drift items / Migration steps / Risk callouts / Out of scope) recorded in [ai-assignment.md](ai-assignment.md).
- **Operator decisions ratified** for Session 2 execution:
  - Anomaly A's PoC branch: backup-and-leave-behind (option b). Bundle preserves the 3 commits indefinitely; new repo doesn't carry the branch forward.
  - Ghost changes in harvester `main/` (modified `.accdb` files, deleted `.accdb` files, untracked `samples/` dirs, modified `activity-log.json`) are revertable per operator confirmation 2026-05-06.

## Session 2 deliverables (harvester migration — COMPLETE)

Executed the 16-step clone-and-swap from Session 1's plan. Final
state: harvester is at canonical Option B layout
(`C:\Users\denmi\source\repos\dabbler-access-harvester\` is now a
normal git repo with `.git/` directory, source files at root, no
`.bare/` and no `main/` subdirectory). Branch
`migrate/dabbler-ai-router-pip` is the active branch tracking
origin; working tree clean.

**Key actions taken (in order):**

1. **Pre-flight verification** — confirmed harvester state matched Session 1's audit: Option D layout, three anomalies still present, active migrate branch with revertable ghost changes.
2. **Reverted ghost changes** — `git checkout -- docs/session-sets/blazor-add-an-order/activity-log.json samples/` plus `git clean -fd samples/` cleaned the working tree without touching real history.
3. **Created backup refs** in the old `.bare/` repo: `backup/migrate-pip-20260506-132426` and `backup/vba-poc-20260506-132426`.
4. **Created bundle files** in `C:\Users\denmi\source\repos\` (parent dir, survives the rename):
   - `harvester-migrate-pip-20260506-132426.bundle` (active branch — full preservation)
   - `harvester-vba-poc-20260506-132426.bundle` (PoC branch — preserved per option (b))
5. **Built new sibling repo** via `git clone https://github.com/darndestdabbler/dabbler-access-harvester.git dabbler-access-harvester-new`, then `git switch migrate/dabbler-ai-router-pip`.
6. **Per operator decision (b):** did NOT recreate `worktree-vba-symbol-resolution-session-1` branch in the new repo. The bundle preserves it indefinitely if recovery is later needed.
7. **Re-applied local-only git config** to the new repo: `credential.https://github.com.username=darndestdabbler`, `branch.main.vscode-merge-base=origin/main`, `branch.migrate/dabbler-ai-router-pip.vscode-merge-base=origin/main`. Standard branch tracking auto-set by clone+switch.
8. **Recreated `.venv/`** with `python -m venv .venv` and installed `dabbler-ai-router>=0.1.1` per `requirements.txt`. **Result: `dabbler-ai-router-0.1.1` cleanly installed**, `pip show` and `import ai_router; __version__` both report 0.1.1 (the pre-migration discrepancy is gone).
9. **Smoke-tested in the new repo (pre-swap):** `from ai_router import route, send_session_complete_notification; from ai_router.session_log import SessionLog` all import cleanly. Layout validated via raw `git worktree list` (worktree CLI fallback below). All four canonical signals pass.
10. **Operator coordination** — operator closed VS Code on the harvester before the swap; no `cleanup-dev-orphans` invocation needed.
11. **Atomic swap** via two separate `mv` operations:
    - `dabbler-access-harvester` → `dabbler-access-harvester-old`
    - `dabbler-access-harvester-new` → `dabbler-access-harvester`
12. **Post-swap verification:** layout signals all green, `git status --short --branch` clean, `from ai_router import route` succeeds.
13. **Operator VS Code smoke test:** confirmed green ("all good") — extension activates without manifest-registration errors, Cost Dashboard renders, Session Set Explorer shows expected session sets bucketed correctly.

**Bundle files preserved in `C:\Users\denmi\source\repos\` for ~1 week:**
- `harvester-migrate-pip-20260506-132426.bundle`
- `harvester-vba-poc-20260506-132426.bundle`

**Old container preserved at `C:\Users\denmi\source\repos\dabbler-access-harvester-old\` for ~1 week** as rollback safety net. Backup refs `backup/migrate-pip-20260506-132426` and `backup/vba-poc-20260506-132426` live inside `-old/.bare/` (still accessible if rollback is needed).

### Notable gap surfaced during Session 2

**`python -m ai_router.worktree` is not available in the new repo's `.venv`.** PyPI's published `dabbler-ai-router 0.1.1` predates Set 017's worktree-CLI shipment (Set 017 ran today, 2026-05-06; PyPI publish hasn't happened since). The CLI WILL be available once `dabbler-ai-orchestration` cuts a new PyPI release that includes the `worktree` module — likely versioned `0.2.0` or later given the new public API surface.

Validation during Session 2 fell back to raw `git worktree list` plus filesystem-signal checks (`.bare/` absent, `.git/` is a directory, no `main/` subdir). That's sufficient for canonical-layout confirmation but means the worktree CLI's drift-detection feature isn't yet usable from the harvester directly. Filed as backlog: bump `dabbler-ai-router` PyPI release once the orchestration repo is ready.

### Cleanup checklist (~1 week from 2026-05-06)

- [ ] Delete `C:\Users\denmi\source\repos\dabbler-access-harvester-old\` after operator confirms the new repo is stable in regular work.
- [ ] Delete `C:\Users\denmi\source\repos\harvester-migrate-pip-20260506-132426.bundle` and `harvester-vba-poc-20260506-132426.bundle` (the backup refs in `-old/.bare/` are gone with the directory; the bundle files are independent and safe to keep longer if desired).

## Session 3 readiness (platform)

Migration is dramatically simpler — platform is already at
canonical-compatible layout. Plan is 8 steps, mostly verification.
Core change: `pip install -U dabbler-ai-router` in the workspace
venv. Risk centers on the UAT DSL (`uat_runner/` top-level
package); step 6 smoke-tests imports + CLI as the canary.

## Spend

| Phase | Wall-clock | Spend |
|---|---|---|
| Session 1 — Audit + per-repo plan authoring + close-out | ~90 min | $0 |
| Session 2 — Harvester migration (revert / backup / clone / config / venv / smoke / swap / verify / close-out) | ~60 min | $0 |
| **Set 015 total so far (through Session 2)** | **~150 min** | **$0** |

End-of-session verification route was skipped per the spec's
amended cost projection (Set 017 precedent — operator review of
plans is the canonical verification surface for audit work). No
cross-provider routes needed; the plans are concrete enough that
ad-hoc consultation would add no value.

Cumulative spend across this conversation's session sets so far:
**$0.06** (Set 016 only — Gemini API call). Sets 017, layout-doc
edit, ADO investigation, Set 015 Session 1 all $0 metered.

## What's next

Sessions 2 and 3 ready to execute on operator's call. Recommended
order per spec amendment: harvester first (Session 2 — recipe
validation on a parked repo), platform second (Session 3 — brief
cutover window).

If unforeseen design questions surface during execution (e.g., a
state-preservation issue in the bundle/restore flow that wasn't
visible from the audit), an ad-hoc cross-provider consultation can
be scoped at $0.10–$0.30 — operator-gated, not pre-budgeted.

## Session 1 close-out gates

All five gates expected to pass cleanly:
- working_tree_clean: yes (after content commit)
- pushed_to_remote: yes (after content push)
- activity_log_entry: present
- next_orchestrator_present: present (default)
- change_log_fresh: this file authored fresh in Session 1
