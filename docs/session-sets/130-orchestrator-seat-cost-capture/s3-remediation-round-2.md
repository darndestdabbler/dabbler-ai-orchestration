# Session 3 — remediation of Round 2 (supplementary discovery)

One Major finding, accepted in full; not disputed. It is remediated in the
same pass as Round 1's two, because it is the same function's sibling
defect — the full write-up, with the fix table and the falsifier list, is
in [`s3-remediation-round-1.md`](s3-remediation-round-1.md) under *Round 2
— the advertised command produced no total*. This sidecar records the
finding and the outcome.

---

## The finding

> The documented whole-session cost command misclassifies `routed_api` on
> Copilot-seat sessions.

`--session-set-dir` passed `args.no_api_calls` (default `False`) straight
into `measure_session()`, so the exact command printed by the close note
and named in both docs as *the* producer of `disposition.cost` —
`python -m ai_router.seat_cost --session-set-dir <dir> --cost-block` —
reported `routed_api` as `UNKNOWN` and suppressed the total for the
ordinary Copilot-seat case.

**Why Major.** A block that can never carry a total is a contract nobody
will use, and the advertised path was the only one most operators would
ever run.

## The fix

The flag was the bug. A flag is a *claim* about the transport; this
module's own rule is that attribution comes from records. Both routed
components are now derived from the session's own metrics rows: no call
dispatched → `not_applicable` (an honest zero, and the only thing that
lets a total exist); calls dispatched with no ids captured → `unknown`;
fewer ids than calls → `lower_bound`; priced Direct-API calls present →
`unavailable` with the reason naming where that cost *is* authoritative
and in which unit.

Extending the same reasoning to `routed_seat` was not scope creep but the
same defect one component over (`project-guidance.md` → *a bug is a bug
CLASS*): without it, every session that simply made no routed call still
lost its total.

## Acceptance

The criterion is `JUDGMENT`. It is converted into two mechanical tests —
`test_routed_api_applicability_is_derived_from_the_record_not_a_flag` and
`test_the_advertised_cli_command_produces_a_block_with_a_total`, the
latter driving the exact flagless command the docs print — plus
`test_a_session_with_no_routed_call_at_all_is_a_zero_not_an_unknown` for
the sibling.

## Suite after remediation

`test_seat_cost.py` + `test_close_session_skeleton.py` +
`test_disposition.py` + `test_metrics.py` — **186 passed**.
