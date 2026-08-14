ISSUES FOUND

**Issue 1:** The A1 import/sole-cover map misses real dynamic imports from `test_entry_points.py`.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/118-test-retirement-and-coupling-budget/spec.md:284`, `docs/session-sets/118-test-retirement-and-coupling-budget/spec.md:296`, `ai_router/suite_inventory.py:533`, `ai_router/tests/test_entry_points.py:55`, `pyproject.toml:68`, `docs/session-sets/118-test-retirement-and-coupling-budget/inventory-snapshot.json:84`, `docs/session-sets/118-test-retirement-and-coupling-budget/inventory-snapshot.json:1587`
- **Failure scenario:** Session 2/3 consumes the inventory’s A1 map and treats `ai_router/report.py` as uncovered, even though `test_entry_points.py` dynamically imports the `report = "ai_router.report:main"` console-script target. This is probable because the delivered snapshot already shows `test_entry_points.py` with `"imports": []` and lists `ai_router/report.py` under `uncoveredModules`.
- **Acceptance criterion:** `JUDGMENT - The inventory accounts for pyproject-driven entry-point imports so the record for test_entry_points.py includes ai_router/report.py and ai_router/report.py is no longer reported as uncovered.`
- **Details:** **Violation:** the spec requires “the production modules it imports” and a per-test-file “sole cover” flag. **Impact:** the highest-consequence A1 surface is false for a real suite import pattern, so later retirement/coverage decisions can be made from incorrect data. **Evidence:** `suite_inventory.py` only records `importlib.import_module(...)` when the argument is a literal; `test_entry_points.py` imports each `module_path` loaded from `[project.scripts]`, including `ai_router.report:main`; the snapshot nevertheless records no imports for that test and reports `ai_router/report.py` uncovered.

**NITS**
- **Nit:** `guard.heuristic`’s published predicate text still names bare “resurrection” as a docstring signal, while the implementation and tests deliberately exclude bare resurrection and only keep narrower signals such as `anti-resurrection`.
- **Nit:** The D4 “enumerates real tree” label can be overread: it detects enumeration syntax in the test file, not indirect enumeration through production scanners. That is explicit enough not to block, but the findings should avoid treating the strong tier as all real-tree enumeration.