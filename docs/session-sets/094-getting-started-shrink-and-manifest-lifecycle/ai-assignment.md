# AI Assignment Ledger — Set 094

Per-session record of the cheapest-capable AI for each step, plus the
next-session recommendation. Next-orchestrator choices are produced via
routed analysis (`route(task_type="analysis")`), never self-opined. The
Session 1 recommendation is saved raw at `s1-next-orchestrator-analysis.json`.

## Session 1 of 2 — Form shrink + create-on-demand manifest lifecycle

Orchestrator: **claude-code / anthropic / claude-opus-4-8 / high effort**
(per Set 093's routed next-set recommendation).

Rationale: Session 1 lands the trust-boundary invariant of the redesign
(create-on-demand `docs/modules.yaml` on explicit user actions only, never
on activation) across five call sites, plus a shrink of the writer that the
prior set hardened over 11 verification rounds — architecture-strong work.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec, verdict (adjudication A), Q8 compat matrix, Sets 092/093 outcomes, the host/protocol/webview/scaffold path. | Orchestrator direct — read-only reconnaissance over named anchors. |
| 2 | Settle the ensure-write seam (helper shape / TOCTOU; Add-module reconciliation; scaffold placement; passive-path audit). | **Routed — architecture** (`s1-ensure-write-seam-architecture.json`), per the spec's pathAwareCritique-advisory trust-boundary flag. |
| 3 | Two-section form; shared ensure-write (atomic exclusive-create); Add-module through the canonical template; toolbar button; retire the orphaned flag/probe machinery + watcher glob. | Orchestrator direct — deterministic downstream of the settled ruling. |
| 4 | Ensure-write audit: exactly the explicit-action sites write; no-write-on-activation test-pin. | Orchestrator direct — contract-driven. |
| 5 | Layer-2 suites (render, ensure-write matrix, no-write-on-read, flow) + Layer-3 Define-modules smoke. | Orchestrator direct — contract-driven test updates. |
| 6 | Build + full suite + Layer 3 locally (L-064-12). | Orchestrator direct — executable validation. |
| 7 | Mandatory cross-provider session verification. | Routed — session verification, excluding the Anthropic orchestrator provider. |
| 8 | Recommend Session 2 orchestration. | Routed — analysis, saved raw in `s1-next-orchestrator-analysis.json`. |

### Actuals (filled after the session)

- Orchestrator used: claude-code / anthropic / claude-opus-4-8 / high effort
- Routed calls: architecture ruling (opus, tier 3, `s1-ensure-write-seam-architecture.json`);
  next-orchestrator analysis (`s1-next-orchestrator-analysis.json`); final
  cross-provider verification recorded at close.
- Deviations from recommendation: none.
- Notes for next-session calibration: _to be filled at close._

## Session 2 of 2 — D6 prompt, parallel shelving escape hatch, docs pass & release prep

Recommended orchestrator: **claude-code / anthropic / Fable-class / high effort**
(per Session 1's routed next-session recommendation, `s1-next-orchestrator-analysis.json`).

Rationale (routed): Session 2 is a broad-front push on documentation, prompt
authoring, and release prep, with one new command and a routed UI-shelving
architecture decision. Fable's capability suffices for the coding + the routed
implementation while being efficient for the significant prose/structured-text
volume; `high` effort is retained not for architectural novelty but for the
diligence and breadth this release-boundary close demands.

### Actuals (filled at close)

- Orchestrator used: **claude-code / anthropic / claude-opus-4-8 / high effort**
  (operator invoked this session on Opus; the S1 routed rec was Fable-5 for
  cost — advisory, and the operator's invocation stands).
- Routed calls: the S2 architecture ruling (gpt-5-4 / openai, tier 3,
  `s2-parallel-and-d6-architecture.json`); the next-set analysis
  (`s2-next-set-analysis.json`); the two session-verification rounds (gpt-5-6,
  anthropic excluded); the advisory path-aware critique (openai + google).
- Deviations from recommendation: orchestrator model (Opus vs the recommended
  Fable) — operator's choice; no functional impact.
- Notes for next-set calibration: the release-boundary close is broad but
  low-novelty; the one non-trivial risk was **doc↔behavior fidelity** on the
  shipping README (two verification rounds spent on the onboarding-sequence
  Major — an L-064-8 instance). Set 095's docs/UAT work carries the same risk
  profile, so budget for a doc-claim-vs-code re-check pass.

## Next session set — routed recommendation

Recommended orchestrator for **Set 095** (Hello World walkthrough + UAT re-cut +
the deferred teaching-doc rewrite / screenshot refresh):
**claude-code / anthropic / claude-sonnet-5 / medium effort**
(routed analysis, saved raw at `s2-next-set-analysis.json`).

Rationale (routed): documentation- and UAT-authoring-heavy with a high prose
quality bar but negligible architectural novelty; Sonnet-5 is the
cheapest-capable fit and leaves gpt-5-x / gemini-3-pro for the cross-provider
verification pool. Escalate to a higher tier only if the teaching-doc golden
regeneration or the cold-start dogfood surfaces real complexity.
