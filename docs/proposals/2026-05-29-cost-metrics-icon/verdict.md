# Set 052 S1 — Design Verdict (locked)

**Date:** 2026-05-30 · **Orchestrator:** Claude Opus 4.8 (high) ·
**Consensus:** gemini-2.5-pro + gpt-5.4 ($0.048427 routed; raw in
`consensus-output.json`). Full reasoning in `proposal.md`.

## Root cause (locked)
The dead icon is a **read/write path mismatch**, not a disabled flag.
Router writes `ai_router/router-metrics.jsonl` (`metrics.log_filename`,
default); dashboard reads hardcoded `ai_router/metrics.jsonl`
(`utils/metrics.ts:5`). Dashboard is always empty. Metrics already
default ON; the placeholder's `config.py METRICS_ENABLED` flag is
fictional.

## Locked decisions

| # | Decision | Session |
|---|---|---|
| D1 | Fix dashboard read path; resolve filename from `metrics.log_filename` (no second hardcoded name); shared reader+export helper; keep `enabled==false` path. **#1 deliverable.** | S2 |
| D2 | DROP "metrics-on-by-default" — no-op (already on). Replaced by D1+D5. | S2 |
| D3 | Tier gate = **router-capability** (resolvable `router-config.yaml`/metrics path → context key → `when`-clause). NOT per-set tier; NOT bare folder existence. Absent on Lightweight. | S2 |
| D4 | Staleness banner reuses `metadata.pricing_reviewed` + `review_frequency_days` (default 30); computed in-extension from YAML, not stderr; missing/invalid metadata = stale. Non-blocking. | S2 |
| D5 | THREE honest states: disabled (name real knob `metrics.enabled`) / on-but-empty / on-with-data. No fictional flags. | S2 |
| D6 | Update-rates action: primary = open `router-config.yaml` at `metadata` block; Config Editor pricing section only if cheaply added in S2 (it has none today). | S2 |
| D7 | Tests: unit (read-path, gate, staleness, state-selection) + Layer-3 (present/absent by tier, stale banner, empty, disabled). | S2 |
| D8 | UAT checklist **elected** (`suggestion_disposition: uat`, session 1). Compile in S3. | S3 |

## Consensus record
- **Agreed (both providers):** drop Q3 default-flip as no-op + fix read
  path; reuse existing staleness metadata as single source; honest empty
  copy distinct from disabled state.
- **Split — Q4 tier gate:** gemini = derive-from-session-sets;
  gpt-5.4 = router-capability gate + warned derive-from-sets drifts into
  a dead icon. **Resolved to router-capability (A)** — for a *cost* icon
  the gate should track whether the workspace can produce cost data.

## Open for S2 (implementation decisions, not blockers)
- Exact router-signal resolution for the gate (config path vs metrics
  path vs both) in pip-install consumer repos where `ai_router/` may live
  in site-packages, not the workspace.
- Whether to extend the Config Editor with a pricing section (D6 optional
  enhancement) or ship raw-YAML-open only.
