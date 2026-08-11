"""Set 119 S2 — the close preflight: does it predict the close it claims to?

A preflight is a **prediction instrument**, so the tests that matter are
not "does it print rows" but "does its answer equal the close's answer".
Two properties carry the whole module:

1. **It calls, it does not copy.** Every verdict must come from the
   predicate ``close_session`` runs. The structural tests below assert
   coverage against the registries themselves, so a check added to
   ``GATE_CHECKS`` (or a check demoted to advisory) lands here without an
   edit — a hand-listed expectation would rot the first time either
   registry moved.
2. **It reports; it never refuses.** This set's spec forbids a new gate.
   The falsifier pairs plant an advisory failure and a blocking failure
   into the SAME set and assert only the second one changes the verdict.

L-112-1 governs the shape: a predictor that agrees with reality on the
happy path looks identical to one that always says yes. So every
backstop prediction is planted BOTH ways and cross-checked against what
``run_close_backstop`` actually does with a fake route seam — the
agreement, not the prediction, is the assertion.
"""

from __future__ import annotations

import ast
import json
import os
import re
import subprocess
from pathlib import Path

import pytest

import close_backstop
import close_preflight
import gate_checks
from close_preflight import (
    BACKSTOP_CHECK_NAME,
    CONTRACT_GATE_CHECK_NAME,
    DISPOSITION_PRESENT_CHECK_NAME,
    EXIT_BLOCKING_UNMET,
    EXIT_INVALID_INVOCATION,
    EXIT_OK,
    PATH_AWARE_CRITIQUE_CHECK_NAME,
    evaluate,
    preflight_check_names,
    render,
    render_replay,
    replay_history,
)
from disposition import Disposition, write_disposition
from session_checklist import record_post
from session_state import NextOrchestrator, register_session_start
from stamp_fixtures import write_stamped_evidence


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _git(repo_root: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args], cwd=str(repo_root), check=True,
        capture_output=True, text=True,
    )


def _valid_next_orc() -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-fable-5",
        effort="high",
        reason={"code": "continue-current-trajectory", "specifics": "next"},
    )


def _api_disposition(verdict="VERIFIED", method="api") -> Disposition:
    return Disposition(
        status="completed",
        summary="preflight matrix",
        verification_method=method,
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
        verification_verdict=verdict,
    )


@pytest.fixture
def workable(tmp_path: Path, monkeypatch):
    """A registered, pushed, activity-logged session-1 set mid-flight.

    Deliberately WITHOUT a disposition and WITHOUT verification evidence:
    that is the state a session is in for most of its life, and it is the
    state the preflight exists to describe. Each test lands what it needs.
    Returns ``(repo_root, set_dir)``.
    """
    monkeypatch.setenv(
        "AI_ROUTER_METRICS_PATH", str(tmp_path / "metrics.jsonl")
    )
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "t@example.invalid")
    _git(root, "config", "user.name", "T")
    _git(root, "config", "commit.gpgsign", "false")
    (root / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(root, "add", "README.md")
    _git(root, "commit", "-m", "baseline")
    bare = tmp_path / "repo.git"
    bare.mkdir()
    _git(bare, "init", "--bare", "-b", "main")
    _git(root, "remote", "add", "origin", str(bare))
    _git(root, "push", "-u", "origin", "main")

    set_dir = root / "docs" / "session-sets" / "preflight-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text(
        "# spec\n\n## Sessions\n\n### Session 1 of 2: Work\n\n"
        "**Steps:**\n1. Do the work.\n",
        encoding="utf-8",
    )
    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-fable-5",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "preflight-set",
            "createdDate": "2026-08-10T00:00:00-04:00",
            "totalSessions": 2,
            "entries": [{
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-1/work",
                "dateTime": "2026-08-10T01:00:00-04:00",
                "description": "did work",
                "status": "complete",
            }],
        }, indent=2),
        encoding="utf-8",
    )
    record_post(str(set_dir), 1, [])
    return root, set_dir


def _land(root: Path, set_dir: Path, disposition: Disposition) -> None:
    write_disposition(str(set_dir), disposition)
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "land session work")
    _git(root, "push", "origin", "main")


def _seed_settling_evidence(root: Path, set_dir: Path) -> None:
    """A clean stamped round that settles the close (no backstop needed)."""
    row = write_stamped_evidence(set_dir)
    Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
        json.dumps(row) + "\n", encoding="utf-8",
    )
    _land(root, set_dir, _api_disposition(verdict="VERIFIED"))


def _row(report, check: str):
    matches = [o for o in report.obligations if o.check == check]
    assert matches, f"{check} missing from the report"
    return matches[0]


# ---------------------------------------------------------------------------
# It calls the close's predicates rather than carrying its own
# ---------------------------------------------------------------------------

class TestItCallsRatherThanCopies:

    def test_every_registered_gate_check_is_reported(self, workable):
        """Structural, not hand-listed: a check added to GATE_CHECKS is
        covered here automatically. A literal expected-names list would
        pass forever while the registry grew past it."""
        _root, set_dir = workable
        report = evaluate(str(set_dir))
        reported = {o.check for o in report.obligations}
        for name, _fn in gate_checks.GATE_CHECKS:
            assert name in reported

    def test_report_covers_the_registry_plus_the_synthetics(self, workable):
        """The two set-terminal policy gates appear only when the set
        opted into them AND the close is terminal, so a mid-set fixture
        that declares neither reports the registry rows alone."""
        _root, set_dir = workable
        reported = [o.check for o in evaluate(str(set_dir)).obligations]
        assert reported == [
            DISPOSITION_PRESENT_CHECK_NAME,
            *[name for name, _fn in gate_checks.GATE_CHECKS],
            BACKSTOP_CHECK_NAME,
        ]
        assert set(reported) <= set(preflight_check_names())

    def test_blocking_flags_are_the_close_s_own_ruling(self, workable):
        """``is_blocking_check`` is the single authority. Re-deriving it
        here would let the preflight refuse something the close waves
        through -- the exact failure mode that makes a preflight worse
        than nothing."""
        _root, set_dir = workable
        report = evaluate(str(set_dir))
        for ob in report.obligations:
            if ob.check == DISPOSITION_PRESENT_CHECK_NAME:
                assert ob.blocking is True
                continue
            assert ob.blocking is gate_checks.is_blocking_check(ob.check)

    def test_a_demoted_check_is_reported_as_advisory(self, workable):
        """The Set 116 S3 demotions must show through, not be re-armed."""
        _root, set_dir = workable
        report = evaluate(str(set_dir))
        for name in gate_checks.ADVISORY_CHECKS:
            assert _row(report, name).blocking is False

    def test_backstop_check_name_matches_close_session_s(self):
        """The constant is restated in close_preflight to keep the import
        of verify_session lazy; this pins the two spellings together."""
        assert BACKSTOP_CHECK_NAME == close_backstop.BACKSTOP_CHECK_NAME

    def test_detail_is_the_predicate_s_own_remediation(self, workable):
        """Verbatim, not paraphrased: a paraphrase is a second spelling
        that goes stale the first time the gate's wording changes."""
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        (set_dir / "scratch.md").write_text("dirty\n", encoding="utf-8")
        report = evaluate(str(set_dir))
        passed, remediation = gate_checks.check_working_tree_clean(
            str(set_dir), None,
        )
        row = _row(report, "working_tree_clean")
        assert row.met is False and passed is False
        assert remediation in row.detail or row.detail == remediation


# ---------------------------------------------------------------------------
# No side effects, no routed call
# ---------------------------------------------------------------------------

class TestItChangesNothing:

    def test_evaluate_writes_no_file(self, workable):
        _root, set_dir = workable
        before = {
            p: p.stat().st_mtime_ns
            for p in sorted(set_dir.rglob("*")) if p.is_file()
        }
        evaluate(str(set_dir))
        after = {
            p: p.stat().st_mtime_ns
            for p in sorted(set_dir.rglob("*")) if p.is_file()
        }
        assert after == before

    def test_evaluate_appends_no_event(self, workable):
        _root, set_dir = workable
        ledger = set_dir / "session-events.jsonl"
        before = ledger.read_text(encoding="utf-8")
        evaluate(str(set_dir))
        assert ledger.read_text(encoding="utf-8") == before

    def test_evaluate_never_routes(self, workable, monkeypatch):
        """The conftest autouse guard already refuses a live route; this
        makes the refusal local and unmissable. A preflight that spends
        money to predict a spend is not a preflight."""
        monkeypatch.setattr(
            close_backstop, "_default_route",
            lambda *a, **k: pytest.fail("the preflight routed"),
        )
        _root, set_dir = workable
        evaluate(str(set_dir))

    def test_evaluate_takes_no_close_lock(self, workable):
        """Runnable while a close is in flight: it must not contend."""
        import close_lock

        _root, set_dir = workable
        with close_lock.close_session_lock(str(set_dir)):
            report = evaluate(str(set_dir))
        assert report.obligations


# ---------------------------------------------------------------------------
# The verdict: reports, never refuses
# ---------------------------------------------------------------------------

class TestVerdict:

    def test_a_closeable_session_reports_nothing_blocking(
        self, workable,
    ):
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        report = evaluate(str(set_dir))
        assert report.unmet_blocking == []
        assert report.exit_code == EXIT_OK
        assert report.to_dict()["would_close"] is True

    def test_an_uncommitted_tree_is_reported_blocking(self, workable):
        """The falsifier for the row above: same set, one dirty file."""
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        (set_dir / "scratch.md").write_text("uncommitted\n", encoding="utf-8")
        report = evaluate(str(set_dir))
        assert "working_tree_clean" in [o.check for o in report.unmet_blocking]
        assert report.exit_code == EXIT_BLOCKING_UNMET

    def test_an_advisory_failure_alone_does_not_change_the_verdict(
        self, workable,
    ):
        """No new gate (spec decision 2). An advisory failure is printed
        and stepped over, exactly as the close steps over it."""
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        (set_dir / "checklist-posts.jsonl").unlink(missing_ok=True)
        _git(root, "add", "-A")
        _git(root, "commit", "-m", "drop the post ledger")
        _git(root, "push", "origin", "main")

        report = evaluate(str(set_dir))
        assert report.unmet_advisory, "expected an advisory failure to plant"
        assert all(not o.blocking for o in report.unmet_advisory)
        assert report.exit_code == EXIT_OK

    def test_missing_disposition_is_one_row_not_a_short_circuit(
        self, workable,
    ):
        """``run_gate_checks`` returns the synthetic row INSTEAD of the
        chain. The preflight must not: naming everything in one pass is
        the entire deliverable, and 'no disposition yet' is the normal
        state of a session that is still working."""
        _root, set_dir = workable
        assert not (set_dir / "disposition.json").exists()
        report = evaluate(str(set_dir))
        assert _row(report, DISPOSITION_PRESENT_CHECK_NAME).met is False
        assert len(report.obligations) == len(gate_checks.GATE_CHECKS) + 2

    def test_present_disposition_satisfies_its_row(self, workable):
        """The falsifier for the row above."""
        root, set_dir = workable
        _land(root, set_dir, _api_disposition())
        report = evaluate(str(set_dir))
        assert _row(report, DISPOSITION_PRESENT_CHECK_NAME).met is True

    def test_every_unmet_obligation_names_an_action(self, workable):
        """'Each with the command or action that satisfies it.' A row that
        says only what is wrong sends the reader back to the source."""
        _root, set_dir = workable
        report = evaluate(str(set_dir))
        unmet = [o for o in report.obligations if not o.met]
        assert unmet
        for ob in unmet:
            assert (ob.action or ob.detail).strip(), ob.check


# ---------------------------------------------------------------------------
# The expensive case: would the backstop fire?
# ---------------------------------------------------------------------------

class TestBackstopPrediction:
    """Each prediction is cross-checked against what the backstop DOES.

    The prediction alone is unfalsifiable -- a stub returning "no round"
    would pass a test that only reads the prediction. So every case here
    also runs ``run_close_backstop`` behind a counting fake and asserts
    the routed-call count matches what the preflight said.
    """

    @staticmethod
    def _spends_a_round(set_dir: Path, monkeypatch) -> bool:
        """Does ``run_close_backstop`` actually reach a routed call?

        Reads the disposition FROM DISK rather than taking one, so this
        measures the same close the preflight just predicted -- a
        hardcoded disposition here would silently answer a different
        question than the one under test.

        Returns a bool, not a count: the backstop retries once on a
        transport failure (its two-attempt ladder), so a fake that raises
        is called twice for one spending decision. What the prediction
        claims is *whether* money is spent, and that is what is asserted.
        """
        from disposition import read_disposition

        calls = []

        def _fake(prompt, session_set, session_number, complexity_hint,
                  max_tier, exclude_providers=None, verification_stamp=None,
                  prefer_model=None):
            calls.append(prompt)
            raise RuntimeError("stop after counting the spend")

        monkeypatch.setattr(close_backstop, "_default_route", _fake)
        try:
            close_backstop.run_close_backstop(
                str(set_dir), 1, read_disposition(str(set_dir)),
            )
        except Exception:
            pass
        return bool(calls)

    def test_settling_evidence_means_no_round(self, workable, monkeypatch):
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        row = _row(evaluate(str(set_dir)), BACKSTOP_CHECK_NAME)
        assert row.met is True
        assert row.cost_warning == ""
        assert self._spends_a_round(set_dir, monkeypatch) is False

    def test_no_evidence_means_a_round_would_be_spent(
        self, workable, monkeypatch,
    ):
        """The falsifier pair for the row above, and the 79-of-214 line
        item: the close would succeed, but it would BUY a round doing it.
        A cost warning, never a refusal."""
        root, set_dir = workable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        row = _row(evaluate(str(set_dir)), BACKSTOP_CHECK_NAME)
        assert row.met is True, "a spend is not a refusal"
        assert row.cost_warning
        assert "verify_session" in row.cost_warning
        assert self._spends_a_round(set_dir, monkeypatch) is True

    def test_a_cost_warning_never_changes_the_exit_code(self, workable):
        """Spec decision 2, in a test: the preflight adds no gate. If a
        would-route backstop flipped the verdict, this tool would refuse
        closes the close itself allows."""
        root, set_dir = workable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        report = evaluate(str(set_dir))
        assert report.cost_warnings
        assert BACKSTOP_CHECK_NAME not in [
            o.check for o in report.unmet_blocking
        ]

    def test_a_spent_round_budget_is_predicted_as_blocking(
        self, workable, monkeypatch,
    ):
        """Predicted WITHOUT routing, because the close refuses it without
        routing. The remediation is the backstop's own, verbatim."""
        import verify_session as _vs

        root, set_dir = workable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        self._seed_consumed_rounds(set_dir, 1, _vs.PHASE_BOUND_CLASSIC)

        row = _row(evaluate(str(set_dir)), BACKSTOP_CHECK_NAME)
        assert row.met is False
        assert row.blocking is True
        assert "bounded" in row.detail
        assert self._spends_a_round(set_dir, monkeypatch) is False

    def test_one_consumed_round_is_not_a_spent_budget(
        self, workable, monkeypatch,
    ):
        """The look-alike: a session mid-loop must not be reported as
        blocked. Without this, 'always blocking' passes the test above."""
        root, set_dir = workable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        self._seed_consumed_rounds(set_dir, 1, 1)

        row = _row(evaluate(str(set_dir)), BACKSTOP_CHECK_NAME)
        assert row.met is True
        assert row.cost_warning
        assert self._spends_a_round(set_dir, monkeypatch) is True

    def test_zero_budget_tier_predicts_no_round(self, workable, monkeypatch):
        root, set_dir = workable
        (root / "ai_router").mkdir()
        (root / "ai_router" / "budget.yaml").write_text(
            "threshold_usd: 0\n"
            'verification_method: "manual-via-other-engine"\n',
            encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(
            verdict="VERIFIED", method="manual-via-other-engine",
        ))
        row = _row(evaluate(str(set_dir)), BACKSTOP_CHECK_NAME)
        assert row.met is True
        assert row.cost_warning == ""
        assert self._spends_a_round(set_dir, monkeypatch) is False

    def test_illegal_method_token_predicts_no_round_and_no_new_refusal(
        self, workable, monkeypatch,
    ):
        """An illegal token stands the backstop down, so the honest
        backstop answer is 'no round'. The REFUSAL belongs to
        verification_integrity, and the preflight must report it there
        rather than inventing a second one here."""
        root, set_dir = workable
        _land(root, set_dir, Disposition(
            status="completed",
            summary="incident shape",
            verification_method="manual",
            verification_verdict="VERIFIED",
            next_orchestrator=_valid_next_orc(),
        ))
        report = evaluate(str(set_dir))
        assert _row(report, BACKSTOP_CHECK_NAME).met is True
        assert _row(report, "verification_integrity").met is False
        assert self._spends_a_round(set_dir, monkeypatch) is False

    def test_prediction_survives_a_broken_backstop(
        self, workable, monkeypatch,
    ):
        """Fail OPEN, loudly. A reporting tool that crashes is invoked
        precisely when someone is trying to find out what is wrong."""
        monkeypatch.setattr(
            close_backstop, "decide_backstop",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        _root, set_dir = workable
        row = _row(evaluate(str(set_dir)), BACKSTOP_CHECK_NAME)
        assert row.met is True
        assert "boom" in row.detail

    @staticmethod
    def _seed_consumed_rounds(
        set_dir: Path, session_number: int, count: int
    ) -> None:
        """Seed *count* findings-bearing rounds that did not end the loop.

        Both halves are load-bearing: ``resolve_round`` infers the next
        round from the ARTIFACTS on disk while ``count_phase_family_rounds``
        counts the LEDGER records, so a ledger-only fixture resolves back
        to round 1 and the bound never trips.
        """
        import verify_session as _vs

        for round_number in range(1, count + 1):
            _vs.verification_artifact_path(
                set_dir, session_number, round_number,
            ).write_text(
                "ISSUES FOUND\n\nIssue 1: x\nSeverity: Major\n",
                encoding="utf-8", newline="",
            )
            _vs.record_round_completed(
                _vs.round_ledger_path(set_dir, session_number),
                session_number=session_number,
                round_number=round_number,
                phase=None,
                verdict="ISSUES_FOUND",
                blocking=True,
                ended_loop=False,
            )
            record_post(str(set_dir), session_number, [])


# ---------------------------------------------------------------------------
# The historical replay
# ---------------------------------------------------------------------------

def _corpus(tmp_path: Path, sets: dict) -> str:
    """Write a synthetic ``docs/session-sets`` tree of events ledgers."""
    root = tmp_path / "docs" / "session-sets"
    for slug, events in sets.items():
        set_dir = root / slug
        set_dir.mkdir(parents=True)
        (set_dir / "session-events.jsonl").write_text(
            "".join(json.dumps(e) + "\n" for e in events), encoding="utf-8",
        )
    return str(root)


class TestHistoricalReplay:

    def test_counts_covered_still_blocking_failures(self, tmp_path):
        root = _corpus(tmp_path, {
            "001-a": [
                {"event_type": "closeout_failed", "session_number": 1,
                 "failed_checks": ["working_tree_clean", "pushed_to_remote"]},
                {"event_type": "closeout_succeeded", "session_number": 1},
            ],
        })
        result = replay_history(root)
        assert result.total == 2
        assert result.still_blocking == 2
        assert result.preempted == 2
        assert result.sessions_with_failures == 1

    def test_demoted_checks_are_excluded_from_the_headline(self, tmp_path):
        """Set 116 S3's demotions are worth nothing to pre-empt now: they
        stopped refusing closes. Counting them would inflate this tool's
        measured reach with work someone else already did."""
        root = _corpus(tmp_path, {
            "001-a": [
                {"event_type": "closeout_failed", "session_number": 1,
                 "failed_checks": ["activity_log_entry", "change_log_fresh"]},
            ],
        })
        result = replay_history(root)
        assert result.total == 2
        assert result.still_blocking == 0
        assert result.preempted == 0
        assert result.demoted == {
            "activity_log_entry": 1, "change_log_fresh": 1,
        }

    def test_an_uncovered_check_is_counted_as_uncovered(self, tmp_path):
        """The falsifier that keeps the coverage number honest. Without
        it, a replay that always reports 100% coverage is
        indistinguishable from one that measures it."""
        root = _corpus(tmp_path, {
            "001-a": [
                {"event_type": "closeout_failed", "session_number": 1,
                 "failed_checks": ["a_check_the_preflight_never_heard_of"]},
            ],
        })
        result = replay_history(root)
        assert result.still_blocking == 1
        assert result.preempted == 0
        assert result.uncovered == {"a_check_the_preflight_never_heard_of": 1}

    def test_the_backstop_failure_is_covered(self, tmp_path):
        """The expensive one: 79 of 214 recorded check-failures."""
        root = _corpus(tmp_path, {
            "001-a": [
                {"event_type": "closeout_failed", "session_number": 2,
                 "failed_checks": ["verification_backstop"]},
            ],
        })
        result = replay_history(root)
        assert result.preempted == 1
        assert result.uncovered == {}

    def test_a_zero_session_number_is_not_a_session(self, tmp_path):
        """Set 047's first close recorded ``"session_number": 0`` -- a
        legacy writer artifact. Session numbers are 1-based everywhere
        here, so counting it inflates a per-session rate with a session
        that never existed. Its CHECK-failures still count: a close
        really did fail and really did name them."""
        root = _corpus(tmp_path, {
            "047-legacy": [
                {"event_type": "closeout_failed", "session_number": 0,
                 "failed_checks": ["working_tree_clean"]},
            ],
        })
        result = replay_history(root)
        assert result.total == 1
        assert result.still_blocking == 1
        assert result.sessions_with_failures == 0
        assert result.unnumbered_events == 1

    def test_repeat_failures_in_one_session_count_once_as_a_session(
        self, tmp_path,
    ):
        root = _corpus(tmp_path, {
            "001-a": [
                {"event_type": "closeout_failed", "session_number": 1,
                 "failed_checks": ["working_tree_clean"]},
                {"event_type": "closeout_failed", "session_number": 1,
                 "failed_checks": ["pushed_to_remote"]},
            ],
        })
        result = replay_history(root)
        assert result.events == 2
        assert result.total == 2
        assert result.sessions_with_failures == 1

    def test_a_malformed_ledger_line_does_not_void_the_measurement(
        self, tmp_path,
    ):
        root = tmp_path / "docs" / "session-sets"
        (root / "001-a").mkdir(parents=True)
        (root / "001-a" / "session-events.jsonl").write_text(
            '{"event_type": "closeout_failed", "session_number": 1, '
            '"failed_checks": ["pushed_to_remote"]}\n'
            "{not json at all\n"
            "\n",
            encoding="utf-8",
        )
        result = replay_history(str(root))
        assert result.total == 1

    def test_an_empty_corpus_measures_zero(self, tmp_path):
        result = replay_history(str(tmp_path / "nothing-here"))
        assert result.total == 0
        assert result.preempted == 0

    def test_render_names_every_check_it_counted(self, tmp_path):
        root = _corpus(tmp_path, {
            "001-a": [
                {"event_type": "closeout_failed", "session_number": 1,
                 "failed_checks": ["verification_backstop",
                                   "activity_log_entry"]},
            ],
        })
        text = render_replay(replay_history(root))
        assert "verification_backstop" in text
        assert "covered" in text
        assert "demoted" in text


# ---------------------------------------------------------------------------
# Output discipline and the CLI
# ---------------------------------------------------------------------------

class TestOutput:

    def test_this_module_s_own_strings_are_ascii(self, workable):
        """project-guidance: CLI output uses ASCII-only glyphs, because
        a Windows cp1252 console cannot encode the alternative. Only this
        module's OWN strings are in scope -- relayed gate remediations
        carry their authors' punctuation and are handled by _emit."""
        for text in close_preflight._ACTIONS.values():
            assert text.isascii(), text
        _root, set_dir = workable
        report = evaluate(str(set_dir))
        skeleton = "\n".join(
            line for line in render(report).splitlines()
            if not line.startswith("        ")
        )
        assert skeleton.isascii(), skeleton

    def test_emit_degrades_instead_of_crashing(self, monkeypatch):
        """L-079-1: a reporting tool must never die mid-print.

        The character is not hypothetical and neither is the codepage:
        ``close_backstop``'s diff-base refusal really is spelled with an
        em dash, and cp437/cp850 -- still live Windows console codepages
        -- really cannot encode one. (cp1252 can, which is why picking
        the codepage carelessly would make this test pass vacuously.)
        """

        class _Cp437Stdout:
            """A stdout whose text layer is cp437, like an OEM console."""

            encoding = "cp437"

            def __init__(self):
                self.written = []

            def write(self, text):
                text.encode("cp437")  # raises on an em dash
                self.written.append(text)
                return len(text)

            def flush(self):
                pass

        fake = _Cp437Stdout()
        monkeypatch.setattr(close_preflight.sys, "stdout", fake)
        close_preflight._emit("fails closed \u2014 I-084-S2-6")
        written = "".join(fake.written)
        assert "I-084-S2-6" in written
        assert "\u2014" not in written

    def test_the_relayed_remediation_really_contains_that_character(self):
        """The falsifier for the guard above: if no relayed string ever
        carried a non-ASCII character, ``_emit`` would be dead code
        dressed as robustness."""
        source = Path(close_backstop.__file__).read_text(encoding="utf-8")
        assert "fails closed \u2014 I-084-S2-6" in source

    def test_render_marks_met_and_unmet_distinctly(self, workable):
        _root, set_dir = workable
        text = render(evaluate(str(set_dir)))
        assert "[x]" in text and "[ ]" in text
        assert "BLOCKING:" in text

    def test_cli_exits_one_when_something_blocking_is_unmet(self, workable):
        _root, set_dir = workable
        assert close_preflight.main(
            ["--session-set-dir", str(set_dir)]
        ) == EXIT_BLOCKING_UNMET

    def test_cli_exits_zero_on_a_closeable_session(self, workable):
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        assert close_preflight.main(
            ["--session-set-dir", str(set_dir)]
        ) == EXIT_OK

    def test_cli_refuses_a_path_that_is_not_a_set(self, tmp_path):
        assert close_preflight.main(
            ["--session-set-dir", str(tmp_path / "no-such-set")]
        ) == EXIT_INVALID_INVOCATION

    def test_cli_json_is_machine_readable(self, workable, capsys):
        _root, set_dir = workable
        close_preflight.main(["--session-set-dir", str(set_dir), "--json"])
        payload = json.loads(capsys.readouterr().out)
        assert payload["would_close"] is False
        assert payload["verdict"] == close_preflight.VERDICT_WOULD_REFUSE
        assert payload["obligations"]
        assert set(payload["unmet_blocking"]) <= {
            o["check"] for o in payload["obligations"]
        }

    def test_replay_cli_always_exits_zero(self, tmp_path, capsys):
        """A measurement is not a verdict."""
        root = _corpus(tmp_path, {
            "001-a": [
                {"event_type": "closeout_failed", "session_number": 1,
                 "failed_checks": ["verification_backstop"]},
            ],
        })
        code = close_preflight.main([
            "--session-set-dir", "unused",
            "--replay-history", "--session-sets-root", root, "--json",
        ])
        assert code == EXIT_OK
        assert json.loads(capsys.readouterr().out)["preempted"] == 1

    def test_session_number_is_an_assertion_not_an_override(
        self, workable, capsys,
    ):
        """Round-4 finding. Round-1 finding 4 was right that a partial
        override produces a mixed-session report, and its criterion
        allowed "reject or remove"; removal then made the spec's promised
        input unusable. The coherent shape is neither: accept the number,
        CHECK it, and report on the one session the close would close."""
        _root, set_dir = workable
        code = close_preflight.main([
            "--session-set-dir", str(set_dir), "--session-number", "1",
            "--json",
        ])
        payload = json.loads(capsys.readouterr().out)
        assert code == EXIT_BLOCKING_UNMET
        assert payload["session_number"] == 1

    def test_a_mismatched_session_number_is_refused_with_the_real_one(
        self, workable, capsys,
    ):
        """The falsifier: an assertion that never fails is not a check.
        Honoring the number instead would relabel the report while every
        gate predicate kept answering about session 1."""
        _root, set_dir = workable
        code = close_preflight.main([
            "--session-set-dir", str(set_dir), "--session-number", "7",
        ])
        err = capsys.readouterr().err
        assert code == EXIT_INVALID_INVOCATION
        assert "does not match" in err
        assert "--session-number 1" in err, "must name the real session"

    def test_omitting_the_session_number_still_works(self, workable):
        """The other look-alike: the check must not become a requirement."""
        _root, set_dir = workable
        assert close_preflight.main(
            ["--session-set-dir", str(set_dir)]
        ) == EXIT_BLOCKING_UNMET
        assert evaluate(str(set_dir)).session_number == 1


# ---------------------------------------------------------------------------
# The serialized projection (Set 115 S4)
# ---------------------------------------------------------------------------

def _gate_check_bodies():
    """Top-level function defs in ``gate_checks``, by name."""
    tree = ast.parse(Path(gate_checks.__file__).read_text(encoding="utf-8"))
    return {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def _referenced_names(
    name: str, bodies: dict, *, opaque=frozenset(), seen=None, depth: int = 0
) -> set:
    """Every name a predicate reaches, transitively, from the AST.

    From the AST rather than from the source text, because a text scan
    reads docstrings: the first cut of this guard "found" a git call in
    `check_change_log_fresh` because its docstring names another
    function. It also follows **function-local imports**
    (``from .run_of_record import evaluate_freshness``), which is exactly
    how these predicates reach outside the session-set directory and what
    a call-name walk alone would miss.

    ``opaque`` names helpers that are not descended into.
    """
    seen = set() if seen is None else seen
    if name in seen or depth > 4 or name not in bodies:
        return set()
    seen.add(name)
    out: set = set()
    for node in ast.walk(bodies[name]):
        if isinstance(node, ast.Name):
            out.add(node.id)
        elif isinstance(node, ast.Attribute):
            out.add(node.attr)
            if isinstance(node.value, ast.Name):
                out.add(node.value.id)
        elif isinstance(node, ast.ImportFrom):
            out.add((node.module or "").lstrip("."))
            out.update(a.name for a in node.names)
        elif isinstance(node, ast.Import):
            out.update(a.name.split(".")[-1] for a in node.names)
    for callee in set(out):
        if callee in bodies and callee not in opaque:
            out |= _referenced_names(
                callee, bodies, opaque=opaque, seen=seen, depth=depth + 1
            )
    return out


#: Reaching one of these means the answer depends on state outside the
#: session-set directory, so a reader that re-digested only that
#: directory has not re-checked it. Named at FUNCTION granularity, not
#: module: ``_checklist_transitions`` imports ``run_of_record.read_records``
#: to read ``test-runs.jsonl`` — a file inside the set directory — while
#: ``check_test_run_fresh`` imports ``evaluate_freshness``, which digests
#: the source surfaces a suite covers anywhere in the repo. Same module,
#: opposite answers.
_REPO_WIDE_HELPERS = frozenset({
    "surface_digest",
    "evaluate_freshness",
    "compute_work_diff_sha256",
    "find_valid_stamped_rows",
    "validate_stamped_row",
})

#: Helpers that run git to answer "WHERE is the repository", not "what is
#: in it". Their result is a path; it does not vary with the content of
#: any file, so a check that calls one has not thereby become
#: repo-state-dependent. Named here rather than silently tolerated,
#: because the exception is a judgment.
_PATH_RESOLVERS = frozenset({"_repo_root_for", "_project_root_for", "_run_git"})


class TestTheSerializedProjection:
    """The renderer must never pay for this run, and must never overclaim.

    Two properties carry these tests, and both are planted rather than
    inspected (L-112-1):

    1. **The file is invisible to git.** Not "we added an ignore rule" —
       the assertion runs ``git status`` in a real repo after a real
       write and requires the path to be absent from it. That is what
       makes the placement decision hold rather than merely be stated.
    2. **A commit stales it for a reader that checks git and NOT for one
       that checks only files.** This is the whole reason ``volatile``
       exists: committing changes no digested byte, so a content-only
       reader is provably fresh while some of its rows have just become
       wrong.
    """

    def _write(self, set_dir: Path) -> str:
        written = close_preflight.write_projection(str(set_dir))
        assert written is not None
        return written

    def test_write_lands_in_the_ignored_marker_dir_with_a_self_ignore(
        self, workable,
    ):
        _root, set_dir = workable
        written = self._write(set_dir)
        assert Path(written) == set_dir / ".dabbler" / "close-obligations.json"
        ignore = set_dir / ".dabbler" / ".gitignore"
        assert ignore.is_file(), (
            "a consumer repo whose root .gitignore predates the marker "
            "directory has nothing else protecting it"
        )
        assert ignore.read_text(encoding="utf-8").strip().endswith("*")

    def test_git_does_not_see_the_projection(self, workable):
        """The planted proof of the placement decision.

        If this file were tracked, every mid-session ``--write`` would
        land inside the verification stamp's work diff and stale a round
        that had already passed -- and would fail ``working_tree_clean``
        on top of it. Both consequences are prevented by the same fact,
        so the fact is what gets asserted.
        """
        root, set_dir = workable
        written = self._write(set_dir)
        proc = subprocess.run(
            ["git", "status", "--porcelain", "--ignored=no"],
            cwd=str(root), check=True, capture_output=True, text=True,
        )
        assert "close-obligations" not in proc.stdout, proc.stdout
        assert ".dabbler" not in proc.stdout, proc.stdout
        assert Path(written).is_file(), "and yet it really is on disk"

    def test_the_projection_carries_the_report_verbatim(self, workable, capsys):
        """One spelling. This module has already shipped two surfaces of
        one report that disagreed (``would_close`` said true while the
        human report said "NOT yet decided"); embedding ``to_dict()``
        unchanged is what stops that from being possible again."""
        _root, set_dir = workable
        close_preflight.main(["--session-set-dir", str(set_dir), "--json"])
        from_cli = json.loads(capsys.readouterr().out)
        self._write(set_dir)
        embedded = close_preflight.read_projection(str(set_dir))["report"]
        assert embedded == from_cli

    def test_absent_then_fresh_then_stale_when_an_input_changes(
        self, workable,
    ):
        _root, set_dir = workable
        assert close_preflight.projection_state(str(set_dir)) == (
            close_preflight.PROJECTION_ABSENT
        )
        self._write(set_dir)
        assert close_preflight.projection_state(str(set_dir)) == (
            close_preflight.PROJECTION_FRESH
        )
        (set_dir / "activity-log.json").write_text("{}", encoding="utf-8")
        assert close_preflight.projection_state(str(set_dir)) == (
            close_preflight.PROJECTION_STALE
        )

    def test_a_new_artifact_stales_it_without_being_named_anywhere(
        self, workable,
    ):
        """The reason the digest map is the DIRECTORY and not a list.

        ``s1-issues.json`` is an input to the verification-integrity and
        backstop rows, and no filename list in this module mentions it.
        A set that grows an artifact grows an input.
        """
        _root, set_dir = workable
        self._write(set_dir)
        (set_dir / "s1-issues.json").write_text("[]", encoding="utf-8")
        assert close_preflight.projection_state(str(set_dir)) == (
            close_preflight.PROJECTION_STALE
        )

    def test_a_commit_stales_it_for_git_readers_only(self, workable):
        """The property ``volatile`` exists for.

        Committing an unrelated file changes not one byte the projection
        digested, so a content-only reader is correctly fresh -- and the
        git-backed rows it is carrying have just gone out of date. A
        projection with one freshness verdict would have to pick a lie:
        either badge itself stale on every unrelated commit, or badge
        itself fresh while telling the operator to commit work they
        already committed.
        """
        root, set_dir = workable
        self._write(set_dir)
        (root / "README.md").write_text("moved on\n", encoding="utf-8")
        _git(root, "add", "README.md")
        _git(root, "commit", "-m", "unrelated")

        assert close_preflight.projection_state(
            str(set_dir), include_volatile=False
        ) == close_preflight.PROJECTION_FRESH
        assert close_preflight.projection_state(
            str(set_dir), include_volatile=True
        ) == close_preflight.PROJECTION_STALE

    def test_unreadable_is_distinguishable_from_absent(self, workable):
        _root, set_dir = workable
        self._write(set_dir)
        path = Path(close_preflight.projection_path(str(set_dir)))
        path.write_text("{not json", encoding="utf-8")
        assert close_preflight.projection_state(str(set_dir)) == (
            close_preflight.PROJECTION_UNREADABLE
        )
        path.unlink()
        assert close_preflight.projection_state(str(set_dir)) == (
            close_preflight.PROJECTION_ABSENT
        )

    def test_a_future_schema_version_reads_as_unreadable(self, workable):
        """Guessing at an unknown shape is how a cache becomes a source."""
        _root, set_dir = workable
        self._write(set_dir)
        path = Path(close_preflight.projection_path(str(set_dir)))
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["schemaVersion"] = close_preflight.PROJECTION_SCHEMA_VERSION + 1
        path.write_text(json.dumps(payload), encoding="utf-8")
        assert close_preflight.read_projection(str(set_dir)) is None
        assert close_preflight.projection_state(str(set_dir)) == (
            close_preflight.PROJECTION_UNREADABLE
        )

    def test_git_backed_checks_are_derived_from_gate_checks_not_declared(self):
        """The narrow half: every check that calls git is volatile.

        Mechanically derivable, so it is derived rather than trusted. It
        is NOT the definition of volatility -- see the test below, which
        covers the class this one is blind to.
        """
        source = Path(gate_checks.__file__).read_text(encoding="utf-8")
        derived = {
            block.split("(")[0]
            for block in source.split("\ndef ")
            if block.startswith("check_") and "_run_git" in block
        }
        names = {
            name for name, fn in gate_checks.GATE_CHECKS
            if fn.__name__ in derived
        }
        assert names == close_preflight.GIT_BACKED_CHECKS
        assert not (names & close_preflight.SET_LOCAL_CHECKS), (
            "a check that calls git cannot be set-local"
        )

    def test_no_set_local_check_reaches_repo_wide_state(self):
        """The finding both end-of-set path-aware critics found.

        A source-text scan for a *direct* ``_run_git`` call is blind to
        how ``verification_integrity`` and ``test_run_fresh`` actually
        depend on the repository: through an evidence stamp that binds
        the git work diff, and through a ``run_of_record.surface_digest``
        over source files anywhere in the tree. Both were rendered as
        re-checkable truth by the first cut of this feature, so a module
        edited outside the session-set directory left the panel
        confidently claiming an answer that had already changed.

        This fails CLOSED: a predicate that grows such a dependency stops
        being set-local, and the row it produces starts saying "as of".
        """
        bodies = _gate_check_bodies()
        offenders = {}
        for name, fn in gate_checks.GATE_CHECKS:
            if name not in close_preflight.SET_LOCAL_CHECKS:
                continue
            reached = _referenced_names(
                fn.__name__, bodies, opaque=_PATH_RESOLVERS
            )
            hits = sorted(reached & _REPO_WIDE_HELPERS)
            if hits:
                offenders[name] = hits
        assert not offenders, (
            f"these are declared set-local but reach repo-wide state: "
            f"{offenders}. A reader that re-digested only the session-set "
            f"directory has not re-checked them; remove them from "
            f"SET_LOCAL_CHECKS so their rows say 'as of'."
        )

    def test_the_scan_can_actually_see_a_repo_wide_dependency(self):
        """The falsifier for the scan itself (L-112-1).

        A transitive walk that reached nothing would satisfy the test
        above no matter what was declared set-local. These are the two
        checks the first cut got wrong, and both reach their repo-wide
        helper through a FUNCTION-LOCAL import rather than a call the
        walk could see by name -- which is precisely why the scan reads
        imports.
        """
        bodies = _gate_check_bodies()
        assert "find_valid_stamped_rows" in _referenced_names(
            "check_verification_integrity", bodies
        )
        assert "evaluate_freshness" in _referenced_names(
            "check_test_run_fresh", bodies
        )

    def test_the_repo_wide_checks_really_are_volatile(self):
        """The other falsifier: emptying ``SET_LOCAL_CHECKS`` would
        satisfy every guard above while making every row say "as of".
        These five are the checks whose answer provably lives outside the
        session-set directory, named so a future demotion is a visible
        decision."""
        for name in (
            "working_tree_clean",
            "pushed_to_remote",
            "verification_integrity",
            "test_run_fresh",
            BACKSTOP_CHECK_NAME,
        ):
            assert name not in close_preflight.SET_LOCAL_CHECKS, name
            assert close_preflight.Obligation(
                check=name, met=True, blocking=True
            ).volatile, name

    def test_every_reported_check_is_classified(self, workable):
        """No third state. A check the preflight reports is either
        set-local or volatile; a name matching neither list takes the
        default -- which is why the default is the safe one, and why this
        asserts the union is total."""
        _root, set_dir = workable
        reported = {o.check for o in evaluate(str(set_dir)).obligations}
        assert reported, "no obligations to classify"
        for check in reported:
            local = check in close_preflight.SET_LOCAL_CHECKS
            volatile = close_preflight.Obligation(
                check=check, met=True, blocking=True
            ).volatile
            assert local != volatile, check

    def test_only_the_repo_dependent_rows_are_marked_volatile(self, workable):
        _root, set_dir = workable
        report = evaluate(str(set_dir))
        marked = {o.check for o in report.obligations if o.volatile}
        assert close_preflight.GIT_BACKED_CHECKS <= marked
        assert marked, "a volatility flag nothing ever sets proves nothing"
        unmarked = {o.check for o in report.obligations if not o.volatile}
        assert unmarked, (
            "a volatility flag that is always true proves nothing either: "
            "every row would say 'as of' and the distinction would be dead"
        )
        assert all(
            "volatile" in o for o in report.to_dict()["obligations"]
        ), "every row must answer the question, not only the volatile ones"

    def test_cli_check_reports_the_state_without_evaluating(
        self, workable, capsys, monkeypatch,
    ):
        _root, set_dir = workable
        monkeypatch.setattr(
            close_preflight, "evaluate",
            lambda *a, **k: pytest.fail("--check must not run the predicates"),
        )
        code = close_preflight.main(
            ["--session-set-dir", str(set_dir), "--check"]
        )
        assert code == close_preflight.EXIT_PROJECTION_NOT_FRESH
        out = capsys.readouterr()
        assert "absent" in out.out
        assert "--write" in out.err

    def test_cli_check_exits_zero_when_fresh(self, workable, capsys):
        _root, set_dir = workable
        close_preflight.main(["--session-set-dir", str(set_dir), "--write"])
        capsys.readouterr()
        assert close_preflight.main(
            ["--session-set-dir", str(set_dir), "--check"]
        ) == EXIT_OK

    def test_cli_write_still_reports_the_verdict(self, workable, capsys):
        """``--write`` is a superset of a normal run, not a mode that
        swallows it: the exit code still answers "would this close"."""
        _root, set_dir = workable
        code = close_preflight.main(
            ["--session-set-dir", str(set_dir), "--write"]
        )
        captured = capsys.readouterr()
        assert code == EXIT_BLOCKING_UNMET
        assert "BLOCKING:" in captured.out
        assert "wrote " in captured.err

    def test_write_keeps_json_stdout_parseable(self, workable, capsys):
        """The side-effect notice goes to stderr for exactly this reason."""
        _root, set_dir = workable
        close_preflight.main(
            ["--session-set-dir", str(set_dir), "--write", "--json"]
        )
        captured = capsys.readouterr()
        assert json.loads(captured.out)["verdict"]
        assert "wrote " in captured.err

    def test_a_failed_write_names_the_skip(self, workable, capsys, monkeypatch):
        """L-079-1: a fail-open branch around I/O must NAME the skip.

        Silently continuing would leave the Explorer rendering a stale
        projection while the operator believed they had just refreshed it.
        """
        _root, set_dir = workable
        monkeypatch.setattr(
            close_preflight, "_ensure_projection_dir",
            lambda *_a, **_k: (_ for _ in ()).throw(OSError("read-only")),
        )
        code = close_preflight.main(
            ["--session-set-dir", str(set_dir), "--write"]
        )
        err = capsys.readouterr().err
        assert code == EXIT_BLOCKING_UNMET, "the report still stands"
        assert "NOT serialized" in err

    def test_the_projection_names_how_to_rebuild_itself(self, workable):
        _root, set_dir = workable
        self._write(set_dir)
        payload = close_preflight.read_projection(str(set_dir))
        assert payload["derived"] is True
        assert "--write" in payload["regenerateWith"]
        assert payload["sessionSetDir"] == set_dir.name


class TestItMirrorsTheClosesOrdering:
    """Round-1 findings 1-3, which were one root cause: ``close_session``
    runs the backstop BEFORE the gate chain, and the first cut of this
    module ran it after.

    That ordering is not cosmetic. It decides whether the tool's central
    case -- a finished session with no stamped evidence -- reads as "you
    are blocked, go fix something" (wrong: nothing is fixable by hand)
    or as "closing now costs a round, and that round decides it" (right).
    """

    def test_missing_evidence_is_not_reported_as_an_integrity_refusal(
        self, workable,
    ):
        """The defect, planted: a clean pushed session with no stamped
        evidence. ``close_session`` runs the backstop first and a VERIFIED
        backstop writes the artifact the integrity gate wants, so that
        gate is NOT what stands in the way."""
        root, set_dir = workable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        report = evaluate(str(set_dir))

        assert report.backstop_would_route is True
        assert "verification_integrity" not in [
            o.check for o in report.unmet_blocking
        ]
        integrity = _row(report, "verification_integrity")
        assert integrity.met is True
        assert "not yet decidable" in integrity.detail
        assert report.exit_code == EXIT_OK

    def test_but_the_report_does_not_claim_the_close_would_proceed(
        self, workable,
    ):
        """The other half of the same honesty: exit 0 here means 'nothing
        you can fix by hand is outstanding', NOT 'this close succeeds'.
        The backstop's verdict does not exist until it is paid for."""
        root, set_dir = workable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        text = render(evaluate(str(set_dir)))
        assert "NOT yet decided" in text
        assert "would proceed" not in text

    def test_json_and_human_reports_agree_on_the_undecided_state(
        self, workable,
    ):
        """Round-3 finding 2. The two surfaces of one report contradicted
        each other on the single case this tool exists for: the renderer
        said "NOT yet decided" while the JSON said ``would_close: true``.
        A machine consumer got the opposite conclusion from the human."""
        root, set_dir = workable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        report = evaluate(str(set_dir))
        payload = report.to_dict()

        assert report.verdict == close_preflight.VERDICT_UNDECIDED
        assert payload["verdict"] == close_preflight.VERDICT_UNDECIDED
        assert payload["backstop_would_route"] is True
        # Tri-state on purpose: null, not true. A consumer testing
        # truthiness gets the SAFE answer (not closeable) rather than the
        # dangerous one.
        assert payload["would_close"] is None
        assert not payload["would_close"]

    def test_json_says_true_only_when_the_close_is_actually_decided(
        self, workable,
    ):
        """The look-alike. Without it, 'always null' would pass the test
        above while destroying the field's meaning."""
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        payload = evaluate(str(set_dir)).to_dict()
        assert payload["verdict"] == close_preflight.VERDICT_WOULD_CLOSE
        assert payload["would_close"] is True
        assert payload["backstop_would_route"] is False

    def test_json_says_false_when_the_close_would_refuse(self, workable):
        """The third leg: a deterministic refusal is still a hard False,
        not a null."""
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        (set_dir / "scratch.md").write_text("dirty\n", encoding="utf-8")
        payload = evaluate(str(set_dir)).to_dict()
        assert payload["verdict"] == close_preflight.VERDICT_WOULD_REFUSE
        assert payload["would_close"] is False

    def test_integrity_still_blocks_when_the_backstop_will_not_run(
        self, workable,
    ):
        """The look-alike that keeps the deferral from being a blanket
        excuse. On the zero-budget tier the backstop stands down, so
        nothing will supply the missing evidence and the integrity gate
        is genuinely what refuses."""
        root, set_dir = workable
        (root / "ai_router").mkdir()
        (root / "ai_router" / "budget.yaml").write_text(
            "threshold_usd: 0\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        report = evaluate(str(set_dir))
        assert report.backstop_would_route is False
        assert _row(report, "verification_integrity").met is False
        assert report.exit_code == EXIT_BLOCKING_UNMET

    def test_backstop_bookkeeping_is_tolerated_like_the_close_does(
        self, workable,
    ):
        """Round-1 finding 3. A backstop-VERIFIED run whose close then
        failed a later gate leaves its bookkeeping uncommitted; the RERUN
        skips the backstop and passes those exact paths to
        ``working_tree_clean`` as ``extra_clean_ignore``. A preflight
        without them sends the reader off to commit files the close
        deliberately tolerates, hiding the real blocker."""
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        # The round ledger a backstop round appends mid-close, left
        # uncommitted exactly as a gate-failed close leaves it. It is in
        # written_paths unconditionally (Set 116 S2), and it is NOT in
        # gate_checks._WORKING_TREE_IGNORE_PATTERNS -- so without the
        # tolerance it reads as a dirty tree.
        (set_dir / "s1-rounds.jsonl").write_text(
            '{"event": "round_completed", "round": 1}\n', encoding="utf-8",
        )

        decision = close_backstop.decide_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )
        assert decision.would_route is False, "fixture must settle the close"
        assert any(
            p.endswith("s1-rounds.jsonl")
            for p in decision.outcome.written_paths
        ), "fixture must produce the ledger path"

        report = evaluate(str(set_dir))
        assert "working_tree_clean" not in [
            o.check for o in report.unmet_blocking
        ]

    def test_an_unrelated_dirty_file_still_blocks(self, workable):
        """The look-alike for the row above: tolerance is scoped to the
        backstop's own bookkeeping, not to dirt in general."""
        root, set_dir = workable
        _seed_settling_evidence(root, set_dir)
        (set_dir / "s1-rounds.jsonl").write_text(
            '{"event": "round_completed", "round": 1}\n', encoding="utf-8",
        )
        (set_dir / "not-bookkeeping.md").write_text("dirt\n", encoding="utf-8")
        report = evaluate(str(set_dir))
        assert "working_tree_clean" in [
            o.check for o in report.unmet_blocking
        ]


class TestSetTerminalPolicyGates:
    """The round-2 finding: ``close_session`` evaluates two more gates
    AFTER the registry chain -- the Set 066 path-aware-critique gate and
    the Set 068 contract gate -- each keyed on the set-terminal close.
    A preflight that walked only the registry could truthfully claim to
    have named every *registered* obligation while omitting two that
    really do refuse a close.
    """

    @staticmethod
    def _make_terminal(set_dir: Path) -> None:
        """Make this close the set-terminal one: session 1 of 1.

        Under schema v4 there is no ``totalSessions`` key -- the total is
        derived from the ``sessions`` array -- so the second seeded entry
        has to go, and ``spec.md`` moves with it because ``read_progress``
        reconciles the state file against the spec's session headings.
        """
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        state["sessions"] = [
            s for s in state["sessions"] if s.get("number") == 1
        ]
        (set_dir / "session-state.json").write_text(
            json.dumps(state, indent=2), encoding="utf-8",
        )
        (set_dir / "spec.md").write_text(
            "# spec\n\n## Sessions\n\n### Session 1 of 1: Work\n\n"
            "**Steps:**\n1. Do the work.\n",
            encoding="utf-8",
        )

    @staticmethod
    def _record_policy(set_dir: Path, kind: str, choice: str) -> None:
        """Write the durable policy record the close actually reads:
        an activity-log entry whose ``kind`` names the policy and whose
        ``choice`` carries the level."""
        log = json.loads(
            (set_dir / "activity-log.json").read_text(encoding="utf-8")
        )
        log["entries"].append({
            "sessionNumber": 1,
            "stepNumber": 0,
            "stepKey": f"{kind}-policy",
            "dateTime": "2026-08-10T00:00:00-04:00",
            "description": f"{kind} policy captured at set start",
            "status": "complete",
            "kind": kind,
            "choice": choice,
        })
        (set_dir / "activity-log.json").write_text(
            json.dumps(log, indent=2), encoding="utf-8",
        )

    def test_a_set_declaring_neither_gets_neither_row(self, workable):
        """`none` produces no row at all -- a set that declares nothing
        pays nothing, and a preflight that listed two permanently-met
        rows would be noise."""
        root, set_dir = workable
        self._make_terminal(set_dir)
        _seed_settling_evidence(root, set_dir)
        reported = [o.check for o in evaluate(str(set_dir)).obligations]
        assert PATH_AWARE_CRITIQUE_CHECK_NAME not in reported
        assert CONTRACT_GATE_CHECK_NAME not in reported

    def test_a_required_critique_with_no_artifact_is_reported_blocking(
        self, workable, monkeypatch,
    ):
        """Interactive TTY: `required` hard-blocks, as the close does."""
        root, set_dir = workable
        monkeypatch.setattr(
            close_preflight, "_close_would_be_interactive", lambda: True
        )
        self._make_terminal(set_dir)
        self._record_policy(set_dir, "path_aware_critique", "required")
        _seed_settling_evidence(root, set_dir)
        report = evaluate(str(set_dir))
        row = _row(report, PATH_AWARE_CRITIQUE_CHECK_NAME)
        assert row.met is False
        assert row.blocking is True
        assert report.exit_code == EXIT_BLOCKING_UNMET

    def test_a_required_critique_headless_is_reported_but_does_not_block(
        self, workable, monkeypatch,
    ):
        """The falsifier pair, and the round-3 finding: ``close_session``
        SOFT-WARNS a failed `required` terminal gate when stdin is not a
        TTY (or under --accept-suggestions), and agents and CI run
        headless. Blocking unconditionally would report a refusal the
        close does not make on the most common invocation path."""
        root, set_dir = workable
        monkeypatch.setattr(
            close_preflight, "_close_would_be_interactive", lambda: False
        )
        self._make_terminal(set_dir)
        self._record_policy(set_dir, "path_aware_critique", "required")
        _seed_settling_evidence(root, set_dir)
        report = evaluate(str(set_dir))
        row = _row(report, PATH_AWARE_CRITIQUE_CHECK_NAME)
        assert row.met is False, "the signal is kept"
        assert row.blocking is False, "but it cannot refuse a headless close"
        assert "SOFT-WARNS" in row.detail
        assert report.exit_code == EXIT_OK

    def test_an_advisory_critique_is_reported_but_does_not_block(
        self, workable, monkeypatch,
    ):
        """Posture mirrored from the close, not invented: `advisory`
        always warns and never blocks -- in a TTY too, which is what
        separates it from `required`."""
        root, set_dir = workable
        monkeypatch.setattr(
            close_preflight, "_close_would_be_interactive", lambda: True
        )
        self._make_terminal(set_dir)
        self._record_policy(set_dir, "path_aware_critique", "advisory")
        _seed_settling_evidence(root, set_dir)
        report = evaluate(str(set_dir))
        row = _row(report, PATH_AWARE_CRITIQUE_CHECK_NAME)
        assert row.met is False
        assert row.blocking is False
        assert report.exit_code == EXIT_OK

    def test_a_non_terminal_close_owes_neither_gate(self, workable):
        """The look-alike: these gates fire ONLY on the set-terminal
        close. The fixture is session 1 of 2, so they must stay silent
        even with `required` recorded."""
        root, set_dir = workable
        self._record_policy(set_dir, "path_aware_critique", "required")
        _seed_settling_evidence(root, set_dir)
        reported = [o.check for o in evaluate(str(set_dir)).obligations]
        assert PATH_AWARE_CRITIQUE_CHECK_NAME not in reported

    def test_both_terminal_gates_are_in_the_replay_coverage_set(self):
        """A historical failure of either is one this tool would name."""
        names = preflight_check_names()
        assert PATH_AWARE_CRITIQUE_CHECK_NAME in names
        assert CONTRACT_GATE_CHECK_NAME in names
