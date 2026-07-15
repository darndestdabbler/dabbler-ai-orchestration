# AI Assignment — 104-copilot-cli-large-prompt-handoff

## Session 1 — Implement the threshold-gated file handoff (+ pause-recipe doc)

- Orchestrator: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
- Routed step-3.5 analysis: `s1-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, $0.0026,
  truncation-clean). Verdict: the Session-1 intra-session plan is correct —
  the handoff **implementation** (`cli_transport.py`) and its **fake-spawner
  test extension** are mechanical, single-module transport code an orchestrator
  owns directly (the design was already consult-locked pre-spec, so this is
  execution, not generation); the mandatory **cross-provider session
  verification** routes to a different provider per the no-skip mandate.
- Set-level facts carried from the spec (do not re-litigate at runtime):
  **Full tier**, `requiresUAT false` / `requiresE2E false` (router-internal
  transport change, no UI surface; the Layer-1 fake-spawner suite owns the
  behavior), `pathAwareCritique advisory`. The authoritative design is
  **consult-locked** (openai:gpt-5-6 + google:gemini-3-1-pro, aligned) in
  `authoring-consult-synthesis.md` — anything discovered that contradicts it
  goes through adjudication with the consult record as baseline, not a runtime
  re-litigation.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec + consult synthesis + `cli_transport.py`, its tests, the `copilot-cli` config block, and `transport_diagnostics.py`. | Orchestrator direct — read-only reconnaissance. |
| 2 | Implement the handoff in `cli_transport.py` (UTF-16 measure helper, handoff branch, nonce ack validate+strip, `handoff-incomplete` class, `finally` cleanup all paths, additive metadata incl. `payload_file_modified`, retention-under-toggle). | Orchestrator direct — single-module transport code against a consult-locked design (execution, not generation). |
| 3 | Extend the fake-spawner suite (threshold branch, exact payload + UTF-8-no-BOM + closed handle, POSIX-path/no-nonce bootstrap, ack success/missing/mismatch, cleanup on 6 paths, `payload_file_modified`, UTF-16 cases, inline regression). | Orchestrator direct — deterministic test authoring against the just-written code. |
| 4 | Docs: CHANGELOG 0.34.0 (staged); tier-model + 078-spec pointer notes; the **cancel-to-pause recipe** in the workflow doc + close-out pointer. | Orchestrator direct — verbatim/mechanical edits verified against code (L-064-8). |
| 5 | Full pre-commit pass (pytest, guidance ceiling). | Orchestrator direct — command execution. |
| Verify | Cross-provider phased verification. | **Routed** — `session-verification`, orchestrator provider (anthropic) auto-excluded. |

### Next-orchestrator recommendation (Session 2 — last session, operator-gated)

Routed (raw in `s1-ai-assignment-analysis.json`, gemini-2.5-pro,
anthropic-excluded): **primary gpt / openai / gpt-5-6** — best-in-class for
live system diagnostics and probe-driven code fixes, and a cross-provider
second opinion on Session 1's implementation against wire-protocol realities
the fakes cannot model. **Runner-up: claude / anthropic / claude-opus-4-8**
(keeps Session-1 context, forgoes the cross-provider benefit). **Effort:** the
routed verdict said `low` (Session 2 is largely mechanical — drive the real
CLI, record evidence, bump the version); the orchestrator should escalate to
`high` only if the live probe surfaces a nontrivial wire-shape defect needing a
real fix loop (operational judgment, not a model-choice change). **Precondition
caveat (hard):** Session 2 is **non-viable** without an authenticated GitHub
Copilot CLI seat on the operator's Windows machine — it runs the Set 086
auth-preflight first and, on failure, **stops and reschedules** rather than
running against an unrunnable required step (Set 086 principle). The two
premium requests are operator-sanctioned.

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
- Routing plan followed as recommended: implementation + tests + docs
  orchestrator-direct (consult-locked design = execution); step-3.5 analysis
  routed ($0.0026, truncation-clean); session verification routed
  cross-provider (anthropic auto-excluded).
- Deviations: _to be filled at close._
- Outcome: _to be filled at close._

---

## Session 2 — Live >32 KiB smoke probe + release staging

- Orchestrator: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
  S1's routed step-3.5 named codex/openai/gpt-5-6 as the S2 **primary** (for a
  cross-provider live-diagnostics second opinion) with claude/anthropic/opus-4-8
  the **explicit runner-up** ("keeps Session-1 context"). The operator launched
  Claude Code, so this session runs as the sanctioned runner-up — the operator's
  engine choice governs. The cross-provider *verification* benefit is preserved
  regardless: `verify_session` auto-excludes anthropic, so S1's implementation
  still gets a different-provider second opinion at Step 6.
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT false` / `requiresE2E false`, `pathAwareCritique advisory`. The
  design is consult-locked; the live probe is a wire-shape reality check, not a
  design re-litigation.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; run the Set 086 Copilot auth-preflight (free checks + live probe). | Orchestrator direct — a mechanical precondition gate; stop+reschedule on failure. |
| 2 | Live >40 KiB handoff probe (3 embedded facts) + inline control probe; record `s2-live-probe.md`. | Orchestrator direct — drive the real CLI through `CopilotCliTransport.dispatch`, record raw evidence (mechanical operation, not reasoning). |
| 3 | Fix anything the probe surfaces; every fix lands with a fake-spawner regression test; re-probe. | Orchestrator direct — single-module transport code + deterministic tests (execution against a consult-locked design). Escalate to routed review only if a fix is nontrivial/architectural. |
| 4 | Release staging: bump `pyproject.toml` 0.34.0; finalize CHANGELOG probe line. | Orchestrator direct — mechanical version/changelog edits. Publish stays operator-gated. |
| Verify | Cross-provider phased verification. | **Routed** — `session-verification`, orchestrator provider (anthropic) auto-excluded. |

### Next-SET recommendation (last session — routed, anthropic-excluded)

Routed `task_type=analysis` (raw in `s2-ai-assignment-analysis.json`,
anthropic-excluded for an independent cross-provider opinion): **next set =
the "configurable severity knob"** (small, operator-favored Set 096 follow-on)
— because the primary follow-on, **restore Set 103**, is gated on the
operator's manual PyPI publish of router 0.34.0 (D6 one-active-set: pick a
today-runnable item over one waiting on an operator action). The verdict's
specific orchestrator model string (`gpt-4-turbo`) is **stale/not in the
registry** (the registry's frontier OpenAI models are `gpt-5.x`) and is
disregarded per "routed recommends the *choice*, operator picks the engine";
the substantive next-set pick and the D6 rationale stand. Post-publish
follow-through is unchanged and named in the close notification: once 0.34.0
is live, **restore Set 103** per its CANCELLED.md.

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
- Deviations: _to be filled at close._
- Outcome: _to be filled at close._
