"""Falsifiers for A4 — what a fix made AFTER the full suite owes.

Set 128 S2. The rule is an **operator-attested verification-reduction**
(the constitution's hard carve-out), so the weight of this file is on the
directions that must still FIRE. A carve-out that only ever exempts is
indistinguishable from one with no boundary at all, and reviewing its
predicates reads as confirmation — only a planted change separates them
(L-112-1). Every test below plants a real edit in a real git repo and
asks the shipped entry point what it owes; none of them read a regex.

The four claims under test:

* FIRES — a shipped-code fix after the recorded round is reported as
  owing a delta review, and so is anything the classifier cannot place.
* DOES NOT FIRE — a test-only fix owes nothing; a session whose tree has
  not moved since its round is untouched.
* NOT WIDENABLE — one shipped file among any number of test files still
  owes the review, and a path that merely *looks* like a test does not
  count as one.
* STRUCTURAL — the exemption relaxes stamp freshness and nothing else:
  every other stamped-row check still refuses, and the round bounds and
  the no-resurrection ledger arithmetic are untouched by an exemption
  record.
"""

from __future__ import annotations

import json
import subprocess

import pytest

from ai_router import post_round_delta as prd
from ai_router import run_of_record as ror
from ai_router import verification_stamp as vstamp


def _git(root):
    def run(*args):
        return subprocess.run(
            ["git", "-C", str(root), *args], capture_output=True, check=False
        )

    return run


def _repo(tmp_path, *, session_number: int = 1):
    """A repo with a committed baseline and a round ledger anchored to it.

    Shaped like the real thing: an ``ai_router/`` tree with a shipped
    module and a test module, an extension tree, and a session-set dir
    whose ``s<N>-rounds.jsonl`` carries a completed round. The anchor is
    a real tree object taken from the committed state, exactly as
    ``record_round_completed`` takes one.
    """
    root = tmp_path
    git = _git(root)
    git("init", "-b", "main")
    git("config", "user.email", "f@example.invalid")
    git("config", "user.name", "F")
    git("config", "commit.gpgsign", "false")

    set_dir = root / "docs" / "session-sets" / "128-x"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("spec\n", encoding="utf-8")

    shipped = root / "ai_router"
    shipped.mkdir()
    (shipped / "widget.py").write_text("VALUE = 1\n", encoding="utf-8")
    # A sibling that LOOKS like a test surface and is not one: the
    # declared prefix is ``ai_router/tests/``, anchored at a path
    # boundary.
    (shipped / "tests_helper.py").write_text("HELPER = 1\n", encoding="utf-8")

    tests = shipped / "tests"
    tests.mkdir()
    (tests / "test_widget.py").write_text("def test_x():\n    pass\n", encoding="utf-8")

    ext = root / "tools" / "dabbler-ai-orchestration"
    (ext / "src" / "test").mkdir(parents=True)
    (ext / "src" / "test" / "a.test.ts").write_text("// t\n", encoding="utf-8")
    (ext / "test-fixtures").mkdir(parents=True)
    (ext / "test-fixtures" / "state.json").write_text("{}\n", encoding="utf-8")

    git("add", "-A")
    git("commit", "-m", "baseline")

    tree = git("rev-parse", "HEAD^{tree}").stdout.decode().strip()
    ledger = set_dir / f"s{session_number}-rounds.jsonl"
    ledger.write_text(
        json.dumps(
            {
                "event": "round-completed",
                "sessionNumber": session_number,
                "verificationRound": 1,
                "phase": "discovery",
                "source": "verify_session_cli",
                "verdict": "VERIFIED",
                "blocking": False,
                "endedLoop": True,
                "recordedAt": "2026-08-12T10:00:00-04:00",
                "worktreeTreeAtCompletion": tree,
            }
        )
        + "\n",
        encoding="utf-8",
    )
    return root, set_dir, git


class TestA4Fires:
    """The directions that must still cost a round."""

    def test_shipped_code_fix_after_the_round_owes_a_delta_review(
        self, tmp_path
    ):
        """FIRES. The A4.2 case: a post-round edit to a shipped module."""
        root, set_dir, _git = _repo(tmp_path)

        (root / "ai_router" / "widget.py").write_text(
            "VALUE = 2  # the post-suite fix\n", encoding="utf-8"
        )

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_SHIPPED_CODE
        assert verdict.owes_review is True
        assert "ai_router/widget.py" in verdict.shipped_paths
        assert "remediation-review" in verdict.obligation
        assert "open re-verification" in verdict.obligation

    def test_an_unresolvable_anchor_fails_closed(self, tmp_path):
        """FIRES. No ledger, no snapshot, no anchor -> UNKNOWN, which owes
        a review exactly as a shipped-code change does. The carve-out is
        opt-in on positive evidence; absence of evidence never exempts."""
        root, set_dir, _git = _repo(tmp_path)
        (set_dir / "s1-rounds.jsonl").unlink()

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_UNKNOWN
        assert verdict.owes_review is True
        assert "fails closed" in verdict.reason

    def test_a_round_ledger_without_a_completion_snapshot_falls_back_loudly(
        self, tmp_path
    ):
        """FIRES (with a caveat). A ledger written before Set 128 S2 has
        only the PRE-round discoveryBaselineTree. That anchor is still
        usable -- test-only across a wider window implies test-only across
        the narrower one -- but it over-reports, so the verdict must say
        which anchor it used rather than quietly present it as equivalent.
        """
        root, set_dir, git = _repo(tmp_path)
        tree = git("rev-parse", "HEAD^{tree}").stdout.decode().strip()
        (set_dir / "s1-rounds.jsonl").write_text(
            json.dumps(
                {
                    "event": "round-completed",
                    "sessionNumber": 1,
                    "verificationRound": 1,
                    "verdict": "ISSUES_FOUND",
                    "blocking": True,
                    "endedLoop": False,
                    "discoveryBaselineTree": tree,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (root / "ai_router" / "widget.py").write_text("VALUE = 3\n", encoding="utf-8")

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.anchor == prd.ANCHOR_DISCOVERY_BASELINE
        assert verdict.classification == prd.DELTA_SHIPPED_CODE
        assert "over-reports" in verdict.reason


class TestA4DoesNotFire:
    """The directions the operator's ruling exempts."""

    def test_test_only_fix_after_the_round_owes_nothing(self, tmp_path):
        """DOES NOT FIRE. The A4.1 case, across both declared test
        surfaces: a fix to a test changes nothing that ships."""
        root, set_dir, _git = _repo(tmp_path)

        (root / "ai_router" / "tests" / "test_widget.py").write_text(
            "def test_x():\n    assert True\n", encoding="utf-8"
        )
        (
            root
            / "tools"
            / "dabbler-ai-orchestration"
            / "src"
            / "test"
            / "a.test.ts"
        ).write_text("// fixed\n", encoding="utf-8")

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_TEST_ONLY
        assert verdict.owes_review is False
        assert verdict.shipped_paths == ()
        assert len(verdict.test_paths) == 2
        assert "NO re-verification" in verdict.obligation

    def test_a_session_with_no_post_round_change_is_untouched(self, tmp_path):
        """DOES NOT FIRE. The common case: the tree has not moved, so A4
        has nothing to say and says so as its own classification rather
        than borrowing the test-only exemption."""
        root, set_dir, _git = _repo(tmp_path)

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_NO_CHANGE
        assert verdict.owes_review is False
        assert verdict.test_paths == ()
        assert verdict.shipped_paths == ()

    def test_round_bookkeeping_written_after_the_round_is_not_work(
        self, tmp_path
    ):
        """DOES NOT FIRE. The artifacts a round writes about itself --
        envelopes, sidecars, the ledger, the decision journal -- must not
        read as a post-round code change, or every session would owe a
        review for having recorded its own verification."""
        root, set_dir, _git = _repo(tmp_path)

        (set_dir / "s1-verification.md").write_text("VERIFIED\n", encoding="utf-8")
        (set_dir / "s1-issues.json").write_text("{}\n", encoding="utf-8")
        (set_dir / "decisions.jsonl").write_text("{}\n", encoding="utf-8")

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_NO_CHANGE, verdict.reason

    def test_an_unchanged_untracked_file_in_the_anchor_is_not_a_change(
        self, tmp_path
    ):
        """DOES NOT FIRE, and this is the shape that makes the delta a
        TREE-TO-TREE diff rather than a worktree-vs-tree one.

        A session that creates a file and leaves it untracked until the
        close-out commit is the common case, not a corner. The anchor
        snapshot captures that file; a diff that lists every currently
        untracked path would then re-report it as a post-round
        shipped-code change, and A4.1 would be denied to exactly the
        sessions that wrote something new. Planted: an untracked shipped
        file present at the round and untouched afterwards, plus a
        genuine test-only fix.
        """
        root, set_dir, git = _repo(tmp_path)

        # A new shipped file, created BEFORE the round and deliberately
        # never staged.
        (root / "ai_router" / "brand_new.py").write_text(
            "NEW = 1\n", encoding="utf-8"
        )
        tree = git("rev-parse", "HEAD^{tree}").stdout.decode().strip()
        assert (root / "ai_router" / "brand_new.py").exists()
        # Re-anchor on a snapshot that CONTAINS the untracked file, which
        # is what record_round_completed does.
        from ai_router import verify_session as vs

        anchor = vs.snapshot_worktree_tree(root)
        assert anchor is not None and anchor != tree
        (set_dir / "s1-rounds.jsonl").write_text(
            json.dumps(
                {
                    "event": "round-completed",
                    "sessionNumber": 1,
                    "verificationRound": 1,
                    "verdict": "VERIFIED",
                    "blocking": False,
                    "endedLoop": True,
                    "worktreeTreeAtCompletion": anchor,
                }
            )
            + "\n",
            encoding="utf-8",
        )

        # The only post-round edit is a test fix.
        (root / "ai_router" / "tests" / "test_widget.py").write_text(
            "def test_x():\n    assert True\n", encoding="utf-8"
        )

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_TEST_ONLY, (
            "an unchanged untracked file captured in the anchor tree was "
            f"re-reported as a post-round change: {verdict.shipped_paths}"
        )
        assert "ai_router/brand_new.py" not in verdict.shipped_paths

    def test_an_untracked_file_CHANGED_after_the_round_still_counts(
        self, tmp_path
    ):
        """The other half of the same mechanism, so the fix above cannot
        have been a blanket exemption for untracked files: edit that same
        untracked shipped file AFTER the anchor and it owes the review."""
        root, set_dir, git = _repo(tmp_path)
        from ai_router import verify_session as vs

        (root / "ai_router" / "brand_new.py").write_text(
            "NEW = 1\n", encoding="utf-8"
        )
        anchor = vs.snapshot_worktree_tree(root)
        (set_dir / "s1-rounds.jsonl").write_text(
            json.dumps(
                {
                    "event": "round-completed",
                    "sessionNumber": 1,
                    "verificationRound": 1,
                    "verdict": "VERIFIED",
                    "blocking": False,
                    "endedLoop": True,
                    "worktreeTreeAtCompletion": anchor,
                }
            )
            + "\n",
            encoding="utf-8",
        )

        (root / "ai_router" / "brand_new.py").write_text(
            "NEW = 2  # post-round\n", encoding="utf-8"
        )

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_SHIPPED_CODE
        assert "ai_router/brand_new.py" in verdict.shipped_paths


class TestTheCarveOutCannotBeWidened:
    """Where the weight goes: the exemption's boundary."""

    @pytest.mark.parametrize(
        "planted",
        [
            "ai_router/widget.py",
            # Anchored at a path boundary: the declared prefix is
            # ``ai_router/tests/``, so a same-stem sibling is shipped.
            "ai_router/tests_helper.py",
            # Declared NOT to be a test surface: the fixture harness
            # stages what the Layer 3 specs assert, so changing it
            # changes what those tests see.
            "tools/dabbler-ai-orchestration/test-fixtures/state.json",
        ],
    )
    def test_one_shipped_path_among_test_paths_still_owes_the_review(
        self, tmp_path, planted
    ):
        """The widening falsifier. A mixed delta is a SHIPPED delta: the
        rule is 'tests only (and not to code)', so a single unexempt path
        decides the verdict no matter how many test files accompany it.
        Planted three ways, because the interesting failures are the
        near-misses rather than the obvious one."""
        root, set_dir, _git = _repo(tmp_path)

        (root / "ai_router" / "tests" / "test_widget.py").write_text(
            "def test_x():\n    assert True\n", encoding="utf-8"
        )
        target = root / planted
        target.write_text("changed\n", encoding="utf-8")

        verdict = prd.classify_delta(set_dir, 1)

        assert verdict.classification == prd.DELTA_SHIPPED_CODE, (
            f"{planted} was treated as a test surface"
        )
        assert verdict.owes_review is True
        assert planted in verdict.shipped_paths

    def test_an_undeclared_repo_exempts_nothing(self, tmp_path):
        """A consumer repo that declares no ``tests`` prefixes gets an
        empty allowlist, under which EVERY change is shipped. The
        reduction is opt-in by declaration; silence must buy nothing."""
        root, set_dir, _git = _repo(tmp_path)
        (root / "ai_router" / "tests" / "test_widget.py").write_text(
            "def test_x():\n    assert True\n", encoding="utf-8"
        )
        undeclared = {
            "testing": {
                "suites": [
                    {"name": "pytest", "command": "x", "covers": ["ai_router/"]}
                ]
            }
        }

        verdict = prd.classify_delta(set_dir, 1, config=undeclared)

        assert verdict.classification == prd.DELTA_SHIPPED_CODE
        assert verdict.owes_review is True


class TestNothingElseIsWeakened:
    """STRUCTURAL. The exemption's blast radius, asserted rather than
    assumed."""

    def test_the_exemption_relaxes_freshness_and_nothing_else(
        self, tmp_path, monkeypatch
    ):
        """``validate_stamped_row`` has nine checks. A4.1 exempts the
        ninth. Plant a row that would pass freshness under A4.1 and fails
        an EARLIER check, and it must still be refused -- if the carve-out
        ever short-circuits the whole validator, this is where it shows.
        """
        root, set_dir, _git = _repo(tmp_path)
        (root / "ai_router" / "tests" / "test_widget.py").write_text(
            "def test_x():\n    assert True\n", encoding="utf-8"
        )
        # The delta IS test-only, so the exemption is live for this tree.
        assert prd.classify_delta(set_dir, 1).classification == prd.DELTA_TEST_ONLY

        ok, reason = vstamp.validate_stamped_row(
            {"source": "route", "verdict": "VERIFIED"},
            session_set_dir=str(set_dir),
            session_number=1,
            orchestrator_effective_provider="anthropic",
        )

        assert ok is False
        assert "sanctioned stamp source" in reason

    def test_the_exemption_grants_only_on_a_test_only_delta(self, tmp_path):
        """Both directions of the exemption predicate itself.

        The reporting half: a reduction nobody can see in the record is
        not auditable, so the ``notes`` detail names the paths it
        exempted. The refusing half is the one that matters more -- a
        predicate stuck at "granted" would leave every other test here
        passing, because they all exercise trees the rule genuinely
        exempts. Plant a shipped-code delta and an unclassifiable one and
        assert the exemption is REFUSED for both.
        """
        root, set_dir, _git = _repo(tmp_path)

        (root / "ai_router" / "tests" / "test_widget.py").write_text(
            "def test_x():\n    assert True\n", encoding="utf-8"
        )
        exempt, detail = vstamp._a4_test_only_exemption(str(set_dir), 1)
        assert exempt is True
        assert "declared test surface" in detail
        assert "ai_router/tests/test_widget.py" in detail

        (root / "ai_router" / "widget.py").write_text(
            "VALUE = 99\n", encoding="utf-8"
        )
        exempt, detail = vstamp._a4_test_only_exemption(str(set_dir), 1)
        assert exempt is False, (
            "a shipped-code delta was granted the A4.1 test-only exemption"
        )
        assert prd.DELTA_SHIPPED_CODE in detail

        (set_dir / "s1-rounds.jsonl").unlink()
        exempt, detail = vstamp._a4_test_only_exemption(str(set_dir), 1)
        assert exempt is False, (
            "an unclassifiable delta was granted the exemption; the "
            "carve-out must be opt-in on positive evidence only"
        )
        assert prd.DELTA_UNKNOWN in detail

    def test_an_exemption_record_does_not_spend_or_restore_a_round(
        self, tmp_path
    ):
        """The bounds and the no-resurrection ledger, against a hand-built
        ledger. The exemption writes an ``a4-test-only-exemption`` event;
        the round arithmetic counts ``round-completed`` events, so the
        same ledger must yield the same round number and the same bound
        verdict with the record present and absent."""
        from ai_router import verify_session as vs

        root, set_dir, git = _repo(tmp_path)
        tree = git("rev-parse", "HEAD^{tree}").stdout.decode().strip()
        rows = [
            {
                "event": "round-completed",
                "sessionNumber": 1,
                "verificationRound": r,
                "phase": "discovery" if r == 1 else "remediation-review",
                "source": "verify_session_cli",
                "verdict": "ISSUES_FOUND",
                "blocking": True,
                "endedLoop": False,
                "worktreeTreeAtCompletion": tree,
            }
            for r in (1, 2)
        ]
        ledger = set_dir / "s1-rounds.jsonl"
        ledger.write_text(
            "".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8"
        )

        before_round = vs.resolve_round(set_dir, 1, None)
        before_bound = vs.evaluate_phase_bound(set_dir, 1, before_round, None)

        with ledger.open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    {
                        "event": "a4-test-only-exemption",
                        "sessionNumber": 1,
                        "anchor": prd.ANCHOR_ROUND_COMPLETION,
                        "anchorRound": 2,
                        "testPaths": ["ai_router/tests/test_widget.py"],
                    }
                )
                + "\n"
            )

        after_round = vs.resolve_round(set_dir, 1, None)
        after_bound = vs.evaluate_phase_bound(set_dir, 1, after_round, None)

        assert after_round == before_round, (
            "an exemption record moved the round counter"
        )
        assert after_bound.exceeds == before_bound.exceeds
        assert after_bound.prior_rounds == before_bound.prior_rounds, (
            "an exemption record was counted as a verification round"
        )
        # And it is not mistaken for a completed round by the A4 reader
        # either: the anchor still resolves to round 2.
        _tree, _anchor, anchor_round = prd.resolve_anchor(set_dir, 1)
        assert anchor_round == 2
