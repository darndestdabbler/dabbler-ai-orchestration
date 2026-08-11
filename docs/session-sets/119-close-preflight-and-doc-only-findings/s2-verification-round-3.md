**ISSUES FOUND**

Fix verdict: L1 would-route backstop no longer reports `verification_integrity` as blocking -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 backstop-written bookkeeping is passed to `working_tree_clean` on reruns -- fix-accepted  
Fix verdict: L4 removed mixed-session `--session-number` override instead of relabeling one row -- fix-accepted  
Fix verdict: L5 set-terminal policy gates are present but do not mirror close-session posture -- fix-rejected

**Issue 1:** `close_preflight` hard-blocks required terminal policy gates in headless mode even though `close_session` soft-warns and succeeds.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/close_preflight.py:466`, `ai_router/close_session.py:2059`, `ai_router/close_session.py:2164`, `ai_router/tests/test_path_aware_critique_close_gate.py:204`, `ai_router/tests/test_contract_gate_close.py:200`
- **Failure scenario:** A terminal set with `pathAwareCritique: required` or `contractGate: required` and no artifact/floor runs preflight from the normal headless agent/CI context. `close_preflight` exits 1 and reports a blocking unmet gate, but the same `close_session` default non-TTY path only emits a soft warning and succeeds. This is probable because `close_session` defaults to non-interactive operation and agents run non-TTY.
- **Acceptance criterion:** `JUDGMENT - For terminal required path-aware-critique and contract gates, close_preflight must classify blocking vs advisory according to the same TTY/headless or equivalent close_session invocation posture, not solely by policy level.`
- **Details:** **Violation:** the preflight contract says it “can never refuse something the close allows,” while `close_session` explicitly soft-warns required terminal gates in non-TTY/`--accept-suggestions`. **Impact:** a normal headless operator gets a false blocking preflight and may be prevented from closing a session that `close_session` would accept. **Evidence:** `close_preflight` sets `blocking=(level == required_level)` unconditionally, while `close_session` checks `not sys.stdin.isatty()` and treats required failures as soft warnings.

**Issue 2:** JSON output still reports `"would_close": true` for the backstop-would-route state that the human renderer correctly says is “NOT yet decided.”
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/close_preflight.py:233`, `ai_router/close_preflight.py:744`, `ai_router/tests/test_close_preflight.py:787`
- **Failure scenario:** A clean API session with no stamped verification evidence uses `--json` to drive automation. The payload says `"would_close": true` while also saying `backstop_would_route: true`; the backstop verdict does not exist yet and may fail, so automation can wrongly treat the close as decided and spend the routed round the tool is meant to surface before close. This is probable because `--json` is the machine-readable interface and this no-evidence API path is the central expensive case.
- **Acceptance criterion:** `JUDGMENT - In the backstop_would_route state, JSON must not claim the close is decided/closeable; its boolean/status fields must match the human renderer’s “not yet decided” semantics.`
- **Details:** **Violation:** the fix adds `backstop_would_route` and renderer text saying the close is not decided, but leaves `would_close` as `not self.unmet_blocking`. **Impact:** machine consumers receive the opposite conclusion from the human report on the most important preflight scenario. **Evidence:** `to_dict()` sets `"would_close": not self.unmet_blocking`, while `render()` separately handles `report.backstop_would_route` as “NOT yet decided.”