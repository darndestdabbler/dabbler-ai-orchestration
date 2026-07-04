"""Cross-provider verification logic for IV&V.

Verifier selection is rule-based, not map-based. The rules:

  1. Different provider from the generator.
  2. ``is_enabled`` is true (model is in the active pool).
  3. ``is_enabled_as_verifier`` is true (model is trusted to verify,
     not just to generate).
  4. Tier equal to the generator's tier, or one tier higher.
  5. Provider not in the ``exclude_providers`` list (used when a
     previous verifier call failed at the HTTPS layer).

Among surviving candidates, ``preferred_pairings`` (if any) is
consulted as a tiebreaker. If the preferred pairing survives the
rules, it wins. Otherwise candidates are ranked by tier distance
ascending then cheapest-output-cost ascending, and the top wins.

This design lets a reviewer swap or retire a model by editing the
``models:`` section alone, without hunting through a pairing table.
It also lets a new model be added as a generator only
(``is_enabled_as_verifier: false``) and promoted to verifier duty
later by flipping one flag.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional


@dataclass
class VerifierSelection:
    """Result of pick_verifier_model.

    Attributes:
        model_name: The chosen verifier model name.
        preferred_skipped: If a ``preferred_pairings`` entry existed
            for this generator but was rejected by the rules, this
            holds the skipped model name and the reason (used for
            metrics). None if no preferred pairing was consulted or
            the preferred pairing survived the rules.
    """
    model_name: str
    preferred_skipped: Optional[tuple[str, str]] = None


def pick_verifier_model(
    generator_model: str,
    config: dict,
    exclude_providers: Optional[list[str]] = None,
) -> Optional[VerifierSelection]:
    """Pick a verification model using rule-based selection.

    Args:
        generator_model: Name of the model that produced the output
            being verified.
        config: The loaded router-config.yaml dict.
        exclude_providers: Optional list of provider names to exclude
            from candidate selection. Used when a previous verifier
            call failed so the fallback picks a different provider.

    Returns:
        A ``VerifierSelection`` with the chosen model name, or None
        if no eligible verifier exists under the current rules.
    """
    exclude = set(exclude_providers or [])

    models = config.get("models", {}) or {}
    if generator_model not in models:
        return None

    gen_cfg = models[generator_model]
    gen_provider = gen_cfg.get("provider")
    gen_tier = gen_cfg.get("tier")
    if gen_provider is None or gen_tier is None:
        return None

    # Read preferred pairings. Backward-compat: accept the legacy
    # ``cross_provider_map`` key if ``preferred_pairings`` is absent,
    # so old configs and existing metrics log branches keep working.
    v_config = config.get("verification", {}) or {}
    preferred = (
        v_config.get("preferred_pairings")
        or v_config.get("cross_provider_map")
        or {}
    )

    # Build the rule-qualified candidate set.
    candidates: list[tuple[int, float, str]] = []
    for name, cfg in models.items():
        if name == generator_model:
            continue
        if cfg.get("provider") == gen_provider:
            continue                                       # rule 1
        if not cfg.get("is_enabled", True):
            continue                                       # rule 2
        if not cfg.get("is_enabled_as_verifier", True):
            continue                                       # rule 3
        tier = cfg.get("tier")
        if tier is None:
            continue
        tier_distance = tier - gen_tier
        if tier_distance < 0 or tier_distance > 1:
            continue                                       # rule 4
        if cfg.get("provider") in exclude:
            continue                                       # rule 5

        # Sort key: closest tier first, then cheapest output cost.
        # Falls back to input cost then name for deterministic ordering
        # when costs are missing or tied.
        out_cost = float(cfg.get("output_cost_per_1m") or 0.0)
        candidates.append((tier_distance, out_cost, name))

    if not candidates:
        return None

    candidates.sort(key=lambda t: (t[0], t[1], t[2]))
    surviving_names = [c[2] for c in candidates]

    # Apply the preferred-pairing tiebreaker if one exists and survived.
    pref = preferred.get(generator_model)
    if pref:
        if pref in surviving_names:
            return VerifierSelection(model_name=pref)
        # Preferred pairing exists but did not survive the rules.
        # Record the skip reason for the metrics layer.
        skip_reason = _why_preferred_skipped(
            pref, models, gen_provider, gen_tier, exclude
        )
        chosen = surviving_names[0]
        return VerifierSelection(
            model_name=chosen,
            preferred_skipped=(pref, skip_reason),
        )

    # No preferred pairing — rules alone pick.
    return VerifierSelection(model_name=surviving_names[0])


def _why_preferred_skipped(
    pref: str,
    models: dict,
    gen_provider: str,
    gen_tier: int,
    exclude: set[str],
) -> str:
    """Diagnose why the preferred pairing did not survive the rules.
    Used for metrics only — the chosen verifier is already decided."""
    cfg = models.get(pref)
    if cfg is None:
        return "preferred_not_in_models"
    if cfg.get("provider") == gen_provider:
        return "same_provider_as_generator"
    if not cfg.get("is_enabled", True):
        return "not_enabled"
    if not cfg.get("is_enabled_as_verifier", True):
        return "not_enabled_as_verifier"
    tier = cfg.get("tier")
    if tier is None:
        return "preferred_missing_tier"
    tier_distance = tier - gen_tier
    if tier_distance < 0 or tier_distance > 1:
        return "tier_out_of_range"
    if cfg.get("provider") in exclude:
        return "provider_excluded_after_failure"
    return "unknown"


def build_verification_prompt(
    original_task: str,
    original_response: str,
    task_type: str,
    template: str = ""
) -> str:
    """Build the verification prompt from template or default."""
    if template:
        return (template
                .replace("{original_task}", original_task or "(not provided)")
                .replace("{original_response}", original_response)
                .replace("{task_type}", task_type))

    # Default template if no file was configured
    return (
        "## Independent Verification\n\n"
        "A different AI model completed the task below. "
        "Check its work for errors, omissions, and incorrect reasoning.\n\n"
        f"### Original Task\n\n{original_task or '(not provided)'}\n\n"
        f"### Task Type: {task_type}\n\n"
        f"### Response Under Review\n\n{original_response}\n\n"
        "### Instructions\n\n"
        "Evaluate for:\n"
        "1. **Correctness** — errors, flaws, wrong conclusions\n"
        "2. **Completeness** — missing items the task required\n"
        "3. **False Positives** — issues flagged that aren't real\n\n"
        "Start with **VERIFIED** or **ISSUES FOUND**, then explain.\n"
        "Do NOT re-do the task. Only evaluate what was produced."
    )


def parse_verification_response(response: str) -> tuple[str, list]:
    """
    Parse the verifier's response into a verdict and issue list.

    Returns:
        (verdict, issues) where verdict is "VERIFIED" or "ISSUES_FOUND"
        and issues is a list of dicts with keys:
        description, category, severity
    """
    upper = response.upper().strip()

    # Normalize an optional leading "VERDICT:" prefix and surrounding markdown
    # emphasis (``*`` / ``_`` / ``#`` / ``>`` / ``-``) before detecting the
    # verdict token. The push template says "start with VERIFIED / ISSUES
    # FOUND", but the canonical machine grammar and the path-aware surface lead
    # with "VERDICT:", and models drift between the two. Without this,
    # "VERDICT: VERIFIED" falls through to ISSUES_FOUND and a clean pass is
    # misread as a blocking result — the exact spurious reopen Set 071 kills.
    head = re.sub(r'^[\s*_#>-]*VERDICT\s*[:.\-]?\s*', '', upper)
    head = re.sub(r'^[\s*_#>-]+', '', head)
    if head.startswith("VERIFIED"):
        # A VERIFIED verdict carries no issues. On the push surface the verdict
        # token IS the verifier's severity judgment — the template binds
        # VERIFIED <=> "no Critical/Major" — so the parser TRUSTS the token and
        # returns no findings. This is the safe, churn-free behaviour: it never
        # manufactures a blocking finding from a clean pass (incl. a VERIFIED +
        # NITS review). The severity-derived anti-laundering safety net lives in
        # is_blocking_verdict, which still blocks a Critical/Major handed to it
        # from a surface that returns structured findings (the pull surface's
        # Finding objects, or any direct caller). We deliberately do NOT scan a
        # VERIFIED body for "Severity: Major" substrings: a clean review that
        # merely *discusses* severity in prose would be misread as blocking —
        # the exact false positive Set 071 exists to eliminate.
        return "VERIFIED", []

    # Default to ISSUES_FOUND for anything that isn't a clear VERIFIED
    verdict = "ISSUES_FOUND"

    # Strip a leading "ISSUES FOUND" / "ISSUES_FOUND" header (optionally
    # "VERDICT:"-prefixed) *before* scanning for issues. The plural header
    # contains the substring "ISSUE", which the issue marker pattern below used
    # to mis-match — emitting a spurious, severity-less finding that (under
    # Set 071's anti-laundering default) reads as blocking. BOTH the spaced and
    # the underscored forms are stripped: the underscored ``ISSUES_FOUND`` is
    # the canonical machine spelling, and ``_`` is not whitespace, so it needs
    # its own character class (fixing only the spaced form left the canonical
    # sibling self-matching again — L-069-1, a bug is a bug *class*).
    body = re.sub(
        r'^[\s*_#>-]*(?:VERDICT\s*[:.\-]?\s*)?\*?\*?ISSUES?[\s_]*FOUND\*?\*?\s*[-:.]?\s*',
        '', response, flags=re.IGNORECASE
    ).strip()

    # Drop a trailing NITS section *before* issue parsing so non-blocking nits
    # never bleed into an issue's description (they are read separately, for
    # logging only, via :func:`parse_nits`). This keeps "nits stay out of the
    # issues list" literally true.
    nits_head = re.search(r'(?im)^\s*#{0,6}\s*\*{0,2}NITS\b.*$', body)
    if nits_head:
        body = body[: nits_head.start()].rstrip()

    # Parse individual issues
    issues = []
    # Look for patterns like "Issue 1:", "**Issue 1:**", "- Issue:"
    issue_pattern = re.compile(
        r'\*?\*?Issue\s*\d*\*?\*?\s*[:.]?\s*(.*?)(?=\*?\*?Issue\s*\d|\Z)',
        re.IGNORECASE | re.DOTALL
    )

    matches = issue_pattern.findall(body)
    for match in matches:
        issue = {"description": match.strip()}

        # Try to extract category. The separator class is permissive about
        # markdown emphasis / punctuation order, and the value stops at the line
        # end (or a ``*``) so it does not swallow the following Severity line.
        cat_match = re.search(
            r'Category[\s*:.\-_]*([^\n*]+)',
            match, re.IGNORECASE
        )
        if cat_match:
            issue["category"] = cat_match.group(1).strip()

        # Try to extract severity. The separator class tolerates any order of
        # markdown emphasis and punctuation, so "**Severity:** Minor",
        # "Severity: Minor", and "Severity - Major" all parse. The old regex
        # required asterisks *before* the colon and so silently dropped the
        # label on "**Severity:** Minor", making a Minor finding read as
        # unknown-severity -> blocking — reintroducing the churn Set 071 kills.
        sev_match = re.search(
            r'Severity[\s*:.\-_]*(Critical|Major|Minor)',
            match, re.IGNORECASE
        )
        if sev_match:
            issue["severity"] = sev_match.group(1).strip()

        if issue["description"]:
            issues.append(issue)

    # If no structured issue parsed but verdict is ISSUES_FOUND, treat the whole
    # (header-stripped) body as one issue so it is never silently dropped.
    if not issues and verdict == "ISSUES_FOUND":
        if body:
            issues.append({
                "description": body,
                "category": "unknown",
                "severity": "unknown"
            })

    return verdict, issues


def parse_nits(response: str) -> list:
    """Extract the non-blocking NITS observations from a verifier response.

    **Additive and observability-only.** Nits are deliberately kept OUT of the
    ``issues`` list returned by :func:`parse_verification_response` — an S1,
    cross-provider-verified invariant: a nit must **never** become a blocking
    issue (it must not grow the issue set, change the verdict, or reopen the
    loop). This helper lets a caller *read/log* the nits a review raised (under
    **either** verdict — a ``VERIFIED`` review may still list nits) without
    touching the ``(verdict, issues)`` contract or the blocking decision. It is
    the read side of the Set 071 ``NITS`` grammar; it does not change behaviour.

    Args:
        response: the raw verifier response text.

    Returns:
        The list of nit observation strings (empty when there is no NITS section
        or it carries no ``Nit:`` bullets).
    """
    if not response:
        return []
    # Locate the NITS section heading/label (optionally markdown-bold or a
    # ``#``-heading), then read to end or the next ``#`` heading.
    head = re.search(r'(?im)^\s*#{0,6}\s*\*{0,2}NITS\b.*$', response)
    if not head:
        return []
    tail = response[head.end():]
    stop = re.search(r'(?m)^\s*#{1,6}\s+\S', tail)
    section = tail[: stop.start()] if stop else tail

    nits: list = []
    for line in section.splitlines():
        # Match a nit bullet: "- **Nit:** x", "- Nit: x", "* Nit - x".
        m = re.match(
            r'(?i)^\s*[-*]\s*\*{0,2}Nit\*{0,2}\s*[:.\-]?\s*(.+?)\s*$', line
        )
        if m:
            text = m.group(1).strip().strip("*").strip()
            if text:
                nits.append(text)
    return nits


# ---------------------------------------------------------------------------
# Set 071 (S2): severity-anchored blocking classification + cross-round ledger.
#
# Set 071 stops a strong adversarial verifier from churning re-verify rounds on
# immaterial findings, WITHOUT weakening the devil's-advocate framing that
# catches real defects (hard constraint L-069-2). The materiality "so what?"
# gate, the anti-nitpick clause, and the merge-impact severity anchor ship in
# the reviewer prompt templates (Set 071 S1). The two helpers below are the
# *code* half: the predicate the re-verify loop consults to decide whether a
# round is justified, and the deterministic ledger that keeps a settled point
# from being resurrected across rounds.
#
# CONTRACT NOTE (load-bearing — do not bypass). The binary ``verdict`` token
# (``VERIFIED`` / ``ISSUES_FOUND``) is NOT sufficient to infer whether a result
# blocks the re-verify loop: an ``ISSUES_FOUND`` whose only findings are Minor /
# nits is non-blocking, and a Minor-only result is "effectively VERIFIED" for
# loop purposes. Callers MUST consult :func:`is_blocking_verdict` (or
# :func:`classify_blocking`) rather than switching on ``verdict`` alone. This is
# why Set 071 keeps the binary grammar (no third ``VERIFIED_WITH_NITS`` token)
# but makes blocking-ness a first-class, tested predicate instead.
#
# SURFACE NOTE. :func:`is_blocking_verdict` / :func:`classify_blocking` are
# **surface-agnostic**: they consume any list of severity-bearing finding dicts
# (``{"severity": ...}``). The two verification surfaces feed them by different
# routes — the *push* (routed session-verification) surface via
# :func:`parse_verification_response` here, and the *pull* (path-aware critique)
# surface via :class:`ai_router.pull_verifier.Finding` (whose ``to_dict`` emits
# the same ``severity`` key, parsed structurally from the ``submit_verdict``
# tool). So :func:`parse_verification_response` is the push parser **by design**;
# it does not (and should not) learn the pull "Findings" grammar — the pull
# surface already parses severity structurally. The blocking decision is shared.
# ---------------------------------------------------------------------------

# Severities that justify reopening / continuing a re-verify round. Compared
# case-insensitively against the parsed ``severity`` field.
BLOCKING_SEVERITIES = frozenset({"critical", "major"})
# The only severity that is recorded but never loop-opening on its own.
NONBLOCKING_SEVERITIES = frozenset({"minor"})


def _severity_of(issue: dict) -> str:
    """The lower-cased severity of a parsed issue ('' when missing)."""
    return str((issue or {}).get("severity") or "").strip().lower()


def is_blocking_verdict(verdict: str, issues: list) -> bool:
    """Whether a verification result should open / continue a re-verify round.

    The Set 071 loop discipline: a round is justified ONLY by a Critical/Major
    finding. A Minor-only / nits-only result is recorded but **non-blocking**
    (effectively VERIFIED for loop purposes), so the strong adversarial framing
    can keep its catch ceiling without manufacturing churn on immaterial points.

    Severity-DERIVED, not token-derived (the doc contract: "blocking is
    severity-anchored, NOT the bare verdict token"). The findings decide first;
    the verdict token only resolves the no-findings case.

    Rules (anti-laundering by design — *when in doubt, escalate*):

    * any finding Critical/Major           -> **blocking**, regardless of the
      verdict token (a Major under a mislabeled VERIFIED is never waved through).
    * any finding whose severity is unknown /
      missing / unrecognised               -> **blocking** (a real defect must not
      be laundered into a nit by an absent label).
    * findings present, **all** Minor      -> non-blocking (the VERIFIED-with-nits
      and the Minor-only-ISSUES_FOUND shapes both land here).
    * **no** findings + ``VERIFIED``       -> non-blocking.
    * **no** findings + non-VERIFIED       -> **blocking** (the verifier reported
      issues but none parsed; never silently drop them).

    Args:
        verdict: the parsed verdict token (``VERIFIED`` / ``ISSUES_FOUND``).
        issues: the parsed issue list from :func:`parse_verification_response`.

    Returns:
        True if the result blocks (justifies another re-verify round).
    """
    issues = issues or []
    # Severity-DERIVED, not token-derived. A Critical/Major (or unknown-severity)
    # finding blocks regardless of the verdict token — a Major present under a
    # (mislabeled) VERIFIED must never be laundered through. Only when there are
    # NO blocking findings does the verdict token decide the no-findings case.
    for issue in issues:
        if _severity_of(issue) not in NONBLOCKING_SEVERITIES:
            return True
    if issues:
        return False  # every finding present is Minor -> non-blocking
    # No findings parsed: VERIFIED -> non-blocking; a non-VERIFIED verdict
    # (ISSUES_FOUND) with no parsed findings is conservatively blocking.
    return not str(verdict or "").strip().upper().startswith("VERIFIED")


@dataclass
class BlockingClassification:
    """Richer result of :func:`classify_blocking` for the re-verify loop / logs.

    Attributes:
        blocking: the :func:`is_blocking_verdict` decision.
        blocking_issues: issues that justify a round (Critical/Major or
            unknown-severity in a non-VERIFIED result).
        nit_issues: issues recorded as Minor (non-blocking on their own).
        reason: a short human-readable explanation, for the session log.
    """
    blocking: bool
    blocking_issues: list = field(default_factory=list)
    nit_issues: list = field(default_factory=list)
    reason: str = ""


def classify_blocking(verdict: str, issues: list) -> BlockingClassification:
    """Split a verification result into blocking vs. nit findings + a reason.

    Same decision as :func:`is_blocking_verdict`, but returns the partition the
    loop discipline and the session log want: which findings opened the round and
    which were recorded as non-blocking nits. The ``reason`` mirrors the rule that
    fired so a skipped re-verify round is an auditable decision.
    """
    issues = issues or []
    # Partition by severity FIRST (severity-derived, same as is_blocking_verdict).
    blocking_issues, nit_issues = [], []
    for issue in issues:
        if _severity_of(issue) in NONBLOCKING_SEVERITIES:
            nit_issues.append(issue)
        else:
            blocking_issues.append(issue)
    if blocking_issues:
        return BlockingClassification(
            blocking=True,
            blocking_issues=blocking_issues,
            nit_issues=nit_issues,
            reason=f"{len(blocking_issues)} Critical/Major (or unknown-severity) "
                   f"finding(s) -> blocking",
        )
    if nit_issues:
        return BlockingClassification(
            blocking=False,
            nit_issues=nit_issues,
            reason=f"all {len(nit_issues)} finding(s) Minor -> non-blocking "
                   f"(effectively VERIFIED for the loop)",
        )
    # No findings parsed: the verdict token resolves it.
    if str(verdict or "").strip().upper().startswith("VERIFIED"):
        return BlockingClassification(
            blocking=False,
            reason="verdict VERIFIED, no findings -> non-blocking",
        )
    return BlockingClassification(
        blocking=True,
        reason="ISSUES_FOUND with no parsed findings -> blocking "
               "(conservative: do not silently drop)",
    )


# Ledger statuses tracked per prior blocking finding, keyed on a stable id.
LEDGER_RESOLVED = "RESOLVED"
LEDGER_UNRESOLVED = "UNRESOLVED"


@dataclass
class LedgerReconciliation:
    """Result of reconciling the cross-round issue ledger by stable id.

    Attributes:
        resolved: prior blocker ids that are absent this round (now settled).
        unresolved: prior blocker ids still present this round.
        new_blockers: blocker ids appearing for the first time this round.
        resurrected: ids previously marked ``RESOLVED`` that reappear this round —
            the forbidden churn pattern (a settled point re-litigated). These are
            reported so the loop can refuse to reopen them.
        status: the updated id -> ``RESOLVED`` / ``UNRESOLVED`` map after this
            round (excludes resurrected ids, which stay ``RESOLVED``).
    """
    resolved: list = field(default_factory=list)
    unresolved: list = field(default_factory=list)
    new_blockers: list = field(default_factory=list)
    resurrected: list = field(default_factory=list)
    status: dict = field(default_factory=dict)


def reconcile_issue_ledger(
    prior_status: Optional[dict],
    current_blocker_ids: Iterable[str],
) -> LedgerReconciliation:
    """Reconcile the cross-round issue ledger keyed on a stable blocker id.

    The Set 071 re-verify loop tracks each *blocking* finding by a stable
    ``issueId``. Each round, prior blockers are marked ``RESOLVED`` (absent now)
    or ``UNRESOLVED`` (still present). A finding whose id was previously
    ``RESOLVED`` but reappears is a **resurrection** — the churn pattern this set
    forbids (the same settled point raised again). Keying on the stable id, not
    free text, makes the no-reopen rule deterministic: the orchestrator assigns a
    rephrased-but-same point the **same** ledger id (so it is recognised as
    settled), while a genuinely new finding gets a new id and is judged on its own
    merits against the materiality gate.

    Note: the "no resurrection under *new wording*" rule is enforced here only to
    the extent the orchestrator keeps the id stable for the same point — the
    judgment that two differently-worded findings are the *same* point is a human
    one (documented in the Step 6 loop discipline). This helper enforces the
    deterministic half: once an id is ``RESOLVED``, reopening it is flagged.

    Args:
        prior_status: id -> ``RESOLVED`` / ``UNRESOLVED`` from prior rounds
            (``None`` / empty on the first round).
        current_blocker_ids: blocker ids in the current round.

    Returns:
        A :class:`LedgerReconciliation`.
    """
    prior = dict(prior_status or {})
    current = list(dict.fromkeys(current_blocker_ids))  # de-dupe, keep order
    current_set = set(current)

    resurrected = [
        i for i in current if prior.get(i) == LEDGER_RESOLVED
    ]
    resurrected_set = set(resurrected)

    new_blockers = [
        i for i in current if i not in prior
    ]
    unresolved = [
        i for i in current if i in prior and i not in resurrected_set
    ]
    resolved = [
        i for i in prior if prior[i] == LEDGER_UNRESOLVED and i not in current_set
    ]

    status = dict(prior)
    # Prior unresolved blockers no longer present become RESOLVED.
    for i in resolved:
        status[i] = LEDGER_RESOLVED
    # New blockers this round are UNRESOLVED.
    for i in new_blockers:
        status[i] = LEDGER_UNRESOLVED
    # Still-present prior blockers stay UNRESOLVED.
    for i in unresolved:
        status[i] = LEDGER_UNRESOLVED
    # Resurrected ids stay RESOLVED (the loop refuses to reopen them).

    return LedgerReconciliation(
        resolved=resolved,
        unresolved=unresolved,
        new_blockers=new_blockers,
        resurrected=resurrected,
        status=status,
    )


# ---------------------------------------------------------------------------
# Copilot CLI hybrid-tier verifier picker (Set 078 S3).
#
# pick_verifier_model() above resolves against the static `models:` registry
# in router-config.yaml (fixed provider/tier/pricing per entry). Under the
# `copilot-cli` transport profile there is no such registry entry for a
# catalog model -- eligibility is late-bound against the seat-local lockfile
# (ai_router/copilot_catalog.py) instead. This is a parallel picker, not a
# branch inside pick_verifier_model, because the two eligibility universes
# (static config vs. seat-probed catalog) don't share a candidate list to
# filter.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CopilotCliVerifierSelection:
    """A verifier resolved against the seat catalog (mirrors VerifierSelection's
    role for the copilot-cli transport)."""
    model_id: str
    provider: str


@dataclass(frozen=True)
class ProvenanceUnavailable:
    """Fail-closed result when no confirmed catalog entry in the verifier
    role's ``prefer`` list resolves to a provider distinct from the
    generator's (design lock Section 2's ``cross_role_provider_diversity``,
    ``on_violation: fail_closed`` -- Critique-2 M3). Never an exception: the
    route()/verify() caller reads this like any other result-object-style
    outcome and reports "verification unavailable", never silently verifying
    with the same underlying provider as the generator.
    """
    reason: str


def walk_role_prefer(
    catalog,  # ai_router.copilot_catalog.Catalog -- typed loosely, see below.
    prefer: list,
    require_provider_in: set,
    exclude_providers: set = frozenset(),
):
    """Yield each ``prefer``-list entry that survives on the seat catalog, in
    declared order: (a) ``confirmed``, (b) provider in ``require_provider_in``
    (when set), (c) provider not in ``exclude_providers``.

    Shared by :func:`pick_copilot_cli_verifier` (below) and
    ``ai_router._resolve_copilot_generator`` (code-review finding, Set 078
    S3 -- the two role resolvers duplicated this walk almost verbatim). The
    fail-closed CONTRACT stays entirely in each caller: an unresolvable
    generator is fatal (nothing to route()); an unresolvable verifier
    degrades to "verification unavailable". This helper only does the
    walk, never decides what "nothing survived" means.
    """
    confirmed_by_id = {e.id: e for e in catalog.confirmed_models()}
    for model_id in prefer:
        entry = confirmed_by_id.get(model_id)
        if entry is None:
            continue
        if require_provider_in and entry.provider not in require_provider_in:
            continue
        if entry.provider in exclude_providers:
            continue
        yield entry


def pick_copilot_cli_verifier(
    *,
    generator_provider: str,
    config: dict,
    catalog,  # ai_router.copilot_catalog.Catalog -- typed loosely to avoid a
              # hard import dependency from this module onto copilot_catalog.
    exclude_providers: frozenset = frozenset(),
) -> "CopilotCliVerifierSelection | ProvenanceUnavailable":
    """Resolve the ``verifier`` role against the seat-local catalog.

    Walks ``transports.copilot-cli.roles.verifier.prefer`` in declared order;
    a candidate survives if it is (a) ``confirmed`` on the live catalog,
    (b) its provider is in ``require_provider_in`` (when set), and (c) its
    provider is neither ``generator_provider`` nor in ``exclude_providers``.
    The first survivor wins. Fails closed to :class:`ProvenanceUnavailable`
    when nothing survives -- never raises, never returns a same-provider
    pairing.
    """
    roles_cfg = (
        (config.get("transports") or {}).get("copilot-cli") or {}
    ).get("roles") or {}
    verifier_cfg = roles_cfg.get("verifier") or {}
    prefer = verifier_cfg.get("prefer") or []
    require_provider_in = set(verifier_cfg.get("require_provider_in") or [])
    excluded = set(exclude_providers) | {generator_provider}

    survivor = next(
        walk_role_prefer(catalog, prefer, require_provider_in, excluded), None
    )
    if survivor is not None:
        return CopilotCliVerifierSelection(
            model_id=survivor.id, provider=survivor.provider
        )

    return ProvenanceUnavailable(
        reason=(
            f"no confirmed catalog entry in the verifier role's prefer list "
            f"{prefer!r} resolves to a provider distinct from the generator's "
            f"{generator_provider!r} (cross_role_provider_diversity, "
            "on_violation: fail_closed)"
        )
    )
