# AI Assignment — Set 130

## Session 1 of 3 — The reader that refuses to guess

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic`.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** must be a non-`anthropic` effective provider, resolved by
model-registry lookup and enforced by the exclusion, as in Sets 128–129.

**Spec authoring, recorded here because it preceded registration.** This
set's `spec.md` was a reserved stub carrying an unsized two-session
sketch; it was authored in full before Session 1 registered, and the
decomposition decision is journaled in `decisions.jsonl`
(`goal-over-letter`, AI authority, reversible). The stub's premise was
re-derived against the live store rather than inherited — three of the
spec's six named traps (T4 WAL undercount, T5 self-measurement
truncation, T6 time windows cannot attribute) do not appear in the stub
and were found by measurement, and the stub's claim that routed cost is
*"correctly `$0.00`"* on a seat is false: Set 118 S1's five rounds
recorded `$0.0000` against 866.4 credits (`$8.66`).

**Operator direction, mid-session:** *"create a way to separate out the
main costs from the routed costs — if this isn't done already."* It is
not done. `router-metrics.jsonl` already distinguishes routed calls by
`transport` and flags them `billed_usage_unavailable: true`, but there is
no seat-cost measurement anywhere and no surface that breaks a total into
parts. The separation is this session's step 2 deliverable and is
structural, not presentational: the reader returns a **per-component
breakdown**, and a total exists only when every component in it is
measured.

## Session 2 of 3 — The join key, recorded instead of dropped

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic` — continuing
Session 1's trajectory, which is what Session 1's disposition recommended.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** must be a non-`anthropic` effective provider, resolved by
model-registry lookup and enforced by the exclusion — same constraint as
Session 1, which resolved `gpt-5.5`.

**Why the same orchestrator.** Session 2 consumes Session 1's vocabulary
directly: `seat_cost.SEAT_SESSION_ID_ENV`,
`seat_cost.seat_session_id_from_env()`, and the `--orchestrator` /
`--routed` id split the reader's CLI already takes. The two ids this
session records are precisely the two the reader already asks its caller
to supply by hand, so continuity is worth more here than a fresh
perspective — and the fresh perspective arrives anyway, on a different
provider, at Step 6.

**The join key is live in this conversation.** `COPILOT_AGENT_SESSION_ID`
is set in the seat environment at registration time, which is the fact
the whole session rests on. It is read here, not guessed.

**Scope discipline.** This session is plumbing into existing writers and
creates nothing. The two authored steps touch two sanctioned writers
(`register_session_start`, `record_call`) plus the state-schema doc and
the `metrics.py` schema docstring; the disposition contract and every
report surface belong to Session 3 and are deliberately not started here.
The one hazard worth naming up front is L-064-8 in miniature: a
state-shape change whose schema doc, JSON Schema and writer do not move
in the same pass.

## Session 3 of 3 — The contract, the report, and the corrected number

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic` — continuing
Session 2's trajectory, which is what Session 2's disposition recommended.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** must be a non-`anthropic` effective provider, resolved by
model-registry lookup and enforced by the exclusion — the same constraint
as Sessions 1 and 2, which both resolved `gpt-5.5`.

**Why the same orchestrator.** This session is the set's terminus and its
only integrating one: it consumes Session 1's vocabulary
(`seat_cost.COMPONENTS`, `STATUSES`, `CostReport`) *and* Session 2's two
records (`orchestrator.seatSessionIds`, `transport_session_id`) and joins
them into one report. Nothing here is a fresh-eyes problem; it is a
carry-the-context problem, and the fresh perspective arrives anyway, on a
different provider, at Step 6 — where it earned its keep twice.

**The set closes here.** Session 3 additionally owns `change-log.md`, the
one changelog fragment for the set, and the Step 9 reorganization review
of `project-guidance.md` / `lessons-learned.md`.

**Scope discipline, and where it moved.** The plan's two authored steps
are the contract and the report. Two things were folded in and journaled
rather than done silently:

- Two **pre-existing** parity gaps in the same two files
  (`disposition.schema.json` omitting `uat`/`checklist` under
  `additionalProperties: false`; `validate_disposition`'s object path
  skipping `verification_qualification`/`checklist`). Fixing them was
  cheaper than documenting why a third omit-null field was being added
  beside them without fixing them.
- The **assembler's placement** in `seat_cost.py`, which the spec's
  Touches list does not name. `disposition.py` is data + atomic I/O only,
  and putting the join in `close_session.py` would have forced a second
  implementation for the Set 118 re-pricing.

**What was deliberately NOT folded in.** Session 2's named residual —
`close_session` records no seat id, so a context reset that never
re-registers is unrecoverable retrospectively — stays a residual. Closing
it means making the close a second writer of the per-session orchestrator
block, which is a state-writer change no session in this set was planned
to make. The live reading at close includes that conversation via the
environment, so the number a human sees is right; the record is what
stays incomplete.

**Next set (recommendation).** Nothing in Set 130 gates anything. The two
obvious successors, in order of value:

1. **Close the residual**: make `close_session` accumulate the closing
   conversation's id through the sanctioned writer, so a reset session is
   measurable retrospectively rather than only live.
2. **Surface it**: a Work Explorer surface for `disposition.cost` — the
   named non-goal that keeps this set's `requiresUAT: false` honest, and
   the natural first consumer of a contract that now exists.

A budgeting or gating set is explicitly *not* recommended next: this set
measures, and a set that spends this data to gate anything needs an
operator attestation behind it and at least a few sessions of recorded
figures to calibrate against.

