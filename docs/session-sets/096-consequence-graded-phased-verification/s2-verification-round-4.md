ISSUES FOUND

Fix verdict: Round 1 malformed or unknown verifier verdicts converted to VERIFIED -- fix-accepted  
Fix verdict: Round 1 phased artifacts contaminate supplementary and remediation evidence -- fix-accepted  
Fix verdict: Round 1 per-finding remediation verdicts are observability-only -- fix-rejected  
Fix verdict: Round 1 remediation-review cycle cap is not enforced -- fix-accepted  
Fix verdict: Round 1 convergence replay overstates its comparison with Set 095 -- fix-accepted  
Fix verdict: Round 1 clean supplementary pass marks unresolved blockers VERIFIED -- fix-accepted  
Fix verdict: Round 1 remediation evidence includes post-baseline verification machinery -- fix-accepted  
Fix verdict: Round 1 rejected or omitted per-finding fixes can pass VERIFIED -- fix-rejected  
Fix verdict: Round 1 lower-cost replay comparison is unsubstantiated -- fix-accepted  
Fix verdict: Round 2 blocking verdict with unparseable findings stalls the loop -- fix-accepted  
Fix verdict: Round 3 partial or absent fix-verdict coverage remains fail-open -- fix-rejected  

- **Issue 1:** Partial per-finding fix-verdict coverage still passes as `VERIFIED`
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A remediation reviewer emits one valid `Fix verdict:` line but omits one or more other prior blocking findings, then returns `VERIFIED`. This is probable for free-form LLM output when reviewing a multi-finding ledger—especially this ledger, which contains numerous entries. The CLI only warns, exits successfully, and patches the session disposition to `VERIFIED`, allowing an unresolved Critical/Major finding to pass remediation review.
  - **Details:**
    - **Violation:** The phase contract requires: “For EACH prior blocking finding in the ledger, give a per-finding verdict.” The remediation only blocks when **zero** verdicts parse; partial coverage remains advisory.
    - **Impact:** The principal settlement gate can close despite one or more prior blockers never being reviewed. That materially defeats the no-resurrection/settlement machinery and should block merge.
    - **Evidence:** In `verify_session.py`, the `len(fix_verdicts) < expected` branch only prints `WARNING` and does not add a blocking finding or alter classification. The added test `test_partial_fix_verdict_coverage_warns` proves the fail-open behavior by providing one verdict for two prior Major findings and asserting `code == vs.EXIT_OK`.
    - **Fix:** Treat incomplete coverage as blocking whenever expected findings remain unsettled. Introduce stable finding identifiers in envelopes and require exactly one accepted/rejected/modified verdict for every active blocking ID; at minimum, the demonstrated reliable count mismatch must return `EXIT_BLOCKING` rather than merely warn.