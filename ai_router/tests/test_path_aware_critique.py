"""Tests for the Set 066 path-aware-critique policy attribute + artifact validator.

Covers the ``pathAwareCritique`` once-at-set-start record (reader/writer,
spec seed, CLI-vs-seed precedence, immutability) — mirroring the Set 057
``verificationMode`` machinery — and the pure-Python multi-provider
critique-artifact validator (accept valid; reject single-provider /
trivial / structurally-invalid / missing / unreadable).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# conftest puts ai_router/ on sys.path
import path_aware_critique as pac  # noqa: E402

NONE = pac.PATH_AWARE_CRITIQUE_NONE
ADV = pac.PATH_AWARE_CRITIQUE_ADVISORY
REQ = pac.PATH_AWARE_CRITIQUE_REQUIRED


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _set_dir(tmp_path: Path, *, with_log: bool = True) -> Path:
    d = tmp_path / "066-set"
    d.mkdir()
    if with_log:
        (d / "activity-log.json").write_text(
            json.dumps({"entries": []}, indent=2), encoding="utf-8"
        )
    return d


def _spec(d: Path, level=None, *, tier: str = "full") -> None:
    body = f"# Spec\n\n## Session Set Configuration\n\n```yaml\ntier: {tier}\n"
    if level is not None:
        body += f"pathAwareCritique: {level}\n"
    body += "```\n"
    (d / "spec.md").write_text(body, encoding="utf-8")


def _valid_artifact() -> dict:
    return {
        "schemaVersion": 1,
        "sessionSetName": "066-set",
        "pathAwareCritique": "required",
        "critiques": [
            {
                "provider": "openai",
                "model": "gpt-5.4",
                "verdict": "ISSUES_FOUND",
                "findings": [{"description": "a real finding"}],
            },
            {
                "provider": "google",
                "model": "gemini-2.5-pro",
                "verdict": "VERIFIED",
                "summary": "Reviewed with repo access; no defects.",
            },
        ],
    }


# --------------------------------------------------------------------------
# the durable record
# --------------------------------------------------------------------------


class TestRecordRead:
    def test_default_when_no_record(self, tmp_path):
        d = _set_dir(tmp_path)
        assert pac.read_path_aware_critique(d) == NONE

    def test_default_when_no_activity_log(self, tmp_path):
        d = _set_dir(tmp_path, with_log=False)
        assert pac.read_path_aware_critique(d) == NONE

    def test_record_and_read_roundtrip(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, REQ)
        assert pac.read_path_aware_critique(d) == REQ

    def test_most_recent_record_wins(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, REQ)
        pac.record_path_aware_critique(d, ADV)
        assert pac.read_path_aware_critique(d) == ADV

    def test_record_rejects_unknown_value(self, tmp_path):
        d = _set_dir(tmp_path)
        with pytest.raises(ValueError):
            pac.record_path_aware_critique(d, "bogus")

    def test_record_requires_activity_log(self, tmp_path):
        d = _set_dir(tmp_path, with_log=False)
        with pytest.raises(FileNotFoundError):
            pac.record_path_aware_critique(d, REQ)

    def test_entry_kind_distinct_from_verification_mode(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, REQ)
        log = json.loads((d / "activity-log.json").read_text(encoding="utf-8"))
        kinds = {e.get("kind") for e in log["entries"]}
        assert pac.PATH_AWARE_CRITIQUE_ENTRY_KIND in kinds
        assert "verification_mode" not in kinds
        assert "suggestion_disposition" not in kinds

    def test_has_record_false_then_true(self, tmp_path):
        d = _set_dir(tmp_path)
        assert pac.has_path_aware_critique_record(d) is False
        pac.record_path_aware_critique(d, NONE)
        assert pac.has_path_aware_critique_record(d) is True


# --------------------------------------------------------------------------
# spec seed
# --------------------------------------------------------------------------


class TestSpecSeed:
    def test_reads_recognized_level(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, REQ)
        assert pac.read_spec_path_aware_critique(d) == REQ

    def test_tier_orthogonal_lightweight_seed(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, ADV, tier="lightweight")
        assert pac.read_spec_path_aware_critique(d) == ADV

    def test_none_when_field_absent(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, None)
        assert pac.read_spec_path_aware_critique(d) is None

    def test_none_when_unknown_value(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, "bogus")
        assert pac.read_spec_path_aware_critique(d) is None

    def test_none_when_no_spec(self, tmp_path):
        d = _set_dir(tmp_path)
        assert pac.read_spec_path_aware_critique(d) is None


# --------------------------------------------------------------------------
# once-at-set-start capture + immutability
# --------------------------------------------------------------------------


class TestCapture:
    def test_cli_choice_records_on_first_start(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, None)
        assert (
            pac.resolve_and_record_path_aware_critique(d, cli_choice=REQ) == REQ
        )
        assert pac.read_path_aware_critique(d) == REQ

    def test_spec_seed_records_when_no_cli(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, ADV)
        assert pac.resolve_and_record_path_aware_critique(d) == ADV
        assert pac.read_path_aware_critique(d) == ADV

    def test_cli_wins_over_spec_seed(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, ADV)
        assert (
            pac.resolve_and_record_path_aware_critique(d, cli_choice=REQ) == REQ
        )
        assert pac.read_path_aware_critique(d) == REQ

    def test_nothing_recorded_when_neither_source(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, None)
        assert pac.resolve_and_record_path_aware_critique(d) is None
        assert pac.has_path_aware_critique_record(d) is False
        assert pac.read_path_aware_critique(d) == NONE

    def test_immutable_after_first_record(self, tmp_path):
        d = _set_dir(tmp_path)
        _spec(d, None)
        pac.resolve_and_record_path_aware_critique(d, cli_choice=REQ)
        # A later attempt to downgrade is a no-op (returns None).
        assert (
            pac.resolve_and_record_path_aware_critique(d, cli_choice=NONE)
            is None
        )
        assert pac.read_path_aware_critique(d) == REQ

    def test_creates_minimal_log_when_missing(self, tmp_path):
        d = _set_dir(tmp_path, with_log=False)
        _spec(d, REQ)
        assert pac.resolve_and_record_path_aware_critique(d) == REQ
        assert (d / "activity-log.json").is_file()
        assert pac.read_path_aware_critique(d) == REQ

    def test_bad_cli_choice_raises_even_with_existing_record(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, REQ)
        with pytest.raises(ValueError):
            pac.resolve_and_record_path_aware_critique(d, cli_choice="bogus")


# --------------------------------------------------------------------------
# the multi-provider critique-artifact validator (pure-Python)
# --------------------------------------------------------------------------


class TestArtifactValidator:
    def test_valid_artifact_dict(self):
        res = pac.validate_path_aware_critique_artifact(_valid_artifact())
        assert res.ok is True
        assert res.code == pac.ARTIFACT_VALID
        assert res.providers == ("google", "openai")
        assert res.critique_count == 2
        assert res.findings_count == 1

    def test_valid_artifact_from_path(self, tmp_path):
        p = tmp_path / "path-aware-critique.json"
        p.write_text(json.dumps(_valid_artifact()), encoding="utf-8")
        res = pac.validate_path_aware_critique_artifact(p)
        assert res.ok is True

    def test_missing_file(self, tmp_path):
        res = pac.validate_path_aware_critique_artifact(
            tmp_path / "nope.json"
        )
        assert res.ok is False
        assert res.code == pac.ARTIFACT_MISSING_FILE

    def test_unreadable_json(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{not json", encoding="utf-8")
        res = pac.validate_path_aware_critique_artifact(p)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_UNREADABLE

    def test_not_an_object(self):
        res = pac.validate_path_aware_critique_artifact([1, 2, 3])
        assert res.ok is False
        assert res.code == pac.ARTIFACT_NOT_AN_OBJECT

    def test_single_provider_rejected(self):
        art = _valid_artifact()
        art["critiques"][1]["provider"] = "openai"  # both now openai
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SINGLE_PROVIDER

    def test_one_critique_rejected_as_schema_invalid(self):
        art = _valid_artifact()
        art["critiques"] = art["critiques"][:1]
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SCHEMA_INVALID

    def test_trivial_content_rejected(self):
        art = _valid_artifact()
        # Second entry loses its only content.
        art["critiques"][1].pop("summary", None)
        art["critiques"][1].pop("findings", None)
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_TRIVIAL_CONTENT

    def test_empty_findings_is_trivial_when_no_summary(self):
        art = _valid_artifact()
        art["critiques"][1].pop("summary", None)
        art["critiques"][1]["findings"] = []
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_TRIVIAL_CONTENT

    def test_missing_required_top_level_field_rejected(self):
        for field in (
            "schemaVersion",
            "sessionSetName",
            "pathAwareCritique",
            "critiques",
        ):
            art = _valid_artifact()
            del art[field]
            res = pac.validate_path_aware_critique_artifact(art)
            assert res.ok is False, field
            assert res.code == pac.ARTIFACT_SCHEMA_INVALID, field

    def test_blank_provider_rejected(self):
        art = _valid_artifact()
        art["critiques"][0]["provider"] = "   "
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SCHEMA_INVALID

    def test_unknown_pathawarecritique_level_rejected(self):
        art = _valid_artifact()
        art["pathAwareCritique"] = "bogus"
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SCHEMA_INVALID

    def test_extra_top_level_key_rejected(self):
        # Closed envelope (mirrors the schema's additionalProperties:false).
        art = _valid_artifact()
        art["bogusTopKey"] = 1
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SCHEMA_INVALID

    def test_findings_not_array_rejected(self):
        art = _valid_artifact()
        art["critiques"][1]["summary"] = "has content"
        art["critiques"][1]["findings"] = "not-an-array"
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SCHEMA_INVALID

    def test_summary_non_string_rejected(self):
        art = _valid_artifact()
        art["critiques"][1]["summary"] = 123  # content still via findings? no
        art["critiques"][1]["findings"] = [{"description": "d"}]
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SCHEMA_INVALID

    def test_finding_missing_description_rejected_even_with_summary(self):
        # The malformed finding must be caught structurally even though the
        # entry's non-empty summary already satisfies content-non-triviality.
        art = _valid_artifact()
        art["critiques"][0]["summary"] = "has a summary"
        art["critiques"][0]["findings"] = [{"severity": "Major"}]
        res = pac.validate_path_aware_critique_artifact(art)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SCHEMA_INVALID

    def test_find_artifact_helper(self, tmp_path):
        d = _set_dir(tmp_path)
        assert pac.find_path_aware_critique_artifact(d) is None
        (d / pac.PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME).write_text(
            json.dumps(_valid_artifact()), encoding="utf-8"
        )
        found = pac.find_path_aware_critique_artifact(d)
        assert found is not None and found.is_file()


# --------------------------------------------------------------------------
# the close-out gate validator (Set 066 S2) -- posture-agnostic ok/not-ok
# --------------------------------------------------------------------------


class TestGateValidator:
    def _write_artifact(self, d: Path, art: dict) -> None:
        (d / pac.PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME).write_text(
            json.dumps(art), encoding="utf-8"
        )

    def test_none_is_a_noop(self, tmp_path):
        d = _set_dir(tmp_path)  # no record -> default none
        res = pac.validate_path_aware_critique_gate(d)
        assert res.level == NONE
        assert res.applicable is False
        assert res.ok is True

    def test_required_missing_artifact_not_ok(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, REQ)
        res = pac.validate_path_aware_critique_gate(d)
        assert res.level == REQ
        assert res.applicable is True
        assert res.ok is False
        assert res.artifact_result is None
        assert res.corrective  # an operator action is offered

    def test_required_valid_artifact_ok(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, REQ)
        self._write_artifact(d, _valid_artifact())
        res = pac.validate_path_aware_critique_gate(d)
        assert res.ok is True
        assert res.applicable is True
        assert res.artifact_result is not None and res.artifact_result.ok

    def test_required_single_provider_artifact_not_ok(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, REQ)
        art = _valid_artifact()
        art["critiques"][1]["provider"] = "openai"  # collapse to one provider
        self._write_artifact(d, art)
        res = pac.validate_path_aware_critique_gate(d)
        assert res.ok is False
        assert res.artifact_result is not None
        assert res.artifact_result.code == pac.ARTIFACT_SINGLE_PROVIDER

    def test_advisory_missing_artifact_applicable_but_not_ok(self, tmp_path):
        # The validator reports not-ok; advisory POSTURE (never block) is the
        # close_session caller's job, not this function's.
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, ADV)
        res = pac.validate_path_aware_critique_gate(d)
        assert res.level == ADV
        assert res.applicable is True
        assert res.ok is False

    def test_advisory_valid_artifact_ok(self, tmp_path):
        d = _set_dir(tmp_path)
        pac.record_path_aware_critique(d, ADV)
        self._write_artifact(d, _valid_artifact())
        res = pac.validate_path_aware_critique_gate(d)
        assert res.ok is True
