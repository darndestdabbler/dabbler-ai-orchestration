# Session 3 — remediation round 1

Fixes for the merged Critical/Major findings from **both** discovery
passes (round 1 discovery K=2, round 2 supplementary). Both discovery
passes are now spent. One fix pass, per the loop discipline.

---

## Finding 1 (round 1, discovery call 2, failure-scenario lens) — Major

> `decision_journal` accepts self-inconsistent records for human-owned
> rubric lines.

**Accepted in full.** The verifier's probes were correct: the writer
accepted `rubric_line="verification-reduction"` with
`verification_effect="none"` and no `operator_attestation`, and accepted
`rubric_line="escalate-to-human"` with `authority="ai"`.

**Why it mattered, precisely.** The attestation requirement is keyed on
the declared *effect*, not on the rubric line. So a record that names the
carve-out while declaring no reduction walks straight past the one
control the carve-out has. And `escalate-to-human` is the sixth entry of
`AI_TIEBREAKS` — structurally an AI tiebreak, semantically the escalation
itself — so the existing "human trigger under AI authority" check could
not see it, and an operator stop would be journaled as `[A]`. Both
defects land on the two human-stop paths this session exists to build.

**Fix** — `validate_record()` now enforces cross-field coherence, on the
stated principle that `authority`, `rubric_line` and
`verification_effect` describe one decision from three angles, so a
hand-assembled record can be individually well-formed and jointly false:

1. `rubric_line == "verification-reduction"` requires
   `verification_effect == "reduces"`.
2. `rubric_line == "escalate-to-human"` requires `authority == "human"`.
3. `authority == "human"` requires a rubric line that routes to the
   operator — one of the four human classes, or `escalate-to-human`.

Ordering is deliberate: the AI-authority carve-out check still runs
first, so `authority="ai"` + `verification-reduction` continues to raise
`VerificationReductionRefused` rather than a generic `ValueError`.

**Regression tests** reproducing the verifier's exact probes:

- `test_the_carve_out_line_cannot_declare_no_reduction`
- `test_an_escalation_cannot_be_recorded_as_an_ai_call`
- `test_an_escalation_recorded_as_a_human_call_is_accepted` (the
  positive path — the rule must not block the legitimate record)
- `test_a_human_decision_cannot_cite_an_ai_tiebreak`

The module docstring gains a *Cross-field coherence* section stating all
three rules and what each one prevents.

---

## Finding 2 (round 2, supplementary) — Major

> `decisions.jsonl` is self-excluded from phased verification under AI
> authority.

**Accepted in full, and it is the sharpest finding this set has
produced** — the machinery caught its own author committing the exact
violation the session was built to prevent. Adding `decisions.jsonl` to
`WORK_DIFF_SET_BOOKKEEPING` removed the decision record from a `--phase`
round's evidence bundle. That is a reduction in verifier visibility. It
was journaled as `authority: "ai"`, `verification_effect: "none"` — a
self-authorized verification reduction, which the hard carve-out forbids
outright.

**Why the obvious fix was wrong.** Simply reverting the bookkeeping entry
was checked and rejected on evidence, not preference. A post-round
journal append would then change `work_diff_sha256`, which invalidates
the stamp (`verification_stamp.py` step 9); an invalid stamp sends the
**close backstop** into a fresh round, and the close backstop has **no
bound** — Session 2's record is six consecutive such rounds, every one a
real metered dispatch recorded as `$0.0000`. Reverting would have traded
a visibility bug for an unbounded-spend bug.

**The actual defect** was conflating two different questions behind one
constant:

- **Freshness** asks *"did the reviewed work change after the stamp?"* A
  record **about** the work can be exempt, because the code and doc
  changes the decision produced bind the diff on their own.
- **Evidence** asks *"what should the verifier read?"* The AI-authority
  decision record is precisely what a reviewer should see.

**Fix** — split the consumers:

- `verification_stamp.EVIDENCE_VISIBLE_BOOKKEEPING = ("decisions.jsonl",)`
  — freshness-exempt entries that stay visible in evidence.
- `verification_stamp.PHASED_EVIDENCE_SET_EXCLUDES` — what a `--phase`
  round's evidence bundle excludes, **derived** from
  `WORK_DIFF_SET_BOOKKEEPING` minus the visible entries, so the two lists
  cannot drift on any shared entry (L-069-1).
- `verify_session.run()` now imports `PHASED_EVIDENCE_SET_EXCLUDES` for
  the evidence bundle. The freshness digest and
  `acceptance_evidence_is_stale()` keep using
  `WORK_DIFF_SET_BOOKKEEPING`, which is correct — both are freshness
  consumers.

Net effect: the verifier reads every journaled decision, and a journaled
adjudication still cannot stale its own round. The reduction the finding
named is **removed**, not authorized — so no operator attestation is
needed and none is claimed.

**Regression tests:**

- `test_the_journal_is_freshness_exempt_but_stays_in_phased_evidence` —
  the property the finding is about, asserted directly.
- `test_the_two_lists_differ_only_by_the_visible_entries` — the derived
  relationship, so a future entry added to one list cannot silently skip
  the other.
- `test_phased_evidence_actually_uses_the_evidence_list_not_the_freshness_one`
  — the wiring. Defining the new constant and leaving the consumer
  pointed at the old one would reproduce the defect under a new name and
  every other test here would still pass.

**Echoes fixed in the same pass** (L-065-1) — the old claim *"on a
`--phase` round the verifier does not see the journal"* appeared in four
places, all corrected: `verification_stamp.py`'s comment,
`docs/ai-led-session-workflow.md` → *Decision rights*,
`ai_router/CHANGELOG.md`, and `s3-conventions.md`.

**Journal entries.** The original decision record is **not edited** —
append-only is the point. Two superseding entries were appended, one per
finding, each naming the record it supersedes. The audit trail showing a
wrong call being caught and corrected is worth more than a tidy ledger.

---

## Suite

Targeted after the last code change: `test_decision_journal.py` →
**63 passed, 0 failed**. Full run of record recorded in the disposition.
