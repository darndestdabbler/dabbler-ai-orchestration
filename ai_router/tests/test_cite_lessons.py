"""Unit tests for the Set 064 D3 citation path:

- :func:`cite_lessons.normalize_set_label`
- :func:`cite_lessons.cite_one` (active hit, archive hit/reconsider, miss)
- in-place, surgical file rewrite
- the close_session resolver helper :func:`_resolve_lessons_cited`
  (cited + unknown id split, fail-open)
- disposition ``lessons_cited`` round-trip + validation

Bare-filename imports per the package test convention.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import cite_lessons
from cite_lessons import (
    CITED_ACTIVE,
    CITED_ARCHIVED,
    NOT_FOUND,
    cite_one,
    normalize_set_label,
)
from disposition import Disposition, disposition_from_dict, disposition_to_dict, validate_disposition


ACTIVE = """# Lessons Learned

## A Live Lesson
<!-- lesson: id="L-064-1" added-set="030" last-used-set="030" status="active" scope="portable" -->

- **Context:** body
"""

ARCHIVE = """# Lessons Archive

## A Retired Lesson
<!-- lesson: id="L-050-2" added-set="050" last-used-set="050" status="archived" scope="portable" -->

- **Context:** body
"""


@pytest.fixture
def guidance(tmp_path: Path):
    gdir = tmp_path / "docs" / "planning"
    gdir.mkdir(parents=True)
    (gdir / "lessons-learned.md").write_text(ACTIVE, encoding="utf-8")
    (gdir / "lessons-archive.md").write_text(ARCHIVE, encoding="utf-8")
    return tmp_path, gdir


def _files(gdir: Path):
    return [
        ("lessons-learned.md", str(gdir / "lessons-learned.md")),
        ("lessons-archive.md", str(gdir / "lessons-archive.md")),
    ]


# --- normalize ---------------------------------------------------------------


def test_normalize_set_label_pads_integers():
    assert normalize_set_label("64") == "064"
    assert normalize_set_label("7") == "007"
    assert normalize_set_label("128") == "128"
    assert normalize_set_label(" 64 ") == "064"


def test_normalize_set_label_passthrough_non_numeric():
    assert normalize_set_label("064a") == "064a"


# --- cite_one ----------------------------------------------------------------


def test_cite_active_lesson_updates_in_place(guidance):
    _, gdir = guidance
    outcome, path = cite_one(_files(gdir), "L-064-1", "064")
    assert outcome == CITED_ACTIVE
    text = (gdir / "lessons-learned.md").read_text(encoding="utf-8")
    assert 'last-used-set="064"' in text
    # surgical: only the trailer changed
    assert "## A Live Lesson" in text
    assert "- **Context:** body" in text


def test_cite_archived_lesson_flags_reconsider(guidance):
    _, gdir = guidance
    outcome, path = cite_one(_files(gdir), "L-050-2", "064")
    assert outcome == CITED_ARCHIVED
    text = (gdir / "lessons-archive.md").read_text(encoding="utf-8")
    assert 'last-used-set="064"' in text


def test_cite_unknown_id(guidance):
    _, gdir = guidance
    outcome, path = cite_one(_files(gdir), "L-999-9", "064")
    assert outcome == NOT_FOUND
    assert path is None


def test_cite_one_no_change_when_already_current(guidance):
    _, gdir = guidance
    cite_one(_files(gdir), "L-064-1", "064")
    before = (gdir / "lessons-learned.md").read_text(encoding="utf-8")
    cite_one(_files(gdir), "L-064-1", "064")  # idempotent re-cite
    after = (gdir / "lessons-learned.md").read_text(encoding="utf-8")
    assert before == after


def test_main_exit_code_and_repo_root(guidance, capsys):
    repo_root, _ = guidance
    rc = cite_lessons.main(["--set", "64", "L-064-1", "L-999-9", "--repo-root", str(repo_root)])
    out = capsys.readouterr().out
    assert "[cited]" in out
    assert "[not-found]" in out
    assert rc == 1  # one id missing


# --- close_session resolver --------------------------------------------------


def test_resolve_lessons_cited_splits_known_unknown(guidance, monkeypatch):
    repo_root, _ = guidance
    import close_session

    disp = Disposition(
        status="completed",
        summary="s",
        verification_method="api",
        lessons_cited=["L-064-1", "L-050-2", "L-999-9"],
    )
    cited, unknown = close_session._resolve_lessons_cited(disp, repo_root=str(repo_root))
    assert cited == ["L-064-1", "L-050-2", "L-999-9"]
    assert unknown == ["L-999-9"]


def test_resolve_lessons_cited_empty_is_inert(guidance):
    repo_root, _ = guidance
    import close_session

    disp = Disposition(status="completed", summary="s", verification_method="api")
    assert close_session._resolve_lessons_cited(disp, repo_root=str(repo_root)) == ([], [])
    assert close_session._resolve_lessons_cited(None) == ([], [])


# --- disposition field round-trip -------------------------------------------


def test_disposition_lessons_cited_round_trip():
    disp = Disposition(
        status="completed",
        summary="s",
        verification_method="api",
        lessons_cited=["L-064-1", "L-030-2"],
    )
    d = disposition_to_dict(disp)
    assert d["lessons_cited"] == ["L-064-1", "L-030-2"]
    assert disposition_from_dict(d).lessons_cited == ["L-064-1", "L-030-2"]


def test_disposition_lessons_cited_omitted_when_empty():
    disp = Disposition(status="completed", summary="s", verification_method="api")
    assert "lessons_cited" not in disposition_to_dict(disp)


def test_disposition_validate_rejects_non_list_lessons_cited():
    d = {
        "status": "completed",
        "summary": "s",
        "verification_method": "api",
        "files_changed": [],
        "verification_message_ids": [],
        "next_orchestrator": None,
        "blockers": [],
        "lessons_cited": "L-064-1",  # wrong type
    }
    ok, errors = validate_disposition(d, is_final_session=True)
    assert not ok
    assert any("lessons_cited" in e for e in errors)
