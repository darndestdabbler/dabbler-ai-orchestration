# AI Assignment Ledger — Set 096

Per-session record of the cheapest-capable AI for each step, plus the
next-set recommendation. Next-orchestrator choices are produced via routed
analysis (`route(task_type="analysis")`), never self-opined. This set was
**operator-prioritized on 2026-07-12** (superseding Set 095's routed
077-first ranking in `../095-module-hello-world-walkthrough/s1-next-set-analysis.json`);
Set 095's routed orchestrator recommendation for the next set was
claude-code / anthropic / claude-sonnet-5 / low effort — the operator
invoked this session on **Fable-5** instead (advisory recommendation;
operator invocation stands, recorded as a deviation per the 094/095
precedent).

## Session 1 of 2 — Fan-out experiment, rubric in the template, ledger machinery

Orchestrator: **claude / anthropic / claude-fable-5 / operator-invoked**.

Design variance in this session is deliberately LOW: the consequence
rubric text is operator-set (L-095-1, verbatim), the phase design is
operator-directed in the spec, and the empirical gate (the fan-out
experiment) runs BEFORE any design commitment. Implementation is
therefore deterministic downstream of settled rulings (093/094
precedent); the reasoned-output steps route.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec, Set 095 ledger + issue corpus, L-095-1, current `verify_session` / template / parser / stamp code. | Orchestrator direct — read-only reconnaissance over named anchors. |
| 2 | Fan-out experiment: frozen 095 pre-close state (scratch worktree @ `b16dd58`, `--diff-base 34d4149`), K=3 same-model discovery calls + 1 cross-provider call, identical bundles. | Mechanics (worktree, evidence assembly, prompt build) orchestrator direct; the 4 discovery reviews **routed — session-verification** (the experiment's subject IS the routed verifier behavior); overlap matrix + sizing recommendation **routed — analysis**, saved raw. |
| 3 | Consequence rubric + mandatory `failure_scenario` into `verification.md`; `TEMPLATE_ID` v3 + pinned hash. | Orchestrator direct — operator-set text (verbatim from L-095-1), mechanical pin bump per the `verification_stamp.py` minting rule. |
| 4 | `sN-issues.json` optional `failureScenario` (tolerant parse); schema + doc update. | Orchestrator direct — additive small edits downstream of the spec. |
| 5 | Cross-round ledger as machinery: auto-assemble settled points from prior rounds' `sN-issues*.json` + remediation-note sidecars; prepend to the prompt. | Orchestrator direct — deterministic assembly code prescribed by the spec; covered by unit tests + the routed session verification. |
| 6 | Tests (template pins, parser, ledger assembly, rubric-text presence). | Orchestrator direct — contract-driven test updates (093/094 precedent). |
| 7 | Build + full suite. | Orchestrator direct — executable validation. |
| 8 | Mandatory cross-provider session verification (dogfoods the new rubric template). | Routed — session verification, excluding the Anthropic orchestrator provider. |
| 9 | Recommend Session 2 orchestration. | Routed — analysis, saved raw at `s1-next-set-analysis.json`. |

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-fable-5 (operator-invoked).
- Routed calls: 4 fan-out discovery reviews ($0.796: 3× gpt-5-6, 1×
  gemini-3-1-pro), overlap/sizing analysis ($0.024, gemini-pro), next-session
  analysis ($0.004, gemini-pro), 2 verification rounds ($0.365, gpt-5-6 on
  template v3). Session routed total ≈ **$1.19** (fan-out experiment well
  under its ≤$2 budget).
- Verification loop story (the set dogfooding itself): round 1 returned
  exactly ONE Major — a real fail-open in this session's own new ledger
  machinery (settled/no-resurrection framing applied without settlement
  evidence) — with a parsed `failureScenario` proving the new field
  end-to-end. Fixed fail-closed (earned settlement: settling
  `resolution_status` or non-empty round sidecar; unresolved/re-evaluate
  block otherwise), sidecar written (dogfooding the convention), round 2
  **VERIFIED clean under the auto-assembled ledger**. 2 rounds / $0.37 vs
  Set 095's 17 rounds / $4.88 under the ungraded regime.
- Deviations from recommendation: orchestrator model (Fable-5 vs Set 095's
  routed Sonnet-5/low for a different next set) — operator prioritization
  of this set; recorded in the header.
- Notes for next-set calibration: the routed overlap analysis needed an
  orchestrator correction (best-pair vs expected-pair K=2 coverage, 94% vs
  81% mean) — keep the two-layer pass (routed analysis + orchestrator
  arithmetic re-check) for experiment memos.

## Session 2 — routed recommendation

Routed analysis (raw: `s1-next-set-analysis.json`, gemini-pro):
**claude-code / anthropic / claude-sonnet-5 / medium effort** (moderate,
well-defined CLI code + tests + policy-doc restructure + replay; anthropic
orchestration keeps the openai/google verification pool free; Fable-5-class
capability unnecessary for the settled design). Runner-up:
claude-opus-4-8 / medium.
