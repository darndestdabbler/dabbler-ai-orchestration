# Cost-Metrics Icon Redesign — Design Proposal (Set 052 Session 1)

> **Status:** Design-locked (see `verdict.md`).
> **Date:** 2026-05-30
> **Session:** Set 052, Session 1 of 3 (Audit & design-lock).
> **Orchestrator:** Claude Opus 4.8 (high).
> **Cross-provider consensus:** gemini-2.5-pro + gpt-5.4 (raw output:
> `consensus-output.json`, routed cost $0.048427).

---

## 1. The bug, re-diagnosed

The presenting complaint: `dabbler.showCostDashboard` always opens but
renders a placeholder telling the operator to "set `METRICS_ENABLED =
True` in `ai_router/config.py`" instead of cost data.

The audit found the placeholder is **wrong three ways over**, and the
real cause is none of what the placeholder claims:

1. **Metrics already default ON.** `ai_router/metrics.py:_metrics_enabled()`
   returns `config["metrics"].get("enabled", True)` — the default is
   `True`. Nothing is "off" waiting to be flipped.
2. **The named flag does not exist.** There is no `config.py
   METRICS_ENABLED`. The real knob is `router-config.yaml` →
   `metrics.enabled`. The placeholder names a fictional flag in the
   wrong file.
3. **ROOT CAUSE — read/write path mismatch.** The Python router *writes*
   metrics to `ai_router/router-metrics.jsonl` (configurable via
   `metrics.log_filename`, default `"router-metrics.jsonl"` —
   `ai_router/metrics.py:76`). The TypeScript dashboard *reads*
   `ai_router/metrics.jsonl` (hardcoded constant —
   `tools/dabbler-ai-orchestration/src/utils/metrics.ts:5`). **Two
   different files.** The dashboard reads a file the router never writes,
   so `entries.length === 0` is always true and the dashboard always
   falls through to the "no data" placeholder — *regardless* of the flag,
   regardless of real spend.

So the icon is dead not because metrics are off but because the reader
is pointed at the wrong path. The redesign's #1 job is to fix that.

### Already-present infrastructure (no need to invent)

- **Per-provider rate estimates** live in `router-config.yaml` under each
  model as `input_cost_per_1m` / `output_cost_per_1m`.
- **"Last reviewed" timestamp** already exists:
  `metadata.pricing_reviewed` (ISO date a human maintains) +
  `metadata.review_frequency_days` (default 30).
- **A staleness check already runs:**
  `config.py:_check_pricing_staleness()` prints a stderr WARNING at
  config-load time when `age > threshold`. It fired during this very
  session ("pricing last reviewed 40 days ago (threshold: 30)") — the
  estimates are *currently* stale, so the new dashboard banner would
  light up on day one.
- **Tier parsing** exists: `parseSessionSetConfig()` reads `tier:
  full|lightweight` from each set's `spec.md`.
- **Context-key gating** exists: `setContext` + when-clauses already gate
  title-bar icons (`dabblerSessionSets.hasSubCurrentSets`).
- **A Config Editor** (`ConfigEditorPanel`) reads/writes
  `router-config.yaml` — but its sections are routing, providers, budget,
  significance, notifications, local-overrides. **It has no
  pricing/metadata section today**, so `pricing_reviewed` is not
  editable there yet (bears on Q5).

---

## 2. Open questions → cross-provider consensus

Two independent providers (gemini-2.5-pro, gpt-5.4) were given the audit
findings and the five open questions. Full raw output in
`consensus-output.json`. Summary:

| Q | gemini-2.5-pro | gpt-5.4 | Outcome |
|---|---|---|---|
| Q4 tier gate | (B) derive from session sets | **(A) router-capability gate**; warns (B) drifts → dead icon | **SPLIT — resolved to (A)** |
| Q5 update-rates UX | (A) Config Editor, (B) raw YAML fallback | (A) primary, (B) fallback; *don't wire (A) until it can edit the fields* | Agree → **(B)-primary given no pricing section exists yet** |
| Q3 metrics-default | drop as no-op; fix read path | drop as no-op; fix read path; don't hardcode a new name | **Agree — DROP, fix path** |
| Q2 staleness source | reuse existing; DRY single source | reuse; compute in-extension from YAML, not stderr | **Agree — reuse** |
| Q-empty copy | "Cost tracking is active…" | "No cost data yet. Run a routed request…"; keep distinct from disabled | **Agree — 3 states** |

### Q4 was a genuine split — and why (A) wins

This is the one question with real disagreement, which is exactly what
the second opinion is for.

- **gemini** favored deriving tier from the session sets' own `tier:`
  fields (Full if any set is Full) — user-intent-driven, no new setting.
- **gpt-5.4** favored gating on whether the workspace *actually routes*
  (a resolvable router config + metrics path), and explicitly flagged
  gemini's option's failure mode: a set can declare `tier: full` while no
  router is configured, which re-creates today's dead icon. It also
  warned against keying off bare folder existence (a Lightweight repo
  that happens to scaffold an `ai_router/` dir).

**Orchestrator decision: adopt (A), router-capability gate.** For a
*cost* icon specifically, the right question is "can this workspace
produce cost data?" — i.e., does it route through `ai_router`? That is
the definition of Full tier and the negation of Lightweight
(`--no-router`). Gating on a resolvable router/metrics path makes the
icon's presence *track the thing it displays*, avoids per-set drift, and
structurally prevents the dead-icon regression. The per-set `tier:`
field stays the source of truth for everything else; it is the wrong
grain for one global title-bar action.

Hardening (both models' caveats, folded in): the gate must require a
**real, resolvable router signal** (a `router-config.yaml` resolvable for
the workspace and/or a resolvable metrics-log path), **not** bare
`ai_router/` folder existence.

---

## 3. Locked design

### D1 — Fix the read path (the actual dead-icon fix) [S2, #1]
Point the dashboard reader at the file the router writes. Do **not**
swap one hardcoded name for another (gpt-5.4 caveat): resolve the metrics
filename from `router-config.yaml` → `metrics.log_filename` (default
`router-metrics.jsonl`), via a single path-resolution helper shared by
the reader and the CSV export. Preserve an explicit
`metrics.enabled == false` path.

### D2 — Drop "metrics-on-by-default" as a no-op [S2]
Metrics already default on; there is nothing to flip. The scope item is
**replaced** by D1 (read-path fix) + D5 (honest states). No change to
`metrics.enabled` semantics.

### D3 — Router-capability tier gate [S2]
Contribute the cost icon/command only when the extension resolves a real
router signal for the workspace (resolvable `router-config.yaml` /
metrics path) — set a context key (e.g. `dabblerSessionSets.routesCost`)
via `setContext`, gate the menu `when`-clause on it. Absent on
Lightweight (`--no-router` / no resolvable router). Folder-existence
alone is insufficient.

### D4 — Staleness banner reusing existing metadata [S2]
On dashboard open, compute staleness **in the extension, directly from
`router-config.yaml`** (`metadata.pricing_reviewed` vs
`review_frequency_days`, default 30) — do not parse stderr. If
`age > threshold` (or metadata missing/invalid → treat as stale, matching
the load-time check), show a **non-blocking** banner with an "Update cost
estimates" action. Single source of truth shared with
`_check_pricing_staleness`.

### D5 — Three honest states (no fictional flags) [S2]
The dashboard distinguishes:
1. **Disabled** (`metrics.enabled == false`): explicitly say metrics
   logging is off and name the *real* knob (`router-config.yaml`
   `metrics.enabled`). Never the fictional `config.py METRICS_ENABLED`.
2. **On but empty** (no spend yet): "No cost data yet. Run a routed
   request in this workspace and costs will appear here." Optionally name
   the resolved metrics path for specificity.
3. **On with data**: the existing dashboard render.

### D6 — Update-rates action [S2]
Primary: open `router-config.yaml` scrolled to the `metadata` block
(`pricing_reviewed`) — a direct, always-available fix path, since the
Config Editor has no pricing section today. Optional enhancement (only if
cheap in S2): add a pricing/metadata section to the Config Editor and
point the action there instead; do **not** wire the action to the Config
Editor unless it can actually focus/edit `pricing_reviewed` (both models'
caveat).

### D7 — Tests [S2]
- Unit: read-path resolution (matches writer / honors `log_filename`),
  tier-gate predicate, staleness predicate (fresh / stale / missing
  metadata), three-state selection.
- Layer-3 Playwright: icon present on Full / absent on Lightweight, stale
  banner renders, empty state renders, disabled state renders.

### D8 — UAT elected
Operator elected a UAT checklist (recorded as `suggestion_disposition`
`choice: uat`, session 1). S3 compiles it.

---

## 4. Scope deltas vs the original spec

- **NEW #1 deliverable:** fix the metrics read-path mismatch (root cause).
  The original spec did not name it because it was discovered in this
  audit.
- **Q3 "metrics-on-by-default" → dropped** as a no-op; folded into the
  read-path fix + honest states.
- **Empty state → three states** (disabled / empty / data), not one.
- **Q4 → router-capability gate**, not per-set tier derivation.
- Q1/Q2/Q5 land on existing infrastructure (reuse, don't invent).

These deltas are reflected in the updated `spec.md` Session 2/3 steps.
