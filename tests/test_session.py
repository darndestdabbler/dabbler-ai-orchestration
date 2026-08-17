import json
import os
import shutil
from pathlib import Path

import pytest

from ai_router.progress import SessionStateInvariantError
from ai_router.session import (
    EXIT_BOUNDARY,
    EXIT_OK,
    LockContentionError,
    SetCollisionError,
    SetNotFoundError,
    acquire_lock,
    append_change_log_block,
    extract_spec_excerpt,
    flip_state_to_closed,
    log_step,
    main,
    parse_session_plans,
    plan_step_key,
    record_session_verification,
    register_session_start,
    release_lock,
    resolve_session_set_dir,
    seed_session_plan,
    start,
)
from tests.conftest import SPEC_MD

CORPUS = Path(__file__).parent / "fixtures" / "corpus"


class TestResolveSet:
    def _root(self, tmp_path, *names):
        for name in names:
            (tmp_path / name).mkdir()
        return str(tmp_path)

    def test_non_digit_passes_through(self, tmp_path):
        assert resolve_session_set_dir("docs/x/010-foo") == "docs/x/010-foo"

    def test_bare_number_resolves_with_zero_padding(self, tmp_path):
        root = self._root(tmp_path, "050-foo", "007-bar")
        assert resolve_session_set_dir("50", root).endswith("050-foo")
        assert resolve_session_set_dir("7", root).endswith("007-bar")

    def test_underscore_dirs_skipped(self, tmp_path):
        root = self._root(tmp_path, "_archived", "010-live")
        assert resolve_session_set_dir("10", root).endswith("010-live")

    def test_not_found_lists_available(self, tmp_path):
        root = self._root(tmp_path, "010-a")
        with pytest.raises(SetNotFoundError, match="Available numbers: 10"):
            resolve_session_set_dir("99", root)

    def test_collision_refused(self, tmp_path):
        root = self._root(tmp_path, "010-a", "10-b")
        with pytest.raises(SetCollisionError):
            resolve_session_set_dir("10", root)


class TestLock:
    def test_contention(self, tmp_path):
        lock = acquire_lock(tmp_path)
        with pytest.raises(LockContentionError):
            acquire_lock(tmp_path)
        release_lock(lock)
        release_lock(acquire_lock(tmp_path))

    def test_stale_dead_pid_reclaimed(self, tmp_path):
        path = tmp_path / ".lifecycle.lock"
        path.write_text(json.dumps({
            "pid": 999_999_999, "worker_id": "x",
            "acquired_at": "2026-08-17T00:00:00+00:00",
        }), encoding="utf-8")
        release_lock(acquire_lock(tmp_path))  # reclaimed, no raise

    def test_unparseable_lock_is_stale(self, tmp_path):
        (tmp_path / ".lifecycle.lock").write_text("junk", encoding="utf-8")
        release_lock(acquire_lock(tmp_path))


class TestSpecParser:
    def test_sessions_and_steps(self):
        plans = parse_session_plans(SPEC_MD)
        assert [p["number"] for p in plans] == [1, 2]
        assert plans[0]["title"] == "First things"
        assert len(plans[0]["steps"]) == 4

    def test_nested_lists_not_counted(self):
        steps = parse_session_plans(SPEC_MD)[0]["steps"]
        assert not any("nested sub-step" in s.split(".")[0] for s in steps)
        # Continuation content stays with its parent step.
        assert any("nested bullet" in s for s in steps)

    def test_creates_trailer_excluded(self):
        steps = parse_session_plans(SPEC_MD)[0]["steps"]
        assert not any("Creates:" in s for s in steps)

    def test_fenced_blocks_stripped(self):
        spec = (
            "### Session 1 of 1: X\n1. Real step.\n```\n2. fake step in "
            "fence\n### Session 9 of 9: fake\n```\n"
        )
        plans = parse_session_plans(spec)
        assert len(plans) == 1
        assert plans[0]["steps"] == ["Real step."]

    def test_spec_excerpt_slices_one_session(self):
        excerpt = extract_spec_excerpt(SPEC_MD, 1)
        assert "First things" in excerpt
        assert "Second things" not in excerpt
        # No heading match falls back to the whole spec.
        assert extract_spec_excerpt("just prose", 4) == "just prose"

    def test_plan_step_key(self):
        assert plan_step_key("**Build the widget.** Make it real.", 2) == (
            "build-the-widget"
        )
        assert plan_step_key("???", 3) == "step-3"


@pytest.fixture
def set_dir(tmp_path):
    d = tmp_path / "010-demo"
    d.mkdir()
    (d / "spec.md").write_text(SPEC_MD, encoding="utf-8")
    return d


class TestWriters:
    def test_register_writes_v4_shape(self, set_dir):
        state = register_session_start(
            set_dir, 1, engine="claude-code", provider="anthropic",
        )
        assert state["schemaVersion"] == 4
        assert state["status"] == "in-progress"
        assert [s["status"] for s in state["sessions"]] == [
            "in-progress", "not-started",
        ]
        record = state["sessions"][0]
        assert record["title"] == "First things"  # healed from spec
        assert record["orchestrator"]["identityProvenance"] == "direct"
        assert record["startedAt"]

    def test_register_refuses_reopening_closed_session(self, set_dir):
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        flip_state_to_closed(set_dir, verdict="VERIFIED")
        with pytest.raises(SessionStateInvariantError, match="Re-opening"):
            register_session_start(set_dir, 1, engine="claude-code",
                                   provider="anthropic")

    def test_flip_mid_set_keeps_set_in_progress(self, set_dir):
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        state = flip_state_to_closed(set_dir, verdict="VERIFIED")
        assert state["status"] == "in-progress"
        assert state["sessions"][0]["status"] == "complete"
        assert state["sessions"][0]["verificationVerdict"] == "VERIFIED"
        assert state["sessions"][0]["completedAt"]

    def test_flip_last_session_completes_set(self, set_dir):
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        flip_state_to_closed(set_dir, verdict="VERIFIED")
        register_session_start(set_dir, 2, engine="claude-code",
                               provider="anthropic")
        state = flip_state_to_closed(set_dir, verdict="VERIFIED")
        assert state["status"] == "complete"

    def test_flip_forced_promotes_and_marks(self, set_dir):
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        state = flip_state_to_closed(set_dir, forced=True)
        assert state["status"] == "complete"
        assert state["forceClosed"] is True
        assert all(s["status"] == "complete" for s in state["sessions"])

    def test_flip_refuses_invented_verdict(self, set_dir):
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        with pytest.raises(ValueError, match="closed vocabulary"):
            flip_state_to_closed(set_dir, verdict="manual-override-development")

    def test_record_session_verification(self, set_dir):
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        record_session_verification(
            set_dir, 1, "VERIFIED",
            summary={"rounds": 2, "verifierProvider": "openai"},
        )
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        assert state["sessions"][0]["verificationVerdict"] == "VERIFIED"
        assert state["sessions"][0]["verification"]["rounds"] == 2

    def test_seed_plan_once(self, set_dir):
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        assert seed_session_plan(set_dir, 1) == 4
        assert seed_session_plan(set_dir, 1) == 0  # never re-applied
        log = json.loads(
            (set_dir / "activity-log.json").read_text(encoding="utf-8")
        )
        plan_rows = [e for e in log["entries"]
                     if e.get("kind") == "plan-step"]
        assert len(plan_rows) == 4
        assert plan_rows[0]["stepKey"] == "register"
        assert plan_rows[0]["status"] == "pending"

    def test_log_step_closed_vocabulary(self, set_dir):
        with pytest.raises(ValueError):
            log_step(set_dir, 1, "x", "d", "skipped")
        log_step(set_dir, 1, "x", "d", "complete")

    def test_change_log_append(self, set_dir):
        append_change_log_block(set_dir, "## First block")
        append_change_log_block(set_dir, "## Second block")
        text = (set_dir / "change-log.md").read_text(encoding="utf-8")
        assert text.index("First block") < text.index("Second block")


class TestBoundaryTriad:
    def _start(self, set_dir, number=None):
        return start(
            set_dir, engine="claude-code", provider="anthropic",
            session_number=number,
        )

    def test_in_flight_refuses_other_session(self, set_dir, capsys):
        assert self._start(set_dir) == EXIT_OK
        assert self._start(set_dir, 2) == EXIT_BOUNDARY
        assert "still in flight" in capsys.readouterr().err

    def test_in_flight_resume_is_idempotent(self, set_dir):
        assert self._start(set_dir) == EXIT_OK
        assert self._start(set_dir) == EXIT_OK  # resumes session 1

    def test_reopen_refused(self, set_dir, capsys):
        self._start(set_dir)
        flip_state_to_closed(set_dir, verdict="VERIFIED")
        assert self._start(set_dir, 1) == EXIT_BOUNDARY
        assert "never re-opened" in capsys.readouterr().err

    def test_skip_ahead_refused(self, set_dir, capsys):
        assert self._start(set_dir, 2) == EXIT_BOUNDARY
        assert "next sequential" in capsys.readouterr().err

    def test_lock_contention_exit_code(self, set_dir):
        lock = acquire_lock(set_dir)
        try:
            # start() polls for 30s; use a tiny window via direct acquire.
            with pytest.raises(LockContentionError):
                acquire_lock(set_dir)
        finally:
            release_lock(lock)


class TestCancelRestoreCLI:
    """CLI contract: `cancel <set-dir> --reason <text> [--force]` and
    `restore <set-dir> [--reason <text>]`, one-line JSON on stdout."""

    COMPLETE_SET = "004-cost-enforcement-and-capacity"

    def _copy(self, tmp_path, name):
        dst = tmp_path / name
        shutil.copytree(CORPUS / name, dst)
        return dst

    def _state(self, set_dir):
        return json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )

    def test_cancel_flips_status_and_prints_json(self, tmp_path, capsys):
        set_dir = self._copy(tmp_path, self.COMPLETE_SET)
        assert main(["cancel", str(set_dir), "--reason", "scope cut"]) \
            == EXIT_OK
        assert json.loads(capsys.readouterr().out.strip()) == {
            "status": "cancelled", "sessionSetName": self.COMPLETE_SET,
        }
        assert self._state(set_dir)["status"] == "cancelled"

    def test_cancel_records_pre_cancel_status(self, tmp_path):
        set_dir = self._copy(tmp_path, self.COMPLETE_SET)
        main(["cancel", str(set_dir), "--reason", "scope cut"])
        assert self._state(set_dir)["preCancelStatus"] == "complete"

    def test_cancel_writes_cancelled_marker(self, tmp_path):
        set_dir = self._copy(tmp_path, self.COMPLETE_SET)
        main(["cancel", str(set_dir), "--reason", "budget freeze"])
        text = (set_dir / "CANCELLED.md").read_text(encoding="utf-8")
        assert "Cancelled on " in text  # timestamp line
        assert "budget freeze" in text

    def test_cancel_refuses_in_flight_session(self, set_dir, capsys):
        register_session_start(set_dir, 1, engine="claude-code")
        assert main(["cancel", str(set_dir), "--reason", "x"]) \
            == EXIT_BOUNDARY
        assert "in flight" in capsys.readouterr().err
        assert not (set_dir / "CANCELLED.md").exists()
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        assert state["status"] == "in-progress"

    def test_restore_returns_pre_cancel_status(self, tmp_path, capsys):
        set_dir = self._copy(tmp_path, self.COMPLETE_SET)
        main(["cancel", str(set_dir), "--reason", "scope cut"])
        capsys.readouterr()
        assert main(["restore", str(set_dir)]) == EXIT_OK
        assert json.loads(capsys.readouterr().out.strip()) == {
            "status": "complete", "sessionSetName": self.COMPLETE_SET,
        }
        state = self._state(set_dir)
        assert state["status"] == "complete"
        assert "preCancelStatus" not in state
        assert not (set_dir / "CANCELLED.md").exists()
        assert (set_dir / "RESTORED.md").is_file()  # history preserved

    def test_restore_refuses_not_cancelled(self, tmp_path, capsys):
        set_dir = self._copy(tmp_path, self.COMPLETE_SET)
        assert main(["restore", str(set_dir)]) == EXIT_BOUNDARY
        assert "not cancelled" in capsys.readouterr().err
        assert self._state(set_dir)["status"] == "complete"
