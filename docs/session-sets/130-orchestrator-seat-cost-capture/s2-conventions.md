# Conventions for Set 130 Session 2 verification

Read this before the diff. It states the agreed baseline so the round
spends its findings on real defects rather than on things already settled.

## What this session is

Set 130 Session 2 of 3, **"The join key, recorded instead of dropped."**

The set makes a session's true cost measurable on a Copilot CLI seat.
Session 1 shipped the **reader** (`ai_router/seat_cost.py`) — it takes a
set of store conversation ids and returns credits, dollars and a stated
confidence. It has to be handed those ids by hand, because **nothing in
the repo records one**, even though both halves already exist and are
thrown away:

| what | where the id already is | where it went before this session |
| :--- | :--- | :--- |
| the orchestrator's own conversation | `COPILOT_AGENT_SESSION_ID` in the seat environment | nowhere — never read |
| each routed call's child conversation | `cli_transport` reads `result.sessionId` into `transport_metadata["session_id"]` | dropped — `record_call()` had no parameter for it |

This session is **entirely plumbing into two existing sanctioned
writers**. It creates no new files. It ships:

1. `orchestrator.seatSessionIds` on the per-session state block, written
   by `register_session_start` and **accumulating** across re-registers.
2. `transport_session_id` on every `router-metrics.jsonl` row, additive-null.

**Session 3** owns `disposition.cost`, `print_metrics_report`, the
close-out reporting path, and the re-pricing of Set 118 S1. A finding
that this session records ids nothing yet *reports* is **by design and
out of scope** — that is Session 3 by name in `spec.md`.

## The two claims most worth attacking

This session can ship exactly two defects, and both leave a state file
that still validates and still looks complete:

1. **The id is not actually captured**, because the writer accepts a
   parameter nothing ever passes. A unit test of `register_session_start`
   passes in that world. This is why every capture falsifier is driven
   through `start_session.run()` with a planted environment variable, and
   why the live dogfood below matters more than any of them.
2. **An absence is recorded as a zero.** `seatSessionIds: []` is the
   schema-level form of the `$0.00`-instead-of-`unknown` defect this whole
   set exists to kill (spec T2): it claims "I looked, and this session was
   produced by no conversations", which is false on a Direct-API seat
   where the honest statement is "not captured". The contract is that the
   key is **ABSENT**, never `[]` and never `null`, and it is asserted
   against the raw file, not against the parsed block.

A third, subtler one: **replacing instead of appending**. `start_session`
is idempotent by design and is re-run after a context reset — and a reset
starts a *new* conversation on the *same* workflow session. A
last-writer-wins scalar would drop the first conversation's cost from
precisely the sessions that were hard enough to need a reset.

## Falsifiers, and the proof they fire

13 new test functions (10 in `test_start_session.py`, 3 in
`test_metrics.py`). Per L-112-1 they were proved to fire by **planting
the defect into the production code**, not by reading it. Five plants,
each reverted from a file copy afterwards:

| plant | fired |
| :--- | :--- |
| `build_orchestrator_block` writes `[]` instead of omitting the key | 2 failed |
| `accumulate_seat_session_ids` replaces instead of appending | 2 failed, 7 passed |
| the plan-less carry-forward branch removed | 1 failed, 9 passed |
| `start_session.py` hardcodes `COPILOT_AGENT_SESSION_ID` instead of importing the single spelling | 1 failed — **and the 4 behavioural tests still passed**, which is the entire argument for the structural assertion |
| `record_call` drops the column / `_copilot_session_id` returns the raw value | 2 failed / 1 failed |

Selective firing is the point: a plant that failed everything would prove
only that the suite is coupled, not that the assertions discriminate.

## Live dogfood

The feature captured **the session that built it**. Session 2 registered
at 04:48 (before the code existed), so its block had no ids; re-running
`start_session` after the change captured
`04ab6f3d-3dc9-4f6c-b88d-eb64c06ef0c1`, and feeding that recorded id to
Session 1's reader prices this session at **962.8 credits / $9.63**, with
the routed component correctly reporting `UNKNOWN` rather than `$0.00`.

That is the end-to-end chain the two sessions exist to build, exercised
on real data rather than a fixture.

## Suite baseline

- `test_start_session.py` + `test_metrics.py` — **64 passed** (51 pre-existing, 13 new).
- The surfaces that could break on a state-shape change —
  `test_orchestrator_identity.py` (incl. `TestSessionStateSchemaParity`),
  `test_session_state_v4_writers.py`, `test_session_state_v3.py`,
  `test_session_state_v2.py`, `test_session_state_robustness_077.py`,
  `test_production_imports.py` — **256 passed** together with the two above.
- The **required portion of the full suite** has **not yet run** at the
  time this evidence was assembled. It runs at the session's
  second-to-last step, after any remediation this round produces — that
  ordering is the repo's test-run policy (A1–A4), not an omission.

## Integration surfaces deliberately NOT changed, and why

- **The v3→v4 migrator sweep.** `_RETIRED_ORCHESTRATOR_KEYS` is a
  **denylist** (`chatSessionId` / `checkedOutAt` / `lastActivityAt`), so
  `seatSessionIds` survives a sweep untouched. An allowlist there would
  have silently deleted the new field; it was checked, not assumed.
- **The VS Code extension.** `OrchestratorInfo` and the `fileSystem.ts`
  read are structural TypeScript type assertions over parsed JSON with no
  runtime stripping, and the TS `normalizeToV4Shape` round-trips the block
  as an opaque object. `identityProvenance` (Set 084) is likewise absent
  from that interface and has been fine. No extension surface changes —
  a named non-goal in `spec.md`, and what keeps `requiresUAT: false` honest.
- **`mark_session_complete`.** Already carries the orchestrator block
  wholesale via `_apply_v4_per_session_metadata`, so recorded ids survive
  close as historical attribution with no change.

## Release contract

Nothing is released by this session. No version bump, no changelog
fragment, no PyPI or Marketplace action. The changelog fragment for this
set is authored at the **set-terminal** session (Session 3), which is
this repo's one-fragment-per-set convention.

## By-design exclusions

- **No retroactive backfill.** Past sessions never recorded an id and
  none is invented for them. Set 118 S1 is re-priced by hand in Session 3
  because its conversation is identifiable; that is a demonstration, not
  a migration.
- **Capture is not gated on `--engine`.** The variable is exported by the
  conversation that actually spawned the process, so its presence is
  evidence of which conversation is running the session. Gating on the
  engine label would discard a true id to satisfy a label. This is
  journaled in `decisions.jsonl`.
- **`transport_session_id` is permanently null on the Direct-API path.**
  That path spawns no child conversation and its `cost_usd` is already
  authoritative. Null reads as "not captured", which is correct there.
- **`pathAwareCritique` is deliberately absent** (default `none`). Sets
  118 and 128 armed it because they *reduced* verification. This set
  reduces none.

## Known residual, already recorded

`close_session` does **not** capture a seat id. If an orchestrator suffers
a context reset and never re-runs `start_session`, the final
conversation's cost is unrecorded. `close_session.py` is in **Session 3's**
Touches list, not this session's, so folding it in here would be scope
creep. Naming it as a residual rather than fixing it silently is the
intended handling; a finding that re-raises it is welcome as
confirmation, not as a new defect.

## Severity rubric

Grade by **consequence**: probability the stated failure scenario hits a
real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit.
