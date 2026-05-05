# Final design — `python -m ai_router.worktree`

> **Source inputs:** [questions.md](questions.md), [provider-responses/codex.md](provider-responses/codex.md) (GPT-5.4 Medium), [provider-responses/gemini-code-assist.md](provider-responses/gemini-code-assist.md), orchestrator synthesis.
> **Operator guidance:** "When in doubt, choose the option that would likely be best received by developers for its clarity. Otherwise, my best judgment."
> **Status:** Locked. Implementation begins from this document.

This document records the synthesized design after cross-provider
review. Where providers agreed, the agreement is noted. Where they
disagreed, the resolution is captured with rationale for the call.

---

## Module shape

**Single module: `ai_router/worktree.py`** acts as both CLI entry
point AND public library for worktree-layout helpers. Tests at
`ai_router/tests/test_worktree.py`.

**Decision rationale.** GPT recommended a separate
`worktree_layout.py` for helpers + thin `worktree.py` for CLI flow.
Gemini argued the existing pattern in this codebase is "domain
module is library AND CLI entry point" (citing `session_state.py`
and `disposition.py`). For developer clarity, single module wins —
a new contributor opening `ai_router/` knows exactly where to look
for anything worktree-related. If `worktree.py` grows unwieldy, the
extraction is mechanical.

**Helpers are public** (no underscore prefix). Future modules
(`repo_layout_check`, `cancel_session`) `from ai_router.worktree
import classify_worktrees` rather than importing private names.

**Helpers are NOT re-exported from `ai_router/__init__.py`** until
there's a concrete consumer that needs the package-root API.

## Public API surface

### Helpers (importable by other ai_router modules)

```python
from pathlib import Path
from dataclasses import dataclass

@dataclass(frozen=True)
class WorktreeInfo:
    path: Path
    head: str                            # 7-char abbrev sha
    branch: str | None                   # None if detached
    is_main: bool
    classification: str                  # "main" | "canonical" | "drift"
    slug: str | None                     # extracted if classification == "canonical"
    expected_canonical_path: Path | None # what canonical SHOULD be for this slug
    branch_matches_convention: bool      # branch == f"session-set/{slug}" if canonical
    locked: bool
    detached: bool
    prunable: bool
    issues: list[str]                    # diagnostic strings; future-proof for repo_layout_check

@dataclass(frozen=True)
class CloseabilityReport:
    closeable: bool
    dirty: bool                          # uncommitted changes (tracked or untracked)
    unmerged: bool                       # commits not on base branch
    unpushed: bool                       # commits not on upstream (only if upstream configured)
    has_upstream: bool                   # whether the branch has an upstream tracking branch
    blocking_reasons: list[str]          # human-readable strings for the close error message

def find_primary_worktree_root(cwd: Path | None = None) -> Path:
    """Resolve the primary worktree root from any cwd inside a worktree.
    Uses `git rev-parse --git-common-dir` and resolves the parent.
    Raises RuntimeError if cwd is not inside a git repository."""

def canonical_worktree_path(primary_root: Path, slug: str) -> Path:
    """Compute the canonical Option B path for a session-set worktree.
    Returns: <primary_root.parent>/<primary_root.name>-worktrees/<slug>"""

def default_branch(primary_root: Path) -> str:
    """Resolve the repo's default branch name.
    Tries `git symbolic-ref refs/remotes/origin/HEAD` first.
    Falls back to checking 'main' then 'master' as local branches.
    Raises RuntimeError if none of the candidates resolve."""

def enumerate_worktrees(primary_root: Path) -> list[WorktreeInfo]:
    """Enumerate all worktrees registered with git, classify each.
    Calls `git worktree list --porcelain`, parses the output,
    classifies as 'main' / 'canonical' / 'drift', populates
    WorktreeInfo per record."""

def assess_closeability(
    worktree_path: Path,
    *,
    base_ref: str | None = None,
) -> CloseabilityReport:
    """Determine whether a worktree is safe to close cleanly.
    Three checks: dirty, unmerged-vs-base, unpushed-vs-upstream.
    base_ref defaults to default_branch(primary_root) if None.
    Fails OPEN on the unpushed check when no upstream is configured
    (purely-local branches are not 'unpushed' by definition)."""
```

### CLI

```text
python -m ai_router.worktree open <slug> [--base <branch>]
python -m ai_router.worktree close <slug> [--keep-branch] [--delete-remote]
python -m ai_router.worktree list [--json]
```

## Behavior decisions (the six questions, resolved)

### Q1 — Helper-factoring: single module, GPT's renames

- Single `ai_router/worktree.py` (Gemini, on the developer-clarity tiebreaker)
- Rename `find_main_repo_root` → `find_primary_worktree_root` (GPT — git terminology is more precise; "main" overloads with the branch name)
- Rename `is_clean` → `assess_closeability` returning `CloseabilityReport` (GPT — name is more accurate; a worktree can be clean but not closeable)
- Both providers wanted a dataclass return type for the cleanliness check; using GPT's name with the synthesized fields above
- `enumerate_worktrees` stays as one function; not splitting into parse/classify yet (YAGNI)

### Q2 — `--keep-branch` opt-in

Both providers agreed: keep opt-in (default = delete branch). The pre-flight refuses to close dirty/unmerged/unpushed worktrees, so by the time `close` proceeds, the branch is provably safe to delete. The "keep for cherry-pick / comparison" case is exceptional and warrants the explicit flag.

### Q3 — Hard refusal on canonical-path enforcement

Both providers agreed: hard-refuse non-canonical paths in `open`. No `--force-non-canonical` flag, no env-var escape hatch.

The escape hatch already exists for the legitimate "I need a non-canonical worktree" case: raw `git worktree add`. `ai_router.worktree` does one thing — manage canonical worktrees — and refuses to undermine that guarantee with opt-outs that agents and operators-in-a-hurry will reach for to bypass errors.

### Q4 — Close sequence: GPT's reordering with hybrid failure UX

**Sequence:** `worktree-remove` → (if `--delete-remote`) `remote-branch-delete` → `local-branch-delete`.

**Decision rationale.** GPT proposed this reordering specifically so a failed remote-delete leaves the local branch intact as a recovery anchor. Gemini argued for the simpler `worktree → local → remote` order with fail-forward semantics, citing the pre-flight checks as proof that no work is lost.

GPT's ordering wins because the unpushed-check is the brittlest pre-flight check (Gemini herself noted that purely-local branches must "fail open" on this check, meaning we'd allow deletion in cases where work isn't anywhere else). GPT's order is the same outcome on success, but on failure the operator has a recovery anchor "for free."

**Failure-mode handling (synthesized):**

| Failure | Behavior | Exit code |
|---|---|---|
| Network / auth on remote-delete | Print exact follow-up command; preserve local branch | non-zero |
| Permission denied on remote-delete | Print web-UI suggestion; preserve local branch | non-zero |
| Remote branch already absent | Info log, treat as success; proceed to local-delete | 0 |
| Worktree-remove fails (file lock) | Stop; preserve everything; suggest `cleanup-dev-orphans` | non-zero |
| Local-branch-delete fails (somehow) | Print explicit partial-state message; preserve everything | non-zero |

**Partial-completion message format:**
```text
[partial] worktree removed; remote: <reason>; local branch kept for recovery.
To finish: <exact command to run>
```

### Q5 — `list` output: Gemini's relative paths + synthesized JSON schema

**Human output uses relative-to-primary-worktree paths.** Gemini's example showed this works for both readability AND drift visibility:

```text
[main]      .                                       (branch: main)
[canonical] ../<repo>-worktrees/vba                 (branch: session-set/vba)
[drift]     .claude/worktrees/old                   (branch: old)
```

Drift cases stand out because they don't match the expected `..\<repo>-worktrees\<slug>` pattern. Absolute paths would just be noise. Relative wins on developer clarity.

**JSON output uses absolute paths** (both providers agreed) and the
synthesized schema below. GPT contributed `schema_version`,
`repo` block, `counts`, `issues`, `expected_canonical_path`,
`branch_matches_convention`, `locked`/`detached`/`prunable`. Gemini
contributed `commit` field and the absolute-paths convention.

```json
{
  "schema_version": 1,
  "repo": {
    "primary_root": "C:/.../<repo>",
    "repo_name": "<repo>",
    "parent_dir": "C:/.../source/repos",
    "canonical_worktrees_dir": "C:/.../source/repos/<repo>-worktrees"
  },
  "counts": { "main": 1, "canonical": 0, "drift": 0 },
  "worktrees": [
    {
      "path": "C:/.../<repo>",
      "head": "abc1234",
      "branch": "main",
      "classification": "main",
      "is_main": true,
      "slug": null,
      "expected_canonical_path": null,
      "branch_matches_convention": true,
      "locked": false,
      "detached": false,
      "prunable": false,
      "issues": []
    }
  ]
}
```

The `issues` array is the future-proofing for `repo_layout_check`:
that future tool can consume the JSON and surface drift without
re-deriving policy rules. Empty list when the worktree conforms.

### Q6 — Skip end-of-session verification route

Both providers agreed tests are the canonical verification surface
for this kind of code. Gemini was direct: "you have already spent
your verification budget effectively by routing this upfront design
review." GPT agreed in spirit but suggested a narrow verifier focus.

**Decision:** Skip the route. **Use GPT's focus list as a
tests-must-cover checklist** — these are the exact things tests need
to verify so the absence of an LLM diff review doesn't matter:

- Primary-worktree resolution from inside a linked worktree (not just from main)
- Windows path-format handling (forward slashes vs backslashes from `git worktree list --porcelain`)
- Destructive-step ordering on close (the sequence locked above)
- Error-message clarity (test that error text contains the exact recovery command)
- Edge states:
  - Repo with no `origin/HEAD` configured
  - Worktree with detached HEAD
  - Pre-existing branch collision on `open` (slug's branch name already exists)
  - Pre-existing path collision on `open` (canonical path exists but isn't a registered worktree)
  - Purely-local branch with no upstream (closeability check must fail open on unpushed)

## Caveats addressed in implementation

These are the corner cases both providers flagged in their caveats sections:

- **Missing `origin/HEAD`.** `default_branch()` falls back to checking local `main`, then local `master`. Raises `RuntimeError` with a clear message ("set origin/HEAD via `git remote set-head origin <branch>`") if neither resolves.
- **Purely-local branch never pushed.** `assess_closeability()` returns `unpushed=False, has_upstream=False` rather than failing or treating it as unpushed. Documented in the dataclass comment.
- **Git porcelain path format on Windows.** Empirically: git on Windows emits forward slashes in `--porcelain` output. Parser uses `Path()` to normalize regardless. Tested on Windows specifically.
- **Cyclical imports.** `worktree.py` does NOT import from `cancel_session.py`. The error message pointing operators to `cancel_session` for the messy-close path is a string literal in `worktree.py`'s error code.

## Implementation outline

```
ai_router/worktree.py
  # ~250-350 lines

  # imports + dataclasses (~50 lines)
  WorktreeInfo, CloseabilityReport
  
  # public helpers (~120 lines)
  find_primary_worktree_root()
  canonical_worktree_path()
  default_branch()
  enumerate_worktrees()
  assess_closeability()
  
  # internal helpers (~50 lines)
  _run_git()  # subprocess wrapper with error capture, follows utils.py style
  _parse_porcelain_block()  # parses one record from `git worktree list --porcelain`
  _classify_worktree()  # main / canonical / drift
  _extract_slug_from_canonical_path()
  
  # subcommands (~80 lines)
  cmd_open(args)
  cmd_close(args)
  cmd_list(args)
  
  # CLI dispatcher (~30 lines)
  main()
  if __name__ == "__main__": main()
```

```
ai_router/tests/test_worktree.py
  # ~400-500 lines, real-filesystem fixtures via tempfile.TemporaryDirectory + git init
  
  # Fixtures:
  #   tmp_repo()          — primary worktree only
  #   tmp_repo_with_canonical_worktree()
  #   tmp_repo_with_drift_worktree()
  #   tmp_repo_dirty()    — dirty primary
  #   tmp_repo_unmerged() — branch ahead of base
  
  # Test groups:
  #   TestFindPrimaryWorktreeRoot
  #   TestCanonicalWorktreePath
  #   TestDefaultBranch (incl. fallback when origin/HEAD missing)
  #   TestEnumerateWorktrees (incl. drift detection)
  #   TestAssessCloseability (incl. fail-open on no-upstream)
  #   TestOpenCommand (incl. canonical-path enforcement, branch collision, path collision)
  #   TestCloseCommand (incl. close ordering, partial-completion UX)
  #   TestListCommand (incl. JSON schema, relative-path human output)
  #   TestCrossPlatformPaths (Windows-specific path-format handling)
```

## Out of scope for this set (deferred follow-ups)

- **`worktree move-to-canonical <path>`** — GPT suggested this as the migration/repair sibling to `open`. Defer to Set 015 / `repo_layout_check` work; not needed for this set's regression-guardrail goal.
- **Stable JSON output for `open`/`close`** (GPT's caveat). Defer until a concrete consumer needs it; YAGNI for now.
- **`enumerate_worktrees` parse/classify split** (GPT's Q1 suggestion). Defer until a future caller needs raw porcelain output; trivial extraction later.
- **`__init__.py` re-exports.** Defer until a concrete consumer outside `ai_router/` wants the package-root API.

## Provider attribution summary

| Decision | Driver | Why |
|---|---|---|
| Single module | Gemini (developer-clarity tiebreaker) | Matches existing `session_state.py` / `disposition.py` pattern |
| `find_primary_worktree_root` rename | GPT | Git terminology is more precise |
| `assess_closeability` + `CloseabilityReport` | GPT | Name reflects what the function actually decides |
| `--keep-branch` opt-in | Both | Pre-flight covers the data-loss case |
| Hard refusal on non-canonical paths | Both | Raw `git worktree add` is the existing escape hatch |
| Close sequence: worktree → remote → local | GPT | Failed remote-delete preserves local branch as recovery anchor |
| Per-failure-mode messaging | GPT | "Exit non-zero with exact follow-up command" is more useful than soft warnings |
| Relative paths in human `list` output | Gemini | Demonstrably more readable; drift cases still stand out |
| Absolute paths in JSON | Both | Unambiguous for tooling consumption |
| `schema_version` + `issues` array in JSON | GPT | Future-proofing for `repo_layout_check` |
| `commit` field in JSON | Gemini | Practical for downstream consumers |
| Skip end-of-session verification route | Both | Tests are the canonical verification for tooling |
| Tests-must-cover checklist | GPT | The narrow focus areas an LLM diff review WOULD catch |
| Fail-open on no-upstream check | Gemini | Purely-local branches aren't "unpushed" |

Both providers were valuable; the synthesis isn't "one beat the
other" but "each contributed sharper thinking on different
dimensions." Documented per the Set 016 case-study principle.
