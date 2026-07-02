VERIFIED

- The Round 1 mismatch is resolved:
  - **Probe path:** `probePythonPresenceCore(...)` now delegates its explicit/PATH checks to `resolveBootstrapPythonCore(...)`.
  - **Spawn path:** `buildProjectStructureNoPrompt(...)` now uses `resolveScaffoldBootstrapPython(projectDir)` before the legacy fallback.
  - **Effect:** On POSIX with `python3` present and `python` absent, preflight and bootstrap now both resolve to `python3`, so the scaffold no longer passes preflight and then later hits `spawn python ENOENT`.

- Evidence in the diff:
  - `resolveBootstrapPythonCore(..., "linux")` searches `["python3", "python"]`.
  - `probePythonPresenceCore(...)` now calls that shared resolver for the PATH/explicit cases.
  - `buildProjectStructureNoPrompt(...)` now computes:
    ```ts
    resolveScaffoldBootstrapPython(projectDir) ?? resolveExplicitPythonPath(projectDir)
    ```
    so the reported `python3`-only POSIX case no longer falls through to bare `python`.

- Regression check:
  - No fix-introduced Major/Critical regression is substantiated from this change set.
  - The added tests cover the reported failure mode directly (`python3`-only POSIX: probe passes and bootstrap resolves `python3`) plus adjacent platform/explicit-setting cases.

- NITS:
  - None.