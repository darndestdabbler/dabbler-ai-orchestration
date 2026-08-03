# S1 remediation — round 8 (close-backstop finding)

The `close_session` gate ran its own verification (**round 7**, verifier
`gpt-5-6`, anthropic excluded) against the **whole session diff** from the
pre-session base `681412b` — not a fix delta — and refused the close on one
blocking Major. Accepted without dispute.

## The finding

> **The manifest-bootstrap remediation still tells readers to declare the
> converter a second time.** R9 requires all nine entries in one pre-branch
> commit, but Part A still said *"The reader declares `{owner}-converter`, sets
> its code root…"* — a module R9's own example has already declared, with the
> same code root. The product rejects a duplicate slug, so a reader following
> both instructions stalls at the tutorial's first implementation step.

**Correct, and a clean instance of L-065-1.** R9 was introduced at round 3 to fix
the shared-manifest collision, and its consequences were carried into R2, the
handover and §3 — **but not into Part A**, where the original per-part
declaration step still stood. A consistency fix that misses one echo leaves the
document self-contradicting, and Part A is the worst place for it to survive
because it is the sequence Session 2 writes from most directly.

## Why the earlier rounds could not catch it

Rounds 3–6 were `--phase remediation-review`, which reviews the **fix delta**
against the round-2 baseline. Part A's declaration sentence was written *before*
that baseline and never edited afterwards, so it was **never inside any delta**.
It took a review of the entire session diff to see the contradiction.

This is the second time in this session that the delta boundary hid something —
the first was the DOM harness's provenance at round 5 — and the two failures are
mirror images: **a delta reviewer cannot see what is already in the baseline,
whether that is evidence you want it to credit or a defect you need it to
catch.** The close backstop reviewing the full diff is the control that closes
both gaps, and it earned its place here.

## The fix

Part A now opens the **already-declared** module rather than declaring it:

> The reader's `{owner}-converter` module and its code root **already exist** —
> R9's bootstrap declared all nine before anybody branched — so Part A starts by
> opening that module and running the plan → decomposition → implementation
> lifecycle.

A note in Part A records the retired instruction and its consequence, so the
correction is visible rather than silently swapped. The Session 2 handover gains
a matching hard rule: **declaration happens in exactly one place, R9's
bootstrap; Parts A, B and C declare nothing and set no code roots.**

Parts B and C were checked and never contained a declaration step — the defect
was Part A's alone. The remaining "declare" mentions in the document
(§4's *"picks up at agree the contract, then declare your modules"*, R9 itself,
and the `touches:` discussion about code-level dependencies) are all consistent
with the bootstrap and were left as they are.
