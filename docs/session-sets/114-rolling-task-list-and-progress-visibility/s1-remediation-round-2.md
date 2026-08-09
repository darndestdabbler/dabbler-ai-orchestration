# Session 1 — remediation notes, round 2 (supplementary)

One Major finding, accepted.

---

## The gate enforced "after the record is written", the doc said "when the command returns"

**Accepted, fixed in the doc.** The finding is precise and the failure it
describes is on the main path: `run_of_record.record` stamps
`recordedAt = now()` when the **metadata line** is appended, and the gate
uses that as the transition instant. A session that followed the guide
literally — post the moment pytest returns, then record the run — would
have its post fall *before* the transition, and be refused at close for a
cadence it had actually honoured.

Two ways to settle it:

1. **Make the gate tolerant** — accept a post shortly before the record.
   Rejected: "shortly" is a new constant with no principled value, and a
   tolerance window is exactly the kind of fuzzy edge that later gets
   widened. It would also make coverage depend on how long the
   orchestrator took to type the record command.
2. **Make the doc state the enforced order.** Chosen. The order
   *run → record → post* is natural, teachable, and already what a
   session does when it treats the run of record as part of finishing the
   command rather than an afterthought. It also puts the post after the
   fact it reports, which is the honest sequence: the checklist then
   describes a session whose run is recorded, not one that is about to
   record it.

**Fix:** the authoring guide's cadence row now reads "After a blocking
command finishes **and its record is written** — `run_of_record record`
first, then post", with an explicit "Order matters around a long-running
command" paragraph naming the consequence of getting it backwards. The
constitution's Step 4 line carries the same order in its compact form.

**Falsifier:** `test_a_post_before_recording_a_run_does_not_cover_it`
plants the doc-following-but-wrong-order sequence and asserts the
refusal; `test_recording_then_posting_covers_a_long_running_command` is
the look-alike that must pass.

This session then dogfooded the fixed order for its own pytest and
Playwright runs.
