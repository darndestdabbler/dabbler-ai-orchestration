# Remediation notes — round 11 (operator decision: remove the exemption)

- **"The exemption permanently exempts accepted fixes even when later
  remediation regresses them" (Major) — RESOLVED BY REMOVAL** (operator
  decision, 2026-07-13, option 1 of the presented three; the
  removal-over-addition principle). The prior-acceptance exemption
  (added round 5, patched rounds 9 and 10) is deleted outright: every
  ledger id is re-verdicted every cycle, and the one-line fix-accepted
  restatement doubles as exactly the regression check the exemption
  structurally forfeited. The duplicate-of declaration stays (in-round
  occurrence identity, chain-terminating coverage per round 10) — it has
  no cross-cycle carry anymore. The framing tells the reviewer the
  restatement is deliberate. Net: the whole regression-vulnerability
  class is gone structurally; the reviewer cost is one line per settled
  id per cycle (the replay's reviewer enumerated 6/6 unprompted).
  Test: `test_every_cycle_re_verdicts_every_id` (replaces the two
  exemption tests; suite 3019 passed / 6 skipped).
