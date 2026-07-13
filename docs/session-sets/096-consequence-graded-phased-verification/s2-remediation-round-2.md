# Remediation notes — round 2 (supplementary finding)

- **A blocking verdict with unparseable findings stalls the phased loop
  (Major):** the merge loop now synthesizes one unknown-severity finding
  (category `unparseable-findings`, naming the raw artifact) whenever a
  completed call's token is blocking but its findings parsed to nothing —
  so the issues envelope (and with it the `discoveryBaselineTree` and the
  supplementary prior-findings block) always exists on a blocking round,
  and the loop can continue instead of deadlocking on its own usage
  guards. Unknown severity keeps the round blocking (anti-laundering
  unchanged). Test:
  `test_blocking_round_with_unparseable_findings_writes_envelope`.
