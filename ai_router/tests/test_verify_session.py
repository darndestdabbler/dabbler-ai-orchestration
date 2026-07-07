"""Layer-1 tests for the Set 083 S1 ``verify_session`` CLI.

Covers the spec'd matrix: evidence assembly shows untracked files;
exclusion defaults; artifact naming across rounds; disposition patch is
idempotent and preserves unrelated fields; blocking-classification
wiring; ``--dry-run`` writes nothing and routes nothing; tier-pin
refusal logic (L-064-7 and its symmetric failure).

No metered calls: the route seam is faked; git operations run against a
throwaway repo in tmp_path.
"""

import argparse
import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import pytest

# Package-qualified import so the test target is unambiguously
# ai_router/verify_session.py (S1 verification round-1 finding). The
# module has no shared cache state, so it needs no conftest aliasing.
from ai_router import verify_session as vs


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

SET_SLUG = "083-verify-session-cli-and-verification-integrity-gate"

SPEC_TEXT = """# Test Spec

## Sessions

### Session 1 of 2: Build the widget

**Steps:**
1. Build it.

**Ends with:** widget built.

---

### Session 2 of 2: Ship the widget

**Steps:**
1. Ship it.
"""


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
    )


@pytest.fixture()
def repo(tmp_path: Path) -> Path:
    """A real throwaway git repo with one commit and a live session set."""
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "test@example.com")
    _git(tmp_path, "config", "user.name", "Test")

    set_dir = tmp_path / "docs" / "session-sets" / SET_SLUG
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text(SPEC_TEXT, encoding="utf-8")
    (set_dir / "session-state.json").write_text(
        json.dumps(
            {
                "schemaVersion": 4,
                "sessionSetName": SET_SLUG,
                "status": "in-progress",
                "sessions": [
                    {
                        "number": 1,
                        "title": "Build the widget",
                        "status": "in-progress",
                        "startedAt": "2026-07-06T09:00:00-04:00",
                        "completedAt": None,
                        "orchestrator": {
                            "engine": "claude-code",
                            "provider": "anthropic",
                        },
                        "verificationVerdict": None,
                    },
                    {
                        "number": 2,
                        "title": "Ship the widget",
                        "status": "not-started",
                        "startedAt": None,
                        "completedAt": None,
                        "orchestrator": None,
                        "verificationVerdict": None,
                    },
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (tmp_path / "tracked.py").write_text("x = 1\n", encoding="utf-8")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-q", "-m", "seed")
    return tmp_path


def _set_dir(repo: Path) -> Path:
    return repo / "docs" / "session-sets" / SET_SLUG


def _args(set_dir: Path, **overrides) -> argparse.Namespace:
    parser = vs._build_arg_parser()
    argv = ["--session-set-dir", str(set_dir)]
    ns = parser.parse_args(argv)
    for key, value in overrides.items():
        setattr(ns, key, value)
    return ns


@dataclass
class FakeRouteResult:
    content: str
    model_name: str = "fake-verifier"
    truncated: bool = False
    total_cost_usd: float = 0.01


@dataclass
class FakeRoute:
    """Injectable route seam recording each invocation."""

    response: str
    calls: list = field(default_factory=list)

    def __call__(self, prompt, session_set, session_number,
                 complexity_hint, max_tier, exclude_providers=None,
                 verification_stamp=None):
        self.calls.append(
            {
                "prompt": prompt,
                "session_set": session_set,
                "session_number": session_number,
                "complexity_hint": complexity_hint,
                "max_tier": max_tier,
                "exclude_providers": exclude_providers,
                "verification_stamp": verification_stamp,
            }
        )
        return FakeRouteResult(content=self.response)


# ---------------------------------------------------------------------------
# Spec excerpt extraction
# ---------------------------------------------------------------------------

class TestSpecExcerpt:
    def test_extracts_the_requested_session_only(self):
        excerpt = vs.extract_spec_excerpt(SPEC_TEXT, 1)
        assert "Build the widget" in excerpt
        assert "Ship the widget" not in excerpt

    def test_extracts_a_later_session_to_end_of_text(self):
        excerpt = vs.extract_spec_excerpt(SPEC_TEXT, 2)
        assert "Ship the widget" in excerpt
        assert "Build the widget" not in excerpt

    def test_falls_back_to_whole_spec_when_heading_missing(self):
        excerpt = vs.extract_spec_excerpt("no headings here", 1)
        assert excerpt == "no headings here"


# ---------------------------------------------------------------------------
# Evidence assembly (untracked visibility + exclusions)
# ---------------------------------------------------------------------------

class TestEvidenceAssembly:
    def test_untracked_files_visible_via_git_status(self, repo: Path):
        (repo / "brand-new-deliverable.py").write_text(
            "y = 2\n", encoding="utf-8"
        )
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        rendered = evidence.as_response_under_review()
        # The untracked file is invisible to git diff but MUST be visible
        # in the bundle via git status --short (L-064-9).
        assert "brand-new-deliverable.py" not in evidence.diff
        assert "brand-new-deliverable.py" in evidence.git_status
        assert "brand-new-deliverable.py" in rendered

    def test_tracked_changes_appear_in_diff(self, repo: Path):
        (repo / "tracked.py").write_text("x = 999\n", encoding="utf-8")
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        assert "x = 999" in evidence.diff

    def test_default_excludes_suppress_generated_bundles(self, repo: Path):
        dist = repo / "dist"
        dist.mkdir()
        (dist / "bundle.js").write_text("generated\n", encoding="utf-8")
        (repo / "real.py").write_text("real = True\n", encoding="utf-8")
        _git(repo, "add", "-A")
        evidence = vs.assemble_evidence(
            _set_dir(repo), 1, "HEAD", vs.DEFAULT_DIFF_EXCLUDES
        )
        assert "real = True" in evidence.diff
        assert "bundle.js" not in evidence.diff

    def test_excludes_are_overridable(self, repo: Path):
        dist = repo / "dist"
        dist.mkdir()
        (dist / "bundle.js").write_text("generated\n", encoding="utf-8")
        _git(repo, "add", "-A")
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        assert "bundle.js" in evidence.diff

    def test_spec_excerpt_lands_in_prompt(self, repo: Path):
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        prompt = vs.build_prompt(
            evidence, 1, 1, template="{original_task}||{original_response}"
        )
        assert "Build the widget" in prompt
        assert "git status --short" in prompt

    def test_conventions_block_prepended(self, repo: Path):
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        prompt = vs.build_prompt(
            evidence, 1, 1,
            conventions="Suite baseline: 100 passed.",
            template="{original_task}||{original_response}",
        )
        assert "Suite baseline: 100 passed." in prompt
        assert prompt.index("Suite baseline") < prompt.index(
            "Build the widget"
        )

    def test_build_diff_pathspecs_shape(self):
        specs = vs.build_diff_pathspecs(["dist", "*.vsix"])
        assert specs == [".", ":(exclude)dist", ":(exclude)*.vsix"]
        assert vs.build_diff_pathspecs([]) == []


# ---------------------------------------------------------------------------
# Artifact naming across rounds
# ---------------------------------------------------------------------------

class TestArtifactNaming:
    def test_round_1_names_omit_the_round_suffix(self, tmp_path: Path):
        assert vs.verification_artifact_path(tmp_path, 3, 1).name == (
            "s3-verification.md"
        )
        assert vs.issues_artifact_path(tmp_path, 3, 1).name == (
            "s3-issues.json"
        )

    def test_later_rounds_carry_the_suffix(self, tmp_path: Path):
        assert vs.verification_artifact_path(tmp_path, 3, 2).name == (
            "s3-verification-round-2.md"
        )
        assert vs.issues_artifact_path(tmp_path, 3, 3).name == (
            "s3-issues-round-3.json"
        )

    def test_resolve_round_infers_next_free_round(self, tmp_path: Path):
        assert vs.resolve_round(tmp_path, 1, None) == 1
        (tmp_path / "s1-verification.md").write_text("r1", encoding="utf-8")
        assert vs.resolve_round(tmp_path, 1, None) == 2
        (tmp_path / "s1-verification-round-2.md").write_text(
            "r2", encoding="utf-8"
        )
        assert vs.resolve_round(tmp_path, 1, None) == 3

    def test_explicit_round_collision_refused(self, tmp_path: Path):
        (tmp_path / "s1-verification.md").write_text("r1", encoding="utf-8")
        with pytest.raises(vs.VerifySessionError, match="never"):
            vs.resolve_round(tmp_path, 1, 1)

    def test_explicit_round_must_be_positive(self, tmp_path: Path):
        with pytest.raises(vs.VerifySessionError, match=">= 1"):
            vs.resolve_round(tmp_path, 1, 0)


# ---------------------------------------------------------------------------
# Disposition patch
# ---------------------------------------------------------------------------

class TestDispositionPatch:
    def test_creates_minimal_record_when_absent(self, tmp_path: Path):
        path = vs.patch_disposition(tmp_path, "VERIFIED")
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data == {
            "verification_method": "api",
            "verification_verdict": "VERIFIED",
        }

    def test_preserves_unrelated_fields_verbatim(self, tmp_path: Path):
        existing = {
            "status": "completed",
            "summary": "did the thing",
            "files_changed": ["a.py"],
            "custom_extension_key": {"nested": True},
            "verification_method": "manual",
            "verification_verdict": "SELF-ATTESTED",
        }
        (tmp_path / "disposition.json").write_text(
            json.dumps(existing), encoding="utf-8"
        )
        vs.patch_disposition(tmp_path, "ISSUES_FOUND")
        data = json.loads(
            (tmp_path / "disposition.json").read_text(encoding="utf-8")
        )
        assert data["status"] == "completed"
        assert data["summary"] == "did the thing"
        assert data["files_changed"] == ["a.py"]
        assert data["custom_extension_key"] == {"nested": True}
        assert data["verification_method"] == "api"
        assert data["verification_verdict"] == "ISSUES_FOUND"

    def test_patch_is_idempotent(self, tmp_path: Path):
        vs.patch_disposition(tmp_path, "VERIFIED")
        first = (tmp_path / "disposition.json").read_text(encoding="utf-8")
        vs.patch_disposition(tmp_path, "VERIFIED")
        second = (tmp_path / "disposition.json").read_text(encoding="utf-8")
        assert first == second

    def test_malformed_disposition_moved_aside_not_eaten(
        self, tmp_path: Path, capsys
    ):
        (tmp_path / "disposition.json").write_text(
            "{not json", encoding="utf-8"
        )
        vs.patch_disposition(tmp_path, "VERIFIED")
        data = json.loads(
            (tmp_path / "disposition.json").read_text(encoding="utf-8")
        )
        assert data["verification_verdict"] == "VERIFIED"
        assert (tmp_path / "disposition.json.malformed").exists()


# ---------------------------------------------------------------------------
# Tier-pin refusal (L-064-7 + symmetric failure)
# ---------------------------------------------------------------------------

class TestTierPin:
    def test_no_pin_no_refusal(self):
        assert vs.check_tier_pin(2, None, 3, False) is None

    def test_round_1_pin_is_always_legal(self):
        assert vs.check_tier_pin(1, 1, 3, False) is None

    def test_substantive_reverify_below_round1_tier_refused(self):
        msg = vs.check_tier_pin(2, 2, 3, False)
        assert msg is not None
        assert "L-064-7" in msg
        assert "--wording-only" in msg

    def test_wording_only_lifts_the_refusal(self):
        assert vs.check_tier_pin(2, 2, 3, True) is None

    def test_pin_at_or_above_round1_tier_is_legal(self):
        assert vs.check_tier_pin(2, 3, 3, False) is None
        assert vs.check_tier_pin(2, 3, 2, False) is None

    def test_unknown_round1_tier_fails_open(self):
        assert vs.check_tier_pin(2, 1, None, False) is None

    def test_round1_verifier_tier_reads_first_matching_row(
        self, tmp_path: Path
    ):
        metrics = tmp_path / "router-metrics.jsonl"
        rows = [
            {"task_type": "session-verification", "session_set": SET_SLUG,
             "session_number": 1, "tier": 3},
            {"task_type": "analysis", "session_set": SET_SLUG,
             "session_number": 1, "tier": 1},
            {"task_type": "session-verification",
             "session_set": f"docs/session-sets/{SET_SLUG}",
             "session_number": 1, "tier": 2},
            {"task_type": "session-verification", "session_set": SET_SLUG,
             "session_number": 2, "tier": 1},
        ]
        metrics.write_text(
            "\n".join(json.dumps(r) for r in rows) + "\n",
            encoding="utf-8",
        )
        # Rows append chronologically, so round 1 is the FIRST matching
        # session-verification row -- a later (round-2) row at a lower
        # tier must NOT lower the guard's floor (S1 verification round-1
        # finding). Path-shaped session_set values match on the trailing
        # slug component.
        assert vs.round1_verifier_tier(metrics, SET_SLUG, 1) == 3
        assert vs.round1_verifier_tier(metrics, SET_SLUG, 2) == 1
        assert vs.round1_verifier_tier(metrics, "other-set", 1) is None

    def test_round1_tier_not_lowered_by_a_later_round(self, tmp_path: Path):
        metrics = tmp_path / "router-metrics.jsonl"
        rows = [
            {"task_type": "session-verification", "session_set": SET_SLUG,
             "session_number": 1, "tier": 3},
            {"task_type": "session-verification", "session_set": SET_SLUG,
             "session_number": 1, "tier": 2},  # a later, lower-tier round
        ]
        metrics.write_text(
            "\n".join(json.dumps(r) for r in rows) + "\n",
            encoding="utf-8",
        )
        assert vs.round1_verifier_tier(metrics, SET_SLUG, 1) == 3
        # And the guard therefore refuses a pin at the round-2 tier.
        assert vs.check_tier_pin(3, 2, 3, False) is not None

    def test_round1_verifier_tier_tolerates_garbage(self, tmp_path: Path):
        metrics = tmp_path / "router-metrics.jsonl"
        metrics.write_text(
            'not json\n{"task_type": "session-verification", '
            f'"session_set": "{SET_SLUG}", "session_number": 1, '
            '"tier": true}\n',
            encoding="utf-8",
        )
        # bool is not an int tier; unreadable lines skipped.
        assert vs.round1_verifier_tier(metrics, SET_SLUG, 1) is None
        assert vs.round1_verifier_tier(
            tmp_path / "missing.jsonl", SET_SLUG, 1
        ) is None

    def test_unreadable_round1_row_fails_open_not_through(
        self, tmp_path: Path
    ):
        # S1 verification round-2 finding: a malformed round-1 row must
        # yield None (fail open), NOT fall through to the later round-2
        # row's tier -- that would enforce a later round's tier as the
        # floor, the exact drift the guard exists to refuse.
        metrics = tmp_path / "router-metrics.jsonl"
        rows = [
            {"task_type": "session-verification", "session_set": SET_SLUG,
             "session_number": 1, "tier": "three"},  # round 1, unreadable
            {"task_type": "session-verification", "session_set": SET_SLUG,
             "session_number": 1, "tier": 2},        # round 2, readable
        ]
        metrics.write_text(
            "\n".join(json.dumps(r) for r in rows) + "\n",
            encoding="utf-8",
        )
        assert vs.round1_verifier_tier(metrics, SET_SLUG, 1) is None

    def test_run_refuses_pinned_substantive_round2(
        self, repo: Path, monkeypatch, capsys
    ):
        set_dir = _set_dir(repo)
        (set_dir / "s1-verification.md").write_text("r1", encoding="utf-8")
        metrics = repo / "metrics.jsonl"
        metrics.write_text(
            json.dumps(
                {"task_type": "session-verification",
                 "session_set": SET_SLUG,
                 "session_number": 1, "tier": 3}
            ) + "\n",
            encoding="utf-8",
        )
        monkeypatch.setattr(vs, "_resolve_metrics_path", lambda: metrics)
        fake = FakeRoute(response="VERIFIED -- fine.")
        rc = vs.run(_args(set_dir, max_tier=2), route_fn=fake)
        assert rc == vs.EXIT_USAGE
        assert fake.calls == []  # refused BEFORE any metered call
        assert "L-064-7" in capsys.readouterr().err

    def test_run_allows_pinned_round2_with_wording_only(
        self, repo: Path, monkeypatch
    ):
        set_dir = _set_dir(repo)
        (set_dir / "s1-verification.md").write_text("r1", encoding="utf-8")
        monkeypatch.setattr(
            vs, "_resolve_metrics_path",
            lambda: (_ for _ in ()).throw(AssertionError(
                "metrics must not be consulted under --wording-only"
            )),
        )
        fake = FakeRoute(response="VERIFIED -- wording fixed.")
        rc = vs.run(
            _args(set_dir, max_tier=2, wording_only=True), route_fn=fake
        )
        assert rc == vs.EXIT_OK
        assert len(fake.calls) == 1
        assert fake.calls[0]["max_tier"] == 2


# ---------------------------------------------------------------------------
# run(): dry-run, blocking wiring, artifacts, state errors
# ---------------------------------------------------------------------------

class TestRun:
    def test_dry_run_writes_nothing_and_routes_nothing(
        self, repo: Path, capsys
    ):
        set_dir = _set_dir(repo)
        before = sorted(p.name for p in set_dir.iterdir())
        fake = FakeRoute(response="VERIFIED")
        rc = vs.run(_args(set_dir, dry_run=True), route_fn=fake)
        assert rc == vs.EXIT_OK
        assert fake.calls == []
        after = sorted(p.name for p in set_dir.iterdir())
        assert before == after
        assert "DRY RUN" in capsys.readouterr().out

    def test_verified_round_writes_raw_artifact_and_patches_disposition(
        self, repo: Path, capsys
    ):
        set_dir = _set_dir(repo)
        response = (
            "VERIFIED -- I checked the diff against the plan; the widget "
            "builds and the tests cover it."
        )
        fake = FakeRoute(response=response)
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_OK
        # Raw artifact written verbatim, never edited.
        assert (set_dir / "s1-verification.md").read_text(
            encoding="utf-8"
        ) == response
        # Clean round: NO issues artifact (presence means findings).
        assert not (set_dir / "s1-issues.json").exists()
        data = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert data["verification_method"] == "api"
        assert data["verification_verdict"] == "VERIFIED"
        out = capsys.readouterr().out
        assert "VERIFIED" in out
        assert "close_session" in out  # the printed next action

    def test_blocking_round_exits_4_and_writes_issues(
        self, repo: Path, capsys
    ):
        set_dir = _set_dir(repo)
        response = (
            "ISSUES FOUND\n\n"
            "- **Issue 1:** The widget is never wired in.\n"
            "  - **Category:** Correctness\n"
            "  - **Severity:** Major\n"
        )
        fake = FakeRoute(response=response)
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_BLOCKING
        envelope = json.loads(
            (set_dir / "s1-issues.json").read_text(encoding="utf-8")
        )
        assert envelope["schemaVersion"] == 1
        assert envelope["sessionNumber"] == 1
        assert envelope["verificationRound"] == 1
        assert envelope["verificationVerdict"] == "ISSUES_FOUND"
        assert len(envelope["issues"]) == 1
        assert envelope["issues"][0]["severity"] == "Major"
        data = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert data["verification_verdict"] == "ISSUES_FOUND"
        out = capsys.readouterr().out
        assert "BLOCKING" in out
        assert "--round 2" in out  # the printed re-verify command

    def test_minor_only_round_is_non_blocking(self, repo: Path, capsys):
        set_dir = _set_dir(repo)
        response = (
            "ISSUES FOUND\n\n"
            "- **Issue 1:** A comment typo.\n"
            "  - **Category:** Completeness\n"
            "  - **Severity:** Minor\n"
        )
        fake = FakeRoute(response=response)
        rc = vs.run(_args(set_dir), route_fn=fake)
        # L-071-1: a Minor-only round never opens a remediation loop.
        assert rc == vs.EXIT_OK
        # The findings ARE persisted (the round bore findings)...
        assert (set_dir / "s1-issues.json").exists()
        # ...but the printed next action is Step 8, not a re-verify.
        assert "close_session" in capsys.readouterr().out

    def test_second_round_artifacts_get_round_suffix(self, repo: Path):
        set_dir = _set_dir(repo)
        (set_dir / "s1-verification.md").write_text("r1", encoding="utf-8")
        fake = FakeRoute(response="VERIFIED -- fixes confirmed.")
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_OK
        assert (set_dir / "s1-verification-round-2.md").exists()
        # Round 1 artifact untouched.
        assert (set_dir / "s1-verification.md").read_text(
            encoding="utf-8"
        ) == "r1"

    def test_no_in_flight_session_is_a_state_error(
        self, repo: Path, capsys
    ):
        set_dir = _set_dir(repo)
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        state["sessions"][0]["status"] = "complete"
        state["sessions"][0]["completedAt"] = "2026-07-06T10:00:00-04:00"
        (set_dir / "session-state.json").write_text(
            json.dumps(state), encoding="utf-8"
        )
        fake = FakeRoute(response="VERIFIED")
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_STATE
        assert fake.calls == []
        assert "in flight" in capsys.readouterr().err

    def test_missing_set_dir_is_a_state_error(self, tmp_path: Path):
        ns = _args(tmp_path / "nope")
        assert vs.run(ns, route_fn=FakeRoute(response="x")) == vs.EXIT_STATE

    def test_route_failure_exits_6_and_writes_nothing(
        self, repo: Path, capsys
    ):
        set_dir = _set_dir(repo)

        def exploding_route(*a, **k):
            raise RuntimeError("provider 529")

        rc = vs.run(_args(set_dir), route_fn=exploding_route)
        assert rc == vs.EXIT_ROUTE_FAILED
        assert not (set_dir / "s1-verification.md").exists()
        assert not (set_dir / "disposition.json").exists()
        assert "escalation ladder" in capsys.readouterr().err

    def test_route_receives_session_metadata_and_prompt(self, repo: Path):
        set_dir = _set_dir(repo)
        fake = FakeRoute(response="VERIFIED -- checked.")
        vs.run(_args(set_dir), route_fn=fake)
        call = fake.calls[0]
        assert call["session_number"] == 1
        assert call["complexity_hint"] == vs.DEFAULT_COMPLEXITY_HINT
        assert call["max_tier"] is None
        assert "Build the widget" in call["prompt"]  # spec excerpt
        assert "adversarial" in call["prompt"].lower()  # real template

    def test_truncated_result_warns(self, repo: Path, capsys):
        set_dir = _set_dir(repo)

        def truncated_route(*a, **k):
            return FakeRouteResult(
                content="VERIFIED -- checked everyth", truncated=True
            )

        rc = vs.run(_args(set_dir), route_fn=truncated_route)
        assert rc == vs.EXIT_OK
        assert "TRUNCATED" in capsys.readouterr().out
