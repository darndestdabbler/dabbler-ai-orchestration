# What the cost record actually says

> **Set 135, Session 1.** A read-only audit of every cost claim this repo has
> ever committed, re-priced against the ids the repo already recorded.
> **Nothing in a closed session's record was modified.**
>
> Machine-readable companion: [`cost-audit.json`](cost-audit.json).
> Store read repeatedly during 2026-08-17, schema v6; every figure is stamped
> in the JSON. Attribution is by **conversation id** only — no clock window
> bills a conversation to a session (`ai_router/docs/seat-cost.md` §5.3).

---

## Scope

The spec says *"walk the schema-v4 sets"*. Every headline figure below is
computed over **schema-v4 sessions that actually ran** — status `complete` or
`in-progress`:

| population | n |
| :--- | ---: |
| **in scope** (schema-v4, ran) | **265** |
| out of scope: schema-v3, complete | 129 |
| out of scope: schema-v3, never started | 30 |
| out of scope: schema-v4, never started | 7 |

**None of the 166 out-of-scope rows is priceable today**, so the scoping
decision moves no cost figure — only the denominator. They are reported here
rather than folded into a total that sizes Session 2.

---

## The short answer

The recorded cost history is **not broadly wrong. It is broadly absent.**

Of the **265** in-scope sessions, **22** ever authored a `disposition.cost`
block at all — because the contract only shipped on 2026-08-14 (Set 130 S3).
Of the **16 closed sessions that can be priced today**, the surviving records
under-report their own seat consumption by:

| | credits | USD |
| :--- | ---: | ---: |
| what those 16 sessions CLAIMED | 48,514.6 | $485.15 |
| what the same ids price TODAY | 61,901.0 | $619.01 |
| **understatement** | **13,386.4** | **$133.86** |

**+27.6%.** That is the roll-up bias, and it is roughly **twice** the single
$70.24 miss this set was reserved on.

But the understatement is the small half. The larger finding is what no
session record claims at all:

| | credits | USD |
| :--- | ---: | ---: |
| Copilot conversations opened **in this repository** | 397,015.1 | $3,970.15 |
| attributable to an id the repo recorded | 66,435.1 | $664.35 |
| **claimed by no session record** | **330,579.9** | **$3,305.80** |

**16.7%** of this repository's measurable seat consumption is attached to a
session. The other 83.3% is real, sitting in the store, and unattributable —
not because the tooling failed, but because for most of that period nothing
recorded an id, and **ids are the only legitimate attribution**.

> **Caveat, stated rather than buried.** That 641-conversation figure is scoped
> by the store's own `repository` column — a record, not a clock — but it counts
> every Copilot CLI conversation opened in this checkout, including ad-hoc use
> that was never a workflow session. Nothing in the record separates them.
> **That indistinguishability is itself the finding:** attribution exists only
> where a sanctioned writer wrote an id down.

---

## How each gap was classified

The spec asked for a *stated test* for the middle category rather than a
judgement call. These are the tests, and they run in `cost_classify2.py`
against the committed record:

| class | test | n |
| :--- | :--- | ---: |
| `asserted_false` | **any** committed version declares `orchestrator_seat` non-contributing while that session's own `seatSessionIds` were **already on record at that same commit** and those ids price > 0 today; **or** declares `routed_seat: not_applicable` — a positive claim that the component cannot exist — while it prices > 0 today | **1** |
| `overclaimed_exact` | claimed `measured` (exact) and the same ids price **higher** today | 5 |
| `honest_floor_drift` | claimed `lower_bound` and the same ids price higher today — correctly labelled at the time | 8 |
| `recoverable` | a **closed** session made no claim for a component that prices > 0 today; nothing false was said | 2 |
| `open_no_block_owed` | the session is still in flight, so no block is owed yet — measurable, but not a historical omission | 2 |
| `honestly_unmeasurable` | no measurement source exists today either — engine keeps no local usage store, or no id was ever recorded | 247 |

The `asserted_false` test's second clause is what makes it an *assertion*
rather than hindsight: `start_session` writes `seatSessionIds` **before** the
session does any work, so a block committed later that says "nothing to
measure" is contradicted by the session's own state file at its own commit.

`open_no_block_owed` is kept separate on purpose. Folding an in-flight session
into `recoverable` would report a session that has not yet reached its close as
a session that skipped it, and Session 2 is sized from these counts.

---

## Finding 1 — auditing the surviving record hides the failure

**The first pass of this audit found zero asserted-false blocks.** It read the
current `disposition.json` of each set, which is the only version on disk.

That answer was wrong, and the way it was wrong matters more than the count.
`disposition.json` is **one file per SET, overwritten by every session**, and
Set 113 Session 8 repaired its own block 90 seconds after committing it:

| commit | time | `orchestrator_seat` | `routed_seat` | `routed_api` |
| :--- | :--- | :--- | :--- | :--- |
| `9e772e52` | 02:49:02 | `unknown` | `measured` | `not_applicable` |
| `e09820ca` | 02:50:32 | **`unavailable`** | **`unavailable`** | `not_applicable` |
| `f83670db` | 03:59:15 | `measured` 6,112.1 | `measured` 912.4 | `not_applicable` |

`e09820ca` is the failure this set was reserved on, and it **is** in the
record — for 69 minutes. Its session's `seatSessionIds` were on record at that
very commit. Any audit that reads only the latest version reports the repair
and never sees the assertion.

> **A self-repairing record under-reports its own defect rate**, and the cost
> corpus is exactly such a record. This audit therefore walks **all 516
> committed versions** of every `disposition.json`, not the 135 surviving ones.

`9e772e52` also carries a component named **`operator_time`** — not one of the
three in `seat_cost.COMPONENTS`. A producer cannot emit that. It is a
hand-authoring fingerprint.

---

## Finding 2 — a status the producer cannot emit, in 7 committed versions

`seat_cost` can only ever report `routed_api` as `not_applicable` (no
Direct-API call was dispatched) or `unavailable` (calls were dispatched and are
priced in dollars elsewhere). `measure_session` never places ids in that
component, so **`routed_api: measured` is unreachable from the producer**.

Seven committed versions across three sessions record exactly that:

| set / session | commits |
| :--- | :--- |
| 113 S3 | `9ab0faac`, `64ddea2f` |
| 113 S7 | `81da14ec`, `6ee83a8c` |
| 133 S2 | `195f0668`, `a3939aca`, `885d0b18` |

This is a **cheap, deterministic falsifier for hand-authorship** and Session 2
should ship it: a block whose status is not in the producer's reachable set for
that component was not produced by the producer, whatever its prose says.

Corroborating evidence: several of those blocks carry `reason` text that begins
with `seat_cost`'s exact generated sentence and then continues for paragraphs —
narrative the generator has no code path to emit.

---

## Finding 3 — `measured` at close time is not exact, and 5 blocks proved it

`measure_session(live=True)` marks **only the orchestrator's own conversation**
as in-flight, so `orchestrator_seat` correctly comes back `lower_bound`.
`routed_seat` is left as `measured` — **exact**.

It is not exact. A routed child's turns are still landing in the WAL when the
close reads the store. Five close-time blocks claimed `routed_seat: measured`
and the same ids price higher today:

| session | claimed | today | delta |
| :--- | ---: | ---: | ---: |
| 121 S4 | 668.6 | 772.9 | +104.3 |
| 131 S1 | 855.5 | 1,095.0 | +239.5 |
| 131 S2 | 280.7 | 331.2 | +50.5 |
| 132 S2 | 315.9 | 416.0 | +100.1 |
| 132 S3 | 941.5 | 1,017.1 | +75.6 |

This is not a pricing defect — the module's arithmetic is right, and pricing is
explicitly not under review in this set. It is a **labelling** defect, and it
violates the module's own documented rule that *"a figure taken at close cannot
claim to be exact"* (`seat-cost.md` §5.2, §2b). Session 2 should make a
close-time reading label **every** component a floor.

---

## Finding 4 — `--retrospective` on your own session is still not exact

Set 113 S8's corrected block is stamped `measured_at: "retrospective"` and
claims `measured` — exact — at 6,112.1 credits. The same id prices **7,679.8**
today: **+1,567.7 credits, +$15.68, +25.6%.**

Nothing drifted and nothing was broken. The block was written **from inside the
conversation it was measuring**, which then went on to author the reservation
record and this set's spec. `seat-cost.md` §5.2 says *"Measured retrospectively,
the same session is exact."* That is true only when the measurement is taken
from a **different conversation, after the measured one has ended** — and the
doc does not say so.

> This is a doc echo Session 2 must fix (G-012): the §5.2 sentence is
> load-bearing and, as written, licences the exact overclaim it exists to
> prevent.

---

## Finding 5 — the honest lower bounds were honest, and the gap is large

**Thirteen** committed blocks declared `orchestrator_seat: lower_bound` and are
higher today. (Eight of those sessions carry `honest_floor_drift` as their
session-level class; the other five were promoted to `overclaimed_exact` by a
*different* component — Finding 3.) They were **correctly labelled** and are not
faulted here — but the size of the gap is the reason a floor must never be
summed into a cross-set roll-up as if it were a total:

| session | claimed floor | today | delta |
| :--- | ---: | ---: | ---: |
| 121 S1 | 3,847.2 | 3,963.7 | +116.6 |
| 121 S2 | 4,476.0 | 4,589.9 | +113.9 |
| 121 S4 | 2,302.7 | 2,723.7 | +421.0 |
| 130 S3 | 3,663.1 | 4,072.2 | +409.1 |
| 131 S1 | 2,158.4 | 4,545.5 | +2,387.1 |
| 131 S2 | 1,401.0 | 2,010.3 | +609.3 |
| 131 S3 | 1,307.9 | 1,671.0 | +363.1 |
| 132 S1 | 1,637.2 | 1,846.2 | +209.0 |
| 132 S2 | 2,244.8 | 3,078.2 | +833.4 |
| 132 S3 | 3,918.2 | 4,214.4 | +296.2 |
| 134 S1 | 1,084.0 | 1,817.0 | +733.0 |
| 134 S2 | 3,050.6 | 3,334.7 | +284.1 |
| 134 S3 | 2,148.3 | 2,491.5 | +343.2 |

Set 131 S1 is the extreme: the closing figure was **47%** of the true one. A
session's close-out turns are a large fraction of its total.

---

## Finding 6 — one closed session could have said, and said nothing

Four sessions have a measurement today and no committed claim. **Only one of
them is a historical omission**, and the distinction is not cosmetic — Session 2
is sized from this count:

| session | measures today | class | why |
| :--- | ---: | :--- | :--- |
| **121 S3** | 1,703.9 cr / **$17.04** | `recoverable` | **The one real omission.** Ids on record **and** the `cost` contract already shipped. The close simply had no block, and nothing stopped it. |
| 130 S2 | 2,425.8 cr / $24.26 | `recoverable` | Ids on record, but the contract did not exist yet — it shipped in S3, the very next session. **Not a fault.** |
| 113 S9 | 2,883.5 cr / $28.84 | `open_no_block_owed` | Registered, then paused mid-flight. No close has happened, so no block is owed. |
| 135 S1 | this session | `open_no_block_owed` | In flight. |

**121 S3 is the case for making the block mandatory rather than merely
validated.** The advisory gate validates a block that is *present*. It has
nothing to say about one that is *absent*, and $17.04 left the record silently.

One post-contract omission out of the small post-contract population is a low
rate — but the population is small precisely because the contract is nine days
old, and the trend is what Session 2 governs.

---

## What cannot be recovered, and why

Reporting only the recoverable part would repeat the defect being audited.

1. **198 closed in-scope sessions ran on engines that keep no local usage
   store** (Claude Code and codex labels; the test is
   `seat_cost.engine_has_usage_store`). Their orchestrator seat cost is
   **unavailable — real and unseen**, permanently. Their blocks said so, and
   were right to.

2. **Of the 63 closed sessions that DID run on a seat engine with a store, only
   16 are priceable.** The other 47 ran before `start_session` recorded
   `COPILOT_AGENT_SESSION_ID` (Set 130 S2). Their conversations are in the
   store; nothing links them to a session.

3. **235 routed calls are recorded with no conversation id**, across **45
   sessions**. `record_call` only began persisting `transport_session_id` at
   Set 130 S2. Same conclusion, and a clock will not rescue it: §5.3 shows one
   set's wall-clock window provably contains another set's conversations.
   **Permanently unattributable.**

4. **`router-metrics.jsonl` has lost rows it once had, and it is gitignored.**
   Set 113 S2–S7 and 133 S1–S2 committed blocks stating *"5 / 6 / 7 / 8
   Direct-API call(s) are recorded for this session"* — the generator's own
   sentence, so those rows existed when the blocks were written. **The
   surviving file contains none of them**: set 133 has zero rows and set 113
   has thirteen, six of which belong to S8. The only surviving trace of that
   spend is dollar figures quoted in disposition prose ($2.2754, $2.9602,
   $2.6723, $5.8160, $0.6134 …), which are **quotations, not measurements.**

   > A cost gate that produces its number from `router-metrics.jsonl` is
   > producing it from **gitignored, machine-local, non-durable state**. Session
   > 2 must not treat that file as a record of equal standing with
   > `session-state.json`. This is a Session 2 input, not a Session 1 fix.

5. **$3,305.80 of in-repo seat consumption claimed by no session record**
   (see *The short answer*). Recoverable only for the fraction that a future
   session records an id for — which is precisely what Session 2 exists to
   make automatic.

**One part of the record is clean.** The committed `activity-log.json`
`routedApiCalls` entries hold **428 Direct-API calls totalling $41.1376** across
sets 001–110 (spanning both scopes; it predates schema v4). That is
measurement 1 (`routed_api`), it was always correct, it is **committed rather
than gitignored**, and it is the only durable per-session cost record this repo
has. It stopped being written around Set 110, when `router-metrics.jsonl` became
canonical — a **durability regression** nobody recorded as one.

---

## What this means for Session 2

The audit changes the specification in four concrete ways.

1. **Produce-or-refuse is right, and "refuse an asserted block" is the smaller
   half.** Exactly one session ever committed an asserted-false block, and
   exactly one closed session that could have measured wrote nothing. **247
   in-scope sessions could not measure at all.** The gate's dominant job is
   *"a block is owed and must be produced"*, not *"catch the liar."*

2. **The honest-unmeasurable population is large and permanent** — 198 closed
   in-scope sessions on store-less engines, plus 47 seat sessions whose ids were
   never recorded. The attestation path is not a rare escape hatch; on a Claude
   Code or Gemini seat it is the **normal** path. It must be cheap, and it must
   name a person.

3. **Ship the reachable-status falsifier.** `routed_api: measured` and any
   component outside `seat_cost.COMPONENTS` are provably not producer output.
   It is a deterministic, one-line-testable hand-authorship detector that
   would have caught 7 of the 47 committed versions.

4. **Fix the exactness class, both in code and in the doc** (G-008, G-012):
   a close-time reading must label **every** component a floor, and
   `seat-cost.md` §5.2 must say that a retrospective reading is exact only from
   a *different* conversation after the measured one has ended.

**Is Session 2 still worth running?** Yes — but for the reason the audit found,
not the reason it was reserved. The corpus is not full of lies; it is nearly
empty, and the one measurable stretch of it under-reports by 27.6% with $3,305.80
of in-repo consumption attached to nothing. A gate that makes production
automatic converts that from an archaeology problem into a solved one going
forward. It does not recover a cent of the past, and this audit does not
pretend otherwise.

---

## Method and reproducibility

- **Claimed side:** all 516 committed versions of `docs/session-sets/*/disposition.json`,
  each attributed to the session that was in flight at that commit, read from
  the same commit's `session-state.json` — which also supplies whether
  `seatSessionIds` were on record **at claim time**.
- **Measured side:** `ai_router.seat_cost.measure_session(live=False)` per
  session, from `orchestrator.seatSessionIds` and `router-metrics.jsonl`
  `transport_session_id`. Nothing was guessed. The store-less engine test is
  `seat_cost.engine_has_usage_store` rather than a hand-kept engine list — the
  corpus carries both `claude` and `claude-code` labels, and an earlier
  hand-kept list under-counted the store-less population by 69 sessions.
- **Drift is real and is disclosed.** Across the reads taken while this session
  ran, the repo-scoped store total moved from 395,986.1 to 397,015.1 credits —
  this session accruing while measuring its own corpus. Every figure here is
  exact only for a conversation that has ended, and `cost-audit.json` carries
  its read time.
- **Nothing was rewritten.** No closed session's `disposition.json`,
  `session-state.json`, or verification artifact was modified.
