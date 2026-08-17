import subprocess

import pytest

from ai_router import ledger
from ai_router.route import DispatchError, NoCandidateError, RouteResult
from ai_router.session import register_session_start
from ai_router.verify import (
    EXIT_BLOCKING,
    EXIT_OK,
    EXIT_UNAVAILABLE,
    EXIT_USAGE,
    run_round,
)

BLOCKING_RESPONSE = """ISSUES FOUND

- **Issue 1:** the widget divides by zero on empty input
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** any empty batch crashes the run
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
        provider="openai", tier=3, input_tokens=1000, output_tokens=200,
        cost_usd=0.05, cost_status="measured", complexity_score=70,
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
    """A registered session with uncommitted work, plus a hook to script
    the verifier."""
    repo, set_dir = sandbox_repo
    register_session_start(set_dir, 1, engine="claude-code",
                           provider="anthropic")
    (repo / "widget.py").write_text("def f(xs): return 1/len(xs)\n",
                                    encoding="utf-8")

    def install(outcomes):
        import importlib

        fake = FakeVerifier(outcomes)
        # ai_router.route the ATTRIBUTE is the function; patch the module.
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        return fake

    return repo, set_dir, install


class TestRoundOne:
    def test_blocking_round_records_and_exits_4(self, flight):
        repo, set_dir, install = flight
        fake = install([make_result(BLOCKING_RESPONSE)])
        assert run_round(set_dir) == EXIT_BLOCKING
        rounds = ledger.read_rounds(repo, set_dir.name, 1)
        assert len(rounds) == 1
        assert rounds[0]["blocking"] is True
        assert rounds[0]["verdict"] == "ISSUES_FOUND"
        assert rounds[0]["findings"][0]["severity"] == "major"
        assert rounds[0]["verifier_provider"] == "openai"
        assert rounds[0]["orchestrator_provider"] == "anthropic"
        # Raw output saved before parsing, bytes unmodified.
        raw = ledger.raw_output_path(repo, set_dir.name, 1, 1)
        assert raw.read_text(encoding="utf-8") == BLOCKING_RESPONSE

    def test_evidence_carries_spec_status_and_untracked(self, flight):
        repo, set_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(set_dir)
        prompt = fake.calls[0]["prompt"]
        assert "First things" in prompt          # spec excerpt
        assert "git status --short" in prompt
        assert "def f(xs)" in prompt             # untracked content inlined

    def test_orchestrator_provider_excluded(self, flight):
        repo, set_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(set_dir)
        call = fake.calls[0]
        assert call["exclude_providers"] == ["anthropic"]
        assert call["task_type"] == "session-verification"

    def test_transport_override_reaches_dispatch(self, flight):
        repo, set_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(set_dir, transport="copilot-cli")
        assert fake.calls[0]["transport"] == "copilot-cli"

    def test_cli_rejects_unknown_transport(self, flight, capsys):
        _repo, set_dir, _install = flight
        from ai_router.verify import main

        with pytest.raises(SystemExit) as exc:
            main(["--session-set-dir", str(set_dir),
                  "--transport", "carrier-pigeon"])
        assert exc.value.code == 2  # argparse usage error
        assert "--transport" in capsys.readouterr().err

    def test_clean_round_stamps_verdict_and_change_log(self, flight):
        repo, set_dir, install = flight
        install([make_result(CLEAN_RESPONSE)])
        assert run_round(set_dir) == EXIT_OK
        from ai_router.progress import read_session_state

        state = read_session_state(set_dir)
        record = state["sessions"][0]
        assert record["verificationVerdict"] == "VERIFIED"
        assert record["verification"]["verifierProvider"] == "openai"
        text = (set_dir / "change-log.md").read_text(encoding="utf-8")
        assert "VERIFIED after 1 round(s)" in text

    def test_empty_evidence_refused(self, sandbox_repo, monkeypatch):
        repo, set_dir = sandbox_repo
        register_session_start(set_dir, 1, engine="claude-code",
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
        assert run_round(set_dir) == EXIT_UNAVAILABLE
        assert fake.calls == []  # never routed

    def test_truncated_response_writes_nothing(self, flight):
        repo, set_dir, install = flight
        install([make_result(CLEAN_RESPONSE, truncated=True)])
        assert run_round(set_dir) == EXIT_UNAVAILABLE
        assert ledger.read_rounds(repo, set_dir.name, 1) == []


class TestLoop:
    def test_round_two_is_fix_delta_with_prior_findings(self, flight):
        repo, set_dir, install = flight
        fake = install([
            make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE),
        ])
        assert run_round(set_dir) == EXIT_BLOCKING
        # Remediate, then re-run continues automatically.
        (repo / "widget.py").write_text(
            "def f(xs): return 1 / len(xs) if xs else 0\n", encoding="utf-8"
        )
        assert run_round(set_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "FIX DELTA ONLY" in prompt
        assert "divides by zero" in prompt       # prior finding re-presented
        rounds = ledger.read_rounds(repo, set_dir.name, 1)
        assert rounds[1]["previous_tree"] == rounds[0]["completion_tree"]
        assert rounds[1]["phase"] == "fix-delta"

    def test_round_cap_suspends(self, flight):
        repo, set_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(set_dir, max_rounds=1) == EXIT_BLOCKING
        assert run_round(set_dir, max_rounds=1) == EXIT_USAGE
        # The bound refuses BEFORE any metered call: only one round exists.
        assert len(ledger.read_rounds(repo, set_dir.name, 1)) == 1


class TestDispute:
    def _dispute(self, set_dir, *extra):
        from ai_router.verify import main

        return main([
            "dispute", "--session-set-dir", str(set_dir),
            "--round", "1", "--finding", "0",
            "--grounds", "out of scope per the not-covered list",
            *extra,
        ])

    def _blocked_round_one(self, flight, outcomes):
        repo, set_dir, install = flight
        fake = install(outcomes)
        assert run_round(set_dir) == EXIT_BLOCKING
        return repo, set_dir, fake

    def test_dispute_records_row(self, flight):
        repo, set_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        (repo / "docs" / "scope.md").write_text(
            "selector grammar is deliberately not covered\n",
            encoding="utf-8",
        )
        assert self._dispute(set_dir, "--evidence", "docs/scope.md") == EXIT_OK
        disputes = ledger.read_disputes(repo, set_dir.name, 1)
        assert len(disputes) == 1
        assert disputes[0]["round"] == 1
        assert disputes[0]["finding_index"] == 0
        assert disputes[0]["evidence_paths"] == ["docs/scope.md"]
        assert disputes[0]["filed_after_round"] == 1
        assert disputes[0]["recorded_at"]

    def test_prose_only_dispute_refused(self, flight, capsys):
        from ai_router.verify import EXIT_USAGE

        repo, set_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        assert self._dispute(set_dir) == EXIT_USAGE
        assert "prose-only disputes are refused" in capsys.readouterr().err
        assert ledger.read_disputes(repo, set_dir.name, 1) == []

    def test_nonexistent_evidence_path_refused(self, flight, capsys):
        from ai_router.verify import EXIT_USAGE

        repo, set_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        assert self._dispute(
            set_dir, "--evidence", "docs/ghost.md"
        ) == EXIT_USAGE
        assert "docs/ghost.md" in capsys.readouterr().err

    def test_unrecorded_finding_refused_with_listing(self, flight, capsys):
        from ai_router.verify import EXIT_STATE, main

        repo, set_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        (repo / "docs" / "scope.md").write_text("scope\n", encoding="utf-8")
        assert main([
            "dispute", "--session-set-dir", str(set_dir),
            "--round", "1", "--finding", "5", "--grounds", "nope",
            "--evidence", "docs/scope.md",
        ]) == EXIT_STATE
        err = capsys.readouterr().err
        assert "finding 5 does not exist" in err
        assert "0-based" in err          # self-correction listing

    def test_second_dispute_of_same_finding_refused(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, set_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        (repo / "docs" / "scope.md").write_text("scope\n", encoding="utf-8")
        assert self._dispute(set_dir, "--evidence", "docs/scope.md") == EXIT_OK
        assert self._dispute(
            set_dir, "--evidence", "docs/scope.md"
        ) == EXIT_STATE
        assert "already disputed" in capsys.readouterr().err
        assert len(ledger.read_disputes(repo, set_dir.name, 1)) == 1

    def test_rebuttal_rides_next_round_prompt(self, flight):
        repo, set_dir, fake = self._blocked_round_one(
            flight,
            [make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE)],
        )
        (repo / "docs" / "scope.md").write_text(
            "selector grammar is deliberately not covered\n",
            encoding="utf-8",
        )
        assert self._dispute(set_dir, "--evidence", "docs/scope.md") == EXIT_OK
        assert run_round(set_dir) == EXIT_OK
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
        repo, set_dir, fake = self._blocked_round_one(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(second_blocker),
                make_result(CLEAN_RESPONSE),
            ],
        )
        (repo / "docs" / "scope.md").write_text("scope\n", encoding="utf-8")
        assert self._dispute(set_dir, "--evidence", "docs/scope.md") == EXIT_OK
        assert run_round(set_dir) == EXIT_BLOCKING     # round 2: presented
        assert run_round(set_dir) == EXIT_OK           # round 3: settled
        prompt = fake.calls[2]["prompt"]
        assert "[DISPUTED]" not in prompt
        assert "UPHOLD" not in prompt
        assert "settled by that round's findings" in prompt

    def test_line_range_cite_renders_exact_passage(self, flight):
        repo, set_dir, install = flight
        # Present before round 1, so round 2's fix-delta carries no copy of
        # the file — the only way its text reaches round 2 is the citation.
        (repo / "docs" / "scope.md").write_text(
            "unrelated preamble\nthe grammar is out of scope\ntrailing\n",
            encoding="utf-8",
        )
        fake = install(
            [make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE)]
        )
        assert run_round(set_dir) == EXIT_BLOCKING
        assert self._dispute(
            set_dir, "--evidence", "docs/scope.md:2-2"
        ) == EXIT_OK
        disputes = ledger.read_disputes(repo, set_dir.name, 1)
        assert disputes[0]["evidence_paths"] == ["docs/scope.md:2-2"]
        assert run_round(set_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "the grammar is out of scope" in prompt
        assert "unrelated preamble" not in prompt

    def test_oversized_bare_cite_refused_range_accepted(self, flight, capsys):
        # A bare cite of a file over the inline cap would silently lose its
        # tail at render time; the CLI refuses it and names the range
        # syntax, which the same file then satisfies.
        from ai_router.verify import EXIT_USAGE

        repo, set_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        big = repo / "docs" / "big-spec.md"
        big.write_text("x" * (17 * 1024) + "\nthe real passage\n",
                       encoding="utf-8")
        assert self._dispute(
            set_dir, "--evidence", "docs/big-spec.md"
        ) == EXIT_USAGE
        assert "docs/big-spec.md:START-END" in capsys.readouterr().err
        assert self._dispute(
            set_dir, "--evidence", "docs/big-spec.md:2-2"
        ) == EXIT_OK

    def test_relative_path_escaping_repo_refused(self, flight, capsys):
        from ai_router.verify import EXIT_USAGE

        repo, set_dir, _ = self._blocked_round_one(
            flight, [make_result(BLOCKING_RESPONSE)]
        )
        outside = repo.parent / "private-notes.txt"
        outside.write_text("secret\n", encoding="utf-8")
        assert self._dispute(
            set_dir, "--evidence", "../private-notes.txt"
        ) == EXIT_USAGE
        assert "outside the repository" in capsys.readouterr().err
        assert ledger.read_disputes(repo, set_dir.name, 1) == []

    def test_undisputed_session_prompt_carries_no_dispute_language(
        self, flight
    ):
        repo, set_dir, fake = self._blocked_round_one(
            flight,
            [make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE)],
        )
        assert run_round(set_dir) == EXIT_OK
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
    def _adjudicate(self, set_dir, *extra):
        from ai_router.verify import main

        return main([
            "adjudicate", "--session-set-dir", str(set_dir),
            "--max-rounds", "1", *extra,
        ])

    def _capped_and_disputed(self, flight, outcomes):
        """Round 1 blocking at a cap of 1, the finding disputed — the
        adjudication preconditions all met."""
        from ai_router.verify import main

        repo, set_dir, install = flight
        fake = install(outcomes)
        assert run_round(set_dir, max_rounds=1) == EXIT_BLOCKING
        (repo / "docs" / "scope.md").write_text(
            "selector grammar is deliberately not covered\n",
            encoding="utf-8",
        )
        assert main([
            "dispute", "--session-set-dir", str(set_dir),
            "--round", "1", "--finding", "0",
            "--grounds", "out of scope per the not-covered list",
            "--evidence", "docs/scope.md",
        ]) == EXIT_OK
        return repo, set_dir, fake

    def test_refuses_below_cap(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, set_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(set_dir) == EXIT_BLOCKING
        assert self._adjudicate(set_dir, "--max-rounds", "3") == EXIT_STATE
        err = capsys.readouterr().err
        assert "round cap (3) is not reached" in err
        assert len(ledger.read_rounds(repo, set_dir.name, 1)) == 1

    def test_refuses_when_latest_round_not_blocking(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, set_dir, install = flight
        install([make_result(CLEAN_RESPONSE)])
        assert run_round(set_dir, max_rounds=1) == EXIT_OK
        assert self._adjudicate(set_dir) == EXIT_STATE
        assert "is not blocking" in capsys.readouterr().err

    def test_refuses_undisputed_blocking_finding(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, set_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(set_dir, max_rounds=1) == EXIT_BLOCKING
        assert self._adjudicate(set_dir) == EXIT_STATE
        err = capsys.readouterr().err
        assert "finding(s) 0" in err
        assert "verify dispute" in err       # the refusal names the exit

    def test_adjudicator_exclusion_superset(self, flight):
        repo, set_dir, fake = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_OVERRULE, model_name="gemini-pro",
                            provider="google"),
            ],
        )
        assert self._adjudicate(set_dir) == EXIT_OK
        call = fake.calls[1]
        # Orchestrator (anthropic) AND the round-1 verifier (openai).
        assert call["exclude_providers"] == ["anthropic", "openai"]
        assert call["task_type"] == "session-verification"

    def test_no_eligible_adjudicator_is_operator_only(self, flight, capsys):
        repo, set_dir, _ = self._capped_and_disputed(
            flight,
            [make_result(BLOCKING_RESPONSE),
             NoCandidateError("nothing survives the exclusions")],
        )
        assert self._adjudicate(set_dir) == EXIT_UNAVAILABLE
        assert "VERIFICATION UNAVAILABLE" in capsys.readouterr().err
        assert len(ledger.read_rounds(repo, set_dir.name, 1)) == 1

    def test_overrule_writes_verified_row_and_gate_passes(self, flight):
        repo, set_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_OVERRULE, model_name="gemini-pro",
                            provider="google"),
            ],
        )
        assert self._adjudicate(set_dir) == EXIT_OK
        rounds = ledger.read_rounds(repo, set_dir.name, 1)
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
        raw = ledger.raw_output_path(repo, set_dir.name, 1, row["round"])
        assert raw.read_text(encoding="utf-8") == ADJ_OVERRULE
        from ai_router.progress import read_session_state

        state = read_session_state(set_dir)
        assert state["sessions"][0]["verificationVerdict"] == "VERIFIED"
        # The existing gate reads the row with NO gate change.
        from ai_router.gates import check_verification_clean

        ok, _remediation = check_verification_clean(set_dir)
        assert ok

    def test_upheld_adjudication_still_blocked(self, flight):
        repo, set_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_UPHOLD, model_name="gemini-pro",
                            provider="google"),
            ],
        )
        assert self._adjudicate(set_dir) == EXIT_BLOCKING
        row = ledger.read_rounds(repo, set_dir.name, 1)[-1]
        assert row["verdict"] == "ISSUES_FOUND"
        assert row["blocking"] is True
        assert row["outcomes"][0]["outcome"] == "UPHELD"
        from ai_router.progress import read_session_state

        state = read_session_state(set_dir)
        assert state["sessions"][0]["verificationVerdict"] is None

    def test_second_adjudication_refused(self, flight, capsys):
        from ai_router.verify import EXIT_STATE

        repo, set_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_UPHOLD, provider="google"),
            ],
        )
        assert self._adjudicate(set_dir) == EXIT_BLOCKING
        assert self._adjudicate(set_dir) == EXIT_STATE
        assert "One adjudication per session, ever" in (
            capsys.readouterr().err
        )
        assert len(ledger.read_rounds(repo, set_dir.name, 1)) == 2

    def test_no_verify_round_opens_after_adjudication(self, flight, capsys):
        repo, set_dir, _ = self._capped_and_disputed(
            flight,
            [
                make_result(BLOCKING_RESPONSE),
                make_result(ADJ_UPHOLD, provider="google"),
            ],
        )
        assert self._adjudicate(set_dir) == EXIT_BLOCKING
        assert run_round(set_dir, max_rounds=99) == EXIT_USAGE
        assert "terminal" in capsys.readouterr().err
        assert len(ledger.read_rounds(repo, set_dir.name, 1)) == 2

    def test_prompt_carries_finding_dispute_evidence_and_delta(self, flight):
        repo, set_dir, fake = self._capped_and_disputed(
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
        assert self._adjudicate(set_dir) == EXIT_OK
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


class TestVerifierSelectionFailures:
    def test_retry_excludes_failed_provider(self, flight):
        repo, set_dir, install = flight
        fake = install([
            DispatchError("boom", provider="openai", model="gpt-5-4"),
            make_result(CLEAN_RESPONSE, model_name="gemini-pro",
                        provider="google"),
        ])
        assert run_round(set_dir) == EXIT_OK
        second = fake.calls[1]
        assert sorted(second["exclude_providers"]) == ["anthropic", "openai"]

    def test_no_candidate_is_operator_only(self, flight, capsys):
        repo, set_dir, install = flight
        install([NoCandidateError("nothing survives")])
        assert run_round(set_dir) == EXIT_UNAVAILABLE
        err = capsys.readouterr().err
        assert "VERIFICATION UNAVAILABLE" in err
        assert ledger.read_rounds(repo, set_dir.name, 1) == []

    def test_second_failure_propagates_as_call_failed(self, flight):
        from ai_router.verify import EXIT_CALL_FAILED

        repo, set_dir, install = flight
        install([
            DispatchError("boom", provider="openai"),
            DispatchError("boom again", provider="google"),
        ])
        assert run_round(set_dir) == EXIT_CALL_FAILED


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
