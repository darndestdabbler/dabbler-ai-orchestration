import json

import pytest
import yaml

from ai_router.approved_plan import (
    REASON_NEW_DEPENDENCY,
    PlanImmutableError,
    PlanIntegrityError,
    append_amendment,
    approve_plan,
    compare_to_envelope,
    compute_plan_hash,
    derive_risk_flags,
    effective_plan,
    new_plan,
    read_plan,
    write_plan,
)


def _step(step_id="register", **overrides):
    step = {
        "step_id": step_id,
        "intent": "Register the session.",
        "file_envelope": ["ai_router/session.py"],
        "evidence_contract": [
            {"description": "affected tests pass", "kind": "deterministic"}
        ],
        "risk_flags": [],
    }
    step.update(overrides)
    return step


def _plan(steps=None, **overrides):
    plan = new_plan("144-the-approved-plan", 1, "the-artifact", steps or [_step()])
    plan.update(overrides)
    return plan


class TestWriteAndRead:
    def test_roundtrip(self, tmp_path):
        write_plan(tmp_path, _plan())
        read_back = read_plan(tmp_path)
        assert read_back["session_slug"] == "the-artifact"
        assert read_back["approved"] is False

    def test_hand_written_plan_refused_without_ledger(self, tmp_path):
        # Schema-valid, never through write_plan -- no sanctioned-write
        # record exists, so it must fail closed like any other
        # machine-owned artifact.
        (tmp_path / "approved-plan.json").write_text(
            json.dumps(_plan()), encoding="utf-8"
        )
        with pytest.raises(PlanIntegrityError):
            read_plan(tmp_path)

    def test_hand_written_plan_cannot_be_approved(self, tmp_path):
        (tmp_path / "approved-plan.json").write_text(
            json.dumps(_plan()), encoding="utf-8"
        )
        with pytest.raises(PlanIntegrityError):
            approve_plan(tmp_path)

    def test_refuses_empty_evidence_contract(self, tmp_path):
        plan = _plan(steps=[_step(evidence_contract=[])])
        with pytest.raises(ValueError, match="evidence_contract"):
            write_plan(tmp_path, plan)

    def test_refuses_more_than_seven_steps(self, tmp_path):
        steps = [_step(step_id=f"step-{i}") for i in range(8)]
        with pytest.raises(ValueError):
            write_plan(tmp_path, _plan(steps=steps))

    def test_refuses_duplicate_step_id(self, tmp_path):
        steps = [_step(step_id="dup"), _step(step_id="dup")]
        with pytest.raises(ValueError, match="duplicate step_id"):
            write_plan(tmp_path, _plan(steps=steps))

    def test_rewrite_before_approval_is_allowed(self, tmp_path):
        write_plan(tmp_path, _plan())
        write_plan(tmp_path, _plan(steps=[_step(step_id="revised")]))
        assert read_plan(tmp_path)["steps"][0]["step_id"] == "revised"


class TestApproveAndImmutability:
    def test_approve_binds_hash(self, tmp_path):
        write_plan(tmp_path, _plan())
        approved = approve_plan(tmp_path)
        assert approved["approved"] is True
        assert approved["plan_hash"] == compute_plan_hash(approved)

    def test_reapproval_refused(self, tmp_path):
        write_plan(tmp_path, _plan())
        approve_plan(tmp_path)
        with pytest.raises(PlanImmutableError):
            approve_plan(tmp_path)

    def test_write_plan_refused_after_approval(self, tmp_path):
        write_plan(tmp_path, _plan())
        approve_plan(tmp_path)
        with pytest.raises(PlanImmutableError):
            write_plan(tmp_path, _plan(steps=[_step(step_id="sneaky")]))

    def test_hand_edit_of_core_field_detected_on_read(self, tmp_path):
        write_plan(tmp_path, _plan())
        approve_plan(tmp_path)
        path = tmp_path / "approved-plan.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw["steps"][0]["intent"] = "A different intent entirely."
        path.write_text(json.dumps(raw), encoding="utf-8")
        with pytest.raises(PlanIntegrityError):
            read_plan(tmp_path)


class TestAmendments:
    def test_append_amendment_preserves_hash(self, tmp_path):
        write_plan(tmp_path, _plan())
        approved = approve_plan(tmp_path)
        amended = append_amendment(
            tmp_path, step_id="register", reason="new file needed"
        )
        assert amended["plan_hash"] == approved["plan_hash"]
        assert len(amended["amendments"]) == 1
        # Reads clean -- the append never disturbed the bound hash.
        assert read_plan(tmp_path)["amendments"][0]["step_id"] == "register"

    def test_append_amendment_refused_before_approval(self, tmp_path):
        write_plan(tmp_path, _plan())
        with pytest.raises(PlanImmutableError):
            append_amendment(tmp_path, step_id="register", reason="too soon")

    def test_append_amendment_refused_for_unknown_step(self, tmp_path):
        write_plan(tmp_path, _plan())
        approve_plan(tmp_path)
        with pytest.raises(ValueError, match="not declared"):
            append_amendment(tmp_path, step_id="ghost", reason="?")

    def test_edited_amendment_detected_on_read(self, tmp_path):
        write_plan(tmp_path, _plan())
        approve_plan(tmp_path)
        append_amendment(tmp_path, step_id="register", reason="original")
        path = tmp_path / "approved-plan.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw["amendments"][0]["reason"] = "rewritten out of band"
        path.write_text(json.dumps(raw), encoding="utf-8")
        with pytest.raises(PlanIntegrityError):
            read_plan(tmp_path)

    def test_deleted_amendment_detected_on_read(self, tmp_path):
        write_plan(tmp_path, _plan())
        approve_plan(tmp_path)
        append_amendment(tmp_path, step_id="register", reason="original")
        path = tmp_path / "approved-plan.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw["amendments"] = []
        path.write_text(json.dumps(raw), encoding="utf-8")
        with pytest.raises(PlanIntegrityError):
            read_plan(tmp_path)

    def test_effective_plan_folds_the_amendment_and_rederives_risk(
        self, tmp_path
    ):
        # The amendment carries the change; the core stays exactly as it
        # was approved, and the widened envelope earns the flag its new
        # path deserves rather than keeping the one it was approved with.
        write_plan(tmp_path, _plan())
        approved = approve_plan(tmp_path)
        assert approved["steps"][0]["risk_flags"] == ["public-interface"]

        amended = append_amendment(
            tmp_path, step_id="register", reason="the config decides this",
            added_files=["router-config.yaml"],
            evidence_contract=[
                {"description": "the config round-trips", "kind": "judgment"}
            ],
        )
        assert amended["steps"][0]["file_envelope"] == ["ai_router/session.py"]

        folded = effective_plan(amended)
        step = folded["steps"][0]
        assert step["file_envelope"] == [
            "ai_router/session.py", "router-config.yaml"
        ]
        assert step["evidence_contract"] == [
            {"description": "the config round-trips", "kind": "judgment"}
        ]
        assert step["risk_flags"] == ["public-interface", "sensitive-path"]
        assert amended["amendments"][0]["changed_fields"] == [
            "file_envelope", "evidence_contract"
        ]


class TestEnvelopeComparison:
    def _approved(self, run_dir, envelope):
        write_plan(run_dir, _plan(steps=[_step(file_envelope=envelope)]))
        return approve_plan(run_dir)

    def test_change_outside_the_envelope_needs_an_amendment(
        self, sandbox_repo
    ):
        repo, set_dir = sandbox_repo
        plan = self._approved(repo / ".dabbler" / "s1", ["ai_router/"])
        (repo / "ai_router").mkdir()
        (repo / "ai_router" / "session.py").write_text("x", encoding="utf-8")
        (repo / "pyproject.toml").write_text("[project]", encoding="utf-8")

        result = compare_to_envelope(repo, plan, set_dir)
        assert result.inside == ("ai_router/session.py",)
        assert [(p.path, p.reason) for p in result.outside] == [
            ("pyproject.toml", REASON_NEW_DEPENDENCY)
        ]
        assert result.needs_amendment is True

    def test_lifecycle_written_files_are_never_outside_the_plan(
        self, sandbox_repo
    ):
        # Close-out writes the change log and the router writes the state
        # and the activity log. No step envelope can declare them -- the
        # steps that write them never enter a plan -- so counting them
        # would refuse every session for obeying the lifecycle.
        repo, set_dir = sandbox_repo
        plan = self._approved(repo / ".dabbler" / "s1", ["ai_router/"])
        for name in ("session-state.json", "activity-log.json",
                     "change-log.md"):
            (set_dir / name).write_text("{}", encoding="utf-8")

        result = compare_to_envelope(repo, plan, set_dir)
        assert result.outside == ()
        assert result.needs_amendment is False


class TestRiskFlags:
    def test_public_interface_dependency_and_sensitive(self):
        flags = derive_risk_flags([
            "ai_router/approved_plan.py",
            "pyproject.toml",
            ".dabbler/runs/foo/s1/rounds.jsonl",
        ])
        assert flags == [
            "public-interface", "sensitive-path", "dependency-change",
        ]

    def test_no_flags_for_ordinary_nested_path(self):
        assert derive_risk_flags(["tests/test_approved_plan.py"]) == []

    def test_integration_module_from_manifest(self, tmp_path):
        (tmp_path / "docs").mkdir()
        (tmp_path / "docs" / "modules.yaml").write_text(
            yaml.safe_dump({"modules": [{
                "slug": "verify",
                "title": "Verify",
                "codeRoots": ["ai_router/verify.py"],
                "touches": ["session", "evidence"],
            }]}),
            encoding="utf-8",
        )
        flags = derive_risk_flags(
            ["ai_router/verify.py"], workspace_root=tmp_path
        )
        assert "integration-module" in flags

    def test_write_plan_overrides_caller_declared_risk_flags(self, tmp_path):
        # A step's own author declares no risk at all; the writer must
        # not take that word for it.
        step = _step(
            file_envelope=["ai_router/session.py"], risk_flags=[]
        )
        written = write_plan(tmp_path, _plan(steps=[step]))
        assert written["steps"][0]["risk_flags"] == ["public-interface"]
        assert read_plan(tmp_path)["steps"][0]["risk_flags"] == (
            ["public-interface"]
        )

    def test_no_integration_flag_without_manifest(self, tmp_path):
        flags = derive_risk_flags(
            ["ai_router/verify.py"], workspace_root=tmp_path
        )
        assert "integration-module" not in flags
