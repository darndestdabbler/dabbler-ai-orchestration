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
- Orchestrator used:
- Total routed cost:
- Deviations from recommendation:
- Notes for next-session calibration:

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
- Orchestrator used:
- Total routed cost:
- Deviations from recommendation:
- Notes for next-session calibration:

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
- Orchestrator used:
- Total routed cost:
- Deviations from recommendation:
- Notes for next-session calibration:

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
- Orchestrator used:
- Total routed cost:
- Deviations from recommendation:
- Notes for next-session calibration:
