VERIFIED — I checked the current citation, ledger retention/backfill, metadata validation, project-guidance discovery, workflow doc, shipped ledger, config, and cited event-history surfaces. The blocking fixes hold in the current tree; no new in-hunk Critical/Major defects found.

- Fix verdict: L1 unregistered live ids now surface and count against the cap -- fix-accepted
- Fix verdict: L2 Step 9 no longer teaches `last-used-set` / elapsed-set disuse -- fix-accepted
- Fix verdict: L3 -- duplicate-of L1
- Fix verdict: L4 project-guidance ids are supported by citation, corpus scan, and validation paths -- fix-accepted
- Fix verdict: L5 unknown `cite_lessons` ids no longer create ghost ledger entries -- fix-accepted
- Fix verdict: L6 `--session` is required and no longer defaults to session 1 -- fix-accepted
- Fix verdict: L7 shipped ledger/event history contradiction is corrected -- fix-accepted
- Fix verdict: L8 executable checks no longer inherit citation history as fire history -- accepted-with-modification
- Fix verdict: L9 metadata validation now includes project-guidance by default and scans bullet-level markers -- fix-accepted

NITS:
- **Nit:** `docs/guidance-lifecycle.md` still uses an executable ledger example with a populated `uses` array; code and shipped state enforce the corrected behavior, but the example would be clearer with an instruction id or an empty executable `uses`.