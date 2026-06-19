# `remediation-backlog.{json,md}` schema

> **What this is.** The **end-of-exploration handoff** of a verification-only
> exploration (Set 072 S3) — a single, deduplicated, severity-ranked fix-list
> rolled up across **many** per-run [`remediation-report`](remediation-report-schema.md)s
> over **one** built target. Where a per-run remediation report consolidates the
> cells of *one* matrix run, the backlog consolidates *many runs* — different
> provider×surface configs, or the same config re-run as the target's diff
> evolves. One pair of files per aggregation (`remediation-backlog.json`
> machine-readable + `remediation-backlog.md` human-readable), written by
> `ai_router.verification_only_app.aggregate_remediation_reports` /
> `render_remediation_backlog_markdown` / `write_backlog`.
>
> **One target, by construction.** The aggregator **refuses** to roll up reports
> for more than one target (`MixedTargetError`) — a backlog is a single repo's
> fix-list; silently mixing two targets would hand a repo defects that are not in
> its own code.
>
> **Cross-config corroboration.** A finding surfaced by multiple runs dedups to
> one entry whose `corroboration` count (the number of distinct runs that caught
> it) is a confidence / priority signal a fixer reads **alongside** severity: a
> Major three independent provider×surface configs all flagged is a safer fix
> target than a Major one config flagged once.
>
> **Runtime validator.** The pure-Python
> `ai_router.verification_only_app.validate_remediation_backlog` is the runtime
> contract; it **never raises** and is held in produce↔validate parity with
> `aggregate_remediation_reports` (L-066-1). If this doc and the validator
> disagree, the validator wins — update this doc.
>
> **Locked by** Set 072
> (`docs/session-sets/072-verification-tuning/`).

---

## How the roll-up works

The aggregator re-runs the Set 070 **provenance merge**
(`merge_findings`) **per stable finding key**, across all of the input runs at
once:

- A **keyed** defect surfaced by several runs dedups to **one** backlog entry.
  Its `severity` is the **max** across every contributing run, its surfaces are
  the **union** of the surfaces that ever caught it (so a defect run A caught
  push-only and run B caught pull-only becomes a single `both` entry), and its
  `contributors` preserve every run's verbatim per-surface description.
- An **unkeyed** defect **never** merges across runs — it carries no stable
  identity to corroborate on, so each unkeyed finding stays its own single-run
  entry (the same safe over-split the per-run merge applies; the backlog's
  `provenanceComplete` is `false` whenever any unkeyed finding is present).

Each backlog finding is annotated with the **runs** that surfaced it and a
**corroboration** count (= the number of those distinct runs). Findings are
ordered by **descending severity** (primary), then **descending corroboration**
(secondary priority), stable within a tie.

---

## `remediation-backlog.json` envelope

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | Currently `1` (`REMEDIATION_BACKLOG_SCHEMA_VERSIONS`). Strict integer — a bool/float is rejected (L-066-1). |
| `kind` | string | Fixed `"remediation_backlog"`. |
| `target` | string | The single built target repo's name (non-empty). The aggregator rejects a mixed-target input set. |
| `generatedAt` | string | ISO-8601 timestamp of the aggregation (caller-stamped). |
| `runCount` | integer ≥ 0 | The number of per-run reports rolled up. Must equal `len(runs)` (the validator enforces this). |
| `runs` | array | The input runs rolled up, each a **run ref** (below). |
| `provenanceComplete` | boolean | True only when every consolidated finding carried a stable `defectKey` across all runs. When false, an unkeyed defect appears once per run that caught it (the unique view is an upper bound). |
| `pushUnkeyed` / `pullUnkeyed` | integer ≥ 0 | Count of unkeyed contributors per surface across all runs. Must be `0` when `provenanceComplete` is true (the validator enforces this consistency). |
| `findings` | array | The consolidated, **severity-then-corroboration-ranked** backlog findings (the `MergedFinding` shape + the backlog annotation, below). |

### run ref (`runs[]` and `findings[].runs[]`)

A compact, stable identity for one input run — the unit of corroboration.

| Field | Type | Notes |
|---|---|---|
| `index` | integer ≥ 0 | The run's position in the aggregation input set. |
| `committedRef` | string | The diff range that run's findings pertained to. |
| `generatedAt` | string | The per-run report's timestamp. |

### `findings[]` (the `MergedFinding` shape + backlog annotation)

The core is the **same** `MergedFinding` shape the per-run report and the
comparison artifact use, validated by the **same**
`ai_router.dual_surface_verify._validate_merged_finding` (so every provenance
invariant — a `both` finding must be keyed and cover both surfaces — holds
here too):

| Field | Type | Notes |
|---|---|---|
| `defectKey` | string | Stable key; `""` when unkeyed (then always single-surface, corroboration `1`). |
| `provenance` | string | `push-only` / `pull-only` / `both` — the **union** across all contributing runs. |
| `severity` | string | The **max** severity across all contributing runs (the primary ordering rank). |
| `category` | string | The first non-empty contributing category. |
| `surfaces` | array | The distinct surfaces that caught it across runs (matches the contributors' distinct surfaces). |
| `contributors` | array | Per-arm `{ surface, description, severity?, category? }` from **every** contributing run — no run's wording is discarded. |

The backlog adds two annotation fields on each finding:

| Field | Type | Notes |
|---|---|---|
| `corroboration` | integer ≥ 1 | The number of **distinct runs** that surfaced this finding — the cross-config confidence/priority signal. Must equal the number of distinct `runs` indices (DERIVED, not free; the validator enforces it). |
| `runs` | array | The **run refs** that surfaced this finding (non-empty). Their `index` values must be **distinct** and each must appear in the top-level `runs` roll-up — the validator rejects a duplicated or stray run ref, so the corroboration signal cannot be inflated. |

---

## `remediation-backlog.md`

The same content, rendered ASCII-only (project Code Style — the `.md` is
written utf-8 on disk but its content stays cp1252-safe) as a human-readable,
priority-ordered fix-list: a header (target, generated-at, runs aggregated,
provenance-complete status, finding count) then one `##` section per finding in
severity-then-corroboration order, each showing the severity, category,
provenance, **corroboration count**, defect key, surfaces, the runs that
surfaced it, and every contributor's verbatim description. When provenance is
incomplete the header carries an explicit NOTE so a reader is not misled into
reading the unique counts as a settled partition.
