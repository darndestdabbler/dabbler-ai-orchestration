# Cost-Metrics Icon Redesign Spec

> **Purpose:** Fix the dead-icon experience: today the "Show Cost
> Dashboard" command always opens but renders "set `METRICS_ENABLED =
> True`" instead of data when metrics are off. Redesign so the cost
> surface is **present and meaningful for Full-tier routed repos** (where
> the operator genuinely wants to know routing spend), **absent for
> Lightweight** (no routing, no cost), and so clicking it **checks
> whether the cost estimates are stale and prompts to update them**.
> **Created:** 2026-05-29
> **Session Set:** `docs/session-sets/052-cost-metrics-icon-redesign/`
> **Prerequisite:** None
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: "suggested"
requiresE2E: false
uatScope: per-set
```

> Rationale: This changes a user-visible VS Code surface (icon
> visibility, a dashboard panel, a staleness prompt). That is UI
> behavior, so UAT is worth offering — set to `"suggested"` so the
> orchestrator asks at session start whether to produce a checklist
> (per Set 048's upfront-confirmation flow) rather than mandating it for
> what may be a small change. `requiresE2E: false` — the extension's
> rendered surfaces are covered by the Playwright Layer-3 harness, not a
> browser E2E suite.

---

## Project Overview

### Motivation

`dabbler.showCostDashboard` is registered unconditionally and, when
`METRICS_ENABLED` is false, [CostDashboard.ts](../../../tools/dabbler-ai-orchestration/src/dashboard/CostDashboard.ts)
renders a "go enable metrics" placeholder instead of cost data. An icon
that does nothing until a hidden flag is flipped is worse than no icon.

Operator position (2026-05-29): if you adopt the AI router (Full tier)
you *will* want to know what routing costs — so cost metrics should be a
first-class, on-by-default part of Full, and the surface should simply
not exist on Lightweight (which has no routing spend). And because cost
numbers are only as good as the per-provider rate estimates behind them,
opening the dashboard should check how long since those estimates were
updated and prompt a refresh if they're stale.

### What this set delivers

1. **Tier-gated visibility.** The cost icon/command is contributed only
   when the workspace actually routes (router-capability gate — see S1
   verdict D3); hidden entirely on Lightweight.
2. **Read-path fix (root cause — S1 discovery).** Point the dashboard
   reader at the file the router actually writes
   (`router-metrics.jsonl` via `metrics.log_filename`), not the hardcoded
   `metrics.jsonl` it reads today. This — not a flag — is why the icon
   looks dead. (Metrics already default ON; "metrics-on-by-default" was
   dropped as a no-op at S1.)
3. **Cost-estimate staleness check.** On open, reuse the existing
   `metadata.pricing_reviewed` + `review_frequency_days` (default 30) to
   compute staleness in-extension; if stale, surface a non-blocking
   prompt with a one-click path to update them.
4. **Three honest states.** Disabled (`metrics.enabled == false`) /
   on-but-empty / on-with-data — never naming the fictional
   `config.py METRICS_ENABLED` flag.

### Non-goals

- **No change to how routing cost is computed or logged** beyond the
  default-on flip — this is presentation + lifecycle, not metering logic.
- **No automated rate-fetching** from provider pricing pages. The
  staleness check *prompts*; the actual rate update is operator-driven
  (an automated price-scraper is a separate, larger idea).

---

## Open design questions (S1 audit) — RESOLVED 2026-05-30

S1 audit + cross-provider consensus (gemini-2.5-pro + gpt-5.4) resolved
all five. Full design in
`docs/proposals/2026-05-29-cost-metrics-icon/proposal.md`; locked
decisions in `verdict.md`. Summary:

> **Audit re-diagnosis:** the dead icon is a **read/write path
> mismatch**, not a disabled flag. The router *writes*
> `ai_router/router-metrics.jsonl` (`metrics.log_filename`, default);
> the dashboard *reads* hardcoded `ai_router/metrics.jsonl`
> (`utils/metrics.ts:5`) → always empty. Metrics already default ON; the
> placeholder's `config.py METRICS_ENABLED` flag is fictional.

1. **Where rate estimates live / "last updated":** RESOLVED — rates in
   `router-config.yaml` (`input_cost_per_1m`/`output_cost_per_1m`);
   "last updated" = `metadata.pricing_reviewed` (already exists).
2. **Staleness threshold:** RESOLVED — reuse existing
   `metadata.pricing_reviewed` + `review_frequency_days` (default 30).
   Compute in-extension from YAML (not stderr). Single source shared with
   `config.py:_check_pricing_staleness`.
3. **Metrics-on-by-default mechanism:** RESOLVED — DROPPED as a no-op
   (metrics already default ON). Replaced by the read-path fix + honest
   states.
4. **Tier detection:** RESOLVED — gate on **router capability**
   (resolvable `router-config.yaml`/metrics path → context key →
   `when`-clause), NOT per-set `tier:`, NOT bare folder existence.
   Consensus split here (gemini = derive-from-sets; gpt-5.4 =
   router-capability + warned derive-from-sets re-creates the dead icon);
   resolved to router-capability.
5. **Update-rates UX:** RESOLVED — primary = open `router-config.yaml` at
   the `metadata` block (Config Editor has no pricing section today);
   Config Editor pricing section only if cheaply added in S2.

---

## Sessions

### Session 1 of 3: Audit & design-lock

**Steps:**
1. Register the set; map the current cost path: `CostDashboard.ts`,
   `dabbler.showCostDashboard` registration, `METRICS_ENABLED`,
   `cost_report.py`/`metrics.py`, and where rate estimates live.
2. Cross-provider consensus on the five open questions (rate-source +
   staleness definition + metrics-default mechanism are load-bearing).
3. Lock the tier-gating mechanism, the staleness model, and S2/S3 scope.

**Creates:** `docs/proposals/2026-05-29-cost-metrics-icon/proposal.md` + verdict.
**Touches:** this `spec.md`.
**Ends with:** locked design for visibility gating, metrics default, and
staleness model.
**Progress keys:** S1 verdict committed; design locked.

### Session 2 of 3: Implementation (per S1 verdict D1–D7)

**Steps:**
1. **D1 (root-cause fix, #1):** point the dashboard reader at the file the
   router writes. Resolve the metrics filename from `router-config.yaml`
   → `metrics.log_filename` (default `router-metrics.jsonl`) via one
   shared path-resolution helper used by both the reader (`utils/metrics.ts`)
   and the CSV export. Do **not** swap one hardcoded name for another.
2. **D3 tier gate:** contribute the icon/command only when a real router
   signal resolves for the workspace (resolvable `router-config.yaml` /
   metrics path) — `setContext` a new key (e.g.
   `dabblerSessionSets.routesCost`) + gate the menu `when`-clause. Absent
   on Lightweight. Folder existence alone is insufficient.
3. **D4 staleness banner:** on open, compute staleness in-extension from
   `metadata.pricing_reviewed` vs `review_frequency_days` (default 30;
   missing/invalid metadata → stale). Non-blocking banner with an
   "Update cost estimates" action.
4. **D6 update-rates action:** primary = open `router-config.yaml` at the
   `metadata` block. Config Editor pricing section only if cheaply added.
5. **D5 three honest states:** disabled (`metrics.enabled == false` —
   name the *real* knob, never `config.py METRICS_ENABLED`) /
   on-but-empty / on-with-data.
6. **D2:** no `metrics.enabled` default change (already on; dropped).
7. **D7 tests:** unit (read-path resolution / tier-gate predicate /
   staleness predicate / state selection) + Layer-3 Playwright (icon
   present-Full / absent-Lightweight, stale banner, empty state, disabled
   state).

**Creates:** tests.
**Touches:** `utils/metrics.ts`, `dashboard/CostDashboard.ts`,
`webview/dashboard.html`, `extension.ts`, `package.json` (menus /
when-clauses); read-only on `router-config.yaml`/`metrics.py` (path +
`log_filename` contract).
**Ends with:** icon shows for routing (Full) workspaces with **real data
from the correct file**, hidden for Lightweight; stale estimates prompt an
update; three honest states; tests green.
**Progress keys:** read-path fix + gate + staleness + 3 states shipped +
tested.

### Session 3 of 3: Docs, UAT (if elected), close-out

**Steps:**
1. Update wizard / docs referencing the cost dashboard + the
   `user-facing cost messaging` honesty requirements (incl. removing any
   reference to the fictional `config.py METRICS_ENABLED` flag).
2. UAT was **elected** at session start (`suggestion_disposition: uat`,
   session 1) — compile the checklist.
3. Version bump (Marketplace extension; PyPI only if a Python module
   changed — S2 is expected to be TS-only, so likely Marketplace-only),
   CHANGELOG, CLAUDE.md walk, change-log.md.
4. Cross-provider verification; close-out; publishes **held** for
   operator-initiated tag-push.

**Creates:** `change-log.md`; UAT checklist if elected.
**Touches:** docs, `package.json`, `CHANGELOG.md`, `CLAUDE.md`.
**Ends with:** docs reconciled; versions bumped; publishes queued.
**Progress keys:** docs updated; version bumped; close-out verdict recorded.

---

## End-of-set deliverables

- Tier-gated cost icon (router-capability gate; absent on Lightweight).
- Dashboard read-path fix (reads the file the router writes) — the
  root-cause dead-icon fix.
- Cost-estimate staleness check + non-blocking update prompt on open
  (reusing existing `pricing_reviewed`/`review_frequency_days`).
- Three honest dashboard states (disabled / empty / data).
- Tests (unit + Layer-3); UAT checklist (**elected** at S1).
- Version bumps + CHANGELOG + change-log; publishes held for operator.
