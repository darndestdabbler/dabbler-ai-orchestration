"""Falsifiers for the CLI glyph guard (L-064-4, encoded).

Set 121 Session 3.  The guard in :mod:`ai_router.cli_glyph_guard`
refuses a ``print()`` call whose positional string-literal arguments
or output-control keyword args (``sep``, ``end``) contain non-ASCII
characters.  Every rule here is proved twice:

* Plant the violation and assert the guard fires.
* Plant the legitimate look-alike and assert it stays silent.

The plants go into a temporary directory (not the real ``ai_router``
tree), so the test's outcome never depends on the state of the repo
it runs inside.  The real-corpus scan at the bottom asserts the
guard examined at least one source file (L-112-1: a scan that
examined nothing is not coverage).
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from ai_router.cli_glyph_guard import (
    SOURCE_DIR,
    Offender,
    discover_source_modules,
    offenders_in_source,
    scan,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write(tmp_path: Path, filename: str, source: str) -> Path:
    p = tmp_path / filename
    p.write_text(textwrap.dedent(source), encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# Offender plant: guard fires
# ---------------------------------------------------------------------------


def test_non_ascii_in_print_arg_is_flagged(tmp_path: Path) -> None:
    """A print() call with an em-dash is flagged."""
    src = _write(
        tmp_path,
        "bad_cli.py",
        """\
        def report():
            print("AI ROUTER \u2014 METRICS REPORT")
        """,
    )
    offenders = list(scan([src]))
    assert offenders, "guard missed a non-ASCII print() argument"
    assert any("bad_cli.py" in str(o) for o in offenders)


def test_non_ascii_in_fstring_print_arg_is_flagged(tmp_path: Path) -> None:
    """A non-ASCII character inside an f-string print() argument is flagged."""
    src = _write(
        tmp_path,
        "bad_fstring.py",
        """\
        def report(n):
            print(f"done \u2714 {n} items")
        """,
    )
    offenders = list(scan([src]))
    assert offenders, "guard missed non-ASCII inside an f-string print() arg"


# ---------------------------------------------------------------------------
# Look-alike plants: guard stays silent
# ---------------------------------------------------------------------------


def test_ascii_print_is_not_flagged(tmp_path: Path) -> None:
    """A pure-ASCII print() call produces no offenders."""
    src = _write(
        tmp_path,
        "ok_cli.py",
        """\
        def report():
            print("AI ROUTER -- METRICS REPORT")
            print("[x] done  [ ] pending  [~] in-progress")
        """,
    )
    assert not scan([src])


def test_non_ascii_in_comment_is_not_flagged(tmp_path: Path) -> None:
    """A non-ASCII character in a comment, not in a print() arg, is ignored."""
    src = _write(
        tmp_path,
        "ok_comment.py",
        """\
        # Uses em-dash \u2014 in comments only.
        def report():
            print("OK: all ASCII here")
        """,
    )
    assert not scan([src])


def test_non_ascii_in_string_variable_is_not_flagged(tmp_path: Path) -> None:
    """Non-ASCII in an assignment, not passed to print(), is ignored."""
    src = _write(
        tmp_path,
        "ok_var.py",
        """\
        LABEL = "fancy \u2014 label"  # stored, not printed

        def report():
            print("plain output")
        """,
    )
    assert not scan([src])


def test_non_ascii_keyword_arg_sep_is_flagged(tmp_path: Path) -> None:
    """Non-ASCII in a ``sep=`` keyword arg IS flagged.

    ``sep`` is written verbatim between arguments — it appears on the
    terminal and can raise ``UnicodeEncodeError`` on Windows cp1252.
    """
    src = _write(
        tmp_path,
        "bad_kwarg_sep.py",
        """\
        import sys

        def report():
            # sep='\u2014' writes em-dash to the terminal
            print("a", "b", sep="\u2014")
        """,
    )
    offenders = list(scan([src]))
    assert offenders, "guard missed non-ASCII sep= keyword arg"


def test_non_ascii_keyword_arg_end_is_flagged(tmp_path: Path) -> None:
    """Non-ASCII in an ``end=`` keyword arg IS flagged.

    ``end`` is written after all arguments — it appears on the terminal
    and can raise ``UnicodeEncodeError`` on Windows cp1252.
    """
    src = _write(
        tmp_path,
        "bad_kwarg_end.py",
        """\
        def report():
            print("item", end="\u2026")  # ellipsis
        """,
    )
    offenders = list(scan([src]))
    assert offenders, "guard missed non-ASCII end= keyword arg"


def test_non_ascii_file_kwarg_is_not_flagged(tmp_path: Path) -> None:
    """Non-ASCII in a ``file=`` keyword arg is NOT flagged.

    ``file=`` is a control parameter (the destination stream) and never
    writes character data to the console itself.
    """
    src = _write(
        tmp_path,
        "ok_file_kwarg.py",
        """\
        import sys

        def report():
            print("output", file=sys.stderr)
        """,
    )
    assert not scan([src])


# ---------------------------------------------------------------------------
# Real-corpus scan: guard examined something (L-112-1)
# ---------------------------------------------------------------------------


def test_real_corpus_is_non_empty() -> None:
    """discover_source_modules() finds at least one file in the real tree."""
    modules = discover_source_modules(SOURCE_DIR)
    assert modules, "cli_glyph_guard found no source files -- scan examined nothing"


def test_real_corpus_includes_scripts_directory() -> None:
    """discover_source_modules() includes ai_router/scripts/ files."""
    modules = discover_source_modules(SOURCE_DIR)
    scripts_files = [p for p in modules if "scripts" in p.parts]
    assert scripts_files, (
        "cli_glyph_guard found no scripts/ files -- scan examined nothing in scripts/"
    )


def test_real_source_is_compliant() -> None:
    """The real ai_router/ tree has no non-ASCII print() arguments."""
    offenders = scan()
    assert not offenders, (
        "Non-ASCII characters found in print() calls in the ai_router source tree.\n"
        + "\n".join(str(o) for o in offenders)
    )
