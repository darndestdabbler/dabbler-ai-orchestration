## [Unreleased] — what a session costs, and the unknown that is not zero (Set 130)

### Added

- **(Set 130 S1) `ai_router/seat_cost.py` — the reader that refuses to
  guess.** Prices an **explicit** component → conversation-id mapping
  against the Copilot CLI's local usage store and returns a typed
  `CostReport` of separately-labelled `ComponentCost` values. Every
  failure path is a **named status** carrying a reason, and `credits` is
  `None` — never `0.0` — whenever the number is not known: `measured`,
  `lower_bound`, `unknown`, `unavailable`, `schema_unrecognized`,
  `not_applicable`. A total exists **only** when every component in it was
  measured, because a total that quietly drops one reports unmeasured
  spend as zero.

  `unavailable` vs `not_applicable` is the whole fail-open question in two
  words. Claude Code and Gemini keep no local usage store, so cost
  incurred there is `unavailable` (real, unseen), never `not_applicable`
  (cannot exist) — and only the *caller* may declare the latter.

  The store's `schema_version` is pinned and the columns actually read are
  checked **before** any number is trusted: it is a private store read by
  inference, and refusing is better than multiplying by a stale constant.

- **(Set 130 S1) `ai_router/docs/seat-cost.md`** — canonical for the three
  measurements (`routed_api`, `routed_seat`, `orchestrator_seat`), for the
  rule that **any report showing one must say which it is showing and name
  what it could not measure**, and for the three traps that produce a
  plausible wrong number.

- **(Set 130 S2) `orchestrator.seatSessionIds` on the per-session state
  block.** `start_session` records `COPILOT_AGENT_SESSION_ID` through the
  sanctioned writer, **appending** rather than replacing: `start_session`
  is idempotent by design and is re-run after a context reset, and a reset
  starts a *new* conversation on the *same* workflow session. Deduped,
  order-preserving, omit-null — a Direct-API run records **no key**, never
  `[]`, because "captured, and there were none" is a claim the empty list
  makes and the seat cannot support.

- **(Set 130 S2) `transport_session_id` on every `router-metrics.jsonl`
  row.** `record_call()` gained the column and `route()` passes the
  `sessionId` the Copilot CLI transport already captured and had nowhere
  to put. It is the primary key of the usage store, so a row carrying it
  can be priced exactly; a row without it can only be attributed by wall
  clock, which cannot attribute at all. Additive-null on every historical
  row and permanently null on the `api` profile, where `cost_usd` is
  already authoritative and no child conversation exists.

- **(Set 130 S3) `disposition.cost` — the contract.** Components carried
  separately with a per-component status, so `unknown` is representable
  and *shaped* differently from zero. Three rules, enforced by both
  `validate_disposition` and `ai_router/schemas/disposition.schema.json`
  (the parity contract, both directions): an unmeasured component carries
  `credits: null`; a report containing one has **no total**; and a figure
  taken at close cannot claim to be exact, because the turns that author
  the disposition and run the close are not in the store while the session
  is closing. Omit-null — a session that measured nothing carries no
  block, which claims nothing.

- **(Set 130 S3) `seat_cost.measure_session()` /
  `session_conversation_ids()` — the join.** Reads the orchestrator ids
  from `session-state.json` and the routed ids from
  `router-metrics.jsonl`, prices them, and emits the `disposition.cost`
  block. Nothing is guessed and nothing comes from a clock. Exposed as
  `python -m ai_router.seat_cost --session-set-dir <dir>
  [--session-number N] [--retrospective] [--cost-block]`. A live reading
  includes the calling conversation and reports a **lower bound**; the
  `--retrospective` reading of a finished session is exact.

- **(Set 130 S3) `metrics.transport_session_ids()` and
  `metrics.priced_and_unpriced()`** — the selector for the join key,
  keyed the way the log actually is (normalized slug, so the historical
  mixed path shapes match), and the split that decides what `cost_usd` is
  a measurement *of*.

### Changed

- **(Set 130 S3) `print_metrics_report` stops presenting unpriced calls as
  `$0.0000`.** `cost_usd` is billing-authoritative only where
  `billed_usage_unavailable` is not true; on a seat row it is a
  placeholder beside a flag that says so. The header now reports the
  priced calls under a label naming which measurement they are, states how
  many calls are **not priced here** and how many of those carry the
  conversation id that prices them, and every table cell renders `-`
  rather than `$0.0000` for a group with nothing priced in it (`+` marks a
  mixed group). Set 118 Session 1's five verification rounds are the
  worked example: `$0.0000` printed, $8.66 spent.

- **(Set 130 S3) `close_session` reports cost.** The recorded
  `disposition.cost` block is printed component by component with its
  unknowns named, and carried in `--json` output under `cost`. A session
  that recorded no block gets `cost_note` instead, saying the spend is
  **UNMEASURED, not zero** and naming the command that measures it. It is
  **not** a gate: nothing refuses a close for an absent block.

- **(Set 130 S3) `docs/session-constitution.md` Step 10 names
  `disposition.cost`.** Paid for under the preload ceiling by removing the
  provider-key enumeration duplicated from the engine bootstrap files; the
  file is a net 8 bytes smaller.

### Fixed

- **(Set 130 S3) The disposition JSON Schema rejected `uat` and
  `checklist`.** Both shipped (Sets 111 S4 and 114 S1) without being added
  to `disposition.schema.json`, which declares
  `additionalProperties: false` — so the shipped schema deterministically
  refused exactly the dispositions the `uat_walk_recorded` and
  `checklist_posted` close gates require. Same defect class Set 123 S2
  caught as a Major on `verification_qualification`; found this time by
  adding a third omit-null field beside them.

- **(Set 130 S3) `validate_disposition` skipped two fields when handed a
  `Disposition` object.** The dict view it builds for the object path
  omitted `verification_qualification` and `checklist` entirely, so an
  object carrying an invented qualification token or an incoherent
  checklist block validated **clean** while the identical content as a
  dict was refused. A parametrized falsifier now asserts the two paths
  return the same errors for every optional field.

### Measurement

- **Set 118 Session 1, re-priced with the tool:** 4,743.2 credits
  ($47.43) of orchestrator seat plus 866.4 credits ($8.66) of routed
  verification, **5,609.6 credits / $56.10** against the **$42.67**
  recorded at the time — **+31%**. The seat figure was early, not wrong (a
  session cannot measure itself); the routed figure was the `$0.0000`
  fail-open. Re-derived unchanged on 2026-08-14, which is itself the point:
  a finished session measures the same every time. Command and predicate:
  `ai_router/docs/seat-cost.md` §7.
