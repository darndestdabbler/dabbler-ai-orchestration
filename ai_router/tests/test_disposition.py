"""Unit tests for Session 4 deliverables in ``disposition``:

- :class:`Disposition` dataclass round-trip
- ``write_disposition`` atomic-write behavior on Windows-friendly paths
- ``read_disposition`` for missing / malformed / valid files
- ``validate_disposition`` cross-field rules
- ``ai_router/schemas/disposition.schema.json`` parity with the
  dataclass-produced JSON

The conftest.py in this folder adds ``ai_router/`` to ``sys.path`` so
modules are imported by bare filename (the package's test convention,
preserved across Set 010 Session 1, which renamed the package
directory to its underscore form).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import jsonschema
import pytest

import disposition
from disposition import (
    DISPOSITION_FILENAME,
    DISPOSITION_STATUSES,
    Disposition,
    SWITCH_DUE_TO_BLOCKER,
    VERIFICATION_METHODS,
    disposition_from_dict,
    disposition_to_dict,
    read_disposition,
    validate_disposition,
    write_disposition,
)
from session_state import NextOrchestrator, NextOrchestratorReason


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def session_set_dir(tmp_path: Path) -> str:
    d = tmp_path / "test-set"
    d.mkdir()
    return str(d)


def _valid_next_orc(code: str = "continue-current-trajectory") -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(
            code=code,  # type: ignore[arg-type]
            specifics="Continue with the current orchestrator for parity.",
        ),
    )


def _valid_disposition_completed_api(**overrides) -> Disposition:
    base = dict(
        status="completed",
        summary="Session 4 implemented disposition.json schema and writer.",
        verification_method="api",
        files_changed=["ai_router/disposition.py"],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    base.update(overrides)
    return Disposition(**base)


def _valid_disposition_completed_queue(**overrides) -> Disposition:
    base = dict(
        status="completed",
        summary="Outsource-last verification round handed back via queue.",
        verification_method="queue",
        files_changed=["ai_router/queue_db.py"],
        verification_message_ids=["msg-1", "msg-2"],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    base.update(overrides)
    return Disposition(**base)


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------

class TestRoundTrip:
    def test_dataclass_to_dict_and_back(self):
        d = _valid_disposition_completed_api()
        as_dict = disposition_to_dict(d)
        restored = disposition_from_dict(as_dict)
        assert restored == d

    def test_to_dict_field_order_is_deterministic(self):
        d = _valid_disposition_completed_api()
        keys = list(disposition_to_dict(d).keys())
        assert keys == [
            "status",
            "summary",
            "files_changed",
            "verification_method",
            "verification_message_ids",
            "next_orchestrator",
            "blockers",
        ]

    def test_to_dict_always_includes_next_orchestrator_key(self):
        d = _valid_disposition_completed_api(
            status="failed", next_orchestrator=None
        )
        as_dict = disposition_to_dict(d)
        assert "next_orchestrator" in as_dict
        assert as_dict["next_orchestrator"] is None

    def test_write_then_read_round_trip(self, session_set_dir):
        d = _valid_disposition_completed_queue()
        path = write_disposition(session_set_dir, d)
        assert os.path.basename(path) == DISPOSITION_FILENAME
        restored = read_disposition(session_set_dir)
        assert restored == d

    def test_write_is_idempotent(self, session_set_dir):
        d = _valid_disposition_completed_api()
        path1 = write_disposition(session_set_dir, d)
        first_bytes = Path(path1).read_bytes()
        path2 = write_disposition(session_set_dir, d)
        assert path1 == path2
        assert Path(path2).read_bytes() == first_bytes

    def test_write_overwrites_prior_disposition(self, session_set_dir):
        first = _valid_disposition_completed_api(
            summary="first write"
        )
        second = _valid_disposition_completed_api(
            summary="second write"
        )
        write_disposition(session_set_dir, first)
        write_disposition(session_set_dir, second)
        loaded = read_disposition(session_set_dir)
        assert loaded.summary == "second write"


# ---------------------------------------------------------------------------
# Atomic write
# ---------------------------------------------------------------------------

class TestAtomicWrite:
    def test_write_does_not_leak_temp_file(self, session_set_dir):
        d = _valid_disposition_completed_api()
        write_disposition(session_set_dir, d)
        leftovers = [
            name for name in os.listdir(session_set_dir)
            if name.startswith(DISPOSITION_FILENAME) and name != DISPOSITION_FILENAME
        ]
        assert leftovers == []

    def test_pre_existing_file_survives_failed_write(
        self, session_set_dir, monkeypatch
    ):
        good = _valid_disposition_completed_api(summary="the good one")
        write_disposition(session_set_dir, good)
        good_bytes = Path(session_set_dir, DISPOSITION_FILENAME).read_bytes()

        # Simulate a crash mid-write by patching os.replace to raise.
        # The temp file is created (and may be left behind), but the
        # original disposition.json must remain byte-for-byte intact.
        original_replace = os.replace

        def boom(src, dst):
            raise RuntimeError("simulated crash")

        monkeypatch.setattr(os, "replace", boom)
        bad = _valid_disposition_completed_api(summary="the bad one")
        with pytest.raises(RuntimeError, match="simulated crash"):
            write_disposition(session_set_dir, bad)

        monkeypatch.setattr(os, "replace", original_replace)

        # Original file must be untouched.
        assert Path(session_set_dir, DISPOSITION_FILENAME).read_bytes() == good_bytes
        loaded = read_disposition(session_set_dir)
        assert loaded.summary == "the good one"

    def test_write_rejects_non_dataclass(self, session_set_dir):
        with pytest.raises(TypeError):
            write_disposition(session_set_dir, {"status": "completed"})  # type: ignore[arg-type]

    def test_write_rejects_missing_directory(self, tmp_path):
        missing = str(tmp_path / "does-not-exist")
        with pytest.raises(FileNotFoundError):
            write_disposition(missing, _valid_disposition_completed_api())


# ---------------------------------------------------------------------------
# read_disposition
# ---------------------------------------------------------------------------

class TestReadDisposition:
    def test_returns_none_when_file_absent(self, session_set_dir):
        assert read_disposition(session_set_dir) is None

    def test_returns_none_for_malformed_json(self, session_set_dir):
        with open(
            os.path.join(session_set_dir, DISPOSITION_FILENAME),
            "w",
            encoding="utf-8",
        ) as f:
            f.write("{not valid json")
        assert read_disposition(session_set_dir) is None

    def test_returns_none_for_non_object_root(self, session_set_dir):
        with open(
            os.path.join(session_set_dir, DISPOSITION_FILENAME),
            "w",
            encoding="utf-8",
        ) as f:
            f.write("[1, 2, 3]")
        assert read_disposition(session_set_dir) is None

    def test_partial_file_loads_with_defaults(self, session_set_dir):
        # Older / hand-edited files may omit optional list keys; the
        # loader fills in empty lists rather than raising. Validation
        # remains the gate for "is this disposition usable?".
        partial = {
            "status": "completed",
            "summary": "old shape",
            "verification_method": "api",
        }
        with open(
            os.path.join(session_set_dir, DISPOSITION_FILENAME),
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(partial, f)
        loaded = read_disposition(session_set_dir)
        assert loaded is not None
        assert loaded.files_changed == []
        assert loaded.verification_message_ids == []
        assert loaded.blockers == []
        assert loaded.next_orchestrator is None


# ---------------------------------------------------------------------------
# validate_disposition
# ---------------------------------------------------------------------------

class TestValidateDisposition:
    def test_valid_completed_api(self):
        passed, errors = validate_disposition(_valid_disposition_completed_api())
        assert passed, errors
        assert errors == []

    def test_valid_completed_queue(self):
        passed, errors = validate_disposition(_valid_disposition_completed_queue())
        assert passed, errors
        assert errors == []

    def test_valid_failed_no_next_orchestrator(self):
        d = _valid_disposition_completed_api(
            status="failed",
            next_orchestrator=None,
            summary="Could not produce verifiable work; see blockers.",
            blockers=["queue verifier offline"],
        )
        passed, errors = validate_disposition(d)
        assert passed, errors

    def test_valid_completed_final_session_no_next_orchestrator(self):
        d = _valid_disposition_completed_api(next_orchestrator=None)
        passed, errors = validate_disposition(d, is_final_session=True)
        assert passed, errors

    def test_dict_input_supported(self):
        as_dict = disposition_to_dict(_valid_disposition_completed_api())
        passed, errors = validate_disposition(as_dict)
        assert passed, errors

    def test_rejects_non_disposition_input(self):
        passed, errors = validate_disposition("not a disposition")  # type: ignore[arg-type]
        assert not passed
        assert any("disposition must be" in e for e in errors)

    @pytest.mark.parametrize("bad_status", ["", "done", "completed!", None, 1])
    def test_rejects_unknown_status(self, bad_status):
        d = disposition_to_dict(_valid_disposition_completed_api())
        d["status"] = bad_status
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("status must be one of" in e for e in errors)

    def test_rejects_empty_summary(self):
        d = _valid_disposition_completed_api(summary="   ")
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("summary" in e for e in errors)

    def test_rejects_non_string_files_changed(self):
        d = disposition_to_dict(_valid_disposition_completed_api())
        d["files_changed"] = ["ok.py", 42]
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("files_changed" in e for e in errors)

    @pytest.mark.parametrize("bad_method", ["", "smtp", None, "API"])
    def test_rejects_unknown_verification_method(self, bad_method):
        d = disposition_to_dict(_valid_disposition_completed_api())
        d["verification_method"] = bad_method
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("verification_method must be one of" in e for e in errors)

    def test_queue_method_requires_message_ids(self):
        d = _valid_disposition_completed_queue(verification_message_ids=[])
        passed, errors = validate_disposition(d)
        assert not passed
        assert any(
            "verification_message_ids must be non-empty" in e for e in errors
        )

    def test_api_method_must_have_empty_message_ids(self):
        d = _valid_disposition_completed_api(verification_message_ids=["leak-1"])
        passed, errors = validate_disposition(d)
        assert not passed
        assert any(
            "verification_message_ids must be empty" in e for e in errors
        )

    def test_next_orchestrator_required_when_completed_and_not_final(self):
        d = _valid_disposition_completed_api(next_orchestrator=None)
        passed, errors = validate_disposition(d, is_final_session=False)
        assert not passed
        assert any("next_orchestrator is required" in e for e in errors)

    def test_next_orchestrator_validation_errors_propagate(self):
        bad_orc = NextOrchestrator(
            engine="claude-code",
            provider="anthropic",
            model="claude-opus-4-7",
            effort="high",
            reason=NextOrchestratorReason(
                code="continue-current-trajectory",  # type: ignore[arg-type]
                specifics="too short",  # < 30 chars
            ),
        )
        d = _valid_disposition_completed_api(next_orchestrator=bad_orc)
        passed, errors = validate_disposition(d)
        assert not passed
        assert any(
            e.startswith("next_orchestrator.") and "specifics" in e
            for e in errors
        )

    def test_blockers_required_when_switch_due_to_blocker(self):
        orc = _valid_next_orc(code=SWITCH_DUE_TO_BLOCKER)
        # validate_next_orchestrator requires specifics ≥ 30; reuse default.
        d = _valid_disposition_completed_api(next_orchestrator=orc, blockers=[])
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("blockers must be non-empty" in e for e in errors)

    def test_blockers_satisfied_when_switch_due_to_blocker(self):
        orc = _valid_next_orc(code=SWITCH_DUE_TO_BLOCKER)
        d = _valid_disposition_completed_api(
            next_orchestrator=orc,
            blockers=["queue worker hung; lease did not expire"],
        )
        passed, errors = validate_disposition(d)
        assert passed, errors

    def test_blockers_optional_when_other_reason_codes(self):
        for code in (
            "continue-current-trajectory",
            "switch-due-to-cost",
            "other",
        ):
            d = _valid_disposition_completed_api(
                next_orchestrator=_valid_next_orc(code=code),
                blockers=[],
            )
            passed, errors = validate_disposition(d)
            assert passed, (code, errors)

    def test_rejects_non_string_blockers(self):
        d = disposition_to_dict(_valid_disposition_completed_api())
        d["blockers"] = ["ok", 0]
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("blockers must be a list of strings" in e for e in errors)

    def test_rejects_non_string_message_ids(self):
        d = disposition_to_dict(_valid_disposition_completed_queue())
        d["verification_message_ids"] = ["ok", 1]
        passed, errors = validate_disposition(d)
        assert not passed
        assert any(
            "verification_message_ids must be a list of strings" in e
            for e in errors
        )


# ---------------------------------------------------------------------------
# JSON Schema parity
# ---------------------------------------------------------------------------

SCHEMA_PATH = (
    Path(disposition.__file__).resolve().parent
    / "schemas"
    / "disposition.schema.json"
)


@pytest.fixture(scope="module")
def schema() -> dict:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def validator(schema):
    cls = jsonschema.validators.validator_for(schema)
    cls.check_schema(schema)
    return cls(schema)


class TestSchemaParity:
    def test_schema_file_exists(self):
        assert SCHEMA_PATH.is_file()

    def test_valid_completed_api_passes_schema(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_api())
        validator.validate(payload)

    def test_valid_completed_queue_passes_schema(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_queue())
        validator.validate(payload)

    def test_valid_failed_passes_schema(self, validator):
        d = _valid_disposition_completed_api(
            status="failed",
            next_orchestrator=None,
            summary="Could not verify; queue worker timed out.",
        )
        validator.validate(disposition_to_dict(d))

    def test_schema_rejects_unknown_status(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_api())
        payload["status"] = "DONE"
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)

    def test_schema_rejects_queue_without_message_ids(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_queue())
        payload["verification_message_ids"] = []
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)

    def test_schema_rejects_api_with_message_ids(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_api())
        payload["verification_message_ids"] = ["leak-1"]
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)

    def test_schema_rejects_short_specifics(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_api())
        payload["next_orchestrator"]["reason"]["specifics"] = "tiny"
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)

    def test_schema_rejects_bad_reason_code(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_api())
        payload["next_orchestrator"]["reason"]["code"] = "made-up"
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)

    def test_schema_rejects_blocker_switch_without_blockers(self, validator):
        payload = disposition_to_dict(
            _valid_disposition_completed_api(
                next_orchestrator=_valid_next_orc(code=SWITCH_DUE_TO_BLOCKER),
                blockers=[],
            )
        )
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)

    def test_schema_accepts_null_next_orchestrator(self, validator):
        payload = disposition_to_dict(
            _valid_disposition_completed_api(
                status="failed", next_orchestrator=None
            )
        )
        validator.validate(payload)

    def test_schema_rejects_unknown_top_level_field(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_api())
        payload["surprise"] = "extra"
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------

class TestPublicSurface:
    def test_status_set_matches_spec(self):
        assert set(DISPOSITION_STATUSES) == {
            "completed", "failed", "requires_review"
        }

    def test_verification_methods_match_spec(self):
        assert set(VERIFICATION_METHODS) == {"api", "queue"}

    def test_filename_constant(self):
        assert DISPOSITION_FILENAME == "disposition.json"

    def test_switch_due_to_blocker_constant(self):
        assert SWITCH_DUE_TO_BLOCKER == "switch-due-to-blocker"
