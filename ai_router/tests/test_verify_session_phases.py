"""Layer-1 tests for the Set 096 S2 phased verification loop.

Covers the spec'd matrix: phase config loading (defaults, clamping,
fail-open); fan-out artifact naming (stamp-shape compliant); the phase
framings (coverage/scope only — the template file is never touched);
``parse_fix_verdicts`` grammar; the working-tree snapshot + tree-to-tree
fix delta (including the untracked-file symmetry the tree-to-tree form
exists for); discovery-baseline lookup; the supplementary
prior-findings block; and the ``run()`` integration for all three
phases plus compat (no ``--phase`` = the classic single-call behavior).

No metered calls: the route seam is faked; git operations run against a
throwaway repo in tmp_path.
"""

import argparse
import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from ai_router import verify_session as vs
from ai_router.verification import (
    VerificationUnavailableError,
    parse_fix_verdicts,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures (same throwaway-repo pattern as test_verify_session)
# ---------------------------------------------------------------------------

SET_SLUG = "096-consequence-graded-phased-verification-test"

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
                        "startedAt": "2026-07-12T09:00:00-04:00",
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
class FakeMultiRoute:
    """Injectable route seam yielding one scripted response per call.

    Each entry of ``responses`` is a response string, an Exception to
    raise, or a FakeRouteResult (e.g. a truncated one). The last entry
    repeats when calls outnumber entries.
    """

    responses: list
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
        index = min(len(self.calls) - 1, len(self.responses) - 1)
        scripted = self.responses[index]
        if isinstance(scripted, Exception):
            raise scripted
        if isinstance(scripted, FakeRouteResult):
            return scripted
        return FakeRouteResult(content=scripted)


VERIFIED_RESPONSE = (
    "VERIFIED\n\nChecked the diff against the spec excerpt; nothing to "
    "break."
)

BLOCKING_RESPONSE = """ISSUES FOUND

Issue 1: The widget is missing its safety catch.
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** every user who drops the widget loses a finger;
  probable because the widget ships without a catch.
- **Details:** the spec requires a catch; the diff has none.
"""

BLOCKING_RESPONSE_B = """ISSUES FOUND

Issue 1: The widget's paint is lead-based.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** typical users touch the widget daily; lead paint
  is likely to poison them.
- **Details:** the spec requires non-toxic paint; the diff specifies lead.
"""


def _phase_config(monkeypatch, fan_out=2, diversity="same-model"):
    monkeypatch.setattr(
        vs, "load_discovery_phase_config", lambda config=None: (fan_out, diversity)
    )


# ---------------------------------------------------------------------------
# Phase config loading
# ---------------------------------------------------------------------------

class TestPhaseConfig:
    def test_defaults_when_block_absent(self):
        assert vs.load_discovery_phase_config({}) == (
            vs.DISCOVERY_FAN_OUT_DEFAULT,
            vs.PROVIDER_DIVERSITY_DEFAULT,
        )

    def test_reads_configured_values(self):
        cfg = {
            "verification": {
                "discovery": {
                    "fan_out": 3,
                    "provider_diversity": "cross-provider",
                }
            }
        }
        assert vs.load_discovery_phase_config(cfg) == (3, "cross-provider")

    def test_fan_out_clamped_to_cap(self):
        cfg = {"verification": {"discovery": {"fan_out": 99}}}
        fan_out, _ = vs.load_discovery_phase_config(cfg)
        assert fan_out == vs._DISCOVERY_FAN_OUT_CAP

    def test_malformed_values_fall_back(self):
        cfg = {
            "verification": {
                "discovery": {
                    "fan_out": "two",
                    "provider_diversity": "coin-flip",
                }
            }
        }
        assert vs.load_discovery_phase_config(cfg) == (
            vs.DISCOVERY_FAN_OUT_DEFAULT,
            vs.PROVIDER_DIVERSITY_DEFAULT,
        )

    def test_bool_fan_out_is_not_an_int(self):
        cfg = {"verification": {"discovery": {"fan_out": True}}}
        fan_out, _ = vs.load_discovery_phase_config(cfg)
        assert fan_out == vs.DISCOVERY_FAN_OUT_DEFAULT

    def test_shipped_config_carries_the_s1_values(self):
        # The repo's router-config.yaml seeds the S1 memo's measured
        # recommendation (spec step 4).
        import yaml

        config_path = (
            Path(vs.__file__).resolve().parent / "router-config.yaml"
        )
        config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        assert vs.load_discovery_phase_config(config) == (2, "same-model")
        assert vs.load_discovery_min_output_tokens(config) == 32000

    def test_min_output_tokens_defaults_and_fails_open(self):
        assert vs.load_discovery_min_output_tokens({}) == (
            vs.DISCOVERY_MIN_OUTPUT_TOKENS_DEFAULT
        )
        malformed = {
            "verification": {"discovery": {"min_output_tokens": "lots"}}
        }
        assert vs.load_discovery_min_output_tokens(malformed) == (
            vs.DISCOVERY_MIN_OUTPUT_TOKENS_DEFAULT
        )


# ---------------------------------------------------------------------------
# Fan-out artifact naming
# ---------------------------------------------------------------------------

class TestFanoutArtifactNaming:
    def test_round_1_sibling_shape(self, tmp_path: Path):
        path = vs.fanout_artifact_path(tmp_path, 2, 1, 2)
        assert path.name == "s2-verification-fanout-2.md"

    def test_later_round_sibling_shape(self, tmp_path: Path):
        path = vs.fanout_artifact_path(tmp_path, 1, 3, 2)
        assert path.name == "s1-verification-round-3-fanout-2.md"

    def test_sibling_keeps_the_stamp_validator_shape(self, tmp_path: Path):
        # validate_stamped_row check #6 requires s<N>-verification*.md.
        path = vs.fanout_artifact_path(tmp_path, 2, 1, 3)
        assert path.name.startswith("s2-verification")
        assert path.name.endswith(".md")

    def test_sibling_is_invisible_to_resolve_round(self, tmp_path: Path):
        # A fan-out sibling must not advance the round counter.
        vs.fanout_artifact_path(tmp_path, 1, 1, 2).write_text(
            "x", encoding="utf-8"
        )
        assert vs.resolve_round(tmp_path, 1, None) == 1


# ---------------------------------------------------------------------------
# Phase framings
# ---------------------------------------------------------------------------

class TestPhaseFraming:
    def test_no_phase_is_empty(self):
        assert vs.build_phase_framing(None) == ""

    def test_discovery_framing_demands_exhaustive_enumeration(self):
        framing = vs.build_phase_framing(vs.PHASE_DISCOVERY)
        assert "INITIAL DISCOVERY" in framing
        assert "EVERY severity" in framing
        assert "discovery raises COVERAGE, never severity" in framing

    def test_supplementary_framing_forbids_re_reporting(self):
        framing = vs.build_phase_framing(vs.PHASE_SUPPLEMENTARY)
        assert "SUPPLEMENTARY DISCOVERY" in framing
        assert "Do NOT re-report" in framing

    def test_remediation_review_framing_prescribes_fix_verdicts(self):
        framing = vs.build_phase_framing(vs.PHASE_REMEDIATION_REVIEW)
        assert "FIX DELTA ONLY" in framing
        assert "fix-accepted | fix-rejected | accepted-with-modification" \
            in framing
        assert "ONLY within the fix hunks" in framing

    def test_framing_rides_in_task_slot_never_the_template(self, repo: Path):
        # The canonical template must stay byte-identical (the Set 084 F3
        # pin); the framing lands in the Original Task slot instead.
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", [])
        framing = vs.build_phase_framing(vs.PHASE_DISCOVERY)
        prompt = vs.build_prompt(evidence, 1, 1, framing=framing)
        assert "INITIAL DISCOVERY" in prompt
        template_text = vs.load_verification_template()
        assert "INITIAL DISCOVERY" not in template_text


# ---------------------------------------------------------------------------
# parse_fix_verdicts
# ---------------------------------------------------------------------------

class TestParseFixVerdicts:
    def test_parses_the_prescribed_form(self):
        text = (
            "VERIFIED\n\n"
            "- Fix verdict: F1 ledger fail-open -- fix-accepted\n"
            "- Fix verdict: F2 missing catch -- fix-rejected\n"
            "- Fix verdict: F3 wording -- accepted-with-modification\n"
        )
        verdicts = parse_fix_verdicts(text)
        assert [v["verdict"] for v in verdicts] == [
            "fix-accepted", "fix-rejected", "accepted-with-modification",
        ]
        assert verdicts[0]["finding"] == "F1 ledger fail-open"

    def test_tolerates_emphasis_and_separator_drift(self):
        text = (
            "**Fix verdict:** F1 the ledger — **fix-accepted**\n"
            "* Fix Verdict - F2: catch: fix-rejected.\n"
        )
        verdicts = parse_fix_verdicts(text)
        assert [v["verdict"] for v in verdicts] == [
            "fix-accepted", "fix-rejected",
        ]

    def test_empty_and_unrelated_text_parse_to_nothing(self):
        assert parse_fix_verdicts("") == []
        assert parse_fix_verdicts(VERIFIED_RESPONSE) == []
        # Mid-prose mention of the token is not a verdict line.
        assert parse_fix_verdicts(
            "The remediation was fix-accepted in spirit."
        ) == []

    def test_unnamed_finding_gets_a_placeholder(self):
        verdicts = parse_fix_verdicts("- Fix verdict: -- fix-accepted\n")
        assert verdicts == [
            {"finding": "(unnamed finding)", "verdict": "fix-accepted"}
        ]

    def test_duplicate_of_parses_with_target(self):
        verdicts = parse_fix_verdicts(
            "- Fix verdict: L5 same defect, other wording -- "
            "duplicate-of L2\n"
        )
        assert verdicts == [{
            "finding": "L5 same defect, other wording",
            "verdict": "duplicate-of",
            "duplicateOf": "L2",
            "ledgerId": "L5",
        }]


# ---------------------------------------------------------------------------
# Worktree snapshot + tree-to-tree fix delta
# ---------------------------------------------------------------------------

class TestSnapshotAndFixDelta:
    def test_snapshot_captures_tracked_and_untracked(self, repo: Path):
        (repo / "untracked.txt").write_text("u\n", encoding="utf-8")
        tree = vs.snapshot_worktree_tree(repo)
        assert tree
        listed = subprocess.run(
            ["git", "-C", str(repo), "ls-tree", "-r", "--name-only", tree],
            capture_output=True, check=True,
        ).stdout.decode()
        assert "tracked.py" in listed
        assert "untracked.txt" in listed

    def test_snapshot_leaves_index_and_worktree_untouched(self, repo: Path):
        (repo / "untracked.txt").write_text("u\n", encoding="utf-8")
        vs.snapshot_worktree_tree(repo)
        status = subprocess.run(
            ["git", "-C", str(repo), "status", "--short"],
            capture_output=True, check=True,
        ).stdout.decode()
        # Still untracked -- the snapshot never staged it in the real index.
        assert "?? untracked.txt" in status

    def test_fix_delta_shows_only_post_snapshot_changes(self, repo: Path):
        set_dir = _set_dir(repo)
        # Session work BEFORE the snapshot: a tracked edit and a new file
        # that both must NOT appear in the fix delta.
        (repo / "tracked.py").write_text("x = 2\n", encoding="utf-8")
        (repo / "pre_existing_untracked.txt").write_text(
            "already here\n", encoding="utf-8"
        )
        baseline = vs.snapshot_worktree_tree(repo)
        # The remediation: one edit, one new file.
        (repo / "tracked.py").write_text("x = 3\n", encoding="utf-8")
        (repo / "added_by_fix.txt").write_text("new\n", encoding="utf-8")

        evidence = vs.assemble_fix_delta_evidence(set_dir, 1, baseline, [])
        assert "x = 3" in evidence.diff
        assert "added_by_fix.txt" in evidence.diff
        assert "new" in evidence.diff  # the added file's CONTENT rides along
        # The pre-snapshot state is the baseline, not a change: the
        # untracked-at-snapshot file must NOT read as deleted (the bug the
        # tree-to-tree form exists to avoid) or as added.
        assert "pre_existing_untracked" not in evidence.diff
        assert evidence.diff_heading and "FIX DELTA ONLY" in evidence.diff_heading

    def test_fix_delta_respects_excludes(self, repo: Path):
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        bundle_dir = repo / "nested" / "dist"
        bundle_dir.mkdir(parents=True)
        (bundle_dir / "bundle.js").write_text("generated\n", encoding="utf-8")
        (repo / "real.py").write_text("y = 1\n", encoding="utf-8")
        evidence = vs.assemble_fix_delta_evidence(
            set_dir, 1, baseline, ["dist"]
        )
        assert "real.py" in evidence.diff
        assert "bundle.js" not in evidence.diff

    def test_find_discovery_baseline_scans_latest_first(self, tmp_path: Path):
        (tmp_path / "s1-issues.json").write_text(
            json.dumps({"issues": [], "discoveryBaselineTree": "aaa111"}),
            encoding="utf-8",
        )
        (tmp_path / "s1-issues-round-2.json").write_text(
            json.dumps({"issues": [], "discoveryBaselineTree": "bbb222"}),
            encoding="utf-8",
        )
        assert vs.find_discovery_baseline_tree(tmp_path, 1, 3) == (
            2, "bbb222",
        )

    def test_find_discovery_baseline_skips_rounds_without_field(
        self, tmp_path: Path
    ):
        (tmp_path / "s1-issues.json").write_text(
            json.dumps({"issues": [], "discoveryBaselineTree": "aaa111"}),
            encoding="utf-8",
        )
        # A remediation-review round's envelope carries no baseline.
        (tmp_path / "s1-issues-round-2.json").write_text(
            json.dumps({"issues": []}), encoding="utf-8",
        )
        assert vs.find_discovery_baseline_tree(tmp_path, 1, 3) == (
            1, "aaa111",
        )

    def test_find_discovery_baseline_none_when_absent(self, tmp_path: Path):
        assert vs.find_discovery_baseline_tree(tmp_path, 1, 2) is None


# ---------------------------------------------------------------------------
# Supplementary prior-findings block
# ---------------------------------------------------------------------------

class TestPriorFindingsBlock:
    def test_empty_when_no_prior_envelopes(self, tmp_path: Path):
        assert vs.assemble_prior_findings_block(tmp_path, 1, 2) == ""

    def test_renders_prior_findings_with_do_not_re_report(
        self, tmp_path: Path
    ):
        (tmp_path / "s1-issues.json").write_text(
            json.dumps({
                "issues": [
                    {
                        "description": "The widget is missing its catch.",
                        "severity": "Major",
                        "failureScenario": "users lose fingers",
                    }
                ]
            }),
            encoding="utf-8",
        )
        block = vs.assemble_prior_findings_block(tmp_path, 1, 2)
        assert "DO NOT re-report" in block
        assert "missing its catch" in block
        assert "[Major]" in block

    def test_unreadable_envelope_reported_not_silent(self, tmp_path: Path):
        (tmp_path / "s1-issues.json").write_text(
            "{not json", encoding="utf-8"
        )
        block = vs.assemble_prior_findings_block(tmp_path, 1, 2)
        assert "unreadable" in block


# ---------------------------------------------------------------------------
# run() integration: discovery fan-out
# ---------------------------------------------------------------------------

class TestRunDiscovery:
    def test_fan_out_routes_k_identical_calls_and_merges(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=2)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([BLOCKING_RESPONSE, BLOCKING_RESPONSE_B])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        assert len(fake.calls) == 2
        assert fake.calls[0]["prompt"] == fake.calls[1]["prompt"]
        # Raised default complexity on a phase round.
        assert fake.calls[0]["complexity_hint"] == vs.PHASE_COMPLEXITY_HINT
        # Per-call artifacts, per-call stamps binding each artifact.
        assert (set_dir / "s1-verification.md").exists()
        assert (set_dir / "s1-verification-fanout-2.md").exists()
        stamp_paths = {
            c["verification_stamp"]["artifact_path"] for c in fake.calls
        }
        assert len(stamp_paths) == 2
        # One merged envelope annotated per call.
        envelope = json.loads(
            (set_dir / "s1-issues.json").read_text(encoding="utf-8")
        )
        assert envelope["phase"] == "discovery"
        assert envelope["verificationVerdict"] == "ISSUES_FOUND"
        assert [i["discoveryCall"] for i in envelope["issues"]] == [1, 2]
        assert envelope.get("discoveryBaselineTree")

    def test_discovery_prompt_carries_the_framing(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=1)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        assert "INITIAL DISCOVERY" in fake.calls[0]["prompt"]

    def test_clean_fan_out_writes_no_envelope(self, repo: Path, monkeypatch):
        _phase_config(monkeypatch, fan_out=2)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([VERIFIED_RESPONSE, VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        assert not (set_dir / "s1-issues.json").exists()

    def test_one_blocking_call_blocks_the_merged_round(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=2)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([VERIFIED_RESPONSE, BLOCKING_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        envelope = json.loads(
            (set_dir / "s1-issues.json").read_text(encoding="utf-8")
        )
        assert envelope["verificationVerdict"] == "ISSUES_FOUND"

    def test_sibling_failure_degrades_loudly_not_fatally(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch, fan_out=2)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute(
            [BLOCKING_RESPONSE, RuntimeError("provider outage")]
        )
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING  # call 1's findings stand
        assert "reduced-fan-out" in capsys.readouterr().err
        assert (set_dir / "s1-verification.md").exists()
        assert not (set_dir / "s1-verification-fanout-2.md").exists()

    def test_sibling_truncation_drops_that_call_only(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch, fan_out=2)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([
            VERIFIED_RESPONSE,
            FakeRouteResult(content="partial...", truncated=True),
        ])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        assert "TRUNCATED" in capsys.readouterr().err
        assert not (set_dir / "s1-verification-fanout-2.md").exists()

    def test_first_call_failure_keeps_the_hard_exit(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=2)
        fake = FakeMultiRoute([RuntimeError("boom")])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_ROUTE_FAILED

    def test_fanout_collision_refused_up_front(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=2)
        set_dir = _set_dir(repo)
        (set_dir / "s1-verification-fanout-2.md").write_text(
            "old", encoding="utf-8"
        )
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY, round_number=1),
            route_fn=fake,
        )
        assert code == vs.EXIT_USAGE
        assert fake.calls == []


# ---------------------------------------------------------------------------
# run() integration: supplementary
# ---------------------------------------------------------------------------

def _seed_discovery_round(set_dir: Path, baseline_tree: str = "") -> None:
    """A completed round-1 discovery: raw artifact + findings envelope."""
    (set_dir / "s1-verification.md").write_text(
        BLOCKING_RESPONSE, encoding="utf-8"
    )
    envelope = {
        "schemaVersion": 1,
        "sessionNumber": 1,
        "verificationRound": 1,
        "verificationVerdict": "ISSUES_FOUND",
        "phase": "discovery",
        "issues": [
            {
                "description": "The widget is missing its safety catch.",
                "severity": "Major",
                "failureScenario": "users lose fingers",
            }
        ],
    }
    if baseline_tree:
        envelope["discoveryBaselineTree"] = baseline_tree
    (set_dir / "s1-issues.json").write_text(
        json.dumps(envelope, indent=2), encoding="utf-8"
    )


class TestRunSupplementary:
    def test_requires_a_prior_findings_envelope(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_SUPPLEMENTARY),
            route_fn=fake,
        )
        assert code == vs.EXIT_USAGE
        assert fake.calls == []

    def test_single_call_with_critic_block_and_no_ledger(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_discovery_round(set_dir)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        # A clean critic pass never settles the discovery blockers: the
        # ROUND is clean but the SESSION stays blocking (exit 4).
        assert code == vs.EXIT_BLOCKING
        assert len(fake.calls) == 1
        prompt = fake.calls[0]["prompt"]
        assert "SUPPLEMENTARY DISCOVERY" in prompt
        assert "DO NOT re-report" in prompt
        assert "missing its safety catch" in prompt
        # The supplementary pass replaces the ledger with the critic block.
        assert "Cross-round issue ledger" not in prompt
        assert (set_dir / "s1-verification-round-2.md").exists()

    def test_cross_provider_preference_extends_exclusions(
        self, repo: Path, monkeypatch, tmp_path: Path
    ):
        _phase_config(monkeypatch, diversity="cross-provider")
        set_dir = _set_dir(repo)
        _seed_discovery_round(set_dir)
        metrics = tmp_path / "metrics.jsonl"
        metrics.write_text(
            json.dumps({
                "task_type": "session-verification",
                "session_number": 1,
                "session_set": SET_SLUG,
                "model": "gpt-5-4",
                "tier": 3,
            }) + "\n",
            encoding="utf-8",
        )
        monkeypatch.setattr(vs, "_resolve_metrics_path", lambda: metrics)
        import ai_router.orchestrator_identity as oi
        monkeypatch.setattr(
            oi, "resolve_model_provider",
            lambda model, registry=None: "openai",
        )
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING  # discovery blockers still stand
        assert sorted(fake.calls[0]["exclude_providers"]) == [
            "anthropic", "openai",
        ]

    def test_cross_provider_preference_degrades_loudly(
        self, repo: Path, monkeypatch, tmp_path: Path, capsys
    ):
        _phase_config(monkeypatch, diversity="cross-provider")
        set_dir = _set_dir(repo)
        _seed_discovery_round(set_dir)
        metrics = tmp_path / "metrics.jsonl"
        metrics.write_text(
            json.dumps({
                "task_type": "session-verification",
                "session_number": 1,
                "session_set": SET_SLUG,
                "model": "gpt-5-4",
            }) + "\n",
            encoding="utf-8",
        )
        monkeypatch.setattr(vs, "_resolve_metrics_path", lambda: metrics)
        import ai_router.orchestrator_identity as oi
        monkeypatch.setattr(
            oi, "resolve_model_provider",
            lambda model, registry=None: "openai",
        )
        fake = FakeMultiRoute([
            VerificationUnavailableError("only two families"),
            VERIFIED_RESPONSE,
        ])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING  # discovery blockers still stand
        assert len(fake.calls) == 2
        assert fake.calls[1]["exclude_providers"] == ["anthropic"]
        assert "degrading to the base" in capsys.readouterr().err

    def test_clean_supplementary_never_settles_prior_blockers(
        self, repo: Path, monkeypatch, capsys
    ):
        # S2 verification round 1 (gate hole): a clean completeness-critic
        # round must not upgrade the SESSION disposition to VERIFIED while
        # discovery blockers stand — the round verdict stays VERIFIED, the
        # session verdict fails closed to ISSUES_FOUND, and the exit code
        # signals the session is still blocking.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_discovery_round(set_dir)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        disposition = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert disposition["verification_verdict"] == "ISSUES_FOUND"
        out = capsys.readouterr().out
        assert "still stand" in out
        assert "--phase remediation-review" in out

    def test_clean_supplementary_with_no_prior_blockers_stays_clean(
        self, repo: Path, monkeypatch
    ):
        # A prior round with only Minor findings is non-blocking: a clean
        # supplementary pass then keeps the VERIFIED session verdict.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        (set_dir / "s1-verification.md").write_text(
            "ISSUES FOUND\n\nIssue 1: wording nit.\n- **Severity:** Minor\n",
            encoding="utf-8",
        )
        (set_dir / "s1-issues.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 1,
                "verificationVerdict": "ISSUES_FOUND",
                "issues": [
                    {"description": "wording nit", "severity": "Minor"}
                ],
            }),
            encoding="utf-8",
        )
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        disposition = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert disposition["verification_verdict"] == "VERIFIED"


# ---------------------------------------------------------------------------
# run() integration: remediation-review
# ---------------------------------------------------------------------------

FIX_REVIEW_CLEAN = (
    "VERIFIED\n\n"
    "- Fix verdict: missing safety catch -- fix-accepted\n"
)

FIX_REVIEW_REJECTED = """ISSUES FOUND

- Fix verdict: missing safety catch -- fix-rejected

Issue 1: The catch was added but never engages.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** the catch is decorative; every drop still costs a
  finger, which is the original probable scenario unchanged.
- **Details:** the fix hunk adds the catch without wiring the latch.
"""


class TestRunRemediationReview:
    def test_requires_a_recorded_baseline(self, repo: Path, monkeypatch):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_discovery_round(set_dir)  # envelope WITHOUT a baseline
        fake = FakeMultiRoute([FIX_REVIEW_CLEAN])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_USAGE
        assert fake.calls == []

    def test_reviews_the_fix_delta_with_the_ledger(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        # Pre-snapshot session work (must NOT ride in the fix delta).
        (repo / "tracked.py").write_text("x = 2\n", encoding="utf-8")
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_discovery_round(set_dir, baseline_tree=baseline)
        # The orchestrator's settlement assertion for round 1.
        (set_dir / "s1-remediation-round-1.md").write_text(
            "Added the safety catch.", encoding="utf-8"
        )
        # The remediation itself.
        (repo / "catch.py").write_text("engaged = True\n", encoding="utf-8")

        fake = FakeMultiRoute([FIX_REVIEW_CLEAN])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK
        prompt = fake.calls[0]["prompt"]
        assert "REMEDIATION REVIEW" in prompt
        assert "FIX DELTA ONLY" in prompt
        assert "catch.py" in prompt
        assert "x = 2" not in prompt  # pre-snapshot work is the baseline
        # The auto-ledger rides along (settled via the sidecar).
        assert "Cross-round issue ledger" in prompt
        assert "missing its safety catch" in prompt

    def test_rejected_fix_blocks_and_records_fix_verdicts(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_discovery_round(set_dir, baseline_tree=baseline)
        (repo / "catch.py").write_text("engaged = False\n", encoding="utf-8")

        fake = FakeMultiRoute([FIX_REVIEW_REJECTED])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        envelope = json.loads(
            (set_dir / "s1-issues-round-2.json").read_text(encoding="utf-8")
        )
        assert envelope["phase"] == "remediation-review"
        assert "discoveryBaselineTree" not in envelope
        assert envelope["fixVerdicts"] == [
            {"finding": "missing safety catch", "verdict": "fix-rejected"}
        ]
        out = capsys.readouterr().out
        assert "1 rejected" in out
        assert "at most 2 remediation-review cycles" in out


# ---------------------------------------------------------------------------
# Compat: no --phase keeps today's behavior
# ---------------------------------------------------------------------------

class TestCompat:
    def test_no_phase_is_a_single_call_at_default_complexity(
        self, repo: Path
    ):
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(_args(_set_dir(repo)), route_fn=fake)
        assert code == vs.EXIT_OK
        assert len(fake.calls) == 1
        assert (
            fake.calls[0]["complexity_hint"] == vs.DEFAULT_COMPLEXITY_HINT
        )
        prompt = fake.calls[0]["prompt"]
        assert "INITIAL DISCOVERY" not in prompt
        assert "FIX DELTA ONLY" not in prompt

    def test_explicit_complexity_hint_wins_on_a_phase_round(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=1)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY,
                  complexity_hint=42),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK
        assert fake.calls[0]["complexity_hint"] == 42

    def test_no_phase_envelope_carries_no_phase_fields(self, repo: Path):
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(_args(set_dir), route_fn=fake)
        assert code == vs.EXIT_BLOCKING
        envelope = json.loads(
            (set_dir / "s1-issues.json").read_text(encoding="utf-8")
        )
        assert "phase" not in envelope
        assert "discoveryBaselineTree" not in envelope
        assert "fixVerdicts" not in envelope


# ---------------------------------------------------------------------------
# S2 verification-round hardening (the loop dogfooding itself)
# ---------------------------------------------------------------------------

class TestVerificationRoundHardening:
    def test_unknown_call_token_fails_closed_to_issues_found(
        self, repo: Path, monkeypatch
    ):
        # The merge must not silently depend on the parser's two-token
        # contract: any non-VERIFIED token merges to ISSUES_FOUND.
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        monkeypatch.setattr(
            vs, "parse_verification_response",
            lambda content: ("GARBLED", []),
        )
        fake = FakeMultiRoute(["GARBLED nonsense"])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        disposition = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert disposition["verification_verdict"] == "ISSUES_FOUND"

    def test_blocking_round_with_unparseable_findings_writes_envelope(
        self, repo: Path, monkeypatch
    ):
        # A blocking verdict whose findings did not parse must still
        # produce an envelope (synthetic unknown-severity finding) so the
        # phased loop can continue (prior-findings block + baseline).
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        monkeypatch.setattr(
            vs, "parse_verification_response",
            lambda content: ("ISSUES_FOUND", []),
        )
        fake = FakeMultiRoute(["ISSUES FOUND"])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        envelope = json.loads(
            (set_dir / "s1-issues.json").read_text(encoding="utf-8")
        )
        assert len(envelope["issues"]) == 1
        assert envelope["issues"][0]["category"] == "unparseable-findings"
        assert envelope["issues"][0]["severity"] == "unknown"
        assert "s1-verification.md" in envelope["issues"][0]["description"]
        assert envelope.get("discoveryBaselineTree")

    def test_fix_rejected_without_issue_block_escalates_to_blocking(
        self, repo: Path, monkeypatch
    ):
        # Anti-laundering: an explicit fix-rejected under a contradictory
        # VERIFIED token (no restated Issue block) must block.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_discovery_round(set_dir, baseline_tree=baseline)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: missing safety catch -- fix-rejected\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        envelope = json.loads(
            (set_dir / "s1-issues-round-2.json").read_text(encoding="utf-8")
        )
        assert any(
            i.get("category") == "fix-rejected" for i in envelope["issues"]
        )

    def test_zero_fix_verdicts_escalates_to_blocking(
        self, repo: Path, monkeypatch, capsys
    ):
        # S2 verification round 3: an un-enumerated VERIFIED review is not
        # settlement evidence — the round escalates to blocking and the
        # SESSION disposition fails closed.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_discovery_round(set_dir, baseline_tree=baseline)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])  # no Fix verdict lines
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        assert "no per-finding fix verdicts could be parsed" in (
            capsys.readouterr().err
        )
        envelope = json.loads(
            (set_dir / "s1-issues-round-2.json").read_text(encoding="utf-8")
        )
        assert any(
            i.get("category") == "incomplete-fix-verdict-coverage"
            for i in envelope["issues"]
        )
        disposition = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert disposition["verification_verdict"] == "ISSUES_FOUND"

    def test_blocking_round_under_verified_token_fails_disposition_closed(
        self, repo: Path, monkeypatch
    ):
        # A contradictory VERIFIED token (fix-rejected, no restated Issue)
        # must not leave a closable VERIFIED disposition claim.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_discovery_round(set_dir, baseline_tree=baseline)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: missing safety catch -- fix-rejected\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        disposition = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert disposition["verification_verdict"] == "ISSUES_FOUND"

    def _seed_two_finding_round(self, repo: Path, set_dir: Path) -> None:
        baseline = vs.snapshot_worktree_tree(repo)
        (set_dir / "s1-verification.md").write_text(
            BLOCKING_RESPONSE, encoding="utf-8"
        )
        (set_dir / "s1-issues.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 1,
                "verificationVerdict": "ISSUES_FOUND",
                "phase": "discovery",
                "discoveryBaselineTree": baseline,
                "issues": [
                    {"description": "finding one", "severity": "Major"},
                    {"description": "finding two", "severity": "Major"},
                ],
            }),
            encoding="utf-8",
        )
        (set_dir / "s1-remediation-round-1.md").write_text(
            "Fixed both.", encoding="utf-8"
        )

    def test_ledger_numbers_blocking_findings(self, repo: Path):
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        text, ids = vs.assemble_cross_round_ledger_with_ids(set_dir, 1, 2)
        assert ids == ["L1", "L2"]
        assert "(ledger id: L1)" in text
        assert "(ledger id: L2)" in text

    def test_full_id_coverage_passes(self, repo: Path, monkeypatch):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding one -- fix-accepted\n"
            "- Fix verdict: L2 finding two -- fix-accepted\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK

    def test_missing_ledger_id_escalates_to_blocking(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding one -- fix-accepted\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        assert "ledger id(s) L2 received no terminal fix verdict" in (
            capsys.readouterr().err
        )
        disposition = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert disposition["verification_verdict"] == "ISSUES_FOUND"

    def test_idless_full_count_falls_back_and_passes(
        self, repo: Path, monkeypatch
    ):
        # A review that skipped the id format but enumerated a verdict per
        # numbered finding still passes (count fallback).
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: finding one -- fix-accepted\n"
            "- Fix verdict: finding two -- fix-accepted\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK

    def test_idless_partial_count_escalates(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        fake = FakeMultiRoute([FIX_REVIEW_CLEAN])  # one id-less verdict line
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        assert "coverage cannot be confirmed" in capsys.readouterr().err
        envelope = json.loads(
            (set_dir / "s1-issues-round-2.json").read_text(encoding="utf-8")
        )
        assert any(
            i.get("category") == "incomplete-fix-verdict-coverage"
            for i in envelope["issues"]
        )

    def test_duplicate_sibling_covered_by_declaration(
        self, repo: Path, monkeypatch
    ):
        # Round 9 finding: fan-out siblings reporting the same defect must
        # not manufacture coverage failures — the reviewer declares the
        # identity with duplicate-of, and the sibling id counts as covered.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding one -- fix-accepted\n"
            "- Fix verdict: L2 finding two, same point other wording -- "
            "duplicate-of L1\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK

    def test_every_cycle_re_verdicts_every_id(
        self, repo: Path, monkeypatch, capsys
    ):
        # Round 11 (operator decision, removal-over-addition): NO
        # prior-acceptance exemption. A cycle-2 review must re-verdict
        # every ledger id — the one-line fix-accepted restatement IS the
        # regression check; omitting a previously-accepted id escalates.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        (set_dir / "s1-verification-round-2.md").write_text(
            "ISSUES FOUND\n"
            "- Fix verdict: L1 finding one -- fix-accepted\n"
            "- Fix verdict: L2 finding two -- fix-rejected\n"
            "Issue 1: finding two persists.\n- **Severity:** Major\n",
            encoding="utf-8",
        )
        (set_dir / "s1-issues-round-2.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 2,
                "verificationVerdict": "ISSUES_FOUND",
                "phase": "remediation-review",
                "issues": [
                    {"description": "finding two persists.",
                     "severity": "Major"},
                ],
                "fixVerdicts": [
                    {"finding": "L1 finding one",
                     "verdict": "fix-accepted", "ledgerId": "L1"},
                    {"finding": "L2 finding two",
                     "verdict": "fix-rejected", "ledgerId": "L2"},
                ],
            }),
            encoding="utf-8",
        )
        (set_dir / "s1-remediation-round-2.md").write_text(
            "Re-fixed finding two.", encoding="utf-8"
        )
        text, required = vs.assemble_cross_round_ledger_with_ids(
            set_dir, 1, 3
        )
        # ALL ids stay required — including the previously accepted L1.
        assert required == ["L1", "L2", "L3"]
        assert "EXEMPT" not in text
        # A cycle-2 review that skips the previously accepted L1 escalates.
        partial = (
            "VERIFIED\n\n"
            "- Fix verdict: L2 finding two -- fix-accepted\n"
            "- Fix verdict: L3 finding two restatement -- duplicate-of L2\n"
        )
        fake = FakeMultiRoute([partial])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        assert "L1" in capsys.readouterr().err
        # A full re-verdict (one line per id) passes. The escalated
        # partial round above wrote its own synthetic finding, which the
        # next render numbers L4 — it needs a verdict like any other id.
        complete = (
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding one -- fix-accepted\n"
            "- Fix verdict: L2 finding two -- fix-accepted\n"
            "- Fix verdict: L3 finding two restatement -- duplicate-of L2\n"
            "- Fix verdict: L4 coverage gap -- fix-accepted\n"
        )
        fake2 = FakeMultiRoute([complete])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW,
                  round_number=4),
            route_fn=fake2,
        )
        assert code == vs.EXIT_OK



    def test_duplicate_cycle_is_not_coverage(
        self, repo: Path, monkeypatch, capsys
    ):
        # Round 10 finding: reciprocal aliases (L1<->L2) under VERIFIED
        # must escalate -- neither id has a terminal disposition.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding one -- duplicate-of L2\n"
            "- Fix verdict: L2 finding two -- duplicate-of L1\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        err = capsys.readouterr().err
        assert "no terminal fix verdict" in err
        disposition = json.loads(
            (set_dir / "disposition.json").read_text(encoding="utf-8")
        )
        assert disposition["verification_verdict"] == "ISSUES_FOUND"

    def test_dangling_duplicate_target_is_not_coverage(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding one -- fix-accepted\n"
            "- Fix verdict: L2 finding two -- duplicate-of L9\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        assert "L2" in capsys.readouterr().err

    def test_self_referencing_duplicate_is_not_coverage(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        self._seed_two_finding_round(repo, set_dir)
        response = (
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding one -- fix-accepted\n"
            "- Fix verdict: L2 finding two -- duplicate-of L2\n"
        )
        fake = FakeMultiRoute([response])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING

    def test_second_blocking_review_cycle_suspends_to_operator(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_discovery_round(set_dir, baseline_tree=baseline)
        # A prior BLOCKING remediation-review cycle (round 2).
        (set_dir / "s1-verification-round-2.md").write_text(
            FIX_REVIEW_REJECTED, encoding="utf-8"
        )
        (set_dir / "s1-issues-round-2.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": 1,
                "verificationRound": 2,
                "verificationVerdict": "ISSUES_FOUND",
                "phase": "remediation-review",
                "issues": [
                    {"description": "still broken", "severity": "Major"}
                ],
            }),
            encoding="utf-8",
        )
        fake = FakeMultiRoute([FIX_REVIEW_REJECTED])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_BLOCKING
        out = capsys.readouterr().out
        assert "SUSPENDS" in out
        # The suspend branch must not print another re-run command.
        assert out.count("--phase remediation-review") == 0

    def test_phased_evidence_excludes_loop_bookkeeping(
        self, repo: Path, monkeypatch
    ):
        # Round artifacts written by earlier phased rounds must not ride
        # into later phased evidence (they are review machinery, not work).
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_discovery_round(set_dir)
        (set_dir / "s1-verification.md").write_text(
            "RAW-ROUND-ONE-MARKER " + BLOCKING_RESPONSE, encoding="utf-8"
        )
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING  # discovery blockers still stand
        prompt = fake.calls[0]["prompt"]
        assert "RAW-ROUND-ONE-MARKER" not in prompt
        # The prior FINDINGS still reach the verifier -- via the critic
        # block, not via the raw artifact bytes.
        assert "missing its safety catch" in prompt

    def test_under_budget_discovery_verifier_warns(
        self, repo: Path, monkeypatch, capsys
    ):
        # S2 verification round 8: discovery landing on a model whose
        # configured output ceiling is below the floor warns LOUDLY (the
        # ceiling itself is a provider-limit-bound operator setting).
        _phase_config(monkeypatch, fan_out=1)
        monkeypatch.setattr(vs, "_model_output_cap", lambda name: 16000)
        monkeypatch.setattr(
            vs, "load_discovery_min_output_tokens", lambda config=None: 32000
        )
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        err = capsys.readouterr().err
        assert "below the discovery output-budget floor" in err

    def test_adequate_or_unresolvable_budget_stays_quiet(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch, fan_out=1)
        monkeypatch.setattr(vs, "_model_output_cap", lambda name: 65536)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        assert vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY), route_fn=fake
        ) == vs.EXIT_OK
        assert "output-budget floor" not in capsys.readouterr().err
        # Unresolvable cap fails open (no warning on missing evidence).
        monkeypatch.setattr(vs, "_model_output_cap", lambda name: None)
        fake2 = FakeMultiRoute([VERIFIED_RESPONSE])
        assert vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY,
                  round_number=2), route_fn=fake2
        ) == vs.EXIT_OK
        assert "output-budget floor" not in capsys.readouterr().err

    def test_fix_delta_excludes_loop_bookkeeping(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_discovery_round(set_dir, baseline_tree=baseline)
        # Post-baseline: a real fix AND loop bookkeeping.
        (repo / "catch.py").write_text("engaged = True\n", encoding="utf-8")
        (set_dir / "s1-remediation-round-1.md").write_text(
            "SIDECAR-MARKER fixed the catch", encoding="utf-8"
        )
        fake = FakeMultiRoute([FIX_REVIEW_CLEAN])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK
        prompt = fake.calls[0]["prompt"]
        assert "catch.py" in prompt          # the fix rides in the delta
        # The sidecar's TEXT legitimately reaches the verifier through the
        # auto-ledger (settlement evidence); its raw-file hunk must NOT be
        # part of the reviewed fix delta.
        assert (
            f"diff --git a/docs/session-sets/{SET_SLUG}/"
            "s1-remediation-round-1.md" not in prompt
        )
        assert "Remediation notes (round 1)" in prompt  # via the ledger
