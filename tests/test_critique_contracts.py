"""The critique artifact contracts frozen at v1.

The artifacts decide nothing yet. What is worth pinning now is the part a
later set cannot renegotiate cheaply: that the version is frozen, so a
record written against a different vocabulary is refused rather than
half-understood, and that the check IR stays a bounded description of work
rather than drifting into a programming language.

The surfaces that *use* these schemas are tested where they live: the
machine-owned paths and writers in ``test_ledger.py``, and ``verify
prepare`` with its derived change-id in ``test_verify.py``.
"""

import json
from pathlib import Path

import jsonschema
import pytest

SCHEMAS = Path(__file__).resolve().parents[1] / "ai_router" / "schemas"

MINIMAL = {
    "review-run.schema.json": {
        "schema_version": 1,
        "change_id": "abcdef1",
        "set_slug": "141-critique-contracts-and-shadow-records",
        "session_number": 1,
        "opened_at": "2026-08-19T00:00:00Z",
        "attempts": [{
            "attempt": 1,
            "opened_at": "2026-08-19T00:00:00Z",
            "completion_tree": "abcdef1",
            "status": "open",
        }],
    },
    "review-claims.schema.json": {
        "schema_version": 1,
        "change_id": "abcdef1",
        "claims": [],
        "recorded_at": "2026-08-19T00:00:00Z",
    },
    "check-ir.schema.json": {
        "schema_version": 1,
        "check_id": "c1",
        "source": "corpus:example",
        "executor": "worker-model",
        "objective": "Does every new public function document its refusal?",
        "selector": {"from": "changed-files"},
        "condition": {"exists": "docstring"},
        "scope": {"paths": ["ai_router/**"], "changed_only": True},
        "branch": {
            "documented": {"when": {"exists": "docstring"}, "outcome": "pass"}
        },
        "evidence": {
            "pass": {"requires": ["quote"]},
            "fail": {"requires": ["quote"]},
            "blocked": {"requires": ["adjudication-note"]},
        },
        "authorized_pulls": ["ai_router/**"],
        "bounds": {
            "max_files": 20, "max_bytes": 200000, "timeout_seconds": 30
        },
    },
    "worker-results.schema.json": {
        "schema_version": 1,
        "change_id": "abcdef1",
        "check_id": "c1",
        "attempt": 1,
        "result": "pass",
        "recorded_at": "2026-08-19T00:00:00Z",
    },
    "dispositions.schema.json": {
        "schema_version": 1,
        "change_id": "abcdef1",
        "check_id": "c1",
        "attempt": 1,
        "disposition": "fixed",
        "severity": "minor",
        "defect_class": "logic-state",
        "recorded_at": "2026-08-19T00:00:00Z",
    },
}


def _schema(name):
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


def test_every_critique_schema_is_frozen_at_v1():
    for name, record in MINIMAL.items():
        schema = _schema(name)
        jsonschema.validate(record, schema)
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate({**record, "schema_version": 2}, schema)


def test_check_ir_refuses_condition_nesting_past_two_levels():
    schema = _schema("check-ir.schema.json")
    base = MINIMAL["check-ir.schema.json"]
    two = {"all": [{"all": [{"exists": "docstring"}]}]}
    three = {"all": [{"all": [{"all": [{"exists": "docstring"}]}]}]}
    jsonschema.validate({**base, "condition": two}, schema)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate({**base, "condition": three}, schema)

