"""Number-prefix addressing for session sets (Set 050 Session 4, Feature 2).

Set 050 ("Schema-Drift Detection & Migration Guard") broadened to also
standardize a monotonic ``NNN-`` slug prefix across repos and add a
number->slug resolver so an operator can refer to a set as "Set 50"
instead of typing the full slug. Audit-locked spec at
``docs/session-sets/050-schema-drift-detection-and-migration-guard/spec.md``;
verdict (Feature 2, Q8-Q11) at
``docs/proposals/2026-05-29-session-set-currency-and-addressing/verdict.md``.

What this is
------------

Pure, dependency-free directory math. Two public operations:

- :func:`resolve_set` — given a scan root (typically ``docs/session-sets``)
  and a bare number, return the single session-set directory whose slug
  begins with that numeric prefix. Exact integer-prefix match, leading
  zeros normalized (``50`` == ``050-...``). No fuzzy matching (verdict Q8).
- :func:`next_session_set_number` — return the next monotonic prefix
  (``max(existing) + 1``) as both the integer and a zero-padded string,
  with ``width = max(3, widest existing numeric prefix)`` (verdict Q11).

Both ignore directories without a numeric prefix (bare descriptive slugs
like ``harvester-cli-distribution``) for max-finding and treat them as
non-targets for resolution. Underscore-prefixed dirs (``_archived``) are
skipped entirely.

Error posture (verdict Q8)
--------------------------

- **No match** -> :class:`SetNotFoundError`, message lists the available
  numeric prefixes and points at ``--next``. No heuristic "nearest"
  suggestion (nearest risks nudging the operator to the wrong set).
- **Collision** (two slugs, same numeric prefix) ->
  :class:`SetCollisionError` naming both. This is a repo-authoring bug
  the operator must fix; the resolver refuses to guess.

The module makes no routed LLM calls and imports nothing from the rest of
``ai_router`` — safe to call under any budget regime and usable from a
consumer repo that pins an old router.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


# A slug's numeric prefix is one-or-more leading digits terminated by a
# hyphen: ``050-schema-drift-...`` -> 50. ``harvester-cli`` -> no match.
# A bare ``050`` with no trailing hyphen is NOT a slug (it would be an
# ambiguous directory name); the prefix must be followed by ``-``.
_PREFIX_RE = re.compile(r"^(\d+)-")

SESSION_SETS_DIRNAME = "session-sets"


class SetResolutionError(Exception):
    """Base class for resolver failures (no-match / collision)."""


class SetNotFoundError(SetResolutionError):
    """No session-set directory has the requested numeric prefix."""


class SetCollisionError(SetResolutionError):
    """More than one directory shares the requested numeric prefix."""


def numeric_prefix(name: str) -> Optional[int]:
    """Return the integer numeric prefix of a slug, or ``None``.

    ``050-foo`` -> 50 (leading zeros normalized via ``int``); ``7-bar``
    -> 7; ``harvester-cli`` / ``050`` (no trailing hyphen) -> ``None``.
    """
    m = _PREFIX_RE.match(name)
    if not m:
        return None
    return int(m.group(1))


def _prefix_width(name: str) -> int:
    """Digit-count of a slug's numeric prefix (0 when it has none)."""
    m = _PREFIX_RE.match(name)
    return len(m.group(1)) if m else 0


def _list_set_dirs(scan_root: str) -> List[str]:
    """Directory basenames directly under ``scan_root``, ``_``-dirs skipped.

    Unlike the migrators' ``discover_session_sets``, this does NOT require
    a ``session-state.json`` to be present — a freshly-scaffolded set dir
    (spec.md only) must still be addressable by number, and
    ``next_session_set_number`` must see every numbered dir to compute the
    max correctly.
    """
    if not os.path.isdir(scan_root):
        return []
    out: List[str] = []
    for name in sorted(os.listdir(scan_root)):
        if name.startswith("_"):
            continue  # _archived/ and friends are not addressable sets
        if os.path.isdir(os.path.join(scan_root, name)):
            out.append(name)
    return out


def index_by_prefix(scan_root: str) -> Dict[int, List[str]]:
    """Map each numeric prefix to the slug(s) that carry it.

    A well-formed repo has exactly one slug per prefix; a list with more
    than one entry is the collision case :func:`resolve_set` rejects.
    Slugs without a numeric prefix are omitted.
    """
    index: Dict[int, List[str]] = {}
    for name in _list_set_dirs(scan_root):
        p = numeric_prefix(name)
        if p is None:
            continue
        index.setdefault(p, []).append(name)
    return index


def available_prefixes(scan_root: str) -> List[int]:
    """Sorted list of numeric prefixes present under ``scan_root``."""
    return sorted(index_by_prefix(scan_root).keys())


def resolve_slug(scan_root: str, number: int) -> str:
    """Return the single slug (dir basename) whose prefix == ``number``.

    Raises :class:`SetNotFoundError` (no match) or
    :class:`SetCollisionError` (two slugs share the prefix).
    """
    index = index_by_prefix(scan_root)
    matches = index.get(number)
    if not matches:
        prefixes = sorted(index.keys())
        avail = ", ".join(str(p) for p in prefixes) if prefixes else "(none)"
        raise SetNotFoundError(
            f"no session set with number {number} under {scan_root}. "
            f"Available numbers: {avail}. "
            f"Use --next to get the next free number."
        )
    if len(matches) > 1:
        both = ", ".join(sorted(matches))
        raise SetCollisionError(
            f"number {number} is ambiguous under {scan_root}: it matches "
            f"more than one directory ({both}). This is a repo-authoring "
            f"bug -- two session sets must not share a numeric prefix. "
            f"Rename one before addressing by number."
        )
    return matches[0]


def resolve_set(scan_root: str, number: int) -> str:
    """Return the full path to the session-set dir with prefix ``number``."""
    return os.path.join(scan_root, resolve_slug(scan_root, number))


# --- collision refusal (Set 122 Session 4) -----------------------------------
#
# Verdict §6.4 asks developers to reserve set numbers in chat before
# scaffolding. That is a convention, and a convention nobody remembers is
# not a control: two developers scaffolding on separate branches mint
# ``123-foo`` and ``123-bar``, and nothing notices until the branches
# merge and every number-addressed command becomes ambiguous at once.
#
# The collision is already understood here as a repo-authoring bug --
# :func:`resolve_slug` refuses to guess between two matches. What was
# missing is *when* it is reported. Refusing at address time tells you
# after the work is done, on a path the operator may not run for days;
# refusing at scaffold time and at session start tells you before the
# work starts, which is the whole point.


def find_collisions(scan_root: str) -> Dict[int, List[str]]:
    """Every numeric prefix carried by more than one directory.

    Returns ``{number: [slug, slug, ...]}`` with the slugs sorted, empty
    when the repo is well-formed.
    """
    return {
        number: sorted(slugs)
        for number, slugs in index_by_prefix(scan_root).items()
        if len(slugs) > 1
    }


def describe_collisions(scan_root: str, collisions: Dict[int, List[str]]) -> str:
    """Operator-facing text for a collision report (ASCII-only)."""
    lines = [
        f"duplicate session-set number(s) under {scan_root}:",
    ]
    for number in sorted(collisions):
        lines.append(f"  {number}: {', '.join(collisions[number])}")
    lines.append(
        "Two session sets must not share a numeric prefix -- number "
        "addressing, prerequisite links and the set index all become "
        "ambiguous. Rename one (keep the work, change the prefix) using "
        "the next free number from `resolve_set --next`."
    )
    return "\n".join(lines)


def assert_no_collisions(scan_root: str) -> None:
    """Raise :class:`SetCollisionError` if any number is used twice."""
    collisions = find_collisions(scan_root)
    if collisions:
        raise SetCollisionError(describe_collisions(scan_root, collisions))


def assert_number_available(
    scan_root: str, number: int, *, slug: Optional[str] = None
) -> None:
    """Refuse *number* if a different session set already carries it.

    Called at **scaffold** time, before a directory is created. *slug*
    names the directory about to be minted so a re-run that resolves to
    the very same set is not reported as a collision with itself -- the
    lifecycle scaffolders are deliberately idempotent, and a refusal
    that fired on re-entry would break retryability to prevent nothing.
    """
    existing = index_by_prefix(scan_root).get(number, [])
    others = [name for name in existing if name != slug]
    if not others:
        return
    minted = f" for {slug!r}" if slug else ""
    raise SetCollisionError(
        f"session-set number {number} is already taken by "
        f"{', '.join(sorted(others))} under {scan_root}; refusing to proceed"
        f"{minted}. Two session sets must not share a numeric prefix. Reserve a "
        f"number before scaffolding (verdict 6.4), or rename one to the next "
        f"free number from `resolve_set --next`."
    )


def next_session_set_number(scan_root: str) -> Tuple[int, str]:
    """Return the next monotonic prefix as ``(int, zero_padded_str)``.

    ``max(existing numeric prefix) + 1``; ``1`` when none exist. The
    string is zero-padded to ``width = max(3, widest existing numeric
    prefix)`` so a repo that has grown to 4-digit prefixes keeps its
    width, while a fresh or 3-digit repo stays at ``001`` / ``051``
    (verdict Q11). Slugs without a numeric prefix are ignored.
    """
    names = _list_set_dirs(scan_root)
    prefixes = [numeric_prefix(n) for n in names]
    numbered = [p for p in prefixes if p is not None]
    nxt = (max(numbered) + 1) if numbered else 1
    widest = max((_prefix_width(n) for n in names), default=0)
    width = max(3, widest)
    return nxt, f"{nxt:0{width}d}"


def looks_like_bare_number(value: str) -> bool:
    """True when ``value`` is a bare integer handle (digits only).

    Used by ``start_session`` to decide whether ``--session-set-dir`` is a
    number to resolve or a path to use verbatim. ``"050"`` / ``"50"`` ->
    True; ``"docs/session-sets/050-foo"`` / ``"050-foo"`` -> False.
    """
    return value.isdigit()


def default_scan_root(cwd: Optional[str] = None) -> str:
    """The conventional ``docs/session-sets`` root under ``cwd``.

    Falls back to ``<cwd>/docs/session-sets`` even when absent so error
    messages name the expected location; callers that need an existing
    directory should check first.
    """
    base = cwd or os.getcwd()
    return os.path.join(base, "docs", SESSION_SETS_DIRNAME)


def resolve_session_set_dir(value: str, scan_root: Optional[str] = None) -> str:
    """Resolve a ``--session-set-dir`` value that may be a bare number.

    - A bare integer (``"50"``, ``"050"``) is resolved against
      ``scan_root`` (default: ``./docs/session-sets``) to the full
      directory path.
    - Anything else (a relative or absolute path) is returned unchanged,
      preserving the pre-Set-050 contract.

    Raises the resolver errors on an unresolvable number.
    """
    if not looks_like_bare_number(value):
        return value
    root = scan_root or default_scan_root()
    return resolve_set(root, int(value))


# --- CLI ---------------------------------------------------------------------


@dataclass(frozen=True)
class _Args:
    number: Optional[int]
    scan: str
    next: bool
    json: bool


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.resolve_set",
        description=(
            "Resolve a session-set number to its full slug, or print the "
            "next free number. Exact integer-prefix match within the scan "
            "root (leading zeros normalized); no fuzzy matching."
        ),
    )
    parser.add_argument(
        "number",
        nargs="?",
        help="Session-set number to resolve (e.g. 50 or 050). Omit with --next.",
    )
    parser.add_argument(
        "--scan",
        default=None,
        help=(
            "Directory under which to find session sets. Default: "
            "./docs/session-sets when present, else the current directory."
        ),
    )
    parser.add_argument(
        "--next",
        action="store_true",
        help="Print the next free monotonic number (int and zero-padded).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Report every duplicate session-set number under the scan root and "
            "exit 3 if any exist. Exit 0 with a one-line confirmation when the "
            "repo is well-formed."
        ),
    )
    parser.add_argument(
        "--json", action="store_true", help="Machine-readable JSON output."
    )
    ns = parser.parse_args(argv)

    scan = ns.scan or default_scan_root()
    if not os.path.isdir(scan):
        print(f"resolve_set: scan root not found: {scan}", file=sys.stderr)
        return 2

    if ns.check:
        collisions = find_collisions(scan)
        indexed = index_by_prefix(scan)
        if ns.json:
            import json

            print(
                json.dumps(
                    {
                        "scan": scan,
                        "numbered": len(indexed),
                        "collisions": {str(k): v for k, v in sorted(collisions.items())},
                    },
                    indent=2,
                )
            )
        elif collisions:
            print(f"resolve_set: {describe_collisions(scan, collisions)}", file=sys.stderr)
        else:
            # Name the corpus size: a scan that found nothing because it
            # looked at nothing must not read as a clean bill of health
            # (L-112-1).
            print(f"[dabbler] {len(indexed)} numbered session set(s), no duplicates.")
        return 3 if collisions else 0

    if ns.next:
        nxt_int, nxt_str = next_session_set_number(scan)
        if ns.json:
            import json

            print(json.dumps({"next": nxt_int, "nextPadded": nxt_str, "scan": scan}))
        else:
            print(nxt_str)
        return 0

    if ns.number is None:
        print("resolve_set: provide a number to resolve, or --next.", file=sys.stderr)
        return 2
    if not looks_like_bare_number(str(ns.number)):
        print(
            f"resolve_set: '{ns.number}' is not a bare number.", file=sys.stderr
        )
        return 2

    try:
        slug = resolve_slug(scan, int(ns.number))
    except SetCollisionError as exc:
        print(f"resolve_set: {exc}", file=sys.stderr)
        return 3
    except SetNotFoundError as exc:
        print(f"resolve_set: {exc}", file=sys.stderr)
        return 4

    if ns.json:
        import json

        print(
            json.dumps(
                {
                    "number": int(ns.number),
                    "slug": slug,
                    "dir": os.path.join(scan, slug),
                    "scan": scan,
                }
            )
        )
    else:
        print(slug)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "SetResolutionError",
    "SetNotFoundError",
    "SetCollisionError",
    "numeric_prefix",
    "index_by_prefix",
    "available_prefixes",
    "assert_no_collisions",
    "assert_number_available",
    "describe_collisions",
    "find_collisions",
    "resolve_slug",
    "resolve_set",
    "next_session_set_number",
    "looks_like_bare_number",
    "default_scan_root",
    "resolve_session_set_dir",
    "main",
]
