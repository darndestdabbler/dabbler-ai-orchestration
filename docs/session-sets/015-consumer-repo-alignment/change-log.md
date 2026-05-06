# Change log — Set 015 (consumer-repo alignment)

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

## Session 2 readiness (harvester)

Migration recipe is locked. 16-step clone-and-swap with explicit
preservation of the active migration branch via backup ref +
bundle. Old container stays as `dabbler-access-harvester-old/`
for ~1 week as rollback safety net. Smoke test gates include
extension activation + Cost Dashboard + worktree CLI showing
zero drift.

## Session 3 readiness (platform)

Migration is dramatically simpler — platform is already at
canonical-compatible layout. Plan is 8 steps, mostly verification.
Core change: `pip install -U dabbler-ai-router` in the workspace
venv. Risk centers on the UAT DSL (`uat_runner/` top-level
package); step 6 smoke-tests imports + CLI as the canary.

## Spend

| Phase | Wall-clock | Spend |
|---|---|---|
| Audit (filesystem probes, git probes, pip probes, doc grep) | ~30 min | $0 |
| Per-repo plan authoring | ~45 min | $0 |
| Close-out artifacts | ~15 min | $0 |
| **Session 1 total** | **~90 min** | **$0** |

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
