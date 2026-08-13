"""Set 084 S2 — the close backstop + the F3 stamp, end to end.

The spec's step-4 matrix: all three live verification-bypass incidents
as regression fixtures against ``close_session.run``:

- **incident 1** (2026-07-06): a self-attested ``VERIFIED`` with no
  metrics row — the backstop runs (stubbed router) and ITS verdict
  governs the close.
- **incident 2**: a null-verdict close — a Full-tier close can no
  longer complete unverified: the backstop verifies it in-process, or
  the close blocks.
- **incident 3**: a bare ``route()`` row + diluted template — the row
  is rejected (no stamp) and the backstop runs WITH the orchestrator's
  registry-resolved provider excluded.

Plus: backstop-unavailable blocks; provider failure blocks (never a
pass) with the two-attempt ladder preserved; zero-budget passthrough;
the flag interplay — ``--manual-verify`` (the attested bypass) never
triggers the backstop while ``--force`` deliberately DOES receive it
(I-084-S2-1: force bypasses bookkeeping gates, neither evidence
layer); evidence-present and Minor-only skips; staleness re-runs;
the working-tree gate tolerating the backstop's own mid-close
artifacts; the pre-session / empty-tree diff base.

Template-hash / stamp-field fail-closed cases live in
``test_verification_integrity_gate.py`` (the gate consumes the stamp;
this file covers the producer + flow).

No metered calls: the conftest autouse guard refuses live routing;
these tests override it with ``FakeBackstopRoute``, which mimics the
real ``route()`` contract — it completes the stamp and appends the
stamped metrics row, exactly what the production call does.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

import close_backstop
import close_session
from close_backstop import (
    BackstopOutcome,
    resolve_backstop_diff_base,
    run_close_backstop,
)
from disposition import Disposition, read_disposition, write_disposition
from session_events import read_events
from session_checklist import record_post
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    register_session_start,
)
from stamp_fixtures import write_stamped_evidence
from verification import VerificationUnavailableError
from verification_stamp import (
    STAMP_SOURCE_CLOSE_BACKSTOP,
    complete_stamp,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _git(repo_root: Path, *args: str) -> None:
    proc = subprocess.run(
        ["git", *args], cwd=str(repo_root),
        capture_output=True, text=True,
        encoding="utf-8", errors="replace", check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr}")


def _ns(**overrides):
    parser = close_session._build_parser()
    args = parser.parse_args([])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


def _valid_next_orc() -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-fable-5",
        effort="high",
        reason=NextOrchestratorReason(
            code="continue-current-trajectory",
            specifics="continue the backstop work on the same engine",
        ),
    )


@pytest.fixture
def closeable(tmp_path: Path, monkeypatch):
    """A pushed, activity-logged, non-final session-1 set whose every
    bookkeeping gate passes. Verification evidence is deliberately NOT
    seeded — that is what each test controls. Returns
    ``(repo_root, set_dir)``."""
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

    set_dir = root / "docs" / "session-sets" / "backstop-set"
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
            "sessionSetName": "backstop-set",
            "createdDate": "2026-07-07T00:00:00-04:00",
            "totalSessions": 2,
            "entries": [{
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-1/work",
                "dateTime": "2026-07-07T01:00:00-04:00",
                "description": "did work",
                "status": "complete",
                "routedApiCalls": [],
            }],
        }, indent=2),
        encoding="utf-8",
    )
    # Set 114 S1: the session posted its step checklist. Written through
    # the shipping writer so the fixture exercises the real path.
    record_post(str(set_dir), 1, [])
    return root, set_dir


def _land(root: Path, set_dir: Path, disposition: Disposition) -> None:
    write_disposition(str(set_dir), disposition)
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "land session work")
    _git(root, "push", "origin", "main")


def _api_disposition(verdict="VERIFIED", method="api") -> Disposition:
    return Disposition(
        status="completed",
        summary="backstop matrix",
        verification_method=method,
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
        verification_verdict=verdict,
    )


class FakeBackstopRoute:
    """Mimics route()'s session-verification contract for the backstop:
    completes the stamp (verifier_model + artifact hash) and appends the
    stamped metrics row — what the production call's record_call does —
    then returns a RouteResult-shaped object."""

    def __init__(self, response="VERIFIED -- tried to break it, could not.",
                 model="gpt-5-4", provider="openai",
                 fail_times=0, unavailable=False):
        self.response = response
        self.model = model
        self.provider = provider
        self.fail_times = fail_times
        self.unavailable = unavailable
        self.calls = []

    def __call__(self, prompt, session_set, session_number,
                 complexity_hint, max_tier, exclude_providers=None,
                 verification_stamp=None, prefer_model=None):
        self.calls.append({
            "prompt": prompt,
            "session_set": session_set,
            "session_number": session_number,
            "exclude_providers": exclude_providers,
            "verification_stamp": verification_stamp,
        })
        if self.unavailable:
            raise VerificationUnavailableError(
                "no confirmed candidate outside the exclusion"
            )
        if self.fail_times > 0:
            self.fail_times -= 1
            raise RuntimeError("provider 529")
        completed = complete_stamp(
            verification_stamp,
            verifier_model=self.model,
            response_content=self.response,
        )
        row = {
            "task_type": "session-verification",
            "session_set": Path(session_set).name,
            "session_number": session_number,
            "provider": self.provider,
            "model": self.model,
            **completed,
        }
        with open(
            os.environ["AI_ROUTER_METRICS_PATH"], "a", encoding="utf-8"
        ) as f:
            f.write(json.dumps(row) + "\n")
        return SimpleNamespace(
            content=self.response,
            model_name=self.model,
            truncated=False,
            total_cost_usd=0.0123,
        )


@pytest.fixture
def fake_route(monkeypatch):
    fake = FakeBackstopRoute()
    monkeypatch.setattr(close_backstop, "_default_route", fake)
    return fake


# ---------------------------------------------------------------------------
# Incident 1 — self-attested VERIFIED, no row: the backstop runs and
# its verdict governs.
# ---------------------------------------------------------------------------

class TestIncident1SelfAttestedClose:
    def test_backstop_runs_and_close_succeeds_on_verified(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1
        # The framework, not the orchestrator, produced the evidence:
        # raw artifact + stamped row + patched disposition.
        assert (set_dir / "s1-verification.md").exists()
        rows = [
            json.loads(line)
            for line in Path(os.environ["AI_ROUTER_METRICS_PATH"])
            .read_text(encoding="utf-8").splitlines()
        ]
        assert rows[-1]["source"] == STAMP_SOURCE_CLOSE_BACKSTOP
        # The audit trail records the backstop verification.
        events = read_events(str(set_dir))
        vc = [e for e in events if e.event_type == "verification_completed"]
        assert vc and vc[-1].fields.get("source") == "close_session_backstop"
        assert any("close backstop ran" in m for m in outcome.messages)
        # Cost is printed (spec: "prints cost").
        assert any("$0.0123" in m for m in outcome.messages)

    def test_backstop_blocking_verdict_refuses_the_close(
        self, closeable, monkeypatch,
    ):
        root, set_dir = closeable
        fake = FakeBackstopRoute(
            response=(
                "ISSUES_FOUND\n\n"
                "Issue 1: The deliverable is missing entirely.\n"
                "Severity: Major\n"
            ),
        )
        monkeypatch.setattr(close_backstop, "_default_route", fake)
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "gate_failed"
        assert [g.check for g in outcome.gate_results] == [
            "verification_backstop"
        ]
        # The findings are written (raw artifact + issues envelope) and
        # the disposition now records the TRUE verdict — the
        # orchestrator's self-attested VERIFIED did not survive.
        assert (set_dir / "s1-verification.md").exists()
        assert (set_dir / "s1-issues.json").exists()
        patched = read_disposition(str(set_dir))
        assert patched.verification_verdict == "ISSUES_FOUND"
        failed_events = [
            e for e in read_events(str(set_dir))
            if e.event_type == "closeout_failed"
        ]
        assert failed_events[-1].fields.get("failed_checks") == [
            "verification_backstop"
        ]

    def test_minor_only_backstop_round_is_non_blocking(
        self, closeable, monkeypatch,
    ):
        root, set_dir = closeable
        fake = FakeBackstopRoute(
            response=(
                "ISSUES_FOUND\n\n"
                "Issue 1: A comment typo.\n"
                "Severity: Minor\n"
            ),
        )
        monkeypatch.setattr(close_backstop, "_default_route", fake)
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        # Minor-only is effectively VERIFIED for the loop (L-071-1).
        assert outcome.result == "succeeded", outcome.messages


# ---------------------------------------------------------------------------
# Incident 2 — the null-verdict close cannot complete unverified.
# ---------------------------------------------------------------------------

class TestIncident2NullVerdictClose:
    def test_skipped_method_close_is_verified_by_the_backstop(
        self, closeable, fake_route,
    ):
        """The engine wrote method 'skipped' with no zero-budget
        authority. Pre-084 the gate refused; now the framework simply
        runs the verification itself — the close completes VERIFIED,
        never unverified."""
        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict=None, method="skipped"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1
        patched = read_disposition(str(set_dir))
        assert patched.verification_method == "api"
        assert patched.verification_verdict == "VERIFIED"

    def test_null_verdict_close_blocks_when_backstop_cannot_run(
        self, closeable, monkeypatch,
    ):
        root, set_dir = closeable
        fake = FakeBackstopRoute(fail_times=2)
        monkeypatch.setattr(close_backstop, "_default_route", fake)
        _land(root, set_dir, _api_disposition(verdict=None, method="skipped"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "gate_failed"
        assert any("never a pass" in g.remediation
                   for g in outcome.gate_results)


# ---------------------------------------------------------------------------
# Incident 3 — bare-route row + diluted template: rejected, backstop
# runs with the registry-resolved exclusion.
# ---------------------------------------------------------------------------

class TestIncident3BareRouteRow:
    def test_bare_row_is_rejected_and_backstop_excludes_orchestrator(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        # The incident-3 evidence shape: a cross-provider row (from a
        # bare route() call with a hand-diluted prompt) + a raw-looking
        # artifact + a claimed VERIFIED. The 083 gate accepted this.
        (set_dir / "s1-verification.md").write_text(
            "VERIFIED (hand-rolled review)\n", encoding="utf-8",
        )
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps({
                "task_type": "session-verification",
                "session_set": set_dir.name,
                "session_number": 1,
                "provider": "openai",
                "model": "gpt-5-4",
            }) + "\n",
            encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        # The bare row did NOT settle the close: the backstop ran a
        # fresh round (round 2 — the incident artifact occupies round 1)
        # with the orchestrator's registry-resolved provider excluded.
        assert len(fake_route.calls) == 1
        assert fake_route.calls[0]["exclude_providers"] == ["anthropic"]
        assert (set_dir / "s1-verification-round-2.md").exists()
        stamp = fake_route.calls[0]["verification_stamp"]
        assert stamp["source"] == STAMP_SOURCE_CLOSE_BACKSTOP
        assert stamp["orchestrator_effective_provider"] == "anthropic"

    def test_verification_unavailable_blocks_explicitly(
        self, closeable, monkeypatch,
    ):
        root, set_dir = closeable
        fake = FakeBackstopRoute(unavailable=True)
        monkeypatch.setattr(close_backstop, "_default_route", fake)
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "gate_failed"
        [gate] = outcome.gate_results
        assert gate.check == "verification_backstop"
        assert "BLOCKED" in gate.remediation
        assert "--manual-verify" in gate.remediation
        # No verdict was written anywhere.
        assert not (set_dir / "s1-verification.md").exists()
        assert read_disposition(str(set_dir)).verification_verdict == "VERIFIED"


# ---------------------------------------------------------------------------
# Skips: evidence present / Minor-only settled / zero-budget /
# force / manual-verify.
# ---------------------------------------------------------------------------

class TestBackstopSkips:
    def test_valid_stamped_evidence_stands_the_backstop_down(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert fake_route.calls == []  # verify_session pre-empted it

    def test_minor_only_settled_claim_stands_the_backstop_down(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        # SS2: findings live in the HASH-BOUND artifact (as in production, where
        # the envelope is derived from it), so the close reads severity from here.
        row = write_stamped_evidence(
            set_dir, content="ISSUES FOUND\n\nIssue 1: nit\nSeverity: Minor\n",
        )
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        (set_dir / "s1-issues.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 1,
                "verificationVerdict": "ISSUES_FOUND",
                "issues": [{"severity": "Minor", "description": "nit"}],
            }) + "\n",
            encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="ISSUES_FOUND"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert fake_route.calls == []

    def test_blocking_claim_with_stamped_row_reruns_verification(
        self, closeable, fake_route,
    ):
        """A blocking ISSUES_FOUND claim is NOT settled — the backstop
        runs a fresh round and ITS verdict governs."""
        root, set_dir = closeable
        # SS2: the Major lives in the HASH-BOUND artifact; the close reads it
        # from there, so a blocking finding reruns regardless of the envelope.
        row = write_stamped_evidence(
            set_dir, content="ISSUES FOUND\n\nIssue 1: broken\nSeverity: Major\n",
        )
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        (set_dir / "s1-issues.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 1,
                "verificationVerdict": "ISSUES_FOUND",
                "issues": [{"severity": "Major", "description": "broken"}],
            }) + "\n",
            encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="ISSUES_FOUND"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1

    def test_laundered_minor_envelope_cannot_settle_a_major_artifact(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        # The HASH-BOUND raw artifact carries a real Major finding.
        content = "ISSUES FOUND\n\nIssue 1: auth bypass\nSeverity: Major\n"
        row = write_stamped_evidence(set_dir, content=content)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        # The UNBOUND envelope is tampered to hide that Major as a Minor -- the
        # laundering surface (editing this file breaks no hash today).
        (set_dir / "s1-issues.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 1,
                "verificationVerdict": "ISSUES_FOUND",
                "issues": [{"severity": "Minor", "description": "auth bypass"}],
            }) + "\n",
            encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="ISSUES_FOUND"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        # DESIRED (SS2): the bound artifact's Major governs -> the backstop runs
        # a fresh round; the laundered Minor envelope must NOT stand it down.
        # CURRENT: the envelope's Minor settles the close (calls == 0) -> laundered.
        assert len(fake_route.calls) == 1

    def test_newer_invalid_row_does_not_fall_back_to_older_valid_row(
        self, closeable, fake_route,
    ):
        # SS3 anti-rollback (GPT SS3 review #1): an older valid VERIFIED row must
        # NOT settle the close when a NEWER attempt failed validation -- here a
        # truncated round whose artifact never landed (write_artifact=False).
        # The latest attempt governs; the older pass cannot be resurrected.
        root, set_dir = closeable
        old_verified = write_stamped_evidence(set_dir, content="VERIFIED\n")
        newer_invalid = write_stamped_evidence(
            set_dir,
            round_number=2,
            content="ISSUES FOUND\n\nIssue 1: auth bypass\nSeverity: Major\n",
            write_artifact=False,
        )
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(old_verified) + "\n" + json.dumps(newer_invalid) + "\n",
            encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        # The older row did NOT stand the backstop down: a fresh round ran.
        assert len(fake_route.calls) == 1

    def test_zero_budget_tier_passthrough(
        self, closeable, fake_route, tmp_path,
    ):
        """The operator-declared zero-budget tier keeps its manual flow:
        no backstop call, and the existing zero-budget gate arm decides
        the close."""
        root, set_dir = closeable
        (root / "ai_router").mkdir()
        (root / "ai_router" / "budget.yaml").write_text(
            "threshold_usd: 0\n"
            'verification_method: "manual-via-other-engine"\n',
            encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(
            verdict="VERIFIED", method="manual-via-other-engine",
        ))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert fake_route.calls == []
        assert any("zero-budget" in m for m in outcome.messages)

    def test_force_path_also_gets_the_backstop(
        self, closeable, fake_route, tmp_path, monkeypatch,
    ):
        """I-084-S2-1 (this set's own backstop round-1 finding): --force
        bypasses bookkeeping gates, NEITHER evidence layer — an
        unverified force-close receives the same in-process
        verification, and the fresh stamped row then satisfies the
        verification-integrity check the force path still runs."""
        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
        reason = tmp_path / "reason.md"
        reason.write_text("incident recovery\n", encoding="utf-8")

        outcome = close_session.run(_ns(
            session_set_dir=str(set_dir),
            force=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1
        assert (set_dir / "s1-verification.md").exists()

    def test_force_close_with_blocking_backstop_verdict_is_refused(
        self, closeable, tmp_path, monkeypatch,
    ):
        """Force cannot outrank the backstop's verdict either."""
        root, set_dir = closeable
        fake = FakeBackstopRoute(
            response=(
                "ISSUES_FOUND\n\n"
                "Issue 1: Broken deliverable.\nSeverity: Major\n"
            ),
        )
        monkeypatch.setattr(close_backstop, "_default_route", fake)
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
        reason = tmp_path / "reason.md"
        reason.write_text("incident recovery\n", encoding="utf-8")

        outcome = close_session.run(_ns(
            session_set_dir=str(set_dir),
            force=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "gate_failed"
        assert len(fake.calls) == 1

    def test_manual_verify_path_never_triggers_the_backstop(
        self, closeable, fake_route, tmp_path,
    ):
        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(
            verdict="VERIFIED", method="manual-via-other-engine",
        ))
        reason = tmp_path / "attestation.md"
        reason.write_text(
            "operator attests: verified out-of-band on another surface\n",
            encoding="utf-8",
        )
        outcome = close_session.run(_ns(
            session_set_dir=str(set_dir),
            manual_verify=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "succeeded", outcome.messages
        assert fake_route.calls == []

    def test_illegal_vocabulary_skips_the_backstop(
        self, closeable, fake_route,
    ):
        """The incident's illegal 'manual' token dooms the close at the
        vocabulary gate — no metered call is spent first."""
        root, set_dir = closeable
        _land(root, set_dir, Disposition(
            status="completed",
            summary="incident shape",
            verification_method="manual",
            verification_verdict="VERIFIED",
            next_orchestrator=_valid_next_orc(),
        ))
        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "gate_failed"
        assert fake_route.calls == []

    def test_identity_unresolvable_blocks_with_model_remediation(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        # Strip the orchestrator block down to a multi-provider seat
        # with no model — unresolvable (F1 fails closed).
        state_path = set_dir / "session-state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["sessions"][0]["orchestrator"] = {"engine": "copilot"}
        state_path.write_text(
            json.dumps(state, indent=2) + "\n", encoding="utf-8"
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "gate_failed"
        [gate] = outcome.gate_results
        assert "--model" in gate.remediation
        assert fake_route.calls == []


# ---------------------------------------------------------------------------
# The two-attempt ladder + retry recovery
# ---------------------------------------------------------------------------

class TestTwoAttemptLadder:
    def test_one_failure_then_success_closes(
        self, closeable, monkeypatch, capsys,
    ):
        root, set_dir = closeable
        fake = FakeBackstopRoute(fail_times=1)
        monkeypatch.setattr(close_backstop, "_default_route", fake)
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert len(fake.calls) == 2
        assert "retrying once" in capsys.readouterr().err

    def test_two_failures_block_never_pass(self, closeable, monkeypatch):
        root, set_dir = closeable
        fake = FakeBackstopRoute(fail_times=2)
        monkeypatch.setattr(close_backstop, "_default_route", fake)
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "gate_failed"
        assert len(fake.calls) == 2
        [gate] = outcome.gate_results
        assert "never a pass" in gate.remediation


# ---------------------------------------------------------------------------
# Idempotency + the pre-session diff base
# ---------------------------------------------------------------------------

class TestBackstopMechanics:
    def test_oversized_evidence_is_a_gate_refusal_not_a_traceback(
        self, closeable, monkeypatch,
    ):
        """Set 112 S2 (found by this repo's own close).

        ``assemble_evidence`` raises ``EvidenceTooLargeError``, which is
        deliberately NOT a ``VerifySessionError`` (the CLI maps it to its own
        verification-unavailable exit code). The backstop only caught
        ``VerifySessionError``, so an oversized session made ``close_session``
        die with a raw traceback instead of refusing the close with a message.
        A traceback on the close path reads as a broken tool, and it arrives
        at exactly the moment an operator most needs to be told what to do.

        The refusal must fail CLOSED and name the escape: the backstop
        assembles with the default excludes only, so the way out is the
        sanctioned Step 6 command, where ``--exclude`` / ``--diff-base``
        can shrink the bundle honestly.
        """
        import verify_session as _vs

        _root, set_dir = closeable

        def _too_large(*_args, **_kwargs):
            raise _vs.EvidenceTooLargeError(968_227, 614_400)

        monkeypatch.setattr(close_backstop._vs, "assemble_evidence", _too_large)
        # A route call would mean the backstop got past assembly -- it must not.
        monkeypatch.setattr(
            close_backstop,
            "_default_route",
            lambda *a, **k: pytest.fail("routed despite oversized evidence"),
        )

        outcome = close_backstop.run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )

        assert outcome.status == close_backstop.STATUS_UNAVAILABLE
        assert "968227" in outcome.remediation
        assert "--exclude" in outcome.remediation
        assert "verify_session" in outcome.remediation

    def test_backstop_close_is_idempotent_under_rerun(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        first = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert first.result == "succeeded", first.messages
        second = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert second.result == "noop_already_closed"
        assert len(fake_route.calls) == 1

    def test_rerun_after_later_gate_failure_stays_idempotent(
        self, tmp_path, monkeypatch,
    ):
        """I-084-S2-9 (round-6 finding): backstop VERIFIED -> a LATER
        gate fails -> the rerun skips the backstop AND still tolerates
        the prior round's uncommitted bookkeeping — the rerun fails on
        the same later gate, never on working_tree_clean."""
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH", str(tmp_path / "metrics.jsonl")
        )
        fake = FakeBackstopRoute()
        monkeypatch.setattr(close_backstop, "_default_route", fake)
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
        set_dir = root / "docs" / "session-sets" / "final-set"
        set_dir.mkdir(parents=True)
        (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
        register_session_start(
            session_set=str(set_dir),
            session_number=1,
            total_sessions=1,  # final session; change-log.md is owed
            orchestrator_engine="claude-code",
            orchestrator_model="claude-fable-5",
            orchestrator_effort="high",
            orchestrator_provider="anthropic",
        )
        (set_dir / "activity-log.json").write_text(
            json.dumps({
                "sessionSetName": "final-set",
                "createdDate": "2026-07-07T00:00:00-04:00",
                "totalSessions": 1,
                "entries": [{
                    "sessionNumber": 1, "stepNumber": 1,
                    "stepKey": "session-1/work",
                    "dateTime": "2026-07-07T01:00:00-04:00",
                    "description": "did work", "status": "complete",
                    "routedApiCalls": [],
                }],
            }, indent=2),
            encoding="utf-8",
        )
        # Set 114 S1: the session posted its step checklist.
        record_post(str(set_dir), 1, [])
        write_disposition(str(set_dir), Disposition(
            status="completed",
            summary="rerun idempotency",
            verification_method="api",
            # Set 116 S3: this used to lean on change_log_fresh as the
            # "later gate", and that check is advisory now — the close
            # would succeed and the test would prove nothing. It needs a
            # gate that still REFUSES, so the session declares a pytest-
            # covered surface with no run of record and fails
            # test_run_fresh instead. The I-084-S2-9 property under test
            # is unchanged: whatever the later gate is, the rerun must
            # fail on IT and never on working_tree_clean.
            files_changed=["ai_router/foo.py"],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=[],
            verification_verdict="VERIFIED",
        ))
        _git(root, "add", "-A")
        _git(root, "commit", "-m", "land work (no run of record yet)")
        _git(root, "push", "origin", "main")

        # Run 1: backstop verifies live, then test_run_fresh fails.
        first = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert first.result == "gate_failed", first.messages
        assert len(fake.calls) == 1
        failed_first = {
            g.check for g in first.gate_results
            if not g.passed and g.blocking
        }
        assert failed_first == {"test_run_fresh"}, failed_first

        # Run 2: the backstop skips on the existing evidence, its
        # uncommitted bookkeeping stays tolerated, and only the same
        # later gate fails again.
        second = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert second.result == "gate_failed", second.messages
        assert len(fake.calls) == 1  # no second verification
        failed_second = {
            g.check for g in second.gate_results
            if not g.passed and g.blocking
        }
        assert failed_second == {"test_run_fresh"}, failed_second

    def test_diff_base_is_the_last_pre_session_commit(self, closeable):
        """The caller commits before close, so a HEAD diff is empty —
        the backstop diffs from the last commit before startedAt so the
        verifier reviews the session's actual work."""
        root, set_dir = closeable
        baseline_sha = subprocess.run(
            ["git", "-C", str(root), "rev-list", "-1", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        # startedAt was written by register_session_start (now); the
        # baseline commit predates it. Land a post-start commit —
        # explicitly dated an hour later, because git commit timestamps
        # have one-second resolution and this whole fixture runs inside
        # a single second.
        from datetime import datetime, timedelta, timezone

        future = (
            datetime.now(timezone.utc) + timedelta(hours=1)
        ).strftime("%Y-%m-%dT%H:%M:%S+00:00")
        (root / "work.py").write_text("x = 1\n", encoding="utf-8")
        _git(root, "add", "-A")
        env = dict(os.environ)
        env["GIT_COMMITTER_DATE"] = future
        env["GIT_AUTHOR_DATE"] = future
        subprocess.run(
            ["git", "commit", "-m", "session work"],
            cwd=str(root), env=env, check=True, capture_output=True,
        )
        base = resolve_backstop_diff_base(set_dir, 1)
        assert base == baseline_sha

    def test_cherry_picked_older_verified_row_does_not_settle(
        self, closeable, fake_route,
    ):
        """I-084-S2-8: a later refusing round is the authoritative
        result — flipping the claim back to an earlier VERIFIED row's
        verdict triggers a fresh backstop round, not a quiet close."""
        root, set_dir = closeable
        rows = [
            write_stamped_evidence(set_dir, content="VERIFIED\n"),
            write_stamped_evidence(
                set_dir, round_number=2, content="ISSUES_FOUND\n",
            ),
        ]
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            "".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1  # older row did NOT settle it

    def test_hand_flipped_claim_triggers_a_fresh_backstop_round(
        self, closeable, fake_route,
    ):
        """I-084-S2-7: an ISSUES_FOUND stamped row cannot stand the
        backstop down for a hand-flipped VERIFIED claim — the framework
        re-verifies and ITS verdict governs."""
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir, content="ISSUES_FOUND\n")
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        # The orchestrator hand-claims VERIFIED over the refusing row.
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1  # the row did NOT settle it

    def test_stale_evidence_does_not_settle_a_later_close(
        self, closeable, fake_route,
    ):
        """I-084-S2-5 (the dogfood's round-3 finding): evidence stamped
        at repo state A cannot settle a close performed after further
        work landed — the freshness binding mismatches and the backstop
        runs a fresh round over the state actually being closed."""
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)  # binds to state A
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        # New session work lands AFTER the verification row.
        (root / "post_verification_work.py").write_text(
            "changed = True\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1  # stale row did NOT stand it down

    def test_fresh_repo_first_session_diffs_from_the_empty_tree(
        self, closeable,
    ):
        """I-084-S2-6: with no pre-session commit, the evidence base is
        git's empty tree — the session's work IS the whole tree, never
        a silently empty bundle."""
        root, set_dir = closeable
        # Make every commit postdate startedAt.
        state_path = set_dir / "session-state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["sessions"][0]["startedAt"] = "2001-01-01T00:00:00+00:00"
        state_path.write_text(
            json.dumps(state, indent=2) + "\n", encoding="utf-8"
        )
        from verification_stamp import GIT_EMPTY_TREE

        assert resolve_backstop_diff_base(set_dir, 1) == GIT_EMPTY_TREE

    def test_drifted_template_blocks_the_close_controlled(
        self, closeable, fake_route, monkeypatch,
    ):
        """I-084-S2-11 (round-8 finding): an unbumped template edit
        surfaces as a deterministic gate_failed with remediation —
        never an unwinding traceback, never a metered call."""
        import verification_stamp as vstamp

        root, set_dir = closeable
        monkeypatch.setattr(
            vstamp, "load_canonical_template",
            lambda: "A diluted, friendlier review template.",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "gate_failed"
        [gate] = outcome.gate_results
        assert "version bump" in gate.remediation
        assert fake_route.calls == []

    def test_missing_started_at_fails_closed_not_thin_bundle(
        self, closeable, fake_route,
    ):
        """I-084-S2-6: no recorded startedAt means the evidence base is
        unknowable — the backstop refuses rather than verifying a
        degraded HEAD-diff bundle."""
        root, set_dir = closeable
        state_path = set_dir / "session-state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["sessions"][0]["startedAt"] = None
        state_path.write_text(
            json.dumps(state, indent=2) + "\n", encoding="utf-8"
        )
        disposition = _api_disposition(verdict="VERIFIED")
        write_disposition(str(set_dir), disposition)
        outcome = run_close_backstop(str(set_dir), 1, disposition)
        assert outcome.status == "route_failed"
        assert "--diff-base" in outcome.remediation
        assert fake_route.calls == []

    def test_backstop_prompt_opens_with_the_conventions_block(
        self, closeable, fake_route,
    ):
        """The promoted L-064-10 Convention: every session-verification
        prompt opens with the agreed baseline. The backstop's built-in
        block names the two structural facts a mid-close verifier
        cannot otherwise know (the in-process view; the severity-derived
        blocking predicate) — this set's own dogfood rounds 1–2 showed
        both produce guaranteed false positives when omitted."""
        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))
        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages
        prompt = fake_route.calls[0]["prompt"]
        assert "Conventions and baseline (read first)" in prompt
        assert "IN-PROCESS during the very close it verifies" in prompt
        assert "L-071-1" in prompt

    def test_run_close_backstop_direct_verified_outcome(
        self, closeable, fake_route,
    ):
        """Unit-level: the direct API returns the artifacts it wrote."""
        root, set_dir = closeable
        disposition = _api_disposition(verdict="VERIFIED")
        write_disposition(str(set_dir), disposition)
        outcome: BackstopOutcome = run_close_backstop(
            str(set_dir), 1, disposition,
        )
        assert outcome.status == "verified"
        assert outcome.verdict == "VERIFIED"
        assert not outcome.blocking
        assert any(
            p.endswith("s1-verification.md") for p in outcome.written_paths
        )
        assert any(
            p.endswith("disposition.json") for p in outcome.written_paths
        )
        # The artifact's bytes hash-match the stamp route() recorded.
        rows = [
            json.loads(line)
            for line in Path(os.environ["AI_ROUTER_METRICS_PATH"])
            .read_text(encoding="utf-8").splitlines()
        ]
        from verification_stamp import sha256_hex

        artifact_bytes = (set_dir / "s1-verification.md").read_bytes()
        assert rows[-1]["artifact_sha256"] == sha256_hex(artifact_bytes)


# ---------------------------------------------------------------------------
# Set 116 S2 — one round budget, every route.
# ---------------------------------------------------------------------------

def _seed_consumed_rounds(
    set_dir: Path, session_number: int, count: int
) -> None:
    """Seed *count* findings-bearing rounds that did NOT end the loop.

    Both halves are load-bearing and seeding only one tests nothing:
    ``resolve_round`` infers the next round number from the ARTIFACTS on
    disk, while ``count_phase_family_rounds`` counts the LEDGER records.
    A fixture with ledger lines but no artifacts resolves back to round 1
    and the bound never trips.

    A completed round is a checklist transition, so the seeded session
    posts after each one exactly as the cadence requires. That is not
    decoration: without it the fixture depends on the clock being too
    COARSE to separate the fixture's own post from the seeded rounds
    (``datetime.now()`` resolves to ~15.6ms on Windows, so all of them
    land on one tick when the machine is idle). It passed alone and
    failed under parallel load, which is the worst way for a test to be
    wrong -- it would have read as flaky CI rather than as a fixture bug.
    """
    import verify_session as _vs

    for round_number in range(1, count + 1):
        _vs.verification_artifact_path(
            set_dir, session_number, round_number
        ).write_text(
            "ISSUES FOUND\n\nIssue 1: broken\nSeverity: Major\n",
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


class TestRoundBudgetCoversTheBackstop:
    """The backstop resolved a round and routed with NO bound at all, while
    ``verify_session`` refused past one. That is how router metrics show
    backstop rounds 5-10 (Set 111 S2), 5-12 (Set 112 S3) and 5-7 (Set 114
    S1): unauthorized, unledgered, and invisible to the arithmetic that was
    supposed to be capping them at 2.

    Per L-112-1 each rule is pinned from both sides: the planted violation
    that must refuse, and the legitimate look-alike that must NOT.
    """

    def test_refuses_past_the_bound_before_any_metered_call(
        self, closeable, monkeypatch,
    ):
        import verify_session as _vs

        _root, set_dir = closeable
        _seed_consumed_rounds(set_dir, 1, _vs.PHASE_BOUND_CLASSIC)
        # A route call would mean the backstop bought the round anyway --
        # the whole defect. It must refuse BEFORE spending money.
        monkeypatch.setattr(
            close_backstop, "_default_route",
            lambda *a, **k: pytest.fail("routed past the round bound"),
        )

        outcome = run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )

        assert outcome.status == close_backstop.STATUS_ROUND_BOUND_REACHED
        assert outcome.verdict is None

    def test_the_refusal_names_both_operator_exits(
        self, closeable, monkeypatch,
    ):
        """A deterministic refusal that does not say what it wants is just
        a wall. Both exits already exist -- a set about removing ceremony
        does not get to invent a third flag."""
        import verify_session as _vs

        _root, set_dir = closeable
        _seed_consumed_rounds(set_dir, 1, _vs.PHASE_BOUND_CLASSIC)
        monkeypatch.setattr(
            close_backstop, "_default_route",
            lambda *a, **k: pytest.fail("routed past the round bound"),
        )

        outcome = run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )

        assert "--manual-verify" in outcome.remediation
        assert "--operator-authorized-round" in outcome.remediation
        assert "s1-rounds.jsonl" in outcome.remediation
        assert "operator" in outcome.remediation.lower()

    def test_the_close_blocks_on_the_refusal_rather_than_passing(
        self, closeable, monkeypatch,
    ):
        import verify_session as _vs

        root, set_dir = closeable
        _seed_consumed_rounds(set_dir, 1, _vs.PHASE_BOUND_CLASSIC)
        monkeypatch.setattr(
            close_backstop, "_default_route",
            lambda *a, **k: pytest.fail("routed past the round bound"),
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "gate_failed", outcome.messages
        assert outcome.gate_results[0].check == (
            close_backstop.BACKSTOP_CHECK_NAME
        )

    def test_under_the_bound_the_backstop_still_runs(
        self, closeable, fake_route,
    ):
        """The look-alike: one consumed round is a session mid-loop, not a
        spent one. The budget must not fire early."""
        _root, set_dir = closeable
        _seed_consumed_rounds(set_dir, 1, 1)

        outcome = run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )

        assert outcome.status == close_backstop.STATUS_VERIFIED
        assert len(fake_route.calls) == 1

    def test_a_spent_budget_never_blocks_a_close_that_verified_clean(
        self, closeable, fake_route,
    ):
        """The look-alike that matters most: the bound is checked AFTER the
        settling-evidence skip, so a session that ran a long loop and then
        verified clean still closes. The budget bites only when the close
        has no settling evidence AND the loop is already spent -- the state
        that should stop for a human, not buy round 11."""
        root, set_dir = closeable
        _seed_consumed_rounds(set_dir, 1, 4)  # well past the bound of 2
        row = write_stamped_evidence(set_dir, round_number=5)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        assert fake_route.calls == []


class TestBackstopRoundsAreAuditable:
    """Every round the backstop runs is written to ``sN-rounds.jsonl`` like
    any other, so the ledger is the true count rather than something to be
    reconstructed from router metrics after the fact."""

    def test_the_round_lands_in_the_ledger_with_its_source(
        self, closeable, fake_route,
    ):
        import verify_session as _vs

        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages

        completed = [
            r for r in _vs.read_round_ledger(set_dir, 1)
            if r.get("event") == _vs.ROUND_EVENT_COMPLETED
        ]
        assert len(completed) == 1
        assert completed[0]["source"] == _vs.ROUND_SOURCE_CLOSE_BACKSTOP
        assert completed[0]["verificationRound"] == 1
        assert completed[0]["verdict"] == "VERIFIED"
        # A clean round settles the close, so it consumes no budget.
        assert completed[0]["endedLoop"] is True

    def test_a_verify_session_round_keeps_its_own_source(self, closeable):
        """The look-alike: the field distinguishes the two producers, so a
        wrong default would have to be wrong for one of them."""
        import verify_session as _vs

        _root, set_dir = closeable
        _seed_consumed_rounds(set_dir, 1, 1)

        completed = [
            r for r in _vs.read_round_ledger(set_dir, 1)
            if r.get("event") == _vs.ROUND_EVENT_COMPLETED
        ]
        assert completed[0]["source"] == _vs.ROUND_SOURCE_VERIFY_SESSION

    def test_the_ledger_write_does_not_trip_the_working_tree_gate(
        self, closeable, fake_route,
    ):
        """The ledger is now a mid-close write like the artifacts beside it.
        The close SUCCEEDING is the assertion: ``s*-rounds.jsonl`` is not in
        ``gate_checks._WORKING_TREE_IGNORE_PATTERNS``, so without the
        backstop declaring it in ``written_paths`` this close would fail on
        working_tree_clean."""
        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        assert (set_dir / "s1-rounds.jsonl").exists()

    def test_a_backstop_round_is_not_a_checklist_transition(self, closeable):
        """It runs in-process DURING the close, so the window for "post at
        or after this transition" opens after the last moment anyone could
        post into it. An obligation the session cannot discharge is a trap,
        not discipline."""
        import gate_checks
        import verify_session as _vs
        from session_state import read_session_state

        _root, set_dir = closeable
        _vs.record_round_completed(
            _vs.round_ledger_path(set_dir, 1),
            session_number=1,
            round_number=1,
            phase=None,
            verdict="VERIFIED",
            blocking=False,
            ended_loop=True,
            source=_vs.ROUND_SOURCE_CLOSE_BACKSTOP,
        )

        state = read_session_state(str(set_dir))
        labels = [
            label for _when, label
            in gate_checks._checklist_transitions(str(set_dir), 1, state)
        ]
        assert not any(
            label.startswith(gate_checks.CHECKLIST_TRANSITION_ROUND)
            for label in labels
        ), labels

    def test_a_verify_session_round_is_still_a_checklist_transition(
        self, closeable,
    ):
        """The look-alike: the cadence still binds for rounds the
        orchestrator itself ran, which is the whole point of the gate."""
        import gate_checks
        from session_state import read_session_state

        _root, set_dir = closeable
        _seed_consumed_rounds(set_dir, 1, 1)

        state = read_session_state(str(set_dir))
        labels = [
            label for _when, label
            in gate_checks._checklist_transitions(str(set_dir), 1, state)
        ]
        assert any(
            label.startswith(gate_checks.CHECKLIST_TRANSITION_ROUND)
            for label in labels
        ), labels


class TestRunningTestsLastDoesNotReopenTheLoop:
    """The staleness half of the same bug, end to end.

    ``verification_stamp`` excluded ``s*-rounds.jsonl`` and
    ``checklist-posts.jsonl`` from freshness but not ``test-runs.jsonl``,
    so recording the final full-suite run -- the constitution's own
    ordering -- staled the round that had just passed and sent the close
    into a fresh, then-unbounded backstop round. Set 116 S1 added the
    exclusion; this pins the behaviour at the level the bug actually bit.
    """

    def _record_final_run(self, root: Path, set_dir: Path) -> None:
        import run_of_record as ror

        ror.record_run(
            str(set_dir),
            ror.SuiteSpec(
                name="pytest",
                command="python -m pytest",
                covers=("ai_router/",),
                expensive=True,
            ),
            ror.OUTCOME_PASSED,
            duration_seconds=244.20,
            session_number=1,
            repo_root=str(root),
        )
        # Recording a run IS a checklist transition ("once its run is
        # recorded"), so a real session posts here. Without this the close
        # fails on checklist_posted and the test would prove nothing about
        # staleness -- which is exactly what the first cut did.
        record_post(str(set_dir), 1, [])
        _git(root, "add", "-A")
        _git(root, "commit", "-m", "record the final suite run")
        _git(root, "push", "origin", "main")

    def test_a_run_recorded_after_a_passed_round_does_not_stale_it(
        self, closeable, fake_route,
    ):
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        # Exactly the documented ordering: the expensive suite runs last,
        # after the last code change, and its record lands after the round
        # that verified it.
        self._record_final_run(root, set_dir)

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        # The passed round still settles the close: no fresh metered round.
        assert fake_route.calls == []

    def test_real_work_landing_after_the_round_still_stales_it(
        self, closeable, fake_route,
    ):
        """The look-alike that keeps the exemption narrow. A bookkeeping
        ledger is a RECORD about the work; the work itself must still bind,
        or the exemption would be a blanket pass on post-verification
        edits."""
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        self._record_final_run(root, set_dir)
        # ...and then a real edit lands on top of the verified state.
        (set_dir / "spec.md").write_text(
            "# spec\n\nchanged after the round\n", encoding="utf-8",
        )
        _git(root, "add", "-A")
        _git(root, "commit", "-m", "post-verification code change")
        _git(root, "push", "origin", "main")

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1  # stale -> the backstop re-verified


# ---------------------------------------------------------------------------
# Set 119 S3 - the backstop's own recovery path, and its survivable failures
# ---------------------------------------------------------------------------

class TestTheBackstopLeavesARecoveryPath:
    """A backstop-blocked close told the orchestrator to "re-verify with
    verify_session (the sanctioned remediation loop)". That instruction did
    not work: ``--phase remediation-review`` fails closed unless a prior
    round recorded a ``discoveryBaselineTree``, and NO round in this state
    ever had -- the envelope is written only on findings-bearing
    discovery-family rounds, and a backstop round is unphased. So the one
    documented way out cost a full discovery round (~$0.88) to reach a
    remediation review (~$0.07).
    """

    def _blocking_route(self):
        return FakeBackstopRoute(
            response=(
                "ISSUES_FOUND\n\n"
                "Issue 1: The deliverable is missing entirely.\n"
                "Severity: Major\n"
                "Evidence paths: ai_router/close_backstop.py\n"
            ),
        )

    def test_a_backstop_round_records_the_baseline_it_reviewed(
        self, closeable, monkeypatch,
    ):
        """PLANTED: the exact state the refusal is printed in."""
        import verify_session as _vs

        root, set_dir = closeable
        monkeypatch.setattr(
            close_backstop, "_default_route", self._blocking_route()
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "gate_failed"

        completed = [
            r for r in _vs.read_round_ledger(set_dir, 1)
            if r.get("event") == _vs.ROUND_EVENT_COMPLETED
        ]
        tree = completed[-1].get("discoveryBaselineTree")
        assert tree, "the backstop round left no baseline to remediate from"
        assert _vs.find_discovery_baseline_tree(set_dir, 1, 2) == (1, tree)

    def test_the_refusal_names_a_command_that_works_from_this_state(
        self, closeable, monkeypatch,
    ):
        """The spec's falsifier: the named command must SUCCEED from the
        exact state the message is printed in.

        The message is parsed, not paraphrased -- a test that hand-builds
        the args would keep passing after the message drifted, which is how
        an instruction goes stale without anyone noticing.
        """
        import verify_session as _vs

        root, set_dir = closeable
        monkeypatch.setattr(
            close_backstop, "_default_route", self._blocking_route()
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )
        assert outcome.status == close_backstop.STATUS_BLOCKING
        remediation = outcome.remediation
        assert "--phase remediation-review" in remediation, remediation

        # Run exactly what it named.
        tokens = remediation.split()
        phase = tokens[tokens.index("--phase") + 1]
        assert phase == "remediation-review"

        args = _vs._build_arg_parser().parse_args(
            ["--session-set-dir", str(set_dir), "--phase", phase]
        )
        exit_code = _vs.run(
            args,
            route_fn=FakeBackstopRoute(
                response=(
                    "VERIFIED\n\n"
                    "Fix verdict: L1-1 The deliverable is missing entirely "
                    "-- fix-accepted\n"
                )
            ),
        )
        assert exit_code != _vs.EXIT_USAGE, (
            "the backstop told the orchestrator to run a command that "
            "refuses from the state it was printed in"
        )
        assert exit_code == _vs.EXIT_OK
        # And it really reviewed the fix delta, from the baseline the
        # backstop round left behind.
        assert (set_dir / "s1-verification-round-2.md").exists()

    def test_a_clean_round_also_leaves_a_baseline(self, closeable, fake_route):
        """The case the old behaviour ignored: a CLEAN round writes no
        findings envelope, so under the envelope-only rule it left no
        baseline either -- even though it is a perfectly good one."""
        import verify_session as _vs

        root, set_dir = closeable
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages

        assert not (set_dir / "s1-issues.json").exists()
        assert _vs.find_discovery_baseline_tree(set_dir, 1, 2) is not None

    def test_a_remediation_review_round_never_becomes_a_baseline(
        self, closeable,
    ):
        """The look-alike. A remediation-review reviews the fix delta FROM a
        baseline; recording one would make a second cycle diff from the
        first fix instead of from the original discovery baseline."""
        import verify_session as _vs

        _root, set_dir = closeable
        _vs.record_round_completed(
            _vs.round_ledger_path(set_dir, 1),
            session_number=1,
            round_number=1,
            phase=_vs.PHASE_REMEDIATION_REVIEW,
            verdict="VERIFIED",
            blocking=False,
            ended_loop=True,
            discovery_baseline_tree=None,
        )
        assert _vs.find_discovery_baseline_tree(set_dir, 1, 2) is None

    def test_the_envelope_still_wins_within_one_round(self, closeable):
        """Two records can carry the baseline. The immutable artifact is the
        authority; they agree by construction when both exist."""
        import verify_session as _vs

        _root, set_dir = closeable
        _vs.write_issues_artifact(
            _vs.issues_artifact_path(set_dir, 1, 1),
            1, 1, "ISSUES_FOUND",
            [{"description": "x", "severity": "Major"}],
            phase=_vs.PHASE_DISCOVERY,
            discovery_baseline_tree="a" * 40,
        )
        _vs.record_round_completed(
            _vs.round_ledger_path(set_dir, 1),
            session_number=1,
            round_number=1,
            phase=_vs.PHASE_DISCOVERY,
            verdict="ISSUES_FOUND",
            blocking=True,
            ended_loop=False,
            discovery_baseline_tree="b" * 40,
        )
        assert _vs.find_discovery_baseline_tree(set_dir, 1, 2) == (1, "a" * 40)

    def test_a_ledger_without_a_baseline_is_tolerated(self, closeable):
        """Ledgers written before this set carry no key at all."""
        import verify_session as _vs

        _root, set_dir = closeable
        _vs.record_round_completed(
            _vs.round_ledger_path(set_dir, 1),
            session_number=1,
            round_number=1,
            phase=None,
            verdict="ISSUES_FOUND",
            blocking=True,
            ended_loop=False,
        )
        record = _vs.read_round_ledger(set_dir, 1)[-1]
        assert "discoveryBaselineTree" not in record
        assert _vs.find_discovery_baseline_tree(set_dir, 1, 2) is None


class TestAnOversizedBundleCannotTakeTheGateDown:
    """``EvidenceTooLargeError`` was a SIBLING of ``VerifySessionError``.
    ``close_backstop`` catches the parent at four sites and caught this one
    at exactly one, so an oversized bundle crashed the close with an
    unhandled traceback on the other four -- the gate gone, no remediation
    line, on the most expensive path there is. Set 119 S3 fixed the TYPE,
    which fixes all four (L-069-1: the class, not the instance).
    """

    def test_it_is_a_subclass_now(self):
        import verify_session as _vs

        assert issubclass(_vs.EvidenceTooLargeError, _vs.VerifySessionError)

    def test_a_parent_only_handler_now_catches_it(self):
        """The structural assertion beside the textual one (L-112-1): the
        four bare ``except VerifySessionError`` sites are covered by the
        type relationship, however they are spelled."""
        import verify_session as _vs

        try:
            raise _vs.EvidenceTooLargeError(968_227, 614_400)
        except _vs.VerifySessionError as exc:
            assert exc.assembled_chars == 968_227
        else:  # pragma: no cover - the raise above always fires
            pytest.fail("a parent-only handler still misses the subclass")

    def test_the_cli_still_maps_it_to_verification_unavailable(
        self, closeable, monkeypatch,
    ):
        """PLANTED LOOK-ALIKE, and the trap the spec warned about: a
        subclass caught AFTER its parent is unreachable code. The CLI
        caught ``VerifySessionError`` first, so making the type a subclass
        would have silently downgraded the fail-closed
        verification-unavailable exit into a plain usage error.
        """
        import verify_session as _vs

        _root, set_dir = closeable

        def _too_large(*_a, **_kw):
            raise _vs.EvidenceTooLargeError(968_227, 614_400)

        monkeypatch.setattr(_vs, "assemble_evidence", _too_large)
        args = _vs._build_arg_parser().parse_args(
            ["--session-set-dir", str(set_dir)]
        )
        assert _vs.run(args) == _vs.EXIT_VERIFICATION_UNAVAILABLE

    def test_the_backstop_still_reports_it_as_unavailable(
        self, closeable, monkeypatch,
    ):
        """The one site that DID catch it keeps its specific message; the
        subclass must not be swallowed by the generic handler below it."""
        import verify_session as _vs

        _root, set_dir = closeable

        def _too_large(*_a, **_kw):
            raise _vs.EvidenceTooLargeError(968_227, 614_400)

        monkeypatch.setattr(_vs, "assemble_evidence", _too_large)
        outcome = run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )
        assert outcome.status == close_backstop.STATUS_UNAVAILABLE
        assert "968227" in outcome.remediation


class TestA4PostRoundDelta:
    """Set 128 S2 -- A4 at the one place that spends money.

    The operator-attested rule: a post-suite fix to TESTS ONLY owes no
    re-verification (A4.1), and a post-suite fix to SHIPPED CODE owes a
    delta-scoped remediation-review rather than an open one (A4.2).
    Before this, ANY post-verification edit staled the stamped row and
    the backstop bought a full unphased round, so the machinery
    contradicted the rule rather than merely omitting it.

    Both tests plant a real post-round edit and then run the real close,
    which is the only way to tell a rule that is enforced from one that
    is merely written down (L-112-1).
    """

    def _anchor_the_round(self, root: Path, set_dir: Path) -> str:
        """Record a completed round whose completion snapshot is NOW."""
        import verify_session as _vs

        tree = _vs.snapshot_worktree_tree(root)
        assert tree is not None
        (set_dir / "s1-rounds.jsonl").write_text(
            json.dumps({
                "event": "round-completed",
                "sessionNumber": 1,
                "verificationRound": 1,
                "phase": "discovery",
                "source": "verify_session_cli",
                "verdict": "VERIFIED",
                "blocking": False,
                "endedLoop": True,
                "worktreeTreeAtCompletion": tree,
            }) + "\n",
            encoding="utf-8",
        )
        return tree

    def test_a4_1_a_test_only_fix_settles_the_close_with_no_round(
        self, closeable, fake_route,
    ):
        """DOES NOT FIRE. The stamped row's work diff HAS moved -- so
        without A4.1 this close buys a metered round -- but every changed
        path is a declared test surface, so the existing verification
        still settles it. The exemption is ledgered, not silent."""
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        self._anchor_the_round(root, set_dir)

        tests_dir = root / "ai_router" / "tests"
        tests_dir.mkdir(parents=True)
        (tests_dir / "test_late_fix.py").write_text(
            "def test_late():\n    assert True\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        assert fake_route.calls == [], (
            "a test-only post-round fix bought a metered verification round"
        )
        ledger = [
            json.loads(line)
            for line in (set_dir / "s1-rounds.jsonl").read_text(
                encoding="utf-8"
            ).splitlines()
            if line.strip()
        ]
        exemptions = [
            r for r in ledger if r.get("event") == "a4-test-only-exemption"
        ]
        assert len(exemptions) == 1, ledger
        assert exemptions[0]["testPaths"] == [
            "ai_router/tests/test_late_fix.py"
        ]

    def test_a4_2_a_shipped_code_fix_routes_a_delta_scoped_review(
        self, closeable, fake_route,
    ):
        """FIRES, but narrowly. A shipped-code post-round fix still owes a
        round -- the carve-out does not reach it -- and that round is the
        delta-scoped remediation-review, recorded as such so the bounded
        totals count it against the right family."""
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        anchor = self._anchor_the_round(root, set_dir)

        shipped = root / "ai_router"
        shipped.mkdir(parents=True, exist_ok=True)
        (shipped / "widget.py").write_text(
            "VALUE = 2  # the post-suite fix\n", encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

        assert outcome.result == "succeeded", outcome.messages
        assert len(fake_route.calls) == 1, (
            "a shipped-code post-round fix must still buy a round"
        )
        prompt = fake_route.calls[0]["prompt"]
        assert "FIX DELTA ONLY" in prompt, (
            "the backstop round was not scoped to the fix delta"
        )
        assert anchor[:12] in prompt
        ledger = [
            json.loads(line)
            for line in (set_dir / "s1-rounds.jsonl").read_text(
                encoding="utf-8"
            ).splitlines()
            if line.strip()
        ]
        backstop_rows = [
            r for r in ledger
            if r.get("source") == "close_session_backstop"
        ]
        assert len(backstop_rows) == 1, ledger
        assert backstop_rows[0]["phase"] == "remediation-review", (
            "a delta-scoped round recorded itself as an unphased one, so "
            "the bounded totals would count it against the wrong family"
        )

    def test_a4_2_round_enforces_remediation_review_coverage(
        self, closeable, monkeypatch,
    ):
        """FIRES. A round that CALLS itself remediation-review must BE
        one. A bare `VERIFIED` that verdicts none of the ledger's prior
        blocking findings is not settlement evidence -- the CLI phase
        refuses it for incomplete fix-verdict coverage, and a backstop
        that skipped that check would have bought the cheap tier AND
        dropped the regression check that defines it."""
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        self._anchor_the_round(root, set_dir)
        # A prior round bearing a blocking finding, so the cross-round
        # ledger numbers an id the delta review owes a verdict for.
        (set_dir / "s1-issues.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 1,
                "verificationVerdict": "ISSUES_FOUND",
                "issues": [{
                    "description": "a prior blocking defect",
                    "category": "Correctness",
                    "severity": "Major",
                }],
            }),
            encoding="utf-8",
        )

        shipped = root / "ai_router"
        shipped.mkdir(parents=True, exist_ok=True)
        (shipped / "widget.py").write_text("VALUE = 2\n", encoding="utf-8")
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        # The reviewer returns a clean token and enumerates nothing.
        bare = FakeBackstopRoute(response="VERIFIED -- looks fine.")
        monkeypatch.setattr(close_backstop, "_default_route", bare)

        outcome = run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )

        assert len(bare.calls) == 1
        prompt = bare.calls[0]["prompt"]
        assert "L1" in prompt, (
            "the delta round carried no cross-round ledger, so nothing "
            "required the prior blocking finding to be re-verdicted"
        )
        assert outcome.status == close_backstop.STATUS_BLOCKING, (
            "an un-enumerated remediation-review settled the close"
        )
        assert "coverage" in outcome.remediation.lower()

    def test_a4_2_round_applies_the_phased_evidence_exclusions(
        self, closeable, monkeypatch,
    ):
        """FIRES. The fix-delta bundle tells the verifier that new defects
        are admissible WITHIN THESE HUNKS, so what lands in the hunks is
        the round's scope. The loop writes its own bookkeeping into the
        tree between phased rounds -- and `record_round_completed` appends
        to the round ledger AFTER taking the snapshot this delta is
        anchored on -- so without the phased exclusions the framework's
        own records arrive as reviewable fix hunks."""
        root, set_dir = closeable
        row = write_stamped_evidence(set_dir)
        Path(os.environ["AI_ROUTER_METRICS_PATH"]).write_text(
            json.dumps(row) + "\n", encoding="utf-8",
        )
        self._anchor_the_round(root, set_dir)

        shipped = root / "ai_router"
        shipped.mkdir(parents=True, exist_ok=True)
        (shipped / "widget.py").write_text(
            "VALUE = 2  # the real post-suite fix\n", encoding="utf-8",
        )
        # Loop bookkeeping written AFTER the anchor, exactly as the
        # framework writes it.
        (set_dir / "s1-issues-round-2.json").write_text(
            json.dumps({"issues": [], "marker": "BOOKKEEPING-MARKER"}),
            encoding="utf-8",
        )
        (set_dir / "s1-acceptance-round-1.json").write_text(
            json.dumps({"marker": "BOOKKEEPING-MARKER"}), encoding="utf-8",
        )
        _land(root, set_dir, _api_disposition(verdict="VERIFIED"))

        route = FakeBackstopRoute()
        monkeypatch.setattr(close_backstop, "_default_route", route)
        run_close_backstop(
            str(set_dir), 1, _api_disposition(verdict="VERIFIED"),
        )

        assert len(route.calls) == 1
        prompt = route.calls[0]["prompt"]
        assert "the real post-suite fix" in prompt, (
            "the shipped-code fix is the whole point of the delta and "
            "must be in the bundle"
        )
        assert "BOOKKEEPING-MARKER" not in prompt, (
            "loop bookkeeping reached the fix-delta hunks, where the "
            "bundle's own heading declares new defects admissible"
        )

    def test_the_backstop_has_no_second_spelling_of_the_phase_assembly(self):
        """STRUCTURAL, and the one that closes the class.

        Rounds 3 and 4 of this session found the same defect twice: the
        backstop MIRRORED the CLI's remediation-review phase piece by
        piece, and each round found a piece missing. Asserting the two
        agree today would only re-assert the instances. What must hold is
        that there is exactly ONE assembly site -- so a piece added to the
        phase later reaches the backstop with no second edit, and cannot
        silently not reach it.
        """
        import inspect

        source = inspect.getsource(close_backstop.run_close_backstop)
        assert "build_phase_round_inputs" in source, (
            "the backstop must read the shared phase assembly"
        )
        for mirrored in (
            "build_phase_framing",
            "assemble_cross_round_ledger_with_ids",
            "assemble_acceptance_block",
            "PHASED_EVIDENCE_SET_EXCLUDES",
        ):
            assert mirrored not in source, (
                f"{mirrored} is assembled a second time inside the "
                "backstop; that is the mirroring this set removed, and it "
                "drifts from the CLI the moment either side changes"
            )
