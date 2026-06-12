# AI Assignment: 062-lightweight-verification-affordance

> Authored at Session 1 start via `route(task_type="analysis")` →
> gemini-pro ($0.0177), per Step 3.5's never-self-opine rule. Session 1
> is being run by claude-code claude-fable-5 @ effort=high (the engine
> that picked up the set); the recommendation below predates that and the
> deviation is recorded in the Session 1 actuals at close.

## Session 1: Verification marker — states, predicates, tooltips
### Recommended orchestrator
claude-code claude-opus-4-8 @ effort=medium
### Rationale
This session involves multi-file changes across the extension's backend, data protocol, and webview frontend. A top-tier model is best for maintaining context and ensuring the data flows correctly from the new filesystem inputs to the final UI rendering.
### Estimated routed cost
moderate
| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Extend set scan | t2 |
| 2 | Implement marker predicates | t2 |
| 3 | Render the marker | t2 |
| 4 | Tests | t3 |
### Actuals (filled after the session)
- Orchestrator used: claude-code claude-fable-5 @ effort=high
- Total routed cost: $0.0177 routed (gemini-pro, this ai-assignment analysis) + ~$0.0213 estimated (gemini-2.5-pro verification via direct call_model — bypasses router metrics) ≈ $0.039
- Deviations from recommendation: orchestrator was fable-5/high, not opus-4-8/medium — the recommendation was authored mid-session by the engine that picked the set up. Verification fell back from the router's gpt-5-4 pick to a direct gemini-2.5-pro call (OpenAI 429 rate-limited on every attempt this session; Step 6 verifier-failure ladder).
- Notes for next-session calibration: implementation itself routed $0 (orchestrator-direct TS work; the t2/t3 step-table routing did not apply). If OpenAI 429s persist into Session 2, expect the gemini verifier fallback again — log its cost as estimated.

## Session 2: Agent handoff + not-started toggle
### Recommended orchestrator
claude-code claude-opus-4-8 @ effort=medium
### Rationale
This session is standard extension development, creating a file rewriter and wiring new commands into the ActionRegistry. The chosen orchestrator is well-suited for this TypeScript-heavy work, following patterns established in the codebase.
### Estimated routed cost
moderate
| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | The `verificationModeRewrite` helper | t2 |
| 2 | `Copy verification kickoff prompt` | t2 |
| 3 | `Set up dedicated verification…` | t2 |
| 4 | Reuse `dabbler.openExternalVerificationDoc` | t2 |
| 5 | Tests | t3 |
### Actuals (filled after the session)
- Orchestrator used: claude-code claude-fable-5 @ effort=high
- Total routed cost: $0.3083 (session-verification only: gpt-5-4 R1 $0.2608 ISSUES_FOUND → R2 narrow re-verify $0.0475 VERIFIED)
- Deviations from recommendation: orchestrator was fable-5/high, not opus-4-8/medium (same holder as Session 1 picked the set back up). Implementation again routed $0 — the t2/t3 step-table routing did not apply (orchestrator-direct TS work).
- Notes for next-session calibration: OpenAI recovered — the router's gpt-5-4 verifier pick worked first try (no gemini fallback needed; S1's 429 contingency did not recur). R1 found 1 Major (gate too narrow vs the locked D3 "any activity-log record" language) — pointing the verifier at the locked-design excerpts is what surfaced it; keep doing that in S3, especially for the D4 gates.

## Session 3: Sanctioned A→B on completed sets (blessed writer + wiring)
### Recommended orchestrator
claude-code claude-opus-4-8 @ effort=high
### Rationale
This session has higher complexity, requiring a new "blessed writer" in Python and careful wiring from the TypeScript extension. A high-effort orchestration is warranted to correctly implement the state-change gates and the cross-language invocation pattern.
### Estimated routed cost
high
| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Audit first | t2 |
| 2 | Implement the blessed writer in `ai_router` | t3 |
| 3 | Extension wiring | t2/t3 |
| 4 | Documentation | t2 |
| 5 | Tests | t3 |
### Actuals (filled after the session)
- Orchestrator used: claude-code claude-fable-5 @ effort=high
- Total routed cost: $0.4046 (session-verification gpt-5-4: R1 $0.2928 ISSUES_FOUND → R2 narrow re-verify $0.1086 VERIFIED; + $0.0032 gemini-pro analysis for the Session 4 recommendation refresh)
- Deviations from recommendation: orchestrator was fable-5/high, not opus-4-8/high (same holder as Sessions 1–2 picked the set back up; effort matched). Implementation again routed $0 — the t2/t3 step-table routing did not apply (orchestrator-direct Python + TS work).
- Notes for next-session calibration: feeding the verifier the locked-design excerpts surfaced findings again (R1: 1 Critical + 1 Major + 1 Minor) — but the Critical and Minor were context gaps, not defects: the Critical hypothesized an attack through UNCHANGED code (the Set 057 capture-immutability check) that the diff-only context didn't show, and was disproven by an executed minimal repro then pinned as a regression test. Calibration: when a design hinges on unchanged gate-adjacent code, include those function bodies alongside the diff in R1 — it would have saved a round. The Major (missing invocation/fallback-path tests) was real and is the second straight session where the verifier caught a too-narrow test surface; budget for branch-matrix tests up front.

**Next-session orchestrator recommendation (Session 4):**
gpt-5-4 (openai gpt-5.4) @ effort=high — REVISED from the set-start gemini-2.5-pro/medium recommendation by routed gemini-pro analysis at S3 close ($0.0032). Rationale (routed): Session 4's success condition is exact conformance of many fixture files to strict schema validators and drift guards, not raw content generation; gpt-5-4 demonstrated the strongest grasp of the project's invariants across Sessions 2–3 as the verifier, so cost-priority gives way to conformance-priority.

## Session 4: Hello-world UAT fixture workspace
### Recommended orchestrator
gemini gemini-2.5-pro @ effort=medium
### Rationale
The primary work is authoring a matrix of structured fixture files (YAML, JSON) and a simple generator script. This is less about complex code logic and more about organized content generation, for which Gemini is a strong and cost-effective choice.
### Estimated routed cost
moderate
| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Author the committed fixture matrix | t2 |
| 2 | The generator | t1 |
| 3 | Wire the matrix into at least one deterministic test | t2 |
| 4 | Docs | t2 |
| 5 | Full suite; cross-provider verification | t3 |
### Actuals (filled after the session)
- Orchestrator used: claude-code claude-fable-5 @ effort=high
- Total routed cost: $0.1920 (session-verification gpt-5-4: R1 $0.1822 ISSUES_FOUND → R2 narrow re-verify $0.0066 VERIFIED; + $0.0031 gemini-pro analysis for the Session 5 recommendation refresh)
- Deviations from recommendation: orchestrator was fable-5/high, not the S3-close revised gpt-5-4/high (the operator handed the session to the same claude-code holder as Sessions 1–3; Rule 7 — the human controls orchestrator choice). Implementation again routed $0 — fixture authoring, generator, tests, and docs were orchestrator-direct file work.
- Notes for next-session calibration: the conformance-priority rationale behind the gpt-5-4 revision held up fine under fable-5 — the pinning suite passed 14/14 on the first run and both drift-guard runs were clean, so the fixture-conformance risk the revision priced in did not materialize. R1's only finding was a context gap (the 'suite green' criterion vs the tracked 2-failure Set-026 baseline); state the baseline convention in the R1 verification prompt up front in Session 5 — the same lesson S3 recorded for unchanged gate-adjacent code, now confirmed for suite-baseline conventions too.

**Next-session orchestrator recommendation (Session 5):**
claude-code claude-fable-5 @ effort=high — REVISED from the set-start claude-sonnet-4-6/low by routed gemini-pro analysis at S4 close ($0.0031). Rationale (routed): the expanded UAT checklist scope (subsuming Set 061's rows, ~25–30 ProgrammaticVerification-bearing items gating two releases) invalidates the low-effort assessment; the established workhorse model at high effort fits the precision needed, while routed cost stays low (one-shot document generation, not iterative code-and-verify cycles).

## Session 5: Combined operator UAT on a local build, then 0.30.0 + 0.17.0
### Recommended orchestrator
claude-code claude-sonnet-4-6 @ effort=low
### Rationale
This session is almost entirely procedural and document-based, involving checklist authoring, version bumps, and changelogs. A cheaper, faster model is sufficient for these mechanical, low-complexity tasks.
### Estimated routed cost
low
| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Author the combined ad-hoc per-set UAT checklist | t2 |
| 2 | Build and UAT | human-only |
| 3 | Version bumps and changelogs | t1 |
| 4 | Cross-provider verification | t3 |
| 5 | Release | human-only |
### Actuals (filled after the session)
- Orchestrator used: claude-code claude-fable-5 @ effort=high (matched the S4-close routed revision)
- Total routed cost: $0.1720 (session-verification gpt-5-4, R1 VERIFIED 0 issues — single round)
- Deviations from recommendation: none on orchestrator (the revised recommendation was followed). Step-table routing again did not apply — checklist authoring, UAT prep, bumps, and docs were orchestrator-direct; the human-only steps (UAT walk, release authorization) stayed human-only (tags held at close).
- Notes for next-session calibration: the S3/S4 lesson paid off measurably — stating the suite-baseline convention, the release pre-push contract, and the unchanged gate-adjacent code (resolver precedence + committed fixture workspace file) up front in the R1 prompt produced the set's first R1-clean VERIFIED (every prior session burned a round on a context gap). Treat the up-front conventions block as the default R1 prompt shape from now on. UAT prep that actually executes the click paths (live CLI runs on a generated workspace copy) caught a shipped defect (cp1252 migrator crash) that the unit suites structurally cannot see — same family as the Set 058 lesson, now confirmed for spawned-CLI surfaces too.
