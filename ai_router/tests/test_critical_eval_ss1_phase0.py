"""SS1 live guards — the verification-loop-exit fixes.

Part of the out-of-band remediation tracked in
``../dabbler-orchestration-remediation`` (see ``critical-eval-plan-v3-lean.md``,
Session Set 1). These began as an ``xfail(strict=True)`` red baseline; the SS1
fixes have since landed, so the four bug tests now assert the correct behavior
and pass as live regression guards. The strict markers were removed as each fix
landed (an XPASS under strict is itself a failure, which is what forced the
promotion — the baseline could not silently rot).

Bugs fixed and now guarded (all verified in code 2026-07-10):
  1. derive_state is severity-blind: an undispositioned *Minor* keeps the loop
     alive instead of closing.                     [dedicated_verification.py:1182]
  2. derive_state short-circuits on a raw ``VERIFIED`` token BEFORE inspecting
     issues: a structured Major under a VERIFIED closes.  [dedicated_verification.py:1186]
  3. Unknown/unauthorized ``resolution_status`` is fail-open: it is neither
     "open" nor "human-stop", so it can satisfy a close. [dedicated_verification.py:1181-1206]
  4. The push parser trusts the ``VERIFIED`` token and returns an empty finding
     list, so a structured Major under VERIFIED is invisible. [verification.py:221-234]

Deferred (documented, not an SS1 derive_state fix):
  * Minor-only rounds consuming the automatic round budget depends on a per-round
    attempt history that derive_state does not have (it sees only the latest
    envelope). That fix rides the SS2 attempt record -> SS3 item 13. Captured
    below as an explicit ``skip`` so the roadmap stays visible.
"""

from __future__ import annotations

import pytest

# conftest puts ai_router/ on sys.path
import dedicated_verification as dv  # noqa: E402
import verification as ver  # noqa: E402

D = dv.VERIFICATION_MODE_DEDICATED


# --------------------------------------------------------------------------
# helpers (severity-aware — the existing _issues() helper carries no severity)
# --------------------------------------------------------------------------


def _s(num, status, typ=None, verdict=None):
    e = {"number": num, "status": status}
    if typ:
        e["type"] = typ
    if verdict is not None:
        e["verificationVerdict"] = verdict
    return e


def _issues(*specs):
    """Build a latest-issues envelope from ``(severity, resolution_status)`` pairs.

    ``severity`` or ``resolution_status`` may be ``None`` to omit the field.
    """
    out = []
    for sev, st in specs:
        issue = {"description": "x"}
        if sev is not None:
            issue["severity"] = sev
        if st is not None:
            issue["resolution_status"] = st
        out.append(issue)
    return {"issues": out}


_WORK_THEN_VERIFY_ISSUES = [
    _s(1, "complete"),
    _s(2, "complete", "verification", "ISSUES_FOUND"),
]
_WORK_THEN_VERIFY_VERIFIED = [
    _s(1, "complete"),
    _s(2, "complete", "verification", "VERIFIED"),
]


# --------------------------------------------------------------------------
# Bug 1 — severity-blind loop: an undispositioned Minor should NOT re-open a round
# --------------------------------------------------------------------------


class TestSeverityBlindLoop:
    def test_minor_only_undispositioned_closes(self):
        # Was AWAITING_REMEDIATION (churned). Now CLOSED_VERIFIED (severity-aware).
        assert (
            dv.derive_state(
                _WORK_THEN_VERIFY_ISSUES,
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(("minor", None), ("minor", None)),
            )
            == dv.STATE_CLOSED_VERIFIED
        )

    def test_major_undispositioned_still_blocks(self):
        # Control (must PASS today and after the fix): an open Major is blocking.
        # This is the invariant the severity-aware fix must NOT weaken.
        assert (
            dv.derive_state(
                _WORK_THEN_VERIFY_ISSUES,
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(("major", None)),
            )
            == dv.STATE_AWAITING_REMEDIATION
        )


# --------------------------------------------------------------------------
# Bug 2 — VERIFIED token short-circuit: a structured Major must not be laundered
# --------------------------------------------------------------------------


class TestVerifiedTokenShortCircuit:
    def test_verified_token_with_structured_major_is_contradiction(self):
        # Was CLOSED_VERIFIED (short-circuit on the token before inspecting
        # issues). Now AWAITING_HUMAN (VERIFIED + structured Major is incoherent).
        assert (
            dv.derive_state(
                _WORK_THEN_VERIFY_VERIFIED,
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(("major", None)),
            )
            == dv.STATE_AWAITING_HUMAN
        )


# --------------------------------------------------------------------------
# Bug 3 — unknown resolution_status is fail-open
# --------------------------------------------------------------------------


class TestUnknownDispositionFailOpen:
    def test_unknown_resolution_status_requires_human(self):
        # Was CLOSED_VERIFIED (fail-open). Now AWAITING_HUMAN (unknown = invalid).
        assert (
            dv.derive_state(
                _WORK_THEN_VERIFY_ISSUES,
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(("major", "totally-made-up-status")),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    def test_unknown_status_with_fixed_still_requires_human_after_remediation(self):
        # GPT SS1 rerun: an unknown disposition mixed with a `fixed` issue must
        # still fail closed to a human. `fixed`/any_fixed must NOT win via the
        # remediation branch and recycle invalid evidence into re-verification.
        sessions = [
            _s(1, "complete"),
            _s(2, "complete", "verification", "ISSUES_FOUND"),
            _s(3, "complete", "remediation"),
        ]
        assert (
            dv.derive_state(
                sessions,
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(
                    ("major", "fixed"), ("major", "totally-made-up-status")
                ),
            )
            == dv.STATE_AWAITING_HUMAN
        )


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
# Item 6 — accepted-* / not-reproducible are RELEASE decisions needing operator
# authority: interim = human-stop, never self-release (GPT SS1 review #1)
# --------------------------------------------------------------------------


_AUTHORITY_DISPOSITIONS = ["accepted-risk", "accepted-consequence", "not-reproducible"]


class TestAcceptedDispositionsNeedAuthority:
    @pytest.mark.parametrize("disposition", _AUTHORITY_DISPOSITIONS)
    def test_accepted_major_awaits_human_at_verification(self, disposition):
        # A Major "accepted" by whoever wrote the envelope must not self-close.
        assert (
            dv.derive_state(
                _WORK_THEN_VERIFY_ISSUES,
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(("major", disposition)),
            )
            == dv.STATE_AWAITING_HUMAN
        )

    @pytest.mark.parametrize("disposition", _AUTHORITY_DISPOSITIONS)
    def test_accepted_major_awaits_human_after_remediation(self, disposition):
        sessions = [
            _s(1, "complete"),
            _s(2, "complete", "verification", "ISSUES_FOUND"),
            _s(3, "complete", "remediation"),
        ]
        assert (
            dv.derive_state(
                sessions,
                verification_mode=D,
                set_status="in-progress",
                latest_issues=_issues(("major", disposition)),
            )
            == dv.STATE_AWAITING_HUMAN
        )


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


# --------------------------------------------------------------------------
# Deferred — minor-only rounds must not consume the blocking-round budget
# --------------------------------------------------------------------------


@pytest.mark.skip(
    reason="SS3 item 13: 'count only blocking cycles toward the round limit' "
    "needs a per-round attempt history. derive_state sees only the latest "
    "envelope, so this cannot be pinned at the derive_state layer. Rides the "
    "SS2 attempt record. Placeholder kept so the roadmap stays visible."
)
def test_minor_only_rounds_do_not_consume_budget():  # pragma: no cover
    raise NotImplementedError
