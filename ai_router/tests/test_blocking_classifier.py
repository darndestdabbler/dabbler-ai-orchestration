"""Set 071 (S2) — severity-anchored blocking classifier + cross-round ledger.

Set 071 stops a strong adversarial verifier from churning re-verify rounds on
immaterial findings without weakening the devil's-advocate framing (L-069-2).
The reviewer prompt templates carry the materiality "so what?" gate (S1); these
tests pin the *code* half:

1. :func:`ai_router.verification.is_blocking_verdict` / :func:`classify_blocking`
   — a round is justified ONLY by a Critical/Major finding; a Minor-only /
   nits-only result is recorded but non-blocking ("effectively VERIFIED" for the
   loop). Unknown/missing severity in a non-VERIFIED result defaults to BLOCKING
   (anti-laundering: when in doubt, escalate).
2. The verbatim ``pytest`` vs ``python -m pytest -v`` churn from the tires repo
   (three consecutive Minor / False-Positive rounds on one immaterial point) is
   pinned as a regression fixture that MUST classify non-blocking — the exact
   nitpick churn this set exists to kill.
3. :func:`reconcile_issue_ledger` — the cross-round ledger keyed on a stable
   blocker id; a settled (``RESOLVED``) id that reappears is flagged as a
   resurrection the loop refuses to reopen.
"""

from __future__ import annotations

import pytest

import verification
from verification import (
    BlockingClassification,
    LEDGER_RESOLVED,
    LEDGER_UNRESOLVED,
    LedgerReconciliation,
    classify_blocking,
    is_blocking_verdict,
    parse_nits,
    parse_verification_response,
    reconcile_issue_ledger,
)


# --- is_blocking_verdict --------------------------------------------------

def test_verified_is_non_blocking():
    assert is_blocking_verdict("VERIFIED", []) is False


@pytest.mark.parametrize("severity", ["Critical", "Major", "critical", "MAJOR"])
def test_critical_or_major_blocks(severity):
    assert is_blocking_verdict("ISSUES_FOUND", [{"severity": severity}]) is True


@pytest.mark.parametrize("severity", ["Minor", "minor", "MINOR"])
def test_minor_only_is_non_blocking(severity):
    """A Minor-only ISSUES_FOUND is effectively VERIFIED for the loop."""
    assert is_blocking_verdict("ISSUES_FOUND", [{"severity": severity}]) is False


def test_mixed_minor_and_major_blocks():
    """One real Major among nits still blocks — Minor does not mask it."""
    issues = [{"severity": "Minor"}, {"severity": "Major"}, {"severity": "Minor"}]
    assert is_blocking_verdict("ISSUES_FOUND", issues) is True


def test_unknown_severity_blocks_anti_laundering():
    """Unknown / unrecognised severity defaults to BLOCKING — a real defect must
    not be laundered into a nit by an absent or garbled label."""
    assert is_blocking_verdict("ISSUES_FOUND", [{"severity": "unknown"}]) is True
    assert is_blocking_verdict("ISSUES_FOUND", [{"severity": ""}]) is True
    assert is_blocking_verdict("ISSUES_FOUND", [{"description": "no severity key"}]) is True
    assert is_blocking_verdict("ISSUES_FOUND", [{"severity": "moderate"}]) is True


def test_issues_found_with_no_parsed_issues_blocks():
    """ISSUES_FOUND but nothing parsed -> blocking; never silently drop."""
    assert is_blocking_verdict("ISSUES_FOUND", []) is True


def test_non_verified_token_treated_as_issues():
    """Any non-VERIFIED token is conservative (blocking when no clean Minor-only
    set is present)."""
    assert is_blocking_verdict("ISSUES_FOUND", [{"severity": "Major"}]) is True
    assert is_blocking_verdict("", []) is True


# --- classify_blocking (the richer partition) -----------------------------

def test_classify_partitions_blocking_and_nits():
    issues = [
        {"severity": "Minor", "description": "a"},
        {"severity": "Major", "description": "b"},
        {"severity": "Minor", "description": "c"},
    ]
    result = classify_blocking("ISSUES_FOUND", issues)
    assert isinstance(result, BlockingClassification)
    assert result.blocking is True
    assert len(result.blocking_issues) == 1
    assert len(result.nit_issues) == 2
    assert result.reason


def test_classify_minor_only_non_blocking_with_reason():
    result = classify_blocking("ISSUES_FOUND", [{"severity": "Minor"}])
    assert result.blocking is False
    assert result.nit_issues and not result.blocking_issues
    assert "non-blocking" in result.reason.lower()


def test_classify_verified_clean():
    result = classify_blocking("VERIFIED", [])
    assert result.blocking is False
    assert not result.blocking_issues and not result.nit_issues
    assert is_blocking_verdict("VERIFIED", []) == result.blocking


# --- severity-derived, NOT token-derived (S2 R3 finding) -------------------
#
# The doc contract is "blocking is severity-anchored, NOT the bare verdict
# token". The predicate must therefore derive from the findings: a Major/Critical
# present blocks regardless of the token (anti-laundering — a Major under a
# mislabeled VERIFIED is never waved through), while VERIFIED carrying only Minor
# nits stays non-blocking with the nits preserved.

def test_major_blocks_even_under_a_verified_token():
    """A (mislabeled) VERIFIED that carries a Major finding still blocks — the
    predicate is severity-derived, not token-derived (anti-laundering)."""
    assert is_blocking_verdict("VERIFIED", [{"severity": "Major"}]) is True
    assert is_blocking_verdict("VERIFIED", [{"severity": "Critical"}]) is True
    c = classify_blocking("VERIFIED", [{"severity": "Major", "description": "real"}])
    assert c.blocking is True and len(c.blocking_issues) == 1


def test_push_parser_trusts_the_verified_token_no_false_positive():
    """On the PUSH surface the parser trusts the VERIFIED token for PROSE and
    NITS (the template binds VERIFIED <=> no Critical/Major): it must NOT scan a
    VERIFIED body for "Severity: Major" substrings, or a clean review that merely
    *discusses* severity in prose would be misread as blocking (the exact false
    positive Set 071 kills; S2 R5).

    SS1 refinement (out-of-band remediation, ratified at GPT review): a genuinely
    STRUCTURED ``Issue N:`` block carrying an explicit ``Severity: Major`` label
    under a VERIFIED token is the one exception — it is contradictory evidence
    and is SURFACED, not laundered into a clean pass. That case (formerly asserted
    to be ``[]`` here) is now asserted below and has a dedicated guard in
    test_critical_eval_ss1_phase0. The three prose/nits cases remain the
    false-positive guard. The severity-derived anti-laundering net is also tested
    at the predicate level (test_major_blocks_even_under_a_verified_token) and on
    the pull surface (test_classifier_is_surface_agnostic_over_pull_findings)."""
    for response in (
        "VERIFIED - tried to break it and could not.",
        "VERIFIED - clean.\n\n#### NITS (optional, non-blocking)\n"
        "- **Nit:** the log line could read clearer.\n",
        # prose discussing severity -- must NOT manufacture a blocking finding
        'VERIFIED - I checked that "**Severity:** Major" now parses correctly.',
    ):
        verdict, issues = parse_verification_response(response)
        assert verdict == "VERIFIED" and issues == [], response
        assert is_blocking_verdict(verdict, issues) is False, response

    # SS1: a STRUCTURED Issue block with an explicit Severity: Major label under a
    # VERIFIED token is contradictory evidence -> surfaced (not dropped), so the
    # downstream state machine can route it to a human instead of laundering it.
    verdict, issues = parse_verification_response(
        "VERIFIED\n\n- **Issue 1:** off-by-one.\n  - **Severity:** Major\n"
    )
    assert verdict == "VERIFIED"
    assert [i.get("severity") for i in issues] == ["Major"]
    assert is_blocking_verdict(verdict, issues) is True


def test_trailing_nits_does_not_bleed_into_issue_description():
    """S2 R4 nit: a trailing NITS section is stripped before issue parsing, so
    a nit never bleeds into the last issue's description (nits stay literally out
    of the issues list)."""
    verdict, issues = parse_verification_response(
        "ISSUES FOUND\n\n- **Issue 1:** off-by-one drops the last item.\n"
        "  - **Severity:** Major\n\n"
        "NITS\n- Nit: a variable name is a little terse.\n"
    )
    assert verdict == "ISSUES_FOUND" and len(issues) == 1
    assert "terse" not in issues[0]["description"], (
        "the NITS bullet must not bleed into the issue description"
    )
    assert "off-by-one" in issues[0]["description"]


def test_verified_with_minor_nits_is_non_blocking_and_keeps_nits():
    """VERIFIED carrying only Minor nits is non-blocking, and classify_blocking
    preserves the nits (it must not drop them)."""
    issues = [{"severity": "Minor", "description": "log clearer"}]
    assert is_blocking_verdict("VERIFIED", issues) is False
    c = classify_blocking("VERIFIED", issues)
    assert c.blocking is False
    assert len(c.nit_issues) == 1 and not c.blocking_issues


# --- parse_nits: the read side of the NITS grammar (S2 R3, additive) -------
#
# parse_nits surfaces nits for logging WITHOUT putting them in `issues` (the S1
# invariant: a nit never becomes a blocking issue). It reads nits under either
# verdict and never affects parse_verification_response's (verdict, issues)
# contract.

def test_parse_nits_reads_nits_under_verified():
    response = (
        "VERIFIED - tried to break it and could not; checked the X path.\n\n"
        "#### NITS (optional, non-blocking)\n"
        "- **Nit:** the log line could read slightly clearer.\n"
        "- **Nit:** a variable name is a little terse.\n"
    )
    nits = parse_nits(response)
    assert nits == [
        "the log line could read slightly clearer.",
        "a variable name is a little terse.",
    ]
    # ...and the (verdict, issues) contract is untouched: still clean VERIFIED.
    verdict, issues = parse_verification_response(response)
    assert verdict == "VERIFIED" and issues == []
    assert is_blocking_verdict(verdict, issues) is False


def test_parse_nits_reads_nits_under_issues_found_without_blocking():
    response = (
        "ISSUES FOUND\n\n"
        "- **Issue 1:** off-by-one drops the last item.\n"
        "  - **Severity:** Major\n\n"
        "NITS\n"
        "- Nit: a comment could be clearer.\n"
    )
    assert parse_nits(response) == ["a comment could be clearer."]


def test_parse_nits_empty_when_no_section():
    assert parse_nits("VERIFIED - all good.") == []
    assert parse_nits("") == []


# --- the pytest-vs-`python -m pytest -v` churn regression fixture ----------
#
# The canonical observed churn (Set 001 of ../kick-the-orchestrator-tires):
# three consecutive remediation rounds spent on one immaterial point — whether
# the response showed `pytest` vs `python -m pytest -v` output, a distinction
# with no behavioural difference on correct work. Each round came back
# ISSUES_FOUND / Minor / False-Positive. Under the Set 071 loop discipline these
# parse to a Minor-only result, which is NON-blocking: the loop never reopens.

PYTEST_CHURN_ROUNDS = [
    # Round 2
    "ISSUES FOUND\n\n"
    "- **Issue 1:** The claimed pytest run result is unsubstantiated; the tests "
    "appear likely to pass, but the execution result is not proven by what is shown.\n"
    "  - **Category:** False Positive\n"
    "  - **Severity:** Minor\n",
    # Round 3
    "ISSUES FOUND\n\n"
    "- **Issue 1:** The task says `pytest`; the response shows `python -m pytest -v` "
    "output. These are usually equivalent but not the same command.\n"
    "  - **Category:** False Positive\n"
    "  - **Severity:** Minor\n",
    # Round 4
    "ISSUES FOUND\n\n"
    "- **Issue 1:** The response says it shows bare `pytest` but the block is "
    "labeled `pytest -v` — not the same command.\n"
    "  - **Category:** False Positive\n"
    "  - **Severity:** Minor\n",
]


@pytest.mark.parametrize("response", PYTEST_CHURN_ROUNDS, ids=["r2", "r3", "r4"])
def test_pytest_churn_rounds_classify_non_blocking(response):
    """Each verbatim churn round must parse to a Minor-only finding that does NOT
    reopen the re-verify loop. This is the regression that proves the set killed
    the observed nitpick churn (three rounds on `pytest` vs `python -m pytest -v`)."""
    verdict, issues = parse_verification_response(response)
    assert verdict == "ISSUES_FOUND"
    assert issues, "the churn finding should parse (it was emitted as an Issue)"
    assert all(
        (i.get("severity") or "").strip().lower() == "minor" for i in issues
    ), "the churn rounds were all Minor / False-Positive"
    assert is_blocking_verdict(verdict, issues) is False, (
        "a Minor-only churn finding must be NON-blocking — the whole point of "
        "Set 071 is that this no longer reopens a remediation round"
    )


# --- verdict-grammar variants (S2 R1 finding: complete the header class-fix) ---
#
# parse_verification_response must read the documented binary grammar in all the
# forms a verifier actually emits — bare, markdown-bold, "VERDICT:"-prefixed, and
# the canonical *underscored* ISSUES_FOUND. The first header-strip fix handled
# only the spaced "ISSUES FOUND"; "_" is not whitespace, so the canonical
# underscored token self-matched again (a spurious blocking finding), and
# "VERDICT: VERIFIED" fell through to ISSUES_FOUND — both reintroduce the exact
# spurious reopen Set 071 kills (L-069-1: a bug is a bug class).

@pytest.mark.parametrize("response", [
    "VERDICT: VERIFIED\n\nChecked the X path; tried to break it and could not.",
    "**VERDICT: VERIFIED**\n\nReviewed the classifier and ledger; sound.",
    "VERDICT - VERIFIED\n\nok",
])
def test_verdict_prefixed_verified_parses_clean(response):
    """A 'VERDICT:'-prefixed VERIFIED must not fall through to a blocking result."""
    verdict, issues = parse_verification_response(response)
    assert verdict == "VERIFIED"
    assert issues == []
    assert is_blocking_verdict(verdict, issues) is False


def test_underscored_issues_found_minor_is_non_blocking():
    """The canonical underscored ISSUES_FOUND header must be stripped, so a
    Minor-only result does not pick up a spurious header-matched finding."""
    verdict, issues = parse_verification_response(
        "ISSUES_FOUND\n\n- **Issue 1:** a log line could read clearer.\n"
        "  - **Severity:** Minor\n"
    )
    assert verdict == "ISSUES_FOUND"
    assert len(issues) == 1, f"no spurious header finding expected, got {issues}"
    assert (issues[0].get("severity") or "").lower() == "minor"
    assert is_blocking_verdict(verdict, issues) is False


def test_underscored_issues_found_major_blocks_without_spurious_finding():
    verdict, issues = parse_verification_response(
        "VERDICT: ISSUES_FOUND\n\n- **Issue 1:** off-by-one drops the last item.\n"
        "  - **Severity:** Major\n"
    )
    assert verdict == "ISSUES_FOUND"
    assert len(issues) == 1
    assert (issues[0].get("severity") or "").lower() == "major"
    assert is_blocking_verdict(verdict, issues) is True


def test_real_major_still_blocks_through_the_parser():
    """The catch ceiling is unchanged: a real Major finding parsed from a
    verifier response still blocks (the materiality bar lowers noise, not the
    real-defect ceiling)."""
    verdict, issues = parse_verification_response(
        "ISSUES FOUND\n\n"
        "- **Issue 1:** The X path is off by one, dropping the last element.\n"
        "  - **Category:** Correctness\n"
        "  - **Severity:** Major\n"
    )
    assert verdict == "ISSUES_FOUND"
    assert is_blocking_verdict(verdict, issues) is True


# --- surface-agnostic: the classifier works on the PULL surface too ---------
#
# The blocking classifier consumes severity-bearing finding dicts regardless of
# which surface produced them. The push surface feeds it via
# parse_verification_response (above); the path-aware *pull* surface produces
# ai_router.pull_verifier.Finding objects whose to_dict() emits the same
# ``severity`` key (parsed structurally from the submit_verdict tool, NOT via
# parse_verification_response). These tests prove the same Minor-only ->
# non-blocking / Major -> blocking decision holds on the pull surface's actual
# output shape, so the loop discipline covers BOTH reviewer surfaces.

def test_classifier_is_surface_agnostic_over_pull_findings():
    import pull_verifier

    minor = [pull_verifier.Finding(description="log line clearer", severity="Minor").to_dict()]
    major = [pull_verifier.Finding(description="off-by-one", severity="Major").to_dict()]
    blank = [pull_verifier.Finding(description="no severity given").to_dict()]

    assert "severity" in minor[0] and minor[0]["severity"] == "Minor"
    assert is_blocking_verdict("ISSUES_FOUND", minor) is False
    assert is_blocking_verdict("ISSUES_FOUND", major) is True
    # A pull Finding with no severity omits the key entirely -> anti-laundering
    # default treats it as blocking (never silently dropped).
    assert "severity" not in blank[0]
    assert is_blocking_verdict("ISSUES_FOUND", blank) is True

    mixed = minor + major
    c = classify_blocking("ISSUES_FOUND", mixed)
    assert c.blocking is True and len(c.blocking_issues) == 1 and len(c.nit_issues) == 1


# --- VerificationResult wiring (S2 R5 Issue 2: consumed programmatically) ---
#
# route() parses the verifier response, then derives the blocking decision and
# the nits and attaches them to VerificationResult, so the re-verify loop reads
# result.verification.blocking instead of switching on the bare verdict token.
# These tests pin that wiring deterministically (route() itself needs a metered
# call); the loop's multi-round ledger threading stays orchestrator-driven by
# design (no automated multi-round runner exists in ai_router).

def test_verification_result_carries_blocking_and_nits():
    import ai_router

    # Minor-only ISSUES_FOUND with a NITS section -> non-blocking, nits surfaced.
    raw = (
        "ISSUES FOUND\n\n- **Issue 1:** a name is terse.\n  - **Severity:** Minor\n\n"
        "NITS\n- Nit: a comment could be clearer.\n"
    )
    verdict, issues = parse_verification_response(raw)
    vr = ai_router.VerificationResult(
        verdict=verdict,
        verified=(verdict == "VERIFIED"),
        issues=issues,
        verifier_model="gpt-5-4",
        verifier_provider="openai",
        generator_model="claude-opus-4-8",
        generator_provider="anthropic",
        verifier_input_tokens=0,
        verifier_output_tokens=0,
        verifier_cost_usd=0.0,
        raw_response=raw,
        blocking=is_blocking_verdict(verdict, issues),
        nits=parse_nits(raw),
    )
    assert vr.verdict == "ISSUES_FOUND"
    assert vr.blocking is False, "Minor-only round must be non-blocking"
    assert vr.nits == ["a comment could be clearer."]


def test_verification_result_blocking_defaults_false():
    """The new fields default backward-compatibly (e.g. the no-router stub)."""
    import ai_router

    stub = ai_router._build_no_router_verification_stub("claude-opus-4-8")
    assert stub.blocking is False
    assert stub.nits == []


# --- reconcile_issue_ledger (cross-round, stable id) ----------------------

def test_ledger_first_round_all_new():
    r = reconcile_issue_ledger(None, ["B1", "B2"])
    assert isinstance(r, LedgerReconciliation)
    assert r.new_blockers == ["B1", "B2"]
    assert r.resurrected == [] and r.resolved == [] and r.unresolved == []
    assert r.status == {"B1": LEDGER_UNRESOLVED, "B2": LEDGER_UNRESOLVED}


def test_ledger_marks_resolved_when_blocker_disappears():
    prior = {"B1": LEDGER_UNRESOLVED, "B2": LEDGER_UNRESOLVED}
    r = reconcile_issue_ledger(prior, ["B2"])  # B1 fixed this round
    assert r.resolved == ["B1"]
    assert r.unresolved == ["B2"]
    assert r.status["B1"] == LEDGER_RESOLVED
    assert r.status["B2"] == LEDGER_UNRESOLVED


def test_ledger_flags_resurrection_of_settled_point():
    """A blocker id that was RESOLVED and reappears is a resurrection — the
    settled-point-under-new-wording churn the ledger forbids. It stays RESOLVED;
    the loop refuses to reopen it."""
    prior = {"B1": LEDGER_RESOLVED, "B2": LEDGER_UNRESOLVED}
    r = reconcile_issue_ledger(prior, ["B1", "B3"])
    assert r.resurrected == ["B1"]
    assert r.new_blockers == ["B3"]
    assert "B1" not in r.unresolved
    assert r.status["B1"] == LEDGER_RESOLVED  # never silently reopened
    assert r.status["B3"] == LEDGER_UNRESOLVED


def test_ledger_dedupes_repeated_current_ids():
    r = reconcile_issue_ledger(None, ["B1", "B1", "B2"])
    assert r.new_blockers == ["B1", "B2"]


def test_ledger_empty_round_resolves_everything_open():
    prior = {"B1": LEDGER_UNRESOLVED, "B2": LEDGER_UNRESOLVED}
    r = reconcile_issue_ledger(prior, [])
    assert sorted(r.resolved) == ["B1", "B2"]
    assert all(v == LEDGER_RESOLVED for v in r.status.values())
