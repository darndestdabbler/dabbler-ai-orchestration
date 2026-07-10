- **Issue** → The implicit-module fallback is not actually silent once `readSessionSets()` runs, and malformed manifests get misreported as per-set “unknown slug” problems.
  **Location** → `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`, in `readSessionSets()`:
  ```ts
  const modulesManifest = readModulesManifest(root);
  ...
  if (config.module !== null) {
    const manifestEntry = (modulesManifest ?? []).find((m) => m.slug === config.module);
    ...
    console.warn(`[dabblerSessionSets] ${entry.name}: spec declares module: ${config.module}, which is not a slug in docs/modules.yaml ...`);
  }
  ```
  `readModulesManifest()` returns `null` for both “manifest absent” and “manifest present but unreadable/malformed”. That means every set with a `module:` key emits the same “not a slug” warning even when the real condition is “no valid manifest was loaded”.
  **Fix** → Return structured manifest state from `readModulesManifest()` (e.g. `{ kind: "absent" | "invalid" | "ok", entries }`) or otherwise distinguish `null` causes before validating `config.module`. Only emit the per-set unknown-slug warning when a valid manifest was loaded and the slug truly is missing from it.

- **Issue** → The recorded test/suite evidence is internally inconsistent, so the session’s “suite green” proof is not reliably substantiated.
  **Location** → `docs/session-sets/087-module-organized-projects-foundations/s1-conventions.md` says:
  - `1289 passing, 0 failing`
  - `16 new Set-087 tests`
  
  but `docs/session-sets/087-module-organized-projects-foundations/activity-log.json` step `session-001/round-1-remediation` says:
  - `Unit suite 1290 green`
  
  and that same remediation step says an additional test was added for the wrong-shape-manifest warning.
  **Fix** → Re-run and record the post-remediation totals once, then update all session artifacts (`s1-conventions.md`, `activity-log.json`, and any related verification notes) to the same final pass count and new-test count.