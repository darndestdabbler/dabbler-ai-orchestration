# `remediation-report.{json,md}` schema

> **What this is.** The **fixer-facing**, consolidated output of one
> verification-only matrix run (Set 072) — the deliverable a built target repo
> **remediates from without re-running verification**. The verification the
> canonical apparatus runs during exploration *is* the verification; its
> findings must be usable for remediation directly. One pair of files per run
> (`remediation-report.json` machine-readable + `remediation-report.md`
> human-readable), written by
> `ai_router.verification_only_app.build_remediation_report` /
> `render_remediation_markdown` / `write_reports`.
>
> **Two outputs, one run.** This is the *fixer-facing, consolidated* half. The
> *experimental, per-cell* half is
> [`verification-matrix-report.json`](verification-matrix-report-schema.md).
> This report **drops** all experiment metadata (telemetry, provider, framing,
> diff shape) — a fixer needs the defects, not the study confounds.
>
> **Runtime validator.** The pure-Python
> `ai_router.verification_only_app.validate_remediation_report` is the runtime
> contract; it **never raises** and is held in produce↔validate parity with
> `build_remediation_report` (L-066-1). If this doc and the validator disagree,
> the validator wins — update this doc.
>
> **Locked by** Set 072
> (`docs/session-sets/072-verification-tuning/`).

---

## Why this exists

Pointing systematic provider×surface verification at a **real, already-built
solution** means every run does *useful* verification work as well as emitting
telemetry. For that work to be usable, the run must hand the target repo a
single, deduplicated, severity-ranked fix-list — not N per-cell experiment
records the target would have to reconcile itself. `remediation-report.json`
is that fix-list.

The consolidation runs the Set 070 **provenance merge**
(`merge_findings`) across **all** of the run's cells at once: a defect a cell
caught on **both** surfaces (keyed) becomes one `both` entry; the same keyed
defect surfaced by multiple cells dedups to one; an **unkeyed** defect both
surfaces caught stays safely **over-split** (two entries, `provenanceComplete:
false`) rather than silently collapsing two distinct defects. Findings are
then **severity-ranked** (Critical > Major > Minor > unspecified).

> **Consumer-handoff model.** Canonical runs the verification-only mode against
> a built target and emits this report; the target repo (e.g.
> `dabbler-access-harvester`) **consumes it for remediation and never re-runs
> verification**. Exploration produces usable findings, not just telemetry.

The **cross-run aggregator** (Set 072 S3) rolls *many* per-run remediation
reports over **one** target into a single
[`remediation-backlog.{json,md}`](remediation-backlog-schema.md), where a
finding surfaced by multiple provider×surface configs carries that
cross-config corroboration as a confidence/priority signal.

---

## `remediation-report.json` envelope

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | Currently `1` (`REMEDIATION_REPORT_SCHEMA_VERSIONS`). Strict integer — a bool/float is rejected (L-066-1). |
| `kind` | string | Fixed `"remediation_report"`. |
| `target` | string | The built target repo's name (non-empty). |
| `committedRef` | string | The diff range the findings pertain to. |
| `generatedAt` | string | ISO-8601 timestamp (caller-stamped). |
| `provenanceComplete` | boolean | True only when every consolidated finding carried a stable `defectKey`. When false, a defect both surfaces caught but neither keyed appears as two entries (the unique view is an upper bound, not a settled partition). |
| `pushUnkeyed` / `pullUnkeyed` | integer ≥ 0 | Count of findings per surface that carried no `defectKey` across the whole run. Must be `0` when `provenanceComplete` is true (the validator enforces this consistency). |
| `findings` | array | The consolidated, **severity-ranked** findings (the `MergedFinding` shape). |

### `findings[]` (the `MergedFinding` shape)

Shared with the comparison artifact and the matrix report, validated by the
**same** `ai_router.dual_surface_verify._validate_merged_finding`:

| Field | Type | Notes |
|---|---|---|
| `defectKey` | string | Stable key; `""` when unkeyed (then always single-surface). |
| `provenance` | string | `push-only` / `pull-only` / `both`. A `both` finding **must** be keyed and cover both surfaces. |
| `severity` | string | The most-severe contributing severity (the rank used for ordering). |
| `category` | string | The first non-empty contributing category. |
| `surfaces` | array | The distinct surfaces that caught it (matches the contributors' distinct surfaces). |
| `contributors` | array | Per-arm `{ surface, description, severity?, category? }`. **The file/location, impact, and evidence live in each contributor's verbatim `description`** — the merge never discards either arm's wording, so the fixer has the full per-surface account. |

Ordering: findings are sorted by **descending severity**, stable within a rank
(keyed-`both` first, then keyed single-surface, then unkeyed single-surface —
the `merge_findings` order, preserved within each severity band).

---

## `remediation-report.md`

The same content, rendered ASCII-only (project Code Style — the `.md` is
written utf-8 on disk but its content stays cp1252-safe) as a human-readable
fix-list: a header (target, committed ref, provenance-complete status, finding
count) then one `##` section per finding in severity order, each showing the
severity, category, provenance, defect key, surfaces, and every contributor's
verbatim description. When provenance is incomplete the header carries an
explicit NOTE so a reader is not misled into reading the unique counts as a
settled partition.
