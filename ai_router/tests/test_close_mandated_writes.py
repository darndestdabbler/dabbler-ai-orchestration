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


# ===========================================================================
# 2026-08-16 (ad-hoc fix after Set 113 S6) — the freshness contract.
#
# Set 113 S6 was staled TWICE between verifying and closing, cost $0.9607 in
# rounds and an operator interruption, and the second staleness was caused by
# the document explaining the first one. Three rules, each with a planted
# violation and a planted look-alike (L-112-1).
# ===========================================================================


class TestOrchestratorEvidenceIsFreshnessExempt:
    """Rule 1: `sN-*` session evidence documents may be written after the
    round that verified the work, because they DESCRIBE that round."""

    SET = "docs/session-sets/113-narrated-video-walkthroughs"

    def _exempt(self):
        import fnmatch
        from verification_stamp import (
            WORK_DIFF_SET_BOOKKEEPING, close_mandated_excludes)
        pats = ([f"{self.SET}/{n}" for n in WORK_DIFF_SET_BOOKKEEPING]
                + close_mandated_excludes(self.SET))
        return lambda rel: any(fnmatch.fnmatch(rel, p) for p in pats)

    @pytest.mark.parametrize("name", [
        "s6-outcome.md",
        "s6-reproduction.md",
        "s6-reproduction-measurement.json",
        "s6-conventions.md",
        "s6-critique-proof.json",
        "s6-adjudication-request.md",   # the one that staled Set 113 S6 twice
        "s12-whatever-the-next-session-invents.md",
    ])
    def test_planted_evidence_document_does_not_bind(self, name):
        assert self._exempt()(f"{self.SET}/{name}"), name

    @pytest.mark.parametrize("name", [
        "spec.md",              # THE CONTRACT -- must always bind
        "operator-notes.md",    # operator input -- must always bind
        "uat-checklist.md",
        "some-deliverable.md",
    ])
    def test_the_look_alikes_still_bind(self, name):
        # A digit is required after the `s`, so `spec.md` cannot match the
        # evidence pattern however tempting the prefix looks.
        assert not self._exempt()(f"{self.SET}/{name}"), name

    def test_source_outside_the_set_dir_always_binds(self):
        exempt = self._exempt()
        for rel in ("ai_router/pull_verifier.py",
                    "ai_router/tests/test_pull_verifier.py",
                    "tools/dabbler-ai-orchestration/src/extension.ts"):
            assert not exempt(rel), rel

    def test_evidence_documents_stay_VISIBLE_to_the_verifier(self):
        # The counterweight, and the one that matters most: freshness-exemption
        # must not become evidence-exclusion. PHASED_EVIDENCE_SET_EXCLUDES is
        # DERIVED from the freshness list, so a naive addition would have
        # hidden a session's own outcome document from the round reviewing it
        # -- a verification reduction no orchestrator may self-authorize.
        from verification_stamp import (
            EVIDENCE_VISIBLE_BOOKKEEPING, PHASED_EVIDENCE_SET_EXCLUDES)
        assert "s[0-9]*-*" in EVIDENCE_VISIBLE_BOOKKEEPING
        assert "s[0-9]*-*" not in PHASED_EVIDENCE_SET_EXCLUDES

    def test_the_loops_own_round_artifacts_stay_excluded(self):
        # ...while the machine-generated round artifacts remain out of the
        # bundle. A round re-reading its predecessors' verdicts is the bias
        # that separation exists to prevent.
        from verification_stamp import PHASED_EVIDENCE_SET_EXCLUDES
        for pat in ("s*-verification*.md", "s*-issues*.json",
                    "s*-remediation-round-*.md", "s*-acceptance-round-*.json"):
            assert pat in PHASED_EVIDENCE_SET_EXCLUDES, pat


class TestPullCritiqueDeclaresItsArtifact:
    """Rule 2: the Step-8 path-aware critique artifact is a close-mandated
    write, declared by its WRITER rather than by a list somewhere else."""

    def test_the_declaration_is_discovered(self):
        from verification_stamp import discover_close_mandated_writes
        decls = {d.path: d for d in discover_close_mandated_writes()}
        assert "path-aware-critique.json" in decls
        d = decls["path-aware-critique.json"]
        assert d.scope == "set"
        assert d.whole_file is True

    def test_the_literal_agrees_with_the_constant(self):
        # The declaration is read with ast.literal_eval and WITHOUT importing
        # the module, so the path must be spelled literally -- and a literal
        # can drift from the constant it mirrors. Same guard cite_lessons has.
        import pull_critique
        from path_aware_critique import PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME
        declared = {e["path"] for e in pull_critique.CLOSE_MANDATED_WRITES}
        assert PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME in declared

    def test_the_artifact_no_longer_binds_the_digest(self):
        import fnmatch
        from verification_stamp import close_mandated_excludes
        SET = "docs/session-sets/113-narrated-video-walkthroughs"
        pats = close_mandated_excludes(SET)
        assert any(fnmatch.fnmatch(f"{SET}/path-aware-critique.json", p)
                   for p in pats)

    def test_a_sibling_json_in_the_set_dir_is_not_swept_up(self):
        # THE LOOK-ALIKE: the declaration exempts exactly one filename, not
        # every .json beside it.
        import fnmatch
        from verification_stamp import close_mandated_excludes
        SET = "docs/session-sets/113-narrated-video-walkthroughs"
        pats = close_mandated_excludes(SET)
        assert not any(fnmatch.fnmatch(f"{SET}/spec-config.json", p)
                       for p in pats)


class TestStalenessNamesTheBindingFiles:
    """Rule 3: the digest is one hash over many files, so a mismatch must say
    WHICH file moved. Both Set 113 S6 diagnoses were thirty seconds once the
    list was visible, and neither error showed it."""

    def test_it_names_a_planted_binding_file(self, tmp_path):
        import subprocess as sp
        from verification_stamp import describe_work_diff_staleness

        repo = tmp_path / "repo"
        (repo / "docs/session-sets/999-x").mkdir(parents=True)
        sp.run(["git", "init", "-q", str(repo)], check=True)
        sp.run(["git", "-C", str(repo), "config", "user.email", "t@t"], check=True)
        sp.run(["git", "-C", str(repo), "config", "user.name", "t"], check=True)
        setd = repo / "docs/session-sets/999-x"
        (setd / "spec.md").write_text("spec\n", encoding="utf-8")
        sp.run(["git", "-C", str(repo), "add", "-A"], check=True)
        sp.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
        base = sp.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                      capture_output=True, text=True).stdout.strip()

        # PLANT THE DEFECT: a file that binds, changed after the stamp.
        (setd / "spec.md").write_text("spec CHANGED\n", encoding="utf-8")
        msg = describe_work_diff_staleness(str(setd), base)
        assert "spec.md" in msg
        assert "BOUND BY" in msg
        # ...and it points at the two mechanisms that fix it.
        assert "WORK_DIFF_SET_BOOKKEEPING" in msg
        assert "CLOSE_MANDATED_WRITES" in msg

    def test_an_exempt_document_is_not_named(self, tmp_path):
        # THE LOOK-ALIKE: writing session evidence must produce no clause at
        # all, because it binds nothing.
        import subprocess as sp
        from verification_stamp import describe_work_diff_staleness

        repo = tmp_path / "repo"
        (repo / "docs/session-sets/999-x").mkdir(parents=True)
        sp.run(["git", "init", "-q", str(repo)], check=True)
        sp.run(["git", "-C", str(repo), "config", "user.email", "t@t"], check=True)
        sp.run(["git", "-C", str(repo), "config", "user.name", "t"], check=True)
        setd = repo / "docs/session-sets/999-x"
        (setd / "spec.md").write_text("spec\n", encoding="utf-8")
        sp.run(["git", "-C", str(repo), "add", "-A"], check=True)
        sp.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
        base = sp.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                      capture_output=True, text=True).stdout.strip()

        (setd / "s6-outcome.md").write_text("what happened\n", encoding="utf-8")
        assert describe_work_diff_staleness(str(setd), base) == ""

    def test_the_explainer_never_raises(self):
        # It runs inside an error path: failing to explain must never replace
        # the error being explained.
        from verification_stamp import describe_work_diff_staleness
        assert describe_work_diff_staleness("/nope/not/a/repo", "deadbeef") == ""

    def test_the_GATE_ITSELF_names_the_file(self, tmp_path):
        # THE RULE, not the helper. The first version of these tests exercised
        # describe_work_diff_staleness directly and passed happily when the
        # call was deleted from the gate's message -- caught by mutation
        # testing, and exactly L-112-1's warning about asserting a substring
        # instead of the rule. This drives validate_stamped_row.
        from stamp_fixtures import write_stamped_evidence
        from verification_stamp import validate_stamped_row

        set_dir = tmp_path / "docs" / "session-sets" / "999-x"
        set_dir.mkdir(parents=True)
        (set_dir / "spec.md").write_text("spec\n", encoding="utf-8")
        row = write_stamped_evidence(set_dir)

        # A valid row settles.
        ok, _ = validate_stamped_row(
            row, session_set_dir=str(set_dir), session_number=1,
            orchestrator_effective_provider="anthropic",
        )
        assert ok

        # PLANT THE DEFECT: change a BINDING file after the stamp.
        (set_dir / "spec.md").write_text("spec CHANGED\n", encoding="utf-8")
        ok, reason = validate_stamped_row(
            row, session_set_dir=str(set_dir), session_number=1,
            orchestrator_effective_provider="anthropic",
        )
        assert not ok
        assert "spec.md" in reason, reason
        assert "BOUND BY" in reason, reason

    def test_the_gate_stays_settled_when_only_evidence_is_written(
        self, tmp_path
    ):
        # THE LOOK-ALIKE, end to end: writing a session evidence document
        # after a passing round must leave the row VALID. This is the whole
        # point of the fix, asserted through the gate rather than a pattern.
        from stamp_fixtures import write_stamped_evidence
        from verification_stamp import validate_stamped_row

        set_dir = tmp_path / "docs" / "session-sets" / "999-y"
        set_dir.mkdir(parents=True)
        (set_dir / "spec.md").write_text("spec\n", encoding="utf-8")
        row = write_stamped_evidence(set_dir)

        (set_dir / "s1-outcome.md").write_text("what happened\n", encoding="utf-8")
        (set_dir / "s1-reproduction.md").write_text("how\n", encoding="utf-8")
        (set_dir / "path-aware-critique.json").write_text("{}\n", encoding="utf-8")

        ok, reason = validate_stamped_row(
            row, session_set_dir=str(set_dir), session_number=1,
            orchestrator_effective_provider="anthropic",
        )
        assert ok, reason


class TestTheFreshnessDefinitionIsSHARED:
    """Rule 4, and the durable one: THREE consumers ask 'did the work change?'
    -- the verification stamp, `test_run_fresh`, and the close backstop's
    delta anchor. They already share one definition. This asserts they cannot
    quietly stop sharing it, which is the drift that would re-open all of the
    above."""

    def test_every_consumer_imports_the_shared_list(self):
        import ast
        from pathlib import Path
        import verification_stamp

        pkg = Path(verification_stamp.__file__).parent
        consumers = ("run_of_record.py", "post_round_delta.py")
        for name in consumers:
            src = (pkg / name).read_text(encoding="utf-8")
            assert "WORK_DIFF_SET_BOOKKEEPING" in src, name
            # Structural, beside the textual: it must be IMPORTED, never
            # re-declared. A local re-listing is exactly how the three would
            # drift apart.
            tree = ast.parse(src)
            assigned = {
                t.id
                for node in ast.walk(tree)
                if isinstance(node, ast.Assign)
                for t in node.targets
                if isinstance(t, ast.Name)
            }
            assert "WORK_DIFF_SET_BOOKKEEPING" not in assigned, (
                f"{name} re-declares the shared freshness list instead of "
                "importing it"
            )

    def test_the_corpus_is_non_empty(self):
        # A scan that matched nothing must not read as a pass (L-112-1 /
        # corpus_scan_guard): assert the consumers exist at all.
        from pathlib import Path
        import verification_stamp
        pkg = Path(verification_stamp.__file__).parent
        for name in ("run_of_record.py", "post_round_delta.py"):
            assert (pkg / name).is_file(), name
