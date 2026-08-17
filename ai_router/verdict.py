"""Verifier-response parsing and blocking classification.

The parser is structural, never prose-scanning: a verdict token at the head
of the response, ``Issue N:`` blocks with per-field tolerant parses, and a
``NITS`` section that is cut before issues are read. Every ambiguity fails
closed — an unrecognizable verdict is ISSUES_FOUND, an ISSUES_FOUND body
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
VERDICT_WAIVED = "WAIVED"

# The closed allowlist for any verdict a writer persists (session-state's
# verificationVerdict, the rounds ledger). WAIVED is operator-attested
# external verification only — the loop itself never produces it.
SESSION_VERDICTS = frozenset(
    {VERDICT_VERIFIED, VERDICT_ISSUES_FOUND, VERDICT_WAIVED}
)

SEVERITIES = ("critical", "major", "minor")
BLOCKING_SEVERITIES = frozenset({"critical", "major"})

# Documentation prose whose findings never block on their own. Markdown
# under prompt-templates/ is behavior-bearing and stays in scope.
_DOC_EXTENSIONS = (".md", ".markdown", ".rst", ".txt")
_DOC_EXEMPT_SEGMENT = "prompt-templates/"


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
_ISSUE_MARKER = r"^[ \t]*[-*>#]*[ \t]*\*{0,2}Issue\b[ \t]*\d*\*{0,2}[ \t]*[:.][ \t]*"
_ISSUE_BLOCKS = re.compile(
    _ISSUE_MARKER + r"(.*?)(?=" + _ISSUE_MARKER + r"|\Z)",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)

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
        issues = _parse_issue_blocks(_strip_nits_section(text))
        return VERDICT_VERIFIED, [i for i in issues if is_blocking_issue(i)]

    body = _ISSUES_HEADER.sub("", text.strip(), count=1)
    body = _strip_nits_section(body)
    issues = _parse_issue_blocks(body)
    if not issues:
        stripped = body.strip()
        issues = [{
            "description": stripped or "(unparseable verifier response)",
            "category": "unknown",
            "severity": "unknown",
        }]
    return VERDICT_ISSUES_FOUND, issues


def _strip_nits_section(text: str) -> str:
    match = _NITS_SECTION.search(text)
    return text[: match.start()] if match else text


def _parse_issue_blocks(text: str) -> list[dict]:
    issues = []
    for match in _ISSUE_BLOCKS.finditer(text):
        block = match.group(1).strip()
        description = block.splitlines()[0].strip() if block else ""
        if not description:
            continue
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
        issues.append(issue)
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


# --- Severity and blocking --------------------------------------------------

def normalize_severity(raw) -> str:
    """The closed vocabulary, enforced wherever a finding is persisted.
    An unknown or missing token normalizes to ``major`` — blocking is
    preserved, the vocabulary stays closed."""
    token = str(raw or "").strip().lower()
    return token if token in SEVERITIES else "major"


def is_doc_only_issue(issue: dict) -> bool:
    """True when the finding cites at least one evidence path and every
    cited path is documentation prose. Prose-only findings are recorded,
    never blocking — prompt-templates markdown is exempt (behavior-bearing).
    """
    paths = issue.get("evidencePaths") or []
    if not paths:
        return False
    for path in paths:
        lowered = str(path).lower()
        if _DOC_EXEMPT_SEGMENT in lowered:
            return False
        if not lowered.endswith(_DOC_EXTENSIONS):
            return False
    return True


def is_blocking_issue(issue: dict) -> bool:
    """Blocking unless the severity is exactly ``minor`` or the finding is
    doc-only. Missing or unrecognized severity blocks (anti-laundering)."""
    if is_doc_only_issue(issue):
        return False
    return str(issue.get("severity", "")).strip().lower() not in (
        "minor",
    )


@dataclass
class BlockingClassification:
    blocking: bool
    reason: str
    blocking_issues: list = field(default_factory=list)
    nit_issues: list = field(default_factory=list)
    doc_capped_issues: list = field(default_factory=list)


def classify_blocking(verdict: str, issues: list) -> BlockingClassification:
    """Severity-derived, not token-derived: any blocking finding blocks even
    under a VERIFIED token; a findings-free non-VERIFIED verdict blocks
    conservatively."""
    blocking_issues, nits, doc_capped = [], [], []
    for issue in issues or []:
        if is_doc_only_issue(issue):
            doc_capped.append(issue)
        elif is_blocking_issue(issue):
            blocking_issues.append(issue)
        else:
            nits.append(issue)

    if blocking_issues:
        return BlockingClassification(
            True,
            f"{len(blocking_issues)} blocking finding(s)",
            blocking_issues, nits, doc_capped,
        )
    if issues:
        return BlockingClassification(
            False,
            "findings present but all minor or doc-only",
            [], nits, doc_capped,
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
