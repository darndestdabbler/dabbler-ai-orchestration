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
- the Set 069 evidence-tier additions (evidenceTier + the REPRODUCED
  transcript) and their dual-validation parity,
- the two documented runtime Python-only semantic gaps the schema cannot
  express: (1) two entries from the SAME provider pass the structural
  schema but are rejected by the Python validator's multi-provider rule,
  and (2) the cross-field replay-hash equality on a REPRODUCED transcript.
  Everything else (XOR, pristineCheckout==true, the meta-oracle kind,
  whitespace-only rejection) is schema-expressed and the two validators
  agree on it.
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

import evidence_protocol as ep  # conftest puts ai_router/ on sys.path
import path_aware_critique as pac

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


def _valid_transcript() -> dict:
    out = "Traceback (most recent call last): ...\nUnicodeDecodeError\n"
    h = ep.hash_output(out)
    return {
        "pinnedRef": "deadbee",
        "commandId": "validator-malformed-bytes",
        "pristineCheckout": True,
        "exitCode": 1,
        "rawOutput": out,
        "outputHash": h,
        "entrypoint": {"kind": "public_command", "ref": "ai_router.contract_gate"},
        "replay": {"pristineCheckout": True, "exitCode": 1, "outputHash": h},
    }


def _with_reproduced_finding() -> dict:
    """A minimal artifact whose first finding is a valid REPRODUCED falsifier."""
    env = _minimal()
    env["critiques"][0]["findings"] = [
        {
            "description": "contract_gate crashes on a non-UTF-8 manifest.",
            "severity": "Major",
            "category": "correctness",
            "evidenceTier": "REPRODUCED",
            "transcript": _valid_transcript(),
        }
    ]
    return env


class TestEvidenceTierContract:
    """Set 069 S1: the additive execution-evidence fields on a finding.

    The JSON Schema enforces the enum, the transcript STRUCTURE, transcript
    *presence* on a REPRODUCED finding (if/then), the commandId XOR templateId
    (oneOf), pristineCheckout==true (const), and the meta-oracle entrypoint
    kind (enum). The ONLY Set-069 Python-only semantic divergence is the
    cross-field replay-hash equality, pinned in TestEvidenceSchemaVsPythonGap
    below; the other transcript rules are 'rejected by both' in
    TestEvidenceParity."""

    def test_untagged_findings_still_valid_both(self, validator):
        # Backward compatibility: the pre-069 example has no evidence tags.
        env = _minimal()
        validator.validate(env)
        assert pac.validate_path_aware_critique_artifact(env).ok is True

    def test_reproduced_with_valid_transcript_passes_both(self, validator):
        env = _with_reproduced_finding()
        validator.validate(env)
        assert pac.validate_path_aware_critique_artifact(env).ok is True

    def test_reproduced_without_transcript_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        del env["critiques"][0]["findings"][0]["transcript"]
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)
        res = pac.validate_path_aware_critique_artifact(env)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_INVALID_EVIDENCE

    def test_unknown_tier_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["evidenceTier"] = "MAYBE"
        del env["critiques"][0]["findings"][0]["transcript"]
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(env)
        res = pac.validate_path_aware_critique_artifact(env)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_INVALID_EVIDENCE

    def test_asserted_finding_needs_no_transcript_both(self, validator):
        env = _minimal()
        env["critiques"][0]["findings"][0]["evidenceTier"] = "ASSERTED"
        validator.validate(env)
        assert pac.validate_path_aware_critique_artifact(env).ok is True


class TestEvidenceSchemaVsPythonGap:
    """The ONE Set-069 Python-only semantic rule JSON Schema cannot express:
    cross-field replay-hash equality. Everything else about a REPRODUCED
    transcript (XOR, pristineCheckout==true, meta-oracle kind) is schema-
    expressed and pinned as 'rejected by both' in TestEvidenceParity below."""

    def test_replay_hash_mismatch_passes_schema_fails_python(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"]["replay"][
            "outputHash"
        ] = ep.hash_output("a different run")
        validator.validate(env)  # both hashes present + non-empty; schema fine
        res = pac.validate_path_aware_critique_artifact(env)
        assert res.ok is False
        assert res.code == pac.ARTIFACT_INVALID_EVIDENCE


class TestEvidenceParity:
    """Set 069 S1 verifier regressions: malformed REPRODUCED transcripts and
    stray non-REPRODUCED transcripts must be handled IDENTICALLY by the JSON
    Schema and the Python validator (the L-066-1 parity holes)."""

    def _python_ok(self, env) -> bool:
        return pac.validate_path_aware_critique_artifact(env).ok

    def test_stray_transcript_on_asserted_ignored_by_both(self, validator):
        # A transcript on a non-REPRODUCED finding is untyped supporting context;
        # BOTH validators ignore it, even when malformed.
        env = _minimal()
        env["critiques"][0]["findings"][0]["evidenceTier"] = "ASSERTED"
        env["critiques"][0]["findings"][0]["transcript"] = {"garbage": True}
        assert _schema_ok(validator, env) is True
        assert self._python_ok(env) is True

    def test_stray_transcript_on_hypothesis_ignored_by_both(self, validator):
        env = _minimal()
        env["critiques"][0]["findings"][0]["evidenceTier"] = "HYPOTHESIS"
        env["critiques"][0]["findings"][0]["transcript"] = {"x": 1}
        assert _schema_ok(validator, env) is True
        assert self._python_ok(env) is True

    def test_both_ids_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"]["templateId"] = "t"
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_command_valid_template_wrong_type_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"]["templateId"] = 7
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_template_valid_command_empty_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        t = env["critiques"][0]["findings"][0]["transcript"]
        del t["commandId"]
        t["templateId"] = "call-with-bad-parent"
        t["commandId"] = ""
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_args_wrong_type_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"]["args"] = 7
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_replay_exit_code_bool_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"]["replay"][
            "exitCode"
        ] = True
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_non_pristine_checkout_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"][
            "pristineCheckout"
        ] = False
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_agent_harness_entrypoint_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"]["entrypoint"][
            "kind"
        ] = "agent_harness"
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_whitespace_only_session_set_name_rejected_by_both(self, validator):
        # Set 069 closed the whitespace divergence: Python tests .strip(), the
        # schema now carries pattern "\\S"; both reject a whitespace-only value.
        env = _minimal()
        env["sessionSetName"] = "   "
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False

    def test_whitespace_only_pinned_ref_rejected_by_both(self, validator):
        env = _with_reproduced_finding()
        env["critiques"][0]["findings"][0]["transcript"]["pinnedRef"] = "  "
        assert _schema_ok(validator, env) is False
        assert self._python_ok(env) is False


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


class TestEvidencePathsParity:
    """Set 119 S1 shipped ``evidencePaths`` and S1's own verification found
    the parity gap S2 closes here: the schema's item constraint was
    ``minLength: 1``, which a single SPACE satisfies, while
    ``path_aware_critique`` rejects it via ``p.strip()``. The sibling
    ``description`` property in the same file already carried the
    non-whitespace ``pattern``; the array item did not.

    Fail-closed is not the same as in-parity (L-066-1): the Python side
    being stricter means nothing invalid was ever accepted at runtime, but
    a schema-only consumer would still accept an artifact the runtime
    rejects. Both directions are pinned below.
    """

    def _with_paths(self, paths):
        env = _minimal()
        env["critiques"][0]["findings"] = [
            {"description": "a finding", "evidencePaths": paths}
        ]
        return env

    def test_whitespace_only_path_rejected_by_both(self, validator):
        env = self._with_paths([" "])
        assert _schema_ok(validator, env) is False
        assert pac.validate_path_aware_critique_artifact(env).ok is False

    def test_empty_path_rejected_by_both(self, validator):
        env = self._with_paths([""])
        assert _schema_ok(validator, env) is False
        assert pac.validate_path_aware_critique_artifact(env).ok is False

    def test_a_real_path_is_accepted_by_both(self, validator):
        """The look-alike. Without it, 'reject every evidencePaths entry'
        would pass the two tests above."""
        env = self._with_paths(["ai_router/verification.py"])
        assert _schema_ok(validator, env) is True
        assert pac.validate_path_aware_critique_artifact(env).ok is True

    def test_absent_evidence_paths_stays_valid(self, validator):
        """Optional by design: its absence must not launder a blocking
        finding, so it must also not invalidate an artifact."""
        env = _minimal()
        assert _schema_ok(validator, env) is True
        assert pac.validate_path_aware_critique_artifact(env).ok is True
