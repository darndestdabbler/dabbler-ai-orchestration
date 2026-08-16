VERIFIED — The recorder now fails closed, capture failures degrade without destroying walkthrough output, C6 has substantive post-setup cleanup evidence, supplementary runs are evaluated, websocket mutation is pilot-only, and ffmpeg produced a decisive C1 failure. The remaining discrepancies do not change the pilot or merge verdict.

Fix verdict: L1 recorder remains unavailable while the authoritative verdict is FAIL -- fix-accepted  
Fix verdict: L2 ffmpeg fallback received a decisive fail-fast measurement -- accepted-with-modification  
Fix verdict: L3 capture failures degrade to a no-video walkthrough -- fix-accepted  
Fix verdict: L4 C6 now requires induced post-setup failure and cleanup evidence -- accepted-with-modification  
Fix verdict: L5 -- duplicate-of L1  
Fix verdict: L6 -- duplicate-of L3  
Fix verdict: L7 shipped recorder no longer enables obs-websocket -- fix-accepted  
Fix verdict: L8 -- duplicate-of L4  
Fix verdict: L9 supplementary recordings are evaluated before counting -- fix-accepted  
Fix verdict: L10 -- duplicate-of L2  
Fix verdict: L11 -- duplicate-of L1  

## NITS

- **Nit:** `tools/dabbler-ai-orchestration/scripts/measure-ffmpeg-fallback.js` does not reproduce the complete committed `s4-ffmpeg-fallback-measurement.json`: it generates only C1, C2, C3, and C7 raw fields, does not stamp the criteria SHA-256, and does not generate the committed `frameContent` or `evaluation` sections. The documentation therefore overstates “same committed criteria” and exact reproducibility. This is non-blocking because the generated C1 correlation of zero already decisively disqualifies the fallback.
- **Nit:** The induced `stop` failure in `record-vscode-walkthrough.js` occurs immediately before `capture.stopRecording()`, while `os-capture-verdict.js` labels it `postOperation`. It does not exercise an exception thrown by `stopRecording()` itself. The real stop call is nevertheless guarded, and the configure/start variants already provide the post-setup failure evidence C6 requires.
- **Nit:** The newly appended pytest entries in `test-runs.jsonl` record `-n auto`, while `decisions.jsonl` says the actual command used `-n 8`; unlike the earlier record, the new entries omit detail explaining that route substitution. The tests collected are equivalent, but the command audit field is inaccurate.