# AI Assignment — 063-getting-started-budget-and-bootstrap-retirement

> Authored per `docs/ai-led-session-workflow.md` Step 3.5 on Session 1
> (2026-06-12). Recommendation routed through
> `route(task_type="analysis")` → gemini-pro ($0.0144); the orchestrator
> never self-opines. Routing-decision task types in the tables below are
> the recommender's labels — map to canonical router task types at
> execution time (`analysis`, `code-review`, `architecture`,
> `session-verification`).

## Session 1: Audit & design-lock

### Recommended orchestrator
Gemini Code Assist `google, gemini-2.5-pro` @ effort=`high`

### Rationale
This session is pure audit and reasoning, requiring a deep understanding of cross-language contracts (TS, Python, YAML) without writing shipping code. Gemini excels at this high-level code analysis and synthesis needed to produce the lock-in decisions.

### Estimated routed cost
moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Inventory every surface that references the adoption-bootstrap path. | `route(task_type="code_analysis", model="gemini-pro")` |
| 2 | Audit the `budget.yaml` contract across all readers/writers. | `route(task_type="code_analysis_deep_dive", model="opus")` |
| 3 | Lock D1-D4 design intents based on audit findings. | `route(task_type="design_spec", model="opus")` |
| 4 | Cross-provider verification of the audit record. | `route(task_type="review", model="sonnet")` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code `anthropic, claude-fable-5` @ effort=`high`
- Total routed cost: $0.4984 (analysis $0.0144 + architecture $0.3488 gpt-5-4 + $0.0088 gemini-pro + session-verification $0.0911 R1 + $0.0352 R2)
- Deviations from recommendation: orchestrator was Claude Code, not the recommended Gemini Code Assist (operator's choice). Steps 1–2 ran as direct empirical audit (Grep/Read at file:line) rather than routed `code_analysis` — the evidence-gathering was file mechanics, not routable reasoning; step 3's contested locks went to a routed two-provider consult (gpt-5-4 + gemini-pro, `architecture`) instead of a single opus `design_spec`.
- Notes for next-session calibration: the gpt-5-4 architecture consult returned 23,020 output tokens ($0.3488 — 70% of session spend); cap consult output (max_tokens / tighter prompt) when the question set is three items.

---

## Session 2: Implement — budget step in, bootstrap path out

### Recommended orchestrator
Claude Code `anthropic, claude-fable-5` @ effort=`high`

### Rationale
This session is focused on TypeScript implementation: adding a new UI component, modifying webview state logic, and surgically removing legacy code paths. Claude Code's strength in generating and refactoring cohesive blocks of application code makes it the best fit.

### Estimated routed cost
high

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Implement the budget step in the Getting Started form (TS, JS, CSS). | `orchestrator-direct` |
| 2 | Retire the bootstrap surfaces per the D2 inventory list. | `orchestrator-direct` |
| 3 | Author and update unit tests for the budget writer and form state. | `orchestrator-direct` |
| 4 | Run full local test suites (TS, Python, Playwright). | `N/A (local execution)` |
| 5 | Cross-provider verification of the implementation against the locks. | `route(task_type="code_review", model="sonnet")` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code `anthropic, claude-fable-5` @ effort=`high` (as recommended)
- Total routed cost: $0.3004 (session-verification gpt-5-4: R1 $0.2213 + narrow R2 $0.0790)
- Deviations from recommendation: step 5 ran as the canonical `session-verification` task type (the recommender's `code_review` label), routed by the router to gpt-5-4 rather than the suggested sonnet; steps 1–4 orchestrator-direct/local as recommended.
- Notes for next-session calibration: R1 caught a real host-boundary fail-open (webview-side validation alone is not enforcement — untrusted riders must fail closed). Budget the verification at two rounds when a session adds a new webview→host channel.

---

## Session 3: Docs sweep, UAT, release 0.32.0

### Recommended orchestrator
Codex CLI `openai, gpt-5.4` @ effort=`normal`

### Rationale
This session involves structured text generation (docs, UAT checklist, CHANGELOG) and mechanical version bumps, which are core strengths of Codex CLI. Its precision with file modifications and formatted output is ideal for release mechanics.

### Estimated routed cost
moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Execute the documentation sweep per the D3 disposition lock. | `orchestrator-direct` |
| 2 | Author the `...-uat-checklist.json` file. | `orchestrator-direct` |
| 3 | Bump versions to 0.32.0 and author the CHANGELOG entry. | `orchestrator-direct` |
| 4 | Cross-provider verification of release artifacts and docs. | `route(task_type="review", model="sonnet")` |
| 5 | Tag and push the release. | `N/A (operator action)` |

### Actuals (filled after the session)
- Orchestrator used: (TBD)
- Total routed cost: (TBD)
- Deviations from recommendation: (TBD)
- Notes for next-session calibration: (TBD)
