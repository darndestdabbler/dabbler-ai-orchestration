"""Tests for the Set 111 S4 close gates.

* :func:`gate_checks.check_uat_walk_recorded` — inert without
  ``requiresUAT``, scope-aware, refuses a missing block, accepts a walk
  with an existing artifact, accepts an attested waiver, refuses a walk
  whose artifact does not exist.
* :func:`gate_checks.check_test_run_fresh` — inert when no expensive
  surface was touched, refuses the Set 110 S3 stale-run pattern.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

import gate_checks
from disposition import Disposition
from session_state import register_session_start


def _git(root: Path, *args: str) -> None:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr}")


SPEC_UAT = """# Spec

## Session Set Configuration

```yaml
tier: full
requiresUAT: {uat}
requiresE2E: false
uatScope: {scope}
```
"""


def _make_set(
    root: Path,
    *,
    uat: str = "true",
    scope: str = "per-set",
    current: int = 2,
    total: int = 2,
) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "t@example.invalid")
    _git(root, "config", "user.name", "T")
    (root / "README.md").write_text("x\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "base")

    set_dir = root / "docs" / "session-sets" / "111-fixture"
    set_dir.mkdir(parents=True, exist_ok=True)
    (set_dir / "spec.md").write_text(
        SPEC_UAT.format(uat=uat, scope=scope), encoding="utf-8"
    )
    register_session_start(
        session_set=str(set_dir),
        session_number=current,
        total_sessions=total,
        orchestrator_engine="copilot",
        orchestrator_model="claude-opus-5",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({"entries": []}), encoding="utf-8"
    )
    return set_dir


def _disp(uat=None, files_changed=None) -> Disposition:
    return Disposition(
        status="completed",
        summary="s",
        verification_method="api",
        files_changed=list(files_changed or []),
        uat=uat,
    )


class TestUatWalkGate:
    def test_inert_when_requires_uat_is_false(self, tmp_path):
        set_dir = _make_set(tmp_path / "r", uat="false")
        passed, _ = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert passed

    def test_inert_when_uat_is_only_suggested(self, tmp_path):
        """`suggested` is advisory (Set 048 S2); arming it would be a
        policy change this gate was not asked to make."""
        set_dir = _make_set(tmp_path / "r", uat="suggested")
        passed, _ = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert passed

    def test_inert_when_scope_is_none(self, tmp_path):
        set_dir = _make_set(tmp_path / "r", scope="none")
        passed, _ = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert passed

    def test_per_set_scope_skips_a_non_final_session(self, tmp_path):
        set_dir = _make_set(tmp_path / "r", current=1, total=3)
        passed, _ = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert passed

    def test_per_set_scope_requires_the_final_session(self, tmp_path):
        set_dir = _make_set(tmp_path / "r", current=2, total=2)
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert not passed
        assert "disposition.uat is absent" in remediation

    def test_per_session_scope_requires_every_session(self, tmp_path):
        set_dir = _make_set(
            tmp_path / "r", scope="per-session", current=1, total=3
        )
        passed, _ = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert not passed

    def test_a_walk_with_an_existing_artifact_passes(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        (set_dir / "s2-uat-walk.md").write_text("# walk\n", encoding="utf-8")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat={
                    "status": "walked",
                    "walkArtifact": "s2-uat-walk.md",
                    "attestation": "operator walked it 2026-08-07",
                }
            ),
        )
        assert passed, remediation

    def test_a_walk_naming_a_missing_artifact_fails(self, tmp_path):
        """A recorded walk must point at the walk actually presented."""
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat={
                    "status": "walked",
                    "walkArtifact": "s2-uat-walk.md",
                    "attestation": "operator walked it",
                }
            ),
        )
        assert not passed
        assert "does not exist" in remediation

    def test_an_attested_waiver_passes(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat={
                    "status": "waived",
                    "attestation": "operator declined: no UI surface shipped",
                }
            ),
        )
        assert passed, remediation

    def test_a_waiver_without_an_attestation_fails(self, tmp_path):
        """An unattested waiver is exactly the silent evaporation this
        gate exists to prevent."""
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp(uat={"status": "waived", "attestation": "  "})
        )
        assert not passed
        assert "attestation" in remediation

    def test_an_unknown_status_fails(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(uat={"status": "sort-of", "attestation": "hmm"}),
        )
        assert not passed
        assert "'walked' or 'waived'" in remediation

    def test_an_empty_uat_block_is_treated_as_absent(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        passed, _ = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp(uat={})
        )
        assert not passed


class TestTestRunFreshGate:
    def test_inert_when_no_expensive_surface_was_touched(self, tmp_path):
        set_dir = _make_set(tmp_path / "r", uat="false")
        passed, remediation = gate_checks.check_test_run_fresh(
            str(set_dir), _disp(files_changed=["docs/notes.md"])
        )
        assert passed, remediation

    def test_missing_disposition_does_not_double_report(self, tmp_path):
        set_dir = _make_set(tmp_path / "r", uat="false")
        passed, _ = gate_checks.check_test_run_fresh(str(set_dir), None)
        assert passed

    def test_a_touched_expensive_surface_without_a_record_fails(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_set(tmp_path / "r", uat="false")
        from ai_router import run_of_record as ror

        suite = ror.SuiteSpec(
            name="playwright",
            command="npm run test:playwright",
            covers=("src/",),
            expensive=True,
        )
        monkeypatch.setattr(ror, "DEFAULT_SUITES", (suite,))
        monkeypatch.setattr(
            gate_checks, "_router_config_or_none", lambda: None
        )
        passed, remediation = gate_checks.check_test_run_fresh(
            str(set_dir), _disp(files_changed=["src/extension.ts"])
        )
        assert not passed
        assert "no run of record" in remediation

    def test_a_stale_record_fails(self, tmp_path, monkeypatch):
        """The Set 110 S3 pattern, end to end through the gate."""
        root = tmp_path / "r"
        set_dir = _make_set(root, uat="false")
        src = root / "src"
        src.mkdir()
        (src / "a.ts").write_text("1\n", encoding="utf-8")

        from ai_router import run_of_record as ror

        suite = ror.SuiteSpec(
            name="playwright",
            command="npm run test:playwright",
            covers=("src/",),
            expensive=True,
        )
        monkeypatch.setattr(ror, "DEFAULT_SUITES", (suite,))
        monkeypatch.setattr(
            gate_checks, "_router_config_or_none", lambda: None
        )
        ror.record_run(
            str(set_dir), suite, ror.OUTCOME_PASSED, repo_root=str(root)
        )
        assert gate_checks.check_test_run_fresh(
            str(set_dir), _disp(files_changed=["src/a.ts"])
        )[0]

        (src / "a.ts").write_text("2\n", encoding="utf-8")
        passed, remediation = gate_checks.check_test_run_fresh(
            str(set_dir), _disp(files_changed=["src/a.ts"])
        )
        assert not passed
        assert "PREDATES" in remediation
