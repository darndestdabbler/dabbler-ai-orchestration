# Seat cost, and why it is not routed-call cost

> **Canonical for:** what the three cost measurements are, which one a
> given surface is showing, and the rule every cost report obeys.
> **Implemented by:** [`ai_router/seat_cost.py`](../seat_cost.py).
> **Not canonical for:** routed-call pricing on the Direct-API transport —
> that is `ai_router/metrics.py` and `ai_router/pricing.py`, and this
> document does not redefine them.

---

## 1. The three measurements

There is no single "the cost of a session". There are three, they are
paid to different places, and only one of them has ever been recorded.

| # | measurement | what it is | recorded today? |
| :-- | :--- | :--- | :--- |
| 1 | **`routed_api`** | What `route()` spends on verifiers and delegates over the Direct-API transport. Priced per token by `pricing.py`. | **Yes** — `router-metrics.jsonl` `cost_usd`. Correct. |
| 2 | **`routed_seat`** | What `route()` spends when the same calls are dispatched through the Copilot CLI transport. Each call is an agentic child conversation that consumes AI credits. | **No** — the row says `cost_usd: 0.0` with `billed_usage_unavailable: true`. The flag is honest; the number is not a measurement. |
| 3 | **`orchestrator_seat`** | What it costs to *run the session*: the orchestrator's own conversation. | **No** — invisible everywhere. |

**Measurement 2 is the one that is easiest to get wrong**, because a
Copilot seat's routed call looks free. It is not. Set 118 Session 1's five
routed verification rounds recorded `$0.0000` and consumed **866.4
credits — $8.66**.

### These three strings are the public identifiers

`routed_api`, `routed_seat` and `orchestrator_seat` are the **canonical
public names** of the three measurements. They are the values of
`seat_cost.COMPONENTS`, the `component` key of every entry in
`CostReport.to_dict()`, and the keys Session 3's `disposition.cost`
consumes. There is one vocabulary and this is it — no `*_cost` suffix,
because these sit under a `cost` parent where the suffix would stutter.
`test_seat_cost.py::test_public_component_identifiers_are_the_documented_ones`
pins them against this document so the two cannot drift apart silently.

## 2. The rule

> **Any report showing cost must say which measurement it is showing, and
> must name the components it could not measure.**

A total is only a total when every component in it was measured. A total
that quietly drops an unmeasured component reports unmeasured spend as
zero, which is the same fail-open defect as returning `$0.00`, one
addition further along.

Two surfaces in this repo currently break the rule, and both are wired
correctly in Set 130 Session 3:

- `session_log.get_cost_summary()` sums `routedApiCalls[].costUsd` and
  returns it under the key **`total_cost`**. The arithmetic is right; the
  label overclaims — it is measurement 1 only.
- `metrics.print_metrics_report()` prints **`Total cost: $0.0000`** on a
  seat while every row it summed carries `billed_usage_unavailable: true`.

## 3. Where the numbers come from

The Copilot CLI keeps a local SQLite store at
`~/.copilot/session-store.db`. Its `assistant_usage_events` table carries
one row per assistant turn, keyed by `session_id` (a **conversation** id,
not a workflow-session id).

```
SUM(total_nano_aiu) / 1e9  = AI credits
credits / 100              = US dollars
```

The unit is **inferred** from an undocumented store and corroborated once,
against an operator `/usage` screenshot taken mid-Set-118 (3,895 credits
at the screenshot, 4,266.6 at that session's close). It is stated here
because it is the single assumption every number rests on.

`seat_cost.py` pins the store's `schema_version` (currently **6**) and
checks the columns it reads exist **before** trusting any number. A store
that reports a different version is refused as `schema_unrecognized`
rather than priced against a shape it may no longer have.

### The dollar figure is consumption, not an invoice

The unit is AI credits. On a plan with included credits the *marginal*
dollar cost of a session may be zero. These numbers measure **what was
consumed**, converted at the seat's published rate — they are not a claim
about the operator's bill.

## 4. The four ways this measurement fails, and what each returns

`ComponentCost.credits` is `None` — never `0.0` — whenever the number is
not known.

| status | meaning | contributes to a total? |
| :--- | :--- | :--- |
| `measured` | Exact. Every requested conversation was found. | yes |
| `lower_bound` | Real but known incomplete: some conversations were not found, or one is still in flight. | yes, and the total is labelled a floor |
| `unknown` | Nothing to measure from — an empty id set, or no requested id is known to the store. | **no** |
| `unavailable` | The component is real; no measurement source is reachable (no store file, or an engine that keeps none). | **no** |
| `schema_unrecognized` | The store is there and no longer looks like what this reader was written against. | **no** |
| `not_applicable` | The component **cannot exist** in this configuration and legitimately contributes zero. | yes, as `0.0` |

**`unavailable` vs `not_applicable` is the whole fail-open question in two
words.** Claude Code and Gemini keep no local usage store, so seat cost
incurred there is `unavailable` — real, unseen. Calling it
`not_applicable` would report someone else's spend as zero. Only the
*caller* may declare `not_applicable`, and only for a component it knows
to be empty.

## 5. Three traps that produce a plausible wrong number

Each of these returns something that looks like a measurement. None of
them raises.

### 5.1 `immutable=1` skips the WAL

The store is WAL-mode and live — usually being written by the same process
tree asking the question. `immutable=1` is the obvious choice for a
read-only adapter and it silently omits everything not yet checkpointed.
Measured at one instant on 2026-08-14:

| open mode | total events | live conversation's credits |
| :--- | ---: | ---: |
| `file:…?mode=ro` | 17,036 | 168.0 |
| `file:…?mode=ro&immutable=1` | 17,035 | 156.5 |

A 7% undercount, no error. `seat_cost.py` builds its connection string in
exactly one place and the test suite plants an uncheckpointed row to keep
it that way.

### 5.2 A session cannot measure itself

The turns that author the disposition, run the close and write the number
are not in the store when the number is read. Set 118 Session 1 recorded
**4,266.6** credits at close; the same conversation reads **4,743.2**
today. Nothing was wrong except that it was early.

Any as-of-close figure is a **lower bound** and must be labelled one.
Measured retroactively, the same session is exact.

### 5.3 A time window cannot attribute

Reconstructing Set 118 Session 1's routed children by timestamp *works* —
each metrics row's end time lands about two seconds after its child
conversation's first event. It is still the wrong method: the same
wall-clock window contains 1,277.2 credits of **Set 129's** conversation
and two of Set 129's routed children.

Ids attribute; clocks do not. Note also that `sessions.created_at` and
`updated_at` sit seconds apart on a conversation whose events span five
hours — if a span is needed, it comes from
`assistant_usage_events.created_at`.

## 6. Using it

```bash
# This session's seat cost, live (reports a LOWER BOUND, correctly).
python -m ai_router.seat_cost --self --no-api-calls

# A past session, exactly, with its routed children named.
python -m ai_router.seat_cost \
    --orchestrator 1f130689-... \
    --routed 4e3a296a-... --routed 9ea2cf1c-... \
    --no-api-calls
```

Ids are supplied by the caller and never guessed. **Set 130 Session 2 is
what makes that automatic**: `start_session` records
`COPILOT_AGENT_SESSION_ID` at registration (appending, because a context
reset starts a new conversation on the same workflow session), and
`record_call` persists the routed child's `sessionId` that
`cli_transport` already captures and currently drops.

## 7. Worked example — Set 118 Session 1

The set that first measured this, re-derived with the tool:

| component | recorded at the time | measured |
| :--- | ---: | ---: |
| orchestrator seat | 4,266.6 cr / $42.67 | 4,743.2 cr / **$47.43** |
| routed calls (seat) | $0.0000 | 866.4 cr / **$8.66** |
| routed calls (API) | — | not applicable |
| **total** | **$42.67** | **$56.10** |

Reproduce it:

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

Both gaps are defect classes, not arithmetic slips: the first is §5.2, the
second is the whole reason measurement 2 has a name.
