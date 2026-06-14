# Forward A/B Design — Causal Test of Verification Surfaces

> **Set 065, Session 1 deliverable.** The retrospective (`bake-off-results.md`)
> is existence-proof + hypothesis-generation; with n=5 and five confounds it
> cannot causally separate context-access from provider-multiplicity, nor answer
> whether routed verification has marginal value. This is the controlled
> experiment that can. Its requirements are *dictated by* the confounds the
> retrospective surfaced.

## Question

Causally separate, and quantify:
1. **Context-access effect** — does full-repo + probe access (path-aware) catch
   real defects that snippet-fed (routed) misses, *holding provider constant*?
2. **Provider-multiplicity effect** — how much of any path-aware edge is just a
   second provider, *holding context constant*?
3. **Routed's *capability* marginal value** — does routed catch anything
   path-aware misses *on the same frozen code* (**Experiment A**)? This is
   capability, *not* cadence.
4. **Probeable coverage** — what fraction of catches would a *pre-committed
   deterministic falsifier suite* capture (validating the retrospective's ~92%)?
5. **Routed's *cadence* value** — does per-session routed verification, by
   catching defects *earlier during construction*, reduce cumulative defect
   burden / rework / cost vs. a single end-of-set path-aware pass
   (**Experiment B**)? Experiment A deliberately holds cadence constant, so it
   **cannot** answer this — and cadence is the retrospective's named surviving
   defense for routed. The keep-or-drop-routed decision needs *both* experiments.

## Experiment A — capability (blind parallel review on a frozen tree)

For each unit of work, all arms review the **identical frozen pre-remediation
tree**, **blind** (no arm sees any other's output). This removes the three
confounds the retrospective could not: **order**, **remediation-state**, and
**sequencing**. Cadence and round-count are matched by running every arm
single-round on the same unit (or all arms at the same fixed N).

This isolates **capability** — what each surface catches on identical code — and
answers questions 1, 2, 3 (capability sense), and 4. It deliberately **holds
cadence constant**, so it does *not* answer question 5; that is Experiment B.

## Arms — a 2×2 factorial (context × provider) + multi-provider cells

| Arm | Context | Provider |
|---|---|---|
| A1 | routed (snippet/diff) | GPT |
| A2 | routed (snippet/diff) | Gemini |
| B1 | path-aware (repo+probes) | GPT |
| B2 | path-aware (repo+probes) | Gemini |

Derived cells: **routed-pair** = A1∪A2, **path-aware-pair** = B1∪B2.

This isolates: context main-effect (B vs A), provider main-effect (GPT vs
Gemini), their interaction, and provider-multiplicity (pair − single) *within
each context*. The headline comparisons:
- **B1 − A1** (and B2 − A2) = context-access effect, *same provider* (scales up
  the single clean case 012 C3 gave us).
- **A1∪A2 − A1** = provider-multiplicity within routed (the cheap-alternative
  test: would a second routed validator substitute for path-awareness?).
- Does **routed-pair** catch any seeded defect **path-aware-pair** misses? =
  routed's marginal value.

## Ground truth — solving the oracle problem two ways

1. **Seeded defects (primary, rigorous).** Inject a catalogue of known defects
   into the frozen trees (mutation-testing style), so ground truth is *known* and
   per-arm catch-rate is exact. The catalogue must span the classes the
   retrospective found and be **pre-labelled probeable vs novel-reasoning**:
   - index/count undercount (C9-class) · name-collision / dup-key (C3-class) ·
     too-narrow regex / validation (010-class) · type/shape contradiction across
     surfaces (010 MakeTable) · silent coercion / default-injection · cross-file
     contract/join-key drift (011 C1) · remediation-introduced regression
     (011 R2) · and ≥2 genuinely novel-reasoning defects (latent-not-triggerable,
     emergent invariant) as a hard-case control.
2. **Natural defects (secondary, ecological).** On un-seeded real work, take the
   adjudicated union of all arms' catches + downstream-discovered defects. Lower
   power, but guards against seeded defects being unrepresentatively "findable."

## Probeable / falsifier arm (validates the biggest lever)

For every seeded defect, **pre-author a deterministic falsifier** (count assert,
dup-key assert, parser/round-trip test) *before* running the agents. Then measure
what fraction of defects the falsifier-suite catches vs. each agent arm. This
forward-tests the retrospective's ~92%-probeable finding and directly quantifies
how much of verification a **contract-test gate** could carry deterministically —
the central S3 design question.

## Metrics (per arm)

- **True-positive catch rate** on seeded defects (severity-weighted), with the
  probeable/novel split reported separately.
- **False-positive rate** (the path-aware cost the retrospective flagged via
  Gemini's 009 over-escalations).
- **Cost:** routed = metered $; path-aware = tokens/$ (BYOK) or operator-minutes
  (manual) + **tool-call count** (the instrumented path-awareness signature from
  S2 — probes actually run, not afforded).
- **Wall-clock latency.**
- **Non-determinism:** run each agentic arm **K repeats** per unit; report the
  catch-rate *distribution*, not a single run (agentic arms are stochastic).

## Sizing & honesty

Aim for **effect-size clarity, not p-values.** A practical first pass: seed
~20–30 defects across ~4–6 frozen trees, ×K≈3 repeats per agentic arm. That
resolves *large* effects (the kind C3/C9 represent) and the probeable-coverage
fraction; it will **not** resolve small effects — state that explicitly rather
than over-reading a near-tie. Scale up only if a decision hinges on a small
effect.

## Execution vehicle

- **Frozen trees:** `git`-restore pre-remediation commits from harvester
  008–012 (real defect surface), and/or a purpose-built seed harness on the
  **calculator mock-repo** (controlled, cheap, fully seedable).
- **Path-aware arms (B1/B2):** run programmatically via the integration surface
  S2 selects (Copilot SDK / CLI), which also enables the K-repeat
  non-determinism sampling and the tool-call instrumentation.
- **Routed arms (A1/A2):** the existing `route()` path, pinned per provider.

## Experiment B — cadence (staged-snapshot intervention study)

Experiment A measures capability on frozen code; it cannot value *earlier*
intervention, which is routed's named surviving defense. Experiment B varies
cadence directly:

- **Staged snapshots.** Take a multi-session unit of work at its per-session
  checkpoints (S1, S2, S3 …). Run two regimes to completion:
  - **per-session routed** — routed verification + remediation after *each*
    session (the current Full-tier cadence);
  - **end-of-set path-aware** — one path-aware pass at the end only;
  - (optionally **both**).
- **Measure the cadence-relevant outcomes**, not just catch-rate: cumulative
  defect burden at set close, **rework/compounding** (defects that a later
  session built on because an earlier one wasn't caught), wall-clock-to-green,
  and total cost ($ metered + operator-minutes). The question is whether
  catching a defect at session N is materially cheaper than catching the same
  defect at set end.
- **Seed cross-session-coupled defects** — ones whose cost grows if later
  sessions build on them — since those are exactly where cadence should pay off;
  a defect with no downstream coupling will (correctly) show no cadence benefit.

Experiment B is the only thing that can settle keep-or-drop-routed if routed's
value is cadence. If it shows no rework/cost advantage to per-session routed,
that — combined with Experiment A showing no unique *capability* — is the
evidence to demote or retire routed. If it shows a real compounding-cost saving,
routed stays as a cheap early gate regardless of capability overlap.

## What each outcome implies

- **B1≫A1 (context-access large), routed-pair adds nothing path-aware-pair
  misses (Exp A)** *and* **Exp B shows no cadence/rework saving** → demote routed
  to a cheap smoke-pass or retire; lead with path-aware. (Both experiments
  required — Exp A alone only rules out a *capability* defense.)
- **A1∪A2 ≈ B-cells (provider-diversity explains it, Exp A)** → the cheap fix is a
  second routed validator; path-aware tooling is lower priority.
- **Falsifier-suite ≈ agent catch on probeable defects** → the contract-test
  gate carries the bulk deterministically; reserve agents for the novel residual.
- **Routed catches a class path-aware misses (Exp A)** *or* **Exp B shows a real
  compounding-cost saving** → keep routed; "non-overlapping blind spots" (or
  cadence value) confirmed.

This design is the clean instrument; the retrospective's job was to motivate it
and specify its controls. Both are done.
