# Session Set: Cost Reporting + Gate Enforcement + Capacity Heartbeat

## Summary

Turn on the new behavior. After this set:
- `print_cost_report()` is dual-sourced for **outsource-first** (router-metrics canonical, activity-log supplemental, discrepancy flagging)
- A **subscription-window utilization heuristic** is added for **outsource-last** sessions (best-effort heartbeat-only — explicitly framed as "when did this provider last emit work?", not as routing intelligence)
- `mark_session_complete()` runs the gate built in Set 3; refuses to flip status when checks fail
- `--force` transitional flag exists with deprecation warning
- Each role-loop daemon writes `capacity_signal.json` after completions
- The committed `session-state.json` example is replaced with a generator script

This is the **first set with a behavior change**. Sets 1–3 shipped data structures and dormant machinery; this set wires them together. The reconciler from Set 3 means failures here have an automatic recovery path.

---

## Why this set's order matters

Per the cross-provider review's reordered sequencing: gate enforcement comes AFTER the reconciler so transient gate failures auto-recover. With the reconciler in place from Set 3, transient gate failures (push rejection, missing upstream during rebase) auto-recover; only persistent issues require human intervention.

The capacity heartbeat is in this set rather than its own set because it's tightly coupled to the role-loops (which write the signals) and to the cost report (which displays them in outsource-last context).

---

## Scope

### In scope
- Re-source `print_cost_report()` to read both `router-metrics.jsonl` (canonical) and `activity-log.json` (supplemental); flag discrepancies
- Add subscription-window utilization heuristic for outsource-last sessions (heartbeat-only framing)
- Wire `mark_session_complete()` to invoke the gate from Set 3
- `--force` transitional flag with deprecation warning
- `capacity_signal.json` writer in role-loop daemons (per-completion best-effort signal)
- Schema-drift fix: replace static `session-state.json` example with generator script
- Tests for all of the above

### Out of scope
- VS Code extension queue/capacity views — Set 5
- Workflow doc collapse — Set 6
- Removing the `--force` flag — separate follow-up commit, not in this set
- Hybrid mode — deferred per review

---

## Sessions

### Session 1: Dual-sourced `print_cost_report()` (outsource-first mode)

**Goal:** Update the cost report to read from both data sources, flag discrepancies, and clearly state which is authoritative.

**Deliverables:**
- Modify `print_cost_report(session_set_dir)` in `ai-router/__init__.py`:
  - Read routed-call costs from `router-metrics.jsonl` filtered by `session_set` (canonical billing-grade)
  - Read activity-log costs from `activity-log.json` (supplemental — captures human edits, manual costs, non-routed calls)
  - Compute both totals; compute delta
  - When `|delta| > $0.01`, print a clear warning labeled with the discrepancy direction
  - Use clear labels: `"Routed-model spend (canonical):"` vs `"Activity-log adjustments (supplemental):"`
  - Add `--format json` option
- Update `get_costs(session_set_dir)` to return both totals as a structured dict (backward-compatible: extends the existing return shape)
- Unit tests: matching totals, mismatched totals (warning fires), missing metrics file, missing activity-log, both missing
- Integration test against a real session set

**Acceptance:**
- Cost reports show both totals with clear labels
- Discrepancies > $0.01 produce a clear warning
- `--format json` output is parseable
- Existing callers of `get_costs()` continue to work

### Session 2: Subscription-window utilization heuristic + capacity_signal.json

**Goal:** Add the outsource-last cost-equivalent (subscription utilization) and the per-provider capacity heartbeat. Frame as **heartbeat-only**, NOT as routing intelligence (per GPT-5.4 review).

**Deliverables:**
- New module `ai-router/capacity.py`
- `write_capacity_signal(provider, completion_metadata)`:
  - Appends to `provider-queues/<provider>/capacity_signal.jsonl` (one JSON object per completion)
  - Fields: `timestamp`, `provider`, `task_type`, `tokens_input`, `tokens_output`, `elapsed_seconds`, `model_name`
  - Wired into role-loop daemons (Set 2) — invoked on each `complete()` call
- `read_capacity_summary(provider, lookback_minutes=60) -> CapacitySummary`:
  - Returns: `last_completion_at`, `completions_in_window`, `tokens_in_window`, `time_since_last`
  - **Explicitly does NOT predict remaining capacity** — that's not knowable from this data
- Subscription utilization heuristic for outsource-last cost reporting:
  - When session set is `outsourceMode: last`, replace USD-based `print_cost_report` with utilization-based:
    - "Sessions completed in current 5-hour window: N"
    - "Token burn rate: X tokens/min over last 60 min"
    - "Last activity: M minutes ago"
  - Frame as heartbeat: "this is a backward-looking signal; subscription provider may throttle without warning"
- Wire role-loop daemons (Set 2's `verifier_role.py` and `orchestrator_role.py`) to call `write_capacity_signal` after each `complete()`
- Unit tests: signal write/read round-trip, utilization summary calculations, edge cases (no completions, single completion)

**Acceptance:**
- `capacity_signal.jsonl` is written by both role-loops
- `read_capacity_summary` returns sensible values
- Outsource-last cost report shows utilization metrics with explicit heartbeat framing
- Documentation makes clear: this is observational data, not predictive

### Session 3: Wire `mark_session_complete()` to the gate; add `--force` transitional

**Goal:** `mark_session_complete()` now invokes the gate from Set 3. Failed checks block the status flip.

**Deliverables:**
- Modify `mark_session_complete()` in `ai-router/session_state.py`:
  - Before flipping state to `closed`, call `close_session.run_gate_checks(session_set_dir)`
  - If checks pass, proceed with the flip and append `closeout_succeeded` event
  - If checks fail and `force=False`, raise `CloseoutGateFailure` with the structured failure list; do NOT flip state
  - If checks fail and `force=True`, log a deprecation warning, append `closeout_succeeded` event with `forced: true`, proceed with flip
- New parameter `force: bool = False` on `mark_session_complete()`
- New exception class `CloseoutGateFailure(Exception)` with `.failures: List[GateCheckFailure]`
- Logger config: deprecation warning is loud (WARNING level, prefixed `DEPRECATION:`)
- Unit tests: pass case, fail without force, fail with force, multi-failure case
- Integration test: full close-out flow from disposition.json through mark_session_complete with one failing gate check

**Acceptance:**
- Calling `mark_session_complete()` without force on a session with a failing gate check raises `CloseoutGateFailure` with specific remediation strings
- Calling with `force=True` succeeds but logs the deprecation warning
- The event log records whether close-out was forced or clean
- Existing call sites continue to work; they get the gate enforcement automatically

### Session 4: Schema-drift fix — generator script for session-state.json example

**Goal:** Replace the stale static `session-state.json` example with a generator script that produces a fresh example from the current schema.

**Deliverables:**
- Find the existing committed example (search `docs/session-sets/` for stale files)
- Replace with a `README.md` pointing at the generator
- New module `ai-router/dump_session_state_schema.py`:
  - CLI: `python -m ai_router.dump_session_state_schema`
  - Emits a fully-populated v2 `session-state.json` example to stdout
  - `--write <path>` flag to write to a file
  - `--include-comments` flag adds inline comments (emits JSONC)
- CI / pre-commit check: runs the generator and compares to a reference checked-in file; fails on divergence with a message pointing at the generator
- Unit tests: generator produces valid JSON that round-trips through `read_session_state()`; output matches reference

**Acceptance:**
- Stale example is gone; replaced by README + generator
- Running the generator produces a session-state.json that the schema validators accept
- CI / pre-commit catches future schema drift

---

## Acceptance criteria for the set

- [ ] All four sessions complete with passing tests
- [ ] Cost reports surface both routed-canonical and activity-log-supplemental totals (outsource-first)
- [ ] Subscription utilization heuristic available with clear heartbeat-only framing (outsource-last)
- [ ] `mark_session_complete()` enforces gate checks; `--force` works with deprecation warning
- [ ] Stale session-state.json example replaced with generator
- [ ] All existing callers of affected APIs continue to work
- [ ] Reconciler from Set 3 successfully recovers any sessions that hit transient gate failures during this set's own implementation

---

## Risks

- **First set with behavior change.** Gate enforcement may surface latent issues. Mitigation: `--force` flag + reconciler.
- **Cost-report users may rely on old return shape.** Verify by grep'ing for callers; preserve backward compat by extending the dict, not replacing it.
- **Capacity heartbeat misuse.** Users may try to use the heartbeat data as routing intelligence. Mitigation: clear documentation + UI text explicitly says "observational only."
- **Schema-drift CI check may fail during legitimate evolution.** Document workflow: when schema changes, re-run generator and commit updated reference in same PR.

---

## References

- Set 1: `001-queue-contract-and-recovery-foundations` (data structures)
- Set 2: `002-role-loops-and-handoff` (role-loops to wire capacity signals into)
- Set 3: `003-closeout-script-and-deterministic-machinery` (gate to wire into `mark_session_complete`)
- Original close-out reliability proposal: `docs/proposals/2026-04-29-session-close-out-reliability.md`
- Plan v2 synthesis: `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`

---

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```
