# AI Assignment Ledger — Set 092

Per-session record of the cheapest-capable AI for each step, plus the
next-session recommendation. Next-orchestrator choices are produced via
routed analysis (`route(task_type="analysis")`), never self-opined. The
Session 1 recommendation is saved raw at `s1-assignment-analysis.json`.

## Session 1 of 2 — The renderer switch (one dialect, Work Explorer, atomic pins)

Recommended orchestrator: **github-copilot / openai / gpt-5.4 / high effort**.

Rationale (routed): this is a broad, atomic refactor across TypeScript host
logic, JavaScript rendering, Playwright tests, fixtures, and documentation.
The OpenAI coding-class seat is the cheapest capable option for keeping those
surfaces consistent in one change.

Estimated routed cost: **high**.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Read the settled verdict, compat matrix, prior architecture record, and current host/webview path. | Orchestrator direct — read-only reconnaissance over named anchors. |
| 2 | Switch the host snapshot to `computeVisibleModules` and adapt visible modules to the existing bucket/row payload. | Orchestrator direct — deterministic implementation downstream of settled design. |
| 3 | Delete the legacy flat client branch; render module → bucket → row for every state, including muted auto-expanded `Default`. | Orchestrator direct — one-dialect behavior is operator-confirmed. |
| 4 | Add fallback warning and duplicate-name affordances, including notification throttling. | Orchestrator direct, with focused tests as the behavioral oracle. |
| 5 | Rename the contributed display label to Work Explorer and sweep user-facing strings. | Orchestrator direct — mechanical consistency update. |
| 6 | Update protocol markers, Layer 2 fixtures, Playwright pins, docs, and screenshots atomically. | Orchestrator direct — contract-driven test and documentation updates. |
| 7 | Build and run unit, full, Layer 3, and locally built VSIX UAT gates. | Orchestrator direct — executable validation. |
| 8 | Perform mandatory cross-provider session verification. | Routed — session verification, excluding the OpenAI orchestrator provider. |
| 9 | Recommend Session 2 orchestration. | Routed — analysis, saved raw in `s1-assignment-analysis.json`. |

### Actuals (filled after the session)

- Orchestrator used: github-copilot / openai / gpt-5.4 / high effort
- Total routed cost: assignment analysis $0.0022; final verification $0.0363; other routed design calls remain auditable in `ai_router/router-metrics.jsonl`.
- Deviations from recommendation: implementation stayed direct as planned; verification fell back from Anthropic to Google after two HTTP 400 failures.
- Notes for next-session calibration: use the routed `claude-code / anthropic / claude-opus-4-8 / medium` recommendation for the cross-component diagnostics and last-known-good state work.

## Next-session recommendation (routed analysis, made in Session 1)

For **Session 2 of 2 (diagnostics strip + modules.yaml render guardrails)**,
the routed analysis recommends **claude / anthropic / Opus-class / medium
effort**. Rationale: the diagnostics and last-known-good guardrails introduce
new cross-component state and fault semantics that benefit from an
architecture-strong reasoning seat.

## Session 2 of 2 — Diagnostics strip + modules.yaml render guardrails

Recommended orchestrator: **claude-code / anthropic / Opus-class / medium effort**.
The raw routed analysis is saved in `s2-assignment-analysis.json`.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register Session 2 and inspect the host, protocol, webview, manifest classifier, and settled verdict. | GitHub Copilot direct — bounded reconnaissance over named ownership points. |
| 2 | Define diagnostics ownership and last-known-good behavior. | Routed analysis, then direct implementation against the settled spec. |
| 3 | Add the persistent fault-only System Status strip and remove duplicated form renderings. | Direct implementation with a pure HTML-builder contract. |
| 4 | Retain per-root last-known-good module trees while a present manifest is invalid. | Direct implementation with a pure selection-rule falsifier. |
| 5 | Add watcher, Layer 2, and real-webview edit → invalidate → repair coverage. | Direct deterministic tests. |
| 6 | Finish full gates, verification, UAT, critique, close-out, and Set 093 recommendation. | Claude continuation; routed verification/analysis where required. |

### Mid-session transition checkpoint

- Started by: github-copilot / openai / gpt-5.4 / high effort.
- Resume with: claude-code / anthropic / Opus-class / medium effort, per the routed recommendation and operator budget direction.
- Implemented: typed `systemStatus` payload; fault-only strip above form/tree; provider/Python/Copilot/workspace-init relocation; invalid-manifest banner; per-root last-known-good retention; `docs/modules.yaml` watcher; focused Layer 2 and Playwright recovery tests.
- Validation at handoff: extension compile + `tsc --noEmit` passed; 1,405 Layer 2 tests passed; all 22 Playwright Electron tests passed.
- Remaining: inspect/remove dead form-warning helper exports if worthwhile; run repository-wide gates; author UAT/checklist as armed; mandatory cross-provider verification; advisory path-aware critique; `change-log.md`, disposition, commit/push, close, notification, and Step 9 review.
- Resumed by: claude-code / anthropic / claude-fable-5 / medium effort (Fable-class supersedes the Opus-class wording; same Anthropic architecture-strong seat) via idempotent `start_session` re-attach.

### Actuals (filled after the session)

- Orchestrators used: github-copilot / openai / gpt-5.4 / high (implementation through the mid-session checkpoint), then claude-code / anthropic / claude-fable-5 / medium (cleanup, gates, armed UAT, verification, critique, close).
- Total routed cost: design/assignment analysis $0.0152; Set 093 recommendation analysis $0.0022; verification rounds $0.1337 + $0.1713; the advisory pull-critique's two provider loops bill through the pull-verifier path (not router-metrics). All calls auditable in `ai_router/router-metrics.jsonl`.
- Deviations from recommendation: none in substance — the recommended Opus-class Anthropic seat resolved to the Fable-class model actually available on the engine; the same seat closed the session.
- Notes for next-session calibration: the mid-session handoff cost nothing in rework (the checkpoint block in this file was sufficient context); verification R1 caught a real first-paint ordering bug the pure-renderer tests could not see — keep source-ordering pins in scope for webview wiring changes.

## Next-set recommendation (routed analysis, made in Session 2)

For **Set 093 Session 1 (persistent `Plan` / `Session sets` child nodes)**,
the routed analysis recommends **claude-code / anthropic / Fable-class /
medium effort**. Rationale (routed, gemini-pro): the dominant risks are
WAI-ARIA keyboard-semantics regressions across the tree-level shift and
fixture/pin drift across three test layers — cross-cutting semantic and
architectural concerns this seat handled well in the Set 092 S2
continuation. Estimated relative routed cost: **low**. The raw routed
analysis is saved in `s2-next-set-analysis.json`.