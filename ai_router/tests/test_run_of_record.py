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
            session_number=2, detail="35 passed", repo_root=str(root),
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
            str(set_dir), SUITE, ror.OUTCOME_FAILED, repo_root=str(root)
        )
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED, repo_root=str(root)
        )
        records = ror.read_records(str(set_dir))
        assert [r.outcome for r in records] == ["failed", "passed"]

    def test_rejects_an_unknown_outcome(self, repo):
        root, set_dir = repo
        with pytest.raises(ValueError):
            ror.record_run(
                str(set_dir), SUITE, "greenish", repo_root=str(root)
            )

    def test_raises_when_the_surface_cannot_be_digested(self, tmp_path):
        with pytest.raises(RuntimeError):
            ror.record_run(
                str(tmp_path), SUITE, ror.OUTCOME_PASSED,
                repo_root=str(tmp_path / "not-a-repo"),
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


class TestSessionTouched:
    def test_matches_a_path_under_the_prefix(self):
        assert ror.session_touched("", ("src/",), ["src/a.ts"])

    def test_does_not_match_a_sibling_prefix(self):
        """`src/` must not match `srcolder/`."""
        assert not ror.session_touched("", ("src/",), ["srcolder/a.ts"])

    def test_normalises_windows_separators(self):
        assert ror.session_touched("", ("src/",), ["src\\nested\\a.ts"])

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
            str(set_dir), SUITE, ror.OUTCOME_PASSED, repo_root=str(root)
        )
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [SUITE], repo_root=str(root)
        )
        assert v.passed, v.reason

    def test_the_set_110_s3_pattern_is_refused(self, repo):
        """Green run, then a code change, then a close attempt."""
        root, set_dir = repo
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED, repo_root=str(root)
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
            str(set_dir), SUITE, ror.OUTCOME_FAILED, repo_root=str(root)
        )
        (v,) = ror.evaluate_freshness(
            str(set_dir), ["src/a.ts"], [SUITE], repo_root=str(root)
        )
        assert v.required and not v.passed
        assert "green" in v.reason

    def test_re_running_after_the_change_restores_freshness(self, repo):
        root, set_dir = repo
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED, repo_root=str(root)
        )
        (root / "src" / "a.ts").write_text("export const a = 3;\n", encoding="utf-8")
        ror.record_run(
            str(set_dir), SUITE, ror.OUTCOME_PASSED, repo_root=str(root)
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
            str(set_dir), SUITE, ror.OUTCOME_PASSED, repo_root=str(root)
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
            ]
        )
        assert code == 2
        assert "unknown suite" in capsys.readouterr().err

    def test_suites_lists_the_declared_suites(self, capsys):
        assert ror.run(["suites"]) == 0
        out = capsys.readouterr().out
        assert "playwright" in out and "expensive" in out
