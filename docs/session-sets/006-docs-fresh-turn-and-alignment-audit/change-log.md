# Set 006 — Docs Collapse + Fresh Close-Out Turn + Cross-Provider Alignment Audit (Change Log)

**Status:** complete · 3 of 3 sessions verified
**Started:** 2026-04-30 · **Completed:** 2026-05-01
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — all sessions
**Verifier:** gemini-pro (Google) — all sessions
**Cross-provider audit reviewers (Session 3):** gemini-pro AND gpt-5-4

This set is the final set of the combined close-out reliability +
outsource-last design (Sets 001–006). Sessions 1 and 2 land the last
implementation pieces (doc collapse, two-CLI workflow doc, fresh
close-out turn hook, reconciler exports). Session 3 produces the
cross-provider alignment audit that judges whether Sets 001–006
together match the post-review combined design.

**Audit outcome:** the combined design is **NOT** marked complete by
this set. Both reviewers surfaced drift the self-audit overstated as
"no material drift." Three drift items (D-1, D-2, D-3) are classified
as corrective work that must land before completion; three (D-4, F-1,
F-2) are follow-up backlog. Corrective work is spec'd at
`docs/session-sets/009-alignment-audit-followups/spec.md` and gates
the eventual completion stamp.

## Summary of changes

### Session 1 — Docs collapse + close-out doc + two-CLI workflow doc

- **New `ai-router/docs/close-out.md`** (~400 lines): canonical
  operational reference for `python -m ai_router.close_session`. Six
  sections covering when close-out runs, how to invoke it, what it
  does (gate checks, idempotent writes, mode-specific verification
  handling), common failures and remediation, the manual-flag matrix
  (`--interactive`, `--force`, `--manual-verify`, `--repair`), and
  troubleshooting (stranded sessions, lock contention, reconciler
  behavior, queue-state debugging).
- **New `ai-router/docs/two-cli-workflow.md`** (~300 lines): operating
  guide for `outsourceMode: last` covering when to use it, initial
  setup (verifier daemon + orchestrator daemon + spec config),
  day-to-day operation, verifier-daemon recovery, orchestrator CLI
  context-reset recovery, subscription-window fatigue diagnostics from
  heartbeat data, and common pitfalls (auth expiry, interactive
  prompts in daemon CLIs, cross-platform quirks). Per the cross-
  provider review of the v1 plan, this is a real operational guide,
  not a one-liner.
- **`docs/ai-led-session-workflow.md` Step 8 collapsed** from ~140
  lines to one paragraph that points at `ai-router/docs/close-out.md`
  and `ai-router/docs/two-cli-workflow.md`. Header preamble updated
  to note the new mode-aware operating model.
- **`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`** at the repo root: added
  Close-out and Two-CLI workflow pointers so consumer-repo agents
  encounter the new flow.
- **`close_session.py --help`** wired to surface Section 2 of
  `close-out.md` verbatim (single source of truth — the doc is
  canonical, the help text echoes it).

### Session 2 — Fresh close-out turn hook + reconciler exports

- **`ai-router/router-config.yaml`** — new `session-close-out` task
  type. `task_type_overrides` routes it to `sonnet` per spec
  (outsource-first routes to sonnet/haiku tier at low effort);
  `task_type_params` sets `effort=low` and thinking-off across
  `sonnet`/`gemini-pro`/`gpt-5-4-mini`; `complexity.task_type_scores`
  entry of 15 (mechanical: read doc + run CLI);
  `delegation.always_route_task_types` entry. Auto-verification
  deliberately not enabled — close-out either passes the gate or
  surfaces the gate's structured failure as the verdict.
- **New `ai-router/close_out.py`**: `route_fresh_close_out_turn()`
  is the mode-aware orchestrator hook fired after work verification
  terminates with `disposition.json status="completed"`.
  - **Outsource-first**: routes a fresh turn via `route()` with
    `task_type="session-close-out"` and a prompt that points the
    routed agent at `ai-router/docs/close-out.md` and tells it to
    invoke `python -m ai_router.close_session`. Sidesteps the GPT-5.4-
    flagged risk that doc collapse lowers compliance, because the
    agent encounters the close-out instructions at the moment they're
    needed.
  - **Outsource-last**: invokes `close_session.run` in-process via
    the injected `close_session_runner` (no fresh API turn — the
    orchestrator's primary CLI session already has the queue context).
  - Hook never raises. Failures populate `FreshCloseOutResult.error`
    and the next orchestrator startup's reconciler sweep recovers the
    session.
  - CLI for manual debugging:
    `python -m ai_router.close_out --session-set-dir ...`.
- **`ai-router/__init__.py`** — public exports: `route_fresh_close_out_turn`,
  `FreshCloseOutResult`, `SESSION_CLOSE_OUT_TASK_TYPE`,
  `CLOSE_OUT_RESULTS` from `close_out`; `register_sweeper_hook`,
  `reconcile_sessions`, `ReconcileSummary`, `ReconcileEntry`,
  `RECONCILER_DEFAULT_QUIET_WINDOW_MINUTES` from `reconciler`. The
  reconciler symbols already existed in Set 3 Session 3; this set
  surfaces them at the package level so orchestrator-startup wiring
  has a clean import surface.
- **`docs/ai-led-session-workflow.md` Step 6** updated to describe
  the orchestrator-driven close-out hook in both modes — fires when
  verification terminates with VERIFIED + `disposition.json
  status=completed`, mode-first routes a new turn so the agent reads
  `close-out.md` at the moment needed, mode-last self-invokes
  `close_session` in-process with no fresh API turn, hook failures
  are non-fatal because the reconciler sweeps stranded sessions.
- **Tests:** new `ai-router/tests/test_close_out.py` (11 unit tests:
  outsource-first routing assertions, outsource-last runner
  invocation, pre-flight skips, CLI smoke tests) and
  `ai-router/tests/test_close_out_e2e.py` (4 end-to-end tests:
  outsource-first close-out via routed turn with real
  `close_session.run` wrapped in fake `route_fn`, outsource-last
  close-out via in-process runner, failure-then-reconciler-recovery,
  cost-control regression that asserts outsource-last must never
  invoke `route_fn`). Full ai-router suite at session end:
  **606/606 passing** (15 new).

### Session 3 — Cross-provider alignment audit + executable failure-injection

- **Re-ran the 6 failure-injection scenarios** from Set 2 Session 4
  (`ai-router/tests/test_failure_injection.py`): lease expiration,
  heartbeat timeout escalation, truncated SQLite WAL recovery, CLI
  session reset, concurrent claim contention, mode-switch route-time
  validation. All 6 + the in-process smoke test passed in 6.42s.
  Trace artifact at
  `tests/failure-injection-traces/2026-05-01/trace.txt`. Full ai-
  router suite at audit time: **606/606 passing** in 51.29s.
- **New `docs/proposals/2026-04-30-combined-design-alignment-audit.md`**
  (~470 lines):
  - Section 1: per-component implementation evidence (12 components
    from queue contract through `router-config.yaml` task-type wiring)
  - Section 2: failure-mode mappings (10 modes from the original
    cross-provider review and v2 plan synthesis)
  - Section 3: open-question resolutions (9 questions)
  - Section 4: failure-injection trace summary table
  - Section 5: drift items, follow-ups, post-review synthesis
  - Section 6: Gemini Pro review verbatim
  - Section 7: GPT-5.4 review verbatim
- **Cross-provider review** routed to **both** providers in parallel
  via `C:/temp/route_combined_alignment.py` and
  `C:/temp/dabbler-combined-alignment-prompt.md`:
  - Gemini Pro: **ALIGNED WITH MINOR DRIFT** ($0.0147)
  - GPT-5.4: **MATERIAL DRIFT** ($0.1393)
  - **Total: $0.1540** (within $0.15–$0.20 spec expectation)
- **Audit corrections** applied based on reviewer feedback:
  - Section 1.4 corrected: `close_session.py` does NOT own commit /
    push / notification (drift D-3)
  - Section 2.4 corrected: close-out lock serializes per session set,
    does not enforce single-session ownership of `(repo, branch)` at
    admission (drift D-1)
  - Section 2.9 reframed: heartbeat is observability-only, not
    recovery
  - Section 2.1 / 2.2 reworded: reconciler recovery contingent on
    next orchestrator activity, not unconditional
  - Section 3 row 7 corrected: lock answer is partial, not fully
    resolved
- **Drift items enumerated** (audit §5.2):
  - D-1 [CORRECTIVE] — `(repo, branch)` parallel-session exclusion
    incomplete
  - D-2 [CORRECTIVE] — `--force` flag on a deterministic gate
  - D-3 [CORRECTIVE] — `close_session.py` does not own commit / push
    / notification
  - D-4 [FOLLOW-UP] — failure-injection trace narrower than §2
    claims
  - F-1 [FOLLOW-UP] — failure-injection scenario for close-out
    trigger failure
  - F-2 [FOLLOW-UP] — automated alerting on stale provider heartbeats
- **New `docs/session-sets/009-alignment-audit-followups/spec.md`**
  (5 sessions): S1 D-3 commit/push/notification ownership, S2 D-1
  `(repo, branch)` parallel-session lock, S3 D-2 `--force` flag
  resolution, S4 F-1/F-2/D-4 follow-ups (optional), S5 re-audit by
  both reviewers. Recommended path for D-3: revise the original
  proposal to match what is shipping (orchestrator owns commit / push
  / notify; close-out gates on push-completed). Recommended path for
  D-1: widen the lock to `(repo, branch)` at session admission.
  Recommended path for D-2: hard-scope `--force` to admin/test use
  with explicit ledger emission and env-var gating.
- **Combined design NOT marked complete.** No completion stamp on
  the original proposal or on this audit until Set 009's re-audit
  returns FULLY ALIGNED from both reviewers.

## Outcomes

- All 3 sessions completed and verified.
- Step 8 of `ai-led-session-workflow.md` is one paragraph; close-out
  doc and two-CLI workflow doc are comprehensive (385 + 342 lines).
- Mode-aware fresh close-out turn works end-to-end in BOTH modes
  (15 tests pass; 606/606 full suite).
- Reconciler hook exported and ready for orchestrator-startup wiring.
- Alignment audit reviewed by **both** Gemini Pro AND GPT-5.4 with
  verbatim reviews appended to the audit document.
- All 6 failure-injection scenarios pass at audit time.
- **Drift items documented as follow-up issues with concrete next
  actions** in `docs/session-sets/009-alignment-audit-followups/spec.md`.

## Cost summary

| Session | Verifier route | Cost |
|---|---|---|
| 1 | gemini-pro session-verification | $0.0214 |
| 2 | gemini-pro session-verification | $0.0170 |
| 3 | gemini-pro alignment-audit review | $0.0147 |
| 3 | gpt-5-4 alignment-audit review | $0.1393 |
| 3 | gemini-pro session-verification | $0.0237 |
| **Total** | | **$0.2161** |
