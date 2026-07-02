"""Code-review-time invariant: production code must not bare-import Set 048 modules.

Set 048 S5 UAT discovered that ``ai_router/__init__.py``,
``ai_router/start_session.py``, ``ai_router/close_session.py``, and
``ai_router/runtime_mode.py`` used bare imports of the new Set 048
modules (``from runtime_mode import …``, ``from spec_config import …``).
Those bare forms only resolve under the test ``conftest.py`` ``sys.path``
shim — pip-installed package consumers (the Lightweight target audience)
have no such shim, so the imports raised ``ModuleNotFoundError``. The
``route()`` / ``verify()`` call sites blew up outright; the
``start_session.main()`` / ``close_session.run()`` sites silently
swallowed the error in ``try/except``, so ``--no-router`` was a no-op
across the entire production CLI surface.

The original S2 Round-A verifier flagged this as Major #2 and the
finding was dismissed as a false positive on conftest grounds; that
dismissal was wrong. This test exists so the dismissal cannot recur.

The fix: production code uses relative imports (``from .runtime_mode
import …``). Tests retain the bare form for convention; conftest
remains responsible for the test-only ``sys.path`` shim.

S5 Round-A Major #1: the original line-regex implementation was
narrower than this docstring claimed. It only scanned top-level
``ai_router/*.py`` files and only rejected ``from <mod> import …`` —
it missed bare ``import <mod>``, whitespace variants, same-line suite
forms (``if cond: from <mod> import x``), and any offenders in nested
production subpackages. This implementation walks the AST of every
production module under ``ai_router/`` (excluding ``tests/``) and
rejects both ``ImportFrom`` with ``level == 0`` and matching module,
and ``Import`` of a bare module name.
"""

import ast
from pathlib import Path

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent
TESTS_DIR = AI_ROUTER_DIR / "tests"
SET_048_MODULES = frozenset(
    (
        "runtime_mode",
        "spec_config",
        "suggestion_disposition",
        "migrate_lightweight_to_canonical_v4",
        # Set 077 S4: the external-verification verdict parser is
        # consumed on the same pip-installed Lightweight close path.
        "external_verification",
    )
)


def _production_py_files() -> list[Path]:
    """Yield every .py under ai_router/ except those rooted at tests/."""
    return [
        p
        for p in AI_ROUTER_DIR.rglob("*.py")
        if TESTS_DIR not in p.parents and p != TESTS_DIR
    ]


def _bare_offenders(py_file: Path) -> list[tuple[int, str]]:
    """Return (lineno, source-line) for bare imports of Set 048 modules in py_file."""
    text = py_file.read_text(encoding="utf-8")
    try:
        tree = ast.parse(text, filename=str(py_file))
    except SyntaxError:  # pragma: no cover — production code is parseable by construction
        return []

    source_lines = text.splitlines()
    offenders: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            # Relative imports (`from .mod import …`) have level >= 1.
            # Package-absolute imports (`from ai_router.mod import …`) have
            # module="ai_router.mod" — not in SET_048_MODULES.
            if node.level == 0 and node.module in SET_048_MODULES:
                offenders.append((node.lineno, source_lines[node.lineno - 1].strip()))
        elif isinstance(node, ast.Import):
            # `import runtime_mode` or `import runtime_mode as rm`.
            for alias in node.names:
                if alias.name in SET_048_MODULES:
                    offenders.append((node.lineno, source_lines[node.lineno - 1].strip()))
                    break
    return offenders


def test_no_bare_imports_of_set048_modules_in_production_code():
    bad: list[tuple[str, int, str]] = []
    for py_file in _production_py_files():
        rel = py_file.relative_to(AI_ROUTER_DIR)
        for lineno, source in _bare_offenders(py_file):
            bad.append((str(rel), lineno, source))

    assert not bad, (
        "Production code in ai_router/ has bare imports of Set 048 modules. "
        "These work under the test conftest's sys.path shim but raise "
        "ModuleNotFoundError under pip-install (the Lightweight consumer "
        "target). Use `from .<module> import …` (relative) or "
        "`from ai_router.<module> import …` (absolute) instead.\n"
        "Offenders:\n  "
        + "\n  ".join(f"{fn}:{ln}  {src}" for fn, ln, src in bad)
    )


# ---------- self-tests of the scanner ----------


def test_scanner_rejects_bare_from_import(tmp_path: Path) -> None:
    """ast walk catches `from runtime_mode import x` at module scope."""
    f = tmp_path / "fake_module.py"
    f.write_text("from runtime_mode import is_no_router_mode\n")
    offenders = _bare_offenders(f)
    assert offenders, "bare ImportFrom should be flagged"
    assert offenders[0][0] == 1


def test_scanner_rejects_indented_from_import(tmp_path: Path) -> None:
    """ast walk catches `from runtime_mode import x` inside a function body."""
    f = tmp_path / "fake_module.py"
    f.write_text("def f():\n    from runtime_mode import is_no_router_mode\n    return is_no_router_mode\n")
    offenders = _bare_offenders(f)
    assert offenders, "indented bare ImportFrom should still be flagged"


def test_scanner_rejects_bare_import_statement(tmp_path: Path) -> None:
    """ast walk catches `import runtime_mode` (not the from-form)."""
    f = tmp_path / "fake_module.py"
    f.write_text("import runtime_mode\n")
    offenders = _bare_offenders(f)
    assert offenders, "bare `import <mod>` should be flagged"


def test_scanner_rejects_bare_import_with_alias(tmp_path: Path) -> None:
    """ast walk catches `import runtime_mode as rm`."""
    f = tmp_path / "fake_module.py"
    f.write_text("import runtime_mode as rm\n_ = rm\n")
    offenders = _bare_offenders(f)
    assert offenders


def test_scanner_accepts_relative_import(tmp_path: Path) -> None:
    """ast walk allows `from .runtime_mode import x` (level >= 1)."""
    f = tmp_path / "fake_module.py"
    f.write_text("from .runtime_mode import is_no_router_mode\n")
    assert not _bare_offenders(f)


def test_scanner_accepts_package_absolute_import(tmp_path: Path) -> None:
    """ast walk allows `from ai_router.runtime_mode import x`."""
    f = tmp_path / "fake_module.py"
    f.write_text("from ai_router.runtime_mode import is_no_router_mode\n")
    assert not _bare_offenders(f)


def test_scanner_accepts_unrelated_modules(tmp_path: Path) -> None:
    """ast walk does not flag bare imports of modules outside SET_048_MODULES."""
    f = tmp_path / "fake_module.py"
    f.write_text(
        "from session_state import write_state\n"
        "import progress\n"
    )
    assert not _bare_offenders(f)


def test_scanner_walks_subpackages() -> None:
    """The production-file iterator includes nested .py files, not just top-level."""
    files = _production_py_files()
    # Sanity: there should be at least one nested production file. The
    # repo has, for example, ai_router/scripts/*.py at time of writing.
    # (This guards against accidentally falling back to a single-dir glob.)
    assert any(p.parent != AI_ROUTER_DIR for p in files), (
        "_production_py_files() should include nested subpackages, not just top-level"
    )


def test_scanner_excludes_tests_directory() -> None:
    """Test files (which use the bare-import convention) must not be scanned."""
    files = _production_py_files()
    assert all(TESTS_DIR not in p.parents for p in files), (
        f"_production_py_files() should exclude {TESTS_DIR} but did not"
    )
