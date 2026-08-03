VERIFIED — All ledgered fixes remain effective: finish lines are behavioural, dependencies are phase-specific, both-service repointing is evidenced, contract boundaries are consistent, and the Windows-only path is explicit. The remaining discrepancies are bookkeeping/provenance issues, not defects likely to misdirect Session 2.

Fix verdict: L1 implementation-specific test counts replaced with behavioural finish lines -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 Windows-only happy path stated before Part A -- fix-accepted  
Fix verdict: L4 Part C dependencies split correctly between stubbed and integrated phases -- fix-accepted  
Fix verdict: L5 rendered-DOM harness now supports the four UI findings -- fix-accepted  
Fix verdict: L6 shared manifest replaced with a single pre-branch bootstrap commit -- fix-accepted  
Fix verdict: L7 malformed-JSON framework output removed from the contractual response shape -- fix-accepted  
Fix verdict: L8 Part D now proves repointing both converter and persistence -- fix-accepted  
Fix verdict: L9 service-defined validation-error envelopes explicitly retained as contractual -- fix-accepted  
Fix verdict: L10 unverified non-Windows mainline removed and Windows requirement made explicit -- fix-accepted  
Fix verdict: L11 rendered-DOM evidence now has explicit provenance and execution evidence -- accepted-with-modification  

#### NITS

- **Nit:** Bookkeeping inconsistency → `ai-assignment.md` says “four rounds” and “nine distinct Major findings,” while the presented state includes `s1-verification-round-5.md` and this is round 6. Update the interim actuals before close.
- **Nit:** Scope-description inconsistency → `s1-conventions.md` still frames the work as having “one file outside the set directory,” while `ai-assignment.md` discloses two POC files. Update that heading and explanation to cover both files.
- **Nit:** Database configuration is conceptually settled but not fully mechanical → R5 names the required per-member databases without identifying the exact connection-string key or override command Session 2 should use. Add that literal when writing the tutorial so the new safeguard is directly actionable.