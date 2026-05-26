**ISSUES_FOUND**

- **Issue** → `needsMigration` does **not** trip on valid raw v3 files, so contract property **(3)** is not met. The code only flags malformed v3 (`schemaVersion === 3` with missing `sessions[]`) plus v2/older shapes, and explicitly defers the v3→v4 signal to Session 3.
  **Location** → `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts:~430-455`
  **Fix** → Compute the signal from `rawSd` **and** mark any raw `schemaVersion === 3` file as `needsMigration = true` now. Keep the malformed-v3 and v2 checks, but remove the current “DEFERRED to Set 047 Session 3” behavior if this Session 2 contract is authoritative.

### Nice to have

- Add explicit `readSessionSets()` regression tests for:
  - raw v3 file → `needsMigration === true`
  - legacy v2 file without `completedSessions[]` → pre-normalize ledger merge still affects counts/progress