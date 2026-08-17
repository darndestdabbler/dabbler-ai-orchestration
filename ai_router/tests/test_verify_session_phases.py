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
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

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
    # Set 113 S3: leave one uncommitted change, so the fixture represents a
    # session that has done work. An empty evidence bundle is now refused
    # before anything routes -- see TestEmptyEvidenceFailsClosed in
    # test_verify_session.py for why a pristine tree was never a realistic
    # thing to verify.
    (tmp_path / "tracked.py").write_text("x = 1  # in progress\n", encoding="utf-8")
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
                 verification_stamp=None, prefer_model=None):
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


def evidence_marker(prompt: str) -> str:
    """The prompt's Response-Under-Review half (the evidence bundle).

    Set 111 S1 varies only the LENS block inside the Original Task slot,
    so two fan-out calls must differ in framing while this half stays
    byte-identical.
    """
    return prompt.split("### Response Under Review", 1)[-1]


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
    def test_fan_out_routes_k_lens_varied_calls_and_merges(
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
        # Set 111 S1: same evidence, DIFFERENT framing per call.
        assert fake.calls[0]["prompt"] != fake.calls[1]["prompt"]
        assert "SPEC CONFORMANCE" in fake.calls[0]["prompt"]
        assert "FAILURE SCENARIOS" in fake.calls[1]["prompt"]
        # The evidence itself is shared -- only the lens block differs.
        assert evidence_marker(fake.calls[0]["prompt"]) == evidence_marker(
            fake.calls[1]["prompt"]
        )
        # Raised default complexity on a phase round.
        assert fake.calls[0]["complexity_hint"] == vs.PHASE_COMPLEXITY_HINT
        # Per-call artifacts, per-call stamps binding each artifact AND
        # each call's own filled prompt.
        assert (set_dir / "s1-verification.md").exists()
        assert (set_dir / "s1-verification-fanout-2.md").exists()
        stamp_paths = {
            c["verification_stamp"]["artifact_path"] for c in fake.calls
        }
        assert len(stamp_paths) == 2
        evidence_hashes = {
            c["verification_stamp"]["evidence_sha256"] for c in fake.calls
        }
        assert len(evidence_hashes) == 2
        # One merged envelope annotated per call, with its lens.
        envelope = json.loads(
            (set_dir / "s1-issues.json").read_text(encoding="utf-8")
        )
        assert envelope["phase"] == "discovery"
        assert envelope["verificationVerdict"] == "ISSUES_FOUND"
        assert [i["discoveryCall"] for i in envelope["issues"]] == [1, 2]
        assert [i["discoveryLens"] for i in envelope["issues"]] == [
            vs.DISCOVERY_LENS_SPEC_CONFORMANCE,
            vs.DISCOVERY_LENS_FAILURE_SCENARIO,
        ]
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
        # produce an envelope so the phased loop can continue
        # (prior-findings block + baseline). Set 134 S2: the synthesized
        # finding now OMITS the severity key rather than writing the
        # "unknown" sentinel -- an absent severity blocks under the
        # anti-laundering rule, which is the only property this finding
        # ever needed, and one spelling per meaning is the rule.
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
        assert "severity" not in envelope["issues"][0]
        # The behaviour the sentinel existed for is unchanged and asserted
        # directly, not via the token that used to stand in for it.
        assert vs.is_blocking_issue(envelope["issues"][0]) is True
        assert "s1-verification.md" in envelope["issues"][0]["description"]
        assert envelope.get("discoveryBaselineTree")

    def test_a_non_canonical_severity_still_ledgers_the_round(
        self, repo: Path, monkeypatch
    ):
        # Set 134 S2, verification round 1 (Major, accepted without
        # argument). A verifier writing `Severity: major` -- case drift the
        # parser accepts via re.IGNORECASE -- must NOT leave a raw-only,
        # unledgered round. resolve_round advances on raw-artifact existence
        # while the cross-round ledger reads only sN-issues*.json, so a
        # writer that raised here silently dropped a paid blocking finding
        # out of the structured loop.
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        monkeypatch.setattr(
            vs, "parse_verification_response",
            lambda content: (
                "ISSUES_FOUND",
                [{"description": "off by one", "severity": "major"}],
            ),
        )
        fake = FakeMultiRoute(["ISSUES FOUND"])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        envelope_path = set_dir / "s1-issues.json"
        assert envelope_path.exists(), (
            "the envelope must exist or the round is unledgered and the "
            "next verify_session run skips it"
        )
        envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
        issue = envelope["issues"][0]
        # The token was refused...
        assert issue.get("severity") != "major"
        # ...and the finding still blocks, exactly as it did before.
        assert vs.is_blocking_issue(issue) is True
        assert issue["description"] == "off by one"
        # The round IS on the ledger.
        ledger = (set_dir / "s1-rounds.jsonl").read_text(encoding="utf-8")
        assert '"round-completed"' in ledger
        assert '"blocking": true' in ledger

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
                  round_number=4,
                  # Set 111 S1: this is remediation-review cycle 3, which
                  # the enforced bound refuses without an operator
                  # attestation. The rule under test here is ledger
                  # coverage, not the bound, so the scenario carries the
                  # authorization the operator would have given.
                  operator_authorized_round=(
                      "test fixture: exercising the cycle-3 coverage rule"
                  )),
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


# ---------------------------------------------------------------------------
# Set 111 S1 -- the bounds made real, the lenses varied, the Minor-only stop
# ---------------------------------------------------------------------------

MINOR_ONLY_RESPONSE = """ISSUES FOUND

Issue 1: The docstring says "returns a list" but the helper returns a tuple.
- **Category:** Documentation
- **Severity:** Minor
- **Details:** cosmetic wording; no caller reads the docstring at runtime.
"""


def _seed_round(
    set_dir: Path,
    round_number: int,
    phase: Optional[str],
    *,
    baseline_tree: str = "",
    clean: bool = False,
) -> None:
    """A completed prior round on disk: raw artifact, plus the findings
    envelope unless *clean* (a clean round writes no envelope, exactly as
    ``run()`` does -- which is why it must not consume the budget)."""
    vs.verification_artifact_path(set_dir, 1, round_number).write_text(
        VERIFIED_RESPONSE if clean else BLOCKING_RESPONSE, encoding="utf-8"
    )
    if clean:
        return
    envelope = {
        "schemaVersion": 1,
        "sessionNumber": 1,
        "verificationRound": round_number,
        "verificationVerdict": "ISSUES_FOUND",
        "issues": [
            {"description": f"finding from round {round_number}",
             "severity": "Major"},
        ],
    }
    if phase:
        envelope["phase"] = phase
    if baseline_tree:
        envelope["discoveryBaselineTree"] = baseline_tree
    vs.issues_artifact_path(set_dir, 1, round_number).write_text(
        json.dumps(envelope, indent=2), encoding="utf-8"
    )


def _ledger(set_dir: Path, event: str) -> list:
    """The session-1 round-ledger records of one ``event`` kind."""
    return [
        r for r in vs.read_round_ledger(set_dir, 1)
        if r.get("event") == event
    ]


class TestEnforcedBounds:
    """The bounded totals REFUSE the round that would pass them.

    Set 111 S1: the numbers are unchanged; what changes is that
    ``count_phase_rounds`` no longer only feeds an advisory message.
    """

    def test_third_discovery_family_pass_is_refused(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_USAGE
        assert fake.calls == []  # refused BEFORE any metered call
        err = capsys.readouterr().err
        assert "discovery pass 3 of a bounded 2" in err
        assert "--operator-authorized-round" in err

    def test_supplementary_shares_the_discovery_budget(
        self, repo: Path, monkeypatch, capsys
    ):
        # discovery + supplementary ARE the two discovery passes; a third
        # of either shape is the same over-run.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_DISCOVERY)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert code == vs.EXIT_USAGE
        assert fake.calls == []
        assert "discovery pass 3 of a bounded 2" in capsys.readouterr().err

    def test_third_remediation_review_cycle_is_refused(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY, baseline_tree=baseline)
        _seed_round(set_dir, 2, vs.PHASE_REMEDIATION_REVIEW)
        _seed_round(set_dir, 3, vs.PHASE_REMEDIATION_REVIEW)
        fake = FakeMultiRoute([FIX_REVIEW_CLEAN])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW), route_fn=fake
        )
        assert code == vs.EXIT_USAGE
        assert fake.calls == []
        err = capsys.readouterr().err
        assert "remediation-review cycle 3 of a bounded 2" in err
        # The refusal names the operator path, not another round.
        assert "third-provider adjudication" in err

    def test_third_classic_round_is_refused_whatever_the_prior_phases(
        self, repo: Path, monkeypatch, capsys
    ):
        # Dropping --phase at the phased bound must not be a one-flag
        # bypass of the thing being enforced.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(_args(set_dir), route_fn=fake)
        assert code == vs.EXIT_USAGE
        assert fake.calls == []
        assert "verification round 3 of a bounded 2" in capsys.readouterr().err

    def test_clean_rounds_do_not_consume_the_budget(
        self, repo: Path, monkeypatch
    ):
        # A clean round ends the loop on its own; only rounds that leave
        # the loop running are cycles, so two clean ones must not lock it.
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY, clean=True)
        _seed_round(set_dir, 2, vs.PHASE_DISCOVERY, clean=True)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        assert len(fake.calls) == 1

    def test_clean_supplementary_over_standing_blockers_consumes_a_pass(
        self, repo: Path, monkeypatch, capsys
    ):
        # S1 supplementary-round finding, reproduced as a test. A clean
        # supplementary round whose prior discovery blockers still stand
        # does NOT end the loop -- it is the second discovery pass, and
        # remediation comes next. It writes no findings envelope, so an
        # envelope-only count let a THIRD discovery-family pass through
        # unauthorized: exactly the grinding this set exists to stop.
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)  # blocking discovery
        clean_supp = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY),
            route_fn=FakeMultiRoute([VERIFIED_RESPONSE]),
        )
        # Clean round, but the session stays blocking -> the loop runs on.
        assert clean_supp == vs.EXIT_BLOCKING
        assert not (set_dir / "s1-issues-round-2.json").exists()
        completed = _ledger(set_dir, vs.ROUND_EVENT_COMPLETED)
        assert completed[-1]["phase"] == vs.PHASE_SUPPLEMENTARY
        assert completed[-1]["endedLoop"] is False
        capsys.readouterr()
        # The third discovery-family pass is now refused.
        third = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=third
        )
        assert code == vs.EXIT_USAGE
        assert third.calls == []
        assert "discovery pass 3 of a bounded 2" in capsys.readouterr().err

    def test_a_loop_ending_clean_round_is_recorded_but_not_counted(
        self, repo: Path, monkeypatch
    ):
        # The mirror of the case above: a clean round that SETTLES the
        # session is recorded in the ledger and consumes nothing.
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([VERIFIED_RESPONSE]),
        ) == vs.EXIT_OK
        completed = _ledger(set_dir, vs.ROUND_EVENT_COMPLETED)
        assert completed[-1]["endedLoop"] is True
        assert vs.count_phase_family_rounds(
            set_dir, 1, 2, vs.DISCOVERY_FAMILY_PHASES
        ) == 0

    def test_the_ledger_and_the_envelopes_never_double_count(
        self, repo: Path, monkeypatch
    ):
        # A blocking round leaves BOTH a ledger record and an envelope;
        # the union is by round number, so one round counts once.
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([BLOCKING_RESPONSE]),
        ) == vs.EXIT_BLOCKING
        assert (set_dir / "s1-issues.json").exists()
        assert _ledger(set_dir, vs.ROUND_EVENT_COMPLETED)
        assert vs.count_phase_family_rounds(
            set_dir, 1, 2, vs.DISCOVERY_FAMILY_PHASES
        ) == 1

    def test_a_ledgerless_session_still_counts_from_envelopes(
        self, repo: Path, monkeypatch, capsys
    ):
        # Backward compat: sessions that predate the ledger keep their
        # envelope-derived bound rather than losing enforcement.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        assert not vs.round_ledger_path(set_dir, 1).exists()
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        ) == vs.EXIT_USAGE
        assert fake.calls == []
        assert "discovery pass 3 of a bounded 2" in capsys.readouterr().err

    def test_a_torn_ledger_line_never_voids_the_records_before_it(
        self, repo: Path, monkeypatch, capsys
    ):
        # Tolerant reader: an interrupted append must not silently drop
        # the bound (fail-open on a truncated line would unlock the loop).
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY),
            route_fn=FakeMultiRoute([VERIFIED_RESPONSE]),
        )
        capsys.readouterr()
        ledger = vs.round_ledger_path(set_dir, 1)
        with open(ledger, "a", encoding="utf-8") as handle:
            handle.write('{"event": "round-comple')  # torn write
        third = FakeMultiRoute([BLOCKING_RESPONSE])
        assert vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=third
        ) == vs.EXIT_USAGE
        assert third.calls == []

    def test_wording_only_reverify_is_not_a_new_cycle(
        self, repo: Path, monkeypatch
    ):
        # --wording-only re-collects the verdict FORMAT of a round that
        # already happened (L-064-7); it is not a fresh cycle.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, None)
        _seed_round(set_dir, 2, None)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(_args(set_dir, wording_only=True), route_fn=fake)
        assert code == vs.EXIT_OK
        assert len(fake.calls) == 1

    def test_authorization_runs_the_round_and_records_it(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY, baseline_tree=baseline)
        _seed_round(set_dir, 2, vs.PHASE_REMEDIATION_REVIEW)
        _seed_round(set_dir, 3, vs.PHASE_REMEDIATION_REVIEW)
        # A complete re-verdict over the ledger's three ids, so the round
        # turns on the AUTHORIZATION rather than on ledger coverage.
        fake = FakeMultiRoute([
            "VERIFIED\n\n"
            "- Fix verdict: L1 finding from round 1 -- fix-accepted\n"
            "- Fix verdict: L2 finding from round 2 -- fix-accepted\n"
            "- Fix verdict: L3 finding from round 3 -- fix-accepted\n"
        ])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW,
                  operator_authorized_round=(
                      "operator: the unmeasured-baseline Major is material; "
                      "one more cycle authorized"
                  )),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK
        assert len(fake.calls) == 1
        auths = _ledger(set_dir, vs.ROUND_EVENT_AUTHORIZATION)
        assert len(auths) == 1
        record = auths[0]
        assert record["sessionNumber"] == 1
        assert record["verificationRound"] == 4
        assert record["phase"] == vs.PHASE_REMEDIATION_REVIEW
        assert record["boundedUnit"] == "remediation-review cycle"
        assert record["bound"] == 2
        assert record["priorRounds"] == 2
        assert "unmeasured-baseline Major" in record["attestation"]
        assert record["recordedAt"]
        # The same ledger carries the completed round it authorized.
        completed = _ledger(set_dir, vs.ROUND_EVENT_COMPLETED)
        assert [r["verificationRound"] for r in completed] == [4]
        assert completed[0]["endedLoop"] is True
        assert "recorded authorization" in capsys.readouterr().err

    def test_authorization_is_recorded_before_the_metered_call(
        self, repo: Path, monkeypatch
    ):
        # The operator authorized the spend; a provider failure afterward
        # must not erase that from the audit trail.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        fake = FakeMultiRoute([RuntimeError("provider outage")])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY,
                  operator_authorized_round="operator: one more harvest"),
            route_fn=fake,
        )
        assert code == vs.EXIT_ROUTE_FAILED
        trail = vs.round_ledger_path(set_dir, 1)
        assert trail.exists()
        assert "one more harvest" in trail.read_text(encoding="utf-8")

    def test_repeat_authorizations_append_never_rewrite(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        for attestation in ("operator: pass one", "operator: pass two"):
            vs.run(
                _args(set_dir, phase=vs.PHASE_DISCOVERY,
                      operator_authorized_round=attestation),
                route_fn=FakeMultiRoute([BLOCKING_RESPONSE]),
            )
        auths = _ledger(set_dir, vs.ROUND_EVENT_AUTHORIZATION)
        assert [a["attestation"] for a in auths] == [
            "operator: pass one", "operator: pass two",
        ]
        # Each authorized round also left its own completed record.
        assert len(_ledger(set_dir, vs.ROUND_EVENT_COMPLETED)) == 2

    def test_empty_authorization_is_refused(
        self, repo: Path, monkeypatch, capsys
    ):
        # Mirrors close_session --manual-verify: the flag alone is never
        # the authorization.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY,
                  operator_authorized_round="   "),
            route_fn=fake,
        )
        assert code == vs.EXIT_USAGE
        assert fake.calls == []
        assert "non-empty operator attestation" in capsys.readouterr().err
        assert not vs.round_ledger_path(set_dir, 1).exists()

    def test_authorization_below_the_bound_is_noted_not_recorded(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY,
                  operator_authorized_round="operator: not needed yet"),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK
        assert "needs no authorization" in capsys.readouterr().err
        # The round still leaves its completed record; what must be absent
        # is an AUTHORIZATION nobody needed.
        assert _ledger(set_dir, vs.ROUND_EVENT_AUTHORIZATION) == []

    def test_dry_run_records_no_authorization(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY, dry_run=True,
                  operator_authorized_round="operator: just looking"),
            route_fn=fake,
        )
        assert code == vs.EXIT_OK
        assert fake.calls == []
        assert not vs.round_ledger_path(set_dir, 1).exists()
        assert "PAST the bounded" in capsys.readouterr().out

    def test_blocking_round_at_the_bound_never_prints_a_rerun_command(
        self, repo: Path, monkeypatch, capsys
    ):
        # The printed next action can never direct the orchestrator at a
        # round the CLI is about to refuse.
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        baseline = vs.snapshot_worktree_tree(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY, baseline_tree=baseline)
        _seed_round(set_dir, 2, vs.PHASE_REMEDIATION_REVIEW)
        fake = FakeMultiRoute([FIX_REVIEW_REJECTED])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        out = capsys.readouterr().out
        assert "SUSPENDS" in out and "REFUSED" in out
        assert out.count("--phase remediation-review") == 0

    def test_second_discovery_pass_at_the_bound_points_at_remediation(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING
        out = capsys.readouterr().out
        # Discovery pass 2 of 2 -- a supplementary pass would be refused,
        # so the CLI must not offer one.
        assert "--phase supplementary" not in out
        assert "--phase remediation-review" in out

    def test_authorization_trail_is_loop_bookkeeping_not_reviewed_work(
        self, repo: Path, monkeypatch
    ):
        # The trail is written mid-loop; it must not ride into later
        # phased evidence (nor stale an earlier round's stamped hash).
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        vs.round_ledger_path(set_dir, 1).write_text(
            '{"attestation": "AUTHORIZATION-TRAIL-MARKER"}\n',
            encoding="utf-8",
        )
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert code == vs.EXIT_BLOCKING  # prior discovery blockers stand
        assert "AUTHORIZATION-TRAIL-MARKER" not in fake.calls[0]["prompt"]


class TestDiscoveryLenses:
    def test_lenses_cycle_by_call_index(self):
        assert vs.discovery_lens_for_call(1) == (
            vs.DISCOVERY_LENS_SPEC_CONFORMANCE
        )
        assert vs.discovery_lens_for_call(2) == (
            vs.DISCOVERY_LENS_FAILURE_SCENARIO
        )
        # Wraps rather than erroring when K exceeds the lens list.
        assert vs.discovery_lens_for_call(3) == (
            vs.DISCOVERY_LENS_SPEC_CONFORMANCE
        )

    def test_lens_framings_are_distinct_and_keep_the_rubric(self):
        spec_lens = vs.build_phase_framing(
            vs.PHASE_DISCOVERY, lens=vs.DISCOVERY_LENS_SPEC_CONFORMANCE
        )
        failure_lens = vs.build_phase_framing(
            vs.PHASE_DISCOVERY, lens=vs.DISCOVERY_LENS_FAILURE_SCENARIO
        )
        assert spec_lens != failure_lens
        # Both keep the base discovery contract (exhaustive, rubric
        # unchanged) -- the lens changes direction, not severity.
        for framing in (spec_lens, failure_lens):
            assert "INITIAL DISCOVERY" in framing
            assert "The rubric is unchanged" in framing
            # Neither lens narrows scope out from under the other.
            assert "Scope is NOT narrowed" in framing

    def test_no_lens_is_the_unchanged_base_framing(self):
        base = vs.build_phase_framing(vs.PHASE_DISCOVERY)
        assert "INITIAL DISCOVERY" in base
        assert "LENS FOR THIS CALL" not in base

    def test_single_call_discovery_still_carries_lens_one(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=1)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        assert "SPEC CONFORMANCE" in fake.calls[0]["prompt"]

    def test_non_discovery_phases_carry_no_lens(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY), route_fn=fake
        )
        assert "LENS FOR THIS CALL" not in fake.calls[0]["prompt"]


class TestMinorOnlyStop:
    def test_minor_only_round_directs_to_close_not_another_round(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([MINOR_ONLY_RESPONSE])
        code = vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        out = capsys.readouterr().out
        assert "MINOR-ONLY round" in out
        assert "1 Minor / unrated finding(s)" in out
        assert "do NOT open another verification round" in out.replace(
            "Do NOT", "do NOT"
        )
        # The only command offered is the close.
        assert "close_session" in out
        assert "--phase supplementary" not in out
        assert "--phase remediation-review" not in out

    def test_clean_round_says_verified_not_minor_only(
        self, repo: Path, monkeypatch, capsys
    ):
        _phase_config(monkeypatch, fan_out=1)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        out = capsys.readouterr().out
        assert "VERIFIED -- no Critical/Major findings" in out
        assert "MINOR-ONLY" not in out
        assert "close_session" in out

    def test_verified_with_nits_is_not_called_findings_free(
        self, repo: Path, monkeypatch, capsys
    ):
        # A VERIFIED token drops the NITS section at the parser, so the
        # exit line must not claim the round had no findings at all --
        # it claims only what it knows: no Critical/Major.
        _phase_config(monkeypatch, fan_out=1)
        verified_with_nits = (
            "VERIFIED\n\nNothing blocking.\n\n"
            "#### NITS\n\n- **Nit:** a docstring says list, returns tuple.\n"
        )
        fake = FakeMultiRoute([verified_with_nits])
        code = vs.run(
            _args(_set_dir(repo), phase=vs.PHASE_DISCOVERY), route_fn=fake
        )
        assert code == vs.EXIT_OK
        out = capsys.readouterr().out
        next_action = out.split("Next action:", 1)[1]
        assert "no findings" not in next_action
        assert "no Critical/Major findings" in next_action
        assert "Record any nits from the raw artifact" in next_action


class TestFanoutCostsOneRoundOfBudget:
    """Set 116 S2, the third leg of "one cap covering verify_session
    rounds, backstop rounds and the discovery fan-out".

    The fan-out is K parallel calls INSIDE one round, so it must consume
    exactly one unit of budget however wide it is. That already held --
    ``fanout_artifact_path`` writes ``-fanout-<k>`` siblings that
    ``resolve_round``'s scan deliberately ignores, and
    ``record_round_completed`` fires once per round -- but it held as an
    unasserted property. A later widening of K that quietly started
    costing K rounds would burn the budget in a single pass and reduce
    the loop to one discovery round, with nothing red to show for it.
    """

    def test_a_three_call_fanout_writes_one_ledger_record(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=3)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([BLOCKING_RESPONSE] * 3)

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        ) == vs.EXIT_BLOCKING

        assert len(fake.calls) == 3  # the fan-out really did fan out
        completed = _ledger(set_dir, vs.ROUND_EVENT_COMPLETED)
        assert len(completed) == 1
        assert completed[0]["verificationRound"] == 1

    def test_a_three_call_fanout_consumes_one_unit_of_budget(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=3)
        set_dir = _set_dir(repo)

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([BLOCKING_RESPONSE] * 3),
        ) == vs.EXIT_BLOCKING

        # One pass spent, not three: the SECOND discovery-family pass is
        # still available, and only the third is refused.
        assert vs.count_phase_family_rounds(
            set_dir, 1, 2, vs.DISCOVERY_FAMILY_PHASES
        ) == 1
        status = vs.evaluate_phase_bound(
            set_dir, 1, 2, vs.PHASE_DISCOVERY
        )
        assert status.prior_rounds == 1
        assert status.exceeds is False

    def test_the_fanout_siblings_do_not_bump_the_round_number(
        self, repo: Path, monkeypatch
    ):
        """The mechanism behind it: only the canonical artifact names
        advance ``resolve_round``, so widening K never skips rounds."""
        _phase_config(monkeypatch, fan_out=3)
        set_dir = _set_dir(repo)

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([BLOCKING_RESPONSE] * 3),
        ) == vs.EXIT_BLOCKING

        assert (set_dir / "s1-verification-fanout-2.md").exists()
        assert (set_dir / "s1-verification-fanout-3.md").exists()
        assert vs.resolve_round(set_dir, 1, None) == 2


# ---------------------------------------------------------------------------
# Set 127 S3: the round sequence posts its own checklist
# ---------------------------------------------------------------------------

def _posts(set_dir: Path) -> list:
    """Session-1 checklist-post records, oldest first."""
    from ai_router.session_checklist import read_posts

    return read_posts(str(set_dir), 1)


def _checklist_gate(set_dir: Path):
    from ai_router.gate_checks import check_checklist_posted

    return check_checklist_posted(str(set_dir), None)


def _round_transitions_in(remediation: str) -> list:
    """The ``verification-round N`` labels a gate failure names."""
    import re

    from ai_router.gate_checks import CHECKLIST_TRANSITION_ROUND

    return re.findall(rf"{CHECKLIST_TRANSITION_ROUND} \d+", remediation)


class TestRoundBoundaryPostsItsOwnChecklist:
    """Set 127 S3, falsified in both directions (L-112-1).

    The operator ratified auto-render (spec option 1) because the
    machine-driven ``discovery -> supplementary -> remediation-review``
    sequence closes each round's post window minutes apart with nobody at
    the terminal. A mechanism that only ever posts proves as little as a
    gate that only ever passes, so the rounds that must NOT post are
    asserted here beside the rounds that must.
    """

    # -- FIRES ---------------------------------------------------------

    def test_the_set_126_s2_sequence_leaves_a_post_in_every_round_window(
        self, repo: Path, monkeypatch
    ):
        """Three blocking rounds back to back, and no unmet round window.

        This is the exact shape that failed in Set 126 S2: three
        transitions inside ~19 minutes, each window closing before anyone
        could post into it. All three exit blocking, which is why nobody
        was at the terminal for any of them -- the orchestrator was
        mid-remediation.
        """
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([BLOCKING_RESPONSE]),
        ) == vs.EXIT_BLOCKING
        assert vs.run(
            _args(set_dir, phase=vs.PHASE_SUPPLEMENTARY),
            route_fn=FakeMultiRoute([BLOCKING_RESPONSE_B]),
        ) == vs.EXIT_BLOCKING
        assert vs.run(
            _args(set_dir, phase=vs.PHASE_REMEDIATION_REVIEW),
            route_fn=FakeMultiRoute([FIX_REVIEW_CLEAN]),
        ) == vs.EXIT_BLOCKING

        rounds = _ledger(set_dir, vs.ROUND_EVENT_COMPLETED)
        assert [r["verificationRound"] for r in rounds] == [1, 2, 3]
        posts = _posts(set_dir)
        assert len(posts) == 3

        # Positionally: one post inside each round's own [t_i, t_i+1).
        for index, record in enumerate(rounds):
            opened = record["recordedAt"]
            closed = (
                rounds[index + 1]["recordedAt"]
                if index + 1 < len(rounds)
                else None
            )
            covering = [
                p for p in posts
                if p["postedAt"] >= opened
                and (closed is None or p["postedAt"] < closed)
            ]
            assert len(covering) == 1, (
                f"round {record['verificationRound']} window "
                f"[{opened}, {closed}) is not covered by exactly one post"
            )

        ok, remediation = _checklist_gate(set_dir)
        assert ok is True, remediation

    def test_the_post_is_a_render_through_the_existing_writer(
        self, repo: Path, monkeypatch, capsys
    ):
        """Not a synthetic record: the operator is shown the checklist.

        The spec forbids a post that satisfies the gate without anyone
        being shown anything, so the round's stdout must carry the
        rendered block and the ledger line must describe that render.
        """
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        # A real logged step, so the render has a row to draw.
        from ai_router.session_log import SessionLog

        SessionLog(str(set_dir), total_sessions=2).log_step(
            1, 1, "build-it", "Built the widget.", "complete"
        )

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([VERIFIED_RESPONSE]),
        ) == vs.EXIT_OK

        out = capsys.readouterr().out
        assert "Session 1 step" in out
        assert "[x] Built the widget" in out or "[x] build it" in out.lower()

        posts = _posts(set_dir)
        assert len(posts) == 1
        assert posts[0]["surface"] == "text"
        assert posts[0]["stepCount"] >= 1

    # -- DOES NOT FIRE -------------------------------------------------

    def test_a_dry_run_shows_nothing_and_records_nothing(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        fake = FakeMultiRoute([VERIFIED_RESPONSE])

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY, dry_run=True),
            route_fn=fake,
        ) == vs.EXIT_OK

        assert fake.calls == []
        assert _posts(set_dir) == []
        assert _ledger(set_dir, vs.ROUND_EVENT_COMPLETED) == []

    def test_a_refused_round_records_no_post(
        self, repo: Path, monkeypatch
    ):
        """Past the bound there is no round, so there is nothing to show."""
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        _seed_round(set_dir, 1, vs.PHASE_DISCOVERY)
        _seed_round(set_dir, 2, vs.PHASE_SUPPLEMENTARY)
        fake = FakeMultiRoute([BLOCKING_RESPONSE])

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY), route_fn=fake
        ) == vs.EXIT_USAGE

        assert fake.calls == []
        assert _posts(set_dir) == []

    def test_a_failed_routed_call_records_no_post(
        self, repo: Path, monkeypatch
    ):
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([RuntimeError("provider outage")]),
        ) == vs.EXIT_ROUTE_FAILED

        assert _posts(set_dir) == []
        assert _ledger(set_dir, vs.ROUND_EVENT_COMPLETED) == []

    def test_a_close_backstop_round_records_no_post(self, repo: Path):
        """The ledger writer does not post; only ``run()`` does.

        A backstop round runs in-process DURING the close, so its window
        opens after the last moment anyone could post into it -- which is
        why ``_checklist_transitions`` skips it. Posting there would
        manufacture a record for a render the operator never saw.
        """
        set_dir = _set_dir(repo)
        vs.record_round_completed(
            vs.round_ledger_path(set_dir, 1),
            session_number=1,
            round_number=1,
            phase=None,
            verdict="VERIFIED",
            blocking=False,
            ended_loop=True,
            source=vs.ROUND_SOURCE_CLOSE_BACKSTOP,
        )

        assert len(_ledger(set_dir, vs.ROUND_EVENT_COMPLETED)) == 1
        assert _posts(set_dir) == []
        ok, remediation = _checklist_gate(set_dir)
        assert _round_transitions_in(remediation) == []

    def test_the_other_transition_types_still_bind(
        self, repo: Path, monkeypatch
    ):
        """Only the round transition is discharged for the orchestrator.

        A session that posts at every round and skips its test-run post is
        reported exactly as it is today -- otherwise this change would
        have quietly disarmed the whole gate instead of one failure mode.
        """
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([VERIFIED_RESPONSE]),
        ) == vs.EXIT_OK

        # A test run recorded AFTER the round's post: its own window is
        # open and unposted.
        later = (
            datetime.now().astimezone() + timedelta(minutes=5)
        ).isoformat()
        (set_dir / "test-runs.jsonl").write_text(
            json.dumps(
                {
                    "suite": "pytest",
                    "command": "pytest",
                    "outcome": "passed",
                    "surfaceDigest": "deadbeef",
                    "recordedAt": later,
                    "sessionNumber": 1,
                }
            )
            + "\n",
            encoding="utf-8",
        )

        ok, remediation = _checklist_gate(set_dir)
        assert ok is False
        assert "test-run-recorded" in remediation
        assert _round_transitions_in(remediation) == []

    # -- STRUCTURAL ----------------------------------------------------

    def test_the_windows_still_bind_against_a_hand_built_ledger(
        self, repo: Path
    ):
        """The gate's one-post-per-window rule is untouched.

        Asserted against a ledger written by hand rather than by the new
        call site: two round transitions covered by a single later post
        must still leave the first one unmet. If auto-posting had been
        implemented by widening the window (or by excusing the round
        transition), this is the test that would go green for the wrong
        reason.
        """
        set_dir = _set_dir(repo)
        base = datetime.now().astimezone()
        for offset, round_number in ((0, 1), (5, 2)):
            vs._append_round_ledger(
                vs.round_ledger_path(set_dir, 1),
                {
                    "event": vs.ROUND_EVENT_COMPLETED,
                    "sessionNumber": 1,
                    "verificationRound": round_number,
                    "phase": vs.PHASE_DISCOVERY,
                    "source": vs.ROUND_SOURCE_VERIFY_SESSION,
                    "verdict": "ISSUES_FOUND",
                    "blocking": True,
                    "endedLoop": False,
                    "recordedAt": (
                        base + timedelta(minutes=offset)
                    ).isoformat(),
                },
            )
        # One catch-up post after BOTH rounds -- the exact shape the
        # positional windows exist to refuse.
        (set_dir / "checklist-posts.jsonl").write_text(
            json.dumps(
                {
                    "sessionNumber": 1,
                    "postedAt": (base + timedelta(minutes=9)).isoformat(),
                    "stepCount": 1,
                    "surface": "text",
                    "inProgressStepKeys": [],
                }
            )
            + "\n",
            encoding="utf-8",
        )

        ok, remediation = _checklist_gate(set_dir)
        assert ok is False
        assert _round_transitions_in(remediation) == ["verification-round 1"]

    def test_a_ledger_failure_costs_the_round_nothing(
        self, repo: Path, monkeypatch, capsys
    ):
        """Fail-open, and NAMED (L-079-1).

        The checklist is bookkeeping appended after a metered call has
        already been paid for; an unwritable ledger must not turn a
        completed round into a failure, and it must not do so silently
        either.
        """
        _phase_config(monkeypatch, fan_out=1)
        set_dir = _set_dir(repo)
        monkeypatch.setattr(
            "ai_router.session_checklist.record_post",
            lambda *a, **k: None,
        )

        assert vs.run(
            _args(set_dir, phase=vs.PHASE_DISCOVERY),
            route_fn=FakeMultiRoute([VERIFIED_RESPONSE]),
        ) == vs.EXIT_OK

        captured = capsys.readouterr()
        assert "Session 1 step" in captured.out  # the render still happened
        assert "NOT recorded" in captured.err
        assert _posts(set_dir) == []

