"""Unit tests for the Set 064 D2 metadata layer:

- :func:`parse_trailer` / :func:`format_trailer` round-trip
- :func:`parse_document` heading/trailer association
- :func:`update_last_used` surgical, byte-preserving rewrite
- :func:`validate_meta` / :func:`validate_documents` rules + id uniqueness
- :mod:`guidance_config` token estimate, config block, file discovery

Bare-filename imports per the package test convention (conftest.py adds
ai_router/ to sys.path).
"""

from __future__ import annotations

from pathlib import Path

import pytest

import guidance_config
import guidance_meta
from guidance_config import (
    GuidanceConfig,
    discover_guidance_files,
    estimate_tokens,
    load_guidance_config,
)
from guidance_meta import (
    LessonMeta,
    format_trailer,
    parse_document,
    parse_trailer,
    update_last_used,
    validate_documents,
    validate_meta,
)


# --- parse/format round-trip -------------------------------------------------


def test_parse_basic_trailer():
    line = '<!-- lesson: id="L-064-1" added-set="064" last-used-set="064" status="active" scope="portable" -->'
    meta = parse_trailer(line)
    assert meta is not None
    assert meta.id == "L-064-1"
    assert meta.added_set == "064"
    assert meta.last_used_set == "064"
    assert meta.status == "active"
    assert meta.scope == "portable"
    assert meta.superseded_by == ()
    assert meta.encoded_in == ()


def test_parse_non_trailer_returns_none():
    assert parse_trailer("## A Heading") is None
    assert parse_trailer("- **Context:** something") is None
    assert parse_trailer("<!-- not a lesson comment -->") is None


def test_format_omits_empty_keeps_id_and_status():
    meta = LessonMeta(id="L-064-2", status="active")
    out = format_trailer(meta)
    assert out == '<!-- lesson: id="L-064-2" status="active" -->'


def test_multi_value_fields_round_trip():
    meta = LessonMeta(
        id="L-064-3",
        status="archived",
        superseded_by=("L-064-9",),
        encoded_in=("tests/test_drift_guard.py", "scripts/drift_guard.py"),
    )
    line = format_trailer(meta)
    back = parse_trailer(line)
    assert back == meta
    assert 'superseded-by="L-064-9"' in line
    assert 'encoded-in="tests/test_drift_guard.py,scripts/drift_guard.py"' in line


def test_canonical_field_order():
    meta = LessonMeta(
        id="L-064-4",
        added_set="050",
        last_used_set="064",
        status="active",
        scope="portable",
    )
    line = format_trailer(meta)
    # id < added-set < last-used-set < status < scope
    assert line.index("id=") < line.index("added-set=") < line.index("last-used-set=") < line.index("status=") < line.index("scope=")


def test_indempotent_reformat():
    meta = LessonMeta(id="L-1-1", added_set="1", last_used_set="2", status="promoted")
    assert format_trailer(parse_trailer(format_trailer(meta))) == format_trailer(meta)


# --- document parsing --------------------------------------------------------

DOC = """# Lessons Learned

## First Lesson
<!-- lesson: id="L-064-1" added-set="010" last-used-set="050" status="active" scope="portable" -->

- **Context:** ...

## Second Lesson (no trailer yet)

- **Context:** legacy lesson without metadata

## Third Lesson

<!-- lesson: id="L-064-3" status="active" -->
- body
"""


def test_parse_document_associates_trailers():
    entries = parse_document(DOC)
    assert [e.title for e in entries] == [
        "First Lesson",
        "Second Lesson (no trailer yet)",
        "Third Lesson",
    ]
    assert entries[0].meta is not None and entries[0].meta.id == "L-064-1"
    assert entries[1].meta is None and entries[1].trailer_line is None
    # blank line between heading and trailer is tolerated
    assert entries[2].meta is not None and entries[2].meta.id == "L-064-3"


def test_deeper_headings_not_lesson_boundaries():
    text = "## Lesson\n<!-- lesson: id=\"L-1-1\" status=\"active\" -->\n### Subsection\nbody\n"
    entries = parse_document(text)
    assert len(entries) == 1


# --- surgical update ---------------------------------------------------------


def test_update_last_used_is_surgical():
    new_text, meta = update_last_used(DOC, "L-064-1", "064")
    assert meta is not None and meta.last_used_set == "064"
    # Exactly one line changed.
    old_lines = DOC.split("\n")
    new_lines = new_text.split("\n")
    assert len(old_lines) == len(new_lines)
    diff = [i for i in range(len(old_lines)) if old_lines[i] != new_lines[i]]
    assert len(diff) == 1
    assert 'last-used-set="064"' in new_lines[diff[0]]


def test_update_last_used_unknown_id_returns_none():
    new_text, meta = update_last_used(DOC, "L-999-9", "064")
    assert new_text is None and meta is None


def test_update_last_used_no_trailer_returns_none():
    # "Second Lesson" has a heading but no trailer; it has no id, so an
    # update keyed by a real id can't target it. Confirm a heading-only
    # lesson can't be cited even if we somehow knew its (absent) id.
    text = "## Heading only\n\n- body\n"
    new_text, meta = update_last_used(text, "L-1-1", "064")
    assert new_text is None and meta is None


def test_update_preserves_crlf():
    text = '## L\r\n<!-- lesson: id="L-1-1" last-used-set="001" status="active" -->\r\nbody\r\n'
    new_text, _ = update_last_used(text, "L-1-1", "064")
    assert "\r\n" in new_text
    assert '<!-- lesson: id="L-1-1" last-used-set="064" status="active" -->\r' in new_text.split("\n")[1]


# --- validation --------------------------------------------------------------


def test_validate_meta_good():
    assert validate_meta(LessonMeta(id="L-064-1", status="active")) == []


def test_validate_meta_bad_id():
    errs = validate_meta(LessonMeta(id="banana", status="active"))
    assert any("malformed" in e for e in errs)


def test_validate_meta_missing_id():
    errs = validate_meta(LessonMeta(id="", status="active"))
    assert any("missing required field: id" in e for e in errs)


def test_validate_meta_bad_status_and_scope():
    errs = validate_meta(LessonMeta(id="L-1-1", status="bogus", scope="nope"))
    assert any("status" in e for e in errs)
    assert any("scope" in e for e in errs)


def test_validate_documents_duplicate_id_across_files():
    a = '## A\n<!-- lesson: id="L-1-1" status="active" added-set="1" -->\n'
    b = '## B\n<!-- lesson: id="L-1-1" status="archived" -->\n'
    result = validate_documents([("lessons-learned.md", a), ("lessons-archive.md", b)])
    assert not result.ok
    assert any("duplicate id" in e for e in result.errors)


def test_validate_documents_ok_unique_ids():
    a = '## A\n<!-- lesson: id="L-1-1" status="active" added-set="1" -->\n'
    b = '## B\n<!-- lesson: id="L-1-2" status="archived" -->\n'
    result = validate_documents([("a.md", a), ("b.md", b)])
    assert result.ok
    assert set(result.ids) == {"L-1-1", "L-1-2"}


def test_validate_documents_warns_unknown_key_and_missing_added_set():
    a = '## A\n<!-- lesson: id="L-1-1" status="active" bogus-key="x" -->\n'
    result = validate_documents([("a.md", a)])
    assert result.ok  # warnings don't fail
    assert any("unknown trailer key" in w for w in result.warnings)
    assert any("missing added-set" in w for w in result.warnings)


# --- guidance_config ---------------------------------------------------------


def test_estimate_tokens_ceil_div_4():
    assert estimate_tokens("") == 0
    assert estimate_tokens("a") == 1
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2


def test_load_guidance_config_defaults_when_absent():
    cfg = load_guidance_config(None)
    assert cfg.active_lessons_ceiling_tokens == 10000
    assert cfg.project_guidance_ceiling_tokens == 6000
    assert cfg.disuse_window_sets == 20


def test_load_guidance_config_partial_override():
    cfg = load_guidance_config({"guidance": {"disuse_window_sets": 12}})
    assert cfg.disuse_window_sets == 12
    assert cfg.active_lessons_ceiling_tokens == 10000  # default preserved


def test_load_guidance_config_rejects_bool():
    cfg = load_guidance_config({"guidance": {"disuse_window_sets": True}})
    assert cfg.disuse_window_sets == 20  # bool coerced back to default


def test_ceiling_for():
    cfg = GuidanceConfig()
    assert cfg.ceiling_for("docs/planning/lessons-learned.md") == 10000
    assert cfg.ceiling_for("project-guidance.md") == 6000
    assert cfg.ceiling_for("lessons-archive.md") is None


def test_discover_guidance_files(tmp_path: Path):
    gdir = tmp_path / "docs" / "planning"
    gdir.mkdir(parents=True)
    (gdir / "lessons-learned.md").write_text("# x", encoding="utf-8")
    (gdir / "project-guidance.md").write_text("# y", encoding="utf-8")
    found = discover_guidance_files(str(tmp_path))
    assert "lessons-learned.md" in found
    assert "project-guidance.md" in found
    assert "lessons-archive.md" not in found  # absent on disk
