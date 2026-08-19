"""The critique artifact contracts frozen at v1, and the round trip that
exercises them.

The artifacts decide nothing yet. What is worth pinning now is the part a
later set cannot renegotiate cheaply: that the version is frozen, so a
record written against a different vocabulary is refused rather than
half-understood; that the check IR stays a bounded description of work
rather than drifting into a programming language; and that a worker's
evidence is re-derived by the framework before it reaches the record.

No model is called anywhere in this file. The seeded change under
``fixtures/critique-roundtrip/`` travels from ``verify prepare`` to a
validated result through the real writers and the real verifiers.

The surfaces that *use* these schemas are tested where they live: the
machine-owned paths and writers in ``test_ledger.py``, and ``verify
prepare`` with its derived change-id in ``test_verify.py``.
"""

import json
from pathlib import Path

import jsonschema
import pytest

from ai_router import evidence, ledger
from ai_router.session import register_session_start

SCHEMAS = Path(__file__).resolve().parents[1] / "ai_router" / "schemas"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "critique-roundtrip"

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


@pytest.fixture
def seeded(sandbox_repo, monkeypatch):
    """The seeded change, prepared: a review run open on the working tree,
    the author's claims recorded, and the check IR written beside them.

    Yields ``(repo, set_dir, change_id, reviewed_tree)``. The tree is the
    one ``prepare`` snapshotted, which is the only tree any evidence in
    these tests is checked against.
    """
    import ai_router.config as config_module
    from ai_router.verify import EXIT_OK, run_prepare

    repo, set_dir = sandbox_repo
    register_session_start(
        set_dir, 1, engine="claude-code", provider="anthropic"
    )
    (repo / "widget.py").write_bytes((FIXTURE / "widget.py").read_bytes())
    monkeypatch.setattr(
        config_module, "load_config",
        lambda *a, **k: {"critique": {"pipeline": "shadow"}},
    )
    assert run_prepare(set_dir, claims_path=FIXTURE / "claims.json") == EXIT_OK

    run = ledger.read_review_runs(repo, set_dir.name, 1)[0]
    ledger.write_checks(
        repo, set_dir.name, 1, run["change_id"],
        json.loads((FIXTURE / "checks.json").read_text(encoding="utf-8")),
    )
    return repo, set_dir, run["change_id"], run["attempts"][-1][
        "completion_tree"
    ]


def test_evidence_is_re_derived_from_the_reviewed_tree(seeded):
    repo, set_dir, change_id, tree = seeded
    slug = set_dir.name
    blob = evidence.read_tree_blob(repo, tree, "widget.py")

    def span(needle):
        start = blob.index(needle)
        return {"kind": "byte", "start": start, "end": start + len(needle)}

    call = b"os.linesep.join(str(row) for row in rows)"
    recorded = evidence.record_worker_result(repo, slug, 1, tree, {
        "schema_version": 1,
        "change_id": change_id,
        "check_id": "no-shell-out",
        "attempt": 1,
        "result": "pass",
        "recorded_at": "2026-08-19T00:00:00Z",
        "quotes": [{
            "path": "widget.py",
            "span": span(call),
            "content_hash": evidence.hash_bytes(call),
            "ast_kind": "Call",
        }],
        "absence_searches": [{
            "query": "Call:os.system",
            "query_kind": "ast",
            "scope": ["*.py"],
            "tool_version": "whatever the worker says it used",
            "matches": 0,
        }],
    })

    # The recorded search is the framework's re-execution, named by the
    # tool that actually ran it.
    search = recorded["absence_searches"][0]
    assert search["matches"] == 0
    assert search["tool_version"].startswith("python-ast/")
    assert ledger.read_worker_results(repo, slug, 1, change_id) == [recorded]
    assert ledger.read_checks(
        repo, slug, 1, change_id)[0]["check_id"] == "no-shell-out"

    # Text search and parse disagree over the same closed scope, which is
    # why the framework runs the one the check asked for.
    assert evidence.run_absence_search(repo, tree, {
        "query": "os.system", "query_kind": "literal", "scope": ["*.py"],
    })["matches"] == 2

    # A worker that reports a count the re-run does not produce is refused,
    # not quietly corrected.
    with pytest.raises(evidence.EvidenceError) as fabricated:
        evidence.verify_worker_result(repo, tree, {
            "check_id": "no-shell-out", "result": "pass",
            "absence_searches": [{
                "query": "os.system", "query_kind": "literal",
                "scope": ["*.py"], "tool_version": "grep", "matches": 0,
            }],
        })
    assert fabricated.value.code == "absence-search-disagrees"

    # An absence proved over a scope that resolves to nothing proves
    # nothing.
    with pytest.raises(evidence.EvidenceError) as vacuous:
        evidence.run_absence_search(repo, tree, {
            "query": "os.system", "query_kind": "literal",
            "scope": ["src/**/*.py"],
        })
    assert vacuous.value.code == "absence-scope-empty"

    # A quote whose content hash does not match the reviewed tree is
    # refused by name.
    with pytest.raises(evidence.EvidenceError) as stale:
        evidence.verify_quote(repo, tree, {
            **recorded["quotes"][0],
            "content_hash": evidence.hash_bytes(b"os.system(cmd)"),
        })
    assert stale.value.code == "quote-hash-mismatch"

    # And a quote from inside a string literal cannot answer a check about
    # calls — including when the worker declares no ast_kind at all, since
    # the required kinds come from the check and not from the row.
    inside_a_string = b"os.system(cmd)"
    bait = {
        "schema_version": 1,
        "change_id": change_id,
        "check_id": "no-shell-out",
        "attempt": 2,
        "result": "fail",
        "severity": "major",
        "defect_class": "boundary-auth",
        "recorded_at": "2026-08-19T00:00:00Z",
        "quotes": [{
            "path": "widget.py",
            "span": span(inside_a_string),
            "content_hash": evidence.hash_bytes(inside_a_string),
        }],
    }
    with pytest.raises(evidence.EvidenceError) as not_a_call:
        evidence.record_worker_result(repo, slug, 1, tree, bait)
    assert not_a_call.value.code == "quote-contract-unsatisfied"

    with pytest.raises(evidence.EvidenceError) as declared_wrong:
        evidence.verify_quote(repo, tree, {
            **bait["quotes"][0], "ast_kind": "Call",
        })
    assert declared_wrong.value.code == "quote-ast-kind-mismatch"
    assert ledger.read_worker_results(repo, slug, 1, change_id) == [recorded]


def test_a_blocked_check_cannot_be_retried_into_a_pass(seeded):
    repo, set_dir, change_id, tree = seeded
    slug = set_dir.name
    base = {
        "schema_version": 1,
        "change_id": change_id,
        "check_id": "no-shell-out",
        "recorded_at": "2026-08-19T00:00:00Z",
    }
    searched = [{
        "query": "Call:os.system", "query_kind": "ast", "scope": ["*.py"],
        "tool_version": "whatever the worker says it used", "matches": 0,
    }]

    evidence.record_worker_result(repo, slug, 1, tree, {
        **base, "attempt": 1, "result": "blocked",
        "blocked_reason": "authorized-pulls-insufficient",
    })

    # What a blocked check climbs is the ladder, and the ladder ends at
    # human review rather than at a pass.
    assert evidence.next_absence_fallback() == "deterministic-test-or-analyzer"
    assert evidence.next_absence_fallback(
        evidence.UNPROVABLE_ABSENCE_LADDER) is None

    # Within the attempt the recorded result is not superseded at all,
    # whatever the second row says.
    with pytest.raises(ledger.LedgerError, match="append-only"):
        evidence.record_worker_result(repo, slug, 1, tree, {
            **base, "attempt": 1, "result": "fail", "severity": "minor",
            "defect_class": "maintainability-test",
        })

    # On a later attempt a pass is refused whatever it carries: a bigger
    # budget is not evidence about the code, so this check has no pass in
    # its future.
    for later in (
        {**base, "attempt": 2, "result": "pass"},
        {**base, "attempt": 2, "result": "pass",
         "absence_searches": searched},
    ):
        with pytest.raises(evidence.EvidenceError) as refusal:
            evidence.record_worker_result(repo, slug, 1, tree, later)
        assert refusal.value.code == "blocked-not-dischargeable"
    assert [row["result"] for row in ledger.read_worker_results(
        repo, slug, 1, change_id)] == ["blocked"]

    # The exit is the ladder, and rung two is a narrower check — which
    # has to be written down and bounded before it can be answered.
    narrower = {
        **json.loads((FIXTURE / "checks.json").read_text(encoding="utf-8"))[0],
        "check_id": "no-shell-out-in-render",
        "source": "ladder:narrower-positive-counterexample",
        "objective": "Does render() call os.system?",
        "scope": {"paths": ["widget.py"], "changed_only": True},
    }
    answer = {
        **base, "check_id": narrower["check_id"], "attempt": 2,
        "result": "pass",
        "absence_searches": [{**searched[0], "scope": ["widget.py"]}],
    }
    with pytest.raises(evidence.EvidenceError) as unregistered:
        evidence.record_worker_result(repo, slug, 1, tree, answer)
    assert unregistered.value.code == "check-not-registered"

    ledger.write_checks(
        repo, slug, 1, change_id,
        ledger.read_checks(repo, slug, 1, change_id) + [narrower],
    )
    evidence.record_worker_result(repo, slug, 1, tree, answer)
    assert [row["result"] for row in ledger.read_worker_results(
        repo, slug, 1, change_id)] == ["blocked", "pass"]

