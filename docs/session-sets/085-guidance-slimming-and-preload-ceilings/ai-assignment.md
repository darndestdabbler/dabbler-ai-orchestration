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

## Next-session recommendation (routed analysis, made before S2)

For **Session 2 of 3 (F2+F3 — the constitution, the demotions, the
lessons triage)** the routed analysis recommends **claude / anthropic /
high effort**: S2 is large-scale, cross-file document authoring and
refactoring with a wide stale-echo blast radius, which favors a
large-context, high-coherence orchestrator, with operator supervision on
the cross-cutting required-reading rewrite. `pathAwareCritique: required`
for the set-terminal close. The routed model-id suggestions were stale
training artifacts (Claude 3 era); the current capable equivalent is
`claude-opus-4-8`.

## Session 2 of 3 — The constitution, the demotions, the lessons triage (F2+F3)

Orchestrator: **claude / anthropic / claude-fable-5 / high** (operator's
model choice; the routed S1 recommendation was claude/anthropic/high).

| Step | Handled by | Rationale |
| :--- | :--- | :--- |
| Author `docs/session-constitution.md` | Orchestrator (direct) | Content fully determined by the spec + the live docs it condenses; cross-file coherence with the simultaneous contract rewrite is the orchestrator's whole-context strength. |
| Required-reading contract rewrite (11 live surfaces + templates + goldens) | Orchestrator (direct) | Wide stale-echo blast radius (L-065-1): one context editing every echo in one pass beats routing per-file fragments. |
| Lessons triage classification | **Routed — guidance_triage (opus, $0.17)** | The tool's routed bulk classifier; proposal artifact saved raw. |
| Triage sharpening vs the F3 admission test + operator decision sheet | Orchestrator (direct) + **operator approval** | The routed pass kept 17 lessons (~8.8k tokens); the admission test is a spec-defined filter the orchestrator applied and the operator reviewed/approved per the spec's gate. |
| Manifest ceilings + gate run | Orchestrator (direct) | Mechanical measurement transcribed into config. |
| **Session verification (Step 6)** | **Routed — cross-provider, non-anthropic** | Mandatory no-skip cross-provider check (Set 083). |
| Next-orchestrator recommendation | **Routed — analysis (gemini-pro, $0.005)** | Rule 17: never self-opine. Saved raw at `s2-next-orchestrator-analysis.txt`. |

### Actuals
- Orchestrator used: claude / anthropic / claude-fable-5 @ effort=high
- Routed cost (pre-verification): ~$0.18 (triage $0.172 + analysis $0.005)
- Deviations from recommendation: none material (operator selected the
  Fable 5 model on the recommended claude/anthropic/high seat).
- Notes: the routed triage classifier under-applied the admission test
  (kept 17/~8.8k tokens vs the ~2k target); the orchestrator-sharpened,
  operator-approved decision sheet is the artifact that landed. Budget a
  sharpening pass on top of `guidance_triage` output in consumer repos.

**Next-session orchestrator recommendation (Session 3, routed —
gemini-pro; raw at `s2-next-orchestrator-analysis.txt`):**
claude / anthropic @ effort=medium, Sonnet-class model (routed model ids
were stale Claude-3-era artifacts; current equivalent is
`claude-sonnet-4-6` — or the operator's preferred Claude seat). Rationale
(routed): S3 mixes a focused audit, portable doc authoring, a
mechanically-prescribed critique, and mechanical releases — a
mid-tier, cost-efficient orchestrator suffices, and S3's live dogfood by
design just runs the session from the slimmed preload. Correction
applied: the routed suggestion to verify with an Anthropic model is
overridden by the mandatory cross-provider machinery (the verifier
excludes the orchestrator's effective provider — Set 084); verification
routing is not an orchestrator choice.
