VERIFIED — I checked the session plan against the touched state writer, CLI boundary, metrics writer, Copilot transport metadata, schema/doc updates, and new falsifier tests. The core obligations are discharged: the orchestrator seat id is read at `start_session`, accumulated/omitted correctly in `session_state`, and Copilot child `sessionId` is persisted through `record_call` while API/default callers remain additive-null.

NITS

- **Nit:** `docs/session-sets/130-orchestrator-seat-cost-capture/s2-conventions.md` is a new tracked file despite the plan’s “Creates: nothing new” line. It appears to be review scaffolding rather than product plumbing, so it does not affect the implementation contract.