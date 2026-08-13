ISSUES FOUND

Fix verdict: L1 default suite input declarations are still incomplete -- fix-rejected  
Fix verdict: L2 malformed `covers` entries are reported -- fix-accepted  
Fix verdict: L3 Mocha non-`src/` inputs are declared -- fix-accepted  
Fix verdict: L4 Playwright first-run build/provisioning inputs are declared -- fix-accepted  
Fix verdict: L5 malformed fields inside usable suite entries are reported -- fix-accepted  
Fix verdict: L6 leading-`./` `covers` entries match after normalization -- fix-accepted

**Issue 1:** Pytest still does not account for real `docs/session-sets/` inputs.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `ai_router/run_of_record.py:314-347`, `ai_router/tests/test_step_status_drift.py:47-49`, `ai_router/tests/test_step_status_drift.py:475-499`, `ai_router/scripts/drift_guard.py:148-164`, `ai_router/tests/test_drift_guard.py:227-231`
- **Failure scenario:** A maintainer changes only a checked-in session-set artifact under `docs/session-sets/` and introduces drift the pytest suite is designed to catch, such as a surviving lossless status token, multiple active sets, or a set-number collision. Those files are ordinary session-set maintenance surfaces and are read by pytest, but the default pytest `covers` tuple still lacks `docs/session-sets/`, so suite selection can say pytest is not owed.
- **Acceptance criterion:** `JUDGMENT - pytest freshness selection must account for the real docs/session-sets inputs, either by declaring them with bookkeeping-aware digest exclusions or by equivalent freshness logic, so a docs/session-sets-only change that can fail pytest requires pytest without making record_run stale immediately after its own bookkeeping write.`
- **Details:** Violation: the task required “Every prefix that can change a suite's result must be declared,” while the prior L1 criterion specifically included `docs/session-sets/` for pytest. Impact: the suite-owned input map remains narrower than pytest’s real inputs, so a reasonable reviewer cannot rely on the close gate to require pytest for a common session-set-only maintenance change. Evidence: `DEFAULT_SUITES` declares pytest inputs at `ai_router/run_of_record.py:314-347` and omits `docs/session-sets/`, while `test_step_status_drift` inventories the real repo’s `docs/session-sets` and asserts no drift survives, and `drift_guard` reads the same tree for active-set/set-number checks exercised by pytest.