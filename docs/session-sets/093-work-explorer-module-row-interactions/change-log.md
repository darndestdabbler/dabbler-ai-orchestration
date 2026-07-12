# Change Log — Set 093: Work Explorer Module-Row Interactions

> **Set C** of the operator-confirmed Work Explorer redesign (091–094).
> Makes the tree carry the whole per-module workflow ("the tree is the
> checklist"). Prerequisite: `092-work-explorer-single-dialect-renderer`.
> **No Marketplace publish** — single release boundary after Set 094.

## Session 1 — Persistent `Plan` / `Session sets` child nodes

Every module row now renders two **persistent semantic child nodes** —
`Plan` (present / missing) and `Session sets` (blocked-until-plan / empty /
bucketed, with the status buckets nested UNDER `Session sets`, never
replacing the checklist). ARIA levels shifted to module 1 / Plan &
Session-sets 2 / bucket 3 / row 4 (`aria-setsize=2` on the fixed pair;
`aria-expanded` on `Session sets` only when bucketed); keyboard nav and
collapse reach the new nodes via the shared toggler. States derive from the
pure `deriveModuleChildren(planPresent, setCount)`; plan-presence is resolved
host-side per root (null-guarded) and ORed across worktree roots. A routed
architecture ruling (opus tier 3) settled that all three module kinds render
both children with no exemption. Layer 2 + Layer 3 pins moved with the new
level. Cross-provider VERIFIED (2 rounds; R1 Major fixed).

## Session 2 — Row action strip, QuickPick retirement & assign flow

- **Module-row action strip** — a hover/focus-revealed `role="toolbar"`
  (secondary Tab-stop, internal Arrow/Home/End roving, Escape back to the
  row) carrying `AI Plan`, `Import Plan`, `Open Plan`, `AI Sets`. Rendered
  for `declared` + `pseudo` kinds only; a `fallback` row shows none (its
  undeclared-slug warning owns remediation). The pseudo `Unassigned` module
  additionally carries `Assign legacy sets to module…`. The buttons sit
  OUTSIDE the treeitem's `aria-labelledby` (= header), so they never pollute
  the tree's accessible name (amendment 1). A pointer click on another
  module's strip re-anchors correctly (single roving anchor invariant).
- **Context-menu + Command-Palette mirror** — a new `showModuleContextMenu`
  message opens an action-selection QuickPick on the module row; the palette
  gains `dabbler.openModulePlan` (the `Open Plan` mirror), alongside the
  existing `dabbler.importPlan` / `dabbler.generateSessionSetPrompt`.
- **QuickPick retirement on click paths** — row/context invocations carry
  the module via `pickModuleForAuthoring(root, ui, {preselectedSlug})`; a new
  `{kind:"unknown-module"}` outcome fails loud on a stale slug (never a
  silent repo-level fallback). The palette commands keep today's QuickPick.
- **`Assign legacy sets to module…`** — a two-phase, **atomic**,
  format-preserving `module:` stamp into each chosen unstamped set's spec.md
  config block: a col-0 splice at the yaml-fence top (comments preserved),
  the target validated against the CURRENT manifest at write time, never
  writing `default`/pseudo, same-target a no-op. The write is atomic (temp →
  verify → rename with a pre-rename target re-check and a unique staging
  path), so any failure leaves the operator's spec.md intact.
- **Design**: a routed architecture ruling (opus tier 3,
  `s2-targeting-seam-architecture.json`) settled the D1–D4 seam. New pure,
  Layer-2-tested helpers: `narrowModuleAction` / `narrowModuleIdentity`
  (strictly drop malformed webview identity — no coercion) and
  `dispatchModuleAction` (the strip → handler mapping).

**Verification (S2):** cross-provider (gpt-5-6) ran 11 rounds — a deep
adversarial drill of the file-mutation writer. Every material Critical/Major
was fixed in-flight and re-verified (protocol fail-open, fence/placement/parse
guards, the palette mirror, and a converging TOCTOU/atomicity series resolved
structurally by making the writer atomic). Round 11's residual
(cross-VS-Code-*instance* file-lock serialization) was **operator-adjudicated
as adjudicated-minor** — unwinnable in portable Node fs, disproportionate for
a single-line stamp, practical risk ~nil — and the set closed via
`--manual-verify` per that adjudication.

## End-of-set state

- Full suite green: pytest 2922 passed / 6 skipped; extension unit 1467
  passing; Playwright Layer 3 24 passed; tsc clean; live dogfood 17/17.
- Follow-on re-attach point (verdict): the **physical-moves set** (optional
  `docs/session-sets/<module>/` migration, module-qualified branches,
  `writer_discipline.py` parent-count + `cost_report.py` canonicalization) is
  authored under the next free number now that Sets 091 + 093 have both
  closed. Release boundary reminder: **no Marketplace publish until Set 094
  closes.**
