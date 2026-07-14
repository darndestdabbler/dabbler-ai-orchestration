# AI Assignment — 103-copilot-ado-hello-world-tutorial

## Session 1 — Author the Copilot + ADO cut (draft-banner until validated)

- Orchestrator: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
- Routed step-3.5 analysis: `s1-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, $0.0092,
  truncation-clean). Verdict mirrors the Set 102 S3 precedent for the same base
  tutorial: **route the tutorial authoring** as `documentation` with an
  orchestrator-assembled source-of-truth bundle, then an orchestrator
  **fidelity pass** (exact command titles, settings keys, dialog/preflight
  strings, pipeline YAML) — "routing initial authoring is more efficient than
  orchestrator authoring followed by a heavy corrective review"; the **UAT
  checklist stays orchestrator-direct** (highly structured JSON needing 1:1
  fidelity to the tutorial the orchestrator just assembled — transcription-risk
  minimized by full context); **cross-links + maintenance notes** and the
  **machine-check / fidelity pass** and **build** are orchestrator-direct
  (verbatim/mechanical/verification, not generative); the mandatory
  cross-provider session verification routes to a different provider per the
  no-skip mandate.
- Set-level facts carried from the spec (do not re-litigate at runtime): this is
  a **docs-only** set — no extension/router code, no version bumps; `requiresUAT
  true` (the Session 2 operator live walk is the acceptance test), `requiresE2E
  false`, `pathAwareCritique advisory`. The new doc opens with a visible DRAFT
  banner and is not linked from discoverability surfaces as "ready" until
  Session 2's live walk passes.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec + base tutorial + 102 discharge artifacts + Copilot-seat surfaces + command fact base. | Orchestrator direct — read-only reconnaissance. |
| 2 | Author `module-team-hello-world-copilot-ado.md` (standalone linear Copilot+ADO cut, executable ADO bootstrap, azure-pipelines.yml, sync-map appendix). | **Routed** — `documentation` authoring (routed rec (a)); orchestrator assembles the source-of-truth bundle and runs the post-authoring fidelity pass. |
| 3 | Author the per-set UAT checklist (078 bar: literal HumanAction/Expectation, where-you-are preamble, order map, ProgrammaticVerification-or-reason). | Orchestrator direct — structured JSON, 1:1 fidelity to the just-authored tutorial (routed rec (b)). |
| 4 | Cross-links (base tutorial, quick-start, README), dual maintenance notes, review-prompt drift line item. | Orchestrator direct — small verbatim edits (routed rec (c)). |
| 4b | Machine-check: pipeline YAML parses; command titles / settings keys / dialog strings verified against shipped code (L-064-8). | Orchestrator direct — tool-driven verification (routed rec (d)). |
| 5 | Build + full suite (docs-only; expect zero code deltas). | Orchestrator direct — command execution (routed rec (e)). |
| Verify | Cross-provider phased verification. | Routed — `session-verification`, orchestrator provider auto-excluded (routed rec (f)). |

### Next-orchestrator recommendation (Session 2 — last session, operator-gated)

Routed (raw in `s1-ai-assignment-analysis.json`): a **top-tier model from a
different provider than Session 1** — Session 2 is an operator-assisted UAT walk
needing elite instruction-following, interactive dialogue, and remediation, and
a cross-provider second opinion mitigates any Session-1 model-specific bias in
the doc. The raw verdict named `gpt-4o` (a **stale id not in the current model
registry**); mapped to the registry, the intent is **gpt / openai / gpt-5-6 /
high**. Runner-up: **claude / anthropic / claude-opus-4-8** (keeps Session-1
context but forgoes the cross-provider benefit). Effort: high. Session 2 blocks
on operator-supplied preconditions (ADO org + scratch project, a Copilot seat,
~half a day) named in the spec — if any is absent at start, reschedule rather
than run degraded. The Session-2 orchestrator must be initialized with **both**
this session's UAT checklist and Set 102's armed-ADO-walk record (the walk
discharges it).

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
- Routing plan followed as recommended: tutorial authoring ROUTED
  (`documentation`) with orchestrator-assembled bundle + fidelity pass; UAT
  checklist / cross-links / machine-check / build orchestrator-direct;
  step-3.5 analysis routed ($0.0092); verification routed cross-provider
  (orchestrator provider auto-excluded).
- Deviations: none from the plan. One mid-session real defect (drift-guard
  stale-framing) was caught by the suite and fixed; the seat auth-FAILURE walk
  was deliberately excluded from the UAT checklist (unsafe to deauth a working
  seat — same call as Set 078), not a scope cut.
- Outcome: **VERIFIED** after the full phased loop — discovery (6 findings) +
  supplementary (3 more) surfaced **7 distinct real defects** (pipeline
  register-before-push; `changes`-job fetch-ref + `persistCredentials`;
  hosted-parallelism prerequisite; three UAT-completeness gaps), all agreed and
  remediated; remediation-review cycle 1 rejected the Walk-9 fix (integration
  never taken to Complete), fixed, cycle 2 VERIFIED with **8/8 fixes accepted,
  zero findings**. Suites green (unit 1767, pytest 3030/6 skip, drift-guard
  25/25 after fix). Verification cost ~$0.92 (gpt-5-6, anthropic auto-excluded);
  routed authoring $0.18 + step-3.5 $0.009; total ~$1.13. Next-orchestrator
  (Session 2, routed): gpt/openai/gpt-5-6/high (cross-provider second opinion
  for the live UAT walk), runner-up claude/anthropic/claude-opus-4-8 —
  hard-blocked on operator preconditions (ADO org + Copilot seat + hosted
  parallel-jobs grant + ~half a day).
