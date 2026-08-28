import datetime
import json
import os
import subprocess
from pathlib import Path

import pytest

from ai_router import ledger
from ai_router.route import DispatchError, NoCandidateError, RouteResult
from ai_router.session import register_session_start
from ai_router.verify import (
    EXIT_BLOCKING,
    EXIT_OK,
    EXIT_STATE,
    EXIT_UNAVAILABLE,
    EXIT_USAGE,
    run_reanchor,
    run_round,
)
from ai_router.evidence import run_git

from .conftest import record_preverify


BLOCKING_RESPONSE = """ISSUES FOUND

- **Issue 1:** the widget divides by zero on empty input
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** any empty batch crashes the run
  - **Evidence paths:** widget.py
"""

CLEAN_RESPONSE = (
    "VERIFIED — I attacked the diff (empty-input path, boundary counts) "
    "and could not break it."
)


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


def make_result(content, **overrides):
    defaults = dict(
        content=content, model_name="gpt-5-4", model_id="gpt-5.4",
        provider="openai", input_tokens=1000, output_tokens=200,
        escalated=False, escalation_history=[], elapsed_seconds=1.0,
        transport="api", truncated=False,
    )
    defaults.update(overrides)
    return RouteResult(**defaults)


class FakeVerifier:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def __call__(self, content, **kwargs):
        self.calls.append({"prompt": content, **kwargs})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def flight(sandbox_repo, monkeypatch):
    """A registered session with uncommitted work whose affected tests have
    run and been recorded, plus a hook to script the verifier."""
    repo, sessions_dir = sandbox_repo
    register_session_start(sessions_dir, 1, engine="claude-code",
                           provider="anthropic")
    (repo / "widget.py").write_text("def f(xs): return 1/len(xs)\n",
                                    encoding="utf-8")
    record_preverify(repo, sessions_dir)

    def install(outcomes):
        import importlib

        fake = FakeVerifier(outcomes)
        # ai_router.route the ATTRIBUTE is the function; patch the module.
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        return fake

    return repo, sessions_dir, install


class TestRoundOne:
    def test_blocking_round_records_and_exits_4(self, flight):
        repo, sessions_dir, install = flight
        fake = install([make_result(BLOCKING_RESPONSE)])
        assert run_round(sessions_dir) == EXIT_BLOCKING
        rounds = ledger.read_rounds(repo, 1)
        assert len(rounds) == 1
        assert rounds[0]["blocking"] is True
        assert rounds[0]["verdict"] == "ISSUES_FOUND"
        assert rounds[0]["findings"][0]["severity"] == "major"
        assert rounds[0]["verifier_provider"] == "openai"
        assert rounds[0]["orchestrator_provider"] == "anthropic"
        # Raw output saved before parsing, bytes unmodified.
        raw = ledger.raw_output_path(repo, 1, 1)
        assert raw.read_text(encoding="utf-8") == BLOCKING_RESPONSE

    def test_evidence_carries_spec_status_and_untracked(self, flight):
        repo, sessions_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(sessions_dir)
        prompt = fake.calls[0]["prompt"]
        assert "First things" in prompt          # spec excerpt
        assert "git status --short" in prompt
        assert "def f(xs)" in prompt             # untracked content inlined

    def test_orchestrator_provider_excluded(self, flight):
        repo, sessions_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(sessions_dir)
        call = fake.calls[0]
        assert call["exclude_providers"] == ["anthropic"]
        assert call["task_type"] == "session-verification"

    def test_transport_override_reaches_dispatch(self, flight):
        repo, sessions_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(sessions_dir, transport="copilot-cli")
        assert fake.calls[0]["transport"] == "copilot-cli"

    def test_cli_rejects_unknown_transport(self, flight, capsys):
        _repo, sessions_dir, _install = flight
        from ai_router.verify import main

        with pytest.raises(SystemExit) as exc:
            main(["--sessions-dir", str(sessions_dir),
                  "--transport", "carrier-pigeon"])
        assert exc.value.code == 2  # argparse usage error
        assert "--transport" in capsys.readouterr().err

    def test_clean_round_stamps_verdict_and_change_log(self, flight):
        repo, sessions_dir, install = flight
        install([make_result(CLEAN_RESPONSE)])
        assert run_round(sessions_dir) == EXIT_OK
        from ai_router.progress import read_session_state

        state = read_session_state(sessions_dir)
        record = state["sessions"][0]
        assert record["verificationVerdict"] == "VERIFIED"
        assert record["verification"]["verifierProvider"] == "openai"
        text = (sessions_dir / "change-log.md").read_text(encoding="utf-8")
        assert "VERIFIED after 1 round(s)" in text

    def test_empty_evidence_refused(self, sandbox_repo, monkeypatch):
        repo, sessions_dir = sandbox_repo
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        # Commit everything: clean tree, no untracked work -> nothing to
        # review, and routing an empty bundle is refused.
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "all committed")
        import importlib
        fake = FakeVerifier([make_result(CLEAN_RESPONSE)])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        assert run_round(sessions_dir) == EXIT_UNAVAILABLE
        assert fake.calls == []  # never routed

    def test_truncated_response_writes_nothing(self, flight):
        repo, sessions_dir, install = flight
        install([make_result(CLEAN_RESPONSE, truncated=True)])
        assert run_round(sessions_dir) == EXIT_UNAVAILABLE
        assert ledger.read_rounds(repo, 1) == []

    def test_a_round_needs_targeted_evidence_before_it_opens(
        self, sandbox_repo, monkeypatch, capsys
    ):
        """The cheap check precedes the expensive one. A change whose
        affected tests have not run is returned to its author, with the
        command that would have run them — not sent to a model."""
        repo, sessions_dir = sandbox_repo
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        (repo / "widget.py").write_text("def f(xs): return 1/len(xs)\n",
                                        encoding="utf-8")
        import importlib
        fake = FakeVerifier([make_result(CLEAN_RESPONSE)])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )

        assert run_round(sessions_dir) == EXIT_USAGE
        assert fake.calls == []
        err = capsys.readouterr().err
        assert "tests/test_config.py" in err       # the command, not a scold
        assert "--stage preverify-targeted" in err

        record_preverify(repo, sessions_dir)
        assert run_round(sessions_dir) == EXIT_OK

    def test_a_red_required_control_returns_before_any_model_spend(
        self, flight, monkeypatch, capsys
    ):
        """Deterministic controls are the cheapest reader the work will ever
        get. A required one that is not green comes back to its author, and
        the fact is on the record either way -- a refusal that leaves no
        trace is indistinguishable from a round nobody ran."""
        import importlib

        repo, sessions_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        config_module = importlib.import_module("ai_router.config")
        real_load = config_module.load_config

        def with_a_missing_linter(*args, **kwargs):
            config = real_load(*args, **kwargs)
            config["testing"] = dict(config.get("testing") or {})
            config["testing"]["controls"] = [{
                "kind": "lint", "command": "definitely-not-a-real-binary",
                "required": True,
            }]
            return config

        monkeypatch.setattr(config_module, "load_config",
                            with_a_missing_linter)

        assert run_round(sessions_dir) == EXIT_USAGE
        assert fake.calls == []
        assert ledger.read_rounds(repo, 1) == []
        err = capsys.readouterr().err
        assert "lint" in err and "UNKNOWN" in err
        recorded = json.loads(
            (repo / ".dabbler" / "runs"
             / "deterministic-facts.jsonl").read_text(encoding="utf-8")
        )
        assert {"kind": "lint", "status": "unknown"}.items() <= next(
            row for row in recorded["controls"] if row["kind"] == "lint"
        ).items()


class TestLoop:
    def test_round_two_is_fix_delta_with_prior_findings(self, flight):
        repo, sessions_dir, install = flight
        fake = install([
            make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE),
        ])
        assert run_round(sessions_dir) == EXIT_BLOCKING
        # Remediate, then re-run continues automatically.
        (repo / "widget.py").write_text(
            "def f(xs): return 1 / len(xs) if xs else 0\n", encoding="utf-8"
        )
        assert run_round(sessions_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "FIX DELTA ONLY" in prompt
        assert "divides by zero" in prompt       # prior finding re-presented
        rounds = ledger.read_rounds(repo, 1)
        assert rounds[1]["previous_tree"] == rounds[0]["completion_tree"]
        assert rounds[1]["phase"] == "fix-delta"

    def test_round_cap_terminates_unresolved_when_nothing_was_fixed(
        self, flight, capsys
    ):
        repo, sessions_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(sessions_dir, max_rounds=1) == EXIT_BLOCKING
        # The cap ends the loop before any metered call, and an unmoved
        # tree remediated nothing: unresolved, nothing lands.
        assert run_round(sessions_dir, max_rounds=1) == EXIT_BLOCKING
        assert len(ledger.read_rounds(repo, 1)) == 1
        err = capsys.readouterr().err
        assert "UNRESOLVED" in err
        assert "cannot be shown remediated" in err
        from ai_router.gates import check_verification_clean

        ok, _ = check_verification_clean(sessions_dir)
        assert not ok


class TestDispute:
    def _dispute(self, sessions_dir, *extra):
        from ai_router.verify import main

        return main([
            "dispute", "--sessions-dir", str(sessions_dir),
            "--round", "1", "--finding", "0",
            "--grounds", "out of scope per the not-covered list",
            *extra,
        ])

    def _blocked_round_one(self, flight, outcomes):
        repo, sessions_dir, install = flight
        fake = install(outcomes)
        assert run_round(sessions_dir) == EXIT_BLOCKING
        return repo, sessions_dir, fake

    def test_dispute_records_row(self, flight):
        repo, sessions_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        (repo / "docs" / "scope.md").write_text(
            "selector grammar is deliberately not covered\n",
            encoding="utf-8",
        )
        assert self._dispute(sessions_dir, "--evidence", "docs/scope.md") == EXIT_OK
        disputes = ledger.read_disputes(repo, 1)
        assert len(disputes) == 1
        assert disputes[0]["round"] == 1
        assert disputes[0]["finding_index"] == 0
        assert disputes[0]["evidence_paths"] == ["docs/scope.md"]
        assert disputes[0]["filed_after_round"] == 1
        assert disputes[0]["recorded_at"]

    def test_prose_only_dispute_refused(self, flight, capsys):
        from ai_router.verify import EXIT_USAGE

        repo, sessions_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        assert self._dispute(sessions_dir) == EXIT_USAGE
        assert "prose-only disputes are refused" in capsys.readouterr().err
        assert ledger.read_disputes(repo, 1) == []

    def test_nonexistent_evidence_path_refused(self, flight, capsys):
        from ai_router.verify import EXIT_USAGE

        repo, sessions_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        assert self._dispute(
            sessions_dir, "--evidence", "docs/ghost.md"
        ) == EXIT_USAGE
        assert "docs/ghost.md" in capsys.readouterr().err

    def test_unrecorded_finding_refused_with_listing(self, flight, capsys):
        from ai_router.verify import EXIT_STATE, main

        repo, sessions_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        (repo / "docs" / "scope.md").write_text("scope\n", encoding="utf-8")
        assert main([
            "dispute", "--sessions-dir", str(sessions_dir),
            "--round", "1", "--finding", "5", "--grounds", "nope",
            "--evidence", "docs/scope.md",
        ]) == EXIT_STATE
        err = capsys.readouterr().err
        assert "finding 5 does not exist" in err
        assert "0-based" in err          # self-correction listing

    def test_second_dispute_of_same_finding_refused(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, sessions_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        (repo / "docs" / "scope.md").write_text("scope\n", encoding="utf-8")
        assert self._dispute(sessions_dir, "--evidence", "docs/scope.md") == EXIT_OK
        assert self._dispute(
            sessions_dir, "--evidence", "docs/scope.md"
        ) == EXIT_STATE
        assert "already disputed" in capsys.readouterr().err
        assert len(ledger.read_disputes(repo, 1)) == 1

    def test_rebuttal_rides_next_round_prompt(self, flight):
        repo, sessions_dir, fake = self._blocked_round_one(
            flight,
            [make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE)],
        )
        (repo / "docs" / "scope.md").write_text(
            "selector grammar is deliberately not covered\n",
            encoding="utf-8",
        )
        assert self._dispute(sessions_dir, "--evidence", "docs/scope.md") == EXIT_OK
        assert run_round(sessions_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "[DISPUTED]" in prompt
        assert "out of scope per the not-covered list" in prompt   # grounds
        assert "deliberately not covered" in prompt        # cited content
        assert "UPHOLD" in prompt and "WITHDRAW" in prompt

    def test_withdrawn_dispute_not_re_presented_in_later_rounds(self, flight):
        # Round 2 withdraws the disputed finding (does not re-raise it) but
        # raises a NEW blocker; round 3 must not present the settled
        # dispute for adjudication again.
        second_blocker = (
            "ISSUES FOUND\n\n- **Issue 1:** the widget lacks input "
            "validation entirely\n  - **Severity:** Major\n"
        )
        repo, sessions_dir, fake = self._blocked_round_one(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(second_blocker),
                make_result(CLEAN_RESPONSE),
            ],
        )
        (repo / "docs" / "scope.md").write_text("scope\n", encoding="utf-8")
        assert self._dispute(sessions_dir, "--evidence", "docs/scope.md") == EXIT_OK
        assert run_round(sessions_dir) == EXIT_BLOCKING     # round 2: presented
        assert run_round(sessions_dir) == EXIT_OK           # round 3: settled
        prompt = fake.calls[2]["prompt"]
        assert "[DISPUTED]" not in prompt
        assert "UPHOLD" not in prompt
        assert "settled by that round's findings" in prompt

    def test_line_range_cite_renders_exact_passage(self, flight):
        repo, sessions_dir, install = flight
        # Present before round 1, so round 2's fix-delta carries no copy of
        # the file — the only way its text reaches round 2 is the citation.
        (repo / "docs" / "scope.md").write_text(
            "unrelated preamble\nthe grammar is out of scope\ntrailing\n",
            encoding="utf-8",
        )
        fake = install(
            [make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE)]
        )
        assert run_round(sessions_dir) == EXIT_BLOCKING
        assert self._dispute(
            sessions_dir, "--evidence", "docs/scope.md:2-2"
        ) == EXIT_OK
        disputes = ledger.read_disputes(repo, 1)
        assert disputes[0]["evidence_paths"] == ["docs/scope.md:2-2"]
        assert run_round(sessions_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "the grammar is out of scope" in prompt
        assert "unrelated preamble" not in prompt

    def test_oversized_bare_cite_refused_range_accepted(self, flight, capsys):
        # A bare cite of a file over the inline cap would silently lose its
        # tail at render time; the CLI refuses it and names the range
        # syntax, which the same file then satisfies.
        from ai_router.verify import EXIT_USAGE

        repo, sessions_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        big = repo / "docs" / "big-spec.md"
        big.write_text("x" * (17 * 1024) + "\nthe real passage\n",
                       encoding="utf-8")
        assert self._dispute(
            sessions_dir, "--evidence", "docs/big-spec.md"
        ) == EXIT_USAGE
        assert "docs/big-spec.md:START-END" in capsys.readouterr().err
        assert self._dispute(
            sessions_dir, "--evidence", "docs/big-spec.md:2-2"
        ) == EXIT_OK

    def test_relative_path_escaping_repo_refused(self, flight, capsys):
        from ai_router.verify import EXIT_USAGE

        repo, sessions_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        outside = repo.parent / "private-notes.txt"
        outside.write_text("secret\n", encoding="utf-8")
        assert self._dispute(
            sessions_dir, "--evidence", "../private-notes.txt"
        ) == EXIT_USAGE
        assert "outside the repository" in capsys.readouterr().err
        assert ledger.read_disputes(repo, 1) == []

    def test_undisputed_session_prompt_carries_no_dispute_language(
        self, flight
    ):
        repo, sessions_dir, fake = self._blocked_round_one(
            flight,
            [make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE)],
        )
        assert run_round(sessions_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "DISPUTED" not in prompt
        assert "UPHOLD" not in prompt
        assert "RE-RAISE" in prompt      # the plain instruction, unchanged


ADJ_OVERRULE = (
    "Dispute 1: OVERRULE — the scope decision is documented in the cited "
    "file; the finding re-litigates it."
)
ADJ_UPHOLD = (
    "Dispute 1: UPHOLD — the cited evidence does not address the failure "
    "scenario."
)


class TestAdjudicate:
    def _adjudicate(self, sessions_dir, *extra):
        from ai_router.verify import main

        return main([
            "adjudicate", "--sessions-dir", str(sessions_dir),
            "--max-rounds", "1", *extra,
        ])

    def _capped_and_disputed(self, flight, outcomes):
        """Round 1 blocking at a cap of 1, the finding disputed — the
        adjudication preconditions all met."""
        from ai_router.verify import main

        repo, sessions_dir, install = flight
        fake = install(outcomes)
        assert run_round(sessions_dir, max_rounds=1) == EXIT_BLOCKING
        (repo / "docs" / "scope.md").write_text(
            "selector grammar is deliberately not covered\n",
            encoding="utf-8",
        )
        assert main([
            "dispute", "--sessions-dir", str(sessions_dir),
            "--round", "1", "--finding", "0",
            "--grounds", "out of scope per the not-covered list",
            "--evidence", "docs/scope.md",
        ]) == EXIT_OK
        return repo, sessions_dir, fake

    def test_refuses_below_cap(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, sessions_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(sessions_dir) == EXIT_BLOCKING
        assert self._adjudicate(sessions_dir, "--max-rounds", "3") == EXIT_STATE
        err = capsys.readouterr().err
        assert "round cap (3) is not reached" in err
        assert len(ledger.read_rounds(repo, 1)) == 1

    def test_refuses_when_latest_round_not_blocking(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, sessions_dir, install = flight
        install([make_result(CLEAN_RESPONSE)])
        assert run_round(sessions_dir, max_rounds=1) == EXIT_OK
        assert self._adjudicate(sessions_dir) == EXIT_STATE
        assert "is not blocking" in capsys.readouterr().err

    def test_refuses_undisputed_blocking_finding(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, sessions_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(sessions_dir, max_rounds=1) == EXIT_BLOCKING
        assert self._adjudicate(sessions_dir) == EXIT_STATE
        err = capsys.readouterr().err
        assert "finding(s) 0" in err
        assert "verify dispute" in err       # the refusal names the exit

    def test_adjudicator_exclusion_superset(self, flight):
        repo, sessions_dir, fake = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_OVERRULE, model_name="gemini-pro",
                            provider="google"),
            ],
        )
        assert self._adjudicate(sessions_dir) == EXIT_OK
        call = fake.calls[1]
        # Orchestrator (anthropic) AND the round-1 verifier (openai).
        assert call["exclude_providers"] == ["anthropic", "openai"]
        assert call["task_type"] == "session-verification"

    def test_no_eligible_adjudicator_is_unresolved(self, flight, capsys):
        repo, sessions_dir, _ = self._capped_and_disputed(
            flight,
            [make_result(BLOCKING_RESPONSE),
             NoCandidateError("nothing survives the exclusions")],
        )
        assert self._adjudicate(sessions_dir) == EXIT_UNAVAILABLE
        err = capsys.readouterr().err
        assert "VERIFICATION UNAVAILABLE" in err
        assert "UNRESOLVED" in err
        # No exit a person can type is offered, because none exists.
        assert "waive" not in err
        assert len(ledger.read_rounds(repo, 1)) == 1

    def test_overrule_writes_verified_row_and_gate_passes(self, flight):
        repo, sessions_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_OVERRULE, model_name="gemini-pro",
                            provider="google"),
            ],
        )
        assert self._adjudicate(sessions_dir) == EXIT_OK
        rounds = ledger.read_rounds(repo, 1)
        row = rounds[-1]
        assert row["type"] == "adjudication"
        assert row["verdict"] == "VERIFIED"
        assert row["blocking"] is False
        assert row["outcomes"] == [{
            "finding_index": 0, "outcome": "OVERRULED",
            "reasons": ADJ_OVERRULE.split("— ", 1)[1],
        }]
        assert row["excluded_providers"] == ["anthropic", "openai"]
        assert row["previous_tree"] == rounds[0]["completion_tree"]
        raw = ledger.raw_output_path(repo, 1, row["round"])
        assert raw.read_text(encoding="utf-8") == ADJ_OVERRULE
        from ai_router.progress import read_session_state

        state = read_session_state(sessions_dir)
        assert state["sessions"][0]["verificationVerdict"] == "VERIFIED"
        # The existing gate reads the row with NO gate change.
        from ai_router.gates import check_verification_clean

        ok, _remediation = check_verification_clean(sessions_dir)
        assert ok

    def test_upheld_adjudication_is_unresolved(self, flight, capsys):
        repo, sessions_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_UPHOLD, model_name="gemini-pro",
                            provider="google"),
            ],
        )
        assert self._adjudicate(sessions_dir) == EXIT_BLOCKING
        out = capsys.readouterr().out
        assert "UNRESOLVED" in out
        assert "Nothing lands but the record" in out
        row = ledger.read_rounds(repo, 1)[-1]
        assert row["verdict"] == "ISSUES_FOUND"
        assert row["blocking"] is True
        assert row["outcomes"][0]["outcome"] == "UPHELD"
        from ai_router.progress import read_session_state

        state = read_session_state(sessions_dir)
        assert state["sessions"][0]["verificationVerdict"] is None

    def test_second_adjudication_refused(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, sessions_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_UPHOLD, provider="google"),
            ],
        )
        assert self._adjudicate(sessions_dir) == EXIT_BLOCKING
        assert self._adjudicate(sessions_dir) == EXIT_STATE
        assert "One adjudication per session, ever" in (
            capsys.readouterr().err
        )
        assert len(ledger.read_rounds(repo, 1)) == 2

    def test_no_verify_round_opens_after_adjudication(self, flight, capsys):
        repo, sessions_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_UPHOLD, provider="google"),
            ],
        )
        assert self._adjudicate(sessions_dir) == EXIT_BLOCKING
        assert run_round(sessions_dir, max_rounds=99) == EXIT_USAGE
        assert "terminal" in capsys.readouterr().err
        assert len(ledger.read_rounds(repo, 1)) == 2

    def test_prompt_carries_finding_dispute_evidence_and_delta(self, flight):
        repo, sessions_dir, fake = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_OVERRULE, provider="google"),
            ],
        )
        # Post-round remediation, so the fix-delta is non-empty.
        (repo / "widget.py").write_text(
            "def f(xs): return 1 / len(xs) if xs else 0\n", encoding="utf-8"
        )
        assert self._adjudicate(sessions_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "divides by zero" in prompt                  # finding verbatim
        # The COMPLETE recorded row, not a projection — recorded fields
        # beyond description/severity must ride along.
        assert '"category": "Correctness"' in prompt
        assert '"blocking": true' in prompt
        assert "out of scope per the not-covered list" in prompt   # grounds
        assert "deliberately not covered" in prompt         # cited content
        assert "if xs else 0" in prompt                     # fix-delta hunks
        assert "may NOT raise new findings" in prompt
        assert "UPHOLD" in prompt and "OVERRULE" in prompt


class TestCapTerminalStates:
    """The two ways a capped session ends, neither of which is a waiver
    and neither of which waits for a person."""

    def _capped(self, flight):
        """Round 1 blocking at a cap of 1 — the loop is at its bound."""
        repo, sessions_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(sessions_dir, max_rounds=1) == EXIT_BLOCKING
        return repo, sessions_dir

    def _fix(self, repo):
        (repo / "widget.py").write_text(
            "def f(xs): return 1 / len(xs) if xs else 0\n", encoding="utf-8"
        )

    def test_a_fixed_tree_at_the_cap_lands_labelled_unreviewed(
        self, flight, capsys
    ):
        repo, sessions_dir = self._capped(flight)
        self._fix(repo)
        assert run_round(sessions_dir, max_rounds=1) == EXIT_OK
        assert "REMEDIATED AT THE CAP" in capsys.readouterr().out
        rounds = ledger.read_rounds(repo, 1)
        row = rounds[-1]
        assert row["type"] == "remediated_at_cap"
        assert row["verdict"] == "REMEDIATED_AT_CAP"
        assert row["blocking"] is False
        assert row["remediated"]["reviewed_round"] == 1
        assert "divides by zero" in (
            row["remediated"]["findings"][0]["description"]
        )
        assert row["remediated"]["fix_paths"] == ["widget.py"]
        assert row["previous_tree"] == rounds[0]["completion_tree"]
        # No verifier is named, because none saw this tree.
        assert "verifier_model" not in row
        from ai_router.progress import read_session_state

        state = read_session_state(sessions_dir)
        assert state["sessions"][0]["verificationVerdict"] == (
            "REMEDIATED_AT_CAP"
        )
        text = (sessions_dir / "change-log.md").read_text(encoding="utf-8")
        assert "REMEDIATED AT THE CAP" in text and "UNREVIEWED" in text
        # The close gate passes it and says out loud what it is passing.
        from ai_router.gates import check_verification_clean

        ok, note = check_verification_clean(sessions_dir)
        assert ok
        assert "UNREVIEWED" in note
        # Terminal: no further round may open.
        assert run_round(sessions_dir, max_rounds=99) == EXIT_USAGE
        assert len(ledger.read_rounds(repo, 1)) == 2

    def test_a_change_away_from_the_finding_does_not_remediate_it(
        self, flight, capsys
    ):
        repo, sessions_dir = self._capped(flight)
        # The finding cites widget.py; this touches something else. A
        # changed tree is not a repair, and treating it as one would be
        # the retired waiver under a machine's name.
        (repo / "docs" / "notes.md").write_text("unrelated\n", encoding="utf-8")
        assert run_round(sessions_dir, max_rounds=1) == EXIT_BLOCKING
        err = capsys.readouterr().err
        assert "cannot be shown remediated" in err
        assert "widget.py" in err            # the refusal names what it wanted
        assert len(ledger.read_rounds(repo, 1)) == 1

    def test_a_disputed_finding_is_adjudicated_not_terminated(
        self, flight, capsys
    ):
        from ai_router.verify import main

        repo, sessions_dir = self._capped(flight)
        (repo / "docs" / "scope.md").write_text(
            "scope: deliberately not covered\n", encoding="utf-8"
        )
        assert main([
            "dispute", "--sessions-dir", str(sessions_dir),
            "--round", "1", "--finding", "0",
            "--grounds", "out of scope", "--evidence", "docs/scope.md",
        ]) == EXIT_OK
        self._fix(repo)
        # A dispute says the finding is wrong, not that it was fixed, so a
        # moved tree does not terminate the session over its own dispute.
        assert run_round(sessions_dir, max_rounds=1) == EXIT_USAGE
        assert "ai_router.verify adjudicate" in capsys.readouterr().err
        assert len(ledger.read_rounds(repo, 1)) == 1

    def test_the_fix_must_have_run_its_own_tests(
        self, flight, capsys, monkeypatch
    ):
        import importlib

        from ai_router.affected import PreverifyGate

        repo, sessions_dir = self._capped(flight)
        self._fix(repo)
        monkeypatch.setattr(
            importlib.import_module("ai_router.affected"), "preverify_gate",
            lambda *a, **k: PreverifyGate(False, "the fix was never run"),
        )
        assert run_round(sessions_dir, max_rounds=1) == EXIT_BLOCKING
        assert "the fix was never run" in capsys.readouterr().err
        assert len(ledger.read_rounds(repo, 1)) == 1

    def test_there_is_no_waiver_command(self, capsys):
        from ai_router.verify import main

        assert main(["waive", "--sessions-dir", "anything"]) == EXIT_USAGE
        err = capsys.readouterr().err
        assert "there is no waiver" in err
        assert "REMEDIATED AT THE CAP" in err and "UNRESOLVED" in err


class TestIncidentReplay:
    """The set's acceptance criterion: the dabbler-simulation-player
    incident shape (three blocking rounds re-raising a disputed finding)
    replayed end-to-end through dispute -> adjudicate -> close, on both
    adjudication outcomes."""

    def _three_rounds_and_dispute(self, flight, final_outcome):
        from ai_router.verify import main

        repo, sessions_dir, install = flight
        fake = install([
            make_result(BLOCKING_RESPONSE),
            make_result(BLOCKING_RESPONSE),
            make_result(BLOCKING_RESPONSE),
            final_outcome,
        ])
        assert run_round(sessions_dir) == EXIT_BLOCKING
        (repo / "widget.py").write_text(
            "def f(xs): return 1/len(xs)  # r2\n", encoding="utf-8"
        )
        assert run_round(sessions_dir) == EXIT_BLOCKING
        (repo / "widget.py").write_text(
            "def f(xs): return 1/len(xs)  # r3\n", encoding="utf-8"
        )
        assert run_round(sessions_dir) == EXIT_BLOCKING     # cap (3) reached
        (repo / "docs" / "scope.md").write_text(
            "selector grammar is deliberately not covered\n",
            encoding="utf-8",
        )
        assert main([
            "dispute", "--sessions-dir", str(sessions_dir),
            "--round", "3", "--finding", "0",
            "--grounds", "re-litigates a documented scope decision",
            "--evidence", "docs/scope.md",
        ]) == EXIT_OK
        return repo, sessions_dir, fake

    def _commit_and_push(self, repo):
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "session work")
        _git(repo, "push", "-q")

    def test_overruled_replay_closes_with_honest_ledger(self, flight):
        from ai_router.session import close
        from ai_router.verify import main

        repo, sessions_dir, _ = self._three_rounds_and_dispute(
            flight,
            make_result(ADJ_OVERRULE, model_name="gemini-pro",
                        provider="google"),
        )
        assert main(
            ["adjudicate", "--sessions-dir", str(sessions_dir)]
        ) == EXIT_OK
        self._commit_and_push(repo)
        assert close(sessions_dir) == 0
        # The honest ledger, in order: three ISSUES_FOUND rounds, one
        # dispute, one adjudication row naming the finding it overruled.
        rounds = ledger.read_rounds(repo, 1)
        assert [r["verdict"] for r in rounds] == (
            ["ISSUES_FOUND"] * 3 + ["VERIFIED"]
        )
        assert [r.get("type") for r in rounds] == (
            [None] * 3 + ["adjudication"]
        )
        assert rounds[3]["outcomes"][0] == {
            "finding_index": 0, "outcome": "OVERRULED",
            "reasons": ADJ_OVERRULE.split("— ", 1)[1],
        }
        disputes = ledger.read_disputes(repo, 1)
        assert len(disputes) == 1 and disputes[0]["round"] == 3
        from ai_router.progress import read_session_state

        record = read_session_state(sessions_dir)["sessions"][0]
        assert record["status"] == "complete"
        assert record["verificationVerdict"] == "VERIFIED"

    def test_upheld_replay_leaves_the_session_unresolved(self, flight):
        from ai_router.session import close
        from ai_router.verify import main

        repo, sessions_dir, _ = self._three_rounds_and_dispute(
            flight,
            make_result(ADJ_UPHOLD, model_name="gemini-pro",
                        provider="google"),
        )
        assert main(
            ["adjudicate", "--sessions-dir", str(sessions_dir)]
        ) == EXIT_BLOCKING
        self._commit_and_push(repo)
        # Unresolved is terminal and has no exit: nothing lands, and no
        # second command can change that. The record is the whole outcome.
        assert close(sessions_dir) == 1
        assert close(sessions_dir) == 1
        assert main(["waive", "--sessions-dir", str(sessions_dir)]) == EXIT_USAGE
        assert len(ledger.read_rounds(repo, 1)) == 4
        from ai_router.progress import read_session_state

        record = read_session_state(sessions_dir)["sessions"][0]
        assert record["status"] == "in-progress"
        assert record["verificationVerdict"] is None


class TestVerifierSelectionFailures:
    def test_retry_excludes_failed_provider(self, flight):
        repo, sessions_dir, install = flight
        fake = install([
            DispatchError("boom", provider="openai", model="gpt-5-4"),
            make_result(CLEAN_RESPONSE, model_name="gemini-pro",
                        provider="google"),
        ])
        assert run_round(sessions_dir) == EXIT_OK
        second = fake.calls[1]
        assert sorted(second["exclude_providers"]) == ["anthropic", "openai"]

    def test_no_candidate_is_operator_only(self, flight, capsys):
        repo, sessions_dir, install = flight
        install([NoCandidateError("nothing survives")])
        assert run_round(sessions_dir) == EXIT_UNAVAILABLE
        err = capsys.readouterr().err
        assert "VERIFICATION UNAVAILABLE" in err
        assert "Operator exit" in err    # the refusal names its resolution
        assert ledger.read_rounds(repo, 1) == []

    def test_second_failure_propagates_as_call_failed(self, flight):
        from ai_router.verify import EXIT_CALL_FAILED

        repo, sessions_dir, install = flight
        install([
            DispatchError("boom", provider="openai"),
            DispatchError("boom again", provider="google"),
        ])
        assert run_round(sessions_dir) == EXIT_CALL_FAILED


class TestAutoVerify:
    def test_route_result_verified_and_recorded(self, base_config,
                                                monkeypatch, tmp_path):
        from ai_router.verify import auto_verify

        base_config["_verification_template"] = ""
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH", str(tmp_path / "metrics.jsonl")
        )
        import importlib
        fake = FakeVerifier([make_result(CLEAN_RESPONSE)])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        generated = make_result("some answer", model_name="sonnet",
                                provider="anthropic")
        outcome = auto_verify(generated, "review this", "code-review",
                              base_config)
        assert outcome["verdict"] == "VERIFIED"
        assert not outcome["blocking"]
        assert fake.calls[0]["exclude_providers"] == ["anthropic"]
        from ai_router.metrics import load_metrics

        rows = load_metrics(base_config)
        assert rows and rows[-1]["call_type"] == "verify"
        assert rows[-1]["verifier_of"] == "sonnet"

    def test_router_error_degrades_to_none(self, base_config, monkeypatch):
        from ai_router.verify import auto_verify

        base_config["_verification_template"] = ""
        import importlib
        fake = FakeVerifier([NoCandidateError("no cross-provider verifier")])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        generated = make_result("answer", provider="anthropic")
        assert auto_verify(generated, "task", "code-review",
                           base_config) is None


class TestCritiquePrepare:
    """The critique pipeline's entry point: additive, off by default, and
    deciding nothing. No round, verdict or gate reads what it writes."""

    @pytest.fixture
    def shadow(self, flight, monkeypatch):
        import ai_router.config as config_module

        monkeypatch.setattr(
            config_module, "load_config",
            lambda *a, **k: {"critique": {"pipeline": "shadow"}},
        )
        return flight[0], flight[1]

    def test_writes_only_in_shadow_and_only_a_derived_change_id(
        self, flight, monkeypatch, tmp_path, capsys
    ):
        import ai_router.config as config_module
        from ai_router.verify import derive_change_id, main, run_prepare

        repo, sessions_dir, _install = flight
        # Off is the default, and off writes nothing at all.
        monkeypatch.setattr(config_module, "load_config", lambda *a, **k: {})
        assert run_prepare(sessions_dir) == EXIT_USAGE
        assert "critique.pipeline is 'off'" in capsys.readouterr().err
        assert not ledger.critique_root(repo, 1).exists()

        monkeypatch.setattr(
            config_module, "load_config",
            lambda *a, **k: {"critique": {"pipeline": "shadow"}},
        )
        # The identity is a pure function of the trees bounding the change.
        first = derive_change_id("a" * 40, "b" * 40)
        assert first == derive_change_id("a" * 40, "b" * 40)
        assert first != derive_change_id("a" * 40, "c" * 40)

        # No flag supplies one...
        assert main(["prepare", "--sessions-dir", str(sessions_dir),
                     "--change-id", first]) == EXIT_USAGE
        assert "no --change-id option" in capsys.readouterr().err

        # ...a claims file carrying one is refused rather than honoured...
        claims = tmp_path / "claims.json"
        claims.write_text(json.dumps({"change_id": first, "claims": []}),
                          encoding="utf-8")
        assert run_prepare(sessions_dir, claims_path=claims) == EXIT_USAGE
        assert "cannot be supplied" in capsys.readouterr().err
        assert ledger.read_review_runs(repo, 1) == []

        # ...and a value that is not a digest never becomes a directory.
        with pytest.raises(ledger.LedgerError, match="derived digest"):
            ledger.critique_dir(repo, 1, "../../elsewhere")

        # A claims file the author got wrong is refused before any machine
        # state moves — no run, no attempt for a retry to stumble over —
        # and the rejected payload is still preserved.
        for payload in (
            {"claims": [{"claim_id": "c1"}]},          # no statement
            {"claim_id": "c1", "statement": "a bare claim, unwrapped"},
        ):
            claims.write_text(json.dumps(payload), encoding="utf-8")
            assert run_prepare(sessions_dir, claims_path=claims) == EXIT_USAGE
            assert ledger.read_review_runs(repo, 1) == []
        kept = list(
            ledger.quarantine_dir(repo, 1).glob("*.json")
        )
        assert [json.loads(p.read_text(encoding="utf-8"))["record"]["claims"]
                for p in kept] == [[{"claim_id": "c1"}]]

    def test_remediation_links_an_attempt_without_rewriting_the_first(
        self, shadow, tmp_path
    ):
        from ai_router.verify import run_prepare

        repo, sessions_dir = shadow
        claims = tmp_path / "claims.json"
        claims.write_text(
            json.dumps({"claims": [{
                "claim_id": "c1", "kind": "behavior-changed",
                "statement": "the widget stops dividing by zero",
            }]}),
            encoding="utf-8",
        )
        assert run_prepare(sessions_dir, claims_path=claims) == EXIT_OK
        runs = ledger.read_review_runs(repo, 1)
        change_id = runs[0]["change_id"]
        first_attempt = dict(runs[0]["attempts"][0])
        recorded = ledger.read_review_claims(repo, 1, change_id)
        assert [c["claim_id"] for c in recorded["claims"]] == ["c1"]

        # The tree moves; the review run does not fork.
        (repo / "widget.py").write_text("def f(xs): return 2\n",
                                        encoding="utf-8")
        assert run_prepare(sessions_dir, claims_path=claims) == EXIT_OK
        runs = ledger.read_review_runs(repo, 1)
        assert len(runs) == 1 and runs[0]["change_id"] == change_id
        attempts = runs[0]["attempts"]
        assert attempts[0] == first_attempt
        assert attempts[1]["attempt"] == 2
        assert attempts[1]["previous_attempt"] == 1
        assert (attempts[1]["completion_tree"]
                != first_attempt["completion_tree"])

        # Silence on a later attempt leaves the claims standing; it is not
        # a withdrawal.
        (repo / "widget.py").write_text("def f(xs): return 4\n",
                                        encoding="utf-8")
        assert run_prepare(sessions_dir) == EXIT_OK
        assert ledger.read_review_claims(
            repo, 1, change_id)["claims"] == recorded["claims"]

        # A recorded attempt is not rewritable, by any caller.
        runs = ledger.read_review_runs(repo, 1)
        rewritten = {
            **runs[0],
            "attempts": [{**runs[0]["attempts"][0], "status": "closed"}],
        }
        with pytest.raises(ledger.LedgerError, match="append-only"):
            ledger.write_review_run(repo, 1, rewritten)

    def test_the_claims_markdown_twin_is_decorative(self, shadow):
        from ai_router.verify import run_prepare

        repo, sessions_dir = shadow
        assert run_prepare(sessions_dir) == EXIT_OK
        change_id = ledger.read_review_runs(
            repo, 1)[0]["change_id"]
        twin = ledger.review_claims_twin_path(repo, 1, change_id)
        assert twin.exists()
        canonical = ledger.read_review_claims(repo, 1, change_id)

        twin.unlink()
        assert ledger.read_review_claims(
            repo, 1, change_id) == canonical
        (repo / "widget.py").write_text("def f(xs): return 3\n",
                                        encoding="utf-8")
        assert run_prepare(sessions_dir) == EXIT_OK
        runs = ledger.read_review_runs(repo, 1)
        assert runs[0]["change_id"] == change_id
        assert [a["attempt"] for a in runs[0]["attempts"]] == [1, 2]


class TestBaselineReanchorRefusals:
    """A round snapshot is a dangling tree, so a session that moves between
    machines arrives with a baseline it cannot resolve. The recovery must
    not become a way to choose one's own review scope, so only two commits
    can stand in for the reviewed tree: the last one at or before the round
    and the first one after it."""

    def _at(self, repo, hours):
        """A timestamp *hours* after the sandbox's seed commit. Derived
        rather than fixed: the seed is stamped at real time, and a history
        whose dates run backwards from it is the pathological case these
        rules exist to reject, not the ordinary one they are read against."""
        rc, when, _ = run_git(repo, "log", "-1", "--format=%cI", "HEAD")
        base = datetime.datetime.fromisoformat(when.strip())
        return (base + datetime.timedelta(hours=hours)).isoformat()

    def _commit(self, repo, name, when):
        (repo / name).write_text(f"# {name}", encoding="utf-8")
        env = dict(os.environ, GIT_COMMITTER_DATE=when, GIT_AUTHOR_DATE=when)
        subprocess.run(["git", "-C", str(repo), "add", "-A"],
                       capture_output=True, env=env)
        subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", name],
                       capture_output=True, env=env)
        rc, sha, _ = run_git(repo, "rev-parse", "HEAD")
        return sha

    def _round_one(self, repo, tree, recorded_at=None):
        ledger.append_round(repo, 1, {
            "round": 1,
            "phase": "full",
            "verdict": "ISSUES_FOUND",
            "blocking": True,
            "verifier_model": "gpt-5-4",
            "verifier_provider": "openai",
            "findings": [{"description": "broken", "severity": "major"}],
            "completion_tree": tree,
            "recorded_at": recorded_at or self._at(repo, 1),
        })

    def _history(self, repo):
        """One commit before the round, then two remediation commits after
        it -- the shape every fix-delta recovery actually arrives in."""
        before = self._commit(repo, "before.py", self._at(repo, 1))
        round_at = self._at(repo, 2)
        first = self._commit(repo, "first_fix.py", self._at(repo, 3))
        second = self._commit(repo, "second_fix.py", self._at(repo, 4))
        self._round_one(repo, "0" * 40, recorded_at=round_at)
        return before, first, second

    def test_refused_while_the_recorded_tree_resolves(self, flight):
        repo, sessions_dir, _ = flight
        rc, head_tree, _ = run_git(repo, "rev-parse", "HEAD^{tree}")
        assert rc == 0
        self._round_one(repo, head_tree)
        assert run_reanchor(sessions_dir, "HEAD", "moved machines") != 0
        assert ledger.read_reanchors(repo, 1) == []

    def test_refused_before_any_round_exists(self, flight):
        repo, sessions_dir, _ = flight
        assert run_reanchor(sessions_dir, "HEAD", "moved machines") != 0
        assert ledger.read_reanchors(repo, 1) == []

    def test_refused_when_the_anchor_hides_earlier_remediation(self, flight):
        """The defect an ancestor-of-HEAD check let through: anchoring on
        the newest ancestor drops every earlier fix out of the next round."""
        repo, sessions_dir, _ = flight
        _, _, second = self._history(repo)
        assert run_reanchor(sessions_dir, second, "moved machines") != 0
        assert ledger.read_reanchors(repo, 1) == []

    def test_refused_when_the_anchor_is_not_in_this_history(self, flight):
        repo, sessions_dir, _ = flight
        self._history(repo)
        subprocess.run(["git", "-C", str(repo), "checkout", "-q", "-b",
                        "sidebranch", "HEAD~1"], capture_output=True)
        side = self._commit(repo, "side.py", "2026-08-27T13:30:00+00:00")
        subprocess.run(["git", "-C", str(repo), "checkout", "-q", "main"],
                       capture_output=True)
        assert run_reanchor(sessions_dir, side, "moved machines") != 0
        assert ledger.read_reanchors(repo, 1) == []

    def test_the_first_commit_after_the_round_is_refused(self, flight):
        """The tempting one. A round reviews an uncommitted tree, so this
        commit may be what that tree became -- or it may be the first fix.
        Nothing here can tell, so it is refused rather than assumed."""
        repo, sessions_dir, _ = flight
        _, first, _ = self._history(repo)
        assert run_reanchor(sessions_dir, first, "moved machines") != 0
        assert ledger.read_reanchors(repo, 1) == []

    def test_a_backdated_remediation_commit_cannot_become_the_anchor(self, flight):
        """A committer date is user-controlled to the second, so it cannot
        be read as commit order. The anchor stops at the first post-round
        commit, which puts anything below it out of reach whatever date it
        claims."""
        repo, sessions_dir, _ = flight
        before, _, _ = self._history(repo)
        # Dated BEFORE the round but committed after both remediation
        # commits -- the shape a backdated fix actually has. Read off
        # `before` rather than HEAD, which by now is the newest commit.
        rc, when, _ = run_git(repo, "log", "-1", "--format=%cI", before)
        stamped = datetime.datetime.fromisoformat(when.strip())
        backdated = self._commit(
            repo, "backdated.py",
            (stamped + datetime.timedelta(minutes=1)).isoformat(),
        )
        assert run_reanchor(sessions_dir, backdated, "moved machines") != 0
        assert ledger.read_reanchors(repo, 1) == []

    def test_a_recorded_round_head_settles_the_anchor_without_dates(
        self, flight
    ):
        """A committer date is a heuristic at best. Once a round records the
        commit it stood on, the anchor is read off the graph: a remediation
        commit backdated to before the round is still refused, because the
        round said where it was."""
        repo, sessions_dir, _ = flight
        before = self._commit(repo, "before.py", self._at(repo, 1))
        round_at = self._at(repo, 2)
        backdated = self._commit(repo, "backdated_fix.py", self._at(repo, 1))
        self._commit(repo, "later_fix.py", self._at(repo, 4))
        ledger.append_round(repo, 1, {
            "round": 1, "phase": "full", "verdict": "ISSUES_FOUND",
            "blocking": True, "verifier_model": "gpt-5-4",
            "verifier_provider": "openai",
            "findings": [{"description": "broken", "severity": "major"}],
            "completion_tree": "0" * 40, "head_commit": before,
            "recorded_at": round_at,
        })

        assert run_reanchor(sessions_dir, backdated, "moved machines") != 0
        assert run_reanchor(sessions_dir, before, "moved machines") == 0
        assert ledger.read_reanchors(repo, 1)[0]["anchor_commit"] == before

    def test_the_last_commit_before_the_round_is_the_only_legal_anchor(
        self, flight
    ):
        """It re-reviews the session's own work rather than risking a gap,
        which is why it is the only one accepted."""
        repo, sessions_dir, _ = flight
        before, _, _ = self._history(repo)
        assert run_reanchor(sessions_dir, before, "moved machines") == 0
        rows = ledger.read_reanchors(repo, 1)
        assert rows[0]["anchor_commit"] == before
        rc, tree, _ = run_git(repo, "rev-parse", before + "^{tree}")
        assert rows[0]["anchor_tree"] == tree


class TestRoundBaselineTravels:
    def test_a_round_recorded_in_one_checkout_resolves_in_another(
        self, flight, tmp_path
    ):
        """The two-checkout case D98 was written about: record a round in
        A, push the way the operator pushes mid-session, fetch in B, and
        the fix delta is computable in B from the recorded tree itself --
        no `verify reanchor`, no substitute baseline."""
        from ai_router.evidence import (
            changed_paths_between, ensure_round_refspecs, object_exists,
            snapshot_worktree_tree,
        )

        repo, sessions_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(sessions_dir) == EXIT_BLOCKING
        recorded = ledger.read_rounds(repo, 1)[0]["completion_tree"]

        ensure_round_refspecs(repo)
        # Remediation begins the moment a round reports, so the tree the
        # round reviewed is never the tree that gets committed: the only
        # way it reaches another checkout is as a round ref.
        (repo / "widget.py").write_text(
            "def f(xs): return 1/len(xs) if xs else 0\n", encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(repo), "add", "-A"],
                       capture_output=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m",
                        "mid-session work"], capture_output=True)
        pushed = subprocess.run(["git", "-C", str(repo), "push", "-q"],
                                capture_output=True, text=True)
        assert pushed.returncode == 0, pushed.stderr

        rc, remote, _ = run_git(repo, "remote", "get-url", "origin")
        other = tmp_path / "other"
        subprocess.run(["git", "clone", "-q", "--no-local", "--branch", "main",
                        str(Path(repo, remote).resolve()),
                        str(other)], capture_output=True)
        assert not object_exists(other, recorded)   # a plain clone lacks it
        ensure_round_refspecs(other)
        subprocess.run(["git", "-C", str(other), "fetch", "-q"],
                       capture_output=True)

        assert object_exists(other, recorded)
        current = snapshot_worktree_tree(other)
        assert changed_paths_between(other, recorded, current) is not None
