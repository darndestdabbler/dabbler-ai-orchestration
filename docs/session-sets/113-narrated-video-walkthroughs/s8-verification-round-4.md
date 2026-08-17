**VERIFIED** — I checked the fix hunks for guard-aborted recordings, C5 recorder-level dependency measurement, waiver scope/criteria coverage, and the run-count bar. The fixes resolve the ledger findings without introducing a blocking in-hunk defect.

Fix verdict: L1 guard-aborted gdigrab partial no longer registered as normal video -- fix-accepted  
Fix verdict: L2 waiver now checked against backend, digest, and unmet criteria -- fix-accepted  
Fix verdict: L3 missing ffmpeg/ffprobe now measured through the recorder path -- fix-accepted  
Fix verdict: L4 waiver refuses failed run-count bar even when criteria are covered -- fix-accepted

NITS

- **Nit:** `s8-gdigrab-outcome.md` still carries a few pre-rerun measurement numbers while the JSON artifact has newer values; the conclusions are unchanged, so this is documentation cleanup only.