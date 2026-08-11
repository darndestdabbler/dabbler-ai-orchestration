VERIFIED — I checked the committed projection implementation, Python checklist marker removal, close-session write integration, schema docs, and parity tests. I found no Critical/Major defect that should block this pre-close review; the remaining TypeScript `markHere` path is explicitly scoped to the later extension carve.

NITS

- **Nit:** Invalid UTF-8 in `activity-log.json` or `session-progress.json` can raise `UnicodeDecodeError` instead of being classified as `unreadable` (`ai_router/session_checklist.py`, `ai_router/session_projection.py`). This is a low-probability corrupt-file edge, not a blocker.