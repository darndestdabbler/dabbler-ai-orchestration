# AI Assignment Ledger — Set 085

Per-session record of the cheapest-capable AI for each step, plus the
next-session recommendation. Next-orchestrator / next-session choices are
produced via routed analysis (`route(task_type="analysis")`), never
self-opined (L-064-6 / Rule 17). The routed analysis for S1 is saved raw
at `s1-next-orchestrator-analysis.json`.

## Session 1 of 3 — Preload manifest + ratcheting ceiling gate (F1)

Orchestrator: **claude / anthropic / claude-opus-4-8 / high**.

| Step | Handled by | Rationale |
| :--- | :--- | :--- |
| Extend `guidance_config.py` (manifest parsing, int-not-bool guards) | Orchestrator (direct) | Design fully settled by spec + prior cross-provider consult; delicate schema-parity code where L-066-1 discipline is best applied by the implementer against the live module. |
| Extend `guidance_report.py` (reporter, `--check` per-file+total, `--write-headers` opt-in, fail-closed, path containment) | Orchestrator (direct) | Tightly-coupled to the config module above; verified end-to-end by the mandatory cross-provider check. |
| Declare manifest at ratchet-start sizes (`router-config.yaml`) | Orchestrator (direct) | Mechanical measurement (`ceil(chars/4)` proxy) transcribed into config. |
| `guidance-lifecycle.md` docs (ratchet rule + admission test) | Orchestrator (direct) | Content fully determined by the spec + the 2026-07-07 consensus synthesis (verbatim admission test); no open reasoning. |
| CI job + CONTRIBUTING pre-commit line | Orchestrator (direct) | Mechanical, pattern-matched on the existing `drift-guards` job. |
| pytest matrix | Orchestrator (direct) | Written against the live modules; exercised by the full suite. |
| **Session verification (Step 6)** | **Routed — gpt-5-4 (cross-provider, non-anthropic)** | Mandatory no-skip cross-provider check (Set 083). 9 rounds; rounds 1-8 each caught a real, distinct correctness defect on the fail-closed / path-containment surface; round 9 VERIFIED. ~$3.9. |
| Next-orchestrator + next-session AI assignment | **Routed — analysis** | L-064-6: never self-opine on model choice. |

**Delegation note.** The implementation was handled directly rather than
routed because (a) the design had zero open architecture questions
(settled by the spec and a prior cross-provider consult), (b) the code is
a delicate schema-parity / fail-closed surface where the L-066-1 /
L-069-1 discipline is best applied by the implementer against the live
module, and (c) Set 085's own thesis is that over-delegating a settled
implementation into many routed calls is the ceremony this set exists to
reduce. The non-negotiable cross-provider verification (routed, gpt-5-4)
was the real quality gate — and it earned its keep, catching eight rounds
of genuine fail-closed defects.

## Next-session recommendation (routed analysis)

For **Session 2 of 3 (F2+F3 — the constitution, the demotions, the
lessons triage)** the routed analysis recommends **claude / anthropic /
high effort**: S2 is large-scale, cross-file document authoring and
refactoring with a wide stale-echo blast radius, which favors a
large-context, high-coherence orchestrator, with operator supervision on
the cross-cutting required-reading rewrite. `pathAwareCritique: required`
for the set-terminal close. The routed model-id suggestions were stale
training artifacts (Claude 3 era); the current capable equivalent is
`claude-opus-4-8`.
