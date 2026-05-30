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
   when the active repo is Full tier; hidden entirely on Lightweight.
2. **Metrics on by default for Full.** `METRICS_ENABLED` effectively
   defaults true for Full-tier repos (exact mechanism — config default
   flip vs. derived-from-tier — decided at S1), so a fresh Full adopter
   sees real data without discovering a hidden flag through a dead panel.
3. **Cost-estimate staleness check.** On open, compare when the
   per-provider rate estimates were last updated against a staleness
   threshold; if stale, surface a non-blocking prompt with a one-click
   path to update them.
4. **Graceful empty state.** When Full + metrics-on but no spend logged
   yet, show an honest "no spend recorded yet" state, not an error.

### Non-goals

- **No change to how routing cost is computed or logged** beyond the
  default-on flip — this is presentation + lifecycle, not metering logic.
- **No automated rate-fetching** from provider pricing pages. The
  staleness check *prompts*; the actual rate update is operator-driven
  (an automated price-scraper is a separate, larger idea).

---

## Open design questions (S1 audit)

1. **Where do rate estimates live and how is "last updated" known?**
   `router-config.yaml` / `cost_report.py` / a dedicated pricing table?
   Is there an existing timestamp or must one be introduced?
2. **Staleness threshold.** Fixed age (e.g., 90 days), a "rates as of
   \<date\>" stamp the operator maintains, or a version compared against
   a canonical published rate sheet?
3. **Metrics-on-by-default mechanism.** Flip the `METRICS_ENABLED`
   default, derive it from `tier: full`, or auto-enable on first Full
   session with a one-time notice? Privacy/footprint implications.
4. **Tier detection in the extension.** How the extension knows a repo
   is Full vs. Lightweight to gate the icon (reads `spec.md tier:` /
   router presence / a setting?).
5. **Update-rates UX.** What "update cost estimates" actually opens —
   the config editor at the rates section, a guided prompt, or a doc?

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

### Session 2 of 3: Implementation

**Steps:**
1. Tier-gate the icon/command contribution (hidden on Lightweight).
2. Implement metrics-on-by-default for Full per S1.
3. Implement the staleness check + non-blocking update prompt on open;
   wire the "update rates" path.
4. Implement the honest empty state.
5. Tests: unit (tier gating, staleness logic) + Layer-3 Playwright
   (icon present/absent by tier, stale-prompt renders, empty state).

**Creates:** tests.
**Touches:** `CostDashboard.ts`, `extension.ts`, `package.json` (menus /
when-clauses), config/`cost_report` as needed.
**Ends with:** icon shows for Full + real data, hidden for Lightweight;
stale estimates prompt an update; tests green.
**Progress keys:** gating + default + staleness shipped + tested.

### Session 3 of 3: Docs, UAT (if elected), close-out

**Steps:**
1. Update wizard / docs referencing the cost dashboard + the
   `user-facing cost messaging` honesty requirements.
2. If UAT was elected at session start, compile the checklist.
3. Version bump (Marketplace extension; PyPI only if cost_report
   changed), CHANGELOG, CLAUDE.md walk, change-log.md.
4. Cross-provider verification; close-out; publishes **held** for
   operator-initiated tag-push.

**Creates:** `change-log.md`; UAT checklist if elected.
**Touches:** docs, `package.json`, `CHANGELOG.md`, `CLAUDE.md`.
**Ends with:** docs reconciled; versions bumped; publishes queued.
**Progress keys:** docs updated; version bumped; close-out verdict recorded.

---

## End-of-set deliverables

- Tier-gated cost icon (Full only; absent on Lightweight).
- Metrics on by default for Full tier.
- Cost-estimate staleness check + non-blocking update prompt on open.
- Honest empty state for Full + metrics-on + no-spend.
- Tests (unit + Layer-3); UAT checklist if elected.
- Version bumps + CHANGELOG + change-log; publishes held for operator.
