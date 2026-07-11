# Change Log — Set 091: Module-First Model & Manifest Compat (Work Explorer redesign — Set A)

**Set:** `091-module-first-model-and-manifest-compat` · **Sessions:** 2 · **Tier:** Full
**Closed:** 2026-07-11 · **Verdict:** VERIFIED (S1: 5 rounds; S2: 5 rounds — details below)

## What this set did

Laid the model/compat foundation for the Work Explorer module-first UX
redesign (the operator-confirmed verdict's **Set A**, amendments 2 + 3),
deliberately changing **no rendering**: every new function is exported and
test-pinned but consumed by nothing until Set 092 — pinned by a
byte-stability suite plus the untouched Layer 2/3 fixtures.

### Session 1 — empty-manifest validity, appender compat & canonical template
- Both empty-manifest shapes — flow-style `modules: []` and a bare
  `modules:` (all YAML 1.2 core null spellings, quoted keys included) —
  now read as a **valid empty manifest** and behave exactly like an absent
  one across all four Set 087 S3 authoring flows (no QuickPick, no
  `module:` stamp, no notice). Malformed manifests keep the fail-loud
  abort.
- The format-preserving appender grows an empty manifest into its first
  block-style entry via guard-validated textual line replacement
  (root-indented forms, trailing comments, nested `modules:` keys
  handled).
- The canonical always-present template ships as `MODULES_YAML_TEMPLATE`
  (Set 087 header comments + commented examples + `modules: []`),
  round-trip tested; scaffold/ensure-write wiring stays Set 094.
- Adjudicated-minor residual (third-provider, gemini-pro): exotic
  empty-list serializations (multiline flow lists, tags, anchors)
  classify valid-empty but refuse loudly with the copyable entry block —
  deferred to the Set 092–094 manifest guardrails.

### Session 2 — pseudo-module semantics, visible-module computation & compat matrix
- **`computeVisibleModules`** (`src/providers/SessionSetsModel.ts`): the
  pure, exported, ordered module list the Set 092 renderer will consume —
  declared modules in manifest order (including declared-but-empty ones,
  for Set 093's persistent `Plan`/`Session sets` children), then one
  **fallback group** per undeclared stamped slug (alphabetical,
  `undeclared-slug`-warned, never hidden), then the **pseudo-module**
  holding unstamped sets. Attribution is re-derived from the raw
  `config.module` stamp against the manifest classification, so the
  function is total over its inputs (and correct under absent/invalid
  manifests, where the scanner stamps null).
- **Presence rule** (routed ruling Q2, amended by the operator-confirmed
  Q8 matrix, which outranks it): the pseudo-module appears iff unstamped
  sets exist OR the legacy root plan exists OR no other module group is
  visible — an empty tree is never the answer.
- **Naming rule**: `Default` when the pseudo-module is the sole visible
  module; `Unassigned` once any declared or fallback group coexists
  (fallback groups count). A user-declared literal `default` slug renders
  as a normal declared module and forces `Unassigned`.
- **Never-persist guard**: sets authored under the pseudo-module carry no
  `module:` field on any writer path (`{{MODULE_LINE}}` bootstrap render,
  session-gen prompt, planning prompt, scaffold), pinned with
  provenance-coupled integration tests (picker → writers); a hand-written
  `module: default` with no declared `default` slug reads as an
  undeclared-slug fallback group, never merged into the pseudo-module.
- **Legacy root-plan mapping**: `LEGACY_ROOT_PLAN_REL`
  (`docs/planning/project-plan.md`) is always the pseudo-module's
  `planPath`; existence is the consumer's separate present/missing check.
  Declared modules resolve plans through the new **pure**
  `resolveModulePlanRelPath` (unsafe values degrade silently as data; the
  interactive flows' `modulePlanRelPath` wrapper keeps the console
  warning — S2 verification R4).
- **`docs/planning/work-explorer-compat-matrix.md`**: the Q8
  first-open-after-upgrade behavior matrix (9 verbatim rows + 5a/5b
  empty-manifest×stamped rows + cross-cutting rows), every row citing its
  pinning test in `visibleModules.test.ts` by name — Sets 092–094 consume
  it as their compat test checklist.

## Verification

**S1:** 5 rounds (gpt-5-6, ~$0.74): R1–R3 Majors fixed in flight
(root-indentation, nested-key, null-spellings); R4 disputed →
third-provider adjudicated minor-residual (quoted-key hardening applied);
R5 **VERIFIED, zero findings**.

**S2:** 5 rounds (gpt-5-6, ~$0.81): R1 (matrix row-9 predicate; guard-test
strength) and R2 (empty-manifest×stamped rows; legacy-plan warning
precedence) fixed in flight with named pinning tests; R3 ("plan-import
frontmatter pin") **disputed** per the S1 calibration note (second fresh
same-class Major) → third-provider adjudication (gemini-pro,
`s2-third-opinion-plan-import-stamp.json`): **adjudicated-minor-residual,
dismissed as resolved** — plan prompts carry no spec frontmatter by
design; the implementable kernel (exact-string pins on the plan prompt's
full output surface) was applied before adjudication; R4 (purity —
`console.warn` inside the pure computation) fixed via the
resolver/wrapper split; R5 **VERIFIED, zero findings**.

> Suite at close: extension unit **1411 passing**, pytest **2922 passed /
> 6 skipped**, Playwright Layer 3 **20 passed** (run locally per
> L-064-12). No release out of this set — single release boundary after
> Set 094 (verdict).

## Follow-ons re-attached after this close (verdict)

- The module **locator/scope-check set** (shared TS+Python locator API,
  `codeRoots` scope-check warn→block, bare-number ambiguity errors,
  symlink-hardening residual) is authored next, under the next free set
  number.
- Sets 092 (renderer switch), 093 (interaction model), 094
  (onboarding/lifecycle) consume the compat matrix; the S1
  adjudicated-minor residual lands with 092's manifest guardrails.
