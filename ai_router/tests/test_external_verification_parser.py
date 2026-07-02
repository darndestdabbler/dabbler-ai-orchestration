"""Unit tests for ai_router.external_verification (Set 077 S4).

The parser is the single verdict reader for the Lightweight
``external-verification.md`` artifact: round semantics (latest dated
round wins), the ``VERIFIED`` / ``ISSUES_FOUND`` / ``WAIVED`` grammar
(WAIVED requires a one-line reason), and severity-tag collection.
Both the close_session soft gate (S4) and the start_session
pending-verification banner (S5) consume this one parsed result.
"""
from __future__ import annotations

from pathlib import Path

from external_verification import (
    EXTERNAL_VERIFICATION_FILENAME,
    VERDICT_ISSUES_FOUND,
    VERDICT_VERIFIED,
    VERDICT_WAIVED,
    parse_external_verification,
    read_external_verification,
)


# ---------- empty / template-only / unreadable ----------


def test_empty_text_parses_to_no_verdict():
    result = parse_external_verification("")
    assert result.verdict is None
    assert result.rounds == ()
    assert not result.has_recognizable_verdict
    assert not result.outstanding_remediation


def test_whitespace_only_parses_to_no_verdict():
    assert parse_external_verification("  \n\n\t\n").verdict is None


def test_template_pending_verdict_is_not_recognized():
    """The extension's seeded template says 'Verdict: PENDING' — a
    templated-but-unfilled file must behave like an empty one."""
    text = (
        "# External Verification — 001-example-set\n\n"
        "## Round 1 — 2026-07-02\n\n"
        "Verdict: PENDING\n"
    )
    result = parse_external_verification(text)
    assert result.verdict is None
    assert not result.has_recognizable_verdict


def test_prose_mentioning_verified_is_not_a_verdict():
    """Lowercase / mid-sentence tokens never parse (case-sensitive match)."""
    text = "The work was verified against the spec and looks fine.\n"
    assert parse_external_verification(text).verdict is None


def test_missing_file_reads_to_empty_result(tmp_path: Path):
    result = read_external_verification(str(tmp_path))
    assert result.verdict is None
    assert result.rounds == ()


# ---------- basic verdict lines ----------


def test_bare_verified_token_line():
    assert parse_external_verification("VERIFIED\n").verdict == VERDICT_VERIFIED


def test_verdict_prefixed_line():
    r = parse_external_verification("Verdict: ISSUES_FOUND\n")
    assert r.verdict == VERDICT_ISSUES_FOUND
    assert r.outstanding_remediation


def test_markdown_emphasis_is_stripped():
    r = parse_external_verification("**Verdict:** VERIFIED\n")
    assert r.verdict == VERDICT_VERIFIED


def test_last_verdict_line_in_a_round_wins():
    text = "Verdict: ISSUES_FOUND\n\nafter fixes:\n\nVerdict: VERIFIED\n"
    assert parse_external_verification(text).verdict == VERDICT_VERIFIED


def test_legacy_free_form_file_with_trailing_verdict():
    """Pre-Set-077 free-form files (no round headers) still parse."""
    text = (
        "I reviewed the spec and the activity log.\n"
        "Everything matches the declared scope.\n\n"
        "Verdict: VERIFIED\n"
    )
    r = parse_external_verification(text)
    assert r.verdict == VERDICT_VERIFIED
    assert r.round is None  # implicit round


# ---------- round semantics ----------


def test_latest_round_wins():
    text = (
        "## Round 1 — 2026-07-01\n\nVerdict: ISSUES_FOUND\n"
        "- [Major] broken frobnicator\n\n"
        "## Round 2 — 2026-07-02\n\nVerdict: VERIFIED\n"
    )
    r = parse_external_verification(text)
    assert r.round == 2
    assert r.verdict == VERDICT_VERIFIED
    assert not r.outstanding_remediation
    assert len(r.rounds) == 2
    assert r.rounds[0].verdict == VERDICT_ISSUES_FOUND
    assert r.rounds[0].severities == ("Major",)


def test_numbered_round_supersedes_implicit_preamble():
    text = (
        "free-form notes with a stale verdict\nVERIFIED\n\n"
        "## Round 1 — 2026-07-02\n\nVerdict: ISSUES_FOUND\n"
    )
    r = parse_external_verification(text)
    assert r.round == 1
    assert r.verdict == VERDICT_ISSUES_FOUND


def test_rounds_out_of_order_highest_number_wins():
    text = (
        "## Round 2 — 2026-07-02\n\nVerdict: VERIFIED\n\n"
        "## Round 1 — 2026-07-01\n\nVerdict: ISSUES_FOUND\n"
    )
    r = parse_external_verification(text)
    assert r.round == 2
    assert r.verdict == VERDICT_VERIFIED


def test_round_header_variants_parse():
    for sep in ("—", "-", ":", "("):
        text = f"## Round 3 {sep} 2026-07-02\n\nVerdict: VERIFIED\n"
        r = parse_external_verification(text)
        assert r.round == 3, f"separator {sep!r} failed"
        assert r.rounds[-1].date == "2026-07-02"


def test_round_with_no_verdict_line_is_verdictless():
    text = "## Round 1 — 2026-07-02\n\nstill reviewing…\n"
    r = parse_external_verification(text)
    assert r.round == 1
    assert r.verdict is None


def test_severity_tags_collected_for_latest_round():
    text = (
        "## Round 1 — 2026-07-02\n\nVerdict: ISSUES_FOUND\n"
        "- [Critical] data loss on close\n"
        "- [Minor] typo in the banner\n"
    )
    r = parse_external_verification(text)
    assert r.severities == ("Critical", "Minor")
    assert r.outstanding_remediation


# ---------- WAIVED grammar ----------


def test_waived_with_inline_reason():
    r = parse_external_verification(
        "Verdict: WAIVED — throwaway spike, verification deliberately skipped\n"
    )
    assert r.verdict == VERDICT_WAIVED
    assert "throwaway spike" in (r.waive_reason or "")


def test_waived_with_reason_on_following_line():
    text = "Verdict: WAIVED\nReason: solo project, no second provider\n"
    r = parse_external_verification(text)
    assert r.verdict == VERDICT_WAIVED
    assert r.waive_reason == "solo project, no second provider"


def test_waived_reason_after_blank_line_is_rejected():
    """S4 verification round 1: the reason must be on the SAME line or the
    IMMEDIATELY-following physical line — a blank line in between makes
    the waiver unrecognized (matches the documented grammar)."""
    text = "Verdict: WAIVED\n\nReason: too late, a blank line intervened\n"
    r = parse_external_verification(text)
    assert r.verdict is None


def test_underscore_emphasis_variants_parse():
    """S4 verification round 1: __Verdict:__ / _Scope:_ emphasis is
    normalized while ISSUES_FOUND's internal underscore survives."""
    r1 = parse_external_verification("__Verdict:__ VERIFIED\n")
    assert r1.verdict == VERDICT_VERIFIED
    r2 = parse_external_verification("Verdict: __ISSUES_FOUND__\n")
    assert r2.verdict == VERDICT_ISSUES_FOUND
    r3 = parse_external_verification(
        "_Scope:_ specification\n\nVerdict: VERIFIED\n"
    )
    assert r3.is_specification_scope


def test_waived_without_reason_is_unrecognized():
    """WAIVED requires its one-line reason; a bare WAIVED must NOT count
    as a verdict (the gate should warn, not honor a silent opt-out)."""
    r = parse_external_verification("Verdict: WAIVED\n\nno reason given\n")
    assert r.verdict is None
    assert not r.has_recognizable_verdict


def test_later_malformed_waived_nulls_an_earlier_verdict():
    """S4 verification round 2: the reviewer's LAST verdict attempt was a
    (malformed, reason-less) waiver — an earlier VERIFIED must not stand,
    or the parser reports the opposite of the final intent."""
    text = "Verdict: VERIFIED\n\nOn reflection:\n\nVerdict: WAIVED\n"
    assert parse_external_verification(text).verdict is None

    text_blank_reason = (
        "Verdict: VERIFIED\n\nVerdict: WAIVED\n\nReason: separated by a blank\n"
    )
    assert parse_external_verification(text_blank_reason).verdict is None


def test_waived_is_not_outstanding_remediation():
    r = parse_external_verification("Verdict: WAIVED — deliberate opt-out\n")
    assert not r.outstanding_remediation


# ---------- Scope: specification (S4 code-review fix) ----------


def test_scope_specification_is_parsed_and_flagged():
    text = (
        "## Round 1 — 2026-07-02\n\n"
        "Scope: specification\n\n"
        "Verdict: VERIFIED\n"
    )
    r = parse_external_verification(text)
    assert r.verdict == VERDICT_VERIFIED
    assert r.scope == "specification"
    assert r.is_specification_scope


def test_scope_absent_is_not_specification():
    r = parse_external_verification("Verdict: VERIFIED\n")
    assert r.scope is None
    assert not r.is_specification_scope


def test_later_work_round_supersedes_spec_scoped_round():
    text = (
        "## Round 1 — 2026-07-01\n\nScope: specification\n\nVerdict: VERIFIED\n\n"
        "## Round 2 — 2026-07-02\n\nVerdict: VERIFIED\n"
    )
    r = parse_external_verification(text)
    assert r.round == 2
    assert r.scope is None
    assert not r.is_specification_scope


def test_scope_markdown_emphasis_stripped():
    r = parse_external_verification(
        "**Scope:** specification\n\nVerdict: VERIFIED\n"
    )
    assert r.is_specification_scope


# ---------- read_external_verification ----------


def test_read_parses_from_disk(tmp_path: Path):
    (tmp_path / EXTERNAL_VERIFICATION_FILENAME).write_text(
        "## Round 1 — 2026-07-02\n\nVerdict: VERIFIED\n", encoding="utf-8"
    )
    r = read_external_verification(str(tmp_path))
    assert r.verdict == VERDICT_VERIFIED
    assert r.round == 1
