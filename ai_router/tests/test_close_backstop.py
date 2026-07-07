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
force / manual-verify interplay unchanged (neither triggers the
backstop); evidence-present and Minor-only skips; the working-tree
gate tolerating the backstop's own mid-close artifacts; the
pre-session diff base.

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
                 verification_stamp=None):
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
        row = write_stamped_evidence(set_dir, content="ISSUES_FOUND\n")
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
        row = write_stamped_evidence(set_dir, content="ISSUES_FOUND\n")
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

    def test_force_path_never_triggers_the_backstop(
        self, closeable, fake_route, tmp_path, monkeypatch,
    ):
        """--force bypasses bookkeeping gates, not evidence: no backstop
        call is metered on the incident-recovery path, and the
        verification-integrity check still refuses the unverified
        close — the floor holds by refusal, not by surprise spend."""
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
        assert outcome.result == "gate_failed"
        assert fake_route.calls == []

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
