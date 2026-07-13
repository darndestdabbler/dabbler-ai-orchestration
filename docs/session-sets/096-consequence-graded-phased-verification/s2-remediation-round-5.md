# Remediation notes — round 5 (the Set 084 close backstop's fresh round)

The backstop round returned two Majors. One is fixed; one is refused as a
resurrection under the shipped loop discipline, with the evidence trail
below.

- **"The ledger reopens settled findings and assigns IDs to occurrences
  rather than stable findings" — FIXED.** A real design defect in the
  hours-old coverage mechanism: every occurrence (fan-out duplicates,
  cross-round restatements) demanded a fresh verdict every cycle, so a
  growing ledger manufactured redundant re-coverage and could trip the
  cycle cap on an omitted redundant id. Now: an id a prior review cycle
  already `fix-accepted` (or accepted-with-modification, read from the
  prior envelopes' `fixVerdicts`) renders **EXEMPT from re-coverage** and
  drops out of the required id set — a later cycle re-verdicts only the
  rejected / new / unvalidated points. Numbering stays stable (immutable
  envelopes, encounter order). Test:
  `test_previously_accepted_ids_are_exempt_from_re_coverage`.
- **"The convergence replay does not demonstrate the required materially
  lower cost against the Set 095 baseline" — REFUSED AS RESURRECTION**
  (the shipped Set 071/096 rule: "a settled point never reopens under
  fresh wording"; recognizing sameness is explicitly the orchestrator's
  documented judgment). The SAME point — the replay's comparison against
  the original 39-Major workload does not license the cost claim,
  including the "users apply it to similarly defective initial corpora"
  scenario — was raised as round-1 findings #5/#9, remediated by
  qualifying every surface where the numbers appear (memo Question
  header + Two-qualifications section, CHANGELOG 0.33.0 header,
  change-log.md), settled with sidecar evidence, and then explicitly
  `fix-accepted` by the reviewer in BOTH round 3 ("Round 1 convergence
  replay overstates its comparison with Set 095 -- fix-accepted") and
  round 4 ("Round 1 lower-cost replay comparison is unsubstantiated --
  fix-accepted"). The backstop round did not invoke the ledger's stated
  exception (challenging the remediation by naming the round and finding
  with new evidence); it re-raised the settled point in fresh wording.
  On substance the remediation stands: the deliverables nowhere claim a
  defect-for-defect A/B — they state the opposite, prominently, at every
  site — and re-running Set 095's original 17-round remediation
  trajectory inside a session is not a feasible experiment (it would be
  a re-execution of Set 095 itself, ~$5+ and a day of remediation work,
  and the corpus mutates with every fix, so no two runs process "the
  same workload" even in principle). If the next round re-raises the
  point again, the loop stops to the operator for adjudication — the
  designed path for a disputed finding.
