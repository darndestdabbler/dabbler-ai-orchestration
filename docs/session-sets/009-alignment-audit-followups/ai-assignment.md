# AI Assignment Ledger — 009-alignment-audit-followups

> **Note on routing for this set.** Standing operator instruction
> (recorded in orchestrator memory, 2026-05-01) restricts ai-router
> usage to end-of-session cross-provider verification only. The
> "always route, never self-opine" rule (workflow Rule 17) is
> deliberately suspended for the duration of this constraint, and the
> per-session `Recommended orchestrator`, `Rationale`, and
> `Next-session orchestrator recommendation` blocks below were
> authored directly by the orchestrator without a routed
> `task_type="analysis"` call. Once the constraint is lifted, future
> sets should resume routed authoring; the deviation is recorded in
> the actuals on each session's block.

---

## Session 1: D-3 — Resolve commit / push / notification ownership

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Mostly doc + prompt-template editing across four canonical files
(close-out.md, the original proposal, close_session.py --help text,
the fresh-turn prompt in close_out.py) plus a small workflow-doc
prose adjustment. The work is high-context and high-stakes — the
edits define the contract every future close-out turn will follow —
but mechanical line-count is moderate. Opus at high effort handles
both the careful-wording demand and the test suite re-run cleanly.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (proposal, close_session.py, close_out.py prompt, notifications.py) | Direct (orchestrator) |
| 2 | Register Session 1 start | Direct (file-write helper, no API call) |
| 3 | Author this ai-assignment.md | Direct (router suspended per operator) |
| 4 | Revise close-out.md Section 1 (canonicalize ownership) | Direct (mechanical edit) |
| 5 | Adjust close-out.md Section 3 step 10 (remove notify from close_session's responsibilities) | Direct (mechanical edit) |
| 6 | Add post-implementation revision note to original proposal | Direct (mechanical edit) |
| 7 | Update close_session.py argparse description | Direct (mechanical edit) |
| 8 | Update `_CLOSE_OUT_TURN_CONTENT` prompt in close_out.py | Direct (template tweak; existing test asserts pointer survival) |
| 9 | Update workflow Step 8 prose on notification ordering | Direct (mechanical edit) |
| 10 | Run full pytest suite | Direct (shell command) |
| 11 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 12 | Run `close_session.py` and stamp Session 1 closed | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high
- Total routed cost: $0.1910 (two `session-verification` calls to
  GPT-5.4 — Round 1 + Round 2 after applying issue fixes)
- Deviations from recommendation: ai-assignment authoring and
  next-session recommendation produced directly rather than via
  `route(task_type="analysis")`, per the standing operator
  cost-containment rule. No other deviations.
- Notes for next-session calibration: Session 2 (D-1, `(repo, branch)`
  parallel-session lock) is heavier on test authoring than doc
  editing. Plan for an executable failure-injection scenario plus a
  new `repo_branch_lock.py` module. Same orchestrator/effort tier is
  appropriate.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Lock implementation + executable cross-set failure-injection
test is concurrency-sensitive code where a wrong call corrupts session
state. Opus at high effort matches the stakes; the test count is
small enough that runtime cost is bounded.

---

## Session 2: D-1 — `(repo, branch)` parallel-session exclusion

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Operator selected the **doc-only path** at session start (audit-accepted
alternative b): revise the contract instead of widening the lock. The
work surface narrowed to two doc edits (proposal Q2 + close-out.md
Section 6) and one new executable failure-injection test that proves
the deterministic gate catches the cross-set push race loudly. Opus
high-effort is still the right call — careful wording on the contract
revision matters because future audits will re-check it — but the
session is materially smaller than the widen-the-lock path Session 1
projected. The new test exercises real `git` subprocesses, so it must
slot cleanly into the existing `test_failure_injection.py` style.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (audit D-1 detail, proposal Q2, close-out.md §6, existing failure-injection scenarios, gate_checks API) | Direct (orchestrator) |
| 2 | Register Session 2 start | Direct (file-write helper, no API call) |
| 3 | Append this Session 2 block to ai-assignment.md (with Session 1 actuals + cost) | Direct (router suspended per operator) |
| 4 | Revise proposal "Open questions (revised)" Q2 with the doc-only resolution | Direct (mechanical edit) |
| 5 | Add Section 6 entry to ai-router/docs/close-out.md describing the cross-set residual race | Direct (mechanical edit) |
| 6 | Add `TestScenario7CrossSetParallelRejection` to test_failure_injection.py | Direct (test under ~80 lines, mechanical from existing scenarios) |
| 7 | Run full pytest suite | Direct (shell command) |
| 8 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 9 | Commit, push, run `close_session.py`, send notification | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high
- Total routed cost: TBD at close-out (verification call only)
- Deviations from recommendation: ai-assignment authoring and
  next-session recommendation produced directly rather than via
  `route(task_type="analysis")`, per the standing operator
  cost-containment rule. The path-decision (widen-lock vs doc-only)
  was surfaced to the operator rather than routed for analysis,
  also under the same constraint. No other deviations.
- Notes for next-session calibration: Session 3 (D-2, `--force` flag
  resolution) is mostly small mechanical edits across `close_session.py`,
  `close-out.md`, `session_state.py` (verdict enum or analogous field),
  the VS Code Session Set Explorer (forensic badge), and a new test.
  Workload is similar to Session 1's mix; same orchestrator/effort
  tier is appropriate.

**Next-session orchestrator recommendation (Session 3):**
claude-code claude-opus-4-7 @ effort=high
Rationale: D-2's surface spans Python (close_session args + ledger
event), TypeScript (Session Set Explorer badge for force-closed
sessions), docs, and a new test. Multi-language + careful contract
wording on a security-relevant flag — Opus high-effort is the right
match.
