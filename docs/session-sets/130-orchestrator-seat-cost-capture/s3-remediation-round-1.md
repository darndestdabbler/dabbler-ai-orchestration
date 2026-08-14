# Session 3 — remediation of Rounds 1 and 2

Three Major findings across the two discovery passes. All three accepted
in full; none disputed. Rounds 1 and 2 are remediated together, because
Round 1's two findings are **one defect found twice** (both discovery
lenses landed on it independently) and Round 2's is its sibling in the
same function.

---

## Round 1 — the same hole, from both lenses

> **Call 1 (spec-conformance):** `close_session` renders
> `disposition.cost` without validating the cost contract first.
> **Call 2 (failure-scenario):** `close_session` can still print an
> invalid recorded cost block as a real `$0.00` measurement.

**What was true.** The contract was enforced at *authoring* —
`_validate_cost` refuses `status: "unknown"` beside `credits: 0.0`, and
the JSON Schema refuses it too. But `disposition.cost` is a **recorded**
artifact: `read_disposition()` reconstructs whatever is on disk without
validating it, and `format_cost_block()` decided how to render each
component from `credits is not None`. A hand edit, a paste from an older
producer, or a future producer could therefore put the exact fail-open
shape this set exists to kill through the one door the authoring
validator does not guard — and it would print `$0.00` in the close
report, the single most-read cost surface in the workflow.

Two lenses reaching the same hole from different directions is the
signature of a real one, and it is precisely the class the set names: not
an exception, a **plausible number**.

**The fix, in two parts, each doing a different job.**

1. **The renderer decides from `status`, never from the presence of a
   number** (`seat_cost.format_cost_block`). A non-numeric status renders
   as unmeasured whatever number sits beside it, and says so out loud
   (*"a number (0.0) is recorded beside a status that means it was not
   measured; the status wins"*). The mirror holds too: a `measured`
   component with no number reports nothing rather than guessing. And a
   report containing any unmeasured component has **no total**, regardless
   of what `total_credits` claims. This is structural — it holds however
   the block reached the reader.

2. **The close refuses a block that breaks its own contract**
   (`close_session._apply_cost_report`). It now runs
   `disposition._validate_cost` — the *same* validator, not a second
   opinion (L-069-1) — and on failure reports nothing as a measurement,
   naming the errors: `"recorded, but REFUSED -- disposition.cost does not
   satisfy its own contract..."`. Silently printing nothing would have
   left the operator thinking cost was simply not measured, when in fact
   the record is wrong; that distinction is the whole subject of this set.

Part 1 alone satisfies both acceptance criteria. Part 2 is kept because
the two findings ask for different things — one for validation, one for
safe rendering — and because a refused record and an absent record are
different facts a close should not conflate.

## Round 2 — the advertised command produced no total

> The documented whole-session cost command misclassifies `routed_api` on
> Copilot-seat sessions.

**What was true, and worse than reported.** `--session-set-dir` passed
`args.no_api_calls` (default `False`) straight into `measure_session()`,
so the exact command printed by the close note and named in both docs as
*the* producer — `python -m ai_router.seat_cost --session-set-dir <dir>
--cost-block` — reported `routed_api` as `UNKNOWN` and suppressed the
total for the ordinary Copilot-seat case. A block that can never carry a
total is a contract nobody will use.

**The fix: derive it from the record, and apply the same reasoning to the
sibling component.** The flag was the bug — a flag is a *claim* about the
transport, and this module's own rule is that attribution comes from
records. `session_conversation_ids()` now also counts the session's priced
and unpriced metrics rows, and `measure_session()` resolves **both**
routed components from them:

| what the log says | status | why |
| :--- | :--- | :--- |
| no call of that kind was dispatched | `not_applicable` (0.0) | an honest zero — and the only thing that lets a total exist |
| calls dispatched, no conversation id captured | `unknown` | real spend that cannot be attributed; never zero |
| fewer ids than calls | `lower_bound` | `measure()` cannot see this: it only ever knows about ids it was handed |
| priced Direct-API calls exist | `unavailable`, with the reason | real, authoritative in `router-metrics.jsonl` — **in dollars**, while everything here is AI credits. Summing it would be a unit error; calling it `not_applicable` would report someone's spend as zero |

Extending the fix to `routed_seat` was not scope creep; it was the same
defect one component over (`project-guidance.md` → *a bug is a bug
CLASS*). Without it, every session that simply made no routed call still
reported `UNKNOWN` and lost its total — an unknown that means nothing is
as useless as a zero that means nothing. The `lower_bound` row is a
genuine new capability: it is the first thing in the chain that can tell
"priced everything" from "priced everything I was told about".

`--no-api-calls` keeps its meaning on the explicit-ids path and its help
text now says it is unnecessary with `--session-set-dir`.

## Falsifiers

Six new test functions, each planted from the finding's own failure
scenario rather than written around the fix:

| test | plants |
| :--- | :--- |
| `test_a_status_that_means_unmeasured_beats_a_number_sitting_beside_it` | `status: "unknown"` + `credits: 0.0` + a `total_credits` — the finding verbatim |
| `test_a_numeric_status_with_no_number_reports_nothing_rather_than_guessing` | the mirror: `measured` with `credits: null` |
| `test_close_refuses_to_report_a_cost_block_that_breaks_its_own_contract` | the same bad block arriving through `read_disposition` |
| `test_routed_api_applicability_is_derived_from_the_record_not_a_flag` | a seat session, then the same session with a priced api row appended |
| `test_the_advertised_cli_command_produces_a_block_with_a_total` | the exact flagless command from the docs and the close note |
| `test_a_session_with_no_routed_call_at_all_is_a_zero_not_an_unknown` | no routed call, then two routed calls with no ids captured |

One pre-existing test changed its expectation and the change is the
point: `test_measure_session_joins_recorded_ids_from_both_writers` plants
two routed rows for one session and only one id, and now asserts
`lower_bound` with the reason naming `2 routed call(s)` — the fixture had
been asserting `measured` for a partial capture, which is exactly the
overclaim this round removed.

## Acceptance

- Round 1 call 1's executable criterion: **exit 0** (was exit 1 — the
  close output rendered `$0.00`).
- Round 1 call 2 and Round 2 are `JUDGMENT` criteria; both are converted
  into mechanical tests above.

## Suite after remediation

`test_seat_cost.py` + `test_close_session_skeleton.py` +
`test_disposition.py` + `test_metrics.py` — **186 passed**.
