"""Tests for the Set 057 dedicated-verification support module.

Covers the verificationMode record reader/writer, the sN-issues.json
seeder + latest-envelope reader, the content-aware close-time validator,
and the seven-state derivation ladder (every branch — the verdict's
residual-risk #2 demands full coverage).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# conftest puts ai_router/ on sys.path
import dedicated_verification as dv  # noqa: E402

D = dv.VERIFICATION_MODE_DEDICATED
OOB = dv.VERIFICATION_MODE_OUT_OF_BAND


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _set_dir(tmp_path: Path, *, sessions=None, status="in-progress") -> Path:
    d = tmp_path / "057-set"
    d.mkdir()
    state = {
        "schemaVersion": 4,
        "sessionSetName": d.name,
        "status": status,
        "sessions": sessions or [],
    }
    (d / "session-state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    (d / "activity-log.json").write_text(
        json.dumps({"entries": []}, indent=2), encoding="utf-8"
    )
    return d


def _s(num, status, typ=None, verdict=None, engine="claude-code"):
    e = {"number": num, "status": status, "orchestrator": {"engine": engine}}
    if typ:
        e["type"] = typ
    if verdict is not None:
        e["verificationVerdict"] = verdict
    return e


def _issues(*statuses):
    out = []
    for st in statuses:
        issue = {"description": "x"}
        if st:
            issue["resolution_status"] = st
        out.append(issue)
    return {"issues": out}


# --------------------------------------------------------------------------
# verificationMode record
# --------------------------------------------------------------------------


class TestVerificationMode:
    def test_default_when_no_record(self, tmp_path):
        d = _set_dir(tmp_path)
        assert dv.read_verification_mode(d) == OOB

    def test_default_when_no_activity_log(self, tmp_path):
        d = tmp_path / "no-log"
        d.mkdir()
        assert dv.read_verification_mode(d) == OOB

    def test_record_and_read_roundtrip(self, tmp_path):
        d = _set_dir(tmp_path)
        dv.record_verification_mode(d, D)
        assert dv.read_verification_mode(d) == D

    def test_most_recent_record_wins(self, tmp_path):
        d = _set_dir(tmp_path)
        dv.record_verification_mode(d, D)
        dv.record_verification_mode(d, OOB)
        assert dv.read_verification_mode(d) == OOB

    def test_record_rejects_unknown_mode(self, tmp_path):
        d = _set_dir(tmp_path)
        with pytest.raises(ValueError):
            dv.record_verification_mode(d, "bogus")

    def test_record_requires_activity_log(self, tmp_path):
        d = tmp_path / "no-log"
        d.mkdir()
        with pytest.raises(FileNotFoundError):
            dv.record_verification_mode(d, D)

    def test_entry_kind_distinct_from_suggestion_disposition(self, tmp_path):
        d = _set_dir(tmp_path)
        dv.record_verification_mode(d, D)
        log = json.loads((d / "activity-log.json").read_text(encoding="utf-8"))
        kinds = {e.get("kind") for e in log["entries"]}
        assert dv.VERIFICATION_MODE_ENTRY_KIND in kinds
        assert "suggestion_disposition" not in kinds


class TestVerificationModeCapture:
    """Set 057 Q5 capture wiring (CLI choice > spec.md seed > nothing)."""

    def _spec(self, d: Path, mode: str | None) -> None:
        body = "# Spec\n\n## Session Set Configuration\n\n```yaml\ntier: lightweight\n"
        if mode is not None:
            body += f"verificationMode: {mode}\n"
        body += "```\n"
        (d / "spec.md").write_text(body, encoding="utf-8")

    def test_cli_choice_records_on_first_start(self, tmp_path):
        d = _set_dir(tmp_path)
        out = dv.resolve_and_record_verification_mode(d, cli_choice=D)
        assert out == D
        assert dv.read_verification_mode(d) == D

    def test_immutable_after_first_record(self, tmp_path):
        # Q5: written once at set start. A later --verification-mode must NOT
        # flip the mode mid-set (which would silently disable the gate).
        d = _set_dir(tmp_path)
        dv.resolve_and_record_verification_mode(d, cli_choice=D)
        out = dv.resolve_and_record_verification_mode(d, cli_choice=OOB)
        assert out is None
        assert dv.read_verification_mode(d) == D

    def test_seed_records_when_no_prior_record(self, tmp_path):
        d = _set_dir(tmp_path)
        self._spec(d, "dedicated-sessions")
        out = dv.resolve_and_record_verification_mode(d, cli_choice=None)
        assert out == D
        assert dv.read_verification_mode(d) == D

    def test_seed_does_not_clobber_existing_choice(self, tmp_path):
        d = _set_dir(tmp_path)
        self._spec(d, "dedicated-sessions")
        dv.record_verification_mode(d, OOB)  # operator already chose
        out = dv.resolve_and_record_verification_mode(d, cli_choice=None)
        assert out is None
        assert dv.read_verification_mode(d) == OOB

    def test_nothing_recorded_when_no_source(self, tmp_path):
        d = _set_dir(tmp_path)
        self._spec(d, None)
        out = dv.resolve_and_record_verification_mode(d, cli_choice=None)
        assert out is None
        assert not dv.has_verification_mode_record(d)

    def test_creates_activity_log_when_missing(self, tmp_path):
        d = tmp_path / "no-log-capture"
        d.mkdir()
        out = dv.resolve_and_record_verification_mode(d, cli_choice=D)
        assert out == D
        assert (d / "activity-log.json").exists()
        assert dv.read_verification_mode(d) == D

    def test_cli_bad_choice_raises(self, tmp_path):
        d = _set_dir(tmp_path)
        with pytest.raises(ValueError):
            dv.resolve_and_record_verification_mode(d, cli_choice="bogus")

    def test_spec_reader_ignores_unknown_value(self, tmp_path):
        d = _set_dir(tmp_path)
        self._spec(d, "weird-mode")
        assert dv.read_spec_verification_mode(d) is None


# --------------------------------------------------------------------------
# seed + read sN-issues envelope
# --------------------------------------------------------------------------


class TestIssuesEnvelope:
    def test_seed_round1_writes_v2_envelope(self, tmp_path):
        d = _set_dir(tmp_path)
        path = dv.seed_issues_envelope(
            d,
            session_number=3,
            verification_round=1,
            verification_verdict="ISSUES_FOUND",
            issues=[{"description": "a finding", "issueType": "deterministic-defect"}],
        )
        assert Path(path).name == "s3-issues.json"
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        assert payload["schemaVersion"] == 2
        assert payload["sessionNumber"] == 3
        assert payload["issues"][0]["issueType"] == "deterministic-defect"

    def test_seed_round2_naming(self, tmp_path):
        d = _set_dir(tmp_path)
        path = dv.seed_issues_envelope(
            d,
            session_number=3,
            verification_round=2,
            verification_verdict="ISSUES_FOUND",
            issues=[{"description": "x"}],
        )
        assert Path(path).name == "s3-issues-round-2.json"

    def test_seed_rejects_empty_issues(self, tmp_path):
        d = _set_dir(tmp_path)
        with pytest.raises(ValueError):
            dv.seed_issues_envelope(
                d,
                session_number=1,
                verification_round=1,
                verification_verdict="ISSUES_FOUND",
                issues=[],
            )

    def test_seed_rejects_verified_verdict(self, tmp_path):
        # Presence-means-issues invariant: a clean verdict must not be
        # written into a findings file (S2 verifier Major #3).
        d = _set_dir(tmp_path)
        for bad in ("VERIFIED", "verified", "", "   "):
            with pytest.raises(ValueError):
                dv.seed_issues_envelope(
                    d,
                    session_number=1,
                    verification_round=1,
                    verification_verdict=bad,
                    issues=[{"description": "x"}],
                )

    def test_seed_refuses_overwrite(self, tmp_path):
        d = _set_dir(tmp_path)
        dv.seed_issues_envelope(
            d,
            session_number=1,
            verification_round=1,
            verification_verdict="ISSUES_FOUND",
            issues=[{"description": "x"}],
        )
        with pytest.raises(FileExistsError):
            dv.seed_issues_envelope(
                d,
                session_number=1,
                verification_round=1,
                verification_verdict="ISSUES_FOUND",
                issues=[{"description": "y"}],
            )

    def test_read_latest_picks_highest_session_round(self, tmp_path):
        d = _set_dir(tmp_path)
        dv.seed_issues_envelope(
            d, session_number=2, verification_round=1,
            verification_verdict="ISSUES_FOUND", issues=[{"description": "old"}],
        )
        dv.seed_issues_envelope(
            d, session_number=4, verification_round=1,
            verification_verdict="ISSUES_FOUND", issues=[{"description": "newer"}],
        )
        dv.seed_issues_envelope(
            d, session_number=4, verification_round=2,
            verification_verdict="ISSUES_FOUND", issues=[{"description": "newest"}],
        )
        latest = dv.read_latest_issues_envelope(d)
        assert latest["issues"][0]["description"] == "newest"

    def test_read_latest_none_when_no_files(self, tmp_path):
        d = _set_dir(tmp_path)
        assert dv.read_latest_issues_envelope(d) is None


# --------------------------------------------------------------------------
# close-time validator
# --------------------------------------------------------------------------


class TestValidator:
    def test_not_applicable_when_out_of_band(self, tmp_path):
        d = _set_dir(tmp_path, sessions=[_s(1, "complete")])
        res = dv.validate_dedicated_verification(d)
        assert res.applicable is False
        assert res.ok is True

    def test_ok_when_cross_provider_verification_present(self, tmp_path):
        d = _set_dir(
            tmp_path,
            sessions=[
                _s(1, "complete", engine="claude-code"),
                _s(2, "complete", typ="verification", engine="gpt-5-4"),
            ],
        )
        dv.record_verification_mode(d, D)
        res = dv.validate_dedicated_verification(d)
        assert res.applicable is True
        assert res.ok is True

    def test_fails_when_no_verification_session(self, tmp_path):
        d = _set_dir(tmp_path, sessions=[_s(1, "complete")])
        dv.record_verification_mode(d, D)
        res = dv.validate_dedicated_verification(d)
        assert res.applicable is True
        assert res.ok is False
        assert "no completed verification" in res.reason
        assert res.corrective

    def test_fails_when_same_engine(self, tmp_path):
        d = _set_dir(
            tmp_path,
            sessions=[
                _s(1, "complete", engine="claude-code"),
                _s(2, "complete", typ="verification", engine="claude-code"),
            ],
        )
        dv.record_verification_mode(d, D)
        res = dv.validate_dedicated_verification(d)
        assert res.ok is False

    def test_fails_when_verification_not_complete(self, tmp_path):
        d = _set_dir(
            tmp_path,
            sessions=[
                _s(1, "complete", engine="claude-code"),
                _s(2, "in-progress", typ="verification", engine="gpt-5-4"),
            ],
        )
        dv.record_verification_mode(d, D)
        res = dv.validate_dedicated_verification(d)
        assert res.ok is False

    def test_fails_when_no_work_engine_baseline(self, tmp_path):
        # No implementation-session engine recorded => cannot confirm
        # cross-provider => fail closed (S2 verifier Major #1).
        d = _set_dir(
            tmp_path,
            sessions=[
                {"number": 1, "status": "complete", "orchestrator": None},
                _s(2, "complete", typ="verification", engine="gpt-5-4"),
            ],
        )
        dv.record_verification_mode(d, D)
        res = dv.validate_dedicated_verification(d)
        assert res.applicable is True
        assert res.ok is False
        assert "no implementation-session engine" in res.reason


# --------------------------------------------------------------------------
# seven-state derivation — full ladder coverage
# --------------------------------------------------------------------------


class TestDeriveStateLadder:
    def test_out_of_band_non_terminal(self):
        assert (
            dv.derive_state(
                [_s(1, "in-progress")],
                verification_mode=OOB,
                set_status="in-progress",
                latest_issues=None,
            )
            == dv.STATE_WORK_IN_PROGRESS
        )

    def test_out_of_band_terminal(self):
        assert (
            dv.derive_state(
                [_s(1, "complete")],
                verification_mode=OOB,
                set_status="complete",
                latest_issues=None,
            )
            == dv.STATE_CLOSED_NO_VERIFICATION
        )

    def test_work_in_flight(self):
        assert (
            dv.derive_state(
                [_s(1, "in-progress")],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=None,
            )
            == dv.STATE_WORK_IN_PROGRESS
        )

    def test_verification_in_flight(self):
        assert (
            dv.derive_state(
                [_s(1, "complete"), _s(2, "in-progress", "verification")],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=None,
            )
            == dv.STATE_AWAITING_VERIFICATION
        )

    def test_remediation_in_flight(self):
        assert (
            dv.derive_state(
                [
                    _s(1, "complete"),
                    _s(2, "complete", "verification"),
                    _s(3, "in-progress", "remediation"),
                ],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=None,
            )
            == dv.STATE_AWAITING_REMEDIATION
        )

    def test_all_work_done_awaits_verification(self):
        assert (
            dv.derive_state(
                [_s(1, "complete"), _s(2, "complete")],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=None,
            )
            == dv.STATE_AWAITING_VERIFICATION
        )

    def test_incomplete_work_after_typed_is_work(self):
        assert (
            dv.derive_state(
                [
                    _s(1, "complete"),
                    _s(2, "not-started"),
                    _s(3, "complete", "verification", "VERIFIED"),
                ],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=None,
            )
            == dv.STATE_WORK_IN_PROGRESS
        )

    def test_verification_verified(self):
        assert (
            dv.derive_state(
                [_s(1, "complete"), _s(2, "complete", "verification", "VERIFIED")],
                verification_mode=D,
                set_status="complete",
                latest_issues=None,
            )
            == dv.STATE_CLOSED_VERIFIED
        )

    def test_verification_accepted_dispositions_await_human(self):
        # SS1 item 6 (disposition-authority interim): accepting risk / declaring
        # not-reproducible is a RELEASE decision needing operator authority. With
        # no gated authority record yet, these fail closed to a human instead of
        # self-closing. (Was CLOSED_VERIFIED before the interim — changed
        # deliberately per GPT SS1 review finding #1.)
        assert (
            dv.derive_state(
                [_s(1, "complete"), _s(2, "complete", "verification", "ISSUES_FOUND")],
                verification_mode=D,
                set_status="complete",
                latest_issues=_issues("accepted-risk", "not-reproducible"),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_verification_open_issues_awaits_remediation(self):
        assert (
            dv.derive_state(
                [_s(1, "complete"), _s(2, "complete", "verification", "ISSUES_FOUND")],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(None, None),
            )
            == dv.STATE_AWAITING_REMEDIATION
        )

    def test_verification_human_stop_awaits_human(self):
        assert (
            dv.derive_state(
                [_s(1, "complete"), _s(2, "complete", "verification", "ISSUES_FOUND")],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues("escalate-human"),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_verification_round_limit_awaits_human(self):
        assert (
            dv.derive_state(
                [
                    _s(1, "complete"),
                    _s(2, "complete", "verification"),
                    _s(3, "complete", "verification"),
                    _s(4, "complete", "verification", "ISSUES_FOUND"),
                ],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(None),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_remediation_fixed_reverifies(self):
        assert (
            dv.derive_state(
                [
                    _s(1, "complete"),
                    _s(2, "complete", "verification"),
                    _s(3, "complete", "remediation"),
                ],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues("fixed"),
            )
            == dv.STATE_AWAITING_VERIFICATION
        )

    def test_remediation_accepted_dispositions_await_human(self):
        # SS1 item 6: after remediation, all-accepted findings no longer
        # self-close (was CLOSED_DISPOSITIONED). Accepting risk/consequence is a
        # release decision needing operator authority, so it fails closed to a
        # human until a gated authority writer exists (SS-later). Changed
        # deliberately per GPT SS1 review finding #1.
        assert (
            dv.derive_state(
                [
                    _s(1, "complete"),
                    _s(2, "complete", "verification"),
                    _s(3, "complete", "remediation"),
                ],
                verification_mode=D,
                set_status="complete",
                latest_issues=_issues("accepted-risk", "accepted-consequence"),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_remediation_advisory_disagreement_awaits_human(self):
        # advisory-disagreement is a DISPUTE => awaiting-human, never a
        # silent close (S2 verifier Major #2).
        assert (
            dv.derive_state(
                [
                    _s(1, "complete"),
                    _s(2, "complete", "verification"),
                    _s(3, "complete", "remediation"),
                ],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues("accepted-risk", "advisory-disagreement"),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_verification_advisory_disagreement_awaits_human(self):
        assert (
            dv.derive_state(
                [_s(1, "complete"), _s(2, "complete", "verification", "ISSUES_FOUND")],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues("advisory-disagreement"),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_remediation_open_issue_awaits_human(self):
        assert (
            dv.derive_state(
                [
                    _s(1, "complete"),
                    _s(2, "complete", "verification"),
                    _s(3, "complete", "remediation"),
                ],
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(None),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_returns_a_known_state_value(self):
        # Guard: every ladder leaf returns a member of WORKFLOW_STATES.
        s = dv.derive_state(
            [_s(1, "complete")],
            verification_mode=D,
            set_status="in-progress",
            latest_issues=None,
        )
        assert s in dv.WORKFLOW_STATES


class TestDeriveWorkflowStateFromDisk:
    def test_reads_files_end_to_end(self, tmp_path):
        d = _set_dir(
            tmp_path,
            sessions=[
                _s(1, "complete", engine="claude-code"),
                _s(2, "complete", "verification", "ISSUES_FOUND", engine="gpt-5-4"),
            ],
        )
        dv.record_verification_mode(d, D)
        dv.seed_issues_envelope(
            d, session_number=2, verification_round=1,
            verification_verdict="ISSUES_FOUND", issues=[{"description": "open one"}],
        )
        assert dv.derive_workflow_state(d) == dv.STATE_AWAITING_REMEDIATION

    def test_out_of_band_default_terminal(self, tmp_path):
        d = _set_dir(tmp_path, sessions=[_s(1, "complete")], status="complete")
        # No verificationMode record => out-of-band default.
        assert dv.derive_workflow_state(d) == dv.STATE_CLOSED_NO_VERIFICATION

    def test_missing_state_file_degrades_to_work(self, tmp_path):
        d = tmp_path / "empty"
        d.mkdir()
        assert dv.derive_workflow_state(d) == dv.STATE_WORK_IN_PROGRESS
