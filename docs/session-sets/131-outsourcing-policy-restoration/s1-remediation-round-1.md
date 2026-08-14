# Session 1 — Round 1 remediation

**Round:** 1 (discovery, 2-way fan-out) + round 2 (supplementary, clean)
**Verifier:** `gpt-5.5` (effective provider `openai`; `anthropic` excluded as
the session orchestrator's effective provider)
**Findings:** 2 blocking, 0 minor. Both lenses reported **the same defect**
independently — spec-conformance and failure-scenario converged, which is why
it was treated as real without dispute.

---

## The finding

Rule 2 of the new Delegation Discipline says work whose value *is* an
independent perspective must be routed **and must run on a different
effective provider**, naming `session-verification`, `code-review` and
`security-review`.

`route()` derived the orchestrator-provider exclusion only when
`task_type == "session-verification"`. The shipped config pins
`code-review: sonnet`, an Anthropic model. So an Anthropic orchestrator —
which is exactly what ran this session — routing a mandatory `code-review`
would have received an Anthropic reviewer: a same-provider "independent"
review, on the normal supported path, not an edge case.

**The doc claimed an enforcement the code did not have.** That is L-064-8
("a replacement doc inherits the retired doc's claims at its peril") landing
on text written in this very session: the reference implementation hedged the
claim in a parenthetical (`enforced dynamically for session-verification…`)
and the prose I wrote dropped the hedge without checking the code.

Severity **Major** is correct by the consequence rubric: high probability
(Claude Code is a supported orchestrator, `code-review` is now in the
mandatory floor) times high impact (it defeats the central safety condition
that makes widening delegation acceptable).

---

## The fix

Rejected: weakening the doc to match the code. That would ship a policy whose
own safety condition is unenforced for two of its three entries, which is the
"validates but reorders" failure the spec's trap T5 names.

Applied, in `ai_router/__init__.py`:

1. **The derivation gate is now the whole independence set.**
   `if task_type in INDEPENDENCE_REQUIRED_TASK_TYPES and session_set:`
   replaces `if task_type == SESSION_VERIFICATION_TASK_TYPE and session_set:`.
   This was the entire defect: `pick_model()` already treats an exclusion as
   a hard constraint that outranks the `task_type_overrides` pin, and
   `_route_via_copilot_cli` already applies the exclusion against the seat
   catalog. Only the *derivation* was narrow, so only the derivation widened.
2. **The degraded-path warning is task-type aware.** It promised
   `verification_qualification=…` on every record — a stamp written only for
   `session-verification`. Claiming a stamp no reader will find is the same
   overclaim defect in miniature, so the non-verification branch states the
   real consequence instead.
3. **The no-candidate errors are task-type aware.** Both raise sites told the
   operator to run `close_session --manual-verify`, which is meaningless for
   a `code-review`. Independence work still **fails closed**; only the
   remedy text differs.

Prose corrected to match the code in `docs/ai-led-session-workflow.md`
(rule 2) and `ai_router/router-config.yaml` (the `always_route_task_types`
comment, which still said "enforced … for session-verification").

---

## Falsifier evidence (L-112-1)

New module `ai_router/tests/test_independence_provider_exclusion.py`, 6 tests.

The plant: the pre-fix condition was restored and the suite re-run.

| test | planted (pre-fix) | fixed |
| :--- | :--- | :--- |
| `…excludes_the_orchestrator_provider[code-review]` | **FAILED** | passed |
| `…excludes_the_orchestrator_provider[security-review]` | **FAILED** | passed |
| `…caller_supplied_exclusion_is_unioned_not_replaced` | **FAILED** | passed |
| `…excludes_the_orchestrator_provider[session-verification]` | passed | passed |
| `…ordinary_task_type_is_not_provider_constrained` | passed | passed |
| `…code_review_specifically_cannot_select_the_pinned_same_provider` | passed | passed |

The three that stayed green while the defect was planted are the deliberate
look-alikes: `session-verification` was always enforced, and constraining an
ordinary task type would be a much larger behavioural change wearing this
fix's clothes.

## Suite

427 passed, 1 skipped across the targeted selection covering every changed
surface, including `test_routing_exclusion_integrity` and
`test_verify_session_phases` (the two most exposed to a change in how
exclusions are derived). No regression.
