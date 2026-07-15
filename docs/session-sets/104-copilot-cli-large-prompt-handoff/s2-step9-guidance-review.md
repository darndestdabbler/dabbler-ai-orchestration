# Step 9 — guidance reorganization review (Set 104, last session)

Reviewed `docs/planning/project-guidance.md` and
`docs/planning/lessons-learned.md` against Set 104's work. Outcome:
**two recommended additions, both gated on ceiling headroom (operator
decides the demotion), plus one reactivation candidate.** No structural
reorg of the existing corpus is needed.

## Ceiling context

`guidance_report --check` at close: `lessons-learned.md` is at **99% of its
2,385-token ceiling**; `project-guidance.md` at **100%**. Ceilings ratchet
down only, so any admission below requires demoting existing prose first — an
operator config decision, not a unilateral session edit. Recorded here as
recommendations rather than applied.

## Recommendation 1 (new lesson) — verify a transport through its production entrypoint, not the low-level class

- **What happened:** the S2 live probe drove `CopilotCliTransport.dispatch`
  directly and passed clean — but a real `route()` call under
  `transport.profile: copilot-cli` would have **failed closed** at
  `validate_catalog` (CLI version drift, 1.0.69 vs the pinned 1.0.68) *before*
  the transport ran. The direct-class probe silently bypassed a fail-closed
  gate that guards the real path, so "it worked in my probe" masked a hard
  block on the production route. Cross-provider verification caught it; a
  direct-only probe would have shipped a false "verified live" claim.
- **Portable rule:** when live-verifying a transport/adapter/integration,
  drive it through the **same entrypoint production uses** (here `route()`),
  not the low-level implementation class — otherwise you skip the
  preconditions/gates the real caller runs, and a green probe can coexist with
  a fail-closed production path. Corollary: a hard version pin against an
  **auto-updating** dependency (the Copilot CLI) drifts silently; treat a
  `cli_version_pin_required`-style gate as something that WILL drift and needs
  a reconciliation cadence, not a one-time probe.
- **Recurrence:** likely — the hybrid Copilot-CLI tier (Sets 078/086/103/104)
  keeps exercising this seam, and the drift will recur on every CLI
  auto-update.

## Recommendation 2 (reactivate) — L-070-1 "iterative dogfood is evidence"

`cite_lessons` flagged **L-070-1** (archived) as used by Set 104 — the live
>32 KiB probe is exactly iterative-dogfood-as-evidence. Recommend reactivating
it into the active tier (subject to the same ceiling/demotion decision).

## No other changes

The existing active lessons (L-064-8/9, L-065-1, L-066-1, L-069-1, etc.) remain
correctly placed; L-065-1 and L-064-9 were freshly cited this set. Nothing in
`project-guidance.md` is stale relative to Set 104's work.
