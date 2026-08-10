# Session 1 — remediation of round 1

Round 1 ran the discovery fan-out at 2 lenses (spec-conformance,
failure-scenario). Both lenses independently raised the **same two
Majors**. Both are accepted in full; neither is disputed.

The two Majors are one defect wearing two hats: **the session made causal
claims its sample sizes do not support.** The remedy is retraction and
honest labelling, not more measurement — and for the second Major the
decisive measurement is not available from this machine at all.

---

## Major 1 (both lenses) — the race-vs-contention verdict asserted causes the observations do not support

**Accepted.** The verdict pooled two distinct failure modes and reasoned
across them as one population. Specifically wrong:

- "NOT CPU contention", inferred from 0 failures in 3 runs at w=12. At any
  plausible per-run rate, 3 clean runs is an unremarkable outcome rather
  than a refutation.
- "NOT parallelism at all", inferred from a single alone-failure that was
  **a different failure mode** (line 199, the 300s install wait) than the
  two parallel failures (line 208, the 15s palette wait). A Mode 2
  observation is not evidence about Mode 1.
- "Mode 2 is network-bound", asserted with no captured pip output. The
  verifier's counter is better than my claim: pip's index, proxy,
  certificate and credential configuration normally lives under HOME or
  APPDATA, and this change scopes **both** to an empty directory — so the
  isolation is a live candidate cause of Mode 2, not an exonerated
  bystander.
- "roughly a 1-in-4 rate at any worker count", derived by pooling
  heterogeneous worker counts and both modes.

**Fixed in** `s1-worker-sweep-DENICI.txt` section 3: the two modes are now
recorded separately and never pooled; all four claims above are explicitly
withdrawn in the text, with the reason each fails; cause is recorded as
**UNRESOLVED** for both modes; a sample-size warning precedes the table.

**The substantive change, not just the hedging:** Mode 1 persisted under
full isolation at w=8, and spec step 4 says such failures "are product
races exposed by a schedule this suite has never run... and it must be
written down rather than relabelled as flakiness." It is now recorded as
an **OPEN PRODUCT-RACE CANDIDATE**. The earlier draft did the exact
relabelling the spec forbids. The guidance to Session 2 changed with it,
from "exclude this test from the triple-green control" to "decide
explicitly, and do not discount it as unrelated flake, because Mode 1's
cause is open and may be the very schedule sensitivity the control exists
to detect."

Also corrected in `s1-conventions.md` (which repeated the claim) and in
`decisions.jsonl` (append-only, so a correcting entry was appended rather
than the original edited).

## Major 2 (both lenses) — the previously-failing configuration was never re-tested, and the ceiling was not established

**Accepted, and it cannot be closed by this session.** Spec step 3 asks to
"re-run the 8-worker configuration that previously failed." That
configuration failed on the operator's **14-core / 31.5 GB work machine**.
This session ran on **DENICI (20 CPUs, 63.8 GB)** — a different physical
machine, not reachable from here. Two variables therefore differ between
the failing runs and these (isolation AND host), so the sweep cannot
attribute the difference to either.

**Fixed in** `s1-worker-sweep-DENICI.txt` section 2, finding 1:

- The claim that the result "proves the ceiling is a property of the HOST"
  is withdrawn — it proves neither causal alternative.
- "The ceiling is above 12" is replaced by "no ceiling was found up to 12
  workers on this host", labelled explicitly as an observed **lower
  bound**, since no count above 12 was run.
- The session's central hypothesis is recorded as **UNRESOLVED**.
- The missing measurement is recorded as the session's **one unmet
  deliverable**, owed by whoever next sits at the 14-core host, with the
  explicit warning that Session 2 must not read DENICI's clean result as
  permission to raise the smaller host.

This is a real gap in the session's deliverable, surfaced to the operator
rather than papered over.

---

## Nits (accepted and fixed; no nit was deferred)

1. **`extraEnv` could silently defeat the isolation** — it was spread
   after `state.env`, so a caller could un-scope APPDATA or HOME and get a
   launch that shared machine state while still looking isolated. Order
   reversed in `electronLaunch.ts`; `state.env` now wins, with the reason
   stated in the code.
2. **A launch failure leaked all three state directories and could leave
   the Electron process alive** — the throw happens before the
   `LaunchedVSCode` handle exists, so the caller cannot clean up what it
   was never handed. `launchVSCode` now wraps acquisition and readiness in
   failure cleanup that closes any created app and removes all three
   roots.
3. **The containment assertion accepted a name-prefix sibling** — a real
   bug in my own test: `startsWith` passes `/tmp/state-ab` against a root
   of `/tmp/state-a`. Now uses `path.relative` and rejects absolute or
   `..`-leading results, **plus a planted look-alike test** asserting a
   prefix-sharing sibling is not treated as contained (L-112-1).
4. **The Windows layout comment was untrue** — it claimed to mirror the
   real profile layout while creating `<root>/Roaming` and `<root>/Local`.
   Now creates `<root>/AppData/Roaming` and `<root>/AppData/Local`, which
   is the real layout, so anything deriving an AppData path from
   `USERPROFILE` lands where the variable points. Test updated.
5. **Two test names overclaimed their coverage** — the source-level pins
   are now named "source pin: both launch sites route through the shared
   seam" and say in the comment that they do not prove the environment
   reaches a launched process; the workspace test is renamed and no longer
   claims end-to-end staging coverage.
6. **"Every other Layer 3 test passed in every run" omitted the
   exclusion** — `real-host-baseline` was excluded from all runs. The
   conventions file now says "every other **included** test" and names the
   exclusion.
7. **pip configuration under the scoped directories was unexamined** —
   now recorded in the evidence file's "Not measured" section as an open
   risk and a candidate cause of Mode 2, noting the APPDATA half shipped
   in `5388c3d1` before this session.

## Verification of the fixes

`launchStateIsolation.test.ts`: **17 passing** (was 16; +1 planted
look-alike for the containment fix). `tsc --noEmit` clean, `node -c` clean
on both scripts.

---

# Round 2 (remediation-review) outcome

Fix verdicts: **1 accepted, 1 rejected.**

- **L1 (causal claims retracted, both modes marked unresolved) —
  fix-accepted.** L4 was judged a duplicate of L1.
- **L2 (the 14-core post-isolation measurement) — fix-rejected**, on the
  correct ground that "the remediation documents the missing measurement
  instead of performing it." L3 was judged a duplicate of L2.

The rejection is **not disputed**. It is right: acknowledging a missing
deliverable does not supply it. It is also not actionable from this
session — the 14-core work machine is a different physical machine, and no
amount of further work on DENICI produces the measurement spec step 3
asks for.

**Operator adjudication, 2026-08-10** (education-mode brief, recorded in
`decisions.jsonl`): close Session 1 with the measurement as a **named owed
residual owned by Session 2**, as a precondition before any worker count
is adopted. The finding is accepted as true and unmet — not waived as
wrong. The adjudication settles the stop, not the truth.

Recorded in `s1-worker-sweep-DENICI.txt` section 2 finding 1, with the
explicit instruction that Session 2 must not adopt a 14-core worker count
before discharging it, and must restate rather than drop the residual if
it too runs on DENICI.
