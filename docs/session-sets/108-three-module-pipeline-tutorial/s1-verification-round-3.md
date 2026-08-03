ISSUES FOUND

Fix verdict: L1 behavioural finish lines replace mandatory answer-key test counts -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 Windows-only happy path is disclosed before Part A -- fix-accepted  
Fix verdict: L4 Part C now separates independently testable and integrated phases -- fix-accepted  
Fix verdict: L5 rendered-DOM POC covers the four UI findings -- fix-accepted  
Fix verdict: L6 one-owner bootstrap removes concurrent manifest edits -- fix-accepted  
Fix verdict: L7 malformed-JSON response is demoted from contract behavior -- fix-rejected  
Fix verdict: L8 both service endpoints are exercised on the replacement ports -- fix-accepted

- **Issue 1: The remediation incorrectly excludes service-defined validation-error envelopes from the contract**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Session 2 follows the concluding normative statement that only success envelopes are contractual and teaches that a persistence implementation may return any body for a well-formed but invalid batch. A reader then builds an implementation that does not honor the documented validation-error envelope. This is probable because Session 2 is explicitly directed to treat this document as the settled contract, while the document now gives two contradictory rulings about that envelope.
  - **Details:**
    - **Violation:** The task requires the services’ request and response shapes to be settled. The malformed-JSON correction properly says its framework-generated body is non-contractual, but the new summary broadens that ruling to: **“Only the `4xx`/`5xx` split and the documented success envelopes are contractual.”**
    - **Location:** `s1-service-contracts.md`, “What is NOT established here,” final added bullet.
    - **Impact:** This excludes the service-defined validation-error envelope even though the same hunk says: **“The structured envelope above is what a well-formed batch that fails validation gets.”** The canonical contract is therefore internally inconsistent, leaving Session 2 unable to determine whether that documented response shape is required.
    - **Evidence:** The malformed-body section distinguishes two cases: a well-formed request that fails service validation receives the structured envelope, while malformed JSON receives a framework artifact. The concluding bullet instead excludes every documented error envelope, not merely framework-generated malformed-body output.
    - **Fix:** Limit the exclusion to framework-generated responses, for example: **“The documented service-defined success and validation envelopes are contractual; framework-generated malformed-body content types and bodies are not. The watcher contract depends only on the `4xx`/`5xx` status-class split.”**