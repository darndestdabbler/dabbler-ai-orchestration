"""Set 119 S3 — close-mandated writes as a CATEGORY, not a fourth list entry.

The bug: ``cite_lessons`` is MANDATED by the constitution in the final
commit, and its ``last-used-set`` bump staled the verification stamp that
had just passed — so the close backstop bought a fresh metered round to
re-verify a tree whose source, tests and docs were byte-identical.

Two things are pinned here, and only the second one is the deliverable.

1. The instance: a trailer bump no longer stales the digest, and a
   substantive edit to the same file still does.

2. **The class**, which is the spec's stated acceptance test — *would a
   fifth close-mandated writer, in either scope, be excluded without
   editing a list?* Every ``synthetic`` test below answers it by
   declaring a brand-new writer in a throwaway package tree and asserting
   the exemption lands with nothing in ``verification_stamp`` edited.

L-112-1: each rule gets a planted violation AND a planted look-alike.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

import cite_lessons
import guidance_ledger
import verification_stamp as vstamp
from tests.stamp_fixtures import write_stamped_evidence
from verification_stamp import (
    BOUND_WHOLE_FILE,
    CLOSE_MANDATED_DECLARATION,
    CloseMandatedWrite,
    close_mandated_excludes,
    close_mandated_normalizer,
    compute_work_diff_sha256,
    discover_close_mandated_writes,
    validate_stamped_row,
)

LESSON = (
    "## A Lesson\n"
    '<!-- lesson: id="L-119-1" added-set="119" scope="portable" -->\n'
    "\n"
    "- The lesson's prose, which is session WORK and must keep binding.\n"
)


def _write_package(tmp_path: Path, name: str, body: str) -> Path:
    pkg = tmp_path / "pkg"
    pkg.mkdir(exist_ok=True)
    (pkg / f"{name}.py").write_text(body, encoding="utf-8")
    return pkg


def _decl(**over) -> str:
    entry = {
        "path": "docs/planning/notes.md",
        "scope": "repo",
        "bound": BOUND_WHOLE_FILE,
        "reason": "written by the close-out procedure",
    }
    entry.update(over)
    return f"{CLOSE_MANDATED_DECLARATION} = (\n    {entry!r},\n)\n"


# --- discovery: the category, declared by the writer ---------------------


class TestAFifthWriterNeedsNoEditHere:
    """The spec's acceptance test, asked of both scopes and both bounds."""

    def test_a_synthetic_repo_scoped_writer_is_discovered(self, tmp_path):
        pkg = _write_package(tmp_path, "fifth_writer", _decl())
        found = discover_close_mandated_writes(str(pkg))
        assert [(d.path, d.scope, d.declared_by) for d in found] == [
            ("docs/planning/notes.md", "repo", "fifth_writer")
        ]

    def test_a_synthetic_set_scoped_writer_is_discovered(self, tmp_path):
        pkg = _write_package(
            tmp_path, "sixth_writer", _decl(scope="set", path="hand-off.json")
        )
        found = discover_close_mandated_writes(str(pkg))
        assert found[0].scope == "set"
        assert close_mandated_excludes("docs/session-sets/x", str(pkg)) == [
            "docs/session-sets/x/hand-off.json"
        ]

    def test_a_set_scoped_pattern_is_dropped_when_no_set_is_in_play(
        self, tmp_path
    ):
        """The look-alike: a per-set name must never apply repo-wide.

        ``hand-off.json`` anywhere else in the repo is ordinary work.
        """
        pkg = _write_package(
            tmp_path, "seventh_writer", _decl(scope="set", path="hand-off.json")
        )
        assert close_mandated_excludes(None, str(pkg)) == []

    def test_a_repo_scoped_pattern_needs_no_session_set(self, tmp_path):
        pkg = _write_package(tmp_path, "eighth_writer", _decl())
        assert close_mandated_excludes(None, str(pkg)) == [
            "docs/planning/notes.md"
        ]

    def test_discovery_never_imports_the_declaring_module(self, tmp_path):
        """Discovery runs on the close path; an import there is a side effect.

        The planted module raises at import time, so a discovery that
        imported it would fail loudly instead of returning the entry.
        """
        pkg = _write_package(
            tmp_path,
            "exploding_writer",
            "raise RuntimeError('imported!')\n" + _decl(),
        )
        found = discover_close_mandated_writes(str(pkg))
        assert found[0].path == "docs/planning/notes.md"

    def test_a_module_without_the_declaration_contributes_nothing(
        self, tmp_path
    ):
        pkg = _write_package(tmp_path, "quiet_writer", "X = 1\n")
        assert discover_close_mandated_writes(str(pkg)) == ()


class TestAMalformedDeclarationFailsClosed:
    """A writer that declares an exemption it does not get is the silent
    no-op this mechanism replaces. Every shape refuses loudly."""

    @pytest.mark.parametrize(
        "body",
        [
            f"{CLOSE_MANDATED_DECLARATION} = ({{'path': 'a.md'}},)",
            f"{CLOSE_MANDATED_DECLARATION} = ('a.md',)",
            f"{CLOSE_MANDATED_DECLARATION} = 'a.md'",
        ],
    )
    def test_malformed_shapes_raise(self, tmp_path, body):
        pkg = _write_package(tmp_path, "broken_writer", body + "\n")
        with pytest.raises(ValueError):
            discover_close_mandated_writes(str(pkg))

    def test_an_unknown_scope_raises(self, tmp_path):
        pkg = _write_package(
            tmp_path, "wrong_scope_writer", _decl(scope="global")
        )
        with pytest.raises(ValueError, match="scope must be one of"):
            discover_close_mandated_writes(str(pkg))

    def test_an_unresolvable_bound_raises(self, tmp_path):
        pkg = _write_package(
            tmp_path, "wrong_bound_writer", _decl(bound="normalize_it")
        )
        with pytest.raises(ValueError, match="bound must be"):
            discover_close_mandated_writes(str(pkg))

    def test_a_non_literal_declaration_raises(self, tmp_path):
        """Not readable without importing -> refuse, never import to find out."""
        pkg = _write_package(
            tmp_path,
            "computed_writer",
            f"import os\n{CLOSE_MANDATED_DECLARATION} = tuple(os.environ)\n",
        )
        with pytest.raises(ValueError, match="not a literal"):
            discover_close_mandated_writes(str(pkg))


# --- the declaration this repo actually ships ----------------------------


class TestCiteLessonsDeclaresItsOwnWrites:
    def test_the_ledger_is_declared_repo_scoped_whole_file(self):
        declared = {
            d.path: d
            for d in discover_close_mandated_writes()
            if d.declared_by == "cite_lessons"
        }
        assert set(declared) == {"docs/planning/guidance-usage.json"}
        for d in declared.values():
            assert d.scope == "repo"
            assert d.bound == BOUND_WHOLE_FILE

    def test_the_literal_path_matches_guidance_ledger(self):
        """The declaration is a literal (it is read without importing), so
        the one thing a literal can do wrong is drift from its source."""
        assert {d["path"] for d in cite_lessons.CLOSE_MANDATED_WRITES} == {
            guidance_ledger.GUIDANCE_LEDGER_RELPATH
        }

    def test_the_preload_documents_are_no_longer_exempt_at_all(self):
        """PLANTED LOOK-ALIKE, and the whole point of the Set 121 S2 move.

        Prose in a PRELOAD document is work, and work binds. Before the
        move these two files carried a surgical exemption because the
        close was entitled to bump one trailer field in them; nothing
        writes them at close any more, so they must have NO exemption --
        a strictly stronger position than the normalizer they replaced.
        """
        exempt = close_mandated_excludes("docs/session-sets/x")
        for path in (
            "docs/planning/lessons-learned.md",
            "docs/planning/lessons-archive.md",
        ):
            assert path not in exempt
            assert f"docs/session-sets/x/{path}" not in exempt
            assert close_mandated_normalizer(path) is None

    def test_the_ledger_needs_no_normalizer(self):
        """A whole-file bound resolves to no normalizer by construction."""
        assert close_mandated_normalizer(
            guidance_ledger.GUIDANCE_LEDGER_RELPATH
        ) is None
        assert guidance_ledger.GUIDANCE_LEDGER_RELPATH in close_mandated_excludes(
            "docs/session-sets/x"
        )

    def test_an_unrelated_path_resolves_to_no_normalizer(self):
        assert close_mandated_normalizer("ai_router/close_session.py") is None
        assert close_mandated_normalizer("docs/planning/project-guidance.md") is None


# --- end to end, against a real git repo ---------------------------------


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True,
                   capture_output=True)


def _write(path: Path, text: str) -> None:
    """LF on disk, like every tracked file in this repo — and like what
    ``cite_lessons`` writes back (``newline=""`` over text it split on
    ``\\n``). A CRLF fixture would model a tree this repo does not have
    and turn the citation into a whole-file rewrite."""
    path.write_text(text, encoding="utf-8", newline="\n")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / "docs" / "planning").mkdir(parents=True)
    (root / "docs" / "session-sets" / "119-x").mkdir(parents=True)
    (root / "ai_router").mkdir()
    _write(root / "docs" / "planning" / "lessons-learned.md", LESSON)
    _write(root / "ai_router" / "thing.py", "X = 1\n")
    _git(root, "init", "-q")
    _git(root, "config", "user.email", "t@example.com")
    _git(root, "config", "user.name", "t")
    _git(root, "add", "-A")
    _git(root, "commit", "-qm", "base")
    return root


def _digest(repo: Path, base: str = "HEAD") -> str:
    return compute_work_diff_sha256(
        repo / "docs" / "session-sets" / "119-x", base
    )


class TestTheStampSurvivesTheCloseMandatedWrite:
    """The spec's falsifier pair, end to end on the real declaration."""

    def test_a_cite_lessons_bump_does_not_move_the_digest(self, repo):
        """PLANTED: exactly what Set 119 S2's own close hit.

        The session verified clean, then ran the close-mandated
        ``cite_lessons``; the stamp went stale and the backstop wanted a
        fresh metered round. Zero substantive change -> zero digest
        change -> zero fresh rounds.
        """
        before = _digest(repo)
        assert cite_lessons.main(
            ["--set", "120", "--session", "2", "L-119-1", "--repo-root", str(repo)]
        ) == 0
        ledger = (repo / "docs" / "planning" / "guidance-usage.json").read_text(
            encoding="utf-8"
        )
        assert '"120-02"' in ledger  # the write really happened
        assert _digest(repo) == before

    def test_a_prose_edit_to_the_same_file_still_stales_it(self, repo):
        """PLANTED LOOK-ALIKE: the exemption must not become a hole.

        Rewriting a PRELOAD document after the round that reviewed it is
        exactly what must keep staling the stamp — and since Set 121 S2
        that document has no exemption at all, so this holds a fortiori.
        """
        before = _digest(repo)
        path = repo / "docs" / "planning" / "lessons-learned.md"
        _write(path, LESSON + "\n- A sentence nobody reviewed.\n")
        assert _digest(repo) != before

    def test_a_bump_on_top_of_a_prose_edit_does_not_re_move_the_digest(
        self, repo
    ):
        """A staled digest stays put under a later mandated write, so the
        round the orchestrator then runs settles the close."""
        path = repo / "docs" / "planning" / "lessons-learned.md"
        _write(path, LESSON + "\n- A sentence nobody reviewed.\n")
        after_work = _digest(repo)
        assert cite_lessons.main(
            ["--set", "120", "--session", "2", "L-119-1", "--repo-root", str(repo)]
        ) == 0
        assert _digest(repo) == after_work

    def test_ordinary_work_still_moves_the_digest(self, repo):
        before = _digest(repo)
        _write(repo / "ai_router" / "thing.py", "X = 2\n")
        assert _digest(repo) != before

    def test_a_new_guidance_file_is_not_silently_exempt(self, repo):
        """A file absent from the base is new work, normalizer or not."""
        before = _digest(repo)
        _write(repo / "docs" / "planning" / "lessons-archive.md", LESSON)
        assert _digest(repo) != before

    def test_deleting_a_guidance_file_still_stales(self, repo):
        before = _digest(repo)
        (repo / "docs" / "planning" / "lessons-learned.md").unlink()
        assert _digest(repo) != before

    def test_a_synthetic_fifth_writer_is_exempt_end_to_end(
        self, repo, monkeypatch
    ):
        """The class, proven through the digest rather than the parser.

        A declaration that does not exist in this package at all — the
        fifth writer — reaches ``compute_work_diff_sha256`` and exempts
        its artifact, with nothing in ``verification_stamp`` edited.
        """
        synthetic = (
            CloseMandatedWrite(
                path="docs/close-out-receipt.txt",
                scope="repo",
                bound=BOUND_WHOLE_FILE,
                reason="written by a writer this package has never heard of",
                declared_by="fifth_writer",
            ),
        )
        monkeypatch.setattr(
            vstamp, "discover_close_mandated_writes", lambda *_a, **_k: synthetic
        )
        before = _digest(repo)
        _write(repo / "docs" / "close-out-receipt.txt", "closed at 12:00\n")
        assert _digest(repo) == before
        # ...and the look-alike beside it is untouched.
        _write(repo / "docs" / "other-receipt.txt", "x\n")
        assert _digest(repo) != before


class TestTheGateItselfStillSettlesTheClose:
    """The spec's falsifier, at the surface that decides: *a passed round
    plus a ``cite_lessons`` write must settle the close with ZERO fresh
    metered rounds.*

    ``validate_stamped_row`` is that surface — it is what the close gate
    and the backstop's skip predicate consult, and its freshness clause
    is what sent Set 119 S2's own close looking for another round.
    """

    def _row(self, repo: Path) -> dict:
        return write_stamped_evidence(
            repo / "docs" / "session-sets" / "119-x", session_number=1
        )

    def _validate(self, repo: Path, row: dict):
        return validate_stamped_row(
            row,
            session_set_dir=str(repo / "docs" / "session-sets" / "119-x"),
            session_number=1,
            orchestrator_effective_provider="anthropic",
        )

    def test_the_stamp_survives_the_close_mandated_citation(self, repo):
        row = self._row(repo)
        assert self._validate(repo, row)[0]

        assert cite_lessons.main(
            ["--set", "120", "--session", "2", "L-119-1", "--repo-root", str(repo)]
        ) == 0

        ok, reason = self._validate(repo, row)
        assert ok, (
            "a close-mandated cite_lessons write staled the round that had "
            f"just passed, so the backstop would buy another one: {reason}"
        )

    def test_the_stamp_still_goes_stale_on_real_post_round_work(self, repo):
        row = self._row(repo)
        assert self._validate(repo, row)[0]

        _write(
            repo / "docs" / "planning" / "lessons-learned.md",
            LESSON + "\n- A sentence nobody reviewed.\n",
        )

        ok, reason = self._validate(repo, row)
        assert not ok
        assert "work changed after this row was stamped" in reason
