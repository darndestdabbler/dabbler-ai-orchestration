"""Cross-vendor review of a step's output.

This is the half of the six-step driver that calls something. ``workflow.py``
records where work is; this decides whether a step's output survives two
readers who did not write it.

**Two reviewers, and the second may not share a vendor with the first.** The
exclusion is passed to ``route()``, and checked again here against the
providers that actually answered. Both halves are needed: the offline
transport builds its one candidate without consulting the exclusion, so a
scripted run would otherwise record two reviewers that were one queue.

**A scripted review is marked as one.** Nothing served by the offline
transport is allowed to read as a cross-vendor result, because a record that
cannot be told apart from the real thing is worse than no record.

Verdicts are parsed and blocking is decided by :mod:`ai_router.verdict`, the
same code the session verifier uses. There is one implementation of "does this
finding block", and this module is not it.

Every finding is kept, whatever its severity. Severity describes; it does not
select what gets written down.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from ai_router import verdict as verdictmod
from ai_router.route import NoCandidateError, route
from ai_router.selection import ROLE_VERIFIER
from ai_router.solution import STEP_DELIVERABLES, STEP_TITLES

#: How many readers a step needs before it may move on. Two, from different
#: vendors: one model checking a sibling's work agrees with it too often.
REVIEWERS_REQUIRED = 2

MAX_ARTIFACT_CHARS = 40_000


class StepReviewError(Exception):
    """The review could not be run. Never a verdict — an absent review and a
    clean review are different facts and must stay distinguishable."""


@dataclass(frozen=True)
class ReviewerOutcome:
    provider: str
    model: str
    verdict: str
    findings: list = field(default_factory=list)
    blocking: bool = False
    blocking_reason: str = ""
    #: Served by a script rather than a vendor. Never inferred downstream.
    simulated: bool = False

    def as_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "verdict": self.verdict,
            "blocking": self.blocking,
            "blockingReason": self.blocking_reason,
            "simulated": self.simulated,
            "findings": list(self.findings),
        }


@dataclass(frozen=True)
class StepReview:
    target: str
    step: str
    reviewers: list
    artifacts: list
    #: What each artifact contained when it was sent, keyed by path. A later
    #: round decides whether a finding was answered by comparing against
    #: this, so it must be the digest of the text that actually went to the
    #: reviewers rather than of whatever the file says afterwards.
    artifact_digests: dict = field(default_factory=dict)

    @property
    def blocked(self) -> bool:
        """Either reviewer blocking blocks. Agreement is not required to
        stop; it is required to proceed."""
        return any(r.blocking for r in self.reviewers)

    @property
    def verdict(self) -> str:
        return "blocked" if self.blocked else "clear"

    @property
    def simulated(self) -> bool:
        """True if any reader was scripted. One scripted reviewer is enough
        to stop the round being a cross-vendor result."""
        return any(r.simulated for r in self.reviewers)

    @property
    def live(self) -> bool:
        """True if any reader was a vendor rather than a script.

        This is what the round cap counts. A round that reached no vendor
        spent nothing and bounding it would bound the wrong thing; a round
        that reached one did spend, whatever the other reader was.
        """
        return any(not r.simulated for r in self.reviewers)

    @property
    def findings(self) -> list:
        out = []
        for r in self.reviewers:
            for f in r.findings:
                out.append({**f, "reviewer": f"{r.model}/{r.provider}"})
        return out


def digest_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_artifacts(paths) -> list:
    """Each artifact as ``(path, text)``. A named file that is not there is
    refused, because a review of nothing returns clean."""
    out = []
    for raw in paths:
        p = Path(raw)
        if not p.is_file():
            raise StepReviewError(
                f"no artifact at {p}. A step is reviewed by reading what it "
                "produced; a missing file would be reviewed as though the "
                "step delivered nothing wrong."
            )
        text = p.read_text(encoding="utf-8", errors="replace")
        if len(text) > MAX_ARTIFACT_CHARS:
            raise StepReviewError(
                f"{p} is {len(text)} characters, over the {MAX_ARTIFACT_CHARS} "
                "limit. Truncating it would hand the reviewer a partial "
                "document and record the verdict as though it read the whole."
            )
        out.append((str(p), text))
    return out


def build_prompt(target: str, step: str, artifacts: list) -> str:
    """What the reviewer is asked. The step's obligations come from
    :data:`ai_router.solution.STEP_DELIVERABLES`, so the prompt and the tree
    cannot describe the same step differently."""
    body = [
        "You are reviewing one step of a solution being built in six steps.",
        "A different AI produced the work below. You did not write it and owe "
        "it nothing. Assume it is flawed and try to prove it; a rubber stamp "
        "is a failed review, and so is a finding manufactured to avoid one.",
        "",
        f"## The step: {STEP_TITLES[step]}",
        "",
        f"**Under review:** `{target}`",
        "",
        "**What this step owes:**",
        "",
        STEP_DELIVERABLES[step],
        "",
        "## What it produced",
        "",
    ]
    for path, text in artifacts:
        body += [f"### `{path}`", "", "````", text.rstrip(), "````", ""]

    body += [
        "## How to answer",
        "",
        "Begin your reply with exactly one of these two words on its own "
        "line:",
        "",
        "- **VERIFIED** — you tried to break it and could not. Say in one or "
        "two sentences what you actually checked.",
        "- **ISSUES FOUND** — there are defects that must be fixed first.",
        "",
        "Only Critical or Major findings justify ISSUES FOUND. A finding is "
        "Major only if you can state the concrete failure scenario and say "
        "why it is probable rather than merely possible. Anything whose "
        "probability is low or whose impact is small is Minor, however "
        "correct the observation — put those under a **NITS** heading.",
        "",
        "Write every finding in exactly this shape, one block each. The "
        "record is read mechanically: a finding in any other shape is filed "
        "whole, without its severity, and cannot be counted or sorted.",
        "",
        "```",
        "- **Issue 1:** one-line statement of the defect",
        "  - **Category:** Correctness / Completeness / Ambiguity",
        "  - **Severity:** Critical / Major",
        "  - **Failure scenario:** the concrete scenario in which this bites "
        "a real user, and why it is probable rather than merely possible",
        "  - **Evidence paths:** the artifact path(s) above this finding is "
        "about, exactly as they are headed",
        "```",
        "",
        "Number them upward: `Issue 1:`, `Issue 2:`, and so on. Minor "
        "findings go under a `NITS` heading as ordinary bullets, and keep "
        "their `Severity:` label there.",
        "",
        "**Cite an evidence path on every blocking finding.** A later round "
        "decides whether a finding was answered by checking whether what it "
        "cited changed; a finding that cites nothing names no site to check "
        "and can never be shown to have been fixed.",
    ]
    return "\n".join(body)


def _review_once(prompt: str, exclude: list, transport):
    try:
        result = route(
            content=prompt,
            task_type="verification",
            role=ROLE_VERIFIER,
            exclude_providers=exclude,
            transport=transport,
        )
    except NoCandidateError as exc:
        raise StepReviewError(
            f"{exc}. Cross-vendor review needs {REVIEWERS_REQUIRED} providers "
            "that are not the author's; configure another or the step cannot "
            "be reviewed."
        ) from exc
    parsed, findings = verdictmod.parse_verification_response(result.content)
    blocking = verdictmod.classify_blocking(parsed, findings)
    return ReviewerOutcome(
        provider=result.provider,
        model=result.served_model_id or result.model_name,
        verdict=parsed,
        findings=findings,
        blocking=blocking.blocking,
        blocking_reason=blocking.reason,
        simulated=bool((result.metadata or {}).get("simulated")),
    ), result.content


def review(
    target: str,
    step: str,
    artifact_paths,
    author_provider: Optional[str] = None,
    transport: Optional[str] = None,
) -> tuple:
    """Run the step past two providers, neither of them the author's.

    Returns ``(StepReview, [raw response, ...])`` — the raw text is returned
    so the caller can file it verbatim. A summary is not a record.
    """
    if step not in STEP_TITLES:
        raise StepReviewError(f"unknown step '{step}'")
    artifacts = read_artifacts(artifact_paths)
    if not artifacts:
        raise StepReviewError(
            "name at least one artifact. A step with nothing to show has not "
            "finished, and reviewing nothing returns clean."
        )

    prompt = build_prompt(target, step, artifacts)
    exclude = [author_provider] if author_provider else []

    outcomes, raws = [], []
    for _ in range(REVIEWERS_REQUIRED):
        outcome, raw = _review_once(prompt, list(exclude), transport)
        if not outcome.simulated and outcome.provider in exclude:
            raise StepReviewError(
                f"{outcome.provider} answered despite being excluded, so this "
                "would be recorded as a cross-vendor review by one vendor. "
                "Refusing to write it."
            )
        outcomes.append(outcome)
        raws.append(raw)
        # The next reviewer may not be this one's vendor. route() enforces it
        # on the live transports; the check above enforces it here, because
        # the offline transport builds its candidate without the exclusion.
        exclude.append(outcome.provider)

    return StepReview(
        target=target, step=step, reviewers=outcomes,
        artifacts=[p for p, _ in artifacts],
        artifact_digests={p: digest_text(text) for p, text in artifacts},
    ), raws
