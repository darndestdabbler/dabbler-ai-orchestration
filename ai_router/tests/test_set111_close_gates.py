"""Tests for the Set 111 S4 close gates.

* :func:`gate_checks.check_uat_walk_recorded` — inert without
  ``requiresUAT``, and scope-aware: which sessions owe an accounting, and
  the arming behaviour of an omitted / bogus ``uatScope``. **Set 113 S1
  replaced the binary record these tests used to assert**, so the
  record-shape and inventory-coverage cases live in
  ``test_set113_uat_accounting.py``; what stays here is the policy layer
  Set 111 shipped, re-expressed against the new record.
* :func:`gate_checks.check_test_run_fresh` — inert when no expensive
  surface was touched, refuses the Set 110 S3 stale-run pattern.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Optional

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
{scope_line}{components_line}```
"""


def _spec_text(
    uat: str,
    scope: Optional[str],
    components: Optional[list] = None,
) -> str:
    """Render the config block.

    ``scope=None`` OMITS ``uatScope`` entirely; ``components=None`` omits
    ``uatComponents`` entirely, which Set 113 S1 made a refusal in its own
    right. The default here is a one-component inventory so the policy
    tests below exercise the policy and not the inventory.
    """
    scope_line = "" if scope is None else f"uatScope: {scope}\n"
    if components is None:
        components_line = ""
    elif not components:
        components_line = "uatComponents: []\n"
    else:
        items = "".join(f"  - {c}\n" for c in components)
        components_line = f"uatComponents:\n{items}"
    return SPEC_UAT.format(
        uat=uat, scope_line=scope_line, components_line=components_line
    )


_DEFAULT_COMPONENTS = ["Work Explorer"]


def _make_set(
    root: Path,
    *,
    uat: str = "true",
    scope: Optional[str] = "per-set",
    current: int = 2,
    total: int = 2,
    components: Optional[list] = _DEFAULT_COMPONENTS,
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
        _spec_text(uat, scope, components), encoding="utf-8"
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


def _accounting(
    component: str = "Work Explorer",
    method: str = "none",
    attestation: str = "no reviewer was available this session",
) -> dict:
    """A minimal PASSING accounting for the default one-item inventory.

    Method ``none`` on purpose: the passing-none path is the one the
    operator's ruling turns on, so the helper every other test leans on
    should be the one most likely to regress unnoticed.
    """
    return {
        "attestation": "operator reviewed the accounting 2026-08-15",
        "components": [
            {
                "component": component,
                "method": method,
                "attestation": attestation,
            }
        ],
    }


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

    def test_an_explicit_scope_of_none_no_longer_disarms(self, tmp_path):
        """Scope says WHICH sessions owe a walk, never WHETHER any does.

        `uatScope: none` alongside `requiresUAT: true` is a contradiction
        the authoring guide already calls invalid ("use requiresUAT: false
        instead"). Honouring it as a disarm let the contradiction win
        silently, which is the evaporation this gate exists to prevent.
        """
        set_dir = _make_set(tmp_path / "r", scope="none")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert not passed
        assert "disposition.uat is absent" in remediation

    def test_an_omitted_scope_still_arms_the_gate(self, tmp_path):
        """The likeliest hand-authored shape: `requiresUAT: true`, no scope.

        It used to parse to scope `none` and turn the gate off entirely —
        so the one spec most likely to be written by hand was the one that
        could close with no walk and no complaint.
        """
        set_dir = _make_set(tmp_path / "r", scope=None)
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp()
        )
        assert not passed
        assert "disposition.uat is absent" in remediation

    def test_an_unrecognised_scope_arms_rather_than_disarms(self, tmp_path):
        """A typo must fail loud, not quietly switch the gate off."""
        set_dir = _make_set(tmp_path / "r", scope="per-sett")
        passed, _ = gate_checks.check_uat_walk_recorded(str(set_dir), _disp())
        assert not passed

    def test_an_omitted_scope_still_lets_a_recorded_accounting_pass(
        self, tmp_path
    ):
        """Arming by default must not make the gate unsatisfiable."""
        set_dir = _make_set(tmp_path / "r", scope=None)
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp(uat=_accounting())
        )
        assert passed, remediation

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

    def test_an_accounting_covering_the_inventory_passes(self, tmp_path):
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp(uat=_accounting())
        )
        assert passed, remediation

    def test_an_accounting_without_an_attestation_fails(self, tmp_path):
        """An unattested accounting is exactly the silent evaporation this
        gate exists to prevent."""
        set_dir = _make_set(tmp_path / "r")
        record = _accounting()
        record["attestation"] = "  "
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir), _disp(uat=record)
        )
        assert not passed
        assert "attestation" in remediation

    def test_the_retired_binary_no_longer_satisfies_the_gate(self, tmp_path):
        """Set 111 S4's `status: waived` + attestation used to pass here.

        It must not still pass, or the replacement would be optional and
        every set could keep closing on the binary the operator retired.
        """
        set_dir = _make_set(tmp_path / "r")
        passed, remediation = gate_checks.check_uat_walk_recorded(
            str(set_dir),
            _disp(
                uat={
                    "status": "waived",
                    "attestation": "operator declined: no UI surface",
                }
            ),
        )
        assert not passed
        assert "components" in remediation

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
            str(set_dir), suite, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
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
