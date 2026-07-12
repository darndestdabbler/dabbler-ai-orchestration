ISSUES FOUND

- **Issue 1: Module-action protocol validation fails open and can silently target the repository-level plan**
  - **Category:** Correctness
  - **Severity:** Major
  - **Location:** `src/providers/CustomSessionSetsView.ts` → `handleModuleAction()` and `showModuleContextMenu()`
  - **Violation:** The authoritative D3 ruling requires: “Host narrows all three fields … unknown ⇒ drop + log,” with `moduleKind` treated as an untrusted cross-check. It also requires stale or malformed module targeting to fail loudly rather than fall back to the repository plan.
  - **Impact:** A malformed message such as `{action:"import-plan", moduleKind:"declared", moduleSlug:null}` is accepted. The host coerces the slug to `""`, which `pickModuleForAuthoring` deliberately interprets as the pseudo repository-level target. The import can therefore write `docs/planning/project-plan.md` instead of a module plan—the exact wrong-destination failure this seam was designed to prevent. The host also accepts arbitrary kinds as declared in `showModuleContextMenu`, and permits `assign-legacy` regardless of module kind.
  - **Evidence:** `handleModuleAction()` only rejects `moduleKind === "fallback"` and then executes:
    ```ts
    const slug = typeof moduleSlug === "string" ? moduleSlug : "";
    ```
    `showModuleContextMenu()` similarly maps every non-`"pseudo"` value to `"declared"`:
    ```ts
    const kind = moduleKind === "pseudo" ? "pseudo" : "declared";
    ```
    Neither method validates the declared/pseudo slug-kind invariant or restricts `assign-legacy` to pseudo `Unassigned`.
  - **Fix:** Reject and log unless:
    - `moduleKind` is exactly `"declared"` or `"pseudo"`; `"fallback"` and unknown kinds are rejected.
    - `moduleSlug` is a string.
    - `"pseudo"` has exactly `moduleSlug === ""`.
    - `"declared"` has a non-empty slug, subsequently resolved through `pickModuleForAuthoring`.
    - `"assign-legacy"` is accepted only for the pseudo empty-slug path.
    
    Apply the same validation before constructing the context menu; never coerce malformed identity fields to repository-level defaults.