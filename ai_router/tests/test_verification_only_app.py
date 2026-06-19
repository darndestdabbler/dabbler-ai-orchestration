"""Set 072 (S2) - tests for the verification-only application mode.

Hermetic: the dual-surface runner AND the diff dispatch are injected fakes, so
**no metered LLM call and no real git invocation** happen. What is exercised:

- per-cell telemetry stamps EVERY confound (orchestrator + push/pull provider/model,
  per-arm framing, surfaces, diff size/shape, brokers="none");
- the EXTERNAL ``target_repo`` is honored - the fake runner asserts it received the
  external path as ``sandbox_dir``;
- ``validate_matrix_report`` accepts what ``run_verification_matrix`` writes and
  rejects non-object / bad-schema / bad-cell envelopes (L-066-1 produce<->validate);
- ``build_remediation_report`` consolidates cells across the run (a defect both
  surfaces caught, keyed, appears ONCE with ``both`` provenance), severity-ranks,
  drops the experiment metadata, and round-trips its ``.json``;
- the CLI ``run`` writes BOTH a matrix report and the remediation ``{json,md}`` under
  a monkeypatched fake runner.
"""

from __future__ import annotations

import json
import types
from pathlib import Path

import pytest

import verification_only_app as voa
import dual_surface_verify as dsv


# ---------------------------------------------------------------------------
# Fakes: a DualSurfaceRun-like object + an injectable runner
# ---------------------------------------------------------------------------

def _fake_run(
    *,
    push_provider,
    pull_provider,
    push_model="m-push",
    pull_model="m-pull",
    push_issues=(),
    pull_findings=(),
    push_verdict="VERIFIED",
    pull_verdict="VERIFIED",
    pull_ok=True,
    committed_ref="HEAD~1..WORKTREE",
):
    """Build a minimal stand-in for a DualSurfaceRun (only the fields the app reads)."""
    attestation = {
        "mode": dsv.RUN_MODE_MATRIX,
        "pushProvider": push_provider,
        "pushModel": push_model,
        "pullProvider": pull_provider,
        "pullModel": pull_model,
        "pushFraming": {"strength": dsv.FRAMING_ADVERSARIAL, "template": "verification.md"},
        "pullFraming": {"strength": dsv.FRAMING_ADVERSARIAL, "template": "path-aware-critique.md"},
    }
    push = types.SimpleNamespace(issues=list(push_issues), verdict=push_verdict)
    pull = types.SimpleNamespace(
        findings=list(pull_findings), verdict=pull_verdict, ok=pull_ok
    )
    return types.SimpleNamespace(
        attestation=attestation, push=push, pull=pull, committed_ref=committed_ref
    )


def _runner(calls, **run_kwargs):
    """A run_dual_surface_fn fake that records each call and returns a fake run."""

    def fn(target, **kw):
        calls.append({"target": target, **kw})
        return _fake_run(
            push_provider=kw.get("push_provider"),
            pull_provider=kw.get("pull_provider"),
            push_model=kw.get("push_model") or "m-push",
            pull_model=kw.get("pull_model") or "m-pull",
            **run_kwargs,
        )

    return fn


def _diff(snippet="diff --git a/x b/x\n+line\n-line\n", *, is_error=False, elided=False):
    return lambda cfg: (snippet, is_error, elided)


@pytest.fixture
def target(tmp_path):
    d = tmp_path / "built-target"
    d.mkdir()
    return d


# ---------------------------------------------------------------------------
# pair_matrix_rows
# ---------------------------------------------------------------------------

def test_pair_matrix_rows_cross_product():
    rows = (
        voa.MatrixRow("push", "anthropic"),
        voa.MatrixRow("push", "openai"),
        voa.MatrixRow("pull", "google"),
    )
    cells = voa.pair_matrix_rows(rows)
    assert len(cells) == 2
    assert {(c.push_provider, c.pull_provider) for c in cells} == {
        ("anthropic", "google"), ("openai", "google")
    }


def test_pair_matrix_rows_requires_both_surfaces():
    with pytest.raises(voa.VerificationOnlyError):
        voa.pair_matrix_rows((voa.MatrixRow("push", "anthropic"),))


def test_parse_cell_specs_and_bad_specs():
    rows = voa.parse_cell_specs(["push:anthropic", "pull:google:gemini-2.5-pro"])
    assert rows[0] == voa.MatrixRow("push", "anthropic", None)
    assert rows[1] == voa.MatrixRow("pull", "google", "gemini-2.5-pro")
    with pytest.raises(voa.VerificationOnlyError):
        voa.parse_cell_specs(["bogus:anthropic"])
    with pytest.raises(voa.VerificationOnlyError):
        voa.parse_cell_specs(["push:"])


# ---------------------------------------------------------------------------
# Per-cell telemetry stamps every confound
# ---------------------------------------------------------------------------

def test_per_cell_telemetry_stamps_every_confound(target):
    calls = []
    report = voa.run_verification_matrix(
        target,
        base_ref="HEAD~1",
        matrix=[voa.MatrixCell("anthropic", "google", pull_model="gemini-2.5-pro")],
        orchestrator_provider="anthropic",
        orchestrator_model="claude-opus-4-8",
        generated_at="2026-06-19T00:00:00Z",
        diff_dispatch_fn=_diff(),
        run_dual_surface_fn=_runner(calls),
    )
    assert len(report.cells) == 1
    tel = report.cells[0].telemetry.to_dict()
    assert tel["orchestratorProvider"] == "anthropic"
    assert tel["orchestratorModel"] == "claude-opus-4-8"
    assert tel["pushProvider"] == "anthropic"
    assert tel["pullProvider"] == "google"
    assert tel["pullModel"] == "gemini-2.5-pro"
    assert tel["pushFraming"] == dsv.FRAMING_ADVERSARIAL
    assert tel["pullFraming"] == dsv.FRAMING_ADVERSARIAL
    assert tel["surfaces"] == ["push", "pull"]
    # diff size/shape: one file, two changed lines (+/-) in the fake snippet.
    assert tel["diffFiles"] == 1
    assert tel["diffBytes"] > 0
    assert tel["diffElided"] is False
    # Confounds held constant but stamped.
    assert tel["pushBroker"] == "none"
    assert tel["pullBroker"] == "none"


def test_external_sandbox_dir_is_honored(target):
    """The fake runner asserts it received the EXTERNAL target as sandbox_dir."""
    calls = []
    voa.run_verification_matrix(
        target,
        base_ref="HEAD~1",
        matrix=[voa.MatrixCell("anthropic", "google")],
        orchestrator_provider="anthropic",
        orchestrator_model="claude-opus-4-8",
        generated_at="t",
        diff_dispatch_fn=_diff(),
        run_dual_surface_fn=_runner(calls),
    )
    assert len(calls) == 1
    # sandbox_dir AND the positional session-set dir are the external target.
    assert Path(calls[0]["sandbox_dir"]) == target.resolve()
    assert Path(calls[0]["target"]) == target.resolve()
    # Each arm carries its own per-arm provider (matrix mode).
    assert calls[0]["push_provider"] == "anthropic"
    assert calls[0]["pull_provider"] == "google"


# ---------------------------------------------------------------------------
# validate_matrix_report: accepts well-formed, rejects malformed
# ---------------------------------------------------------------------------

def _good_report(target):
    calls = []
    return voa.run_verification_matrix(
        target,
        base_ref="HEAD~1",
        matrix=[voa.MatrixCell("anthropic", "google")],
        orchestrator_provider="anthropic",
        orchestrator_model="claude-opus-4-8",
        generated_at="2026-06-19T00:00:00Z",
        diff_dispatch_fn=_diff(),
        run_dual_surface_fn=_runner(calls),
    )


def test_validate_matrix_report_accepts_and_round_trips(target):
    report = _good_report(target)
    artifact = report.to_dict()
    res = voa.validate_matrix_report(artifact)
    assert res.ok, res.reasons
    # JSON round-trip (a real write/read cycle keeps it valid).
    res2 = voa.validate_matrix_report(json.loads(json.dumps(artifact)))
    assert res2.ok, res2.reasons
    # expected-target identity guard.
    assert voa.validate_matrix_report(artifact, expected_target=report.target).ok
    assert not voa.validate_matrix_report(artifact, expected_target="other").ok


def test_validate_matrix_report_rejects_non_object():
    assert voa.validate_matrix_report(["not", "an", "object"]).code == voa.REPORT_NOT_AN_OBJECT


def test_validate_matrix_report_rejects_bad_schema(target):
    artifact = _good_report(target).to_dict()
    artifact["schemaVersion"] = True  # bool must NOT pass an integer check (L-066-1)
    assert voa.validate_matrix_report(artifact).code == voa.REPORT_BAD_SCHEMA_VERSION
    artifact["schemaVersion"] = 99
    assert voa.validate_matrix_report(artifact).code == voa.REPORT_BAD_SCHEMA_VERSION


def test_validate_matrix_report_rejects_bad_cell(target):
    artifact = _good_report(target).to_dict()
    # Corrupt a telemetry confound: diffFiles as a bool, not an int.
    artifact["cells"][0]["telemetry"]["diffFiles"] = True
    res = voa.validate_matrix_report(artifact)
    assert res.ok is False
    assert any("diffFiles" in r for r in res.reasons)
    # Drop a required telemetry field entirely.
    artifact2 = _good_report(target).to_dict()
    del artifact2["cells"][0]["telemetry"]["pullFraming"]
    res2 = voa.validate_matrix_report(artifact2)
    assert res2.ok is False
    assert any("pullFraming" in r for r in res2.reasons)


def test_validate_matrix_report_rejects_unexpected_top_key(target):
    artifact = _good_report(target).to_dict()
    artifact["surprise"] = 1
    res = voa.validate_matrix_report(artifact)
    assert res.ok is False
    assert any("unexpected top-level" in r for r in res.reasons)


def test_validate_matrix_report_requires_exactly_both_surfaces(target):
    """A cell is definitionally dual-surface: a single-surface or duplicated
    surfaces telemetry row is incomparable data and must be rejected (gpt-5-4 S2 R1)."""
    artifact = _good_report(target).to_dict()
    artifact["cells"][0]["telemetry"]["surfaces"] = ["push"]
    res = voa.validate_matrix_report(artifact)
    assert res.ok is False and any("exactly" in r for r in res.reasons)
    artifact2 = _good_report(target).to_dict()
    artifact2["cells"][0]["telemetry"]["surfaces"] = ["push", "push"]
    res2 = voa.validate_matrix_report(artifact2)
    assert res2.ok is False and any("duplicate" in r for r in res2.reasons)


def test_validate_matrix_report_rejects_cell_confound_drift(target):
    """Each cell echoes the run-level confounds; per-cell drift is incoherent
    telemetry the validator must reject (gpt-5-4 S2 R1, the Set-070 precedent)."""
    artifact = _good_report(target).to_dict()
    artifact["cells"][0]["telemetry"]["diffFiles"] = (
        artifact["diffShape"]["files"] + 7
    )
    res = voa.validate_matrix_report(artifact)
    assert res.ok is False
    assert any("diffFiles does not match" in r for r in res.reasons)
    artifact2 = _good_report(target).to_dict()
    artifact2["cells"][0]["telemetry"]["orchestratorProvider"] = "someone-else"
    res2 = voa.validate_matrix_report(artifact2)
    assert res2.ok is False
    assert any("orchestratorProvider does not match" in r for r in res2.reasons)


def test_validate_matrix_report_rejects_cell_provenance_inconsistency(target):
    """A cell claiming provenanceComplete with unkeyed data is rejected - the cell
    validator is no looser than validate_comparison_artifact (gpt-5-4 S2 R1)."""
    artifact = _good_report(target).to_dict()
    cell = artifact["cells"][0]
    cell["provenanceComplete"] = True
    cell["pushUnkeyed"] = 2  # nonzero despite provenanceComplete
    res = voa.validate_matrix_report(artifact)
    assert res.ok is False
    assert any("provenanceComplete is true but" in r for r in res.reasons)


# ---------------------------------------------------------------------------
# build_remediation_report: consolidate across cells with provenance
# ---------------------------------------------------------------------------

def test_remediation_consolidates_both_provenance(target):
    """A keyed defect caught on push in one cell and pull in another -> ONE 'both'."""
    calls = []
    push_issue = {"description": "off-by-one in pager", "severity": "Major",
                  "category": "correctness", "defectKey": "D1"}
    pull_finding = {"description": "pager loop skips last row", "severity": "Critical",
                    "category": "correctness", "defectKey": "D1"}

    def runner(t, **kw):
        calls.append(kw)
        # The push arm of the FIRST cell carries D1; the pull arm of the SECOND.
        idx = len(calls) - 1
        return _fake_run(
            push_provider=kw.get("push_provider"),
            pull_provider=kw.get("pull_provider"),
            push_issues=[push_issue] if idx == 0 else [],
            pull_findings=[pull_finding] if idx == 1 else [],
        )

    report = voa.run_verification_matrix(
        target,
        base_ref="HEAD~1",
        matrix=[
            voa.MatrixCell("anthropic", "google"),
            voa.MatrixCell("openai", "google"),
        ],
        orchestrator_provider="anthropic",
        orchestrator_model="claude-opus-4-8",
        generated_at="2026-06-19T00:00:00Z",
        diff_dispatch_fn=_diff(),
        run_dual_surface_fn=runner,
    )
    remediation = voa.build_remediation_report(report)
    assert len(remediation["findings"]) == 1
    f = remediation["findings"][0]
    assert f["defectKey"] == "D1"
    assert f["provenance"] == dsv.PROVENANCE_BOTH
    assert set(f["surfaces"]) == {"push", "pull"}
    # Max severity across contributors (push Major + pull Critical -> Critical).
    assert f["severity"] == "Critical"
    assert remediation["provenanceComplete"] is True
    # Experiment metadata is dropped (no telemetry / diff / orchestrator).
    assert "telemetry" not in f and "diffShape" not in remediation
    # The artifact validates and round-trips.
    assert voa.validate_remediation_report(remediation).ok
    assert voa.validate_remediation_report(json.loads(json.dumps(remediation))).ok


def test_remediation_severity_ranked(target):
    calls = []
    minor = {"description": "nit", "severity": "Minor", "defectKey": "Dm"}
    critical = {"description": "boom", "severity": "Critical", "defectKey": "Dc"}

    def runner(t, **kw):
        calls.append(kw)
        return _fake_run(
            push_provider=kw.get("push_provider"),
            pull_provider=kw.get("pull_provider"),
            push_issues=[minor, critical],
        )

    report = voa.run_verification_matrix(
        target, base_ref="HEAD~1",
        matrix=[voa.MatrixCell("anthropic", "google")],
        orchestrator_provider="x", orchestrator_model="y",
        generated_at="t", diff_dispatch_fn=_diff(), run_dual_surface_fn=runner,
    )
    remediation = voa.build_remediation_report(report)
    sevs = [f["severity"] for f in remediation["findings"]]
    assert sevs == ["Critical", "Minor"]  # ranked, Critical first


def test_remediation_unkeyed_findings_stay_split(target):
    """Without defect keys a both-surfaces defect cannot merge - safe over-split."""
    calls = []

    def runner(t, **kw):
        calls.append(kw)
        return _fake_run(
            push_provider=kw.get("push_provider"),
            pull_provider=kw.get("pull_provider"),
            push_issues=[{"description": "same bug", "severity": "Major"}],
            pull_findings=[{"description": "same bug", "severity": "Major"}],
        )

    report = voa.run_verification_matrix(
        target, base_ref="HEAD~1",
        matrix=[voa.MatrixCell("anthropic", "google")],
        orchestrator_provider="x", orchestrator_model="y",
        generated_at="t", diff_dispatch_fn=_diff(), run_dual_surface_fn=runner,
    )
    remediation = voa.build_remediation_report(report)
    assert remediation["provenanceComplete"] is False
    assert len(remediation["findings"]) == 2  # not merged
    assert voa.validate_remediation_report(remediation).ok


def test_validate_remediation_rejects_bad_schema():
    assert voa.validate_remediation_report(42).code == voa.REPORT_NOT_AN_OBJECT
    bad = {"schemaVersion": 1, "kind": "wrong", "target": "t",
           "committedRef": "a..b", "generatedAt": "t",
           "provenanceComplete": True, "pushUnkeyed": 0, "pullUnkeyed": 0,
           "findings": []}
    assert voa.validate_remediation_report(bad).code == voa.REPORT_BAD_STRUCTURE


# ---------------------------------------------------------------------------
# A cell whose run raises is recorded, not silently dropped
# ---------------------------------------------------------------------------

def test_failed_cell_is_recorded_as_skipped(target):
    def runner(t, **kw):
        if kw.get("push_provider") == "openai":
            raise RuntimeError("provider exploded")
        return _fake_run(
            push_provider=kw.get("push_provider"), pull_provider=kw.get("pull_provider")
        )

    report = voa.run_verification_matrix(
        target, base_ref="HEAD~1",
        matrix=[
            voa.MatrixCell("anthropic", "google"),
            voa.MatrixCell("openai", "google"),
        ],
        orchestrator_provider="x", orchestrator_model="y",
        generated_at="t", diff_dispatch_fn=_diff(), run_dual_surface_fn=runner,
    )
    assert len(report.cells) == 1
    assert len(report.skipped) == 1
    assert report.skipped[0].push_provider == "openai"
    assert "provider exploded" in report.skipped[0].reason
    # The skipped array still validates as part of the envelope.
    assert voa.validate_matrix_report(report.to_dict()).ok


# ---------------------------------------------------------------------------
# CLI: writes BOTH the matrix report and the remediation {json,md}
# ---------------------------------------------------------------------------

def test_cli_run_writes_both_reports(target, tmp_path, monkeypatch, capsys):
    calls = []
    # The CLI's run_verification_matrix uses the module-global run_dual_surface +
    # _dispatch_get_diff; monkeypatch BOTH so no metered call / git happens.
    monkeypatch.setattr(voa, "run_dual_surface", _runner(calls), raising=True)
    monkeypatch.setattr(voa, "_dispatch_get_diff", _diff(), raising=True)
    out = tmp_path / "matrix.json"
    rc = voa.main([
        "run", "--target", str(target), "--base", "HEAD~1",
        "--cell", "push:anthropic", "--cell", "pull:google",
        "--orchestrator-provider", "anthropic",
        "--orchestrator-model", "claude-opus-4-8",
        "--out", str(out),
    ])
    assert rc == 0
    assert out.is_file()
    rem_json = tmp_path / voa.REMEDIATION_REPORT_JSON_FILENAME
    rem_md = tmp_path / voa.REMEDIATION_REPORT_MD_FILENAME
    assert rem_json.is_file()
    assert rem_md.is_file()
    # Both JSON artifacts validate.
    assert voa.validate_matrix_report(json.loads(out.read_text(encoding="utf-8"))).ok
    assert voa.validate_remediation_report(
        json.loads(rem_json.read_text(encoding="utf-8"))
    ).ok
    # The .md content is ASCII (cp1252-safe).
    rem_md.read_text(encoding="utf-8").encode("ascii")
    captured = capsys.readouterr()
    assert "[x]" in captured.out


def test_cli_bad_cell_returns_nonzero(target):
    rc = voa.main(["run", "--target", str(target), "--base", "HEAD~1",
                   "--cell", "push:anthropic"])  # no pull row -> bad matrix
    assert rc == 2
