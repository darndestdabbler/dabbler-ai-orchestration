"""Set 118 S1 -- tests for the test inventory.

A tool that counts tests, tested. The irony is the spec's own (it caps
this session at 25 new test functions), so this file spends its budget
on the two things that actually go wrong with a counter:

1. **It counts the wrong population.** Every predicate here is planted
   into a corpus the tool reads and asserted from both sides -- what it
   must count AND what it must not. A detector that matches everything
   looks identical to one that matches the right thing (L-112-1).
2. **It drifts.** The whole point of this tool is that the 118 spec's
   figures could not be re-derived. So one test runs it against the
   REAL repository at the commit the spec names and pins all eight
   numbers. If that test ever fails, either history was rewritten or a
   predicate changed meaning -- both of which must be loud.

That last test reads the real repo on purpose: the repository IS the
system under test there, which the Set 118 measurement correction calls
Tier 1 and explicitly excludes from "coupling debt".
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

import suite_inventory as inv

# The commit the 118 spec's re-read table was measured at (Set 128 S3).
SPEC_REREAD_REV = "ab47a3e7"


def _write(root: Path, files: dict) -> None:
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def _tiny_corpus(root: Path, tests: dict, production: dict | None = None) -> None:
    """A minimal repo shaped like this one: production modules + tests."""
    _write(root, {f"ai_router/tests/{name}": text for name, text in tests.items()})
    _write(root, {f"ai_router/{name}": text for name, text in (production or {}).items()})


# ---------------------------------------------------------------------------
# The file predicates -- what is in the population and what is not
# ---------------------------------------------------------------------------


def test_the_test_file_predicate_takes_only_test_prefixed_files_under_tests():
    assert inv.is_test_file("ai_router/tests/test_thing.py")
    assert inv.is_test_file("ai_router/tests/e2e/test_nested.py")
    # The seven helpers that made a naive count read 131 files instead of 124.
    assert not inv.is_test_file("ai_router/tests/conftest.py")
    assert not inv.is_test_file("ai_router/tests/stamp_fixtures.py")
    assert not inv.is_test_file("ai_router/tests/e2e/fixtures.py")
    # A module whose NAME starts with test_ but which lives OUTSIDE
    # ai_router/tests/ is not a test file. This module was originally
    # named ai_router/test_inventory.py, per the spec, until
    # test_packaging_hygiene.py refused it -- see the rename note in the
    # module docstring.
    assert not inv.is_test_file("ai_router/test_inventory.py")
    assert not inv.is_test_file("ai_router/suite_inventory.py")
    assert not inv.is_test_file("ai_router/tests/test_thing.txt")


def test_the_production_predicate_excludes_tests_and_includes_scripts():
    assert inv.is_production_module("ai_router/session_state.py")
    # scripts/ is on sys.path via conftest, so tests import it bare.
    assert inv.is_production_module("ai_router/scripts/drift_guard.py")
    assert inv.is_production_module("ai_router/suite_inventory.py")
    assert not inv.is_production_module("ai_router/tests/test_thing.py")
    assert not inv.is_production_module("tools/extension/thing.py")


# ---------------------------------------------------------------------------
# Volume counters
# ---------------------------------------------------------------------------


def test_the_line_predicate_counts_async_and_indented_defs():
    text = (
        "def test_plain():\n    pass\n"
        "async def test_async():\n    pass\n"
        "class TestGroup:\n    def test_method(self):\n        pass\n"
        "def helper():\n    pass\n"
        "def testing_not_a_test():\n    pass\n"
    )
    assert inv.count_test_functions(text) == 3


def test_the_ast_cross_check_diverges_when_def_test_hides_in_a_string():
    """The 'differs' note in the report must be able to fire."""
    text = 'DOC = """\ndef test_not_really():\n"""\n\ndef test_real():\n    pass\n'
    tree = inv._parse(text, "x.py")
    assert inv.count_test_functions(text) == 2, "the line predicate is fooled"
    assert inv.count_test_functions_ast(tree) == 1, "the AST predicate is not"


def test_loc_counts_blank_and_comment_lines():
    """The 60,188-vs-52,868 discrepancy is exactly this choice."""
    assert inv.count_loc("code\n\n# comment\ncode\n") == 4


# ---------------------------------------------------------------------------
# The import map (A1: what 'targeted' resolves to)
# ---------------------------------------------------------------------------


def test_imports_resolve_every_spelling_the_suite_uses(tmp_path):
    _tiny_corpus(
        tmp_path,
        tests={
            "test_a.py": (
                "import json\n"
                "import session_state\n"
                "from ai_router.progress import thing\n"
                "from ai_router import metrics\n"
                "import importlib\n"
                "mod = importlib.import_module('drift_guard')\n"
                "def test_a():\n    pass\n"
            )
        },
        production={
            "session_state.py": "x = 1\n",
            "progress.py": "x = 1\n",
            "metrics.py": "x = 1\n",
            "scripts/drift_guard.py": "x = 1\n",
        },
    )
    record = inv.build_inventory(tmp_path, dates=False).files[0]
    assert record.imports == [
        "ai_router/metrics.py",
        "ai_router/progress.py",
        "ai_router/scripts/drift_guard.py",
        "ai_router/session_state.py",
    ]


def test_an_unknown_name_cannot_inflate_the_import_map(tmp_path):
    """Falsifier: stdlib and third-party imports must contribute nothing."""
    _tiny_corpus(
        tmp_path,
        tests={"test_a.py": "import json\nimport pytest\nimport requests\ndef test_a():\n    pass\n"},
        production={"session_state.py": "x = 1\n"},
    )
    inventory = inv.build_inventory(tmp_path, dates=False)
    assert inventory.files[0].imports == []
    assert inventory.uncovered_modules == ["ai_router/session_state.py"]


# ---------------------------------------------------------------------------
# Coupling -- the detector spread IS the finding
# ---------------------------------------------------------------------------


def test_d1_needs_the_substring_reading_of_repo_root():
    """The load-bearing clause: `_repo_root()` is why D1 reads 43, not 42.

    Set 128 S3 reported 43 files / 1,294 tests for the spec's prose
    detector. Anchoring repo_root on word boundaries excludes helpers
    named ``_repo_root`` and loses a whole 43-test file. The spec never
    wrote the detector down, so both readings were defensible -- this
    test pins which one D1 means.
    """
    detectors = inv.coupling_detectors("def _repo_root():\n    return 1\n")
    assert detectors["D1-spec-prose"]
    assert detectors["D2-bare-file"]
    assert not detectors["D3-derives-repo-path"]


def test_a_repo_root_KEYWORD_is_not_coupling(tmp_path):
    """The over-count the measurement correction found, as an assertion.

    Passing a tmp_path to a parameter NAMED repo_root is the opposite of
    reaching into the real tree, yet the spec's regex counted it.
    """
    text = "def test_a(tmp_path):\n    run(repo_root=str(tmp_path))\n"
    detectors = inv.coupling_detectors(text)
    assert detectors["D1-spec-prose"], "the spec's detector fires..."
    assert not detectors["D3-derives-repo-path"], "...but nothing real is touched"
    assert inv.coupling_tier(detectors) == inv.TIER_NAMES_ONLY


def test_strong_coupling_needs_both_a_real_path_and_an_enumeration():
    weak = inv.coupling_detectors("ROOT = Path(__file__).parent\n")
    assert weak["D3-derives-repo-path"]
    assert not weak["D4-enumerates-real-tree"]
    assert inv.coupling_tier(weak) == inv.TIER_WEAK

    strong = inv.coupling_detectors("ROOT = Path(__file__).parent\nfor p in ROOT.rglob('*.md'):\n    pass\n")
    assert strong["D4-enumerates-real-tree"]
    assert inv.coupling_tier(strong) == inv.TIER_STRONG

    assert inv.coupling_tier(inv.coupling_detectors("def test_a(tmp_path):\n    pass\n")) == inv.TIER_SANDBOXED


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------


def test_test_data_in_a_string_is_not_coupling():
    """The second over-count the measurement correction named.

    Found in this tool's own output: the test file you are reading plants
    `.rglob(` in a string to prove D4 fires, and was tiered `strong`
    until D3/D4 started reading code instead of text. A path that appears
    as test DATA is not a path anything opens.
    """
    planted = 'SAMPLE = "ROOT = Path(__file__).parent\\nfor p in ROOT.rglob(\'*.md\'): pass"\n'
    detectors = inv.coupling_detectors(planted)
    assert not detectors["D3-derives-repo-path"], "a string literal opens nothing"
    assert not detectors["D4-enumerates-real-tree"]
    assert inv.coupling_tier(detectors) == inv.TIER_NAMES_ONLY
    # ...and the historical detectors stay textual on purpose, because
    # they exist to reproduce a regex, and a regex sees strings.
    assert detectors["D2-bare-file"]

    real = 'ROOT = Path(__file__).parent\nfor p in ROOT.rglob("*.md"):\n    pass\n'
    assert inv.coupling_tier(inv.coupling_detectors(real)) == inv.TIER_STRONG


def test_a_file_that_does_not_tokenize_is_counted_not_exempted():
    """Fail loud, not open: an unparseable file keeps its textual reading."""
    broken = "def test_a(:\n    ROOT = Path(__file__)\n"
    assert inv.coupling_detectors(broken)["D3-derives-repo-path"]


def test_enumerating_a_tmp_path_is_not_strong_coupling():
    """Round 2 Major: D4 was a file-level co-occurrence check.

    `test_session_state_backfill.py` derives a SCRIPT path from
    `__file__` and, elsewhere and unrelatedly, calls `.iterdir()` on a
    `tmp_path`. A grep sees both tokens in one file and calls it "reaches
    into the real tree"; nothing of the sort happens. D4 now asks whether
    the ENUMERATED path derives from `__file__`, which is a dataflow
    question, and D3a keeps the grep reading so the over-count stays
    visible instead of being quietly replaced.
    """
    text = (
        "SCRIPT = Path(__file__).resolve().parent.parent / 'scripts' / 'x.py'\n"
        "def test_a(tmp_path):\n"
        "    leftover = list(tmp_path.iterdir())\n"
        "    assert not leftover\n"
    )
    detectors = inv.coupling_detectors(text)
    assert detectors["D3-derives-repo-path"], "it does derive a path from __file__"
    assert detectors["D3a-enumerates-anywhere"], "and a grep sees an enumeration..."
    assert not detectors["D4-enumerates-real-tree"], "...but not of the real tree"
    assert inv.coupling_tier(detectors) == inv.TIER_WEAK


def test_a_repo_root_handed_to_a_scanner_and_iterated_is_strong():
    """The other direction: the grep MISSES this, and it is real coupling.

    The repository-is-the-system-under-test guards do not enumerate the
    tree themselves -- they hand the real root to a production scanner
    and walk what comes back.
    """
    text = (
        "def _repo_root():\n"
        "    return Path(guard.__file__).resolve().parent.parent\n"
        "def test_a():\n"
        "    scanned = list(guard.iter_scanned_files(_repo_root()))\n"
        "    assert scanned\n"
    )
    detectors = inv.coupling_detectors(text)
    assert not detectors["D3a-enumerates-anywhere"], "no glob/iterdir token to grep"
    assert detectors["D4-enumerates-real-tree"], "but the real root is walked"

    # Narrow on purpose: a result that is merely asserted on proves
    # nothing was enumerated.
    merely_called = (
        "def _repo_root():\n"
        "    return Path(__file__).parent\n"
        "def test_a():\n"
        "    assert helper(_repo_root()) == 3\n"
    )
    assert not inv.coupling_detectors(merely_called)["D4-enumerates-real-tree"]


def test_a_dynamic_entry_point_import_is_credited_not_dropped(tmp_path):
    """Round 1 Major: `report.py` was reported uncovered when it is not.

    `test_entry_points.py` imports every `[project.scripts]` target
    through a variable read out of pyproject.toml. Static analysis cannot
    resolve that -- but reading it as "imports nothing" is a false
    negative on the A1 map, which is the surface Session 3 retires
    against.
    """
    _write(
        tmp_path,
        {
            "pyproject.toml": (
                '[project]\nname = "x"\n\n[project.scripts]\n'
                'report = "ai_router.report:main"\n'
            )
        },
    )
    _tiny_corpus(
        tmp_path,
        tests={
            "test_entry_points.py": (
                "import importlib\n"
                "def _eps():\n"
                "    return tomllib.load(open('pyproject.toml', 'rb'))\n"
                "def test_a():\n"
                "    for name, target in _eps().items():\n"
                "        importlib.import_module(target.partition(':')[0])\n"
            ),
            "test_opaque.py": (
                "import importlib\n"
                "def test_a(name):\n"
                "    importlib.import_module(name)\n"
            ),
        },
        production={"report.py": "def main():\n    pass\n"},
    )
    inventory = inv.build_inventory(tmp_path, dates=False)
    by_name = {Path(f.path).name: f for f in inventory.files}
    assert by_name["test_entry_points.py"].imports == ["ai_router/report.py"]
    assert "ai_router/report.py" not in inventory.uncovered_modules
    # The unresolvable one is a HOLE in the map, not a zero, and says so.
    assert by_name["test_opaque.py"].dynamic_import_calls == 1
    assert inventory.unresolved_dynamic_files == ["ai_router/tests/test_opaque.py"]


def test_os_path_plumbing_is_not_an_enumeration():
    """Round 3 Major: `join` in the consumer set caught `os.path.join`.

    Half the suite builds a fixture path with
    `os.path.join(os.path.dirname(os.path.abspath(__file__)), ...)`.
    That constructs a path; it never walks one. Treating `join` as an
    iterable consumer (it was there for `"\\n".join(...)`) made every
    such file strongly coupled.
    """
    text = (
        "import os\n"
        'FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "x.json")\n'
    )
    detectors = inv.coupling_detectors(text)
    assert detectors["D3-derives-repo-path"]
    assert not detectors["D4-enumerates-real-tree"], "constructing is not enumerating"
    assert inv.coupling_tier(detectors) == inv.TIER_WEAK


def test_an_unreadable_pyproject_fails_closed_to_a_visible_hole(tmp_path, monkeypatch):
    """Round 3 Major: the entry-point fix went silent on Python 3.10.

    `requires-python = ">=3.10"` but `tomllib` is 3.11+. Returning `[]`
    when it is missing let the caller treat the file as handled, which
    restored the exact false-uncovered defect round 1 found -- with no
    warning anywhere. Unreadable must mean UNRESOLVED, not empty.
    """
    _write(tmp_path, {"pyproject.toml": '[project.scripts]\nreport = "ai_router.report:main"\n'})
    _tiny_corpus(
        tmp_path,
        tests={
            "test_entry_points.py": (
                "import importlib\n"
                "def test_a():\n"
                "    p = 'pyproject.toml'\n"
                "    importlib.import_module(read(p))\n"
            )
        },
        production={"report.py": "def main():\n    pass\n"},
    )
    resolved = inv.build_inventory(tmp_path, dates=False)
    assert resolved.unresolved_dynamic_files == [], "readable pyproject resolves"

    monkeypatch.setattr(inv, "tomllib", None)
    blind = inv.build_inventory(tmp_path, dates=False)
    assert blind.unresolved_dynamic_files == ["ai_router/tests/test_entry_points.py"], (
        "a parser this interpreter does not have must produce a HOLE, "
        "not a confident zero"
    )


def test_one_absence_shaped_test_does_not_paint_a_large_file_a_guard(tmp_path):
    """The majority clause, which took the population from 53 files to 5.

    Without it the heuristic called half the suite a guard, which would
    have handed Session 2's retirement rule a meaningless population.
    """
    body = "".join(f"def test_ordinary_{i}():\n    pass\n" for i in range(10))
    _tiny_corpus(tmp_path, tests={"test_big.py": body + "def test_guard_clause():\n    pass\n"})
    record = inv.build_inventory(tmp_path, dates=False).files[0]
    assert record.guard_functions == ["test_guard_clause"]
    assert not record.guard, "one guard-shaped test in eleven is not a guard file"


def test_a_majority_of_guard_shaped_tests_makes_a_guard_file(tmp_path):
    _tiny_corpus(
        tmp_path,
        tests={
            "test_small.py": (
                "def test_the_tier_stays_gone():\n    pass\n"
                "def test_it_does_not_resurrect():\n    pass\n"
                "def test_ordinary():\n    pass\n"
            )
        },
    )
    record = inv.build_inventory(tmp_path, dates=False).files[0]
    assert record.guard and record.guard_source == "heuristic"
    assert any("2 of 3" in line for line in record.guard_evidence)


def test_a_word_that_means_something_else_here_is_not_a_guard_signal(tmp_path):
    """Found by spot-checking the tool's own output, not by reading it.

    Bare 'resurrection' looked like a strong permanence signal, and in
    this repo it is not: the verification loop uses it for a settled
    finding that reappears. It flagged test_blocking_classifier.py and
    test_post_round_delta.py, neither of which guards an absence. The
    heuristic is tuned for precision because Session 2's rule consumes
    this population.
    """
    _tiny_corpus(
        tmp_path,
        tests={
            "test_loop.py": (
                '"""A resolved finding that reappears is a resurrection the loop refuses."""\n'
                "def test_ordinary():\n    pass\n"
            ),
            "test_real.py": (
                '"""The deleted tier stays gone."""\ndef test_ordinary():\n    pass\n'
            ),
        },
    )
    by_name = {Path(f.path).name: f for f in inv.build_inventory(tmp_path, dates=False).files}
    assert not by_name["test_loop.py"].guard, "the loop's sense of the word is not permanence"
    assert by_name["test_real.py"].guard, "...but the tool must still catch the real thing"


def test_the_marker_beats_the_heuristic_and_carries_the_function(tmp_path):
    """Session 2 ships the marker; this is the reader waiting for it."""
    _tiny_corpus(
        tmp_path,
        tests={
            "test_ordinary_name.py": (
                "import pytest\n"
                "@pytest.mark.guard(protects='the lightweight tier', removed_in_set=112)\n"
                "def test_something_entirely_ordinary():\n    pass\n"
            )
        },
    )
    record = inv.build_inventory(tmp_path, dates=False).files[0]
    assert record.guard and record.guard_source == "marker"
    assert record.marker_guard_functions == ["test_something_entirely_ordinary"]


def test_guard_age_is_latest_set_minus_the_set_the_guard_names(tmp_path):
    (tmp_path / "docs/session-sets/129-a-set").mkdir(parents=True)
    (tmp_path / "docs/session-sets/112-older").mkdir(parents=True)
    _tiny_corpus(
        tmp_path,
        tests={
            "test_set111_close_gates.py": "def test_a():\n    pass\n",
            "test_from_docstring.py": '"""Set 112 S3 -- the tier stays gone."""\ndef test_a():\n    pass\n',
            "test_guard_with_no_set.py": "def test_a():\n    pass\n",
        },
    )
    by_name = {Path(f.path).name: f for f in inv.build_inventory(tmp_path, dates=False).files}
    assert by_name["test_set111_close_gates.py"].guarded_set == 111
    assert by_name["test_set111_close_gates.py"].age_in_sets == 18
    assert by_name["test_from_docstring.py"].guarded_set == 112
    assert by_name["test_from_docstring.py"].age_in_sets == 17
    # A guard naming no set yields no age -- reported, never guessed.
    assert by_name["test_guard_with_no_set.py"].guard
    assert by_name["test_guard_with_no_set.py"].age_in_sets is None


# ---------------------------------------------------------------------------
# Sole cover (A1)
# ---------------------------------------------------------------------------


def test_sole_cover_flags_the_only_importer_and_clears_on_a_second(tmp_path):
    production = {"session_state.py": "x = 1\n"}
    _tiny_corpus(
        tmp_path,
        tests={"test_only.py": "import session_state\ndef test_a():\n    pass\n"},
        production=production,
    )
    first = inv.build_inventory(tmp_path, dates=False)
    assert first.files[0].sole_cover_for == ["ai_router/session_state.py"]

    _tiny_corpus(
        tmp_path,
        tests={"test_second.py": "import session_state\ndef test_b():\n    pass\n"},
        production=production,
    )
    second = inv.build_inventory(tmp_path, dates=False)
    assert all(f.sole_cover_for == [] for f in second.files), (
        "two covers means neither is sole -- retiring one no longer "
        "changes what 'targeted' resolves to"
    )


# ---------------------------------------------------------------------------
# The contract, and the pin against the real repository
# ---------------------------------------------------------------------------


def test_the_json_contract_publishes_the_predicate_behind_every_number(tmp_path):
    _tiny_corpus(tmp_path, tests={"test_a.py": "def test_a():\n    pass\n"})
    payload = json.loads(json.dumps(inv.build_inventory(tmp_path, dates=False).to_dict()))
    assert payload["contractVersion"] == inv.JSON_CONTRACT_VERSION
    # Publishing the RESULT without the RULE is the defect this set exists
    # to fix, so the contract carries both or it carries nothing.
    for key in (
        "test-file",
        "test-function",
        "test-loc",
        "coupling.D1-spec-prose",
        "coupling.D4-enumerates-real-tree",
        "coupling.tier",
        "guard.heuristic",
        "guard.limits",
        "sole-cover",
    ):
        assert payload["predicates"][key], f"predicate {key} is unpublished"
    assert payload["totals"]["testFunctions"] == 1
    assert payload["files"][0]["coupling"]["tier"] == inv.TIER_SANDBOXED


def _rev_available(root: Path, rev: str) -> bool:
    return (
        subprocess.run(
            ["git", "cat-file", "-e", f"{rev}^{{commit}}"],
            cwd=str(root),
            capture_output=True,
        ).returncode
        == 0
    )


def test_the_spec_re_read_figures_are_reproducible_by_command():
    """Every number in the 118 spec's re-read table, pinned to its commit.

    This is the session's deliverable stated as an assertion: before it,
    the spec's counts came from a shell command nobody wrote down, and
    its coupling figure could not be reproduced under its own prose. All
    eight numbers below now fall out of one command.
    """
    root = Path(inv.__file__).resolve().parent.parent
    if not _rev_available(root, SPEC_REREAD_REV):
        pytest.skip(f"{SPEC_REREAD_REV} is not present in this clone")

    snapshot = inv.build_inventory(root, rev=SPEC_REREAD_REV, dates=False)

    # L-112-1: assert the INPUT SET is non-empty. A corpus that came back
    # empty would satisfy nothing below by satisfying nothing at all.
    assert snapshot.test_files > 100, "the corpus is empty -- every count below is vacuous"

    assert snapshot.test_files == 133
    assert snapshot.test_functions == 3513
    assert snapshot.test_loc == 67182
    assert snapshot.production_loc == 67634
    assert round(snapshot.ratio, 2) == 0.99
    assert snapshot.parametrize_decorators == 142

    # The coupling bracket: the spec's stated 47/1,485 sat BETWEEN these
    # two readings of one sentence, which is how Set 128 established the
    # figure was detector-dependent. Both are now named and re-derivable.
    detectors = snapshot.detector_totals()
    assert (detectors["D1-spec-prose"]["files"], detectors["D1-spec-prose"]["testFunctions"]) == (48, 1452)
    assert (detectors["D2-bare-file"]["files"], detectors["D2-bare-file"]["testFunctions"]) == (55, 1711)
    # D3a is the measurement correction's own grep, reproduced so the
    # over-count stays visible; D4 is the dataflow answer that supersedes
    # it. Pinned together because the GAP between them is the finding.
    assert (detectors["D3a-enumerates-anywhere"]["files"], detectors["D3a-enumerates-anywhere"]["testFunctions"]) == (7, 167)
    assert (detectors["D4-enumerates-real-tree"]["files"], detectors["D4-enumerates-real-tree"]["testFunctions"]) == (9, 222)
