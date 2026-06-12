# Session 2 close reason — 063-getting-started-budget-and-bootstrap-retirement

**Outcome:** completed, VERIFIED (round 2).

Implementation session per spec: D1 (budget step in) and D2 (bootstrap
path out) shipped against the S1 locks; D3 (docs sweep) and D4 (release
0.32.0) remain S3 scope.

## What landed

- **D1 — budget / NTE step.** New pure-TS writer
  `tools/dabbler-ai-orchestration/src/utils/budgetYaml.ts` emitting the
  audited post-migration shape (s1-audit §2.4): `scope` not
  `threshold_scope`, `warn_at_percent: 80` pre-applied, `mode` from the
  documented bands, explicit `verification_nte_usd`,
  `set_by: "getting-started-form"`. Form render in
  `gettingStartedHtml.js` (Full tier only — OMITTED from the Lightweight
  DOM), inline validation blocking Build until valid, the
  consult-resolved $0 zero-rule radio pair (no silent default), client.js
  wiring with `budgetUsd` / `zeroBudgetMethod` riders, host narrowing
  (`asBudgetChoice`) that **fail-closes** a Full build whose rider does
  not narrow, and the scaffold-time no-clobber write with skip+report.
  The palette `setupNewProject` flow stays the only budgetless entry.
- **D2 — retirement.** All 11 §1.1 surfaces: command module deleted,
  registration + contribution removed, dead `viewsWelcome` contribution
  removed, the whole welcome-HTML pipe ripped (host loader/renderer,
  `escHtml`/`escAttr` — compiler confirmed no surviving caller, protocol
  `welcomeHtml` field, client.js fallback branch, `.welcome` CSS),
  `gettingStarted` now **required** on `SnapshotPayload` (closes the
  §1.4 resurrection path), the consumerless `dabblerSessionSets.scanState`
  context key retired (manager + webview scanState messages stay),
  Marketplace `description` reworded, stale comments touched up, and the
  Q7 watcher allowlist line numbers bumped (extension.ts 192/228 →
  191/227, import-removal shift).
- **Tests.** `budgetYaml.test.ts` matrix (4 mode bands, $0 with each
  method, rider narrowing, no-clobber, editor-schema acceptance via
  `validateBatch`, migrator-no-op TS twin, scaffold tier gate incl.
  Lightweight-never-writes), form-render + validation suites, the
  fail-closed rejection matrix. Golden cold-start snapshot untouched.

## Verification narrative

R1 (gpt-5-4) returned ISSUES_FOUND: **Major (Correctness)** — the host
failed open, scaffolding a Full repo without `budget.yaml` when the
untrusted rider was missing/malformed; **Minor (Completeness)** — the
Lightweight render carried the input as `hidden` where the lock says
"never renders". Both fixed in-flight: `routeGettingStartedAction` now
rejects an un-narrowable Full build (returns false, handler never runs),
and `budgetBlockHtml` returns "" on Lightweight with tier-radio changes
re-rendering the surface locally (gsState preserves all control values).
Findings + resolutions persisted in `s2-issues.json`. R2 (gpt-5-4,
narrow) returned VERIFIED — both fixes confirmed, no regressions.

## Suites at close

Python 1222 passed / 1 skipped · TS mocha 908 passing + 2 pre-existing
Set-026 failures · Playwright Layer 3 local 18 passed, re-run on the
post-fix code · drift guard OK.

## Routed spend (session)

$0.3004 — verification $0.2213 (R1) + $0.0790 (R2), both gpt-5-4. Set
cumulative: $0.7987.
