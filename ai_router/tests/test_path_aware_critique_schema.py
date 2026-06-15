"""Tests for the Set 066 path-aware-critique artifact JSON Schema.

The JSON Schema at ``docs/path-aware-critique.schema.json`` is the
structural contract; the pure-Python
``path_aware_critique.validate_path_aware_critique_artifact`` is the
runtime validator the close-out gate calls. This module pins:

- the schema is itself a valid JSON Schema,
- the shipped example conforms to the schema AND passes the Python
  validator (the dual-validation drift guard — they cannot diverge),
- the structural guardrails (>=2 critiques, required fields, closed
  envelope, content-non-trivial via anyOf),
- the one documented gap between the two validators: two entries from the
  SAME provider pass the structural schema but are rejected by the Python
  validator's multi-provider semantic rule.
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

import path_aware_critique as pac  # conftest puts ai_router/ on sys.path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "docs" / "path-aware-critique.schema.json"
EXAMPLE_PATH = REPO_ROOT / "docs" / "path-aware-critique-schema-example.json"


@pytest.fixture(scope="module")
def schema() -> dict:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def validator(schema):
    cls = jsonschema.validators.validator_for(schema)
    cls.check_schema(schema)
    return cls(schema)


def _minimal() -> dict:
    return {
        "schemaVersion": 1,
        "sessionSetName": "066-set",
        "pathAwareCritique": "required",
        "critiques": [
            {
                "provider": "openai",
                "model": "gpt-5.4",
                "verdict": "ISSUES_FOUND",
                "findings": [{"description": "a finding"}],
            },
            {
                "provider": "google",
                "model": "gemini-2.5-pro",
                "verdict": "VERIFIED",
                "summary": "no defects",
            },
        ],
    }


class TestArtifactFilesExist:
    def test_schema_file_exists(self):
        assert SCHEMA_PATH.is_file()

    def test_example_file_exists(self):
        assert EXAMPLE_PATH.is_file()


class TestExampleFixture:
    def test_example_conforms_to_schema(self, validator):
        payload = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
        validator.validate(payload)

    def test_example_passes_python_validator(self):
        """Dual-validation drift guard: the runtime validator and the JSON
        Schema must agree the shipped example is valid."""
        payload = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
        res = pac.validate_path_aware_critique_artifact(payload)
        assert res.ok is True
        assert res.code == pac.ARTIFACT_VALID

    def test_example_is_multi_provider(self):
        payload = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
        providers = {c["provider"] for c in payload["critiques"]}
        assert len(providers) >= 2

    def test_example_demonstrates_findings_and_summary_forms(self):
        payload = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
        has_findings = any("findings" in c for c in payload["critiques"])
        has_summary_only = any(
            "summary" in c and not c.get("findings")
            for c in payload["critiques"]
        )
        assert has_findings and has_summary_only


class TestEnvelopeContract:
    def test_minimal_passes_both_validators(self, validator):
        env = _minimal()
        validator.validate(env)
        assert pac.validate_path_aware_critique_artifact(env).ok is True

    def test_single_critique_rejected_by_schema(self, validator):
        env = _minimal()
        env["critiques"] = env["critiques"][:1]
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)

    def test_missing_required_field_rejected(self, validator):
        for field in (
            "schemaVersion",
            "sessionSetName",
            "pathAwareCritique",
            "critiques",
        ):
            env = _minimal()
            del env[field]
            with pytest.raises(jsonschema.ValidationError):
                validator.validate(env)

    def test_unknown_top_level_key_rejected(self, validator):
        env = _minimal()
        env["bogus"] = 1
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)

    def test_schema_version_two_rejected(self, validator):
        env = _minimal()
        env["schemaVersion"] = 2
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)

    def test_unknown_level_rejected(self, validator):
        env = _minimal()
        env["pathAwareCritique"] = "bogus"
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)


class TestCritiqueContract:
    def test_critique_requires_provider_model_verdict(self, validator):
        for field in ("provider", "model", "verdict"):
            env = _minimal()
            del env["critiques"][0][field]
            with pytest.raises(jsonschema.ValidationError):
                validator.validate(env)

    def test_trivial_entry_rejected_by_schema_anyof(self, validator):
        env = _minimal()
        env["critiques"][1].pop("summary", None)
        env["critiques"][1].pop("findings", None)
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)

    def test_finding_requires_description(self, validator):
        env = _minimal()
        env["critiques"][0]["findings"] = [{"severity": "Major"}]
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)

    def test_tolerates_extra_provider_keys(self, validator):
        env = _minimal()
        env["critiques"][0]["toolCalls"] = 4
        validator.validate(env)


def _schema_ok(validator, env) -> bool:
    try:
        validator.validate(env)
        return True
    except jsonschema.ValidationError:
        return False


class TestSchemaVsPythonValidatorGap:
    """The one documented gap: distinct-provider is a Python-only semantic
    rule (JSON Schema cannot express 'at least two distinct providers')."""

    def test_same_provider_twice_passes_schema_but_fails_python(self, validator):
        env = _minimal()
        env["critiques"][1]["provider"] = "openai"  # both openai now
        validator.validate(env)  # structurally fine
        res = pac.validate_path_aware_critique_artifact(env)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_SINGLE_PROVIDER


class TestStructuralParity:
    """Regression guard: the runtime validator and the JSON Schema must
    AGREE on every structural case — the ONLY intended divergence is the
    distinct-provider semantic rule (pinned above). Closes the Set 066 S1
    verifier Major (the Python validator was previously more lenient than
    the schema on these four cases)."""

    def _malformations(self):
        m = []
        a = _minimal(); a["bogusTopKey"] = 1
        m.append(("extra-top-level-key", a))
        b = _minimal(); b["critiques"][1]["summary"] = "c"; b["critiques"][1]["findings"] = "x"
        m.append(("findings-not-array", b))
        c = _minimal(); c["critiques"][1]["summary"] = 5; c["critiques"][1]["findings"] = [{"description": "d"}]
        m.append(("summary-non-string", c))
        d = _minimal(); d["critiques"][0]["summary"] = "has summary"; d["critiques"][0]["findings"] = [{"severity": "Major"}]
        m.append(("finding-missing-description", d))
        return m

    def test_malformations_rejected_by_both(self, validator):
        for label, env in self._malformations():
            schema_ok = _schema_ok(validator, env)
            python_ok = pac.validate_path_aware_critique_artifact(env).ok
            assert schema_ok is False, f"{label}: schema unexpectedly accepted"
            assert python_ok is False, f"{label}: python validator unexpectedly accepted"

    def test_clean_artifact_accepted_by_both(self, validator):
        env = _minimal()
        assert _schema_ok(validator, env) is True
        assert pac.validate_path_aware_critique_artifact(env).ok is True
