# Remediation notes — round 8 (the backstop's second fresh round)

Round 8 ran because of an orchestrator procedural error, and raised one
new point, remediated below.

- **Why the backstop re-ran despite round 7's clean VERIFIED:** the
  orchestrator logged the operator adjudication via `record_adjudication`
  with `task_type="session-verification"` AFTER round 7. That appended an
  unstamped `session-verification` metrics row, and the backstop's
  anti-rollback rule ("the latest attempt governs"; an invalid latest row
  never settles) correctly refused to settle on the older round-7 row and
  ran a fresh round. The machinery behaved as designed against the
  evidence it saw; the mistake was the orchestrator's row hygiene.
  **Follow-up (recorded for a future set):** the close-backstop evidence
  collector could exclude adjudication records (rows carrying
  adjudication fields, no stamp) from the anti-rollback "latest attempt"
  comparison — an adjudication log entry is not a verification attempt.
- **"Discovery does not implement the required raised output budget"
  (Major) — remediated to the extent that is real:** every routed call
  already runs at its model's CONFIGURED `max_output_tokens` (gpt-5-6:
  65,536); that per-model ceiling is bound by provider limits and is the
  operator's setting to raise — code cannot safely exceed it. The
  implementable half is now shipped: a documented
  `verification.discovery.min_output_tokens` floor (default 32,000) and a
  LOUD `verify_session` warning whenever a discovery call is answered by
  a model whose configured ceiling sits below it. Supporting evidence on
  probability: observed discovery responses across the S1 K=3 experiment,
  the 095-corpus replay, and this session's 8 live rounds ran under
  ~8k output tokens (an 8× margin under gpt-5-6's ceiling), zero
  truncations observed; and a truncated response was ALREADY fail-closed
  invalid evidence (load-bearing call) or a loudly-reported reduced
  fan-out (sibling call) — never silent loss. The spec-prose phrase
  "raised output budget," read as an in-code raise above the configured
  ceilings, is unimplementable-as-stated and is surfaced at the Step 9
  review as spec-wording feedback. Tests:
  `test_under_budget_discovery_verifier_warns`,
  `test_adequate_or_unresolvable_budget_stays_quiet`,
  `test_min_output_tokens_defaults_and_fails_open`.
