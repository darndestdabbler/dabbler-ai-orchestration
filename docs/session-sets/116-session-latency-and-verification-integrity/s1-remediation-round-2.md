# Set 116 Session 1 — remediation, round 2

Round 2 (`--phase remediation-review`) rejected all three round-1 fixes.
All three rejections are correct, and the round-1 sidecar's "What was NOT
changed" section is **superseded by this round** on two of its three
points — recorded here rather than edited there, so the reasoning that
turned out to be wrong stays visible rather than disappearing.

---

## L1 (e2e timing) and L2 (parity evidence) — same root cause

Both round-2 findings trace to one design choice made in round 1 itself:
`test-runs.jsonl` was added to `WORK_DIFF_SET_BOOKKEEPING` (freshness-
exempt, correct) but deliberately **not** to `EVIDENCE_VISIBLE_BOOKKEEPING`
— round 1's sidecar reasoned "its content is redundant with the
disposition it accompanies, which is also hidden." That reasoning held
for a session that merely *uses* `run_of_record` in passing. It does not
hold for **this** session, whose actual deliverable is "the framework
can query its own test cost" — hiding the evidence of that exact
deliverable from the verifier asked to check it is self-defeating, and
round 2 caught it precisely: "the linked JSONL contents... are not
provided," "an identical surface digest does not itself prove the
asserted counts came from those executions."

**Fix.** `test-runs.jsonl` moves to `EVIDENCE_VISIBLE_BOOKKEEPING`,
joining `decisions.jsonl` and `checklist-posts.jsonl` on the identical
reasoning already established for those two: a reviewer of the set that
**ships** a record-keeping cadence must be able to see whether the
session shipping it actually followed it. `test_run_of_record.py`'s
`TestFreshnessAndEvidence` class is inverted accordingly
(`test_the_run_ledger_stays_visible_to_the_verifier` replaces
`test_the_run_ledger_is_hidden_from_phased_evidence`), plus a
same-spelling guard mirroring `test_checklist_posts.py`'s.

This does not require re-writing CONTRIBUTING.md's prose — the citations
already named the file and the shared digest prefix. What changes is
that the **next** verification round's evidence bundle will actually
contain the rows those citations point at, closing both findings at the
mechanism level rather than by asserting harder in prose.

**Acceptance criteria** (both L1 and L2, restated) — met once the
evidence bundle a `--phase` round assembles includes `test-runs.jsonl`;
verifiable directly from `PHASED_EVIDENCE_SET_EXCLUDES` no longer
containing the filename.

---

## L3 (mandatory duration) — the library function was still the real gap

Round 1 required `--duration-seconds` at the CLI only, reasoning that
`record_run()`'s only non-CLI callers were gate-behavior test fixtures
with nothing to measure. Round 2's rebuttal is correct on the merits
regardless of who calls it today: **any** future caller of `record_run()`
— not just today's tests — could omit the argument and reproduce the
exact defect this session exists to fix, because the CLI is a thin
wrapper and the library function is the real write boundary.

**Fix.** `duration_seconds` is now a required keyword-only parameter on
`record_run()` itself (no default; Python allows a required keyword-only
argument after optional ones, so this needed no parameter reordering).
Every internal caller that had no real duration to report — the ~14 test
fixtures in `test_run_of_record.py` and one in
`test_set111_close_gates.py` that construct a run record to test
freshness/gate logic, not duration reporting — now pass a fixed
`duration_seconds=1.0`. `read_records()` is unchanged: it still accepts
a legacy record with no `durationSeconds` field, which is the one place
optionality is correct (reading history written before this field
existed cannot retroactively demand it).

`test_duration_is_omitted_when_not_given` — which asserted the opposite
of the new invariant — is replaced by `test_duration_seconds_is_required`
(omitting the keyword now raises `TypeError`, proven directly).

**Acceptance criterion** — *"Does every `record_run` call that writes a
new record reject an omitted, non-numeric, non-finite, boolean, zero, or
negative duration while `read_records` continues accepting legacy
records with no `durationSeconds` field?"* — met: omission raises
`TypeError` (Python's own enforcement, no bespoke check needed); the
existing non-finite/boolean/non-positive validation from round 1 is
unchanged; `TestReadRecords` still covers the legacy-record path.

---

## What round 1 got right and this round did not touch

- The **write-side** finite/positive/non-boolean validation from round 1
  stands unchanged — round 2 raised no objection to it.
- `test-runs.jsonl` staying **freshness-exempt** (`WORK_DIFF_SET_BOOKKEEPING`)
  was never in dispute; only its evidence-visibility was wrong.
- The pre-session DENICI benchmark file is still untouched and still the
  source for the collection-cost/slowest-25 breakdown.
