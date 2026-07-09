# AI Assignment Ledger — Set 086

Per-session record of the cheapest-capable AI for each step, plus the
next-session recommendation. Next-orchestrator / next-session choices are
produced via routed analysis (`route(task_type="analysis")`), never
self-opined (L-064-6 / Rule 17). The routed analysis for S1 is saved raw at
`s1-next-orchestrator-analysis.json`; the S1 gate-placement architecture
decision is saved raw at `s1-gate-placement-architecture.json`.

## Session 1 of 2 — Router-side enforcement (the safety net)

Orchestrator: **claude / anthropic / claude-opus-4-8 / high**.

| Step | Handled by | Rationale |
| :--- | :--- | :--- |
| Map the modules to touch (cli_transport error_class, writer_discipline, gate_checks close chain, session_state writers, start_session hook) | Orchestrator (Explore subagent) | Read-only reconnaissance; mechanical fan-out over known files, no reasoning to route. |
| **Gate-placement architecture decision** (where the close fail-loop lives so it composes with the verification_integrity gate + Set-084 backstop without double-blocking) | **Routed — architecture (tier 3)** | Genuine oracle-free design question with >1 plausible answer (spec Step 3 mandates a routed architecture delegation). Ruled: inside `check_verification_integrity` as a ledger sub-check, delegate detection to `writer_discipline` via opt-in `require_ledger=True`, do NOT consult `no_router`. Saved raw. |
| Build `copilot_preflight.py` (binary → credential → live-probe, classified through the transport taxonomy) + CLI | Orchestrator (direct) | Implementation fully determined by the spec + the transport's existing seams; new self-contained module with injectable spawner/which/credential-dir (never touches the real CLI). |
| Wire preflight into `start_session` (block on the copilot-cli seat, skip billed probe on idempotent re-entry, no-op on direct-API / --no-router) | Orchestrator (direct) | Small, delicate hook against the live writer; the L-069-1 sibling-site discipline is the implementer's job. |
| `require_ledger` flag in `writer_discipline` + ledger sub-check in `check_verification_integrity` (scoped to ledger-absence, NOT mtime-divergence) | Orchestrator (direct) | Directly implements the routed architecture decision; delicate gate-composition code best applied against the live modules. |
| Verdict-token validation at the blessed writer (`_flip_state_to_closed` raise + early close_session block; tolerate prefix-matched extension tokens) | Orchestrator (direct) | Schema↔writer parity surface (L-066-1); mirrors the existing `RETIRED_VERIFICATION_METHODS` naming-message pattern. |
| One-shot repair-helper in/out decision | Orchestrator (direct) + spec authority | **DEFERRED** per the spec non-goal: rewriting closed-set state files contradicts blessed-writers-only and the verdict validation this set adds; manual remediation recipe recorded (re-verify via router, close via `--repair`, never a hand edit). |
| pytest (preflight pass/fail, ledger-gate block/inert, verdict reject/tolerate, start_session wiring) | Orchestrator (direct) | Written against the live modules; exercised by the full suite. |
| **Session verification (Step 6)** | **Routed — cross-provider, non-anthropic** | Mandatory no-skip cross-provider check (Set 083 / no-skip-verification-mandate). |
| Next-orchestrator + next-session AI assignment | **Routed — analysis (Step 3.5)** | L-064-6: never self-opine on model choice. Saved raw at `s1-next-orchestrator-analysis.json`. |

**Delegation note.** The one oracle-free, solution-divergent decision (gate
placement) was routed to a tier-3 architecture reviewer; the implementation
that flows deterministically from that decision + the spec was handled
directly, per the Set 085 thesis that over-routing a settled implementation is
ceremony. The non-negotiable cross-provider verification (routed) is the
quality gate.

## Next-session recommendation (routed analysis, made in S1)

For **Session 2 of 2 (diagnostics, onboarding, legibility — the set-terminal
session)** the routed analysis (`s1-next-orchestrator-analysis.json`)
recommends **claude / anthropic / Sonnet-class / medium effort**. Rationale
(routed): S2 spans Python router diagnostics + TypeScript extension
legibility/onboarding + docs + a `.vsix` build — a multi-language,
cost-sensitive workload where Sonnet is fully capable of the set-terminal
duties (advisory path-aware critique, change-log synthesis) without Opus cost,
and Haiku would risk under-synthesizing the cross-surface scope. Operator
supervision warranted on: the Explorer legibility UI change (Step 3), the
`.vsix` build/install (Step 4), and the final cross-provider + path-aware
disposition (Step 7). The operator owns the final model choice on the
recommended seat.

### Actuals (S1)
- Orchestrator used: claude / anthropic / claude-opus-4-8 @ effort=high
- Routed cost (pre-verification): architecture (tier 3, gate placement) +
  analysis (next-orchestrator); both saved raw.
- Verification: 8 rounds. R1–R5 gpt-5-4 (~$0.24–$0.34 each; all agreed Major,
  fixed); R5 triggered an L-069-1 completeness sweep. R6 hit an OpenAI 429 →
  escalation-ladder fallback to gemini-pro (via verify_session's route_fn
  seam, excluding openai on top of the auto-excluded orchestrator provider).
  R6 gemini (1 Major, fixed), R7 gemini (2 Major doc-staleness in evidence
  artifacts, fixed), R8 gemini VERIFIED. Gemini rounds ~$0.07 each.
- Deviations from recommendation: n/a (S1 was the operator-started session).
- Process note: rounds ran past the default 2-round cap under the operator's
  in-session rule refinement (continue on agreed Critical/Major); a proposed
  codification was surfaced for operator sign-off (not yet written).
