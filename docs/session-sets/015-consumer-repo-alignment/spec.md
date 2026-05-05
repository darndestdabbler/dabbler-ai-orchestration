# Consumer-repo alignment: dabbler-platform, dabbler-access-harvester, dabbler-homehealthcare-accessdb

> **Purpose:** Bring the three downstream consumer repos that adopt
> the Dabbler AI-led workflow up to the canonical state established
> by Sets 010–014. Drift discovered while testing v0.13.x of the
> extension — `ai-router/` (hyphen) → `ai_router/` (underscore)
> directory rename, legacy
> `darndestdabbler.dabbler-session-sets@0.8.x` extension lingering
> alongside the current `darndestdabbler.dabbler-ai-orchestration`,
> stale references in each consumer's `CLAUDE.md` / `AGENTS.md` /
> `GEMINI.md`, and possibly out-of-date `dabbler-ai-router` package
> versions — is causing real symptoms (Cost Dashboard reading the
> wrong path, manifest-registration conflicts that block extension
> activation, session-set bucketing misclassifications). This set
> resolves the drift across all three consumers while preserving
> the distinct workflow shapes each consumer uses.
> **Created:** 2026-05-05
> **Session Set:** `docs/session-sets/015-consumer-repo-alignment/`
> **Prerequisite:** Set 012 (`012-marketplace-publish-and-readme-shrink`) closed (workspace-relative auto-discovery, Marketplace publish workflow). Set 014 (`014-close-out-correctness-and-vsix-tracking`) closed (close_session snapshot-flip fix is required if any in-flight session sets in the consumers need close-out reconciliation as part of the alignment).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Session Set Configuration

```yaml
totalSessions: 4
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
- **Consumer repo paths:** absolute on the operator's machine —
  - `C:\Users\denmi\source\repos\dabbler-platform`
  - `C:\Users\denmi\source\repos\dabbler-access-harvester` (active
    worktree at `\main`)
  - `C:\Users\denmi\source\repos\dabbler-homehealthcare-accessdb`
- **Restoration of Set 011:** drop `RESTORED.md` in
  `docs/session-sets/011-readme-polish/`. Spec.md is intact;
  prerequisite ("Set 012 must be closed") is already satisfied.

---

## Session Plan

### Session 1 of 4: Audit + per-repo migration plans

**Goal:** Walk each of the three consumer repos, compare its
current state against the canonical state from Sets 010–014, and
produce a per-repo migration plan recorded in this set's
`ai-assignment.md`. Operator reviews before any execution sessions
run; review can edit / approve / veto specific items per repo.

**Steps:**

1. **Read prerequisites.** This spec, Set 012's spec.md (what the
   `ai_router/` rename + auto-discovery actually entail), Set 014's
   spec.md (close_session snapshot-flip mechanism), the consumer-side
   memory entry at
   `<memory>/project_consumer_repos.md`.
2. **Register Session 1 start** (`work_started` event +
   session-state.json `currentSession: 1`).
3. **Audit `dabbler-platform`.**
   - File-system probe: `ai-router/` vs `ai_router/`; presence of
     `router-config.yaml` + `router-metrics.jsonl`; venv location;
     whether `from ai_router import route` resolves.
   - Package probe: `pip show dabbler-ai-router` from the workspace
     venv; record version.
   - Extension probe (operator runs):
     `code --list-extensions --show-versions | Select-String dabbler`
     — record what's installed.
   - Doc probe: `grep -ln "ai-router\|ai_router"` across
     `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` — record any references
     that would need updating after the directory rename.
   - Session-set state probe: count session-state.json files,
     count CANCELLED.md / RESTORED.md, identify any sets whose
     bucket would change after canonical-bucketing rules apply.
4. **Audit `dabbler-access-harvester` (`/main` worktree).** Same
   probes as platform, plus:
   - `git worktree list` to record the current worktree topology.
   - Whether the legacy `darndestdabbler.dabbler-session-sets`
     extension is also installed alongside the current one.
5. **Audit `dabbler-homehealthcare-accessdb`.** Same probes as
   platform, plus:
   - Confirm whether this repo has a Python venv / uses
     `dabbler-ai-router` at all (the metadata-extraction tool may
     run from a different Python environment).
   - Confirm the UAT Checklist Editor wiring — which session sets
     declare `requiresUAT: true`; whether the per-set checklist
     JSON files exist and conform to the canonical schema.
   - Document the UAT-centric session shape (extract → propose UAT →
     human runs → fix → re-extract → re-run) so the migration plan
     for this repo can preserve it.
6. **Author per-repo migration plans** as appended sections in
   this set's `ai-assignment.md`. Each section follows a uniform
   shape:
   - **Findings** — what the audit observed.
   - **Drift items** — concrete differences from canonical, each
     with a one-line rationale.
   - **Migration steps** — numbered list the execution session will
     follow.
   - **Risk callouts** — anything execution should pause on.
   - **Out of scope** — anything the audit found that's a real
     issue but not in this set's scope (file as backlog).
7. **End-of-session cross-provider verification.** Verifier
   reviews: (a) audit thoroughness — does each repo's section
   cover all the relevant probe categories? (b) migration plan
   actionability — could a future session execute against the plan
   without further investigation? (c) cross-repo consistency —
   are the plans aligned where the repos are similar (platform +
   harvester) and intentionally different where the workflow shape
   differs (healthcare-accessdb)?
8. **Commit, push, run close-out.** No code changes in this
   session — only the audit + plans. Verifier verdict gates the
   transition to Session 2.

**Creates:** appended sections in
`docs/session-sets/015-consumer-repo-alignment/ai-assignment.md`,
one per consumer repo. No artifacts in any consumer repo this
session.

**Touches:** None outside this set's folder.

**Ends with:** three per-repo migration plans in `ai-assignment.md`;
verifier returns `VERIFIED`; close-out flips snapshot to closed for
Session 1.

**Progress keys:** `ai-assignment.md` has three named per-repo
sections each with the five-section uniform shape; close_session
gate passes; verifier verdict is recorded.

---

### Session 2 of 4: Execute `dabbler-platform` alignment

**Goal:** Apply the migration plan recorded in Session 1's
`ai-assignment.md` for `dabbler-platform`. End state: extension
activates cleanly, Cost Dashboard populates, no manifest-registration
conflicts, no extension-version mismatches, agent docs reference
the canonical paths.

**Steps:**

1. **Read Session 1's `dabbler-platform` migration plan.**
2. **Register Session 2 start.**
3. **Apply directory rename if drift present.**
   `Rename-Item .../dabbler-platform/ai-router ai_router`. Verify
   any consumer-side scripts that hard-code the path.
4. **Upgrade `dabbler-ai-router` to `>=0.1.1`** in the workspace
   venv: `.venv/Scripts/pip install --upgrade dabbler-ai-router`.
   Confirm `python -c "import ai_router; print(ai_router.__version__)"`
   reports `0.1.1` or later.
5. **Resolve extension conflicts** (operator runs the
   PowerShell):
   `code --uninstall-extension darndestdabbler.dabbler-session-sets`
   if the legacy extension is installed. Sweep
   `%USERPROFILE%\.vscode\extensions` for any
   `darndestdabbler.dabbler-session-sets-*` folder; remove. Confirm
   only `darndestdabbler.dabbler-ai-orchestration` remains.
6. **Update `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`** to reference
   `ai_router/` (underscore) and the current
   `dabbler-ai-router>=0.1.1` install command.
7. **Reconcile session-state files** if any drift:
   `python -m ai_router.backfill_session_state` from the workspace
   root. Record any sets whose bucket changes.
8. **Smoke test.** From the workspace open in VS Code: extension
   activates without manifest-registration errors (Help → Runtime
   Status → Messages list empty); Cost Dashboard opens and
   populates; session-set tree shows correct bucketing.
9. **End-of-session cross-provider verification.** Verifier
   reviews the diff against the migration plan + checks that the
   smoke-test outcomes align with the plan's predicted end state.
10. **Commit, push, run close-out.** Per-repo commit lives in
    `dabbler-platform`; this set's commit is the
    activity-log + session-state + ai-assignment-actuals update.

**Creates:** *(in `dabbler-platform`)* none — all changes are
modifications. *(In this set's folder)*: activity-log.json
entries, session-state.json updates, ai-assignment.md actuals.

**Touches:** *(in `dabbler-platform`)* `ai-router/` →
`ai_router/`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
`requirements.txt` or equivalent if `dabbler-ai-router` is pinned.

**Ends with:** smoke test passes for `dabbler-platform`; verifier
returns `VERIFIED`; consumer-side commit pushed; this set's
session 2 closed.

**Progress keys:** `dabbler-platform/ai_router/router-metrics.jsonl`
exists at the canonical path; `pip show dabbler-ai-router` from the
workspace venv reports `>=0.1.1`; `code --list-extensions` shows
exactly one dabbler entry (`darndestdabbler.dabbler-ai-orchestration`).

---

### Session 3 of 4: Execute `dabbler-access-harvester` alignment

**Goal:** Same shape as Session 2 but for the harvester, accounting
for the bare-repo + worktree layout. Active worktree at
`<repo>/main` is the alignment target; `.bare` is the bare repo
(no working tree, no alignment); sibling worktrees under
`.claude/worktrees/` are touched only if they hold session-set
data that would be misclassified by the current bucketing rules.

**Steps:** mirror Session 2's eleven-step shape, with these
adjustments specific to the worktree layout:

- File-system operations target `<repo>/main` as the working tree;
  `git worktree list` confirms the topology before any rename.
- After the directory rename in `main`, verify that sibling
  worktrees haven't pinned the old path (they shouldn't — each
  worktree has its own working tree, but git tracks the parent
  repo's index).
- Smoke test runs from a VS Code window opened on `<repo>/main`
  specifically; verify the diagnostic log line
  (`[dabbler-ai-orchestration] readSessionSets(main): N set(s) — ...`)
  reports the expected counts after alignment.

**Creates / Touches / Ends with / Progress keys:** mirror Session
2 with the harvester-specific paths. The
`dabbler-platform-discovery` and `remaining-work-planner` sets
that were misbucketed in the original screenshot should now bucket
as Not Started after Session 3.

---

### Session 4 of 4: Execute `dabbler-homehealthcare-accessdb` alignment

**Goal:** Apply the migration plan for the synthetic Access DB
repo while preserving its UAT-centric session shape. End state:
infrastructure aligned with canonical (paths, package versions,
extension), workflow-shape documentation explicit in the repo's
agent files so future sessions understand the pattern, no
disruption to in-flight UAT work.

**Steps (paraphrased; full step list authored in Session 1's
migration plan):**

1. Read Session 1's migration plan for this repo.
2. Register Session 4 start.
3. Apply infrastructure migration items per the plan.
4. **Author or update workflow-shape documentation** in
   `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`. Document the
   six-step UAT loop:
   - (a) AI runs the extraction program → metadata captured.
   - (b) AI selects next form/report → constructs UAT session via
     the UAT Checklist Editor.
   - (c) Operator runs UAT → feedback.
   - (d) AI proposes database fixes.
   - (e) AI re-runs extraction → verifies fix.
   - (f) Operator re-runs UAT.
   - Pass / fail gates the next session.
5. Smoke test: open the repo in VS Code, confirm extension
   activation, confirm any in-flight UAT session sets render
   correctly in the tree.
6. End-of-session cross-provider verification — verifier reviews
   the workflow-shape documentation specifically for
   completeness + accuracy against the operator-described loop.
7. **Commit, push, run close-out.** Final session — write
   `change-log.md` summarizing all three consumer-side migrations
   and surface any per-repo follow-up items the audit identified
   but couldn't address in scope.

**Creates:** `docs/session-sets/015-consumer-repo-alignment/change-log.md`
(this set's close-out artifact). *(In
`dabbler-homehealthcare-accessdb`)*: workflow-shape doc additions
in agent files; possibly a `docs/workflow-shape.md` cross-link if
the agent files reference one.

**Touches:** mirror Sessions 2 + 3 plus the workflow-shape doc
additions.

**Ends with:** all three consumers aligned; this set's
`change-log.md` summarizes the cross-repo migration; verifier
returns `VERIFIED`; close-out flips this set's snapshot to closed.

**Progress keys:** all three consumer repos pass their respective
smoke tests; the `change-log.md` enumerates per-repo deliverables;
no in-flight UAT work in `dabbler-homehealthcare-accessdb` was
disrupted (verified by checking session-state.json shape
preservation across the migration).

---

## Acceptance criteria for the set

- [ ] All three consumer repos have `ai_router/` (underscore)
      directories with `router-config.yaml` and (where applicable)
      `router-metrics.jsonl` at the canonical path.
- [ ] All three consumer repos have `dabbler-ai-router>=0.1.1`
      installed in their workspace venv (or documented as N/A for
      `dabbler-homehealthcare-accessdb` if it uses a different
      Python environment).
- [ ] All three consumer repos have only the current
      `darndestdabbler.dabbler-ai-orchestration` extension
      installed (legacy `darndestdabbler.dabbler-session-sets` is
      uninstalled and its leftover folders swept from
      `%USERPROFILE%\.vscode\extensions`).
- [ ] All three consumer repos' `CLAUDE.md` / `AGENTS.md` /
      `GEMINI.md` reference current canonical paths (no stray
      `ai-router/` hyphenated references).
- [ ] `dabbler-homehealthcare-accessdb`'s agent files document the
      UAT-centric session shape explicitly.
- [ ] Cost Dashboard populates in each consumer's workspace.
- [ ] Extension activates in each consumer's workspace without
      manifest-registration errors (Help → Runtime Status →
      Messages list empty).
- [ ] Per-repo migration record in this set's
      `ai-assignment.md` covers all three repos with the uniform
      five-section shape.
- [ ] `change-log.md` summarizes per-repo deliverables and any
      out-of-scope follow-ups filed for future sets.

---

## Risks

- **Worktree-layout edge case in `dabbler-access-harvester`.** The
  bare-repo + multi-worktree layout means a directory rename in
  `main` doesn't propagate to sibling worktrees automatically.
  Mitigation: Session 1's audit captures the worktree topology;
  Session 3 only renames in `main` and explicitly verifies that
  sibling worktrees aren't broken (their session-set folders
  resolve correctly when discovered via the extension's
  `discoverRoots`).
- **`dabbler-ai-router` upgrade can break in-flight scripts.**
  Some consumer-side scripts may pin or directly invoke router
  internals that changed between `0.1.0` and `0.1.1`. Mitigation:
  Session 1's audit specifically probes for hard-coded router
  internal usage; Session 2/3/4's execution pauses if anything
  unexpected is found.
- **Workflow-shape documentation in
  `dabbler-homehealthcare-accessdb` could over-promise.** The
  six-step loop is the operator's stated current pattern but
  evolves with the project. Mitigation: document with operator
  attribution + date; future agent-file edits can refine without
  re-litigating.
- **Operator may have additional consumer repos not enumerated
  here.** Three are confirmed in scope; if a fourth exists (e.g.,
  `dabbler-pdf` per the workspace folder list), this set
  intentionally doesn't cover it. Mitigation: Session 1 surfaces
  any operator-mentioned additional consumers and the spec is
  amended via a small operator-approved patch before execution.
- **Extension in-place upgrade may not pick up the changes
  cleanly.** v0.13.x already required users to fully restart VS
  Code to reload bundle changes. Mitigation: each execution
  session's smoke test explicitly checks Runtime Status; the
  operator restarts VS Code as part of the smoke-test step.

---

## References

- Set 010 (`010-pypi-publish-and-installer`) — established
  `dabbler-ai-router` as a PyPI package and the `Dabbler: Install
  ai-router` extension command. The "install via pip" expectation
  for consumers comes from this set.
- Set 012 (`012-marketplace-publish-and-readme-shrink`) — the
  workspace-relative auto-discovery for `router-config.yaml` and
  `router-metrics.jsonl` (Session 1) is the mechanism that depends
  on the `ai_router/` (underscore) directory layout. This set's
  scope flows directly from that.
- Set 014 (`014-close-out-correctness-and-vsix-tracking`) — the
  close_session snapshot-flip mechanism. If any in-flight session
  sets in the consumers need close-out reconciliation as part of
  alignment, Set 014's fixes apply.
- Set 011 (`011-readme-polish`) — cancelled in favor of this set;
  restorable when consumer-side drift is behind us.
- `docs/ai-led-session-workflow.md` — canonical workflow each
  session follows.
- `docs/planning/repo-worktree-layout.md` — the bare-repo +
  worktree layout standard relevant to the harvester.
- Memory entry: `project_consumer_repos.md` — the three consumer
  repos' workflow shapes (parser-driven, UI-driven, UAT-loop).

---

## Cost projection

Per-session estimates (single end-of-session cross-provider route
each, no analysis routes per the standing operator cost-containment
rule):

| Session | Estimated cost | Notes |
|---|---|---|
| 1 — Audit + per-repo migration plans | $0.15–$0.30 | Read-heavy; verifier reviews the audit thoroughness across three repos. |
| 2 — `dabbler-platform` alignment | $0.20–$0.40 | Includes diff review + smoke-test outcome verification; possible R2 if doc edits need tightening. |
| 3 — `dabbler-access-harvester` alignment | $0.20–$0.40 | Worktree-layout edge cases add review surface; possible R2. |
| 4 — `dabbler-homehealthcare-accessdb` alignment | $0.25–$0.45 | Workflow-shape documentation has prose-quality verification; R2 likely (per Set 010 / Set 012 Session 3 prose-review pattern). |
| **Set total** | **$0.80–$1.55** | Comparable to Set 012's projection; sized for three real consumer migrations. |

The largest cost driver is Session 4's prose review on the
workflow-shape documentation — comparable to Set 010 Session 3 or
Set 012 Session 3. If R2 is needed across multiple sessions,
cumulative cost may push higher; the per-session R2 escalation is
gated by verifier verdicts, not pre-budgeted.
