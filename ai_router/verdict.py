"""Verifier-response parsing and blocking classification.

The parser is structural, never prose-scanning: a verdict token at the head
of the response, ``Issue N:`` blocks with per-field tolerant parses, and a
``NITS`` section parsed on the same terms. Nothing a verifier wrote is ever
discarded: a NITS finding is recorded as ``minor`` and tagged
``section: nits``, and a NITS finding that declares a blocking severity keeps
it — the section is a formatting convention, not a severity. Every ambiguity
fails closed — an unrecognizable verdict is ISSUES_FOUND, an ISSUES_FOUND body
with no parseable block becomes one unknown-severity issue, and an
unrecognized severity blocks. Severity may not be laundered by misspelling.

The severity vocabulary is closed at the writer: ``critical`` / ``major`` /
``minor`` only. Anything else normalizes to ``major`` (blocking-preserving)
with the raw token kept on the finding for the reader.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

VERDICT_VERIFIED = "VERIFIED"
VERDICT_ISSUES_FOUND = "ISSUES_FOUND"
VERDICT_REMEDIATED_AT_CAP = "REMEDIATED_AT_CAP"

# The closed allowlist for any verdict a writer persists (session-state's
# verificationVerdict, the rounds ledger). Every token here is produced by
# the loop; there is no verdict a person can type.
#
# REMEDIATED_AT_CAP is not a waiver and must never be read as one. A waiver
# accepted work over a finding that still stood; this is the opposite —
# every blocking finding was fixed and the cap left the repair unreviewed.
# WAIVED is retired from this allowlist, so no writer can emit it again;
# the record schemas still READ it, because historical rows carry it and a
# retired token must not make the machine's own record unreadable.
SESSION_VERDICTS = frozenset(
    {VERDICT_VERIFIED, VERDICT_ISSUES_FOUND, VERDICT_REMEDIATED_AT_CAP}
)

#: How each terminal state of a review loop reads to a person. Keyed by the
#: closed vocabulary and nothing else: a fourth state would have to be added
#: to SESSION_VERDICTS first, which is the point. Every loop and every view
#: that names a terminal state reads it here, so the run core's loop and the
#: session projection cannot describe the same record in two vocabularies.
TERMINAL_HEADLINES = {
    VERDICT_VERIFIED: "verified",
    VERDICT_ISSUES_FOUND: "unresolved at the cap",
    VERDICT_REMEDIATED_AT_CAP: "remediated at the cap",
}

SEVERITIES = ("critical", "major", "minor")
BLOCKING_SEVERITIES = frozenset({"critical", "major"})


# --- Parsing ----------------------------------------------------------------

_VERDICT_PREFIX = re.compile(r"^[\s*_#>-]*VERDICT\s*[:.\-]?\s*")
_MARKDOWN_NOISE = re.compile(r"^[\s*_#>-]+")
_ISSUES_HEADER = re.compile(
    r"^[\s*_#>-]*(?:VERDICT\s*[:.\-]?\s*)?\*?\*?ISSUES?[\s_]*FOUND\*?\*?"
    r"\s*[-:.]?\s*"
)
_NITS_SECTION = re.compile(
    r"^\s*#{0,6}\s*\*{0,2}NITS\b.*$", re.IGNORECASE | re.MULTILINE
)

# Line-anchored, horizontal whitespace only, trailing ':' or '.' required —
# keeps mid-prose "the issue template" from opening a block.
# The trailing `\*{0,2}` closes `**Issue 1:**` — bold that wraps the colon
# rather than sitting inside it, which would otherwise open every recorded
# description with a stray `**`.
_ISSUE_MARKER = (
    r"^[ \t]*[-*>#]*[ \t]*\*{0,2}Issue\b[ \t]*\d*\*{0,2}[ \t]*[:.]"
    r"[ \t]*\*{0,2}[ \t]*"
)
_ISSUE_BLOCKS = re.compile(
    _ISSUE_MARKER + r"(.*?)(?=" + _ISSUE_MARKER + r"|\Z)",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)

# NITS bodies are usually a bullet or numbered list, not ``Issue N:`` blocks.
_BULLET_LINE = re.compile(r"^[ \t]*(?:[-*+\u2022]|\d+[.)])[ \t]+(.*)$")

_CATEGORY = re.compile(r"Category[\s*:.\-_]*([^\n*]+)", re.IGNORECASE)
_SEVERITY = re.compile(
    r"Severity[\s*:.\-_]*(Critical|Major|Minor)", re.IGNORECASE
)
_FAILURE_SCENARIO = re.compile(
    r"Failure[\s*_-]*scenario[\s*:.\-_]*([^\n]+)", re.IGNORECASE
)
_EVIDENCE_PATHS = re.compile(
    r"Evidence[\s*_-]*paths?[\s*:.\-_]*([^\n]+)", re.IGNORECASE
)


def parse_verification_response(response: str) -> tuple[str, list[dict]]:
    """``(verdict, issues)``: verdict is exactly VERIFIED or ISSUES_FOUND.

    Fail-closed on both branches: a head that is not VERIFIED is
    ISSUES_FOUND, and a VERIFIED response still surfaces any structured
    blocking issue block it carries — a contradictory token never hides a
    finding the same response spelled out.
    """
    text = response or ""
    head = _VERDICT_PREFIX.sub("", text.upper().strip())
    head = _MARKDOWN_NOISE.sub("", head)

    if head.startswith("VERIFIED"):
        return VERDICT_VERIFIED, _parse_all_findings(text, salvage_body=True)

    body = _ISSUES_HEADER.sub("", text.strip(), count=1)
    issues = _parse_all_findings(body)
    if not issues:
        stripped = body.strip()
        issues = [{
            "description": stripped or "(unparseable verifier response)",
            "category": "unknown",
            "severity": "unknown",
        }]
    return VERDICT_ISSUES_FOUND, issues


def _split_nits_section(text: str) -> tuple[str, str]:
    """``(body, nits)``. The NITS heading itself belongs to neither half."""
    match = _NITS_SECTION.search(text)
    if not match:
        return text, ""
    return text[: match.start()], text[match.end():]


def _parse_all_findings(text: str, salvage_body: bool = False) -> list[dict]:
    """Every finding the response carries, from both sections.

    Recording a finding and blocking on one are separate decisions — this
    function only records. ``classify_blocking`` partitions afterwards.

    ``salvage_body`` is set on the VERIFIED branch, where an unstructured
    body would otherwise parse to nothing at all: the ISSUES_FOUND branch
    has a catch-all for unparseable text and VERIFIED had none, so a
    verifier that described a defect in prose and still wrote VERIFIED left
    no record of it.
    """
    body, nits = _split_nits_section(text)
    findings = _parse_issue_blocks(body)
    for issue in findings:
        issue["section"] = "body"
    if not findings and salvage_body:
        findings = _salvage_body_bullets(body)
    for issue in _parse_nits_findings(nits):
        findings.append(issue)
    return findings


def _salvage_body_bullets(body: str) -> list[dict]:
    """Bullets in a VERIFIED response that carries no ``Issue N:`` block.

    A verifier that spells a concern out in a bullet and still writes
    VERIFIED has written a finding. Defaulted to ``minor`` unless the bullet
    declares a severity, so a summary bullet costs one row in the record and
    never blocks, while a real concern survives to be read.

    Prose carrying no bullet at all is still not recovered as a finding; the
    complete response is preserved by ``raw_output_ref``.
    """
    issues = []
    for line in _bullet_lines(body):
        issue = _issue_from_text(line, line)
        issue["section"] = "body"
        issue.setdefault("severity", "minor")
        issues.append(issue)
    return issues


def _parse_nits_findings(nits: str) -> list[dict]:
    """NITS findings, tagged and defaulted to ``minor``.

    Verifiers rarely use ``Issue N:`` form under NITS, so structured blocks
    are tried first and a bullet/numbered list second; a section that is
    neither is recorded whole rather than dropped. An explicit blocking
    severity survives — filing a major finding under NITS does not launder
    it.
    """
    if not nits.strip():
        return []
    issues = _parse_issue_blocks(nits)
    if not issues:
        issues = [_issue_from_text(line, line) for line in _bullet_lines(nits)]
    if not issues:
        issues = [_issue_from_text(nits.strip(), nits.strip()[:500])]
    for issue in issues:
        issue["section"] = "nits"
        issue.setdefault("severity", "minor")
    return issues


def _bullet_lines(text: str) -> list[str]:
    lines = []
    for raw in text.splitlines():
        match = _BULLET_LINE.match(raw)
        if match and match.group(1).strip():
            lines.append(match.group(1).strip())
    return lines


def _issue_from_text(block: str, description: str) -> dict:
    """One finding from a span of text, carrying whatever fields it declares.

    Every path that records a finding goes through here. A declared severity
    is read wherever the finding is written — an ``Issue N:`` block, a NITS
    bullet, a bullet under a VERIFIED head — because a severity that is only
    honoured in one shape is a laundering route into the other shapes.
    """
    issue: dict = {"description": description, "raw": block}
    cat = _CATEGORY.search(block)
    if cat:
        issue["category"] = cat.group(1).strip()
    sev = _SEVERITY.search(block)
    if sev:
        issue["severity"] = sev.group(1).strip().lower()
    scenario = _FAILURE_SCENARIO.search(block)
    if scenario:
        issue["failureScenario"] = scenario.group(1).strip()
    paths = _EVIDENCE_PATHS.search(block)
    if paths:
        parsed = _parse_evidence_paths(paths.group(1))
        if parsed:
            issue["evidencePaths"] = parsed
    return issue


def _parse_issue_blocks(text: str) -> list[dict]:
    issues = []
    for match in _ISSUE_BLOCKS.finditer(text):
        block = match.group(1).strip()
        description = block.splitlines()[0].strip() if block else ""
        if not description:
            continue
        issues.append(_issue_from_text(block, description))
    return issues


def _parse_evidence_paths(raw: str) -> list[str]:
    paths = []
    for token in re.split(r"[,;\s]+", raw.strip()):
        normalized = normalize_evidence_path(token)
        if normalized:
            paths.append(normalized)
    return paths


def normalize_evidence_path(token: str) -> str:
    """Strip markdown/backtick wrapping, a trailing ``:<line>`` suffix, and
    normalize separators to forward slashes."""
    cleaned = token.strip().strip("`*_()[]<>\"'").replace("\\", "/")
    cleaned = re.sub(r":\d+(?:-\d+)?$", "", cleaned)
    return cleaned.strip("`*_ ")


# --- Adjudication parsing ---------------------------------------------------

OUTCOME_UPHELD = "UPHELD"
OUTCOME_OVERRULED = "OVERRULED"

# One judgment line per dispute: `Dispute N: UPHOLD — reasons` (or
# OVERRULE). Both verb and past-participle forms are accepted; anything
# else is no judgment at all.
_ADJUDICATION_LINE = re.compile(
    r"^[\s*_#>-]*Dispute\s*(\d+)\s*[:.\-]?\s*\*{0,2}"
    r"(UPHOLD|UPHELD|OVERRULE|OVERRULED)\b\*{0,2}\s*[-—:.,]*\s*(.*)$",
    re.IGNORECASE | re.MULTILINE,
)


def parse_adjudication_response(response: str, dispute_count: int) -> list[dict]:
    """One outcome per dispute, 1-based positional. Fail-closed on every
    ambiguity: a dispute with no parseable judgment, or judged more than
    once with disagreeing verdicts, is UPHELD — an adjudicator that did not
    clearly overrule a finding has not overruled it."""
    judged: dict[int, dict] = {}
    for match in _ADJUDICATION_LINE.finditer(response or ""):
        number = int(match.group(1))
        verb = match.group(2).upper()
        outcome = (
            OUTCOME_OVERRULED if verb.startswith("OVERRULE")
            else OUTCOME_UPHELD
        )
        reasons = match.group(3).strip()[:1000]
        if outcome == OUTCOME_OVERRULED and not reasons:
            # A judgment is UPHOLD-or-OVERRULE *with reasons*; a bare
            # overrule clears a blocking finding on no argument at all.
            outcome = OUTCOME_UPHELD
            reasons = "(overrule without reasons — fail closed as UPHELD)"
        prior = judged.get(number)
        if prior is not None and prior["outcome"] != outcome:
            judged[number] = {
                "outcome": OUTCOME_UPHELD,
                "reasons": "(contradictory judgments — fail closed as "
                           "UPHELD)",
            }
            continue
        if prior is None:
            judged[number] = {"outcome": outcome, "reasons": reasons}
    outcomes = []
    for number in range(1, dispute_count + 1):
        outcomes.append(judged.get(number) or {
            "outcome": OUTCOME_UPHELD,
            "reasons": "(no parseable judgment — fail closed as UPHELD)",
        })
    return outcomes


# --- Severity and blocking --------------------------------------------------

def normalize_severity(raw) -> str:
    """The closed vocabulary, enforced wherever a finding is persisted.
    An unknown or missing token normalizes to ``major`` — blocking is
    preserved, the vocabulary stays closed."""
    token = str(raw or "").strip().lower()
    return token if token in SEVERITIES else "major"


def is_blocking_issue(issue: dict) -> bool:
    """Blocking unless the severity is exactly ``minor``. Missing or
    unrecognized severity blocks (anti-laundering).

    Severity is the only input, because it is the only one the verifier
    cannot quietly choose for itself. Findings citing only documentation
    prose used to be capped non-blocking here, which handed a verifier a
    self-exemption: the same author picks the severity *and* the evidence
    paths, so a finding it did not want to hold up the work needed only a
    ``.md`` citation to stop counting.
    """
    return str(issue.get("severity", "")).strip().lower() not in (
        "minor",
    )


def unremediated_findings(findings: list, changed_paths) -> list:
    """The findings a fix delta cannot be shown to have answered.

    This is the whole bar on "remediated at the cap", and it is deliberately
    per-finding: a changed tree says only that *something* moved, and
    landing unreviewed work on that would be the retired waiver wearing a
    machine's name. A finding is shown remediated when the delta touches a
    path the finding itself cited — the one claim a machine can check
    without a reviewer.

    A finding citing no evidence path can never be shown remediated, and
    that is correct rather than harsh: there is no site to check, so there
    is nothing to prove, and the honest outcome is unresolved.
    """
    touched = {str(p).replace("\\", "/").strip("/") for p in changed_paths}
    unshown = []
    for issue in findings or []:
        cited = [
            normalize_evidence_path(p).strip("/")
            for p in issue.get("evidencePaths") or []
        ]
        if not any(_delta_touches(path, touched) for path in cited if path):
            unshown.append(issue)
    return unshown


def _delta_touches(cited: str, touched: set) -> bool:
    """A cited file, or a cited directory holding a changed file."""
    prefix = cited + "/"
    return any(
        path == cited or path.startswith(prefix) for path in touched
    )


@dataclass
class BlockingClassification:
    blocking: bool
    reason: str
    blocking_issues: list = field(default_factory=list)
    nit_issues: list = field(default_factory=list)


def classify_blocking(verdict: str, issues: list) -> BlockingClassification:
    """Severity-derived, not token-derived: any blocking finding blocks even
    under a VERIFIED token; a findings-free non-VERIFIED verdict blocks
    conservatively."""
    blocking_issues, nits = [], []
    for issue in issues or []:
        if is_blocking_issue(issue):
            blocking_issues.append(issue)
        else:
            nits.append(issue)

    if blocking_issues:
        return BlockingClassification(
            True,
            f"{len(blocking_issues)} blocking finding(s)",
            blocking_issues, nits,
        )
    if issues:
        return BlockingClassification(
            False, "findings present but all minor", [], nits,
        )
    if verdict == VERDICT_VERIFIED:
        return BlockingClassification(False, "verified, no findings")
    return BlockingClassification(
        True, f"verdict {verdict!r} with no parseable findings (fail closed)"
    )


def validate_session_verdict(verdict: str) -> str:
    """The session-state writer's exact-allowlist check. A confabulated
    token (v1 incident: ``manual-override-development``) or an invented
    prefix look-alike can never persist."""
    token = str(verdict or "").strip()
    if token not in SESSION_VERDICTS:
        raise ValueError(
            f"verdict {verdict!r} is not in the closed vocabulary "
            f"{sorted(SESSION_VERDICTS)}"
        )
    return token
