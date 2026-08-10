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

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .pricing import worst_case_output_cost_per_1m
except ImportError:  # pragma: no cover - test/bare context
    from pricing import worst_case_output_cost_per_1m  # type: ignore[import-not-found]


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
        out_cost = worst_case_output_cost_per_1m(cfg)
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


def _strip_nits_section(text: str) -> str:
    """Drop a trailing NITS section so non-blocking nits never bleed into issue
    parsing (they are read separately, for logging only, via :func:`parse_nits`).
    """
    nits_head = re.search(r'(?im)^\s*#{0,6}\s*\*{0,2}NITS\b.*$', text)
    return text[: nits_head.start()].rstrip() if nits_head else text


def _parse_acceptance(block: str) -> Optional[dict]:
    """Parse a finding's acceptance criterion (Set 111 S2, Proposal B).

    TOLERANT, like every other field here: an absent, malformed, or
    unparseable criterion returns ``None`` and never changes blocking
    classification. Two shapes come out, mirroring the two forms the
    template asks for:

    - ``{"kind": "executable", "command": ..., "expectedExitCode": int,
      "expectedOutputContains": str?}`` — a single backticked command the
      acceptance harness may RUN against the pre-fix and fixed trees.
    - ``{"kind": "judgment", "statement": ...}`` — a prose sentence a
      reviewer settles. Never executed.

    The executable form requires a **backticked** command: unfenced prose
    is read as judgment, so a criterion the verifier did not deliberately
    mark as runnable is never handed to a shell-adjacent runner. The
    ``JUDGMENT`` marker wins over a backticked span — whether it sits
    **before** the backticks (a judgment sentence quoting a command) or
    **inside** them (the whole criterion backticked, which is how the
    template's own ``JUDGMENT - <sentence>`` example reads).
    """
    crit_match = re.search(
        r'Acceptance[\s*_-]*criterion[\s*:.\-_]*([^\n]+)', block, re.IGNORECASE
    )
    if not crit_match:
        return None
    raw = crit_match.group(1).strip()
    # Trailing emphasis only: a leading '*' would eat a globbed command.
    value = raw.rstrip("*").strip()
    if not value:
        return None

    judgment = re.match(r'(?i)^\**\s*judgment\b\**[\s:.\-\u2014\u2013]*(.*)$', value)
    if judgment:
        statement = judgment.group(1).strip().strip("*").strip()
        return {"kind": "judgment", "statement": statement or value}

    command_match = re.search(r'`([^`]+)`', value)
    if not command_match:
        # Unfenced prose: honest judgment, never a command.
        return {"kind": "judgment", "statement": value}
    command = command_match.group(1).strip()
    if not command:
        return {"kind": "judgment", "statement": value}

    # Set 111 S3: the marker also wins from INSIDE the backticks. The
    # template offers "a single backticked command, or `JUDGMENT -
    # <sentence>`", so a verifier that backticks the whole criterion --
    # the first real round of this set did exactly that -- would
    # otherwise hand a prose sentence to the runner as a command. It
    # fails closed (the run errors and the finding stays blocking), but
    # it mislabels the criterion and burns a harness run proving nothing.
    inner_judgment = re.match(
        r'(?i)^\**\s*judgment\b\**[\s:.\-\u2014\u2013]*(.*)$', command
    )
    if inner_judgment:
        statement = inner_judgment.group(1).strip().strip("*").strip()
        return {"kind": "judgment", "statement": statement or command}

    acceptance: dict = {
        "kind": "executable",
        "command": command,
        "expectedExitCode": 0,
    }
    exp_match = re.search(
        r'Acceptance[\s*_-]*expectation[\s*:.\-_]*([^\n]+)',
        block,
        re.IGNORECASE,
    )
    if exp_match:
        expectation = exp_match.group(1).strip()
        exit_match = re.search(
            r'exit(?:\s*code)?[\s*:=]*(-?\d+)', expectation, re.IGNORECASE
        )
        if exit_match:
            acceptance["expectedExitCode"] = int(exit_match.group(1))
        contains = re.search(
            r'contains?[\s*:=]*(?:'
            r'"([^"]+)"'
            r"|\u201c([^\u201d]+)\u201d"
            r"|`([^`]+)`"
            r"|'([^']+)'"
            r")",
            expectation,
            re.IGNORECASE,
        )
        if contains:
            # Whichever quoting style matched. Matching the CLOSING quote of
            # the style that opened is what lets a substring contain the
            # other quote character -- e.g. output containing "VALUE =
            # 'fixed'", which a character-class scan truncates at the
            # apostrophe and then reports as an edited criterion.
            value = next(
                (g for g in contains.groups() if g is not None), ""
            ).strip()
            if value:
                acceptance["expectedOutputContains"] = value
    return acceptance


def normalize_evidence_path(raw: str) -> str:
    """Normalize one verifier-written path to a repo-relative comparison form.

    Set 119 S1. Verifiers write paths the way they read them, so the same
    file arrives as ``ai_router/verification.py``, ``.\\ai_router\\verification.py``
    or ``ai_router/verification.py:613`` from one round to the next. This
    strips the decoration a reviewer adds (markdown emphasis, backticks,
    quotes, surrounding brackets, a trailing ``:<line>`` / ``:<line>-<line>``
    reference or ``#anchor``) and normalizes separators, returning ``""``
    for anything that is not a path at all.

    Mis-normalization is deliberately biased toward blocking: an entry this
    function cannot recognize does not match the documentation predicate,
    so the finding keeps its declared severity (see :func:`is_doc_only_issue`).
    """
    text = str(raw or "")
    # Separators first, so decoration stripping below sees one alphabet and a
    # trailing markdown backslash cannot survive as a path separator.
    text = text.replace("\\", "/")
    text = re.sub(r'/{2,}', '/', text)
    text = text.strip().strip("`'\"*_[]()<>,;").strip()
    if not text:
        return ""
    # A ``file.py:613`` / ``file.py:613-620`` line reference, or a
    # ``doc.md#anchor`` fragment, names the same file.
    text = re.sub(r'[:#][0-9]+(?:-[0-9]+)?$', '', text)
    text = re.sub(r'#.*$', '', text)
    text = text.strip().strip("`'\"*_,;.").strip()
    while text.startswith("./"):
        text = text[2:]
    text = text.lstrip("/")
    if len(text) > 1:
        text = text.rstrip("/")
    if not text or text in (".", ".."):
        return ""
    return text


def _parse_evidence_paths(text: str) -> list:
    """Parse an ``Evidence paths:`` line's value into normalized paths.

    Separators are commas, semicolons and whitespace — the three shapes a
    reviewer actually writes (``a.py, b.md``; ``a.py b.md``). Entries that
    normalize to nothing are dropped rather than kept as noise.
    """
    out: list = []
    for chunk in re.split(r'[,;\s]+', str(text or "")):
        path = normalize_evidence_path(chunk)
        if path and path not in out:
            out.append(path)
    return out


def _parse_issue_blocks(body: str) -> list:
    """Parse explicit ``Issue N:`` blocks from a header/NITS-stripped body.

    Structural grammar ONLY — an ``Issue`` marker plus optional ``Category:`` /
    ``Severity:`` labels. It never scans free prose for severity words: a block
    with no ``Severity:`` label carries no ``severity`` key (the Set-071
    false-positive guard). Shared by the ISSUES_FOUND path and the VERIFIED
    contradiction-surfacing branch so both read the identical grammar.
    """
    issues: list = []
    # Match an explicit structured issue-block HEADER only: at the start of a
    # line (after optional bullet / emphasis / heading markers) the whole word
    # "Issue", an optional number, then a REQUIRED ':' or '.'. Line-anchoring
    # (MULTILINE ^ + horizontal-only [ \t] inside the marker) plus the required
    # punctuation keep mid-prose mentions ("...the issue template...") and bare
    # inline "issue" OUT — the Set-071 false-positive guard. The captured body
    # runs (DOTALL) to the next such header or end.
    marker = r'^[ \t]*[-*>#]*[ \t]*\*{0,2}Issue\b[ \t]*\d*\*{0,2}[ \t]*[:.][ \t]*'
    issue_pattern = re.compile(
        marker + r'(.*?)(?=' + marker + r'|\Z)',
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    for match in issue_pattern.findall(body):
        issue = {"description": match.strip()}
        # Category: permissive separators; value stops at line end (or ``*``) so
        # it does not swallow the following Severity line.
        cat_match = re.search(r'Category[\s*:.\-_]*([^\n*]+)', match, re.IGNORECASE)
        if cat_match:
            issue["category"] = cat_match.group(1).strip()
        # Severity: tolerant of markdown emphasis / punctuation order so
        # "**Severity:** Minor", "Severity: Minor", "Severity - Major" all parse.
        sev_match = re.search(
            r'Severity[\s*:.\-_]*(Critical|Major|Minor)', match, re.IGNORECASE
        )
        if sev_match:
            issue["severity"] = sev_match.group(1).strip()
        # Failure scenario (Set 096): the consequence rubric makes a stated
        # failure scenario mandatory for every blocking Issue. TOLERANT parse —
        # optional field, value runs to end of line (the template asks for one
        # scenario line); its absence never changes blocking classification
        # (classify_blocking semantics are unchanged by design).
        fs_match = re.search(
            r'Failure[\s*_-]*scenario[\s*:.\-_]*([^\n]+)', match, re.IGNORECASE
        )
        if fs_match:
            scenario = fs_match.group(1).strip().strip("*").strip()
            if scenario:
                issue["failureScenario"] = scenario
        # Evidence paths (Set 119 S1): the repo-relative paths the verifier
        # actually looked at. MANDATORY on a Critical/Major issue per the
        # template, but parsed TOLERANTLY here: an absent line leaves the key
        # off, and a finding with no paths keeps its declared severity (the
        # anti-laundering default is unchanged — see is_doc_only_issue).
        ep_match = re.search(
            r'Evidence[\s*_-]*paths?[\s*:.\-_]*([^\n]+)', match, re.IGNORECASE
        )
        if ep_match:
            paths = _parse_evidence_paths(ep_match.group(1))
            if paths:
                issue["evidencePaths"] = paths
        # Acceptance criterion (Set 111 S2): the closed question that
        # settles the finding. Tolerant, optional; the harness — never
        # this parser — decides whether it discriminates.
        acceptance = _parse_acceptance(match)
        if acceptance:
            issue["acceptance"] = acceptance
        if issue["description"]:
            issues.append(issue)
    return issues


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
        # A VERIFIED verdict normally carries no issues: on the push surface the
        # token IS the verifier's severity judgment (the template binds
        # VERIFIED <=> "no Critical/Major"), so we TRUST it for the clean and the
        # VERIFIED+NITS cases. BUT we still SURFACE a genuinely *structured*
        # blocking finding — an explicit ``Issue N:`` block carrying an explicit
        # ``Severity: Critical/Major`` label — so a VERIFIED-token/Major mismatch
        # is visible as CONTRADICTORY evidence the caller can adjudicate (SS1,
        # anti-laundering: a Major hidden under a mislabeled VERIFIED is never
        # dropped). We match ONLY the structured grammar and NEVER scan prose for
        # severity words: a clean review that merely *discusses* severity has no
        # ``Severity:`` label and stays clean — the Set-071 false positive is
        # preserved. A labelled Minor under VERIFIED is coherent (a nit) and is
        # left out of the issue list.
        structured = _parse_issue_blocks(_strip_nits_section(response))
        # Use the SHARED predicate (one source of truth — not a local
        # Critical/Major string check): a structured block whose severity is
        # Critical/Major OR unknown/missing/unrecognized ("Severity: High", or no
        # label at all) is blocking contradictory evidence and must be surfaced;
        # only an explicit Minor is a coherent nit and stays out. This keeps the
        # anti-laundering rule "unknown severity blocks" true on the VERIFIED
        # surface too — a structured Major can never be dropped by relabeling.
        blocking = [i for i in structured if is_blocking_issue(i)]
        return "VERIFIED", blocking

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
    # never bleed into an issue's description. This keeps "nits stay out of the
    # issues list" literally true.
    body = _strip_nits_section(body)

    # Parse individual issues (shared structural grammar — see _parse_issue_blocks).
    issues = _parse_issue_blocks(body)

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


FIX_VERDICT_TOKENS = (
    "fix-accepted",
    "fix-rejected",
    "accepted-with-modification",
    # Set 096 S2 round 9: the reviewer's sanctioned way to declare that a
    # ledger occurrence is the SAME point as another id (fan-out siblings,
    # reworded restatements) — its disposition follows the target's, so a
    # redundant occurrence never manufactures a coverage failure. The
    # identity judgment is the reviewer's, recorded; never fuzzy-matched.
    "duplicate-of",
)

# A per-finding fix verdict line, as the remediation-review phase framing
# prescribes it: ``- Fix verdict: <finding> -- fix-accepted`` (or
# ``-- duplicate-of L2``). Tolerant of bullet/emphasis markers and
# separator drift, like the Issue grammar above.
_FIX_VERDICT_RE = re.compile(
    r'^[ \t]*[-*>#]*[ \t]*\*{0,2}Fix[\s_-]*verdict\*{0,2}[ \t]*[:.\-]*[ \t]*'
    r'(?P<finding>.*?)[ \t]*[-:–—]*[ \t]*'
    r'\**(?P<verdict>fix-accepted|fix-rejected|accepted-with-modification'
    r'|duplicate-of[ \t]+L\d+)\**'
    r'[ \t]*\.?[ \t]*$',
    re.IGNORECASE | re.MULTILINE,
)


def parse_fix_verdicts(response: str) -> list:
    """Extract per-finding fix verdicts from a REMEDIATION-REVIEW response.

    **Additive and observability-only** (Set 096, the same contract as
    :func:`parse_nits`): the phased loop's remediation-review framing asks the
    verifier for one ``Fix verdict: <finding> -- fix-accepted | fix-rejected |
    accepted-with-modification`` line per prior blocking finding. This helper
    reads those lines for logging and the findings envelope; it never touches
    the ``(verdict, issues)`` contract or the blocking decision — a
    ``fix-rejected`` finding blocks because the framing requires it to be
    re-stated as a severity-bearing Issue block, which the normal parser and
    :func:`classify_blocking` already handle.

    Returns a list of ``{"finding": str, "verdict": str}`` dicts (verdict
    lower-cased, one of :data:`FIX_VERDICT_TOKENS`), empty when no line
    matches.
    """
    if not response:
        return []
    verdicts: list = []
    for match in _FIX_VERDICT_RE.finditer(response):
        finding = match.group("finding").strip().strip("*`").strip()
        raw_verdict = match.group("verdict").lower()
        entry = {
            "finding": finding or "(unnamed finding)",
        }
        dup = re.match(r"^duplicate-of\s+(?P<target>l\d+)$", raw_verdict)
        if dup:
            entry["verdict"] = "duplicate-of"
            entry["duplicateOf"] = dup.group("target").upper()
        else:
            entry["verdict"] = raw_verdict
        # Set 096 S2 coverage: the remediation-review framing prescribes a
        # leading ledger id (``Fix verdict: L3 ...``); captured when present
        # so the CLI can compare coverage against the ledger's id set.
        lid = re.match(r"^\(?\s*(?P<lid>L\d+)\)?\b", finding)
        if lid:
            entry["ledgerId"] = lid.group("lid")
        verdicts.append(entry)
    return verdicts


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

# ---------------------------------------------------------------------------
# Set 119 S1: the doc-only severity cap.
#
# Operator-attested verification reduction (decisions.jsonl, Set 119 S1,
# authority=human / rubric_line=verification-reduction). Measured: Set 116 S3
# spent 13 routed calls and $4.75 on a session whose code was clean at round 1
# and stayed clean; every Critical/Major after round 1 concerned the WORDING of
# a markdown doc, and two of the three were created by fixing the previous one.
# Across 572 findings in this repo's history, 520 (91%) are Major -- a scale on
# which 91% of findings block is not a scale.
#
# The rule: a finding that NAMES its evidence, and whose named evidence is
# ENTIRELY documentation prose, is recorded at Minor and opens no round.
#
# Three properties keep this from being the laundering vector in reverse:
#
#  1. **Doc-ness is derived from paths, never self-declared.** The only input is
#     ``evidencePaths``. A verifier asserting "this is only a doc issue" in its
#     description or ``category`` changes nothing -- ``category`` is free text
#     that reads "docs" twice across all 572 findings anyway.
#  2. **Absence is not doc-ness.** A finding with no ``evidencePaths`` is
#     UNCHANGED: Critical/Major/unknown all still block. The anti-laundering
#     default ("unknown severity blocks") is untouched, and so is the incentive
#     to cite evidence -- an uncited blocking finding is not cheaper.
#  3. **Behaviour-bearing markdown is not documentation.** The reviewer prompt
#     templates ARE the verifier's instructions: a defect in one changes what
#     every routed call does, so it is code that happens to be spelled in
#     markdown and it keeps its declared severity.
# ---------------------------------------------------------------------------

# File extensions that make a path documentation PROSE. Deliberately extension-
# based and not directory-based: ``docs/`` also holds machine contracts
# (``docs/session-issues.schema.json``, the disposition schema) whose defects are
# real defects, and a schema is not prose because of where it lives.
DOC_EVIDENCE_SUFFIXES = frozenset({".md", ".markdown", ".rst", ".txt"})

# Path prefixes whose markdown is BEHAVIOUR, not prose. A finding citing only
# these keeps its declared severity. See property 3 above.
BEHAVIOURAL_MARKDOWN_PREFIXES = ("ai_router/prompt-templates/",)


def is_documentation_path(path: str) -> bool:
    """Whether one evidence path is documentation prose.

    Extension-based (see :data:`DOC_EVIDENCE_SUFFIXES`), minus the
    behaviour-bearing markdown in :data:`BEHAVIOURAL_MARKDOWN_PREFIXES`.
    Anything unrecognized -- an empty string, a bare prose phrase, a path this
    function cannot normalize -- is **not** documentation, which is the safe
    direction: it leaves the finding blocking.
    """
    normalized = normalize_evidence_path(path)
    if not normalized:
        return False
    lowered = normalized.lower()
    if lowered.startswith(BEHAVIOURAL_MARKDOWN_PREFIXES):
        return False
    dot = lowered.rfind(".")
    if dot <= lowered.rfind("/"):
        return False  # no extension in the final segment
    return lowered[dot:] in DOC_EVIDENCE_SUFFIXES


def is_doc_only_issue(issue: dict) -> bool:
    """Whether a finding's cited evidence is ENTIRELY documentation prose.

    True only when the finding names at least one evidence path and **every**
    named path is documentation (:func:`is_documentation_path`). A finding with
    no ``evidencePaths``, or one that names a single non-doc path alongside any
    number of docs, is False -- so a mixed doc-and-code finding keeps its
    declared severity and still opens a round.
    """
    raw = (issue or {}).get("evidencePaths")
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)) or not raw:
        return False
    seen_any = False
    for entry in raw:
        if not isinstance(entry, str):
            return False
        if not normalize_evidence_path(entry):
            continue  # decoration that normalized away is not evidence
        seen_any = True
        if not is_documentation_path(entry):
            return False
    return seen_any


def _severity_of(issue: dict) -> str:
    """The lower-cased severity of a parsed issue ('' when missing)."""
    return str((issue or {}).get("severity") or "").strip().lower()


def is_blocking_issue(issue: dict) -> bool:
    """Whether a single finding, on its own, opens/continues a re-verify round.

    The ONE per-issue severity predicate — shared by :func:`is_blocking_verdict`,
    :func:`classify_blocking`, and the dedicated state machine's
    ``derive_state`` (SS1: one source of truth, so the loop layer and the
    workflow layer can never disagree about what "blocking" means). Critical or
    Major — or any unknown/missing severity (a real defect must never be
    laundered into a nit by an absent label) — is blocking; only an explicit
    Minor is non-blocking.

    Set 119 S1 adds the one exception, and it is the operator-attested doc-only
    cap: a finding whose cited ``evidencePaths`` are **all** documentation prose
    records at Minor and does not open a round. It is applied here, at the one
    shared chokepoint, so both verification surfaces inherit it identically —
    and it reads ``evidencePaths`` alone, so it can never be self-declared. The
    unknown-severity default above is unchanged: a finding that cites nothing
    still blocks.
    """
    if is_doc_only_issue(issue):
        return False
    return _severity_of(issue) not in NONBLOCKING_SEVERITIES


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
    * a finding whose cited ``evidencePaths``
      are **all** documentation prose      -> non-blocking (Set 119 S1, the
      operator-attested doc-only cap; see :func:`is_blocking_issue`).
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
        if is_blocking_issue(issue):
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
            Includes the doc-only-capped findings below — they are nits now.
        doc_capped_issues: the subset of ``nit_issues`` that would have blocked
            on their declared severity and were capped at Minor because every
            path they cited is documentation prose (Set 119 S1). Recorded
            separately so the cap is **auditable**: a reader can see which
            findings it fired on without re-deriving it.
        reason: a short human-readable explanation, for the session log.
    """
    blocking: bool
    blocking_issues: list = field(default_factory=list)
    nit_issues: list = field(default_factory=list)
    reason: str = ""
    doc_capped_issues: list = field(default_factory=list)


def classify_blocking(verdict: str, issues: list) -> BlockingClassification:
    """Split a verification result into blocking vs. nit findings + a reason.

    Same decision as :func:`is_blocking_verdict`, but returns the partition the
    loop discipline and the session log want: which findings opened the round and
    which were recorded as non-blocking nits. The ``reason`` mirrors the rule that
    fired so a skipped re-verify round is an auditable decision — including the
    Set 119 doc-only cap, which is named explicitly whenever it fires.
    """
    issues = issues or []
    # Partition by severity FIRST (severity-derived, same as is_blocking_verdict).
    blocking_issues, nit_issues, doc_capped = [], [], []
    for issue in issues:
        if is_blocking_issue(issue):
            blocking_issues.append(issue)
            continue
        nit_issues.append(issue)
        # A finding the cap demoted: it declared a blocking severity and was
        # kept out of the loop solely because every path it cited is docs.
        if _severity_of(issue) not in NONBLOCKING_SEVERITIES:
            doc_capped.append(issue)
    capped_note = (
        f" ({len(doc_capped)} doc-only capped at Minor)" if doc_capped else ""
    )
    if blocking_issues:
        return BlockingClassification(
            blocking=True,
            blocking_issues=blocking_issues,
            nit_issues=nit_issues,
            doc_capped_issues=doc_capped,
            reason=f"{len(blocking_issues)} Critical/Major (or unknown-severity) "
                   f"finding(s) -> blocking{capped_note}",
        )
    if nit_issues:
        return BlockingClassification(
            blocking=False,
            nit_issues=nit_issues,
            doc_capped_issues=doc_capped,
            reason=f"all {len(nit_issues)} finding(s) Minor -> non-blocking "
                   f"(effectively VERIFIED for the loop){capped_note}",
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


class VerificationUnavailableError(RuntimeError):
    """Set 084 (F2): the hard ``verification_unavailable`` outcome.

    Raised when dynamic verifier exclusion (the session orchestrator's
    registry-resolved effective provider is excluded from selection)
    leaves NO eligible different-provider candidate — e.g. a Copilot
    seat whose catalog lockfile confirms only one provider's models.
    This is an explicit blocked state: no verdict is written, the close
    stays blocked, and the only sanctioned resolution is the
    operator-attested manual path (``close_session --manual-verify``
    with an attestation naming the verifying surface, model, effective
    provider, template used, timestamp, and the raw artifact). Never a
    silent same-provider verification; never an engine-facing skip
    (operator mandate, Set 083).
    """

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


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
