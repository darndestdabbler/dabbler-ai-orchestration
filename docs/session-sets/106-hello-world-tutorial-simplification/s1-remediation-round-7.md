# S1 remediation sidecar — close-backstop round 7

One blocking Major, accepted: *"The `app` plan and decomposition sessions still
begin on protected `main`; round 6 did not actually fix the team path."*

**Correct, and it is my miss — the same one, twice.** Round 6 established that
lifecycle sessions need an authoring branch because `main` is protected, and I
applied it to Part 4 (greeter) but left Part 5 step 6 (Sam / `app`) saying only
that the *output* should be landed "by the same authoring-branch route." A reader
following Part 5 literally still starts the plan session on `main`.

This is **L-065-1** for the third time in this session: *a consistency fix is
rarely local — grep for the old claim and update every echo in one pass before
re-verifying.* Round 5 caught the same class in `release-and-recovery.md`.

**Fix:** Part 5 step 6 now opens with Sam creating the branch explicitly —

```bash
git switch -c authoring/app-lifecycle
```

— "`main` is protected for him too, so — exactly as in Part 4 — he starts on an
authoring branch and stays on it until the lifecycle output is landed", and the
landing bullet now names that branch and the return to trunk rather than
gesturing at Part 4.

## Convergence read

Blocking findings per round: **11 → 2 → 3 → 1 → 1 → 2 → 1**. Rounds 5–7 are not
independent discoveries; they are one defect class (*where does work happen once
the trunk is protected*) being chased through its echoes, and the echo list is
now exhausted: Part 4 (round 6), Part 5 (round 7), and the release guide's
sibling invocation (round 5) were the three places the class lived.

If round 8 raises another finding in this class, the honest conclusion is that
the class was never fully enumerated and the session stops to the operator for
adjudication rather than continuing to pay ~$0.35 a round.
