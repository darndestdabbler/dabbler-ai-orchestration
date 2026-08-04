# Work Explorer — Native TreeView Migration Spec

> **Purpose:** The Work Explorer is a `WebviewView` that hand-implements a tree:
> ~1,100 lines of vanilla JS and ~800 of CSS re-creating ARIA tree semantics,
> roving-tabindex keyboard navigation, focus painting, collapse state and a
> hover-revealed action strip. It is fighting the platform, and losing in three
> measurable ways — it **re-renders the entire tree** with
> `root.innerHTML = parts.join("")` on every watcher tick, it **builds collapsed
> children anyway** and hides them in CSS, and in Set 108 a *CSS-only* change
> introduced a real swallowed-click regression that only Layer 3 caught. VS Code
> gives all of this away for free: `getChildren` is called on expand,
> virtualisation and keyboard behaviour are the platform's, and
> `contributes.submenus` provides the hierarchical right-click menu the operator
> wanted and a hand-drawn DOM menu already failed to deliver once. This set
> migrates the tree to a native `TreeView`.
> **Created:** 2026-08-04
> **Prerequisite:** Set 109 — see *Prerequisites*, and it is a real gate, not a courtesy.
> **Session Set:** `docs/session-sets/110-work-explorer-native-treeview/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Operator notes:** [`operator-notes.md`](operator-notes.md) — read it at
> Session 1. The 2026-08-04 entry adds a **fourth tree level (sessions within
> a set)**, moves per-session status onto the operator's own icons, and moves
> the done/total fraction into `TreeItem.description`. All three are density
> decisions, so they belong in S1's confirmed mapping; the third also changes
> Session 2's stated `module → bucket → session set` shape. It also brings the
> **new activity-bar icon** into scope (a Session 3 asset swap, and it needs a
> `currentColor` fix first). The Set 034 fraction list-icon column is
> **retired** by operator decision; the fraction text itself survives in
> `description`.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # This replaces the surface the operator looks at every session, and it deliberately trades away per-row information density. Whether the result is legible is not knowable from a diff or a test.
requiresE2E: true         # L-064-12 arms at full strength: this IS the Explorer-rendering surface. Set 108 proved Layer 2 and every static gate can be green while the view is broken.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
prerequisites:
  - slug: 109-model-registry-and-pricing-truth
    condition: complete
```

> **Why 109 is a hard prerequisite.** The architecture panel consulted on
> 2026-08-04 was answered by `gpt-5-4-mini` and `gemini-2.5-pro` — a *mini*
> model and a two-generation-old one — because the registry silently routed
> around the requested models. Both nonetheless chose this migration. But the
> decision to throw away a working view and rewrite its test suite deserves
> advice from the models we meant to ask, and Set 109 is what makes that
> possible. S1 re-runs the panel as its first act.

---

## Project Overview

### The verified facts this set starts from — do not re-derive

Established by reading the code and the VS Code typings on 2026-08-04.

1. **The view is `"type": "webview"`** in `contributes.views`. Everything in it
   is hand-rolled.
2. **Rendering is a full teardown**: `root.innerHTML = parts.join("")`, driven
   by a filesystem watcher.
3. **Collapsed does not mean unrendered.** `renderModule` builds every bucket
   and row unconditionally; collapse is applied purely in CSS
   (`.module[aria-expanded="false"] .module-body {display:none}`). A large repo
   pays full DOM construction while fully collapsed.
4. **The view feels sluggish even when the tree is EMPTY** (operator report).
   An empty tree builds no rows, so neither (2) nor (3) explains it. Both
   consulted models independently bet on the **host-side filesystem scan**.
   **A TreeView migration does not fix that** — which is why S1 measures it
   before the rest of the set commits.
5. **The API surface is richer than the current design assumes**, verified in
   `@types/vscode`: `TreeView.message` renders a message *in the view* above the
   tree; `TreeView.badge` is the numeric pill; `contributes.viewsWelcome` gives
   rich empty-state content with command links; a view **container can stack
   multiple views**, so a `WebviewView` can sit above a `TreeView`;
   `getChildren(element)` is called only on expand.
6. **You cannot put a webview inside a `TreeItem`.** There is no API. The
   Extensions view's rich rows are *built-in workbench UI* using internal
   rendering no extension can reach — it is not a native-tree-plus-webview
   hybrid, and that shape is not available to us.
7. **`view/item/context` is declared with 0 items and `submenus` is empty.**
   Nothing is wired either way today.

### The trade this set is making, stated up front

A `TreeItem` offers **one label, one `description`, one icon, one tooltip, one
`contextValue`**. Today a session-set row renders a name, a right-aligned
fixed-width `3/5` fraction column, up to **five independent inline markers**
(schema-migration, tier, blocked-by-prerequisite, verification-verdict,
duplicate-name) and a kind badge; a module row adds a warning glyph and a
four-button strip.

**Information is preserved; simultaneous visibility is not.** The agreed mapping
direction — to be confirmed by the operator in S1, not assumed:

| today | native |
| --- | --- |
| session-set name | `label` |
| `3/5` fraction | `description` |
| the single most severe marker | `iconPath` |
| the remaining markers, in full | markdown `tooltip` |
| kind / state, for menu gating | `contextValue` |
| module action strip | `view/item/context`, `"group": "inline"` (icon-only, platform-rendered) |
| hierarchical actions | `contributes.submenus` |

**This is the one genuinely contentious decision in the set.** If the operator
judges the loss of at-a-glance multi-marker rows unacceptable, the correct
answer is to stop and stay on the webview — and S1 is the moment to find that
out, before anything is rewritten.

### What this set resolves, beyond the architecture

- **The operator's "drop the same-line shortcuts" request.** Going native
  deletes the hand-rolled text strip and replaces it with platform-rendered
  inline icons plus a real context menu. The operator asked for *either*
  quick-access shortcuts *or* a working hierarchical menu, explicitly not a
  hybrid; this delivers the menu properly.
- **The 0.48.0 ellipsis fix becomes moot** once nothing overlays the title. Its
  CSS should be retired with the webview tree, not carried forward.
- **Lazy loading**, which the operator asked for directly, arrives as
  `getChildren`-on-expand rather than as a retrofit into the innerHTML path.

### Non-goals

- **No data-model rewrite.** `SessionSetsModel`'s grouping, bucketing and
  manifest logic is sound and stays; only the *rendering* changes.
- **No change to the watcher/scan pipeline** beyond what S1's measurement
  proves necessary. If the scan is the sluggishness, fixing it is a follow-on,
  not a silent scope expansion here.
- **No new Explorer features.** This is a migration, not a redesign. A feature
  the native tree makes easy is a follow-on set.
- **No DOM-drawn context menu.** That was built once and abandoned as flaky
  (Set 048 S3). It is not rebuilt.
- **No router or pricing work.** That is Set 109.

---

## Sessions

### Session 1 of 4: Decide with good advice, and measure before committing

The session that is allowed to stop the set.

**Steps:**

1. Register. Confirm Set 109 is complete (the prerequisite).
2. **Re-run the architecture panel on the corrected registry** — Opus 5,
   Sonnet 5 and a real GPT-5.6 variant — asking the same question the
   2026-08-04 panel answered. Both prior opinions chose migration; record
   whether better models agree, and **record it honestly if they do not.**
3. **Measure the empty-tree cost**, in separate buckets: extension activation,
   host-side scan / model assembly, `resolveWebviewView`, and webview cold
   start to first paint. Then measure at 10 / 100 / 500 synthetic sets. This
   settles whether the migration is a performance fix or only a
   correctness/maintainability one — and the honest answer changes how the set
   is sold, not whether it proceeds.
4. **Spike the two API unknowns** rather than trusting documentation:
   (a) does `contributes.submenus` referenced from `view/item/context` give a
   working hierarchical menu; (b) does `"group": "inline"` render the module
   actions acceptably as icons.
5. **Put the density trade to the operator** with a rendered before/after of a
   real row carrying several markers. This is a decision, not a notification.
6. Write `s1-migration-decision.md`: the panel's verdict, the measurements, the
   spike results, the confirmed mapping table, and an explicit **go / no-go**.
7. Verify, close.

**Creates:** `.../s1-migration-decision.md`, the perf harness
**Touches:** nothing shipping — this session changes no product behaviour
**Ends with:** a written go/no-go, an operator-confirmed density mapping, measured startup costs at four scales, and both API spikes answered.
**Progress keys:** `panelReRun`, `startupMeasured`, `submenuSpiked`, `inlineActionsSpiked`, `densityTradeConfirmed`, `goNoGo`

---

### Session 2 of 4: The TreeDataProvider

**Steps:**

1. Register. Read S1's decision; if it is a no-go, stop and re-plan with the
   operator rather than proceeding.
2. **Implement `TreeDataProvider`** over the existing model: module → bucket →
   session set, with `getChildren` resolving each level **on expand**.
3. Map every row per S1's confirmed table — `label`, `description`, `iconPath`,
   markdown `tooltip`, `contextValue`.
4. **Wire the menus**: `view/item/context` with `contributes.submenus` for the
   hierarchical actions, `"group": "inline"` for the one or two most common,
   `contextValue` gating so a fallback module offers no plan action and the
   pseudo-module offers only what applies.
5. Keep the webview tree **in place and default** — this session ships the new
   provider behind the existing surface so the two can be compared.
6. Tests at the level the platform exposes: provider unit tests over
   `getChildren` / `getTreeItem`, and menu-gating tests over `contextValue`.
7. Verify, close.

**Creates:** the `TreeDataProvider` + its tests, menu/submenu contributions
**Touches:** `package.json` (`views`, `menus`, `submenus`)
**Ends with:** a working native tree alongside the webview, lazy by construction, with a hierarchical context menu and gated inline actions.
**Progress keys:** `providerImplemented`, `lazyChildrenProven`, `submenusWired`, `contextValueGating`

---

### Session 3 of 4: Switch over, re-home the empty state, rewrite the tests

**Steps:**

1. Register.
2. **Make the native tree the shipping view.** Retire the webview tree renderer
   and the CSS that served it — including the 0.48.0 ellipsis rule and the
   module action strip, both of which exist only to solve problems the platform
   now solves.
3. **Re-home the non-tree surfaces**: the Getting Started form and System
   Status strip move to a `WebviewView` **stacked above** the tree in the same
   container, with `contributes.viewsWelcome` for the empty state and
   `TreeView.message` for the transient one-liner.
4. **Rewrite the test suites.** Both consulted models were explicit that
   DOM-level assertions do not migrate — treat the existing suite as a
   *behavioural specification* and re-express it against the tree's public
   surface. Layer 3 must cover the new view: expansion, lazy children, context
   menu presence, and the empty state.
5. **Delete rather than orphan.** Any module, CSS block or test left with no
   consumer goes; a dead renderer is worse than none.
6. Run the **full Layer 3 suite** (L-064-12, and Set 108's evidence that it is
   the only gate that sees this class of defect).
7. Verify, close.

**Creates:** the stacked WebviewView for status/onboarding; rewritten Layer 2 + Layer 3 suites
**Touches:** `package.json`, `CustomSessionSetsView.ts`, `media/session-sets-tree/*`, the extension entry point
**Ends with:** the Explorer is a native tree with stacked webview surfaces above it; the hand-rolled renderer and its CSS are deleted; Layer 3 is green on the new view.
**Progress keys:** `nativeTreeShipping`, `webviewTreeRetired`, `emptyStateReHomed`, `layer2Rewritten`, `layer3GreenOnNewView`

---

### Session 4 of 4: Walk it, fix what it breaks, ship it

**Steps:**

1. Register.
2. **Walk the new Explorer** against a repo with several modules and many sets
   — the Set 108 walk repository is a ready fixture with seven modules. Judge
   what the density trade actually feels like in use, not in a mock.
3. **Confirm the operator's original complaints are gone**: the action strip no
   longer covers the module name at any panel width, and a narrow panel is
   usable.
4. **Measure again** at 10 / 100 / 500 sets and compare against S1's baseline.
   Report the honest delta — including "no better on empty startup" if the scan
   was the cause.
5. Fix what the walk breaks. A stall is a defect in the product, not in the
   walker.
6. Author `110-work-explorer-native-treeview-uat-checklist.json` **from the
   walk** — ~4 items derived from the acceptance criterion, literal
   copy-pasteable `HumanAction`, literal-string `Expectation`, quality bar
   stated once in the preamble, each item naming its Layer 3 counterpart.
7. **Release**: version bump, CHANGELOG, vsix built and its contents verified
   against every CHANGELOG claim. **Publishing and tagging remain
   operator-gated.**
8. Verify, close. Author `change-log.md`, run the Step 9 review, run the
   advisory path-aware critique.

**Creates:** `.../110-work-explorer-native-treeview-uat-checklist.json`, `.../s4-walk-evidence.md`, `.../change-log.md`
**Touches:** `package.json` (version), `CHANGELOG.md`, plus walk-driven fixes
**Ends with:** a walked native Explorer, before/after performance numbers at four scales, every walk-surfaced defect fixed or recorded, and a vsix staged for an operator-gated publish.
**Progress keys:** `walkComplete`, `narrowPanelFixed`, `perfDeltaMeasured`, `walkDefectsFixed`, `uatChecklist`, `vsixStaged`, `stepNineReview`

---

## End-of-set deliverables

- The Work Explorer as a native `TreeView` with lazy `getChildren`, a hierarchical context menu, and gated inline actions.
- Getting Started + System Status re-homed to a stacked `WebviewView`, with `viewsWelcome` for the empty state.
- The hand-rolled tree renderer, its CSS, and the module action strip **deleted**.
- Rewritten Layer 2 and Layer 3 suites expressing the old behavioural spec against the new surface.
- Before/after startup and render measurements at 10 / 100 / 500 sets.
- A ~4-item UAT checklist derived from the walk, `change-log.md`, the Step 9 review, the advisory path-aware critique, and a staged vsix.

---

## Risks this set should expect

- **The density trade may be judged unacceptable**, and S1 is deliberately the
  place that can stop the set. Discovering it in S3, after the renderer is
  deleted, would be the expensive version of this risk.
- **Near-total test-suite breakage is expected, not a surprise.** Both consulted
  models said so independently. The mitigation is to treat the old suite as a
  specification and budget S3 accordingly — not to try to migrate assertions
  that are coupled to a DOM that no longer exists.
- **The migration may not fix the symptom that motivated it.** If the empty-tree
  sluggishness is the host-side scan, the native tree will not make startup feel
  faster, and the set must say so plainly rather than claiming a win it did not
  earn.
- **A stacked WebviewView is a second view, not a section.** It has its own
  collapsible header and its own presence rules; the empty-state experience will
  differ from today's single-surface form and needs deliberate design.
- **The Set 048 S3 flaky context menu is a warning, not a precedent.** It failed
  because it was DOM-drawn inside an iframe. A `TreeView` menu is a different
  mechanism — but S1 spikes it rather than assuming.
- **`getChildren` on expand changes when work happens**, moving cost from render
  time to interaction time. A slow `getChildren` becomes a laggy expand, which
  is more noticeable than a slow initial paint.
