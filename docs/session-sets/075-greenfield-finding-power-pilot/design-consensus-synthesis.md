# Set 075 design — cross-provider consult synthesis

> **Process (operator's devil's-advocate default):** generate-diverse →
> adversarial cross-critique → synthesize → operator-confirm. Two independent
> providers were consulted in parallel on the same brief (the audit facts + six
> open decisions): **GPT-5.4** (`design-consult-openai.md`) and **Gemini-2.5-Pro**
> (`design-consult-google.md`). Pinned via `call_model` for diversity (the
> orchestrator is Claude, so both are cross-provider). This note is the synthesis;
> the two raw consults are the evidence. Operator confirms at Set 075 S1 start.
>
> **Honesty note:** the Gemini consult truncated mid-D5 (L-064-1) but covered the
> executive recommendation + D1–D5 and its named threat; GPT-5.4 covered all six
> decisions + the biggest-threat analysis. Signal was sufficient — not re-run.

## Convergence (both providers, independently)

| # | Decision | Both recommend |
|---|---|---|
| **D1** | Matrix-run timing | **Step-6, pre-remediation, on the fresh diff.** The only point where defects still exist; operationally natural (Step 6 is already the verification gate); same diff across cells. Must run **before issue-driven edits**. |
| **D2** | Ground truth | **Relative cell yield + false-positive + adjudicated-union-as-proxy now; seeding is a fast-follow, never a gate.** Do **not** claim "recall" — claim *relative finding yield on fresh defects* + *coverage of the adjudicated union* + *precision/noise*. |
| **D3** | Scrutiny vs measurement | **Record-first / freeze-then-remediate.** The first pre-remediation run's artifacts are the **immutable measurement record**; the repo then remediates normally from the same report (real scrutiny value). Never overwrite the first-run measurement with post-fix re-runs. |
| **D4** | Doc-only repo (migration-orchestrator) | **Exclude from the finding-power aggregate.** Optional labeled pull-only scrutiny sidecar (`target_type=docs_only`, `excluded_from_finding_power=true`); a prose-focused study is a possible separate future track. |
| **D5** | Aggregation home | **Copy artifacts back to a canonical-owned location** with a strict metadata schema. (Leaving them in-repo and pulling ad hoc → drift / silent loss.) |

## The two complementary "biggest threats" (fold BOTH into the protocol)

1. **GPT-5.4 — selection bias from diff mix.** Small/packaging or docs diffs can
   make push look competitive for the wrong reason (small diffs are snippet-fittable
   → favor push; source-heavy favors pull; docs starve push). **Mitigation:**
   **stratify every run by diff class** (source-dominated / packaging-small /
   docs-only-excluded), report metrics **per stratum**, and treat
   **`dabbler-platform` (generator tooling) as the LEAD signal**, harvester 019
   (packaging) as **supporting-but-confounded**.
2. **Gemini — inconsistent human adjudication.** TP/FP calls drift between sessions.
   **Mitigation:** a **fixed adjudication rubric** (TP / FP / duplicate / unclear)
   adjudicated from the **deduped consolidated report**, not provider-branded raw
   output (GPT's anti-bias addendum: don't let high-status providers bias the
   adjudication).

## Decisions where I (orchestrator) refine the consult

- **D5 — commit, don't gitignore.** Gemini suggested a gitignored `.telemetry/` +
  a consumer-CI Git-PAT push to canonical. For a pilot whose *purpose* is a later
  synthesis, telemetry should be **committed and reviewable**, not gitignored, and
  a cross-repo CI PAT is unnecessary infrastructure: the repos are **co-located
  sibling worktrees on one machine**, so the consumer session copies `matrix-run/`
  into canonical at **`docs/session-sets/075-.../telemetry/<repo>/<session>/`** at
  session end (lightest reliable transport). GPT's per-run-folder + required-metadata
  schema is adopted.
- **D6 — Set 075 sets up the pilot; it does NOT wait on consumer runs.** GPT's
  4-session shape couples 075's completion to consumer sessions running "naturally"
  — that hangs 075 on another repo's schedule. Instead **Set 075 = 2 sessions
  (protocol + enablement)**; the **first runs + comparative readout are a FUTURE
  canonical synthesis set**, gated on accumulated telemetry (same pattern as the
  RETIRE decision waiting on data). This keeps 075 self-contained and honest about
  timeline coupling.

## Net design (for the spec)

- Run the matrix **within each source-bearing consumer repo**, at **Step 6
  pre-remediation**, via a **standard instruction addendum** that points at a
  canonical **greenfield-matrix protocol** doc.
- **Pilot cohort:** `dabbler-platform / access-migration-generator-consumption`
  (lead) + `dabbler-access-harvester / 019-dotnet-tool-packaging` (supporting).
  **migration-orchestrator deferred** (pull-only sidecar at most).
- **Prereq for all:** bump `dabbler-ai-router` to **≥ 0.26.0**.
- **Measurement:** freeze the pre-remediation matrix artifacts; adjudicate via the
  fixed rubric; stratify by diff class; copy to canonical telemetry; relative-yield
  framing (not recall); seeding as a fast-follow.
- **Set 075 deliverables:** the protocol doc + the instruction addendum + the
  adjudication rubric + the aggregation/telemetry contract (S1); consumer-repo
  enablement for the two source repos + the deferred-repo record (S2). Synthesis =
  a later set.
