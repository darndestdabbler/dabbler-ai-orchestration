- **Issue** → Final verification/suite evidence is stale and internally contradictory after the round-4 remediation, so the claimed end-state is not reliably substantiated.  
  **Location** →  
  - `docs/session-sets/087-module-organized-projects-foundations/s1-conventions.md` still labels the suite baseline as “FINAL” with **1291 / 18**, then later says the actual final totals are **1292 / 19**.  
  - `docs/session-sets/087-module-organized-projects-foundations/disposition.json` summary still says **18 new unit tests**, **1291** passing, and **“Verification: 3 rounds”**, while `activity-log.json` records the round-4 test addition and the round-5 fallback attempt.  
  **Fix** → Update every final-summary artifact to one consistent post-remediation state: final unit count, final new-test count, and final verification-round history. Remove the stale 1291/18/3-round claims rather than appending contradictory corrections elsewhere.

- **Issue** → `files_changed` is no longer exhaustive after the later remediation rounds.  
  **Location** → `docs/session-sets/087-module-organized-projects-foundations/disposition.json` → `files_changed` omits at least:  
  - `docs/session-sets/087-module-organized-projects-foundations/s1-verification-round-4.md`  
  - `docs/session-sets/087-module-organized-projects-foundations/s1-issues-round-4.json`  
  Both files are present in the diff.  
  **Fix** → Regenerate or manually update `files_changed` from the actual `<pre-session>..HEAD` diff plus the appended round artifacts so the inventory is complete.

- **Issue** → `readModulesManifest()` still has a silent “present but unreadable” path: a dangling `docs/modules.yaml` symlink is treated as absent, bypassing the warning path.  
  **Location** → `tools/dabbler-ai-orchestration/dist/extension.js`, `readModulesManifest()`:
  ```js
  if (!fs5.existsSync(manifestPath))
    return null;
  ```
  followed by the `readFileSync()` warning branch. `fs.existsSync()` returns `false` for a broken symlink, so a real directory entry at `docs/modules.yaml` can still degrade silently to “no manifest.”  
  **Fix** → Do not pre-classify absence with `existsSync()`. Attempt the read first, or `lstatSync()` the path so broken symlinks are treated as present/read-failing and emit the same warning as other unreadable manifest cases.