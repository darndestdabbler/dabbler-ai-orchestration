"""Unit tests for the Set 064 D1 reporter + search:

- :func:`guidance_report.measure_file` math (bytes/lines/tokens)
- ceiling status + over/under classification
- ``--check`` exit code
- ``--write-headers`` insert + in-place replace (idempotent placement)
- :func:`guidance_report.summarize_overhead` advisory (fail-open)
- :func:`guidance_search.search_text` + archive gating

Bare-filename imports per the package test convention.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import guidance_report
import guidance_search
from guidance_config import GuidanceConfig
from guidance_report import (
    HEADER_BEGIN,
    build_reports,
    measure_file,
    render_report,
    stamp_header,
    summarize_overhead,
)


LESSONS = """# Lessons Learned

> **Purpose:** capture lessons.

---

## A Lesson
<!-- lesson: id="L-064-1" added-set="030" last-used-set="064" status="active" scope="portable" -->

- body
"""

GUIDANCE = """# Project Guidance

> **Purpose:** durable commitments.

---

## Principles
"""

ARCHIVE = """# Lessons Archive

## An Archived Lesson
<!-- lesson: id="L-050-2" added-set="050" last-used-set="050" status="archived" -->

- body about caching strategy
"""


@pytest.fixture
def repo(tmp_path: Path):
    gdir = tmp_path / "docs" / "planning"
    gdir.mkdir(parents=True)
    (gdir / "lessons-learned.md").write_text(LESSONS, encoding="utf-8")
    (gdir / "project-guidance.md").write_text(GUIDANCE, encoding="utf-8")
    (gdir / "lessons-archive.md").write_text(ARCHIVE, encoding="utf-8")
    return tmp_path, gdir


# --- measurement -------------------------------------------------------------


def test_measure_file_math(repo):
    _, gdir = repo
    cfg = GuidanceConfig()
    r = measure_file("lessons-learned.md", str(gdir / "lessons-learned.md"), cfg)
    assert r.bytes == len(LESSONS.encode("utf-8"))
    assert r.lines == LESSONS.count("\n")  # file ends with \n
    assert r.tokens == -(-len(LESSONS) // 4)  # ceil(chars/4)
    assert r.ceiling == 10000
    assert not r.over_ceiling


def test_build_reports_excludes_archive(repo):
    root, _ = repo
    reports = build_reports(str(root), GuidanceConfig())
    names = {r.name for r in reports}
    assert names == {"lessons-learned.md", "project-guidance.md"}  # no archive


def test_over_ceiling_classification(repo):
    _, gdir = repo
    cfg = GuidanceConfig(active_lessons_ceiling_tokens=1)  # force over
    r = measure_file("lessons-learned.md", str(gdir / "lessons-learned.md"), cfg)
    assert r.over_ceiling
    assert "OVER" in render_report([r])


# --- --check -----------------------------------------------------------------


def test_check_mode_exit_codes(repo, monkeypatch, capsys):
    root, _ = repo
    # Force a tiny ceiling via a stubbed config so --check fails.
    monkeypatch.setattr(
        guidance_report, "load_guidance_config",
        lambda cfg: GuidanceConfig(active_lessons_ceiling_tokens=1, project_guidance_ceiling_tokens=1),
    )
    rc = guidance_report.main(["--check", "--repo-root", str(root)])
    assert rc == 1
    assert "CHECK FAILED" in capsys.readouterr().out

    # Default (generous) ceilings: passes.
    monkeypatch.setattr(guidance_report, "load_guidance_config", lambda cfg: GuidanceConfig())
    rc = guidance_report.main(["--check", "--repo-root", str(root)])
    assert rc == 0


# --- --write-headers ---------------------------------------------------------


def test_stamp_header_insert_then_replace_is_stable(repo):
    _, gdir = repo
    cfg = GuidanceConfig()
    r = measure_file("lessons-learned.md", str(gdir / "lessons-learned.md"), cfg)
    block1 = guidance_report._build_header_block(r, "(none)", "2026-06-14")
    once = stamp_header(LESSONS, block1)
    assert HEADER_BEGIN in once
    assert once.count(HEADER_BEGIN) == 1
    # Re-stamp with a new block: still exactly one block (replace in place).
    block2 = guidance_report._build_header_block(r, "064", "2026-06-15")
    twice = stamp_header(once, block2)
    assert twice.count(HEADER_BEGIN) == 1
    assert "last-pruned-set: 064" in twice


def test_write_headers_preserves_last_pruned(repo, capsys):
    root, gdir = repo
    guidance_report.main(["--write-headers", "--last-pruned-set", "064", "--repo-root", str(root)])
    text = (gdir / "lessons-learned.md").read_text(encoding="utf-8")
    assert "last-pruned-set: 064" in text
    # Re-run without the flag: the prior value is preserved.
    guidance_report.main(["--write-headers", "--repo-root", str(root)])
    text2 = (gdir / "lessons-learned.md").read_text(encoding="utf-8")
    assert "last-pruned-set: 064" in text2
    assert text2.count(HEADER_BEGIN) == 1


# --- summarize_overhead ------------------------------------------------------


def test_summarize_overhead_none_when_under(repo, monkeypatch):
    root, _ = repo
    monkeypatch.setattr(guidance_report, "load_guidance_config", lambda cfg: GuidanceConfig())
    assert summarize_overhead(str(root)) is None


def test_summarize_overhead_warns_when_over(repo, monkeypatch):
    root, _ = repo
    monkeypatch.setattr(
        guidance_report, "load_guidance_config",
        lambda cfg: GuidanceConfig(active_lessons_ceiling_tokens=1),
    )
    msg = summarize_overhead(str(root))
    assert msg is not None
    assert "over the token ceiling" in msg
    assert "not blocking" in msg.lower()


def test_summarize_overhead_fail_open(monkeypatch):
    # Nonexistent root -> no files -> None, never raises.
    assert summarize_overhead("/no/such/path/at/all") is None


# --- guidance_search ---------------------------------------------------------


def test_search_text_tags_enclosing_lesson():
    matches = guidance_search.search_text("lessons-archive.md", ARCHIVE, __import__("re").compile("caching"))
    assert len(matches) == 1
    assert matches[0].lesson_id == "L-050-2"


def test_search_main_archive_gating(repo, capsys):
    root, _ = repo
    # Default: archive excluded -> no hit for archive-only content.
    rc = guidance_search.main(["caching strategy", "--repo-root", str(root)])
    assert rc == 1
    assert "No matches" in capsys.readouterr().out
    # With --archive: found.
    rc = guidance_search.main(["caching strategy", "--archive", "--repo-root", str(root)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "lessons-archive.md" in out
    assert "[L-050-2]" in out
