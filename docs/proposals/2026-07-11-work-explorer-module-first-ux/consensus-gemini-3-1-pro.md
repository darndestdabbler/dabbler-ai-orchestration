# Panel critique — gemini-3-1-pro (google-seat)

> Routed 2026-07-11, task_type=architecture, excluded providers: ['anthropic', 'openai']. Raw output below, immutable.

### Findings

**Critical**
Issue → Unstamped sets vanish from UI upon first module creation.
Location → D2 & D3 (Tree rendering logic)
Fix → The tree renderer must compute a "dangling sets" list (sets without a `module:` attribute, or with a `module:` not in `modules.yaml`). If this list is non-empty, forcefully render a `default` (or `Unassigned`) module node to contain them, regardless of what the manifest declares.

Issue → Action subnodes violate WAI-ARIA tree semantics.
Location → D3 (module status subnodes inside tree)
Fix → Do not render `Build plan` / `Build session sets` as `treeitem` nodes. ARIA trees expect items to be selectable entities, not action buttons. Render inline affordances (icons/buttons) directly on the module node row (visible on hover/focus), mimicking standard VS Code view item context actions.

**Major**
Issue → Silent formatting corruption with empty lists and the YAML appender.
Location → D2 (modules.yaml presold shape)
Fix → Do not write `modules: []`. Scaffold the file with `modules:` (an empty scalar, which parses as `null`) followed immediately by the commented block. Update the S3 format-preserving appender to replace `modules:\n#` with `modules:\n  - slug: ...\n#`.

Issue → Critical system status warnings get buried if Getting Started is purely steps 1 & 2.
Location → D1 (Getting Started shrink)
Fix → Extract provider-key warnings and Python environment probes into a permanent "System Status" banner at the very top of the panel, entirely decoupled from the Getting Started form's step logic.

**Minor**
Issue → Massive prompts inside YAML header comments degrade readability.
Location → D6 (AI module-decomposition prompt)
Fix → Do not embed the literal multi-line prompt in the YAML comments. Embed a short URI or a VS Code command link (e.g., `[Generate Decomposition Prompt](command:dabbler.generateDecompPrompt)`) that copies it to the clipboard.

***

### Question Panel Responses

**Q1. D2 mechanics**
*Template shape*: Write `modules:` with no value (parses to `null`), followed by `# Example modules:` and commented block items. Update the appender to handle `null` by appending block list items below the key.
*Ensure-write trigger*: Extension `activate` hook, gated by checking if the workspace contains a `.dabbler` (or equivalent) configuration root, ensuring it doesn't spray files into non-project repos.
*Failure story*: If `modules.yaml` is deleted, trigger the ensure-write idempotently on the next panel focus. If it is invalid, fail-loud with a red error block in the Work Explorer tree (blocking tree render until fixed).

**Q2. `default` module semantics**
*Display label vs real slug*: Display label is "Default", but it operates as a phantom. Sets authored under it receive NO `module:` attribute (they remain unstamped).
*Real module declaration*: When real modules are added to the YAML, any existing unstamped sets automatically group under a synthetic "Unassigned" node at the bottom of the tree so they are never orphaned.
*Collisions*: Validation logic must reject `default` or `unassigned` if manually typed into `modules.yaml` as an explicit slug.

**Q3. D3 tree interaction**
No, action subnodes inside an ARIA tree are not sound. A WAI-ARIA `tree` expects `treeitem` leaves; inserting action buttons breaks keyboard navigation expectations (Space/Enter typically select/expand, not execute arbitrary web links).
*Recommendation*: Actions must live on the module node itself as inline UI affordances (e.g., hover-revealed action icons `$(play) Plan` and `$(add) Sets` on the right side of the module row).

**Q4. State model**
*Subnodes vs Buckets*: A module shows status buckets if `sets.some(s => s.module === slug)`. Otherwise, it shows the empty state actions.
*Getting Started Mapping*: Drop the global `structureBuilt` / `planPresent` flags. The form shows Step 1 if the project config/tier files are missing. Step 2 always shows if Step 1 is done and `modules.yaml` exists. The S3 module-plan gap dissolves because plan existence is now queried per-module by checking for `<module>-plan.md` on disk.

**Q5. D1 scope**
Yes. Provider-key warnings and the Python probe must stay visible. Without them, the user will click a prompt affordance and fail opaquely. They should be detached from the "Getting Started" wizard and moved into a persistent "System Status" banner above the wizard/tree that only renders when a fault is detected.

**Q6. D4 risk**
*Breakages*: Playwright e2e tests relying on the legacy flat DOM selectors will fail immediately. Any custom user-supplied CSS (if supported) targeting flat rows will break. Downstream tools parsing the HTML view (unlikely but possible) will break. Operator muscle-memory for visual density may be disrupted by nested indents.
*Recommendation*: Update DOM selectors in tests atomically with the commit that removes the legacy dialect.

**Q7. D5**
Yes. Shelving this strands the workflow of an operator who explicitly wants to batch-generate 5 unrelated session sets across different modules in a single AI prompt, walking away while they generate. However, because the underlying `prerequisites:` machinery remains, operators can manually parallelize. The UI simplification is worth stranding the automated UI loop.

**Q8. Migration/compat behavior matrix**
*   **No manifest**: `modules.yaml` is generated. UI shows "Default" containing all sets.
*   **Empty manifest**: UI shows "Default" containing all sets.
*   **Populated manifest**: UI renders WAI-ARIA tree.
*   **Module-stamped sets**: Render inside their respective module nodes.
*   **Unstamped sets**: Render inside a synthetic "Unassigned" module node to prevent data loss.

**Q9. Decomposition into session sets**
*   **Set 1 (DOM & Base)**: Drop legacy DOM. Implement WAI-ARIA tree unconditionally. Ensure-write `modules.yaml` on activation. Parse `null` modules as empty. Render unstamped sets into a synthetic `Default` node.
*   **Set 2 (Tree State & Actions)**: Implement per-module state querying (buckets vs empty). Add inline WAI-ARIA compliant action buttons to empty module nodes.
*   **Set 3 (Getting Started & Cleanup)**: Shrink Getting Started form. Extract System Status banner. Drop parallel-sets UI. Add command for D6 decomposition prompt.
*   *Re-attach*: Sets 088/089 build on top of Set 1.

**Q10. What is WRONG with this design?**
*Strongest argument against*: It forces hierarchical overhead on trivial, single-task tasks. A solo developer writing a 50-line script must now confront a visual "Default" module wrapper and a CTA urging them to "Define modules" for a project that doesn't need them. It introduces cognitive load (grouping) before the user has enough scale to require grouping.
*Failure mode*: Solo dev clicks "Define modules" out of obligation, wastes AI context window trying to split a tiny script, resulting in over-engineered session sets that stall momentum.
*Simpler alternative*: If `modules.yaml` contains exactly zero modules, do NOT render the `Default` wrapper node. Render the status buckets directly at the root. The WAI-ARIA tree supports flat lists perfectly well. The CTA to "Define modules" remains in the Getting Started form, but the tree avoids the wrapper tax until the user opts in.