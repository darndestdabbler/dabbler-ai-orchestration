# Verdict — Work Explorer module-first UX panel

> **Status:** OPERATOR-CONFIRMED 2026-07-11 — this verdict is the design
> of record for the Work Explorer module-first UX. Confirmed decisions:
> all four convergent amendments accepted; adjudication A = ensure-write
> on EXPLICIT USER ACTION ONLY (never on activation); adjudication B =
> the DE-EMPHASIZED WRAPPER (one dialect always; the sole `Default`
> pseudo-module renders as an auto-expanded, visually muted header row);
> the four-set decomposition A–D with a SINGLE release boundary is
> approved (088 re-attaches after Set A, 089 after A+C; 087 S4 + the S3
> UAT re-cut land after Set D).
> (Panel shape: generate-diverse → adversarial cross-critique →
> synthesize → operator-confirm; never a vote.)
> **Panel:** gemini-3-1-pro (`consensus-gemini-3-1-pro.md`) and gpt-5-4
> (`consensus-gpt-5-4.md`), routed independently 2026-07-11, neither saw
> the other's review. Raw critiques are immutable.
> **Synthesizer:** claude-fable-5 (session orchestrator).

## Bottom line

Both critics endorse the direction and converge — independently — on the
same four corrections. None of them undermines the operator's goals; all
four make "the tree is the checklist" MORE true than the original sketch.
The design should be amended as below and then decomposed roughly along
gpt-5-4's four-set plan with a single release boundary.

## Convergent corrections (both critics, adopt as amendments)

1. **Actions live on the module ROW, not as button-bearing tree nodes.**
   Both critics independently rejected `Build plan` / `Build session sets`
   as treeitems containing `AI>` / `import` controls — nested interactive
   content inside `treeitem`s breaks WAI-ARIA tree keyboard semantics.
   Amendment: module rows get an inline action strip (hover/focus-revealed:
   `AI Plan`, `Import Plan`, `Open Plan`, `AI Sets`) mirrored in a context
   menu and the Command Palette; child nodes stay semantic (see #4).
   (This also honors the operator's dislike of far-away UI: the actions sit
   ON the row that was clicked.)

2. **The implicit module is a PSEUDO-module, and work must never vanish.**
   Never persist `module: default`; sets authored under it carry NO
   `module:` field (exactly today's semantics — nothing to migrate).
   Display **`Default`** when it is the only module; **`Unassigned`** once
   real modules coexist. Unstamped sets STAY visible in `Unassigned` when
   modules are later declared (with an `Assign legacy sets to module…`
   affordance), and sets stamped with UNDECLARED slugs render as fallback
   groups plus a warning — the tree fails loud without ever hiding work.
   A user-declared literal `default` slug is allowed but the pseudo-module
   then always labels itself `Unassigned`.

3. **Ship the manifest reader/writer changes BEFORE the always-present
   template.** Both `modules: []` and a bare `modules:` (YAML null) must
   read as a VALID empty manifest (today both classify invalid/refused),
   and the S3 appender must replace either empty form with the first
   block-style entry. The scaffolded template uses gpt-5-4's exact shape
   (header comments + commented example entries + `modules: []`).
   **No ensure-write on activation** (adjudicated below).

4. **Persistent per-module child nodes; buckets nest, never replace.**
   Every module always shows two semantic children — **`Plan`** (state:
   present / missing) and **`Session sets`** (state: blocked-until-plan /
   empty / bucketed, with the status buckets nested UNDER it). The
   original sketch's transient subnodes would have hidden the checklist
   the moment the first set appeared; the persistent model keeps the
   next-step guidance visible forever, which is the operator's stated
   goal. (gpt-5-4's model; gemini's simpler replace-on-first-set variant
   noted and declined for that reason.)

5. **Diagnostics do not die with the form.** Provider-key warnings, the
   Python probe, and workspace-initialization faults move to a persistent
   System Status / diagnostics strip rendered above BOTH the form and the
   tree (visible only when a fault exists). Build-specific inputs
   (tier/seat/budget) stay inside Build project structure.

6. **D4 breakage is managed atomically.** Keep the contributed view ID
   (rename the display label only), keep stable `data-testid` markers,
   auto-expand the sole pseudo-module, and update every Playwright
   pin/doc/screenshot in the same release as the renderer switch.

7. **Parallel-sets shelving is accepted with an escape hatch.** Remove the
   checkbox + prompt guidance from primary UI; keep `prerequisites:`
   machinery and worktrees; preserve an advanced path (a Command Palette
   variant or a `parallelHint` setting) for the narrow
   multiple-branches-in-one-module case.

8. **modules.yaml becomes a primary surface, so give it guardrails**:
   validation diagnostics in the tree (pinned node/banner on invalid,
   never auto-overwrite), and last-known-good rendering so a bad paste
   cannot blank the explorer. The D6 decomposition prompt is delivered by
   a copy command referenced from the YAML header — never embedded as a
   giant comment block (gemini).

## Points of divergence — adjudicated recommendations

**A. Ensure-write trigger.** gemini: write on activation (gated by a
`.dabbler` root); gpt-5-4: never on activation — only on explicit user
actions (scaffold, Open modules.yaml, Add module, copy decomposition
prompt), because auto-writes dirty working trees without consent.
**Recommendation: gpt-5-4's rule.** An extension that edits a repo because
it was opened is a trust violation; every explicit-action moment already
covers the workflow, and the Q8 matrix keeps manifest-less repos fully
functional read-only.

**B. Solo/small-repo hierarchy tax (the strongest argument against the
design — both critics raised it).** gemini's alternative: render NO
wrapper when zero modules (flat buckets at root — but that resurrects a
second layout mode, the exact thing D4 exists to delete). gpt-5-4's
alternative: one dialect always, with the sole pseudo-module rendered as
an auto-expanded, visually DE-EMPHASIZED wrapper.
**Recommendation: gpt-5-4's variant.** One code path, one dialect, no
mode switch; the wrapper tax is one auto-expanded, muted header row.
(Operator may prefer gemini's zero-wrapper look — this is the one genuine
taste call in the verdict.)

## Amended decomposition (gpt-5-4's plan, adopted)

1. **Set A — model/compat foundation**: pseudo-module semantics,
   visible-module computation (declared + pseudo + undeclared-slug
   fallback), reader/writer support for both empty-manifest shapes,
   legacy root-plan mapping. *Set 088 re-attaches after this.*
2. **Set B — renderer switch**: single dialect, Work Explorer label
   rename, auto-expanded sole pseudo-module, diagnostics strip,
   atomic Playwright/testid/docs updates.
3. **Set C — interaction model**: module-row action strip + context
   actions, persistent `Plan` / `Session sets` nodes with states,
   retire the click-path QuickPicks (palette keeps them).
   *Set 089 re-attaches after A + C.*
4. **Set D — onboarding/lifecycle**: Getting Started shrink to
   Build + Define-modules, create-on-demand modules.yaml + toolbar
   button, D6 decomposition prompt, parallel-UI shelving + escape
   hatch, docs.
**Release boundary: no Marketplace publish until A–D are all in** (a
half-migrated UX is worse than either whole). 087 S4 (the Hello World
tutorial) and the S3 UAT re-cut land after D, documenting the new UX.

## Items the operator must confirm

1. The eight amendments above (esp. #1 row-actions, #2 pseudo-module
   naming `Default`/`Unassigned`, #4 persistent Plan/Session-sets nodes).
2. Adjudication A (no write on activation) and B (de-emphasized wrapper
   vs gemini's zero-wrapper flat root).
3. The four-set decomposition + single release boundary, and the 088/089
   re-attach points.
