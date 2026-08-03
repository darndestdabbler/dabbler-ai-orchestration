ISSUES FOUND

Fix verdict: L1 implementation-specific test counts as finish lines -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 Windows-only prerequisite remediation adds an unverified container mainline -- fix-rejected  
Fix verdict: L4 Part C independence contradicted its integration finish line -- fix-accepted  
Fix verdict: L5 POC stopped before the rendered UI -- fix-accepted  
Fix verdict: L6 independent workflow required concurrent manifest edits -- fix-accepted  
Fix verdict: L7 malformed-JSON exception dump was treated as contractual -- fix-accepted  
Fix verdict: L8 persistence-service repoint was not demonstrated -- accepted-with-modification  
Fix verdict: L9 validation-error envelopes were excluded from the contract -- fix-accepted

- **Issue 1: The Windows-only correction introduces an unverified non-Windows mainline**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Session 2 follows R8b and tells macOS and Linux readers that setting `DABBLER_PIPELINE_SQL=container` and installing a container engine is sufficient and that “everything else in the tutorial is identical.” Those readers then reach persistence without a demonstrated container startup, image, connection, or platform-compatible database path. This is probable because R8b explicitly directs Session 2 to place this fork before Part A, while all recorded service and Part D evidence used LocalDB.
  - **Details:**
    - **Violation:** The task requires a “single happy path (LocalDB + drop folder),” and the remediation itself says “a container on the happy path is an explicit non-goal.” R8b nevertheless mandates a pre-Part-A container fork and asserts that “everything else in the tutorial is identical.”
    - **Location:** `s1-walk-outline.md`, R8b, especially the paragraph beginning “The non-Windows fork is stated BEFORE Part A.”
    - **Impact:** Session 2 would publish a second, reader-facing execution path that Session 1 did not establish. A non-Windows reader can be promised a supported route that fails at Part B, recreating the exact mid-course stall L3 was intended to prevent.
    - **Evidence:** The evidence table records LocalDB verification and LocalDB-backed Part D runs, but no container execution. The conventions’ established facts likewise contain no container-path proof. The outline simultaneously labels the container happy path out of scope.
    - **Fix:** State prominently that the tutorial’s happy path requires Windows 10/11, .NET 10, and LocalDB. Keep the container route in the appendix and avoid claiming it is identical unless its complete setup and pipeline behavior are separately verified.

#### NITS

- **Nit:** `s1-conventions.md` says Part D was proven “for BOTH services, twice,” but Run 1 exercised only the converter; only Run 2 exercised both services. The persistence repoint itself is now demonstrated, so this does not invalidate L8’s substantive fix.