# S4 remediation — round 1

One blocking Major from the discovery round (`s4-issues.json`). The supplementary
completeness-critic pass (round 2) returned **VERIFIED with zero new findings**, so
the harvest was complete before any fix was written. This sidecar records the single
remediation.

---

## The finding

> **The required clean-stop boundary after Part B is claimed as proven but is never
> exercised.** — Major, Completeness / False Positive

The verifier's case, stated fairly:

- The spec requires *"a reader could stop cleanly after Parts A and B"*, and makes
  independently resumable parts the principal mitigation for abandonment.
- `s4-walk-evidence.md` §5 marked that test a flat **PASS** on the sole basis that
  "with all five services down, each suite runs alone."
- **That does not follow.** Isolated unit-test execution proves the suites do not
  need a network. It does not prove a reader can stop, lose context, and resume.
- The UAT checklist made it worse rather than compensating: item 2 explicitly said to
  stop after Part A, while item 3 ran Part B straight into Part C with no stop
  between them — so the human walk systematically skipped the exact boundary that
  should have supplied the missing evidence.

## Adjudication — ACCEPTED IN FULL

No part of this is disputed. The over-claim is real, it is mine, and the verifier
identified both the false inference and the reason the checklist could never have
caught it. It is exactly the class of defect the conventions block asked verifiers to
hunt for — *"anywhere the evidence is narrower than the sentence describing it"* —
and it found one.

## What was done

The finding offered two fixes; **both were applied**, because they answer different
halves of the claim and doing only one would leave the other half still overstated.

### 1. The claim is split, and the machine half is now exercised rather than inferred

The walk repository was still intact, so the missing experiment was actually run
rather than argued about. With every service stopped and confirmed `DOWN`, each
boundary was re-entered from cold:

- **Part A boundary** — `converter` cold-started; Part A's finish-line `curl`
  re-run; response again **byte-identical** to the tutorial's printed `200`.
- **Part B boundary** — `persistence` cold-started; the batch stored during Part B
  (`019fc9f4-72b6-7b0a-829a-fe955b9dee29`) **read back intact**; re-posting the same
  file still returned that **original** `batchId` with `"duplicate":true`.

That establishes a narrower but genuinely falsifiable claim: **no part leaves running
processes or in-memory state behind that a later part needs.** It is not the same
claim as "a reader can resume", and §5 no longer pretends it is.

### 2. The human half is marked UNVERIFIED and pushed to the checklist

Whether a person who stops for a week can restart from the document alone cannot be
tested by a walker who never forgot anything. `s4-walk-evidence.md` §5 now records
that half as **UNVERIFIED**, and the checklist was changed to go and get it:

- **Item 3 now requires the stop.** Step 3 is a hard stop — close every terminal,
  close the repository, come back on a different day, and *"do not re-read your
  notes when you return; use only the tutorial."*
- **Part B is timed separately from Part C**, as the finding asked.
- Its Expectation names the cold-resume outcome (nothing rebuilt, re-migrated or
  re-seeded) and tells the walker that failing to find their place **is the single
  most valuable thing they can report**.

## Files touched, and the echoes chased with them

L-065-1 — a consistency fix is global, not point-local. The claim had four echoes and
all four were corrected in this one pass, before re-verifying:

| File | Change |
| --- | --- |
| `s4-walk-evidence.md` | §5 row split into machine/human halves + a new subsection recording the cold-resume evidence and naming the earlier draft's over-claim; §7's "structurally the parts *are* independently resumable" narrowed to the mechanical precondition only. |
| `108-…-uat-checklist.json` | Item 3 rewritten around a mandatory stop-and-return; Part B timed separately; `ProgrammaticVerification` now states the machine half was verified and the human half was not. Preamble's "stop after Part A" became "stop twice", with the reason. |
| `change-log.md` | The "all three negative tests passed" summary and the "structural half is settled" line both rewritten to the split claim. |
| `s4-conventions.md` | The evidence table row "each part is independently stoppable" restated as "no part leaves state behind that a later part needs", with the human half marked unverified. |

## What is deliberately *not* claimed after this fix

The checklist can require a stop; it cannot make the operator take a week over it.
If the human walk comes back with the two stops taken only briefly, the human half
stays partially answered — and should be recorded that way rather than rounded up.
