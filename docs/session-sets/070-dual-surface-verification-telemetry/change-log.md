# Change Log — Set 070 (Dual-Surface Verification + Push Fair-Shake Telemetry)

> **What this set delivered.** The **push** (routed, snippet-fed) verification
> surface now gets a **fair shake** before any RETIRE decision, and the framework
> has the **systematic instrument** that turns keep/demote/retire from faith into
> measurement. Two honesty gaps the Set 065→069 program left: production push
> shipped at **weak** framing (weaker than the *moderate* Experiment A instrument
> that demoted it, weaker than its *strong* pull counterpart), so push had **never
> been measured at its adversarial best**; and nothing ran **both** surfaces
> head-to-head and recorded **which surface uniquely caught which high-severity
> defect** — the exact telemetry the strategy §5 RETIRE criterion needs. This set
> ships the **steelman-push upgrade** and the **dual-surface ("overdetermined")
> verification mode** that close both gaps. The **new dual-surface mode** is
> **additive**: absent a recorded `dualSurfaceMode` (default `off`), `route`,
> `pull_route`, and `produce_path_aware_critique` are byte-for-byte unchanged. (The
> standing per-session push verifier itself **does** change — `verification.md` now
> runs at strong adversarial framing; that is the steelman-push deliverable, by
> design, not an unintended behavioral drift.)
>
> **Design rationale / directive:**
> [`docs/verification-surface-strategy.md`](../../verification-surface-strategy.md)
> § 5.1–5.2 (operator directive, 2026-06-16) and **L-069-2**.
> **Release:** `ai_router` **0.24.0** — version bumped this session; the PyPI publish
> is **operator-gated** (post-close, on the tagged SHA per the runbook). No extension
> / Marketplace change (the Explorer/UI remains a non-goal).

---

## Session 1 of 3 — Steelman push + the dual-surface comparison core

**Status:** CLOSED, VERIFIED (gpt-5-4, 4-round devil's-advocate loop). No release.

### Shipped

- **Steelman push.** `ai_router/prompt-templates/verification.md` upgraded from
  *"evaluate objectively"* (weak) to the devil's-advocate framing pull already uses
  (*"assume the work is flawed and try to prove it; a rubber-stamp is a failure"*,
  strong, the same strength as `path-aware-critique.md`; L-069-2). **Preserves** the
  machine contract `build_verification_prompt` / `parse_verification_response` need
  (the `{original_task}` / `{task_type}` / `{original_response}` placeholders +
  the `VERIFIED` / `ISSUES FOUND` / `Issue N:` / Category / Severity grammar). New
  `test_verification_framing.py` pins the strong-framing phrases so a silent
  weakening trips a test.
- **The `contractGate`-seed fix** (the Set 069 S6 process gap). `start_session.py`
  gained `--contract-gate {none,advisory,required}` + `_capture_contract_gate`,
  mirroring `_capture_path_aware_critique` exactly (best-effort fail-open, delegating
  to the existing `contract_gate.resolve_and_record_contract_gate`), so the
  `contractGate` seed is now recorded durably at set start the same way
  `pathAwareCritique` is — closing the gap where the gate silently no-op'd. This
  set's own `contractGate: advisory` seed is now recorded.
- **`ai_router/dual_surface_verify.py` — the two-arm runner** (`run_dual_surface`).
  The **push** arm is snippet-fed single-shot over the committed diff (repo-blind,
  under `verification.md`); the **pull** arm is the `pull_route` repo-reading agentic
  loop (under `path-aware-critique.md`). Same committed state, **provider, model, and
  framing held equal across arms** (a steelman of each surface, isolating *surface*
  as the only variable). Equality is **measured** from each arm's actually-reported
  identity (`UnequalArmsError` on divergence), not assumed; framing is classified
  from each template's **single-source body** so interpolation cannot spoof markers
  and classify-vs-execute cannot drift (a new `template_text` seam in
  `pull_critique.py` renders the pull instruction from the same body it classifies).
  Both arms injectable → hermetic tests, no metered call at import. **No merge** (S2).

---

## Session 2 of 3 — Provenance merge + fair-shake telemetry + mode wiring

**Status:** CLOSED, VERIFIED (gpt-5-4 R1 → R3 PASS). No release.

### Shipped

- **The provenance merge** (`merge_findings` / `MergedFinding` / `MergeResult`).
  Two findings merge to `both` **only** when they share a non-empty explicit
  `defectKey`, **never** on free-text wording (the Set 069 S6 floor-ratchet lesson:
  a description is not an identity). The **safe direction** is enforced — an unkeyed
  defect both arms caught becomes two single-surface entries (conservative over-split
  that never *hides* a push-unique catch, which would bias RETIRE toward retiring
  push / "throwing out the baby"), and the result flags `provenanceComplete=false`
  with per-surface unkeyed counts. Intra-arm duplicate keys fold to one contributor
  set; severity = most-severe across contributors; both arms' wordings preserved.
- **The comparison artifact + validator + schema.** `build_comparison_artifact` /
  `validate_comparison_artifact` write + check `dual-surface-comparison.json`
  ([`docs/dual-surface-comparison.schema.json`](../../dual-surface-comparison.schema.json)
  + example). The pure-Python validator holds **L-066-1 parity** (closed top-level /
  contributor / merged-finding key sets, int-not-bool guards, typed optionals) **plus**
  the cross-field provenance invariants the schema cannot express (a `both` finding's
  contributors must cover both surfaces AND carry a `defectKey`; a push-only/pull-only's
  contributors are exactly that surface; `provenanceComplete=true` is inconsistent with
  any unkeyed finding OR a nonzero unkeyed count). The example validates under both
  `jsonschema` and the Python validator.
- **The fair-shake scoring.** `score_comparison` derives the push-unique / pull-unique
  / shared **high-severity** tally (an *upper bound* when provenance is incomplete);
  `score_against_benchmark` scores it over the Set 069 pre-registered seeded + holdout
  benchmark (ground truth = `defectKey` is a registered case) and is **honest under
  power** — underpowered **forces** `INCONCLUSIVE` even when `push_unique > 0`, unkeyed
  high-severity is excluded from the real tally, and **the gated push layer is never
  retired by this machinery** (the verdict is a recommendation toward the
  operator-confirmed decision). `aggregate_retire_telemetry` **refuses to pool**
  `sampled` (unbiased) with `opt-in` (operational) runs.
- **The dual-surface mode + CLI.** `dualSurfaceMode` (`off` / `sampled` / `opt-in`)
  follows the `verificationMode` / `pathAwareCritique` pattern: recorded **once at set
  start and immutable** in `activity-log.json` (a distinct entry kind). All readers
  **never raise** on a corrupt / malformed log. `should_run_dual_surface` takes an
  **injected** random draw (hermetic) — `off` never runs, `opt-in` only on explicit
  request, `sampled` fires below the sample rate (tagged `sampled`), while a deliberate
  opt-in under sampled mode is the operational `opt-in` tag (never folded into the
  unbiased telemetry). CLI:
  `python -m ai_router.dual_surface_verify record-mode | read-mode | score`.

> **Verification note (lesson refinement).** S2's Round-2 substantive re-verify was
> first launched with `max_tier=2` pinned, which dropped the verifier to a
> same-provider tier-2 model (an Anthropic `529`, and a broken cross-provider
> guarantee) — a **misapply of L-064-7**, which is for *wording-only* re-verifies. The
> re-run without the pin stayed on GPT-5.4. L-064-7 was sharpened with this symmetric
> failure mode.

---

## Session 3 of 3 — Synthesis + docs + release + dogfood + close

**Status:** VERIFIED; closing. **Release: `ai_router` 0.24.0 — version bumped this
session; the PyPI publish is operator-gated and runs post-close.**

### Shipped

- **Synthesis.** [`docs/verification-surface-strategy.md`](../../verification-surface-strategy.md)
  § 5.1 updated (the three forward commitments are now BUILT) + new **§ 5.2** records
  the steelman-push upgrade, the dual-surface instrument, the fair-shake scoring, the
  recorded mode, and **the honest telemetry status**; § 3's targeted-layer bullet notes
  the push template now runs at strong adversarial framing.
  [`ai_router/docs/pull-verifier.md`](../../../ai_router/docs/pull-verifier.md) gained a
  *What Set 070 added* section.
- **Lesson.** L-064-7 refined (the substantive-re-verify `max_tier` misapply above);
  no new lesson minted.
- **Release.** `ai_router` version bumped **0.23.0 → 0.24.0** (`pyproject.toml` +
  `ai_router/__init__.__version__`, which must agree). The PyPI publish is
  **operator-gated and runs post-close** per the runbook (green `Test` on the tagged
  SHA; tag commit verified == the fixed SHA, the Set 068 lesson; operator
  pushes/approves the tag, then the publish run id is recorded).
- **Dogfood** (`pathAwareCritique: required`; `contractGate: advisory`) — the end-of-set
  multi-provider path-aware critique over this set's own changes (its iterative rounds
  caught and drove three real fixes — see *Dogfood findings* below), **and the headline:
  the new dual-surface mode run over this set's own diff** (a recorded
  `dualSurfaceMode: opt-in` run; the provenance-tagged `dual-surface-comparison.json` is
  an end-to-end **mechanism demonstration** — arms held equal, merge + score produced a
  valid artifact — **not** a meaningful-findings datapoint, and explicitly not powered
  telemetry; see the *Dogfood-artifact caveat* below).

### Dogfood findings (the headline value: caught what per-session routed missed)

The end-of-set **path-aware critique** was run as an **iterative dogfood** (multi-provider,
each round over the then-current tree). It caught **three real defects the S2/S3
per-session routed verification missed** — each fixed with a regression, each fix driving
the next round, which is how a dogfood is supposed to behave. The committed
`path-aware-critique.json` is the **final round, run over the post-all-fixes tree** (the
gate artifact); `path-aware-critique-prefix-dogfood.json` preserves the first round (the
one that caught the equal-arms defect) as evidence. Every finding across the rounds is
adjudicated in this set's `disposition.json`. The three fixed defects:

1. **Equal-arms scoring guard (Major, fixed).** `score_comparison` /
   `score_against_benchmark` ignored the attestation, so an inspection-only
   (`require_equal=False`) artifact — explicitly *never RETIRE evidence* — could be
   scored as valid telemetry. Fixed: a `_arms_held_equal` guard gates both scorers.
   **A first version trusted the self-asserted `providerEqual`/`modelEqual`/
   `framingEqual`/`bothAdversarial` booleans; the R3 cross-provider verifier flagged
   that as still "assumed, not measured," so the final guard ignores those booleans
   and re-derives equality from the ACTUAL per-arm identities — it requires
   `pushProvider`/`pullProvider`, `pushModel`/`pullModel`, and each arm's
   `*Framing.strength`, then enforces `pushProvider == pullProvider`,
   `pushModel == pullModel`, and equal strong-adversarial framing** ("surface is the
   only variable"). `requestedProvider`/`requestedModel` are provenance-only and are
   **not** consulted by the scorer (the R4 verifier corrected an over-strict first
   version that required a match to the request string; the live runner still pins to
   the request at production time). Negative tests cover lying booleans, raw
   disagreement, missing fields, non-adversarial framing, and the request≠actual case.
2. **`surfaces`-consistency (Major, fixed).** `MergedFinding.surfaces` could emit a
   duplicate label (an intra-arm duplicate key), and the validator never enforced the
   `surfaces` summary against the load-bearing contributors. Fixed: the producer emits
   distinct surfaces; the validator + JSON Schema (`uniqueItems`) reject duplicate or
   contributor-inconsistent surfaces (+3 tests).
3. **Schema↔validator parity on the `provenanceComplete` invariant (Major, fixed).**
   The Python validator rejects `provenanceComplete=true` with a nonzero unkeyed count
   **or any unkeyed finding**, but the JSON Schema didn't, so a schema-only consumer
   accepted what the runtime rejected. Fixed: a top-level `if/then` encodes **both**
   halves — `pushUnkeyed=0` AND `pullUnkeyed=0` (`const`) **and** `findings` must not
   `contain` an item with `defectKey: ""` (`not`/`contains`, which JSON Schema *can*
   express across the array — an initial fix wrongly deferred this half as
   "runtime-only" until the R4 verifier corrected it). Description updated; +parity
   tests.

A fourth path-aware finding — that `record_dual_surface_mode` is mutable — was
adjudicated a **false positive**: `record_*` is the low-level always-append "sanctioned
writer"; immutability lives in `resolve_and_record_dual_surface_mode`, exactly the
established `path_aware_critique` / `verification_mode` sibling layering.

### Telemetry status (the honest number)

The instrument is **built and dogfooded**, but **no powered benchmark-scored datapoint
exists yet.** The dogfood is a single self-referential run with no ground-truth defect
labels, and the Set 069 seeded + holdout benchmark is not yet populated with
real-workload cases, so `score_against_benchmark` is `INCONCLUSIVE` (underpowered,
`real_cases = 0`) by construction. **Powered telemetry — the data the §5 RETIRE
decision actually reopens on — awaits the downstream consumer-repo field pilots** that
adopt 0.24.0 and accumulate sampled runs against a populated benchmark. RETIRE stays
closed; the §5 honesty caveats carry forward unchanged.

> **Dogfood-artifact caveat (honest read of `dual-surface-comparison.json`).** In the
> dogfood run, the **push** arm (gemini-2.5-pro, single-shot over the ~5.7k-line set
> diff) emitted a markdown-formatted response that `parse_verification_response`
> parsed into six findings with **empty structured severity** (the severities were in
> the prose body, not the expected `Severity:` lines). So the artifact's push entries
> are a **known-malformed parse**, the high-severity tally is `0`, and the merge
> over-split to single-surface entries (`provenanceComplete=false`). The artifact
> therefore demonstrates the dual-surface **mechanism** end-to-end but is **not clean
> defect evidence** — reinforcing why it is explicitly *not* powered telemetry.
> **Deferred residual (recorded, not fixed here):** a push-arm **parse-quality guard**
> (refuse/flag a comparison when the push arm parses into all-empty-severity findings
> or an un-parsed verdict, so a garbled push response is never silently canonized) is
> candidate hardening for the next set — scoped and recorded, not an oversight.

---

## End-of-set deliverables (all shipped)

| Deliverable | Where | Session |
|---|---|---|
| Steelman-push upgrade + framing-pin test | `ai_router/prompt-templates/verification.md`, `test_verification_framing.py` | S1 |
| `contractGate`-seed fix | `ai_router/start_session.py` | S1 |
| Two-arm dual-surface runner | `ai_router/dual_surface_verify.py` (`run_dual_surface`) | S1 |
| Provenance merge + comparison artifact + validator + schema | `ai_router/dual_surface_verify.py`, `docs/dual-surface-comparison.schema.json` | S2 |
| Fair-shake scoring (+ benchmark + telemetry aggregation) | `ai_router/dual_surface_verify.py` | S2 |
| `dualSurfaceMode` recorded option + CLI | `ai_router/dual_surface_verify.py` | S2 |
| Synthesis docs + lesson refinement | `docs/verification-surface-strategy.md` § 5.1–5.2, `ai_router/docs/pull-verifier.md`, `docs/planning/lessons-learned.md` | S3 |
| `ai_router` 0.24.0 version bump (PyPI publish operator-gated, post-close) | `pyproject.toml`, `ai_router/__init__.py` | S3 |
| Dogfood (path-aware critique + dual-surface mode over own diff) | `path-aware-critique.json`, `dual-surface-comparison.json` | S3 |

**Suite:** 2079 passed / 5 skipped (the 5 are the Set 069 S4 real-podman-on-Windows
by-design skips). Test growth across the set: S1 1988 → S2 2063 (+75) → S3 2079
(+16: 10 equal-arms-guard + 3 surfaces-consistency + 3 schema↔validator parity tests,
added as the S3 dogfood + cross-provider rounds hardened the scoring guard and the
schema↔validator parity).
