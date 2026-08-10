# Session 1 — remediation notes, round 4 (remediation-review, cycle 2)

Fix verdicts: 3 accepted, 2 accepted-with-modification, 0 rejected. One
new Major, accepted and fixed. **The bounded total (2 remediation-review
cycles) is now reached**; no further `verify_session` round is opened.

---

## Accepted and fixed — the docs dropped "after each verification round" while the gate kept enforcing it

A clean catch, and a mismatch in the opposite direction from round 3's.
Round 3's rewrite folded verification into the "long-running command"
phrasing to keep the preload-capped constitution compact. The gate,
however, still derives a `verification-round N` transition from each
`round-completed` line in `sN-rounds.jsonl` — so the canonical
per-session operating doc no longer taught a **gate-enforced, main-path**
obligation. A session that followed Step 4 literally would be refused at
close for a transition the docs never named. Every session runs
verification, so the exposure was universal, not incidental.

**Fix:**

- `docs/session-constitution.md` Step 4 names the transitions
  individually again, including *"after each verification round
  completes"*. The list is no longer prefixed with a count, which is what
  invited the lossy compression in the first place. Preload ceiling
  re-checked: 3,724 / 4,000 tokens.
- The authoring guide's cadence table splits the old "a long-running
  command returns" row into two checked rows — *a test suite's run is
  recorded* and *a verification round completes* — because they are
  timed by different writers and only the first needs the
  record-then-post care.
- The "Order matters" paragraph now says explicitly that a verification
  round needs no such care: `verify_session` writes its own
  `round-completed` line before returning, so any post after the command
  finishes covers it.

## Carried forward from round 3 — the disputed finding

Not re-raised in this round. It stands settled by operator adjudication
(2026-08-09, recorded in `decisions.jsonl` with `authority: human`,
`rubric_line: accountability-sign-off`): the two *before* moments stay
prescribed and are explicitly labelled **not gate-checked** in the same
table that marks the others **Yes**. The residual — that no "before X"
moment is enforceable while every record in this framework is written
after the thing it describes — is owned by this set and named in
`s1-remediation-round-3.md`.

## Bound reached

Rounds 1 and 2 were the two discovery passes; rounds 3 and 4 the two
remediation-review cycles. A third cycle is machine-refused and would
require the operator's `--operator-authorized-round` attestation, which
was not sought: the only finding still open is the adjudicated one, and
re-rounding a settled dispute is precisely what the loop discipline
forbids. The close-time backstop remains free to run its own round —
that is a close gate, not a loop cycle, and its verdict governs the
close.
