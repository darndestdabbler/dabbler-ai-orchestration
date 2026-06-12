"""Tests for the Set 062 D4 blessed transition writer.

Covers every fail-loud gate of ``change_verification_mode``, the
read-path precedence (a ``verification_mode_change`` record supersedes
the Set 057 capture), the S3-audit F3 capture-idempotency fix (the
once-at-set-start capture must no-op once a change record exists), the
downstream consumers (Q6 validator applicability, seven-state
derivation), and the CLI wrapper's exit codes / ``--json`` envelope.
"""

from __future__ import annotations

import json
from pathlib import Path

# conftest puts ai_router/ on sys.path
import change_verification_mode as cvm_cli  # noqa: E402
import dedicated_verification as dv  # noqa: E402

D = dv.VERIFICATION_MODE_DEDICATED
OOB = dv.VERIFICATION_MODE_OUT_OF_BAND


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _spec_text(tier: str = "lightweight", mode: str | None = None) -> str:
    body = (
        "# Spec\n\n## Session Set Configuration\n\n```yaml\n"
        f"tier: {tier}\n"
    )
    if mode is not None:
        body += f"verificationMode: {mode}\n"
    body += "```\n"
    return body


def _s(num, status, typ=None, engine="claude-code"):
    e = {
        "number": num,
        "title": f"Session {num}",
        "status": status,
        "startedAt": None,
        "completedAt": None,
        "orchestrator": {"engine": engine} if status != "not-started" else None,
        "verificationVerdict": None,
    }
    if typ:
        e["type"] = typ
    return e


def _set_dir(
    tmp_path: Path,
    *,
    tier: str = "lightweight",
    spec_mode: str | None = None,
    sessions=None,
    status: str = "complete",
    with_spec: bool = True,
    with_state: bool = True,
    with_log: bool = True,
) -> Path:
    d = tmp_path / "062-fixture-set"
    d.mkdir()
    if with_spec:
        (d / "spec.md").write_text(
            _spec_text(tier, spec_mode), encoding="utf-8"
        )
    if with_state:
        if sessions is None:
            sessions = [_s(1, "complete"), _s(2, "complete")]
        state = {
            "schemaVersion": 4,
            "sessionSetName": d.name,
            "status": status,
            "sessions": sessions,
        }
        (d / "session-state.json").write_text(
            json.dumps(state, indent=2), encoding="utf-8"
        )
    if with_log:
        (d / "activity-log.json").write_text(
            json.dumps({"entries": []}, indent=2), encoding="utf-8"
        )
    return d


def _log_entries(d: Path) -> list:
    return json.loads((d / "activity-log.json").read_text(encoding="utf-8"))[
        "entries"
    ]


# --------------------------------------------------------------------------
# success path
# --------------------------------------------------------------------------


class TestChangeSuccess:
    def test_completed_mode_a_set_transitions(self, tmp_path):
        d = _set_dir(tmp_path)
        res = dv.change_verification_mode(d)
        assert res.ok is True
        assert res.code == "changed"
        assert res.record is not None
        assert dv.read_verification_mode(d) == D

    def test_record_shape(self, tmp_path):
        d = _set_dir(tmp_path)
        res = dv.change_verification_mode(d)
        entry = _log_entries(d)[-1]
        assert entry == res.record
        assert entry["kind"] == dv.VERIFICATION_MODE_CHANGE_ENTRY_KIND
        assert entry["choice"] == D
        assert entry["previousMode"] == OOB
        # Attributed to the highest completed session.
        assert entry["sessionNumber"] == 2
        assert entry["stepKey"] == "session-002/verification-mode-change"
        assert entry["status"] == "complete"
        assert entry["routedApiCalls"] == []

    def test_supersedes_an_original_capture(self, tmp_path):
        # Set 057 capture said Mode A explicitly; the blessed transition
        # supersedes it (last valid record of either kind wins).
        d = _set_dir(tmp_path)
        dv.record_verification_mode(d, OOB)
        res = dv.change_verification_mode(d)
        assert res.ok is True
        assert dv.read_verification_mode(d) == D

    def test_missing_activity_log_is_created(self, tmp_path):
        # The implicit-default Mode A population may never have recorded
        # anything; a missing log is created minimal (the
        # resolve_and_record precedent), not refused.
        d = _set_dir(tmp_path, with_log=False)
        res = dv.change_verification_mode(d)
        assert res.ok is True
        assert dv.read_verification_mode(d) == D

    def test_not_started_set_passes_locked_gates(self, tmp_path):
        # The locked D4 gates do not include "set must be complete" —
        # the UI scopes the action to not-started (seed rewrite) and
        # complete (this writer) rows, but the writer enforces exactly
        # the locked gate list. A not-started ledger has no typed
        # sessions and nothing in flight, so it records (attributed to
        # session 0 — nothing has completed).
        d = _set_dir(
            tmp_path,
            sessions=[_s(1, "not-started"), _s(2, "not-started")],
            status="not-started",
        )
        res = dv.change_verification_mode(d)
        assert res.ok is True
        assert res.record["sessionNumber"] == 0


# --------------------------------------------------------------------------
# gate refusals (fail loud, nothing written)
# --------------------------------------------------------------------------


class TestChangeGates:
    def test_b_to_a_refused(self, tmp_path):
        d = _set_dir(tmp_path)
        res = dv.change_verification_mode(d, target_mode=OOB)
        assert res.ok is False
        assert res.code == "refused-target-mode"
        assert _log_entries(d) == []

    def test_unknown_target_refused(self, tmp_path):
        d = _set_dir(tmp_path)
        res = dv.change_verification_mode(d, target_mode="bogus")
        assert res.ok is False
        assert res.code == "refused-target-mode"

    def test_missing_dir_refused(self, tmp_path):
        res = dv.change_verification_mode(tmp_path / "nope")
        assert res.ok is False
        assert res.code == "refused-no-session-set"

    def test_missing_spec_refused(self, tmp_path):
        d = _set_dir(tmp_path, with_spec=False)
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-no-session-set"

    def test_full_tier_refused(self, tmp_path):
        d = _set_dir(tmp_path, tier="full")
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-not-lightweight"
        assert _log_entries(d) == []

    def test_unreadable_activity_log_refused(self, tmp_path):
        d = _set_dir(tmp_path)
        (d / "activity-log.json").write_text("{not json", encoding="utf-8")
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-activity-log-unreadable"

    def test_shapeless_activity_log_refused(self, tmp_path):
        # Parsable JSON whose entries is not a list is as uninspectable
        # as garbage — fail loud (the S2 verifier lesson).
        d = _set_dir(tmp_path)
        (d / "activity-log.json").write_text(
            json.dumps({"entries": "nope"}), encoding="utf-8"
        )
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-activity-log-unreadable"

    def test_already_dedicated_refused(self, tmp_path):
        d = _set_dir(tmp_path)
        dv.record_verification_mode(d, D)
        before = _log_entries(d)
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-already-dedicated"
        assert _log_entries(d) == before

    def test_second_transition_refused(self, tmp_path):
        d = _set_dir(tmp_path)
        assert dv.change_verification_mode(d).ok is True
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-already-dedicated"
        # Exactly one change record via sanctioned paths.
        kinds = [e["kind"] for e in _log_entries(d)]
        assert kinds.count(dv.VERIFICATION_MODE_CHANGE_ENTRY_KIND) == 1

    def test_typed_session_refused(self, tmp_path):
        d = _set_dir(
            tmp_path,
            sessions=[
                _s(1, "complete"),
                _s(2, "complete"),
                _s(3, "complete", typ="verification", engine="codex"),
            ],
        )
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-typed-session-exists"
        assert _log_entries(d) == []

    def test_in_flight_session_refused(self, tmp_path):
        d = _set_dir(
            tmp_path,
            sessions=[_s(1, "complete"), _s(2, "in-progress")],
            status="in-progress",
        )
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-session-in-flight"

    def test_plan_less_in_progress_refused(self, tmp_path):
        # Plan-less carve-out: no sessions[] ledger but top-level
        # in-progress IS an in-flight session.
        d = _set_dir(tmp_path, with_state=False)
        state = {
            "schemaVersion": 4,
            "sessionSetName": d.name,
            "status": "in-progress",
            "startedAt": "2026-06-12T00:00:00-04:00",
            "orchestrator": {"engine": "claude-code"},
        }
        (d / "session-state.json").write_text(
            json.dumps(state, indent=2), encoding="utf-8"
        )
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-session-in-flight"

    def test_missing_state_refused(self, tmp_path):
        d = _set_dir(tmp_path, with_state=False)
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-state-unreadable"

    def test_garbled_state_refused(self, tmp_path):
        d = _set_dir(tmp_path)
        (d / "session-state.json").write_text("{nope", encoding="utf-8")
        res = dv.change_verification_mode(d)
        assert res.ok is False
        assert res.code == "refused-state-unreadable"


# --------------------------------------------------------------------------
# read-path precedence + capture idempotency (S3 audit F1/F3)
# --------------------------------------------------------------------------


class TestReadPathPrecedence:
    def test_has_record_recognizes_change_kind(self, tmp_path):
        d = _set_dir(tmp_path)
        assert dv.has_verification_mode_record(d) is False
        dv.change_verification_mode(d)
        assert dv.has_verification_mode_record(d) is True

    def test_capture_noops_after_change_record(self, tmp_path):
        # The S3-audit F3 hazard regression test: a stale Mode-A spec
        # seed must NOT be re-captured after the blessed transition —
        # the capture runs on every start_session (including the typed
        # starts that follow the transition), and a seed entry appended
        # after the change record would silently revert the mode under
        # last-valid-entry-wins.
        d = _set_dir(tmp_path, spec_mode=OOB)
        dv.change_verification_mode(d)
        out = dv.resolve_and_record_verification_mode(d, cli_choice=None)
        assert out is None
        assert dv.read_verification_mode(d) == D
        kinds = [e["kind"] for e in _log_entries(d)]
        assert dv.VERIFICATION_MODE_ENTRY_KIND not in kinds

    def test_explicit_cli_b_to_a_cannot_supersede_change_record(self, tmp_path):
        # S062-S3-V1-001 disproof, pinned forever: the R1 verifier
        # hypothesized that a later `start_session --verification-mode
        # out-of-band-or-none` could append a fresh capture entry that
        # supersedes a blessed transition (B->A) under
        # last-of-either-kind-wins. It cannot: the capture path
        # (resolve_and_record_verification_mode — the ONLY production
        # caller of record_verification_mode) is immutable once ANY
        # durable record of either kind exists (Set 057 Q5 + the S3 F3
        # both-kinds extension). Nothing is appended; the transition
        # stands.
        d = _set_dir(tmp_path)
        dv.change_verification_mode(d)
        out = dv.resolve_and_record_verification_mode(d, cli_choice=OOB)
        assert out is None
        assert dv.read_verification_mode(d) == D
        kinds = [e["kind"] for e in _log_entries(d)]
        assert kinds == [dv.VERIFICATION_MODE_CHANGE_ENTRY_KIND]

    def test_validator_applicable_after_transition(self, tmp_path):
        # The Q6 close-out gate consumes read_verification_mode; after
        # the transition the content-aware validator must be armed.
        d = _set_dir(tmp_path)
        assert dv.validate_dedicated_verification(d).applicable is False
        dv.change_verification_mode(d)
        res = dv.validate_dedicated_verification(d)
        assert res.applicable is True
        assert res.ok is False  # no verification session has run yet

    def test_derived_state_awaiting_verification_after_transition(
        self, tmp_path
    ):
        # The whole point of the feature: a completed Mode-A set, once
        # transitioned, derives as awaiting-verification.
        d = _set_dir(tmp_path)
        assert dv.derive_workflow_state(d) == dv.STATE_CLOSED_NO_VERIFICATION
        dv.change_verification_mode(d)
        assert dv.derive_workflow_state(d) == dv.STATE_AWAITING_VERIFICATION


# --------------------------------------------------------------------------
# CLI wrapper
# --------------------------------------------------------------------------


class TestCli:
    def test_success_exit_zero(self, tmp_path, capsys):
        d = _set_dir(tmp_path)
        rc = cvm_cli.main([str(d)])
        assert rc == cvm_cli.EXIT_OK
        out = capsys.readouterr().out
        assert "dedicated-sessions" in out
        assert dv.read_verification_mode(d) == D

    def test_refusal_exit_boundary(self, tmp_path, capsys):
        d = _set_dir(tmp_path, tier="full")
        rc = cvm_cli.main([str(d)])
        assert rc == cvm_cli.EXIT_BOUNDARY
        err = capsys.readouterr().err
        assert "refused-not-lightweight" in err

    def test_b_to_a_via_cli_exit_boundary(self, tmp_path, capsys):
        d = _set_dir(tmp_path)
        rc = cvm_cli.main([str(d), "--to", OOB])
        assert rc == cvm_cli.EXIT_BOUNDARY
        assert "refused-target-mode" in capsys.readouterr().err

    def test_unresolvable_arg_exit_usage(self, tmp_path, capsys, monkeypatch):
        monkeypatch.chdir(tmp_path)
        rc = cvm_cli.main(["no-such-set"])
        assert rc == cvm_cli.EXIT_USAGE

    def test_slug_resolution_under_docs_session_sets(
        self, tmp_path, monkeypatch
    ):
        root = tmp_path / "repo"
        sets_root = root / "docs" / "session-sets"
        sets_root.mkdir(parents=True)
        d = _set_dir(sets_root)
        monkeypatch.chdir(root)
        rc = cvm_cli.main([d.name])
        assert rc == cvm_cli.EXIT_OK
        assert dv.read_verification_mode(d) == D

    def test_json_envelope(self, tmp_path, capsys):
        d = _set_dir(tmp_path)
        rc = cvm_cli.main([str(d), "--json"])
        assert rc == cvm_cli.EXIT_OK
        payload = json.loads(capsys.readouterr().out)
        assert payload["ok"] is True
        assert payload["code"] == "changed"
        assert payload["record"]["kind"] == dv.VERIFICATION_MODE_CHANGE_ENTRY_KIND

    def test_json_envelope_on_refusal(self, tmp_path, capsys):
        d = _set_dir(tmp_path)
        dv.record_verification_mode(d, D)
        rc = cvm_cli.main([str(d), "--json"])
        assert rc == cvm_cli.EXIT_BOUNDARY
        payload = json.loads(capsys.readouterr().out)
        assert payload["ok"] is False
        assert payload["code"] == "refused-already-dedicated"
        assert payload["record"] is None
