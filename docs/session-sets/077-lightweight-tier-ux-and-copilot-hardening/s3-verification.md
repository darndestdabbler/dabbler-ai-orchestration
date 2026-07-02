## ISSUES FOUND

- **Issue 1: The new Python preflight can pass on POSIX while the scaffold still later invokes missing `python`**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The task requires: **“a pre-flight check in `buildProjectStructureNoPrompt` so a missing interpreter fails _before_ venv creation with the friendly explainer instead of `spawn python ENOENT`”** and **“The Python pre-flight is the first side-effect-free step of the scaffold path: it runs before any durable write.”**
    - **Impact:** On a common Linux/macOS setup where `python3` exists on `PATH` but `python` does not, the UI warning is suppressed and the preflight passes, but the scaffold path still uses `python`. That means the action can still reach the later spawn failure the session was supposed to eliminate; worse, `buildProjectStructureNoPrompt` calls `ensureGitRepo(...)` after the preflight, so `.git` can be created before the eventual failure, breaking the no-artifacts-on-failure guarantee. This is merge-blocking because A10/M7 is the core contract of the session.
    - **Evidence:**  
      1. In `src/utils/pythonInterpreter.ts`, `probePythonPresenceCore(...)` treats non-Windows as present if either `python3` **or** `python` is on `PATH`:
         ```ts
         const commands = platform === "win32" ? ["python"] : ["python3", "python"];
         ```
      2. In `src/commands/gitScaffold.ts`, `buildProjectStructureNoPrompt(...)` uses that broader probe first:
         ```ts
         if (!probePythonPresence(projectDir)) { ... return undefined; }
         ```
         but later resolves the interpreter with:
         ```ts
         const pythonPath = resolveExplicitPythonPath(projectDir);
         ```
      3. The existing/default behavior of `resolveExplicitPythonPath(...)` is still `"python"` when no explicit setting exists; the unchanged test evidence in `src/test/suite/pythonInterpreter.test.ts` asserts:
         ```ts
         assert.strictEqual(resolveExplicitPythonPath(ROOT), "python");
         ```
      4. Therefore, on a host with only `python3`, the new probe returns true, `ensureGitRepo(...)` can run, and the scaffold still proceeds with `python`, recreating the exact late-failure path the task said must be prevented.

      **Fix:** Make the preflight and the scaffold use the same interpreter-resolution rules. Either:
      - resolve the exact bootstrap interpreter once (including POSIX `python3` fallback) and pass that resolved value through to the scaffold, or
      - narrow `probePythonPresence` so it only reports success for interpreters the scaffold will actually invoke.  
      Also add a regression test for the `python3`-only POSIX case.