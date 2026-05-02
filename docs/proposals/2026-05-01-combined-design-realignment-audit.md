# Combined Design Realignment Audit (Post-Set-009 Re-Audit)

> ## ✓ COMPLETE — both providers returned FULLY ALIGNED on independent reads (2026-05-01)
>
> Gemini Pro: FULLY ALIGNED. GPT-5.4: FULLY ALIGNED. Combined design
> shipped and verified; no new corrective set opened. Verbatim reviews
> in §6/§7; synthesis and completion stamps in §8.

---

**Audit date:** 2026-05-01
**Implementation under audit:** Sets 001–009 (Sets 001–006 = original combined design; Set 009 = corrective work for the 2026-04-30 audit's drift items)
**Original audit:** [`docs/proposals/2026-04-30-combined-design-alignment-audit.md`](2026-04-30-combined-design-alignment-audit.md)
**Source proposal:** [`docs/proposals/2026-04-29-session-close-out-reliability.md`](2026-04-29-session-close-out-reliability.md)
**v2 plan synthesis:** `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`
**Failure-injection trace artifact:** `tests/failure-injection-traces/2026-05-01-realignment/trace.txt`

## Executive summary

This is the re-audit promised by Set 009 spec Session 5 ("re-route the
same combined-alignment prompt through both Gemini Pro and GPT-5.4
against the post-Sessions-1–4 implementation"). It is structured as a
focused diff against the [original 2026-04-30 audit](2026-04-30-combined-design-alignment-audit.md):
each corrective drift item (D-1, D-2, D-3) is shown to have a concrete
landing in the implementation, each follow-up item (D-4, F-1, F-2) is
shown to have an explicit disposition (skipped with written rationale
per spec acceptance criterion), and the cross-provider verification
in Sections 6 and 7 below decides whether the combined design can now
be marked complete.

**Self-claim ahead of cross-provider verdicts:**
- D-1, D-2, D-3 corrective work has landed (§1).
- D-4, F-1, F-2 follow-ups are explicitly skipped with rationale (§2).
- The full ai-router test suite is **676/676 passing** (was 606/606 at
  the original audit — +70 tests, of which 9 are directly attributable
  to D-1 and D-2 corrective work, the rest to incidental work in
  Sessions 1–3).
- Failure-injection: **8/8 scenarios pass** (was 7/7 — added
  `TestScenario7CrossSetParallelRejection` in Session 2).
- Combined-design self-claim: **FULLY ALIGNED** pending verifier
  concurrence below.

**Set 009 cross-provider verification cost so far:** $0.5906
($0.1910 Session 1 + $0.1453 Session 2 + $0.2543 Session 3). This
session adds the re-audit cost (Sections 6 and 7 below).

---

## Section 1 — Corrective drift items: how each landed

The 2026-04-30 audit §5.2 enumerated three corrective items that had
to land before the combined design could be marked complete. Each
landed in Set 009 Sessions 1–3.

### 1.1 D-3 — `close_session.py` does not own commit / push / notification (Session 1)

**Original drift:** Original proposal §3 named `close_session.py` as
the single entry point handling commit, push, and notification. The
implementation that shipped through Sets 1–5 did not. The 2026-04-30
audit §5.2 D-3 made this corrective. The audit offered two paths:
(a) wire commit/push/notify into `close_session`, or (b) revise the
contract to relocate those responsibilities to the orchestrator-level
fresh-turn prompt.

**Operator chose path (b)** — the lower-friction path consistent with
shipping behavior — and landed it in Session 1.

**Concrete landings:**

1. [`ai-router/docs/close-out.md`](../../ai-router/docs/close-out.md)
   Section 1 is rewritten with an **"Ownership of commit / push /
   notification"** subsection (lines 57–95) that explicitly states:
   - Close-out's responsibilities are gate checks, verification wait,
     ledger event emission, and idempotent state writes.
   - `git commit` and `git push` run **before** invoking `close_session`,
     enforced by `gate_checks.check_pushed_to_remote`.
   - `send_session_complete_notification` runs **after** `close_session`
     returns `succeeded`, called by the orchestrator/fresh-turn agent.
   - The boundary is treated as canonical for future audits.

2. [`docs/proposals/2026-04-29-session-close-out-reliability.md`](2026-04-29-session-close-out-reliability.md)
   has a **POST-IMPLEMENTATION REVISION** section (lines 54–114) that
   supersedes §3 items 4 and 6 and points at the canonical contract in
   close-out.md. The revision is dated, documents *why* (mixing
   publish-side effects into the gate would re-introduce GPT-5.4's
   "verification + publishing collapse" failure mode), and is loud
   enough that future audits will not re-flag the same drift.

3. `close_session.py` argparse description and `--help` text reflect
   the revised contract (close-out as the gate; caller owns side
   effects).

4. `_CLOSE_OUT_TURN_CONTENT` in [`ai-router/close_out.py`](../../ai-router/close_out.py)
   — the fresh-turn prompt — explicitly directs the agent to commit
   and push before invoking close-out and to notify after close-out
   succeeds, making the ownership boundary visible at the moment the
   agent acts.

5. [`docs/ai-led-session-workflow.md`](../ai-led-session-workflow.md)
   Step 8 prose was adjusted for notification ordering: notification
   fires **after** close-out succeeds, not before.

**Verification:** Round 2 cross-provider verification by GPT-5.4
(2026-05-01, $0.0966). All issues resolved on Round 2.

### 1.2 D-1 — `(repo, branch)` parallel-session exclusion is incomplete (Session 2)

**Original drift:** The agreed v2 answer to "concurrent worktrees:
lock or reject?" was to reject parallel sessions on the same
`(repo, branch)` via an advisory lock at session admission time.
Implementation only serialized close-out invocations on the same
session set. The 2026-04-30 audit §5.2 D-1 made this corrective. The
audit offered two paths: (a) widen the lock to acquire at session
admission, or (b) revise the agreed answer and document the residual
race explicitly.

**Operator chose path (b)** at session start. Rationale: introducing
a new admission-time lock has its own failure mode (a stranded
admission lock blocking all sessions on a branch until TTL elapses)
which is judged worse than the rare-but-loud push race the gate
already catches. The shipping operating model assumes parallel sessions
use distinct `session-set/<slug>` branches via the bare-repo +
flat-worktree layout, making the cross-set-on-same-branch case rare.

**Concrete landings:**

1. [`docs/proposals/2026-04-29-session-close-out-reliability.md`](2026-04-29-session-close-out-reliability.md)
   "Open questions (revised)" Q2 is rewritten to reflect the doc-only
   resolution (lines 707–763 — the revised answer documents the
   residual race + the gate's response to it).

2. [`ai-router/docs/close-out.md`](../../ai-router/docs/close-out.md)
   Section 6 ("Troubleshooting") gains a **"Cross-set parallelism on
   the same `(repo, branch)`"** entry (lines 471–507) describing:
   - The close-out lock is same-set-only, deliberately not scoped to
     `(repo, branch)`.
   - The deterministic gate is the residual safety net.
   - On a push race, the loser's `git push` is rejected
     non-fast-forward; `check_pushed_to_remote` surfaces the rejection
     verbatim with a concrete remediation.
   - Reopens the question if the parallel-on-same-branch pattern
     becomes routine.

3. New executable test:
   `TestScenario7CrossSetParallelRejection` in
   [`ai-router/tests/test_failure_injection.py`](../../ai-router/tests/test_failure_injection.py)
   (line 648). Spawns two real `git` worktrees against a shared bare
   remote, has both commit on the same branch, has the first push,
   then verifies that the second's `check_pushed_to_remote` predicate
   fails loudly with operator-actionable remediation rather than
   silently succeeding. Three sub-tests cover the loser path, the
   remediation message, and the winner path.

**Verification:** Round 2 cross-provider verification by GPT-5.4
(2026-05-01, $0.0268). All issues resolved on Round 2.

### 1.3 D-2 — `--force` flag on a deterministic gate (Session 3)

**Original drift:** Pre-review draft of the 2026-04-30 audit listed
`--force` removal under §5.1 as ordinary backlog. GPT-5.4 elevated
this: a bypass flag on a gate that exists *to make close-out
deterministic* is in tension with the design's intent. The audit
§5.2 D-2 made this corrective and offered two paths: (a) remove
`--force`, or (b) hard-scope it to test/admin use only with explicit
ledger emission and loud failure-state marking when used.

**Operator chose path (b)** — hard-scope. Rationale: `--force` has
legitimate incident-recovery uses; removal would require a deprecation
cycle for any external callers. Hard-scoping retains the recovery
capability while eliminating the "force-by-default" risk.

**Concrete landings:**

1. New `closeout_force_used` event added to `EVENT_TYPES` in
   [`ai-router/session_events.py`](../../ai-router/session_events.py).
   The frozen-enum addition is justified inline: `--force` use must
   be discoverable by forensic walk of the events ledger.

2. `--force` is now hard-scoped in
   [`ai-router/close_session.py`](../../ai-router/close_session.py):
   - Rejected unless `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` is set in
     the environment (line 459, `FORCE_CLOSE_OUT_ENV_VAR`).
   - Mandatory `--reason-file` argument (line 517).
   - Rejected with `--interactive`, `--manual-verify`, or `--repair`.
   - Loud `WARNING` log line on stdout when `--force` succeeds.
   - Emits a `closeout_force_used` event with the reason text into
     the session-events ledger.

3. `forceClosed: bool` flag threaded through `_flip_state_to_closed`
   and `mark_session_complete` in
   [`ai-router/session_state.py`](../../ai-router/session_state.py).
   Written to `session-state.json` as `forceClosed: true` when the
   close was forced.

4. VS Code Session Set Explorer surfaces `[FORCED]` badge:
   - `forceClosed: boolean | null` field in `LiveSession` type
     ([`tools/dabbler-ai-orchestration/src/types.ts:36`](../../tools/dabbler-ai-orchestration/src/types.ts#L36)).
   - `forceClosedBadge(set)` helper in
     [`tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts:52`](../../tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts#L52)
     returns `"[FORCED]"` when `set.liveSession?.forceClosed === true`,
     else `""`.
   - Tooltip line added at line 85 to surface the force-close state.
   - 4-case test coverage in `forceClosedBadge.test.ts`.

5. [`ai-router/docs/close-out.md`](../../ai-router/docs/close-out.md)
   Section 5 ("Manual close-out flags") is rewritten with the
   hard-scoped `--force` contract (env var requirement, reason-file
   requirement, ledger event, WARNING line, `[FORCED]` badge). The
   §2 flag-summary row and the argparse `--help` text match.

6. New `TestForceHardScoping` test cases in
   `test_close_session_skeleton.py` (lines 291, 348, 373, 417, 502)
   covering: env-var-missing rejection, non-`1` env-var rejection,
   reason-file-missing rejection, full happy path emits all artifacts
   together, `forceClosed: true` flag flip via `mark_session_complete`.
   Also new tests in `test_mark_session_complete_gate.py`
   `TestGateFailWithForce` (lines 280, 281, 326).

**Verification:** Round 3 cross-provider verification by GPT-5.4
(2026-05-01, $0.0073). Three rounds were needed because Round 1
raised four issues, two of which were context-gaps (deliverables
already in place but not surfaced to the verifier in the prompt).

---

## Section 2 — Follow-up items: explicit disposition

The 2026-04-30 audit §5.2 enumerated three follow-up items that did
not block completion. Set 009 spec made them an optional Session 4.
The operator skipped Session 4 with written rationale per the spec's
acceptance criterion ("Session 4 (follow-ups) lands or is explicitly
skipped with written rationale").

### 2.1 D-4 — Failure-injection trace coverage gap (skipped)

**Rationale:** The audit itself notes "the implementation behavior
these scenarios would test is already exercised by other tests (e2e +
gate-check unit tests). The drift is in the audit's rhetoric, not in
the implementation's correctness." D-4 is duplicative of existing
unit-test coverage in `test_gate_checks.py` and `test_cost_report.py`.
The widening of the failure-injection suite specifically is worthwhile
but not corrective.

**Skip recorded in:**
[`docs/session-sets/009-alignment-audit-followups/ai-assignment.md`](../session-sets/009-alignment-audit-followups/ai-assignment.md)
"Session 4 SKIPPED" block.

### 2.2 F-1 — Failure-injection scenario for close-out trigger failure (skipped)

**Rationale:**
[`ai-router/tests/test_close_out_e2e.py::test_failure_then_reconciler_recovery`](../../ai-router/tests/test_close_out_e2e.py)
covers the same path in unit form. Adding the same scenario to the
failure-injection suite is worthwhile coverage but does not block
completion. Operator deferred for cost-containment reasons.

**Re-evaluate trigger:** if a regression in the fresh-turn-failure
recovery path occurs and is not caught by the existing e2e test,
reopen as F-1 or fold into a future failure-injection widening set.

### 2.3 F-2 — Automated alerting on stale provider heartbeats (skipped)

**Rationale:** Set 009 is `outsourceMode: first` (synchronous per-call
routing, no long-running verifier daemons in this set's scope). The
heartbeat alerter mostly accrues value to **outsource-last** session
sets, where a silently dead daemon is exactly what the alerter would
catch. Better landed in the first outsource-last set that exercises
heartbeats.

**Re-evaluate trigger:** the next outsource-last session set; F-2
should be considered for inclusion in that set's spec.

---

## Section 3 — Test count and trace

| Metric | At 2026-04-30 audit | At 2026-05-01 re-audit | Delta |
|---|---|---|---|
| ai-router test suite | 606 passing | **676 passing** | +70 |
| Failure-injection scenarios | 7 passing | **8 passing** | +1 (Scenario 7) |
| Failure-injection runtime | 6.42s | 7.55s | +1.13s |

The delta of +70 tests is split:
- **9 directly from corrective work** in Sessions 1–3 (4 force-flag
  tests in `test_close_session_skeleton.py`, 4 `forceClosedBadge`
  TS tests, 1 cross-set parallel rejection in `test_failure_injection.py`).
- **~61 from incidental work** in Sessions 1–3 (test refactors,
  fleshing out edge cases discovered during corrective work).

**Trace artifact (verbatim, 8 tests):**

```
ai-router/tests/test_failure_injection.py::TestScenario1LeaseExpiration::test_killed_verifier_lease_expires_then_second_verifier_completes PASSED [ 12%]
ai-router/tests/test_failure_injection.py::TestScenario2HeartbeatTimeoutEscalation::test_repeated_lease_expiry_transitions_to_timed_out PASSED [ 25%]
ai-router/tests/test_failure_injection.py::TestScenario3TruncatedSQLiteRecovery::test_kill_during_complete_recovers_via_wal_replay PASSED [ 37%]
ai-router/tests/test_failure_injection.py::TestScenario4CLISessionReset::test_kill_daemon_then_restart_completes_message PASSED [ 50%]
ai-router/tests/test_failure_injection.py::TestScenario5ConcurrentClaims::test_two_workers_race_exactly_one_wins PASSED [ 62%]
ai-router/tests/test_failure_injection.py::TestScenario6ModeSwitchMidSet::test_invalid_outsource_last_spec_raises_at_route_time PASSED [ 75%]
ai-router/tests/test_failure_injection.py::TestScenario7CrossSetParallelRejection::test_loser_of_push_race_gate_fails_loud PASSED [ 87%]
ai-router/tests/test_failure_injection.py::TestInProcessLifecycleSmoke::test_run_one_completes_pre_enqueued_message PASSED [100%]

8 passed in 7.55s
```

Full trace: `tests/failure-injection-traces/2026-05-01-realignment/trace.txt`.

---

## Section 4 — Open questions: re-resolved

The 2026-04-30 audit §3 listed 9 resolved open questions, with rows
2 and 7 flagged by GPT-5.4 as imprecise. Both are now corrected.

| # | Question | Resolution at re-audit | Status vs. original audit |
|---|---|---|---|
| 1 | Should `close_session` be human-invokable? | Yes | unchanged |
| 2 | Heuristic for skipping fresh close-out on short sessions? | Always invoke the close-out hook; outsource-first routes a fresh turn, outsource-last self-invokes in-process | **CORRECTED in Session 1** (close-out.md Section 1 makes the per-mode behavior explicit) |
| 3 | Should gate failure list be machine-readable? | Yes (`--json`) | unchanged |
| 4 | Log `nextOrchestrator` recommendations in router-metrics? | Yes | unchanged |
| 5 | Sessions ending without next-session work (final)? | `nextOrchestrator: null` allowed; `change-log.md` required | unchanged |
| 6 | Where does the reconciler run? | (b) in-orchestrator sweeper | unchanged |
| 7 | Concurrent worktrees: lock or reject? | **Doc-only resolution.** Close-out lock serializes same-set close-out only; cross-set on same `(repo, branch)` race is the residual; the deterministic gate (`check_pushed_to_remote`) is the safety net. Documented in close-out.md Section 6 + proposal Q2. Exercised by `TestScenario7CrossSetParallelRejection`. | **CORRECTED in Session 2** (proposal Q2 + close-out.md §6 now explicit) |
| 8 | `disposition.json` lifecycle? | Keep forever (audit trail) | unchanged |
| 9 | Lifecycle ledger storage format? | Separate `session-events.jsonl` per set | unchanged |

All 9 questions now resolved with answers consistent with shipping
behavior.

---

## Section 5 — Deferred items (re-confirmed)

The 2026-04-30 audit §5.1 listed two already-known deferrals that
both reviewers confirmed acceptable. Both remain deferred:

- **Re-enable hybrid mode (`tiebreakerFallback: api`).** Defer
  indefinitely.
- **Additional semantic validators on `nextOrchestrator.reason`.**
  Filed as low-priority follow-up.

D-2 (`--force` flag) was elevated from §5.1 to §5.2 in the original
audit and has now landed (§1.3 above). It is no longer a deferral.

---

## Section 6 — Gemini Pro re-audit (verbatim)

> Saved at `C:\temp\realignment-review-gemini-pro.md` at runtime;
> preserved here for the document's self-contained record.
> Cost: $0.0339 (input=19077, output=1001, 27.4s).

An assessment of the Cross-Provider Realignment Audit follows.

### 1. D-1 Landing (`(repo, branch)` parallel-session exclusion)

The resolution is valid. The original audit's corrective work for D-1 offered two paths: "(a) widen the lock... or (b) revise the agreed answer... and document the residual race explicitly." The operator chose path (b). This path was explicitly permitted. The implementation provides:
*   **Documentation:** Clear statements of the revised contract in `close-out.md` and the original proposal.
*   **Executable Proof:** `TestScenario7CrossSetParallelRejection` directly exercises the residual race (a cross-set push race on the same branch) and verifies that the deterministic gate (`check_pushed_to_remote`) correctly fails for the loser.

The chosen path and its implementation fully address the D-1 drift item.

### 2. D-2 Landing (`--force` flag)

The resolution is valid. The hard-scoping measures create sufficient friction and auditability to address the original concern. A caller cannot use `--force` casually; they must:
1.  Set a specific environment variable (`AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1`).
2.  Provide a justification in a separate file via `--reason-file`.

This friction effectively moves the flag from a general-purpose bypass to an incident-recovery tool. The addition of the `closeout_force_used` ledger event and the `[FORCED]` UI badge provides the necessary audit trail and visibility. This implementation fully addresses the D-2 drift item.

### 3. D-3 Landing (commit/push/notification ownership)

The resolution is valid. The original audit offered path (b), "explicitly revise the combined design," which the operator chose. The contract revision is documented in five distinct locations, including a loud `POST-IMPLEMENTATION REVISION` section in the original proposal and a rewrite of the canonical `close-out.md`. This is sufficient to prevent future audits from re-flagging the same drift.

The `_CLOSE_OUT_TURN_CONTENT` prompt explicitly directs the agent to call the notification function *after* `close_session` succeeds, confirming the notification function was not orphaned but relocated, consistent with the revised contract. This implementation fully addresses the D-3 drift item.

### 4. Session 4 Skip Rationale

The rationales for skipping the three follow-up items are acceptable.
*   **D-4 (Failure-injection gap):** The rationale that the behavior is already covered by other unit tests is valid. Classifying the migration of existing test coverage into a different suite as a non-blocking follow-up is a reasonable engineering decision.
*   **F-1 (Failure-injection for close-out trigger):** Same as D-4. The critical recovery path is already covered by an e2e test. Deferring the addition of a redundant test in a different suite for cost reasons is acceptable.
*   **F-2 (Automated heartbeat alerting):** The rationale to tie this feature to the first `outsource-last` session set (where it accrues the most value) is architecturally sound.

### 5. Self-Claim Accuracy

The re-audit document does not overclaim. Unlike the original audit, which was flagged for overstating alignment, this document accurately represents the work done. It directly references the original drift items, cites specific and relevant implementation artifacts for each fix, and provides sound reasoning for its claims. The self-claim of `FULLY ALIGNED` is supported by the evidence presented.

### 6. "Open Questions" Section Corrections

The corrections to the "Open questions" table are accurate.
*   **Question 2 (Close-out heuristic):** The revised answer correctly distinguishes the behavior between `outsource-first` (routes a fresh turn) and `outsource-last` (self-invokes in-process), matching the implementation described for the D-3 fix.
*   **Question 7 (Concurrent worktrees):** The revised answer accurately describes the doc-only resolution, the role of the deterministic gate as the safety net, and the new test scenario, matching the implementation of the D-1 fix.

### 7. Other Observations

The quality of the re-audit document and the corrective work is high. The implementer not only addressed the specific drift items but also added comprehensive documentation, executable tests, and UI visibility changes that demonstrate a thorough understanding of the original audit's intent. The process of cross-provider audit, corrective work set, and re-audit appears to have successfully converged the implementation with the design.

Verdict: `FULLY ALIGNED`

---

## Section 7 — GPT-5.4 re-audit (verbatim)

> Saved at `C:\temp\realignment-review-gpt-5-4.md` at runtime;
> preserved here for the document's self-contained record.
> Cost: $0.1566 (input=16921, output=7619, 117.4s).

## 1. Corrective items

### D-1 — `(repo, branch)` parallel-session exclusion
- **Issue →** No material issue. Session 2 took **accepted path (b)** from the original audit: revise the agreed answer, document the residual race explicitly, and add an executable test. `TestScenario7CrossSetParallelRejection` exercises the right failure mode for that path: two actors on the same branch, one wins the push, the loser is rejected loudly by the deterministic gate with remediation. It does **not** prove admission-time exclusion, but it no longer needs to, because the contract was explicitly revised away from that requirement.
- **Location →** Original audit §5.2 D-1; realignment audit §1.2; realignment audit §4 row 7.
- **Fix →** None.

### D-2 — `--force` on a deterministic gate
- **Issue →** No material issue. The hard-scope is tight enough to answer the original concern. `--force` is no longer a casual normal-path bypass: it requires an explicit env-var opt-in, a reason file, emits a dedicated ledger event, marks session state as forced, prints a warning, and surfaces a UI badge. That is friction + auditability + visible state contamination, which is what the accepted corrective path required. This is not strong authorization, but GPT-5.4's original objection was about an easy operational bypass, and that concern is meaningfully addressed.
- **Location →** Original audit §5.2 D-2; realignment audit §1.3.
- **Fix →** None.

### D-3 — commit / push / notification ownership
- **Issue →** No material issue. Session 1 took **accepted path (b)**: revise the contract instead of wiring side effects into `close_session.py`. The revision is loud enough to prevent the same re-flag: canonical ownership text in `close-out.md`, a dated proposal-level post-implementation revision that supersedes the old framing, matching CLI help text, matching fresh-turn prompt text, and workflow-doc ordering correction. The notification path evidence is contract-level rather than a direct code-call citation, but that is consistent with the chosen path: ownership moved to the orchestrator / fresh-turn caller, not into `close_session`.
- **Location →** Original audit §5.2 D-3; realignment audit §1.1.
- **Fix →** None.

## 2. Follow-up skip rationales

### D-4 — failure-injection trace coverage gap
- **Issue →** Skip rationale is acceptable. The original audit already classified this as a **follow-up**, not corrective work, because the gap was in the audit's breadth claims, not in implementation correctness. Deferring extra failure-injection scenarios while relying on existing unit/e2e coverage is consistent with that classification.
- **Location →** Original audit §5.2 D-4; realignment audit §2.1.
- **Fix →** None.

### F-1 — failure-injection scenario for close-out trigger failure
- **Issue →** Skip rationale is acceptable. There is already explicit e2e-style coverage for the recovery path; the deferred work is suite-shape improvement, not missing behavioral coverage. "Cost containment" by itself would be weak, but here it is paired with existing test coverage, which makes the deferral reasonable.
- **Location →** Original audit §5.2 F-1; realignment audit §2.2.
- **Fix →** None.

### F-2 — automated alerting on stale heartbeats
- **Issue →** Skip rationale is acceptable. This remains an additive operational enhancement, not a corrective alignment gap. Deferring it to the first outsource-last-heavy set is a scope-based rationale, not a hand-wave.
- **Location →** Original audit §5.2 F-2; realignment audit §2.3.
- **Fix →** None.

## 3. Self-claim / overclaim check

- **Issue →** No material overclaim. Unlike the prior audit, this document does not claim completion in the face of unresolved drift; it claims the corrective items landed, explicitly notes that Sections 6–8 await verifier input, and frames `FULLY ALIGNED` as pending independent concurrence. That is aggressive but not deceptive.
- **Location →** Realignment audit Executive Summary; §§6–8.
- **Fix →** Optional only: in future, label the pre-verdict status as "provisional self-assessment" instead of "self-claim: FULLY ALIGNED pending verifier concurrence."

## 4. Open-question corrections

### Question 2 — close-out hook behavior
- **Issue →** Corrected wording is now consistent with shipping behavior. It now says "always invoke the close-out hook," with outsource-first routing a fresh turn and outsource-last self-invoking in-process. That fixes the original imprecision.
- **Location →** Realignment audit §4 row 2.
- **Fix →** None.

### Question 7 — concurrent worktrees
- **Issue →** Corrected wording is now consistent with the chosen resolution. It no longer overstates the system as admission-time rejecting same-branch parallelism; it explicitly records the same-set-only lock and the residual cross-set race handled by the push gate.
- **Location →** Realignment audit §4 row 7.
- **Fix →** None.

## 5. Pushback / residual risks that remain but are no longer drift

- **Issue →** D-1's "fix" is an explicit acceptance of residual race, not true concurrency prevention. That is fine because the original audit allowed that path, but it should still be treated as an operational assumption: if same-branch cross-set concurrency becomes common, reopen admission-time ownership locking.
- **Location →** Realignment audit §1.2; §4 row 7.
- **Fix →** No immediate fix. Reopen only if usage patterns change.

- **Issue →** D-2's controls are policy/friction/telemetry, not access control. That is enough for alignment here, but it should not be described as impossible for an operator to misuse.
- **Location →** Realignment audit §1.3.
- **Fix →** No immediate fix. Keep the documentation precise about what the controls do.

- **Issue →** D-3 now depends on a documented ownership boundary and prompt compliance rather than a single code path. That is acceptable under the revised contract, but future audits should keep the prompt/help/doc/workflow quartet in sync.
- **Location →** Realignment audit §1.1.
- **Fix →** No immediate fix.

## 6. Bottom line

- The three corrective items **did land**.
- The operator used an explicitly accepted path for **D-1** and **D-3**.
- The hard-scoping for **D-2** is sufficient to address the original concern in practice.
- The Session 4 skips are justified and remain within the original audit's follow-up classification.
- The re-audit document does **not** materially repeat the prior audit's overclaiming problem.

Verdict: FULLY ALIGNED

---

## Section 8 — Synthesis and completion decision

**Both reviewers returned `FULLY ALIGNED`** on independent reads of
the same prompt. The combined design is hereby marked complete.

**Verdict summary:**

| Reviewer | Original audit verdict (2026-04-30) | Re-audit verdict (2026-05-01) |
|---|---|---|
| Gemini Pro | ALIGNED WITH MINOR DRIFT (F-1, F-2) | **FULLY ALIGNED** |
| GPT-5.4 | MATERIAL DRIFT (D-1, D-2, D-3, narrowness in §4) | **FULLY ALIGNED** |

**Re-audit cost:** $0.0339 (Gemini Pro) + $0.1566 (GPT-5.4) =
**$0.1905 total** — within the $0.18–$0.26 estimate stated in
ai-assignment.md and at the upper end of the spec's original
$0.15–$0.20 budget.

**Aggregate Set 009 cross-provider verification cost:**
$0.5906 (Sessions 1–3) + $0.1905 (Session 5) = **$0.7811**.

### Residual risks (recorded by GPT-5.4 §5; not drift)

The following are operational assumptions baked into the chosen
corrective paths. They are NOT drift and do NOT block completion;
they are conditions under which the corrective decisions should be
revisited:

1. **D-1 residual race acceptance.** The chosen path documents the
   cross-set push race rather than preventing it. If the
   parallel-on-same-branch pattern becomes routine rather than
   incidental, reopen the admission-time ownership locking question.
   Trigger: more than ~3 cross-set push races observed in a
   reasonable observation window, OR operator complaints about the
   loud-but-recoverable failure mode.
2. **D-2 controls are policy/friction/telemetry, not access control.**
   An operator who *wants* to bypass close-out can still set the env
   var, write a reason file, and proceed. The hard-scope makes this
   effortful and visible (ledger event + `[FORCED]` badge), but it
   does not prevent the determined operator. The realignment audit
   §1.3 wording reflects this accurately.
3. **D-3 depends on prompt/help/doc/workflow quartet staying in sync.**
   The revised contract is enforced by four artifacts that say the
   same thing in different forms (close-out.md Section 1, original
   proposal post-impl revision, `--help` text, fresh-turn prompt
   `_CLOSE_OUT_TURN_CONTENT`, and the workflow-doc Step 8 prose).
   Future audits should keep them in sync; if they drift apart, the
   D-3 resolution starts to leak.

### Completion stamps applied

This audit's verdicts trigger completion stamps on three documents:

1. [`docs/proposals/2026-04-29-session-close-out-reliability.md`](2026-04-29-session-close-out-reliability.md)
   — original proposal, marked complete.
2. [`docs/proposals/2026-04-30-combined-design-alignment-audit.md`](2026-04-30-combined-design-alignment-audit.md)
   — original audit, marked complete (corrective work has landed).
3. This document — realignment audit, marked complete (verdicts
   recorded).

The combined close-out reliability + outsource-last operating-mode
design is **shipped and verified**. No new corrective set is opened.
