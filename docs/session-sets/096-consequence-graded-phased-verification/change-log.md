# Change Log — Set 096: Consequence-Graded, Phased Verification

> **Set complete: 2026-07-12** (both sessions same day; operator-prioritized
> over the routed 077-first ranking). Makes the Set 095 verification-churn
> fix durable and framework-level: the consequence rubric lives in the
> shipped template, and the verification loop is restructured into
> measured, bounded phases.

## Session 1 — Fan-out experiment, rubric in the template, ledger machinery

- **Fan-out experiment (before any design commitment):** K=3 same-model +
  1 cross-provider discovery calls with byte-identical bundles against the
  frozen Set 095 corpus ($0.80). Measured: same-model pairwise finding
  overlap is LOW (Jaccard 0.13–0.31); one call captures ~50% of the
  observed pool, K=2 ~81% (mean); the third same-model call added one
  finding and the cross-provider call added zero. Recommendation (adopted
  verbatim in S2's config): discovery fan-out **K=2 same-model**; provider
  diversity kept as a *preference knob* for the supplementary pass.
  Memo: `s1-fanout-experiment.md`.
- **Consequence rubric in the shipped template** (`session-verification-v3`,
  hash-pinned): severity = probability the stated failure scenario
  materializes for a real user × material impact on the deliverable's
  objectives; low-probability OR low-impact = Minor even when technically
  correct; **a finding with no stated, plausible failure scenario is Minor
  by definition**; mandatory per-Issue `Failure scenario:` line. L-095-1's
  rule is now encoded in the template.
- **Cross-round ledger as machinery:** `verify_session` auto-assembles the
  settled-points ledger from prior rounds' immutable `sN-issues*.json`
  plus the new `sN-remediation-round-<R>.md` settlement sidecar;
  no-resurrection framing must be EARNED (settlement evidence, fail
  closed). The optional `failureScenario` field landed end-to-end
  (parser → envelope → JSON schema → doc).
- S1 verification: 2 rounds / $0.37 (round 1 caught a real fail-open in
  the session's own new ledger machinery — with a parsed failure
  scenario — fixed fail-closed; round 2 VERIFIED).

## Session 2 — Phased loop, policy docs, replay, release prep

- **`verify_session --phase discovery | supplementary | remediation-review`**
  (omitted = classic single-call behavior, compat; framings ride the
  Original Task slot so the v3 template pin holds):
  - *discovery*: exhaustive enumeration at all severities, fanned out
    `verification.discovery.fan_out` ways (default 2) with identical
    bundles, per-call stamps/artifacts, ONE merged envelope (per-issue
    `discoveryCall`), and a `discoveryBaselineTree` working-tree snapshot.
  - *supplementary*: pre-remediation completeness critic over the same
    evidence, fed the prior findings with a do-not-re-report instruction;
    `provider_diversity: cross-provider` optionally prefers a third
    family (degrades loudly).
  - *remediation-review*: evidence = the tree-to-tree **fix delta** from
    the discovery baseline + the auto-ledger; per-finding
    `fix-accepted / fix-rejected / accepted-with-modification` verdicts
    with **machine-checked ledger-id coverage** (the ledger numbers every
    blocking finding L1..Ln; a missing id escalates); new defects
    admissible only within the fix hunks.
- **Loop policy rewritten** (workflow doc Step 6/7 + constitution echoes,
  L-065-1 sweep): bounded totals — ≤2 discovery passes, ≤2
  remediation-review cycles, then the loop suspends to the operator; the
  severity gate and the operator's round-cap authority preserved
  verbatim; classic path and Lightweight Mode-B bounds unchanged.
- **Convergence replay (the set's falsifier), rounds/cost vs baseline:**
  the frozen 095 corpus through the shipped phased loop end-to-end —
  **4 rounds, $0.85, one remediation batch + one micro-fix, VERIFIED with
  6/6 fix verdicts accepted**, converging exactly at the bounded totals,
  vs the Set 095 baseline of **17 non-converging rounds / $4.88** under
  the ungraded sequential loop. Qualification (stated wherever the
  numbers appear): a loop-shape demonstration on the remediated corpus
  and its latent findings, not a defect-for-defect A/B. The replay also
  re-found and FIXED five real Majors in the shipped 095 tutorial —
  preserved as `s2-replay-fix.patch` for operator scheduling, not landed.
- **The loop dogfooded itself and got materially hardened:** this
  session's own verification (discovery K=2 → 9 blocking findings,
  disjoint call sets; supplementary → 1 new, zero re-reports) found real
  defects in the day's new machinery, all remediated: fail-closed verdict
  merge; phased-evidence bookkeeping excludes (fix delta stays
  fixes-only); fix-rejected anti-laundering escalation; ledger-id
  fix-verdict coverage; a clean supplementary round can no longer settle
  a session whose discovery blockers stand (session-verdict fail-close,
  exit 4); the CLI suspends at the 2-cycle bound instead of directing
  past it; a blocking round with unparseable findings synthesizes its
  envelope instead of deadlocking the loop. 23 new tests.
- **Release prep (publish operator-gated):** `dabbler-ai-router` 0.33.0
  staged — CHANGELOG block, `pyproject.toml` 0.32.0 → 0.33.0, stale
  `__init__.__version__` fallback aligned. No extension changes.

## Verification story (Session 2)

Discovery K=2 ($0.64) + supplementary ($0.34) + two remediation-review
cycles ($0.09 + $0.08) under the loop's own bounded totals; the one point
cycle 2 held open (partial fix-verdict coverage) was fixed
deterministically (ledger ids) after the loop suspended itself, and the
deciding round is the Set 084 close backstop on the final tree — the same
ending as S1. Suite at close: **3010 passed / 6 skipped** (Layer 1; no
extension surfaces touched).

## Deferred / operator-gated

- Apply `s2-replay-fix.patch` to the shipped 095 tutorial (small docs
  set; ranked first by the routed next-set analysis).
- PyPI publish 0.31.0–0.33.0; Marketplace publish ext 0.42.0.
- L-095-1 retires into "encoded in the template" at the next guidance
  triage (per the spec's end-of-set deliverables).
