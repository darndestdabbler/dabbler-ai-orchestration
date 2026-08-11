**ISSUES FOUND**

- **Issue 1:** The TypeScript lazy-synthesis path adds and repeats `spec.md` reads instead of threading one already-read title map.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-sets/115-work-explorer-session-node-ux/spec.md:151-156`, `tools/dabbler-ai-orchestration/src/utils/sessionState.ts:111-120`, `tools/dabbler-ai-orchestration/src/utils/sessionState.ts:155-158`, `tools/dabbler-ai-orchestration/src/utils/progress.ts:106-112`, `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts:953`, `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts:1060-1062`
  - **Failure scenario:** A normal Work Explorer refresh over a fresh/planned spec-only set now calls `readStatus(dir)`, which infers from disk, then calls `inferStateInMemory(dir)` again for the ledger. Each inference reads `spec.md` once through `specTitleMap()` and again through `readTotalSessionsFromSpec()`. This is probable because spec-only sets are an explicit supported path, and it materially violates the session’s hot-path constraint.
  - **Acceptance criterion:** `JUDGMENT - For a spec-only set, the TypeScript scan/synthesis path computes the absent-file state once and reuses one parsed/read spec result for both total-session and title resolution, without separate spec-title and total-session file reads or a second inferStateInMemory pass.`
  - **Details:** **Violation:** the plan says to “Thread the map it already computes into the loop” and “**No new file read** — if the change adds one, it is the wrong change.” **Impact:** this is the exact performance guard for the Work Explorer scan; a reasonable reviewer should block a change that explicitly lands the “wrong change” form. **Evidence:** `notStartedPayload()` calls `specTitleMap(path.join(..., "spec.md"))`, whose implementation reads the file, then immediately calls `readTotalSessionsFromSpec()`, which reads the same `spec.md` again; `readSessionSets()` also calls `readStatus(dir)` before separately inferring `rawSd` when the file is absent.

#### NITS

- **Nit:** `ai_router/CHANGELOG.md` calls `is_generic_title`, `heal_title`, `heal_generic_titles`, and `needs_title_heal` “public helpers,” but `ai_router/progress.py`’s `__all__` omits them. Direct imports still work, so this is low impact.
- **Nit:** `sessionState.ts` still says either side may lazy-synthesize during a sweep, which is stale after the ownership decision that the extension read path no longer writes.
- **Nit:** The plan/changelog prose says generic-shaped is exactly `Session <own number>`, but both implementations use `\s+` and the corpus pins `Session  6` as generic; if that broader match is intentional, the prose should say so.