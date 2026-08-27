"""The verifier's read surface: scope, budget, the log, and read fidelity."""

import json

import pytest

from ai_router import agency, ledger
from ai_router.session import register_session_start
from ai_router.transports.copilot import _parse_jsonl, _tool_calls
from ai_router.verify import EXIT_OK, run_round

from .conftest import record_preverify
from .test_verify import CLEAN_RESPONSE, make_result


def view_result(*numbered_lines) -> dict:
    """What the CLI's ``view`` tool hands back: the file's own 1-based line
    numbers against the text the model was shown."""
    return {
        "content": "\n".join(
            f"{n}. {text}" for n, text in numbered_lines
        )
    }


def call(tool, arguments, result=None) -> dict:
    return {"tool": tool, "arguments": arguments, "success": True,
            "result": result}


def grant(scope=("app.py",), budget=agency.DEFAULT_READ_BUDGET):
    return agency.grant_for_transport("copilot-cli", scope, budget)


class TestScope:
    def test_scope_is_the_change_its_imports_and_the_set_dir(self, tmp_path):
        repo = tmp_path / "repo"
        (repo / "pkg").mkdir(parents=True)
        (repo / "pkg" / "__init__.py").write_text("", encoding="utf-8")
        (repo / "pkg" / "helper.py").write_text("X = 1\n", encoding="utf-8")
        (repo / "pkg" / "sibling.py").write_text("Y = 2\n", encoding="utf-8")
        (repo / "pkg" / "other.py").write_text("Z = 3\n", encoding="utf-8")
        (repo / "pkg" / "changed.py").write_text(
            "from pkg.helper import X\nfrom . import sibling\n",
            encoding="utf-8",
        )
        set_dir = repo / "docs" / "sets" / "010-demo"
        set_dir.mkdir(parents=True)

        scope = agency.session_scope(repo, set_dir, ["pkg/changed.py"])

        assert "pkg/changed.py" in scope
        assert "pkg/helper.py" in scope          # declared by its import
        # `from . import sibling` names a module, not the package: the part
        # before `import` is empty and the dependency is only in the names.
        assert "pkg/sibling.py" in scope
        assert "docs/sets/010-demo" in scope     # the spec it is judged against
        # Not the repository: a file nothing changed and nothing imports.
        assert "pkg/other.py" not in scope

    def test_scope_accounting_never_overstates_confinement(self, tmp_path):
        """``in_scope`` means the operation was confined to the grant. A
        pattern with no path reaches the whole tree, so counting it as
        confined would leave the record attesting to a scoped review that
        did not happen."""
        (tmp_path / "app.py").write_text("A = 1\n", encoding="utf-8")
        (tmp_path / "elsewhere.py").write_text("B = 2\n", encoding="utf-8")
        record = agency.record_for_round(
            tmp_path, grant(scope=("app.py",)),
            {"tool_calls": [
                call("view", {"path": "app.py"}, view_result((1, "A = 1"))),
                call("view", {"path": "elsewhere.py"},
                     view_result((1, "B = 2"))),
                call("grep", {"pattern": "TODO"}),
                call("grep", {"pattern": "TODO", "paths": ["app.py"]}),
            ]},
        )
        assert [op.in_scope for op in record.operations] == [
            True, False, False, True
        ]
        assert record.out_of_scope == 2
        assert "unconfined" in record.operations[2].detail


class TestFidelity:
    def test_a_read_matching_the_disk_is_verbatim(self, tmp_path):
        (tmp_path / "app.py").write_text(
            "import os\nVALUE = 1\n", encoding="utf-8"
        )
        record = agency.record_for_round(
            tmp_path, grant(),
            {"tool_calls": [call(
                "view", {"path": "app.py"},
                view_result((1, "import os"), (2, "VALUE = 1")),
            )]},
        )
        assert record.operations[0].fidelity == agency.FIDELITY_VERBATIM
        assert record.transformed_reads == 0

    def test_a_scrubbed_read_is_marked_transformed(self, tmp_path):
        """The session 1 incident: the scrubber rewrites a correct
        interpolation into a placeholder, and the finding that follows cites
        a real path. The scrubber is right; the mark is what was missing."""
        (tmp_path / "app.py").write_text(
            'def headers(key):\n    return {"Authorization": f"Bearer {key}"}\n',
            encoding="utf-8",
        )
        record = agency.record_for_round(
            tmp_path, grant(),
            {"tool_calls": [call(
                "view", {"path": "app.py"},
                view_result(
                    (1, "def headers(key):"),
                    (2, '    return {"Authorization": f"******"}'),
                ),
            )]},
        )
        operation = record.operations[0]
        assert operation.fidelity == agency.FIDELITY_TRANSFORMED
        assert "line 2" in operation.detail
        assert record.transformed_reads == 1

    def test_a_partial_read_is_not_slandered_as_a_transform(self, tmp_path):
        """``view`` truncates and takes ranges. Only the lines actually
        shown are compared, so an unshown line is not a difference."""
        (tmp_path / "app.py").write_text(
            "one\ntwo\nthree\nfour\n", encoding="utf-8"
        )
        record = agency.record_for_round(
            tmp_path, grant(),
            {"tool_calls": [call(
                "view", {"path": "app.py"},
                view_result((3, "three"), (4, "four")),
            )]},
        )
        assert record.operations[0].fidelity == agency.FIDELITY_VERBATIM

    def test_an_uncomparable_read_is_unverified_not_clean(self, tmp_path):
        record = agency.record_for_round(
            tmp_path, grant(scope=("gone.py",)),
            {"tool_calls": [call(
                "view", {"path": "gone.py"}, view_result((1, "anything")),
            )]},
        )
        assert record.operations[0].fidelity == agency.FIDELITY_UNVERIFIED
        assert record.transformed_reads == 0


class TestBudgetAndLog:
    def test_reads_past_the_budget_are_counted(self, tmp_path):
        for name in ("a.py", "b.py", "c.py"):
            (tmp_path / name).write_text("X = 1\n", encoding="utf-8")
        record = agency.record_for_round(
            tmp_path, grant(scope=("a.py", "b.py", "c.py"), budget=2),
            {"tool_calls": [
                call("view", {"path": name}, view_result((1, "X = 1")))
                for name in ("a.py", "b.py", "c.py")
            ]},
        )
        assert record.reads == 3
        assert record.over_budget == 1

    def test_each_tool_is_logged_as_its_operation(self, tmp_path):
        (tmp_path / "app.py").write_text("X = 1\n", encoding="utf-8")
        record = agency.record_for_round(
            tmp_path, grant(),
            {"tool_calls": [
                call("glob", {"pattern": "*.py"}),
                call("grep", {"pattern": "TODO"}),
                call("view", {"path": "app.py"}, view_result((1, "X = 1"))),
                call("powershell", {"command": "rm -rf /"}),
            ]},
        )
        row = record.as_row()
        assert (row["listings"], row["searches"], row["reads"]) == (1, 1, 1)
        # A tool outside the grant performs none of the three operations.
        assert [op.kind for op in record.operations] == ["list", "search",
                                                         "read"]

    def test_a_granted_surface_used_for_nothing_stays_visible(self, tmp_path):
        """A round with tools granted and no call recorded is the shape a
        round takes when the grant never reached the model and it answered
        from invention. Smoothing that into 'no findings' hides it."""
        record = agency.record_for_round(
            tmp_path, grant(), {"tool_calls": []}
        )
        assert record.as_row()["reads"] == 0
        assert "looked at nothing" in agency.summary_line(record)


class TestTransportModes:
    def test_the_api_path_records_agency_none(self, tmp_path):
        record = agency.record_for_round(
            tmp_path, agency.grant_for_transport("api", ("app.py",), 40),
            {"tool_calls": [call("view", {"path": "app.py"})]},
        )
        row = record.as_row()
        assert row["mode"] == agency.MODE_NONE
        assert row["operations"] == []
        assert row["reason"]

    def test_the_briefing_declares_scope_and_budget_only_when_granted(self):
        briefed = agency.briefing(grant(scope=("app.py",), budget=7))
        assert "app.py" in briefed
        assert "7 reads" in briefed
        # Describing tools that were never sent invites reported reads that
        # never happened.
        assert agency.briefing(
            agency.grant_for_transport("api", ("app.py",), 7)
        ) == ""


class TestTransportReporting:
    def test_the_cli_stream_becomes_ordered_tool_calls(self):
        stream = "\n".join(json.dumps(event) for event in [
            {"type": "tool.execution_start",
             "data": {"toolCallId": "t1", "toolName": "view",
                      "arguments": {"path": "app.py"}}},
            {"type": "tool.execution_complete",
             "data": {"toolCallId": "t1", "success": True,
                      "result": {"content": "1. X = 1",
                                 "detailedContent": "a whole diff"}}},
            {"type": "tool.execution_start",
             "data": {"toolCallId": "t2", "toolName": "grep",
                      "arguments": {"pattern": "TODO"}}},
            {"type": "assistant.message",
             "data": {"content": "done", "model": "m"}},
        ])
        events, malformed = _parse_jsonl(stream)
        assert not malformed
        calls = _tool_calls(events)

        assert [c["tool"] for c in calls] == ["view", "grep"]
        assert calls[0]["arguments"] == {"path": "app.py"}
        assert calls[0]["result"] == {"content": "1. X = 1"}
        # A call the CLI never completed is still an attempt that was made.
        assert calls[1]["result"] is None


class TestRoundRecord:
    def test_the_round_carries_the_agency_record(
        self, sandbox_repo, monkeypatch
    ):
        import importlib

        repo, set_dir = sandbox_repo
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        (repo / "widget.py").write_text("def f(xs): return 1/len(xs)\n",
                                        encoding="utf-8")
        record_preverify(repo, set_dir)

        def fake_route(content, **kwargs):
            fake_route.prompt = content
            return make_result(
                CLEAN_RESPONSE, transport="copilot-cli",
                metadata={"tool_calls": [
                    call("view", {"path": str(repo / "widget.py")},
                         view_result((1, "def f(xs): return 1/len(xs)"))),
                    call("grep", {"pattern": "def f"}),
                ]},
            )

        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake_route
        )
        assert run_round(set_dir) == EXIT_OK

        recorded = ledger.read_rounds(repo, set_dir.name, 1)[0]["agency"]
        assert recorded["mode"] == agency.MODE_TOOLS
        assert recorded["reads"] == 1
        assert recorded["searches"] == 1
        assert recorded["operations"][0]["fidelity"] == (
            agency.FIDELITY_VERBATIM
        )
        # The scope the verifier was told about is the session's change.
        assert "widget.py" in recorded["scope"]
        assert "widget.py" in fake_route.prompt
