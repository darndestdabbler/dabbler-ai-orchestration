**VERIFIED** — I checked the loader/gate integration, default suite declarations, prefix normalization, root-prefix handling, active-set bookkeeping exclusion, and the new falsifiers. The fixes close the ledger findings without introducing an in-hunk blocking regression.

Fix verdict: L1 default suite input declarations -- accepted-with-modification  
Fix verdict: L2 malformed `covers` entries dropped -- fix-accepted  
Fix verdict: L3 Mocha non-`src/` inputs omitted -- fix-accepted  
Fix verdict: L4 Playwright provisioning/build inputs omitted -- fix-accepted  
Fix verdict: L5 malformed fields inside suite entries accepted -- fix-accepted  
Fix verdict: L6 leading-`./` covers never match -- fix-accepted  
Fix verdict: L7 pytest `docs/session-sets/` inputs omitted -- fix-accepted  
Fix verdict: L8 unknown suite fields accepted -- fix-accepted  
Fix verdict: L9 `covers: ["./"]` matches nothing -- fix-accepted

**NITS**

- **Nit:** `docs/planning/` remains a documented, deliberate pytest-input residual rather than a declared cover, to avoid the `cite_lessons` close-flow deadlock.