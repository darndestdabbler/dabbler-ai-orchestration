"""Parser for the Lightweight ``external-verification.md`` artifact.

Set 077 Feature 3 (spec M3/M4): the out-of-band verification artifact
gains **round semantics, not presence semantics**. A path-aware
reviewing engine appends one dated round section per review; this
module parses those sections, applies **latest round wins**, and
returns a single structured result that both the ``close_session``
soft gate (Set 077 S4) and the ``start_session`` pending-verification
banner (Set 077 S5) consume — one parsed result, two readers, so gate
and banner can never disagree about what the artifact says.

The verdict grammar (canonical tokens, always uppercase on disk):

* ``VERIFIED`` — the reviewed work passed.
* ``ISSUES_FOUND`` — the review found issues; findings may carry
  ``[Critical]`` / ``[Major]`` / ``[Minor]`` severity tags which are
  collected best-effort per round.
* ``WAIVED`` — a deliberate "no verification for this set" record.
  **Requires a one-line reason** on the same line (after the token) or
  on an immediately-following ``Reason:`` line. A ``WAIVED`` with no
  reason is treated as *unrecognized* (the round parses to no verdict),
  so the soft gate warns instead of silently honoring an unexplained
  opt-out — fail toward the louder posture.

A **verdict line** is a line whose (markdown-stripped) text either
starts with ``Verdict:`` (case-insensitive key) followed by a canonical
token, or is a bare canonical token. Tokens are matched
**case-sensitively** so prose like "the work was verified" never
parses as a verdict. The last verdict line within a round wins (an
engine that restates its verdict is harmless).

Round sections are headed ``## Round N — YYYY-MM-DD`` (any of ``—``,
``–``, ``-``, ``:`` or parentheses may set off the date; the date text
is captured verbatim, not validated). Text before the first round
header — or an artifact with no round headers at all (the pre-Set-077
free-form files in existing consumer repos) — is treated as an implicit
round with ``number=None``, which any numbered round supersedes.

The extension's templated artifact seeds ``Verdict: PENDING``;
``PENDING`` is deliberately not a recognized token, so a
templated-but-unfilled file behaves exactly like an empty one at the
gate (soft warn), which is the honest reading.

The extension never parses verdicts itself (Set 077 Feature 3
standard) — this module is the single parser.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

#: Canonical verdict tokens (uppercase on disk, matched case-sensitively).
VERDICT_VERIFIED = "VERIFIED"
VERDICT_ISSUES_FOUND = "ISSUES_FOUND"
VERDICT_WAIVED = "WAIVED"
RECOGNIZED_VERDICTS = (VERDICT_VERIFIED, VERDICT_ISSUES_FOUND, VERDICT_WAIVED)

#: Filename of the artifact inside a session-set directory.
EXTERNAL_VERIFICATION_FILENAME = "external-verification.md"

_ROUND_HEADER_RE = re.compile(
    r"^\s{0,3}#{2,3}\s*Round\s+(\d+)\s*(?:[—–:\-(]\s*(.*?)\)?\s*)?$",
    re.IGNORECASE,
)

# A verdict line after markdown-emphasis stripping: optional
# "Verdict:" / "Verdict -" key (case-insensitive), then a canonical
# token (case-SENSITIVE — enforced post-match), then an optional
# separator + trailing text (the WAIVED reason slot).
_VERDICT_LINE_RE = re.compile(
    r"^(?:verdict\s*[:\-]\s*)?(VERIFIED|ISSUES_FOUND|WAIVED)\b\s*(?:[—–:\-]\s*)?(.*)$",
    re.IGNORECASE,
)

_REASON_LINE_RE = re.compile(r"^reason\s*[:\-]\s*(.+)$", re.IGNORECASE)

# Optional per-round scope marker (Set 077 S4 code-review fix): a
# specification review runs BEFORE the work exists, so its verdict must
# not satisfy the close-out gate's "work was reviewed" reading. The
# spec-review prompt instructs the engine to record
# ``Scope: specification`` under its round header; the gate treats a
# latest round with that scope as not-a-work-verdict (soft warn).
_SCOPE_LINE_RE = re.compile(r"^scope\s*[:\-]\s*(.+)$", re.IGNORECASE)

#: The scope token identifying a pre-work specification review.
SCOPE_SPECIFICATION = "specification"

_SEVERITY_TAG_RE = re.compile(r"\[(Critical|Major|Minor)\]")


_UNDERSCORE_EMPHASIS_RE = re.compile(r"(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])")


def _strip_markdown(line: str) -> str:
    """Strip emphasis/quote decoration so ``**Verdict:** X`` still parses.

    ``*`` and backticks are removed everywhere (they never appear inside
    a canonical token). Underscores are removed only when NOT between
    two alphanumerics — that strips ``__Verdict:__`` / ``_Scope:_``
    emphasis (S4 verification round 1) while preserving the internal
    underscore in ``ISSUES_FOUND``.
    """
    line = line.strip().lstrip(">").strip()
    line = line.replace("*", "").replace("`", "")
    line = _UNDERSCORE_EMPHASIS_RE.sub("", line)
    return line.strip()


@dataclass(frozen=True)
class VerificationRound:
    """One parsed round section of ``external-verification.md``."""

    #: 1-based round number from the header; ``None`` for the implicit
    #: legacy/free-form round (content with no round header).
    number: Optional[int]
    #: The header's date text, verbatim (not validated); ``None`` when
    #: the header carried none or the round is implicit.
    date: Optional[str]
    #: Canonical verdict token, or ``None`` when no recognizable
    #: verdict line exists in the round (includes a reason-less WAIVED).
    verdict: Optional[str]
    #: The required one-line reason for a ``WAIVED`` verdict.
    waive_reason: Optional[str] = None
    #: Best-effort ``[Critical]``/``[Major]``/``[Minor]`` tags seen in
    #: the round body (order preserved, duplicates kept).
    severities: Tuple[str, ...] = ()
    #: The round's declared review scope (lowercased; e.g.
    #: ``"specification"``, ``"session"``, ``"set"``), or ``None`` when
    #: the round declares none. ``specification`` marks a pre-work spec
    #: review whose verdict is not evidence the WORK was reviewed.
    scope: Optional[str] = None


@dataclass(frozen=True)
class ExternalVerificationResult:
    """The parsed artifact, reduced to the latest-round view.

    ``round`` / ``verdict`` / ``waive_reason`` / ``severities`` mirror
    the **latest** round (highest round number; an implicit
    header-less round is superseded by any numbered one). The full
    per-round history stays available in ``rounds``.
    """

    rounds: Tuple[VerificationRound, ...] = ()
    round: Optional[int] = None
    verdict: Optional[str] = None
    waive_reason: Optional[str] = None
    severities: Tuple[str, ...] = ()
    scope: Optional[str] = None
    #: True when the latest round's verdict is ``ISSUES_FOUND`` — the
    #: set still owes a remediation/response round.
    outstanding_remediation: bool = False

    @property
    def has_recognizable_verdict(self) -> bool:
        """True when the latest round carries a canonical verdict."""
        return self.verdict in RECOGNIZED_VERDICTS

    @property
    def is_specification_scope(self) -> bool:
        """True when the latest round declares ``Scope: specification``.

        A spec review happens before the work exists; its verdict is a
        review of the PLAN, not of delivered work. Gate/banner readers
        must not let it satisfy a "the work was reviewed" check.
        """
        return self.scope == SCOPE_SPECIFICATION


_EMPTY_RESULT = ExternalVerificationResult()


def _parse_round_body(
    lines: List[str],
    number: Optional[int],
    date: Optional[str],
) -> VerificationRound:
    """Parse one round's body lines into a :class:`VerificationRound`."""
    verdict: Optional[str] = None
    waive_reason: Optional[str] = None
    scope: Optional[str] = None
    body = "\n".join(lines)
    severities = tuple(_SEVERITY_TAG_RE.findall(body))

    for idx, raw in enumerate(lines):
        stripped = _strip_markdown(raw)
        scope_m = _SCOPE_LINE_RE.match(stripped)
        if scope_m:
            scope = scope_m.group(1).strip().lower() or None
            continue
        m = _VERDICT_LINE_RE.match(stripped)
        if not m:
            continue
        token = m.group(1)
        # The regex is case-insensitive only so the "Verdict:" key
        # tolerates casing; the token itself must be canonical
        # uppercase, or prose like "verified against the spec" would
        # count as a verdict.
        if token not in RECOGNIZED_VERDICTS:
            continue
        if token == VERDICT_WAIVED:
            reason = (m.group(2) or "").strip()
            if not reason:
                # The documented grammar (cross-provider-verification
                # doc): the reason is on the SAME line, or a "Reason:"
                # line IMMEDIATELY following — strictly the next
                # physical line, no blank line in between (S4
                # verification round 1 tightened this to match the doc).
                if idx + 1 < len(lines):
                    rm = _REASON_LINE_RE.match(_strip_markdown(lines[idx + 1]))
                    if rm:
                        reason = rm.group(1).strip()
            if not reason:
                # WAIVED without its required reason is unrecognized —
                # the gate must warn, not honor a silent opt-out. It
                # also NULLS any earlier verdict in the round (S4
                # verification round 2): the reviewer's LAST verdict
                # attempt was a (malformed) waiver, so letting an
                # earlier VERIFIED stand would report the opposite of
                # their final intent. Fail toward the louder posture.
                verdict = None
                waive_reason = None
                continue
            verdict = VERDICT_WAIVED
            waive_reason = reason
        else:
            verdict = token
            waive_reason = None

    return VerificationRound(
        number=number,
        date=date,
        verdict=verdict,
        waive_reason=waive_reason,
        severities=severities,
        scope=scope,
    )


def parse_external_verification(text: str) -> ExternalVerificationResult:
    """Parse ``external-verification.md`` content into a structured result.

    Never raises on content: any text (empty, template-only, free-form
    legacy prose, well-formed rounds) parses to a result whose
    ``verdict`` is ``None`` when nothing recognizable exists.
    """
    if not isinstance(text, str) or not text.strip():
        return _EMPTY_RESULT

    lines = text.splitlines()
    # Split into (number, date, body-lines) segments on round headers.
    segments: List[Tuple[Optional[int], Optional[str], List[str]]] = []
    current_body: List[str] = []
    current_number: Optional[int] = None
    current_date: Optional[str] = None
    saw_header = False

    for raw in lines:
        m = _ROUND_HEADER_RE.match(raw)
        if m:
            if saw_header or current_body:
                segments.append((current_number, current_date, current_body))
            saw_header = True
            current_number = int(m.group(1))
            date_text = (m.group(2) or "").strip()
            current_date = date_text or None
            current_body = []
        else:
            current_body.append(raw)
    segments.append((current_number, current_date, current_body))

    rounds: List[VerificationRound] = []
    for number, date, body in segments:
        if number is None and not any(line.strip() for line in body):
            continue  # skip an empty implicit preamble
        rounds.append(_parse_round_body(body, number, date))

    if not rounds:
        return _EMPTY_RESULT

    # Latest round wins: highest numbered round; numbered rounds
    # supersede the implicit (header-less) round; among duplicates of
    # the same number the last occurrence wins.
    latest = rounds[0]
    for r in rounds[1:]:
        if latest.number is None:
            latest = r
        elif r.number is not None and r.number >= latest.number:
            latest = r

    return ExternalVerificationResult(
        rounds=tuple(rounds),
        round=latest.number,
        verdict=latest.verdict,
        waive_reason=latest.waive_reason,
        severities=latest.severities,
        scope=latest.scope,
        outstanding_remediation=latest.verdict == VERDICT_ISSUES_FOUND,
    )


def read_external_verification(session_set_dir: str) -> ExternalVerificationResult:
    """Read and parse a set's ``external-verification.md``.

    Missing or unreadable files parse to the empty result (``verdict``
    ``None``) — the callers' soft postures treat that identically to an
    absent verdict, which is the intended fail-toward-warning behavior.
    """
    path = os.path.join(session_set_dir, EXTERNAL_VERIFICATION_FILENAME)
    if not os.path.isfile(path):
        return _EMPTY_RESULT
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except (OSError, UnicodeError):
        return _EMPTY_RESULT
    return parse_external_verification(text)


__all__ = [
    "EXTERNAL_VERIFICATION_FILENAME",
    "ExternalVerificationResult",
    "RECOGNIZED_VERDICTS",
    "SCOPE_SPECIFICATION",
    "VERDICT_ISSUES_FOUND",
    "VERDICT_VERIFIED",
    "VERDICT_WAIVED",
    "VerificationRound",
    "parse_external_verification",
    "read_external_verification",
]
