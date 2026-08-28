import json
import os
import re
import shutil
from pathlib import Path

import pytest

from ai_router.progress import SessionStateInvariantError
from ai_router.session import (
    EXIT_BOUNDARY,
    EXIT_OK,
    EXIT_USAGE,
    DuplicateSlugError,
    LockContentionError,
    MalformedSlugError,
    SanctionedWriteError,
    acquire_lock,
    append_change_log_block,
    append_decision,
    declare_session_task,
    extract_spec_excerpt,
    flip_state_to_closed,
    log_step,
    main,
    migrate,
    parse_session_plans,
    plan_step_key,
    read_task_declaration,
    record_project_plan,
    record_session_verification,
    register_session_start,
    release_lock,
    seed_session_plan,
    session_is_releasable,
    split_slug_marker,
    start,
)
from tests.conftest import SESSION_PLAN_MD

CORPUS = Path(__file__).parent / "fixtures" / "corpus"


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
        plans = parse_session_plans(SESSION_PLAN_MD)
        assert [p["number"] for p in plans] == [1, 2]
        assert plans[0]["title"] == "First things"
        assert len(plans[0]["steps"]) == 4

    def test_nested_lists_not_counted(self):
        steps = parse_session_plans(SESSION_PLAN_MD)[0]["steps"]
        assert not any("nested sub-step" in s.split(".")[0] for s in steps)
        # Continuation content stays with its parent step.
        assert any("nested bullet" in s for s in steps)

    def test_creates_trailer_excluded(self):
        steps = parse_session_plans(SESSION_PLAN_MD)[0]["steps"]
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
        excerpt = extract_spec_excerpt(SESSION_PLAN_MD, 1)
        assert "First things" in excerpt
        assert "Second things" not in excerpt
        # No heading match falls back to the whole spec.
        assert extract_spec_excerpt("just prose", 4) == "just prose"

    def test_plan_step_key(self):
        assert plan_step_key("**Build the widget.** Make it real.", 2) == (
            "build-the-widget"
        )
        assert plan_step_key("???", 3) == "step-3"

    def test_session_heading_slug_marker_is_parsed_and_stripped(self):
        spec = (
            "### Session 1 of 1: The artifact, hashed (slug: the-artifact)\n"
            "1. Register.\n"
        )
        plan = parse_session_plans(spec)[0]
        assert plan["title"] == "The artifact, hashed"
        assert plan["slug"] == "the-artifact"

    def test_session_heading_without_slug_marker_is_none(self):
        assert parse_session_plans(SESSION_PLAN_MD)[0]["slug"] is None

    def test_split_slug_marker(self):
        assert split_slug_marker("Register. (slug: register)") == (
            "Register.", "register"
        )
        assert split_slug_marker("Register.") == ("Register.", None)

    def test_split_slug_marker_refuses_malformed_content(self):
        with pytest.raises(MalformedSlugError):
            split_slug_marker("Register. (slug: Bad_Slug!)")

    def test_split_slug_marker_refuses_slug_like_typos(self):
        # Missing colon and wrong case are typos, not "no marker" --
        # silently falling back would break the one-identity promise.
        with pytest.raises(MalformedSlugError):
            split_slug_marker("Register. (slug plan-schema)")
        with pytest.raises(MalformedSlugError):
            split_slug_marker("Register. (Slug: plan-schema)")

    def test_split_slug_marker_refuses_unclosed_marker(self):
        with pytest.raises(MalformedSlugError):
            split_slug_marker("Define schema. (slug: plan-schema")

    def test_duplicate_session_slug_refused(self):
        spec = (
            "### Session 1 of 2: First (slug: same)\n1. Register.\n"
            "### Session 2 of 2: Second (slug: same)\n1. Register.\n"
        )
        with pytest.raises(DuplicateSlugError):
            parse_session_plans(spec)


@pytest.fixture
def sessions_dir(tmp_path):
    d = tmp_path / "docs" / "sessions"
    d.mkdir(parents=True)
    (d / "session-plan.md").write_text(SESSION_PLAN_MD, encoding="utf-8")
    return d


class TestWriters:
    def test_register_writes_the_v5_shape(self, sessions_dir):
        state = register_session_start(
            sessions_dir, 1, engine="claude-code", provider="anthropic",
        )
        assert state["schemaVersion"] == 5
        # A repository has sessions, not a set of them: nothing names a set
        # above the list, and nothing carries a status above a session.
        assert "sessionSetName" not in state
        assert "status" not in state
        assert [s["status"] for s in state["sessions"]] == [
            "in-progress", "not-started",
        ]
        record = state["sessions"][0]
        assert record["title"] == "First things"  # healed from spec
        assert record["orchestrator"]["identityProvenance"] == "direct"
        assert record["startedAt"]

    def test_register_refuses_reopening_closed_session(self, sessions_dir):
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        flip_state_to_closed(sessions_dir, verdict="VERIFIED")
        with pytest.raises(SessionStateInvariantError, match="Re-opening"):
            register_session_start(sessions_dir, 1, engine="claude-code",
                                   provider="anthropic")

    def test_flip_closes_the_session_and_leaves_the_rest_alone(
        self, sessions_dir
    ):
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        state = flip_state_to_closed(sessions_dir, verdict="VERIFIED")
        assert [s["status"] for s in state["sessions"]] == [
            "complete", "not-started",
        ]
        assert state["sessions"][0]["verificationVerdict"] == "VERIFIED"
        assert state["sessions"][0]["completedAt"]

    def test_flip_forced_promotes_and_marks(self, sessions_dir):
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        state = flip_state_to_closed(sessions_dir, forced=True)
        assert state["forceClosed"] is True
        assert all(s["status"] == "complete" for s in state["sessions"])

    def test_flip_refuses_invented_verdict(self, sessions_dir):
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        with pytest.raises(ValueError, match="closed vocabulary"):
            flip_state_to_closed(sessions_dir, verdict="manual-override-development")

    def test_record_session_verification(self, sessions_dir):
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        record_session_verification(
            sessions_dir, 1, "VERIFIED",
            summary={"rounds": 2, "verifierProvider": "openai"},
        )
        state = json.loads(
            (sessions_dir / "sessions.json").read_text(encoding="utf-8")
        )
        assert state["sessions"][0]["verificationVerdict"] == "VERIFIED"
        assert state["sessions"][0]["verification"]["rounds"] == 2

    def test_register_preserves_prior_sessions_verification_block(
        self, sessions_dir
    ):
        # Registering session 2 rebuilds the sessions array; session 1's
        # verification summary (verifier identity, rounds, cost) must ride
        # along with its verdict — it was silently erased at every
        # registration.
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        record_session_verification(
            sessions_dir, 1, "VERIFIED",
            summary={"rounds": 2, "verifierProvider": "openai",
                     "costUsd": 0.31},
        )
        flip_state_to_closed(sessions_dir)
        state = register_session_start(sessions_dir, 2, engine="claude-code",
                                       provider="anthropic")
        first = state["sessions"][0]
        assert first["verificationVerdict"] == "VERIFIED"
        assert first["verification"] == {
            "rounds": 2, "verifierProvider": "openai", "costUsd": 0.31,
        }
        # The freshly registered session owes its own verification.
        assert state["sessions"][1]["verificationVerdict"] is None
        assert "verification" not in state["sessions"][1]

    def test_register_grows_the_ledger_to_a_recut_plan(self, sessions_dir):
        # A plan re-cut to more sessions is a declaration that they exist.
        # A ledger that stayed at the old count would leave them
        # unstartable and say so nowhere; it still never shrinks, because
        # dropping a session drops its record.
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        (sessions_dir / "session-plan.md").write_text(
            SESSION_PLAN_MD
            + "\n### Session 3 of 3: Third things\n1. Register.\n",
            encoding="utf-8",
        )
        flip_state_to_closed(sessions_dir)
        state = register_session_start(sessions_dir, 2, engine="claude-code",
                                       provider="anthropic")
        assert [s["number"] for s in state["sessions"]] == [1, 2, 3]
        assert state["sessions"][2]["title"] == "Third things"

    def test_register_rewrites_only_a_historyless_stale_title(
        self, sessions_dir
    ):
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        (sessions_dir / "session-plan.md").write_text(
            "### Session 1 of 2: Renamed after the fact\n1. Register.\n"
            "### Session 2 of 2: The re-cut name\n1. Register.\n",
            encoding="utf-8",
        )
        state = register_session_start(sessions_dir, 1, engine="claude-code",
                                       provider="anthropic")
        assert state["sessions"][0]["title"] == "First things"
        assert state["sessions"][1]["title"] == "The re-cut name"

    def test_seed_plan_once(self, sessions_dir):
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        assert seed_session_plan(sessions_dir, 1) == 4
        assert seed_session_plan(sessions_dir, 1) == 0  # never re-applied
        log = json.loads(
            (sessions_dir / "activity-log.json").read_text(encoding="utf-8")
        )
        plan_rows = [e for e in log["entries"]
                     if e.get("kind") == "plan-step"]
        assert len(plan_rows) == 4
        assert plan_rows[0]["stepKey"] == "register"
        assert plan_rows[0]["status"] == "pending"

    def test_seed_plan_uses_authored_step_slug(self, tmp_path):
        d = tmp_path / "docs" / "sessions"
        d.mkdir(parents=True)
        (d / "session-plan.md").write_text(
            "### Session 1 of 1: X\n"
            "1. Register. (slug: register)\n"
            "2. Define the schema at v1. (slug: plan-schema)\n",
            encoding="utf-8",
        )
        register_session_start(d, 1, engine="claude-code",
                               provider="anthropic")
        seed_session_plan(d, 1)
        log = json.loads((d / "activity-log.json").read_text(encoding="utf-8"))
        rows = [e for e in log["entries"] if e.get("kind") == "plan-step"]
        assert [r["stepKey"] for r in rows] == ["register", "plan-schema"]
        assert rows[1]["description"] == "Define the schema at v1."

    def test_seed_plan_refuses_duplicate_step_slug(self, tmp_path):
        d = tmp_path / "docs" / "sessions"
        d.mkdir(parents=True)
        (d / "session-plan.md").write_text(
            "### Session 1 of 1: X\n"
            "1. Register. (slug: dup)\n"
            "2. Also register. (slug: dup)\n",
            encoding="utf-8",
        )
        register_session_start(d, 1, engine="claude-code",
                               provider="anthropic")
        with pytest.raises(DuplicateSlugError):
            seed_session_plan(d, 1)

    def test_log_step_closed_vocabulary(self, sessions_dir):
        with pytest.raises(ValueError):
            log_step(sessions_dir, 1, "x", "d", "skipped")
        log_step(sessions_dir, 1, "x", "d", "complete")

    def test_change_log_append(self, sessions_dir):
        append_change_log_block(sessions_dir, "## First block")
        append_change_log_block(sessions_dir, "## Second block")
        text = (sessions_dir / "change-log.md").read_text(encoding="utf-8")
        assert text.index("First block") < text.index("Second block")


class TestStartChecklistHandoff:
    def _log(self, sessions_dir):
        return json.loads(
            (sessions_dir / "activity-log.json").read_text(encoding="utf-8")
        )

    def test_start_ticks_register_and_prints_step_addresses(
        self, sessions_dir, capsys
    ):
        assert start(sessions_dir, engine="claude-code",
                     provider="anthropic") == EXIT_OK
        out = capsys.readouterr().out
        # The engine is handed the seeded addresses it must log against.
        assert "1. register" in out
        assert "2. build-the-widget" in out
        # start performed the registration, so start records it.
        regs = [e for e in self._log(sessions_dir)["entries"]
                if e.get("stepKey") == "register" and "kind" not in e]
        assert len(regs) == 1
        assert regs[0]["status"] == "complete"
        assert regs[0]["stepNumber"] == 1
        # Idempotent resume neither re-seeds nor double-logs.
        assert start(sessions_dir, engine="claude-code",
                     provider="anthropic") == EXIT_OK
        regs = [e for e in self._log(sessions_dir)["entries"]
                if e.get("stepKey") == "register" and "kind" not in e]
        assert len(regs) == 1


    def test_cli_output_names_a_session_the_way_the_tree_does(
        self, sessions_dir, capsys
    ):
        # One formatter owns the padding, so the terminal and the tree
        # cannot disagree about how a session is named. The record keeps
        # the integer: sessions.json and every --session argument.
        assert start(sessions_dir, engine="claude-code",
                     provider="anthropic") == EXIT_OK
        assert "session 001 of" in capsys.readouterr().out
        assert main(["log", "--sessions-dir", str(sessions_dir),
                     "--step", "1", "--status", "complete"]) == EXIT_OK
        assert "log: session 001 step 1" in capsys.readouterr().out
        ledger = json.loads(
            (sessions_dir / "sessions.json").read_text(encoding="utf-8")
        )
        assert ledger["sessions"][0]["number"] == 1


class TestBoundaryTriad:
    def _start(self, sessions_dir, number=None):
        return start(
            sessions_dir, engine="claude-code", provider="anthropic",
            session_number=number,
        )

    def test_in_flight_refuses_other_session(self, sessions_dir, capsys):
        assert self._start(sessions_dir) == EXIT_OK
        assert self._start(sessions_dir, 2) == EXIT_BOUNDARY
        assert "still in flight" in capsys.readouterr().err

    def test_in_flight_resume_is_idempotent(self, sessions_dir):
        assert self._start(sessions_dir) == EXIT_OK
        assert self._start(sessions_dir) == EXIT_OK  # resumes session 1

    def test_reopen_refused(self, sessions_dir, capsys):
        self._start(sessions_dir)
        flip_state_to_closed(sessions_dir, verdict="VERIFIED")
        assert self._start(sessions_dir, 1) == EXIT_BOUNDARY
        assert "never re-opened" in capsys.readouterr().err

    def test_skip_ahead_refused(self, sessions_dir, capsys):
        assert self._start(sessions_dir, 2) == EXIT_BOUNDARY
        assert "next sequential" in capsys.readouterr().err

    def test_lock_contention_exit_code(self, sessions_dir):
        lock = acquire_lock(sessions_dir)
        try:
            # start() polls for 30s; use a tiny window via direct acquire.
            with pytest.raises(LockContentionError):
                acquire_lock(sessions_dir)
        finally:
            release_lock(lock)


class TestCancelRestoreCLI:
    """CLI contract: `cancel <n> --reason <text> [--force]` and
    `restore <n> [--reason <text>]`, one-line JSON on stdout. What is
    cancelled is a session, because there is no set to cancel."""

    def _state(self, sessions_dir):
        return json.loads(
            (sessions_dir / "sessions.json").read_text(encoding="utf-8")
        )

    def _record(self, sessions_dir, number):
        return next(
            s for s in self._state(sessions_dir)["sessions"]
            if s["number"] == number
        )

    def test_cancel_marks_the_session_and_prints_json(
        self, sessions_dir, capsys
    ):
        register_session_start(sessions_dir, 1, engine="claude-code")
        flip_state_to_closed(sessions_dir, verdict="VERIFIED")
        capsys.readouterr()
        assert main(["cancel", "2", "--sessions-dir", str(sessions_dir),
                     "--reason", "scope cut"]) == EXIT_OK
        assert json.loads(capsys.readouterr().out.strip()) == {
            "session": 2, "status": "cancelled",
        }
        record = self._record(sessions_dir, 2)
        assert record["status"] == "cancelled"
        assert record["cancelledReason"] == "scope cut"
        # Session 1 is untouched: cancelling one session is not cancelling
        # the work around it.
        assert self._record(sessions_dir, 1)["status"] == "complete"

    def test_cancel_records_where_the_session_came_from(self, sessions_dir):
        register_session_start(sessions_dir, 1, engine="claude-code")
        main(["cancel", "1", "--sessions-dir", str(sessions_dir),
              "--reason", "scope cut", "--force"])
        assert self._record(sessions_dir, 1)["preCancelStatus"] \
            == "in-progress"

    def test_cancel_refuses_a_session_in_flight(self, sessions_dir, capsys):
        register_session_start(sessions_dir, 1, engine="claude-code")
        assert main(["cancel", "1", "--sessions-dir", str(sessions_dir),
                     "--reason", "x"]) == EXIT_BOUNDARY
        assert "in flight" in capsys.readouterr().err
        assert self._record(sessions_dir, 1)["status"] == "in-progress"

    def test_restore_returns_the_session_to_where_it_was(
        self, sessions_dir, capsys
    ):
        register_session_start(sessions_dir, 1, engine="claude-code")
        main(["cancel", "2", "--sessions-dir", str(sessions_dir),
              "--reason", "scope cut"])
        capsys.readouterr()
        assert main(["restore", "2", "--sessions-dir", str(sessions_dir)]) \
            == EXIT_OK
        assert json.loads(capsys.readouterr().out.strip()) == {
            "session": 2, "status": "not-started",
        }
        record = self._record(sessions_dir, 2)
        assert record["status"] == "not-started"
        assert "preCancelStatus" not in record
        assert "cancelledReason" not in record

    def test_restore_refuses_a_session_that_is_not_cancelled(
        self, sessions_dir, capsys
    ):
        register_session_start(sessions_dir, 1, engine="claude-code")
        assert main(["restore", "1", "--sessions-dir", str(sessions_dir)]) \
            == EXIT_BOUNDARY
        assert "not cancelled" in capsys.readouterr().err


class TestMigrate:
    """`migrate <legacy-set-dir>`: the one-way door out of the set level.

    The corpus is real v4/v3 set state, which makes it the honest fixture:
    the migration's whole job is reading files nobody writes any more.
    """

    def _sessions_root(self, tmp_path):
        root = tmp_path / "docs" / "sessions"
        root.mkdir(parents=True)
        return root

    def _legacy(self, tmp_path, name):
        dst = tmp_path / "legacy" / name
        shutil.copytree(CORPUS / name, dst)
        return dst

    def _state(self, sessions_dir):
        return json.loads(
            (sessions_dir / "sessions.json").read_text(encoding="utf-8")
        )

    def test_the_ledger_carries_forward_without_the_set(self, tmp_path):
        legacy = self._legacy(tmp_path, "074-dabbler-provider-env-vars")
        root = self._sessions_root(tmp_path)

        assert migrate(legacy, root) == EXIT_OK

        state = self._state(root)
        assert state["schemaVersion"] == 5
        assert "sessionSetName" not in state
        assert "status" not in state
        assert [s["number"] for s in state["sessions"]] == [1]
        assert state["sessions"][0]["status"] == "complete"
        assert state["sessions"][0]["verificationVerdict"] == "VERIFIED"

    def test_the_authored_plan_and_the_two_files_move_up(self, tmp_path):
        legacy = self._legacy(tmp_path, "074-dabbler-provider-env-vars")
        root = self._sessions_root(tmp_path)

        migrate(legacy, root)

        assert (root / "session-plan.md").read_text(encoding="utf-8") == (
            legacy / "spec.md"
        ).read_text(encoding="utf-8")
        assert (root / "activity-log.json").is_file()
        assert (root / "change-log.md").is_file()

    def test_a_cancelled_set_becomes_cancelled_sessions(self, tmp_path):
        # A set said this work would not run. After the collapse there is
        # nowhere but the session to say so, and dropping the claim would
        # silently return four abandoned sessions to the queue.
        legacy = self._legacy(tmp_path, "040-codex-launch-adapter")
        root = self._sessions_root(tmp_path)

        migrate(legacy, root)

        statuses = {s["status"] for s in self._state(root)["sessions"]}
        assert statuses == {"cancelled"}
        assert all(
            s["preCancelStatus"] == "not-started"
            for s in self._state(root)["sessions"]
        )

    def test_a_second_migration_is_refused(self, tmp_path):
        root = self._sessions_root(tmp_path)
        migrate(self._legacy(tmp_path, "074-dabbler-provider-env-vars"), root)
        second = self._legacy(tmp_path, "004-cost-enforcement-and-capacity")

        assert migrate(second, root) == EXIT_BOUNDARY
        # The first set's ledger is untouched, not merged over.
        assert len(self._state(root)["sessions"]) == 1

    def test_dry_run_writes_nothing(self, tmp_path, capsys):
        legacy = self._legacy(tmp_path, "074-dabbler-provider-env-vars")
        root = self._sessions_root(tmp_path)

        assert migrate(legacy, root, dry_run=True) == EXIT_OK

        assert json.loads(capsys.readouterr().out)["sessions"] == 1
        assert not (root / "sessions.json").exists()
        assert not (root / "session-plan.md").exists()

    def test_the_migrated_repository_registers_its_next_session(
        self, tmp_path
    ):
        # The acceptance test the collapse is for: the sessions that had
        # not run must still be startable under the machinery that
        # replaced the one they were planned under.
        legacy = self._legacy(tmp_path, "113-narrated-video-walkthroughs")
        root = self._sessions_root(tmp_path)
        migrate(legacy, root)

        state = register_session_start(root, 8, engine="claude-code",
                                       provider="anthropic")

        assert state["sessions"][7]["status"] == "in-progress"
        assert [s["status"] for s in state["sessions"][:7]] == \
            ["complete"] * 7


class TestCancellationSurvives:
    """A cancellation is a decision about one session. Registering the next
    one must not quietly undo it."""

    PLAN = (
        "### Session 1 of 3: First\n1. Register.\n2. Close-out.\n\n"
        "### Session 2 of 3: Second\n1. Register.\n2. Close-out.\n\n"
        "### Session 3 of 3: Third\n1. Register.\n2. Close-out.\n"
    )

    @pytest.fixture
    def three(self, tmp_path):
        d = tmp_path / "docs" / "sessions"
        d.mkdir(parents=True)
        (d / "session-plan.md").write_text(self.PLAN, encoding="utf-8")
        register_session_start(d, 1, engine="claude-code",
                               provider="anthropic")
        flip_state_to_closed(d, verdict="VERIFIED")
        main(["cancel", "2", "--sessions-dir", str(d), "--reason", "scope cut"])
        return d

    def test_a_cancelled_session_survives_the_next_registration(self, three):
        state = register_session_start(three, 3, engine="claude-code",
                                       provider="anthropic")

        record = state["sessions"][1]
        assert record["status"] == "cancelled"
        assert record["cancelledReason"] == "scope cut"
        assert record["preCancelStatus"] == "not-started"
        assert state["sessions"][2]["status"] == "in-progress"

    def test_start_steps_over_a_cancelled_session(self, three, capsys):
        capsys.readouterr()
        # No --session-number: the next session is the first still available
        # to run, not one past the highest closed number.
        assert start(three, engine="claude-code",
                     provider="anthropic") == EXIT_OK
        assert "session 003" in capsys.readouterr().out

    def test_starting_a_cancelled_session_is_refused(self, three, capsys):
        capsys.readouterr()
        assert start(three, engine="claude-code", provider="anthropic",
                     session_number=2) == EXIT_BOUNDARY
        assert "restore" in capsys.readouterr().err


class TestLogCLI:
    """`log --sessions-dir <dir> --step <key|number> --status <s>`:
    the lifecycle seam that replaces reaching into the writers by hand."""

    def _entries(self, sessions_dir):
        log = json.loads(
            (sessions_dir / "activity-log.json").read_text(encoding="utf-8")
        )
        return [e for e in log["entries"] if "kind" not in e]

    def _log(self, sessions_dir, step, status, *extra):
        return main([
            "log", "--sessions-dir", str(sessions_dir), "--step", step,
            "--status", status, *extra,
        ])

    def test_step_resolves_by_key_or_by_number(self, sessions_dir):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        assert self._log(sessions_dir, "build-the-widget", "in-progress") == EXIT_OK
        assert self._log(sessions_dir, "2", "complete") == EXIT_OK
        rows = [e for e in self._entries(sessions_dir)
                if e["stepKey"] == "build-the-widget"]
        assert [r["status"] for r in rows] == ["in-progress", "complete"]
        # The spec's own wording is the default description, so the
        # planned row is ticked rather than paraphrased.
        assert rows[0]["stepNumber"] == 2
        assert "Build the widget" in rows[0]["description"]

    def test_unresolvable_step_refuses_without_writing_an_orphan(
        self, sessions_dir, capsys
    ):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        before = self._entries(sessions_dir)
        assert self._log(sessions_dir, "build-the-widgets", "complete") == 2
        err = capsys.readouterr().err
        assert "no orphan row was written" in err
        assert "2. build-the-widget" in err  # the valid addresses
        assert self._entries(sessions_dir) == before

    def test_status_outside_the_vocabulary_is_refused(self, sessions_dir):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        with pytest.raises(SystemExit):  # argparse choices, at the boundary
            self._log(sessions_dir, "build-the-widget", "done")

    def test_re_logging_the_same_status_is_a_noop(self, sessions_dir):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        self._log(sessions_dir, "build-the-widget", "complete")
        assert self._log(sessions_dir, "build-the-widget", "complete") == EXIT_OK
        assert len([e for e in self._entries(sessions_dir)
                    if e["stepKey"] == "build-the-widget"]) == 1

    def test_close_out_is_logged_against_the_last_closed_session(
        self, sessions_dir
    ):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        flip_state_to_closed(sessions_dir, verdict="VERIFIED")
        assert self._log(sessions_dir, "close-out", "complete",
                         "--note", "Closed and pushed.") == EXIT_OK
        row = [e for e in self._entries(sessions_dir)
               if e["stepKey"] == "close-out"][0]
        assert row["sessionNumber"] == 1
        assert row["description"] == "Closed and pushed."


class TestDecisionsLog:
    """`decisions-log.md` is a fold of the activity log: the model brings
    content, the framework brings identity, order and time."""

    def _read(self, sessions_dir):
        return (sessions_dir / "decisions-log.md").read_text(encoding="utf-8")

    def test_the_writer_numbers_and_dates_every_entry(self, sessions_dir):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        first = append_decision(
            sessions_dir, session_number=1, decider="operator",
            headline="Ship it", body="Because the gate is green.",
        )
        second = append_decision(
            sessions_dir, session_number=1, decider="orchestrator",
            headline="Extract the parser", body="It had two callers.",
            model="claude-opus-5", provider="anthropic",
        )
        assert [first["decisionId"], second["decisionId"]] == ["D1", "D2"]
        assert first["decidedOn"] == first["recordedAt"][:10]
        body = self._read(sessions_dir)
        assert body.index("D1 ") < body.index("D2 ")
        assert "· Operator · Ship it" in body
        assert "Orchestrator (claude-opus-5/anthropic)" in body

    def test_a_decider_outside_the_closed_set_is_refused(self, sessions_dir):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        with pytest.raises(SanctionedWriteError, match="decider must be"):
            append_decision(sessions_dir, session_number=1, decider="the team",
                            headline="x", body="y")

    def test_a_backdated_entry_needs_a_reason_and_says_it_was_backfilled(
        self, sessions_dir
    ):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        with pytest.raises(SanctionedWriteError, match="transcription"):
            append_decision(sessions_dir, session_number=1, decider="operator",
                            headline="x", body="y", decided_on="2026-08-26")
        entry = append_decision(
            sessions_dir, session_number=1, decider="operator",
            headline="Set 148 runs on master", body="The standing directive.",
            decided_on="2026-08-26",
            backfill_reason="transcribed from the hand-kept log",
        )
        assert entry["decidedOn"] == "2026-08-26"
        assert "*Backfilled on " in self._read(sessions_dir)

    def test_a_malformed_date_is_refused(self, sessions_dir):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        with pytest.raises(SanctionedWriteError, match="ISO date"):
            append_decision(sessions_dir, session_number=1, decider="operator",
                            headline="x", body="y", decided_on="26 Aug 2026",
                            backfill_reason="transcribed")

    def test_the_log_renders_in_append_order_not_grouped_by_session(
        self, sessions_dir
    ):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        append_decision(sessions_dir, session_number=1, decider="framework",
                        headline="No preverify record is required",
                        body="Nothing was affected.")
        append_decision(sessions_dir, session_number=2, decider="verifier",
                        headline="Round 1 found a real gap",
                        body="The gate was shut when it was needed.",
                        model="gpt-5.5", provider="openai")
        append_decision(sessions_dir, session_number=1, decider="operator",
                        headline="A late word on session 1",
                        body="Recorded after session 2 had moved on.")
        body = self._read(sessions_dir)
        ids = [int(n) for n in re.findall(r"^### D(\d+) ", body, re.M)]
        assert ids == [1, 2, 3]  # order of record, never regrouped
        assert "## Session 1 — First things" in body
        assert "## Session 2 — Second things" in body
        assert "## Session 1 — First things (continued)" in body

    def test_a_hand_edit_is_overwritten_by_the_next_append(
        self, sessions_dir
    ):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        append_decision(sessions_dir, session_number=1, decider="operator",
                        headline="Keep it", body="It earns its place.")
        rendered = self._read(sessions_dir)
        (sessions_dir / "decisions-log.md").write_text("hand edit", encoding="utf-8")
        append_decision(sessions_dir, session_number=1, decider="operator",
                        headline="And this", body="Second one.")
        after = self._read(sessions_dir)
        assert "hand edit" not in after
        assert rendered.rstrip("\n") in after


class TestTaskDeclaration:
    """The §3.a declaration: made once, before the work, and read by
    packaging. It needs a real repository, because "before the work" is
    answered by the working tree."""

    def _declare(self, sessions_dir, task="Build the widget.", releasable=True,
                 number=1):
        return declare_session_task(sessions_dir, session_number=number,
                                    task=task, releasable=releasable)

    def test_a_session_declares_once(self, sandbox_repo):
        _, sessions_dir = sandbox_repo
        start(sessions_dir, engine="claude-code", provider="anthropic")
        self._declare(sessions_dir)
        with pytest.raises(SanctionedWriteError, match="already declared"):
            self._declare(sessions_dir, task="Build it differently.",
                          releasable=False)
        assert read_task_declaration(sessions_dir, 1)["task"] == "Build the widget."

    def test_a_complete_session_can_no_longer_declare(self, sandbox_repo):
        _, sessions_dir = sandbox_repo
        start(sessions_dir, engine="claude-code", provider="anthropic")
        flip_state_to_closed(sessions_dir, verdict="VERIFIED")
        with pytest.raises(SanctionedWriteError, match="is complete"):
            self._declare(sessions_dir, task="Whatever it turned out to be.")

    def test_a_declaration_is_refused_once_the_work_exists(self, sandbox_repo):
        repo, sessions_dir = sandbox_repo
        start(sessions_dir, engine="claude-code", provider="anthropic")
        (repo / "widget.py").write_text("built\n", encoding="utf-8")
        with pytest.raises(SanctionedWriteError, match="comes before the"):
            self._declare(sessions_dir)
        assert read_task_declaration(sessions_dir, 1) is None

    def test_the_set_s_own_bookkeeping_is_not_the_work(self, sandbox_repo):
        # `start` writes the state and the activity log before anything is
        # declared; if those counted as work, no session could ever declare.
        _, sessions_dir = sandbox_repo
        start(sessions_dir, engine="claude-code", provider="anthropic")
        assert self._declare(sessions_dir)["releasable"] is True

    def test_releasability_fails_closed_when_undeclared(self, sandbox_repo):
        _, sessions_dir = sandbox_repo
        start(sessions_dir, engine="claude-code", provider="anthropic")
        assert session_is_releasable(sessions_dir, 1) is False
        assert read_task_declaration(sessions_dir, 1) is None
        self._declare(sessions_dir, task="Ship it.")
        assert session_is_releasable(sessions_dir, 1) is True
        assert session_is_releasable(sessions_dir, 2) is False


class TestWorkPlanRender:
    def test_the_plan_lists_every_session_with_its_declaration(
        self, sandbox_repo
    ):
        _, sessions_dir = sandbox_repo
        start(sessions_dir, engine="claude-code", provider="anthropic")
        record_project_plan(sessions_dir, "Two sessions, one widget.")
        declare_session_task(sessions_dir, session_number=1,
                             task="Build the widget.", releasable=False)
        body = (sessions_dir / "project-work-plan.md").read_text(encoding="utf-8")
        assert "Two sessions, one widget." in body
        assert "| 1 | First things | no |" in body
        assert "| 2 | Second things | — | not declared |" in body
        assert "**Releasable: no.**" in body

    def test_the_newest_plan_is_rendered_and_the_earlier_one_is_kept(
        self, sessions_dir
    ):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        record_project_plan(sessions_dir, "First shape of the plan.")
        record_project_plan(sessions_dir, "Second shape of the plan.")
        body = (sessions_dir / "project-work-plan.md").read_text(encoding="utf-8")
        assert "Second shape of the plan." in body
        assert "First shape of the plan." not in body
        log = json.loads(
            (sessions_dir / "activity-log.json").read_text(encoding="utf-8")
        )
        plans = [e for e in log["entries"] if e.get("kind") == "project-plan"]
        assert [p["body"] for p in plans] == [
            "First shape of the plan.", "Second shape of the plan.",
        ]


class TestTwoFilesCLI:
    def test_decision_and_declare_default_to_the_session_in_flight(
        self, sandbox_repo
    ):
        _, sessions_dir = sandbox_repo
        start(sessions_dir, engine="claude-code", provider="anthropic")
        assert main([
            "decision", "--sessions-dir", str(sessions_dir),
            "--decider", "orchestrator", "--headline", "Use one validator",
            "--body", "Two would drift.",
        ]) == EXIT_OK
        assert main([
            "declare", "--sessions-dir", str(sessions_dir),
            "--task", "Build the widget.", "--not-releasable",
        ]) == EXIT_OK
        assert read_task_declaration(sessions_dir, 1)["releasable"] is False
        assert "Use one validator" in (
            sessions_dir / "decisions-log.md"
        ).read_text(encoding="utf-8")

    def test_a_refused_write_exits_usage_and_leaves_no_file(
        self, sessions_dir, capsys
    ):
        start(sessions_dir, engine="claude-code", provider="anthropic")
        assert main([
            "decision", "--sessions-dir", str(sessions_dir),
            "--decider", "operator", "--headline", "x", "--body", "y",
            "--decided-on", "2026-08-26",
        ]) == EXIT_USAGE
        assert "transcription" in capsys.readouterr().err
        assert not (sessions_dir / "decisions-log.md").exists()
