# Remediation notes — round 4 (remediation-review cycle 2; loop suspended at the bound)

The cycle-2 review accepted 10/11 fixes and held ONE point open (the same
point behind all three `fix-rejected` verdicts): partial per-finding
fix-verdict coverage still passed with a warning. The round-3 sidecar had
declared that a deliberate residual on the grounds that identity-free
counting double-counts restatements; the verifier maintained it is a
probable laundering path on multi-finding ledgers. The verifier was
right that a deterministic fix exists — the residual is now REMOVED, not
adjudicated:

- **Ledger-id coverage (machine-checked):** the auto-assembled ledger now
  numbers every BLOCKING finding (`ledger id: L1..Ln`, encounter order —
  deterministic and stable because the prior envelopes are immutable);
  the remediation-review framing requires one `Fix verdict: L<n> ...`
  line per id; `parse_fix_verdicts` captures the id; and the CLI compares
  the parsed id set against the ledger's id set EXACTLY. A missing id —
  or an id-less enumeration with fewer verdicts than numbered findings —
  escalates an otherwise-clean round to blocking
  (`incomplete-fix-verdict-coverage`, unknown severity) and fails the
  session disposition claim closed. An id-less review that enumerates a
  verdict per numbered finding still passes (count fallback), so honest
  legacy-format reviews are not false-positived.
- Per the bounded totals, NO third remediation-review cycle was opened by
  the orchestrator. The deciding round is the sanctioned Set 084 close
  backstop, which re-verifies the final tree in-process at
  `close_session` (the same ending as this set's S1).

Tests: `test_ledger_numbers_blocking_findings`,
`test_full_id_coverage_passes`,
`test_missing_ledger_id_escalates_to_blocking`,
`test_idless_full_count_falls_back_and_passes`,
`test_idless_partial_count_escalates`
(full suite: 3010 passed / 6 skipped).
