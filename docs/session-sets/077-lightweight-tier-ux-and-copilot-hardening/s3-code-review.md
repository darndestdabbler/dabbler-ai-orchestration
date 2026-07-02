## Code Review — Set 077 S3

### Major

**1. Failed Python pre-flight still opens the picked folder → window reload discards the error**
- **Location:** `src/commands/gettingStartedActions.ts`, `buildStructure` handler (no-`openRoot` branch, the `showOpenDialog` path).
- **Issue:** The pre-flight in `buildProjectStructureNoPrompt` correctly returns `undefined` and writes no artifacts on a missing interpreter, but its return value is ignored on the picked-folder path:
  ```ts
  await buildProjectStructureNoPrompt(context, picked[0].fsPath, tier, budget, verificationMode);
  await vscode.commands.executeCommand("vscode.openFolder", picked[0]); // runs regardless
  ```
  `vscode.openFolder` replaces the workspace and reloads the extension host. VS Code toasts do **not** survive a reload, so on a missing interpreter the operator lands in a brand-new empty folder with no scaffold and the `describeMissingPython` explainer already gone. The `openRoot` branch returns early and is unaffected; only this path regresses, and the new pre-flight makes it far more reachable. Untested (the M7 regression only exercises the `openRoot` path).
- **Fix:** Gate the open on a successful scaffold:
  ```ts
  const result = await buildProjectStructureNoPrompt(context, picked[0].fsPath, tier, budget, verificationMode);
  if (!result) return;
  await vscode.commands.executeCommand("vscode.openFolder", picked[0]);
  ```

### Minor

**2. `describeMissingPython` toast is fire-and-forget**
- **Location:** `src/commands/gitScaffold.ts`, pre-flight block in `buildProjectStructureNoPrompt`.
- **Issue:** `vscode.window.showErrorMessage(...)` is not awaited before `return undefined`. Compounds finding #1: the caller proceeds (and may reload) before the message is even queued deterministically.
- **Fix:** `await` the message, or (with #1 fixed) confirm ordering is safe; at minimum keep it awaited to guarantee display before any follow-on command.

**3. `structureOnlyContext` widens the narrowed rider back to `string`**
- **Location:** `src/utils/consumerBootstrap.ts`, `structureOnlyContext` signature.
- **Issue:** Parameter typed `verificationMode: string = DEFAULT_VERIFICATION_MODE`. The whole point of `asVerificationModeRider` is a closed union; typing this `string` means an unnarrowed value could be written into the durable `.dabbler/verification-mode` marker if any future caller bypasses the router. `BootstrapContext.verificationMode` should carry the type, not `string`.
- **Fix:** `verificationMode: VerificationMode = DEFAULT_VERIFICATION_MODE`.

**4. Forward-compat: a future mode value makes an older host reject a legitimate Lightweight action**
- **Location:** `src/commands/gettingStartedActions.ts`, `asVerificationModeRider` (fail-loud throw) → `routeGettingStartedAction`.
- **Issue:** If a newer webview posts a mode string an older host doesn't recognize (e.g. during an extension-update window where webview HTML and host briefly mismatch), the `throw` rejects the entire `build-structure` / `build-session-sets` action. Tier riders share this posture, but tier only has two stable values; the verification enum is explicitly documented as extensible ("three-way choice"). This is the intended fail-loud tradeoff, but for a mission-critical rollout an unknown *rider* value silently degrading to the documented default is safer than blocking the scaffold.
- **Fix:** Consider returning `undefined` (→ default) for unrecognized-but-string values on the rider path, reserving the throw for the operator-visible tier field; or pin the enum in a version handshake.

**5. `pythonPresent` probe runs synchronous fs + full PATH scan on every getting-started snapshot**
- **Location:** `src/providers/CustomSessionSetsView.ts` thunk `(root) => probePythonPresence(root)` → `probePythonPresenceCore` rung 3.
- **Issue:** `computeGettingStarted` re-runs the thunks on each recompute; the PATH rung does `existsSync` per PATH entry synchronously on the extension host thread. Getting-started-mode-gated, but still fires on every snapshot while the form is visible.
- **Fix:** Memoize per `(root, env-generation)` or debounce; the marker/tier thunks have the same shape and could share the cache.

**6. `findCommandOnPath` ignores PATHEXT and the `py` launcher**
- **Location:** `src/utils/pythonInterpreter.ts`, `findCommandOnPath` (Windows candidate construction) and `probePythonPresenceCore` (`["python"]` on win32).
- **Issue:** Only `.exe` is appended on Windows (no `.bat`/`.cmd` from `PATHEXT`), and the probe never checks the `py` launcher (`py.exe`), which is the *only* interpreter on many python.org installs that skip "Add to PATH". Such a machine reports `pythonPresent: false`, showing the warning and — via the pre-flight — **blocking** the scaffold. (Arguably consistent, since `resolvePythonInterpreter` also defaults to bare `"python"`, so the spawn would fail anyway — but that's a coupled limitation worth documenting, not silent behavior.)
- **Fix:** Either honor `PATHEXT` + probe `py` and teach the spawn path to use it, or document explicitly that only `python`/`python3` on PATH counts.

**7. Tier-aware doc materialized to a single shared globalStorage file; relative links break**
- **Location:** `src/commands/gettingStartedDoc.ts`, `openGettingStartedDoc` durable branch.
- **Issue:** (a) `path.join(dstDir, "getting-started.md")` is one global file reused across all workspaces — last-open wins; harmless because it's rewritten each open, but worth noting for multi-window. (b) Opening the doc from globalStorage rather than the workspace copy breaks any relative links/asset references the template contains.
- **Fix:** Namespace the output by root hash and/or strip-or-absolutize relative refs when relocating out of the workspace.

**8. H1-detection heuristic can match a `#` comment inside a code fence**
- **Location:** `src/commands/gettingStartedDoc.ts`, `renderTierAwareGettingStarted`.
- **Issue:** `lines.findIndex((l) => /^#\s/.test(l))` matches any line starting with `# `, including a shell comment inside a ``` fence if one precedes the real H1. Fragile for a doc that teaches CLI usage.
- **Fix:** Track fenced-code state, or match only the first non-fenced `^#\s` (single-hash) line.

### Notes (verified correct)

- Seed tuple `(rootId, tierSeed, verificationModeSeed)` in `client.js`: sentinel-seeded, re-fires on any dimension change, mirrors the tier `dirty`/`lastSeed` contract; cross-root discard resets the mode fields (test-confirmed). `pythonPresent` correctly excluded from the tuple (render-only).
- Untrusted-rider narrowing: Full drops the rider without validating (no spurious rejects), Lightweight fails loud on garbage, no path lets a hostile webview seed a mode outside the enum.
- Back-compat: absent `verificationModeSeed`/`pythonPresent` read as `null`/present (warning fails quiet); old persisted state (no mode fields) narrows to defaults.
- PATH probe: platform-parameterized (win32 `;`/`\` vs POSIX `:`/`/`), `PATH ?? Path` fallback, and the `\Microsoft\WindowsApps\?$` skip are correct.

---
**Verification (gpt-5-4, openai):** ISSUES_FOUND

**Issue 1** [Completeness / Major]: ** Response missed a merge-blocking hole in the new Python guards: any existing **directory** is accepted as a “Python interpreter”
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**  
    **Violation:** The task explicitly prioritized “**the pre-flight ordering guarantee and any path that can still write artifacts on a missing interpreter**” and described “**a scaffold PRE-FLIGHT that must run before ANY durable write** … **and a pre-spawn check in the blessed-writer spawn path**.” The response never flagged that both new checks are only `exists` checks and therefore can be bypassed by a misconfigured `dabblerSessionSets.pythonPath` that points to an existing folder instead of an executable.  
    **Impact:** This changes the merge decision. The advertised hardening is not reliable: with `pythonPath` set to an existing directory, scaffold pre-flight passes, `buildProjectStructureNoPrompt` can proceed into durable writes (`initRepoIfNeeded(projectDir)` at minimum), and only later fail when the host tries to execute a non-executable path. The new “friendly missing-Python” pre-spawn check in `setupVerification` is also bypassed for the same reason.  
    **Evidence:** In `src/utils/pythonInterpreter.ts`, `probePythonPresenceCore(...)` does:
    ```ts
    if (p.isAbsolute(normalized)) return fileExists(normalized);
    ```
    and `interpreterResolves(...)` does:
    ```ts
    if (p.isAbsolute(pythonPath)) return fileExists(pythonPath);
    ```
    `fileExists`/`realExists` is an existence probe, not “is an executable file.” Existing directories satisfy it. Then `src/commands/gitScaffold.ts` uses that probe as the first gate:
    ```ts
    if (!probePythonPresence(projectDir)) { ... return undefined; }
    await initRepoIfNeeded(projectDir);
    const pythonPath = resolveExplicitPythonPath(projectDir);
    ```
    so a directory-valued `pythonPath` can pass pre-flight and still allow durable writes before failure. The correct review should have called this out as at least **Major** and required validating that the resolved path is an executable file, not merely that it exists.
