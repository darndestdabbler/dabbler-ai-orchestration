# Set 029 — AI Assignment

> **Status:** Authored at set-creation time (2026-05-17) by Claude
> Opus 4.7 during the spec-authoring conversation. Per memory
> `feedback_ai_router_usage`, the router is reserved for
> end-of-session verification — this file was authored directly by
> the spec-author without router invocation.

---

## Session 1 of 6: Cross-provider design audit

### Recommended orchestrator

Claude Opus 4.7 @ effort=high. Audit synthesis work; needs
high-quality reasoning to draft the proposal coherently and to
synthesize two verifier verdicts into a single locked summary.

### Rationale

Six open design questions hinge on how four different orchestrator
surfaces expose their state. The proposal must be coherent and
specific enough that two frontier verifiers can give meaningful
feedback rather than vague generalities. Opus is the right model
for that synthesis. Effort=high because the design space is large
and the verifier-disagreement resolution will need careful
judgment.

### Estimated routed cost

- 2 audit calls (`task_type='cross-provider-audit'`, gpt-5-4 + gemini-pro):
  $0.15 – $0.50
- 1 session-verification call (`task_type='session-verification'`,
  gpt-5-4): $0.10 – $0.30

Total Session 1: $0.25 – $0.80.

### Constraint reminders

- **Memory `feedback_ai_router_route_result_handling`:** dump
  `RouteResult` to JSON before any attribute access in `route_audit.py`.
  Lost $0.34 across two prior sessions to wrapper-crash bugs.
- **Memory `feedback_split_large_verification_bundles`:** proposal
  doc will be ~400-500 LOC; well under the 700 LOC threshold.

### Actuals (filled after the session)

- **Orchestrator used:** Claude Code (Claude Opus 4.7 @ effort=high) — matches recommendation.
- **Total routed cost: $0.845** ($0.264 Round A + $0.085 Bucket-2
  consensus + $0.138 Round B + $0.358 Round C). Three verification
  rounds plus one in-session consensus call; original estimate was
  one verification call only ($0.10–$0.30). The overshoot reflects
  two newly-saved process memories that changed the verification
  shape mid-session: `feedback_prefer_ai_consensus_over_human_prompt`
  (added the consensus class of call) and the multi-round-drift
  pattern that surfaced previously-uninspected spec.md regions on
  each round. All three rounds converged cleanly — no verifier
  spiral. Cost was $0.845 against the operator's $5.00 NTE for
  the set; comfortable headroom remains.
- **Deviations from recommendation:** none on engine/model; cost
  overshoot is process-related, not orchestrator-quality-related.
- **Notes for next-session calibration:**
  - Audit-then-implement sets that route a fresh design review at
    the close of the audit session should budget for 2–3 verification
    rounds, not 1, because pre-audit spec drift in un-bundled regions
    only surfaces after the audit bundle gets verified. Future audit
    sets: include the FULL spec.md in the verification bundle on the
    final round to catch drift in regions not touched by the audit.
  - Round C's higher cost ($0.358 vs. p50 $0.13) was driven by
    gpt-5-4's 22k output tokens on a tight prompt. For verifier
    bundles that ask for "find any remaining drift", expect higher
    output token counts than typical session-verification calls.

**Next-session orchestrator recommendation (Session 2):**
Claude Code (Claude Opus 4.7 @ effort=high). Unchanged from the
original recommendation — implementation work is pure Claude tokens
(no routed calls except the end-of-session verifier), and the multi-
file coherence demands of webview + helper script + hook installer +
Playwright smoke remain Opus-class. Operator triggered S2 start at
2026-05-18 with this orchestrator engaged.

---

## Session 2 of 6: Core webview + Claude detection + hook installer

### Recommended orchestrator

Claude Opus 4.7 @ effort=high. Substantial TypeScript +
HTML/CSS + Node/Python hook script + Playwright test. Multiple
surfaces (webview provider, command, helper script, smoke test)
must integrate cleanly.

### Rationale

The webview is non-trivial: CSS gauges, message-passing to/from
the extension host, filesystem watcher, idempotent settings.json
edits in the hook installer. Lots of moving parts; Opus's
multi-file coherence matters.

### Estimated routed cost

$0.10 – $0.30 (one session-verification call only).

---

## Session 3 of 6: Per-session-set identity (NEW, REVISED 2026-05-18 custom-tree pivot)

### Recommended orchestrator

Claude Opus 4.7 @ effort=high. Architectural change to the
identity model (per-set markers, schema v3, walk-up resolver, data-
layer extraction). Touches the writer, reader, schema, tests, and
init flow — multi-file coherence matters.

### Rationale

The cross-window contamination bug (per memory
`project_consumer_repos`) is a real correctness defect. Per
GPT-5.4's "fail closed" verdict (synthesis.md D2), the resolver
must skip writes on ambiguity rather than guess. `SessionSetsModel`
extraction sets up the S4 custom tree. None of this is editorial
or boilerplate; Opus is right for the design judgment, the careful
backward-compatibility handling, and the test rewrites.

### Estimated routed cost

$0.10 – $0.30 (one session-verification call only).

### Actuals (filled after the session)

- **Orchestrator used:** Claude Code (Claude Opus 4.7 @ effort=high) — matches recommendation.
- **Total routed cost: $0.085** — three Gemini Pro verification
  rounds (Round A writer + schema doc $0.018; Round B reader +
  model + provider + tests $0.047; Round C confirmation $0.020).
  Came in BELOW the $0.10–$0.30 forecast.
- **Deviations from recommendation:** verifier-engine deviation only —
  the spec called for `task_type='session-verification'` defaulting
  to gpt-5-4, but gpt-5-4 returned 429 on the OpenAI Responses
  endpoint twice in a row (first on the initial 101k-char bundle,
  then on the 37k-char retry). Pinned the route to `model="gemini-pro"`
  to dodge the sticky rate limit. Cross-provider verification was
  still satisfied (Claude orchestrator + Gemini Pro verifier).
- **Notes for next-session calibration:**
  - The sticky-rate-limit on OpenAI Responses can outlast the
    failed call by minutes. Splitting into smaller bundles AFTER
    hitting the 429 doesn't help if the window is still active —
    the right escape is cross-provider (Gemini). Worth adding to
    memory `feedback_split_large_verification_bundles` as a
    secondary observation.
  - Round B surfaced 3 narrowly-scoped MUST-FIX items that all
    converged cleanly on Round C. The Gemini Pro verifier emitted
    code-grade fixes (specific lines + replacement blocks) rather
    than meta-commentary — quality was at least equivalent to
    typical gpt-5-4 sessions, possibly better on the
    "actionable-output" axis.
  - The verifier's structured per-question response format
    (VERIFIED / MUST-FIX / SUGGEST) worked cleanly. Worth keeping
    as the standard for S4–S6 verification prompts.

**Next-session orchestrator recommendation (Session 4):**
Claude Code (Claude Opus 4.7 @ effort=high) — unchanged from the
original recommendation. S4 is the custom-tree pivot (large
reimplementation surface; multi-file coherence at scale) gated
by its own pre-session audit. The audit itself should reuse the
Gemini-Pro escape pattern proven in S3 (router-driven Gemini Pro
call + manual GPT-5.4 paste in GitHub Copilot per
`feedback_split_large_verification_bundles`).

---

## Session 4 of 6: Custom-tree pivot (NEW, REVISED 2026-05-18 custom-tree pivot)

### Recommended orchestrator

Claude Opus 4.7 @ effort=high. Large reimplementation surface:
GPT-5.4's review flagged 14 row-context actions, loading-state
gating, `viewsWelcome` empty state, ARIA tree semantics — none
deferrable. Webview message protocol + keyboard nav + focus
management. Multi-file coherence at scale.

### Rationale

Per GPT-5.4: "the proposal currently smuggles in a second, much
riskier decision: replacing a native VS Code tree with a custom
webview tree that must replicate command menus, navigation,
accessibility, and empty/loading semantics." That's exactly the
multi-surface Opus-class work the model is best suited for. Per
memory `feedback_split_large_verification_bundles`, if the
end-of-session verification bundle exceeds 700 LOC, split into
Round-A / Round-B.

### Estimated routed cost

$0.05 – $0.20 pre-session audit (Gemini Pro via router; GPT-5.4
via manual paste = $0.00) + $0.10 – $0.30 session-verification.
**Total S4 routed: $0.15 – $0.50.**

---

## Session 5 of 6: Non-Claude provider detection + manual override (renumbered from S3)

### Recommended orchestrator

Claude Opus 4.7 @ effort=high. Each provider's detection mechanism
is its own little system; need to handle them all without
introducing regressions in the Claude path from S2.

### Rationale

S2 establishes the marker-file protocol; S5 adds three new
writers (or three new "manual fallback" paths). The empty-state
CTA logic that picks the right installer is the trickiest piece —
detecting which orchestrator is *currently active* is fuzzy.

### Estimated routed cost

$0.10 – $0.30.

---

## Session 6 of 6: Polish, README, marketplace publish (renumbered from S4)

### Recommended orchestrator

Claude Sonnet 4.6 @ effort=medium. Documentation, screenshot,
version bump, publish. Lower complexity than S1–S3; Sonnet is
sufficient and cheaper. Marketplace publish itself requires
operator confirmation per the standard pre-publish gate.

### Rationale

Editorial work. Sonnet handles README polish and changelog
synthesis well at lower cost. Publish step is operator-driven
(quote the publish command, get confirmation, execute).

### Estimated routed cost

$0.05 – $0.15.

---

## Total set cost forecast

**REVISED 2026-05-18 S3 close:** $1.85 – $2.55 (actuals + forecast
across the new 6-session shape). S1 actual $0.85 + S2 actual
$0.58 + custom-tree pivot audit $0.022 + **S3 actual $0.085** +
forecast $0.30 – $1.00 across S4 audit / S4-S5-S6 verifications.
Against the operator's $5.00 NTE for the set; comfortable
headroom remains (~$2.45–$3.15 unused).

Prior forecasts: pre-pivot 4 sessions $0.55 – $1.55; post-pivot
pre-S3 $1.85 – $2.70 (S3 came in $0.015 below the midpoint).

---

## Next-set recommendations

None planned. If audit (S1) surfaces a sub-design that warrants
its own set (e.g., Gemini Code Assist detection turns out to need
a separate shim with its own release), recommend spinning that as
a Set 030 follow-on rather than expanding 029's scope mid-flight.
