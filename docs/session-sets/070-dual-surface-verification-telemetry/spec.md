# Dual-Surface Verification + Push Fair-Shake Telemetry Spec (Set 070)

> **Purpose:** Give the **push** (routed, snippet-fed) verification surface a **fair
> shake** before any RETIRE decision, and build the **systematic instrument** that
> turns the keep/demote/retire question from faith into measurement. Two things the
> Set 065→069 program left unaddressed: (1) production push ships at **weak**
> framing (`verification.md` "evaluate objectively") — weaker than the Experiment A
> instrument that demoted it ("find every defect", *moderate*) and weaker than its
> pull counterpart (`path-aware-critique.md` "devil's advocate, assume flawed",
> *strong*) — so push has **never been measured at its strong adversarial best**;
> (2) there is no instrument that runs **both** surfaces head-to-head per session
> and records **which surface uniquely caught which high-severity defect** — the
> exact telemetry the §5 RETIRE criterion needs. This set ships the **steelman-push
> upgrade** and the **dual-surface ("overdetermined") verification mode** that
> closes both gaps.
> **Design rationale (required reading):**
> [`docs/verification-surface-strategy.md`](../../verification-surface-strategy.md)
> **§5.1** (operator directive, 2026-06-16) and **L-069-2** in
> [`docs/planning/lessons-learned.md`](../../planning/lessons-learned.md).
> **Created:** 2026-06-16.
> **Session Set:** `docs/session-sets/070-dual-surface-verification-telemetry/`
> **Prerequisite:** Set 069 complete (it shipped the execution-capable pull producer,
> the evidence protocol, and the replacement-gate benchmark machinery this set scores
> over).
> **Workflow:** Orchestrator -> AI Router -> Cross-provider verification (gated:
> run `python -m ai_router.routed_gate` per session; this set touches the shared
> verifier surface + close-out, so expect REQUIRED throughout).

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
pathAwareCritique: required   # continue the dogfood norm; this set touches the verifier surface (high blast radius)
contractGate: advisory        # light dogfood of the floor; SEE NOTE -- record the durable seed at set start
prerequisites:
  - slug: 069-automated-pull-critique-capabilities
    condition: complete
```

> Rationale: pure `ai_router` machinery + a PyPI release; **no UI surface** (the
> Explorer remains a non-goal), so no UAT/E2E gate. **Full tier** — every session is
> cross-provider verified (gated). `pathAwareCritique: required` because this set
> changes the **shared verification surface** (the push template + a new verification
> mode + close-out wiring); the blast-radius predicate scores it `required`.
>
> **Process fix carried from Set 069 S6:** unlike `pathAwareCritique`, the
> `contractGate` spec seed was **not** auto-recorded as a durable `activity-log.json`
> entry at set start in Set 069, so its close-out gate silently no-op'd. **Session 1
> must record the `contractGate` durable seed at set start** (via
> `start_session --contract-gate advisory` or the equivalent writer), and Session 1
> additionally ships the small `start_session` fix so the contractGate seed is
> recorded the same way `pathAwareCritique` already is (so no future set repeats the
> gap).

---

## Project Overview

### Background

The Set 065→069 verification-surface program settled a three-layer model (floor /
ceiling / gated-routed) and **demoted** per-session push to a risk-gated check.
Set 069 then made the set-level pull ceiling *executable*. But two honesty gaps
remain, surfaced by the operator on 2026-06-16:

- **Push has never been measured at its strongest framing.** The DEMOTE evidence
  used *moderate* framing (Experiment A, constant across arms — so its
  *context-access* conclusion stands), but production push **deploys** at *weak*
  framing and was **never** tested at *strong* adversarial framing. Operator field
  experience: strong "devil's-advocate" framing **consistently** lifts push's catch
  rate. This is a cheap, prompt-only lever **orthogonal** to the "second provider
  buys nothing" finding (which is about provider *count*). A RETIRE decided on a
  weak-framed push is "throwing out the baby with the bathwater."
- **There is no head-to-head instrument.** The RETIRE criterion in
  `verification-surface-strategy.md` §5 asks whether the gated push layer catches
  *unique* high-severity defects pull misses. Nothing today runs both surfaces on
  the same change and records the **disjoint** sets. Without that provenance, the
  comparison is anecdote.

### What this set delivers

1. **Steelman push** — upgrade `verification.md` to the devil's-advocate framing pull
   already uses, so the standing per-session push runs at its strongest form.
2. **The dual-surface ("overdetermined") verification mode** — run **both** push
   (routed, adversarial) and pull (path-aware, adversarial) over the **same committed
   state**, with **provider and framing held equal across arms** (a steelman of each
   surface, isolating *surface* as the only variable), and emit a **provenance-tagged
   merged result**: every finding labeled `push-only` / `pull-only` / `both`.
3. **The fair-shake telemetry** — score the dual-surface output, distinguishing
   **random-sampled** runs (unbiased telemetry) from **operator/orchestrator opt-in**
   runs (operational high-assurance, flagged so they don't bias the telemetry). The
   headline metric is the **push-unique vs pull-unique high-severity tally** over the
   Set 069 pre-registered **seeded + holdout benchmark** (where ground-truth labels
   make "was this push-only finding a real Major?" decidable) — the data the §5
   RETIRE decision reopens on.
4. A synthesis update, focused tests, an `ai_router` **PyPI release**, dogfood
   (including **running the dual-surface mode over this set's own diff**), and
   `change-log.md`.

### Scope (in)

- The `verification.md` adversarial-framing upgrade + a regression that pins the
  framing strength.
- A net-new `dual_surface_verify` module: given a session-set dir + committed ref,
  run push (`route(task_type="session-verification")`, adversarial) and pull
  (`pull_critique` / `pull_route`, adversarial), **equal provider + framing**, and
  produce a provenance-tagged merged comparison artifact (schema + pure-Python
  validator with L-066-1 parity).
- The **provenance merge** (dedup that **preserves** surface attribution — a
  push-only and a pull-only finding describing the same defect must not silently
  collapse; mirror the Set 069 S6 floor-ratchet coverage lesson that description
  matching is not identity).
- The **dual-surface verification mode** wired as a `verificationMode`-pattern option
  (durable `activity-log.json` record, sampled-vs-opt-in trigger recorded), and the
  fix so the `contractGate` seed is also recorded at set start.
- The **scoring**: push-unique / pull-unique / shared high-severity tallies; on the
  Set 069 benchmark (ground-truth) the result is a derived, honest number (never
  hand-asserted), underpowered forces an inconclusive verdict, and **the existing
  gated-push layer is never retired by this set** — the set produces the *evidence*,
  the RETIRE decision stays operator-confirmed on that evidence.

### Non-goals (out)

- **Deciding RETIRE.** This set builds the instrument and gathers the first
  datapoints; it does not retire the push layer. RETIRE stays an operator decision on
  accumulated telemetry (strategy doc §5).
- **Field pilots on the operator's complex modernization projects / the
  dabbler-access-harvester.** Those are **downstream consumers** of the shipped
  0.24.x mode (a consumer-repo effort), not part of this canonical-repo apparatus
  set. This set proves the mode on its own dogfood + the seeded benchmark.
- **Explorer / extension UI**; any Marketplace bump.
- A second routed provider for push (Experiment A: buys nothing on capability;
  independence is the one-different-provider job).

### Standards

- **Framing is a controlled, equal variable.** Any push-vs-pull comparison in this
  set holds provider AND framing equal across arms (steelman both); a comparison with
  unequal framing is invalid as RETIRE evidence (L-069-2).
- **Provenance or it didn't happen.** The merge must label every finding by the
  surface(s) that caught it; the disjoint sets are the deliverable, not a side effect.
- **Honest telemetry.** Sampled (unbiased) vs opt-in (operational) runs are tagged and
  never pooled; derived metrics with too-small n report inconclusive, never a verdict.
- **Deterministic servant + additive.** The pull arm keeps the Set 067/069 servant
  discipline; absent the dual-surface config, every existing flow is byte-for-byte
  unchanged.

---

## Sessions

### Session 1 of 3: Steelman push + the dual-surface comparison core

**Steps:**
1. Register; **record the durable `contractGate: advisory` seed at set start** (the
   Set 069 S6 gap) and ship the small `start_session` fix so the contractGate seed is
   recorded like `pathAwareCritique`. Read §5.1, L-069-2, `verification.md`,
   `path-aware-critique.md`, `pull_critique.py`, and the Set 069 evidence protocol.
2. **Upgrade `verification.md`** to the devil's-advocate framing (`assume the work is
   flawed and try to prove it`), matching pull; add a test that pins the framing
   (asserts the strong-framing language is present, so a future silent weakening is
   caught).
3. Build `ai_router/dual_surface_verify.py`: given a session-set dir + committed ref +
   provider + (equal) framing, run the **push** arm (`route` session-verification,
   adversarial) and the **pull** arm (`pull_route` / `produce_path_aware_critique`,
   adversarial) over the same state, and return both raw verdicts. **No merge yet** —
   S1 ships the two-arm runner with provider/framing held equal and a recorded
   attestation that they were equal.
4. Tests (no metered calls in unit — fake both arms); cross-provider verification;
   `disposition.json`; commit + push; `close_session`.

**Ends with:** push runs at strong adversarial framing by default, and a runner exists
that drives both surfaces over one committed state with provider+framing held equal;
session **VERIFIED**.
**Progress keys:** `steelman-push`, `dual-surface-runner`, `contractgate-seed-fix`, `s1-verified`.

### Session 2 of 3: Provenance merge + the fair-shake telemetry + mode wiring

**Steps:**
1. Register; read S1 deliverables + the Set 069 `replacement_gate` benchmark machinery.
2. Build the **provenance merge**: combine the two arms' findings into one artifact
   where each finding is labeled `push-only` / `pull-only` / `both`. Dedup must
   **preserve attribution** (the Set 069 S6 lesson: a free-text description is not an
   identity — match on a stable defect key, not loose wording). Define the
   comparison artifact schema + a pure-Python validator (L-066-1 parity).
3. Build the **scoring**: derive the push-unique / pull-unique / shared **high-severity
   tallies**; over the Set 069 seeded + holdout benchmark (ground-truth labels) derive
   the honest RETIRE metric (never hand-asserted; underpowered -> inconclusive). Tag
   each run **sampled** (telemetry) vs **opt-in** (operational); never pool them.
4. Wire the **dual-surface verification mode** as a `verificationMode`-pattern option
   (durable `activity-log.json` record; random-sample hook + operator/orchestrator
   opt-in; CLI `python -m ai_router.dual_surface_verify`).
5. Tests; cross-provider verification; `disposition.json`; commit + push; `close_session`.

**Ends with:** a provenance-tagged comparison artifact + an honest push-unique-vs-
pull-unique scoreboard over the benchmark, behind a recorded mode; session **VERIFIED**.
**Progress keys:** `provenance-merge`, `fair-shake-telemetry`, `dual-surface-mode`, `s2-verified`.

### Session 3 of 3: Synthesis + docs + release + dogfood + close

**Steps:**
1. Register; read S1–S2 deliverables.
2. Update `docs/verification-surface-strategy.md` (§5.1: the mode + steelman-push are
   now BUILT; record the first benchmark telemetry datapoint and whether it is
   powered enough to say anything yet) + `ai_router/docs/pull-verifier.md`; promote a
   lesson if warranted.
3. Finalize tests; bump `ai_router` (minor); ship the **PyPI release** per the publish
   runbook (green-`Test`-on-the-tagged-SHA; verify tag commit == fixed SHA — Set 068
   lesson; operator pushes/approves the tag). Record the publish run id post-release.
4. `change-log.md`; route the next-session-set recommendation (candidate: the
   consumer-repo field pilot on a complex modernization project); cross-provider
   verification; **dogfood** (`pathAwareCritique: required`; `contractGate: advisory`)
   — and **dogfood the new mode itself** (run the dual-surface mode over this set's own
   diff and record the provenance-tagged comparison); `close_session`; set closes.

**Creates:** the synthesis update, `change-log.md`, this set's dogfood + dual-surface
comparison artifacts.
**Ends with:** push runs at its adversarial best, a measured head-to-head instrument
exists and has produced its first honest telemetry, `ai_router` released; set closed.
**Progress keys:** `synthesis-updated`, `released`, `change-log-written`, `dogfooded`, `s3-verified`.

---

## End-of-set deliverables

- The **steelman-push** upgrade (`verification.md` adversarial framing + framing-pin
  test) + the `start_session` contractGate-seed fix (S1).
- `ai_router/dual_surface_verify.py` — the two-arm runner (S1), the **provenance
  merge** + comparison artifact + validator (S2), and the **fair-shake scoring** over
  the Set 069 benchmark (S2).
- The **dual-surface verification mode** wired as a recorded `verificationMode`-pattern
  option with sampled-vs-opt-in triggers (S2).
- The synthesis update, an `ai_router` **PyPI release**, this set's dogfood +
  dual-surface comparison artifacts, and `change-log.md` (S3).

A push surface measured at its adversarial best, a head-to-head dual-surface
instrument that records which surface uniquely catches which high-severity defect, and
the first honest telemetry toward the RETIRE decision — so the keep/demote/retire
question is settled on evidence, not on a hobbled measurement.
