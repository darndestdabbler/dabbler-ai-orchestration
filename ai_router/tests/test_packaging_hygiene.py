"""Packaging-hygiene regrowth guards (Set 051 V6).

Fast, build-free assertions that keep the wheel clean over time:

1. Every ``test_*.py`` lives under ``ai_router/tests/`` (the only test
   location). Combined with the ``[tool.setuptools.packages.find]``
   exclude of ``ai_router.tests*`` (asserted below), this guarantees no
   test module can ship in the wheel — the fast equivalent of a
   build-and-inspect-wheel check, which is slow/flaky to run in-suite.
2. The dead joiner island + ``dabbler_launch`` stay removed (regrowth
   guard for the Set 051 cleanup).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover
    tomllib = None


def _ai_router_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_all_test_modules_live_under_tests_dir():
    """No stray ``test_*.py`` outside ai_router/tests/ (collision + wheel guard)."""
    ai_router = _ai_router_dir()
    tests_dir = ai_router / "tests"
    scanned = [
        path
        for path in ai_router.rglob("test_*.py")
        if "__pycache__" not in path.parts
    ]
    # L-112-1: an empty corpus would pass having examined nothing.
    assert scanned, (
        "the stray-test-module scan found no test modules at all -- it is "
        "reading the wrong tree"
    )
    strays = []
    for path in scanned:
        try:
            path.relative_to(tests_dir)
        except ValueError:
            strays.append(str(path.relative_to(ai_router)))
    assert not strays, (
        "test modules found outside ai_router/tests/ "
        "(would split test collection and risk shipping in the wheel): "
        + ", ".join(sorted(strays))
    )


def test_dead_modules_stay_removed():
    ai_router = _ai_router_dir()
    assert not (ai_router / "joiner").exists(), "ai_router/joiner was removed in Set 051"
    assert not (ai_router / "dabbler_launch.py").exists(), (
        "ai_router/dabbler_launch.py was removed in Set 051"
    )


def test_wheel_config_excludes_tests():
    if tomllib is None:
        pytest.skip("tomllib unavailable (Python < 3.11)")
    with open(_repo_root() / "pyproject.toml", "rb") as f:
        data = tomllib.load(f)
    find = (
        data.get("tool", {})
        .get("setuptools", {})
        .get("packages", {})
        .get("find", {})
    )
    exclude = set(find.get("exclude", []))
    assert "ai_router.tests" in exclude
    assert "ai_router.tests.*" in exclude
    # namespaces=false keeps __init__-less dirs (e.g. ai_router/scripts/)
    # from being auto-discovered as implicit namespace packages.
    assert find.get("namespaces") is False
