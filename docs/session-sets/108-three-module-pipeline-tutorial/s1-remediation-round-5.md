# S1 remediation — round 5 (the cap was reached; this is a fix, not a new cycle)

Round 4 (`--phase remediation-review`, cycle 2) returned **6 accepted, 1
accepted-with-modification, 1 rejected** and one blocking Major. That is the
bounded total: **two remediation-review cycles**. Per
`session-constitution.md` → *Recovery and escalation*, the loop **suspends**.

**What this file is.** The fix for the one blocking finding, applied because it
is correct and undisputed. **No third review cycle was opened** — that requires
the operator's say-so, and this session does not take it.

---

## The finding (Major, accepted without dispute)

> **The Windows-only correction introduces an unverified non-Windows mainline.**
> R8b told Session 2 to put a `DABBLER_PIPELINE_SQL=container` fork in front of
> Part A and claimed *"everything else in the tutorial is identical"* — while
> every run this session made used LocalDB and no container was ever started.

**It is right, and the defect was mine, introduced during round-3 remediation.**
Closing D3 (the happy path is Windows-only and did not say so) I reached for an
addition — a second reader-facing path — rather than a statement of fact. Three
things were wrong with it:

1. **Unverified.** No container was started at any point this session. Both Part
   D runs, every contract capture, and the whole decision table used LocalDB.
2. **Contradicts the spec's non-goal**, which puts containers in the appendix —
   and contradicted *this same document*, which says so two sections later.
3. **It recreates the failure it was fixing.** A macOS reader promised a
   supported route stalls at Part B exactly like the reader D3 was about to
   strand — the same defect, one platform over.

## The fix is a subtraction

`project-guidance.md` → *Prefer removal over addition when fixing* is the rule
this violated, and applying it gives the answer directly. R8b now states the
Windows requirement plainly and **offers no substitute**:

> **This walk is written for Windows 10 or 11.** The pipeline itself is
> cross-platform .NET; it is the zero-setup database that is not. If you are on
> macOS or Linux, the appendix's container path runs the same code and the same
> tests — but it is not the walk, and the timings and copy-pasteable commands
> here assume Windows.

The container route stays in the appendix, **described as what it is rather than
as an equivalent happy path**. The §3 happy-path table gains a `Platform` row
marking the alternative *unverified*. The Session 2 handover now says: state the
requirement, do not offer a substitute.

The paragraph that was wrong is kept in R8b as a recorded correction rather than
deleted, so a later session does not re-invent it.

## Recorded rather than fixed

**Nobody has walked this tutorial on macOS or Linux, and the container path is
unverified.** If the team is all on Windows this costs nothing. If it is not,
verifying a non-Windows walk is a **follow-on set** — not something Session 2
should improvise into a prerequisites block, which is precisely the mistake this
round is undoing. Carried into `disposition.json` and flagged for Step 9.

---

## Where this leaves the session — for the operator

Four rounds ran: discovery (fan-out 2/2) → supplementary → remediation-review ×2.
**Nine distinct findings, all Major, all accepted, none disputed.** Seven came
from the original draft; **two were defects introduced by the remediation
itself** and caught by the fix-delta review — which is that phase doing its job.

Three findings were closed by **running something new** rather than by editing
prose: a rendered-DOM test harness, a second Part D run covering the persistence
repoint, and the platform check behind R8b.

**The blocking finding above is fixed.** What has *not* happened is a review of
that fix, because the 2-cycle bound is reached. The options are the operator's:

| Option | What it means |
| --- | --- |
| **Accept** | The fix is a deletion plus a factual sentence; the risk of a deletion introducing a new defect is low, and the change is fully described above. |
| **One more cycle** | Operator-authorised round 5 `--phase remediation-review` over this delta. Precedent exists (Set 107 S1 ran an authorised extra round). |
| **Third-provider opinion** | Available, though nothing is disputed — every finding was accepted, so there is no disagreement to adjudicate. |

The close backstop will run its own round at `close_session` regardless, which is
an independent check on this delta.
