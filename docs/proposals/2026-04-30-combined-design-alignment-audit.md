# Combined Design Alignment Audit (Close-Out Reliability + Outsource-Last)

> ## ✓ COMPLETE — corrective work landed; re-audit verdicts FULLY ALIGNED (2026-05-01)
>
> The three corrective drift items flagged below (D-1, D-2, D-3) all
> landed in Set 009 Sessions 1–3. The three follow-up items (D-4, F-1,
> F-2) were explicitly skipped with written rationale.
>
> **Re-audit verdicts** (both providers, independent reads of the post-
> Set-009 implementation):
> - **Gemini Pro:** FULLY ALIGNED (was: ALIGNED WITH MINOR DRIFT)
> - **GPT-5.4:** FULLY ALIGNED (was: MATERIAL DRIFT)
>
> **Re-audit document:** [`docs/proposals/2026-05-01-combined-design-realignment-audit.md`](2026-05-01-combined-design-realignment-audit.md)
> contains full evidence of D-1/D-2/D-3 landings, Session 4 skip
> rationales, the verbatim re-audit reviews from both providers, and
> the residual operational assumptions to revisit if usage patterns
> change.

---

**Audit date:** 2026-05-01
**Implementation under audit:** Sets 001–006 of the combined design
**Source proposal:** `docs/proposals/2026-04-29-session-close-out-reliability.md`
**v2 plan synthesis:** `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`
**Failure-injection trace artifact:** `tests/failure-injection-traces/2026-05-01/trace.txt`

## Executive summary

The bulk of the combined design is implemented as agreed: SQLite queue
with lease/heartbeat semantics, daemon role-loops, mode-aware
route/verify, in-orchestrator reconciler, fresh close-out hook (mode-
aware, non-fatal), dual-sourced cost reporting, observational capacity
heartbeat, and read-only VS Code views. The 6 executable failure-
injection scenarios from Set 2 Session 4 all pass at audit time, proving
the recovery semantics for the queue substrate (lease expiry, heartbeat
timeout, WAL replay, daemon restart, exactly-one-claim, route-time mode
validation). The full ai-router test suite is **606/606 passing**.

Both reviewers, however, flagged drift that the pre-review draft of this
audit overstated as "no material drift." Final verdicts (verbatim
reviews in Sections 6 and 7):

- **Gemini Pro: ALIGNED WITH MINOR DRIFT** — two follow-up items
  (failure-injection coverage gap for the close-out trigger path; no
  automated alerting on stale heartbeats).
- **GPT-5.4: MATERIAL DRIFT** — four corrective actions before the
  combined design can be marked complete.

**The combined design is NOT marked complete by this audit.** Section
5.2 enumerates the surfaced drift items, classifying each as either
corrective work (must land before completion) or follow-up backlog
(does not block). Section 5.3 records the post-review synthesis in
detail. Corrective work has been written up as a new session-set spec
(`docs/session-sets/009-alignment-audit-followups/spec.md`).

**Cross-provider review cost:** Gemini Pro $0.0147 + GPT-5.4 $0.1393 =
**$0.1540 total.**

---

## Section 1 — Implementation evidence per design component

For each component named in the combined design, this section cites the
file(s) and primary symbols where the design is realized.

### 1.1 Queue contract (SQLite, claim/lease/complete/fail/timeout)

**Where:** `ai-router/queue_db.py`

- `QueueDB` (queue_db.py:269) — SQLite-backed queue
- `claim(worker_id, lease_seconds)` (queue_db.py:400)
- `complete(msg_id, worker_id, result)` (queue_db.py:479)
- `fail(msg_id, worker_id, reason)` (queue_db.py:524)
- `reclaim_expired()` — lease-expiry recovery used by reconciler

**Match against design:** v2 plan §"Queue mechanism" called for SQLite with
per-message state machine and lease/heartbeat semantics. Implementation
matches. JSONL audit export (also called for) lives in
`ai-router/session_events.py`.

### 1.2 Role-loops (orchestrator + verifier daemons)

**Where:** `ai-router/orchestrator_role.py`, `ai-router/verifier_role.py`

- `OrchestratorDaemon` (orchestrator_role.py:249)
- `VerifierDaemon` (verifier_role.py:554)
- `process_one_message(msg, handler)` (verifier_role.py:436)
- `_start_heartbeat(msg, lease_seconds)` (verifier_role.py:255)

**Match against design:** v2 plan Set 2 called for daemon role-loops with
heartbeat emission, stale-session detection, and a restart command (the
last lives at `ai-router/restart_role.py`). Implementation matches.

### 1.3 Mode-aware route and verify

**Where:** `ai-router/verification.py`, `ai-router/router-config.yaml`

- `pick_verifier_model(generator_model, config)` (verification.py:48) — rule-based selection respecting mode
- Outsource-last enqueue path lives in the role-loop modules; outsource-first synchronous path lives in `verification.py`
- `router-config.yaml` defines task-type entries used by both modes

**Match against design:** v2 plan §"Verification blocking" called for
non-blocking enqueue in outsource-last and synchronous verification in
outsource-first, with close-out as the sole blocking point. Implementation
matches.

### 1.4 Close-out script (sole synchronization barrier)

**Where:** `ai-router/close_session.py`

- `run()` — module entry point invoked by `python -m ai_router.close_session`
- `_run_gate_checks(session_set_dir)` (close_session.py:527)
- `_wait_for_verifications(...)` (close_session.py:685) — queue-mediated wait with `--timeout` budget
- `_emit_event(event_name, payload)` (close_session.py:1048) — emits `closeout_requested`, `closeout_succeeded`, `closeout_failed`
- Stable JSON output via `--json` flag (close_session.py:280)
- `--allow-empty-commit` flag (close_session.py:323) — gate behavior only; the script itself does not commit

**Match against design — partial.** The original proposal §3 named the
close-out script as the single entry point for "gate checks,
verification wait, ledger event emission, commit/push, and
notification." The implementation covers gate checks, verification wait,
and ledger event emission. **Commit, push, and notification are NOT
implemented inside `close_session`** — the script gates on whether the
working tree is clean and whether HEAD has been pushed (via
`gate_checks.check_pushed_to_remote`), but it does not perform the
commit, the push, or the user-visible notification. Today these remain
the responsibility of the orchestrator (or, in outsource-first, the
fresh-routed close-out turn whose prompt directs the agent to commit /
push before invoking `close_session`). This is a real divergence from
the proposal's framing and is enumerated as drift item D-3 in §5.2.

### 1.5 Gate checks (deterministic predicates)

**Where:** `ai-router/gate_checks.py`

Five deterministic predicates, all callable as `(passed: bool, remediation: str)`:

- `check_working_tree_clean(session_set_dir, disposition)` (gate_checks.py:164) — files-changed allowlist + ignore patterns (Gemini Pro's brittleness concern: addressed)
- `check_pushed_to_remote(session_set_dir, disposition)` (gate_checks.py:286) — upstream, HEAD, rebase, protected-branch (GPT-5.4's `@{u}..HEAD` brittleness concern: addressed)
- `check_activity_log_entry(session_set_dir)` (gate_checks.py:395)
- `check_next_orchestrator_present(session_set_dir, disposition)` (gate_checks.py:458) — non-final sessions only
- `check_change_log_fresh(session_set_dir, disposition)` (gate_checks.py:541) — final sessions

**Match against design:** Proposal §3 called for hardened, mode-aware
gates. Implementation matches and explicitly addresses both reviewers'
brittleness concerns from §"Failure modes flagged."

### 1.6 Reconciler (sweeps stranded sessions)

**Where:** `ai-router/reconciler.py`

- `reconcile_sessions(base_dir, quiet_window_minutes)` (reconciler.py:328) — CLI sweep
- `register_sweeper_hook(handler)` (reconciler.py:409) — orchestrator-startup integration
- `ReconcileEntry`, `ReconcileSummary` (reconciler.py:115, :156)
- Stranded-state constants `CLOSEOUT_PENDING`, `CLOSEOUT_BLOCKED` (reconciler.py:95–98)
- Public exports surfaced at `ai-router/__init__.py` in Set 6 Session 2

**Match against design:** Both reviewers' Critical concern — "no
independent recovery path if the close-out turn never launches" —
required a reconciler. v2 plan §"Open questions (revised)" Q1 chose the
in-orchestrator sweeper option. Implementation matches: the hook runs at
orchestrator startup and on idle ticks.

### 1.7 Fresh close-out turn hook (mode-aware orchestration glue)

**Where:** `ai-router/close_out.py`

- `route_fresh_close_out_turn(session_set_dir)` (close_out.py:203) — mode-aware entry
- `FreshCloseOutResult` (close_out.py:143) — outcome record (success / noop / error)
- `SESSION_CLOSE_OUT_TASK_TYPE = "session-close-out"` (close_out.py:94)

**Behavior split:**
- **outsource-first** routes a fresh turn via `route(task_type="session-close-out")`; the routed agent reads `ai-router/docs/close-out.md` and invokes `python -m ai_router.close_session`.
- **outsource-last** invokes `close_session.run` in-process via the injected `close_session_runner` (no fresh API turn — the orchestrator already has the queue context).

**Failure handling:** the hook never raises; failures populate
`FreshCloseOutResult.error` and the next orchestrator startup's
reconciler sweep recovers the session. This addresses GPT-5.4's "Critical"
concern that the fresh-agent turn could itself fail and strand a session.

**Match against design:** Proposal §6 called for the fresh-agent turn;
v2 plan refined it to be mode-aware and explicitly non-fatal.
Implementation matches.

### 1.8 Dual-sourced cost report

**Where:** `ai-router/cost_report.py`

- `get_costs(session_set_dir)` (cost_report.py:205) — merges `router-metrics.jsonl` and `activity-log.json`
- `print_cost_report(...)` (cost_report.py:410) — human + JSON output
- Reconciliation warning at >$0.01 discrepancy (cost_report.py:50)

**Match against design:** Both reviewers flagged the proposal's assumption
that `router-metrics.jsonl` is a complete superset of activity-log costs.
v2 plan §"Files this revision affects" called for dual-sourcing.
Implementation matches.

### 1.9 Capacity heartbeat (reframed as observational, not predictive)

**Where:** `ai-router/capacity.py`, `ai-router/heartbeat_status.py`

- `write_capacity_signal(base_dir, provider, signal_dict)` (capacity.py:81)
- `read_capacity_summary(base_dir, provider, lookback_minutes)` (capacity.py:197)
- `collect_status(base_dir, lookback_minutes)` (heartbeat_status.py:107) — aggregates all providers

**Match against design:** GPT-5.4's reframing — "honest heartbeat, not
routing intelligence" — was adopted in v2 plan. Implementation matches:
signals are written *after* completions and presented as last-seen
timestamps, with no routing logic consuming them.

### 1.10 VS Code views (Session Set Explorer + Provider Queues + Heartbeats)

**Where:** `tools/vscode-session-sets/src/providers/`

- `SessionSetsProvider` (SessionSetsProvider.ts:119)
- `ProviderQueuesProvider` (ProviderQueuesProvider.ts:122)
- `ProviderHeartbeatsProvider` (ProviderHeartbeatsProvider.ts:77)

All three views shell out to Python CLI helpers (`queue_status`,
`heartbeat_status`) to avoid schema drift between extension and runtime.

**Match against design:** Set 5 spec called for these views with
mode-badge surfacing in the Session Set Explorer and read-only views for
queue/heartbeat. Implementation matches.

### 1.11 Doc collapse (Step 8 → close-out reference + two-CLI workflow)

**Files:**
- `docs/ai-led-session-workflow.md` — Step 8 collapsed (lines 860–907, 48 lines, was ~140 in pre-collapse)
- `ai-router/docs/close-out.md` — 385 lines, canonical close-out reference
- `ai-router/docs/two-cli-workflow.md` — 342 lines, operational guide for outsource-last
- `close_session --help` echoes Section 2 of close-out.md verbatim

**Match against design:** Proposal §5 called for the doc collapse; v2 plan
retained it. Set 6 spec required the two-CLI workflow doc be a real
operational story (Gemini Pro's flagged concern). Implementation matches.

### 1.12 router-config.yaml task-type wiring

**Where:** `ai-router/router-config.yaml`

- `task_type_overrides.session-close-out: sonnet` (line 256)
- `always_route_task_types` includes `session-close-out` (line 274)
- `task_type_params.session-close-out` (line 304)
- `task_type_scores.session-close-out: 15` (line 409)

**Match against design:** Set 6 Session 2 called for a low-effort tier
routing for the fresh close-out turn in outsource-first. Implementation
matches.

### 1.13 Drift items observed

Two drift items surfaced during the self-audit and were corroborated by
the cross-provider reviewers; one additional drift item was raised by
GPT-5.4. All three are enumerated in §5.2 with classification
(corrective vs. follow-up).

- **D-1** — concurrency model is narrower than the agreed answer (close-
  out lock serializes close-out only; does not enforce single-session
  ownership of `(repo, branch)`).
- **D-3** — `close_session.py` does not perform commit / push /
  notification, contrary to the original proposal §3 framing.
- **D-4** — failure-injection trace is narrower than the failures
  claimed in §2 (no executable trace for fresh-turn failure recovery,
  push-status edge cases, working-tree allowlist behavior, dual-cost
  reconciliation, or notification path).

---

## Section 2 — Failure modes flagged: how implementation addresses each

The original proposal's cross-provider review (Gemini Pro + GPT-5.4)
flagged several "Failure modes the proposal underweights." The v2 plan
synthesis added more from the outsource-last extension. This section maps
each flagged mode to its mitigation in code.

### 2.1 Orchestrator failure between turns leaves zombie session

**Flagged by:** Gemini Pro (Appendix A of proposal), GPT-5.4 (Appendix B)
**Mitigation — recovery on next orchestrator activity.** Reconciler
sweep registered as orchestrator-startup + idle-tick hook
(`reconciler.register_sweeper_hook`, see §1.6). Recovery occurs when the
orchestrator next runs, not independently of orchestrator liveness — if
the orchestrator stays down indefinitely, recovery does not occur until
it returns. Failure-injection Scenario 4 ("CLI session reset")
demonstrates recovery on restart.

### 2.2 Close-out agent failure (provider outage during fresh turn)

**Flagged by:** Gemini Pro, GPT-5.4 (both rated Critical)
**Mitigation — recovery on next orchestrator activity.**
`close_out.route_fresh_close_out_turn` is non-fatal; on failure,
`FreshCloseOutResult.error` is populated and the reconciler recovers
the session when the orchestrator next runs. The
`test_close_out_e2e.py::test_failure_then_reconciler_recovery` end-to-
end test exercises this path. Note: Gemini Pro flagged that this path
is covered only by the e2e unit test, not by an executable scenario in
the failure-injection suite — enumerated as follow-up F-1 in §5.2.

### 2.3 Working-tree pollution false positives

**Flagged by:** Gemini Pro
**Mitigation:** `gate_checks.check_working_tree_clean` uses a
`files_changed` allowlist + ignore patterns rather than naive
`git status --porcelain` (gate_checks.py:164).

### 2.4 Concurrent sessions race on the same repo

**Flagged by:** GPT-5.4
**Mitigation — partial.** Advisory close-out lock
(`ai-router/close_lock.py`) serializes close-out invocations on the same
session set, preventing the duplicate-event race that would corrupt the
ledger. **It does not enforce single-session ownership of a
`(repo, branch)` pair at session admission**, which is what the v2 plan
§"Open questions" Q2 actually called for. Two sessions in different
session sets pointing at the same `(repo, branch)` can still race: each
will pass its own gate's clean-tree check independently, and the loser's
push can fail or rebase under the winner. This is a real divergence
from the agreed design and is enumerated as drift item D-1 in §5.2.

### 2.5 `git log @{u}..HEAD` brittleness (detached HEAD, missing upstream, rebase)

**Flagged by:** GPT-5.4
**Mitigation:** `gate_checks.check_pushed_to_remote` covers detached HEAD,
upstream, rebase, protected-branch flows (gate_checks.py:286).

### 2.6 router-metrics.jsonl is incomplete (non-LLM costs, crashes before flush)

**Flagged by:** Gemini Pro, GPT-5.4
**Mitigation:** Dual-sourced cost report (§1.8). `cost_report.get_costs`
warns on >$0.01 discrepancy.

### 2.7 Verifier claims work, then auth expires / rate-limited before completion

**Flagged by:** v2 synthesis (both reviewers)
**Mitigation:** Lease + heartbeat. Failure-injection Scenarios 1 and 2
(lease expiration, heartbeat timeout escalation) prove the recovery.

### 2.8 Mid-append crash leaves truncated JSONL

**Flagged by:** v2 synthesis (both reviewers, the trigger to switch from
JSONL queue to SQLite)
**Mitigation:** SQLite WAL replay. Failure-injection Scenario 3 proves the
recovery semantics ("kill during complete" recovers via WAL replay).

### 2.9 Hidden provider role-loop down for hours

**Flagged by:** v2 synthesis
**Mitigation — observability only, not recovery.** Capacity heartbeat
surfaces last-emitted timestamps; the VS Code Provider Heartbeats view
shows them visually. This addresses the *hiddenness* aspect of the
flagged failure (the user can now see the gap), but does not
automatically recover or alert when a role-loop has been down for an
extended period. Per v2 plan, heartbeats were explicitly reframed as
observational not predictive, so this is consistent with the agreed
design — but Gemini Pro raised follow-up F-2 (automated alerting on
stale heartbeats above a threshold), enumerated in §5.2.

### 2.10 Doc collapse harms compliance (orchestrators that pre-load only the workflow doc)

**Flagged by:** GPT-5.4 (specifically against original proposal §5)
**Mitigation:** Outsource-first close-out is implemented as a *fresh
routed turn* whose prompt explicitly references
`ai-router/docs/close-out.md`. The agent encounters the close-out
instructions at the moment they are needed, sidestepping the pre-load
problem (`close_out.route_fresh_close_out_turn`, §1.7).

---

## Section 3 — Open questions: resolved answers

The original proposal §"Open questions" and the v2 plan §"Open questions
(revised)" together raised 9 open questions. Each has a resolved answer
in implementation:

| # | Question | Resolution | Location |
|---|---|---|---|
| 1 | Should `close_session` be human-invokable? | Yes | `python -m ai_router.close_session` works without routing context |
| 2 | Heuristic for skipping fresh close-out on short sessions? | Always invoke the close-out hook; outsource-first routes a fresh turn, outsource-last self-invokes in-process | `close_out.py:203` |
| 3 | Should gate failure list be machine-readable? | Yes (`--json`) | `close_session.py:280` |
| 4 | Log `nextOrchestrator` recommendations in router-metrics? | Yes | `disposition.py` + `router-metrics.jsonl` |
| 5 | Sessions ending without next-session work (final)? | `nextOrchestrator: null` allowed; `change-log.md` required | `gate_checks.check_change_log_fresh` |
| 6 | Where does the reconciler run? | (b) in-orchestrator sweeper | `reconciler.register_sweeper_hook` |
| 7 | Concurrent worktrees: lock or reject? | **Partially resolved** — `close_lock.py` serializes close-out per session set. Does NOT reject parallel sessions across session sets on the same `(repo, branch)` at admission time. See drift item D-1 in §5.2. | `close_lock.py` |
| 8 | `disposition.json` lifecycle? | Keep forever (audit trail) | `disposition.py` |
| 9 | Lifecycle ledger storage format? | Separate `session-events.jsonl` per set | `session_events.py` |

All 9 questions resolved consistently with the recommended answer in the
plans.

---

## Section 4 — Failure-injection trace summaries

The 6 scenarios from Set 2 Session 4 (`ai-router/tests/test_failure_injection.py`)
were re-run at audit time:

| # | Scenario | File:line | Result | Runtime |
|---|---|---|---|---|
| 1 | Lease expiration: killed verifier's lease expires, second verifier completes | test_failure_injection.py:189 | PASSED | <1s |
| 2 | Heartbeat timeout escalation: repeated lease expiry transitions to timed_out | test_failure_injection.py:282 | PASSED | <1s |
| 3 | Truncated SQLite recovery: kill during complete recovers via WAL replay | test_failure_injection.py:346 | PASSED | <1s |
| 4 | CLI session reset: kill daemon, restart completes message | test_failure_injection.py:435 | PASSED | <1s |
| 5 | Concurrent claim attempts: two workers race, exactly one wins | test_failure_injection.py:520 | PASSED | <1s |
| 6 | Mode-switch mid-set: invalid outsource-last spec raises at route-time | test_failure_injection.py:580 | PASSED | <1s |
| (smoke) | In-process lifecycle: pre-enqueued message completes via `run_one` | test_failure_injection.py:648 | PASSED | <1s |

**Total:** 7 passed in 6.42s (6 audit scenarios + 1 smoke check).

**Full ai-router test suite at audit time:** 606 passed in 51.29s. No
regressions.

**Trace artifact:** `tests/failure-injection-traces/2026-05-01/trace.txt`
(committed alongside this audit).

These executable scenarios are the substance of GPT-5.4's request that the
audit not be "text-only" — they demonstrate that the recovery semantics
described in this document hold under simulated abnormal terminations.

---

## Section 5 — Drift, follow-ups, and corrective work

### 5.1 Already-known deferrals (no change from pre-review draft)

- **Re-enable hybrid mode (`tiebreakerFallback: api`).** v2 plan deferred
  this; revisit only if outsource-last has measurable demand for it after
  soak time. Defer indefinitely; do not file an issue. (Both reviewers
  agree this is fine to defer.)
- **Additional semantic validators on `nextOrchestrator.reason`.** GPT-5.4
  flagged the risk that a fresh close-out turn fills the field with
  "plausible but semantically empty text." Current implementation
  validates presence and shape but not semantic content. **File as a
  follow-up issue with low priority.** (GPT-5.4 confirms acceptable as a
  low-priority follow-up; does not block completion.)

### 5.2 Drift items surfaced during cross-provider review

Each item is classified as either **corrective** (must land before the
combined design is marked complete) or **follow-up** (does not block
completion; tracked separately).

**D-1 — `(repo, branch)` parallel-session exclusion is incomplete.** [CORRECTIVE]

- *Source:* GPT-5.4 (§2.4 verbatim review), corroborated by self-audit.
- *Detail:* The agreed v2 answer to "concurrent worktrees: lock or
  reject?" was to reject parallel sessions on the same `(repo, branch)`
  via an advisory lock at session admission time. Implementation only
  serializes close-out invocations on the same session set
  (`close_lock.py`). Two sessions in different session sets pointing at
  the same `(repo, branch)` can still race.
- *Required corrective work:* Either (a) widen the lock to acquire at
  session admission and scope it to `(repo, branch)`, or (b) revise the
  agreed answer to acknowledge that close-out-only serialization is
  sufficient and document the residual race explicitly. Either path is
  acceptable; both must include an executable test for two sessions
  targeting the same `(repo, branch)`.

**D-2 — `--force` flag on a deterministic gate.** [CORRECTIVE]

- *Source:* GPT-5.4 (§6 verbatim review).
- *Detail:* Pre-review draft listed `--force` removal under §5.1 as
  ordinary backlog. GPT-5.4 elevated this: a bypass flag on the gate
  that exists *to make close-out deterministic* is in tension with the
  design's intent. If the flag is usable in normal operation, this is
  corrective work, not deferred backlog.
- *Required corrective work:* Either (a) remove `--force` before
  marking the combined design complete, or (b) hard-scope it to test/
  admin use only, with explicit ledger emission (`closeout_force_used`
  event) and loud failure-state marking when used.

**D-3 — `close_session.py` does not own commit / push / notification.** [CORRECTIVE]

- *Source:* GPT-5.4 (§5 verbatim review), corroborated by self-audit
  (close_session.py contains no commit/push/notify code paths; gate
  checks read git state but do not mutate it; `notifications.py`
  `send_session_complete_notification` is not invoked from the close-
  out flow).
- *Detail:* Original proposal §3 named close-out as the single entry
  point handling "working-tree checks, verification wait, ledger event
  emission, **commit/push, and notification**." The implementation
  covers checks, wait, and events but punts commit/push/notification
  back to the orchestrator (or, in outsource-first, to the routed
  close-out turn's prompt). This is real divergence from the proposal's
  framing.
- *Required corrective work:* Either (a) wire commit / push /
  notification into `close_session.py` with proper failure-mode
  handling and ledger events for each phase, or (b) explicitly revise
  the combined design to relocate those responsibilities to the
  orchestrator-level fresh-turn prompt and document the revised
  contract in `ai-router/docs/close-out.md`. (b) is the lower-friction
  path and is consistent with what is actually shipping today.

**D-4 — Failure-injection trace coverage is narrower than the §2 claims imply.** [FOLLOW-UP]

- *Source:* Gemini Pro and GPT-5.4 both raised this.
- *Detail:* The trace artifact (§4) demonstrates queue/recovery
  substrate behavior. It does not demonstrate: fresh-turn failure +
  reconciler recovery (covered by `test_close_out_e2e.py` unit-style,
  but not as an executable failure-injection scenario), push-status
  edge cases, working-tree allowlist behavior, dual-sourced cost
  reconciliation, or notification delivery.
- *Reasoning for follow-up classification:* The implementation
  behavior these scenarios would test is already exercised by other
  tests (e2e + gate-check unit tests). The drift is in the audit's
  rhetoric, not in the implementation's correctness. Filing as a
  follow-up to widen the failure-injection suite to match §2's
  claimed coverage.

**F-1 — Failure-injection scenario for close-out trigger failure.** [FOLLOW-UP]

- *Source:* Gemini Pro (§1 of verbatim review).
- *Detail:* Gemini Pro called for a specific executable scenario
  matching §2.2: outsource-first close-out → mock `route()` to raise
  `ProviderAPIError` → verify session lands in `CLOSEOUT_BLOCKED` →
  simulate orchestrator restart → verify reconciler recovery.
- *Classification:* Follow-up — `test_close_out_e2e.py::
  test_failure_then_reconciler_recovery` covers the same path in unit
  form. Adding the same scenario to the failure-injection suite is
  worthwhile coverage but does not block completion.

**F-2 — Automated alerting on stale provider heartbeats.** [FOLLOW-UP]

- *Source:* Gemini Pro (§2 of verbatim review).
- *Detail:* Heartbeats are observation-only; a daemon down for hours
  is currently caught only when a human notices the stale timestamp in
  the VS Code view. Gemini Pro recommends an automated alert (log
  ERROR, optional notification) when `last_seen` exceeds a configurable
  threshold (e.g., 60 minutes).
- *Classification:* Follow-up — consistent with the v2 design's
  observational framing of heartbeats; alerting is an additive
  enhancement, not a corrective fix.

### 5.3 Post-review synthesis

**Verdicts.** Gemini Pro: ALIGNED WITH MINOR DRIFT (2 follow-up items,
F-1 and F-2). GPT-5.4: MATERIAL DRIFT (4 corrective actions, mapping to
D-1, D-2, D-3, and the §4 narrowness which this audit reclassifies as
follow-up D-4 because the implementation is correct even though the
audit's rhetoric overstated its coverage).

**Net.** Three drift items (D-1, D-2, D-3) are classified as corrective
work that must land before the combined design is marked complete. Three
items (D-4, F-1, F-2) are follow-ups that do not block completion.

**The combined design is NOT marked complete by this audit.** No
completion stamp will be added to
`docs/proposals/2026-04-29-session-close-out-reliability.md` or to this
audit document until the corrective work in D-1, D-2, and D-3 has
landed and been re-audited.

**Corrective work spec.** A new session-set spec has been drafted at
`docs/session-sets/009-alignment-audit-followups/spec.md` covering:

- Session 1: D-3 — relocate commit/push/notification responsibilities
  (revising the combined design to match what is actually shipping is
  the recommended path; alternative is to wire them into close_session)
- Session 2: D-1 — widen the close-out lock to `(repo, branch)`
  scope at session admission, OR document the residual race; add the
  cross-set parallel-session executable test either way
- Session 3: D-2 — remove `--force` from `close_session`, or hard-
  scope it to admin/test use only with explicit ledger events
- Session 4 (optional): F-1, F-2, D-4 — extend failure-injection suite
  and add stale-heartbeat alerting

After Set 009 lands, a Set 010 re-audit will route the same combined-
alignment prompt back through both Gemini Pro and GPT-5.4. If both
verdicts return FULLY ALIGNED at that point, the completion stamps on
the original proposal and on this audit document will be added.

**Cost reflection.** The cross-provider review cost $0.1540 total — within
the $0.15–$0.20 expectation stated in the spec (Session 3, "Cost
expectation"). The reviews surfaced real drift that the self-audit
overstated as "no material drift." This is the value of the cross-
provider verification step: it catches overclaiming that an internal
audit produced by the implementer would not catch.

---

## Section 6 — Gemini Pro review (verbatim)

> Saved at `C:\temp\review-combined-alignment-gemini-pro.md` at runtime;
> preserved here for the document's self-contained record.
> Cost: $0.0147 (input=7040, output=587, 35.9s).

An alignment audit was performed on the provided documentation. The following drift was identified between the design and the implementation's verification artifacts.

### 1. Incomplete Failure-Injection Coverage

**Issue:** The failure-injection test suite lacks a scenario for a critical failure mode identified during the design review.
**Location:** Audit §2.2 ("Close-out agent failure") and §4 ("Failure-injection trace summaries").
**Analysis:** §2.2 correctly identifies the mitigation for a failed close-out trigger: the trigger call is non-fatal and the reconciler recovers the session on the next run. However, §4's list of executable failure-injection scenarios does not include one that simulates this specific failure. While a unit test is mentioned, the explicit goal of the failure-injection suite is to provide end-to-end proof of recovery for critical paths. The recovery from a failed *trigger* is a distinct and critical path that warrants its own executable scenario.
**Fix:** Add a new failure-injection scenario to `test_failure_injection.py`. The scenario should:
1.  Initiate a session close-out in `outsource-first` mode.
2.  Mock the `route()` call inside `route_fresh_close_out_turn` to raise an exception (e.g., `ProviderAPIError`).
3.  Verify that the session is left in a stranded state (`CLOSEOUT_BLOCKED`).
4.  Simulate an orchestrator restart, triggering the reconciler sweep.
5.  Verify that the reconciler successfully re-initiates and completes the close-out.

### 2. Latent Risk in Observability-Only Heartbeat

**Issue:** The capacity heartbeat mechanism is purely observational and relies on human intervention to detect and remediate a silent daemon failure.
**Location:** Audit §2.9 ("Hidden provider role-loop down for hours").
**Analysis:** The implementation correctly matches the v2 plan's reframing of the capacity signal as an "honest heartbeat, not routing intelligence." However, by providing no automated alerting on top of this signal, the system's reliability is dependent on a human noticing a stale timestamp in a VS Code view. This is a latent operational risk. While not a deviation from the agreed-upon design, it is a known weakness that should be formally tracked.
**Fix:** File a follow-up, medium-priority issue to build automated monitoring for stale provider heartbeats. The monitor should trigger an alert (e.g., log an `ERROR`-level message, send an email) if any provider's `last_seen` timestamp in `heartbeat_status` is older than a configurable threshold (e.g., 60 minutes).

Verdict: `ALIGNED WITH MINOR DRIFT`

---

## Section 7 — GPT-5.4 review (verbatim)

> Saved at `C:\temp\review-combined-alignment-gpt-5-4.md` at runtime;
> preserved here for the document's self-contained record.
> Cost: $0.1393 (input=6151, output=8262, 129.7s).

## 1. Bottom line

The audit overclaims alignment.

Large parts of the combined design do appear to be implemented as described: SQLite queueing with lease/heartbeat, daemon role-loops, mode-aware verification, reconciler sweep, fresh close-out hook, dual-sourced cost reporting, observational heartbeats, and VS Code read-only views.

But the document does **not** support its strongest claim that there is "no material drift." There are four places where the mapping or evidence is too weak to mark the design complete.

---

## 2. Failure-mode mapping assessment

### 2.1 Mappings that hold

- **2.1 Orchestrator failure between turns** → reconciler sweep on startup/idle tick is the right class of mitigation.
- **2.2 Close-out agent failure** → non-fatal fresh-close-out hook plus later reconciler recovery is the right class of mitigation.
- **2.3 Working-tree false positives** → allowlist/ignore-based gate is a real mitigation.
- **2.5 Push-status brittleness** → hardened git-state checks are a real mitigation.
- **2.6 Incomplete router metrics** → dual-sourced cost report is the right mitigation.
- **2.7 Verifier lease loss** → lease + heartbeat directly addresses the failure.
- **2.8 Truncated JSONL / append crash** → moving correctness to SQLite/WAL directly addresses the failure.
- **2.10 Doc collapse harms compliance** → fresh routed close-out turn referencing the canonical doc is a real mitigation.

### 2.2 Mappings that are overstated or incomplete

**Issue →** The claimed mitigation for concurrent same-repo sessions is narrower than the failure mode it is mapped to.
**Location →** Section 2.4; Section 3 row 7; Section 1.7/1.13 by implication.
**Fix →** Prove that the lock is acquired at **session admission / repo-branch ownership time**, or revise the claim. A "close-out lock" only serializes close-out. It does **not** by itself "reject parallel sessions on the same `(repo, branch)`," which was the stated agreed answer.

Reasoning: the flagged failure is **concurrent sessions race on the same repo**, not merely concurrent close-outs. The audit's wording ("advisory close-out lock") reads as a weaker mechanism than the design answer.

---

**Issue →** The heartbeat mechanism only mitigates *hiddenness*, not downtime. The audit presents it a bit too cleanly as a failure-mode fix.
**Location →** Section 2.9.
**Fix →** Rephrase the claim: "This addresses observability of a down role-loop, not recovery." Keep it as aligned only because the v2 design explicitly reframed heartbeats as observational.

Reasoning: this is acceptable design-wise, but the audit should not imply corrective recovery where none exists.

---

**Issue →** Reconciler-based recovery is contingent on future orchestrator activity; the audit treats it as unconditional recovery.
**Location →** Section 2.1 and 2.2.
**Fix →** State the operational dependency explicitly: recovery occurs on next orchestrator startup/idle sweep, not independently of orchestrator liveness.

Reasoning: this is likely still aligned with the chosen design, but the current wording is stronger than the mechanism.

---

## 3. Open-questions assessment

Most of Section 3 is consistent with the described v2 answers.

### Open questions that look resolved correctly

- Human-invokable `close_session`
- Machine-readable gate failures via `--json`
- Final-session handling with `nextOrchestrator: null` + fresh changelog
- In-orchestrator reconciler
- Keep `disposition.json`
- Separate lifecycle ledger JSONL

### Open-question answers that need correction/clarification

**Issue →** "Always route" is not the actual behavior in outsource-last.
**Location →** Section 3, row 2.
**Fix →** Change the resolution to: "Always invoke the close-out hook; outsource-first routes a fresh turn, outsource-last self-invokes in-process."

Reasoning: Section 1.7 already says outsource-last does **not** route a fresh API turn. The current answer is imprecise.

---

**Issue →** "Reject parallel sessions on same `(repo, branch)` via lock" is only resolved if the lock is broader than close-out.
**Location →** Section 3, row 7.
**Fix →** Show where the lock is acquired and enforced. If it is only a close-out guard, this row is not actually resolved to the recommended answer.

---

## 4. Failure-injection coverage assessment

Section 4 is good evidence for the **queue/recovery substrate**, not for the full combined design.

### What the trace does cover well

- Lease expiry recovery
- Heartbeat timeout escalation
- SQLite/WAL crash recovery
- Daemon restart recovery
- Exactly-one queue claim
- Route-time mode validation
- Basic in-process lifecycle

### What is not covered by the trace artifact

**Issue →** The trace artifact is narrower than the failures claimed in Section 2.
**Location →** Section 4 vs. Section 2.
**Fix →** Add executable coverage, or narrow the claim.

At minimum, the audit should not imply Section 4 demonstrates all flagged failure modes. It does not cover:

1. **Fresh close-out turn failure + reconciler recovery** in the trace artifact
   - A separate E2E test is cited in Section 2.2, which is good, but that is not the same as the failure-injection trace evidence the executive summary leans on.

2. **Same repo/branch parallel-session rejection**
   - No cited scenario exercises the repo lock.

3. **Push-status edge cases**
   - Detached HEAD / missing upstream / rebase / protected-branch cases are asserted, not shown here.

4. **Working-tree allowlist / ignore-pattern behavior**
   - Claimed, not demonstrated here.

5. **Dual-sourced cost discrepancy handling**
   - Claimed, not demonstrated here.

6. **Notification path**
   - Not covered at all in the audit.

This is not fatal to the implementation, but it **is** a problem for the audit's claim that the abnormal-termination scenarios demonstrate the recovery semantics of the combined design broadly.

---

## 5. Major component coverage: Section 1 misses core close-out responsibilities

**Issue →** Section 1 does not account for all of the close-out gate responsibilities described in the combined design.
**Location →** Section 1.4, plus the absence of any separate component entry.
**Fix →** Add explicit evidence for:
- commit behavior, if `close_session` performs or orchestrates it
- push behavior, beyond merely checking "already pushed"
- notification behavior

Reasoning: the background design summary names close-out as handling **working-tree checks, verification wait, ledger event emission, commit/push, and notification**. Section 1.4 only evidences checks, wait, and events. Even if commit/push/notify exist elsewhere, the audit has not shown them. That means the claim in Section 1.13 ("None observed") does not hold.

This is the single biggest audit gap.

---

## 6. Deferred-items assessment

### `--force`

**Issue →** A `--force` bypass on the deterministic close-out gate is not obviously safe to leave as a normal follow-up.
**Location →** Section 5.1.
**Fix →** Either:
- remove it before calling the design complete, or
- hard-scope it to test/admin use only, with explicit ledger emission and loud failure-state marking when used.

Reasoning: the whole design exists to make close-out deterministic and reliable. A bypass flag is directly in tension with that. If it can be used in normal operation, this is corrective work, not just backlog cleanup.

### Hybrid mode deferment

**Issue →** No problem.
**Location →** Section 5.1.
**Fix →** None needed.

Reasoning: the v2 plan explicitly deferred it.

### Semantic validators for `nextOrchestrator.reason`

**Issue →** Acceptable as a low-priority follow-up.
**Location →** Section 5.1.
**Fix →** File it, but it does not block completion by itself.

---

## 7. Additional observations

**Issue →** The audit declares success too early and too strongly.
**Location →** Executive summary; Section 1.13; Section 5.3; empty Sections 6 and 7.
**Fix →** Tone down the claims until the missing component evidence and the concurrency/`--force` points are resolved.

Reasoning: the document says "each major component named in the v2 plan is present" and "None observed" drift, while also leaving cross-provider review sections blank and omitting core close-out responsibilities from the evidence section.

---

## 8. Recommended corrective actions before marking complete

1. **Prove or fix repo/branch parallel-session exclusion**
   - Show lock acquisition point and scope.
   - Add an executable test for two sessions targeting the same `(repo, branch)`.

2. **Resolve the `--force` contradiction**
   - Remove it, or constrain it to non-production/admin/test use with explicit audit events.

3. **Complete the close-out evidence**
   - Add implementation evidence for commit/push/notification, or explicitly document that the agreed design was revised away from those responsibilities.

4. **Narrow or expand the test-evidence claims**
   - Keep Section 4 framed as queue/recovery evidence unless more close-out-specific failure cases are added.

Verdict: MATERIAL DRIFT
