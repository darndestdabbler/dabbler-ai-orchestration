# AI assignment log — Set 112

Per-session orchestrator assignment and the next-session recommendation.
Under the temporary verification-only routing policy (2026-08-05), the
active orchestrator records these directly rather than routing the
analysis; only `session-verification` goes through `route()`.

---

## Session 1 — Router-side removal

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5` / effort `high`
(GitHub Copilot CLI transport; the seat carries no provider API keys by
design).

**Verification:** routed to `gpt-5.5` (openai) — a different effective
provider, as the cross-provider rule requires. Three rounds: discovery
(fan-out 2, lenses spec-conformance + failure-scenario) → supplementary →
remediation-review. Final verdict **VERIFIED**, 4 fixes accepted, 0
rejected. Cost recorded as $0.0000 (Copilot seat, not metered per call).

**Why this pairing:** the work is a large deletion whose risk is
*omission* — a branch left behind, a caller left dangling, a gate quietly
disarmed. That is exactly what an adversarial reader on a different
provider is good at finding, and it paid: the discovery pass caught that
the fail-loud loader was true but **unreachable** on the real lifecycle
path, which is the defect that would have hurt the actual migration
population.

---

## Session 2 — Extension and docs

**Recommended orchestrator:** `copilot` / `anthropic` / `claude-opus-5` /
effort `high` — **continue the current trajectory**.

**Reasoning.** Session 2 is the other half of one decision, not a new
problem. It consumes `s1-kill-inventory.md`'s "Deferred to S2" list
(52 extension files, 57 extension test/fixture files, 12 templates, 35
docs), and several of its edits are the direct downstream of choices made
here — the Getting Started form's first question becomes provider access
because the tier fork is gone; the docs must describe the boundary refusal
this session built, with the wording this session chose; the templates must
render a `full` cold-start tree that matches the fixture this session
stopped snapshotting in two variants. An orchestrator without that context
would re-derive it from the inventory at best, and re-litigate it at worst.

**What Session 2 must not inherit uncritically.** Two things this session
deferred are S2's to finish, and both are easy to overlook because the
router already looks clean:

1. `test-fixtures/cold-start/full/` still teaches the tier fork. It is
   GENERATED; S2 edits `docs/templates/consumer-bootstrap/` and
   regenerates with `UPDATE_GOLDEN=1 npm run test:unit`. Do not hand-edit
   the golden.
2. `docs/ai-led-session-workflow.md` still documents typed
   verification/remediation sessions and `register_typed_session_*`, whose
   writers this session deleted. That doc is the constitution's on-demand
   Step 1/6-7 reference, so a stale procedure there is a live trap.

**Verification for S2:** must again use a non-anthropic effective provider.
S2 changes a rendering surface (Getting Started), so it pays its own full
Layer 3 after freeze — the same trigger that fired here.

---

## Session 3 — The grep gate, the walk, the release

**Recommended orchestrator:** `copilot` / `anthropic` / `claude-opus-5` /
effort `high`.

**Note for whoever writes the S3 acceptance gate.** The measured numbers in
`s1-before-after-numbers.md` contradict one of the spec's premises: the
test matrix shrank by 233 tests (−6.1%) but the CI wall clock did **not**
move (the deleted modules cost 3.64s of a ~16-minute suite). Write the gate
against *zero live references*, which is executable and true. Do not write
it against a minutes saving; the measurement does not support one, and a
gate that asserts a false thing is worse than no gate.

The gate must also exempt, by construction: `docs/session-sets/**`,
`docs/proposals/**`, the changelogs, `LIGHTWEIGHT_REMOVED_MESSAGE` and its
tests, and the comments that narrate the removal. A gate that cannot tell
"mentions the tier" from "declares the tier" would either fail on its own
error message or force the removal to go undocumented.
