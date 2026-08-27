"""The step driver: folding state, and treating a return as ordinary."""
import json
import subprocess

import pytest
import yaml

from ai_router import fixloop, stepreview, testphase
from ai_router import verdict as verdictmod
from ai_router.checks import Check, CheckRun, snapshot_worktree_tree
from ai_router.config import DEFAULT_VERIFICATION_ROUNDS
from ai_router.solution import STEPS
from ai_router.stepreview import ReviewerOutcome, StepReview, digest_text
from ai_router.workflow import (EXIT_REFUSED, WorkflowError, append,
                                current_step, fold, project, read,
                                review_cap, review_terminal, run_cap,
                                run_terminal, suite_terminal,
                                validate_transition, _main)


def entries_through(target, step):
    """Every `entered` event from the first step up to `step`. There is no
    shortcut, which is the rule under test."""
    return [{"event": "entered", "target": target, "step": s}
            for s in STEPS[:STEPS.index(step) + 1]]


def walk_to(root, target, step):
    for event in entries_through(target, step):
        append(root, event)


def reviewed(target, step, verdict="blocked", findings=None, digests=None,
             live=True, **extra):
    return {"event": "reviewed", "target": target, "step": step,
            "verdict": verdict, "findings": findings or [],
            "artifactDigests": digests or {}, "live": live, **extra}


def _fake_review(target, step, artifact_paths, **kw):
    """Stands in for the vendors. What is under test here is what the driver
    records, not what a model says."""
    return StepReview(
        target=target, step=step, artifacts=list(artifact_paths),
        reviewers=[
            ReviewerOutcome(provider="anthropic", model="a", verdict="VERIFIED"),
            ReviewerOutcome(
                provider="openai", model="o", verdict="ISSUES_FOUND",
                findings=[{"severity": "Major", "description": "boundary"}],
                blocking=True, blocking_reason="1 blocking finding(s)"),
        ],
    ), ["raw one", "raw two"]


def authored(target, step, written=("tests/test_value.py",)):
    return {"event": "tests-authored", "target": target, "step": step,
            "written": list(written)}


def ran(target, step, green=False, tree=None, **extra):
    return {"event": "tested", "target": target, "step": step, "green": green,
            "exitCode": 0 if green else 3, "treeDigest": tree,
            "postTreeDigest": tree, **extra}


def _fake_run(root, config, test_paths, **kw):
    """Stands in for the suite. What is under test here is what the driver
    records, not what pytest says."""
    return CheckRun(
        check=Check(name="unit", argv=("runner",)), stage="targeted",
        command="runner " + " ".join(test_paths), tree_digest="t1",
        post_tree_digest="t1", tree_mutated=False, exit_code=3,
        duration_seconds=0.2, timed_out=False, outcome="failed",
        selection={}, output="E   assert 1 == 2",
    )


def suite_ran(target, step, green=False, tree=None, **extra):
    return {"event": "suite-run", "target": target, "step": step,
            "green": green, "exitCode": 0 if green else 1,
            "treeDigest": tree, "postTreeDigest": tree, **extra}


def _fake_suite(root, config, authored_paths, **kw):
    """The complete suite, standing in. The driver's job is to record what a
    runner said, not to be one."""
    return CheckRun(
        check=Check(name="unit", argv=("runner",)), stage="final-full",
        command="runner", tree_digest="t1", post_tree_digest="t1",
        tree_mutated=False, exit_code=1, duration_seconds=0.4,
        timed_out=False, outcome="failed", selection={},
        output="FAILED tests/test_value.py::test_it - assert 1 == 2\n",
    )


MANIFEST = """
solution:
  name: csv-demo
  title: CSV walkthrough
components:
  - name: csv-model
  - name: csv-parser
    dependsOn: [csv-model]
  - name: csv-app
    kind: integration
    dependsOn: [csv-parser]
"""


@pytest.fixture
def root(tmp_path):
    (tmp_path / "solution.yaml").write_text(MANIFEST)
    return tmp_path


@pytest.fixture
def git_root(root):
    """The workspace as a real repository. Whether a failing run has been
    answered is decided by comparing tree ids, so the tests loop's terminal
    states need a tree to compare."""
    subprocess.run(["git", "init", "-q"], cwd=str(root), capture_output=True)
    return root


class TestLog:
    def test_an_unknown_event_is_refused(self, root):
        with pytest.raises(WorkflowError, match="unknown event"):
            append(root, {"event": "invented"})

    def test_events_append_rather_than_replace(self, root):
        append(root, {"event": "entered", "target": "csv-parser", "step": "plan"})
        append(root, {"event": "entered", "target": "csv-parser",
                      "step": "decompose"})
        assert len(read(root)) == 2

    def test_a_corrupt_line_is_reported_with_its_position(self, root):
        append(root, {"event": "entered", "target": "x", "step": "plan"})
        p = root / ".dabbler" / "solution" / "events.jsonl"
        p.write_text(p.read_text() + "{not json\n")
        with pytest.raises(WorkflowError, match=":2"):
            read(root)


class TestFold:
    def test_the_latest_step_wins(self):
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            {"event": "entered", "target": "a", "step": "decompose"},
        ])
        assert state["a"]["step"] == "decompose"

    def test_a_blocking_review_puts_it_back_with_the_author(self):
        state = fold([{"event": "reviewed", "target": "a", "verdict": "blocked"}])
        assert state["a"]["waitingOn"] == "author"

    def test_a_review_needing_approval_waits_on_the_developer(self):
        state = fold([{"event": "reviewed", "target": "a", "verdict": "clear",
                       "needsApproval": True}])
        assert state["a"]["waitingOn"] == "developer"

    def test_approval_clears_the_wait(self):
        state = fold([
            {"event": "reviewed", "target": "a", "verdict": "clear",
             "needsApproval": True},
            {"event": "approved", "target": "a"},
        ])
        assert state["a"]["waitingOn"] is None

    def test_a_return_moves_the_step_backwards_and_is_counted(self):
        state = fold(entries_through("a", "integration") + [
            {"event": "returned", "target": "a", "toStep": "contracts",
             "reason": "boundary wrong"},
        ])
        assert state["a"]["step"] == "contracts"
        assert state["a"]["returns"] == 1

    def test_a_return_clears_any_earlier_approval(self):
        state = fold(entries_through("a", "decompose") + [
            {"event": "reviewed", "target": "a", "step": "decompose",
             "verdict": "clear"},
            {"event": "approved", "target": "a"},
            {"event": "returned", "target": "a", "toStep": "plan", "reason": "x"},
        ])
        assert state["a"]["approved"] is False


class TestRecordAuthority:
    """One `validate_transition` on both sides of the log. The writer refuses
    to record an impossible move and the reader refuses to replay one, so a
    hand-edited file cannot become history."""

    def test_a_skipped_step_is_refused(self):
        with pytest.raises(WorkflowError, match="steps are entered in order"):
            fold([
                {"event": "entered", "target": "a", "step": "plan"},
                {"event": "entered", "target": "a", "step": "mocks"},
            ])

    def test_entering_backwards_is_refused_and_names_send_back(self):
        with pytest.raises(WorkflowError, match="send-back"):
            fold(entries_through("a", "contracts") + [
                {"event": "entered", "target": "a", "step": "plan"},
            ])

    def test_a_return_that_does_not_move_back_is_refused(self):
        with pytest.raises(WorkflowError, match="moves work backwards"):
            fold(entries_through("a", "contracts") + [
                {"event": "returned", "target": "a", "toStep": "mocks",
                 "reason": "forwards, dressed as a return"},
            ])

    def test_an_approval_outside_an_approval_step_is_refused(self):
        with pytest.raises(WorkflowError, match="not a step a developer"):
            fold(entries_through("a", "mocks") + [
                {"event": "reviewed", "target": "a", "step": "mocks",
                 "verdict": "clear"},
                {"event": "approved", "target": "a"},
            ])

    def test_an_approval_with_no_live_review_is_refused(self):
        with pytest.raises(WorkflowError, match="nothing live has been"):
            fold([
                {"event": "entered", "target": "a", "step": "plan"},
                {"event": "approved", "target": "a"},
            ])

    def test_an_event_about_another_step_is_refused(self):
        with pytest.raises(WorkflowError, match="work is at"):
            fold(entries_through("a", "decompose") + [
                {"event": "reviewed", "target": "a", "step": "plan",
                 "verdict": "clear"},
            ])

    def test_a_log_cannot_open_partway_through(self):
        """A target with no history has entered nothing, so a first event
        naming a later step records an arrival with no journey."""
        with pytest.raises(WorkflowError, match="cannot begin at"):
            validate_transition(None, {"event": "entered", "target": "a",
                                       "step": "build"})

    def test_a_hand_written_line_is_refused_when_the_log_is_read(self, root):
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        p = root / ".dabbler" / "solution" / "events.jsonl"
        p.write_text(p.read_text() + json.dumps(
            {"event": "entered", "target": "csv-model", "step": "build",
             "at": "2026-01-01T00:00:00+00:00"}) + "\n")
        with pytest.raises(WorkflowError, match="steps are entered in order"):
            fold(read(root))


class TestAScriptedReviewIsNotALiveOne:
    def test_a_simulated_review_does_not_count_as_reviewed(self):
        """The flag was recorded and never read, so a response served from a
        file cleared the same gate two vendors clear."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            {"event": "reviewed", "target": "a", "step": "plan",
             "verdict": "clear", "simulated": True},
        ])
        assert state["a"]["reviewed"] is False


class TestTheApprovalGateOutranksTheBlock:
    """Five real review rounds on one plan document produced four Major
    findings every time, each round's findings genuinely new. A gate the
    reviewers can hold shut forever is not a gate."""

    def test_a_blocked_approval_step_still_reaches_the_developer(self):
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            {"event": "reviewed", "target": "a", "step": "plan",
             "verdict": "blocked", "needsApproval": True},
        ])
        assert state["a"]["waitingOn"] == "developer"

    def test_a_blocked_step_with_no_gate_goes_back_to_the_author(self):
        state = fold(entries_through("a", "mocks") + [
            {"event": "reviewed", "target": "a", "step": "mocks",
             "verdict": "blocked", "needsApproval": False},
        ])
        assert state["a"]["waitingOn"] == "author"

    def test_approving_over_open_findings_records_that_it_did(self, root, capsys):
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        append(root, {"event": "reviewed", "target": "csv-model", "step": "plan",
                      "verdict": "blocked", "needsApproval": True,
                      "findings": [{"severity": "major"}, {"severity": "major"}]})
        _main(["approve", "--component", "csv-model",
               "--workspace-root", str(root)])
        assert read(root)[-1]["overFindings"] == 2
        assert "stay on the record" in capsys.readouterr().out


class TestProjection:
    def test_it_joins_the_manifest_to_live_state(self, root):
        walk_to(root, "csv-parser", "mocks")
        doc = project(root)
        parser = next(c for c in doc["components"] if c["name"] == "csv-parser")
        assert parser["stepNumber"] == 4
        assert parser["usedBy"] == ["csv-app"]

    def test_it_lists_everything_waiting_on_the_developer(self, root):
        append(root, {"event": "reviewed", "target": "csv-model",
                      "verdict": "clear", "needsApproval": True})
        assert project(root)["needsYou"] == ["csv-model"]

    def test_a_missing_manifest_is_refused(self, tmp_path):
        with pytest.raises(WorkflowError, match="no solution manifest"):
            project(tmp_path)


class TestCli:
    def test_review_records_what_the_reviewers_actually_said(
            self, root, monkeypatch, capsys):
        """The verdict comes back from the readers. There is no longer a way
        to hand one in on the command line."""
        walk_to(root, "csv-model", "contracts")
        monkeypatch.setattr(stepreview, "review", _fake_review)
        art = root / "contract.yaml"
        art.write_text("calls: []\n")
        code = _main(["review", "--artifact", str(art),
                      "--component", "csv-model", "--workspace-root", str(root)])
        assert code == 0
        event = read(root)[-1]
        assert event["event"] == "reviewed"
        assert event["step"] == "contracts"
        assert event["verdict"] == "blocked"
        assert [r["provider"] for r in event["reviewers"]] == ["anthropic", "openai"]

    def test_each_reply_is_filed_verbatim(self, root, monkeypatch):
        """A summary is not a record: a finding that exists only as someone's
        paraphrase cannot be re-read."""
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        monkeypatch.setattr(stepreview, "review", _fake_review)
        art = root / "plan.md"
        art.write_text("# plan\n")
        _main(["review", "--artifact", str(art), "--component", "csv-model",
               "--workspace-root", str(root)])
        filed = sorted((root / ".dabbler" / "solution" / "reviews").iterdir())
        assert [f.read_text() for f in filed] == ["raw one", "raw two"]

    def test_reviewing_work_that_has_not_begun_is_refused(self, root):
        with pytest.raises(WorkflowError, match="has not entered a step"):
            current_step(root, "csv-model")

    def test_send_back_names_the_affected_components(self, root, capsys):
        walk_to(root, "csv-model", "integration")
        _main(["send-back", "--to", "contracts", "--reason", "boundary wrong",
               "--affects", "csv-parser,csv-app", "--component", "csv-model",
               "--workspace-root", str(root)])
        out = capsys.readouterr().out
        assert "csv-parser, csv-app" in out

    def test_status_reports_who_is_waited_on(self, root, capsys):
        append(root, {"event": "reviewed", "target": "csv-model",
                      "step": "plan", "verdict": "clear", "needsApproval": True})
        _main(["status", "--workspace-root", str(root)])
        assert "needs you" in capsys.readouterr().out


class TestTheReviewLoopIsBounded:
    """`workflow review` had no bound, so an unattended run kept calling two
    vendors for as long as anything invoked it. The loop now stops by itself
    and lands on one of the three terminal states, and no part of that waits
    for a person or can be typed by one."""

    def test_only_a_round_that_reached_a_vendor_is_counted(self):
        """The bound exists to stop the loop spending on vendors, so a round
        served from a script spent nothing to bound."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            reviewed("a", "plan", live=False),
            reviewed("a", "plan"),
        ])
        assert state["a"]["reviewRounds"] == 1

    def test_moving_the_work_opens_a_new_loop(self):
        """Rounds spent on what a step produced are not spent against the
        step the work is sent back to."""
        state = fold(entries_through("a", "decompose") + [
            reviewed("a", "decompose"),
            {"event": "returned", "target": "a", "toStep": "plan",
             "reason": "boundary wrong"},
        ])
        assert state["a"]["reviewRounds"] == 0
        assert state["a"]["lastLiveReview"] is None

    def test_re_entering_the_same_step_changes_nothing(self):
        """`enter <the step it is already in>` moves nothing, so it is inert.
        Zeroing the count there would buy another full set of vendor rounds
        on work that has not changed step; clearing the review instead left
        the step refused by `approve` for having no live review and refused
        by `review` for having closed its loop — twice refused, for opposite
        reasons."""
        events = [
            {"event": "entered", "target": "a", "step": "plan"},
            reviewed("a", "plan", verdict="clear", needsApproval=True),
        ]
        before = fold(events)["a"]
        after = fold(events + [
            {"event": "entered", "target": "a", "step": "plan"},
        ])["a"]
        assert after["reviewRounds"] == before["reviewRounds"] == 1
        assert after["reviewed"] is before["reviewed"] is True
        assert after["waitingOn"] == before["waitingOn"] == "developer"

    def test_the_bound_comes_from_the_workspace_not_the_process_directory(
            self, root, monkeypatch, tmp_path):
        """`--workspace-root` and `project(root)` are first-class entry
        points. Reading the overlay from wherever the process happens to sit
        would enforce one repository's cap against another's."""
        subprocess.run(["git", "init", "-q"], cwd=str(root),
                       capture_output=True)
        (root / "local-overrides.yaml").write_text(
            yaml.safe_dump({"verification": {"settings": {"max_rounds": 1}}}),
            encoding="utf-8",
        )
        elsewhere = tmp_path / "elsewhere"
        elsewhere.mkdir()
        monkeypatch.chdir(elsewhere)
        assert review_cap(root) == 1

    def test_the_cap_refuses_a_further_round_and_names_the_way_out(
            self, root, monkeypatch, capsys):
        walk_to(root, "csv-model", "contracts")
        monkeypatch.setattr(stepreview, "review", _fake_review)
        art = root / "contract.yaml"
        art.write_text("calls: []\n")
        argv = ["review", "--artifact", str(art), "--component", "csv-model",
                "--workspace-root", str(root)]
        for _ in range(review_cap(root)):
            assert _main(argv) == 0
        assert _main(argv) == EXIT_REFUSED
        err = capsys.readouterr().err
        assert "send-back" in err
        assert "Nobody is asked" in err

    def test_a_round_with_no_blocking_finding_closes_the_loop_as_verified(
            self, root):
        """The early stop. Minor findings are recorded and open no further
        round — prose review has no bottom, which is what the severity
        vocabulary is for."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            reviewed("a", "plan", verdict="clear",
                     findings=[{"severity": "minor", "description": "casing"}]),
        ])
        assert review_terminal(root, state["a"], 3) == verdictmod.VERDICT_VERIFIED

    def test_a_fix_at_the_cited_site_is_remediated_at_the_cap(self, root):
        """Not a waiver: nothing was accepted over a finding that still
        stood, and what is unproved is the repair rather than the
        complaint."""
        (root / "plan.md").write_text("# rewritten after the finding\n")
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            reviewed("a", "plan",
                     findings=[{"severity": "major", "description": "boundary",
                                "evidencePaths": ["plan.md"]}],
                     digests={"plan.md": digest_text("# as the round read it\n")}),
        ])
        assert review_terminal(root, state["a"], 1) == (
            verdictmod.VERDICT_REMEDIATED_AT_CAP)

    def test_an_untouched_cited_site_is_unresolved(self, root):
        text = "# exactly as the round read it\n"
        (root / "plan.md").write_text(text)
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            reviewed("a", "plan",
                     findings=[{"severity": "major", "description": "boundary",
                                "evidencePaths": ["plan.md"]}],
                     digests={"plan.md": digest_text(text)}),
        ])
        assert review_terminal(root, state["a"], 1) == (
            verdictmod.VERDICT_ISSUES_FOUND)

    def test_a_blocked_round_naming_no_finding_cannot_be_remediated(self, root):
        """Fail closed. Nothing to have fixed is not the same as nothing left
        to fix, and an unreadable round must not be the cheapest way out."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            reviewed("a", "plan", findings=[]),
        ])
        assert review_terminal(root, state["a"], 1) == (
            verdictmod.VERDICT_ISSUES_FOUND)

    def test_the_projection_carries_the_loop_position(self, root):
        """Python decides whether the loop has finished; the extension is
        handed the answer rather than the events."""
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        append(root, reviewed("csv-model", "plan"))
        model = next(c for c in project(root)["components"]
                     if c["name"] == "csv-model")
        assert model["reviewRounds"] == 1
        assert model["reviewCap"] == review_cap(root)


class TestTheTestsLoopIsBounded:
    """Spec 3.c.ii: the verifier authors the tests, the framework runs them,
    and what the loop reads is an exit code rather than an opinion. The bound
    and the three terminal states are the review loop's, on the same terms."""

    def test_a_run_with_nothing_authored_is_refused_by_the_record(self, root):
        """A run of the author's own tests filed as this phase would prove
        the one thing the split exists to stop it proving."""
        append(root, {"event": "entered", "target": "a", "step": "plan"})
        with pytest.raises(WorkflowError, match="no test has been authored"):
            append(root, ran("a", "plan"))

    def test_a_green_run_closes_the_loop_as_verified(self, root):
        """There is no early stop to make: a passing suite is already the
        cheapest ending there is."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            authored("a", "plan"),
            ran("a", "plan", green=True),
        ])
        assert run_terminal(root, state["a"], 7) == verdictmod.VERDICT_VERIFIED

    def test_at_the_cap_an_unmoved_tree_is_unresolved(self, git_root):
        """Nothing was done about the failure, so nothing is proved by
        stopping."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            authored("a", "plan"),
            ran("a", "plan", tree=snapshot_worktree_tree(git_root)),
        ])
        assert run_terminal(git_root, state["a"], 1) == (
            verdictmod.VERDICT_ISSUES_FOUND)

    def test_at_the_cap_a_moved_tree_is_remediated_at_the_cap(self, git_root):
        """Not a waiver: no failure was accepted, and what is unproved is the
        repair rather than the complaint."""
        measured = snapshot_worktree_tree(git_root)
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            authored("a", "plan"),
            ran("a", "plan", tree=measured),
        ])
        (git_root / "fix.py").write_text("VALUE = 2\n")
        assert run_terminal(git_root, state["a"], 1) == (
            verdictmod.VERDICT_REMEDIATED_AT_CAP)

    def test_a_run_that_dirtied_the_tree_cannot_call_that_a_repair(
            self, git_root):
        """The comparison is against the tree the run left, not the one it
        was measuring. A suite with a side effect is already failed evidence
        and must not also be the cheapest way out of an unresolved loop."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            authored("a", "plan"),
            ran("a", "plan", tree="the-tree-it-measured", treeMutated=True,
                postTreeDigest=snapshot_worktree_tree(git_root)),
        ])
        assert run_terminal(git_root, state["a"], 1) == (
            verdictmod.VERDICT_ISSUES_FOUND)

    def test_moving_the_work_opens_a_new_tests_loop(self):
        """Tests authored against what a step produced answer for that step.
        Carried forward, they would run yesterday's proof against today's
        code and the result would be read as this step's."""
        state = fold(entries_through("a", "decompose") + [
            authored("a", "decompose"),
            {"event": "returned", "target": "a", "toStep": "plan",
             "reason": "boundary wrong"},
        ])
        assert state["a"]["testsAuthored"] == []
        assert state["a"]["testRounds"] == 0

    def test_the_cli_records_the_exit_code_rather_than_a_claim(
            self, root, monkeypatch, capsys):
        """The framework's half of the split. Nothing here asks anyone how it
        went."""
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        append(root, authored("csv-model", "plan"))
        monkeypatch.setattr(testphase, "run_authored", _fake_run)
        code = _main(["test", "--component", "csv-model",
                      "--workspace-root", str(root)])
        assert code == 0
        event = read(root)[-1]
        assert event["event"] == "tested"
        assert (event["exitCode"], event["green"]) == (3, False)
        assert "back with the author" in capsys.readouterr().out

    def test_the_projection_carries_the_tests_loop_position(self, root):
        """Python decides whether the loop has finished; the extension is
        handed the answer rather than the events."""
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        append(root, authored("csv-model", "plan"))
        append(root, ran("csv-model", "plan", green=True))
        model = next(c for c in project(root)["components"]
                     if c["name"] == "csv-model")
        assert model["testRounds"] == 1
        assert model["testCap"] == run_cap(root)
        assert model["testTerminal"] == verdictmod.VERDICT_VERIFIED


class TestTheSuiteLoopAndItsFixRound:
    """Spec 3.d: the complete suite against the tree including the authored
    tests, and a red run opening a fix loop whose scope the framework holds
    rather than requests."""

    def test_a_suite_run_before_anything_was_authored_is_refused(self, root):
        """It would be the suite as it stood before the verifier read
        anything, filed as the run that included what it wrote."""
        append(root, {"event": "entered", "target": "a", "step": "plan"})
        with pytest.raises(WorkflowError, match="no test has been authored"):
            append(root, suite_ran("a", "plan"))

    def test_a_fix_round_with_no_failing_run_behind_it_is_refused(self, root):
        """Without a named failure the round is a model invited to revise
        whatever it notices."""
        append(root, {"event": "entered", "target": "a", "step": "plan"})
        append(root, authored("a", "plan"))
        append(root, suite_ran("a", "plan", green=True))
        with pytest.raises(WorkflowError, match="no failing suite run"):
            append(root, {"event": "fixed", "target": "a", "step": "plan"})

    def test_the_suite_loop_ends_on_the_tests_loops_own_terms(self, git_root):
        """Section 3.d ends "same cap and same ending as c.ii", so it is the
        same decision on a different run."""
        state = fold([
            {"event": "entered", "target": "a", "step": "plan"},
            authored("a", "plan"),
            suite_ran("a", "plan", tree=snapshot_worktree_tree(git_root)),
        ])
        assert suite_terminal(git_root, state["a"], 1) == (
            verdictmod.VERDICT_ISSUES_FOUND)

    def test_moving_the_work_opens_a_new_suite_loop(self):
        """The suite loop runs the tests the step authored, so it goes back to
        zero wherever they do."""
        state = fold(entries_through("a", "decompose") + [
            authored("a", "decompose"),
            suite_ran("a", "decompose"),
            {"event": "fixed", "target": "a", "step": "decompose"},
            {"event": "returned", "target": "a", "toStep": "plan",
             "reason": "boundary wrong"},
        ])
        assert (state["a"]["suiteRounds"], state["a"]["fixRounds"]) == (0, 0)

    def test_the_cli_records_which_tests_the_run_named(
            self, root, monkeypatch, capsys):
        """The fix round is scoped to these and nothing else, so what the run
        named is on the record rather than re-derived later."""
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        append(root, authored("csv-model", "plan"))
        monkeypatch.setattr(fixloop, "run_suite", _fake_suite)
        code = _main(["suite", "--component", "csv-model",
                      "--workspace-root", str(root)])
        assert code == 0
        event = read(root)[-1]
        assert event["event"] == "suite-run"
        assert [f["name"] for f in event["failures"]] == [
            "tests/test_value.py::test_it"]

    def test_the_projection_carries_the_suite_position_and_the_fix_count(
            self, root):
        """Two different questions: how close the loop came to its bound, and
        how much repair the step needed to get there."""
        append(root, {"event": "entered", "target": "csv-model", "step": "plan"})
        append(root, authored("csv-model", "plan"))
        append(root, suite_ran("csv-model", "plan"))
        append(root, {"event": "fixed", "target": "csv-model", "step": "plan"})
        model = next(c for c in project(root)["components"]
                     if c["name"] == "csv-model")
        assert (model["suiteRounds"], model["fixRounds"]) == (1, 1)
        assert model["suiteCap"] == run_cap(root)


class TestProjectionFile:
    def test_a_mutating_command_publishes_the_projection(self, root):
        walk_to(root, "csv-parser", "contracts")
        _main(["enter", "mocks", "--component", "csv-parser",
               "--workspace-root", str(root)])
        p = root / ".dabbler" / "solution" / "projection.json"
        assert p.is_file()
        doc = json.loads(p.read_text())
        parser = next(c for c in doc["components"] if c["name"] == "csv-parser")
        assert parser["stepTitle"] == "Build stand-ins"

    def test_the_event_survives_a_manifest_that_cannot_be_projected(self, tmp_path):
        """The record is the point. A broken manifest must not eat an event."""
        code = _main(["enter", "plan", "--workspace-root", str(tmp_path)])
        assert code == 0
        assert len(read(tmp_path)) == 1
