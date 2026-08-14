**VERIFIED** — I checked the AST guard changes and their planted falsifiers against each ledger scenario. The remaining harness failures are caused by invalid historical acceptance commands, not by the current fix: the code now covers transitive helpers, local `Path(__file__)` roots, fixture injection, and helper-returned lazy walks.

Fix verdict: L1 helper-chain transitivity -- fix-accepted  
Fix verdict: L2 direct lazy `Path.rglob()` truthiness -- fix-accepted  
Fix verdict: L3 local `Path(__file__)` root detection -- fix-accepted  
Fix verdict: L4 -- duplicate-of L1  
Fix verdict: L5 fixture-injected repo corpus detection -- fix-accepted  
Fix verdict: L6 helper-returned lazy corpus remains lazy -- fix-accepted