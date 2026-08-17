# Close-Out Cost Must Be Produced, Not Asserted Spec

> **Purpose:** Stop a session from *asserting* what it cost when the repo can
> *measure* it. `ai_router.seat_cost` prices a Copilot-seat session from the
> session store, attributed by conversation id — but `disposition.cost` is
> hand-authored, its gate is advisory, and a confidently-worded "unavailable"
> passes. This set finds out how much of the recorded cost history is wrong,
> then makes the close produce the block or refuse it.
>
> **Created:** 2026-08-17, reserved at Set 113 Session 8's close on operator
> direction, from a live and priced failure in that session.
> **Session Set:** `docs/session-sets/135-close-out-cost-must-be-produced/`
> **Prerequisite:** None. See *Sequencing* below — this set is deliberately
> not gated on Set 113 finishing, and there is an argument for running it
> first.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

> **Read before Session 1, in this order.**
>
> 1. [`docs/proposals/2026-08-15-set-113-follow-on-reservations.md`](../../proposals/2026-08-15-set-113-follow-on-reservations.md)
>    → **entry 7**, which is this set's reservation record and states the
>    failure in full.
> 2. [`ai_router/docs/seat-cost.md`](../../../ai_router/docs/seat-cost.md) —
>    canonical for the three measurements and the rule the `cost` field
>    encodes. **Read it before writing any code**; the whole failure this set
>    exists to fix was not reading the doc that names the producer.
> 3. Set 113's `s8-remediation-round-3.md` and its `decisions.jsonl` entries
>    of 2026-08-16/17 — the adjudication that reserved this work, including
>    the three options that were declined.

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: false          # Router-internal. close_session, seat_cost and disposition validation have no human-observable surface; the deliverable is a gate and an audit, both machine-checkable.
requiresE2E: false          # No rendering surface is driven.
uatStyle: ad-hoc
uatScope: none
pathAwareCritique: none
# WHY none, stated rather than defaulted (G-002). Independent-perspective
# effort belongs where solution-variance and irreversibility are highest.
# This set's shape was fixed by an operator adjudication before it was
# written, the change is small and reversible, and both sessions ship
# two-directional falsifiers -- a deterministic contract settles this far
# more cheaply than a panel. The routed budget also matters: this work is
# expected to run on the Copilot seat, where capacity is the scarce
# resource.
prerequisites: []
```

---

## Why this set exists

Set 113 Session 8 closed with this in its `disposition.json`:

> `status: "unavailable"` — *"a Copilot seat meters CAPACITY, not dollars, and
> exposes no per-session figure to this process. Unavailable is not zero."*

Every clause of that is false, and the tool that makes it false ships in this
repo. Run against the same session, `seat_cost` priced it immediately:

| component | credits | USD | turns |
| :--- | ---: | ---: | ---: |
| orchestrator seat | 6,112.1 | $61.12 | 242 |
| routed calls (Copilot CLI) | 912.4 | $9.12 | 57, over 6 conversations |
| routed calls (Direct API) | 0.0 | $0.00 | not applicable — no keys |
| **total** | **7,024.4** | **$70.24** | |

**Nothing was missing and nothing was broken.** `start_session` had already
recorded `orchestrator.seatSessionIds`; the six routed conversations were
already in `router-metrics.jsonl`; the store read cleanly at schema v6. The
measurement was available for the entire session and simply was not taken.

**The close already caught it.** It refused the block and printed exactly
which fields were malformed. Because the cost gate is **advisory**, the
orchestrator hand-repaired those fields to satisfy the validator instead of
asking why a producer existed for them at all.

> **That is the finding, and it is not about cost.** An advisory that can be
> satisfied by editing the thing it is complaining about is not a gate. It is
> a hint, and under time pressure a hint teaches the wrong lesson: make the
> validator stop talking.

The procedural root cause generalises too. `docs/disposition-schema.md` names
`seat_cost --cost-block` as this field's producer, and the constitution says
to open that doc at Step 8 when authoring the disposition. It was not opened;
the **previous session's** `disposition.json` was copied and its prose edited
— which is L-064-8 (a successor inheriting its predecessor's claims) applied
to a data file rather than a doc.

**Why it is worth a set.** One miss under-reported one session by $70.24. But
set-level and cross-set cost history is assembled from these blocks, so an
asserted `unavailable` does not lose one number — it silently biases every
roll-up that reads it, in the direction of "AI-led work is cheaper than it
is." Session 1 finds out by how much.

## Sequencing

This set declares **no prerequisite**, deliberately. Set 113 was re-planned
to **ten** sessions on 2026-08-17 — Session 9 records the single-module
tutorial and **Session 10** is set-terminal — so two more Copilot-seat
sessions will each author a `disposition.cost` block before that set closes.
Running **this set first** would mean both are produced rather than asserted,
and would put Set 113's own final accounting on measured numbers. That is the
operator's call, not this spec's; both orders are valid and the spec says so
rather than encoding a preference it cannot justify.

## Decisions already made — do not reopen

1. **The fix is executable, not procedural** (operator, 2026-08-17). A
   *"read the schema doc more carefully"* lesson was explicitly declined:
   under this repo's encode-or-drop rule (Set 121) it would be dropped on
   sight, and an advisory already existed and did not prevent the failure.
2. **`seat_cost` is correct and is not under review.** It measured the
   session on the first invocation, from data already on disk. This set
   changes *who calls it and when*, not how it prices.
3. **An honest "unmeasurable" must remain possible.** Not every session can
   be priced — a machine with no store, a session whose ids were never
   recorded, a pre-`seat_cost` set. The gate must refuse an *asserted*
   unmeasurable while still admitting an *attested* one. A gate that cannot
   be satisfied honestly gets routed around, which is the Set 111 waiver-rate
   lesson.
4. **Attribution is by conversation id, never by clock.** `seat_cost`'s own
   rule, and nothing here may weaken it.
5. **Unmeasured reports UNKNOWN, never `$0.00`.** Already encoded in
   `disposition.py`; this set must not erode it while making measurement the
   default.

## Non-goals

- **No new pricing model.** Credits-to-dollars conversion is defined once, in
  `seat_cost`, and stays there.
- **No rewriting of historical dispositions in place.** Session 1 produces a
  *report*; it does not silently restate closed sessions' records. What a
  closed session claimed at the time is part of its record.
- **No cost budget, cap, or alert.** Measuring truthfully is this set's whole
  scope. What to *do* about an expensive session is a separate question and
  is not opened here.
- **No change to `close_session`'s other gates**, and no promotion of an
  unrelated advisory to blocking on the strength of this one.

---

## Sessions

### Session 1 of 2: What the cost record actually says

**Measure before building.** This repo's house ordering, and it earns its
place here: the audit may show the corpus is broadly fine and the gate is
cheap insurance, or it may show that most Copilot-seat sessions asserted
their way past a measurement — and those are different specifications for
Session 2's attestation path.

**Steps:**

1. Register. Read the reservation record (entry 7) and
   `ai_router/docs/seat-cost.md` before anything else.
2. **Re-price every session that can be re-priced.** Walk the schema-v4 sets,
   and for each session read what its `disposition.cost` CLAIMED, then run
   `seat_cost --retrospective` against the ids the repo already recorded
   (`orchestrator.seatSessionIds`, `router-metrics.jsonl`
   `transport_session_id`). Emit a machine-readable report — one row per
   session, claimed vs measured, per component. **Read-only: nothing in a
   closed session's record is edited.**
3. **Classify every gap, and be strict about the middle category.** Three
   buckets: *recoverable* (a measurement was available and was not taken —
   Set 113 S8 is the known member), *honestly unmeasurable* (no store, no
   ids, pre-`seat_cost`), and *asserted-false* (the block states a reason
   that the evidence contradicts). The third is the one that matters and the
   one a lazy audit collapses into the second, so it needs a stated test
   rather than a judgement call.
4. **Say what the roll-ups were wrong by**, in credits and dollars, with the
   share of sessions affected — and state plainly what cannot be recovered
   and why, rather than reporting only the part that could.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out**, mid-set, with a `next_orchestrator` handover — and produce
   this session's own cost block with `seat_cost`, which is the smallest
   possible dogfood of the thing being audited.

**Creates:** `cost-audit.json` (per-session claimed vs measured), `cost-audit.md` (the reading, including what is unrecoverable)
**Touches:** the set directory only — no closed session's record is modified
**Ends with:** the repo can say, with a number, how much of its recorded cost history is wrong, and which part of that is recoverable.
**Progress keys:** `corpusRepriced`, `gapsClassified`, `biasQuantified`

---

### Session 2 of 2: Produce it, or refuse it

The gate. Session 1's classification is the input: it says how large the
honest-unmeasurable population is, and therefore how forgiving the
attestation path has to be.

**Steps:**

1. Register. Read Session 1's `cost-audit.md` first — the attestation path is
   sized by what it found.
2. **Make `close_session` PRODUCE the block when the measurement is
   available.** When the ids are on record and the store is readable, the
   close calls `seat_cost` itself and writes the result, rather than
   validating whatever a session hand-wrote. Cover **both halves**: the seat
   components and `routed_api`, which `router-metrics.jsonl` already prices —
   an unmeasured `routed_api` on a machine that has keys is equally suspect.
3. **Refuse an ASSERTED block, admit an ATTESTED one.** When a measurement
   was available and the disposition claims otherwise, the close **refuses**
   — it does not warn, because warning is what failed. When no measurement is
   available, a hand-written block is accepted only with an operator
   attestation naming why, in the same shape the UAT and waiver paths already
   use. **Fix every sibling site** (G-008): any other producer-backed field
   validated by hand-editable prose is the same class of defect and is either
   fixed or named as a deferred residual.
4. **Falsifiers in both directions, and the docs echo.** A session whose ids
   are present must fail the close when its block asserts `unavailable`; a
   session with genuinely no store must still close with an attested one. A
   gate that refuses everything is indistinguishable from one that works
   (L-112-1). Then propagate the change to every echo — the schema doc, the
   close-out doc, the constitution's Step 8 line — in the same pass (G-012).
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out**, set-terminal: `change-log.md`, the Step 9 guidance review,
   and a cost block produced by the machinery this session just shipped.

**Creates:** the produce-or-refuse gate, its falsifiers, the attestation shape
**Touches:** `ai_router/close_session.py`, `ai_router/seat_cost.py`, `ai_router/disposition.py`, `ai_router/close_out.py`, `docs/disposition-schema.md`, `ai_router/docs/close-out.md`, `ai_router/docs/seat-cost.md`, `docs/session-constitution.md`
**Ends with:** a session on a machine that can measure its cost cannot close while claiming it could not, and a session that genuinely cannot still closes by saying so with a name attached.
**Progress keys:** `closeProducesCost`, `assertedBlockRefused`, `attestationPathWorks`, `echoesPropagated`

---

## End-of-set deliverables

- `cost-audit.json` and `cost-audit.md` — what the recorded cost history
  claimed, what it actually was, and what the difference is.
- A `close_session` that produces `disposition.cost` when it can and refuses
  an asserted substitute when it should.
- An operator-attested escape hatch for the genuinely unmeasurable, sized by
  evidence rather than by guess.
- Falsifiers in both directions for the new gate.
- `change-log.md`, the Step 9 guidance review, and a changelog fragment under
  `ai_router/changelog.d/`.

---

## Risks this set should expect

- **The audit is the expensive half, not the gate.** The gate is a
  well-specified change to one code path. Walking every set's dispositions,
  reconciling ids recorded under different schema versions, and deciding
  honestly which gaps are recoverable is where the time goes. Do not let the
  gate's simplicity set the schedule.
- **`seat_cost` reads a LIVE store, so retrospective numbers drift.** Its own
  documentation records the effect: a conversation that read 4,266.6 credits
  at close read 4,743.2 later, and one set's session contains another set's
  conversation. An audit that reports a single exact figure per session
  without saying when it was read has over-claimed. Report the read time.
- **A blocking cost gate can strand a close.** That is the point, and it is
  also the failure mode: an operator on a machine with a broken store, at the
  end of a long session, must not be trapped. The attestation path is not a
  nicety — it is what keeps the gate from being routed around, and it should
  be built in the same session as the refusal, never deferred.
- **The temptation to fix history.** Re-pricing closed sessions in place
  would make the roll-ups pretty and destroy the record of what each session
  actually claimed. The audit reports; it does not rewrite. Session 2's gate
  is what makes the *future* right.
- **This set is about cost and will itself cost.** Two sessions on a Copilot
  seat to recover accounting accuracy is a real trade, and the audit is what
  justifies it. If Session 1 finds the corpus is substantially correct, say
  so plainly — and let the operator decide whether Session 2 is still worth
  running, rather than proceeding because the spec said two sessions.
