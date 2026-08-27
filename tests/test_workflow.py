"""The step driver: folding state, and treating a return as ordinary."""
import json

import pytest

from ai_router import stepreview
from ai_router.solution import STEPS
from ai_router.stepreview import ReviewerOutcome, StepReview
from ai_router.workflow import (WorkflowError, append, current_step, fold,
                                project, read, validate_transition, _main)


def entries_through(target, step):
    """Every `entered` event from the first step up to `step`. There is no
    shortcut, which is the rule under test."""
    return [{"event": "entered", "target": target, "step": s}
            for s in STEPS[:STEPS.index(step) + 1]]


def walk_to(root, target, step):
    for event in entries_through(target, step):
        append(root, event)


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
