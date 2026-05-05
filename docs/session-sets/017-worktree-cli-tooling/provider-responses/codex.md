## Q1 — Helper-factoring granularity
The factoring is close, but I would change two things based on the split used by [ai_router/close_session.py](</c:/Users/denmi/source/repos/dabbler-ai-orchestration/ai_router/close_session.py>) and [ai_router/gate_checks.py](</c:/Users/denmi/source/repos/dabbler-ai-orchestration/ai_router/gate_checks.py>): keep CLI flow thin in `worktree.py`, and move reusable repo/worktree logic into a new `ai_router/worktree_layout.py`.

I would keep `canonical_worktree_path()` and `default_branch()` separate, rename `find_main_repo_root()` to `find_primary_worktree_root()` because “repo root” is ambiguous from inside a linked worktree, split `enumerate_worktrees()` into `parse_worktree_porcelain(text) -> list[GitWorktreeEntry]` plus `classify_worktrees(primary_root) -> list[WorktreeInfo]`, and replace `is_clean()` with `assess_closeability(worktree_path: Path, *, base_ref: str | None) -> CloseabilityReport` backed by three internal checks for dirty/unmerged/unpushed. That matches this repo’s style better than `utils.py`: `utils.py` is a flat helper bag for small workflow commands, while this feature is a real domain surface more like `session_state.py`.

I would not re-export these helpers from `ai_router/__init__.py` yet. Make them public within the package, not package-root API.

## Q2 — --keep-branch default vs opt-in
I would keep `--keep-branch` as opt-in.

The important precedent here is the layout doc’s cleanup rule: close means remove worktree, remove local branch, remove remote branch if applicable. The pre-flight checks meaningfully reduce the real data-loss risk, and the command itself is already explicit enough that “I ran `close <slug>` on the wrong thing” is a lower-probability mistake than silently normalizing “closed but branch still hangs around.”

That said, the pre-flight does not cover the softer operator-intent case: a branch can be clean, merged, and pushed, and the operator may still want it for comparison or cherry-picks. That is exactly what `--keep-branch` is for; I would not make that exceptional case the default.

## Q3 — Canonical-path enforcement strictness
I would hard-refuse in `open`, with no `--force-non-canonical` flag and no env-var escape hatch.

The whole value of this CLI is that `python -m ai_router.worktree open <slug>` means “canonical path, always.” If `open` can also do non-canonical placement, the structural guarantee is gone and the regression class comes back.

The better third path is a separate future command for migration/repair, not a weakened `open`. Something like `worktree move-to-canonical <path>` or `repo_layout_check --repair` preserves the invariant while still giving you tooling for odd cases.

## Q4 — Remote-delete failure modes
I would not retry automatically. `git` already gives the real failure, and this is a cleanup step, not a transient-safe idempotent API call.

I would handle outcomes this way:
- Network/auth failure: exit non-zero with the exact `git push origin --delete session-set/<slug>` follow-up command.
- Remote branch already absent: warning, then treat as success for the remote-delete step.
- Permission denied: exit non-zero with “delete via web UI or ask for repo permissions.”
- Partial completion: print it explicitly as partial state, not as a generic failure.

I would also reorder the close sequence to: remove worktree, attempt remote delete if requested, then delete the local branch. If remote deletion fails, preserve the local branch and report “worktree removed; local branch kept; remote branch still exists.” That is a safer partial-failure shape than deleting the local branch first.

## Q5 — list output format
For human output, use absolute paths. This command is partly an audit/drift tool, and absolute paths make drift immediately obvious regardless of current cwd.

For `--json`, I’d use a versioned top-level object with both raw facts and derived classification:

```json
{
  "schema_version": 1,
  "repo": {
    "primary_root": "C:/.../repo",
    "repo_name": "repo",
    "parent_dir": "C:/.../source/repos",
    "canonical_worktrees_dir": "C:/.../source/repos/repo-worktrees"
  },
  "counts": {
    "main": 1,
    "canonical": 2,
    "drift": 1
  },
  "worktrees": [
    {
      "path": "C:/.../repo-worktrees/foo",
      "head": "abc1234",
      "branch": "session-set/foo",
      "classification": "canonical",
      "is_main": false,
      "slug": "foo",
      "expected_canonical_path": "C:/.../repo-worktrees/foo",
      "branch_matches_convention": true,
      "locked": false,
      "detached": false,
      "prunable": false,
      "issues": []
    }
  ]
}
```

The `issues` array is the future-proof part. `repo_layout_check` can consume that without re-deriving every policy rule.

## Q6 — Verification: route or skip
I would still run the verification route, but narrowly.

The tests in this repo are strong, especially the real-git, real-filesystem pattern in [ai_router/tests/test_close_session_snapshot_flip.py](</c:/Users/denmi/source/repos/dabbler-ai-orchestration/ai_router/tests/test_close_session_snapshot_flip.py>) and [ai_router/tests/test_read_status.py](</c:/Users/denmi/source/repos/dabbler-ai-orchestration/ai_router/tests/test_read_status.py>). So tests should remain the primary correctness gate. But this CLI touches git topology, Windows paths, and operator UX, which are exactly the places an independent reviewer catches things tests miss.

I’d tell the verifier to focus only on:
- main-worktree resolution from inside a linked worktree
- Windows path assumptions and path normalization
- destructive-step ordering and partial-failure UX
- error-message clarity and remediation text
- untested git edge states like missing `origin/HEAD`, detached worktree HEAD, and pre-existing branch/worktree collisions

## Caveats / things you'd want to know before being more confident
My answer is grounded in the inspected code and docs, especially `close_session.py`, `gate_checks.py`, `session_state.py`, `session_log.py`, and `repo-worktree-layout.md`, but I did not inspect an existing `worktree.py` implementation because it does not exist yet.

The biggest unknowns that could change my recommendations are whether `open` must support repos with no `origin/HEAD`, whether local-only repos are in scope at all, and whether you want `open`/`close` themselves to grow a stable JSON output contract later. If the answer to that last one is yes, I would bias even harder toward a separate `worktree_layout.py` data model from day one.
