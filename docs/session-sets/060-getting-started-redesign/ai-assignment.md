# AI Assignment — 060-getting-started-redesign

> Per-session ledger of the cheapest capable AI for each step
> (workflow Step 3.5). Recommendations are routed through
> `route(task_type="analysis")` — never self-opined by the
> orchestrator. **Deviation note:** Sessions 1 and 2 ran without this
> file (Step 3.5 was skipped); it was created at the start of
> Session 3, with Sessions 1–2 backfilled as actuals-only entries
> from the activity log and close records.

## Session 1: Completion-detection model + dual-mode Explorer shell

### Actuals (backfilled — no pre-session recommendation was routed)
- Orchestrator used: claude-code claude-opus-4-8 @ effort=medium
- Total routed cost: $0.514 (gpt-5-4 session-verification, 4 rounds)
- Deviations from recommendation: n/a (no recommendation existed)
- Notes for next-session calibration: 4 verification rounds is the
  cost driver — tighter spec excerpts in the verify prompt reduce
  false-positive rounds (R1 issues were largely scope confusion).

## Session 2: Wire the three actions

### Actuals (backfilled — no pre-session recommendation was routed)
- Orchestrator used: claude-code claude-fable-5 @ effort=medium
- Total routed cost: $0.137 (gpt-5-4 session-verification, 2 rounds)
- Deviations from recommendation: n/a (no recommendation existed)
- Notes for next-session calibration: R1's only Major
  (S060-S2-V1-001, the D7 worktree note) was out-of-session scope —
  feeding the verifier the NEXT session's spec text avoided a wasted
  remediation; carry that prompt-framing into S3 verification.

## Session 3: Inline validation + static editor instructions + retire old path

### Recommended orchestrator
claude-code claude-fable-5 @ effort=medium

### Rationale
This session is primarily mechanical TypeScript and webview
development, which is a core strength of this model. The only
required routing is for cross-provider verification, allowing the
orchestrator to handle the implementation and unit test authoring
directly and cost-effectively.

### Estimated routed cost
low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Env-var validation predicate & UI warning (D6) | orchestrator direct |
| 2 | Parallel worktree info disclosure (D7) | orchestrator direct |
| 3 | Static editor instructions doc generation & open (D8) | orchestrator direct |
| 4 | Retire old getStarted path and WizardPanel | orchestrator direct |
| 5 | Author unit tests | orchestrator direct |
| 6 | Cross-provider verification | route → task_type: session-verification |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-fable-5 @ effort=medium
- Total routed cost: $0.2649 (gemini-pro analysis $0.0070 +
  gpt-5-4 session-verification $0.2580, 1 round VERIFIED)
- Deviations from recommendation: none — orchestrator handled all
  implementation/test steps directly; only the verification was routed.
- Notes for next-session calibration: feeding the verifier the FULL
  spec (all sessions) + the spec-delegated decisions up front produced
  a clean single-round VERIFIED — versus 4 rounds (S1) and 2 rounds
  (S2) when scope context was thinner. Keep doing that in S4.

**Next-session orchestrator recommendation (Session 4):**
claude-code claude-haiku-4-5 @ effort=low
Rationale (routed, gemini-pro 2026-06-10, $0.0070): Session 4 is
mechanical version/docs edits + a UAT checklist gated on operator
UAT; a fast, low-cost model is sufficient, with cross-provider
verification still routed for release safety. (The routed output
named "claude-haiku-1", which is not a real model id; recorded here
as the current Haiku tier, claude-haiku-4-5. Raw analysis preserved
in the activity log entry.)

## Session 4: Operator UAT on a local build, then bump 0.29.0 + held release

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-fable-5 @ effort=medium
- Total routed cost: $0.1500 (gpt-5-4 session-verification, 2 rounds:
  R1 $0.1438 ISSUES_FOUND 1 Major → fixed → R2 $0.0062 VERIFIED)
- Deviations from recommendation: operator continued the in-flight
  claude-fable-5 conversation rather than switching to the
  recommended haiku-4-5 @ low — the session also absorbed two
  UAT-feedback code changes (path-referenced decomposition prompt +
  tier threading), which justified the more capable tier.
- Notes for next-session calibration: n/a (final session). The R1
  Major was a release-state tense error (docs said "pushed" before
  the tag existed) — keep release docs in the pre-push state until
  the publish workflow actually completes.
