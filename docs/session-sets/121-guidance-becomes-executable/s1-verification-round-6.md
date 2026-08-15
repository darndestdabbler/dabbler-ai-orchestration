**VERIFIED** — I checked the fix delta in `ai_router/corpus_scan_guard.py` and the focused planted falsifiers. The materialization wrapper now prevents helper-returned laziness from leaking through `list`/`sorted`/comprehension materializers without reopening the earlier silent-scan false negatives.

- Fix verdict: L1 transitive helper/layered repo scan detection -- fix-accepted
- Fix verdict: L2 lazy `Path.rglob()` bare assertion rejected -- fix-accepted
- Fix verdict: L3 local `Path(__file__)` repo root scan detection -- fix-accepted
- Fix verdict: L4 -- duplicate-of L1
- Fix verdict: L5 pytest fixture-provided repo corpus detection -- fix-accepted
- Fix verdict: L6 helper-returned lazy corpus remains lazy -- fix-accepted
- Fix verdict: L7 materialized lazy-helper corpus assertion accepted -- fix-accepted