# Work Explorer Module Lifecycle UI Spec (Module lifecycle simplification — Set 3 of 4)

> **Purpose:** Collapse the module subtree and put lifecycle management
> on the row: the **`Plan` and `Session sets` child levels retire**
> (status buckets nest directly under the module row; plan/decomposition
> state is visible as the kind-typed sets themselves), module rows gain
> **Open Plan / Add module / Rename module… / Delete module…** (wiring
> Set 099's writers), the superseded **`AI Plan` / `Import Plan` /
> `AI Sets` strip actions retire** (palette commands survive for legacy
> repos), and **Add module scaffolds the module's plan + decomposition
> sets** via Set 098's writer.
> **Created:** 2026-07-13
> **Session Set:** `docs/session-sets/100-work-explorer-module-lifecycle-ui/`
> **Prerequisite:** `098-module-plan-and-decomposition-set-kinds`,
> `099-module-rename-and-delete-writers` (both complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested    # The headline interaction change of the sequence: a flatter tree + destructive row actions; arm the ad-hoc human walk (Set 078/087-S3 bar) against the locally built VSIX.
requiresE2E: suggested    # The tree DOM loses a level and rows gain actions; Playwright Layer 3 pins must move with it.
uatStyle: ad-hoc          # Non-web VS Code UI.
uatScope: per-session
pathAwareCritique: advisory  # One targeting seam spans webview client, protocol, host dispatch, and the 099 writers; rename/delete must resolve module targets identically from row, context menu, and palette.
prerequisites:
  - slug: 098-module-plan-and-decomposition-set-kinds
    condition: complete
  - slug: 099-module-rename-and-delete-writers
    condition: complete
```

> Rationale: UAT/E2E `suggested` per the Set 093 precedent — this
> reverses part of 093's own tree (amendment 4's persistent children),
> so the pins and the human walk are both load-bearing. **No publish out
> of this set** — single release boundary after Set 101.

---

## Project Overview

### Authoritative design (do not re-litigate at runtime)

Implements P1's tree consequence + P2's UI per the operator-confirmed
verdict
([`verdict.md`](../../proposals/2026-07-13-module-lifecycle-simplification/verdict.md)):

- **Buckets nest directly under the module row** (module `aria-level` 1,
  bucket 2, set row 3). The 093-era `Plan` / `Session sets` semantic
  children retire: with plan and decomposition living as session sets,
  the checklist IS the bucket content. The `blocked-until-plan` state
  retires with them — the decomposition set's `[BLOCKED BY PREREQS]`
  badge (existing machinery, pre-linked by Set 098's template) carries
  that signal now.
- **Kind-aware set rows:** a `kind: plan|decomposition` set row gets a
  small distinguishing icon/badge and keeps normal row behavior. No new
  node types, no new states — presentation only.
- **Row actions become lifecycle management:** `Open Plan` survives;
  `Add module`, `Rename module…`, `Delete module…` join (dispatching to
  Set 099's writers / the existing `runNewModuleFlow`); actions stay
  row-level controls OUTSIDE the treeitem accessible name (the 093
  WAI-ARIA rule), mirrored in the context menu and Command Palette.
- **`AI Plan` / `Import Plan` / `AI Sets` strip actions retire** —
  superseded by the scaffolded lifecycle sets (plan import is in-session
  work per the plan set's guidance). Their **palette commands survive
  unchanged** for legacy repos that predate kind sets — retire the
  affordance, not the capability.
- **Add module now scaffolds the module's two lifecycle sets** via
  `scaffoldModuleLifecycleSets` (Set 098) right after the manifest
  append — a new module is born with its next steps visible in the tree.
- **Pseudo-module (`Default`/`Unassigned`) keeps today's semantics**
  (Set 091 rules untouched): management actions apply to **declared**
  modules only; the pseudo-module keeps `Assign legacy sets to
  module…` and gets no rename/delete.

### Non-goals (owned by sibling sets)

- Scaffolding the real `default` module on Build — **Set 101**.
- Docs/tutorial updates — **Set 101**.
- Any physical `docs/session-sets/<module>/` moves — the deferred
  physical-moves follow-on, unchanged by this sequence.

---

## Sessions

### Session 1 of 2: Flatten the module subtree; kind-aware rows

**Steps:**
1. Register; read this spec, the verdict, Set 093's spec (what is being
   reversed and why), and the Set 098 outcome.
2. Protocol/model: drop the `plan` / `sessionSets` child-state fields
   from the module payload (`src/types/sessionSetsWebviewProtocol.ts`,
   `deriveModuleChildren` in `src/providers/SessionSetsModel.ts`);
   buckets become the module's direct children. Surface `kind` on the
   set-row payload.
3. Webview client (`media/session-sets-tree/client.js`): remove
   `renderPlanNode` / `renderSessionSetsNode`; buckets render at
   `aria-level` 2, rows at 3; kind-typed rows get the badge/icon;
   keyboard nav conformant at the new depths.
4. Update Layer 2 fixtures + Playwright Layer 3 pins for the removed
   level in the same session (the 093 amendment-6 discipline).
5. Tests: state matrix (module with no sets / kind sets only / mixed;
   pseudo-module; fallback groups), badge presence for each kind,
   `[BLOCKED BY PREREQS]` visible on a scaffolded decomposition set
   whose plan set is incomplete.
6. Build + full suite; verify (mandatory); UAT/E2E per the upfront
   prompt; author `disposition.json`; commit + push; `close_session`.

**Creates:** the flattened tree + kind-aware rows + updated pins.
**Touches:** `src/types/sessionSetsWebviewProtocol.ts`,
`src/providers/SessionSetsModel.ts`, `src/providers/CustomSessionSetsView.ts`,
`media/session-sets-tree/client.js`, Layer 2/3 suites.
**Ends with:** three-level tree (module/bucket/row) everywhere incl.
pseudo-module and fallback groups; kind badges render; prereq badge
carries the blocked-until-plan signal; ARIA/keyboard conformant; pins
updated; suite green; cross-provider VERIFIED (or Minor-only); pushed;
`close_session` succeeded.
**Progress keys:** child-levels-retired, buckets-direct-children,
kind-badges, prereq-badge-carries-gating, aria-keyboard-conformant,
suite-green

---

### Session 2 of 2: Lifecycle row actions; strip retirement; Add-module scaffolding

**Steps:**
1. Register; read this spec, Session 1's outcome, and Set 093 S2's
   targeting-seam record
   (`093-…/s2-targeting-seam-architecture.json`).
2. Rework the module action strip: `Open Plan` stays; add `Add module`,
   `Rename module…`, `Delete module…` (declared modules only; the
   pseudo-module keeps `Assign…` and gets no management actions);
   remove `AI Plan` / `Import Plan` / `AI Sets` from strip and context
   menu; leave the palette commands (`dabbler.importPlan`,
   `dabbler.generateSessionSetPrompt`, module-decomposition prompt)
   untouched for legacy repos.
3. Thread rename/delete through the explicit module-target seam (no
   QuickPick on row/context paths; palette paths keep their QuickPick),
   dispatching to Set 099's writers; mirror in context menu + palette
   (`package.json` menus).
4. Extend `runNewModuleFlow` to call `scaffoldModuleLifecycleSets`
   after the manifest append (skip-existing; a writer refusal reports
   and leaves the manifest append intact — module without sets beats
   half-written sets).
5. Tests: targeting parity (row vs context vs palette resolve
   identically for rename/delete), retired actions absent from strip
   and menu but commands still registered, Add-module end-state (entry
   + plan stub + two scaffolded sets with correct numbers/links),
   pseudo-module exclusion.
6. Live dogfood on a scratch multi-module repo: add a module (see its
   two sets appear blocked/ready), rename it, delete it — the full
   Class1 loop.
7. Build + full suite; verify (mandatory); UAT/E2E per the upfront
   prompt; author `disposition.json`; commit + push; `close_session`;
   end-of-set `change-log.md`; Step 9 review; the armed advisory
   path-aware critique before the set-terminal close.

**Creates:** lifecycle action strip + mirrors; Add-module scaffolding;
targeting-parity tests; `change-log.md`.
**Touches:** `media/session-sets-tree/client.js`,
`src/providers/CustomSessionSetsView.ts`, `src/commands/newModule.ts`,
`src/commands/renameModule.ts`, `src/commands/deleteModule.ts`,
`tools/dabbler-ai-orchestration/package.json` (menus/commands), test
suites.
**Ends with:** the full module lifecycle (add with scaffolded next
steps, open plan, rename, delete) is reachable on the row it applies to,
mouse and keyboard; superseded strip actions gone, palette capability
intact; dogfood 100% pass; suite green; cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded; Step 9 + advisory
critique recorded.
**Progress keys:** lifecycle-actions-on-row, strip-actions-retired,
palette-capability-intact, add-module-scaffolds-sets, dogfood-pass,
suite-green, set-closed

---

## End-of-set deliverables

- Three-level module tree; kind-aware set rows; prerequisite badge as
  the plan gate.
- Module-row lifecycle actions wired to the 099 writers; WAI-ARIA and
  keyboard semantics preserved; pseudo-module correctly excluded.
- Superseded strip actions retired with palette capability intact;
  Add-module scaffolds the two lifecycle sets.
- Updated Layer 2/3 pins; `change-log.md`; standard per-session artifacts.

> **Release boundary reminder:** no Marketplace/PyPI publish until
> Set 101 closes.
