# Session Set: Docs Collapse + Fresh Close-Out Turn + Cross-Provider Alignment Audit (with Failure-Injection)

## Summary

Final set. After this:
- Step 8 of `ai-led-session-workflow.md` is collapsed; the detail lives in `ai-router/docs/close-out.md` and is surfaced as `close_session --help`
- A new doc `ai-router/docs/two-cli-workflow.md` covers setup, restart, troubleshooting for outsource-last
- The orchestrator routes a fresh close-out turn (mode-aware: API in outsource-first, orchestrator self-invoke in outsource-last)
- A dedicated alignment-verification session produces a written audit AND **executable failure-injection traces**, **cross-provider verified by both Gemini Pro and GPT-5.4**, confirming the implementation matches the post-review combined design

Per GPT-5.4 review: the audit is not just text — it includes executable failure-injection scenarios from Set 2 that demonstrate recovery works under realistic failure modes.

---

## Why this set is last

Doc changes and fresh-turn routing are the most visible parts of the redesign but the lowest-risk and most reversible. They go last because:
1. The new machinery (queue, gate, reconciler, role-loops, enforcement) needs to be shipped and exercised before docs commit to the new flow.
2. The fresh-turn routing is an *optimization* on top of the deterministic foundation — if the foundation has bugs, fresh-turn just amplifies them.
3. The alignment audit (Session 3) needs Sets 1–5 plus this set's earlier sessions in place to audit against. It's the natural last-step gate.

---

## Scope

### In scope
- Move Step 8 content out of `docs/ai-led-session-workflow.md`
- Land `ai-router/docs/close-out.md` as canonical close-out doc, surfaced by `close_session --help`
- Land `ai-router/docs/two-cli-workflow.md` covering outsource-last setup, restart, troubleshooting (per Gemini Pro: not just one sentence)
- Update consumer agent files (CLAUDE.md, AGENTS.md, GEMINI.md) to point at the new flow
- Wire orchestrator to route fresh close-out turn (mode-aware)
- Cross-provider alignment audit producing verdict from Gemini Pro AND GPT-5.4
- **Executable failure-injection traces** as part of the audit deliverable

### Out of scope
- Removing the `--force` flag introduced in Set 4 — separate follow-up
- Re-enabling hybrid mode (`tiebreakerFallback: api`) — deferred until outsource-last has soak time
- Any further enforcement tightening — these are follow-ups based on what the alignment audit surfaces

---

## Sessions

### Session 1: Docs collapse + close-out doc + two-CLI workflow doc

**Goal:** Move close-out detail out of the main workflow doc; create the operational guide for outsource-last.

**Deliverables:**

**`ai-router/docs/close-out.md`** (new, ~300–400 lines):
- Section 1: When close-out runs (after work verification terminates)
- Section 2: How to run close-out (`python -m ai_router.close_session`)
- Section 3: What the script does (gate checks, idempotent writes, event log, mode-specific verification handling)
- Section 4: Common failures and remediation (uncommitted files, push rejected, missing nextOrchestrator, queue verification timeout, etc.)
- Section 5: Manual close-out — when to use `--interactive`, `--force`, `--manual-verify`, `--repair`
- Section 6: Troubleshooting (stranded sessions, lock contention, reconciler behavior, queue-state debugging)

**`ai-router/docs/two-cli-workflow.md`** (new, ~200–300 lines):
- Section 1: When to use outsource-last (subscription users, fixed-cost preference)
- Section 2: Initial setup (start verifier daemon, start orchestrator daemon, configure session set)
- Section 3: Day-to-day operation (typing trigger phrases, what the daemons are doing in the background)
- Section 4: When the verifier daemon dies (restart command, recovery)
- Section 5: When the orchestrator's primary CLI session resets context (restart and reattach)
- Section 6: Subscription-window fatigue (what the heartbeat data tells you, and what it doesn't)
- Section 7: Troubleshooting common pitfalls (auth expiry, interactive prompts in daemon CLIs, cross-platform quirks)

**`docs/ai-led-session-workflow.md`** modifications:
- Step 8 collapses from ~140 lines to one paragraph: *"When session work is verified complete, run `python -m ai_router.close_session`. The script handles cost report, activity-log entry, commit/push, mark-complete, and notification. See `ai-router/docs/close-out.md` for details. For outsource-last sessions, see also `ai-router/docs/two-cli-workflow.md` for daemon setup and recovery."*
- Step 6 (verification) gets a brief addition noting mode-aware verification routing
- Header / preamble notes the new mode-aware operating model

**Update CLAUDE.md, AGENTS.md, GEMINI.md** at repo root:
- Add Close-out pointer
- Add Two-CLI workflow pointer for outsource-last awareness

**Update `close_session.py --help`** to surface the close-out doc's section 2 verbatim (single source of truth)

**Acceptance:**
- A fresh agent reading `docs/ai-led-session-workflow.md` end-to-end can find close-out without reading 1,000 lines of workflow detail
- `ai-router/docs/close-out.md` is comprehensive and self-contained
- `ai-router/docs/two-cli-workflow.md` is learnable for first-time outsource-last users
- `close_session --help` surfaces the same content the doc shows

### Session 2: Fresh close-out turn (mode-aware) + reconciler hook

**Goal:** Wire the orchestration layer to spawn a fresh close-out turn after work verification terminates. Mode-aware: API call in outsource-first, orchestrator self-invokes close-out as part of its loop in outsource-last.

**Deliverables:**
- New task type `session-close-out` in `ai-router/router-config.yaml`:
  - Outsource-first: routes to sonnet/haiku tier at low effort
  - Outsource-last: handled inline by the work-doing orchestrator (no separate API call)
- Orchestrator wrapper hook (or new function in `ai_router`):
  - After work-agent's turn produces `disposition.json` with `status: "completed"` AND verification has terminated:
    - **Outsource-first**: route a new turn with `task_type="session-close-out"`; agent reads `ai-router/docs/close-out.md`, runs `python -m ai_router.close_session`
    - **Outsource-last**: orchestrator's existing CLI session runs `python -m ai_router.close_session` directly (no fresh turn — the orchestrator already has the queue context)
- Reconciler from Set 3 also runs at orchestrator startup (`register_sweeper_hook()`) — confirm wiring is in place
- End-to-end tests:
  - Outsource-first: simulate work-agent producing disposition.json; orchestrator routes close-out turn; close_session runs; session closes
  - Outsource-last: same but orchestrator self-invokes close-out; session closes via the queue path
  - Failure path: close-out turn fails; reconciler picks up next sweep
- Update `ai-led-session-workflow.md` Step 6 to reference orchestrator-driven close-out routing

**Acceptance:**
- Complete session workflow runs end-to-end in BOTH modes with proper close-out routing
- Cost increase per session in outsource-first measured against baseline (expected: +5–10%)
- Outsource-last has NO additional API cost from the fresh-turn pattern (since it self-invokes)
- Failure of close-out turn or self-invocation does not strand the session — reconciler recovers it

### Session 3: Cross-provider alignment audit + executable failure-injection (verified by Gemini Pro AND GPT-5.4)

**Goal:** Produce a written audit confirming the implementation matches the combined design. Run the failure-injection scenarios from Set 2 Session 4. Route both the audit document and the failure-injection traces to **both** providers for independent verification.

**Deliverables:**

**`docs/proposals/2026-04-30-combined-design-alignment-audit.md`** (new):
- Section 1: For each major component of the combined design (queue contract, role-loops, mode-aware route/verify, close-out script, gate checks, reconciler, dual-sourced cost report, capacity heartbeat, VS Code views, doc collapse): cite the file(s) and function(s) where it's implemented; note any drift from the design
- Section 2: For each "Failure modes flagged" item from BOTH proposal-review rounds (close-out reliability + outsource-last) AND the v2 plan synthesis: explain how the implementation addresses it (or, if it doesn't, why and what follow-up is needed)
- Section 3: For each "open question" from the v2 plan: state the resolved answer and its location
- Section 4: Failure-injection trace summaries — re-run the 6 scenarios from Set 2 Session 4; capture pass/fail and runtime; embed the trace output in the audit (or link to a committed `tests/failure-injection-traces/<date>/` artifact)
- Section 5: List of follow-up issues to file (e.g., removing `--force` flag, re-enabling hybrid mode if demand emerges, additional semantic validators)

**Cross-provider review:**
- New review prompt at `C:/temp/dabbler-combined-alignment-prompt.md`
- Reuses the `route_review.py` pattern with the new prompt + the audit doc + failure-injection traces as context
- Routes to **both providers in parallel**:
  - `python C:/temp/route_combined_alignment.py gemini-pro C:/temp/review-combined-alignment-gemini-pro.md`
  - `python C:/temp/route_combined_alignment.py gpt-5-4 C:/temp/review-combined-alignment-gpt-5-4.md`
- Append both reviews verbatim as Appendix A and B of the audit
- Update audit's executive summary with post-review synthesis (alignment confirmed, drift items, follow-ups)
- Cost expectation: ~$0.15–$0.20 (bigger than prior reviews due to including failure-injection traces in context)

**Acceptance:**
- Audit document is complete and committed
- All 6 failure-injection scenarios re-run at audit time; results captured
- Both Gemini Pro AND GPT-5.4 reviews appended verbatim
- Both reviewers' verdicts reflected in executive summary
- Drift identified is converted into specific follow-up issues with concrete next actions
- **If both reviewers say "fully aligned"**: the combined design (close-out reliability + outsource-last) is marked **complete** in the existing proposal and the new audit. Open `docs/proposals/2026-04-29-session-close-out-reliability.md` and `docs/proposals/2026-04-30-combined-design-alignment-audit.md` and add the completion stamp.
- **If either reviewer flags drift**: section 5 of audit enumerates follow-up work; create new session-set spec.md(s) for the corrective work

---

## Acceptance criteria for the set

- [ ] All three sessions complete
- [ ] Workflow doc Step 8 is one paragraph; close-out doc and two-CLI workflow doc are comprehensive
- [ ] Mode-aware fresh close-out turn works end-to-end in BOTH modes
- [ ] Reconciler hook runs at orchestrator startup
- [ ] Alignment audit reviewed by **both** Gemini Pro AND GPT-5.4
- [ ] All 6 failure-injection scenarios pass at audit time
- [ ] Either: both reviewers confirm full alignment AND combined design is marked complete; OR: drift items are documented as follow-up issues with concrete next actions

---

## Risks

- **Doc collapse may break agent compliance for orchestrators that pre-load only the workflow doc.** GPT-5.4 specifically flagged this for the original close-out proposal. Mitigation: orchestrator prompt for the fresh close-out turn explicitly references `ai-router/docs/close-out.md`, so the agent encounters the close-out instructions at the moment they're needed.
- **The fresh close-out turn doubles per-session API surface area in outsource-first.** New failure mode: provider outage during the close-out turn. Mitigation: reconciler retries on next session start.
- **Alignment audit may surface significant drift.** Acceptable — that's the point. Drift items become follow-up issues; they don't fail this set unless drift is so severe that reviewers say "the implementation does not address the proposal's intent." In that case, file a corrective set before declaring complete.
- **Failure-injection traces in the audit consume reviewer context.** Trace volume should be bounded — prefer summary tables over raw multi-MB logs.
- **Two-CLI workflow doc may not anticipate all subscription-CLI quirks.** First-time outsource-last users will surface new pitfalls. Document discovered issues as audit-section-5 follow-ups.

---

## References

- Sets 1–5 of this combined design
- Original close-out reliability proposal: `docs/proposals/2026-04-29-session-close-out-reliability.md`
- Plan v2 synthesis (post-cross-provider review of outsource-last): `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`
- Cross-provider review pattern: `C:/temp/dabbler-closeout-review-prompt.md`, `C:/temp/route_closeout_review.py`, `C:/temp/dabbler-outsource-last-review-prompt.md`, `C:/temp/route_outsource_last_review.py`
- Failure-injection tests defined in: Set 2 Session 4 (`002-role-loops-and-handoff`)

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```
