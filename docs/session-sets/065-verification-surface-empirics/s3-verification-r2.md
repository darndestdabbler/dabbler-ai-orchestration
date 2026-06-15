# Set 065 S3 — Proposal verification (round 2)

> Cross-provider session-verification. Model: gpt-5-4 (gpt-5.4). Cost: $0.1274

---

1. **Not fully resolved.**
   - **Issue →** The bottom line re-overclaims the §7 rule by collapsing away the explicit heuristic extension.
   - **Location →** "`Heuristic extension (independence only): the author-independence decision also fires when a task is genuinely ambiguous / novel-reasoning, even if the deterministic core P is false...`" vs. "`One blast-radius predicate governs all three decisions...`"
   - **Fix →** Change the bottom line to “one core predicate, plus an explicit heuristic extension for author-independence.”

2. **Resolved.**

3. **Resolved.**

4. **Not fully resolved.**
   - **Issue →** The proposal still overstates the overhead placement for adopted falsifiers by saying all adopted mechanisms are out-of-band, despite §6/§8 preserving same-agent authoring as an admitted in-band exception.
   - **Location →** "`The one in-band exception is honest: when same-agent authoring is permitted (low-blast-radius, §6), the agent spends upfront tokens writing falsifiers...`" vs. "`every adopted mechanism is out-of-band`." Also: "`Pre-registered falsifiers: adopt (out-of-band, authoring-time-once)...`"
   - **Fix →** Carry the same-agent exception into the executive summary and bottom line.

5. **Resolved.**

6. **Resolved.**

**New inconsistency introduced:**
- **Issue →** Candidate 3 still hard-codes universal independent test authorship, which now conflicts with §6’s gated same-agent rule.
- **Location →** "`an independent engine writes critical tests against it`" vs. "`Same-agent is sufficient — and is the default low-cost path — for low-blast-radius, probeable work`."
- **Fix →** Reword Candidate 3 so test authorship is gated by `P_task`/the heuristic extension, matching §6.

**Verdict: ISSUES_FOUND**
