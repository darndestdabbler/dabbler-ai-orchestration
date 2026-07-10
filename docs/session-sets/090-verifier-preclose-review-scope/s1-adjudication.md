# Session 1 — Verification adjudication (human-stop at round 2)

> Two automatic rounds ran. The set's targeted fix **worked**; the loop stopped
> at round 2 on a factually-false finding (not grinding a round 3).

## The fix worked (the dogfood)
This set adds a "Review scope" carve-out so the verifier stops raising the
circular "set-not-closed-at-verify-time" category error that blocked Sets 088
and 089. **Round 1 confirms it:** that circular finding did **not** appear (it
was present in both prior sets). Round 1's only finding was a **genuine**
coverage gap versus this set's own spec (no `load_verification_template()`
runtime assertion) — fixed by adding
`test_load_verification_template_carries_review_scope`.

## Round 2 finding — FALSE POSITIVE (verified false)
- **Claim:** `spec.md` is "corrupted" — the verifier says it "continues with
  unrelated prompt-template sections" (`### Your Instructions`, `### Materiality`,
  `### Severity anchoring`, `### Response Format`) after the deliverables list.
- **Verified false:** `docs/session-sets/090-verifier-preclose-review-scope/spec.md`
  is 146 lines and **ends** at "End-of-set deliverables" (last content:
  "Dogfood evidence: 090's own verification free of the circular finding."). It
  contains **none** of those sections; the only `### Review scope` mention is a
  quoted section *name* inside a Step-2 instruction (line 97).
- **Root cause:** the verifier misread the evidence **diff** — `verification.md`
  (which I DID edit) legitimately contains those template sections, and the
  verifier misattributed them to `spec.md`, which appears near it in the diff.
  A diff-attribution error, not a real defect.

## Verification posture
The substantive work is complete and correct: a different-provider verifier
(gpt-5-4) reviewed it across two rounds; round 1's only real finding is fixed,
and round 2 raised only a verifiably-false misattribution. Full suite green
(2920+ passed; the sole transient failure is the `one-active-set` drift check
tripping because Set 087 is also in flight — resolves when 090 closes).

## Meta-pattern (for the operator)
This is the **3rd** consecutive set (088, 089, 090) whose close was blocked by a
spurious verifier finding. 090 **fixed** the specific recurring category error
(the circular close-state) — the dogfood proves it. But gpt-5-4 still produced a
*different* false-positive Major here (diff misattribution). These small
verification-machinery sets seem to draw spurious blockers. Options worth a
separate decision: try the newly-added `gpt-5-5` / `gemini-3-1-pro` as verifiers
(needs their `is_enabled_as_verifier` flipped + calibration), or accept that an
adversarial verifier occasionally false-positives and the operator-attested
override is the sanctioned escape.

## Recommendation
Accept the adjudication (round-2 finding verifiably false; substantive work
correct and round-1-confirmed) and close via the operator-attested manual path,
recording this file. Operator authorization required.
