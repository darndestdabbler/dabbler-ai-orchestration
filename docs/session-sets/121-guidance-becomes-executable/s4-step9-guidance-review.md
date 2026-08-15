# Set 121 Session 4 — Step 9 reorganization review

The last session of a set reviews `project-guidance.md` and
`lessons-learned.md` for reorganization. *"No changes recommended"* is a valid
outcome; skipping the review is not.

## Verdict: no further changes recommended, with one residual surfaced

This set **is** the reorganization, so the usual question — *has anything
accreted that should be promoted, demoted or archived?* — was answered by the
work itself across four sessions. Re-opening it here would re-litigate
decisions made three sessions ago against the same evidence.

State at close, all measured rather than asserted:

| | tokens | ceiling | |
| :--- | ---: | ---: | ---: |
| `docs/session-constitution.md` | 4,059 | 4,059 | 100% |
| `docs/planning/project-guidance.md` | 3,394 | 3,394 | 100% |
| `docs/planning/lessons-learned.md` | 2,269 | 2,269 | 100% |
| `GEMINI.md` (largest engine file) | 1,922 | 1,922 | 100% |
| **TOTAL** | **11,644** | **11,644** | **100%** |

Every ceiling equals its file's measurement, which is the intended resting
state: ceilings ratchet down to what the corpus actually costs, so the next
addition is a real decision rather than a slow drift into slack. Live
instruction corpus: **21 of a cap of 22**.

## What was considered and rejected

**Promoting C-001 anyway.** Rejected. Its own entry sets the bar — an
enforcement lint plus a recall check — and neither exists. There is now both
token room and a free cap slot, so this is a merit judgment rather than a space
one, which is exactly the state the queue was built to expose. An instruction
with no enforcement is advice with no teeth.

**Collapsing G-018 (path-aware critique) as a seventh duplicate.** Rejected,
deliberately. It *is* duplicated by the constitution's Step 8 and would have
been the cheapest remaining token saving. But the spec's own caution names the
deletion of that exact instruction, under exactly this kind of ceiling pressure,
as the defect that broke the previous scheme and became the next round's Major.
A saving is not worth re-running the failure the set exists to prevent.

**Demoting the situational entries (G-003 UAT-for-a-stranger, G-020 cold-start
dogfood).** Rejected for now. Both are genuine on-demand candidates by the
admission test, but unlike the six that were collapsed, each exists in only one
place — demoting them removes a real rule from every session's context rather
than removing a second copy of one. With the corpus now inside every ceiling
there is no forcing pressure, and eviction under pressure is the failure mode
this set removed. They are the natural first candidates for the operator's next
batched prune review, driven by the usage ledger rather than by a ceiling.

**Re-deriving `instruction_window_sessions` or `check_window_sets`.** Rejected.
Session 2 derived both from 345 sessions, and `check_window_sets` is honestly
flagged as having no fire history behind it. The ledger recorded no fires this
set either, so there is still nothing to re-derive from. Substituting a fresh
guess for a declared default would look like progress and be none.

## The residual this review is obliged to surface

**The set exceeded its declared test budget by 3.8×.** The spec capped Set 121
at **40 new test functions across all four sessions**; the measured figure is
**151 net** (S1's `corpus_scan_guard` suite 53, S2's `guidance_ledger` suite 76,
S3 30, S4 12).

This is a spec-vs-reality conflict, and Step 9 is where the workflow says such a
conflict is surfaced rather than quietly absorbed. Session 4 could not resolve
it on its own authority: sessions 1–3 are closed and cross-provider VERIFIED,
their test files are not in Session 4's declared Touches, and *"is this
mechanism worth 151 tests?"* is a value trade-off reserved to the operator.

**Operator ruling, 2026-08-15: record it as a named residual with the number,
surface it here, and close.** Recorded in `change-log.md` and
`disposition.json`.

The judgment worth carrying forward is the spec's own sentence, which was right
and was not heeded: *"If the design cannot be covered in 40, simplify the
design, not the budget. A guidance mechanism that needs more tests than the
guidance it replaces has not reduced anything."* The corrective is not a bigger
budget but an earlier check — a set that measures its test-function count at
each session close, rather than discovering the overrun at the terminal session
when every option except recording it has expired.

## No new lesson admitted

Two candidates were weighed against the five-part admission test and both
failed, so nothing is added to a corpus this set spent four sessions shrinking:

1. *"A test that asserts a permanent invariant contradicting the gate it guards
   will redden CI on legitimate use."* Real — Session 4 shipped exactly that bug
   and verification caught it. But it fails criterion 3 (weak automated
   detectability): the shipped gate *is* the detector, and the failure surfaced
   within one round at no cost. Recorded in `decisions.jsonl` and in the
   remediation sidecar, which is where a one-instance observation belongs.
2. *"Declare a budget and check it at every session close, not at the end."*
   This is the real lesson of the 151, but as prose it is advice. It fails
   criterion 4 the moment anyone encodes it, and encoding it is the honest
   response. It is named in `change-log.md` as the corrective for a future set
   to build, not admitted as a line that would cost every session tokens while
   enforcing nothing.
