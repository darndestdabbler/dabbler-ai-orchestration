"""Falsifiers for the corpus-scan guard (L-112-1, applied to itself).

Set 121 Session 1. The guard in :mod:`ai_router.corpus_scan_guard`
refuses a ``test_*`` function that scans the checked-out repo without
ever asserting the scan found anything. A guard that has never been seen
to fail is exactly what ``L-112-1`` warns about, so every rule here is
proved twice: once by planting the violation and asserting the guard
fires, once by planting the legitimate look-alike and asserting it stays
silent.

The plants go into the corpus the guard actually reads -- a tree handed
to :func:`~ai_router.corpus_scan_guard.scan`, discovered by the guard's
own ``discover_test_modules`` -- rather than being fed to an internal
helper by hand. Selecting by the gate's own corpus definition is the
Set 129 S2 correction; selecting by position is what decayed.
"""

from __future__ import annotations

from pathlib import Path

from ai_router.corpus_scan_guard import (
    TESTS_DIR,
    discover_test_modules,
    offenders_in_module,
    scan,
)

# A scan of the real tree, with no assertion that the real tree matched.
# This is the defect: if the rglob ever stops matching, the test goes on
# passing.
SILENT_SCAN = '''\
from pathlib import Path

AI_ROUTER = Path(__file__).resolve().parent


def test_no_module_does_the_bad_thing():
    offenders = []
    for path in AI_ROUTER.rglob("*.py"):
        if "bad" in path.read_text(encoding="utf-8"):
            offenders.append(path.name)
    assert not offenders, offenders
'''

# The same scan, one line different: it says what it examined.
ASSERTED_SCAN = '''\
from pathlib import Path

AI_ROUTER = Path(__file__).resolve().parent


def test_no_module_does_the_bad_thing():
    scanned = list(AI_ROUTER.rglob("*.py"))
    assert scanned, "the scan examined nothing"
    offenders = [
        path.name
        for path in scanned
        if "bad" in path.read_text(encoding="utf-8")
    ]
    assert not offenders, offenders
'''


def _plant(root: Path, name: str, source: str) -> Path:
    path = root / name
    path.write_text(source, encoding="utf-8")
    return path


# --------------------------------------------------------------------
# The guard, applied to this repository.
# --------------------------------------------------------------------


def test_the_guard_examines_a_real_non_empty_corpus():
    """The guard's own input set, asserted by its own corpus definition.

    Without this, every assertion below would be satisfied by a guard
    that discovered no modules at all -- the failure the guard exists to
    prevent, in the guard itself.
    """
    modules = discover_test_modules(TESTS_DIR)
    assert modules, "the guard discovered no test modules at all"
    assert len(modules) > 50, (
        f"the guard discovered only {len(modules)} test modules; the "
        "corpus is implausibly small and is probably mistargeted"
    )
    # Named members, not a count: a count survives a mistargeted root
    # that happens to find some other tree's tests.
    names = {path.name for path in modules}
    for required in (
        "test_step_status_vocabulary.py",
        "test_production_imports.py",
        "test_packaging_hygiene.py",
    ):
        assert required in names, (
            f"{required} is missing from the guard's corpus; the guard is "
            "reading the wrong tree"
        )


def test_no_test_scans_this_repo_without_saying_what_it_found():
    modules, offenders = scan(TESTS_DIR)
    assert modules, "the guard examined nothing"
    assert offenders == [], (
        "these tests scan the checked-out repo but never assert the scan "
        "matched anything, so they would pass unchanged if the corpus "
        "went empty:\n  "
        + "\n  ".join(str(offender) for offender in offenders)
    )


# --------------------------------------------------------------------
# Planted violations -- the guard must fire.
# --------------------------------------------------------------------


def test_it_fires_on_a_repo_scan_with_no_non_empty_assertion(tmp_path):
    _plant(tmp_path, "test_planted_silent.py", SILENT_SCAN)
    modules, offenders = scan(tmp_path)
    assert modules, "the plant was not discovered by the guard's own corpus"
    assert len(offenders) == 1, offenders
    assert offenders[0].function == "test_no_module_does_the_bad_thing"
    assert offenders[0].module == "test_planted_silent.py"


def test_it_fires_when_the_corpus_is_built_by_a_module_helper(tmp_path):
    """The corpus need not be built in the test function itself."""
    _plant(
        tmp_path,
        "test_planted_helper.py",
        '''\
from pathlib import Path

AI_ROUTER = Path(__file__).resolve().parent


def _sources():
    return list(AI_ROUTER.rglob("*.py"))


def test_nothing_is_bad():
    offenders = [p for p in _sources() if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders
    assert offenders[0].function == "test_nothing_is_bad"


def test_it_fires_when_the_root_comes_from_a_path_provider(tmp_path):
    """A helper that mints the root from ``__file__`` is still the repo."""
    _plant(
        tmp_path,
        "test_planted_provider.py",
        '''\
from pathlib import Path


def _root():
    return Path(__file__).resolve().parent


def test_nothing_is_bad():
    root = _root()
    offenders = [p for p in root.rglob("*.py") if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


def test_an_all_over_the_corpus_is_still_vacuous(tmp_path):
    """``all()`` over an empty sequence is True -- the subtlest shape."""
    _plant(
        tmp_path,
        "test_planted_all.py",
        '''\
from pathlib import Path

AI_ROUTER = Path(__file__).resolve().parent


def test_every_module_is_fine():
    files = list(AI_ROUTER.rglob("*.py"))
    assert all(p.suffix == ".py" for p in files)
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


def test_an_equals_empty_assertion_is_still_vacuous(tmp_path):
    _plant(
        tmp_path,
        "test_planted_eq.py",
        '''\
from pathlib import Path

AI_ROUTER = Path(__file__).resolve().parent


def test_every_module_is_fine():
    offenders = [p for p in AI_ROUTER.rglob("*.py") if "bad" in p.name]
    assert offenders == []
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


def test_it_fires_on_a_layered_helper_chain(tmp_path):
    """Round 1: helper classification must be TRANSITIVE.

    The canonical lint is three layers -- corpus helper, filter helper,
    test -- and the first cut only promoted the helper that touched the
    filesystem directly, so the wrapper shape walked straight through.
    """
    _plant(
        tmp_path,
        "test_planted_layered.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _sources():
    return list(ROOT.rglob("*.py"))


def _violations():
    return [p for p in _sources() if "bad" in p.name]


def test_scan():
    offenders = _violations()
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders
    assert offenders[0].function == "test_scan"


def test_a_lazy_iterator_is_not_a_non_empty_proof(tmp_path):
    """Round 1: ``Path.rglob`` returns a GENERATOR, always truthy.

    ``files = ROOT.rglob("*.py"); assert files`` is itself the vacuous
    assertion, so accepting it would let the guard certify exactly what
    it exists to refuse.
    """
    _plant(
        tmp_path,
        "test_planted_lazy.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def test_scan():
    files = ROOT.rglob("*.py")
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


def test_the_same_scan_materialized_is_accepted(tmp_path):
    """The look-alike for the rule above: one ``list()`` apart."""
    _plant(
        tmp_path,
        "test_planted_materialized.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def test_scan():
    files = list(ROOT.rglob("*.py"))
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_it_fires_on_a_local_dunder_file_root(tmp_path):
    """Round 1: the idiomatic in-function root spelling counts too."""
    _plant(
        tmp_path,
        "test_planted_local_root.py",
        '''\
from pathlib import Path


def test_scan():
    root = Path(__file__).resolve().parent
    offenders = [p for p in root.rglob("*.py") if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


def test_it_fires_on_a_fixture_injected_corpus(tmp_path):
    """Round 2: pytest injects by PARAMETER NAME, not by call.

    Nothing in the test body names the fixture, so call-graph analysis
    alone cannot see the scan.
    """
    _plant(
        tmp_path,
        "test_planted_fixture_corpus.py",
        '''\
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent


@pytest.fixture
def sources():
    return list(ROOT.rglob("*.py"))


def test_no_bad(sources):
    offenders = [p for p in sources if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders
    assert offenders[0].function == "test_no_bad"


def test_a_fixture_injected_corpus_that_is_asserted_is_accepted(tmp_path):
    _plant(
        tmp_path,
        "test_planted_fixture_ok.py",
        '''\
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent


@pytest.fixture
def sources():
    return list(ROOT.rglob("*.py"))


def test_no_bad(sources):
    assert sources, "the fixture handed over an empty corpus"
    offenders = [p for p in sources if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_a_conftest_fixture_corpus_is_seen(tmp_path):
    """A fixture in ``conftest.py`` reaches the test by name alone."""
    (tmp_path / "conftest.py").write_text(
        '''\
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent


@pytest.fixture
def repo_sources():
    return list(ROOT.rglob("*.py"))
''',
        encoding="utf-8",
    )
    _plant(
        tmp_path,
        "test_planted_conftest_use.py",
        '''\
def test_no_bad(repo_sources):
    offenders = [p for p in repo_sources if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


def test_an_accumulated_corpus_counts_as_asserted(tmp_path):
    """The look-alike a scan uses when it must also COUNT what it read.

    ``scanned`` never appears on the left of an assignment -- it is built
    by ``append`` inside the loop -- so a guard that only followed
    assignment would call this silent and be wrong.
    """
    _plant(
        tmp_path,
        "test_planted_accumulator.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def test_scan():
    scanned = []
    offenders = []
    for path in ROOT.rglob("*.py"):
        scanned.append(path)
        if "bad" in path.name:
            offenders.append(path.name)
    assert scanned, "corpus scan found nothing"
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_a_lazy_walk_returned_through_a_helper_is_still_lazy(tmp_path):
    """Round 3: laziness must cross the call boundary.

    ``def _sources(): return ROOT.rglob(...)`` hands back a generator, so
    the caller's ``assert files`` is exactly as vacuous as it would be
    inline. Marking laziness only on the immediate right-hand side left
    the commonest helper form accepted.
    """
    _plant(
        tmp_path,
        "test_planted_lazy_helper.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _sources():
    return ROOT.rglob("*.py")


def test_scan():
    files = _sources()
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders
    assert offenders[0].function == "test_scan"


def test_a_materializing_helper_is_accepted(tmp_path):
    """The look-alike: the same helper with a ``list()`` around it."""
    _plant(
        tmp_path,
        "test_planted_solid_helper.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _sources():
    return list(ROOT.rglob("*.py"))


def test_scan():
    files = _sources()
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_laziness_crosses_two_helper_boundaries(tmp_path):
    """Resolved to a fixpoint, so depth is not capped at one."""
    _plant(
        tmp_path,
        "test_planted_lazy_chain.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _walk():
    return ROOT.rglob("*.py")


def _sources():
    return _walk()


def test_scan():
    files = _sources()
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


def test_a_lazy_fixture_corpus_is_still_lazy(tmp_path):
    """A fixture returning a generator is the same defect by injection."""
    _plant(
        tmp_path,
        "test_planted_lazy_fixture.py",
        '''\
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent


@pytest.fixture
def sources():
    return ROOT.rglob("*.py")


def test_no_bad(sources):
    assert sources
    offenders = [p for p in sources if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert len(offenders) == 1, offenders


# --------------------------------------------------------------------
# Planted look-alikes -- the guard must stay silent.
# --------------------------------------------------------------------


def test_it_stays_silent_when_the_corpus_is_asserted(tmp_path):
    _plant(tmp_path, "test_planted_asserted.py", ASSERTED_SCAN)
    modules, offenders = scan(tmp_path)
    assert modules, "the look-alike was not discovered at all"
    assert offenders == [], offenders


def test_a_membership_assertion_counts_as_non_empty(tmp_path):
    """``assert x in corpus`` is strictly stronger than non-emptiness."""
    _plant(
        tmp_path,
        "test_planted_membership.py",
        '''\
from pathlib import Path

AI_ROUTER = Path(__file__).resolve().parent


def test_every_module_is_fine():
    scanned = {p.name for p in AI_ROUTER.rglob("*.py")}
    assert "cli_transport.py" in scanned
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_a_fixture_rooted_scan_is_not_flagged(tmp_path):
    """The 'assert this wrote nothing' class, which must stay legal.

    A test that builds a tree and then proves the tree is empty is not a
    silent-failure risk: it owns the tree. Flagging it would make the
    guard demand a self-contradictory assertion.
    """
    _plant(
        tmp_path,
        "test_planted_fixture.py",
        '''\
def test_the_dry_run_writes_nothing(tmp_path):
    run_the_thing(tmp_path, dry_run=True)
    assert list(tmp_path.rglob("*.json")) == []
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_an_ast_walk_is_not_a_filesystem_walk(tmp_path):
    """``ast.walk`` shares the name and walks a parsed tree, not a dir."""
    _plant(
        tmp_path,
        "test_planted_ast.py",
        '''\
import ast
from pathlib import Path

CATALOG = Path(__file__).resolve().parent / "copilot_catalog.py"


def test_the_field_keeps_its_default():
    tree = ast.parse(CATALOG.read_text(encoding="utf-8"))
    names = [n.name for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]
    assert names == ["ModelEntry"]
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_a_test_that_scans_nothing_is_not_flagged(tmp_path):
    _plant(
        tmp_path,
        "test_planted_plain.py",
        '''\
def test_two_plus_two():
    assert 2 + 2 == 4
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_materializing_a_lazy_helper_at_the_call_site_is_accepted(tmp_path):
    """Round 5 (close backstop): the wrapper wins over what it wraps.

    ``files = list(_sources())`` is a real list even when ``_sources()``
    returns a generator. Propagating helper laziness unconditionally
    rejected this valid assertion -- a false positive is as damaging as a
    false negative, because it teaches authors the guard is noise.
    """
    _plant(
        tmp_path,
        "test_planted_wrapped_lazy.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _sources():
    return ROOT.rglob("*.py")


def test_scan():
    files = list(_sources())
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_a_helper_that_materializes_a_lazy_helper_is_not_lazy(tmp_path):
    """The same rule one level up, inside the helper chain."""
    _plant(
        tmp_path,
        "test_planted_wrapped_chain.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _walk():
    return ROOT.rglob("*.py")


def _sources():
    return sorted(_walk())


def test_scan():
    files = _sources()
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


def test_a_comprehension_over_a_lazy_helper_is_not_lazy(tmp_path):
    _plant(
        tmp_path,
        "test_planted_comp_lazy.py",
        '''\
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _sources():
    return ROOT.rglob("*.py")


def test_scan():
    files = [p for p in _sources()]
    assert files
    offenders = [p for p in files if "bad" in p.name]
    assert not offenders
''',
    )
    _, offenders = scan(tmp_path)
    assert offenders == [], offenders


# --------------------------------------------------------------------
# The guard reads the corpus it claims to read.
# --------------------------------------------------------------------


def test_the_module_level_entry_point_agrees_with_the_scan(tmp_path):
    """``offenders_in_module`` and ``scan`` must not drift apart."""
    planted = _plant(tmp_path, "test_planted_silent.py", SILENT_SCAN)
    direct = offenders_in_module(planted)
    _, via_scan = scan(tmp_path)
    assert direct == via_scan
    assert direct, "both paths reported nothing on a known violation"
