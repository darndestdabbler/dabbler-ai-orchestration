"""Cross-vendor review of a step: who reads it, and what survives reading."""
import re

import pytest

from ai_router import stepreview
from ai_router import verdict as verdictmod
from ai_router.route import NoCandidateError, RouteResult
from ai_router.stepreview import StepReviewError, build_prompt, review

CLEAN = "VERIFIED\nI checked the boundaries and the error paths."

ISSUES = """ISSUES FOUND

- Severity: Major
  Category: correctness
  A row with a trailing comma yields a field the model cannot hold.
"""

NIT = """ISSUES FOUND

NITS

- Severity: Minor
  Category: style
  The header casing is inconsistent.
"""


def _result(provider, content, model=None, simulated=False):
    return RouteResult(
        content=content, model_name=model or f"{provider}-model",
        model_id="x", provider=provider, input_tokens=1,
        output_tokens=1, escalated=False, escalation_history=[],
        elapsed_seconds=0.1, transport="offline",
        metadata={"simulated": True} if simulated else {},
    )


class FakeRouter:
    """Answers as a different vendor each call, and refuses one it was told
    to exclude — the constraint the real ``route()`` enforces.

    ``honour_exclusion=False`` reproduces the offline transport, which builds
    its single candidate without reading the exclusion at all.
    """

    def __init__(self, replies, honour_exclusion=True, simulated=False):
        self.replies = list(replies)
        self.honour_exclusion = honour_exclusion
        self.simulated = simulated
        self.calls = []

    def __call__(self, content, task_type, role, exclude_providers, transport):
        self.calls.append({
            "content": content, "exclude": list(exclude_providers or []),
            "role": role,
        })
        provider, body = self.replies.pop(0)
        if self.honour_exclusion and provider in (exclude_providers or []):
            raise NoCandidateError(f"{provider} is excluded")
        return _result(provider, body, simulated=self.simulated)


@pytest.fixture
def artifact(tmp_path):
    p = tmp_path / "plan.md"
    p.write_text("# The plan\n\nRead a CSV into a flat model.\n")
    return p


def _review(monkeypatch, replies, artifact, honour_exclusion=True,
            simulated=False, **kw):
    fake = FakeRouter(replies, honour_exclusion, simulated)
    monkeypatch.setattr(stepreview, "route", fake)
    outcome, raws = review(
        target="csv-demo", step="plan", artifact_paths=[str(artifact)], **kw
    )
    return outcome, raws, fake


class TestWhatIsReviewed:
    def test_a_missing_artifact_is_refused(self, tmp_path):
        with pytest.raises(StepReviewError, match="no artifact at"):
            review(target="t", step="plan",
                   artifact_paths=[str(tmp_path / "gone.md")])

    def test_naming_nothing_is_refused(self):
        with pytest.raises(StepReviewError, match="at least one artifact"):
            review(target="t", step="plan", artifact_paths=[])

    def test_an_oversize_artifact_is_refused_rather_than_truncated(self, tmp_path):
        big = tmp_path / "big.md"
        big.write_text("x" * (stepreview.MAX_ARTIFACT_CHARS + 1))
        with pytest.raises(StepReviewError, match="over the"):
            review(target="t", step="plan", artifact_paths=[str(big)])

    def test_the_shape_the_prompt_demands_is_the_shape_the_parser_reads(
            self, artifact):
        """The prompt and ``verdict.py`` are one contract. When they drifted,
        two real reviews came back as unparseable blobs with no severity."""
        prompt = build_prompt("csv-demo", "plan",
                              [(str(artifact), artifact.read_text())])
        block = re.search(r"^```\n(- \*\*Issue 1:.*?)^```$", prompt,
                          re.MULTILINE | re.DOTALL).group(1)
        reply = ("ISSUES FOUND\n\n" + block
                 .replace("Correctness / Completeness / Ambiguity", "Correctness")
                 .replace("Critical / Major", "Major"))
        parsed, findings = verdictmod.parse_verification_response(reply)
        assert parsed == "ISSUES_FOUND"
        assert len(findings) == 1
        assert findings[0]["severity"].lower() == "major"

    def test_the_prompt_states_what_the_step_owes(self, artifact):
        prompt = build_prompt("csv-demo", "decompose",
                              [(str(artifact), artifact.read_text())])
        assert "More than one candidate decomposition" in prompt
        assert "Read a CSV into a flat model." in prompt


class TestWhoReviews:
    def test_the_second_reviewer_never_shares_the_first_vendor(
            self, monkeypatch, artifact):
        _, _, fake = _review(
            monkeypatch, [("anthropic", CLEAN), ("openai", CLEAN)], artifact)
        assert "anthropic" in fake.calls[1]["exclude"]

    def test_the_author_provider_is_excluded_from_every_reader(
            self, monkeypatch, artifact):
        _, _, fake = _review(
            monkeypatch, [("openai", CLEAN), ("google", CLEAN)], artifact,
            author_provider="anthropic")
        assert all("anthropic" in c["exclude"] for c in fake.calls)

    def test_no_second_vendor_is_an_error_not_a_verdict(
            self, monkeypatch, artifact):
        with pytest.raises(StepReviewError, match="Cross-vendor review needs"):
            _review(monkeypatch, [("openai", CLEAN), ("openai", CLEAN)],
                    artifact)


class TestTheScriptedTransport:
    """``route()`` builds the offline candidate without consulting the
    exclusion, so the cross-vendor guarantee has to be checked here too."""

    def test_a_scripted_round_is_marked_as_one(self, monkeypatch, artifact):
        outcome, _, _ = _review(
            monkeypatch, [("offline", CLEAN), ("offline", CLEAN)], artifact,
            honour_exclusion=False, simulated=True)
        assert outcome.simulated is True

    def test_one_vendor_answering_twice_is_refused_not_recorded(
            self, monkeypatch, artifact):
        with pytest.raises(StepReviewError, match="despite being excluded"):
            _review(monkeypatch, [("openai", CLEAN), ("openai", CLEAN)],
                    artifact, honour_exclusion=False)


class TestWhatSurvives:
    def test_either_reviewer_blocking_blocks(self, monkeypatch, artifact):
        outcome, _, _ = _review(
            monkeypatch, [("anthropic", CLEAN), ("openai", ISSUES)], artifact)
        assert outcome.blocked is True
        assert outcome.verdict == "blocked"

    def test_every_finding_is_kept_and_names_who_raised_it(
            self, monkeypatch, artifact):
        outcome, _, _ = _review(
            monkeypatch, [("anthropic", CLEAN), ("openai", NIT)], artifact)
        assert outcome.blocked is False
        assert len(outcome.findings) == 1
        assert outcome.findings[0]["reviewer"] == "openai-model/openai"

    def test_each_reply_comes_back_verbatim_for_filing(
            self, monkeypatch, artifact):
        _, raws, _ = _review(
            monkeypatch, [("anthropic", CLEAN), ("openai", ISSUES)], artifact)
        assert raws == [CLEAN, ISSUES]
