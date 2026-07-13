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

    def test_untracked_text_content_is_inlined(self, repo: Path):
        # SS3: the verifier must see the CONTENT of a new (untracked) file, not
        # just its name -- git diff omits new-file content, so a reviewer would
        # otherwise grade incomplete evidence.
        (repo / "new_module.py").write_text(
            "def sneaky():\n    return 'backdoor'\n", encoding="utf-8"
        )
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        rendered = evidence.as_response_under_review()
        assert "new_module.py" in rendered
        assert "def sneaky" in rendered  # the CONTENT is inlined, not just named
        assert ("new_module.py", ) == tuple(
            p for p, _ in evidence.untracked_included
        )

    def test_untracked_binary_reported_uncovered_not_inlined(self, repo: Path):
        (repo / "blob.bin").write_bytes(b"\x00\x01\x02\xff\xfe\x00")
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        rendered = evidence.as_response_under_review()
        # A binary untracked file is NOT inlined but is flagged uncovered so it
        # is not mistaken for reviewed-clean.
        assert not any(p == "blob.bin" for p, _ in evidence.untracked_included)
        assert any(p == "blob.bin" for p, _ in evidence.untracked_omitted)
        assert "Uncovered untracked paths" in rendered
        assert "blob.bin" in rendered

    def test_untracked_oversized_reported_uncovered(self, repo: Path):
        big = "x = 1\n" * (vs._UNTRACKED_BYTE_CAP // 5)  # exceeds the cap
        (repo / "huge.py").write_text(big, encoding="utf-8")
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        assert any(
            p == "huge.py" and "oversized" in reason
            for p, reason in evidence.untracked_omitted
        )
        assert not any(p == "huge.py" for p, _ in evidence.untracked_included)

    def test_untracked_file_inside_new_directory_is_inlined(self, repo: Path):
        # GPT SS3 #2: git status --short lists only "newpkg/" for a new dir;
        # ls-files enumerates the files inside so their CONTENT is reviewed.
        (repo / "newpkg").mkdir()
        (repo / "newpkg" / "backdoor.py").write_text(
            "def backdoor():\n    return 1\n", encoding="utf-8"
        )
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        assert any(
            p.endswith("newpkg/backdoor.py")
            for p, _ in evidence.untracked_included
        )
        assert "def backdoor" in evidence.as_response_under_review()

    def test_nested_dist_is_excluded_but_reported_uncovered(self, repo: Path):
        # Set 089 (supersedes the SS3-era keep-src/dist behavior): excludes are
        # now depth-agnostic, so a `dist/` at ANY depth is treated as a
        # generated bundle. It is NOT inlined -- but, exactly like a top-level
        # excluded dir, it is reported as explicitly UNCOVERED (never silently
        # dropped), and its path also stays visible in the unfiltered git
        # status. Completeness is preserved at the path level; the flood is not.
        (repo / "src" / "dist").mkdir(parents=True)
        (repo / "src" / "dist" / "algorithm.py").write_text(
            "answer = 42\n", encoding="utf-8"
        )
        evidence = vs.assemble_evidence(
            _set_dir(repo), 1, "HEAD", vs.DEFAULT_DIFF_EXCLUDES
        )
        assert not any(
            p.endswith("src/dist/algorithm.py")
            for p, _ in evidence.untracked_included
        )
        assert any(
            p.endswith("src/dist/algorithm.py") and "excluded" in reason
            for p, reason in evidence.untracked_omitted
        )

    def test_nested_dist_bundle_excluded_from_diff(self, repo: Path):
        # Set 089 acceptance test: a NESTED generated bundle (tools/**/dist) is
        # excluded from the diff by DEFAULT -- no manual --exclude -- while a
        # real source file is still reviewed. This is the ~4,400-line flood that
        # churned a real session for 6 rounds; the fix retires the per-repo
        # `--exclude tools/dabbler-ai-orchestration/dist` workaround.
        nested = repo / "tools" / "dabbler-ai-orchestration" / "dist"
        nested.mkdir(parents=True)
        (nested / "bundle.js").write_text("GENERATED\n" * 500, encoding="utf-8")
        (repo / "real_src.py").write_text("real = True\n", encoding="utf-8")
        _git(repo, "add", "-A")
        evidence = vs.assemble_evidence(
            _set_dir(repo), 1, "HEAD", vs.DEFAULT_DIFF_EXCLUDES
        )
        assert "real = True" in evidence.diff
        assert "GENERATED" not in evidence.diff
        assert "bundle.js" not in evidence.diff
        # Set 089: the excluded TRACKED bundle path is reported explicitly
        # (never silently dropped) so the reviewer knows it changed.
        assert any(
            p.endswith("tools/dabbler-ai-orchestration/dist/bundle.js")
            for p in evidence.tracked_excluded
        )
        assert "Excluded tracked paths" in evidence.as_response_under_review()

    def test_tracked_source_under_dist_reported_not_silent(self, repo: Path):
        # Finding-1 completeness guarantee: a real (tracked) source file under a
        # dist/ dir is dropped from the diff BUT reported as an explicit "review
        # directly" path -- honest exclusion, never a silent removal.
        (repo / "src" / "dist").mkdir(parents=True)
        (repo / "src" / "dist" / "algorithm.py").write_text(
            "answer = 42\n", encoding="utf-8"
        )
        _git(repo, "add", "-A")
        evidence = vs.assemble_evidence(
            _set_dir(repo), 1, "HEAD", vs.DEFAULT_DIFF_EXCLUDES
        )
        assert "answer = 42" not in evidence.diff
        assert any(
            p.endswith("src/dist/algorithm.py")
            for p in evidence.tracked_excluded
        )
        assert "src/dist/algorithm.py" in evidence.as_response_under_review()

    def test_nested_generated_dirs_and_vsix_all_excluded(self, repo: Path):
        # The depth-agnostic treatment applies to every default-excluded dir
        # (out / node_modules / __pycache__) and to *.vsix, at any depth.
        for sub in ("out", "node_modules", "__pycache__"):
            d = repo / "pkg" / sub
            d.mkdir(parents=True)
            (d / "gen.txt").write_text("GENERATED\n", encoding="utf-8")
        deep = repo / "a" / "b" / "c"
        deep.mkdir(parents=True)
        (deep / "app.vsix").write_text("VSIXBYTES\n", encoding="utf-8")
        (repo / "keep.py").write_text("keep = 1\n", encoding="utf-8")
        _git(repo, "add", "-A")
        evidence = vs.assemble_evidence(
            _set_dir(repo), 1, "HEAD", vs.DEFAULT_DIFF_EXCLUDES
        )
        assert "keep = 1" in evidence.diff
        assert "GENERATED" not in evidence.diff
        assert "VSIXBYTES" not in evidence.diff

    def test_toplevel_excluded_dir_reported_uncovered_not_dropped(self, repo: Path):
        # GPT SS3 round-2 #1: a top-level generated file is excluded from
        # INLINING but must still be reported as explicitly UNCOVERED -- never
        # silently absent from both lists (a reviewer must know it exists).
        (repo / "dist").mkdir()
        (repo / "dist" / "bundle.js").write_text("generated\n", encoding="utf-8")
        evidence = vs.assemble_evidence(
            _set_dir(repo), 1, "HEAD", vs.DEFAULT_DIFF_EXCLUDES
        )
        assert not any("bundle.js" in p for p, _ in evidence.untracked_included)
        assert any(
            p.endswith("dist/bundle.js") and "excluded" in reason
            for p, reason in evidence.untracked_omitted
        )
        rendered = evidence.as_response_under_review()
        assert "Uncovered untracked paths" in rendered
        assert "dist/bundle.js" in rendered

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

    def test_build_prompt_carries_preclose_context(self, repo: Path):
        # Set 090: the assembled prompt states the pre-close (Step 6) context
        # independent of the template file, so the verifier is not misled into
        # flagging not-yet-created close-out artifacts as missing deliverables.
        evidence = vs.assemble_evidence(_set_dir(repo), 1, "HEAD", ())
        prompt = vs.build_prompt(evidence, 1, 1).lower()
        assert "pre-close" in prompt
        assert "happens after this verification" in prompt

    def test_load_verification_template_carries_review_scope(self):
        # Set 090: guard the RUNTIME loader (not only the file read directly in
        # the framing tests), so the actual verification prompt can never lose
        # the pre-close Review-scope carve-out that retires the recurring
        # circular category error.
        # Drop markdown emphasis and collapse whitespace so bold/line-wrap
        # formatting doesn't break the substring check.
        raw = vs.load_verification_template().lower()
        for ch in "*`_":
            raw = raw.replace(ch, "")
        template = " ".join(raw.split())
        assert "review scope" in template
        assert "before close-out" in template
        assert "their absence is never a finding" in template

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
        # Set 089: depth-agnostic glob pathspecs. A directory pattern gets both
        # the entry (**/dist) and its contents (**/dist/**) at any depth; a glob
        # pattern (*.vsix) gets only **/*.vsix (a /** suffix would be inert).
        specs = vs.build_diff_pathspecs(["dist", "*.vsix"])
        assert specs == [
            ".",
            ":(exclude,glob)**/dist",
            ":(exclude,glob)**/dist/**",
            ":(exclude,glob)**/*.vsix",
        ]
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

    def test_drifted_template_refuses_before_any_call(
        self, repo: Path, capsys, monkeypatch,
    ):
        """I-084-S2-11: an unbumped template edit is a controlled
        fail-closed exit (state error + remediation), never an
        unwinding traceback — and no metered call is made."""
        import ai_router.verification_stamp as vstamp

        monkeypatch.setattr(
            vstamp, "load_canonical_template",
            lambda: "A diluted, friendlier review template.",
        )
        set_dir = _set_dir(repo)
        fake = FakeRoute(response="VERIFIED -- checked.")
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_STATE
        assert fake.calls == []
        err = capsys.readouterr().err
        assert "version bump" in err
        assert not (set_dir / "s1-verification.md").exists()

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

    def test_truncated_result_is_verification_unavailable(self, repo: Path, capsys):
        # SS3: a truncated verifier response is INVALID evidence -> a hard
        # verification-unavailable outcome, NOT a warn-then-pass (was EXIT_OK).
        # Nothing is written, so the stamp row route() recorded binds an artifact
        # that never lands and cannot corroborate a close.
        set_dir = _set_dir(repo)

        def truncated_route(*a, **k):
            return FakeRouteResult(
                content="VERIFIED -- checked everyth", truncated=True
            )

        rc = vs.run(_args(set_dir), route_fn=truncated_route)
        assert rc == vs.EXIT_VERIFICATION_UNAVAILABLE
        assert "TRUNCATED" in capsys.readouterr().err
        # No artifact was written -> the recorded stamp row fails the close
        # gate's artifact-hash check and cannot settle a close.
        assert not (set_dir / "s1-verification.md").exists()


# ---------------------------------------------------------------------------
# Set 089: oversized-INPUT guard (mirror of the SS3 output-truncation guard)
# ---------------------------------------------------------------------------

class TestOversizedEvidenceGuard:
    def test_evidence_char_cap_env_override(self, monkeypatch):
        monkeypatch.delenv(vs._EVIDENCE_CHAR_CAP_ENV, raising=False)
        assert vs.evidence_char_cap() == vs._EVIDENCE_CHAR_CAP_DEFAULT
        monkeypatch.setenv(vs._EVIDENCE_CHAR_CAP_ENV, "12345")
        assert vs.evidence_char_cap() == 12345
        # Invalid / non-positive values fall back to the default (never 0/neg).
        for bad in ("0", "-5", "notanint", "  "):
            monkeypatch.setenv(vs._EVIDENCE_CHAR_CAP_ENV, bad)
            assert vs.evidence_char_cap() == vs._EVIDENCE_CHAR_CAP_DEFAULT

    def test_oversized_evidence_fails_closed_before_routing(
        self, repo: Path, monkeypatch, capsys
    ):
        # Evidence over the cap would be truncated at the verifier's context
        # boundary -> the verifier reviews PARTIAL evidence with no signal it is
        # partial. Fail closed BEFORE any metered call: no route, no artifact,
        # no disposition; the close stays BLOCKED.
        set_dir = _set_dir(repo)
        monkeypatch.setenv(vs._EVIDENCE_CHAR_CAP_ENV, "50000")
        (repo / "huge.py").write_text("x = 1  # pad\n" * 9000, encoding="utf-8")  # ~117 KB
        _git(repo, "add", "-A")
        fake = FakeRoute(response="VERIFIED")
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_VERIFICATION_UNAVAILABLE
        assert fake.calls == []  # nothing routed
        assert not (set_dir / "s1-verification.md").exists()
        err = capsys.readouterr().err
        assert "VERIFICATION UNAVAILABLE" in err
        assert "exceeds the cap" in err

    def test_under_cap_evidence_routes_normally(self, repo: Path, monkeypatch):
        # A modest change well under the cap routes as usual (the guard is
        # size-gated, not a blanket block).
        set_dir = _set_dir(repo)
        monkeypatch.setenv(vs._EVIDENCE_CHAR_CAP_ENV, "50000")
        (repo / "small.py").write_text("y = 2\n", encoding="utf-8")
        _git(repo, "add", "-A")
        fake = FakeRoute(response="VERIFIED -- fine.")
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_OK
        assert len(fake.calls) == 1  # guard did NOT trip

    def test_assemble_evidence_raises_when_oversized(self, repo: Path):
        # Finding 2: the guard is enforced at ASSEMBLY (not only the CLI), so a
        # direct, non-CLI caller of assemble_evidence also fails closed.
        (repo / "huge.py").write_text("x = 1  # pad\n" * 9000, encoding="utf-8")
        _git(repo, "add", "-A")
        with pytest.raises(vs.EvidenceTooLargeError):
            vs.assemble_evidence(
                _set_dir(repo), 1, "HEAD", (), max_evidence_chars=50_000
            )

    def test_assemble_evidence_under_cap_returns_bundle(self, repo: Path):
        (repo / "small.py").write_text("y = 2\n", encoding="utf-8")
        _git(repo, "add", "-A")
        bundle = vs.assemble_evidence(
            _set_dir(repo), 1, "HEAD", (), max_evidence_chars=1_000_000
        )
        assert "y = 2" in bundle.diff


# ---------------------------------------------------------------------------
# Cross-round issue ledger machinery (Set 096)
# ---------------------------------------------------------------------------

class TestCrossRoundLedger:
    """The settled-points ledger is MACHINERY (Set 096): assembled from prior
    rounds' immutable sN-issues*.json + the orchestrator's remediation-note
    sidecars, and prepended to the prompt -- retiring the hand-carried ledger
    file for the no-resurrection function."""

    def _write_issues(self, set_dir: Path, round_number: int, issues,
                      verdict: str = "ISSUES_FOUND") -> None:
        path = vs.issues_artifact_path(set_dir, 1, round_number)
        path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "sessionNumber": 1,
                    "verificationRound": round_number,
                    "verificationVerdict": verdict,
                    "issues": issues,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    def test_round_1_has_no_ledger(self, tmp_path: Path):
        assert vs.assemble_cross_round_ledger(tmp_path, 1, 1) == ""

    def test_no_prior_artifacts_yields_empty_even_on_round_3(
        self, tmp_path: Path
    ):
        assert vs.assemble_cross_round_ledger(tmp_path, 1, 3) == ""

    def test_prior_findings_rendered_with_severity_id_and_scenario(
        self, tmp_path: Path
    ):
        self._write_issues(tmp_path, 1, [
            {
                "description": "The gate fails open on a missing remote.",
                "severity": "Major",
                "issueId": "I-096-1",
                "failureScenario": "A remote-less consumer repo skips the gate.",
            },
            {"description": "An unrated observation."},
        ])
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert "**Round 1**" in ledger
        # S2: blocking findings additionally carry the machinery-assigned
        # ledger id the fix-verdict coverage check keys on.
        assert "[Major] (ledger id: L1) (id: I-096-1)" in ledger
        assert "fails open on a missing remote" in ledger
        assert "Failure scenario: A remote-less consumer repo" in ledger
        # An unrated finding is blocking (anti-laundering) -> numbered too.
        assert "[unrated] (ledger id: L2)" in ledger
        assert "ISSUES_FOUND -- 2 finding(s)" in ledger

    def test_no_resurrection_framing_requires_settlement_evidence(
        self, tmp_path: Path
    ):
        """The S1 round-1 Major, encoded: an issues artifact proves a finding
        was REPORTED, not settled. Settled framing is earned by a non-empty
        remediation sidecar (or a settling resolution status), never by the
        artifact's existence alone."""
        self._write_issues(tmp_path, 1, [{"description": "x"}])
        bare = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        # Without settlement evidence: the UNRESOLVED framing, and never the
        # no-resurrection rule.
        assert "NOT settled" in bare
        assert "re-raising an unsettled point is not resurrection" in bare
        assert "review error" not in bare
        assert "do not resurrect" not in bare
        # With the round's remediation note: the settled framing appears.
        vs.remediation_note_path(tmp_path, 1, 1).write_text(
            "Fixed and re-tested.", encoding="utf-8"
        )
        settled = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert "Settled points -- do not resurrect" in settled
        assert "never reopens under fresh wording" in settled
        # The one sanctioned reopen path: challenging a defective remediation.
        assert "REMEDIATION itself is defective" in settled

    def test_settling_resolution_status_earns_settled_framing(
        self, tmp_path: Path
    ):
        self._write_issues(tmp_path, 1, [
            {"description": "x", "severity": "Major",
             "resolution_status": "fixed"},
        ])
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert "Settled points -- do not resurrect" in ledger
        assert "[resolution: fixed]" in ledger
        assert "NOT settled" not in ledger

    def test_open_resolution_status_stays_unresolved_despite_sidecar(
        self, tmp_path: Path
    ):
        """A per-issue status takes precedence over the round sidecar: an
        explicitly OPEN status (escalate-human / needs-more-context / an
        unrecognized value) is never laundered into a settled point."""
        self._write_issues(tmp_path, 1, [
            {"description": "settled-one", "severity": "Major"},
            {"description": "still-open-one", "severity": "Major",
             "resolution_status": "escalate-human"},
        ])
        vs.remediation_note_path(tmp_path, 1, 1).write_text(
            "settled-one fixed.", encoding="utf-8"
        )
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        settled_block = ledger[ledger.index("Settled points"):
                               ledger.index("WITHOUT settlement evidence")]
        unresolved_block = ledger[ledger.index("WITHOUT settlement evidence"):]
        assert "settled-one" in settled_block
        assert "still-open-one" in unresolved_block

    def test_empty_sidecar_is_not_settlement_evidence(self, tmp_path: Path):
        self._write_issues(tmp_path, 1, [{"description": "x"}])
        vs.remediation_note_path(tmp_path, 1, 1).write_text(
            "", encoding="utf-8"
        )
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert "NOT settled" in ledger
        assert "it is not settlement evidence" in ledger
        assert "do not resurrect" not in ledger

    def test_remediation_sidecar_rendered(self, tmp_path: Path):
        self._write_issues(tmp_path, 1, [{"description": "x"}])
        vs.remediation_note_path(tmp_path, 1, 1).write_text(
            "Fixed by guarding the fallback branch.", encoding="utf-8"
        )
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert (
            "Remediation notes (round 1): Fixed by guarding the fallback"
            in ledger
        )

    def test_sidecar_without_issues_artifact_still_carried(
        self, tmp_path: Path
    ):
        vs.remediation_note_path(tmp_path, 1, 1).write_text(
            "Round 1 was adjudicated verbally.", encoding="utf-8"
        )
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert "Round 1 was adjudicated verbally." in ledger

    def test_unreadable_issues_artifact_reported_explicitly(
        self, tmp_path: Path
    ):
        vs.issues_artifact_path(tmp_path, 1, 1).write_text(
            "{not json", encoding="utf-8"
        )
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert "unreadable" in ledger
        assert "s1-issues.json" in ledger
        # A parse failure is never settlement evidence: the unreadable round
        # renders under the UNRESOLVED framing with a re-evaluate instruction.
        assert "RE-EVALUATE" in ledger
        assert "not settlement evidence" in ledger
        assert "do not resurrect" not in ledger

    def test_long_description_truncated_with_explicit_marker(
        self, tmp_path: Path
    ):
        self._write_issues(
            tmp_path, 1, [{"description": "word " * 500, "severity": "Major"}]
        )
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 2)
        assert "...[truncated -- see the round artifact]" in ledger

    def test_rounds_render_in_order(self, tmp_path: Path):
        self._write_issues(tmp_path, 1, [{"description": "first-round-point"}])
        self._write_issues(tmp_path, 2, [{"description": "second-round-point"}])
        ledger = vs.assemble_cross_round_ledger(tmp_path, 1, 3)
        assert ledger.index("**Round 1**") < ledger.index("**Round 2**")
        assert "first-round-point" in ledger
        assert "second-round-point" in ledger

    def test_remediation_note_path_naming(self, tmp_path: Path):
        assert vs.remediation_note_path(tmp_path, 2, 3).name == (
            "s2-remediation-round-3.md"
        )

    def test_build_prompt_places_ledger_after_conventions_before_plan(self):
        evidence = vs.EvidenceBundle(
            spec_excerpt="SPEC-EXCERPT-SENTINEL",
            git_status="",
            diff="",
            diff_base="HEAD",
        )
        prompt = vs.build_prompt(
            evidence, 1, 2,
            conventions="CONV-SENTINEL",
            ledger="LEDGER-SENTINEL",
        )
        i_conv = prompt.index("CONV-SENTINEL")
        i_ledger = prompt.index("LEDGER-SENTINEL")
        i_spec = prompt.index("SPEC-EXCERPT-SENTINEL")
        assert i_conv < i_ledger < i_spec

    def test_run_prepends_prior_round_ledger(self, repo: Path):
        set_dir = _set_dir(repo)
        # Round 1 already happened: raw artifact + findings envelope +
        # the orchestrator's remediation note.
        (set_dir / "s1-verification.md").write_text("r1", encoding="utf-8")
        self._write_issues(set_dir, 1, [
            {"description": "settled-point-alpha", "severity": "Major"},
        ])
        vs.remediation_note_path(set_dir, 1, 1).write_text(
            "alpha fixed in commit deadbeef", encoding="utf-8"
        )
        fake = FakeRoute(response="VERIFIED -- fixes confirmed.")
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_OK
        prompt = fake.calls[0]["prompt"]
        assert "Settled points -- do not resurrect" in prompt
        assert "settled-point-alpha" in prompt
        assert "alpha fixed in commit deadbeef" in prompt
        # The ledger rides BEFORE the session plan excerpt.
        assert prompt.index("settled-point-alpha") < prompt.index(
            "Build the widget"
        )

    def test_run_round_1_prompt_carries_no_ledger(self, repo: Path):
        set_dir = _set_dir(repo)
        fake = FakeRoute(response="VERIFIED -- checked.")
        rc = vs.run(_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_OK
        assert "Cross-round issue ledger" not in fake.calls[0]["prompt"]
