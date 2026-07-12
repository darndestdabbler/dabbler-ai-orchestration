# AI Assignment Ledger — Set 095

Per-session record of the cheapest-capable AI for each step, plus the
next-set recommendation. Next-orchestrator choices are produced via routed
analysis (`route(task_type="analysis")`), never self-opined. This session's
own orchestrator recommendation came from Set 094's routed next-set
analysis (`../094-getting-started-shrink-and-manifest-lifecycle/s2-next-set-analysis.json`).

## Session 1 of 1 — Walkthrough, AI feedback prompt, dogfood & set close

Orchestrator: **claude-code / anthropic / claude-fable-5 / operator-invoked**.

The Set 094 routed recommendation for this set was
**claude-code / anthropic / claude-sonnet-5 / medium effort** (docs- and
UAT-authoring-heavy, negligible architectural novelty). The operator invoked
this session on **Fable-5** — the recommendation is advisory and the
operator's invocation stands (recorded as a deviation, same as 094 S2's
Opus-vs-Fable note). Calibration carried in from 094 S2: the dominant risk
here is **doc↔behavior fidelity** (L-064-8) — every tutorial claim about the
shipped UX must be re-checked against the code, and a
doc-claim-vs-code re-check pass is budgeted before verification.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec, verdict, recommendation + primer, Sets 091–094 change-logs; recon the exact UI surface (form labels, palette commands, row actions, D6 prompt, templates). | Orchestrator direct — read-only reconnaissance over named anchors. |
| 2 | Author `docs/tutorials/module-team-hello-world.md` (three-person Hello World on the new UX). | **Routed — documentation** (large reasoned prose deliverable; the orchestrator supplies the code-verified UI facts in the brief and owns the fidelity re-check of the draft against the code). |
| 3 | Author `docs/tutorials/module-team-hello-world-review-prompt.md` (reusable per-principle AI feedback prompt). | **Routed — documentation** (same discipline). |
| 4 | Dogfood: scratch repo with a planted violation; run the review prompt via `route(task_type="analysis")`; confirm cited, actionable coaching. | Mechanics orchestrator-direct; the review itself **routed — analysis** (that *is* the deliverable being dogfooded). |
| 5 | Link both tutorials from onboarding surfaces (Getting Started / quick-start / consumer-bootstrap docs). | Orchestrator direct — mechanical link edits; any stale-claim fixes verified against code (L-064-8). |
| 6 | Build + full suite (docs/link checks + touched extension tests). | Orchestrator direct — executable validation. |
| 7 | Mandatory cross-provider session verification. | Routed — session verification, excluding the Anthropic orchestrator provider. |
| 8 | Recommend the next set's orchestration. | Routed — analysis, saved raw at `s1-next-set-analysis.json`. |

### Actuals (filled at close)

- Orchestrator used: claude-code / anthropic / claude-fable-5 (operator-invoked).
- Routed calls (final, from `router-metrics.jsonl`): 18 session-verification
  rounds (gpt-5-6, $4.88 — 1 round void by empty evidence) and 13 other
  routed calls ($0.37: two documentation drafts incl. the router's
  auto-verify, eight dogfood analysis runs, the next-set analysis).
  Session routed total ≈ $5.25.
- Verification loop story (the set's most instructive output): suspended
  after R5 per the severity-gated stop rule → operator directed
  continuation while findings stayed genuinely Major → R6-R17 kept
  yielding 1-2 real-but-narrowing Majors per round (39 total, all fixed,
  none disputed) → the operator set a consequence-based severity rubric
  + a 21-round cap at R17 → R18, the first rubric-graded round, returned
  **VERIFIED zero findings**. Full ledger: `s1-cross-round-ledger.md`.
- Deviations from recommendation: orchestrator model (Fable-5 vs the routed
  Sonnet-5/medium) — operator's invocation; recorded above.
- Notes for next-set calibration: the 094 doc↔behavior-fidelity warning was
  the right call — the router's auto-verify caught 2 Majors on the routed
  walkthrough draft, and the orchestrator's code-vs-doc pass caught several
  more the auto-verify missed (file-picker vs AI-prompt semantics; GitHub
  CODEOWNERS-vs-author behavior; protected-main contradictions). Budget the
  same two-layer pass (routed draft + orchestrator fidelity re-check against
  source) for any doc-heavy set.

## Next session set — routed recommendation

Ranked (routed analysis, saved raw at `s1-next-set-analysis.json`):

1. **The Set 077 UAT-checklist redo set** — closes 077's open release gates
   (process debt gating all subsequent releases; matches the operator's
   standing note).
2. Publish `dabbler-ai-router` 0.32.0 (operator-gated quick win — ships the
   Set 089 verify_session excludes fix).
3. The module locator/scope-check set (re-attach point reached).
4. The physical-moves set (optional; lowest priority — may never be needed).

Recommended orchestrator for the 077 redo set:
**claude-code / anthropic / claude-sonnet-5 / low effort** (process +
structured-documentation work; cheapest-capable; leaves gpt-5-x /
gemini-3-pro for the verification pool).
