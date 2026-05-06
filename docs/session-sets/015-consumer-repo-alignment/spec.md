# Consumer-repo alignment: dabbler-platform, dabbler-access-harvester

> **Status note (amended 2026-05-06):** This spec was authored on
> 2026-05-05 before Sets 016 and 017 ran. Three things changed and
> are recorded here so the original framing isn't misleading:
>
> 1. **Migration target was Option D, is now Option B.** Set 016's
>    cross-provider spike retired the bare-repo + flat-worktree
>    pattern and adopted the sibling-worktrees-folder layout
>    (Option B) as canonical. See [docs/case-studies/cross-provider-collaboration-spike-016.md](../../case-studies/cross-provider-collaboration-spike-016.md)
>    for the reasoning and [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md)
>    for the current canonical recipe. Set 017 shipped the
>    `python -m ai_router.worktree open|close|list` CLI that
>    enforces the canonical path on every operation. The migration
>    sessions in this set use those outputs; they don't re-establish
>    them.
> 2. **Set scope reduced from 4 sessions to 3.** The
>    `dabbler-homehealthcare-accessdb` migration moved out of this
>    set into [Set 018](../018-healthcare-accessdb-migration/) —
>    the operator is actively running UAT work in that repo and
>    wants to control the migration timing independently. This set
>    now covers only the audit (Session 1), harvester migration
>    (Session 2), and platform migration (Session 3).
> 3. **Per-repo session order swapped.** Harvester now goes BEFORE
>    platform (was the reverse). Rationale: the harvester is parked
>    (blocked on healthcare-accessdb completion), so its migration
>    is risk-free with respect to active-work disruption and
>    serves as a recipe-validation pass before touching platform.
>    Platform's UI work can pause for a defined cutover window
>    after the recipe is proven on harvester.
>
> Original purpose continues below; reading order: this status
> note → original purpose → session plan (with the post-amendment
> ordering noted in each session header).

> **Purpose:** Bring the two downstream consumer repos that adopt
> the Dabbler AI-led workflow up to the canonical state established
> by Sets 010–017. Drift discovered while testing v0.13.x of the
> extension — `ai-router/` (hyphen) → `ai_router/` (underscore)
> directory rename, legacy
> `darndestdabbler.dabbler-session-sets@0.8.x` extension lingering
> alongside the current `darndestdabbler.dabbler-ai-orchestration`,
> stale references in each consumer's `CLAUDE.md` / `AGENTS.md` /
> `GEMINI.md`, and possibly out-of-date `dabbler-ai-router` package
> versions — is causing real symptoms (Cost Dashboard reading the
> wrong path, manifest-registration conflicts that block extension
> activation, session-set bucketing misclassifications). This set
> resolves the drift across both consumers in scope and migrates
> their layouts from the legacy patterns to the canonical Option B.
> The third consumer (`dabbler-homehealthcare-accessdb`) is handled
> separately in Set 018 per the status note above.
> **Created:** 2026-05-05; **Amended:** 2026-05-06
> **Session Set:** `docs/session-sets/015-consumer-repo-alignment/`
> **Prerequisites:** Set 012 (workspace-relative auto-discovery, Marketplace publish workflow), Set 014 (close_session snapshot-flip fix), Set 016 (canonical-layout decision + clone-and-swap migration recipe), Set 017 (`python -m ai_router.worktree` CLI for canonical-path enforcement).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: the alignment work itself is mechanical infrastructure
> migration — directory renames, package upgrades, manifest-version
> updates, doc text edits. No UI surface for human UAT in *this*
> set's deliverables; UAT continues independently in the consumers.
> Synchronous per-call routing is the right shape; no daemon needed.

---

## Project Overview

### What the set delivers

Three downstream consumer repos brought up to current canonical
state, plus a reusable per-repo migration record so the same shape
can apply to any future consumer:

1. **`dabbler-platform`** aligned: `ai_router/` directory layout,
   `dabbler-ai-router>=0.1.1` installed, current
   `DarndestDabbler.dabbler-ai-orchestration` extension installed
   from Marketplace (legacy `dabbler-session-sets` removed),
   `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` references updated to
   current canonical paths, any drifted on-disk session-state.json
   files reconciled via `python -m ai_router.backfill_session_state`.
2. **`dabbler-access-harvester`** aligned: same shape as platform
   but accounting for the bare-repo + worktree layout (the active
   worktree at `<repo>/main/` is what gets aligned; `.bare` and
   sibling worktrees are touched only as needed to keep refs
   consistent).
3. **`dabbler-homehealthcare-accessdb`** aligned: shape-preserving
   migration — this repo's session-set workflow is UAT-centric (one
   session per Access form/report, looped extract → propose UAT →
   human runs → fix → re-extract → re-run pattern). Alignment
   updates infrastructure (paths, package versions, extension) but
   does NOT change the workflow shape itself; the per-repo
   `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` is updated to document
   the UAT-centric shape explicitly so future agents understand the
   pattern instead of trying to retrofit it into the
   parser/UI-driven session shapes used by the other two consumers.

A per-repo migration record lives in this set's
`ai-assignment.md` after Session 1, capturing the audit findings
and the per-repo plan; Sessions 2–4 reference and execute against
the recorded plans, and the final `change-log.md` summarizes what
landed in each consumer.

### Motivation

Three concrete bugs surfaced during v0.13.x rollout demonstrate the
drift cost:

- **Cost Dashboard renders empty** in `dabbler-access-harvester` /
  `main/` because the workspace has `ai-router/router-metrics.jsonl`
  but the post-Set-012 auto-discovery looks for
  `ai_router/router-metrics.jsonl`. The metrics exist, just at the
  wrong path.
- **Extension fails to activate** in workspaces where both
  `darndestdabbler.dabbler-session-sets@0.8.1` (legacy) and
  `darndestdabbler.dabbler-ai-orchestration@0.13.x` (current) are
  installed — both contribute the same `dabblerSessionSets` view
  ID, triggering manifest-registration conflicts. Symptom:
  `command 'dabbler.showCostDashboard' not found` even on v0.13.2.
- **Session sets bucket as In Progress when they should be Not
  Started** in `dabbler-access-harvester` because the legacy
  `dabbler-session-sets@0.8.x` extension (still installed alongside
  v0.13.x) uses pre-Set-7 file-presence-based bucketing and the
  current extension's correct status-field-based bucketing was
  being shadowed.

These aren't edge cases — they're what the operator sees first
thing every morning when they open these workspaces. Fixing one
repo at a time as bugs surface is reactive and incomplete; this
set does the migration deliberately and verifiably.

### Non-goals

- **No deep refactor of consumer-side code.** The alignment is
  infrastructure (paths, package versions, extension installs,
  agent docs), not feature work. Sessions in flight in any of the
  three consumers are not touched.
- **No automated re-run of consumer session-set verification.**
  Stale verifications stay as they were; the operator decides
  when / whether to re-verify any specific consumer set.
- **No change to the canonical workflow itself.** This set
  *implements* current canonical state in three consumers; it
  doesn't propose changes to what canonical *is*. Any
  canonical-side polish (Set 011's screenshots, framing, etc.)
  lives in its own restorable set.
- **No migration of `dabbler-homehealthcare-accessdb` away from
  its UAT-centric session shape.** That shape is a deliberate
  workflow choice the operator uses for knowledge transfer
  between sessions; the alignment work documents it, doesn't
  change it.
- **No retroactive fix of historical metrics in workspaces where
  metrics writes never happened at all.** If the
  `ai-router/router-metrics.jsonl` doesn't exist in a consumer
  (vs. exists at the wrong path), the dashboard for that consumer
  will populate naturally as new sessions run; alignment doesn't
  fabricate historical data.

---

## Naming decisions (recorded here so future audits don't relitigate)

- **Set slug:** `015-consumer-repo-alignment`. Numbering picks up
  after Set 014; Set 011 is cancelled (deferred) but its slot is
  preserved with `CANCELLED.md`.
- **Per-repo migration record location:** appended sections in
  this set's `ai-assignment.md` after Session 1, one section per
  consumer. Operator review surface is the standard
  ai-assignment.md location.
- **Consumer repo paths in scope:** absolute on the operator's machine —
  - `C:\Users\denmi\source\repos\dabbler-access-harvester` (Session 2; current layout TBD by audit, was Option D pre-Set-016)
  - `C:\Users\denmi\source\repos\dabbler-platform` (Session 3; current layout TBD by audit, likely Option A or D)
  - `C:\Users\denmi\source\repos\dabbler-homehealthcare-accessdb` is **NOT** in this set's scope; it moved to Set 018 per the status note above.
- **Restoration of Set 011:** drop `RESTORED.md` in
  `docs/session-sets/011-readme-polish/`. Spec.md is intact;
  prerequisite ("Set 012 must be closed") is already satisfied.

---

## Session Plan

### Session 1 of 3: Audit + per-repo migration plans

**Goal:** Walk both consumer repos in scope (platform, harvester),
compare each against the current canonical state (Option B layout
per Set 016, with `ai_router/` underscore directory + canonical
extension + worktree CLI per Sets 010–017), and produce per-repo
migration plans in `ai-assignment.md`. Operator reviews before any
execution session runs.

> **Healthcare-accessdb is NOT audited in this set.** It moved to
> [Set 018](../018-healthcare-accessdb-migration/) per the status
> note at the top of this spec. The audit there happens when the
> operator decides Set 018 is ready to run.

**Steps:**

1. **Read prerequisites.** This spec, Set 012's spec (auto-
   discovery), Set 014's spec (close_session snapshot-flip), Set
   016's [proposal.md](../016-harvester-cleanup-and-worktree-policy-spike/proposal.md)
   (canonical Option B layout + clone-and-swap migration recipe),
   Set 017's [design.md](../017-worktree-cli-tooling/design.md)
   (worktree CLI), the
   [canonical layout doc](../../planning/repo-worktree-layout.md),
   and the consumer-side memory entry at
   `<memory>/project_consumer_repos.md`.
2. **Register Session 1 start** (`work_started` event +
   session-state.json `currentSession: 1`).
3. **Audit `dabbler-platform`.**
   - File-system probe: `ai-router/` vs `ai_router/`; presence of
     `router-config.yaml` + `router-metrics.jsonl`; venv location;
     whether `from ai_router import route` resolves; current layout
     vs canonical Option B (does it have `<repo>/main/` and `.bare/`
     suggesting Option D, or is main at the repo root suggesting
     Option A or already-Option-B?).
   - Package probe: `pip show dabbler-ai-router` from the workspace
     venv; record version.
   - Extension probe (operator runs):
     `code --list-extensions --show-versions | Select-String dabbler`
     — record what's installed.
   - Doc probe: `grep -ln "ai-router\|ai_router"` across
     `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` — record stale
     references.
   - Worktree topology probe:
     `python -m ai_router.worktree list --json` (run against the
     repo) — captures classification (`main` / `canonical` / `drift`)
     for any registered worktrees.
   - Session-set state probe: count session-state.json files; flag
     any sets whose bucket would change after canonical-bucketing
     rules apply.
4. **Audit `dabbler-access-harvester`.** Same probes as platform.
   Capture the post-Set-016-cleanup state of the
   `vba-symbol-resolution-session-1` worktree (per Set 016's
   proposal §2, that worktree may have been moved to canonical-D
   path or may still be at `.claude/worktrees/...` if cleanup
   hasn't run; the audit records actual state, not assumed state).
5. **Author per-repo migration plans** as appended sections in
   `ai-assignment.md`. Each section follows the uniform shape:
   - **Findings** — what the audit observed.
   - **Current layout** — A / D / partial / already-B, with
     evidence.
   - **Drift items** — concrete differences from canonical Option
     B, each with a one-line rationale.
   - **Migration steps** — numbered list the execution session
     will follow, using the clone-and-swap recipe from
     [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md)
     and the worktree CLI for any in-flight worktree relocation.
   - **Risk callouts** — anything execution should pause on
     (Windows file locks, in-flight session-set work, dirty main,
     etc.).
   - **Out of scope** — backlog items the audit found but won't
     address in this set.
6. **End-of-session verification (skip route, gate manually).**
   Per the precedent set in Set 017, audit work is verifiable by
   the operator's review of the per-repo plans rather than by a
   cross-provider route. The plans become the verification
   surface; operator approval gates Session 2.
7. **Commit, push, run close-out.** No code changes in this
   session — only the audit + plans. Operator review of plans
   gates the transition to Session 2.

**Creates:** appended sections in
`docs/session-sets/015-consumer-repo-alignment/ai-assignment.md`,
one per consumer repo (platform + harvester). No artifacts in any
consumer repo this session.

**Touches:** None outside this set's folder.

**Ends with:** two per-repo migration plans in `ai-assignment.md`;
operator approves; close-out flips snapshot to closed for Session 1.

**Progress keys:** `ai-assignment.md` has three named per-repo
sections each with the five-section uniform shape; close_session
gate passes; verifier verdict is recorded.

---

### Session 2 of 3: Execute `dabbler-access-harvester` alignment

**Goal:** Apply the harvester migration plan from Session 1.
Migrate from current layout (Option D bare-repo + flat-worktree, or
whatever the audit reveals) to canonical Option B
(sibling-worktrees-folder). Resolve `ai-router/` → `ai_router/`
drift, upgrade `dabbler-ai-router>=0.1.1`, remove legacy extension,
update agent docs, validate via the worktree CLI.

> **Why harvester first** (re-sequenced from the original spec):
> the harvester is parked (blocked on healthcare-accessdb work),
> so its migration carries no active-work disruption risk. It
> serves as a recipe-validation pass before Session 3 touches the
> platform. If the clone-and-swap recipe needs adjustment based
> on harvester-specific state, that adjustment lands here and
> informs Session 3.

**Steps (high-level; full per-repo step list lives in Session 1's
migration plan):**

1. **Read Session 1's harvester migration plan.**
2. **Register Session 2 start.**
3. **Pre-migration cleanup if Set 016 cleanup recipe wasn't
   already applied** — backup branch + bundle for the
   `vba-symbol-resolution-session-1` worktree, relocate it to its
   canonical path (per Set 016 proposal §2). Defer the
   merge-vs-retire decision on the PoC branch unless operator
   has already chosen it.
4. **Run the clone-and-swap migration** (per [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md)
   "Migration recipe — bare-repo + flat-worktree (Option D) →
   canonical (Option B)"): clone fresh sibling repo, populate
   in-flight worktrees via the worktree CLI, smoke-test, atomic
   swap, keep old container as rollback safety net.
5. **Resolve the legacy `ai-router/` (hyphen) → `ai_router/`
   (underscore) directory rename** if the audit found drift.
   Most likely: the new clone lands with `ai_router/` already
   correct, so this step is verification rather than modification.
6. **Upgrade `dabbler-ai-router` to `>=0.1.1`** in the new
   workspace venv. Confirm
   `python -c "import ai_router; print(ai_router.__version__)"`
   reports `0.1.1` or later.
7. **Resolve extension conflicts** (operator runs):
   `code --uninstall-extension darndestdabbler.dabbler-session-sets`
   if the legacy extension is installed. Sweep
   `%USERPROFILE%\.vscode\extensions` for any leftover folder.
8. **Update `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`** in the
   harvester to reference the canonical Option B layout and
   `ai_router/` (underscore).
9. **Validate via the worktree CLI.**
   `python -m ai_router.worktree list --json` — every entry
   should be classified `main` or `canonical`; zero `drift`.
10. **Smoke test.** Open the new harvester in VS Code; extension
    activates without manifest-registration errors; Cost Dashboard
    populates; session-set tree shows correct bucketing.
11. **Commit, push, run close-out** in the harvester. This set's
    commit is the activity-log + session-state + ai-assignment-
    actuals update; the per-repo migration commits live in
    harvester's git history.

**Creates:** *(in harvester)* changes per the migration recipe.
*(In this set's folder)*: activity-log.json entries, session-state
updates, ai-assignment.md actuals.

**Touches:** *(in harvester)* layout (D → B), `ai_router/`,
`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`,
`requirements.txt` or equivalent if `dabbler-ai-router` is pinned.

**Ends with:** smoke test passes for harvester;
`python -m ai_router.worktree list` shows zero drift; harvester
commits pushed; this set's Session 2 closed.

**Progress keys:** `dabbler-access-harvester/` is at the canonical
Option B layout (main checkout at the repo root, no `.bare/`, no
`<repo>/main/`); `python -m ai_router.worktree list --json` shows
all entries classified `main` or `canonical`;
`pip show dabbler-ai-router` from the workspace venv reports
`>=0.1.1`; only one dabbler extension installed.

---

### Session 3 of 3: Execute `dabbler-platform` alignment

**Goal:** Apply the platform migration plan from Session 1, using
the clone-and-swap recipe validated in Session 2. End state same
as Session 2 but for `dabbler-platform`.

> **Operator-coordinated cutover window.** Session 3 includes a
> brief pause window where `dabbler-platform/` is mid-rename. The
> operator picks the timing — ideally between active platform-side
> work units rather than mid-session. The cutover itself is two
> `Rename-Item` operations (~seconds of unusability); the rest of
> the session is smoke-testing the new state.

**Steps:** mirror Session 2's eleven-step shape, with platform-
specific adjustments captured in Session 1's migration plan.
Notable differences from harvester:

- Platform may already be in Option A (sibling worktrees in
  `~/source/repos/`) rather than Option D — if so, the migration
  is the simpler **Option A → Option B** recipe in
  [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md)
  (just `git worktree move` + `<repo>-worktrees/` container
  creation; no clone-and-swap needed).
- Platform has a UAT DSL in active development (per memory entry
  `project_uat_dsl.md`); the migration must NOT disrupt the DSL
  or its compiled E2E artifacts.
- Smoke test must include opening the platform in VS Code and
  confirming the UAT Checklist surface still renders correctly,
  since that's a platform-specific UI surface that other consumers
  don't have.

**Creates / Touches / Ends with / Progress keys:** mirror Session
2 with platform-specific paths. The `dabbler-platform-discovery`
and `remaining-work-planner` sets that were misbucketed in the
original screenshot should now bucket as Not Started after
Session 3 if they haven't already.

---

## Acceptance criteria for the set

- [ ] Both consumer repos in scope (platform, harvester) are at
      canonical Option B layout (main checkout at the repo root,
      worktrees under `<repo>-worktrees/<slug>/` where applicable).
- [ ] `python -m ai_router.worktree list --json` against each
      repo shows zero `drift` entries.
- [ ] Both repos have `ai_router/` (underscore) directories with
      `router-config.yaml` and (where applicable)
      `router-metrics.jsonl` at the canonical path.
- [ ] Both repos have `dabbler-ai-router>=0.1.1` installed in
      their workspace venv.
- [ ] Both repos have only the current
      `darndestdabbler.dabbler-ai-orchestration` extension
      installed (legacy `darndestdabbler.dabbler-session-sets` is
      uninstalled and leftover folders swept from
      `%USERPROFILE%\.vscode\extensions`).
- [ ] Both repos' `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`
      reference the current canonical Option B paths (no stray
      `ai-router/` hyphenated references; no stray bare-repo
      pattern references).
- [ ] Cost Dashboard populates in each consumer's workspace.
- [ ] Extension activates in each consumer's workspace without
      manifest-registration errors (Help → Runtime Status →
      Messages list empty).
- [ ] Per-repo migration record in `ai-assignment.md` covers
      both repos with the uniform six-section shape (Findings /
      Current layout / Drift items / Migration steps / Risk
      callouts / Out of scope).
- [ ] `change-log.md` summarizes per-repo deliverables and any
      out-of-scope follow-ups filed for future sets (including
      the Set 018 healthcare migration scope).

---

## Risks

- **Windows file locks during the harvester clone-and-swap.**
  `Rename-Item` on Windows fails if any process holds the
  directory. Mitigation: Session 2 runs
  `python -m ai_router.utils cleanup-dev-orphans` before the
  swap and uses the `cleanup-dev-orphans` recipe per
  [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md).
- **`dabbler-ai-router` upgrade can break in-flight scripts.**
  Some consumer-side scripts may pin or directly invoke router
  internals that changed between `0.1.0` and `0.1.1`. Mitigation:
  Session 1's audit specifically probes for hard-coded router
  internal usage; Sessions 2/3 pause if anything unexpected is found.
- **Platform UAT DSL must not be disrupted.** Per memory entry
  `project_uat_dsl.md`, dabbler-platform has a custom UAT DSL
  driving both UAT Checklist + compiled E2E. Mitigation: Session
  1's platform audit explicitly probes for the DSL and any
  generated artifacts; Session 3's smoke test confirms the DSL
  still compiles after migration.
- **Operator may have additional consumer repos not enumerated
  here.** Two are confirmed in scope (platform, harvester); if a
  third exists beyond healthcare-accessdb (e.g., `dabbler-pdf`
  per the workspace folder list), this set doesn't cover it.
  Mitigation: Session 1 surfaces any operator-mentioned additional
  consumers; spec amended before execution if any are confirmed.
- **Extension in-place upgrade may not pick up changes cleanly.**
  v0.13.x already required users to fully restart VS Code to
  reload bundle changes. Mitigation: each execution session's
  smoke test explicitly checks Runtime Status; the operator
  restarts VS Code as part of the smoke-test step.

---

## References

- Set 010 (`010-pypi-publish-and-installer`) — established
  `dabbler-ai-router` as a PyPI package; the "install via pip"
  expectation for consumers comes from here.
- Set 012 (`012-marketplace-publish-and-readme-shrink`) — the
  workspace-relative auto-discovery for `router-config.yaml` and
  `router-metrics.jsonl` depends on the `ai_router/` (underscore)
  directory layout.
- Set 014 (`014-close-out-correctness-and-vsix-tracking`) — the
  close_session snapshot-flip mechanism that consumer close-outs
  rely on.
- Set 016 (`016-harvester-cleanup-and-worktree-policy-spike`) —
  the cross-provider spike that retired the bare-repo + flat-
  worktree pattern and adopted Option B as canonical. The
  clone-and-swap migration recipe used in Sessions 2 and 3 comes
  from Set 016's [proposal.md](../016-harvester-cleanup-and-worktree-policy-spike/proposal.md).
- Set 017 (`017-worktree-cli-tooling`) — shipped
  `python -m ai_router.worktree open|close|list`. Sessions 2/3
  use the CLI for worktree relocation and post-migration
  validation.
- Set 018 (`018-healthcare-accessdb-migration`) — deferred
  migration of `dabbler-homehealthcare-accessdb`, run when the
  operator's UAT cadence allows.
- `docs/ai-led-session-workflow.md` — canonical workflow each
  session follows.
- `docs/planning/repo-worktree-layout.md` — the canonical
  Option B layout standard, including both A→B and D→B
  migration recipes.
- Memory entries: `project_consumer_repos.md` (three consumer
  repos' workflow shapes), `project_uat_dsl.md` (platform's UAT
  DSL pattern that must not be disrupted in Session 3).

---

## Cost projection

Per-session estimates. Per the precedent set in Set 017,
end-of-session verification routes are SKIPPED for sessions where
audit / migration is the only work and tests + operator review are
the canonical verification surface. The cost projection reflects
this — most sessions run at $0 metered.

| Session | Estimated cost | Notes |
|---|---|---|
| 1 — Audit + per-repo migration plans | $0 | Read-only; operator review of plans is the verification surface (per Set 017 precedent). |
| 2 — `dabbler-access-harvester` alignment | $0 | Migration mechanics are scripted per the canonical recipe; smoke test + worktree CLI validation are the verification. |
| 3 — `dabbler-platform` alignment | $0 | Same shape as Session 2; UAT DSL check adds smoke-test surface but no verification route. |
| **Set total (metered)** | **$0** | Comparable cumulative spend to Set 016 + Set 017 ($0.06 total across both). If unforeseen design questions surface during the audit, an ad-hoc cross-provider consultation can be routed at that point — gated on operator approval, not pre-budgeted. |

If the per-repo migration plans surface design tradeoffs that warrant
cross-provider input (similar to Set 016's spike), one or more
ad-hoc consultations can be scoped at $0.10–$0.30 each and gated by
operator approval at the time the question arises.
