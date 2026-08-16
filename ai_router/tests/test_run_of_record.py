"""Tests for the test run-of-record and its freshness gate (Set 111 S4).

The load-bearing case is the Set 110 S3 pattern: a full suite run that was
green, then invalidated by a later code change, then presented at close as
if it still covered the work.
"""

from __future__ import annotations

import json
import subprocess

import pytest

from ai_router import run_of_record as ror


def _git(repo, *args):
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
    )


@pytest.fixture()
def repo(tmp_path):
    """A tiny git repo with a covered surface and a session-set dir."""
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "t@example.com")
    _git(tmp_path, "config", "user.name", "T")
    src = tmp_path / "src"
    src.mkdir()
    (src / "a.ts").write_text("export const a = 1;\n", encoding="utf-8")
    (src / "b.ts").write_text("export const b = 2;\n", encoding="utf-8")
    other = tmp_path / "docs"
    other.mkdir()
    (other / "note.md").write_text("hi\n", encoding="utf-8")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-qm", "init")
    set_dir = tmp_path / "docs" / "session-sets" / "001-x"
    set_dir.mkdir(parents=True)
    return tmp_path, set_dir


SUITE = ror.SuiteSpec(
    name="playwright",
    command="npm run test:playwright",
    covers=("src/",),
    expensive=True,
)
CHEAP = ror.SuiteSpec(
    name="mocha", command="npm test", covers=("src/",), expensive=False
)


class TestSurfaceDigest:
    def test_is_stable_across_calls(self, repo):
        root, _ = repo
        d1 = ror.surface_digest(str(root), ("src/",))
        d2 = ror.surface_digest(str(root), ("src/",))
        assert d1 is not None and d1 == d2

    def test_changes_when_a_covered_file_changes(self, repo):
        root, _ = repo
        before = ror.surface_digest(str(root), ("src/",))
        (root / "src" / "a.ts").write_text("export const a = 99;\n", encoding="utf-8")
        assert ror.surface_digest(str(root), ("src/",)) != before

    def test_ignores_changes_outside_the_covered_prefix(self, repo):
        root, _ = repo
        before = ror.surface_digest(str(root), ("src/",))
        (root / "docs" / "note.md").write_text("changed\n", encoding="utf-8")
        assert ror.surface_digest(str(root), ("src/",)) == before

    def test_sees_a_new_untracked_covered_file(self, repo):
        """An untracked deliverable is invisible to `git diff` (L-064-9)."""
        root, _ = repo
        before = ror.surface_digest(str(root), ("src/",))
        (root / "src" / "c.ts").write_text("export const c = 3;\n", encoding="utf-8")
        assert ror.surface_digest(str(root), ("src/",)) != before

    def test_sees_a_deletion(self, repo):
        root, _ = repo
        before = ror.surface_digest(str(root), ("src/",))
        (root / "src" / "b.ts").unlink()
        assert ror.surface_digest(str(root), ("src/",)) != before

    def test_empty_covers_returns_none(self, repo):
        root, _ = repo
        assert ror.surface_digest(str(root), ()) is None

    def test_non_repo_returns_none(self, tmp_path):
        assert ror.surface_digest(str(tmp_path / "nope"), ("src/",)) is None


class TestRecordRun:
    def test_appends_a_record(self, repo):
        root, set_dir = repo
        rec = ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            session_number=2, detail="35 passed", duration_seconds=1.0,
            repo_root=str(root),
        )
        assert rec.suite == "playwright"
        lines = (set_dir / ror.TEST_RUNS_FILENAME).read_text(
            encoding="utf-8"
        ).strip().split("\n")
        assert len(lines) == 1
        assert json.loads(lines[0])["sessionNumber"] == 2

    def test_a_rerun_appends_rather_than_rewrites(self, repo):
        root, set_dir = repo
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_FAILED,
            duration_seconds=1.0, repo_root=str(root),
        )
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        records = ror.read_records(str(set_dir))
        assert [r.outcome for r in records] == ["failed", "passed"]

    def test_rejects_an_unknown_outcome(self, repo):
        root, set_dir = repo
        with pytest.raises(ValueError):
            ror.record_run(
                str(set_dir), SUITE, "greenish",
                duration_seconds=1.0, repo_root=str(root),
            )

    def test_raises_when_the_surface_cannot_be_digested(self, tmp_path):
        with pytest.raises(RuntimeError):
            ror.record_run(
                str(tmp_path), SUITE, ror.OUTCOME_PASSED,
                duration_seconds=1.0,
                repo_root=str(tmp_path / "not-a-repo"),
            )

    def test_records_a_structured_duration(self, repo):
        """Set 116 S1: durationSeconds is a real field, not a detail-string grep."""
        root, set_dir = repo
        rec = ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=234.55, repo_root=str(root),
        )
        assert rec.duration_seconds == 234.55
        line = (set_dir / ror.TEST_RUNS_FILENAME).read_text(
            encoding="utf-8"
        ).strip()
        assert json.loads(line)["durationSeconds"] == 234.55

    def test_duration_seconds_is_required(self, repo):
        """Set 116 S1 round-2 remediation-review: an optional duration at
        the write boundary never gets populated. record_run() itself
        requires it now, not just the CLI -- so every new record, from
        any caller, carries a real measurement."""
        root, set_dir = repo
        with pytest.raises(TypeError):
            ror.record_run(
                str(set_dir), SUITE, ror.OUTCOME_PASSED, repo_root=str(root)
            )

    def test_rejects_a_non_positive_duration(self, repo):
        root, set_dir = repo
        with pytest.raises(ValueError):
            ror.record_run(
                str(set_dir), SUITE, ror.OUTCOME_PASSED,
                duration_seconds=0, repo_root=str(root),
            )

    @pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf"), True])
    def test_rejects_non_finite_or_boolean_durations(self, repo, bad):
        """Round-1 verification nit: NaN/Infinity survive `<= 0` unscathed
        and json.dumps() would emit them as non-standard JSON tokens; a
        bool duration_seconds=True would silently record 1.0 second."""
        root, set_dir = repo
        with pytest.raises(ValueError):
            ror.record_run(
                str(set_dir), SUITE, ror.OUTCOME_PASSED,
                duration_seconds=bad, repo_root=str(root),
            )


class TestReadRecords:
    def test_skips_a_malformed_line_without_losing_the_good_ones(self, repo):
        _root, set_dir = repo
        path = set_dir / ror.TEST_RUNS_FILENAME
        path.write_text(
            '{"suite":"playwright","surfaceDigest":"abc"}\n'
            "not json at all\n"
            '{"no_suite_key": true}\n'
            '{"suite":"playwright","surfaceDigest":"def"}\n',
            encoding="utf-8",
        )
        records = ror.read_records(str(set_dir))
        assert [r.surface_digest for r in records] == ["abc", "def"]

    def test_missing_file_is_empty(self, repo):
        _root, set_dir = repo
        assert ror.read_records(str(set_dir)) == []

    def test_reads_back_the_structured_duration(self, repo):
        _root, set_dir = repo
        path = set_dir / ror.TEST_RUNS_FILENAME
        path.write_text(
            '{"suite":"playwright","surfaceDigest":"abc","durationSeconds":9.6}\n',
            encoding="utf-8",
        )
        records = ror.read_records(str(set_dir))
        assert records[0].duration_seconds == 9.6

    def test_a_non_numeric_duration_is_dropped_not_crashed_on(self, repo):
        _root, set_dir = repo
        path = set_dir / ror.TEST_RUNS_FILENAME
        path.write_text(
            '{"suite":"playwright","surfaceDigest":"abc","durationSeconds":"fast"}\n',
            encoding="utf-8",
        )
        records = ror.read_records(str(set_dir))
        assert records[0].duration_seconds is None


class TestFreshnessAndEvidence:
    """Set 116 S1: test-runs.jsonl joins decisions.jsonl and checklist-posts.jsonl
    as a freshness-exempt bookkeeping ledger -- "run the full suite last" must
    not stale the verification round that just passed.
    """

    def test_the_run_ledger_is_freshness_exempt(self):
        from ai_router.verification_stamp import WORK_DIFF_SET_BOOKKEEPING

        assert ror.TEST_RUNS_FILENAME in WORK_DIFF_SET_BOOKKEEPING

    def test_the_run_ledger_stays_visible_to_the_verifier(self):
        """Set 116 S1 round-2 remediation-review: a reviewer asked to
        corroborate a parity/duration claim must be able to see the ledger
        that backs it, or the claim is unverifiable by construction --
        exactly the rejection Session 1's own round-2 review raised."""
        from ai_router.verification_stamp import (
            EVIDENCE_VISIBLE_BOOKKEEPING,
            PHASED_EVIDENCE_SET_EXCLUDES,
        )

        assert ror.TEST_RUNS_FILENAME in EVIDENCE_VISIBLE_BOOKKEEPING
        assert ror.TEST_RUNS_FILENAME not in PHASED_EVIDENCE_SET_EXCLUDES

    def test_the_filename_has_exactly_one_spelling(self):
        from ai_router.verification_stamp import (
            EVIDENCE_VISIBLE_BOOKKEEPING,
            WORK_DIFF_SET_BOOKKEEPING,
        )

        assert ror.TEST_RUNS_FILENAME == "test-runs.jsonl"
        assert sum(
            1 for n in WORK_DIFF_SET_BOOKKEEPING if n == ror.TEST_RUNS_FILENAME
        ) == 1
        assert sum(
            1 for n in EVIDENCE_VISIBLE_BOOKKEEPING if n == ror.TEST_RUNS_FILENAME
        ) == 1

    def test_recording_a_run_does_not_change_the_work_diff_digest(
        self, tmp_path
    ):
        """The concrete failure this exemption prevents: running the full
        suite last (the constitution's own Step 5 order) must not stale the
        stamp a verifier just signed off on."""
        import subprocess

        from ai_router.verification_stamp import compute_work_diff_sha256
        from pathlib import Path

        root = tmp_path / "repo"
        root.mkdir()

        def _git(*args):
            subprocess.run(
                ["git", *args], cwd=str(root), capture_output=True, check=True
            )

        _git("init", "-b", "main")
        _git("config", "user.email", "t@example.invalid")
        _git("config", "user.name", "T")
        (root / "README.md").write_text("x\n", encoding="utf-8")
        _git("add", "-A")
        _git("commit", "-m", "base")

        set_dir = root / "docs" / "session-sets" / "116-fixture"
        set_dir.mkdir(parents=True)

        before = compute_work_diff_sha256(Path(set_dir), "HEAD")
        assert before is not None
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=234.55, repo_root=str(root),
        )
        after = compute_work_diff_sha256(Path(set_dir), "HEAD")
        assert after == before

        # ...while real work in the same directory still binds.
        (set_dir / "spec.md").write_text("changed\n", encoding="utf-8")
        assert compute_work_diff_sha256(Path(set_dir), "HEAD") != before


class TestSessionTouched:
    def test_matches_a_path_under_the_prefix(self):
        assert ror.session_touched("", ("src/",), ["src/a.ts"])

    def test_does_not_match_a_sibling_prefix(self):
        """`src/` must not match `srcolder/`."""
        assert not ror.session_touched("", ("src/",), ["srcolder/a.ts"])

    def test_normalises_windows_separators(self):
        assert ror.session_touched("", ("src/",), ["src\\nested\\a.ts"])

    def test_normalises_windows_separators_on_every_platform(self, monkeypatch):
        """The normalisation must not depend on the HOST separator.

        The original implementation normalised with ``os.sep``, so on a
        posix runner (``os.sep == "/"``) a Windows-authored path was left
        untouched and matched nothing. The required CI matrix runs ubuntu
        and macOS, so that made this repo's own test red everywhere the
        developer machine could not see.
        """
        monkeypatch.setattr(ror.os, "sep", "/")
        assert ror.session_touched("", ("src/",), ["src\\nested\\a.ts"])

    def test_normalises_windows_separators_in_covers_too(self, monkeypatch):
        monkeypatch.setattr(ror.os, "sep", "/")
        assert ror.session_touched("", ("src\\nested",), ["src/nested/a.ts"])


class TestDefaultSuiteCoverage:
    """The expensive-suite map must cover every surface the policy names.

    The authoring guide's non-negotiable Layer 3 list is four surfaces:
    the Explorer rendering surface, a state-file writer, the extension
    manifest, and the fixture harness. The map originally carried only the
    first and third, so a session that changed a sanctioned writer or the
    harness staging the fixtures could close with Playwright reported "not
    required" — the exact rendering-regression class the static gates and
    Layer 2 cannot see.
    """

    @staticmethod
    def _playwright():
        (suite,) = [s for s in ror.DEFAULT_SUITES if s.name == "playwright"]
        return suite

    @pytest.mark.parametrize(
        "changed",
        [
            "ai_router/session_state.py",
            "ai_router/start_session.py",
            "ai_router/close_session.py",
            "ai_router/tests/e2e/harness_cli.py",
            "tools/dabbler-ai-orchestration/scripts/stage-walk.js",
            "tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/x.json",
            "tools/dabbler-ai-orchestration/src/extension.ts",
            "tools/dabbler-ai-orchestration/package.json",
            "tools/dabbler-ai-orchestration/media/icon.svg",
        ],
    )
    def test_policy_named_surfaces_require_layer_3(self, changed):
        assert ror.session_touched("", self._playwright().covers, [changed])

    @pytest.mark.parametrize(
        "changed",
        [
            "docs/planning/project-guidance.md",
            "README.md",
            "CONTRIBUTING.md",
        ],
    )
    def test_unrelated_surfaces_do_not_require_layer_3(self, changed):
        """Widening must not become "every change pays 13 minutes"."""
        assert not ror.session_touched("", self._playwright().covers, [changed])

    def test_a_router_module_now_DOES_require_layer_3(self):
        """Set 129 S1 moved this case across the line, and the move is the
        point rather than a casualty of it.

        `ai_router/notifications.py` used to be listed here as an
        unrelated surface, because Layer 3 declared three router files by
        name on the reasoning that a 13-minute suite armed by every router
        edit would get routed around. Cross-provider verification found
        the premise false: `vsix-first-run-walkthrough.spec.ts` sets
        `DABBLER_ROUTER_INSTALL_SPEC` to the repo root, so the cold-start
        walk `pip install -e`s this tree and drives the router it just
        built -- Set 122 S2's structurally-red walk is the incident.

        The boundary above still exists and still matters; what changed is
        which side the router sits on.
        """
        assert ror.session_touched(
            "", self._playwright().covers, ["ai_router/notifications.py"]
        )

    def test_the_playwright_suite_is_still_the_expensive_one(self):
        assert self._playwright().expensive is True


class TestEverySuiteIsGoverned:
    """Set 116 S3 — the operator's repair of gate (c).

    `test_run_fresh` is one of the three gates the ruling kept, and it
    was broken: `expensive` is the flag that decides whether the gate
    has an opinion at all, and pytest and mocha carried False. So the
    once-per-session-after-the-last-code-change rule never governed the
    14-minute suite it was written for, and Set 112 S3 ran 15 suites
    across 186 minutes unremarked.
    """

    @staticmethod
    def _suite(name):
        (suite,) = [s for s in ror.DEFAULT_SUITES if s.name == name]
        return suite

    @pytest.mark.parametrize("name", ["pytest", "mocha", "playwright"])
    def test_all_three_layers_are_expensive(self, name):
        assert self._suite(name).expensive is True

    def test_pytest_covers_the_router(self):
        assert ror.session_touched(
            "", self._suite("pytest").covers, ["ai_router/gate_checks.py"]
        )

    def test_pytest_records_the_parallel_command(self):
        """Set 116 S1 made `-n auto` the default and proved parity. A
        run of record that names the serial command is recording a run
        nobody performs."""
        assert "-n auto" in self._suite("pytest").command

    @pytest.mark.parametrize(
        "changed",
        [
            "docs/planning/project-guidance.md",
            "README.md",
            "CONTRIBUTING.md",
        ],
    )
    def test_a_session_outside_every_covers_prefix_owes_nothing(
        self, changed, repo
    ):
        """The other half of the operator's instruction, and the reason
        making every layer expensive is affordable: scoping is by
        touched surface, so a session that touched nothing under any
        suite's `covers` still owes no suite at all. Widening
        `expensive` must not become "every change pays"."""
        _root, set_dir = repo
        verdicts = ror.evaluate_freshness(
            set_dir, [changed], ror.DEFAULT_SUITES
        )
        assert verdicts, "expensive suites must still be evaluated"
        assert not [v for v in verdicts if v.required]

    @pytest.mark.parametrize(
        "changed",
        ["ai_router/docs/close-out.md", "ai_router/CHANGELOG.md"],
    )
    def test_docs_UNDER_a_covers_prefix_do_owe_that_suite(
        self, changed, repo
    ):
        """The boundary, pinned, because the loose phrasing of the rule
        ("a docs-only session owes nothing") is false here and both
        round-1 verification lenses said so independently.

        `covers` is a path prefix, not a file type: `pytest` covers
        `ai_router/`, so documentation living under it owes a pytest
        run. Asserting only the exempt side would let someone "fix" the
        wording by narrowing `covers` and never notice they had made
        the gate skippable by putting code in a docs-named folder.
        """
        _root, set_dir = repo
        verdicts = ror.evaluate_freshness(
            set_dir, [changed], ror.DEFAULT_SUITES
        )
        pytest_verdict = next(v for v in verdicts if v.suite == "pytest")
        assert pytest_verdict.required is True

    def test_a_router_change_now_owes_pytest(self, repo):
        """The falsifier for the repair. Before Set 116 S3 this returned
        `required=False` for pytest no matter what changed, because the
        suite was declared cheap — a gate that could never fire looks
        exactly like a gate with nothing to say."""
        _root, set_dir = repo
        verdicts = ror.evaluate_freshness(
            set_dir, ["ai_router/close_session.py"], ror.DEFAULT_SUITES
        )
        pytest_verdict = next(v for v in verdicts if v.suite == "pytest")
        assert pytest_verdict.required is True
        assert pytest_verdict.passed is False
        assert "no run of record exists" in pytest_verdict.reason

    def test_matches_an_exact_file_prefix(self):
        assert ror.session_touched(
            "", ("tools/x/package.json",), ["tools/x/package.json"]
        )

    def test_empty_changes_touch_nothing(self):
        assert not ror.session_touched("", ("src/",), [])


class TestEvaluateFreshness:
    def test_untouched_surface_is_not_required(self, repo):
        root, set_dir = repo
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["docs/note.md"], [SUITE], repo_root=str(root)
        )
        assert v.required is False and v.passed is True

    def test_touched_surface_with_no_record_fails(self, repo):
        root, set_dir = repo
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [SUITE], repo_root=str(root)
        )
        assert v.required and not v.passed
        assert "no run of record" in v.reason

    def test_fresh_green_record_passes(self, repo):
        root, set_dir = repo
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [SUITE], repo_root=str(root)
        )
        assert v.passed, v.reason

    def test_the_set_110_s3_pattern_is_refused(self, repo):
        """Green run, then a code change, then a close attempt."""
        root, set_dir = repo
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (root / "src" / "a.ts").write_text("export const a = 3;\n", encoding="utf-8")
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [SUITE], repo_root=str(root)
        )
        assert v.required and not v.passed
        assert "PREDATES" in v.reason

    def test_a_fresh_but_red_record_fails(self, repo):
        root, set_dir = repo
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_FAILED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [SUITE], repo_root=str(root)
        )
        assert v.required and not v.passed
        assert "green" in v.reason

    def test_re_running_after_the_change_restores_freshness(self, repo):
        root, set_dir = repo
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (root / "src" / "a.ts").write_text("export const a = 3;\n", encoding="utf-8")
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [SUITE], repo_root=str(root)
        )
        assert v.passed, v.reason

    def test_cheap_suites_are_never_evaluated(self, repo):
        root, set_dir = repo
        assert ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [CHEAP], repo_root=str(root)
        ) == []

    def test_fails_closed_without_a_repo(self, tmp_path):
        (v,) = ror.evaluate_freshness(
            str(tmp_path), ["src/a.ts"], [SUITE], repo_root=None
        )
        assert v.required and not v.passed


class TestLoadSuites:
    def test_no_block_yields_the_defaults(self):
        assert ror.load_suites(None) == ror.DEFAULT_SUITES
        assert ror.load_suites({}) == ror.DEFAULT_SUITES
        assert ror.load_suites({"testing": {}}) == ror.DEFAULT_SUITES

    def test_declared_suites_replace_the_defaults(self):
        suites = ror.load_suites(
            {
                "testing": {
                    "suites": [
                        {
                            "name": "e2e",
                            "command": "run it",
                            "covers": ["app/"],
                            "expensive": True,
                        }
                    ]
                }
            }
        )
        assert [s.name for s in suites] == ["e2e"]
        assert suites[0].expensive is True

    def test_an_explicit_empty_list_disarms_rather_than_resurrecting(self):
        """An operator who declares no suites gets no suites."""
        assert ror.load_suites({"testing": {"suites": []}}) == ()

    def test_malformed_entries_are_skipped(self):
        suites = ror.load_suites(
            {
                "testing": {
                    "suites": [
                        "not a mapping",
                        {"command": "x", "covers": ["a/"]},   # no name
                        {"name": "  ", "covers": ["a/"]},      # blank name
                        {"name": "ok", "covers": []},          # empty covers
                        {"name": "ok", "covers": "a/"},        # covers not list
                        {"name": "good", "covers": ["a/"]},
                    ]
                }
            }
        )
        assert [s.name for s in suites] == ["good"]

    def test_expensive_defaults_to_false(self):
        suites = ror.load_suites(
            {"testing": {"suites": [{"name": "x", "covers": ["a/"]}]}}
        )
        assert suites[0].expensive is False


class TestCli:
    def test_check_exits_nonzero_when_stale(self, repo, capsys, monkeypatch):
        root, set_dir = repo
        monkeypatch.setattr(ror, "_load_router_config", lambda: None)
        monkeypatch.setattr(ror, "DEFAULT_SUITES", (SUITE,))
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (root / "src" / "a.ts").write_text("changed\n", encoding="utf-8")
        code = ror.run(
            [
                "check",
                "--session-set-dir", str(set_dir),
                "--files-changed", "src/a.ts",
                "--check",
            ]
        )
        assert code == 1
        assert "PREDATES" in capsys.readouterr().out

    def test_record_rejects_an_unknown_suite(self, repo, capsys, monkeypatch):
        _root, set_dir = repo
        monkeypatch.setattr(ror, "_load_router_config", lambda: None)
        code = ror.run(
            [
                "record",
                "--session-set-dir", str(set_dir),
                "--suite", "no-such-suite",
                "--duration-seconds", "1.0",
            ]
        )
        assert code == 2
        assert "unknown suite" in capsys.readouterr().err

    def test_record_requires_duration_seconds(self, repo, capsys, monkeypatch):
        """Set 116 S1 (round-1 verification): an optional field at the
        writer boundary never gets populated -- require it at the CLI."""
        _root, set_dir = repo
        monkeypatch.setattr(ror, "_load_router_config", lambda: None)
        with pytest.raises(SystemExit) as exc_info:
            ror.run(
                [
                    "record",
                    "--session-set-dir", str(set_dir),
                    "--suite", "playwright",
                    "--outcome", "passed",
                ]
            )
        assert exc_info.value.code == 2
        assert "--duration-seconds" in capsys.readouterr().err

    def test_suites_lists_the_declared_suites(self, capsys):
        assert ror.run(["suites"]) == 0
        out = capsys.readouterr().out
        assert "playwright" in out and "expensive" in out

    def test_record_accepts_and_prints_duration_seconds(
        self, repo, capsys, monkeypatch
    ):
        root, set_dir = repo
        monkeypatch.setattr(ror, "_load_router_config", lambda: None)
        monkeypatch.setattr(ror, "DEFAULT_SUITES", (SUITE,))
        code = ror.run(
            [
                "record",
                "--session-set-dir", str(set_dir),
                "--suite", "playwright",
                "--outcome", "passed",
                "--duration-seconds", "234.55",
            ]
        )
        assert code == 0
        assert "duration=234.6s" in capsys.readouterr().out
        records = ror.read_records(str(set_dir))
        assert records[-1].duration_seconds == 234.55


# ===========================================================================
# 2026-08-16 (ad-hoc, follow-on to the freshness-contract PR) — the run of
# record must honour CLOSE-MANDATED WRITES.
#
# The freshness digest, the close backstop's delta anchor and this gate all
# ask "did the work change since we checked?". The first two consult BOTH
# shared mechanisms — the bookkeeping list AND the writers' own
# close-mandated declarations. This one consulted only the list, so two files
# a writer had already declared still staled the run of record.
# ===========================================================================


class TestRunOfRecordHonoursCloseMandatedWrites:
    SET = "docs/session-sets/113-narrated-video-walkthroughs"

    def test_the_step8_critique_artifact_does_not_stale_the_run(self):
        # PLANT THE DEFECT: pull_critique writes this at Step 8, AFTER the
        # suites have been run and recorded. It is declared close-mandated,
        # and the freshness stamp has honoured that since the previous PR --
        # this gate did not.
        assert ror.is_active_set_bookkeeping(
            f"{self.SET}/path-aware-critique.json", self.SET
        )

    def test_the_close_projection_does_not_stale_the_run(self):
        # The worse of the two: close_session writes session-progress.json
        # DURING the close, so a close that has to be retried found the run
        # it had just recorded already stale.
        assert ror.is_active_set_bookkeeping(
            f"{self.SET}/session-progress.json", self.SET
        )

    def test_it_reads_the_declarations_rather_than_a_local_copy(self):
        # THE RULE, not the two instances. A THIRD writer that declares a
        # close-mandated set-scoped write must be exempt here with nothing
        # in run_of_record edited -- that is the whole point of source-level
        # discovery, and it is what stops this recurring a fourth time.
        import verification_stamp as vstamp

        declared = {
            d.path for d in vstamp.discover_close_mandated_writes()
            if d.scope == "set"
        }
        assert declared, "corpus non-empty (L-112-1): no set-scoped declarations"
        for name in declared:
            assert ror.is_active_set_bookkeeping(f"{self.SET}/{name}", self.SET), name

    def test_a_synthetic_new_writer_is_exempt_with_no_edit_here(self, tmp_path):
        # The class, proved the way test_close_mandated_writes.py proves it:
        # declare a brand-new writer in a throwaway package tree and assert
        # the exemption lands without touching this module.
        import verification_stamp as vstamp

        pkg = tmp_path / "pkg"
        pkg.mkdir()
        (pkg / "brand_new_writer.py").write_text(
            'CLOSE_MANDATED_WRITES = (\n'
            '    {\n'
            '        "path": "brand-new-artifact.json",\n'
            '        "scope": "set",\n'
            '        "bound": "whole-file",\n'
            '        "reason": "a fourth writer nobody edited a list for",\n'
            '    },\n'
            ')\n',
            encoding="utf-8",
        )
        pats = vstamp.close_mandated_excludes(self.SET, package_dir=str(pkg))
        assert f"{self.SET}/brand-new-artifact.json" in pats

    def test_the_look_alikes_still_bind(self):
        # The counterweight: exempting declared writes must not exempt the
        # set's actual work. spec.md is the contract; operator-notes.md is
        # the operator's input. Both must stale a run of record.
        for name in ("spec.md", "operator-notes.md"):
            assert not ror.is_active_set_bookkeeping(
                f"{self.SET}/{name}", self.SET
            ), name

    def test_another_sets_artifact_is_not_exempt(self):
        # The exclusion is scoped to the ACTIVE set. Another set's
        # path-aware-critique.json is an ordinary changed file -- a
        # set-number collision or a resurrected artifact there is exactly
        # what the suite is meant to catch.
        other = "docs/session-sets/999-some-other-set"
        assert not ror.is_active_set_bookkeeping(
            f"{other}/path-aware-critique.json", self.SET
        )

    def test_no_active_set_means_nothing_is_exempt_by_set_scope(self):
        # With no set in play, set-scoped patterns are dropped rather than
        # applied repo-wide (close_mandated_excludes' own contract).
        assert not ror.is_active_set_bookkeeping(
            f"{self.SET}/path-aware-critique.json", None
        )

    def test_the_digest_actually_changes_behaviour(self, tmp_path):
        # End to end through surface_digest, not just the predicate: writing
        # a declared close-mandated artifact must leave the digest EQUAL,
        # while writing spec.md must change it.
        import subprocess as sp

        repo = tmp_path / "repo"
        setd = repo / "docs" / "session-sets" / "777-x"
        setd.mkdir(parents=True)
        (setd / "spec.md").write_text("spec\n", encoding="utf-8")
        sp.run(["git", "init", "-q", str(repo)], check=True)
        sp.run(["git", "-C", str(repo), "add", "-A"], check=True)

        covers = ("docs/session-sets/",)
        before = ror.surface_digest(
            str(repo), covers, session_set_dir=str(setd))
        assert before is not None

        (setd / "path-aware-critique.json").write_text("{}\n", encoding="utf-8")
        after_artifact = ror.surface_digest(
            str(repo), covers, session_set_dir=str(setd))
        assert after_artifact == before, (
            "a declared close-mandated write staled the run of record"
        )

        (setd / "spec.md").write_text("spec CHANGED\n", encoding="utf-8")
        after_work = ror.surface_digest(
            str(repo), covers, session_set_dir=str(setd))
        assert after_work != before, "real work no longer stales the run"
