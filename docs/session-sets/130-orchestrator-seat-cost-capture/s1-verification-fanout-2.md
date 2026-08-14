ISSUES FOUND

**Issue 1:** The public component identifiers do not match the session’s literal measurement-name contract.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/130-orchestrator-seat-cost-capture/spec.md:186`, `ai_router/seat_cost.py:127`, `ai_router/docs/seat-cost.md:17`, `ai_router/docs/close-out.md:20`
- **Failure scenario:** Session 2/3 or a caller follows the authored spec and expects the wire/API component names `routed_call_cost`, `routed_seat_cost`, and `orchestrator_seat_cost`, but the reader emits/documents `routed_api`, `routed_seat`, and `orchestrator_seat`. That is probable because these identifiers are the reader’s public `CostReport.to_dict()` component values and the next sessions are explicitly planned to wire them into persistent reporting.
- **Acceptance criterion:** `JUDGMENT - The three literal component identifiers in ai_router/seat_cost.py, ai_router/docs/seat-cost.md, ai_router/docs/close-out.md, and the Session 1 spec all agree on the same public measurement names.`
- **Details:** **Violation:** the spec says `seat-cost.md` defines `routed_call_cost`, `routed_seat_cost`, and `orchestrator_seat_cost`; the implementation defines `COMPONENT_ORCHESTRATOR_SEAT = "orchestrator_seat"`, `COMPONENT_ROUTED_SEAT = "routed_seat"`, and `COMPONENT_ROUTED_API = "routed_api"`. **Impact:** this changes the public/wire vocabulary before the later disposition schema and close-out wiring consume it, creating avoidable schema drift. **Evidence:** the code and docs use the shorter names while the authored session plan uses the `_cost` names.

**NITS**

- **Nit:** `spec.md` still says non-Copilot engines resolve to `not_applicable`, but the conventions, docs, implementation, and tests correctly treat them as `unavailable` because the spend is real but unseen.
- **Nit:** `seat_cost.py` reads `sessions.id` to distinguish a known zero from an unknown id, but `check_store_shape()` does not validate that table/column. If that shape changed without a schema-version bump, the reader would fail closed to `unknown` rather than naming the schema problem.
- **Nit:** The CLI can declare `--no-api-calls` but has no equivalent way to declare no routed Copilot-seat calls, so the documented `--self --no-api-calls` path always includes an empty routed component as `unknown`.