# `ai_router/budget.yaml` schema

> **This is the canonical contract home for `ai_router/budget.yaml`** —
> the per-project verification-budget file on Full-adoption projects.
> Created in Set 063 when the conversational adoption-bootstrap flow
> (the file's previous writer and the previous home of this schema)
> was retired. The shape documented here is the **post-migration**
> shape: it is exactly what `python -m ai_router.migrate_router_config`
> emits and what the visual config editor validates. Legacy
> (pre-migration) files keep working via the compatibility rules at
> the end of this doc.

---

## Canonical shape

```yaml
# Project verification budget.
# Read procedurally by the session orchestrator (workflow doc Step 6) to
# pick the verification path. No ai_router code parses it at runtime
# today; automated threshold monitoring / pre-call warnings are planned
# future work.

threshold_usd: 25                # required; number >= 0
scope: "per-project"             # per-project | per-session-set | per-session
mode: "middle-tier"              # derived from threshold_usd (band table below)
verification_method: "api"       # api | manual-via-other-engine | skipped
verification_nte_usd: 25         # not-to-exceed ceiling for cumulative API
                                 # verification spend; defaults to threshold_usd
                                 # if absent
set_at: "2026-06-12T15:30:00-04:00"
set_by: "getting-started-form"
warn_at_percent: 80              # integer 0-100
notes: |
  Optional human-supplied notes on rationale or constraints.
```

## Field reference

- **`threshold_usd`** *(required)* — the dollar threshold the operator
  set. `0` declares the **zero-budget tier**; any value `> 0` is a
  non-zero budget whose verification path is `api` (see
  [`docs/ai-led-session-workflow.md` → Cost-budgeted verification
  modes](ai-led-session-workflow.md#cost-budgeted-verification-modes)).
- **`scope`** — what window the threshold applies to: `per-project`
  (cumulative over the life of the project — the default),
  `per-session-set`, or `per-session`. A legacy `monthly` recurrence is
  expressed post-migration as `scope: "per-project"` plus
  `period: "monthly"` (the optional `period` key exists only for that
  migrated case).
- **`mode`** — derived from `threshold_usd`; stable band names for
  schema backward compatibility (all non-zero modes share the same
  `api` verification path):

  | `threshold_usd` | `mode` value |
  |---|---|
  | `0` | `zero-budget` |
  | `> 0` and `< 20` | `limited-budget` |
  | `20`–`99` | `middle-tier` |
  | `100+` | `ample-budget` |

- **`verification_method`** — `api` (normal routed cross-provider
  verification, the only valid choice when `threshold_usd > 0`),
  `manual-via-other-engine` (zero-budget option a), or `skipped`
  (zero-budget option b). On a `$0` budget the method is the
  **operator's pick** — there is no silent default; the Getting
  Started form requires an explicit choice before it will scaffold.
- **`verification_nte_usd`** — the operator's stated not-to-exceed
  ceiling for cumulative API verification spend. Defaults to
  `threshold_usd` when absent; the Getting Started form writes it
  explicitly so no reader needs the default. The orchestrator reports
  running spend against this ceiling at every session stop; if the
  ceiling is reached mid-session, verification switches to
  `manual-via-other-engine` for that session rather than failing.
- **`set_at`** — ISO-8601 timestamp (local time with offset) of when
  the budget was set.
- **`set_by`** — who/what set it. `"getting-started-form"` when written
  by the extension's Getting Started form (0.32.0+);
  `"adoption-bootstrap-flow"` appears in files written by the retired
  conversational flow; hand edits can use any identifying string.
- **`warn_at_percent`** — integer 0–100; the spend percentage at which
  warning surfaces should fire. The migrator injects `80` when absent.
- **`notes`** — free-form text, optional. The Getting Started form does
  not collect it; hand-edit anytime.

## Writers

- **The Getting Started form's budget step** (VS Code extension
  0.32.0+) is the standard writer: a required
  budget/NTE input in the Build-project-structure step, written at
  scaffold time. It **never clobbers** an existing
  `ai_router/budget.yaml` (skip + report). The pure-TS writer lives at
  [`tools/dabbler-ai-orchestration/src/utils/budgetYaml.ts`](../tools/dabbler-ai-orchestration/src/utils/budgetYaml.ts)
  and emits exactly the canonical shape above (minus `notes`).
- **Hand authoring** is fully supported — the file is plain YAML and
  the operator can create or edit it anytime (the visual config
  editor's Budget section is the recommended editing surface).
- The retired **adoption-bootstrap chat flow** (extension ≤ 0.31.0)
  wrote the pre-migration shape; see the compatibility rules below.

## Readers

- **The visual config editor**
  ([`tools/dabbler-ai-orchestration/src/configEditor/schemaValidator.ts`](../tools/dabbler-ai-orchestration/src/configEditor/schemaValidator.ts),
  `BUDGET_SCHEMA`) — requires `threshold_usd`; validates `scope`,
  `warn_at_percent`, `verification_method`, `verification_nte_usd`,
  `mode`. The schema is **open**: legacy fields (`set_at`, `set_by`,
  `notes`, a stray `threshold_scope`) coexist without failing
  validation.
- **The session orchestrator (AI)** reads the file procedurally at
  Step 6 of
  [`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md) to
  decide which verification path the session uses.
- **No `ai_router` Python code parses the file at runtime** today —
  `disposition.py` references it in docstrings only. Automated
  threshold-aware enforcement remains a planned follow-up.

## Migration

`python -m ai_router.migrate_router_config` upgrades pre-migration
files in place (idempotent, comment-preserving). A file in the
canonical shape above is a **no-op** under the migrator.

## Legacy compatibility rules

Older or hand-authored files may use the pre-migration vocabulary or
omit fields added later. Readers (current and future enforcement code)
must apply these rules rather than erroring:

| Legacy condition | Read as | Provenance |
|---|---|---|
| `threshold_scope: "project-lifetime"` | `scope: "per-project"` | migrator `_SCOPE_MAP` ([`ai_router/migrate_router_config.py`](../ai_router/migrate_router_config.py), `_migrate_budget`) |
| `threshold_scope: "monthly"` | `scope: "per-project"` + `period: "monthly"` (with a deprecation warning) | migrator `_SCOPE_MAP` |
| `threshold_scope:` with a current `scope` value (`per-project` / `per-session-set` / `per-session`) | same value under `scope` | migrator `_SCOPE_MAP` pass-through |
| `verification_method` absent | `api` | compatibility rule in [`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md#cost-budgeted-verification-modes) (matches Rule 2's default) |
| both `scope` and `threshold_scope` absent | `per-project` | **derived** — the documented legacy default "absent `threshold_scope` → `project-lifetime`" composed with the migrator's `project-lifetime` → `per-project` mapping |
| `verification_nte_usd` absent | `threshold_usd` | documented default (this doc, field reference) |
| `warn_at_percent` absent | `80` | the migrator's injected default |

Unrecognized `threshold_scope` values are left as-is by the migrator
with a warning — surface those to the operator rather than guessing.
