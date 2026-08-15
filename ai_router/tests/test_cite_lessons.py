"""Unit tests for the Set 064 D3 citation path:

- :func:`cite_lessons.normalize_set_label`
- :func:`cite_lessons.cite_one` (active hit, archive hit/reconsider, miss)
- Set 121 S2: the usage record lands in the guidance LEDGER, and the
  preload markdown is left byte-identical
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
from guidance_ledger import load_ledger, upsert_entry
from disposition import Disposition, disposition_from_dict, disposition_to_dict, validate_disposition


ACTIVE = """# Lessons Learned

## A Live Lesson
<!-- lesson: id="L-064-1" added-set="030" scope="portable" -->

- **Context:** body
"""

ARCHIVE = """# Lessons Archive

## A Retired Lesson
<!-- lesson: id="L-050-2" added-set="050" status="archived" scope="portable" -->

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


def test_cite_active_lesson_resolves_without_touching_the_file(guidance):
    """PLANTED: the preload document must come back byte-identical.

    Before Set 121 S2 this call rewrote a trailer inside an always-loaded
    file, which is both a per-session token tax and the reason the close
    backstop kept buying a metered round to re-verify an unchanged tree.
    """
    _, gdir = guidance
    before = (gdir / "lessons-learned.md").read_text(encoding="utf-8")
    outcome, path = cite_one(_files(gdir), "L-064-1")
    assert outcome == CITED_ACTIVE
    assert path.endswith("lessons-learned.md")
    assert (gdir / "lessons-learned.md").read_text(encoding="utf-8") == before


def test_cite_archived_lesson_flags_reconsider(guidance):
    _, gdir = guidance
    before = (gdir / "lessons-archive.md").read_text(encoding="utf-8")
    outcome, path = cite_one(_files(gdir), "L-050-2")
    assert outcome == CITED_ARCHIVED
    assert (gdir / "lessons-archive.md").read_text(encoding="utf-8") == before


def test_cite_unknown_id(guidance):
    _, gdir = guidance
    outcome, path = cite_one(_files(gdir), "L-999-9")
    assert outcome == NOT_FOUND
    assert path is None


def test_main_records_the_use_in_the_ledger(guidance):
    """The record moved; it did not disappear."""
    repo_root, gdir = guidance
    assert cite_lessons.main(
        ["--set", "64", "--session", "2", "L-064-1", "--repo-root", str(repo_root)]
    ) == 0
    ledger, problems = load_ledger(str(repo_root))
    assert problems == []
    assert ledger.entries["L-064-1"].uses == ["064-02"]
    assert ledger.entries["L-064-1"].kind == "instruction"


def test_main_is_idempotent_within_one_session(guidance):
    """Citing twice in one session is one use, not two ring slots."""
    repo_root, _ = guidance
    args = ["--set", "64", "--session", "2", "L-064-1", "--repo-root", str(repo_root)]
    cite_lessons.main(args)
    cite_lessons.main(args)
    ledger, _ = load_ledger(str(repo_root))
    assert ledger.entries["L-064-1"].uses == ["064-02"]


def test_main_refuses_to_credit_an_executable_for_being_mentioned(
    guidance, capsys
):
    """PLANTED LOOK-ALIKE: a check earns a use by FIRING, never by mention.

    Recording mere execution (or mention) would be worthless -- a check
    that runs in CI every session would look permanently in use.
    """
    repo_root, _ = guidance
    upsert_entry(
        "L-064-1", kind="executable", cost="cheap", repo_root=str(repo_root)
    )
    rc = cite_lessons.main(
        ["--set", "64", "--session", "2", "L-064-1", "--repo-root", str(repo_root)]
    )
    out = capsys.readouterr().out
    assert rc == 1
    assert "kind-mismatch" in out
    ledger, _ = load_ledger(str(repo_root))
    assert ledger.entries["L-064-1"].uses == []


def test_main_exit_code_and_repo_root(guidance, capsys):
    repo_root, _ = guidance
    rc = cite_lessons.main(
        ["--set", "64", "--session", "2", "L-064-1", "L-999-9",
         "--repo-root", str(repo_root)]
    )
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


# --- round 1 remediation falsifiers ------------------------------------------


def test_an_unknown_id_records_nothing(guidance):
    """PLANTED: a typo must not become a permanent ghost ledger entry.

    The ledger deliberately has no eviction path, so a record written for
    a mistyped id could never be removed -- and a later, correct citation
    would leave the false one behind.
    """
    repo_root, _ = guidance
    ledger_path = repo_root / "docs" / "planning" / "guidance-usage.json"
    rc = cite_lessons.main(
        ["--set", "64", "--session", "2", "L-999-9", "--repo-root", str(repo_root)]
    )
    assert rc == 1
    assert not ledger_path.exists(), "a not-found id created a ghost ledger"


def test_a_known_id_beside_an_unknown_one_is_still_recorded(guidance):
    """LOOK-ALIKE: refusing the typo must not refuse the real citation."""
    repo_root, _ = guidance
    rc = cite_lessons.main(
        ["--set", "64", "--session", "2", "L-064-1", "L-999-9",
         "--repo-root", str(repo_root)]
    )
    assert rc == 1  # the unknown id still fails the command
    ledger, _ = load_ledger(str(repo_root))
    assert ledger.entries["L-064-1"].uses == ["064-02"]
    assert "L-999-9" not in ledger.entries


def test_session_is_required(guidance):
    """PLANTED: the old invocation form must FAIL, not silently file the
    citation under session 1 and corrupt per-session history."""
    repo_root, _ = guidance
    with pytest.raises(SystemExit) as excinfo:
        cite_lessons.main(["--set", "64", "L-064-1", "--repo-root", str(repo_root)])
    assert excinfo.value.code == 2


def test_a_project_guidance_id_resolves_and_records(tmp_path):
    """The ledger had to be ready for project-guidance ids without a
    format change; so does the path that writes to it."""
    gdir = tmp_path / "docs" / "planning"
    gdir.mkdir(parents=True)
    (gdir / "lessons-learned.md").write_text(ACTIVE, encoding="utf-8")
    (gdir / "project-guidance.md").write_text(
        "### Conventions\n\n- **A rule.** Body.\n"
        '  <!-- lesson: id="C-003" added-set="121" -->\n',
        encoding="utf-8",
    )
    rc = cite_lessons.main(
        ["--set", "121", "--session", "3", "C-003", "--repo-root", str(tmp_path)]
    )
    assert rc == 0
    ledger, problems = load_ledger(str(tmp_path))
    assert problems == []
    assert ledger.entries["C-003"].uses == ["121-03"]
