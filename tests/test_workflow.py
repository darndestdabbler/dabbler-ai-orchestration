"""The step driver: folding state, and treating a return as ordinary."""
import json

import pytest

from ai_router.workflow import (WorkflowError, append, fold, project, read,
                                _main)

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
        append(root, {"event": "entered", "target": "csv-parser", "step": "mocks"})
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
            {"event": "entered", "target": "a", "step": "mocks"},
        ])
        assert state["a"]["step"] == "mocks"

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
        state = fold([
            {"event": "entered", "target": "a", "step": "integration"},
            {"event": "returned", "target": "a", "toStep": "contracts",
             "reason": "boundary wrong"},
        ])
        assert state["a"]["step"] == "contracts"
        assert state["a"]["returns"] == 1

    def test_a_return_clears_any_earlier_approval(self):
        state = fold([
            {"event": "approved", "target": "a"},
            {"event": "returned", "target": "a", "toStep": "plan", "reason": "x"},
        ])
        assert state["a"]["approved"] is False


class TestProjection:
    def test_it_joins_the_manifest_to_live_state(self, root):
        append(root, {"event": "entered", "target": "csv-parser", "step": "mocks"})
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
    def test_a_single_reviewer_is_refused(self, root, capsys):
        code = _main(["reviewed", "--verdict", "clear", "--reviewers", "sol",
                      "--workspace-root", str(root)])
        assert code == 1
        assert "different providers" in capsys.readouterr().err

    def test_send_back_names_the_affected_components(self, root, capsys):
        _main(["send-back", "--to", "contracts", "--reason", "boundary wrong",
               "--affects", "csv-parser,csv-app", "--component", "csv-model",
               "--workspace-root", str(root)])
        out = capsys.readouterr().out
        assert "csv-parser, csv-app" in out

    def test_status_reports_who_is_waited_on(self, root, capsys):
        _main(["reviewed", "--verdict", "clear", "--reviewers", "sol,gemini",
               "--needs-approval", "--component", "csv-model",
               "--workspace-root", str(root)])
        _main(["status", "--workspace-root", str(root)])
        assert "needs you" in capsys.readouterr().out
