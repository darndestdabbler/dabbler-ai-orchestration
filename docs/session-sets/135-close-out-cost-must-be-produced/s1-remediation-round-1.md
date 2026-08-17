# Session 1 — remediation, round 1 (discovery)

One blocking finding, **accepted in full**. It is correct and it was material:
the audit's own conclusion section would have mis-sized Session 2.

---

## The finding

> The audit counts open/in-flight sessions as historical `recoverable` gaps,
> then uses that inflated count to justify the Session 2 conclusion that four
> sessions "wrote nothing."
>
> **Acceptance criterion (judgment):** the recoverable historical-gap count
> excludes or separately buckets sessions that are still in-progress/not
> closed, and the Session 2 implications distinguish closed omitted blocks from
> open sessions where no block is owed yet.

## Why it was right

The spec defines `recoverable` as *"a measurement was available and was not
taken."* A session that has not closed has not reached the step that takes it.
Counting it as a miss is a category error, and the audit's own prose said so
in one place (*"no close, so no block is owed yet"*) while its headline count
and its Session 2 section said the opposite. **The prose and the number
disagreed, and the number is what a Session 2 implementer would use.**

This is the same defect class the audit itself reports in Finding 1: a
conclusion drawn from the convenient aggregate rather than the evidence
underneath it.

## The fix

1. **New class `open_no_block_owed`** in `cost_classify2.py`, applied before
   `recoverable`: a session whose `sessionStatus` is not `complete` and which
   has a measurement is bucketed there, not as a historical omission.
2. `recoverable` now counts **closed sessions only**: 4 → **2** (121 S3, 130 S2).
3. `cost-audit.md` **Finding 6** was rewritten from *"four sessions could have
   said and said nothing"* to *"one closed session could have said, and said
   nothing"*, with a four-row table that names each session's class and the
   reason it is or is not a fault. 130 S2 is explicitly marked **not a fault** —
   the `cost` contract shipped in the next session.
4. The *What this means for Session 2* section now says **"exactly one closed
   session that could have measured wrote nothing"**, replacing the "four
   sessions" claim.
5. The classification table gained an `open_no_block_owed` row with its test,
   and a paragraph stating why the split is kept rather than collapsed.

## Criterion satisfaction

Both halves of the criterion are met: the count excludes in-flight sessions
(they are separately bucketed and separately counted), and the Session 2
implications now distinguish the closed post-contract omission (121 S3, the one
real case) from the pre-contract one (130 S2), from the two open sessions that
owe nothing yet.

**No number outside the `recoverable` / `open_no_block_owed` split changed.**
The understatement total, the store figures and the unrecoverable population
are computed from measurements, not from this bucket.
