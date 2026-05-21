"""Set 035 Session 2 — glossary-harvest one-shot.

Walks the solution looking for string literals that resemble file or
marker names (``[A-Za-z_][A-Za-z0-9_-]*\\.(md|json|jsonl|toml|yaml|yml|txt|html)``),
groups them by extension, then clusters near-matches via Levenshtein
distance (``<=3`` by default). Surfaces clusters whose membership
spans more than one distinct case-folded form.

The trigger for the harvest was an AI engine writing ``_cancelled.md``
(lowercase, underscore-prefixed) while the reader expects
``CANCELLED.md`` — a Levenshtein-3 mismatch the harvest should catch
systematically rather than relying on operator eyes.

Output: Markdown report at
``docs/session-sets/035-state-file-sole-truth-marker-retirement/glossary-harvest.md``
when ``--write-report`` is passed; otherwise prints to stdout.

Excludes typical machine-generated trees (``node_modules``, ``.venv``,
``out``, ``dist``, ``.git``, ``build``, ``__pycache__``,
``*.egg-info``, ``.vscode-test``, ``test-results``, ``playwright-report``).
"""

from __future__ import annotations

import argparse
import collections
import os
import pathlib
import re
import sys
from typing import Iterable


SCAN_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py",
    ".md",
    ".json", ".jsonl",
    ".yaml", ".yml",
    ".toml",
    ".sh", ".ps1",
    ".html", ".css",
    ".txt",
}

# Extensions we treat as "filename-like" terminators in the literal regex.
NAME_EXTS = "md|json|jsonl|toml|yaml|yml|txt|html"

# Regex: matches an identifier-like prefix (letters/digits/underscore/hyphen/dot)
# followed by one of the known artifact extensions.  Anchored so the prefix
# starts with a word boundary and the extension is the suffix.
NAME_RE = re.compile(
    rf"\b([A-Za-z_][A-Za-z0-9_.\-]{{0,63}}\.({NAME_EXTS}))\b"
)

EXCLUDE_DIRS = {
    ".git", "node_modules", ".venv", "venv", "out", "dist", "build",
    "__pycache__", ".vscode-test", "test-results", "playwright-report",
    ".pytest_cache", ".mypy_cache", ".ruff_cache",
}


def is_excluded(path: pathlib.Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
        if part.endswith(".egg-info"):
            return True
    return False


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            ins = curr[j - 1] + 1
            dele = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            curr[j] = min(ins, dele, sub)
        prev = curr
    return prev[-1]


def collect_names(root: pathlib.Path) -> dict[str, dict[str, list[pathlib.Path]]]:
    """Walk *root* and return ``{ext: {name: [files...]}}``.

    A name lands in the bucket whose key is the extension token; the value
    list is the files where the literal was observed (de-duplicated, sorted).
    """
    buckets: dict[str, dict[str, set[pathlib.Path]]] = collections.defaultdict(
        lambda: collections.defaultdict(set)
    )
    for dirpath, dirnames, filenames in os.walk(root):
        dpath = pathlib.Path(dirpath)
        if is_excluded(dpath):
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not d.endswith(".egg-info")]
        for fname in filenames:
            fpath = dpath / fname
            if fpath.suffix.lower() not in SCAN_EXTS:
                continue
            try:
                text = fpath.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for m in NAME_RE.finditer(text):
                full = m.group(1)
                ext = m.group(2).lower()
                buckets[ext][full].add(fpath)
    return {
        ext: {name: sorted(files) for name, files in inner.items()}
        for ext, inner in buckets.items()
    }


def cluster(
    names: Iterable[str], threshold: int = 3
) -> list[list[str]]:
    """Union-find clustering by Levenshtein distance ``<= threshold``."""
    names = sorted(names)
    parent = list(range(len(names)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        parent[find(x)] = find(y)

    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if levenshtein(names[i].lower(), names[j].lower()) <= threshold:
                union(i, j)

    groups: dict[int, list[str]] = collections.defaultdict(list)
    for i, n in enumerate(names):
        groups[find(i)].append(n)
    return [sorted(g) for g in groups.values() if len(g) >= 2]


# Known canonical markers — clusters that touch one of these get pulled to
# the top of the report. The set is small + curated; not a substitute for
# the Levenshtein scan, just a way to rank operator-relevant findings.
CANONICAL_MARKERS = {
    "CANCELLED.md",
    "RESTORED.md",
    "change-log.md",
    "activity-log.json",
    "session-state.json",
    "session-events.jsonl",
    "disposition.json",
    "spec.md",
    "orchestrator.json",
    "orchestrator-mru.json",
    "orchestrator-writer.log",
    "router-config.yaml",
    "budget.yaml",
    "local-overrides.yaml",
    "ai-assignment.md",
    "config.toml",
}


def score_cluster(members: list[str], files_by_name: dict[str, list[pathlib.Path]]) -> tuple[int, int, str]:
    """Return a sort key — clusters that touch a canonical marker first."""
    touches_canonical = any(m in CANONICAL_MARKERS for m in members)
    file_count = sum(len(files_by_name.get(m, [])) for m in members)
    return (-int(touches_canonical), -file_count, members[0])


def format_report(
    buckets: dict[str, dict[str, list[pathlib.Path]]], threshold: int, root: pathlib.Path
) -> str:
    lines: list[str] = []
    lines.append("# Set 035 Session 2 — Glossary harvest report")
    lines.append("")
    lines.append(
        f"Levenshtein threshold ``<= {threshold}``; case-folded comparison; "
        "filename-like literal regex "
        f"``\\b[A-Za-z_][A-Za-z0-9_.\\-]{{0,63}}\\.({NAME_EXTS})\\b``."
    )
    lines.append("")
    lines.append(
        "Excluded trees: " + ", ".join(sorted(EXCLUDE_DIRS)) + " (plus ``*.egg-info``)."
    )
    lines.append("")
    lines.append("---")
    lines.append("")

    total_clusters = 0
    for ext in sorted(buckets):
        inner = buckets[ext]
        clusters = cluster(inner.keys(), threshold=threshold)
        if not clusters:
            continue
        clusters.sort(key=lambda members: score_cluster(members, inner))
        lines.append(f"## `.{ext}` extension")
        lines.append("")
        for members in clusters:
            total_clusters += 1
            touches_canonical = any(m in CANONICAL_MARKERS for m in members)
            badge = " — **touches canonical marker**" if touches_canonical else ""
            lines.append(f"### Cluster: {', '.join(f'`{m}`' for m in members)}{badge}")
            lines.append("")
            for member in members:
                files = inner.get(member, [])
                count = len(files)
                canon_tag = " *(canonical)*" if member in CANONICAL_MARKERS else ""
                lines.append(f"- `{member}` — {count} file(s){canon_tag}")
                for f in files[:6]:
                    rel = pathlib.Path(os.path.relpath(f, root)).as_posix()
                    lines.append(f"  - `{rel}`")
                if len(files) > 6:
                    lines.append(f"  - … and {len(files) - 6} more")
            lines.append("")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(f"**Total clusters surfaced:** {total_clusters}")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", default=".", help="Directory to scan (default: cwd)."
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=3,
        help="Maximum Levenshtein distance for clustering (default: 3).",
    )
    parser.add_argument(
        "--write-report",
        action="store_true",
        help="Write the report to the canonical Set 035 location.",
    )
    args = parser.parse_args(argv)

    root = pathlib.Path(args.root).resolve()
    buckets = collect_names(root)
    report = format_report(buckets, args.threshold, root)

    if args.write_report:
        out = root / "docs" / "session-sets" / (
            "035-state-file-sole-truth-marker-retirement"
        ) / "glossary-harvest.md"
        out.write_text(report, encoding="utf-8", newline="\n")
        sys.stdout.write(f"Wrote {out}\n")
    else:
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
