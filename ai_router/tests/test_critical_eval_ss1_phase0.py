"""SS1 live guards -- the verification-response parser fixes.

Part of the out-of-band remediation tracked in
``../dabbler-orchestration-remediation`` (see ``critical-eval-plan-v3-lean.md``,
Session Set 1). These began as an ``xfail(strict=True)`` red baseline; the SS1
fixes have since landed, so the bug tests now assert the correct behavior and
pass as live regression guards.

The bug guarded here:
  * The push parser trusted the ``VERIFIED`` token and returned an empty
    finding list, so a structured Major under VERIFIED was invisible.
    [verification.py:221-234]

Set 112 deleted the Lightweight tier and with it ``dedicated_verification``,
so the three ``derive_state`` guards this module also carried (severity-blind
loop, VERIFIED-token short circuit, fail-open ``resolution_status``, and the
accepted-disposition authority rule) went with their subject. The parser
guards below are the surviving, still-load-bearing half: ``verification.py``
is the Full tier's own verdict parser, and ``is_blocking_verdict`` is the
predicate the whole verification loop turns on.
"""

from __future__ import annotations

import pytest

# conftest puts ai_router/ on sys.path
import verification as ver  # noqa: E402

# --------------------------------------------------------------------------
# Bug 4 — the push parser trusts the VERIFIED token and drops structured findings
# --------------------------------------------------------------------------


class TestParserVerifiedShortCircuit:
    def test_verified_response_with_structured_major_is_surfaced(self):
        resp = (
            "VERIFIED\n\n"
            "Issue 1: authentication can be bypassed via the reset flow\n"
            "Severity: Major\n"
        )
        verdict, issues = ver.parse_verification_response(resp)
        # The verdict token is preserved; the contradiction is resolved downstream.
        assert verdict == "VERIFIED"
        # Current: issues == []. Desired: the structured Major is surfaced.
        assert len(issues) == 1
        assert issues[0].get("severity", "").lower() == "major"

    def test_verified_prose_mentioning_severity_stays_clean(self):
        # Control (must PASS today and after the fix): a clean VERIFIED review
        # that merely *discusses* severity in prose must NOT be read as blocking.
        # The fix keys on the structured 'Issue N:' grammar, never prose scanning
        # -- this guards against reintroducing the Set-071 false positive.
        resp = (
            "VERIFIED\n\n"
            "No blocking problems. I considered whether any issue could be "
            "major or critical and found none.\n"
        )
        verdict, issues = ver.parse_verification_response(resp)
        assert verdict == "VERIFIED"
        assert issues == []


# --------------------------------------------------------------------------
# Parser (adversarial) — structured unknown/missing severity under VERIFIED must
# be surfaced (not laundered); prose containing "issue" + a Severity label must
# NOT trip the false positive (GPT SS1 review #2, #3)
# --------------------------------------------------------------------------


class TestParserStructuredVsProse:
    @pytest.mark.parametrize(
        "resp",
        [
            # unrecognized severity token ("High") -> unknown -> blocking
            "VERIFIED\n\nIssue 1: reset-token bypass permits takeover\nSeverity: High\n",
            # structured block with NO severity label -> missing -> blocking
            "VERIFIED\n\nIssue 1: reset-token bypass permits takeover\nCategory: security\n",
        ],
    )
    def test_verified_structured_unknown_severity_is_surfaced(self, resp):
        verdict, issues = ver.parse_verification_response(resp)
        assert verdict == "VERIFIED"
        assert len(issues) == 1
        # unknown/missing severity is blocking under the shared predicate
        assert ver.is_blocking_verdict(verdict, issues) is True

    def test_verified_explicit_minor_stays_clean(self):
        # An explicit Minor under VERIFIED is a coherent nit -> stays out.
        verdict, issues = ver.parse_verification_response(
            "VERIFIED\n\nIssue 1: cosmetic wording\nSeverity: Minor\n"
        )
        assert verdict == "VERIFIED" and issues == []

    def test_prose_with_issue_word_and_severity_label_does_not_trip(self):
        # The adversarial false positive (GPT #3): prose containing BOTH the word
        # "issue" (mid-line) and an explicit "Severity: Major" label must NOT
        # manufacture a finding. The marker is line-anchored, so mid-prose
        # "issue" is inert.
        verdict, issues = ver.parse_verification_response(
            'VERIFIED - I checked the issue template and the example field '
            '"Severity: Major" now parses correctly.'
        )
        assert verdict == "VERIFIED" and issues == []
