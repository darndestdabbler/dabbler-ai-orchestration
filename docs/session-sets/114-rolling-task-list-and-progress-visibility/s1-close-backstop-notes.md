# Session 1 — close-backstop notes (rounds 5 and 6)

The Set 084 close backstop runs the session verification **in-process
during the close it verifies**, so these are not remediation-loop
rounds — they are the close gate doing its job after the bounded loop
ended. Both found real defects. Recorded here because the raw artifacts
say *what* was found and this says *what was done about it*.

---

## Round 5 — "the session cannot pass the new `checklist_posted` gate it ships"

**True positive, and the most useful finding of the session.** The
ledger showed no post after verification round 2 (18:34) or round 4
(19:58): two genuine cadence misses by the orchestrator, caught by the
orchestrator's own gate.

The refusal exposed a design defect the unit tests could not: a post
window that has closed **cannot be re-entered**, so a single missed post
made the close permanently unreachable. The only remaining exit was
`close_session --force`, which bypasses every *other* gate as well — so
a check whose sole remedy is `--force` makes the close-out weaker
overall, not stronger.

**Fix:** the gate gained the escape `check_uat_walk_recorded` already
had — an operator-attested waiver (`disposition.checklist` with
`status: "waived"` and a non-empty `attestation`), refused when
unattested or blank, and never excusing a session that posted
**nothing**. Operator-authorized, and journalled as a
`verification-reduction` decision: the `decision_journal` screen
correctly refused a first, softer wording that declared the change
verification-neutral.

The two missed posts are waived under it, with the omission left on the
record. That is the difference between this and the laundering the
positional windows exist to prevent: a waiver puts a name against the
gap.

## Round 6 — "`disposition.json` uses an invalid `next_orchestrator.reason` shape"

**True positive.** The disposition carried `reason.detail` where the
schema requires `reason.specifics` (validated by
`session_state.validate_next_orchestrator`, minimum length enforced).
The session would have shipped a disposition that the state writer
rejects.

**Fix:** renamed to `specifics`; `validate_disposition` now returns
clean. Worth noting for the next author: the field is `specifics`, and
`docs/disposition-schema.md` documents it under *`next_orchestrator`
shape* — the freehand `detail` looked plausible and was not.
