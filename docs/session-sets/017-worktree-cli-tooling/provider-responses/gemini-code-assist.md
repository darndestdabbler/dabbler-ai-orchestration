## Q1 — Helper-factoring granularity

The proposed granularity is largely correct, but the module boundary and return types should be adjusted to match existing ai_router patterns.

- **Module boundary:** Put these helpers in `ai_router/worktree.py` and expose them as public functions (no underscore prefix). Looking at `ai_router/session_state.py` and `ai_router/disposition.py`, the codebase embraces domain-specific modules that act as both the CLI entry point (via `__main__` block or `if __name__ == "__main__":`) and the shared library for that domain. Creating a separate `worktree_layout.py` would be over-engineering. Future modules like `repo_layout_check` can simply `from ai_router.worktree import enumerate_worktrees`.
- **Too coarse? (`is_clean`):** Keep `is_clean` as a single function, but have it return a dataclass (similar to `GateResult` in `ai_router/close_session.py`). Running three separate git subprocess calls under the hood is fine, but bundling them into a single `CleanlinessReport(dirty: bool, unmerged: bool, unpushed: bool)` makes consumption trivial for the caller.
- **Path typing:** As you noted, use `pathlib.Path` universally in these helpers. `ai_router/utils.py` relies heavily on string paths, but for structural layout checking, `Path` avoids Windows/POSIX slash bugs.

## Q2 — --keep-branch default vs opt-in

Stick with your current proposal: `--keep-branch` should be opt-in (default to deletion).

The pre-flight checks make default deletion completely safe. If `is_clean` enforces that the worktree has no uncommitted changes, no unpushed commits, and no unmerged commits relative to base, then the branch is mathematically identical to the base branch (or fully reachable from it).

If the operator makes a mistake and closes the wrong active worktree, they haven't lost any work. They have only lost a local pointer to a commit that is already part of base. They can recreate it trivially with `git branch session-set/<slug> <base>`. Changing the default to keep the branch would inevitably lead to local branch clutter, recreating the exact "discipline failure" the operator is trying to fix.

## Q3 — Canonical-path enforcement strictness

Hard refusal. Do not provide an escape hatch flag like `--force-non-canonical`.

The purpose of `ai_router.worktree` is policy enforcement. If we add an escape hatch, autonomous agents (or humans in a hurry) will inevitably append it to bypass errors rather than adhering to the layout.

If the operator legitimately needs an exploratory worktree outside the canonical path, they have a built-in escape hatch: raw `git worktree add`. The raw git CLI still works perfectly fine alongside Option B. `ai_router.worktree` should proudly do one thing: manage canonical worktrees.

## Q4 — Remote-delete failure modes

The guiding principle here should be **fail-forward**. By the time we attempt remote deletion, the local worktree and local branch are already gone. We cannot (and should not) roll that back.

- **Network error / Auth failure:** Soft error. Print a warning to stderr: `[Warning] Local worktree and branch removed, but remote deletion failed (Network/Auth). Run 'git push origin --delete session-set/<slug>' when online.` Return exit code 0 or a distinct non-fatal code (e.g., 0, but log the warning).
- **Remote moved upstream / already deleted:** Silent success (or Info-level log). If the branch is already gone from the remote, our desired end state is achieved.
- **Permission denied:** Soft error, similar to network failure. `[Warning] Permission denied deleting remote branch. Please delete via GitHub UI.`

Do not let a remote-delete failure crash the script in a way that suggests the close operation failed. Surface the partially-completed state clearly to the operator.

## Q5 — list output format

**Path normalization (Human output):** Print paths relative to the main repo root, not the cwd. The main repo root is the stable anchor of the Option B layout. Absolute paths on Windows (`C:\Users\denmi\source\repos\...`) are too verbose for a glance-readable CLI table. Example human output:

```text
[main]      .                                      (branch: main)
[canonical] ../dabbler-access-harvester-worktrees/vba  (branch: session-set/vba)
[drift]     .claude/worktrees/old-session          (branch: old-session)
```

**`--json` schema:** Use absolute paths in the JSON to ensure unambiguous consumption by downstream tools like `repo_layout_check`.

```json
{
  "repo_root": "C:\\Users\\denmi\\source\\repos\\dabbler-access-harvester",
  "worktrees": [
    {
      "classification": "main",
      "slug": null,
      "path": "C:\\Users\\denmi\\source\\repos\\dabbler-access-harvester",
      "branch": "main",
      "commit": "bfe54d0"
    },
    {
      "classification": "canonical",
      "slug": "vba-symbol-resolution-session-1",
      "path": "C:\\Users\\denmi\\source\\repos\\dabbler-access-harvester-worktrees\\vba-symbol-resolution-session-1",
      "branch": "session-set/vba-symbol-resolution-session-1",
      "commit": "8ccabf0"
    },
    {
      "classification": "drift",
      "slug": null,
      "path": "C:\\Users\\denmi\\source\\repos\\dabbler-access-harvester\\.claude\\worktrees\\vba-symbol-resolution-session-1",
      "branch": "worktree-vba-symbol-resolution-session-1",
      "commit": "8ccabf0"
    }
  ]
}
```

## Q6 — Verification: route or skip

Skip the route.

The proposal argument is correct: your test suite (as seen in `test_utils.py` and `test_close_session.py`) is rigorous and relies on actual subprocess execution and real temporary filesystems. A language model reviewing the diff of a `subprocess.run(['git', 'worktree', 'add', ...])` wrapper is going to provide very little value over a passing pytest suite that actually runs the git commands.

You have already spent your verification budget effectively by routing this upfront design review. Invest the time in writing comprehensive pytest fixtures for the drift cases (Anomalies A, B, C) instead of a post-hoc LLM review.

## Caveats / things you'd want to know before being more confident

- **Git Porcelain Path Normalization on Windows:** `git worktree list --porcelain` outputs paths. I am assuming, but would need to verify, exactly how Git formats these paths on Windows (e.g., does it use forward slashes `C:/Users/...` or backslashes `C:\Users\...`?). Your `enumerate_worktrees` parser must handle this gracefully when mapping against `pathlib.Path` objects.
- **Unpushed Commits Check:** You mentioned `git rev-list base..HEAD` to check for unmerged commits. To check for unpushed commits, you need to ensure the upstream tracking branch is actually set. If a branch is purely local (created via `git worktree add -b` and never pushed), the "unpushed" check needs to fail open (allow deletion) or it will trap the operator.
- **Cyclical Imports:** I assume `repo_layout_check` and `cancel_session` are unwritten. If they end up importing `worktree` for helpers, ensure `worktree` doesn't import them back (e.g., for the error message pointer in `close`), or do the import lazily inside the close function.
