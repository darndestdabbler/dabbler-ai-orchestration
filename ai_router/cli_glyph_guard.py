"""CLI output must use ASCII-only glyphs (L-064-4, encoded).

Set 121 Session 3.  ``L-064-4`` says every helper that writes to a
console must avoid Unicode characters that Windows ``cp1252`` cannot
encode.  ``print()`` on a Windows terminal with the default code-page
raises ``UnicodeEncodeError`` on any character outside ``cp1252``
(and the rule states ASCII-only -- a stricter, unambiguous bound).

This module scans ``ai_router/`` (top-level ``.py`` files and
``ai_router/scripts/*.py``, excluding test files) for ``print()`` calls
whose positional string-literal arguments or output-control keyword args
(``sep``, ``end``) contain non-ASCII characters.  Non-ASCII is a
conservative proxy: every non-ASCII character is a potential encoding
error, and no legitimate CLI helper in this repo needs Unicode in its
console output.  A future relaxation (allow e.g. ``\\xe9``) is a rule
change, not a lint defect.

Why AST rather than regex?  A regex on the raw text cannot
distinguish the string ``"foo \u2014 bar"`` inside a print call from a
``"foo \u2014 bar"`` that is a string assigned to a variable, returned
from a function, or embedded in a docstring.  The AST correctly
finds only ``print()`` arguments.

Canonical usage::

    offenders = cli_glyph_guard.scan()
    assert not offenders, offenders
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, List, Optional

#: Root of the ``ai_router`` package, used as the default scan target.
SOURCE_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Offender:
    """One ``print()`` call with a non-ASCII string literal argument."""

    module: str
    line: int
    literal: str

    def __str__(self) -> str:  # pragma: no cover - formatting only
        return (
            f"{self.module}:{self.line}: "
            f"non-ASCII in print() arg: {self.literal!r}"
        )


def _non_ascii_strings_in_node(node: ast.Call) -> List[str]:
    """Non-ASCII string literals in a ``print()`` call's positional args and
    output-control keyword args (``sep``, ``end``).

    ``sep`` and ``end`` are written verbatim to the terminal — a non-ASCII
    value there causes the same ``UnicodeEncodeError`` on Windows cp1252
    as a non-ASCII positional argument.  ``file=`` and ``flush=`` are
    excluded: they are pure control parameters that never write character
    data to the console.
    """
    func = node.func
    if not (isinstance(func, ast.Name) and func.id == "print"):
        return []
    bad: List[str] = []
    # Positional arguments (display text).
    for arg in node.args:
        for subnode in ast.walk(arg):
            if isinstance(subnode, ast.Constant) and isinstance(
                subnode.value, str
            ):
                if any(ord(c) > 127 for c in subnode.value):
                    bad.append(subnode.value)
    # Output-control keyword arguments that write to the terminal.
    _OUTPUT_KW = {"sep", "end"}
    for kw in node.keywords:
        if kw.arg not in _OUTPUT_KW:
            continue
        for subnode in ast.walk(kw.value):
            if isinstance(subnode, ast.Constant) and isinstance(
                subnode.value, str
            ):
                if any(ord(c) > 127 for c in subnode.value):
                    bad.append(subnode.value)
    return bad


def offenders_in_source(path: Path) -> Iterator[Offender]:
    """Yield every ``print()``-with-non-ASCII offender in *path*."""
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except (OSError, SyntaxError):
        return
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            for lit in _non_ascii_strings_in_node(node):
                yield Offender(
                    module=path.name,
                    line=node.lineno,
                    literal=lit,
                )


def discover_source_modules(root: Optional[Path] = None) -> List[Path]:
    """Top-level ``ai_router/`` ``.py`` files and ``ai_router/scripts/`` ``.py``
    files that may produce CLI output.

    Excludes ``test_*`` files and ``conftest.py`` — those live under the
    test harness and can contain arbitrary string content.
    """
    base = root or SOURCE_DIR
    modules = sorted(
        p
        for p in base.glob("*.py")
        if not p.name.startswith("test_") and p.name != "conftest.py"
    )
    scripts_dir = base / "scripts"
    if scripts_dir.is_dir():
        modules += sorted(
            p
            for p in scripts_dir.glob("*.py")
            if not p.name.startswith("test_") and p.name != "conftest.py"
        )
    return modules


def scan(paths: Optional[Iterable[Path]] = None) -> List[Offender]:
    """Return all offenders across *paths*.

    Defaults to the ``ai_router`` package top-level via
    :func:`discover_source_modules`.  Inject an explicit ``paths``
    list in tests to isolate the scan from the real tree.
    """
    if paths is None:
        paths = discover_source_modules()
    found: List[Offender] = []
    for path in paths:
        found.extend(offenders_in_source(path))
    return found
