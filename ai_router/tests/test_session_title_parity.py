"""Set 115 S1 — the Python half of the cross-language title-parity gate.

**Who uses this:** CI and the full-pytest close gate.
**See also:** ``ai_router/tests/fixtures/session-title-parity.json`` (the
corpus, whose ``_readme`` explains the mechanism);
``tools/dabbler-ai-orchestration/src/test/suite/sessionTitleParity.test.ts``
(the TypeScript half, asserting the same corpus).

---

Two implementations resolve a session's title, and they disagreed: the
router's writer resolved the spec's real headings while the extension's
synthesizer hardcoded ``Session ${n}`` in a module that had already
computed the title map. Because resolution puts the stored ledger first,
whichever writer reached disk first made its answer permanent — which is
why every set in the Explorer showed generic labels.

This half drives the REAL helpers: :func:`progress.heal_title` and
:func:`progress.heal_generic_titles` for the pure rule, and
:func:`session_state._build_sessions_array` over an on-disk ``spec.md``
for the end-to-end claim.

Neither language owns the corpus. Change Python alone and this fails;
change TypeScript alone and its test fails; change the corpus alone and
both fail.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from ai_router import session_state
from ai_router.progress import (
    heal_generic_titles,
    heal_title,
    is_generic_title,
    needs_title_heal,
    normalize_to_v4_shape,
)


FIXTURE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "fixtures",
    "session-title-parity.json",
)


def _load() -> dict:
    with open(FIXTURE_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


CORPUS = _load()
CASES = CORPUS["cases"]
SPEC_FIXTURE = CORPUS["specFixture"]


def _spec_titles(case: dict) -> dict:
    return {int(k): v for k, v in case["specTitles"].items()}


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_heal_title_matches_corpus(case: dict) -> None:
    assert (
        heal_title(case["storedTitle"], case["number"], _spec_titles(case))
        == case["expected"]
    ), case["name"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_is_generic_title_matches_corpus(case: dict) -> None:
    assert (
        is_generic_title(case["storedTitle"], case["number"]) is case["isGeneric"]
    ), case["name"]


def test_heal_generic_titles_applies_the_rule_across_an_array() -> None:
    sessions = [
        {"number": 1, "title": "Session 1", "status": "complete"},
        {"number": 2, "title": "A title the operator wrote", "status": "complete"},
        {"number": 3, "title": "Session 3", "status": "not-started"},
    ]
    healed = heal_generic_titles(sessions, {1: "First", 2: "Second", 3: "Third"})
    assert healed == 2
    assert [s["title"] for s in sessions] == [
        "First",
        "A title the operator wrote",
        "Third",
    ]


def test_needs_title_heal_is_the_cheap_precheck() -> None:
    # The reader consults this BEFORE reading spec.md, so a healthy set
    # costs no extra disk read on the tree scan.
    assert needs_title_heal([{"number": 1, "title": "Real title"}]) is False
    assert needs_title_heal([{"number": 1, "title": "Session 1"}]) is True
    assert needs_title_heal([{"number": 1, "title": None}]) is True
    # Malformed entries are the invariant validators' complaint, not this
    # helper's: they must not provoke a spec read on their own.
    assert needs_title_heal([{"title": "Session 1"}]) is False


def _write_spec(tmp_path: Path) -> Path:
    set_dir = tmp_path / "115-fixture"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(SPEC_FIXTURE["specMd"], encoding="utf-8")
    return set_dir


def test_writer_resolves_titles_from_spec_when_no_prior_ledger(tmp_path: Path) -> None:
    set_dir = _write_spec(tmp_path)
    sessions = session_state._build_sessions_array(
        str(set_dir), total=3, prior_state=None
    )
    assert [s["title"] for s in sessions] == SPEC_FIXTURE["expectedFromEmpty"]


def test_writer_heals_a_sticky_generic_ledger(tmp_path: Path) -> None:
    # The exact state 130 rows of this repo were in: a stored `Session N`
    # carried forward by every boundary write, with one genuinely
    # operator-authored title that must survive untouched.
    set_dir = _write_spec(tmp_path)
    prior = {
        "schemaVersion": 4,
        "sessions": [
            {"number": n, "title": t, "status": "not-started"}
            for n, t in enumerate(SPEC_FIXTURE["storedTitles"], start=1)
        ],
    }
    sessions = session_state._build_sessions_array(
        str(set_dir), total=3, prior_state=prior
    )
    assert [s["title"] for s in sessions] == SPEC_FIXTURE["expectedTitles"]


def test_reader_heals_a_closed_set_without_rewriting_it(tmp_path: Path) -> None:
    # A closed set gets no further boundary write, so the read view is the
    # only place its generic labels can heal — and it must heal WITHOUT
    # touching the file (no migration script; closed history is a record).
    set_dir = _write_spec(tmp_path)
    state = {
        "schemaVersion": 4,
        "sessionSetName": "115-fixture",
        "status": "complete",
        "sessions": [
            {"number": n, "title": t, "status": "complete"}
            for n, t in enumerate(SPEC_FIXTURE["storedTitles"], start=1)
        ],
    }
    state_path = set_dir / "session-state.json"
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    before = state_path.read_text(encoding="utf-8")

    view = normalize_to_v4_shape(state, set_dir / "spec.md")

    assert [s["title"] for s in view["sessions"]] == SPEC_FIXTURE["expectedTitles"]
    assert state_path.read_text(encoding="utf-8") == before, "the read must not write"


def test_reader_leaves_a_healthy_ledger_alone(tmp_path: Path) -> None:
    set_dir = _write_spec(tmp_path)
    state = {
        "schemaVersion": 4,
        "sessionSetName": "115-fixture",
        "status": "complete",
        "sessions": [
            {"number": 1, "title": "Something else entirely", "status": "complete"},
        ],
    }
    view = normalize_to_v4_shape(state, set_dir / "spec.md")
    assert view["sessions"][0]["title"] == "Something else entirely"


def test_reader_survives_a_missing_spec(tmp_path: Path) -> None:
    # A generic title with no readable spec must degrade to the stored
    # label, not to an exception — the Explorer scans folders it does not
    # control.
    set_dir = tmp_path / "no-spec"
    set_dir.mkdir()
    state = {
        "schemaVersion": 4,
        "sessionSetName": "no-spec",
        "status": "not-started",
        "sessions": [{"number": 1, "title": "Session 1", "status": "not-started"}],
    }
    view = normalize_to_v4_shape(state, set_dir / "spec.md")
    assert view["sessions"][0]["title"] == "Session 1"
