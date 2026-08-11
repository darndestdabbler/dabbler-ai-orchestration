VERIFIED — I checked the Session 3 plan against `ai_router/session_projection.py`, `ai_router/session_checklist.py`, `close_session.py`, the schema doc, parity tests, and the remaining Work Explorer surfaces. The required Python projection, schema, parity proof, absence states, close-time write path, and Python `<- here` removal are present; I found no Critical/Major issue.

NITS

- **Nit:** `read_activity_log` / projection reads do not catch `UnicodeDecodeError`, so an invalid-UTF-8 JSON file crashes instead of reporting `unreadable`. Ordinary malformed JSON is handled, and byte-level corruption of machine-written UTF-8 logs is low-probability, so this is non-blocking.
- **Nit:** Some active TypeScript comments still say `markHere` mirrors `session_checklist._mark_here` / that Python still prints `<- here`, even though the Python marker was removed. This is a known deferred extension-carve residual, not a Session 3 blocker.