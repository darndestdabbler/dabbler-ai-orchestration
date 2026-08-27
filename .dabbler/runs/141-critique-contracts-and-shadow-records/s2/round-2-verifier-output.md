ISSUES FOUND

The prior run-mutation / bare-object-as-zero-claims finding is resolved. The fix delta introduces a new contract break: invalid claims are now prevalidated outside the quarantining writer, so refused records are no longer quarantined.

- **Issue 1:** Invalid `verify prepare --claims` payloads are refused without quarantine.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/verify.py:920-931`, `ai_router/ledger.py:328-344`, `ai_router/ledger.py:476-488`, `docs/session-sets/141-critique-contracts-and-shadow-records/spec.md:230-234`
  - **Failure scenario:** A typical author hand-writes `claims.json` with a schema error such as `{"claims":[{"claim_id":"c1"}]}`. `verify prepare` now returns before any writer runs, so the bad claims record is refused but no quarantine artifact is created. Hand-authored claims are the expected input path for this new command, so malformed files are probable rather than adversarial.
  - **Acceptance criterion:** `JUDGMENT - Running verify prepare with an explicit schema-invalid claims file must leave review-run.json unopened/unchanged and must preserve the rejected review-claims payload in the ledger quarantine path with a named refusal.`
  - **Details:** **Violation:** the session contract says machine-owned critique writers must “validate against the frozen schema” and that “A record that fails validation is refused and quarantined, never partially written and never best-effort skipped.” **Impact:** the remediation fixed partial mutation by bypassing the quarantining writer, so the deliverable no longer satisfies the promised forensic/refusal contract for the most likely invalid-input path. **Evidence:** `run_prepare` calls `ledger.validate_review_claims(claims_record)` directly and returns on failure; only `_validated_or_quarantined`, used by `write_review_claims`, calls `_quarantine`.