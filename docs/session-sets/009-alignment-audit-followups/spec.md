# Session Set: Alignment Audit Follow-Ups (Corrective Work for Set 006 Audit)

## Summary

The cross-provider alignment audit produced in Set 006 Session 3
(`docs/proposals/2026-04-30-combined-design-alignment-audit.md`)
returned two verdicts:

- **Gemini Pro:** ALIGNED WITH MINOR DRIFT
- **GPT-5.4:** MATERIAL DRIFT (4 corrective actions)

Three drift items were classified as **corrective** — they must land
before the combined close-out reliability + outsource-last design can
be marked complete. This session set lands those corrections and a
re-audit.

---

## Drift items addressed

| ID | Drift | Severity (audit §5.2) |
|---|---|---|
| D-1 | `(repo, branch)` parallel-session exclusion is incomplete | CORRECTIVE |
| D-2 | `--force` flag on a deterministic gate | CORRECTIVE |
| D-3 | `close_session.py` does not own commit / push / notification | CORRECTIVE |
| D-4 | Failure-injection trace coverage narrower than §2 claims imply | FOLLOW-UP |
| F-1 | Failure-injection scenario for close-out trigger failure | FOLLOW-UP |
| F-2 | Automated alerting on stale provider heartbeats | FOLLOW-UP |

D-1, D-2, D-3 must land in Sessions 1–3 of this set. D-4, F-1, F-2 are
optional follow-ups for Session 4 — they don't block the re-audit
verdict but materially improve the implementation if landed.

---

## Sessions

### Session 1: D-3 — Resolve commit / push / notification ownership

**Goal:** Decide and implement: does `close_session.py` own commit /
push / notification, or does that responsibility live in the
orchestrator's fresh-turn prompt? Either way, document the resolution
canonically.

**Recommended path (lower friction, matches what is shipping today):**
- Revise `ai-router/docs/close-out.md` Section 1 ("When close-out runs")
  to state explicitly that close-out's responsibilities are: gate
  checks, verification wait, ledger event emission. **Commit, push, and
  notification are the orchestrator's (or fresh-turn agent's)
  responsibility, run BEFORE invoking close-out.** The close-out gate's
  `check_pushed_to_remote` enforces that the push completed.
- Revise the original close-out reliability proposal §3 to match the
  revised contract (or add a "post-implementation revision" note).
- Update `close_session.py --help` text accordingly (since it echoes
  Section 2 of the doc).
- Update the fresh-turn prompt template
  (`ai-router/prompt-templates/session-close-out.md` if present, or
  inline in `close_out.py`'s prompt construction) to make commit/push/
  notification explicit pre-close-out steps.
- Confirm `notifications.send_session_complete_notification` has a
  clear caller; if it's currently orphaned, wire it from the fresh-turn
  agent's instructions or remove it.

**Alternative path (matches original proposal):** Wire commit, push,
and notification phases into `close_session.run` with proper
phase-by-phase ledger events (`closeout_committed`,
`closeout_pushed`, `closeout_notified`) and failure-mode handling for
each. Larger change; only choose if the human prefers the proposal's
original framing over what's shipping.

**Acceptance:**
- `ai-router/docs/close-out.md` and the original proposal agree on who
  owns commit/push/notification
- `close_session --help` reflects the resolution
- The fresh-turn prompt explicitly directs the agent to commit and
  push before invoking close-out (recommended path), or
  `close_session.run` performs commit/push/notify (alternative path)
- All existing tests still pass

### Session 2: D-1 — `(repo, branch)` parallel-session exclusion

**Goal:** Either widen the lock to enforce single-session ownership of
`(repo, branch)` at session admission, or document the residual race
explicitly. Either path requires an executable test.

**Recommended path (widen the lock):**
- Add `ai-router/repo_branch_lock.py` that acquires an advisory lock
  scoped to `<git-common-dir>/.dabbler-session.lock` (so it covers all
  worktrees of the same bare repo) keyed by current branch
- Lock acquired at session admission (when `register_start` step in
  `activity-log.json` is recorded), released on close-out succeed or on
  `closeout_failed` after operator acknowledgment
- Lock contents: session-set name, session number, PID, acquired_at
- Stale-lock reclaim: same TTL + PID check as `close_lock.py`
- Update `gate_checks.check_working_tree_clean` and
  `check_pushed_to_remote` to reference the lock holder if a race is
  detected
- New executable test in `test_failure_injection.py`:
  `TestScenario7CrossSetParallelRejection` — two session sets
  attempting to open work on the same `(repo, branch)` simultaneously;
  exactly one acquires the lock; the other receives a
  `RepoBranchLocked` exception with a clear message

**Alternative path (document residual race):** If the human decides the
multi-set parallel case is rare enough to not justify the lock,
document the residual race in `ai-router/docs/close-out.md` Section 6
(Troubleshooting) and revise the original proposal §3 + v2 plan
"Open question Q2" to reflect the narrower scope.

**Acceptance:**
- Either: a `(repo, branch)` lock exists, is acquired at session
  admission, and is exercised by an executable failure-injection test
- Or: the residual race is documented in close-out.md and the
  proposal's open-question answer is revised

### Session 3: D-2 — `--force` flag resolution

**Goal:** Either remove `--force` from `close_session`, or hard-scope
it to admin/test use only with explicit ledger emission.

**Recommended path (hard-scope, since removal may break in-flight
sessions if the flag has callers):**
- Add `closeout_force_used` event emission to the session events
  ledger when `--force` is used; include a free-text `reason`
  argument that becomes mandatory when `--force` is used
- Add an environment-variable gate: `--force` is rejected unless
  `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` is set in the environment
- Add a loud `WARNING` log line to stdout when `--force` succeeds
- Add `closeout_force_used` to `session-state.json`'s
  `verificationVerdict` enum (or analogous field) so VS Code Session
  Set Explorer can surface a "force-closed" badge for forensic
  visibility
- Update `ai-router/docs/close-out.md` §5 (Manual close-out flags) to
  reflect the new contract: `--force` is for incident-recovery only

**Alternative path (remove):** If telemetry or grep confirms no
in-flight session sets rely on `--force`, simply remove it, update
docs and `--help`, and add a deprecation note for one release
covering anyone external to the repo.

**Acceptance:**
- Either: `--force` is hard-scoped (env-var gated + reason-required +
  ledger event + warning) OR removed entirely
- `ai-router/docs/close-out.md` reflects the resolution
- A new test exercises the chosen path

### Session 4 (optional): F-1, F-2, D-4 — Test coverage + alerting

**Goal:** Land the three follow-up items together, or any subset that
is judged worth the implementation cost.

**Deliverables:**
- **F-1:** New `TestScenario8CloseOutTriggerFailure` in
  `test_failure_injection.py` per Gemini Pro's spec (mock
  `route_fresh_close_out_turn`'s `route()` to raise; verify
  `CLOSEOUT_BLOCKED`; restart-and-recover via reconciler)
- **F-2:** New `ai-router/heartbeat_alerter.py` module that scans
  `heartbeat_status.collect_status` and emits log-ERROR + optional
  notification when any provider's `last_seen` exceeds a configurable
  threshold (default 60 minutes); wire into orchestrator-startup
  alongside the reconciler hook
- **D-4:** Extend `test_failure_injection.py` with scenarios covering
  the §2 mappings the trace currently doesn't demonstrate:
  push-status edge cases, working-tree allowlist behavior, dual-cost
  reconciliation discrepancy. (These largely already have unit-test
  coverage in `test_gate_checks.py` and `test_cost_report.py`; the
  goal here is to widen the *failure-injection* suite specifically.)

**Acceptance:**
- All three follow-ups land OR a clear note in the change-log
  explains which follow-ups were skipped and why

### Session 5: Re-audit

**Goal:** Re-route the same combined-alignment prompt through both
Gemini Pro and GPT-5.4 against the post-Sessions-1–4 implementation.
If both verdicts return FULLY ALIGNED (or ALIGNED WITH MINOR DRIFT
where the minor drift is judged acceptable), apply completion stamps
to the original proposal and to the alignment audit document.

**Deliverables:**
- Updated `docs/proposals/2026-04-30-combined-design-alignment-audit.md`
  with new Sections 6 and 7 appendices (or a new dated audit document
  alongside the original — recommended for traceability)
- If FULLY ALIGNED: completion stamp on
  `docs/proposals/2026-04-29-session-close-out-reliability.md`
  (date, set numbers, both reviewers' verdicts) and on the audit
- If still ALIGNED WITH MINOR DRIFT: explicit human decision recorded
  in the change-log for whether to declare complete or open Set 010

**Acceptance:**
- Both reviewers weigh in
- Combined design is either marked complete with both stamps, or a
  new corrective set is opened

---

## Acceptance criteria for the set

- [ ] Sessions 1–3 (corrective drift items D-1, D-2, D-3) all land
- [ ] Session 4 (follow-ups) lands or is explicitly skipped with
      written rationale
- [ ] Session 5 re-audit produces verdicts from both Gemini Pro and
      GPT-5.4
- [ ] Combined design is marked complete with two completion stamps,
      or a new corrective set is opened with written rationale

---

## Risks

- **The recommended path for D-3 revises the original proposal.**
  This is acceptable — the proposal is a design document, not a
  contract — but the revision should be loud (a "post-implementation
  revision" section in the proposal, dated and signed) so future
  audits don't re-flag the same drift.
- **The widened `(repo, branch)` lock for D-1 may surface latent
  parallel-session bugs.** Acceptable: surfacing them is the point.
  Document any discovered issues as Session 5 follow-ups.
- **Re-audit cost.** ~$0.15–$0.20 again (same prompt, same trace size).
  The alternative is single-provider verification, which the spec for
  Set 006 explicitly rejected.

---

## References

- Audit document: `docs/proposals/2026-04-30-combined-design-alignment-audit.md`
- Original proposal: `docs/proposals/2026-04-29-session-close-out-reliability.md`
- v2 plan synthesis: `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`
- Cross-provider review pattern: `C:/temp/route_combined_alignment.py`,
  `C:/temp/dabbler-combined-alignment-prompt.md`
- Set 006 Session 3 verbatim reviews: Sections 6 and 7 of the audit document

---

## Session Set Configuration

```yaml
totalSessions: 5
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```
