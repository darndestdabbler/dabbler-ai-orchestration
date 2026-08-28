VERIFIED — The prior-round defect is resolved: `read_tree_blob` now uses the single `run_git(..., binary=True)` seam, preserving exact blob bytes without a second subprocess-spawning function.

## NITS

- **Nit:** `ai_router/journal.py` no longer catches generic `OSError` for binary git calls, whereas the removed `run_git_bytes` did. A rare spawn failure such as `PermissionError` now propagates instead of returning `rc=127`; catching `OSError` would preserve prior behavior.