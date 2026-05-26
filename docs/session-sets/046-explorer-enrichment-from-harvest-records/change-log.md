# Set 046 Change Log

**Scope-reduced 2026-05-26 mid-Session-2 after operator incident** —
the Set 033 / Set 036 hard-coordination toast (poll/force/dismiss)
blocked staff onboarding. The 7-session arc the audit locked at the
end of Session 1 was trimmed to a 2-session arc shipping only
deliverable (a) — the `0/?` fraction icon for plan-less Not-Started
session sets. See [`spec.md`](spec.md) "What this set ships (reduced
scope)" for the as-shipped plan and "Cancelled scope (deferred
indefinitely)" for the deferred deliverables.

## Session 1 — Audit pass + scope-lock

Closed 2026-05-26 with disposition `completed`.

- Two-pass devil's-advocate cross-provider consensus over the
  pre-Session-2 7-session proposal at
  [`docs/proposals/2026-05-26-explorer-enrichment-from-harvest-records/proposal.md`](../../proposals/2026-05-26-explorer-enrichment-from-harvest-records/proposal.md).
- Five bias resolutions and four open-question dispositions in
  [`verdict.md`](../../proposals/2026-05-26-explorer-enrichment-from-harvest-records/verdict.md).
- Operator-locked deliverables (a)/(b)/(c) mapped to S2/S3/S7 in the
  pre-reduction spec; only (a) survived scope reduction.
- Stub for Set 047 (state-file schema v4 audit) created — superseded
  later by the operator's redesign (per-session orchestrator + Set
  033/036 rollback). The original v4-schema stub goal is folded into
  the redesigned 047 scope.
- Routed cost: $0.183 of $5 NTE (~3.7%).

## Session 2 — Writer-side `totalSessions: null` + Explorer pre-flight + close-out (reduced scope)

Closed 2026-05-26 with disposition `completed` under reduced scope.

### Writer change (deliverable (a))

[`ai_router/start_session.py`](../../../ai_router/start_session.py):

- Added `--total-sessions N` CLI argument so an operator can lock the
  session count without editing spec.md.
- Updated the resolution chain in
  `register_session_start` ([`ai_router/session_state.py`](../../../ai_router/session_state.py)):
  caller's `total_sessions` → existing state's `totalSessions` →
  spec.md `## Session Set Configuration` block → spec.md `### Session
  N` headings → **null**. The pre-Set-046
  `max(spec_titles, completed, session_number)` fallback was removed
  — the `session_number` branch was the operator-observed bug that
  wrote `totalSessions: 1` on every fresh stub.
- When no source yields a total, the writer emits a **plan-less
  in-progress** snapshot: `totalSessions: null`, no `sessions[]`
  ledger, `currentSession` set, `completedSessions: []`. The Session
  Set Explorer's existing `fractionFor()` carve-out renders this as
  `0/?` (the deliverable).
- The writer refuses incoherent input (closed sessions present but
  no total resolvable) with a `SessionStateInvariantError` carrying
  a remediation message.

### Read-side mirror change

[`ai_router/progress.py`](../../../ai_router/progress.py) and
[`tools/dabbler-ai-orchestration/src/utils/progress.ts`](../../../tools/dabbler-ai-orchestration/src/utils/progress.ts):

- The v2→v3 synthesizer no longer adds `legacyCurrent` to the total-
  candidate set. Without this change, a plan-less in-progress state
  would round-trip through the synthesizer with `total = 1`,
  defeating the writer's `null` intent.

### Tests

- 5 new tests in
  [`ai_router/tests/test_start_session.py`](../../../ai_router/tests/test_start_session.py):
  `test_planless_session_1_writes_totalsessions_null`,
  `test_total_sessions_cli_arg_locks_count_without_spec`,
  `test_planless_refuses_session_number_above_1`,
  `test_planless_writer_refuses_state_with_prior_completed`,
  `test_planless_state_round_trips_through_read_progress`.
- 1 new test in
  [`ai_router/tests/test_progress.py`](../../../ai_router/tests/test_progress.py):
  `test_planless_state_does_not_inflate_total_from_currentSession`.
- Existing `_fresh_set` fixture in `test_start_session.py` updated
  to use the canonical `## Session Set Configuration` heading
  (pre-Set-046 the fixture had been relying on the removed fallback).

### Set 033 / Set 036 hard-coordination enforcement disabled by default

Out of scope for the original Set 046 plan but shipped this session
in response to the operator incident:

[`ai_router/start_session.py`](../../../ai_router/start_session.py):

- New `_coordination_enforced()` predicate gates the H3 refusal AND
  the chatSessionId-mismatch TTY prompt. Default off; opt back in
  via `DABBLER_ENFORCE_CHECKOUT_COORDINATION=1`.
- The orchestrator block, `checkedOutAt`, `lastActivityAt`,
  `chatSessionId` composite identity, and writer-log audit trail
  are all still written on every call — only the refusal is gated.

[`tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js`](../../../tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js):

- Conflict-record emission to `~/.dabbler/checkout-conflicts/` is
  also gated on `DABBLER_ENFORCE_CHECKOUT_COORDINATION=1` (belt and
  suspenders — `start_session` no longer returns
  `EXIT_CHECKOUT_CONFLICT` in production anyway).

Test updates:

- [`ai_router/tests/test_checkout_writer.py`](../../../ai_router/tests/test_checkout_writer.py)
  + [`ai_router/tests/test_chatsessionid_writer.py`](../../../ai_router/tests/test_chatsessionid_writer.py):
  refusal-path tests set the env var via `monkeypatch.setenv` so
  coverage stays intact.
- [`ai_router/tests/test_start_session_takeover_prompt.py`](../../../ai_router/tests/test_start_session_takeover_prompt.py):
  module-level autouse fixture sets the env var (entire module is
  enforcement-path).
- New regression test
  `test_different_holder_default_off_writes_through_without_refusal`
  in `test_checkout_writer.py` locks down the production
  default-off behavior.

[`CLAUDE.md`](../../../CLAUDE.md): new "Hard-coordination enforcement
(Sets 033 / 036) is OFF by default" section documents the flip and
how to re-enable.

Memory: `project_set_033_enforcement_disabled` records the decision
+ surfaces touched + the open follow-up that the extension's
`CheckoutPollService` and `chatSessionMismatchModal` are not yet
deleted (deferred to Set 047 per the operator's redesign).

### Tests

All 818 Python tests pass.

### No release this set

Set 046's writer change rides Set 047's release. No version bump for
`dabbler-ai-router` or the extension as part of Set 046.

### Routed cost

Session 2: $0 (no cross-provider verification — the change set is
small enough that the self-review + 6 new tests + the full 818-test
suite is the right level of rigor for the reduced scope).

### Set 046 cumulative

$0.183 of $5 NTE (~3.7%).

## Cancelled scope (preserved on disk for future audit)

The original 7-session arc audited at Session 1 close-out is
preserved in [`spec.md`](spec.md) "Cancelled scope" and at
[`docs/proposals/2026-05-26-explorer-enrichment-from-harvest-records/`](../../proposals/2026-05-26-explorer-enrichment-from-harvest-records/).
Any future work in this area routes through Set 048+ via
`feedback_audit_then_spec_for_substantial_features`.
