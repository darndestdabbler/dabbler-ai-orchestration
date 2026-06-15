"""Set 066 — the ``P_set = any(P_task)`` blast-radius predicate.

The Set 065 proposal (section 7, "the unifying rule — one blast-radius
gate, three applications") derives one operator-legible core predicate:

> **Core predicate (P):** the unit of work changes **cross-artifact
> contracts, indexes, wiring, or shared schema** — exactly where a
> snippet-fed Mode-1 delegate is structurally blind.
>
> - ``P_task`` — P evaluated for a single delegated task.
> - ``P_set = any(P_task)`` — true if *any* task in the set trips P
>   (governs the set-level ``pathAwareCritique: required`` gate).

This module implements that predicate as a **recommendation aid**: it
classifies a set's changed/planned surface and *recommends* a
``pathAwareCritique`` value. It is deliberately **advisory** — the
operator confirms the value at set start; the predicate is **not** a hard
auto-set (Set 066 S1 standard). The classifier is a deterministic,
legible heuristic (path + keyword signals), biased toward recommending a
critique when in doubt — a false "required" only costs one extra
out-of-band review, while a false "none" silently drops the gate.

Output is ASCII-only (the cp1252 console convention). The recommended
value names are imported from :mod:`ai_router.path_aware_critique` so the
enum has a single source of truth.

CLI::

    python -m ai_router.blast_radius <path> [<path> ...]   # classify_paths
    python -m ai_router.blast_radius --json <path> ...      # machine-readable
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Union

try:
    from path_aware_critique import (  # type: ignore[import-not-found]
        PATH_AWARE_CRITIQUE_ADVISORY,
        PATH_AWARE_CRITIQUE_NONE,
        PATH_AWARE_CRITIQUE_REQUIRED,
    )
except ImportError:  # pragma: no cover - import shim
    from .path_aware_critique import (  # type: ignore[no-redef]
        PATH_AWARE_CRITIQUE_ADVISORY,
        PATH_AWARE_CRITIQUE_NONE,
        PATH_AWARE_CRITIQUE_REQUIRED,
    )


# ---------------------------------------------------------------------------
# The four blast-radius categories (proposal section 7 core predicate)
# ---------------------------------------------------------------------------

CROSS_ARTIFACT = "cross-artifact"
SHARED_SCHEMA = "shared-schema"
WIRING = "wiring"
INDEX = "index"
BLAST_RADIUS_CATEGORIES = (CROSS_ARTIFACT, SHARED_SCHEMA, WIRING, INDEX)

# Path substring signals per category. Matched against a normalized
# (lowercased, forward-slashed) path. Kept as legible module constants so
# the heuristic is tunable and auditable rather than buried in code.
_SHARED_SCHEMA_SIGNALS = (
    "schema",  # broad: a path naming "schema" is almost always schema-related
    "session_state.py",  # defines the state-file schema constants
    "progress.py",  # the v4 normalize shim / schema shape
)
_INDEX_SIGNALS = (
    "__init__.py",  # the package export index
    "memory.md",
    "router-config.yaml",
    "router-config.yml",
    "repository-reference.md",
    "package.json",
    "package-lock.json",
    "manifest",
    "registry",
    "/index.",
)
_WIRING_SIGNALS = (
    "close_session.py",
    "start_session.py",
    "extension.ts",
    "conftest.py",
    "esbuild",
    "/__main__.py",
    "bootstrap",
    "wire",
)

# Free-text description keywords per category (lowercased substring match).
_DESCRIPTION_KEYWORDS = {
    CROSS_ARTIFACT: (
        "cross-artifact",
        "cross artifact",
        "contract drift",
        "cross-reference",
        "doc echo",
        "in sync",
    ),
    SHARED_SCHEMA: ("schema", "shared schema"),
    WIRING: (
        "wiring",
        "wire ",
        "register",
        "close-out gate",
        "close out gate",
        "activate",
        "gate list",
    ),
    INDEX: (
        "index",
        "registry",
        "manifest",
        "re-export",
        "reexport",
        "table of contents",
    ),
}

# Domain classification for the cross-artifact detector. A task trips
# CROSS_ARTIFACT when its paths span a "contract" domain (schema / spec /
# config) plus at least one other distinct domain — the signature of a
# contract changing alongside its consumers or docs, which is exactly the
# cross-artifact drift a snippet-fed reviewer cannot see.
_DOMAIN_BY_EXT = {
    ".py": "code",
    ".ts": "code",
    ".tsx": "code",
    ".js": "code",
    ".jsx": "code",
    ".md": "doc",
    ".yaml": "config",
    ".yml": "config",
    ".json": "config",
    ".toml": "config",
}
_CONTRACT_DOMAINS = frozenset({"schema", "spec", "config"})


@dataclass(frozen=True)
class TaskBlastRadius:
    """The blast-radius classification of a single task (``P_task``)."""

    task_id: str
    p_task: bool
    categories: tuple
    signals: tuple


@dataclass(frozen=True)
class SetBlastRadius:
    """The set-level roll-up (``P_set = any(P_task)``) + a recommendation."""

    p_set: bool
    recommended: str
    tasks: tuple
    categories: tuple

    def render(self) -> str:
        """Return an ASCII-only, operator-facing report."""
        lines = ["Path-Aware Critique blast-radius recommendation"]
        verdict = "TRUE" if self.p_set else "FALSE"
        rolled = (
            "any task trips the core predicate"
            if self.p_set
            else "no task trips the core predicate"
        )
        lines.append(f"  P_set: {verdict} ({rolled})")
        lines.append(f"  Recommended pathAwareCritique: {self.recommended}")
        cats = ", ".join(self.categories) if self.categories else "(none)"
        lines.append(f"  Categories tripped: {cats}")
        lines.append("  Tasks:")
        for task in self.tasks:
            mark = "[x]" if task.p_task else "[ ]"
            tcats = ", ".join(task.categories) if task.categories else "(none)"
            lines.append(f"    {mark} {task.task_id} -> {tcats}")
            for signal in task.signals:
                lines.append(f"          - {signal}")
        lines.append(
            "  NOTE: advisory recommendation only -- the operator confirms "
            "the value at set"
        )
        lines.append(
            "        start; this is NOT a hard auto-set. P_set = any(P_task)."
        )
        return "\n".join(lines)


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").strip().lower()


def _domain_of(path: str) -> Optional[str]:
    """Return the artifact domain of a path, or ``None`` if unrecognized."""
    p = _normalize_path(path)
    base = p.rsplit("/", 1)[-1]
    if p.endswith(".schema.json"):
        return "schema"
    if base == "spec.md":
        return "spec"
    if "." in base:
        ext = "." + base.rsplit(".", 1)[-1]
        return _DOMAIN_BY_EXT.get(ext)
    return None


def _match_path_signals(path: str) -> List[tuple]:
    """Return ``(category, signal_text)`` matches for a single path."""
    p = _normalize_path(path)
    matched: List[tuple] = []
    for category, signals in (
        (SHARED_SCHEMA, _SHARED_SCHEMA_SIGNALS),
        (INDEX, _INDEX_SIGNALS),
        (WIRING, _WIRING_SIGNALS),
    ):
        for signal in signals:
            if signal in p:
                matched.append(
                    (category, f"path '{path}' matches '{signal}' -> {category}")
                )
                break  # one signal per category per path is enough
    return matched


def _normalize_task(task: Union[str, dict], index: int) -> dict:
    """Coerce a task descriptor into the canonical dict shape."""
    if isinstance(task, str):
        return {"id": f"task-{index + 1}", "paths": [task]}
    if isinstance(task, dict):
        norm = dict(task)
        norm.setdefault("id", f"task-{index + 1}")
        return norm
    raise TypeError(
        f"task must be a str or dict, got {type(task).__name__}"
    )


def classify_task(task: Union[str, dict], index: int = 0) -> TaskBlastRadius:
    """Classify one task's blast radius (``P_task``).

    ``task`` is either a path string or a dict with optional keys
    ``id`` / ``paths`` / ``categories`` (explicit category overrides) /
    ``description`` (free text). ``P_task`` is true iff any signal trips —
    an explicit category, a path signal, a description keyword, or the
    cross-artifact domain-span rule.
    """
    norm = _normalize_task(task, index)
    task_id = str(norm.get("id", f"task-{index + 1}"))
    paths = [str(p) for p in norm.get("paths", []) if str(p).strip()]
    description = str(norm.get("description", "") or "")
    explicit = [
        c for c in norm.get("categories", []) if c in BLAST_RADIUS_CATEGORIES
    ]

    categories: List[str] = []
    signals: List[str] = []

    def _add(category: str, signal: str) -> None:
        if category not in categories:
            categories.append(category)
        signals.append(signal)

    for category in explicit:
        _add(category, f"explicit category -> {category}")

    for path in paths:
        for category, signal_text in _match_path_signals(path):
            _add(category, signal_text)

    # Cross-artifact: paths span a contract domain plus another distinct
    # domain (a contract changing alongside its consumers / docs).
    domains = {d for d in (_domain_of(p) for p in paths) if d}
    if len(domains) >= 2 and (domains & _CONTRACT_DOMAINS):
        _add(
            CROSS_ARTIFACT,
            "paths span domains "
            + "{" + ", ".join(sorted(domains)) + "}"
            + f" -> {CROSS_ARTIFACT}",
        )

    if description:
        low = description.lower()
        for category, keywords in _DESCRIPTION_KEYWORDS.items():
            for keyword in keywords:
                if keyword in low:
                    _add(
                        category,
                        f"description keyword '{keyword.strip()}' -> {category}",
                    )
                    break

    # Preserve canonical category order for stable output.
    ordered = tuple(c for c in BLAST_RADIUS_CATEGORIES if c in categories)
    return TaskBlastRadius(
        task_id=task_id,
        p_task=bool(ordered),
        categories=ordered,
        signals=tuple(signals),
    )


def _has_code_path(tasks: Iterable[dict]) -> bool:
    for task in tasks:
        for path in task.get("paths", []):
            if _domain_of(str(path)) == "code":
                return True
    return False


def classify_blast_radius(
    tasks: Sequence[Union[str, dict]],
) -> SetBlastRadius:
    """Roll up ``P_task`` over all tasks into ``P_set`` + a recommendation.

    Recommendation mapping (operator confirms; never an auto-set):

    - ``P_set`` true  -> ``required`` (the core predicate's auto-gate).
    - ``P_set`` false but some task touches shipping **code** -> ``advisory``
      (low blast radius, but still worth a critique — operator may downgrade).
    - otherwise (docs-only / empty) -> ``none``.
    """
    normalized = [_normalize_task(t, i) for i, t in enumerate(tasks)]
    classified = tuple(
        classify_task(t, i) for i, t in enumerate(normalized)
    )
    p_set = any(t.p_task for t in classified)
    union = tuple(
        c
        for c in BLAST_RADIUS_CATEGORIES
        if any(c in t.categories for t in classified)
    )
    if p_set:
        recommended = PATH_AWARE_CRITIQUE_REQUIRED
    elif _has_code_path(normalized):
        recommended = PATH_AWARE_CRITIQUE_ADVISORY
    else:
        recommended = PATH_AWARE_CRITIQUE_NONE
    return SetBlastRadius(
        p_set=p_set,
        recommended=recommended,
        tasks=classified,
        categories=union,
    )


def classify_paths(
    paths: Sequence[str],
    *,
    task_id: str = "changed-paths",
) -> SetBlastRadius:
    """Convenience: classify a single task of changed/planned paths.

    Useful for the dogfood path — feed ``git diff --name-only`` output to
    get a one-task recommendation for the whole set.
    """
    return classify_blast_radius([{"id": task_id, "paths": list(paths)}])


def _result_to_dict(result: SetBlastRadius) -> dict:
    return {
        "pSet": result.p_set,
        "recommended": result.recommended,
        "categories": list(result.categories),
        "tasks": [
            {
                "id": t.task_id,
                "pTask": t.p_task,
                "categories": list(t.categories),
                "signals": list(t.signals),
            }
            for t in result.tasks
        ],
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.blast_radius",
        description=(
            "Recommend a pathAwareCritique value (none|advisory|required) "
            "from a set's changed/planned paths. Advisory only -- the "
            "operator confirms; not a hard auto-set."
        ),
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help="changed/planned file paths (e.g. from `git diff --name-only`)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit one machine-readable JSON object on stdout",
    )
    args = parser.parse_args(argv)
    result = classify_paths(args.paths)
    if args.json:
        print(json.dumps(_result_to_dict(result), indent=2))
    else:
        print(result.render())
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    sys.exit(main())
