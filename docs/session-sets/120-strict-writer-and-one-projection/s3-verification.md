**VERIFIED** — I checked the Session 3 plan against the actual projection, checklist, close-time write, exemption plumbing, schema docs, and parity tests. The required Python-side projection, absence states, renderer parity proof, and `<- here` removal are implemented with no substantiated Critical/Major defects.

**NITS**

- **Nit:** `ai_router/session_checklist.py:245` still explains collapse behavior in terms of stranding the removed `<- here` marker. The code is correct; the comment should now say it avoids duplicate/stale row status.
- **Nit:** the extension comments still say `markHere` mirrors `session_checklist._mark_here`, which is no longer true. This is non-blocking because extension changes are explicitly out of scope and the divergence is documented.