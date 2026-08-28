ISSUES FOUND

- **Issue 1:** The fix introduces a second git-spawning function, so the promised single `run_git` seam still does not exist.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/journal.py:99-127, ai_router/evidence.py:269-281`
  - **Failure scenario:** Normal verification that reads a blob through `read_tree_blob` calls `run_git_bytes`, which invokes its own `subprocess.run` rather than `run_git`. Instrumentation, error handling, or spawn optimization attached to the promised `run_git` seam therefore misses this git operation. This is probable because reviewed-tree blob reads are an ordinary evidence-verification operation, not an unusual configuration.
  - **Acceptance criterion:** JUDGMENT - Every git process creation in `ai_router` must route through the single `run_git` callable, including byte-preserving `cat-file` reads, with no separate `subprocess.run` implementation for bytes.
  - **Details:**
    - **Violation:** The plan requires that “one function is the only place the router spawns git.” Instead, `journal.py` now contains separate `subprocess.run(["git", ...])` implementations in both `run_git` and the newly added `run_git_bytes`.
    - **Impact:** The session’s one-git-seam deliverable is not achieved. A reasonable reviewer should block merging a change whose stated purpose is consolidation when ordinary evidence traffic still bypasses the designated callable.
    - **Evidence:** `evidence.read_tree_blob` now calls `run_git_bytes`; `run_git_bytes` independently spawns git. Moreover, `evidence.run_git` and `evidence.run_git_bytes` are distinct imported function objects, so wrapping or replacing `evidence.run_git` does not intercept blob reads.
    - **Correct answer:** Extend `run_git` with a byte-preserving mode, or otherwise ensure byte-oriented calls pass through that same callable and its sole process-spawn implementation.
    - **Prior finding disposition:** The prior claim concerning divergent `evidence.run_git`/`journal.run_git` objects and a `ledger.py` bypass is **WITHDRAWN** based on the rebuttal: the former are aliases, and no ledger git call was shown. This issue is new within the fix delta: adding `run_git_bytes` created a distinct bypass and second spawn site.