# Set 009 — Alignment Audit Follow-Ups (Change Log)

**Status:** complete · 4 of 5 sessions verified (Session 4 explicitly skipped with written rationale per spec acceptance criterion)
**Started:** 2026-05-01 · **Completed:** 2026-05-01
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — all sessions
**Verifiers:** gpt-5-4 (Sessions 1–3) · gemini-pro + gpt-5-4 (Session 5 cross-provider re-audit)

This set lands the corrective work flagged by the 2026-04-30
combined-design alignment audit (`docs/proposals/2026-04-30-combined-design-alignment-audit.md`)
and re-routes the same combined-alignment prompt back through both
Gemini Pro and GPT-5.4 to verify the implementation now matches the
agreed combined design. Both reviewers returned **FULLY ALIGNED** on
independent reads of the post-Set-009 implementation.

The combined close-out reliability + outsource-last operating-mode
design is shipped and verified. Completion stamps applied to:

1. [`docs/proposals/2026-04-29-session-close-out-reliability.md`](../../proposals/2026-04-29-session-close-out-reliability.md)
2. [`docs/proposals/2026-04-30-combined-design-alignment-audit.md`](../../proposals/2026-04-30-combined-design-alignment-audit.md)
3. [`docs/proposals/2026-05-01-combined-design-realignment-audit.md`](../../proposals/2026-05-01-combined-design-realignment-audit.md)

## Summary of changes

### Session 1 — D-3: Resolve commit / push / notification ownership

**Path chosen:** (b) revise the contract (not the implementation).
The original proposal §3 named `close_session.py` as the holder of
commit, push, and notification, but the shipping implementation
deliberately did not include those code paths. Wiring them in would
have re-introduced the "verification + publishing collapse" failure
mode that GPT-5.4 originally flagged. Operator chose to revise the
contract to match what is shipping.

- **`ai-router/docs/close-out.md` Section 1** — rewritten with an
  "Ownership of commit / push / notification" subsection making the
  boundary canonical: close-out owns gate checks, verification wait,
  ledger event emission, idempotent state writes; the caller owns
  commit (before), push (before, enforced by gate), and notification
  (after success).
- **`docs/proposals/2026-04-29-session-close-out-reliability.md`** —
  new POST-IMPLEMENTATION REVISION section (dated 2026-05-01)
  supersedes §3 items 4 and 6 and points at the canonical contract.
- **`close_session.py` argparse description and `--help`** — updated
  to reflect the revised contract.
- **`_CLOSE_OUT_TURN_CONTENT` in `ai-router/close_out.py`** — fresh-
  turn prompt now explicitly directs the agent to commit and push
  before invoking close-out, and to notify after close-out succeeds.
- **`docs/ai-led-session-workflow.md` Step 8 prose** — adjusted for
  notification-after-success ordering.
- **Cross-provider verification:** routed to gpt-5-4 across two
  rounds (cost $0.1910 total).

### Session 2 — D-1: `(repo, branch)` parallel-session exclusion

**Path chosen:** (b) revise the agreed answer; document the residual
race rather than widen the lock. Adding an admission-time lock has
its own failure mode (a stranded admission lock blocking all sessions
on a branch until TTL elapses) which the operator judged worse than
the rare-but-loud push race the deterministic gate already catches.

- **`docs/proposals/2026-04-29-session-close-out-reliability.md`
  "Open questions (revised)" Q2** — rewritten to reflect the doc-only
  resolution: same-set close-out lock only; cross-set on same `(repo,
  branch)` race documented as residual; gate is the safety net.
- **`ai-router/docs/close-out.md` Section 6** — new "Cross-set
  parallelism on the same `(repo, branch)`" entry describing the
  residual race, the gate's response (loser's `git push` rejected
  non-fast-forward → `check_pushed_to_remote` surfaces with
  remediation → close_session exits 1), and the trigger to reopen
  admission-time locking if the pattern becomes routine.
- **`ai-router/tests/test_failure_injection.py
  TestScenario7CrossSetParallelRejection`** — new executable test
  that spawns two real `git` worktrees against a shared bare remote,
  has both commit on the same branch, has the first push, and
  verifies the loser's gate fails loudly with operator-actionable
  remediation. Three sub-tests (loser path, remediation message,
  winner path).
- **Cross-provider verification:** routed to gpt-5-4 across two
  rounds (cost $0.1453 total).

### Session 3 — D-2: `--force` flag resolution

**Path chosen:** (b) hard-scope rather than remove. `--force` retains
legitimate incident-recovery uses; removal would require a deprecation
cycle. Hard-scoping eliminates the "force-by-default" risk while
preserving the recovery capability.

- **`ai-router/session_events.py`** — new `closeout_force_used`
  event added to `EVENT_TYPES` (frozen-enum exception justified
  inline: `--force` use must be discoverable by forensic walk).
- **`ai-router/close_session.py`** — `--force` is now hard-scoped:
  rejected unless `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1`, mandatory
  `--reason-file`, rejected with `--interactive` / `--manual-verify` /
  `--repair`, loud WARNING log line on success, emits
  `closeout_force_used` event with the reason text.
- **`ai-router/session_state.py`** — `forceClosed: bool` flag
  threaded through `_flip_state_to_closed` and
  `mark_session_complete`; written to `session-state.json` as
  `forceClosed: true` when forced.
- **`tools/dabbler-ai-orchestration/src/types.ts` + `providers/SessionSetsProvider.ts`** —
  `forceClosed: boolean | null` field on `LiveSession`;
  `forceClosedBadge(set)` helper returns `"[FORCED]"` when forced;
  tooltip line surfaces force-close state. 4-case TS test coverage
  in `forceClosedBadge.test.ts`.
- **`ai-router/docs/close-out.md` Section 5** — rewritten with the
  hard-scoped `--force` contract; §2 flag-summary row and `--help`
  text match.
- **Tests:** new `TestForceHardScoping` cases in
  `test_close_session_skeleton.py` (env-var-missing rejection, non-`1`
  env-var rejection, reason-file-missing rejection, full happy path,
  `forceClosed: true` flag flip via `mark_session_complete`); new
  `TestGateFailWithForce` cases in `test_mark_session_complete_gate.py`.
- **Cross-provider verification:** routed to gpt-5-4 across three
  rounds (cost $0.2543 total). Round 1 raised four issues, two of
  which were context-gaps (deliverables already in place but not
  surfaced to the verifier in the prompt). Recorded as a calibration
  note in ai-assignment.md: for multi-language sessions, the prompt
  should include EVERY changed file rather than cherry-picking the
  most-relevant slices.

### Session 4 — F-1, F-2, D-4 (SKIPPED with written rationale)

The operator chose to skip Session 4 entirely per the spec's
acceptance criterion ("Session 4 (follow-ups) lands or is explicitly
skipped with written rationale"). Rationale recorded in ai-assignment.md
Session 4 SKIPPED block:

- **D-4 (failure-injection trace coverage gap):** the audit itself
  notes "the implementation behavior these scenarios would test is
  already exercised by other tests (e2e + gate-check unit tests)."
  Duplicative.
- **F-1 (close-out trigger failure scenario):**
  `test_close_out_e2e.py::test_failure_then_reconciler_recovery`
  covers the same path in unit form. Adding to failure-injection
  suite is suite-shape improvement, not behavioral coverage.
- **F-2 (heartbeat alerter):** mostly accrues to outsource-last
  session sets (long-running verifier daemons whose silent stalls
  are exactly what the alerter would catch). Set 009 is
  `outsourceMode: first`. Better landed in the first outsource-last
  set that exercises heartbeats.

The audit pre-classified all three as **FOLLOW-UP**, not corrective,
so the skip does not block re-audit alignment. Both reviewers in
Session 5 explicitly accepted all three skip rationales.

### Session 5 — Re-audit

**Both providers returned FULLY ALIGNED on independent reads.**

- **`tests/failure-injection-traces/2026-05-01-realignment/trace.txt`** —
  fresh trace artifact: 8 scenarios pass in 7.55s (was 7 at original
  audit; +TestScenario7CrossSetParallelRejection from Session 2).
- **`docs/proposals/2026-05-01-combined-design-realignment-audit.md`** —
  new dated re-audit document (recommended for traceability over
  appending to the original 2026-04-30 audit). Contains §1
  D-1/D-2/D-3 evidence, §2 Session 4 skip dispositions, §3 test count
  delta (606 → 676), §4 corrected open questions, §5 deferred items,
  §§6-7 verbatim reviews, §8 synthesis with completion decision.
- **`C:/temp/dabbler-realignment-audit-prompt.md` +
  `C:/temp/route_realignment_audit.py`** — re-audit prompt template
  and route script (same pattern as the original
  `dabbler-combined-alignment-prompt.md` and
  `route_combined_alignment.py`).
- **Cross-provider re-audit:** Gemini Pro $0.0339 + GPT-5.4 $0.1566
  = $0.1905 total. Both verdicts FULLY ALIGNED on first round; no
  retries needed.
- **Completion stamps applied** to original proposal, original audit,
  and realignment audit.

## Acceptance criteria (from spec.md)

- [x] Sessions 1–3 (corrective drift items D-1, D-2, D-3) all land.
- [x] Session 4 (follow-ups) lands or is explicitly skipped with
      written rationale. (Skipped; rationale in ai-assignment.md
      Session 4 SKIPPED block; both Session 5 reviewers accepted.)
- [x] Session 5 re-audit produces verdicts from both Gemini Pro and
      GPT-5.4. (Both: FULLY ALIGNED.)
- [x] Combined design is marked complete with two completion stamps,
      or a new corrective set is opened with written rationale.
      (Three completion stamps applied; no new corrective set
      opened.)

## Cost reflection

| Session | Routed calls | Cost |
|---|---|---|
| 1 (D-3) | 2× gpt-5-4 session-verification | $0.1910 |
| 2 (D-1) | 2× gpt-5-4 session-verification | $0.1453 |
| 3 (D-2) | 3× gpt-5-4 session-verification | $0.2543 |
| 4 | (skipped) | $0.0000 |
| 5 (re-audit) | gemini-pro + gpt-5-4 analysis | $0.1905 |
| **Set total** | | **$0.7811** |

The original 2026-04-30 audit cost $0.1540. Including this
corrective set, total spent on the close-out + outsource-last
combined design's verification work across both audits is **$0.9351**.
That is what it cost to catch and correct three drift items GPT-5.4
flagged as MATERIAL and Gemini Pro flagged as MINOR — drift the
self-audit had originally claimed was absent. The re-audit pattern
("write the doc with a self-claim and explicit `AWAITING ROUTING`
placeholders, then route") was explicitly noted by both Session 5
reviewers as an improvement over the original audit's
"declared-success-too-early" framing.

## Notes for future sets

- **The outsource-last heartbeat alerter (F-2) remains an open
  candidate.** When the next outsource-last session set opens, F-2
  should be considered for inclusion in that set's spec rather than
  carried as backlog. The alerter is most valuable where it is
  exercised, and Set 009's `outsourceMode: first` was not the right
  context for it.

- **Residual operational assumptions** baked into the chosen
  corrective paths (recorded in the realignment audit §8):
  - **D-1:** if same-branch cross-set concurrency becomes routine
    (more than ~3 push races observed in a reasonable window, OR
    operator complaints about loud-but-recoverable failure mode),
    reopen the admission-time ownership-locking question.
  - **D-2:** controls are policy/friction/telemetry, not access
    control. A determined operator can still bypass close-out; the
    hard-scope only makes it effortful and visible. Documentation
    accurately reflects this.
  - **D-3:** the revised contract is enforced by four artifacts that
    say the same thing in different forms (close-out.md Section 1,
    proposal post-impl revision, `--help` text, fresh-turn prompt
    `_CLOSE_OUT_TURN_CONTENT`, workflow-doc Step 8 prose). Future
    audits should verify all four stay in sync; if they drift apart,
    the D-3 resolution starts to leak.

- **`ai-assignment.md` was authored directly each session** rather
  than via `route(task_type="analysis")`, per the standing operator
  cost-containment rule (Set 008 first noted this; Set 009 continues
  the pattern). The Session 4 skip decision and the Session 1/2/3
  path decisions (recommended vs alternative) were surfaced to the
  operator rather than routed. When the cost-containment rule lifts,
  routed-authoring resumes per workflow Rule 17.
