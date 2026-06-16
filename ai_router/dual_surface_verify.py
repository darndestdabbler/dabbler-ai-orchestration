"""Set 070 (S1) - the dual-surface ("overdetermined") verification runner.

Runs **both** verification surfaces over the **same committed state**, with
**provider and adversarial framing held EQUAL across arms** (a steelman of each
surface, isolating *surface* as the only variable):

- **PUSH arm** - snippet-fed, single-shot, **no repository access**. The
  committed diff is fed inline under the ``verification.md`` template (Set 070
  strong devil's-advocate framing). This is the routed ``session-verification``
  surface, **pinned** to the chosen provider/model. We pin the provider rather
  than letting :func:`ai_router.route` pick it, because the dual-surface
  comparison *requires* provider held equal (L-069-2) and ``route``'s rule-based
  verifier selection cannot guarantee that.
- **PULL arm** - repository-reading, agentic tool loop. :func:`pull_route` over
  the repo at the committed state under the ``path-aware-critique.md`` template
  (strong devil's-advocate framing).

**Scope of Session 1.** S1 ships **only** the two-arm runner: it returns both
arms' RAW verdicts plus a recorded **attestation** that provider, model, and
framing strength were equal across arms. There is **NO merge yet** (S2 adds the
provenance merge + the fair-shake scoring; S2 wires the recorded
``verificationMode``-pattern option and the CLI).

**Why framing is enforced here, not trusted.** L-069-2: framing strength is a
cheap, prompt-only lever orthogonal to surface and provider count; a push-vs-pull
comparison whose arms used *unequal* framing is **invalid as RETIRE evidence**.
So this runner derives each arm's framing strength from the **actual template
text** (never a hand-asserted label) and, by default, **refuses** (raises
:class:`UnequalArmsError`) if provider, model, or framing strength differ. The
attestation that they were equal is part of the returned result.

No metered LLM call happens at import. Both arms are injectable (``run_push`` /
``run_pull``) so unit tests fake them; the production defaults are
:func:`_default_run_push` (a provider-pinned single-shot via
:func:`ai_router.providers.call_model`) and :func:`pull_route`.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple, Union

try:  # package + bare-filename import shim (matches the test convention)
    from .providers import APIResult, call_model
    from .pull_verifier import (
        DiffConfig,
        PullCaps,
        PullResult,
        _dispatch_get_diff,
        _load_router_config,
        _pricing_for,
        _provider_config,
        _resolve_gen_params,
        _resolve_model,
        caps_from_config,
        pull_route,
    )
    from .pull_critique import _default_sandbox_for, build_instruction, prompt_body_of
    from .verification import build_verification_prompt, parse_verification_response
    from .replacement_gate import validate_benchmark_registration
except ImportError:  # pragma: no cover - test/bare context
    from providers import APIResult, call_model  # type: ignore
    from pull_verifier import (  # type: ignore
        DiffConfig,
        PullCaps,
        PullResult,
        _dispatch_get_diff,
        _load_router_config,
        _pricing_for,
        _provider_config,
        _resolve_gen_params,
        _resolve_model,
        caps_from_config,
        pull_route,
    )
    from pull_critique import (  # type: ignore
        _default_sandbox_for,
        build_instruction,
        prompt_body_of,
    )
    from verification import (  # type: ignore
        build_verification_prompt,
        parse_verification_response,
    )
    from replacement_gate import validate_benchmark_registration  # type: ignore


# ---------------------------------------------------------------------------
# Framing strength classification
#
# Derived from the ACTUAL template text so the equal-framing attestation is a
# measurement, not a hand-asserted label. The ladder mirrors L-069-2's three
# observed framing strengths; the runner's invariant is only that both arms sit
# at the SAME rung (and, by default, that the rung is ADVERSARIAL).
# ---------------------------------------------------------------------------

FRAMING_ADVERSARIAL = "adversarial-devils-advocate"
FRAMING_MODERATE = "moderate-find-every-defect"
FRAMING_WEAK = "weak-evaluate-objectively"
FRAMING_UNKNOWN = "unknown"

# The load-bearing markers that distinguish a genuine devil's-advocate framing
# (matched case-insensitively, the same phrases the framing-pin test pins).
_ADVERSARIAL_MARKERS = ("devil's advocate", "assume the work is flawed")


def classify_framing_strength(template_text: str) -> str:
    """Classify a prompt's adversarial framing strength from its text.

    ADVERSARIAL requires the devil's-advocate stance ("devil's advocate" +
    "assume the work is flawed"). Otherwise we fall back to MODERATE
    ("find every defect"-style) or WEAK ("evaluate objectively"); UNKNOWN when
    none of the signatures are present. The runner's equal-framing invariant
    only compares the resulting label across arms, so a weakened push template
    drops to a different label and trips :class:`UnequalArmsError`.
    """
    low = (template_text or "").lower()
    if all(marker in low for marker in _ADVERSARIAL_MARKERS):
        return FRAMING_ADVERSARIAL
    if "find every defect" in low or "find all defects" in low:
        return FRAMING_MODERATE
    if "evaluate objectively" in low or "evaluate it objectively" in low:
        return FRAMING_WEAK
    return FRAMING_UNKNOWN


@dataclass(frozen=True)
class ArmFraming:
    """The adversarial framing a verification arm ran under."""

    strength: str  # one of the FRAMING_* labels (derived from the template text)
    template: str  # the template filename / identifier that supplied the framing

    def to_dict(self) -> dict:
        return {"strength": self.strength, "template": self.template}


class DualSurfaceError(Exception):
    """The dual-surface runner could not run an arm."""


class UnequalArmsError(DualSurfaceError):
    """The two arms were not held equal (provider / model / framing differ).

    Raised by default so a comparison can never be produced with an uncontrolled
    framing or provider axis - which would be invalid as RETIRE evidence
    (L-069-2). Pass ``require_equal=False`` to capture an intentionally-unequal
    run for inspection (the attestation still records the inequality).
    """


@dataclass
class PushArmResult:
    """The push (snippet-fed, single-shot) arm's outcome."""

    provider: str
    model: str
    verdict: str  # "VERIFIED" / "ISSUES_FOUND"
    issues: List[dict]  # parsed via parse_verification_response
    raw: str  # the verifier's raw text (saved utf-8 by the caller)
    framing: ArmFraming
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0

    def to_dict(self) -> dict:
        return {
            "surface": "push",
            "provider": self.provider,
            "model": self.model,
            "verdict": self.verdict,
            "issues": self.issues,
            "framing": self.framing.to_dict(),
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": round(self.cost_usd, 6),
        }


@dataclass
class PullArmResult:
    """The pull (repo-reading, agentic) arm's outcome."""

    provider: str
    model: str
    verdict: str  # the forced submit_verdict verdict (or "NO_VERDICT")
    findings: List[dict]  # critique-entry findings (severity/category/description)
    ok: bool  # schema-valid verdict AND at least one probe ran
    framing: ArmFraming
    critique: Optional[dict] = None  # the full to_critique_entry() payload
    stop_reason: str = ""
    cost_usd: float = 0.0

    def to_dict(self) -> dict:
        return {
            "surface": "pull",
            "provider": self.provider,
            "model": self.model,
            "verdict": self.verdict,
            "findings": self.findings,
            "ok": self.ok,
            "framing": self.framing.to_dict(),
            "critique": self.critique,
            "stop_reason": self.stop_reason,
            "cost_usd": round(self.cost_usd, 6),
        }


@dataclass
class DualSurfaceRun:
    """Both arms' raw verdicts over one committed state. NO merge (S1)."""

    session_set: str
    committed_ref: str  # the diff range the push arm reviewed (provenance)
    sandbox_dir: str  # the repo the pull arm read
    provider: str
    model: str
    push: PushArmResult
    pull: PullArmResult
    framing_equal: bool
    attestation: dict

    def to_dict(self) -> dict:
        return {
            "schemaVersion": 1,
            "kind": "dual_surface_run",
            "sessionSet": self.session_set,
            "committedRef": self.committed_ref,
            "sandboxDir": self.sandbox_dir,
            "provider": self.provider,
            "model": self.model,
            "framingEqual": self.framing_equal,
            "attestation": self.attestation,
            "push": self.push.to_dict(),
            "pull": self.pull.to_dict(),
        }


# ---------------------------------------------------------------------------
# Template loading
# ---------------------------------------------------------------------------

def _prompt_templates_dir() -> Path:
    return Path(__file__).resolve().parent / "prompt-templates"


def load_push_template() -> str:
    """Return the push verification prompt template (``verification.md``)."""
    path = _prompt_templates_dir() / "verification.md"
    return path.read_text(encoding="utf-8")


def load_pull_template() -> str:
    """Return the RAW pull critique prompt template (``path-aware-critique.md``).

    The framing strength is classified from this **raw template text**, never
    from the rendered (placeholder-filled) instruction: the rendered instruction
    splices in session-specific content (the change summary / claims / file
    list), which could otherwise *spoof* the devil's-advocate markers and make a
    weakened template read as ``adversarial``. Classifying the raw bytes pins the
    framing to the template the operator controls, not to attacker-influenced
    interpolation.
    """
    path = _prompt_templates_dir() / "path-aware-critique.md"
    return path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# The default arm runners (production). Both are injectable for tests.
# ---------------------------------------------------------------------------

@dataclass
class _PushRaw:
    """The provider-pinned single-shot push result, pre-parse.

    ``provider`` / ``model`` are the identities the arm **actually** ran under -
    echoed back so the runner can VERIFY (not assume) that both arms used the
    same provider/model. A run_push fake that leaves them empty is treated as
    "could not confirm equal", which is the honest default.
    """

    content: str
    provider: str = ""
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


def _default_run_push(
    *,
    provider: str,
    model: str,
    prompt: str,
    max_output_tokens: int,
    provider_config: dict,
    generation_params: dict,
) -> _PushRaw:
    """Run the push arm: one provider-pinned, snippet-fed, no-tools completion.

    Mirrors how :func:`ai_router.route` invokes :func:`providers.call_model`,
    but with the provider/model **pinned** (held equal to the pull arm). The
    whole filled ``verification.md`` prompt is the user message; there is no
    system prompt and no tool surface - that snippet-fed, repo-blind shape is
    exactly the *surface* variable the comparison isolates. The provider/model
    actually used are echoed back so the equal-arms attestation is a measurement.
    """
    api: APIResult = call_model(
        provider_name=provider,
        model_id=model,
        system_prompt="",
        user_message=prompt,
        max_tokens=max_output_tokens,
        config=provider_config,
        generation_params=generation_params,
    )
    return _PushRaw(
        content=api.content,
        provider=provider,
        model=model,
        input_tokens=api.input_tokens,
        output_tokens=api.output_tokens,
    )


# ---------------------------------------------------------------------------
# The two-arm runner
# ---------------------------------------------------------------------------

def run_dual_surface(
    session_set_dir: Union[str, Path],
    *,
    base_ref: str,
    head_ref: str = "",
    provider: str = "anthropic",
    model: Optional[str] = None,
    sandbox_dir: Optional[Union[str, Path]] = None,
    push_template: Optional[str] = None,
    pull_template: Optional[str] = None,
    config: Optional[dict] = None,
    caps: Optional[PullCaps] = None,
    require_equal: bool = True,
    run_push: Callable[..., _PushRaw] = _default_run_push,
    run_pull: Callable[..., PullResult] = pull_route,
) -> DualSurfaceRun:
    """Run the push and pull arms over the same committed state, equal-held.

    Parameters
    ----------
    base_ref / head_ref:
        The operator-pinned diff range the **push** arm reviews as its snippet
        (``git diff base_ref..head_ref``; empty ``head_ref`` => the working
        tree). The **pull** arm reads ``sandbox_dir`` (its working tree). For a
        true same-committed-state comparison the caller pins ``head_ref`` to the
        committed ref AND points ``sandbox_dir`` at a checkout of that ref; when
        ``head_ref`` is empty the push arm reviews the *worktree* diff and the
        provenance is recorded honestly as ``"{base_ref}..WORKTREE"`` so the
        ``committedRef`` field never overstates what was actually reviewed. (A
        frozen-checkout materialization of both arms is an S2/S3 enhancement.)
    provider / model:
        Held **equal** across both arms by construction (one variable drives
        both arm calls), and the equality is then **verified** against each arm's
        actual reported provider/model - never assumed (see ``attestation``).
        ``model`` defaults to the configured pull-verifier model pin for
        ``provider`` so both arms run the identical model - maximal equality.
    sandbox_dir:
        The repo the pull arm reads. Defaults to the git repo root containing the
        session-set dir (:func:`pull_critique._default_sandbox_for`), never
        ``Path.cwd()`` (the L-067-1 under-scope hazard).
    push_template / pull_template:
        The **raw** template text that is each arm's SINGLE source of truth
        (defaults: ``verification.md`` / ``path-aware-critique.md``). For each
        arm the framing is classified from the template's prompt body AND the
        executed prompt is rendered from that **same** template body - so the
        classified framing can never drift from what actually runs, and
        session-specific interpolation (filled into placeholders) can never spoof
        the adversarial markers (classification is on the *unfilled* body).
    require_equal:
        When True (default) a provider / model / framing-strength mismatch raises
        :class:`UnequalArmsError` (framing mismatch refuses *before* any metered
        call; a provider/model mismatch refuses *after* the arms report their
        actual identities). When False the run proceeds and the ``attestation``
        records the inequality (for deliberate inspection only - never as RETIRE
        evidence).
    run_push / run_pull:
        Injection seams; tests pass fakes so no metered call is made.

    Returns
    -------
    DualSurfaceRun
        Both arms' raw verdicts + the equal-framing attestation. **No merge** -
        S2 adds the provenance merge + scoring.
    """
    set_dir = Path(session_set_dir).resolve()
    if not set_dir.is_dir():
        raise DualSurfaceError(f"session set dir is not a directory: {set_dir}")

    if config is None:
        config = _load_router_config()
    model = _resolve_model(provider, model, config)
    if caps is None:
        caps = caps_from_config(config)
    if sandbox_dir is None:
        sandbox_dir = _default_sandbox_for(set_dir)
    sandbox_dir = Path(sandbox_dir).resolve()

    repo_root = str(sandbox_dir)
    diff_cfg = DiffConfig(repo_root=repo_root, base_ref=base_ref, head_ref=head_ref)
    # Honest provenance: an empty head_ref means the push arm reviewed the diff
    # against the WORKTREE, not a second committed ref - label it as such so the
    # committedRef field never misstates what was actually reviewed.
    committed_ref = f"{base_ref}..{head_ref}" if head_ref else f"{base_ref}..WORKTREE"

    # ---- Resolve each arm's framing from its SINGLE-source raw template ----
    # Each arm has exactly ONE prompt source: ``push_template`` / ``pull_template``.
    # The framing is classified from that template's prompt BODY, and the prompt
    # that is actually EXECUTED is rendered from the SAME body. There is no second
    # "instruction" input that could diverge from what was classified, so the
    # equal-framing attestation can never drift from what runs. Classification is
    # on the *unfilled* body, so placeholder interpolation (the diff snippet, the
    # set's change summary) can never spoof the adversarial markers.
    push_overridden = push_template is not None
    pull_overridden = pull_template is not None
    if push_template is None:
        push_template = load_push_template()
    if pull_template is None:
        pull_template = load_pull_template()
    pull_body = prompt_body_of(pull_template)
    pull_instruction = build_instruction(set_dir, template_text=pull_template)
    push_framing = ArmFraming(
        strength=classify_framing_strength(push_template),
        template="verification.md" if not push_overridden else "(custom-push)",
    )
    pull_framing = ArmFraming(
        strength=classify_framing_strength(pull_body),
        template="path-aware-critique.md" if not pull_overridden else "(custom-pull)",
    )

    # ---- Framing gate (BEFORE spending any metered call) ----
    # Framing strength is knowable from the templates alone, so a framing
    # mismatch refuses up front - no metered call is wasted on a known-invalid
    # comparison. Provider/model equality is verified AFTER the arms report
    # their actual identities (below), since only the run can confirm them.
    framing_equal = push_framing.strength == pull_framing.strength
    both_adversarial = (
        push_framing.strength == FRAMING_ADVERSARIAL
        and pull_framing.strength == FRAMING_ADVERSARIAL
    )
    if require_equal and not (framing_equal and both_adversarial):
        raise UnequalArmsError(
            "dual-surface arms not held equal at strong adversarial framing: "
            f"push={push_framing.strength!r} pull={pull_framing.strength!r}. "
            "A comparison with unequal/non-adversarial framing is invalid as "
            "RETIRE evidence (L-069-2). Upgrade the weaker template or pass "
            "require_equal=False to capture the inequality for inspection only."
        )

    # ---- PUSH arm: snippet-fed single-shot over the committed diff ----
    snippet, is_error, _elided = _dispatch_get_diff(diff_cfg)
    if is_error:
        raise DualSurfaceError(
            f"push arm could not resolve the committed diff for {committed_ref!r}: "
            f"{snippet}"
        )
    push_prompt = build_verification_prompt(
        original_task=(
            f"Review the committed change set for session set {set_dir.name} "
            f"(diff range {committed_ref}). Find every defect."
        ),
        original_response=snippet,
        task_type="session-verification",
        template=push_template,
    )
    pcfg = _provider_config(provider, config)
    gen_params = _resolve_gen_params(provider, config)
    push_raw = run_push(
        provider=provider,
        model=model,
        prompt=push_prompt,
        max_output_tokens=caps.max_output_tokens,
        provider_config=pcfg,
        generation_params=gen_params,
    )
    push_verdict, push_issues = parse_verification_response(push_raw.content)
    in_price, out_price = _pricing_for(model, config)
    push_cost = (
        push_raw.input_tokens / 1_000_000.0 * in_price
        + push_raw.output_tokens / 1_000_000.0 * out_price
    )
    push_result = PushArmResult(
        # The identities the push arm ACTUALLY reported (echoed by run_push), so
        # the attestation below verifies equality rather than assuming it.
        provider=push_raw.provider,
        model=push_raw.model,
        verdict=push_verdict,
        issues=push_issues,
        raw=push_raw.content,
        framing=push_framing,
        input_tokens=push_raw.input_tokens,
        output_tokens=push_raw.output_tokens,
        cost_usd=push_cost,
    )

    # ---- PULL arm: repo-reading agentic loop over the same committed state ----
    pull_res: PullResult = run_pull(
        sandbox_dir,
        pull_instruction,
        provider=provider,
        model=model,
        caps=caps,
        config=config,
    )
    critique = pull_res.critique
    pull_result = PullArmResult(
        provider=pull_res.provider,
        model=pull_res.model,
        verdict=(critique.verdict if critique is not None else "NO_VERDICT"),
        findings=[f.to_dict() for f in (critique.findings if critique else ())],
        ok=pull_res.ok,
        framing=pull_framing,
        critique=(critique.to_critique_entry() if critique is not None else None),
        stop_reason=pull_res.trace.stop_reason,
        cost_usd=pull_res.trace.cost_usd,
    )

    # ---- Equal-arms attestation (DERIVED from each arm's ACTUAL identity) ----
    # providerEqual / modelEqual are measured: the requested pair must match what
    # BOTH arms actually reported. A run_push fake that omits its identity, or a
    # pull binding that ran a different model, falsifies equality here rather than
    # being silently assumed true (honest telemetry; never hand-asserted).
    provider_equal = (
        push_result.provider == provider and pull_result.provider == provider
    )
    model_equal = push_result.model == model and pull_result.model == model
    attestation = {
        "providerEqual": provider_equal,
        "modelEqual": model_equal,
        "framingEqual": framing_equal,
        "pushFraming": push_framing.to_dict(),
        "pullFraming": pull_framing.to_dict(),
        "bothAdversarial": both_adversarial,
        "requestedProvider": provider,
        "requestedModel": model,
        "pushProvider": push_result.provider,
        "pushModel": push_result.model,
        "pullProvider": pull_result.provider,
        "pullModel": pull_result.model,
    }
    if require_equal and not (provider_equal and model_equal):
        raise UnequalArmsError(
            "dual-surface arms did not run on the equal provider/model: "
            f"requested {provider}/{model}; push ran "
            f"{push_result.provider}/{push_result.model}; pull ran "
            f"{pull_result.provider}/{pull_result.model}. A comparison whose "
            "arms differ in provider/model is invalid as RETIRE evidence "
            "(surface is no longer the only variable). Pass require_equal=False "
            "to capture the inequality for inspection only."
        )

    return DualSurfaceRun(
        session_set=set_dir.name,
        committed_ref=committed_ref,
        sandbox_dir=repo_root,
        provider=provider,
        model=model,
        push=push_result,
        pull=pull_result,
        framing_equal=framing_equal,
        attestation=attestation,
    )


# ===========================================================================
# Session 2: the provenance merge
#
# Combine the two arms' findings into ONE result where every finding is labeled
# by the surface(s) that caught it - ``push-only`` / ``pull-only`` / ``both`` -
# the disjoint sets being the deliverable, not a side effect (the "provenance or
# it didn't happen" standard). The load-bearing rule, carried directly from the
# Set 069 S6 floor-ratchet coverage lesson: **a free-text description is not an
# identity.** Two findings merge to ``both`` ONLY when they share a non-empty,
# stable ``defectKey`` assigned by the operator/harness mapping step (on the Set
# 069 benchmark that key is the ground-truth case id). The merge NEVER infers
# identity from wording, so a push-only and a pull-only finding describing the
# same defect cannot *silently* collapse - and, just as important, two genuinely
# distinct defects with similar wording cannot collapse either.
#
# Which way the safe default leans, and why. A FALSE merge (calling two distinct
# defects ``both``) understates BOTH unique tallies - it would hide a push-unique
# catch and bias the RETIRE telemetry toward retiring push ("throwing out the
# baby"). A FALSE split (an unkeyed defect both arms caught, counted as a
# push-only PLUS a pull-only) overstates the unique tallies and biases AWAY from
# retire (conservative; keeps push). So when a finding lacks a stable key the
# merge leaves it un-merged (its own surface-tagged entry) and the result records
# ``provenance_complete = False`` + the per-surface unkeyed counts, so the scorer
# reports the unique tallies as an UPPER BOUND rather than silently asserting a
# clean disjoint partition.
# ===========================================================================

SURFACE_PUSH = "push"
SURFACE_PULL = "pull"

PROVENANCE_PUSH_ONLY = "push-only"
PROVENANCE_PULL_ONLY = "pull-only"
PROVENANCE_BOTH = "both"
PROVENANCE_LABELS = (PROVENANCE_PUSH_ONLY, PROVENANCE_PULL_ONLY, PROVENANCE_BOTH)

# Severity ranking. high-severity (the RETIRE-telemetry tally) is Critical or
# Major; Minor and unspecified are not. Matched case-insensitively so a "major"
# / "MAJOR" from either arm ranks identically.
_SEVERITY_RANK = {"critical": 3, "major": 2, "minor": 1}
_HIGH_SEVERITY_RANK = 2  # >= Major


def _severity_rank(severity: object) -> int:
    if not isinstance(severity, str):
        return 0
    return _SEVERITY_RANK.get(severity.strip().lower(), 0)


def is_high_severity(severity: object) -> bool:
    """True iff a severity is Critical or Major (the RETIRE-telemetry band)."""
    return _severity_rank(severity) >= _HIGH_SEVERITY_RANK


def _default_key_of(finding: dict) -> str:
    """Extract a finding's stable defect key (``""`` when unkeyed).

    The key is an explicit, operator/harness-assigned ``defectKey`` field - never
    derived from the free-text description (the floor-ratchet lesson). A missing
    or non-string key reads as unkeyed, which the merge keeps un-merged.
    """
    key = finding.get("defectKey")
    return key.strip() if isinstance(key, str) and key.strip() else ""


@dataclass(frozen=True)
class FindingContributor:
    """One arm's contribution to a merged finding (attribution preserved)."""

    surface: str  # SURFACE_PUSH / SURFACE_PULL
    description: str
    severity: str = ""
    category: str = ""

    def to_dict(self) -> dict:
        out = {"surface": self.surface, "description": self.description}
        if self.severity:
            out["severity"] = self.severity
        if self.category:
            out["category"] = self.category
        return out


@dataclass(frozen=True)
class MergedFinding:
    """One defect after the provenance merge, labeled by the surface(s) that caught it.

    ``severity`` is the **most severe** severity across the contributing arms (so a
    ``both`` finding that push graded Major and pull graded Critical is scored
    Critical); ``category`` is the first non-empty contributing category. The
    per-arm wording is preserved verbatim in ``contributors`` - a merge never
    discards either arm's description.
    """

    defect_key: str  # "" when unkeyed (then this finding is always single-surface)
    provenance: str  # one of PROVENANCE_LABELS
    severity: str
    category: str
    contributors: Tuple[FindingContributor, ...]

    @property
    def surfaces(self) -> Tuple[str, ...]:
        # The DISTINCT surfaces that caught this defect, order-preserved. The full
        # multiplicity (e.g. an intra-arm duplicate key contributing two push
        # entries) is kept in ``contributors``; ``surfaces`` is the de-duplicated
        # summary, so a both/single-surface finding never emits a duplicate label.
        seen: List[str] = []
        for c in self.contributors:
            if c.surface not in seen:
                seen.append(c.surface)
        return tuple(seen)

    def to_dict(self) -> dict:
        return {
            "defectKey": self.defect_key,
            "provenance": self.provenance,
            "severity": self.severity,
            "category": self.category,
            "surfaces": list(self.surfaces),
            "contributors": [c.to_dict() for c in self.contributors],
        }


@dataclass(frozen=True)
class MergeResult:
    """The provenance-tagged merge of both arms' findings.

    ``provenance_complete`` is True only when EVERY finding on both arms carried a
    stable ``defectKey``; when False the ``push-only`` / ``pull-only`` tallies are
    an UPPER BOUND (an unkeyed defect both arms caught shows up as two single-arm
    entries), and ``push_unkeyed`` / ``pull_unkeyed`` count how many findings were
    un-mergeable for that reason. ``findings`` is ordered: keyed-``both`` first,
    then keyed single-surface, then unkeyed single-surface - a stable order so the
    artifact is reproducible across runs.
    """

    findings: Tuple[MergedFinding, ...]
    push_unkeyed: int
    pull_unkeyed: int
    provenance_complete: bool

    def to_dict(self) -> dict:
        return {
            "provenanceComplete": self.provenance_complete,
            "pushUnkeyed": self.push_unkeyed,
            "pullUnkeyed": self.pull_unkeyed,
            "findings": [f.to_dict() for f in self.findings],
        }


def _contributor(surface: str, finding: dict) -> FindingContributor:
    desc = finding.get("description")
    sev = finding.get("severity")
    cat = finding.get("category")
    return FindingContributor(
        surface=surface,
        description=desc if isinstance(desc, str) else "",
        severity=sev if isinstance(sev, str) else "",
        category=cat if isinstance(cat, str) else "",
    )


def _merge_severity(contributors: Tuple[FindingContributor, ...]) -> str:
    """The most-severe severity across contributors (verbatim, not normalized)."""
    best = ""
    best_rank = -1
    for c in contributors:
        rank = _severity_rank(c.severity)
        if rank > best_rank:
            best_rank = rank
            best = c.severity
    return best


def _merge_category(contributors: Tuple[FindingContributor, ...]) -> str:
    for c in contributors:
        if c.category:
            return c.category
    return ""


def merge_findings(
    push_findings: List[dict],
    pull_findings: List[dict],
    *,
    key_of: Callable[[dict], str] = _default_key_of,
) -> MergeResult:
    """Merge the two arms' findings into a provenance-tagged result. Never raises.

    Each finding is a dict with ``description`` / ``severity`` / ``category`` (the
    Set 066 Finding shape, which both the push ``issues`` and the pull ``findings``
    already use) plus an optional, operator/harness-assigned ``defectKey``.

    Keyed findings sharing a ``defectKey`` across the two arms merge to ``both``;
    a key seen on only one arm becomes that arm's ``-only``. Unkeyed findings are
    NEVER merged - each becomes its own single-surface entry (the safe over-split;
    see the module note). Within one arm, two findings with the *same* key are
    folded into a single contributor set (so a duplicated key does not double-count
    the same arm). ``key_of`` is injectable for tests / alternate mapping schemes.
    """
    # key -> {surface -> [contributors]} for KEYED findings (preserve every
    # contributor so attribution is never lost, even on an intra-arm dup key).
    keyed: Dict[str, Dict[str, List[FindingContributor]]] = {}
    key_order: List[str] = []
    unkeyed: List[MergedFinding] = []
    push_unkeyed = 0
    pull_unkeyed = 0

    for surface, findings in ((SURFACE_PUSH, push_findings), (SURFACE_PULL, pull_findings)):
        for finding in findings or ():
            if not isinstance(finding, dict):
                continue
            contributor = _contributor(surface, finding)
            try:
                key = key_of(finding)
            except Exception:
                key = ""
            if not key:
                if surface == SURFACE_PUSH:
                    push_unkeyed += 1
                else:
                    pull_unkeyed += 1
                unkeyed.append(
                    MergedFinding(
                        defect_key="",
                        provenance=(PROVENANCE_PUSH_ONLY if surface == SURFACE_PUSH
                                    else PROVENANCE_PULL_ONLY),
                        severity=contributor.severity,
                        category=contributor.category,
                        contributors=(contributor,),
                    )
                )
                continue
            if key not in keyed:
                keyed[key] = {SURFACE_PUSH: [], SURFACE_PULL: []}
                key_order.append(key)
            keyed[key][surface].append(contributor)

    keyed_both: List[MergedFinding] = []
    keyed_single: List[MergedFinding] = []
    for key in key_order:
        by_surface = keyed[key]
        contributors = tuple(by_surface[SURFACE_PUSH] + by_surface[SURFACE_PULL])
        has_push = bool(by_surface[SURFACE_PUSH])
        has_pull = bool(by_surface[SURFACE_PULL])
        if has_push and has_pull:
            provenance = PROVENANCE_BOTH
        elif has_push:
            provenance = PROVENANCE_PUSH_ONLY
        else:
            provenance = PROVENANCE_PULL_ONLY
        merged = MergedFinding(
            defect_key=key,
            provenance=provenance,
            severity=_merge_severity(contributors),
            category=_merge_category(contributors),
            contributors=contributors,
        )
        if provenance == PROVENANCE_BOTH:
            keyed_both.append(merged)
        else:
            keyed_single.append(merged)

    findings = tuple(keyed_both + keyed_single + unkeyed)
    provenance_complete = push_unkeyed == 0 and pull_unkeyed == 0
    return MergeResult(
        findings=findings,
        push_unkeyed=push_unkeyed,
        pull_unkeyed=pull_unkeyed,
        provenance_complete=provenance_complete,
    )


# ===========================================================================
# Session 2: the comparison artifact + its pure-Python validator
#
# The on-disk record of one dual-surface run's merge. A JSON Schema lives at
# ``docs/dual-surface-comparison.schema.json``; this pure-Python validator is the
# runtime contract and must stay in PARITY with it (L-066-1: it type-checks the
# OPTIONAL fields the schema constrains, guards ``int`` vs ``bool``, and closes
# the top-level object so it never drifts looser than the schema). Never raises.
# ===========================================================================

COMPARISON_ARTIFACT_FILENAME = "dual-surface-comparison.json"
COMPARISON_SCHEMA_VERSIONS = (1,)
COMPARISON_KIND = "dual_surface_comparison"

# A run is tagged by HOW it was triggered, and the two are NEVER pooled: a
# random-sampled run is unbiased telemetry; an operator/orchestrator opt-in run is
# operational high-assurance (it self-selects high-risk changes, so pooling it
# into the telemetry would bias the RETIRE numbers).
RUN_TAG_SAMPLED = "sampled"
RUN_TAG_OPT_IN = "opt-in"
RUN_TAGS = (RUN_TAG_SAMPLED, RUN_TAG_OPT_IN)

# Stable machine tokens for ComparisonArtifactResult.code.
COMPARISON_OK = "comparison-ok"
COMPARISON_NOT_AN_OBJECT = "comparison-not-an-object"
COMPARISON_BAD_SCHEMA_VERSION = "comparison-bad-schema-version"
COMPARISON_IDENTITY_MISMATCH = "comparison-identity-mismatch"
COMPARISON_BAD_STRUCTURE = "comparison-bad-structure"

_COMPARISON_TOP_KEYS = {
    "schemaVersion", "kind", "sessionSetName", "comparedAt", "runTag",
    "committedRef", "provider", "model", "attestation", "provenanceComplete",
    "pushUnkeyed", "pullUnkeyed", "notes", "findings",
}
_CONTRIBUTOR_KEYS = {"surface", "description", "severity", "category"}
_MERGED_FINDING_KEYS = {
    "defectKey", "provenance", "severity", "category", "surfaces", "contributors",
}
_SURFACES = (SURFACE_PUSH, SURFACE_PULL)


def _is_int_not_bool(value: object) -> bool:
    # JSON Schema "type": "integer" rejects bool; Python's isinstance(True, int)
    # is True, so guard it explicitly (L-066-1).
    return isinstance(value, int) and not isinstance(value, bool)


def _is_nonneg_int(value: object) -> bool:
    return _is_int_not_bool(value) and value >= 0


@dataclass(frozen=True)
class ComparisonArtifactResult:
    """Outcome of :func:`validate_comparison_artifact`. Never-raising contract."""

    ok: bool
    code: str
    reasons: Tuple[str, ...] = ()
    session_set_name: Optional[str] = None
    run_tag: Optional[str] = None


def _validate_contributor(contributor: object, where: str) -> List[str]:
    reasons: List[str] = []
    if not isinstance(contributor, dict):
        return [f"{where} is not an object"]
    extra = sorted(set(contributor) - _CONTRIBUTOR_KEYS)
    if extra:
        reasons.append(f"{where} has unexpected key(s): {extra}")
    surface = contributor.get("surface")
    if surface not in _SURFACES:
        reasons.append(f"{where}.surface must be one of {list(_SURFACES)}")
    if not _is_nonempty_str_local(contributor.get("description")):
        reasons.append(f"{where}.description is missing or empty")
    for opt in ("severity", "category"):
        if opt in contributor and not isinstance(contributor.get(opt), str):
            reasons.append(f"{where}.{opt}, when present, must be a string")
    return reasons


def _validate_merged_finding(finding: object, index: int) -> List[str]:
    where = f"findings[{index}]"
    if not isinstance(finding, dict):
        return [f"{where} is not an object"]
    reasons: List[str] = []
    extra = sorted(set(finding) - _MERGED_FINDING_KEYS)
    if extra:
        reasons.append(f"{where} has unexpected key(s): {extra}")
    # defectKey is required as a string but MAY be empty (an unkeyed finding).
    if not isinstance(finding.get("defectKey"), str):
        reasons.append(f"{where}.defectKey must be a string (empty when unkeyed)")
    provenance = finding.get("provenance")
    if provenance not in PROVENANCE_LABELS:
        reasons.append(f"{where}.provenance must be one of {list(PROVENANCE_LABELS)}")
    for key in ("severity", "category"):
        if not isinstance(finding.get(key), str):
            reasons.append(f"{where}.{key} must be a string")
    surfaces = finding.get("surfaces")
    if not isinstance(surfaces, list) or not surfaces:
        reasons.append(f"{where}.surfaces must be a non-empty array")
    else:
        for s in surfaces:
            if s not in _SURFACES:
                reasons.append(f"{where}.surfaces entries must be one of "
                               f"{list(_SURFACES)}")
                break
    contributors = finding.get("contributors")
    if not isinstance(contributors, list) or not contributors:
        reasons.append(f"{where}.contributors must be a non-empty array")
    else:
        for j, c in enumerate(contributors):
            reasons.extend(_validate_contributor(c, f"{where}.contributors[{j}]"))
    # Cross-field consistency the schema cannot express but the runtime must hold:
    # a ``both`` finding requires BOTH surfaces among its contributors (and an
    # unkeyed finding is always single-surface). This is the load-bearing
    # provenance invariant - a hand-written artifact claiming ``both`` without a
    # pull contributor would otherwise be accepted and corrupt the RETIRE tally.
    if isinstance(contributors, list) and contributors and provenance in PROVENANCE_LABELS:
        contrib_surfaces = {
            c.get("surface") for c in contributors if isinstance(c, dict)
        }
        # The ``surfaces`` summary must be DISTINCT and must match the distinct set
        # of contributor surfaces - otherwise a hand-written (or buggy-producer)
        # artifact could carry a duplicate or misattributed surface label that
        # disagrees with the load-bearing ``contributors`` (L-066-1: enforce every
        # schema-declared field, not just the load-bearing ones).
        if isinstance(surfaces, list) and surfaces and all(s in _SURFACES for s in surfaces):
            if len(surfaces) != len(set(surfaces)):
                reasons.append(f"{where}.surfaces contains duplicate entries: {surfaces}")
            elif set(surfaces) != {s for s in contrib_surfaces if s in _SURFACES}:
                reasons.append(f"{where}.surfaces {sorted(set(surfaces))} does not match "
                               "its contributors' distinct surfaces "
                               f"{sorted(s for s in contrib_surfaces if s in _SURFACES)}")
        if provenance == PROVENANCE_BOTH and contrib_surfaces != set(_SURFACES):
            reasons.append(f"{where}.provenance is 'both' but its contributors do "
                           "not cover both surfaces")
        if provenance == PROVENANCE_PUSH_ONLY and contrib_surfaces != {SURFACE_PUSH}:
            reasons.append(f"{where}.provenance is 'push-only' but a non-push "
                           "contributor is present")
        if provenance == PROVENANCE_PULL_ONLY and contrib_surfaces != {SURFACE_PULL}:
            reasons.append(f"{where}.provenance is 'pull-only' but a non-pull "
                           "contributor is present")
        if not isinstance(finding.get("defectKey"), str) or not finding.get("defectKey"):
            if provenance == PROVENANCE_BOTH:
                reasons.append(f"{where} is 'both' but carries no defectKey; only a "
                               "keyed finding can be attributed to both surfaces")
    return reasons


def _is_nonempty_str_local(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_comparison_artifact(
    artifact: object, *, expected_set_name: Optional[str] = None
) -> ComparisonArtifactResult:
    """Validate a ``dual-surface-comparison.json`` artifact. Never raises.

    Enforces the closed envelope (``schemaVersion`` in
    :data:`COMPARISON_SCHEMA_VERSIONS`, ``kind == dual_surface_comparison``, a
    non-empty ``sessionSetName``, ``runTag`` in :data:`RUN_TAGS`), the optional
    identity match against ``expected_set_name`` (a copied/stale artifact must not
    satisfy another set), every merged finding's structure + the provenance
    invariants, and L-066-1 parity with the JSON Schema.
    """
    if not isinstance(artifact, dict):
        return ComparisonArtifactResult(
            ok=False, code=COMPARISON_NOT_AN_OBJECT,
            reasons=("artifact is not an object",),
        )
    version = artifact.get("schemaVersion")
    if not _is_int_not_bool(version) or version not in COMPARISON_SCHEMA_VERSIONS:
        return ComparisonArtifactResult(
            ok=False, code=COMPARISON_BAD_SCHEMA_VERSION,
            reasons=(f"schemaVersion must be one of "
                     f"{list(COMPARISON_SCHEMA_VERSIONS)} (integer)",),
        )
    if artifact.get("kind") != COMPARISON_KIND:
        return ComparisonArtifactResult(
            ok=False, code=COMPARISON_BAD_STRUCTURE,
            reasons=(f"kind must be {COMPARISON_KIND!r}",),
        )
    name = artifact.get("sessionSetName")
    if not _is_nonempty_str_local(name):
        return ComparisonArtifactResult(
            ok=False, code=COMPARISON_BAD_STRUCTURE,
            reasons=("sessionSetName is missing or empty",),
        )
    if expected_set_name is not None and name != expected_set_name:
        return ComparisonArtifactResult(
            ok=False, code=COMPARISON_IDENTITY_MISMATCH, session_set_name=name,
            reasons=(f"sessionSetName {name!r} does not match the expected set "
                     f"({expected_set_name!r})",),
        )

    reasons: List[str] = []
    extra = sorted(set(artifact) - _COMPARISON_TOP_KEYS)
    if extra:
        reasons.append(f"unexpected top-level key(s): {extra}")

    run_tag = artifact.get("runTag")
    if run_tag not in RUN_TAGS:
        reasons.append(f"runTag must be one of {list(RUN_TAGS)}")

    if not _is_nonempty_str_local(artifact.get("comparedAt")):
        reasons.append("comparedAt is missing or empty")
    for key in ("committedRef", "provider", "model"):
        if not _is_nonempty_str_local(artifact.get(key)):
            reasons.append(f"{key} is missing or empty")
    if not isinstance(artifact.get("attestation"), dict):
        reasons.append("attestation is missing or not an object")
    if not isinstance(artifact.get("provenanceComplete"), bool):
        reasons.append("provenanceComplete must be a boolean")
    for key in ("pushUnkeyed", "pullUnkeyed"):
        if not _is_nonneg_int(artifact.get(key)):
            reasons.append(f"{key} must be a non-negative integer")
    if "notes" in artifact and not isinstance(artifact.get("notes"), str):
        reasons.append("notes, when present, must be a string")

    findings = artifact.get("findings")
    if not isinstance(findings, list):
        reasons.append("findings must be an array")
    else:
        for i, finding in enumerate(findings):
            reasons.extend(_validate_merged_finding(finding, i))
        # provenanceComplete must be consistent with the findings themselves: a
        # complete merge has no unkeyed entry.
        pc = artifact.get("provenanceComplete")
        unkeyed_present = any(
            isinstance(f, dict) and not f.get("defectKey") for f in findings
        )
        if pc is True and unkeyed_present:
            reasons.append("provenanceComplete is true but at least one finding is "
                           "unkeyed (an unkeyed finding means the merge is not "
                           "provenance-complete)")

    # provenanceComplete must ALSO be consistent with the recorded unkeyed COUNTS,
    # independent of the findings array: a hand-written artifact could declare
    # provenanceComplete=true with a nonzero pushUnkeyed/pullUnkeyed and NO unkeyed
    # finding present, which would otherwise validate as "complete" and let
    # score_comparison clear the upper-bound honesty warning on incomplete
    # provenance (gpt-5-4 S2 R1). This check is unconditional on findings' type.
    pc = artifact.get("provenanceComplete")
    pu = artifact.get("pushUnkeyed")
    qu = artifact.get("pullUnkeyed")
    if pc is True and (
        (_is_int_not_bool(pu) and pu != 0) or (_is_int_not_bool(qu) and qu != 0)
    ):
        reasons.append("provenanceComplete is true but pushUnkeyed/pullUnkeyed is "
                       "nonzero (an unkeyed finding means the merge is not "
                       "provenance-complete)")

    if reasons:
        return ComparisonArtifactResult(
            ok=False, code=COMPARISON_BAD_STRUCTURE, session_set_name=name,
            reasons=tuple(reasons),
        )
    return ComparisonArtifactResult(
        ok=True, code=COMPARISON_OK, session_set_name=name, run_tag=run_tag,
    )


def build_comparison_artifact(
    run: DualSurfaceRun,
    merge: MergeResult,
    *,
    run_tag: str,
    compared_at: str,
    notes: Optional[str] = None,
) -> dict:
    """Assemble the on-disk comparison artifact from a run + its merge.

    ``compared_at`` is passed in (the caller stamps the timestamp) so this stays
    pure and deterministic. ``run_tag`` must be one of :data:`RUN_TAGS`; a bad tag
    raises ``ValueError`` (a programmer error - the caller chooses the tag from the
    trigger, it is never attacker-influenced).
    """
    if run_tag not in RUN_TAGS:
        raise ValueError(
            f"unknown run_tag {run_tag!r}; expected one of {list(RUN_TAGS)}"
        )
    artifact = {
        "schemaVersion": 1,
        "kind": COMPARISON_KIND,
        "sessionSetName": run.session_set,
        "comparedAt": compared_at,
        "runTag": run_tag,
        "committedRef": run.committed_ref,
        "provider": run.provider,
        "model": run.model,
        "attestation": run.attestation,
        "provenanceComplete": merge.provenance_complete,
        "pushUnkeyed": merge.push_unkeyed,
        "pullUnkeyed": merge.pull_unkeyed,
        "findings": [f.to_dict() for f in merge.findings],
    }
    if notes is not None:
        artifact["notes"] = notes
    return artifact


def find_comparison_artifact(session_set_dir: Union[str, Path]) -> Optional[Path]:
    path = Path(session_set_dir) / COMPARISON_ARTIFACT_FILENAME
    return path if path.is_file() else None


# ===========================================================================
# Session 2: the fair-shake scoring
#
# Two scorers, both DERIVED (never hand-asserted):
#
# 1. score_comparison - the provenance scoreboard for ONE run: the push-unique /
#    pull-unique / shared HIGH-SEVERITY tallies. When provenance is incomplete the
#    unique tallies are reported as an UPPER BOUND (honest telemetry), never as a
#    settled partition.
# 2. score_against_benchmark - the RETIRE metric, scored against the Set 069
#    pre-registered seeded+holdout benchmark (ground-truth labels make "was this
#    push-only finding a real high-sev defect?" decidable). Underpowered (real
#    cases < the registration's minCasesForPower) forces an INCONCLUSIVE verdict;
#    the gated push layer is NEVER retired by this scorer - it produces the
#    evidence, the RETIRE decision stays operator-confirmed.
#
# The two run tags (sampled / opt-in) are echoed and NEVER pooled here; the
# aggregate helper refuses a mixed-tag pool.
# ===========================================================================

# RETIRE-telemetry verdict tokens (a derived recommendation, never a decision).
RETIRE_INCONCLUSIVE = "inconclusive"
RETIRE_PUSH_ADDS_UNIQUE = "push-adds-unique-high-severity"
RETIRE_PUSH_NO_UNIQUE = "push-no-unique-high-severity"

# The RAW per-arm attestation fields a scoreable artifact must carry. The schema/docs
# describe a comparison artifact as a run whose provider, model, and adversarial
# framing were held EQUAL across arms - the precondition that makes "surface is the
# only variable" true and the disjoint tally valid as RETIRE evidence (L-069-2).
# ``run_dual_surface(require_equal=True)`` (the default) refuses unequal arms up front,
# but ``require_equal=False`` is an explicit inspection-only escape hatch that still
# produces a structurally valid artifact. The structural validator cannot tell the two
# apart; the SCORERS are the RETIRE-evidence boundary, so they re-derive equality and
# reject an artifact whose arms were not held equal.
# Equality is judged on the ACTUAL arm identities (push vs pull) - the
# "surface is the only variable" invariant. ``requestedProvider`` / ``requestedModel``
# are recorded for provenance but are NOT required to match: an artifact whose two arms
# both honestly ran on the same provider/model is held-equal telemetry even if that
# resolved value differs from the literal request string (the live runner additionally
# pins to the request at production time; the scorer judges the recorded reality).
_REQUIRED_ARM_IDENTITY_FIELDS = (
    "pushProvider",
    "pullProvider",
    "pushModel",
    "pullModel",
)


def _arms_held_equal(comparison: dict) -> Tuple[bool, Tuple[str, ...]]:
    """True only when the RAW recorded arm identities/framing prove the arms equal.

    Returns ``(held_equal, reasons)``. This guard does **not** trust the self-asserted
    ``providerEqual`` / ``modelEqual`` / ``framingEqual`` / ``bothAdversarial`` booleans
    (a hand-crafted artifact could set them true while the raw fields disagree, or omit
    the raw fields entirely). Instead it requires the **actual** per-arm identities
    (``pushProvider`` / ``pullProvider`` and ``pushModel`` / ``pullModel``) and each
    arm's framing strength (``pushFraming`` / ``pullFraming``), then **re-derives**
    equality from them - "measured, not assumed", the same discipline
    ``run_dual_surface`` applies live. Equality is judged on the ACTUAL arms
    (``pushProvider == pullProvider``, ``pushModel == pullModel``) - the
    "surface is the only variable" invariant; ``requestedProvider`` / ``requestedModel``
    are provenance-only and are **not** consulted by the scorer (the live runner pins to
    the request at production time). A missing actual-arm field, a provider/model that
    differs across the two arms, or a framing that differs across arms or is not
    strong-adversarial means the artifact is inspection-only, not scoreable telemetry.
    """
    attestation = comparison.get("attestation")
    if not isinstance(attestation, dict):
        return False, ("attestation is missing or not an object",)
    failures: List[str] = []
    for name in _REQUIRED_ARM_IDENTITY_FIELDS:
        val = attestation.get(name)
        if not isinstance(val, str) or not val:
            failures.append(f"attestation.{name} is missing or not a non-empty string")

    def _framing_strength(key: str) -> Optional[str]:
        block = attestation.get(key)
        if not isinstance(block, dict):
            return None
        strength = block.get("strength")
        return strength if isinstance(strength, str) and strength else None

    push_fr = _framing_strength("pushFraming")
    pull_fr = _framing_strength("pullFraming")
    if push_fr is None:
        failures.append("attestation.pushFraming.strength is missing")
    if pull_fr is None:
        failures.append("attestation.pullFraming.strength is missing")
    if failures:
        return False, (
            "dual-surface arms cannot be verified as held equal - the raw per-arm "
            "attestation is incomplete (" + "; ".join(failures) + "); a comparison "
            "without measured arm identities is not valid RETIRE telemetry (L-069-2)",
        )

    # Re-derive equality from the ACTUAL arm identities (never trust the *Equal
    # booleans, and judge push-vs-pull - "surface is the only variable" - not a match
    # to the requested string, which is informational provenance).
    if attestation["pushProvider"] != attestation["pullProvider"]:
        failures.append(
            f"providers differ across arms "
            f"(push={attestation['pushProvider']}, pull={attestation['pullProvider']})"
        )
    if attestation["pushModel"] != attestation["pullModel"]:
        failures.append(
            f"models differ across arms "
            f"(push={attestation['pushModel']}, pull={attestation['pullModel']})"
        )
    if push_fr != pull_fr:
        failures.append(f"framings differ (push={push_fr}, pull={pull_fr})")
    elif push_fr != FRAMING_ADVERSARIAL:
        failures.append(
            f"framing is not strong adversarial (got {push_fr!r}, "
            f"expected {FRAMING_ADVERSARIAL!r})"
        )
    if failures:
        return False, (
            "dual-surface arms were not held equal at strong adversarial framing "
            "(" + "; ".join(failures) + "); an inspection-only (require_equal=False) "
            "run is not valid RETIRE telemetry (L-069-2)",
        )
    return True, ()


@dataclass(frozen=True)
class ComparisonScore:
    """The provenance scoreboard for one run's merge (no ground truth needed).

    The tallies count HIGH-SEVERITY (Critical/Major) findings by provenance.
    ``provenance_complete`` echoes the merge: when False, ``push_unique_high_sev``
    and ``pull_unique_high_sev`` are an UPPER BOUND (an unkeyed defect both arms
    caught is counted once on each side), so the caller must not treat them as a
    settled disjoint partition. ``run_tag`` is echoed so callers never pool
    sampled with opt-in runs.
    """

    ok: bool
    run_tag: Optional[str]
    push_unique_high_sev: int
    pull_unique_high_sev: int
    shared_high_sev: int
    total_high_sev: int
    provenance_complete: bool
    upper_bound: bool  # True when the unique tallies are only an upper bound
    reasons: Tuple[str, ...] = ()


def score_comparison(comparison: object) -> ComparisonScore:
    """Derive the push-unique / pull-unique / shared high-severity tallies. Never raises."""
    result = validate_comparison_artifact(comparison)
    if not result.ok:
        return ComparisonScore(
            ok=False, run_tag=None, push_unique_high_sev=0, pull_unique_high_sev=0,
            shared_high_sev=0, total_high_sev=0, provenance_complete=False,
            upper_bound=True,
            reasons=(f"comparison artifact is invalid ({result.code}): "
                     f"{'; '.join(result.reasons)}",),
        )
    held_equal, equal_reasons = _arms_held_equal(comparison)
    if not held_equal:
        return ComparisonScore(
            ok=False, run_tag=result.run_tag, push_unique_high_sev=0,
            pull_unique_high_sev=0, shared_high_sev=0, total_high_sev=0,
            provenance_complete=False, upper_bound=True, reasons=equal_reasons,
        )
    push_unique = pull_unique = shared = total = 0
    for finding in comparison.get("findings", []):
        if not is_high_severity(finding.get("severity")):
            continue
        total += 1
        provenance = finding.get("provenance")
        if provenance == PROVENANCE_BOTH:
            shared += 1
        elif provenance == PROVENANCE_PUSH_ONLY:
            push_unique += 1
        elif provenance == PROVENANCE_PULL_ONLY:
            pull_unique += 1
    # Derive provenance-completeness from BOTH the boolean flag AND the unkeyed
    # counts, so a malformed artifact (the validator now rejects it, but this is
    # defense-in-depth) can never suppress the upper-bound honesty warning by
    # asserting the flag while still declaring unmergeable findings (gpt-5-4 S2 R1).
    pu = comparison.get("pushUnkeyed")
    qu = comparison.get("pullUnkeyed")
    counts_clean = (
        _is_int_not_bool(pu) and pu == 0 and _is_int_not_bool(qu) and qu == 0
    )
    provenance_complete = bool(comparison.get("provenanceComplete")) and counts_clean
    return ComparisonScore(
        ok=True,
        run_tag=result.run_tag,
        push_unique_high_sev=push_unique,
        pull_unique_high_sev=pull_unique,
        shared_high_sev=shared,
        total_high_sev=total,
        provenance_complete=provenance_complete,
        upper_bound=not provenance_complete,
        reasons=() if provenance_complete else (
            "provenance is incomplete (unkeyed findings present); the unique "
            "tallies are an upper bound, not a settled disjoint partition",
        ),
    )


@dataclass(frozen=True)
class BenchmarkScore:
    """The RETIRE telemetry for one run, scored against the pre-registered benchmark.

    ``push_unique_real`` / ``pull_unique_real`` count findings whose ``defectKey``
    is a REGISTERED benchmark case (ground-truth real defects) that one surface
    caught and the other did not; ``shared_real`` the registered defects both
    caught. ``underpowered`` is True when the benchmark's real-case count is below
    its ``minCasesForPower``; an underpowered benchmark forces
    ``verdict == RETIRE_INCONCLUSIVE`` (the honesty rule - a single run is almost
    always underpowered). The manual/gated push layer is NEVER retired here.
    """

    ok: bool
    run_tag: Optional[str]
    push_unique_real: int
    pull_unique_real: int
    shared_real: int
    unregistered_keyed: int  # keyed findings whose key is NOT a registered case
    real_cases: int
    underpowered: bool
    verdict: str
    reasons: Tuple[str, ...] = ()


def _failed_benchmark_score(reason: str) -> "BenchmarkScore":
    return BenchmarkScore(
        ok=False, run_tag=None, push_unique_real=0, pull_unique_real=0,
        shared_real=0, unregistered_keyed=0, real_cases=0, underpowered=True,
        verdict=RETIRE_INCONCLUSIVE, reasons=(reason,),
    )


def score_against_benchmark(
    comparison: object, registration: object
) -> BenchmarkScore:
    """Derive the RETIRE telemetry against the Set 069 pre-registered benchmark.

    Validates both the comparison artifact and the benchmark registration (reusing
    :func:`ai_router.replacement_gate.validate_benchmark_registration`), maps each
    HIGH-SEVERITY finding's ``defectKey`` to a registered case (ground truth), and
    counts push-unique / pull-unique / shared REAL defects. Underpowered ->
    INCONCLUSIVE; otherwise the verdict is :data:`RETIRE_PUSH_ADDS_UNIQUE` when
    push uniquely caught at least one real high-sev defect, else
    :data:`RETIRE_PUSH_NO_UNIQUE`. Never raises. The verdict is a derived
    *recommendation toward* the operator-confirmed RETIRE decision, never the
    decision itself.
    """
    result = validate_comparison_artifact(comparison)
    if not result.ok:
        return _failed_benchmark_score(
            f"comparison artifact is invalid ({result.code}): "
            f"{'; '.join(result.reasons)}"
        )
    held_equal, equal_reasons = _arms_held_equal(comparison)
    if not held_equal:
        return _failed_benchmark_score(equal_reasons[0])
    reg = validate_benchmark_registration(registration)
    if not reg.ok:
        return _failed_benchmark_score(
            f"benchmark registration is invalid ({reg.code}): "
            f"{'; '.join(reg.reasons)}"
        )

    registered = set(reg.case_ids)
    push_unique = pull_unique = shared = unregistered = 0
    for finding in comparison.get("findings", []):
        if not is_high_severity(finding.get("severity")):
            continue
        key = finding.get("defectKey")
        if not isinstance(key, str) or not key:
            # An unkeyed high-sev finding cannot be scored against ground truth -
            # it is provenance-uncertain and excluded from the REAL tally (the
            # provenance-complete signal on the artifact already flags it).
            continue
        if key not in registered:
            unregistered += 1
            continue
        provenance = finding.get("provenance")
        if provenance == PROVENANCE_BOTH:
            shared += 1
        elif provenance == PROVENANCE_PUSH_ONLY:
            push_unique += 1
        elif provenance == PROVENANCE_PULL_ONLY:
            pull_unique += 1

    underpowered = reg.real_case_count < reg.min_cases_for_power
    reasons: List[str] = []
    if underpowered:
        reasons.append(
            f"benchmark is underpowered: {reg.real_case_count} real cases < "
            f"minCasesForPower {reg.min_cases_for_power}; a single run cannot "
            "settle the RETIRE question - telemetry must accumulate"
        )
    if not result.run_tag:
        reasons.append("comparison carries no run tag")

    if underpowered:
        verdict = RETIRE_INCONCLUSIVE
    elif push_unique > 0:
        verdict = RETIRE_PUSH_ADDS_UNIQUE
    else:
        verdict = RETIRE_PUSH_NO_UNIQUE
    return BenchmarkScore(
        ok=True,
        run_tag=result.run_tag,
        push_unique_real=push_unique,
        pull_unique_real=pull_unique,
        shared_real=shared,
        unregistered_keyed=unregistered,
        real_cases=reg.real_case_count,
        underpowered=underpowered,
        verdict=verdict,
        reasons=tuple(reasons),
    )


@dataclass(frozen=True)
class AggregateTelemetry:
    """An accumulated RETIRE scoreboard over MANY runs of ONE tag.

    The "never pool sampled with opt-in" rule has teeth here: :func:`aggregate_retire_telemetry`
    refuses a mixed-tag input (``ok=False``). Even within one tag, the aggregate
    stays INCONCLUSIVE until the accumulated real-case observations reach the
    power floor - a derived recommendation, never a RETIRE decision.
    """

    ok: bool
    run_tag: Optional[str]
    runs: int
    push_unique_real: int
    pull_unique_real: int
    shared_real: int
    verdict: str
    reasons: Tuple[str, ...] = ()


def aggregate_retire_telemetry(
    scores: List[BenchmarkScore], *, min_runs_for_power: int = 0
) -> AggregateTelemetry:
    """Accumulate per-run benchmark scores of ONE tag. Never raises; never pools tags.

    Refuses (``ok=False``) when the scores carry more than one distinct run tag
    (the honesty standard: sampled telemetry and opt-in operational runs are never
    pooled). ``min_runs_for_power`` (default 0) lets the caller require a minimum
    number of accumulated runs before any verdict other than INCONCLUSIVE is
    derived; until then the aggregate stays INCONCLUSIVE.
    """
    usable = [s for s in scores if isinstance(s, BenchmarkScore) and s.ok]
    if not usable:
        return AggregateTelemetry(
            ok=False, run_tag=None, runs=0, push_unique_real=0,
            pull_unique_real=0, shared_real=0, verdict=RETIRE_INCONCLUSIVE,
            reasons=("no valid benchmark scores to aggregate",),
        )
    tags = {s.run_tag for s in usable}
    if len(tags) > 1:
        return AggregateTelemetry(
            ok=False, run_tag=None, runs=len(usable), push_unique_real=0,
            pull_unique_real=0, shared_real=0, verdict=RETIRE_INCONCLUSIVE,
            reasons=(f"refusing to pool runs of different tags {sorted(t for t in tags if t)}; "
                     "sampled telemetry and opt-in operational runs are never pooled",),
        )
    tag = next(iter(tags))
    push_unique = sum(s.push_unique_real for s in usable)
    pull_unique = sum(s.pull_unique_real for s in usable)
    shared = sum(s.shared_real for s in usable)
    runs = len(usable)
    any_underpowered = any(s.underpowered for s in usable)
    reasons: List[str] = []
    # The aggregate is conclusive only when enough runs accumulated AND no
    # constituent run was itself flagged underpowered on its own benchmark.
    if runs < min_runs_for_power:
        reasons.append(
            f"only {runs} run(s) accumulated < min_runs_for_power "
            f"{min_runs_for_power}; telemetry must accumulate further"
        )
        verdict = RETIRE_INCONCLUSIVE
    elif any_underpowered:
        reasons.append("at least one constituent run was scored on an underpowered "
                       "benchmark; the pool inherits that and stays inconclusive")
        verdict = RETIRE_INCONCLUSIVE
    elif push_unique > 0:
        verdict = RETIRE_PUSH_ADDS_UNIQUE
    else:
        verdict = RETIRE_PUSH_NO_UNIQUE
    return AggregateTelemetry(
        ok=True, run_tag=tag, runs=runs, push_unique_real=push_unique,
        pull_unique_real=pull_unique, shared_real=shared, verdict=verdict,
        reasons=tuple(reasons),
    )


# ===========================================================================
# Session 2: the dual-surface verification MODE (a verificationMode-pattern option)
#
# Mirrors the Set 057 verification-mode / Set 066 pathAwareCritique pattern: a
# choice recorded ONCE at set start as a durable ``activity-log.json`` entry, read
# back via the "last valid entry of a record kind wins" rule, with a distinct
# entry ``kind`` so it never overloads either of those enums. Two non-off modes:
#
# - ``sampled`` - the random-sample hook: a fraction of qualifying sessions run
#   the dual-surface comparison automatically. UNBIASED telemetry. The random
#   draw is INJECTED into :func:`should_run_dual_surface` (never drawn inside) so
#   the decision is deterministic and hermetically testable - the same discipline
#   the rest of the repo uses for randomness.
# - ``opt-in`` - the operator/orchestrator explicitly requests a comparison on a
#   given (typically high-risk) change. OPERATIONAL high-assurance. It is never
#   auto-fired by the sampling hook; the explicit CLI invocation IS the opt-in,
#   tagged :data:`RUN_TAG_OPT_IN` so the scorer never pools it with sampled runs.
# ===========================================================================

DUAL_SURFACE_MODE_OFF = "off"
DUAL_SURFACE_MODE_SAMPLED = "sampled"
DUAL_SURFACE_MODE_OPT_IN = "opt-in"
DUAL_SURFACE_MODE_VALUES = (
    DUAL_SURFACE_MODE_OFF, DUAL_SURFACE_MODE_SAMPLED, DUAL_SURFACE_MODE_OPT_IN,
)
DEFAULT_DUAL_SURFACE_MODE = DUAL_SURFACE_MODE_OFF

DUAL_SURFACE_MODE_ENTRY_KIND = "dual_surface_mode"
_DUAL_SURFACE_MODE_RECORD_KINDS = (DUAL_SURFACE_MODE_ENTRY_KIND,)

# The default fraction of qualifying sessions a ``sampled`` mode runs on. A real
# number in [0, 1]; operator-tunable per call.
DEFAULT_SAMPLE_RATE = 0.1


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_activity_log_atomic(log_path: Path, log: dict) -> None:
    """Atomic temp-file-rename write of ``activity-log.json`` (mirrors the Set 066 writer)."""
    log_dir = log_path.parent
    fd, tmp_path = tempfile.mkstemp(suffix=".activity-log.tmp", dir=str(log_dir))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_f:
            json.dump(log, tmp_f, indent=2)
            tmp_f.write("\n")
        os.replace(tmp_path, log_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def read_dual_surface_mode(session_set_dir: Union[str, Path]) -> str:
    """Return the durable ``dualSurfaceMode`` record, or the default ``off``.

    Walks ``activity-log.json`` for ``kind == "dual_surface_mode"`` entries and
    returns the most recent valid ``choice`` (last valid entry in file order
    wins). Returns :data:`DEFAULT_DUAL_SURFACE_MODE` (``off``) when no record
    exists or on any read error - the mode is opt-in, so "not recorded" means off.
    Handles invalid UTF-8 (a ``UnicodeError``, not a ``JSONDecodeError``) so it
    never raises (the L-069-1 sibling-reader class).
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return DEFAULT_DUAL_SURFACE_MODE
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        return DEFAULT_DUAL_SURFACE_MODE
    chosen = DEFAULT_DUAL_SURFACE_MODE
    if not isinstance(log, dict):
        return chosen
    entries = log.get("entries")
    if not isinstance(entries, list):
        # A non-list ``entries`` (e.g. the integer 1) must NOT be iterated - that
        # would raise TypeError and break the never-raises contract (the L-069-1
        # bug-class: harden the reader, not just the writer). Treat it as no record.
        return chosen
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get("kind") not in _DUAL_SURFACE_MODE_RECORD_KINDS:
            continue
        choice = entry.get("choice")
        if choice in DUAL_SURFACE_MODE_VALUES:
            chosen = choice
    return chosen


def has_dual_surface_mode_record(session_set_dir: Union[str, Path]) -> bool:
    """True iff a durable dualSurfaceMode record already exists (idempotency guard)."""
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return False
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        return False
    if not isinstance(log, dict):
        return False
    entries = log.get("entries")
    if not isinstance(entries, list):
        # Same L-069-1 hardening as read_dual_surface_mode: a non-list ``entries``
        # must not be iterated (this reader gates resolve_and_record, so a TypeError
        # here would crash record-mode before the writer could repair).
        return False
    return any(
        isinstance(entry, dict)
        and entry.get("kind") in _DUAL_SURFACE_MODE_RECORD_KINDS
        and entry.get("choice") in DUAL_SURFACE_MODE_VALUES
        for entry in entries
    )


def dual_surface_mode_record_unreadable(session_set_dir: Union[str, Path]) -> bool:
    """True iff ``activity-log.json`` EXISTS but cannot be parsed.

    Distinguishes "no record" (absent file, or present + parseable with no
    dual_surface_mode entry -> the legitimate ``off`` opt-out) from "present but
    UNREADABLE". The readers collapse the unreadable case to ``off`` so they never
    raise; a caller that needs to surface the corrupt case (instead of silently
    treating an opted-in set as ``off``) calls this. Mirrors
    :func:`ai_router.path_aware_critique.path_aware_critique_record_unreadable`.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return False
    try:
        with log_path.open("r", encoding="utf-8") as f:
            json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        return True
    return False


def read_spec_dual_surface_mode(session_set_dir: Union[str, Path]) -> Optional[str]:
    """Return the optional ``dualSurfaceMode`` seed from spec.md config, or ``None``.

    Reuses the shared Session Set Configuration block extractor so the attribute is
    parsed exactly like ``tier`` / ``verificationMode`` / ``pathAwareCritique`` (no
    separate parser). Never raises - a malformed spec degrades to "no seed".
    """
    spec_path = Path(session_set_dir) / "spec.md"
    if not spec_path.is_file():
        return None
    try:
        text = spec_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None
    try:
        from session_state import (  # type: ignore[import-not-found]
            _extract_session_set_configuration_block,
        )
    except ImportError:  # pragma: no cover - import shim
        from .session_state import (  # type: ignore[no-redef]
            _extract_session_set_configuration_block,
        )
    block = _extract_session_set_configuration_block(text) or {}
    value = block.get("dualSurfaceMode")
    if isinstance(value, str) and value in DUAL_SURFACE_MODE_VALUES:
        return value
    return None


def record_dual_surface_mode(
    session_set_dir: Union[str, Path],
    value: str,
    *,
    session_number: int = 1,
    step_number: Optional[int] = None,
) -> None:
    """Append a ``dual_surface_mode`` entry to ``activity-log.json`` (the durable record).

    Mirrors :func:`ai_router.path_aware_critique.record_path_aware_critique`
    (atomic temp-file rename, UTC timestamp). Raises ``ValueError`` on an unknown
    value, on a malformed activity log (not a JSON object, or unparseable bytes),
    and ``FileNotFoundError`` if the activity log is missing (the set must have
    started first - this helper does not create the file). The malformed-log case
    raises a *controlled* ``ValueError`` rather than letting a ``JSONDecodeError`` /
    ``UnicodeError`` escape, so the CLI can map it to a clean nonzero exit
    (gpt-5-4 S2 R1).
    """
    if value not in DUAL_SURFACE_MODE_VALUES:
        raise ValueError(
            f"unknown dualSurfaceMode {value!r}; expected one of "
            f"{list(DUAL_SURFACE_MODE_VALUES)}"
        )
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        raise FileNotFoundError(
            f"activity-log.json not found at {log_path}; the session set must "
            "exist and have started before recording a dualSurfaceMode"
        )
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise ValueError(
            f"activity-log.json at {log_path} is unreadable / not valid JSON: {exc}"
        )
    if not isinstance(log, dict):
        raise ValueError(
            f"activity-log.json at {log_path} is not a JSON object"
        )
    entries = log.get("entries")
    if not isinstance(entries, list):
        # A missing or wrong-typed entries list is reset to an empty list rather
        # than silently mutating a non-list (which setdefault would have left in
        # place) - the durable record must land in a real array.
        entries = []
        log["entries"] = entries
    if step_number is None:
        # Only int-not-bool stepNumbers count toward the next step; a malformed
        # stepNumber (e.g. a list) is IGNORED rather than fed to int(), which would
        # raise an uncaught TypeError (the L-069-1 bug-class - the same robustness
        # gap the readers had).
        prior = [
            e.get("stepNumber")
            for e in entries
            if isinstance(e, dict) and e.get("sessionNumber") == session_number
        ]
        step_number = (
            max((s for s in prior if _is_int_not_bool(s)), default=0) + 1
        )
    entry = {
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": f"session-{session_number:03d}/dual-surface-mode",
        "dateTime": _now_iso_utc(),
        "description": f"Operator set dualSurfaceMode: {value}.",
        "status": "complete",
        "routedApiCalls": [],
        "kind": DUAL_SURFACE_MODE_ENTRY_KIND,
        "choice": value,
    }
    entries.append(entry)
    _write_activity_log_atomic(log_path, log)


def resolve_and_record_dual_surface_mode(
    session_set_dir: Union[str, Path],
    *,
    cli_choice: Optional[str] = None,
    session_number: int = 1,
) -> Optional[str]:
    """Capture the ``dualSurfaceMode`` choice once at set start (immutable thereafter).

    Resolution precedence on the first call (no record yet): ``cli_choice`` then the
    spec.md ``dualSurfaceMode`` seed. Records nothing (returns ``None``) when
    neither yields a value (the mode stays opt-in; ``off`` applies implicitly), or
    when a record already exists (immutability - a later ``off`` write must not
    silently disarm a sampling/opt-in choice the set started under). Creates a
    minimal activity log if one does not exist. A bad ``cli_choice`` always raises
    ``ValueError``. Mirrors
    :func:`ai_router.path_aware_critique.resolve_and_record_path_aware_critique`.
    """
    if cli_choice is not None and cli_choice not in DUAL_SURFACE_MODE_VALUES:
        raise ValueError(
            f"unknown dualSurfaceMode {cli_choice!r}; expected one of "
            f"{list(DUAL_SURFACE_MODE_VALUES)}"
        )
    if has_dual_surface_mode_record(session_set_dir):
        return None
    chosen: Optional[str] = cli_choice
    if chosen is None:
        chosen = read_spec_dual_surface_mode(session_set_dir)
    if chosen is None:
        return None

    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        minimal = {
            "sessionSetName": Path(session_set_dir).name,
            "createdDate": _now_iso_utc(),
            "totalSessions": 0,
            "entries": [],
        }
        with log_path.open("w", encoding="utf-8") as f:
            json.dump(minimal, f, indent=2)
            f.write("\n")
    record_dual_surface_mode(session_set_dir, chosen, session_number=session_number)
    return chosen


def should_run_dual_surface(
    mode: str,
    *,
    opt_in: bool = False,
    sample_value: Optional[float] = None,
    sample_rate: float = DEFAULT_SAMPLE_RATE,
) -> Optional[str]:
    """Decide whether a dual-surface comparison should run, and under which tag.

    The decision the orchestrator's per-session hook makes. Returns the
    :data:`RUN_TAGS` tag a run would carry, or ``None`` for "do not run". The
    randomness for the sampled path is INJECTED (``sample_value`` in [0, 1)),
    never drawn here, so the decision is deterministic and hermetically testable.

    - ``off`` -> never runs (``None``).
    - ``opt-in`` -> runs ONLY when ``opt_in=True`` (the operator/orchestrator
      explicitly requested it), tagged :data:`RUN_TAG_OPT_IN`. The sampling hook
      never auto-fires an opt-in mode.
    - ``sampled`` -> an explicit ``opt_in=True`` still runs as
      :data:`RUN_TAG_OPT_IN` (a deliberate request is operational, never folded
      into the unbiased telemetry); otherwise it runs when
      ``sample_value < sample_rate``, tagged :data:`RUN_TAG_SAMPLED`.

    An unknown mode is treated as ``off`` (the safe default). ``sample_rate`` is
    clamped to [0, 1].
    """
    if opt_in and mode in (DUAL_SURFACE_MODE_OPT_IN, DUAL_SURFACE_MODE_SAMPLED):
        return RUN_TAG_OPT_IN
    if mode != DUAL_SURFACE_MODE_SAMPLED:
        return None
    if sample_value is None:
        return None
    try:
        rate = float(sample_rate)
    except (TypeError, ValueError):
        return None
    rate = max(0.0, min(1.0, rate))
    if 0.0 <= sample_value < rate:
        return RUN_TAG_SAMPLED
    return None


# ===========================================================================
# CLI
# ===========================================================================


def main(argv=None) -> int:
    """CLI entry point (``python -m ai_router.dual_surface_verify``). Never calls sys.exit.

    Subcommands:

    - ``record-mode --session-set-dir DIR [--mode {off,sampled,opt-in}]`` - capture
      the dualSurfaceMode once at set start (CLI flag, else the spec seed).
    - ``read-mode --session-set-dir DIR`` - print the durable mode.
    - ``score --session-set-dir DIR`` - load the comparison artifact and print the
      provenance high-severity scoreboard (ASCII-only). When a
      ``benchmark-registration.json`` is present, also print the RETIRE telemetry.

    A not-met / inconclusive result is a *verdict*, not an error (exit 0); only an
    invalid/unreadable artifact returns non-zero.
    """
    import argparse

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.dual_surface_verify",
        description=(
            "Dual-surface verification telemetry (Set 070): record the "
            "dual-surface mode and score the provenance-tagged comparison."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_record = sub.add_parser("record-mode", help="capture dualSurfaceMode at set start")
    p_record.add_argument("--session-set-dir", required=True)
    p_record.add_argument("--mode", choices=list(DUAL_SURFACE_MODE_VALUES), default=None)
    p_record.add_argument("--session-number", type=int, default=1)

    p_read = sub.add_parser("read-mode", help="print the durable dualSurfaceMode")
    p_read.add_argument("--session-set-dir", required=True)

    p_score = sub.add_parser("score", help="score the comparison artifact")
    p_score.add_argument("--session-set-dir", required=True)

    args = parser.parse_args(argv)

    if args.command == "record-mode":
        # A corrupt / unparseable existing activity log must be surfaced as a
        # controlled nonzero exit, never an uncaught traceback - has_..._record
        # collapses an unreadable log to False, so without this guard the resolve
        # would fall through to record_dual_surface_mode and crash (gpt-5-4 S2 R1).
        if dual_surface_mode_record_unreadable(args.session_set_dir):
            print("[ ] activity-log.json is unreadable; cannot record "
                  "dualSurfaceMode")
            return 2
        try:
            chosen = resolve_and_record_dual_surface_mode(
                args.session_set_dir, cli_choice=args.mode,
                session_number=args.session_number,
            )
        except (ValueError, TypeError, OSError, json.JSONDecodeError,
                UnicodeError) as exc:
            # TypeError is belt-and-suspenders: the readers + writer are hardened
            # against malformed shapes (the primary fix), but the CLI still maps any
            # residual structural error to a controlled exit rather than a traceback.
            print(f"[ ] could not record dualSurfaceMode: {exc}")
            return 2
        if chosen is None:
            existing = read_dual_surface_mode(args.session_set_dir)
            print(f"[ ] no dualSurfaceMode recorded (mode stays {existing!r})")
            return 0
        print(f"[x] recorded dualSurfaceMode: {chosen}")
        return 0

    if args.command == "read-mode":
        if dual_surface_mode_record_unreadable(args.session_set_dir):
            print("[ ] activity-log.json is unreadable; treating mode as 'off'")
            return 2
        print(read_dual_surface_mode(args.session_set_dir))
        return 0

    # score
    comp_path = find_comparison_artifact(args.session_set_dir)
    if comp_path is None:
        print(f"[ ] no {COMPARISON_ARTIFACT_FILENAME} at the session-set root")
        return 0
    try:
        comparison = json.loads(comp_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"[ ] {COMPARISON_ARTIFACT_FILENAME} is unreadable: {exc}")
        return 2

    score = score_comparison(comparison)
    if not score.ok:
        print("[ ] could not score the comparison:")
        for r in score.reasons:
            print(f"    - {r}")
        return 1
    bound = " (upper bound)" if score.upper_bound else ""
    print(f"[x] run_tag={score.run_tag} high-severity provenance tally:")
    print(f"    push-only={score.push_unique_high_sev}{bound} "
          f"pull-only={score.pull_unique_high_sev}{bound} "
          f"both={score.shared_high_sev} total={score.total_high_sev}")
    for r in score.reasons:
        print(f"    note: {r}")

    reg_path = Path(args.session_set_dir) / "benchmark-registration.json"
    if reg_path.is_file():
        try:
            registration = json.loads(reg_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            print(f"    note: benchmark-registration.json unreadable: {exc}")
            return 0
        bench = score_against_benchmark(comparison, registration)
        if not bench.ok:
            print("    note: could not score against the benchmark:")
            for r in bench.reasons:
                print(f"      - {r}")
            return 0
        print(f"    RETIRE telemetry (verdict={bench.verdict}): "
              f"push-unique-real={bench.push_unique_real} "
              f"pull-unique-real={bench.pull_unique_real} "
              f"shared-real={bench.shared_real} "
              f"underpowered={bench.underpowered}")
        for r in bench.reasons:
            print(f"      note: {r}")
    return 0


__all__ = [
    # S1 runner
    "run_dual_surface",
    "DualSurfaceRun",
    "PushArmResult",
    "PullArmResult",
    "ArmFraming",
    "DualSurfaceError",
    "UnequalArmsError",
    "classify_framing_strength",
    "FRAMING_ADVERSARIAL",
    "FRAMING_MODERATE",
    "FRAMING_WEAK",
    "FRAMING_UNKNOWN",
    "load_push_template",
    "load_pull_template",
    # S2 merge
    "SURFACE_PUSH",
    "SURFACE_PULL",
    "PROVENANCE_PUSH_ONLY",
    "PROVENANCE_PULL_ONLY",
    "PROVENANCE_BOTH",
    "PROVENANCE_LABELS",
    "is_high_severity",
    "FindingContributor",
    "MergedFinding",
    "MergeResult",
    "merge_findings",
    # S2 comparison artifact
    "COMPARISON_ARTIFACT_FILENAME",
    "COMPARISON_SCHEMA_VERSIONS",
    "COMPARISON_KIND",
    "RUN_TAG_SAMPLED",
    "RUN_TAG_OPT_IN",
    "RUN_TAGS",
    "ComparisonArtifactResult",
    "validate_comparison_artifact",
    "build_comparison_artifact",
    "find_comparison_artifact",
    # S2 scoring
    "RETIRE_INCONCLUSIVE",
    "RETIRE_PUSH_ADDS_UNIQUE",
    "RETIRE_PUSH_NO_UNIQUE",
    "ComparisonScore",
    "score_comparison",
    "BenchmarkScore",
    "score_against_benchmark",
    "AggregateTelemetry",
    "aggregate_retire_telemetry",
    # S2 mode wiring
    "DUAL_SURFACE_MODE_OFF",
    "DUAL_SURFACE_MODE_SAMPLED",
    "DUAL_SURFACE_MODE_OPT_IN",
    "DUAL_SURFACE_MODE_VALUES",
    "DEFAULT_DUAL_SURFACE_MODE",
    "DUAL_SURFACE_MODE_ENTRY_KIND",
    "DEFAULT_SAMPLE_RATE",
    "read_dual_surface_mode",
    "has_dual_surface_mode_record",
    "dual_surface_mode_record_unreadable",
    "read_spec_dual_surface_mode",
    "record_dual_surface_mode",
    "resolve_and_record_dual_surface_mode",
    "should_run_dual_surface",
    "main",
]


if __name__ == "__main__":  # pragma: no cover - CLI entry
    import sys

    raise SystemExit(main(sys.argv[1:]))
