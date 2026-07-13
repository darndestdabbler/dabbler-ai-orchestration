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

## Session 2 of 2 — Phased loop in verify_session, policy docs, release prep

Orchestrator: **claude / anthropic / claude-fable-5 / operator-invoked**
(deviation from the routed sonnet-5/medium recommendation above — operator
invocation stands, recorded per the 094/095 precedent).

Design variance stays LOW: the phase semantics are operator-directed in
the spec, the fan-out sizing and provider-diversity defaults are fixed by
S1's measured experiment memo, and compat (`--phase` omitted = today's
behavior) is spec-mandated. Implementation is deterministic downstream of
settled rulings; the reasoned-output steps route.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read S1's experiment memo + shipped state (verify_session, verification parser, template v3, config, workflow doc Step 6/7). | Orchestrator direct — read-only reconnaissance over named anchors. |
| 2 | `--phase discovery` / `supplementary` / `remediation-review` modes in `verify_session`; default invocation unchanged (compat). | Orchestrator direct — CLI code prescribed by the spec + S1 memo; covered by unit tests + the routed session verification. |
| 3 | Loop policy rewrite: workflow doc Step 6/7 restructured around the phases with bounded totals; constitution Step 6/7 pointers + bounded-round language echo-swept (L-065-1). | Orchestrator direct for the mechanical restructure — the policy CONTENT is operator-set (spec step 3 preserves the severity gate and round-cap authority verbatim); routed session verification reviews the result. |
| 4 | Config: `verification.discovery.fan_out: 2`, `provider_diversity: same-model` under `verification:` (values verbatim from S1's memo), documented inline. | Orchestrator direct — mechanical seeding of measured values. |
| 5 | Convergence replay: the frozen 095 corpus (worktree @ `b16dd58`, `--diff-base 34d4149`) through the phased loop end-to-end once; rounds/cost vs the 095 baseline recorded in the change-log. | Mechanics orchestrator direct; the replay's discovery/supplementary/remediation-review calls **routed — session-verification** (the subject IS the routed verifier behavior, no stamp/session_set — 096 S1 precedent). |
| 6 | Tests (phase framings, fan-out merge/dedupe, config plumb-through, compat). | Orchestrator direct — contract-driven test updates (093/094 precedent). |
| 7 | CHANGELOG + `dabbler-ai-router` version bump (publish operator-gated); build + full suite. | Orchestrator direct — executable validation. |
| 8 | Mandatory cross-provider session verification (dogfoods the phased loop). | Routed — session verification, excluding the Anthropic orchestrator provider. |
| 9 | End-of-set: change-log.md, Step 9 review, advisory path-aware critique, next-set recommendation. | Critique **routed — path-aware pull surface** (>=2 providers); next-set recommendation **routed — analysis**, saved raw at `s2-next-set-analysis.json`. |

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-fable-5 (operator-invoked;
  deviation from the routed sonnet-5/medium recommendation, recorded above).
- Routed calls: convergence replay 6 calls ($0.846: discovery K=2 + 
  supplementary + 2 remediation-review cycles on the scratch 096-s2-replay
  set — isolated stamps, can never corroborate this close); session
  verification 5 calls ($1.15: discovery K=2 $0.64, supplementary $0.34,
  remediation-review cycles $0.09 + $0.08); next-set analysis $0.004
  (gemini-pro); plus the close backstop's deciding round and the advisory
  path-aware critique at close. Session routed total before close ≈ **$2.00**.
- Verification loop story (the phased loop dogfooding itself): discovery
  K=2 harvested 9 blocking findings (largely disjoint call sets — the S1
  overlap result reproduced on a code corpus); supplementary added 1 new
  (the unparseable-findings deadlock) with zero re-reports; ALL findings
  were real defects in this session's own new machinery, remediated with
  17 new tests + 5 more for the ledger-id coverage enforcement; cycle 2
  accepted 10/11 and held the partial-coverage point, the CLI SUSPENDED
  the loop at the bound per its own shipped policy, and the held point was
  then fixed deterministically (ledger-id coverage) rather than
  adjudicated. No third cycle was opened; the deciding round is the
  sanctioned Set 084 close backstop (S1 precedent).
- Deviations from recommendation: orchestrator model (operator invocation
  stands). The routed next-set analysis (below) emitted stale Anthropic
  model ids (claude-3-haiku/sonnet-2024xx) — recommendation recorded with
  the orchestrator's correction to current-generation equivalents (the
  two-layer pass, S1 precedent).

## Next set — routed recommendation

Routed analysis (raw: `s2-next-set-analysis.json`, gemini-pro, $0.004):
ranking **1) 095-patch** (apply the loop-VERIFIED `s2-replay-fix.patch`
to the shipped walkthrough — quickest win, evidence already exists),
**2) 077-redo** (unblocks the 077 release gates), 3) the operator-gated
publish pass (router 0.31.0–0.33.0 + ext 0.42.0), 4) the authored
Explorer follow-on sets. Recommended orchestrator for 095-patch:
anthropic-family, **lowest tier, low effort** (the routed answer named
stale model ids; current equivalents: claude-haiku-4-5 low, runner-up
claude-sonnet-5 low — a pre-verified procedural patch application needs
no more).
