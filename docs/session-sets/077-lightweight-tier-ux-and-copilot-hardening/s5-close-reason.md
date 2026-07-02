# S5 Close Reason — Set 077, Session 5 of 6

Session 5 ("Verification owed — every surface says so", Features 4–5)
completed all seven spec steps, including both secondary bundles, and
closed VERIFIED after three verification rounds.

## Delivered

- **A6 gate:** `cross_provider_satisfied` / `work_session_pairs` shared
  predicate; the Mode-B close gate accepts engine-OR-provider difference;
  same engine + same provider still fails; missing identity data fails the
  provider arm closed; corrective names both remedies (M5) with the
  legacy null-provider posture spelled out.
- **M1 start-time guardrail:** `start_session --type verification`
  (plain and handoff) refuses a same-`(engine, provider)` start before
  any write, printing the sanctioned Copilot model-picker pattern. The
  guardrail is the exact close-gate predicate, so it can never refuse a
  passable configuration.
- **Bundle C:** typed-session start paths now seed
  `pathAwareCritique` / `contractGate` / `verificationMode` policies
  (idempotent), so the Set 066/070 close gates cannot be silently
  disarmed by a typed-first set.
- **Feature 4:** `ai_router/pending_verification.py` + the loud advisory
  `PENDING VERIFICATION` banner at work-session start (both tiers,
  no-router-proof; WAIVED = opt-out, ISSUES_FOUND = respond-to-round-N,
  absence always owes).
- **A7:** the Explorer prefers the durable activity-log
  `verificationMode` record over the spec seed; `deriveWorkflowState`
  TS mirror of the Python ladder (including this session's blank-verdict
  adjudication).
- **Feature 5 UI:** Start Next Session auto-routes by derived state;
  pointer-style kickoff + new remediation prompts (with the >= 0.27.0
  version-skew line, M6); row description words `verification owed` /
  `remediation owed`; `progressText` `+` suffix.
- **Bundle E:** `_write_json_atomic` (un-entombs the envelope seeder);
  `derive_state` blank-verdict adjudication (pre-terminal →
  awaiting-human; terminal keeps closed-verified).
- **Docs:** workflow-doc Mode B section (engine-or-provider gate,
  single-engine pattern, owed-state surfaces; all echoes updated) and
  the consumer AGENTS.md tail template (goldens + dist regenerated).

## Verification narrative

Routed gate: REQUIRED (blast-radius + multi-module + breadth). Routed
code review (sonnet + gemini-pro auto-verify): 2 fixes applied, 4
findings rejected with evidence, 2 deferred with reason. Cross-provider
verification (gpt-5.4): round 1 returned three token-less findings —
one fixed (banner placeholder wording + regression test), one resolved
as a clarity refactor plus the exact regression fixture the verifier
requested (its behavioral premise was false; the fixture proves it),
and one dispositioned `advisory-disagreement` (see below). Round 2
verified those adjudications and flagged only an evidence-bundle gap
(untracked file invisible to `git diff` — L-064-9's class); round 3,
fed the file source directly, returned **VERIFIED**.

## Escalated to the operator

**S077-S5-V1-002 (advisory-disagreement):** the verifier proposed that
the Mode-B set-terminal close should require the *latest* verification
round to be cross-provider, not *any* historical round. Current behavior
is the locked Set 057 "at least one" contract, which this set's spec
extends additively; the same-pair re-verification sequence is now
refused at start by the M1 guardrail on both blessed writer paths
(>= 0.27.0). Decision owed: whether a future set should strengthen the
terminal-close check to latest-round semantics. No action needed for the
mission-critical week — the start-time guardrail closes the practical
path.

## Suites at close

pytest 2372 passed / 5 skipped / 0 failed; `tsc --noEmit` clean; mocha
1095 passing; Playwright 19/19 (serial local). Drift guard green
(dist-in-sync, goldens regenerated).
