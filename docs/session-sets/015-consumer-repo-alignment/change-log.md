# Change log — Set 015 (consumer-repo alignment)

> **Status at end of Session 3 (Set 015 complete):** Platform
> migration to canonical Option B done — already at compatible
> layout, so the work was the `dabbler-ai-router` pip upgrade
> (0.1.0 → 0.1.1) plus a defense-in-depth parser fix in the
> orchestration extension that surfaced when verifying UAT
> detection. Three platform specs got canonical
> `## Session Set Configuration` headings during the same
> session: two existing UAT-flagged sets (admin-user-creation-flow,
> admin-users-cross-links) that the old parser was missing because
> their yaml block sat past 4000 bytes under a non-canonical
> `## UAT scope` heading, plus `unified-master-details-composite`
> which now declares `requiresUAT: true` per operator confirmation
> that visual UI verification matters there. **Set 015 is now fully
> closed.** Three consumer repos in scope: harvester migrated
> (Session 2), platform aligned (Session 3), healthcare-accessdb
> deferred to [Set 018](../018-healthcare-accessdb-migration/).
>
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

## Session 3 deliverables (platform alignment + parser fix — COMPLETE)

Executed the simpler-than-Session-2 plan from Session 1's
ai-assignment.md (platform was already at canonical Option B-
compatible layout, so no clone-and-swap needed). Plus an unplanned
side-quest: fixed an orchestration-side parser bug surfaced by
verifying UAT detection on platform's specs.

**Key actions taken (in order):**

1. **Pre-flight** — confirmed platform working tree clean on `migrate/dabbler-ai-router-pip` branch tracking origin. `dabbler-ai-router` confirmed at 0.1.0. `.claude/settings.json` is a 4-line permission rule (not migration-relevant). `requirements.txt` has loose pin `dabbler-ai-router>=0.1.0` — no file edits needed for the upgrade.
2. **pip upgrade** — `.venv/Scripts/python.exe -m pip install --upgrade dabbler-ai-router`. **Result: 0.1.0 → 0.1.1 cleanly.** `pip show` and `import ai_router; __version__` both report 0.1.1.
3. **UAT DSL canary** — `from uat_runner.runner import run_checklist; from uat_runner.triage import FailureRecord, TriageSession` imports succeed. `python -m uat_runner.cli --help` renders correctly. The platform-specific UAT DSL infrastructure is unaffected by the upgrade (as expected — `uat_runner` is a top-level package, separate from `ai_router`).
4. **UAT detection investigation** — operator asked which platform sets declare `requiresUAT: true` and noticed that `admin-users-cross-links` has it in the spec but might not be parser-detected. Investigation confirmed the parser bug:
   - The extension parser ([fileSystem.ts:107-138](../../../tools/dabbler-ai-orchestration/src/utils/fileSystem.ts#L107-L138)) looked for a `## Session Set Configuration` heading + yaml block; if not found, it scanned the FIRST 4000 BYTES of the spec.
   - Two platform specs (`admin-user-creation-flow`, `admin-users-cross-links`) put their yaml block under `## UAT scope` instead of the canonical heading, AND had enough upstream prose to push the yaml past 4000 bytes (line 83 byte 4079, and line 80 byte 4308 respectively).
   - Result: the extension treated both as `requiresUAT: false` — no UAT badges, no "Open UAT Checklist" context-menu item, no UAT-related affordances.
5. **Parser fix in orchestration source** — changed the fallback in `fileSystem.ts` from `text.slice(0, 4000)` to scanning the entire file. The line-anchored regex (`^\s*requiresUAT:\s*(true|false)\s*$`) is specific enough that false positives in prose are very unlikely. Added two regression tests in `fileSystem.test.ts` covering the fixed case (yaml past 4000 bytes under non-canonical heading) and a negative case (no declaration anywhere stays false).
6. **Parser fix verification** — unit-test runner is broken on this Windows host (pre-existing issue per Set 014: mocha BDD/TDD UI mismatch + `vscode` import missing in non-extension-host context). Verified the fix via an ad-hoc Node script that inlined the parser logic and exercised it against real platform specs: 5/5 passing (2 previously-misdetected specs now caught, 1 already-detected spec still works, 1 legitimately-false spec stays false, 1 synthetic prose-mention case correctly stays false).
7. **Platform spec hygiene** — added `## Session Set Configuration` heading + canonical yaml block to three platform specs:
   - `admin-user-creation-flow` (now detected by both old and new parser; existing `## UAT scope` block left intact for prose context)
   - `admin-users-cross-links` (same)
   - `unified-master-details-composite` (now declares `requiresUAT: true` for the first time, per operator confirmation that the master-details composite control needs visual verification across its four data-entry workflows)
8. **Operator confirmations** — extension probe shows only canonical `darndestdabbler.dabbler-ai-orchestration` installed (no legacy `dabbler-session-sets`). VS Code smoke test on platform: extension activates without manifest-registration errors, Cost Dashboard renders, Session Set Explorer shows correct bucketing. UAT-detection canary: right-click on any of the four UAT-flagged sets shows "Open UAT Checklist" in the context menu — confirming the platform spec edits are picked up by the currently-installed extension.

### Notable gaps surfaced (queued backlog)

**Both gaps are release-pipeline concerns, not Session 3 scope:**

1. **`python -m ai_router.worktree` not available in pip-installed `dabbler-ai-router 0.1.1`.** The CLI was shipped in Set 017 today (2026-05-06) but PyPI's published version predates that. Will resolve once the next PyPI release of `dabbler-ai-router` includes the worktree module — likely versioned 0.2.0 given the new public API surface.
2. **Parser fix is in orchestration source but not in the operator's installed VSIX.** The fix will take effect once the next VSIX rebuild + Marketplace republish (or local VSIX install). Until then, the operator's installed extension still uses the old parser — but the platform spec edits work around that by using the canonical heading, so all four UAT-flagged platform sets are correctly detected by both the old and new parser.

Both gaps share a logical resolution: a future "release" session set (or focused commit + Marketplace publish workflow) that bundles the worktree CLI + parser fix into the next dabbler-ai-router PyPI release and dabbler-ai-orchestration VSIX release.

## Set 015 final summary

All three sessions complete:

| Session | Repo | Outcome |
|---|---|---|
| 1 | (this set) | Audit + per-repo migration plans authored in ai-assignment.md |
| 2 | dabbler-access-harvester | Migrated D → B via clone-and-swap; old container preserved for ~1 week; operator VS Code smoke test green |
| 3 | dabbler-platform + this orchestration repo | pip upgrade 0.1.0 → 0.1.1; parser fix + tests; 3 platform spec hygiene edits; operator VS Code smoke test green |

`dabbler-homehealthcare-accessdb` migration remains in [Set 018](../018-healthcare-accessdb-migration/) — operator-timed; runs when UAT cadence allows.

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
| Session 3 — Platform pip upgrade + parser fix side-quest + 3 spec hygiene edits + close-out | ~75 min | $0 |
| **Set 015 total** | **~225 min** | **$0** |

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
