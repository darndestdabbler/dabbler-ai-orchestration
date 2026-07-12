ISSUES FOUND

- **Issue 1: The scaffold adapter does not preserve the required dangling-symlink guard**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** `EnsureManifestIo.writeFileExclusive` explicitly requires that “a file, a directory, or a symlink (including a dangling one)” fail with `EEXIST`, supporting the contract to “never overwrite an existing / invalid / symlinked manifest.” However, `fileOpsEnsureManifestIo` in `src/commands/gitScaffold.ts` implements this with `fileOps.exists(abs)` followed by ordinary `fileOps.writeFile(abs, data)`, not an exclusive or no-follow create. The architecture ruling specifically required `lstat` semantics if this fallback was used.
    - **Impact:** With the usual target-following existence semantics, a dangling `docs/modules.yaml` symlink appears absent and the subsequent ordinary write follows it, potentially creating a file outside the workspace. This breaks the manifest guardrail and creates a repository trust-boundary violation. It should block merge independently of the separately waived check-then-act race.
    - **Evidence:** The Node-backed `ensureModulesManifest` correctly uses `flag: "wx"`, while the scaffold adapter contains only:
      ```ts
      if (fileOps.exists(abs)) {
        // throw EEXIST
      }
      fileOps.writeFile(abs, data);
      ```
      There is no `lstat`, exclusive-create operation, or scaffold-path symlink test. The existing tests cover ordinary existing files only.
    - **Fix:** Extend `FileOps` with a genuine exclusive-create operation and implement it with `fs.writeFileSync(..., { flag: "wx" })` for production and equivalent `EEXIST` behavior in the memory fake. Add scaffold tests for existing valid, invalid, regular-file, directory, and dangling-symlink manifest entries.