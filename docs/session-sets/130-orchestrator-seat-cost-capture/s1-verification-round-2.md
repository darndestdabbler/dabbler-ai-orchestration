VERIFIED — I checked the reader, tests, packaging/data inclusion, and the related docs/spec surfaces for new blocking defects; I did not find any new Critical or Major issue beyond the already-reported component-name mismatch.

NITS:
- `spec.md` still says non-Copilot engines resolve to `not_applicable`, while the implementation/tests correctly use `unavailable`; this is prose-only drift.
- `seat_cost.py`’s module docstring mentions `live=True`, but the public API uses `live_session_ids`.