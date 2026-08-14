# Conventions for Set 130 Session 3 verification

Read this before the diff. It states the agreed baseline so the round
spends its findings on real defects rather than on things already settled.

## What this session is

Set 130 Session 3 of 3, **"The contract, the report, and the corrected
number."** The set's arc is **read** (S1) → **record** (S2) → **report**
(this session).

- **Session 1** shipped `ai_router/seat_cost.py`: hand it conversation ids
  and it returns credits, dollars and a stated confidence, with every
  failure path a named status and `credits: None` — never `0.0`.
- **Session 2** made the ids exist: `orchestrator.seatSessionIds` on the
  per-session state block (written by `start_session`, accumulating across
  context resets) and `transport_session_id` on every metrics row.
- **This session** ships the contract that carries the number
  (`disposition.cost`), the join that produces it automatically, and the
  two report surfaces that were presenting unmeasured spend as `$0.00`.

## The claim most worth attacking

Everything here is one rule made structural:

> A report showing cost must say **which measurement** it is showing, and
> must **name the components it could not measure**.

The failure this exists to prevent is not an exception — it is a
**plausible number**. Set 118 Session 1 recorded `$42.67`; it cost
`$56.10`. Both halves of the gap printed something that looked right:
`Total cost: $0.0000` for five rounds that consumed $8.66, and a seat
figure that was a floor nobody labelled.

So the highest-value findings are places where this session can still
produce a confident wrong number, or where an absence can still read as a
zero. Three rules encode it, each enforced on **both** halves of the
parity pair (`validate_disposition` and `disposition.schema.json`):

1. an unmeasured component carries `credits: null`;
2. a report containing one has **no total**;
3. `measured_at: "close"` may not claim `total_status: "measured"` (a
   session's closing turns are not in the store while it is closing).

## Falsifiers, and the proof they fire

16 new test functions carrying ~30 parametrized cases. Per L-112-1 they
were proved to fire by **planting the defect into the production code**,
not by reading it. 13 plants, each reverted from a file copy afterwards,
each caught **selectively**:

| plant | fired |
| :--- | :--- |
| validator drops rule 1 (unmeasured component may carry a number) | 3 failed, 91 passed |
| schema drops rule 1 (the `CostComponent` null-credits branch) | 3 failed, 91 passed |
| validator drops rule 2 (a total survives an unmeasured component) | 1 failed, 93 passed |
| validator drops rule 3 (an as-of-close figure claims exactness) | 1 failed, 93 passed |
| object-path dict view drops `checklist` again | 1 failed, 93 passed |
| schema drops the `uat` block again | 2 failed, 92 passed |
| `cost` dropped from the serialized disposition | 13 failed, 81 passed |
| report renders an all-unpriced group as `$0.0000` again | 1 failed, 22 passed |
| unpriced rows summed into the priced total again | 3 failed, 20 passed |
| the selector drops the session-number filter | 2 failed, 50 passed |
| the assembler ignores the recorded seat ids | 2 failed, 27 passed |
| the cost block keeps the operator's absolute store path | 1 failed, 28 passed |
| the close prints nothing when no cost block was recorded | 1 failed, 33 passed |

The first plant initially **escaped**, and that is the useful part of the
record: the assertion read `"must be null when status is"`, which the
`usd` rule also produces, so deleting half the rule left the test green.
It now names `credits` and `usd` separately. A plant that fires nothing is
a test that was confirming itself.

## Live dogfood

The chain ran against real data, not fixtures:

- This session's own conversation was captured at registration
  (`8c80156b-…`) and priced by the assembler through
  `measure_session(..., live=True)` — reported as a **LOWER BOUND**, with
  `routed_seat` correctly `UNKNOWN` rather than `$0.00`.
- `print_metrics_report` over the real 237-row log: 1 priced call, **236
  not priced here**, of which 2 carry the conversation id that prices
  them. Before this session that log printed `Total cost: $0.0000`.
- Set 118 Session 1 re-priced with the shipped CLI: **5,609.6 credits /
  $56.10** against $42.67 recorded, identical to Session 1's figures —
  which is itself the §5.2 claim (a finished session measures the same
  every time).

## Two pre-existing parity gaps, fixed in the same pass

Both are the class `project-guidance.md` → Code Style names ("a bug is a
bug CLASS — fix every sibling site"), and both were found by adding a
third omit-null field beside them. Journaled in `decisions.jsonl`.

1. `disposition.schema.json` omitted `uat` (Set 111 S4) and `checklist`
   (Set 114 S1) while declaring `additionalProperties: false`, so the
   shipped schema **deterministically rejected** the dispositions the
   `uat_walk_recorded` and `checklist_posted` close gates require. This is
   the same defect Set 123 S2 graded Major on `verification_qualification`.
2. `validate_disposition`'s dataclass-path dict view omitted
   `verification_qualification` and `checklist`, so a `Disposition`
   **object** carrying an invented qualification token validated clean
   while the identical content as a **dict** was refused.

A three-way parity test now pins producer keys → validator allowlist →
schema properties, so the class cannot silently re-open.

## Deliberate scope boundaries (by design, not oversight)

- **`disposition.cost` is not gated.** Nothing refuses a close for its
  absence. "No verification-cost budgeting or enforcement" is a named
  non-goal in `spec.md`: this set measures. A finding that the field
  should be required is out of scope for this set by name.
- **No VS Code extension surface, no Claude/Gemini adapter, no
  retroactive backfill, no change to `cost_usd` semantics** — all named
  non-goals in `spec.md`.
- **The assembler lives in `seat_cost.py`, which the spec's Touches list
  does not name.** Placement is the orchestrator's call under the
  decision-rights rubric and is journaled: `disposition.py` is data +
  atomic I/O only, and putting the join in `close_session.py` would force
  a second implementation for retrospective measurement.
- **16 test functions against an irony budget of 8.** Journaled with its
  breakdown: the budget was authored when this session looked like a
  contract change alone.
- **The `docs/session-constitution.md` edit is net-negative in bytes.**
  The preload total was at 12,599 of a 12,600-token ceiling, so naming
  `disposition.cost` at Step 10 was paid for by removing the provider-key
  enumeration duplicated from the engine bootstrap files. Ceilings ratchet
  down only; `guidance_report --check` passes.

## Named residuals (recorded, not hidden)

- **`close_session` does not record a seat id.** A context reset whose
  orchestrator never re-runs `start_session` leaves that conversation out
  of `seatSessionIds` permanently. The **live** reading at close includes
  it via the environment, so the number a human sees is right; a later
  retrospective measurement will not see it. Closing this means making the
  close a second writer of the per-session orchestrator block, which no
  session in this set was planned to make. Journaled.
- **`session_log.get_cost_summary()` still returns routed-API cost under
  the key `total_cost`.** Correct arithmetic, a label that overclaims. Off
  the close path; named in `seat-cost.md` §2 as a residual rather than
  renamed under a session that could not re-verify every caller.

A finding that re-raises either is welcome as confirmation, not as a new
defect.

## Suite baseline

- The nine directly-affected pytest files —
  `test_disposition.py`, `test_metrics.py`, `test_seat_cost.py`,
  `test_close_session_skeleton.py`, `test_close_session_integration.py`,
  `test_close_preflight.py`, `test_close_mandated_writes.py`,
  `test_start_session.py`, `test_production_imports.py` — **353 passed**.
- `python -m ai_router.guidance_report --check`: **OK**, 12,597 of 12,600.
- `python -m ai_router.changelog check --target router`: **round trip OK**.
- The **required portion of the full suite** has **not yet run** at the
  time this evidence was assembled. It runs at the session's
  second-to-last step, after any remediation this round produces — that
  ordering is the repo's test-run policy (A1–A4), not an omission.

## Release contract

No version bump (`ai_router.__version__` stays `1.0.0`), no PyPI or
Marketplace action. The set's single changelog fragment
(`ai_router/changelog.d/0120-set-130-orchestrator-seat-cost-capture.md`)
lands here at the set-terminal session, which is this repo's
one-fragment-per-set convention.

## Severity rubric

Grade by **consequence**: probability the stated failure scenario hits a
real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit.
