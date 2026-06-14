# AI Assignment Ledger — Set 064 (Guidance Lifecycle & Pruning)

> Cheapest-capable-AI recommendation per step, authored via routed
> analysis (`route(task_type="analysis")`, gemini-2.5-pro, $0.0061) — not
> self-opined. Appended each session.

## Session 1 — Audit & design-lock (retrospective)

| Step | Recommended AI | Rationale |
| :--- | :--- | :--- |
| Measure overhead | Gemini 2.5 Pro (google) | Data collection / analysis across repos. |
| Read-path audit | GPT-5.4 (openai) | Code-path tracing / static analysis. |
| Write-path audit | GPT-5.4 (openai) | Focused analysis of a specific function's logic. |
| Design consult | Claude Opus 4.8 (anthropic) | Frontier reasoning for architectural locks. |
| Verification | Gemini 2.5 Pro (google) | Cross-check design doc against consult notes. |

_(Actual S1 run: orchestrated by Claude Opus 4.8; exploration fanned out
to Explore subagents; the design consult was cross-provider gpt-5.4 +
gemini-2.5-pro; verification was gpt-5.4 — all cross-provider per the
workflow.)_

## Session 2 — Steady-state mechanism (planned)

| Step | Recommended AI |
| :--- | :--- |
| D2: metadata parser/formatter/validator | GPT-5.4 (openai) |
| D3: `cite_lessons` + `disposition.lessons_cited` | GPT-5.4 (openai) |
| D1: `guidance_report` CLI + `guidance_search` | Gemini 2.5 Pro (google) |
| D4: create `lessons-archive.md` + edit 10 always-load sites | Gemini 2.5 Pro (google) |
| D5: archive triggers + over-ceiling advisory + policy text | GPT-5.4 (openai) |
| Unit tests (Python) | GPT-5.4 (openai) |
| TS suite green | Gemini 2.5 Pro (google) |
| Cross-provider verification | Gemini 2.5 Pro (google) |

## Next-session-2 orchestrator recommendation

- **engine:** Claude Code · **provider:** anthropic · **model:**
  claude-opus-4-8 · **effort:** high
- **reason.code:** `continue-current-trajectory`
- **reason.specifics:** Session 2 implements a complex, multi-file design
  with a new serialization contract; Opus is needed for coherent reasoning
  across new modules and the `close_session` integration.

## Session 3 — Backlog-remediation recipe + harvester dogfood (planned)

| Step | Recommended AI |
| :--- | :--- |
| D6: routed bulk-triage helper (classify keep/archive/promote/merge) | GPT-5.4 (openai) |
| D6: backlog-remediation recipe doc | Gemini 2.5 Pro (google) |
| Harvester read-only dogfood + projected size | GPT-5.4 (openai) |
| Unit tests (Python) on a fixture | GPT-5.4 (openai) |
| Cross-provider verification | GPT-5.4 (openai) — gemini verified S2, alternate provider |

## Next-session-3 orchestrator recommendation

> Produced via routed analysis (`route(task_type="analysis")`,
> gemini-pro, $0.0016) per the no-self-opine rule. The routed call
> recommended `claude-code` / `anthropic` / high effort ("SOTA model for
> the routed classification logic, documentation authoring, and
> large-context analysis"); its returned model id was a stale token and
> is normalized to the current frontier `claude-opus-4-8`. Because S3
> stays on the same engine/provider/model as S2, the reason code is
> `continue-current-trajectory` (the routed call's `other` is not a valid
> code in `NEXT_ORCHESTRATOR_REASON_CODES`).

- **engine:** Claude Code · **provider:** anthropic · **model:**
  claude-opus-4-8 · **effort:** high
- **reason.code:** `continue-current-trajectory`
- **reason.specifics:** S3 ships a routed bulk-triage classifier, a portable
  recipe doc, and a large-context read-only dogfood over a 154 KB file;
  frontier reasoning keeps the classifier evidence and the projection
  coherent.
