# Session 2 round 4 -- re-verification against the FINAL tree

Round 3 returned VERIFIED, but its stamp did not survive to close-out.
The close backstop's staleness guard rejected all four stamped rows with:

    the session's work changed after this row was stamped
    (work_diff_sha256 no longer matches the tree diffed from
    evidence_base f24738e9) -- stale evidence cannot settle this close

That guard is right and it is not a false positive. After round 3 I wrote
`disposition.json`, appended this session's `ai-assignment.md` block,
wrote `s2-remediation-round-1.md`, ran `cite_lessons` (which touched
`lessons-learned.md` and `lessons-archive.md`), and then fixed the
close-backstop defect below. All of that is real work that no verifier
had seen. The anti-rollback rule exists precisely so a VERIFIED verdict
cannot be carried across a tree it never covered.

Round 4 is therefore a re-verification of the **final** tree, not a new
remediation cycle: no findings were outstanding going into it. Verdict
**VERIFIED**, 2 fix verdicts accepted, 0 rejected, 0 findings.

## What changed between round 3 and round 4

1. **`ai_router/close_backstop.py` + its regression test** -- the
   `EvidenceTooLargeError` crash this very close-out exposed. See
   `decisions.jsonl` and the commit message; summarized in
   `disposition.json`.
2. **Close-out bookkeeping** -- `disposition.json` (authored in full),
   `ai-assignment.md` (Session 2 as-run + notes for Session 3),
   `s2-remediation-round-1.md`, `decisions.jsonl`, the lesson citations,
   and the recorded runs of record.

## Note for Session 3

This is the same shape S1 hit (`s1-verification-round-4.md`). The
sequencing lesson, stated plainly: **the close-out writes are themselves
work**, so the last routed round has to come after them, or the stamp
will not bind the tree being closed. Budget one final re-verify round
after the disposition is authored rather than before.
