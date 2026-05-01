# Verification Round 1

## ISSUES FOUND

### Functional contract mismatch
- **Issue** → `backfill_session_state_files` does not match the spec’d return contract; it returns `List[str]`, not `int`.
- **Location** → `ai-router/session_state.py: backfill_session_state_files`; reflected in `ai-router/backfill_session_state.py` and `ai-router/tests/test_session_state_backfill.py`
- **Fix** → Make `backfill_session_state_files(base_dir="docs/session-sets") -> int` return the synthesized count. If the CLI needs paths, add a separate helper to plan/collect affected paths, or add an internal helper that returns paths while the public API returns the count.

### Test coverage gap
- **Issue** → Missing the spec-listed backfill case for **in-progress (state file only)**: existing `session-state.json`, no `activity-log.json`, no `change-log.md`, and backfill must leave it untouched.
- **Location** → `ai-router/tests/test_session_state_backfill.py`
- **Fix** → Add a test that creates `spec.md` + preexisting `session-state.json` with `status: "in-progress"`, runs backfill, asserts no synthesis for that folder, and verifies the file is unchanged.

### Concurrency robustness gap
- **Issue** → A write-then-rename pattern was added, but `_atomic_write_json` uses a fixed temp filename (`path + ".tmp"`). Two concurrent writers targeting the same file are not fully benign; one can lose the temp path before `os.replace`.
- **Location** → `ai-router/session_state.py:_atomic_write_json`
- **Fix** → Use a unique temp file in the destination directory (`tempfile.NamedTemporaryFile(delete=False, dir=...)` or a UUID/PID-suffixed temp path), then `os.replace` that unique file into place.

### Confirmed
- `synthesize_not_started_state` matches the Session 1 writer shape:
  - `schemaVersion: 2`
  - `sessionSetName: basename(dir)`
  - `currentSession: null`
  - `totalSessions` parsed from the `Session Set Configuration` block or `null`
  - `status: "not-started"`
  - `lifecycleState: null`
  - `startedAt: null`
  - `completedAt: null`
  - `verificationVerdict: null`
  - `orchestrator: null`
- `synthesize_not_started_state` is idempotent and no-ops if `session-state.json` already exists.
- `backfill_session_state_files` implements the three required inference branches:
  - `change-log.md` → `complete` / `closed` / `completedAt` from mtime
  - `activity-log.json` → `in-progress` / `work_in_progress` / `startedAt` from earliest log timestamp
  - neither → not-started shape
- Existing state files are preserved untouched. The walker skips any folder that already has `session-state.json` before parsing or writing, so no normalization occurs.
- `backfill_session_state_files` supports `dry_run`, is non-recursive, and tolerates a missing base directory.
- The CLI exposes `--base-dir` and `--dry-run` and prints both a count and affected paths.
- Tests do cover:
  - synthesize on empty folder
  - synthesize idempotency
  - backfill not-started
  - backfill in-progress via activity-log
  - backfill done via change-log
  - preserve-existing-file with change-log present
  - CLI smoke
- No reader changes / Session 2 scope creep are visible in the provided diff.


---

# Verification Round 2

# VERIFIED

1. **Return type contract** → Yes. `backfill_session_state_files` is now:
   ```python
   def backfill_session_state_files(
       base_dir: str = "docs/session-sets",
   ) -> int:
   ```
   That matches the spec’d public contract exactly.

2. **"State file only" coverage** → Yes. `test_existing_state_file_only_is_preserved` correctly covers the spec case:
   - `spec.md` present
   - preexisting `session-state.json` present
   - no `activity-log.json`
   - no `change-log.md`
   - backfill returns `0`
   - file contents remain unchanged

3. **Atomic-write fix** → Yes.
   - **Unique temp path in destination dir** → `_atomic_write_json` uses `tempfile.mkstemp(..., dir=directory)` with a per-call unique filename.
   - **Only `os.replace` mutates the destination** → all JSON serialization happens in the temp file; the destination path is touched only by `os.replace(tmp_path, path)`.
   - **Temp cleanup on error** → the `except BaseException:` block best-effort removes the temp file before re-raising.

   This resolves the original fixed-`".tmp"` collision problem. Two concurrent writers to the same destination no longer collide on the temp filename; last-writer-wins at `os.replace`, which is the expected benign outcome here.

4. **Non-test consequences** → No in-repo breakage is visible in the supplied diff. The CLI and tests were updated consistently for the new `int` return contract. One intentional external API change remains worth noting:
   - any out-of-repo caller that previously relied on `backfill_session_state_files(...)` returning `List[str]` must be updated
   - any out-of-repo caller that previously passed `dry_run=` to `backfill_session_state_files` will now get a `TypeError`, because `dry_run` was removed from the public function and is now handled at the CLI/planning layer

5. **Anything else worth flagging** → No blocking issues. Minor non-blocking note: the CLI computes `paths = _planned_backfill_paths(...)` for printing, then calls `backfill_session_state_files(...)`, which replans internally. Under concurrent filesystem changes, the printed path list could diverge from the actual written set. That does not affect correctness of the backfill itself, but it can make CLI output slightly stale in a race.
