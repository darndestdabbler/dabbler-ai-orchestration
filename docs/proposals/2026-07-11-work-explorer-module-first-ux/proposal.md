---
title: Work Explorer module-first UX (Getting Started shrink + always-present modules.yaml)
status: PROPOSAL OF RECORD — panel run 2026-07-11; verdict.md operator-confirmed same day (amendments supersede the sketch where they conflict)
date: 2026-07-11
authors: operator (design sketch) + Claude (claude-fable-5, analysis & drafting)
applies-to: dabbler-ai-orchestration VS Code extension (Session Set Explorer, Getting Started form, consumer scaffold)
note: >
  Origin: operator design sketch given 2026-07-11, immediately after Set 087
  Session 3 closed, prompted by the S3 UAT orientation failure (the operator —
  the person most familiar with the extension — could not tell from the
  checklist whether the Getting Started form's steps applied or should be
  skipped). Panel artifacts land alongside this file: consensus-<model>.md
  (raw, immutable) + verdict.md (synthesis, operator-confirmed).
---

# Work Explorer module-first UX

## Purpose

Make the extension's primary surface — the tree view — carry the whole
per-module workflow, so a human operator always sees WHERE they are and WHAT
comes next without mode switches, vanished forms, or QuickPicks that appear
far from where they clicked. Set 087 shipped modules as display metadata
(Phase 1); this proposal makes modules the organizing principle of the UX.

Two operator-set constraints drive the design:

1. **The tree is the checklist.** Configuration state per module (no plan
   yet → plan but no sets → sets by status) must be visible in the tree
   itself, not implied by which surface happens to be rendered.
2. **Prefer removal.** The redesign should mostly delete UX complexity:
   fewer QuickPicks, a smaller Getting Started form, one rendering dialect,
   fewer modes. (Operator simplicity-first directive, 2026-07-04.)

## Background (what exists today, post-Set-087-S3)

- The **Getting Started form** renders only while a workspace has zero
  session sets ("getting-started" Explorer mode). It carries three steps:
  Build project structure (tier/seat/budget riders), Create-or-import a
  project plan (+ the S3 "New module…" button), Build session sets (+ a
  "parallel session sets" checkbox). Once any set exists the form vanishes
  and the bucketed list renders instead — the mode switch that disoriented
  the S3 UAT.
- **docs/modules.yaml is optional.** Absent ⇒ a single implicit module and a
  byte-identical pre-087 flat rendering (an operator-approved Set 087
  constraint). S2 therefore ships TWO DOM dialects: the legacy flat one
  (locked byte-identical, non-conformant ARIA) and the multi-module
  WAI-ARIA tree. Harmonizing the legacy dialect is a recorded S2 deferral.
- **Module targeting is QuickPick-driven** (S3): the planning-prompt,
  plan-import, and decomposition flows ask "Which module is this for?" when
  ≥2 modules exist, auto-select with a notice at exactly 1. The operator
  dislikes QuickPicks (they appear far from the click point).
- Declared modules with zero session sets render NOTHING (S2 by-design).
- Empty manifest states: absent / invalid / present are distinguished
  fail-loud (S3 verification R1 fix); `modules: []` (flow style) is a shape
  the S3 append-writer refuses to extend.

## Design (operator sketch, corrections applied)

### D1 — Getting Started shrinks to two sections

1. **Build project structure** — substantially as today (tier radio, seat
   profile, budget/NTE on the Direct-API path, no-prompt scaffold). NOT
   collapsible: with D2/D3 removing the other steps, the form fits the
   available real estate as-is (operator correction, 2026-07-11 — the
   earlier collapsible-sections idea is withdrawn).
2. **Define modules (optional)** — NEW. A button that opens
   `docs/modules.yaml` in the editor. The section copy encourages working
   with an AI agent to decompose the project into modules (see D6) and
   explicitly instructs the human to SAVE the file. Non-module projects
   simply leave the list empty.

The form's old steps 2 (plan create/import) and 3 (build session sets) —
and the S3 "New module…" button — MOVE into the Work Explorer per-module
nodes (D3). The no-folder CTA surface is unchanged.

### D2 — modules.yaml always exists

- The scaffold ("Build project structure" and `setupNewProject`) always
  writes `docs/modules.yaml`: the Set 087 header comments, a PRESCAFFOLDED
  set of commented-out example modules, and an empty modules list.
- An empty list means one module, displayed as **`default`** — the sole
  module every repo starts with. Declaring real modules later is an edit to
  an existing file, never a mode transition.
- Installed base: the file is ensure-written idempotently (the Set 077 S4
  `ensureCrossProviderVerificationDoc` precedent) at a moment the panel
  should recommend (extension activation vs first module-aware action).
- OPEN MECHANICS QUESTION for the panel: the template must be authored so
  the S3 format-preserving appender can extend it (block-style list
  convention + an empty-list replacement path — a literal `modules: []` is
  refused by the current parse-after-append guard).

### D3 — the Work Explorer (renamed from Session Set Explorer)

- Display label renamed to **Work Explorer**; the contributed view ID stays
  (saved layouts/settings survive).
- **Top level: modules, always** — manifest order, `default` alone when the
  list is empty. This retires the "no manifest ⇒ pixel-identical flat view"
  Set 087 constraint (deliberate operator supersession).
- Under each module:
  - once session sets exist for it → today's status buckets → rows;
  - until then → two **module status subnodes**: **`Build plan`** and
    **`Build session sets`**, each carrying an AI-prompt affordance
    (e.g. an `AI>` link/button that copies the module-targeted prompt) and,
    for the plan node, an `import` affordance. The module is implied by the
    node clicked — no QuickPick.
- Toolbar: existing refresh/report buttons plus a new **open modules.yaml**
  button.
- The S3 module QuickPick survives only behind the Command Palette entry
  points (`dabbler.importPlan`, `dabbler.generateSessionSetPrompt`,
  `dabbler.newModule`), which remain for keyboard-driven use.

### D4 — one rendering dialect

Rendering `default` as a real module node ends the byte-identical legacy
constraint, so the S2 multi-module WAI-ARIA tree dialect becomes the ONLY
dialect — resolving the recorded S2 deferral (legacy-dialect ARIA
harmonization) by deletion rather than harmonization.

### D5 — shelve the parallel-session-sets UI

Remove the "Create parallel session sets where possible" checkbox and its
prompt guidance from the redesigned surfaces. KEEP the underlying
machinery: the `prerequisites:` spec field (sets still order themselves
within a module) and the worktree tooling (the module workflow itself runs
one worktree per module; Hello World depends on it). Rationale: the
operator — the feature's author — rarely uses parallel sets; modules
provide parallelism at the granularity people actually work in
(person-per-module), and parallel sets WITHIN a module would multiply
worktree complexity for little gain. UI-level shelving, explicitly not a
machinery removal; reversible.

### D6 — the AI module-decomposition prompt

A bundled, copyable prompt (the house copy-prompt pattern) that instructs
an AI agent to decompose a project into modules and write them into
`docs/modules.yaml` (slugs, titles, codeRoots, planPath, integration
`touches`), honoring the invariants (globally-unique set names; module =
grouping, never identity). Referenced from the D1 "Define modules" section
copy and from the modules.yaml header comments.

## Explicitly out of scope

- **Copilot seat cost estimation** (the budget/NTE input is less meaningful
  for Copilot-seat teams) — its own future session set.
- Reviving the custom right-click context menu ("for another day" —
  operator).
- Physical session-set file moves (`docs/session-sets/<module>/…`) — stays
  Set 089 scope.
- The codeRoots scope check and shared locator API — stays Set 088 scope.
- ai_router/Python changes beyond what D2's ensure-write requires (if any).

## Sequencing decisions already made (operator, 2026-07-11)

- Set 087 **S4 (Hello World tutorial) and the S3 UAT walk are DEFERRED**
  until this redesign lands, so both document the new UX. Set 087 stays
  open meanwhile.
- This proposal reshapes what Sets 088/089 inherit; their specs are
  re-cut after the verdict.

## Questions the panel must answer (adversarial critique wanted)

Q1. **D2 mechanics**: the exact always-present modules.yaml template shape
    (append-friendly empty list + commented examples), the ensure-write
    trigger for the installed base, and the failure story when the file is
    deleted or made invalid by hand.
Q2. **`default` module semantics**: display label vs real slug; what
    `module:` do sets authored under `default` carry (none? `default`?);
    what happens to `default`-attributed sets when real modules are later
    declared; collision rules if an operator declares a module actually
    named `default`.
Q3. **D3 tree interaction**: are action subnodes (`Build plan` /
    `Build session sets` with `AI>` + `import` affordances) inside a
    WAI-ARIA tree sound interaction design (keyboard operability, role
    semantics for action-bearing leaf nodes), or should actions live on the
    module node itself (inline buttons / context actions)?
Q4. **State model**: exact rules for when a module shows subnodes vs
    buckets (plan exists? any set stamped `module: <slug>`?), and how the
    Getting Started D3 completion flags (structureBuilt / planPresent /
    sessionSetsPresent) map onto the per-module model — including whether
    the form's step-2 module-plan gap (S3 deferred item) dissolves here.
Q5. **D1 scope**: does anything beyond Build + Define-modules genuinely
    need to stay on the form (provider-key warnings, Python probe, tier
    seed semantics all currently live there)?
Q6. **D4 risk**: what breaks when the flat byte-identical rendering is
    retired (Playwright pins, operator muscle memory, downstream consumer
    repos' expectations)?
Q7. **D5**: any workflow that legitimately depends on the parallel-sets
    UI affordance that shelving would strand?
Q8. **Migration/compat**: behavior matrix for repos in every current state
    (no manifest, empty manifest, populated manifest, module-stamped sets,
    unstamped sets) on first open after upgrade.
Q9. **Decomposition into session sets**: a sane set/session breakdown for
    implementing this (what ships first; what must land atomically), and
    where 088/089 re-attach.
Q10. **What is WRONG with this design?** Name the strongest argument
     against module-first-always, the failure modes for a solo developer
     on a small project, and any simpler alternative that achieves the
     operator's four stated advantages.
