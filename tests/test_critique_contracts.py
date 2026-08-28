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

    Yields ``(repo, sessions_dir, change_id, reviewed_tree)``. The tree is the
    one ``prepare`` snapshotted, which is the only tree any evidence in
    these tests is checked against.
    """
    import ai_router.config as config_module
    from ai_router.verify import EXIT_OK, run_prepare

    repo, sessions_dir = sandbox_repo
    register_session_start(
        sessions_dir, 1, engine="claude-code", provider="anthropic"
    )
    (repo / "widget.py").write_bytes((FIXTURE / "widget.py").read_bytes())
    monkeypatch.setattr(
        config_module, "load_config",
        lambda *a, **k: {"critique": {"pipeline": "shadow"}},
    )
    assert run_prepare(sessions_dir, claims_path=FIXTURE / "claims.json") == EXIT_OK

    run = ledger.read_review_runs(repo, 1)[0]
    ledger.write_checks(
        repo, 1, run["change_id"],
        json.loads((FIXTURE / "checks.json").read_text(encoding="utf-8")),
    )
    return repo, sessions_dir, run["change_id"], run["attempts"][-1][
        "completion_tree"
    ]


def test_evidence_is_re_derived_from_the_reviewed_tree(seeded):
    repo, sessions_dir, change_id, tree = seeded
    blob = evidence.read_tree_blob(repo, tree, "widget.py")

    def span(needle):
        start = blob.index(needle)
        return {"kind": "byte", "start": start, "end": start + len(needle)}

    mention = b"os.system(cmd)"
    recorded = evidence.record_worker_result(repo, 1, tree, {
        "schema_version": 1,
        "change_id": change_id,
        "check_id": "no-shell-out",
        "attempt": 1,
        "result": "fail",
        "severity": "major",
        "defect_class": "boundary-auth",
        "recorded_at": "2026-08-19T00:00:00Z",
        "quotes": [{
            "path": "widget.py",
            "span": span(mention),
            "content_hash": evidence.hash_bytes(mention),
        }],
        "absence_searches": [{
            "query": "os.system",
            "query_kind": "literal",
            "scope": ["*.py"],
            "tool_version": "whatever the worker says it used",
            "matches": 2,
        }],
    })

    # The recorded search is the framework's re-execution, named by the
    # tool that actually ran it. Two literal matches is what puts this
    # result on the check's own "mentions_it" branch, not "clean" — the
    # fixture stays honest about what the measured count actually means.
    search = recorded["absence_searches"][0]
    assert search["matches"] == 2
    assert search["tool_version"].startswith("python-re/")
    assert ledger.read_worker_results(repo, 1, change_id) == [recorded]
    assert ledger.read_checks(
        repo, 1, change_id)[0]["check_id"] == "no-shell-out"

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
            "content_hash": evidence.hash_bytes(b"os.system(other)"),
        })
    assert stale.value.code == "quote-hash-mismatch"


def test_a_quote_is_verified_from_any_file_the_tree_contains(sandbox_repo):
    """Provenance is the digest, the span and the byte-exact hash — never
    the file's extension. A quote from a non-Python file is checked exactly
    as rigorously as one from a ``.py`` file, where before it was refused
    outright with ``quote-ast-unsupported``."""
    repo, _ = sandbox_repo
    source = b"export function render(rows: Row[]): string {\n  return rows.join('\\n');\n}\n"
    (repo / "widget.ts").write_bytes(source)
    tree = evidence.snapshot_worktree_tree(repo)

    needle = b"rows.join('\\n')"
    start = source.index(needle)
    record = evidence.verify_quote(repo, tree, {
        "path": "widget.ts",
        "span": {"kind": "byte", "start": start, "end": start + len(needle)},
        "content_hash": evidence.hash_bytes(needle),
    })
    assert record == {
        "path": "widget.ts",
        "content_hash": evidence.hash_bytes(needle),
        "span": {"kind": "byte", "start": start, "end": start + len(needle)},
    }


def test_a_blocked_check_cannot_be_retried_into_a_pass(seeded):
    repo, sessions_dir, change_id, tree = seeded
    base = {
        "schema_version": 1,
        "change_id": change_id,
        "check_id": "no-shell-out",
        "recorded_at": "2026-08-19T00:00:00Z",
    }
    searched = [{
        "query": "os.system", "query_kind": "literal", "scope": ["*.py"],
        "tool_version": "whatever the worker says it used", "matches": 2,
    }]

    evidence.record_worker_result(repo, 1, tree, {
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
        evidence.record_worker_result(repo, 1, tree, {
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
            evidence.record_worker_result(repo, 1, tree, later)
        assert refusal.value.code == "blocked-not-dischargeable"
    assert [row["result"] for row in ledger.read_worker_results(
        repo, 1, change_id)] == ["blocked"]

    # The exit is the ladder, and rung two is a narrower check — which
    # has to be written down and bounded before it can be answered. Its
    # own vocabulary must match what it actually queries: a literal that
    # is genuinely absent from the file, so "pass" and "clean" agree.
    narrower = {
        **json.loads((FIXTURE / "checks.json").read_text(encoding="utf-8"))[0],
        "check_id": "no-shell-out-in-render",
        "source": "ladder:narrower-positive-counterexample",
        "objective": "Does render() call subprocess.run?",
        "condition": {"not": {"exists": "subprocess.run("}},
        "branch": {
            "mentions_it": {
                "when": {"exists": "subprocess.run("}, "outcome": "fail",
            },
            "clean": {
                "when": {
                    "count": {
                        "of": "subprocess.run(", "operator": "eq", "value": 0,
                    },
                },
                "outcome": "pass",
            },
        },
        "scope": {"paths": ["widget.py"], "changed_only": True},
    }
    answer = {
        **base, "check_id": narrower["check_id"], "attempt": 2,
        "result": "pass",
        "absence_searches": [{
            "query": "subprocess.run(", "query_kind": "literal",
            "scope": ["widget.py"],
            "tool_version": "whatever the worker says it used",
            "matches": 0,
        }],
    }
    with pytest.raises(evidence.EvidenceError) as unregistered:
        evidence.record_worker_result(repo, 1, tree, answer)
    assert unregistered.value.code == "check-not-registered"

    ledger.write_checks(
        repo, 1, change_id,
        ledger.read_checks(repo, 1, change_id) + [narrower],
    )
    evidence.record_worker_result(repo, 1, tree, answer)
    assert [row["result"] for row in ledger.read_worker_results(
        repo, 1, change_id)] == ["blocked", "pass"]

