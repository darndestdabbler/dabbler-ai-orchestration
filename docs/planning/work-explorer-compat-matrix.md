# Work Explorer migration/compat behavior matrix (Q8)

> **Purpose:** The first-open-after-upgrade behavior contract for every
> current repo state, adopted from the operator-confirmed verdict of the
> Work Explorer module-first UX panel (gpt-5-4's Q8 matrix; see
> [`docs/proposals/2026-07-11-work-explorer-module-first-ux/verdict.md`](../proposals/2026-07-11-work-explorer-module-first-ux/verdict.md)).
> Authored in Set 091 S2. **This is now the shipped-state contract** —
> Sets 092 (renderer), 093 (interaction model), and 094
> (onboarding/lifecycle) all landed against this matrix and ship together
> at the single 091–094 release boundary. Every row names the Set 091 test
> that pins its model-layer behavior; the renderer/interaction sets added
> their own row-level pins on top without changing the model semantics
> below.
>
> **Model source of truth:** `computeVisibleModules(classification,
> allSets, {legacyRootPlanExists})` in
> `tools/dabbler-ai-orchestration/src/providers/SessionSetsModel.ts`
> (exported and test-pinned in Set 091; consumed by the renderer from Set
> 092). Routed rulings saved raw at
> `docs/session-sets/091-module-first-model-and-manifest-compat/s2-visible-module-architecture.json`
> and `...-2.json`; where the advisory ruling and the operator-confirmed
> Q8 matrix disagreed (pseudo-module presence on an otherwise-empty
> tree), the matrix won.

## The rules in one place

- **Pseudo-module presence:** the pseudo-module appears iff **unstamped
  sets exist** OR the **legacy root plan**
  (`docs/planning/project-plan.md`) **exists** OR **no other module group
  is visible** (an empty tree is never the answer).
- **Naming:** `Default` when the pseudo-module is the only visible
  module; `Unassigned` once any declared or fallback group coexists
  (fallback groups count). A user-declared literal `default` slug
  renders as a normal declared module and therefore always forces the
  pseudo-module to `Unassigned`.
- **Ordering:** declared modules in manifest order (including
  declared-but-empty ones), then fallback groups alphabetically by raw
  slug, then the pseudo-module last.
- **Never hide work:** sets stamped with slugs no usable manifest
  declares surface as warning-flagged **fallback groups**; unstamped
  sets stay in the pseudo-module forever.
- **Never persist `module: default`:** sets authored under the
  pseudo-module carry **no `module:` field**. `module: default` can only
  be written by picking an operator-declared literal `default` manifest
  entry.
- **Plans:** a declared module's `planPath` resolves through
  `modulePlanRelPath` (explicit value when safe, canonical default
  otherwise); a fallback group has none; the pseudo-module always
  carries `LEGACY_ROOT_PLAN_REL` (`docs/planning/project-plan.md`) —
  present/missing state is the consumer's separate check (Set 093).
- **No auto-writes:** nothing in this matrix ever writes a file
  (adjudication A: manifest creation happens on explicit user action
  only — Set 094).

## The matrix

All pinning tests live in
`tools/dabbler-ai-orchestration/src/test/suite/visibleModules.test.ts`
unless another file is named. Warning codes are the structured
`VisibleModuleWarning` values the Set 092 diagnostics strip renders.

| # | Repo state on first open after upgrade | Work Explorer behavior (model layer) | File writes | Pinning test |
|---|---|---|---|---|
| 1 | No manifest, no sets | Sole pseudo-module `Default`, empty, no warning (the create-manifest CTA is Set 094's affordance, not a fault) | None | `Q8 no-manifest-no-sets: sole pseudo Default, no warning, sets empty` |
| 2 | No manifest, unstamped sets | Sole pseudo-module `Default` holding the sets; `manifest-missing` warning | None | `Q8 no-manifest-unstamped-sets: sole pseudo Default with the sets + manifest-missing warning` |
| 3 | No manifest, module-stamped sets | Fallback groups by observed stamp slug (alphabetical, `undeclared-slug` warnings); pseudo-module `Unassigned` for any unstamped sets with `manifest-missing` warning; all-stamped repos show fallback groups only | None | `Q8 no-manifest-stamped-sets: fallback groups by observed slug + pseudo Unassigned for the unstamped, manifest-missing warning` and `Q8 no-manifest-all-stamped: fallback groups only, no pseudo row (nothing for it to hold)` |
| 4 | Empty manifest (`modules: []` or bare `modules:` — valid since Set 091 S1), no sets | Sole pseudo-module `Default`, no warning | None | `Q8 empty-manifest-no-sets: sole pseudo Default, NO warning (valid-empty is not a fault)` |
| 5 | Empty manifest, unstamped sets | Sole pseudo-module `Default` holding the sets, no warning | None | `Q8 empty-manifest-unstamped-sets: sole pseudo Default with the sets, NO warning` |
| 5a | Empty manifest, module-stamped sets only | Fallback groups by observed stamp slug (`undeclared-slug` warnings) only — **no** `manifest-missing` (a valid-empty manifest is not a fault) and no pseudo-module row (nothing for it to hold) | None | `Q8 empty-manifest-all-stamped: fallback groups only, no manifest-level warning (valid-empty is not a fault)` |
| 5b | Empty manifest, stamped plus unstamped sets | Fallback groups (`undeclared-slug` warnings) plus pseudo-module `Unassigned` holding the unstamped sets with the `unstamped-sets` warning; still no manifest-level warning | None | `Q8 empty-manifest-stamped-plus-unstamped: fallback groups + pseudo Unassigned with the unstamped-sets warning` |
| 6 | Populated manifest, matching stamped sets only | Declared modules in manifest order, each with its sets; no pseudo-module row | None | `Q8 populated-matching-only: declared modules in manifest order, no pseudo row` |
| 7 | Populated manifest, plus unstamped sets | Declared modules plus pseudo-module `Unassigned` holding the unstamped sets, `unstamped-sets` warning (the Set 093 `Assign legacy sets to module…` moment) | None | `Q8 populated-plus-unstamped: declared plus pseudo Unassigned carrying the unstamped-sets warning` |
| 8 | Populated manifest, sets stamped to undeclared slugs | Declared modules plus warning-flagged fallback groups (`undeclared-slug`), work never hidden | None | `Q8 populated-plus-undeclared-slugs: declared, then warning-flagged fallback groups, work never hidden` |
| 9 | Invalid manifest (present but unusable) | Fallback grouping from observed stamps (`undeclared-slug` warnings). The pseudo-module follows the **standard presence rule** — it appears (carrying the `manifest-invalid` warning) only when unstamped sets exist, the legacy plan exists, or no other group is visible: a set-less repo renders the sole `Default` pseudo-module (never a blank tree), while an invalid manifest over **fully stamped** sets shows fallback groups only, the manifest-level fault surfacing through the classification the Set 092 diagnostics strip renders | None — **never auto-overwrite an invalid manifest** | `Q8 invalid-manifest: fallback grouping from observed stamps + pseudo with the manifest-invalid warning`, `Q8 invalid-manifest-no-sets: sole pseudo Default still renders (never a blank tree), manifest-invalid warning`, and `Q8 invalid-manifest-all-stamped: fallback groups only, no pseudo row (manifest fault surfaces via the classification)` |

## Cross-cutting rows (beyond the verbatim Q8 table)

| Case | Behavior | Pinning test |
|---|---|---|
| Legacy root plan exists, every set stamped | Pseudo-module stays visible (empty, `Unassigned`) so the repo-level plan never vanishes (gpt-5-4 Critical #1). Its warning follows the standard precedence, independent of the legacy plan: **no warning under a usable manifest** (populated or valid-empty), but `manifest-missing` when the manifest is absent (and sets exist) and `manifest-invalid` when it is invalid — a legacy plan must never mask a manifest fault | `legacy root plan keeps the pseudo-module visible even when every set is stamped (gpt-5-4 Critical #1)` plus `legacy plan does not mask manifest faults: absent -> manifest-missing, invalid -> manifest-invalid on the legacy-kept pseudo row` |
| Declared module with zero sets | Visible with empty sets (Set 093 persistent `Plan`/`Session sets` children) | `declared-but-empty modules are visible with zero sets (Set 093 persistent-children contract)` |
| Only fallback groups coexist with the pseudo-module | Pseudo-module labels `Unassigned` (fallback groups count as coexisting) | `fallback groups count as coexisting modules for naming: pseudo labels Unassigned beside fallback-only groups` |
| Operator declares a literal `default` slug | Normal declared module; pseudo-module always `Unassigned` beside it | `a user-declared literal default slug is a normal declared module and forces the pseudo-module to Unassigned` |
| Hand-written `module: default`, no declared `default` slug | Undeclared-slug fallback group named `default` — never merged into the pseudo-module | `a hand-written module: default with NO declared default slug is an undeclared-slug fallback group, never merged into the pseudo-module` and the end-to-end reader test in the same suite |
| Ordering across all three kinds | Declared (manifest order) → fallback (alphabetical) → pseudo last | `ordering contract: declared (manifest order) then fallback (alphabetical) then pseudo last` |
| Pseudo-module plan mapping | Always `LEGACY_ROOT_PLAN_REL` regardless of file existence | `the pseudo-module always carries LEGACY_ROOT_PLAN_REL as planPath, whether or not the file exists (ruling Q7)` |
| Declared plan resolution | Explicit safe `planPath` kept; absent defaults; unsafe degrades to the default. Inside the **pure** `computeVisibleModules` the degradation is silent data (`resolveModulePlanRelPath`); the interactive flows' `modulePlanRelPath` wrapper carries the console warning | `declared modules resolve planPath purely: explicit value kept, absent defaults, unsafe degrades WITHOUT any console side effect` and `resolveModulePlanRelPath reports the degradation as data; the modulePlanRelPath wrapper still warns for the interactive flows` |
| Never-persist guard | Pseudo-module authoring writes no `module:` line on any writer path (`{{MODULE_LINE}}`, session-gen prompt, planning prompt, scaffold); only a picked manifest entry is ever stamped | the `Set 091 S2 — never-persist module: default guard` suite |
| Rendering path (shipped) | Set 092 switched the host/webview to render through `computeVisibleModules` / `buildVisibleModulePayloads` (the single dialect); the pre-092 `groupByModule`/`buildModulePayloads` path survives only as the test-only legacy producer. (Historically, Set 091 S2 shipped `computeVisibleModules` exported-but-unconsumed, pinned by the `Set 091 S2 — rendering byte-stability` suite.) | the Set 092 per-row rendering pins + the Layer 3 smoke (`session-sets-tree.spec.ts`) |

## How Sets 092–094 implemented this matrix (shipped)

- **Set 092 (renderer switch) — shipped.** The single dialect consumes
  `computeVisibleModules`; the diagnostics strip renders the `warning`
  codes; the sole pseudo-module auto-expands and is visually
  de-emphasized (adjudication B); the Playwright pins/testids/docs moved
  atomically; a per-row rendering pin covers each matrix row above.
  Manifest-level faults surface even when the pseudo-module is hidden
  (rows 3/9 all-stamped variants), derived from the manifest
  classification the renderer already holds — the module-level warning
  codes complement, never replace, that surface. The Set 091 S1
  adjudicated-minor residual (exotic empty-list serializations refuse
  loudly with a copyable entry block) shipped in this set's manifest
  guardrails.
- **Set 093 (interaction model) — shipped.** The pseudo-module's `Plan`
  node state derives from `planPath` + existence; `Assign legacy sets to
  module…` acts on row-7 state; the wizard flows' local
  `docs/planning/project-plan.md` literals unified onto
  `LEGACY_ROOT_PLAN_REL`.
- **Set 094 (onboarding/lifecycle) — shipped.** Ensure-writes are
  explicit-action only (adjudication A) across the five call sites
  (scaffold, form + toolbar Open modules.yaml, Add module, copy
  decomposition prompt); the always-present template
  (`MODULES_YAML_TEMPLATE`, Set 091 S1) classifies as row 4/5 state.
