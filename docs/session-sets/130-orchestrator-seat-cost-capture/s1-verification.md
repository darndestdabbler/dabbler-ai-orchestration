**VERIFIED** — I checked the Session 1 plan against the implemented reader, docs, and planted-store tests. The deliverable is present and the core fail-open paths return named non-numeric statuses rather than `$0.00`.

**NITS**

- `spec.md` names `routed_call_cost` / `routed_seat_cost` / `orchestrator_seat_cost`, but the shipped docs/API use `routed_api` / `routed_seat` / `orchestrator_seat`.
- `spec.md` still says non-Copilot engines resolve to `not_applicable`; the module, tests, and seat-cost doc correctly use `unavailable`.
- Overlapping session IDs across components are not rejected, so manual bad input can double-count a conversation.
- `seat_cost.py` reads `sessions.id` to distinguish genuine zero from unknown, but the shape check does not validate that table/column.