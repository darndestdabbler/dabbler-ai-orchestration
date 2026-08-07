# AI Assignment — Set 111

Per-session orchestrator assignment and cost record. Appended one block
per session.

---

## Session 3: Decision rights and education mode

### Recommended orchestrator

`copilot` / `claude-opus-5` / effort `high` (provider `anthropic`,
provenance **asserted** — the Copilot seat derives the effective
provider by registry lookup on the model).

### Rationale

Recorded directly rather than routed, under the temporary
verification-only delegation policy (spec, *Temporary execution
policy*): the active orchestrator owns implementation, architecture,
analysis, documentation and test authoring, and only
`session-verification` goes through `route()` with a different
effective provider.

Carried forward from Session 2's `next_orchestrator` block, whose
stated reason still holds: Session 3 executes the same proposal §11
decision record this orchestrator has been running since S1, and the
decision journal is a new small `ai_router` module of the same shape as
the acceptance harness. Cross-provider independence is preserved where
it matters — the `session-verification` route, which excludes
`anthropic`.

### Estimated routed cost

One discovery round (K=2 fan-out) plus, if it finds blockers, a
supplementary pass and up to two remediation-review cycles — the
enforced 2+2 bound from Session 1.

**Cost figures on this seat are not measurable.**
`transports.copilot-cli.billed_usage_unavailable: true`, so every
routed round records `$0.0000` while consuming real Copilot Enterprise
premium-request budget. Unmeasured is not unbilled (operator
correction, `operator-notes.md`, 2026-08-07). The only binding guard is
`max_invocations_per_session`, a circuit breaker rather than a budget —
which is precisely why the enforced loop bound is the effective spend
control on this transport.

### Actuals (filled after the session)

- Routed rounds: recorded in `s3-rounds.jsonl`.
- Recorded cost: `$0.0000` — **unaccounted, not free**.

---

## Session 4: Ceremony pass — artifacts, session size, tests, UAT

### Recommended orchestrator

`copilot` / `claude-opus-5` / effort `high` (provider `anthropic`,
provenance **asserted** — the Copilot seat derives the effective
provider by registry lookup on the model).

### Rationale

Recorded directly rather than routed, under the temporary
verification-only delegation policy (spec, *Temporary execution
policy*): the active orchestrator owns implementation, architecture,
analysis, documentation and test authoring, and only
`session-verification` goes through `route()` with a different
effective provider.

Carried forward from Session 3's `next_orchestrator` block, whose
stated reason still holds. Every S4 item depends on context
accumulated across S1–S3: which artifacts this set actually produced
and read, which bounds were exercised, which decisions were journaled.
S4 also consumes this set's own `decisions.jsonl` (the `uat_decide`
filter feeds the walk's Decide section) and must weigh the structural
recommendation S2 recorded about the unbounded close backstop. S4 is
the set-terminal session, so it also owns Step 9 and the advisory
path-aware critique.

### Estimated routed cost

One discovery round (K=2 fan-out) plus, if it finds blockers, a
supplementary pass and up to two remediation-review cycles — the
enforced 2+2 bound from Session 1.

**Cost figures on this seat are not measurable.**
`transports.copilot-cli.billed_usage_unavailable: true`, so every
routed round records `$0.0000` while consuming real Copilot Enterprise
premium-request budget. Unmeasured is not unbilled.

### Actuals (filled after the session)

- Routed rounds: recorded in `s4-rounds.jsonl`.
- Recorded cost: `$0.0000` — **unaccounted, not free**.
