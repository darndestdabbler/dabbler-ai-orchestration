# AI Assignment — 105-verify-evidence-excludes-bookkeeping

## Session 1 of 1 — Reclassify framework bookkeeping in the evidence bundle

- Orchestrator: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
- Routed step-3.5 analysis: `s1-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, tier 2, $0.0046,
  truncation-clean). Verdict: **implement directly** — a precise, spec-locked,
  mechanical change to a single internal tooling module (`verify_session.py`)
  plus deterministic test additions against a real-git fixture; AI code
  generation would only add variance. The mandatory **cross-provider
  `verify_session`** at Step 6 is the peer review (anthropic auto-excluded per
  the no-skip mandate).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT false` / `requiresE2E false` (router-internal library logic, no
  UI surface), `pathAwareCritique none` (single-module; the routed
  `verify_session` is the review). Do not re-litigate mid-session — a wrong flag
  is surfaced at Step 9.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec + the two root-cause anchors (`verify_session.py` `_collect_untracked_contents` / `EvidenceBundle`; `session_state.py` `read_status` / `ensure_session_state_file`). | Orchestrator direct — read-only reconnaissance. |
| 2 | Add `FRAMEWORK_BOOKKEEPING_FILES` + a third (bookkeeping) partition in `_collect_untracked_contents`; new `untracked_bookkeeping` field on `EvidenceBundle`; new "expected framework bookkeeping — not reviewed work" section in `as_response_under_review`. Leave the tracked diff and `build_diff_pathspecs` untouched. | Orchestrator direct — single-module, spec-locked library code (execution, not generation). |
| 3 | Add `TestFrameworkBookkeepingReclassification` (real-git fixture): sibling not-started state → bookkeeping (not inlined, not "review directly"); genuine deliverable still inlined; tracked state change still in diff; events/activity-log covered symmetrically; basename-at-any-depth. | Orchestrator direct — deterministic test authoring against the just-written code. |
| 4 | (Conditional) verification.md framing line — **settle via the self-witnessing Step-6 verify** (see sub-decision below). | Orchestrator direct — verbatim edit + Set 084 F3 pin test, only if warranted. |
| 5 | Full pytest suite green; run the drift guard; confirm no-`copilot` suite green. | Orchestrator direct — command execution. |
| Verify | Cross-provider phased `verify_session` for this set. | **Routed** — `session-verification`, orchestrator provider (anthropic) auto-excluded. |
| Close | `disposition.json`; commit + push; `close_session`; notify; Step 9; `change-log.md`. | Orchestrator direct — mechanics; Step 9 review is routed reasoning if changes are proposed. |

### Open sub-decision (verification.md framing line)

The routed cross-provider analyst (gemini-2.5-pro) **recommends adding** the
framing line ("the verification output is a core developer interface; a
single-line doc cost is justified"). The spec and `project-guidance.md`
(removal-over-addition; "prefer the smaller change") pull the other way. This
session is settled by its **own best regression witness**: the Step-6
`verify_session` on this set inlines *this set's own* untracked
`session-state.json` / `session-events.jsonl` / `activity-log.json`. If the
reclassified bookkeeping section alone stops the verifier flagging them, the
structural fix is proven sufficient and the template line is **not** added
(smaller change wins). The line is only added if the self-witnessing round
still shows the verifier confused about a `not-started` state file.

### Next-orchestrator recommendation

This is the **final (only)** session of the set — no in-set next orchestrator.
Routed next-set recommendation (gemini-2.5-pro, anthropic-excluded):
**operator-driven** — pick the next highest-impact item from the tooling
backlog or from framework-user feedback. No routed hard dependency is created
by this set (it complements Set 089's evidence-completeness fix on an
independent surface). A router version bump / PyPI publish for this fix is
**operator-gated** and recorded at release time, not here.

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-opus-4-8 / high (operator-invoked).
- Routing plan followed as recommended: fix + tests orchestrator-direct
  (spec-locked = execution); step-3.5 analysis routed ($0.0046,
  truncation-clean); session verification routed cross-provider.
- Sub-decision outcome: verification.md framing line NOT added — the structural
  reclassification alone proved sufficient (self-witnessing VERIFIED round did
  not flag its own bookkeeping files); smaller change wins.
- Deviations: none. Plan followed as recommended.
- Outcome: VERIFIED (cross-provider gpt-5-6, fan-out 2/2, 0 findings, $0.1557);
  suite 3060 passed / 6 skipped; both CI guards green. Router-side, publish
  operator-gated.
