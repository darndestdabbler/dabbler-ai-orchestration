"""Tests for the Set 114 S1 checklist post record and its close gate.

The point of this set is that a *prose* obligation to post the step
checklist decayed silently, so the tests here are weighted toward the
REFUSAL: a gate that only ever passes proves nothing (L-112-1). Every
rule the gate encodes gets a falsifier that plants the omission and
asserts the gate fires, beside the legitimate look-alike that asserts it
does not.

Three layers:

* :func:`session_checklist.record_post` / :func:`read_posts` — the
  ledger writer and its tolerant reader.
* the CLI wiring — rendering IS recording, and ``--no-record`` opts out.
* :func:`gate_checks.check_checklist_posted` — coverage, windowing, the
  unobservable-history grace, and the zero-posts refusal.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import gate_checks
from ai_router import session_checklist as sc


BASE = datetime(2026, 8, 9, 12, 0, 0, tzinfo=timezone.utc)


def _iso(offset_minutes: float) -> str:
    return (BASE + timedelta(minutes=offset_minutes)).isoformat()


def _entry(step_number, key, status, *, at, session=1):
    return {
        "sessionNumber": session,
        "stepNumber": step_number,
        "stepKey": key,
        "dateTime": at,
        "description": "",
        "status": status,
    }


def _make_set(
    tmp_path: Path,
    *,
    started_at=None,
    entries=None,
    session_number=1,
    total=3,
) -> str:
    set_dir = tmp_path / "docs" / "session-sets" / "114-fixture"
    set_dir.mkdir(parents=True, exist_ok=True)
    sessions = []
    for number in range(1, total + 1):
        record = {
            "number": number,
            "title": f"Session {number}",
            "status": (
                "in-progress" if number == session_number else "not-started"
            ),
            "startedAt": (
                (started_at if started_at is not None else _iso(0))
                if number == session_number
                else None
            ),
            "completedAt": None,
            "orchestrator": None,
            "verificationVerdict": None,
        }
        sessions.append(record)
    (set_dir / "session-state.json").write_text(
        json.dumps(
            {
                "schemaVersion": 4,
                "sessionSetName": "114-fixture",
                "status": "in-progress",
                "totalSessions": total,
                "sessions": sessions,
            }
        ),
        encoding="utf-8",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps(
            {
                "sessionSetName": "114-fixture",
                "totalSessions": total,
                "entries": entries
                if entries is not None
                else [_entry(1, "register", "complete", at=_iso(1))],
            }
        ),
        encoding="utf-8",
    )
    (set_dir / "spec.md").write_text(
        "# Fixture\n\n## Session Set Configuration\n\n"
        "```yaml\ntier: full\nrequiresUAT: false\nrequiresE2E: false\n```\n",
        encoding="utf-8",
    )
    return str(set_dir)


def _post(set_dir: str, at: str, *, session=1) -> None:
    """Write a post record directly, so a test can control its instant."""
    with open(
        Path(set_dir) / sc.POSTS_FILENAME, "a", encoding="utf-8", newline="\n"
    ) as fh:
        fh.write(
            json.dumps(
                {
                    "sessionNumber": session,
                    "postedAt": at,
                    "stepCount": 3,
                    "surface": "markdown",
                }
            )
            + "\n"
        )


def _rounds(set_dir: str, *, session=1, records) -> None:
    with open(
        Path(set_dir) / f"s{session}-rounds.jsonl",
        "a",
        encoding="utf-8",
        newline="\n",
    ) as fh:
        for record in records:
            fh.write(json.dumps(record) + "\n")


def _round(at: str, number: int = 1, *, session=1) -> dict:
    return {
        "event": "round-completed",
        "sessionNumber": session,
        "verificationRound": number,
        "phase": "discovery",
        "verdict": "VERIFIED",
        "blocking": False,
        "endedLoop": True,
        "recordedAt": at,
    }


def _decision(
    set_dir: str, at: str, *, authority="human", session=1, rubric="value-trade-off"
) -> None:
    with open(
        Path(set_dir) / "decisions.jsonl", "a", encoding="utf-8", newline="\n"
    ) as fh:
        fh.write(
            json.dumps(
                {
                    "timestamp": at,
                    "session_set": "114-fixture",
                    "session_number": session,
                    "question": "q",
                    "decision": "d",
                    "authority": authority,
                    "rubric_line": rubric,
                    "options": [],
                    "reversibility": "reversible",
                    "verification_effect": "none",
                }
            )
            + "\n"
        )


def _test_run(set_dir: str, at: str, *, suite="playwright", session=1) -> None:
    with open(
        Path(set_dir) / "test-runs.jsonl", "a", encoding="utf-8", newline="\n"
    ) as fh:
        fh.write(
            json.dumps(
                {
                    "suite": suite,
                    "command": "npm run test:playwright",
                    "outcome": "passed",
                    "surfaceDigest": "0" * 64,
                    "recordedAt": at,
                    "sessionNumber": session,
                }
            )
            + "\n"
        )


# ---------------------------------------------------------------------------
# The ledger writer and reader
# ---------------------------------------------------------------------------


class TestRecordPost:
    def test_records_the_here_step_and_the_count(self, tmp_path):
        set_dir = _make_set(tmp_path)
        rows = [
            sc.ChecklistRow(1, "register", "", "complete", False),
            sc.ChecklistRow(2, "execute", "", "in-progress", True),
            sc.ChecklistRow(3, "close", "", "pending", False),
        ]
        written = sc.record_post(set_dir, 1, rows, surface=sc.SURFACE_MARKDOWN)
        assert written is not None
        assert written["stepCount"] == 3
        assert written["hereStepKey"] == "execute"
        assert written["hereStepNumber"] == 2
        assert written["surface"] == sc.SURFACE_MARKDOWN
        assert sc.read_posts(set_dir, 1) == [written]

    def test_appends_never_rewrites(self, tmp_path):
        set_dir = _make_set(tmp_path)
        rows = [sc.ChecklistRow(1, "a", "", "complete", True)]
        sc.record_post(set_dir, 1, rows)
        sc.record_post(set_dir, 1, rows)
        assert len(sc.read_posts(set_dir, 1)) == 2

    def test_a_render_with_no_rows_still_records(self, tmp_path):
        """An empty checklist is a real answer to "where is this session"."""
        set_dir = _make_set(tmp_path)
        written = sc.record_post(set_dir, 1, [])
        assert written is not None
        assert written["stepCount"] == 0
        assert "hereStepKey" not in written

    def test_write_failure_is_reported_not_raised(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)

        def _boom(*args, **kwargs):
            raise OSError("locked")

        monkeypatch.setattr("builtins.open", _boom)
        assert sc.record_post(set_dir, 1, []) is None


class TestReadPosts:
    def test_absent_ledger_reads_empty(self, tmp_path):
        assert sc.read_posts(_make_set(tmp_path), 1) == []

    def test_other_sessions_are_filtered_out(self, tmp_path):
        set_dir = _make_set(tmp_path)
        _post(set_dir, _iso(1), session=1)
        _post(set_dir, _iso(2), session=2)
        assert len(sc.read_posts(set_dir, 1)) == 1
        assert len(sc.read_posts(set_dir)) == 2

    def test_a_truncated_last_line_does_not_take_down_the_reader(
        self, tmp_path
    ):
        set_dir = _make_set(tmp_path)
        _post(set_dir, _iso(1))
        with open(
            Path(set_dir) / sc.POSTS_FILENAME, "a", encoding="utf-8"
        ) as fh:
            fh.write('{"sessionNumber": 1, "postedAt": "2026-')
        assert len(sc.read_posts(set_dir, 1)) == 1

    def test_a_non_object_line_is_skipped(self, tmp_path):
        set_dir = _make_set(tmp_path)
        with open(
            Path(set_dir) / sc.POSTS_FILENAME, "a", encoding="utf-8"
        ) as fh:
            fh.write("[1, 2, 3]\n")
        assert sc.read_posts(set_dir, 1) == []


# ---------------------------------------------------------------------------
# The renderer IS the recorder
# ---------------------------------------------------------------------------


class TestRenderingRecords:
    def test_rendering_writes_a_post(self, tmp_path, capsys):
        set_dir = _make_set(tmp_path)
        assert sc.run(["--session-set-dir", set_dir]) == 0
        capsys.readouterr()
        posts = sc.read_posts(set_dir, 1)
        assert len(posts) == 1
        assert posts[0]["surface"] == sc.SURFACE_TEXT

    def test_markdown_render_records_its_surface(self, tmp_path, capsys):
        set_dir = _make_set(tmp_path)
        assert sc.run(["--session-set-dir", set_dir, "--markdown"]) == 0
        capsys.readouterr()
        assert sc.read_posts(set_dir, 1)[0]["surface"] == sc.SURFACE_MARKDOWN

    def test_no_record_opts_out(self, tmp_path, capsys):
        set_dir = _make_set(tmp_path)
        assert sc.run(["--session-set-dir", set_dir, "--no-record"]) == 0
        capsys.readouterr()
        assert sc.read_posts(set_dir, 1) == []

    def test_the_existing_cli_surface_still_renders(self, tmp_path, capsys):
        """Decision 4 of the spec: plain/--markdown/--verbose keep working."""
        set_dir = _make_set(tmp_path)
        sc.run(["--session-set-dir", set_dir, "--verbose"])
        out = capsys.readouterr().out
        assert "Session 1 step" in out
        assert out.isascii()

    def test_a_ledger_failure_never_costs_the_operator_the_checklist(
        self, tmp_path, capsys, monkeypatch
    ):
        set_dir = _make_set(tmp_path)
        monkeypatch.setattr(sc, "record_post", lambda *a, **k: None)
        assert sc.run(["--session-set-dir", set_dir]) == 0
        captured = capsys.readouterr()
        assert "Session 1 step" in captured.out
        # L-079-1: a fail-open branch around I/O must NAME the skip.
        assert "NOT recorded" in captured.err


# ---------------------------------------------------------------------------
# The close gate
# ---------------------------------------------------------------------------


class TestChecklistGateRefusals:
    def test_a_session_that_never_posted_is_refused(self, tmp_path):
        set_dir = _make_set(tmp_path)
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "no step-checklist post" in remediation
        assert "session_checklist" in remediation

    def test_one_post_at_the_end_does_not_cover_the_whole_session(
        self, tmp_path
    ):
        """The gaming path the windowing rule exists to close."""
        set_dir = _make_set(
            tmp_path,
            entries=[
                _entry(1, "register", "complete", at=_iso(1)),
                _entry(2, "close", "complete", at=_iso(50)),
            ],
        )
        _post(set_dir, _iso(0.5))  # the session-start post
        _test_run(set_dir, _iso(20))
        _rounds(set_dir, records=[_round(_iso(30))])
        _post(set_dir, _iso(60))  # ...then silence until the very end
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "test-run-recorded" in remediation
        assert "verification-round 1" in remediation

    def test_a_missing_post_after_the_last_logged_step_is_refused(
        self, tmp_path
    ):
        """The 'before close' half: the final transition owes a post."""
        set_dir = _make_set(
            tmp_path,
            entries=[
                _entry(1, "register", "complete", at=_iso(1)),
                _entry(2, "close", "complete", at=_iso(50)),
            ],
        )
        _post(set_dir, _iso(2))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "last-logged-step (close)" in remediation

    def test_a_missing_post_after_a_verification_round_is_refused(
        self, tmp_path
    ):
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(0.5))
        _post(set_dir, _iso(2))
        _rounds(set_dir, records=[_round(_iso(30))])
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "verification-round 1" in remediation

    def test_a_missing_post_after_a_recorded_test_run_is_refused(
        self, tmp_path
    ):
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(0.5))
        _post(set_dir, _iso(2))
        _test_run(set_dir, _iso(30), suite="playwright")
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "test-run-recorded (playwright)" in remediation

    def test_missing_session_state_is_refused(self, tmp_path):
        set_dir = _make_set(tmp_path)
        (Path(set_dir) / "session-state.json").unlink()
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "session-state.json" in remediation

    def test_one_late_post_cannot_launder_a_whole_silent_session(
        self, tmp_path
    ):
        """Round-1 findings 1 and 4: the exact decay this set exists to end.

        An orchestrator ignores the checklist all day, is refused by this
        gate, runs the remediation command once, and retries the close.
        The first cut excused every transition older than that first
        post, so the retry passed. It must not.
        """
        set_dir = _make_set(
            tmp_path,
            entries=[
                _entry(1, "register", "complete", at=_iso(1)),
                _entry(2, "close", "complete", at=_iso(50)),
            ],
        )
        _test_run(set_dir, _iso(20))
        _rounds(set_dir, records=[_round(_iso(30))])
        _post(set_dir, _iso(60))  # the first and only post, at the end
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "test-run-recorded" in remediation
        assert "verification-round 1" in remediation
        # The final post does cover the LAST transition — which is
        # precisely why covering only that one must not be enough.
        assert "last-logged-step (close)" not in remediation
        # ...and the one bounded excuse is not withdrawn along with it.
        assert gate_checks.CHECKLIST_TRANSITION_START not in remediation

    def test_an_operator_stop_without_a_post_is_refused(self, tmp_path):
        """Round-1 finding 3: a human-authority decision IS a stop.

        The first cut claimed operator stops leave no timestamped record
        and skipped them on that basis. `decisions.jsonl` times-stamps
        every one.
        """
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(0.5))
        _post(set_dir, _iso(2))
        _decision(set_dir, _iso(30), authority="human")
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "operator-stop (value-trade-off)" in remediation

    def test_a_post_before_recording_a_run_does_not_cover_it(self, tmp_path):
        """Round-2 finding: the transition is the record, not the return.

        The doc now says record the run and *then* post, so a post that
        predates the run-of-record line is deliberately not coverage.
        """
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(0.5))
        _post(set_dir, _iso(19))  # posted when the command returned...
        _test_run(set_dir, _iso(20))  # ...but recorded afterwards
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "test-run-recorded (playwright)" in remediation


class TestChecklistGateAcceptance:
    def test_a_post_at_every_transition_passes(self, tmp_path):
        set_dir = _make_set(
            tmp_path,
            entries=[
                _entry(1, "register", "complete", at=_iso(1)),
                _entry(2, "close", "complete", at=_iso(50)),
            ],
        )
        _post(set_dir, _iso(0.5))   # session start
        _test_run(set_dir, _iso(20))
        _post(set_dir, _iso(21))    # after the long-running command
        _rounds(set_dir, records=[_round(_iso(30))])
        _post(set_dir, _iso(31))    # after verification
        _post(set_dir, _iso(51))    # before close
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_extra_posts_never_hurt(self, tmp_path):
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        for minute in (0.5, 2, 3, 4, 5):
            _post(set_dir, _iso(minute))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_transitions_older_than_the_ledger_are_not_failed(self, tmp_path):
        """The grace is bounded to the session start, and nothing else.

        A ledger cannot describe the time before it existed, so a session
        already in flight when this shipped is not failed for a start it
        could not have recorded — but every later transition still binds.
        """
        set_dir = _make_set(
            tmp_path,
            entries=[
                _entry(1, "register", "complete", at=_iso(1)),
                _entry(2, "close", "complete", at=_iso(50)),
            ],
        )
        _post(set_dir, _iso(20))  # the first post this session ever made
        _post(set_dir, _iso(51))  # ...and one after the last logged step
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_transitions_sharing_an_instant_need_only_one_post(self, tmp_path):
        """An empty [t, t) window would otherwise be unsatisfiable."""
        set_dir = _make_set(
            tmp_path,
            started_at=_iso(10),
            entries=[_entry(1, "register", "complete", at=_iso(10))],
        )
        _test_run(set_dir, _iso(10))
        _post(set_dir, _iso(11))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_another_sessions_records_are_not_this_sessions_transitions(
        self, tmp_path
    ):
        set_dir = _make_set(
            tmp_path,
            session_number=2,
            entries=[
                _entry(1, "s1", "complete", at=_iso(1), session=1),
                _entry(1, "s2", "complete", at=_iso(40), session=2),
            ],
        )
        _rounds(set_dir, session=1, records=[_round(_iso(60), session=1)])
        _test_run(set_dir, _iso(60), session=1)
        _post(set_dir, _iso(41), session=2)
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_records_older_than_the_session_start_are_not_its_transitions(
        self, tmp_path
    ):
        """A session cannot owe a post for a moment that preceded it."""
        set_dir = _make_set(
            tmp_path,
            started_at=_iso(40),
            entries=[_entry(1, "prior", "complete", at=_iso(1))],
        )
        _test_run(set_dir, _iso(2))
        _post(set_dir, _iso(41))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_a_record_after_the_start_still_binds(self, tmp_path):
        """The look-alike: same shape, but inside the session."""
        set_dir = _make_set(
            tmp_path,
            started_at=_iso(40),
            entries=[_entry(1, "prior", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(41))
        _test_run(set_dir, _iso(42))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is False
        assert "test-run-recorded (playwright)" in remediation

    def test_unparseable_timestamps_are_skipped_not_crashed(self, tmp_path):
        set_dir = _make_set(
            tmp_path,
            started_at="not-a-timestamp",
            entries=[_entry(1, "register", "complete", at="also-not")],
        )
        _post(set_dir, _iso(1))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_an_operator_stop_followed_by_a_post_passes(self, tmp_path):
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(2))
        _decision(set_dir, _iso(30), authority="human")
        _post(set_dir, _iso(31))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_an_ai_authority_decision_is_not_an_operator_stop(self, tmp_path):
        """The legitimate look-alike: journaled, but nobody was stopped."""
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(2))
        _decision(set_dir, _iso(30), authority="ai", rubric="simpler-code")
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_another_sessions_operator_stop_is_not_this_sessions(
        self, tmp_path
    ):
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(2))
        _decision(set_dir, _iso(30), authority="human", session=2)
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation

    def test_recording_then_posting_covers_a_long_running_command(
        self, tmp_path
    ):
        """The documented order: run, record, post."""
        set_dir = _make_set(
            tmp_path,
            entries=[_entry(1, "register", "complete", at=_iso(1))],
        )
        _post(set_dir, _iso(2))
        _test_run(set_dir, _iso(20))
        _post(set_dir, _iso(20.5))
        passed, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert passed is True, remediation


class TestChecklistGateWiring:
    def test_the_gate_is_registered(self):
        names = [name for name, _fn in gate_checks.GATE_CHECKS]
        assert gate_checks.CHECKLIST_POSTED_CHECK_NAME in names

    def test_it_was_appended_so_index_based_consumers_keep_position(self):
        names = [name for name, _fn in gate_checks.GATE_CHECKS]
        assert names[-1] == gate_checks.CHECKLIST_POSTED_CHECK_NAME
        assert names[:5] == [
            "working_tree_clean",
            "pushed_to_remote",
            "activity_log_entry",
            "next_orchestrator_present",
            "change_log_fresh",
        ]

    def test_remediation_names_the_command_to_run(self, tmp_path):
        set_dir = _make_set(tmp_path)
        _, remediation = gate_checks.check_checklist_posted(set_dir, None)
        assert "-m ai_router.session_checklist" in remediation
        assert "--session-set-dir" in remediation


class TestFreshnessAndEvidence:
    """The interaction Session 1 was told to settle deliberately."""

    def test_the_post_ledger_is_freshness_exempt(self):
        from ai_router.verification_stamp import WORK_DIFF_SET_BOOKKEEPING

        assert sc.POSTS_FILENAME in WORK_DIFF_SET_BOOKKEEPING

    def test_the_post_ledger_stays_visible_to_the_verifier(self):
        from ai_router.verification_stamp import (
            EVIDENCE_VISIBLE_BOOKKEEPING,
            PHASED_EVIDENCE_SET_EXCLUDES,
        )

        assert sc.POSTS_FILENAME in EVIDENCE_VISIBLE_BOOKKEEPING
        assert sc.POSTS_FILENAME not in PHASED_EVIDENCE_SET_EXCLUDES

    def test_the_filename_has_exactly_one_spelling(self):
        """The freshness list hardcodes the name; keep the two in lockstep."""
        from ai_router.verification_stamp import (
            EVIDENCE_VISIBLE_BOOKKEEPING,
            WORK_DIFF_SET_BOOKKEEPING,
        )

        assert sc.POSTS_FILENAME == "checklist-posts.jsonl"
        assert sum(
            1 for n in WORK_DIFF_SET_BOOKKEEPING if n == sc.POSTS_FILENAME
        ) == 1
        assert sum(
            1 for n in EVIDENCE_VISIBLE_BOOKKEEPING if n == sc.POSTS_FILENAME
        ) == 1

    def test_a_post_does_not_change_the_work_diff_digest(self, tmp_path):
        """The concrete failure this exemption prevents.

        Set 111 S4 lost a round because a post-verification write staled
        the stamp; a stale row sends the close backstop into a fresh
        metered round, so posting would cost money and the obligation
        would decay exactly as the prose one did.
        """
        import subprocess

        from ai_router.verification_stamp import compute_work_diff_sha256

        root = tmp_path / "repo"
        root.mkdir()

        def _git(*args):
            subprocess.run(
                ["git", *args],
                cwd=str(root),
                capture_output=True,
                check=True,
            )

        _git("init", "-b", "main")
        _git("config", "user.email", "t@example.invalid")
        _git("config", "user.name", "T")
        (root / "README.md").write_text("x\n", encoding="utf-8")
        _git("add", "-A")
        _git("commit", "-m", "base")

        set_dir = _make_set(root)
        before = compute_work_diff_sha256(Path(set_dir), "HEAD")
        assert before is not None
        sc.record_post(set_dir, 1, [])
        after = compute_work_diff_sha256(Path(set_dir), "HEAD")
        assert after == before

        # ...while real work in the same directory still binds.
        (Path(set_dir) / "spec.md").write_text("changed\n", encoding="utf-8")
        assert compute_work_diff_sha256(Path(set_dir), "HEAD") != before
