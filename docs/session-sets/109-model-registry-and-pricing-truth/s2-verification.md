VERIFIED

The exclusion is correctly threaded through API verification, Copilot CLI verification, and tiebreaker routing, and the core excluded-provider request/metrics invariant is exercised. No Critical or Major defect is substantiated, though several non-blocking gaps and overclaims remain.

## NITS

- **Nit:** The promised exact post-fix call count is not asserted.  
  **Location:** `TestExcludedProviderNeverCalled.test_no_excluded_provider_in_trace_or_rows` only asserts that calls exist and none are Anthropic; two allowed-provider calls would pass.  
  **Fix:** Assert `len(calls) == 1` for both `complexity_hint` cases, matching the findings’ claimed post-fix result.

- **Nit:** The `is_enabled` sweep missed the tiebreaker path.  
  **Location:** `ai_router.__init__._tiebreaker_reroute` rejects missing or excluded models but still dispatches a configured tiebreaker with `is_enabled: false`. This contradicts the documented “never routed to” contract and the claim that only three bypasses existed. The shipping path is currently latent, so this is non-blocking.  
  **Fix:** Treat a disabled tiebreaker as unusable and take the existing merge fallback.

- **Nit:** The new tests do not directly prove the `verify_session` wrapper preserves the exclusion.  
  **Location:** `TestSessionVerificationPathWasNeverAffected` checks configuration and calls `ai_router.route(...)` directly, not `verify_session`. A future wrapper regression that omits its exclusion would not fail these tests.  
  **Fix:** Add a test invoking the actual `verify_session` seam and assert the exclusion reaches `route`, or narrow the documentation’s claim about what the two tests prove.

- **Nit:** The trace records dispatch attempts, not necessarily requests actually transmitted.  
  **Location:** Each provider calls `record_http_request(...)` immediately before `client.post(...)`. If `post` fails before transport transmission, the trace still reports a “real HTTPS request.”  
  **Fix:** Either describe entries as HTTP dispatch attempts or instrument the HTTPX transport/request hook where transmission begins.

- **Nit:** The claim that request counts are always at least metrics-row counts is too broad.  
  **Location:** `s2-routing-transparency-findings.md`, “A metrics row is not a request.” Copilot CLI rows can exist with zero HTTP-trace entries because that transport is deliberately not instrumented.  
  **Fix:** Qualify the statement as applying to traced API-profile HTTP calls.

- **Nit:** Test-count evidence is internally inconsistent.  
  **Location:** `s2-routing-transparency-findings.md` says the file contains 20 tests, while `s2-conventions.md` and the displayed file establish 24; the documents also variously claim 20, 22, or 24 tests in related evidence statements.  
  **Fix:** Reconcile all counts against the final collected test file and state separately how many tests fail in the falsifier run.

- **Nit:** The ContextVar isolation claim is overstated for asynchronously spawned tasks.  
  **Location:** `ai_router/call_trace.py` says one worker cannot capture another’s requests. A child asyncio task created while tracing inherits the ContextVar value, including the same mutable list.  
  **Fix:** Qualify the documentation to synchronous/thread isolation, or use task-specific immutable state if asynchronous isolation becomes required.