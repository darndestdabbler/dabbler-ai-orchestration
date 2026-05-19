"""Tests for the consensus-decision journal writer.

Covers per-line append (shape, atomicity-as-observed, append-only
invariant), short-hash derivation, full-payload Markdown sibling
write, and the validate_record_inputs enum guard.
"""

import json
from pathlib import Path

import pytest

import consensus_journal as cj  # type: ignore[import-not-found]


def _make_record(
    *,
    timestamp: str = "2026-05-19T14:03:21.456-04:00",
    category: str = "refactor-placement",
    question_summary: str = "Where to strip the VBA Attribute VB_* header?",
) -> cj.ConsensusRecord:
    question_hash = cj.compute_question_hash(
        question_summary, category, timestamp
    )
    return cj.ConsensusRecord(
        timestamp=timestamp,
        session_set="031-delegation-consensus-config",
        session_number=1,
        category=category,
        question_summary=question_summary,
        question_hash=question_hash,
        engines=["openai:gpt-5-4", "google:gemini-pro"],
        agreement_level="aligned",
        chosen_recommendation_summary="Apply option B per both engines.",
        applied=True,
        fallback_action=None,
        fallback_reason=None,
        input_tokens_total=2206,
        output_tokens_total=4768,
        cost_usd=0.0618,
    )


# --- compute_question_hash ----------------------------------------------


def test_hash_starts_with_sha256_prefix_and_is_deterministic() -> None:
    h1 = cj.compute_question_hash("q", "scoping", "2026-05-19T00:00:00-04:00")
    h2 = cj.compute_question_hash("q", "scoping", "2026-05-19T00:00:00-04:00")
    assert h1 == h2
    assert h1.startswith("sha256:")
    assert len(h1) == len("sha256:") + 64


def test_hash_changes_when_any_field_changes() -> None:
    base = cj.compute_question_hash("q", "scoping", "2026-05-19T00:00:00-04:00")
    assert base != cj.compute_question_hash(
        "q!", "scoping", "2026-05-19T00:00:00-04:00"
    )
    assert base != cj.compute_question_hash(
        "q", "file-layout", "2026-05-19T00:00:00-04:00"
    )
    assert base != cj.compute_question_hash(
        "q", "scoping", "2026-05-19T00:00:01-04:00"
    )


def test_short_hash_is_first_six_hex_chars() -> None:
    full = cj.compute_question_hash("q", "scoping", "2026-05-19T00:00:00-04:00")
    short = cj.short_hash_from_full(full)
    assert len(short) == 6
    assert full[len("sha256:"): len("sha256:") + 6] == short


def test_short_hash_rejects_unprefixed_input() -> None:
    with pytest.raises(ValueError, match="sha256:"):
        cj.short_hash_from_full("9f3aabcd")


# --- append_record ------------------------------------------------------


def test_append_writes_single_jsonl_line(tmp_path: Path) -> None:
    journal = tmp_path / "consensus-decisions.jsonl"
    rec = _make_record()
    cj.append_record(rec, journal_path=journal)
    lines = journal.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    obj = json.loads(lines[0])
    assert obj["session_set"] == "031-delegation-consensus-config"
    assert obj["category"] == "refactor-placement"
    assert obj["question_hash"].startswith("sha256:")
    assert obj["applied"] is True
    assert obj["fallback_action"] is None


def test_append_is_additive_and_preserves_prior_lines(tmp_path: Path) -> None:
    journal = tmp_path / "consensus-decisions.jsonl"
    cj.append_record(_make_record(category="scoping"), journal_path=journal)
    cj.append_record(
        _make_record(category="file-layout", question_summary="Different Q"),
        journal_path=journal,
    )
    lines = journal.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["category"] == "scoping"
    assert json.loads(lines[1])["category"] == "file-layout"


def test_append_creates_parent_directory(tmp_path: Path) -> None:
    journal = tmp_path / "nested" / "dir" / "consensus-decisions.jsonl"
    cj.append_record(_make_record(), journal_path=journal)
    assert journal.is_file()


def test_record_extras_merge_into_output_without_shadowing_core(
    tmp_path: Path,
) -> None:
    journal = tmp_path / "consensus-decisions.jsonl"
    rec = cj.ConsensusRecord(
        timestamp="2026-05-19T14:03:21.456-04:00",
        session_set="x",
        session_number=1,
        category="scoping",
        question_summary="q",
        question_hash=cj.compute_question_hash("q", "scoping", "2026-05-19T14:03:21.456-04:00"),
        engines=["openai:gpt-5-4"],
        agreement_level="aligned",
        chosen_recommendation_summary="ok",
        applied=True,
        fallback_action=None,
        fallback_reason=None,
        input_tokens_total=1,
        output_tokens_total=2,
        cost_usd=0.01,
        # An open-ended extra and a core-key collision attempt.
        extra={"agreement_level_score": 0.92, "category": "SHADOWED"},
    )
    cj.append_record(rec, journal_path=journal)
    obj = json.loads(journal.read_text(encoding="utf-8").splitlines()[0])
    # Core field wins over collision attempt.
    assert obj["category"] == "scoping"
    # Open-ended extra is preserved.
    assert obj["agreement_level_score"] == 0.92


# --- write_full_payload -------------------------------------------------


def test_full_payload_filename_uses_filesystem_safe_timestamp_and_short_hash(
    tmp_path: Path,
) -> None:
    rec = _make_record()
    target = cj.write_full_payload(
        full_payloads_dir=tmp_path,
        timestamp=rec.timestamp,
        question_hash=rec.question_hash,
        content="# Prompt\n…\n",
    )
    name = Path(target).name
    # Must not contain characters Windows rejects in filenames.
    for bad in (":", "?", "*", "|", "<", ">"):
        assert bad not in name
    assert name.endswith(".md")
    assert cj.short_hash_from_full(rec.question_hash) in name
    # Content round-trips.
    assert Path(target).read_text(encoding="utf-8") == "# Prompt\n…\n"


def test_full_payload_temp_file_does_not_remain(tmp_path: Path) -> None:
    rec = _make_record()
    cj.write_full_payload(
        full_payloads_dir=tmp_path,
        timestamp=rec.timestamp,
        question_hash=rec.question_hash,
        content="ok",
    )
    leftovers = [p for p in tmp_path.iterdir() if ".tmp." in p.name]
    assert leftovers == []


# --- write_consensus_record (one-shot) ----------------------------------


def test_one_shot_writes_jsonl_only_when_payload_dir_absent(tmp_path: Path) -> None:
    journal = tmp_path / "consensus-decisions.jsonl"
    result = cj.write_consensus_record(
        _make_record(),
        journal_path=journal,
        full_payloads_dir=None,
        full_payload_content=None,
    )
    assert result.journal_path == journal
    assert result.full_payload_path is None
    assert journal.is_file()


def test_one_shot_writes_both_when_payload_dir_given(tmp_path: Path) -> None:
    journal = tmp_path / "consensus-decisions.jsonl"
    payloads = tmp_path / "consensus-decisions"
    result = cj.write_consensus_record(
        _make_record(),
        journal_path=journal,
        full_payloads_dir=payloads,
        full_payload_content="full payload here",
    )
    assert result.full_payload_path is not None
    assert result.full_payload_path.exists()
    assert result.journal_path.exists()


def test_one_shot_rejects_payload_dir_without_content(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="full_payload_content is required"):
        cj.write_consensus_record(
            _make_record(),
            journal_path=tmp_path / "j.jsonl",
            full_payloads_dir=tmp_path / "payloads",
            full_payload_content=None,
        )


# --- validate_record_inputs ---------------------------------------------


def test_validate_inputs_accepts_known_enums() -> None:
    for level in cj.AGREEMENT_LEVELS:
        cj.validate_record_inputs(agreement_level=level, fallback_action=None)
    for fa in cj.FALLBACK_ACTIONS:
        cj.validate_record_inputs(agreement_level="aligned", fallback_action=fa)


def test_validate_inputs_rejects_unknown_agreement_level() -> None:
    with pytest.raises(ValueError, match="agreement_level"):
        cj.validate_record_inputs(
            agreement_level="who-knows", fallback_action=None
        )


def test_validate_inputs_rejects_unknown_fallback_action() -> None:
    with pytest.raises(ValueError, match="fallback_action"):
        cj.validate_record_inputs(
            agreement_level="aligned", fallback_action="punt"
        )
