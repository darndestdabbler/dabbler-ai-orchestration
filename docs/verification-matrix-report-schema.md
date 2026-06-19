# `verification-matrix-report.json` schema

> **What this is.** The machine-readable, *experimental* per-cell record of
> one **verification-only matrix run** (Set 072) — the apparatus pointed at an
> **already-built external target repo** that runs a configured **provider ×
> surface matrix** and stamps, per cell, every confound the run varied **and**
> the ones it held constant. One file per run, written by
> `ai_router.verification_only_app.run_verification_matrix` /
> `write_reports`.
>
> **Two outputs, one run.** This report is the *experimental* half (per-cell
> telemetry, for measuring how verification provider interacts with
> verification surface). The *fixer-facing* half is the consolidated
> [`remediation-report.{json,md}`](remediation-report-schema.md) — the
> deliverable a target repo remediates from. Do not confuse the two.
>
> **Runtime validator.** The pure-Python
> `ai_router.verification_only_app.validate_matrix_report` is the runtime
> contract; it **never raises** and is held in produce↔validate parity with
> the writer (L-066-1). `test_verification_only_app.py` round-trips what the
> writer emits through the validator. If this doc and the validator disagree,
> the validator wins — update this doc.
>
> **Locked by** Set 072
> (`docs/session-sets/072-verification-tuning/`).

---

## Why this exists

Set 070 built the dual-surface instrument to **hold provider equal across
arms** — by design, to isolate *surface* as the only variable. An independent
field study (`../kick-the-orchestrator-tires/docs/study-findings.md`) found
the one thing that design cannot measure: **provider and surface interact**.
The verification-only matrix mode adds the **opt-in matrix seam** that lets
provider diverge per arm (Set 072 S1), points it at a real built target, and
records the result here so the interaction can be measured on **real diffs**,
not synthetic toy diffs — while every not-yet-varied confound (orchestrator
provider/model; a future push/pull broker) is **stamped now** so later data
stays comparable.

A matrix run is a **per-cell instrument, never RETIRE telemetry** — surface is
no longer the only variable. The dual-surface scorer
(`_arms_held_equal`) rejects any matrix artifact as RETIRE evidence by
construction (Set 072 S1); this report does not carry, and must not be read
as, a keep/demote/retire signal.

---

## Top-level envelope

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | Currently `1` (`MATRIX_REPORT_SCHEMA_VERSIONS`). Strict integer — a bool/float is rejected (L-066-1). |
| `kind` | string | Fixed `"verification_matrix_report"`. |
| `target` | string | The built target repo's name (non-empty). The validator's optional `expected_target` guards a copied/stale report. |
| `committedRef` | string | The diff range under verification, e.g. `"HEAD~1..WORKTREE"` (honest WORKTREE labeling when `head` is empty). |
| `generatedAt` | string | ISO-8601 timestamp (caller-stamped — the producer is pure/deterministic). |
| `orchestrator` | object | `{ "provider": string, "model": string }` — the run's orchestrator (a stamped confound this set holds constant). |
| `diffShape` | object | The committed diff's size/shape, measured **once** per run (shared by all cells). See below. |
| `cells` | array | One entry per provider×surface cell. See below. |
| `skipped` | array | *Optional.* Cells whose dual-surface run raised — recorded, never silently dropped. See below. |

### `diffShape`

| Field | Type | Notes |
|---|---|---|
| `bytes` | integer ≥ 0 | Size of the unified-diff snippet the push arm reviewed. |
| `lines` | integer ≥ 0 | Newline count of that snippet. |
| `files` | integer ≥ 0 | Count of `diff --git ` markers (changed files). |
| `elided` | boolean | True when the diff dispatch elided over-cap output. |

The shape is measured by the **same** `_dispatch_get_diff` the push arm uses,
so it describes exactly the snippet that was reviewed. (The study's #1 caveat
— push wins only on small snippet-fittable diffs and would likely flip toward
pull on a large diff — is closed *for free* on a real built target, whose
cross-file diffs are large; `diffShape` is the per-run record of that size.)

### `cells[]`

Each cell is one matrix-mode `run_dual_surface` call (one push provider × one
pull provider over the same committed state).

| Field | Type | Notes |
|---|---|---|
| `telemetry` | object | Every confound, stamped. See below. |
| `pushVerdict` | string | The push arm's verdict (`VERIFIED` / `ISSUES_FOUND`). |
| `pullVerdict` | string | The pull arm's verdict (or `NO_VERDICT`). |
| `pullOk` | boolean | Whether the pull arm returned a schema-valid verdict from a run that actually probed. |
| `provenanceComplete` | boolean | The per-cell merge's completeness (False when an unkeyed finding is present). |
| `pushUnkeyed` / `pullUnkeyed` | integer ≥ 0 | Per-surface count of findings that carried no stable `defectKey` (un-mergeable; safe over-split). |
| `findings` | array | The per-cell provenance-merged findings (the dual-surface `MergedFinding` shape; see *Finding shape* below). |

### `cells[].telemetry`

| Field | Type | Notes |
|---|---|---|
| `orchestratorProvider` / `orchestratorModel` | string | The run's orchestrator (held constant; stamped for later comparability). |
| `pushProvider` / `pushModel` | string | The push arm's **measured** identity (read from the run attestation). |
| `pullProvider` / `pullModel` | string | The pull arm's **measured** identity. |
| `pushFraming` / `pullFraming` | string | Each arm's framing strength (e.g. `adversarial-devils-advocate`). The matrix varies *provider*, **never** framing — both arms stay strong adversarial (L-069-2). |
| `surfaces` | array | Exactly `["push", "pull"]` — a cell is definitionally a dual-surface run, so it always ran both surfaces (the validator rejects a missing/duplicated surface). |
| `diffBytes` / `diffLines` / `diffFiles` | integer ≥ 0 | The shared diff size/shape (echoed into every cell so a cell row is self-describing). **Must equal** the run-level `diffShape` — the validator enforces this cross-field consistency so the deliberate duplication cannot drift. |
| `diffElided` | boolean | Whether the diff was elided. Must equal `diffShape.elided`. |
| `pushBroker` / `pullBroker` | string | `"none"` — a future push/pull broker is a confound this set does not vary yet; recorded literally so it is self-describing, not silently absent. |

> **Cross-field consistency (validated).** Each cell echoes the run-level
> confounds (`orchestratorProvider`/`orchestratorModel`, `diffBytes`/`diffLines`/
> `diffFiles`/`diffElided`). The producer copies the **one** run-level
> `orchestrator` and `diffShape` into every cell (one dual-surface run over one
> shared diff), and `validate_matrix_report` **enforces** that each cell's echoed
> values match the run-level `orchestrator` / `diffShape` — a cell that disagrees
> is incoherent telemetry (the Set-070 surfaces-consistency precedent applied to
> the duplicated confounds). A cell's `provenanceComplete` is likewise checked
> against its own findings + unkeyed counts (the same one-way checks the
> dual-surface comparison validator applies).

### `skipped[]` (optional)

| Field | Type | Notes |
|---|---|---|
| `pushProvider` / `pullProvider` | string | The cell that failed (non-empty). |
| `reason` | string | The exception type + message (non-empty). One cell's failure never aborts the matrix (L-067-1 producer-skip discipline). |

---

## Finding shape (per cell)

Cell `findings[]` use the dual-surface **`MergedFinding`** shape — the same
shape `validate_comparison_artifact` checks — so the provenance invariants are
enforced by the **shared** validator
(`ai_router.dual_surface_verify._validate_merged_finding`):

| Field | Type | Notes |
|---|---|---|
| `defectKey` | string | The operator/harness-assigned stable key; `""` when unkeyed (then always single-surface). |
| `provenance` | string | `push-only` / `pull-only` / `both`. A `both` finding **must** be keyed and its contributors **must** cover both surfaces. |
| `severity` | string | The most-severe contributing severity. |
| `category` | string | The first non-empty contributing category. |
| `surfaces` | array | The distinct surfaces that caught it (must match the contributors' distinct surfaces). |
| `contributors` | array | Per-arm `{ surface, description, severity?, category? }` — the verbatim per-arm wording, never discarded. |

---

## Relationship to the comparison artifact

`verification-matrix-report.json` is **not** a
[`dual-surface-comparison.json`](dual-surface-comparison.schema.json): the
comparison artifact is the equal-arms, RETIRE-evidence record of *one* run;
this report is the per-cell experimental record of a *matrix* of runs over an
external target. They share the `MergedFinding` finding shape (and its
validator) but are distinct envelopes with distinct `kind`s and distinct
validators.
