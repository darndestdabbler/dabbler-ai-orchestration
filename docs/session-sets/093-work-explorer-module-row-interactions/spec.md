# Work Explorer Module-Row Interactions Spec (Work Explorer redesign — Set C)

> **Purpose:** Make the tree carry the whole per-module workflow ("the
> tree is the checklist"): every module gains **persistent semantic child
> nodes** — **`Plan`** (present / missing) and **`Session sets`**
> (blocked-until-plan / empty / bucketed, with the status buckets nested
> UNDER it) — and a **module-row inline action strip** (hover/focus:
> `AI Plan`, `Import Plan`, `Open Plan`, `AI Sets`) mirrored in a context
> menu and the Command Palette. The module is implied by the row, so the
> click-path **module QuickPicks retire** (palette entry points keep
> them for keyboard-driven use), and `Unassigned` gains the
> **`Assign legacy sets to module…`** affordance so work never strands.
> **Created:** 2026-07-11
> **Session Set:** `docs/session-sets/093-work-explorer-module-row-interactions/`
> **Prerequisite:** `092-work-explorer-single-dialect-renderer` (complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested    # New interaction surface (row actions, child nodes, assign flow); arm the ad-hoc human walk (Set 078/087-S3 bar) against the locally built VSIX.
requiresE2E: suggested    # The tree DOM gains a level and action affordances; Playwright Layer 3 pins must move with it.
uatStyle: ad-hoc          # Non-web VS Code UI.
uatScope: per-session
pathAwareCritique: advisory  # Actions must resolve module targets identically across row strip, context menu, and palette — one targeting seam spanning webview client, protocol, host, and the S3 authoring flows.
prerequisites:
  - slug: 092-work-explorer-single-dialect-renderer
    condition: complete
```

> Rationale: UAT/E2E `suggested` per the Set 087 precedent — this is the
> operator's headline interaction change; keyboard operability of the
> action strip is an explicit verdict concern and belongs in the human
> walk. **No Marketplace publish out of this set** — single release
> boundary after Set 094.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

Implements **Set C** of the operator-confirmed verdict
([`verdict.md`](../../proposals/2026-07-11-work-explorer-module-first-ux/verdict.md);
proposal D3 + amendments 1, 2 (assign affordance), 4):

- **Amendment 1 — actions live on the module ROW, never as
  button-bearing tree nodes.** Both panel critics independently rejected
  action-subnode treeitems (nested interactive content breaks WAI-ARIA
  tree keyboard semantics). The row gets an inline action strip revealed
  on hover/focus, mirrored in a context menu and the Command Palette;
  child nodes stay purely semantic. This also honors the operator's
  dislike of far-away UI: actions sit ON the clicked row.
- **Amendment 4 — persistent child nodes; buckets nest, never replace.**
  Every module always shows `Plan` (present / missing) and `Session sets`
  (blocked-until-plan / empty / bucketed with the four status buckets
  nested under it). The checklist stays visible forever — the transient
  subnodes of the original sketch were declined because they'd vanish at
  the first set.
- **Amendment 2 (interaction half):** `Unassigned` carries an
  `Assign legacy sets to module…` affordance that stamps `module:` into
  chosen sets via the format-preserving writer. Fallback groups and
  unstamped sets never hide work.
- **QuickPick retirement (D3):** row/context/strip actions imply their
  module — no QuickPick. The Set 087 S3 QuickPick survives ONLY behind
  the Command Palette entry points (`dabbler.importPlan`,
  `dabbler.generateSessionSetPrompt`, `dabbler.newModule`), which remain
  for keyboard-driven use.

### Non-goals (owned by sibling sets)

- Getting Started form changes, create-on-demand modules.yaml, the D6
  decomposition prompt, toolbar `open modules.yaml` button — **Set 094**.
- The pseudo-module `Plan` state consumes Set 091's legacy root-plan
  mapping — do not invent a second rule.
- Physical set moves / locator API / scope checks — the deferred follow-on
  sets (see re-attach note at the end).

---

## Sessions

### Session 1 of 2: Persistent `Plan` / `Session sets` child nodes

**Steps:**
1. Register; read this spec, the verdict (amendment 4), the compat matrix,
   and Set 092's outcome.
2. Protocol/model: extend the module payload with the two child-node
   states — `plan: present | missing` (module `planPath` existence; the
   pseudo-module resolves via the Set 091 legacy root-plan mapping) and
   `sessionSets: blocked-until-plan | empty | bucketed` (buckets, when
   present, nest under the `Session sets` node).
3. Webview client: render the persistent children on every module —
   `aria-level` shifts to module 1 / Plan & Session sets 2 / bucket 3 /
   row 4; nodes are semantic treeitems only (state text/icon, no embedded
   controls); keyboard nav (arrow/expand/collapse) conformant.
4. Update Layer 2 fixtures + Playwright Layer 3 pins for the new level in
   the same session (amendment 6 discipline).
5. Tests: state matrix per compat-matrix row (no plan / plan no sets /
   plan + sets; pseudo-module root-plan resolution; fallback groups get
   children too or are exempt — follow the verdict's fail-loud posture and
   record the choice via routed `route(task_type="architecture")` if
   ambiguous); Layer 3 smoke on the four-level DOM.
6. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   author `disposition.json`; commit + push; `close_session`.

**Creates:** persistent child-node model + rendering + state tests.
**Touches:** `src/types/sessionSetsWebviewProtocol.ts`,
`src/providers/SessionSetsModel.ts`, `src/providers/CustomSessionSetsView.ts`,
`media/session-sets-tree/client.js`, Layer 2/3 suites.
**Ends with:** every module (including `Default`/`Unassigned`) always
shows `Plan` and `Session sets` with correct states; buckets nest under
`Session sets` and never replace the checklist; ARIA levels and keyboard
nav conformant; pins updated; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** child-nodes-persistent, plan-state-correct,
session-sets-states-correct, buckets-nested-not-replacing,
aria-keyboard-conformant, suite-green

---

### Session 2 of 2: Row action strip, QuickPick retirement & assign flow

**Steps:**
1. Register; read this spec, Session 1's outcome, and the Set 087 S3
   authoring-flow record (`087-…/s3-authoring-scaffold-architecture.json`).
2. Action strip: hover/focus-revealed inline actions on the module row —
   `AI Plan` (copy module-targeted planning prompt), `Import Plan`,
   `Open Plan`, `AI Sets` (copy module-targeted decomposition prompt) —
   implemented as row-level controls OUTSIDE the treeitem's accessible
   name (WAI-ARIA-safe), with full keyboard reachability.
3. Mirror the same actions in a right-click context menu on the module
   row and in the Command Palette. Row/context invocations carry the
   module — thread an explicit module target through the shared
   `pickModuleForAuthoring` seam so NO QuickPick and NO auto-select
   notice fires on these paths; the palette commands
   (`dabbler.importPlan`, `dabbler.generateSessionSetPrompt`,
   `dabbler.newModule`) keep today's QuickPick behavior.
4. `Assign legacy sets to module…` on `Unassigned`: pick target module +
   sets; stamp `module: <slug>` into each chosen set's `spec.md` via a
   format-preserving write (manifest-validated; never writes `default`;
   refusal leaves files untouched and reports, mirroring the S3 appender
   posture).
5. Tests: targeting parity (row vs context vs palette resolve identically);
   no-QuickPick assertion on row paths; assign-flow stamping matrix
   (single/multi set, refusal path, `Unassigned` disappears from a module
   only when emptied — work never vanishes); Layer 3 smoke for
   strip visibility on hover/focus.
6. Live dogfood against a scratch multi-module repo (the 087 S3 pattern):
   drive every strip action end-to-end.
7. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   author `disposition.json`; commit + push; `close_session`; end-of-set
   `change-log.md`; Step 9 review; the armed advisory path-aware critique
   before the set-terminal close.

**Creates:** the action strip + context/palette mirror; the assign-legacy
flow; targeting-parity tests; `change-log.md`.
**Touches:** `media/session-sets-tree/client.js`,
`src/providers/CustomSessionSetsView.ts`, `src/utils/moduleAuthoring.ts`,
`src/wizard/sessionGenPrompt.ts`, `src/wizard/planImport.ts`,
`src/commands/newModule.ts`, `tools/dabbler-ai-orchestration/package.json`
(menus/commands), test suites.
**Ends with:** every per-module action is reachable on the row it applies
to (mouse and keyboard) with no QuickPick on click paths; palette paths
unchanged; legacy sets are assignable to modules without hand-editing;
suite green; dogfood 100% pass; cross-provider VERIFIED (or Minor-only);
pushed; `close_session` succeeded; Step 9 + advisory critique recorded.
**Progress keys:** row-action-strip, context-palette-mirror,
clickpath-quickpicks-retired, assign-legacy-flow, dogfood-pass,
suite-green, set-closed

---

## End-of-set deliverables

- Persistent `Plan` / `Session sets` child nodes with the verdict's state
  model, buckets nested under `Session sets`.
- Module-row inline action strip + context menu + Command Palette mirror;
  WAI-ARIA tree semantics and keyboard operability preserved.
- Click-path QuickPicks retired; palette QuickPicks intact.
- `Assign legacy sets to module…` on `Unassigned`.
- Updated Layer 2/3 pins; `change-log.md`; standard per-session artifacts.

> **Follow-on re-attach point (verdict):** the **physical-moves set** (the
> follow-on Set 087's spec called "089": optional
> `docs/session-sets/<module>/` migration, module-qualified branches,
> `writer_discipline.py` parent-count + `cost_report.py` canonicalization)
> is authored **after Sets 091 + 093 both close** — under the next free
> number at that time, not the literal 089, which was consumed by an
> unrelated set. **Release boundary reminder:** no Marketplace publish
> until Set 094 closes.
