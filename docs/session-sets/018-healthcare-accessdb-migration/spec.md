# `dabbler-homehealthcare-accessdb` migration to canonical Option B layout

> **Status:** Reserved. Not yet started. Run when the operator's
> active UAT cadence in `dabbler-homehealthcare-accessdb` allows
> a brief migration window. The set's design is deliberately
> tight: minimize wall-clock time the repo is unusable.
> **Created:** 2026-05-06 (carved out of Set 015's original Session 4).
> **Session Set:** `docs/session-sets/018-healthcare-accessdb-migration/`
> **Prerequisites:** Sets 015 Sessions 2 & 3 closed (recipe validated on harvester + platform); Sets 016 & 017 closed (canonical layout decision + worktree CLI shipped).
> **Workflow:** Orchestrator → audit → operator-timed migration → close-out.

---

## Why this is its own set

This work was originally Session 4 of Set 015 (consumer-repo
alignment). Splitting it out per operator decision 2026-05-06
because:

1. **The operator is actively running UAT work in this repo.** The
   migration must be timed for minimal disruption — possibly hours
   or days after Set 015 Sessions 2/3 land, depending on the UAT
   cadence. Keeping a session set "in-progress" for an
   indeterminate window distorts cost-tracking and session-flow
   reporting.
2. **The migration recipe will have been validated TWICE** (on
   harvester in Set 015 Session 2, on platform in Set 015 Session 3)
   before this set runs. Risk to the operator's most active repo
   is minimized by that staging.
3. **The healthcare-accessdb workflow shape is distinct.** It runs
   a UAT-centric loop (extract → propose UAT → human runs → fix →
   re-extract → re-run) that the other consumers don't share.
   Documenting the workflow shape explicitly in the repo's agent
   files is part of this set's deliverable, not just the
   infrastructure migration.

---

## Session Set Configuration

```yaml
totalSessions: 1
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: single-session migration of one repo. The validation
> work happened in Set 015's per-repo plans + the recipe runs on
> harvester and platform. This session executes against an
> already-validated recipe; the only novelty is the workflow-shape
> documentation deliverable.

---

## Project Overview

### What the set delivers

1. **`dabbler-homehealthcare-accessdb` migrated** from its current
   layout (TBD by Session 1's audit; likely Option A or sequential
   single-tree) to canonical Option B.
2. **Infrastructure aligned** with the other consumer repos:
   `ai_router/` (underscore) directory, `dabbler-ai-router>=0.1.1`
   in workspace venv, `darndestdabbler.dabbler-ai-orchestration`
   extension installed (legacy extension removed if present),
   agent files (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`) reference
   canonical paths.
3. **Workflow-shape documentation explicit** in the agent files —
   the six-step UAT loop:
   - (a) AI runs the extraction program → metadata captured
   - (b) AI selects next form/report → constructs UAT session via the UAT Checklist Editor
   - (c) Operator runs UAT → feedback
   - (d) AI proposes database fixes
   - (e) AI re-runs extraction → verifies fix
   - (f) Operator re-runs UAT
   - Pass/fail gates the next session
4. **No disruption to in-flight UAT work.** The migration is timed
   between UAT cycles; the clone-and-swap recipe minimizes the
   unusability window to seconds (two `Rename-Item` operations).

### Non-goals

- **No change to the UAT loop itself.** The shape is documented as-is, not redesigned. Future agent-file edits can refine the loop documentation; this set captures it as currently practiced.
- **No migration of the synthetic Access DB itself.** The `.accdb` file's content and the metadata-extraction tooling are not touched. This set is purely about repo layout + framework alignment.
- **No re-verification of past UAT runs.** Historical UAT outcomes stay as they were; the migration doesn't re-run them.

---

## Session Plan

### Session 1 of 1: Audit + execute migration

**Goal:** Audit the repo's current state, run the migration to
Option B, document the UAT workflow shape, smoke-test, close out.

**Steps:**

1. **Read prerequisites** (this spec + Set 015's per-repo audit
   approach + Set 016's clone-and-swap recipe).
2. **Register Session 1 start.**
3. **Audit `dabbler-homehealthcare-accessdb`.** Same probe shape
   as Set 015 Session 1: filesystem layout (Option A / D / other),
   `pip show dabbler-ai-router`, extension state, doc references,
   worktree topology via `python -m ai_router.worktree list --json`,
   session-set state. Plus healthcare-specific:
   - Confirm whether this repo has a Python venv / uses
     `dabbler-ai-router` at all (the metadata-extraction tool may
     run from a different Python environment).
   - Confirm the UAT Checklist Editor wiring — which session sets
     declare `requiresUAT: true`; whether per-set checklist JSON
     files exist and conform to the canonical schema.
   - Capture the current six-step loop AS PRACTICED — operator
     attribution + date — so the documentation reflects reality.
4. **Author the migration plan** as a section in `ai-assignment.md`
   following the same six-section shape as Set 015's plans.
5. **Operator approval gate.** Show the plan; get explicit approval
   AND timing confirmation before any execution.
6. **Pre-migration: pause UAT work.** Operator confirms no
   in-flight UAT cycle is mid-iteration; if there is, defer
   execution to the next natural pause.
7. **Execute the migration** per the canonical recipe in
   [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md).
   Likely flow (subject to audit findings):
   - Backup branches + bundles for any in-flight work
   - Clone-and-swap if currently Option D, OR `git worktree move`
     if currently Option A
   - Container creation (`<repo>-worktrees/`) on demand
   - Extension cleanup / `dabbler-ai-router` upgrade in the new venv
   - Doc updates in `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`
   - **Workflow-shape documentation added** with the six-step loop
     and operator attribution
8. **Validate.** `python -m ai_router.worktree list --json` shows
   zero drift; extension activates cleanly; Cost Dashboard
   populates; UAT Checklist tree renders correctly.
9. **Operator resumes UAT.** Smoke-test from operator's perspective:
   open the repo, navigate to current UAT work, confirm everything
   loads as expected.
10. **Author close-out artifacts.**
11. **Commit, push, run close-out.**

**Creates:** *(in healthcare-accessdb)* migration artifacts per the
recipe; workflow-shape additions to agent files. *(In this set)*:
all standard close-out artifacts.

**Touches:** *(in healthcare-accessdb)* layout migration to Option B,
`ai_router/`, `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`,
`requirements.txt` or equivalent.

**Ends with:** healthcare-accessdb migrated; UAT work resumes
without disruption; this set's snapshot closed.

---

## Acceptance criteria for the set

- [ ] `dabbler-homehealthcare-accessdb` is at canonical Option B layout.
- [ ] `python -m ai_router.worktree list --json` against the repo shows zero drift.
- [ ] `ai_router/` (underscore) directory exists with `router-config.yaml` (and `router-metrics.jsonl` if applicable) at canonical paths.
- [ ] `dabbler-ai-router>=0.1.1` installed in workspace venv (or documented as N/A if the metadata-extraction tooling uses a different Python environment).
- [ ] Only `darndestdabbler.dabbler-ai-orchestration` extension installed; legacy `darndestdabbler.dabbler-session-sets` removed.
- [ ] `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` reference canonical Option B paths.
- [ ] Agent files document the six-step UAT loop explicitly with operator attribution and date.
- [ ] Cost Dashboard populates in the workspace.
- [ ] No disruption to in-flight UAT work (verified by operator after migration).
- [ ] Close-out artifacts authored; all five close-out gates pass.

---

## Risks

- **In-flight UAT cycle interrupted by mistimed migration.** Mitigation: explicit operator approval AND timing confirmation at step 5; defer if any UAT cycle is mid-iteration.
- **Synthetic Access DB file lock during the swap.** The `.accdb` file may be open in Microsoft Access during operator's UAT runs. Mitigation: operator closes Access before the migration window; pre-flight checks for the file lock.
- **UAT Checklist Editor schema drift.** The per-set checklist JSON files may have schema drift from the canonical shape. Mitigation: Session 1's audit probes for schema drift; if found, surface as a separate follow-up rather than blocking the migration.
- **Workflow-shape documentation drifts from reality over time.** The six-step loop is the operator's stated current pattern; future evolutions will outdate the documentation. Mitigation: document with operator attribution + date; future agent-file edits can refine without re-litigating.

---

## References

- Set 015 (`015-consumer-repo-alignment`) — sister set; Sessions 2 (harvester) and 3 (platform) validate the migration recipe before this set runs.
- Set 016 (`016-harvester-cleanup-and-worktree-policy-spike`) — canonical Option B + clone-and-swap recipe.
- Set 017 (`017-worktree-cli-tooling`) — worktree CLI used for in-flight worktree relocation.
- `docs/planning/repo-worktree-layout.md` — canonical Option B layout doc.
- Memory entries: `project_consumer_repos.md` (three consumer repos' workflow shapes — healthcare-accessdb is the UAT-loop one).

---

## Cost projection

Single session, no cross-provider routes planned. Per Set 017
precedent: tests + operator review are the canonical verification
surface; the in-place workflow-shape documentation is reviewable by
the operator without an LLM diff review.

| Phase | Estimated cost | Notes |
|---|---|---|
| Audit + plan authoring (in-session) | $0 | No routes |
| Migration execution (in-session) | $0 | Scripted per the canonical recipe; smoke test + worktree CLI validation are the verification |
| Workflow-shape documentation review | $0 metered | Operator review surface; no LLM verifier route |
| **Set total (metered)** | **$0** | Cumulative across Sets 016 + 017 + 015 + 018 expected to stay under $0.20 |

If unforeseen design questions surface during the audit (e.g., a
UAT-loop pattern that doesn't fit the documented recipe), an
ad-hoc consultation can be scoped at that point — gated on operator
approval, not pre-budgeted.
