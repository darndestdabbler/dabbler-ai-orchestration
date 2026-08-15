VERIFIED — I checked the current code paths for ledger reporting/counting, citation writes, project-guidance ID discovery/validation, executable fire-vs-citation separation, and the usage ledger against the close-event source. The prior blocking defects are resolved in the current tree, and I found no new Critical/Major defect in the fix hunks.

- Fix verdict: L1 live guidance ids missing from the ledger were invisible to reporting/counting -- fix-accepted
- Fix verdict: L2 workflow Step 9 used the retired `last-used-set` / set-window rule -- fix-accepted
- Fix verdict: L3 -- duplicate-of L1
- Fix verdict: L4 project-guidance ids were not supported across citation/reporting/validation -- fix-accepted
- Fix verdict: L5 `cite_lessons` wrote unknown ids before reporting not-found -- fix-accepted
- Fix verdict: L6 `--session` silently defaulted to session 1 -- fix-accepted
- Fix verdict: L7 shipped usage label contradicted close-event history -- fix-accepted
- Fix verdict: L8 executable checks could inherit citation history as fire history -- fix-accepted
- Fix verdict: L9 project-guidance ids were not validated by the metadata gate -- fix-accepted

NITS

- **Nit:** `docs/guidance-lifecycle.md:209-217` still has an older config table pointing at `guidance_config.py` / `disuse_window_sets`, while the new retention section correctly uses `guidance.retention.instruction_window_sessions`; this is cleanup-worthy but non-blocking because the operative Step 9 and primary retention section are correct.