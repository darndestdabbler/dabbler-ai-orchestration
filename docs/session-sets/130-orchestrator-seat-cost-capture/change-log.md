# Change log — Set 130: orchestrator seat cost capture

**Set:** `130-orchestrator-seat-cost-capture` (3 sessions, all VERIFIED)
**Source of record:**
[`docs/session-sets/118-test-retirement-and-coupling-budget/disposition.json`](../118-test-retirement-and-coupling-budget/disposition.json)
→ `notes`, read beside
[`measurement-correction.md`](../118-test-retirement-and-coupling-budget/measurement-correction.md)
— the same set catching itself asserting a reconstructed number as a
measured one.
**Ships:** a session's true cost, measurable from keys the repo already
had and threw away; an `unknown` that is structurally distinct from zero;
and the corrected figure for the session that started this.

---

## The number was not missing. The join key was.

Every session's Step 10 reports cost. On a Copilot CLI seat that report
was wrong in two directions at once, and Set 118 Session 1 is the worked
example of both:

| component | recorded at the time | measured |
| :--- | ---: | ---: |
| orchestrator seat | 4,266.6 cr / $42.67 | 4,743.2 cr / **$47.43** |
| routed calls (seat) | **$0.0000** | 866.4 cr / **$8.66** |
| routed calls (API) | — | not applicable |
| **total** | **$42.67** | **5,609.6 cr / $56.10** |

**+31%.** Neither gap is an arithmetic slip:

- The seat figure was **early**, not wrong. The turns that author a
  disposition and run a close are not in the store when a session reads
  its own number. A session cannot measure itself; any as-of-close figure
  is a floor.
- The routed figure was **fail-open**. Every `copilot-cli` metrics row
  carries `cost_usd: 0.0` beside `billed_usage_unavailable: true` — the
  flag was honest and the report ignored it, summed the zeros, and printed
  `Total cost: $0.0000` for five verification rounds that consumed $8.66.

And the hard part was not reading an undocumented store. Both halves of
the missing cost were keyed by ids the repo already held:
`COPILOT_AGENT_SESSION_ID` in the seat's environment (never read), and
`result.sessionId`, which `cli_transport` captured into
`transport_metadata` and `record_call()` had no parameter for (dropped).

Three sessions, one chain: **read** → **record** → **report**.

## Session 1 — the reader that refuses to guess

`ai_router/docs/seat-cost.md` names the three measurements —
`routed_api` (Direct APIs, priced, authoritative), `routed_seat` (routed
calls dispatched through the Copilot CLI: real spend, not priced by
`pricing.py`), `orchestrator_seat` (running the session) — and states the
rule that outlives the set: **a report showing one must say which it is
showing, and must name the components it could not measure.**

`ai_router/seat_cost.py` resolves the store, self-checks its shape before
trusting a number (pinned `schema_version`, required columns), sums
`total_nano_aiu` over an **explicit** set of conversation ids, and returns
a typed result whose absent answer is a named reason — never a number.
24 falsifiers, every one planted into a real SQLite store rather than
reasoned about, because every failure mode here returns a *plausible
number* instead of raising.

The one that no code review finds: `immutable=1` is the obvious choice for
a read-only adapter and it **skips the WAL**, returning a smaller correct-
looking number with no error (17,036 events vs 17,035; 168.0 credits vs
156.5 at one instant). Only a planted uncheckpointed row separates it from
a correct implementation.

## Session 2 — the join key, recorded instead of dropped

- `start_session` records `COPILOT_AGENT_SESSION_ID` into
  `session-state.json`'s per-session `orchestrator.seatSessionIds` —
  **appending**, because `start_session` is idempotent by design and is
  re-run after a context reset, and a reset starts a *new* conversation on
  the *same* workflow session. A last-writer-wins scalar would have
  dropped the first conversation's cost from precisely the sessions hard
  enough to need a reset.
- `record_call()` gained `transport_session_id`; `route()` passes the
  value the transport already captured. Additive-null on every historical
  row and every Direct-API row, which reads as *"not captured"* rather
  than a false claim.

Omit-null throughout: a Direct-API seat records **no key**, never `[]` —
"I looked and found none" is a different claim from "not captured", and
the empty list is the schema-level form of the `$0.00` defect.

## Session 3 — the contract, the report, and the corrected number

**`disposition.cost`** ships as a real field across all four surfaces in
one pass (the `Disposition` dataclass, `validate_disposition`,
`ai_router/schemas/disposition.schema.json`, and
`docs/disposition-schema.md`). Three rules are enforced on **both** halves
of the parity pair:

1. **An unmeasured component carries no number** — `credits: null`, never
   `0.0`. Zero looks like a measurement and no reader can tell it from a
   real zero.
2. **A report containing an unmeasured component has no total** — a total
   that drops one reports unmeasured spend as zero, the same defect one
   addition further along.
3. **An as-of-close figure cannot claim to be exact** —
   `measured_at: "close"` may not carry `total_status: "measured"`.

**The join is automatic.** `seat_cost.measure_session()` reads the
orchestrator ids from `session-state.json` and the routed ids from
`router-metrics.jsonl` — the two records Session 2 shipped — and prices
them. Attribution is by id and never by clock: the wall-clock window
around Set 118 Session 1 also contains 1,277.2 credits of Set 129's
conversation and two of *its* routed children, so a time heuristic bills
them to the wrong set.

**Two report surfaces stopped lying.** `print_metrics_report` no longer
adds unpriced rows into a dollar total: it reports the priced calls under
a label that says which measurement they are, names the unpriced ones, and
renders `-` rather than `$0.0000` for any group with nothing priced in it.
`close_session` prints the recorded cost block with its unknowns named —
and when a session recorded none, says the spend is **UNMEASURED, not
zero**, with the command that measures it.

**Two pre-existing parity gaps closed in the same pass** (L-069-1), both
found by adding a third field beside them: the JSON Schema omitted `uat`
(Set 111 S4) and `checklist` (Set 114 S1) while declaring
`additionalProperties: false`, so it rejected exactly the dispositions
those close gates require; and `validate_disposition`'s dataclass-path
dict view omitted `verification_qualification` (Set 123 S2) and
`checklist`, so a `Disposition` *object* carrying a bogus qualification
validated clean while the identical content as a dict was refused. A
three-way parity test now pins producer keys → validator allowlist →
schema properties.

## What this set deliberately did not do

- **No VS Code extension surface.** Nothing rendered changes, which is
  what keeps `requiresUAT: false` honest.
- **No Claude Code or Gemini adapter.** They keep no equivalent store, so
  cost incurred there is `unavailable` (real, unseen) — never
  `not_applicable` (cannot exist). Getting that backwards would report
  someone else's spend as zero.
- **No claim about the operator's bill.** The unit is AI credits at the
  seat's published conversion. On a plan with included credits the
  marginal dollar cost may be zero; this measures **consumption**.
- **No retroactive backfill.** Set 118 S1's five routed ids were recovered
  by hand because its conversation is identifiable. That is a
  demonstration, not a migration.
- **No budgeting or enforcement.** `disposition.cost` is not gated;
  nothing refuses a close for its absence. Measuring first. A set that
  spends this data to *gate* anything is a later set with an operator
  attestation behind it.
- **No change to `cost_usd` semantics.** The Direct-API path is correct
  and untouched; everything added is additive-null.

## Named residuals

- **`close_session` does not record a seat id.** A context reset whose
  orchestrator never re-runs `start_session` leaves that conversation out
  of `seatSessionIds` permanently. The *live* reading at close includes it
  (via the environment) so the number a human sees is right; a later
  retrospective measurement will not see it. Closing this means making the
  close a second writer of the per-session orchestrator block — a change
  no session in this set was planned to make.
- **`session_log.get_cost_summary()` still returns routed-API cost under
  the key `total_cost`.** Correct arithmetic, a label that overclaims. Off
  the close path, so it was left rather than renamed under a session that
  could not re-verify every caller.

## Reproduce the corrected number

```bash
python -m ai_router.seat_cost \
    --orchestrator 1f130689-5a85-4b39-9662-e4726bd40a86 \
    --routed 4e3a296a-c59a-43cf-b192-b4a8b380a8cd \
    --routed 9ea2cf1c-b471-424c-bb6b-101b1f4e65d0 \
    --routed 4f3bfdc4-79fb-4fb0-9be5-d41f3af05b0a \
    --routed 7ca3a4c3-f658-421a-8a45-6aced939357a \
    --routed 52ad2328-da3a-4dca-bf43-202cf5c83532 \
    --no-api-calls
```

For any session from Set 130 Session 2 onward, the ids are already
recorded and the command is:

```bash
python -m ai_router.seat_cost --session-set-dir docs/session-sets/<slug> \
    --session-number <n> --retrospective
```

The canonical reference is
[`ai_router/docs/seat-cost.md`](../../../ai_router/docs/seat-cost.md);
the `disposition.cost` shape is in
[`docs/disposition-schema.md`](../../disposition-schema.md).

---

## Step 9 — reorganization review of the guidance corpus

Run at the set-terminal session, post-notify. Outcome: **one refinement,
landed at zero net preload cost.**

**Added to L-112-1 (active tier).** *"Assert the RULE, not a substring a
SIBLING rule also emits."* This session planted 13 defects into the
production code to prove its falsifiers fire, and the **first one
escaped**: the assertion matched `"must be null when status is"`, which
the neighbouring `usd` check also emits, so deleting half the rule left
the test green. That is the same family as L-112-1's existing two bullets
— a check that looks like it discriminates and does not — and only
planting separates them. Preload was at 12,599 of a 12,600-token ceiling,
so it was paid for by compressing L-112-1's two existing examples;
`guidance_report --check` returns to **12,599**. Ceilings ratchet down
only, and this one did not move.

**`cite_lessons` flagged L-069-1 as archived-but-instrumental.** No
reactivation: its rule ("a bug is a bug CLASS — fix every sibling site")
was *promoted* to `project-guidance.md` → Code Style at Set 069 and is
already read at every session start. The pointer table in
`lessons-learned.md` says exactly this. The flag is the citation tool
being conservative, not a gap.

**No change recommended to `project-guidance.md`.** The three principles
this session leaned on hardest — validator/schema parity in both
directions, fix-every-sibling-site, and practicality-over-rule-perfection
— all applied unmodified and needed no amendment. The file is at 3,928 of
3,930 tokens, so any addition would have to displace something, and
nothing here earned that.

**Recommended for a future set, not landed here:** `run_of_record
affected` names which suites a session owes but not the **command** each
one runs. This session ran `npm test` instead of the declared
`npm run test:unit` and spent time diagnosing 44 failures in a harness no
gate uses. Printing `SuiteSpec.command` beside each affected suite is a
few lines and removes the trap entirely — an executable fix, which the
guidance lifecycle prefers over a prose rule.

