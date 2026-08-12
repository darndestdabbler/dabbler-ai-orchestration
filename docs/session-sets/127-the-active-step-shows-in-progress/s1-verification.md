**VERIFIED** — I checked the active-step derivation, start-time propagation, projection serialization, parity guard, and checklist gate coupling against the Session 1 plan. No Critical/Major defects found.

**NITS**
- **Nit:** `session_flight_facts()` ignores the normalized top-level `startedAt`/`status` fallback used by plan-less in-progress v4 state, so explicit `build_rows(..., 1)` on that supported edge shape would miss the first-row start time.
- **Nit:** `_completion_of()` is documented as only called for logged entries, but unclaimed non-plan bookkeeping entries also flow through it and can act like step completions in no-plan/unplanned-row timelines.