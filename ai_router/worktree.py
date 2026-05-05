"""
worktree.py — Canonical worktree CLI for the dabbler repo layout.

This module is both the public library AND the CLI entry point for
managing git worktrees in the canonical "sibling-worktrees-folder"
(Option B) layout adopted by Set 016. See
``docs/planning/repo-worktree-layout.md`` for the canonical layout
spec and ``docs/session-sets/017-worktree-cli-tooling/design.md``
for the design rationale.

The canonical layout::

    ~/source/repos/
      <repo>/                       # primary worktree, never moves
        .git/
        ...source files...
      <repo>-worktrees/             # sibling container, only when worktrees exist
        <session-set-slug>/         # one subfolder per active worktree
        <other-slug>/

CLI surface::

    python -m ai_router.worktree open <slug> [--base <branch>]
    python -m ai_router.worktree close <slug> [--keep-branch] [--delete-remote]
    python -m ai_router.worktree list [--json]

Public helpers (importable by other ai_router modules)::

    find_primary_worktree_root(cwd) -> Path
    canonical_worktree_path(primary_root, slug) -> Path
    default_branch(primary_root) -> str
    enumerate_worktrees(primary_root) -> list[WorktreeInfo]
    assess_closeability(worktree_path, *, base_ref) -> CloseabilityReport

Design decisions are documented in
``docs/session-sets/017-worktree-cli-tooling/design.md``. Notable
behaviors:

- ``open`` HARD-REFUSES non-canonical paths. No escape hatch flag.
  The legitimate "I want a non-canonical worktree" case is served
  by raw ``git worktree add``.
- ``close`` runs ``worktree-remove`` → (optional) ``remote-delete``
  → ``local-branch-delete``. On failed remote-delete, the local
  branch is preserved as a recovery anchor; exit code 2 signals
  partial completion.
- ``close`` pre-flight refuses dirty / unmerged / unpushed worktrees.
  Operators with messy state should use ``cancel_session`` (queued
  separately).
- ``assess_closeability`` fails OPEN on the unpushed check when no
  upstream tracking branch is configured (purely-local branches
  aren't "unpushed" by definition).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


CANONICAL_BRANCH_PREFIX = "session-set/"


# ======================================================================
# 1. Dataclasses
# ----------------------------------------------------------------------

@dataclass(frozen=True)
class WorktreeInfo:
    """One row of the worktree topology, classified."""

    path: Path
    head: str  # 7-char abbreviated SHA (or empty for bare/uninitialized)
    branch: Optional[str]  # None if detached HEAD
    is_main: bool
    classification: str  # "main" | "canonical" | "drift"
    slug: Optional[str]  # extracted only when classification == "canonical"
    expected_canonical_path: Optional[Path]
    branch_matches_convention: bool
    locked: bool
    detached: bool
    prunable: bool
    issues: tuple[str, ...] = ()  # diagnostic strings; empty means conforming


@dataclass(frozen=True)
class CloseabilityReport:
    """Result of pre-flight checks before closing a worktree.

    ``unpushed`` is False when ``has_upstream`` is False; purely-local
    branches are not "unpushed" by definition. The CLI relies on this
    so it doesn't trap operators with branches that were never pushed.
    """

    closeable: bool
    dirty: bool  # uncommitted changes, tracked or untracked
    unmerged: bool  # commits not on base branch
    unpushed: bool  # commits not on upstream (only meaningful if has_upstream)
    has_upstream: bool
    blocking_reasons: tuple[str, ...] = ()


# ======================================================================
# 2. Public helpers — importable by other ai_router modules
# ----------------------------------------------------------------------

def find_primary_worktree_root(cwd: Optional[Path] = None) -> Path:
    """Resolve the primary worktree root from any cwd inside a worktree.

    Uses ``git rev-parse --git-common-dir`` which returns the path of
    the shared ``.git`` directory regardless of whether ``cwd`` is in
    the primary worktree or a linked worktree. The parent of that dir
    is the primary worktree root.

    Raises RuntimeError if cwd is not inside a git repository.
    """
    if cwd is None:
        cwd = Path.cwd()

    result = subprocess.run(
        ["git", "-C", str(cwd), "rev-parse", "--git-common-dir"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Not in a git repository (cwd={cwd}): {result.stderr.strip()}"
        )

    common_dir = Path(result.stdout.strip())
    if not common_dir.is_absolute():
        common_dir = (cwd / common_dir).resolve()
    else:
        common_dir = common_dir.resolve()

    # Standard layout: <primary>/.git is the common dir.
    return common_dir.parent


def canonical_worktree_path(primary_root: Path, slug: str) -> Path:
    """Compute the canonical Option B path for a session-set worktree."""
    primary = primary_root.resolve()
    return primary.parent / f"{primary.name}-worktrees" / slug


def default_branch(primary_root: Path) -> str:
    """Resolve the default branch name with fallbacks.

    Tries ``origin/HEAD`` first. Falls back to local ``main``, then
    local ``master``. Raises RuntimeError with a remediation hint if
    none resolve.
    """
    # Preferred: origin/HEAD
    result = subprocess.run(
        ["git", "-C", str(primary_root),
         "symbolic-ref", "refs/remotes/origin/HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        full_ref = result.stdout.strip()
        prefix = "refs/remotes/origin/"
        if full_ref.startswith(prefix):
            return full_ref[len(prefix):]

    # Fallback: local main, then master
    for candidate in ("main", "master"):
        check = subprocess.run(
            ["git", "-C", str(primary_root),
             "rev-parse", "--verify", "--quiet", f"refs/heads/{candidate}"],
            capture_output=True,
            text=True,
            check=False,
        )
        if check.returncode == 0:
            return candidate

    raise RuntimeError(
        f"Could not resolve default branch for {primary_root}. "
        f"Set origin/HEAD via 'git remote set-head origin <branch>' "
        f"or ensure 'main' or 'master' exists locally."
    )


def enumerate_worktrees(primary_root: Path) -> list[WorktreeInfo]:
    """Enumerate registered worktrees and classify each.

    Returns a list of WorktreeInfo records, one per registered
    worktree. Calls ``git worktree list --porcelain``, parses, and
    classifies each as main / canonical / drift relative to the
    primary worktree root.
    """
    result = subprocess.run(
        ["git", "-C", str(primary_root),
         "worktree", "list", "--porcelain"],
        capture_output=True,
        text=True,
        check=True,
    )
    return _parse_and_classify(result.stdout, primary_root)


def assess_closeability(
    worktree_path: Path,
    *,
    base_ref: Optional[str] = None,
) -> CloseabilityReport:
    """Three-check pre-flight for whether a worktree is safe to close cleanly.

    - dirty: ``git status --porcelain`` non-empty
    - unmerged: commits in HEAD not in base_ref
    - unpushed: commits in HEAD not in @{upstream} — fails OPEN
      (returns False) when no upstream is configured

    base_ref defaults to the repo's default branch if None.
    """
    if base_ref is None:
        primary = find_primary_worktree_root(worktree_path)
        base_ref = default_branch(primary)

    blocking: list[str] = []

    # Check 1: dirty
    status = subprocess.run(
        ["git", "-C", str(worktree_path), "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=True,
    )
    dirty = bool(status.stdout.strip())
    if dirty:
        blocking.append("Worktree has uncommitted changes (run 'git status' to inspect)")

    # Check 2: unmerged vs base
    unmerged = False
    rev_count = subprocess.run(
        ["git", "-C", str(worktree_path),
         "rev-list", "--count", f"{base_ref}..HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    if rev_count.returncode != 0:
        unmerged = True
        blocking.append(
            f"Could not verify merge status against {base_ref}: "
            f"{rev_count.stderr.strip()}"
        )
    else:
        try:
            count = int(rev_count.stdout.strip())
            if count > 0:
                unmerged = True
                blocking.append(
                    f"Branch has {count} commit(s) not merged into {base_ref}"
                )
        except ValueError:
            unmerged = True
            blocking.append(
                f"Unexpected output from rev-list: {rev_count.stdout.strip()!r}"
            )

    # Check 3: unpushed — fails OPEN if no upstream
    has_upstream = False
    unpushed = False
    upstream_check = subprocess.run(
        ["git", "-C", str(worktree_path),
         "rev-parse", "--verify", "--quiet", "@{upstream}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if upstream_check.returncode == 0:
        has_upstream = True
        unpushed_count = subprocess.run(
            ["git", "-C", str(worktree_path),
             "rev-list", "--count", "@{upstream}..HEAD"],
            capture_output=True,
            text=True,
            check=False,
        )
        if unpushed_count.returncode == 0:
            try:
                count = int(unpushed_count.stdout.strip())
                if count > 0:
                    unpushed = True
                    blocking.append(
                        f"Branch has {count} commit(s) not pushed to upstream"
                    )
            except ValueError:
                pass  # malformed output; ignore rather than block

    closeable = not (dirty or unmerged or unpushed)

    return CloseabilityReport(
        closeable=closeable,
        dirty=dirty,
        unmerged=unmerged,
        unpushed=unpushed,
        has_upstream=has_upstream,
        blocking_reasons=tuple(blocking),
    )


# ======================================================================
# 3. Internal helpers — porcelain parsing + classification
# ----------------------------------------------------------------------

def _parse_and_classify(porcelain: str, primary_root: Path) -> list[WorktreeInfo]:
    primary_resolved = primary_root.resolve()
    canonical_container = (
        primary_resolved.parent / f"{primary_resolved.name}-worktrees"
    )

    blocks = porcelain.strip().split("\n\n")
    results: list[WorktreeInfo] = []
    for block in blocks:
        if not block.strip():
            continue
        info = _parse_single_block(block, primary_resolved, canonical_container)
        if info is not None:
            results.append(info)
    return results


def _parse_single_block(
    block: str,
    primary_resolved: Path,
    canonical_container: Path,
) -> Optional[WorktreeInfo]:
    fields: dict[str, str] = {}
    flags: set[str] = set()

    for line in block.split("\n"):
        line = line.strip()
        if not line:
            continue
        if " " in line:
            key, value = line.split(" ", 1)
            fields[key] = value
        else:
            # Bare flag tokens: bare, detached, locked, prunable
            flags.add(line)

    if "worktree" not in fields:
        return None

    raw_path = fields["worktree"]
    # Git on Windows emits forward slashes in --porcelain output; pathlib
    # normalizes either way.
    path = Path(raw_path).resolve()

    head_full = fields.get("HEAD", "")
    head = head_full[:7] if head_full else ""

    detached = "detached" in flags
    branch_full = fields.get("branch", "")
    if detached:
        branch: Optional[str] = None
    elif branch_full.startswith("refs/heads/"):
        branch = branch_full[len("refs/heads/"):]
    elif branch_full:
        branch = branch_full
    else:
        # No branch field and not flagged detached — treat as detached
        branch = None

    locked = "locked" in flags
    prunable = "prunable" in flags
    is_bare = "bare" in flags

    is_main = (path == primary_resolved)

    if is_bare:
        # A bare repo entry shouldn't appear as a working worktree; skip.
        # (We're past the bare-repo era; if one shows up, it's drift.)
        return None

    issues: list[str] = []

    if is_main:
        classification = "main"
        slug: Optional[str] = None
        expected_canonical: Optional[Path] = None
        branch_matches = True
    elif path.parent == canonical_container:
        classification = "canonical"
        slug = path.name
        expected_canonical = path
        expected_branch = f"{CANONICAL_BRANCH_PREFIX}{slug}"
        branch_matches = (branch == expected_branch)
        if not branch_matches:
            issues.append(
                f"Branch name does not match convention; "
                f"expected {expected_branch!r}, got {branch!r}"
            )
    else:
        classification = "drift"
        slug = None
        expected_canonical = None
        branch_matches = False
        issues.append(
            f"Non-canonical path; expected under {canonical_container}"
        )

    if locked:
        issues.append("Worktree is locked")
    if prunable:
        issues.append("Worktree is prunable (filesystem missing or corrupt)")

    return WorktreeInfo(
        path=path,
        head=head,
        branch=branch,
        is_main=is_main,
        classification=classification,
        slug=slug,
        expected_canonical_path=expected_canonical,
        branch_matches_convention=branch_matches,
        locked=locked,
        detached=detached,
        prunable=prunable,
        issues=tuple(issues),
    )


def _branch_exists(primary_root: Path, branch_name: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(primary_root),
         "rev-parse", "--verify", "--quiet", f"refs/heads/{branch_name}"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


# ======================================================================
# 4. Subcommand implementations
# ----------------------------------------------------------------------

def cmd_open(args: argparse.Namespace) -> int:
    cwd = Path.cwd()
    try:
        primary_root = find_primary_worktree_root(cwd)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    slug = args.slug
    target_path = canonical_worktree_path(primary_root, slug)
    branch_name = f"{CANONICAL_BRANCH_PREFIX}{slug}"

    # Refuse if target path exists already
    if target_path.exists():
        print(
            f"Error: target path already exists: {target_path}\n"
            f"  If a worktree is registered there already, use "
            f"'python -m ai_router.worktree list' to confirm and "
            f"'cd' directly. Otherwise, remove the stale dir first.",
            file=sys.stderr,
        )
        return 1

    # Refuse if a worktree is already registered for this slug or branch
    existing = enumerate_worktrees(primary_root)
    for wt in existing:
        if wt.slug == slug:
            print(
                f"Error: a worktree for slug '{slug}' is already registered:\n"
                f"  path: {wt.path}\n"
                f"  branch: {wt.branch}\n"
                f"Use 'python -m ai_router.worktree close {slug}' first.",
                file=sys.stderr,
            )
            return 1
        if wt.branch == branch_name:
            print(
                f"Error: branch {branch_name!r} is already checked out in another worktree:\n"
                f"  path: {wt.path}\n"
                f"Pick a different slug or close the other worktree first.",
                file=sys.stderr,
            )
            return 1

    # Determine base
    if args.base:
        base = args.base
    else:
        try:
            base = default_branch(primary_root)
        except RuntimeError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1

    # Create canonical container if needed
    container = target_path.parent
    container.mkdir(parents=True, exist_ok=True)

    # Build the git command
    if _branch_exists(primary_root, branch_name):
        # Branch already exists; check it out in the new worktree
        cmd = [
            "git", "-C", str(primary_root),
            "worktree", "add", str(target_path), branch_name,
        ]
    else:
        cmd = [
            "git", "-C", str(primary_root),
            "worktree", "add", "-b", branch_name, str(target_path), base,
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        print(
            f"Error: git worktree add failed:\n{result.stderr.strip()}",
            file=sys.stderr,
        )
        return 1

    print(f"Worktree opened: {target_path}")
    print(f"Branch: {branch_name} (from {base})")
    print(f"Next: cd {target_path}")
    return 0


def cmd_close(args: argparse.Namespace) -> int:
    cwd = Path.cwd()
    try:
        primary_root = find_primary_worktree_root(cwd)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    slug = args.slug
    target_path = canonical_worktree_path(primary_root, slug)
    branch_name = f"{CANONICAL_BRANCH_PREFIX}{slug}"

    # Verify the canonical worktree exists
    if not target_path.exists():
        print(
            f"Error: no worktree at canonical path: {target_path}\n"
            f"Use 'python -m ai_router.worktree list' to see what's registered.",
            file=sys.stderr,
        )
        return 1

    # Verify it's actually registered with git at this path
    registered = enumerate_worktrees(primary_root)
    target_resolved = target_path.resolve()
    if not any(wt.path == target_resolved for wt in registered):
        print(
            f"Error: path exists but is not a registered worktree: {target_path}\n"
            f"Use 'git worktree prune' if this is a stale leftover.",
            file=sys.stderr,
        )
        return 1

    # Pre-flight: closeability
    report = assess_closeability(target_path)
    if not report.closeable:
        print("Error: worktree is not safe to close cleanly:", file=sys.stderr)
        for reason in report.blocking_reasons:
            print(f"  - {reason}", file=sys.stderr)
        print(
            f"\nFor the messy-close path (preserve work as patch+bundle), use:\n"
            f"  python -m ai_router.cancel_session {slug}\n"
            f"(That CLI is queued; until it ships, resolve manually.)",
            file=sys.stderr,
        )
        return 1

    # Step 1: remove the worktree
    rm_result = subprocess.run(
        ["git", "-C", str(primary_root),
         "worktree", "remove", str(target_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if rm_result.returncode != 0:
        print(
            f"Error: git worktree remove failed:\n{rm_result.stderr.strip()}\n"
            f"\nIf file locks are blocking, try:\n"
            f"  python -m ai_router.utils cleanup-dev-orphans --match-path {primary_root.name}",
            file=sys.stderr,
        )
        return 1

    print(f"Worktree removed: {target_path}")

    # Step 2: remote-delete (if requested)
    if args.delete_remote:
        confirm = input(
            f"Delete remote branch 'origin/{branch_name}'? [y/N]: "
        ).strip().lower()
        if confirm in ("y", "yes"):
            push_result = subprocess.run(
                ["git", "-C", str(primary_root),
                 "push", "origin", "--delete", branch_name],
                capture_output=True,
                text=True,
                check=False,
            )
            if push_result.returncode == 0:
                print(f"Remote branch deleted: origin/{branch_name}")
            else:
                stderr = (push_result.stderr or "").strip()
                if (
                    "remote ref does not exist" in stderr
                    or "deleted" in stderr.lower()
                ):
                    print(f"Remote branch already absent: origin/{branch_name}")
                else:
                    # Real failure — preserve local branch as recovery anchor
                    print(
                        f"\n[partial] worktree removed; remote-delete failed; "
                        f"local branch kept for recovery.\n"
                        f"Reason: {stderr}\n"
                        f"To finish: git push origin --delete {branch_name}",
                        file=sys.stderr,
                    )
                    return 2
        else:
            print("Remote deletion skipped.")

    # Step 3: local branch delete (unless --keep-branch)
    if not args.keep_branch:
        del_result = subprocess.run(
            ["git", "-C", str(primary_root),
             "branch", "-d", branch_name],
            capture_output=True,
            text=True,
            check=False,
        )
        if del_result.returncode != 0:
            print(
                f"\n[partial] worktree removed; local-branch-delete failed.\n"
                f"Reason: {del_result.stderr.strip()}\n"
                f"To finish: git branch -d {branch_name}",
                file=sys.stderr,
            )
            return 2
        print(f"Local branch deleted: {branch_name}")
    else:
        print(f"Local branch kept: {branch_name} (--keep-branch)")

    # Step 4: remove empty container
    container = target_path.parent
    try:
        container.rmdir()
        print(f"Worktrees container removed (empty): {container}")
    except OSError:
        pass  # not empty, leave it alone

    return 0


def cmd_list(args: argparse.Namespace) -> int:
    cwd = Path.cwd()
    try:
        primary_root = find_primary_worktree_root(cwd)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    worktrees = enumerate_worktrees(primary_root)

    if args.json:
        return _emit_json(worktrees, primary_root)
    return _emit_human(worktrees, primary_root)


def _emit_json(
    worktrees: list[WorktreeInfo],
    primary_root: Path,
) -> int:
    primary_resolved = primary_root.resolve()
    canonical_container = (
        primary_resolved.parent / f"{primary_resolved.name}-worktrees"
    )

    counts = {"main": 0, "canonical": 0, "drift": 0}
    for wt in worktrees:
        counts[wt.classification] = counts.get(wt.classification, 0) + 1

    def _to_posix(p: Path) -> str:
        return str(p).replace("\\", "/")

    output = {
        "schema_version": 1,
        "repo": {
            "primary_root": _to_posix(primary_resolved),
            "repo_name": primary_resolved.name,
            "parent_dir": _to_posix(primary_resolved.parent),
            "canonical_worktrees_dir": _to_posix(canonical_container),
        },
        "counts": counts,
        "worktrees": [
            {
                "path": _to_posix(wt.path),
                "head": wt.head,
                "branch": wt.branch,
                "classification": wt.classification,
                "is_main": wt.is_main,
                "slug": wt.slug,
                "expected_canonical_path": (
                    _to_posix(wt.expected_canonical_path)
                    if wt.expected_canonical_path is not None else None
                ),
                "branch_matches_convention": wt.branch_matches_convention,
                "locked": wt.locked,
                "detached": wt.detached,
                "prunable": wt.prunable,
                "issues": list(wt.issues),
            }
            for wt in worktrees
        ],
    }
    print(json.dumps(output, indent=2))
    return 0


def _emit_human(
    worktrees: list[WorktreeInfo],
    primary_root: Path,
) -> int:
    if not worktrees:
        print("(no worktrees registered)")
        return 0

    primary_resolved = primary_root.resolve()

    # Compute display path relative to primary_root, with parent-dir
    # fallback for siblings (worktrees in <repo>-worktrees/<slug>) and
    # absolute path as last resort.
    rows: list[tuple[str, str, str, tuple[str, ...]]] = []
    for wt in worktrees:
        wt_resolved = wt.path.resolve()
        try:
            rel = wt_resolved.relative_to(primary_resolved)
            display = "." if str(rel) == "." else str(rel).replace("\\", "/")
        except ValueError:
            try:
                rel = wt_resolved.relative_to(primary_resolved.parent)
                display = "../" + str(rel).replace("\\", "/")
            except ValueError:
                display = str(wt_resolved)
        branch_display = wt.branch if wt.branch else "(detached HEAD)"
        rows.append((wt.classification, display, branch_display, wt.issues))

    # Sort: main → canonical → drift
    order = {"main": 0, "canonical": 1, "drift": 2}
    rows.sort(key=lambda r: order.get(r[0], 9))

    # Pad columns
    cls_width = max(len(f"[{r[0]}]") for r in rows)
    path_width = max(len(r[1]) for r in rows)

    for classification, display, branch, issues in rows:
        cls_str = f"[{classification}]".ljust(cls_width)
        path_str = display.ljust(path_width)
        print(f"{cls_str}  {path_str}  (branch: {branch})")
        for issue in issues:
            print(f"  ! {issue}")

    drift_count = sum(1 for r in rows if r[0] == "drift")
    if drift_count > 0:
        print(
            f"\n{drift_count} worktree(s) at non-canonical paths. "
            f"See `python -m ai_router.worktree list --json` "
            f"for machine-readable detail."
        )

    return 0


# ======================================================================
# 5. CLI dispatcher
# ----------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.worktree",
        description=(
            "Canonical worktree management for the dabbler "
            "sibling-worktrees-folder layout. "
            "See docs/planning/repo-worktree-layout.md for the layout spec."
        ),
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_open = sub.add_parser(
        "open",
        help="Open a worktree at the canonical path with branch session-set/<slug>",
    )
    p_open.add_argument("slug", help="Session-set slug (becomes the worktree dir name)")
    p_open.add_argument(
        "--base",
        help="Base branch to fork from (default: repo's default branch)",
    )
    p_open.set_defaults(func=cmd_open)

    p_close = sub.add_parser(
        "close",
        help="Close a clean canonical worktree (use cancel_session for messy close)",
    )
    p_close.add_argument("slug", help="Session-set slug to close")
    p_close.add_argument(
        "--keep-branch",
        action="store_true",
        help="Keep the local branch after closing (default: delete)",
    )
    p_close.add_argument(
        "--delete-remote",
        action="store_true",
        help="Also delete the remote branch (with confirmation)",
    )
    p_close.set_defaults(func=cmd_close)

    p_list = sub.add_parser(
        "list",
        help="List worktrees with main/canonical/drift classification",
    )
    p_list.add_argument("--json", action="store_true", help="Emit JSON output")
    p_list.set_defaults(func=cmd_list)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
