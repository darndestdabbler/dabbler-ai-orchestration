# Remediation — Set 123 Session 1, Round 2 (supplementary completeness pass)

**Verdict: ACCEPTED. One Major, and it is the mirror image of round 1's
defect B — which is exactly what a completeness pass is for.**

**The finding:** `find_project_file()` accepted the **nearest**
`project-verify-type.txt` on the walk up to the repository boundary, not
the file at the project root. A nested copy — a stale sample, a fixture,
a scratch directory — could therefore answer for the whole project, and
the same repository would derive a different `transport.profile`
depending on which directory a tool was launched from.

Round 1 caught the *write* side of this (a write landing in a nested
directory); the supplementary pass caught the *read* side that would have
honoured such a file. Fixing only one of the two would have left the
class alive — a bug is a bug CLASS (`L-069-1`), and here the two sites are
the same idea spelled twice.

## The fix

The walk-up now resolves a **project root** and the lookup happens
**there and nowhere else**:

- `find_project_root(start)` returns the first ancestor holding a `.git`
  entry, or `None`. It tests `.exists()`, not `is_dir()`, because in a git
  **worktree** `.git` is a file — and the sibling-worktrees layout is this
  shop's standard, so an `is_dir()` check would have made every worktree
  rootless.
- `find_project_file(start)` returns `<root>/project-verify-type.txt` if
  it exists, and never considers any other directory.
- `None` from `find_project_root` is a real answer, not a failure: a
  committed file cannot exist outside a repository, so a directory with no
  repository above it has no project answer to read. Inventing one from
  the working directory is precisely what makes the fact cwd-dependent.

## The falsifier

`test_the_project_file_is_read_at_the_project_root_and_nowhere_else`
plants **both** look-alikes at once — a nested `project-verify-type.txt`
holding `DIRECT_API` and a root one holding `COPILOT_CLI` — resolves from
the nested directory, and asserts the **root** file answers. It also
asserts that a file *above* the repository boundary is not read at all.
Pre-fix, the nested file won and the test fails.
