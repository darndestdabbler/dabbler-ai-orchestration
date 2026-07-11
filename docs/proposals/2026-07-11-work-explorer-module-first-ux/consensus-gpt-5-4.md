# Panel critique — gpt-5-4 (openai-seat)

> Routed 2026-07-11, task_type=architecture, excluded providers: ['anthropic', 'google']. Raw output below, immutable.

## Ranked findings

### Critical

1.  
- **Issue:** Legacy repos with unstamped sets become ambiguous the moment real modules are declared: those sets either disappear, get silently reassigned, or sit forever in an undefined `default` bucket.
- **Location:** D2/D3, especially Q2 and Q8.
- **Fix:** Make the implicit bucket a **pseudo-module for `module` absent**, not a real slug. Never persist `module: default`. Keep that pseudo-module visible whenever unstamped sets or a legacy root plan exist, and add an explicit **Assign legacy sets to module…** command.

2.  
- **Issue:** Auto-writing `docs/modules.yaml` on activation will dirty working trees without consent and will be perceived as the extension modifying repos just because they were opened.
- **Location:** D2 installed-base ensure-write trigger.
- **Fix:** **Do not write on activation.** Create the file only on explicit user actions: scaffold, “Open modules.yaml”, “Add module”, or “Copy decomposition prompt” when the user has asked for module tooling.

3.  
- **Issue:** `Build plan` / `Build session sets` as tree nodes that also contain `AI>` / `import` controls is an incoherent and likely inaccessible interaction model.
- **Location:** D3, Q3.
- **Fix:** Keep tree items as tree items. Put actions on the **module row action strip** and in the context menu. If child action nodes exist at all, each must be a **single-invoke leaf** with no nested buttons.

4.  
- **Issue:** The proposed state switch is not actually “the tree is the checklist”: it offers session-set creation before plan existence, then hides next-step affordances once any set exists.
- **Location:** D3, Q4.
- **Fix:** Use persistent child nodes: **Plan** and **Session sets** for every module. `Session sets` is disabled or marked blocked until a plan exists. Status buckets nest under `Session sets`; they do not replace it.

### Major

5.  
- **Issue:** The always-present empty manifest is technically underspecified. YAML has no clean empty block-list syntax, and the current S3 appender rejects `modules: []`.
- **Location:** D2, Q1.
- **Fix:** Update the parser/writer to accept both **`modules: []`** and **`modules:` null** as empty, and replace either with the first block-style `- slug:` item on append. Ship that before emitting the template.

6.  
- **Issue:** Missing/invalid manifests or sets stamped to undeclared modules can currently blank or misgroup work even though the set files still exist.
- **Location:** D2/D3, Q1/Q8.
- **Fix:** Fail loud **without hiding work**: show a pinned diagnostics node/banner and render fallback groups from observed set stamps plus the unstamped pseudo-module.

7.  
- **Issue:** The design turns `docs/modules.yaml` into a primary UX surface but does not add guardrails for manual or AI-generated edits.
- **Location:** D1/D2/D6.
- **Fix:** Ship schema/snippets/validation, reserved-key errors, and “last known good tree” behavior so a bad paste does not make the explorer unusable.

8.  
- **Issue:** Shrinking the form strands provider-key, Python, and environment failures unless those diagnostics move somewhere persistent.
- **Location:** D1, Q5.
- **Fix:** Add a persistent **environment/diagnostics strip** above the Work Explorer and above the form; keep Build-specific inputs in the Build section only.

### Minor

9.  
- **Issue:** Removing the only obvious parallelism hint regresses the niche case where one module legitimately needs multiple independent set branches.
- **Location:** D5, Q7.
- **Fix:** Remove it from primary UI, but keep an advanced command/setting and preserve manual `prerequisites:` authoring.

10.  
- **Issue:** Retiring the flat byte-identical DOM will break tests, screenshots, and some muscle memory.
- **Location:** D4, Q6.
- **Fix:** Update Playwright/docs atomically, preserve the view ID and stable `data-testid`s, and auto-expand the sole pseudo-module.

## Q1–Q10 recommendations

### Q1
- **Issue:** The empty-template shape, ensure-write trigger, and deleted/invalid-file behavior are underdefined and currently conflict with the S3 appender.
- **Location:** D2.
- **Fix:**  
  - Use this exact scaffold shape:
    ```yaml
    # Work modules for this repo.
    # Save this file after editing.
    # Ask your AI pair to propose modules using the extension's copy-prompt command.
    #
    # Example:
    # - slug: api
    #   title: API
    #   codeRoots:
    #     - src/api
    #   planPath: docs/plans/api.md
    #   touches:
    #     - src/shared

    modules: []
    ```
  - Change the writer so append works from both `modules: []` and `modules:` null.
  - **Do not ensure-write on activation.** Ensure-write only on explicit user actions that ask for module tooling.
  - If the file is **deleted**: show `modules.yaml missing` in the explorer, keep rendering fallback groups, offer **Create/Open**.
  - If the file is **invalid**: show `modules.yaml invalid`, open diagnostics, **never overwrite** the file automatically, and keep rendering fallback groups from observed set stamps.

### Q2
- **Issue:** `default` is overloaded as display label, slug candidate, and implicit grouping, which creates migration and collision ambiguity.
- **Location:** D2/D3.
- **Fix:**  
  - Make the implicit bucket a **pseudo-module** with an internal key like `__unassigned__`.
  - Sets authored there carry **no `module` field**.
  - Display label:
    - **`Default`** when it is the only module shown.
    - **`Unassigned`** when real modules also exist.
  - When real modules are later declared, unstamped sets **stay** in `Unassigned` until the user explicitly reassigns them.
  - Because the pseudo-module is not a real slug, a user-declared slug `default` can exist; the pseudo-module label must then remain `Unassigned`, not `Default`, in mixed state.

### Q3
- **Issue:** Action subnodes with nested affordances are the wrong primary interaction for a WAI-ARIA tree.
- **Location:** D3.
- **Fix:**  
  - Put actions on the **module row** as inline buttons/context actions:
    - `AI Plan`
    - `Import Plan`
    - `Open Plan`
    - `AI Sets`
  - Keep child nodes semantic:
    - `Plan`
    - `Session sets`
  - Keyboard model:
    - Arrow keys navigate tree items.
    - `Tab` enters the focused row’s action strip.
    - `Enter/Space` on tree item expands/collapses or opens the item.
  - Mirror every row action in the context menu and command palette.

### Q4
- **Issue:** The state model is incomplete and currently breaks both ordering and persistence of next-step guidance.
- **Location:** D3 and the old Getting Started completion flags.
- **Fix:**  
  - Visible modules =  
    1. declared manifest modules in manifest order,  
    2. plus the pseudo-module if manifest empty, legacy root plan exists, or unstamped sets exist,  
    3. plus fallback undeclared-slug groups if sets reference missing modules.
  - Every module always has:
    - **Plan**
    - **Session sets**
  - `Plan` state:
    - **present** if plan file exists at `planPath` (or legacy root plan path for the pseudo-module)
    - **missing** otherwise
  - `Session sets` state:
    - **blocked** if no plan exists
    - **empty** if plan exists and zero sets
    - **bucketed** if one or more sets exist
  - Status buckets live **under** `Session sets`; they never replace it.
  - Keep `structureBuilt` as the only workspace-level Getting Started flag.
  - Retire global `planPresent` / `sessionSetsPresent`; the explorer becomes the source of truth.
  - Yes: the old step-2 module-plan gap **dissolves** in this model.

### Q5
- **Issue:** The form can shrink, but diagnostics cannot disappear with it.
- **Location:** D1.
- **Fix:**  
  - Keep only two workflow sections on the form:
    1. **Build project structure**
    2. **Define modules**
  - Do **not** keep plan/session-set workflow steps on the form.
  - Move these to a persistent diagnostics surface:
    - provider-key warnings
    - Python probe status
    - “workspace not initialized” warnings
  - Keep tier/seat/budget/tier-seed semantics in **Build project structure**, because those are input parameters, not diagnostics.

### Q6
- **Issue:** Retiring the flat renderer has predictable breakage.
- **Location:** D4.
- **Fix:**  
  - Expect breakage in:
    - Playwright DOM snapshots/selectors
    - screenshot baselines
    - any docs/tutorials showing the flat tree
    - operator click-path muscle memory
  - Mitigate by:
    - preserving the existing **view ID**
    - preserving stable **`data-testid`** markers for buckets/rows
    - auto-expanding the sole pseudo-module
    - updating tests/docs in the **same release** as the renderer switch

### Q7
- **Issue:** There is a real, narrow workflow that depends on parallel-set prompting inside one module.
- **Location:** D5.
- **Fix:**  
  - Shelving the checkbox is acceptable **only if** you keep an advanced path:
    - command-palette variant, or
    - workspace setting like `dabbler.sessionSets.parallelHint = off|auto|prefer`
  - Preserve existing `prerequisites:` behavior.
  - Document that manual set authoring can still express parallel branches.

### Q8
- **Issue:** Upgrade behavior is not defined tightly enough across current repo states.
- **Location:** Migration/compat.
- **Fix:** Use this matrix:

| Repo state on first open after upgrade | Work Explorer behavior | File write behavior |
|---|---|---|
| No manifest, no sets | Show sole pseudo-module (`Default`), `Plan: missing`, `Session sets: blocked/empty`, plus CTA to create/open manifest | No auto-write |
| No manifest, unstamped sets | Show pseudo-module with buckets for those sets; warning `modules.yaml missing` | No auto-write |
| No manifest, module-stamped sets | Show fallback groups by observed stamp slug, plus pseudo-module for unstamped sets; warning | No auto-write; offer `Create modules.yaml from observed modules` |
| Empty manifest, no sets | Show sole pseudo-module; no warning | No change |
| Empty manifest, unstamped sets | Show pseudo-module with sets; no warning | No change |
| Populated manifest, matching stamped sets only | Show declared modules in manifest order with per-module plan/set state | No change |
| Populated manifest, plus unstamped sets | Show declared modules **plus `Unassigned`**; warning with `Assign legacy sets…` action | No change |
| Populated manifest, sets stamped to undeclared slugs | Show declared modules plus fallback undeclared groups; warning with `Add missing module entries…` | No change |
| Invalid manifest | Show diagnostics banner and fallback grouping from observed stamps + pseudo-module | Never auto-overwrite invalid file |

### Q9
- **Issue:** This can be decomposed, but some pieces must not be user-released independently.
- **Location:** Delivery plan.
- **Fix:**  
  - **Session set 1 — model/compat foundation**
    - pseudo-module semantics
    - visible-module computation
    - legacy root plan mapping
    - undeclared-slug fallback
    - parser/writer support for `modules: []` and null
  - **Session set 2 — renderer switch**
    - one dialect only
    - Work Explorer rename
    - sole pseudo-module auto-expand
    - diagnostics banner
    - Playwright/test updates
  - **Session set 3 — interaction model**
    - module row action strip/context actions
    - persistent `Plan` / `Session sets` nodes
    - remove click-path QuickPicks
  - **Session set 4 — onboarding/lifecycle**
    - shrink Getting Started
    - Define modules section
    - create-on-demand `modules.yaml`
    - toolbar button
    - decomposition prompt and docs
  - **Release boundary:** do not ship a public release until all four are in.
  - **Set 088 re-attach:** after session set 1; it depends on stable manifest semantics and `codeRoots`.
  - **Set 089 re-attach:** after session sets 1 and 3; it needs stable real-module vs pseudo-module semantics before moving files by module.

### Q10
- **Issue:** The strongest argument against module-first-always is the permanent hierarchy tax on the smallest repo.
- **Location:** Overall design.
- **Fix:**  
  - Name the failure modes honestly:
    - solo developer sees extra depth with no benefit
    - `Default`/`Unassigned` becomes a dumping ground that never gets cleaned up
    - manual YAML editing becomes day-1 ceremony
    - users may confuse “module” with ownership or filesystem layout
  - The simpler variant that still preserves the operator’s benefits is:
    - keep the same single-dialect tree and same pseudo-module semantics,
    - but render the lone pseudo-module as an **auto-expanded, visually de-emphasized “This project” wrapper**,
    - only expose `Unassigned` once real modules coexist,
    - and never auto-create the manifest until the user asks for it.
  - That keeps:
    - the tree as the checklist
    - one rendering dialect
    - no vanished form steps
    - no click-path QuickPicks
    - less jargon for small repos