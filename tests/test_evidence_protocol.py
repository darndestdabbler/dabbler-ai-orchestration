import subprocess

import pytest

from ai_router.evidence import (
    authoritative_tier,
    changed_paths_between,
    detect_out_of_band_write,
    hash_output,
    record_state_write,
    snapshot_worktree_tree,
    validate_finding_evidence,
    validate_transcript,
)
from ai_router.test_evidence import (
    POLICY_TARGETED,
    STAGE_FINAL_FULL,
    STAGE_PREVERIFY_TARGETED,
    SuiteSpec,
    evaluate_freshness,
    load_suites_checked,
    matching_prefixes,
    read_records,
    record_run,
    surface_digest,
)


def make_transcript(**overrides):
    transcript = {
        "pinnedRef": "abc123",
        "commandId": "probe-widget-empty-input",
        "pristineCheckout": True,
        "exitCode": 1,
        "rawOutput": "ZeroDivisionError\n",
        "outputHash": hash_output("ZeroDivisionError\n"),
        "entrypoint": {"kind": "cli", "ref": "python -m widget"},
        "replay": {
            "pristineCheckout": True,
            "exitCode": 1,
            "outputHash": hash_output("ZeroDivisionError\n"),
        },
    }
    transcript.update(overrides)
    return transcript


class TestHashing:
    def test_prefix_and_coercion(self):
        assert hash_output("x").startswith("sha256:")
        assert hash_output(None) == hash_output("")
        assert hash_output("a") != hash_output("a ")  # no normalization


class TestTranscripts:
    def test_valid_transcript_passes(self):
        ok, reasons = validate_transcript(make_transcript())
        assert ok, reasons

    def test_exactly_one_probe_identifier(self):
        ok, reasons = validate_transcript(
            make_transcript(templateId="t-1")
        )
        assert not ok and any("exactly one" in r for r in reasons)
        transcript = make_transcript()
        del transcript["commandId"]
        ok, reasons = validate_transcript(transcript)
        assert not ok and any("never model-authored" in r for r in reasons)

    def test_agent_harness_named_and_rejected(self):
        ok, reasons = validate_transcript(make_transcript(
            entrypoint={"kind": "agent_harness", "ref": "my-harness"}
        ))
        assert not ok
        assert any("oracle" in r for r in reasons)

    def test_bool_exit_code_rejected(self):
        ok, _ = validate_transcript(make_transcript(exitCode=True))
        assert not ok

    def test_replay_hash_must_byte_match(self):
        transcript = make_transcript()
        transcript["replay"]["outputHash"] = hash_output("flaky output")
        ok, reasons = validate_transcript(transcript)
        assert not ok
        assert any("did not reproduce" in r for r in reasons)

    def test_authoritative_tier_rules(self):
        assert authoritative_tier("REPRODUCED", make_transcript()) == (
            "REPRODUCED"
        )
        # A REPRODUCED claim with no valid transcript collapses.
        assert authoritative_tier("REPRODUCED", None) == "ASSERTED"
        assert authoritative_tier("HYPOTHESIS", None) == "HYPOTHESIS"

    def test_finding_without_tier_is_asserted(self):
        result = validate_finding_evidence({"description": "x"})
        assert result.ok and result.tier == "ASSERTED"


@pytest.fixture
def git_repo(tmp_path):
    repo = tmp_path / "r"
    repo.mkdir()
    subprocess.run(["git", "-C", str(repo), "init", "-q", "-b", "main"],
                   capture_output=True)
    for key, value in (("user.email", "t@e.invalid"), ("user.name", "T")):
        subprocess.run(["git", "-C", str(repo), "config", key, value],
                       capture_output=True)
    (repo / "a.txt").write_text("one\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", "-A"],
                   capture_output=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", "seed"],
                   capture_output=True)
    return repo


class TestTreeSnapshots:
    def test_snapshot_captures_untracked(self, git_repo):
        before = snapshot_worktree_tree(git_repo)
        (git_repo / "new.txt").write_text("hi\n", encoding="utf-8")
        after = snapshot_worktree_tree(git_repo)
        assert before != after
        assert changed_paths_between(git_repo, before, after) == ["new.txt"]

    def test_snapshot_leaves_real_index_alone(self, git_repo):
        (git_repo / "new.txt").write_text("hi\n", encoding="utf-8")
        snapshot_worktree_tree(git_repo)
        status = subprocess.run(
            ["git", "-C", str(git_repo), "status", "--porcelain"],
            capture_output=True, text=True,
        ).stdout
        assert "?? new.txt" in status  # still untracked

    def test_snapshot_excludes_machine_state_when_not_ignored(self, git_repo):
        """A round is appended after the snapshot it describes, so a
        visible ledger makes verified work look changed-since-verified.
        This repo has no .gitignore at all — the exclusion cannot depend
        on one."""
        before = snapshot_worktree_tree(git_repo)
        runs = git_repo / ".dabbler" / "runs" / "s1"
        runs.mkdir(parents=True)
        (runs / "rounds.jsonl").write_text('{"round": 1}\n', encoding="utf-8")
        assert snapshot_worktree_tree(git_repo) == before

class TestOutOfBandWrites:
    def _set_dir(self, git_repo):
        sessions_dir = git_repo / "docs" / "session-sets" / "010-x"
        sessions_dir.mkdir(parents=True)
        return sessions_dir

    def test_sanctioned_write_matches(self, git_repo):
        sessions_dir = self._set_dir(git_repo)
        (sessions_dir / "sessions.json").write_text("{}", encoding="utf-8")
        record_state_write(sessions_dir, git_repo)
        assert detect_out_of_band_write(
            sessions_dir, git_repo, require_record=True
        ) is None

    def test_hand_edit_detected(self, git_repo):
        sessions_dir = self._set_dir(git_repo)
        (sessions_dir / "sessions.json").write_text("{}", encoding="utf-8")
        record_state_write(sessions_dir, git_repo)
        (sessions_dir / "sessions.json").write_text(
            '{"status": "complete"}', encoding="utf-8"
        )
        reason = detect_out_of_band_write(sessions_dir, git_repo)
        assert reason and "out of band" in reason

    def test_absent_record_only_blocks_when_required(self, git_repo):
        sessions_dir = self._set_dir(git_repo)
        (sessions_dir / "sessions.json").write_text("{}", encoding="utf-8")
        assert detect_out_of_band_write(sessions_dir, git_repo) is None
        reason = detect_out_of_band_write(
            sessions_dir, git_repo, require_record=True
        )
        assert reason and "absent" in reason


class TestSurfaceDigests:
    def test_prefix_matching_boundaries(self):
        assert matching_prefixes("a/tests/x.py", ("a/tests/",))
        assert not matching_prefixes("a/tests_helper.py", ("a/tests/",))
        # lstrip("./") would break dotfile prefixes; the loop must not.
        assert matching_prefixes(".github/workflows/ci.yml", (".github/",))
        assert matching_prefixes("anything/at/all.py", ("",))
        assert matching_prefixes("a\\win\\path.py", ("a/win/",))

    def test_digest_tracks_content_not_mtime(self, git_repo):
        first = surface_digest(git_repo, ("",))
        (git_repo / "a.txt").touch()  # mtime changes, content does not
        assert surface_digest(git_repo, ("",)) == first
        (git_repo / "a.txt").write_text("two\n", encoding="utf-8")
        assert surface_digest(git_repo, ("",)) != first

    def test_record_run_strict_at_the_boundary(self, git_repo):
        sessions_dir = git_repo / "docs" / "session-sets" / "010-x"
        sessions_dir.mkdir(parents=True)
        suite = SuiteSpec(name="s", command="c", covers=("",),
                          expensive=True)
        with pytest.raises(ValueError):
            record_run(sessions_dir, suite, "green", stage="final-full",
                       duration_seconds=1)
        with pytest.raises(ValueError):
            record_run(sessions_dir, suite, "passed", stage="final-full",
                       duration_seconds=0)
        with pytest.raises(ValueError):
            record_run(sessions_dir, suite, "passed", stage="smoke",
                       duration_seconds=1)
        record = record_run(sessions_dir, suite, "failed", stage="final-full",
                            duration_seconds=2.5)
        assert record.outcome == "failed"  # honesty beats silence

    def test_suite_declaration_unknown_key_is_an_error(self):
        loaded = load_suites_checked({"testing": {"suites": [
            {"name": "s", "command": "c", "covers": ["."],
             "expencive": True},
        ]}})
        assert loaded.errors
        assert loaded.suites  # the suite still loads; the gate blocks


class TestRunStages:
    """What a run proves depends on when it was taken."""

    SUITE = SuiteSpec(name="pytest", command="pytest", covers=("",),
                      expensive=True)

    def _verdict(self, repo, sessions_dir):
        return evaluate_freshness(
            sessions_dir, None, [self.SUITE], repo_root=repo
        )[0]

    def test_a_targeted_run_never_satisfies_the_close(self, sandbox_repo):
        repo, sessions_dir = sandbox_repo
        record_run(sessions_dir, self.SUITE, "passed",
                   stage=STAGE_PREVERIFY_TARGETED, duration_seconds=1.0,
                   command="pytest tests/test_widget.py",
                   policy=POLICY_TARGETED, repo_root=repo)
        verdict = self._verdict(repo, sessions_dir)
        assert not verdict.passed
        assert STAGE_PREVERIFY_TARGETED in verdict.reason

        record_run(sessions_dir, self.SUITE, "passed", stage=STAGE_FINAL_FULL,
                   duration_seconds=1.0, repo_root=repo)
        assert self._verdict(repo, sessions_dir).passed

    def test_a_targeted_record_must_name_its_command_and_policy(
        self, sandbox_repo
    ):
        """The command is the evidence, so it cannot be optional; and the
        vocabulary that judges it cannot leak onto the run of record, which
        is the whole suite by definition."""
        repo, sessions_dir = sandbox_repo
        with pytest.raises(ValueError):
            record_run(sessions_dir, self.SUITE, "passed",
                       stage=STAGE_PREVERIFY_TARGETED, duration_seconds=1.0,
                       policy=POLICY_TARGETED, repo_root=repo)
        with pytest.raises(ValueError):
            record_run(sessions_dir, self.SUITE, "passed",
                       stage=STAGE_PREVERIFY_TARGETED, duration_seconds=1.0,
                       command="pytest tests/test_widget.py", repo_root=repo)
        with pytest.raises(ValueError):
            record_run(sessions_dir, self.SUITE, "passed",
                       stage=STAGE_FINAL_FULL, duration_seconds=1.0,
                       policy=POLICY_TARGETED, repo_root=repo)

        record_run(
            sessions_dir, self.SUITE, "passed", stage=STAGE_PREVERIFY_TARGETED,
            duration_seconds=1.0, command="pytest tests/test_widget.py",
            policy=POLICY_TARGETED, policy_reason="names all 1 selected",
            selected_tests=(("tests/test_widget.py", "module-ownership"),),
            repo_root=repo,
        )
        stored = read_records(repo)[-1]
        assert stored.command == "pytest tests/test_widget.py"
        assert stored.policy == POLICY_TARGETED
        assert stored.selected_tests == (
            ("tests/test_widget.py", "module-ownership"),
        )

    def test_a_final_full_run_binds_to_the_tree_it_ran_against(
        self, sandbox_repo
    ):
        repo, sessions_dir = sandbox_repo
        record_run(sessions_dir, self.SUITE, "passed", stage=STAGE_FINAL_FULL,
                   duration_seconds=1.0, repo_root=repo)
        assert self._verdict(repo, sessions_dir).passed

        (repo / "widget.py").write_text("W = 1\n", encoding="utf-8")
        verdict = self._verdict(repo, sessions_dir)
        assert not verdict.passed


def test_the_run_of_record_recipe_names_what_stands_before_a_close():
    """A verified session is not a closeable one. The message that says so
    must name the complete run, its record, and the push -- a message that
    stopped at "verified" is how a close gets attempted two steps early."""
    from ai_router.test_evidence import run_of_record_recipe

    text = run_of_record_recipe("docs/session-sets/s", "python",
                                "python -m pytest")
    assert "python -m pytest" in text
    assert f"--stage {STAGE_FINAL_FULL}" in text
    assert "git push" in text
    assert "ai_router.session close" in text
