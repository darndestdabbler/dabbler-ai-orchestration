# Module-First Model & Manifest Compat Spec (Work Explorer redesign — Set A)

> **Purpose:** Lay the model/compat foundation for the Work Explorer
> module-first UX redesign: the **pseudo-module** semantics (never persist
> `module: default`; `Default`/`Unassigned` display rules; work never
> vanishes), the **visible-module computation** (declared + pseudo +
> undeclared-slug fallback), **reader/writer support for both
> empty-manifest shapes** (`modules: []` and bare `modules:` become VALID),
> the canonical always-present `docs/modules.yaml` **template shape**, the
> **legacy root-plan mapping**, and the **migration/compat behavior
> matrix**. This set changes NO rendering — the renderer switch is Set 092;
> everything here lands behind the existing render path, proven by
> byte-stable fixture assertions.
> **Created:** 2026-07-11
> **Session Set:** `docs/session-sets/091-module-first-model-and-manifest-compat/`
> **Prerequisite:** None (builds on Set 087 S1–S3 code, which shipped and
> remains live on master; Set 087 itself is retired/cancelled and cannot be
> a completable prerequisite)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # Model/reader/writer layer only; no UI surface changes in this set (renderer switch is Set 092). The one behavior change (empty manifests become valid) is fully test-pinned.
requiresE2E: false        # No user-visible behavior reachable through a UI entry point changes here; existing Layer 2/3 fixtures must stay byte-stable and that is asserted in-session.
pathAwareCritique: advisory  # The pseudo-module invariant (never persist `module: default`; fail-loud, never hide work) must stay consistent across fileSystem.ts, moduleAuthoring.ts, and the model layer that Sets 092/093 will consume.
```

> Rationale: `tier: full` — canonical repo. UAT/E2E `false` because this
> set is deliberately invisible: the redesign's rendering and interaction
> changes are quarantined into Sets 092–094 so their UAT walks review real
> surfaces, not model plumbing. `pathAwareCritique: advisory` mirrors the
> Set 087 posture — one invariant spans several files and two future sets.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

The design is **settled** and operator-confirmed. This spec implements
**Set A** of the amended decomposition in:

- [`docs/proposals/2026-07-11-work-explorer-module-first-ux/proposal.md`](../../proposals/2026-07-11-work-explorer-module-first-ux/proposal.md)
  — the proposal of record (D1–D6).
- [`docs/proposals/2026-07-11-work-explorer-module-first-ux/verdict.md`](../../proposals/2026-07-11-work-explorer-module-first-ux/verdict.md)
  — the operator-confirmed verdict: eight amendments + two adjudications +
  the four-set decomposition. **Amendments 2 and 3 are this set's scope.**

Key rulings this set implements verbatim:

- **Amendment 2 (pseudo-module):** never persist `module: default`. Sets
  authored under the pseudo-module carry NO `module:` field — exactly
  today's semantics, nothing to migrate. Display **`Default`** when it is
  the only module; **`Unassigned`** once real modules coexist. Unstamped
  sets STAY visible under the pseudo-module when modules are later
  declared. Sets stamped with UNDECLARED slugs surface as fallback groups
  plus a warning — fail loud, never hide work. A user-declared literal
  `default` slug is allowed, but the pseudo-module then always labels
  itself `Unassigned`.
- **Amendment 3 (reader/writer before template):** both `modules: []`
  (flow style) and a bare `modules:` (YAML null) must read as a VALID
  empty manifest (today both classify invalid/refused), and the Set 087 S3
  format-preserving appender must replace either empty form with the first
  block-style entry. The scaffolded template uses gpt-5-4's exact shape:
  header comments + commented example entries + `modules: []`. The
  template is **defined and tested here**; wiring it into scaffold /
  ensure-write triggers is Set 094 (adjudication A: explicit user action
  only, never activation).

### Hard constraint: no rendering change

The legacy flat dialect and the Set 087 multi-module dialect both keep
rendering exactly as they do today until Set 092 lands. The new model
functions are built, exported, and test-pinned but not yet consumed by the
renderer. Existing Layer 2/3 fixtures must remain byte-stable, asserted by
the suite.

### Non-goals (owned by sibling sets)

- Renderer switch, `Work Explorer` rename, diagnostics strip, manifest
  render guardrails — **Set 092**.
- Persistent `Plan` / `Session sets` nodes, row action strip, QuickPick
  retirement, `Assign legacy sets to module…` — **Set 093**.
- Getting Started shrink, create-on-demand ensure-writes, D6 decomposition
  prompt, parallel-UI shelving — **Set 094**.
- No Marketplace publish out of this set: **single release boundary after
  Set 094** (verdict) — a half-migrated UX is worse than either whole.

---

## Sessions

### Session 1 of 2: Empty-manifest validity, appender compat & canonical template

**Steps:**
1. Register (`start_session`); read this spec, the proposal, and the
   verdict (amendment 3 especially).
2. `classifyModulesManifest` (`src/utils/moduleAuthoring.ts` /
   `src/utils/fileSystem.ts`): introduce a **present-empty** outcome —
   `modules: []` and bare `modules:` both classify as a valid empty
   manifest. Genuinely malformed files keep the fail-loud
   `INVALID_MANIFEST_MESSAGE` abort. Every Set 087 S3 authoring flow
   (`copyPlanningPrompt`, `importPlanFromFile`, `copySessionSetGenPrompt`,
   `scaffoldNewModule`) treats present-empty exactly like absent: single
   pseudo-module, no QuickPick, no `module:` stamp.
3. Appender: the format-preserving append replaces EITHER empty form with
   the first block-style entry (the parse-after-append refusal guard stays;
   it must now pass on the empty→first-entry transition it previously
   refused).
4. Author the canonical always-present template as an exported constant
   (or bundled template file): Set 087 header comments + commented-out
   example module entries + `modules: []`, per the verdict's adopted shape.
   Round-trip test: the template classifies present-empty AND the appender
   extends it into a valid one-module manifest.
5. Tests: classification matrix (absent / invalid / empty-flow /
   empty-null / populated) × (classify / append / each authoring-flow
   behavior); template round-trip; existing invalid-manifest abort paths
   unchanged.
6. Build + full suite; verify (mandatory, routed cross-provider); author
   `disposition.json`; commit + push; `close_session`.

**Creates:** the canonical modules.yaml template constant/asset; the
classification/append test matrix.
**Touches:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts`,
`src/utils/fileSystem.ts`, the S3 authoring-flow call sites, extension
test suite.
**Ends with:** both empty-manifest shapes read as valid (pseudo-module
behavior identical to absent), the appender grows an empty manifest into
its first block-style entry, the canonical template round-trips, malformed
files still abort loud; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** present-empty-valid, appender-empty-transition,
canonical-template-roundtrip, authoring-flows-empty-parity, suite-green

---

### Session 2 of 2: Pseudo-module semantics, visible-module computation & compat matrix

**Steps:**
1. Register; read this spec, Session 1's outcome, and verdict amendment 2
   + the Q8 discussion in both consensus files.
2. Visible-module computation (model layer, e.g. `SessionSetsModel.ts` /
   `fileSystem.ts`): a pure, test-pinned function producing the ordered
   module list the Set 092 renderer will consume — declared modules in
   manifest order, then undeclared-slug **fallback groups** (one per
   undeclared slug, warning-flagged, never hidden), then the
   **pseudo-module** holding unstamped sets. Display-name rule: `Default`
   when the pseudo-module is the only module; `Unassigned` whenever real
   modules coexist OR a literal `default` slug is declared.
3. Never-persist guard: audit every writer path (decomposition stamp, the
   `{{MODULE_LINE}}` template token, future assign flow) and pin with a
   test that no path can write `module: default`; the reader treats a
   hand-written `module: default` as an undeclared slug unless the operator
   actually declared one (fallback-group semantics, warning included).
4. Legacy root-plan mapping: the repo-level
   `docs/planning/project-plan.md` resolves as the pseudo-module's plan
   (the default `planPath` for the pseudo-module), so Set 093's `Plan`
   node state and Set 094's form semantics inherit one rule.
5. Author the migration/compat behavior matrix at
   `docs/planning/work-explorer-compat-matrix.md`: first-open-after-upgrade
   behavior for every current repo state (no manifest / empty manifest /
   populated manifest / module-stamped sets / unstamped sets / undeclared
   slugs / literal-`default` slug), each row naming the test that pins it.
   Sets 092–094 consume this matrix as their compat test checklist.
6. Byte-stability assertion: existing Layer 2/Layer 3 fixtures render
   unchanged (the new model functions are exported, not yet consumed).
7. Build + full suite; verify (mandatory); author `disposition.json`;
   commit + push; `close_session`; end-of-set `change-log.md`; Step 9
   review; the armed advisory path-aware critique before the set-terminal
   close.

**Creates:** the visible-module computation + tests;
`docs/planning/work-explorer-compat-matrix.md`; `change-log.md`.
**Touches:** `src/providers/SessionSetsModel.ts`, `src/utils/fileSystem.ts`,
`src/utils/moduleAuthoring.ts`, extension test suite.
**Ends with:** the visible-module list (declared → fallback → pseudo) is a
pure test-pinned function with the `Default`/`Unassigned` naming rule and
the never-persist guard proven; the compat matrix is authored with each row
test-cited; rendering byte-stable; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** visible-module-computation, default-unassigned-naming,
never-persist-default-guard, legacy-root-plan-mapping,
compat-matrix-authored, rendering-byte-stable, set-closed

---

## End-of-set deliverables

- Present-empty manifest validity (`modules: []` + bare `modules:`) with
  the appender's empty→first-entry transition, test-pinned.
- The canonical always-present modules.yaml template (header comments +
  commented examples + `modules: []`), round-trip tested, ready for Set
  094's ensure-write wiring.
- Pseudo-module semantics: `Default`/`Unassigned` naming, never-persist
  guard, undeclared-slug fallback groups, unstamped-set preservation.
- The visible-module computation the Set 092 renderer consumes.
- Legacy root-plan mapping.
- `docs/planning/work-explorer-compat-matrix.md` (the Q8 matrix).
- `change-log.md` + standard per-session artifacts.

> **Follow-on re-attach point (verdict):** the module **locator/scope-check
> set** (the follow-on Set 087's spec called "088": shared TS+Python
> locator API, `codeRoots` scope check warn→block, bare-number ambiguity
> errors, plus the symlink-hardening residual deferred from 087 S3) is
> authored **after this set closes** — under the next free number at that
> time, not the literal 088, which was consumed by an unrelated set.
