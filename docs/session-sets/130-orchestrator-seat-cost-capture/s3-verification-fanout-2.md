ISSUES FOUND

- **Issue 1:** `close_session` can still print an invalid recorded cost block as a real `$0.00` measurement.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/close_session.py:1477`, `ai_router/seat_cost.py:971`, `ai_router/disposition.py:418`, `ai_router/gate_checks.py:2435`
  - **Failure scenario:** A typical session author pastes or hand-edits `disposition.cost` with `status: "unknown"` but `credits: 0.0` / `usd: 0.0`. `read_disposition()` does not validate, the close gate registry has no disposition-shape/cost validation gate, and `_emit_output()` renders the block through `format_cost_block()`, which chooses numeric rendering solely from `credits is None`. The close report can therefore show an unmeasured component as `$0.00`, the exact plausible-wrong-number failure this session is meant to prevent.
  - **Acceptance criterion:** `JUDGMENT - A recorded cost block with any non-numeric status and numeric credits/usd is either rejected before close output or rendered only as unmeasured, never as a credit/USD amount.`
  - **Details:** Violation: “an unmeasured component carries `credits: null`” and “never presents an unmeasured component as `$0.00`.” Impact: a close can succeed while printing and recording the misleading zero-cost shape the change is supposed to eliminate. Evidence: `close_session` prints `outcome.cost` directly; `format_cost_block` renders any non-`None` credits as `credits = $...` without consulting status; `read_disposition` reconstructs without validation; the close gate registry does not run `validate_disposition`.

**NITS**

- **Nit:** The documented `--session-set-dir ... --cost-block` command omits `--no-api-calls`, but `seat_cost.main()` passes `routed_api_not_applicable=args.no_api_calls`, so the default CLI path treats `routed_api` as `UNKNOWN` rather than `not_applicable`. This is conservative, not fail-open, but it prevents the advertised default command from producing the complete Copilot-seat total.
- **Nit:** `close_session.py`’s JSON output docstring still omits the newly added `cost` / `cost_note` keys, even though `CloseoutOutcome.to_dict()` emits them.