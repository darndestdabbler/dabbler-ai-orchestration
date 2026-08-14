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
    CANONICAL_VERDICTS,
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


def _valid_disposition_completed_manual(**overrides) -> Disposition:
    base = dict(
        status="completed",
        summary="Manual cross-provider verification handed back via IDE paste path.",
        verification_method="manual-via-other-engine",
        files_changed=["ai_router/session_state.py"],
        verification_message_ids=[],
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
        d = _valid_disposition_completed_manual()
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

    def test_valid_completed_manual(self):
        passed, errors = validate_disposition(_valid_disposition_completed_manual())
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
        d = disposition_to_dict(_valid_disposition_completed_manual())
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

    def test_valid_completed_manual_passes_schema(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_manual())
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
        assert set(VERIFICATION_METHODS) == {"api", "manual-via-other-engine", "skipped"}

    def test_filename_constant(self):
        assert DISPOSITION_FILENAME == "disposition.json"

    def test_switch_due_to_blocker_constant(self):
        assert SWITCH_DUE_TO_BLOCKER == "switch-due-to-blocker"

    def test_canonical_verdicts_constant(self):
        assert set(CANONICAL_VERDICTS) == {"VERIFIED", "ISSUES_FOUND"}


# ---------------------------------------------------------------------------
# Set 054 Session 2 — verification_verdict field
# ---------------------------------------------------------------------------

class TestVerificationVerdictField:
    """Round-trip and serialization tests for the new ``verification_verdict``
    field added in Set 054 Session 2."""

    def test_defaults_to_none(self):
        d = _valid_disposition_completed_api()
        assert d.verification_verdict is None

    def test_omit_null_when_none(self):
        d = _valid_disposition_completed_api()
        as_dict = disposition_to_dict(d)
        assert "verification_verdict" not in as_dict

    def test_included_when_set(self):
        d = _valid_disposition_completed_api(verification_verdict="VERIFIED")
        as_dict = disposition_to_dict(d)
        assert as_dict["verification_verdict"] == "VERIFIED"

    def test_round_trip_with_verdict(self):
        d = _valid_disposition_completed_api(verification_verdict="ISSUES_FOUND")
        restored = disposition_from_dict(disposition_to_dict(d))
        assert restored.verification_verdict == "ISSUES_FOUND"

    def test_from_dict_missing_key_returns_none(self):
        raw = disposition_to_dict(_valid_disposition_completed_api())
        assert "verification_verdict" not in raw
        restored = disposition_from_dict(raw)
        assert restored.verification_verdict is None

    def test_from_dict_explicit_null_not_written(self, session_set_dir):
        d = _valid_disposition_completed_api()
        write_disposition(session_set_dir, d)
        raw_text = Path(session_set_dir, DISPOSITION_FILENAME).read_text(encoding="utf-8")
        assert "verification_verdict" not in raw_text

    def test_write_read_round_trip_with_verdict(self, session_set_dir):
        d = _valid_disposition_completed_api(verification_verdict="VERIFIED")
        write_disposition(session_set_dir, d)
        loaded = read_disposition(session_set_dir)
        assert loaded is not None
        assert loaded.verification_verdict == "VERIFIED"

    def test_schema_accepts_verdict_string(self, validator):
        payload = disposition_to_dict(
            _valid_disposition_completed_api(verification_verdict="VERIFIED")
        )
        validator.validate(payload)

    def test_schema_accepts_extension_token(self, validator):
        payload = disposition_to_dict(
            _valid_disposition_completed_api(
                verification_verdict="ISSUES_FOUND_RESOLVED_IN_FLIGHT"
            )
        )
        validator.validate(payload)

    def test_schema_rejects_empty_string_verdict(self, validator):
        payload = disposition_to_dict(_valid_disposition_completed_api())
        payload["verification_verdict"] = ""
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)


class TestValidateDispositionVerdict:
    """validate_disposition rules for ``verification_verdict`` (Set 054 S2)."""

    def test_passes_with_verified(self):
        d = _valid_disposition_completed_api(verification_verdict="VERIFIED")
        passed, errors = validate_disposition(d)
        assert passed, errors

    def test_passes_with_issues_found(self):
        d = _valid_disposition_completed_api(verification_verdict="ISSUES_FOUND")
        passed, errors = validate_disposition(d)
        assert passed, errors

    def test_passes_when_verdict_absent(self):
        d = _valid_disposition_completed_api()
        passed, errors = validate_disposition(d)
        assert passed, errors

    def test_warns_on_noncanonical_token(self, capsys):
        d = _valid_disposition_completed_api(
            verification_verdict="ISSUES_FOUND_RESOLVED_IN_FLIGHT"
        )
        passed, errors = validate_disposition(d)
        assert passed, errors
        captured = capsys.readouterr()
        assert "WARNING" in captured.err
        assert "ISSUES_FOUND_RESOLVED_IN_FLIGHT" in captured.err

    def test_errors_on_empty_string(self):
        d = disposition_to_dict(_valid_disposition_completed_api())
        d["verification_verdict"] = ""
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("verification_verdict" in e for e in errors)

    def test_errors_on_non_string(self):
        d = disposition_to_dict(_valid_disposition_completed_api())
        d["verification_verdict"] = 42
        passed, errors = validate_disposition(d)
        assert not passed
        assert any("verification_verdict" in e for e in errors)


# ---------------------------------------------------------------------------
# Set 130 Session 3 - disposition.cost
#
# The three rules below are the contract, and each is asserted against BOTH
# halves of the parity pair (the pure-Python validator and the shipped JSON
# Schema). Rule 1 is the one that matters: a component that was not measured
# must carry no number, because 0.0 beside status "unknown" reads as a
# measurement and no reader can tell it from a real zero (L-112-1).
# ---------------------------------------------------------------------------

import seat_cost  # noqa: E402

NON_NUMERIC = sorted(seat_cost.NON_NUMERIC_STATUSES)


def _cost_block(**overrides) -> dict:
    """A well-formed, honest cost block: one floor, one unknown, no total."""
    base = {
        "measured_at": seat_cost.MEASURED_AT_CLOSE,
        "store_schema_version": 6,
        "components": [
            {
                "component": "orchestrator_seat",
                "status": "lower_bound",
                "credits": 735.3,
                "usd": 7.353,
                "event_count": 64,
                "session_ids": ["conv-1"],
                "measured_session_ids": ["conv-1"],
                "unmeasured_session_ids": [],
                "reason": "a conversation in this component is still in flight",
            },
            {
                "component": "routed_seat",
                "status": "unknown",
                "credits": None,
                "usd": None,
                "event_count": 0,
                "session_ids": [],
                "measured_session_ids": [],
                "unmeasured_session_ids": [],
                "reason": "no conversation ids supplied; nothing to measure",
            },
        ],
        "total_status": "unknown",
        "total_credits": None,
        "total_usd": None,
        "unmeasured": ["routed_seat"],
    }
    base.update(overrides)
    return base


def _with_cost(block) -> dict:
    return disposition_to_dict(_valid_disposition_completed_api(cost=block))


class TestCostBlock:
    def test_a_producer_built_block_satisfies_both_halves(self, validator, tmp_path):
        """The pin: what seat_cost actually emits is what the contract accepts.

        Built from a REAL measurement against a planted store rather than a
        hand-written literal, so a producer change that the contract has not
        learned about fails here instead of at some later consumer.
        """
        import sqlite3

        store = tmp_path / "session-store.db"
        conn = sqlite3.connect(str(store))
        conn.execute("CREATE TABLE schema_version (version INTEGER)")
        conn.execute("INSERT INTO schema_version (version) VALUES (6)")
        conn.execute(
            "CREATE TABLE assistant_usage_events "
            "(id INTEGER PRIMARY KEY, session_id TEXT, total_nano_aiu INTEGER)"
        )
        conn.execute("CREATE TABLE sessions (id TEXT)")
        conn.execute(
            "INSERT INTO assistant_usage_events (session_id, total_nano_aiu) "
            "VALUES ('conv-1', 42000000000)"
        )
        conn.execute("INSERT INTO sessions (id) VALUES ('conv-1')")
        conn.commit()
        conn.close()

        report = seat_cost.measure(
            {"orchestrator_seat": ["conv-1"], "routed_seat": []},
            store_path=str(store),
            not_applicable=["routed_api"],
        )
        block = report.to_cost_block(seat_cost.MEASURED_AT_CLOSE)

        passed, errors = validate_disposition(_with_cost(block), is_final_session=True)
        assert passed, errors
        validator.validate(_with_cost(block))

    @pytest.mark.parametrize("status", NON_NUMERIC)
    def test_an_unmeasured_component_may_not_carry_a_number(self, validator, status):
        """Rule 1, both halves. The planted defect is the fail-open shape."""
        block = _cost_block()
        block["components"][1]["status"] = status
        block["components"][1]["credits"] = 0.0
        block["components"][1]["usd"] = 0.0

        passed, errors = validate_disposition(_with_cost(block), is_final_session=True)
        assert not passed
        # Both fields, named separately: an assertion that matched either one
        # would pass with half the rule deleted -- which is exactly what
        # planting the defect showed before this line said "credits".
        assert any("credits must be null when status is" in e for e in errors), errors
        assert any("usd must be null when status is" in e for e in errors), errors
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(_with_cost(block))

    def test_a_measured_component_must_carry_a_number(self, validator):
        """The other direction: 'measured' with no number is not a measurement."""
        block = _cost_block()
        block["components"][0]["credits"] = None
        block["components"][0]["usd"] = None

        passed, errors = validate_disposition(_with_cost(block), is_final_session=True)
        assert not passed
        assert any("credits must be a number when status is" in e for e in errors), errors
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(_with_cost(block))

    def test_a_total_is_refused_while_a_component_is_unmeasured(self, validator):
        """Rule 2, both halves: a total that drops one reports it as zero."""
        block = _cost_block(
            total_status="lower_bound", total_credits=735.3, total_usd=7.353
        )
        passed, errors = validate_disposition(_with_cost(block), is_final_session=True)
        assert not passed
        assert any("must be null when any" in e for e in errors), errors
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(_with_cost(block))

    def test_an_as_of_close_figure_cannot_claim_to_be_exact(self, validator):
        """Rule 3, both halves (spec T5: a session cannot measure itself)."""
        block = _cost_block(
            components=[
                {
                    "component": "orchestrator_seat",
                    "status": "measured",
                    "credits": 10.0,
                    "usd": 0.1,
                },
                {
                    "component": "routed_api",
                    "status": "not_applicable",
                    "credits": 0.0,
                    "usd": 0.0,
                },
            ],
            total_status="measured",
            total_credits=10.0,
            total_usd=0.1,
            unmeasured=[],
        )
        assert block["measured_at"] == seat_cost.MEASURED_AT_CLOSE

        passed, errors = validate_disposition(_with_cost(block), is_final_session=True)
        assert not passed
        assert any("cannot be 'measured' when measured_at" in e for e in errors), errors
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(_with_cost(block))

        # The same numbers taken retrospectively are legitimate.
        block["measured_at"] = seat_cost.MEASURED_AT_RETROSPECTIVE
        passed, errors = validate_disposition(_with_cost(block), is_final_session=True)
        assert passed, errors
        validator.validate(_with_cost(block))

    @pytest.mark.parametrize(
        "mutate, fragment",
        [
            (lambda b: b.update(measured_at="whenever"), "measured_at"),
            (
                lambda b: b["components"][0].update(status="probably_fine"),
                "status must be one of",
            ),
            (
                lambda b: b["components"][0].update(component="orchestrator-seat"),
                "component must be one of",
            ),
            (
                lambda b: b["components"].append(dict(b["components"][0])),
                "appears more than once",
            ),
            (
                lambda b: b["components"][0].update(cost_usd=1.0),
                "unknown key",
            ),
            (lambda b: b.update(components=[]), "non-empty list"),
        ],
    )
    def test_the_vocabularies_fail_closed(self, mutate, fragment):
        """A token nobody can interpret loses the 'not measured' meaning."""
        block = _cost_block()
        mutate(block)
        passed, errors = validate_disposition(_with_cost(block), is_final_session=True)
        assert not passed
        assert any(fragment in e for e in errors), errors

    def test_component_keys_are_pinned_to_the_producer_and_the_schema(self, schema):
        """Three-way parity: producer -> validator allowlist -> schema.

        ``additionalProperties: false`` on the schema side means a producer
        that grows a key silently starts emitting blocks the shipped schema
        rejects -- the Set 123 S2 defect. This asserts the three cannot drift.
        """
        produced = seat_cost.ComponentCost(
            component="orchestrator_seat", status="unknown"
        ).to_dict()
        assert set(produced) == set(disposition.COST_COMPONENT_KEYS)
        schema_keys = set(
            schema["$defs"]["CostComponent"]["properties"]
        )
        assert schema_keys == set(disposition.COST_COMPONENT_KEYS)
        assert set(
            schema["$defs"]["CostComponent"]["properties"]["status"]["enum"]
        ) == set(seat_cost.STATUSES)
        assert set(
            schema["$defs"]["CostComponent"]["properties"]["component"]["enum"]
        ) == set(seat_cost.COMPONENTS)

    def test_cost_is_omit_null_and_round_trips(self, session_set_dir):
        d = _valid_disposition_completed_api()
        assert "cost" not in disposition_to_dict(d)
        write_disposition(session_set_dir, d)
        assert "cost" not in Path(
            session_set_dir, DISPOSITION_FILENAME
        ).read_text(encoding="utf-8")

        block = _cost_block()
        write_disposition(session_set_dir, _valid_disposition_completed_api(cost=block))
        loaded = read_disposition(session_set_dir)
        assert loaded is not None and loaded.cost == block


class TestOptionalFieldParityAcrossValidationPaths:
    """L-069-1 sibling class, found while adding ``cost``.

    ``validate_disposition`` builds its own dict view when handed a
    ``Disposition`` OBJECT, and that view had silently omitted
    ``verification_qualification`` (Set 123 S2) and ``checklist`` (Set 114
    S1) -- so an object carrying a bogus qualification or an incoherent
    checklist block validated clean while the identical content as a dict
    was refused. The two paths must agree on every field.
    """

    @pytest.mark.parametrize(
        "field_name, bad_value",
        [
            ("verification_qualification", "invented-token"),
            ("checklist", {"status": "posted", "attestation": ""}),
            ("uat", {"status": "sort-of", "attestation": ""}),
            ("cost", {"measured_at": "close", "components": []}),
        ],
    )
    def test_object_and_dict_paths_report_the_same_errors(self, field_name, bad_value):
        d = _valid_disposition_completed_api(**{field_name: bad_value})
        object_passed, object_errors = validate_disposition(d, is_final_session=True)
        dict_view = {
            **disposition_to_dict(_valid_disposition_completed_api()),
            field_name: bad_value,
        }
        dict_passed, dict_errors = validate_disposition(
            dict_view, is_final_session=True
        )
        assert dict_passed is False, "the dict path must reject this"
        assert object_passed is False, (
            f"the object path skipped {field_name!r} entirely"
        )
        assert set(object_errors) == set(dict_errors)


class TestShippedBlocksValidateAgainstTheSchema:
    """The schema forbids unknown top-level keys, so every field the
    dataclass emits must be declared in it. ``uat`` and ``checklist``
    shipped without that, which made the schema reject exactly the
    dispositions their close gates require."""

    @pytest.mark.parametrize(
        "field_name, value",
        [
            (
                "uat",
                {
                    "status": "walked",
                    "attestation": "Operator walked all six steps.",
                    "walkArtifact": "s1-uat-walk.md",
                },
            ),
            ("uat", {"status": "waived", "attestation": "Operator declined."}),
            (
                "checklist",
                {"status": "waived", "attestation": "Post window had closed."},
            ),
        ],
    )
    def test_a_block_the_validator_accepts_is_a_block_the_schema_accepts(
        self, validator, field_name, value
    ):
        d = _valid_disposition_completed_api(**{field_name: value})
        passed, errors = validate_disposition(d, is_final_session=True)
        assert passed, errors
        validator.validate(disposition_to_dict(d))

    def test_schema_still_rejects_an_incoherent_uat_block(self, validator):
        payload = disposition_to_dict(
            _valid_disposition_completed_api(
                uat={"status": "walked", "attestation": "walked it"}
            )
        )
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(payload)
