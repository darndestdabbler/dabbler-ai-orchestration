# Orchestrator Seat Cost Capture Spec

> **Purpose:** Every session's Step 10 reports **cost**, and on a Copilot
> CLI seat that report is wrong in two directions at once. Set 118
> Session 1 recorded `$0.0000` of routed cost while spending **$8.66** on
> five routed verification rounds, and hand-recorded **$42.67** of seat
> cost against a store that says **$47.43**. This set makes both numbers
> recoverable from a key that already exists and is thrown away — and
> makes the absent answer say `unknown` rather than `$0.00`.
> **Created:** 2026-08-14
> **Session Set:** `docs/session-sets/130-orchestrator-seat-cost-capture/`
> **Prerequisite:** none declared. Set 118 is **cancelled**, so it cannot
> carry a `condition: complete`; it is this set's *source of record*, not
> its gate — see below.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

**Source of record:**
[`docs/session-sets/118-test-retirement-and-coupling-budget/disposition.json`](../118-test-retirement-and-coupling-budget/disposition.json)
→ `notes`, which carries the first measurement, the query, and the
caveats. Read it with
[`measurement-correction.md`](../118-test-retirement-and-coupling-budget/measurement-correction.md)
beside it: that note is the same set catching itself asserting a
reconstructed number as a measured one, and this set is one careless step
from repeating it. **Every figure in this spec was re-derived against the
live store on 2026-08-14** and is reproducible by the commands named
below; where a claim is a reconstruction rather than a recorded fact, it
says so.

---

## Session Set Configuration

```yaml
requiresUAT: false        # No UI surface. The extension is explicitly out of scope (Non-goals).
requiresE2E: false        # Layer 3 is untouched; nothing rendered changes.
uatStyle: ad-hoc
uatScope: none
```

> Rationale: `pathAwareCritique` is deliberately **absent** (the guide's
> default is `none` — *"a set that declares nothing pays nothing"*). Sets
> 118 and 128 armed it because they **reduced** verification. This set
> reduces none: it adds a measurement that does not exist, and every new
> surface it ships fails closed to `unknown`. It authorizes no skip, so
> the end-of-set critique has nothing here to earn its cost against.

---

## Project Overview

### The number is not missing — the join key is

The stub this spec replaces assumed the hard part was reading an
undocumented store. It is not. The store is present, stable and
queryable, and **both** halves of the missing cost are keyed by an id the
repo already has in hand and drops on the floor:

| what | where the id already is | where it goes today |
| :--- | :--- | :--- |
| the orchestrator's own conversation | `COPILOT_AGENT_SESSION_ID` in the seat's environment | nowhere — never read |
| each routed call's child conversation | `cli_transport` reads `result.sessionId` into `transport_metadata["session_id"]` (`cli_transport.py:1073`, `:1108`) | dropped — `record_call()` has no parameter for it (`metrics.py:167`) |

That reframes the whole set. This is not an inference problem needing a
confidence rating; it is a **plumbing** problem with a measurement
contract attached. The one genuinely inferred quantity is the *unit*
(`total_nano_aiu`), and the store's own `schema_version` gives the
adapter something concrete to pin.

### What is actually in the store

`~/.copilot/session-store.db` — SQLite, `schema_version = 6`, WAL.
`assistant_usage_events` (17,036 rows on 2026-08-14) carries 23 columns
including `session_id`, `turn_index`, `model`, `input_tokens`,
`output_tokens`, `cache_read_tokens`, `reasoning_tokens`,
`total_nano_aiu`, `duration_ms` and `created_at`.
`SUM(total_nano_aiu) / 1e9` is **AI credits**; `/ 1e11` is dollars. The
unit was corroborated once against an operator `/usage` screenshot
mid-Set-118 (3,895 credits then, 4,266.6 at that session's close).

### What Set 118 Session 1 actually cost

Session 1 ran `2026-08-13T20:34` → `2026-08-14T01:48` local
(`00:34Z` → `05:48Z`). Store conversation `1f130689` spans
`2026-08-14T00:32:54Z` → `05:53:06Z` by event time — the same session,
one conversation, 215 turns.

| component | recorded at the time | in the store | gap |
| :--- | ---: | ---: | ---: |
| orchestrator seat | 4,266.6 cr / **$42.67** | 4,743.2 cr / **$47.43** | **+$4.77** |
| 5 routed verification rounds | **$0.0000** | 866.4 cr / **$8.66** | **+$8.66** |
| **total** | **$42.67** | **$56.10** | **+31%** |

Both gaps have causes worth naming, because each is a defect class rather
than an arithmetic slip.

### The five traps, named up front

**T1 — Two costs, and a report that must say which.** *Routed-call cost*
is what `route()` spends; `record_call` owns it and is correct on the
Direct-API transport. *Orchestrator-seat cost* is what it costs to run
the session. Quietly redefining one as the other is the measurement error
Set 118 exists to stop. This set names **three** measurements, because
routed calls on a seat are a third thing: real spend that is neither
priced by `pricing.py` nor visible as seat cost.

**T2 — The absent answer must be `unknown`, never `$0.00`.** A cost
reader that returns zero when it cannot measure is fail-open, and it is
*worse* than reporting nothing because zero looks like a measurement
(L-112-1; the same class Sets 112, 128 and 129 closed). Note the repo is
already half-honest here: every `copilot-cli` row carries
`billed_usage_unavailable: true` beside its `cost_usd: 0.0`. The flag is
right and the **report** ignores it — `print_metrics_report` sums
`cost_usd` and prints `Total cost: $0.0000`.

**T3 — The schema is undocumented and inferred.** `total_nano_aiu` is a
private store's column, read by inference and corroborated once. It can
change without notice. The adapter needs a shape self-check **before** it
trusts anything, a pinned `schema_version`, and a way to say *"this store
no longer looks like what I expected"* instead of silently multiplying by
a stale constant.

**T4 — The read mode can silently undercount, and it does today.** The
store is WAL-mode and live. Measured at one instant on 2026-08-14:

| open mode | total rows | this session's credits |
| :--- | ---: | ---: |
| `file:…?mode=ro` | 17,036 | 168.0 |
| `file:…?mode=ro&immutable=1` | 17,035 | 156.5 |

`immutable=1` is the obvious choice for a read-only adapter and it
**skips the WAL**, returning a plausible smaller number with no error.
That is T2's failure mode wearing a correct-looking answer, and it is the
one bug here that no amount of code review finds — only a planted
uncheckpointed row does.

**T5 — A session cannot fully measure itself.** Set 118's `$42.67` was
not wrong when written; it was *early*. The turns that author the
disposition, run the close and write the number are not in the store when
the number is read — 476.6 credits of that session, 10% of it. Any
as-of-close figure is a **lower bound** and must be labelled one. The
same session measured retroactively is exact.

**T6 — Time windows cannot attribute.** Reconstructing Set 118 S1's five
routed children by timestamp works (each metrics row's end time lands
~2 s after its child conversation's first event), but the same wall-clock
window contains `c66976bf` — 1,277.2 credits of **Set 129's**
conversation — and two routed children belonging to Set 129 S2. A window
heuristic would bill them to 118. Ids attribute; clocks do not. This is
also why `sessions.created_at` must not be used for spans: it and
`updated_at` sit seconds apart on a conversation whose events span five
hours.

### Non-goals

- **No VS Code extension surface.** Nothing rendered changes; no Explorer
  node, no gauge, no icon. That is what keeps `requiresUAT: false`
  honest, and it is a deliberate deferral rather than an oversight.
- **No Claude Code or Gemini adapter.** They have no equivalent store.
  The gate *is* the interface: a non-Copilot engine resolves to a typed
  `not_applicable` with no store read attempted, and a consumer repo on
  another engine inherits exactly that.
- **No claim about the operator's bill.** The unit is AI credits and the
  dollar figure is the seat's published conversion. On a plan with
  included credits the marginal dollar cost of a session may be zero;
  this set measures *consumption*, and must say so rather than implying
  an invoice.
- **No change to `cost_usd` semantics** in `router-metrics.jsonl`. The
  Direct-API path is correct and is not touched. Everything added is
  additive-null, like every prior metrics addition (Sets 078, 084, 109).
- **No retroactive backfill of seat ids.** Past sessions never recorded
  one. Set 118 S1 is re-priced by hand in Session 3 because its
  conversation is identifiable; that is a demonstration, not a migration.
- **No verification-cost budgeting or enforcement.** Measuring first.
  A set that spends this data to *gate* anything is a later set with an
  operator attestation behind it.

---

## Sessions

### Session 1 of 3: The reader that refuses to guess

**Steps:**

1. Register.
2. **Name the three measurements, then ship the reader that reads one of
   them.** `ai_router/docs/seat-cost.md` defines `routed_api` (the
   Direct-API path, priced, authoritative), `routed_seat` (routed
   calls dispatched through the Copilot CLI transport — real spend,
   currently `$0.00` with `billed_usage_unavailable: true`) and
   `orchestrator_seat` (the conversation that runs the session), and
   states the rule that outlives this set: **any report showing one must
   say which it is showing, and must name the components it could not
   measure.** These three strings are the **public identifiers** — they
   are what `CostReport.to_dict()` emits and what Session 3's
   `disposition.cost` consumes, so one vocabulary from here on.
   `ai_router/seat_cost.py` then resolves the store,
   self-checks its shape *before* trusting it (pinned `schema_version`,
   required columns present), sums `total_nano_aiu` over an **explicit
   set of store session ids**, and returns a typed result whose absent
   answer is a named reason — never a number.
3. **Falsify in both directions by planting the store, not by reading the
   code** (L-112-1). FIRES: no store file → `unavailable`; a bumped
   `schema_version` or a renamed/missing column → `schema_unrecognized`;
   an empty id set → `unknown`, never `$0.00`; a session id the store has
   never heard of → `unknown`, never `0`; a row written but **not
   checkpointed out of the WAL** → counted, with the `immutable=1`
   variant asserted to undercount so T4 cannot come back. DOES NOT FIRE:
   a known id whose rows genuinely sum to zero → `0` with full
   confidence; a non-Copilot engine → `not_applicable` with no file
   opened. STRUCTURAL: the credits→dollars conversion is asserted in one
   place and the reader's own total for a planted fixture equals an
   independent walk of the same rows.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out.**

**Creates:** `ai_router/seat_cost.py`, `ai_router/docs/seat-cost.md`, `ai_router/tests/test_seat_cost.py`
**Touches:** `ai_router/docs/close-out.md` (pointer only)
**Ends with:** a caller can hand `seat_cost` a set of store session ids
and get back credits, dollars and a stated confidence — and every way the
measurement can fail returns a **named** unknown that a planted fixture
proves, including the WAL undercount that looks like a correct answer.
**Progress keys:** `measurementsNamed`, `readerLands`, `shapeSelfCheck`, `plantedStoreCaught`

> **Irony budget: 12 new test functions.** Weighted to the fail-open
> direction — the unknown-id, empty-set and WAL cases are the three that
> return a plausible number today, and they are the only reason this
> reader needs tests at all.

---

### Session 2 of 3: The join key, recorded instead of dropped

**Steps:**

1. Register.
2. **Record the orchestrator's own conversation at registration.**
   `start_session` reads `COPILOT_AGENT_SESSION_ID` and writes it into
   the session's record through the sanctioned writer — **appending, not
   replacing**, because `start_session` is idempotent by design and is
   re-run after a context reset, which starts a *new* conversation on the
   *same* workflow session. Absent on a Direct-API seat means the field is
   absent, not empty. `docs/session-state-schema.md` moves in the same
   pass — a state-shape change that does not update the schema doc is the
   L-064-8 hazard by construction.
3. **Persist the routed child's conversation id.** `record_call()` gains
   the column and `route()` passes through the value `cli_transport`
   already captured. Additive-null: every historical row and every
   Direct-API row records `null`, which correctly reads as *"not
   captured"* rather than a false claim. Update the `metrics.py` module
   docstring, which is that file's schema of record.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out.**

**Creates:** nothing new — this session is entirely plumbing into existing writers
**Touches:** `ai_router/start_session.py`, `ai_router/session_state.py`, `ai_router/metrics.py`, `ai_router/__init__.py`, `docs/session-state-schema.md`, `ai_router/tests/test_start_session*.py`, `ai_router/tests/test_metrics*.py`
**Ends with:** a session registered on a Copilot seat knows which
conversations produced it, a re-register after a context reset adds one
rather than overwriting it, and every routed call written from that
moment on carries the id that makes its true cost recoverable — while a
Direct-API run records `null` everywhere and behaves exactly as it does
today.
**Progress keys:** `seatIdCaptured`, `accumulatesAcrossResets`, `routedIdPersisted`, `apiPathUnchanged`

> **Irony budget: 10 new test functions.** Split evenly between "the id
> lands" and "the id's absence is not a zero" — the second half is the
> one that matters, because a Direct-API seat must not acquire a new way
> to fail.

---

### Session 3 of 3: The contract, the report, and the corrected number

**Steps:**

1. Register.
2. **Ship `disposition.cost` as a real field.** The `Disposition`
   dataclass, `validate_disposition`, and
   [`docs/disposition-schema.md`](../../disposition-schema.md) move in
   **one pass** — L-064-8 names this exact three-surface drift, and the
   close-out flow reads all three. The field carries the components
   separately with a per-component confidence, so `unknown` is
   representable and is structurally distinct from zero. An
   as-of-close figure is labelled a lower bound (T5).
3. **Wire the Step 10 report and re-price Set 118 Session 1 with the
   tool.** The close-out path reports what it measured and **names what
   it could not**, `print_metrics_report` stops printing an authoritative
   `$0.0000` for rows that already declare `billed_usage_unavailable`,
   and Set 118 S1's corrected figure ($42.67 recorded → ~$56.10
   measured) is published with the predicate behind it rather than left
   as a footnote in a cancelled set's disposition. Author
   `change-log.md` and the changelog fragment.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out**, including the Step 9 reorganization review of
   `project-guidance.md` / `lessons-learned.md`.

**Creates:** `change-log.md`, `ai_router/changelog.d/` fragment
**Touches:** `ai_router/disposition.py`, `docs/disposition-schema.md`, `ai_router/close_out.py`, `ai_router/close_session.py`, `ai_router/metrics.py`, `ai_router/gate_checks.py`, `ai_router/tests/test_disposition*.py`, `docs/session-constitution.md`, `docs/planning/project-guidance.md`, `docs/planning/lessons-learned.md`
**Ends with:** a session's Step 10 cost report states which measurements
it is showing, which it could not take and why, and never presents an
unmeasured component as `$0.00` — and the one session that was priced by
hand has its corrected number and method published where the next reader
will find it.
**Progress keys:** `costFieldLands`, `schemaDocMoves`, `reportNamesUnknowns`, `set118Repriced`

> **Irony budget: 8 new test functions.** Mostly validator parity
> (`project-guidance.md` → Code Style: a pure-Python validator mirroring a
> JSON Schema must hold parity in both directions, including the optional
> fields and the `isinstance` guards).

---

## Why three sessions and not the stub's two

The stub sketched two — *"the adapter and the cost model"*, then *"the
contract and the wiring"* — and did not know about the join key, because
it assumed the caller would somehow already hold a `session_id`. It will
not: nothing in the repo records one. Capturing it touches two sanctioned
writers (`start_session` and `record_call`), a state-schema doc and a
metrics schema docstring, which is a session's worth of work sitting
between the reader and the contract rather than inside either.

Folding it into Session 1 would put a pure, heavily-planted reader in the
same session as two state-writer changes; folding it into Session 3 would
put it beside a disposition-schema change that already carries the
L-064-8 three-surface hazard. Splitting it out keeps each session at
N = 2 authored work steps against the ratified budget of 3, and gives the
set a clean dependency chain — **read** (pure, no writers), then
**record** (writers, no contract), then **report** (contract, no new
measurement).
