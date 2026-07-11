# Work Explorer Single-Dialect Renderer Spec (Work Explorer redesign — Set B)

> **Purpose:** Switch the Session Set Explorer to **one rendering
> dialect** — the WAI-ARIA multi-module tree — for every repo state,
> retiring the byte-identical legacy flat view (resolving the Set 087 S2
> ARIA deferral **by deletion**). Rename the display label to **Work
> Explorer** (view ID unchanged), render the sole pseudo-module as an
> **auto-expanded, visually de-emphasized `Default` header row**
> (adjudication B), surface undeclared-slug fallback groups and the
> duplicate-name error in the tree, and add the persistent fault-only
> **diagnostics strip** plus the modules.yaml render guardrails
> (pinned-node invalid state, last-known-good rendering). All Playwright
> pins, testids, fixtures, docs, and screenshots update **atomically** with
> the renderer switch (amendment 6).
> **Created:** 2026-07-11
> **Session Set:** `docs/session-sets/092-work-explorer-single-dialect-renderer/`
> **Prerequisite:** `091-module-first-model-and-manifest-compat` (complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested    # The primary Explorer surface changes for every repo state; arm the ad-hoc human walk (to the Set 078/087-S3 instruction bar) against the locally built VSIX.
requiresE2E: suggested    # Playwright Layer 3 pins the Explorer DOM; the renderer switch must land with its pins updated in the same session.
uatStyle: ad-hoc          # Non-web VS Code UI.
uatScope: per-session
pathAwareCritique: advisory  # The single-dialect switch spans model, host, webview client, fixtures, and Playwright — cross-surface consistency guard, warn-only.
prerequisites:
  - slug: 091-module-first-model-and-manifest-compat
    condition: complete
```

> Rationale: this is the highest-visibility set of the redesign — every
> repo, including manifest-less solo repos, renders differently after it.
> UAT/E2E `suggested` per the Set 087 precedent: the operator arms the
> gates against real UX scope at session start. **No Marketplace publish
> out of this set** — single release boundary after Set 094; UAT runs
> against the locally built, untracked VSIX.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

Implements **Set B** of the operator-confirmed verdict
([`verdict.md`](../../proposals/2026-07-11-work-explorer-module-first-ux/verdict.md);
proposal D3/D4 + amendments 2 (display), 5, 6, 8 + adjudication B):

- **One dialect always.** The legacy single-implicit flat rendering is
  deleted, not harmonized. Rendering `Default` as a real module node ends
  the byte-identical constraint (deliberate operator supersession of the
  Set 087 constraint).
- **Adjudication B:** the sole pseudo-module renders as an auto-expanded,
  visually MUTED header row — one code path, no mode switch; the wrapper
  tax is one row.
- **Amendment 6:** keep the contributed view ID (display label →
  **Work Explorer**), keep stable `data-testid` markers, auto-expand the
  sole pseudo-module, and update every Playwright pin/doc/screenshot in
  the same change as the renderer switch.
- **Amendment 5:** provider-key warnings, the Python probe, and
  workspace-initialization faults move to a persistent **System Status /
  diagnostics strip** above BOTH the form and the tree, visible only when
  a fault exists.
- **Amendment 8 (render half):** manifest validation diagnostics in the
  tree — pinned node/banner on invalid (never auto-overwrite the user's
  file) and last-known-good rendering so a bad paste cannot blank the
  explorer. (The D6 prompt-delivery half of amendment 8 is Set 094.)
- **Inherited 087 deferrals resolved here:** the legacy-dialect ARIA
  harmonization (resolved by deletion) and the `duplicateNameError`
  Explorer affordance (row badge/tooltip + at most one throttled
  notification) — the fail-loud tree surfacing of the Set 087 S1
  data-layer check.

### Non-goals (owned by sibling sets)

- Persistent `Plan` / `Session sets` child nodes and all row actions —
  **Set 093** (this set renders modules → status buckets → rows only).
- Getting Started form changes of any kind — **Set 094** (the form keeps
  rendering exactly as today under the strip).
- The compat matrix rows this set must pin are already enumerated in
  [`docs/planning/work-explorer-compat-matrix.md`](../../planning/work-explorer-compat-matrix.md)
  (Set 091 deliverable) — implement against it, do not re-derive it.

---

## Sessions

### Session 1 of 2: The renderer switch (one dialect, Work Explorer, atomic pins)

**Steps:**
1. Register; read this spec, the verdict, the compat matrix, and the Set
   087 S2 rendering architecture record
   (`087-…/s2-explorer-render-architecture.json`).
2. Host/model: the snapshot pipeline consumes Set 091's visible-module
   computation for EVERY repo state (`buildModules` always produces ≥1
   module: declared → undeclared-slug fallback groups → pseudo-module).
3. Webview client (`media/session-sets-tree/client.js`): delete the legacy
   flat dialect branch; the WAI-ARIA tree dialect renders always. The sole
   pseudo-module (`Default`) renders auto-expanded with a de-emphasized
   (muted) header style; `Unassigned` and fallback groups render with the
   Set 091 naming/warning semantics. Undeclared-slug fallback groups carry
   a visible warning affordance.
4. `duplicateNameError` tree affordance: flagged-winner row badge +
   tooltip, at most one throttled notification per refresh cycle
   (inherited 087 S1→S3 deferral, now in-scope by operator supersession).
5. Rename: `package.json` contributed view display label → **Work
   Explorer**; the view ID stays (saved layouts/settings survive). Sweep
   user-facing strings/docs that name "Session Set Explorer" (docs sweep
   may complete in Session 2 if large).
6. Atomically in this same session: stable `data-testid` markers on
   module/bucket/row nodes; update Layer 2 fixtures, Playwright Layer 3
   pins, and repo screenshots/docs that show the old flat view. ARIA:
   `aria-level`/roles conformant across the now-single dialect.
7. Tests: every compat-matrix row that concerns rendering; fallback-group
   + warning; muted sole-`Default` auto-expand; duplicate-name badge;
   Layer 3 smoke on the new DOM.
8. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   author `disposition.json`; commit + push; `close_session`.

**Creates:** the single-dialect renderer; updated Layer 2/3 fixtures and
pins; duplicate-name tree affordance.
**Touches:** `media/session-sets-tree/client.js`,
`src/providers/CustomSessionSetsView.ts`, `src/providers/SessionSetsModel.ts`,
`tools/dabbler-ai-orchestration/package.json`, Layer 2/3 test suites, docs
and screenshots naming the Explorer.
**Ends with:** one dialect renders every repo state per the compat matrix;
the sole `Default` module is auto-expanded and visually muted; the view is
labeled Work Explorer with its ID unchanged; duplicate names badge loud;
all pins/fixtures/docs updated in the same commit; suite green;
cross-provider VERIFIED (or Minor-only); pushed; `close_session` succeeded.
**Progress keys:** single-dialect-live, legacy-dialect-deleted,
work-explorer-rename, default-muted-autoexpand, fallback-groups-rendered,
duplicate-name-affordance, pins-updated-atomically, suite-green

---

### Session 2 of 2: Diagnostics strip + modules.yaml render guardrails

**Steps:**
1. Register; read this spec and Session 1's outcome.
2. Diagnostics strip: a persistent System Status strip rendered above both
   the Getting Started form and the tree, visible ONLY when a fault
   exists. Relocate the provider-key warnings, the Python probe result,
   and workspace-initialization faults into it (their current form-resident
   renderings are removed where they duplicate the strip; build-specific
   inputs stay in the form untouched — the form shrink itself is Set 094).
3. Manifest render guardrails: an invalid `docs/modules.yaml` pins a
   loud node/banner in the tree (naming the parse failure; NEVER
   auto-overwriting the file) while the explorer keeps rendering the
   **last-known-good** snapshot so a bad hand-edit cannot blank it.
   Absent/present-empty states render per the compat matrix (no fault).
4. Tests: strip hidden when healthy / visible per fault class;
   invalid-manifest pinned node + last-known-good retention (edit →
   invalidate → still renders + banner → fix → banner clears); Layer 3
   smoke for strip + invalid state.
5. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   author `disposition.json`; commit + push; `close_session`; end-of-set
   `change-log.md`; Step 9 review; the armed advisory path-aware critique
   before the set-terminal close.

**Creates:** the diagnostics strip; manifest guardrail rendering + tests;
`change-log.md`.
**Touches:** `media/session-sets-tree/client.js` (+ form HTML for the
strip mount), `src/providers/CustomSessionSetsView.ts`, watcher/refresh
plumbing for manifest invalidation, Layer 2/3 suites.
**Ends with:** faults surface in one persistent strip above both surfaces;
an invalid manifest is loud but never blanks the tree nor touches the
file; suite green; cross-provider VERIFIED (or Minor-only); pushed;
`close_session` succeeded; Step 9 + advisory critique recorded.
**Progress keys:** diagnostics-strip-live, faults-relocated,
invalid-manifest-pinned-node, last-known-good-render, suite-green,
set-closed

---

## End-of-set deliverables

- The single WAI-ARIA tree dialect for every repo state (legacy dialect
  deleted; 087 S2 ARIA deferral resolved by deletion).
- Work Explorer display rename, view ID stable.
- Auto-expanded, de-emphasized sole-`Default` rendering; `Unassigned` +
  undeclared-slug fallback groups with warnings; duplicate-name badge.
- Atomic Playwright/testid/fixture/docs/screenshot updates.
- The fault-only diagnostics strip (provider keys, Python probe,
  workspace-init faults).
- modules.yaml render guardrails: pinned invalid node + last-known-good.
- `change-log.md` + standard per-session artifacts.

> **Release boundary reminder:** no Marketplace publish until Set 094
> closes (operator-confirmed single boundary).
