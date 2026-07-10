"""Set 070 (S1) — framing-pin test for the push verification template.

The push (routed, snippet-fed) verification surface ships its reviewer prompt
in ``ai_router/prompt-templates/verification.md``. Before Set 070 that template
framed the reviewer weakly ("evaluate it objectively"), weaker than both the
Experiment A instrument that demoted push ("find every defect", moderate) and
its pull counterpart ``path-aware-critique.md`` ("devil's advocate, assume
flawed, prove it", strong). L-069-2: a surface must be measured at its
**strongest** adversarial framing before any demote/retire, and in any A/B the
framing must be a controlled, EQUAL variable across arms.

These tests pin two things so a future silent weakening is caught:

1. The push template carries the **strong adversarial (devil's-advocate)**
   framing — the same strength as the pull template.
2. The template still honours the machine contract
   :func:`ai_router.verification.build_verification_prompt` /
   :func:`ai_router.verification.parse_verification_response` depend on: the
   ``{original_task}`` / ``{task_type}`` / ``{original_response}`` placeholders
   and the ``VERIFIED`` / ``ISSUES FOUND`` verdict tokens.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

import dual_surface_verify
import verification

PROMPT_TEMPLATES_DIR = Path(verification.__file__).resolve().parent / "prompt-templates"
PUSH_TEMPLATE = PROMPT_TEMPLATES_DIR / "verification.md"
PULL_TEMPLATE = PROMPT_TEMPLATES_DIR / "path-aware-critique.md"


def _push_text() -> str:
    return PUSH_TEMPLATE.read_text(encoding="utf-8")


def _pull_text() -> str:
    return PULL_TEMPLATE.read_text(encoding="utf-8")


def _pull_body() -> str:
    """The pull prompt body the dual-surface runner actually renders — the
    portion after ``=== PROMPT ===``. The materiality layer must live HERE (not
    in the operator preamble), or the real pull reviewer never sees it."""
    return dual_surface_verify.prompt_body_of(_pull_text())


def _section(text: str, keyword: str) -> str:
    """Return the body of the section whose heading contains ``keyword`` — from
    that heading up to the next heading. Pins anchored to a section cannot be
    satisfied by the same words appearing elsewhere (e.g. the Output-format
    'Details' line also lists violation/impact/evidence in order; stray prose also
    mentions 'NITS'). Returns '' if no such section heading exists — which itself
    fails the section-presence assertions below."""
    out, capturing = [], False
    kw = keyword.lower()
    for line in text.splitlines():
        is_heading = line.lstrip().startswith("#")
        if is_heading and kw in line.lower():
            capturing = True
            continue
        if capturing and is_heading:
            break
        if capturing:
            out.append(line)
    return "\n".join(out)


def _materiality_section(text: str) -> str:
    return _section(text, "materiality")


def _norm(text: str) -> str:
    """Lowercase, drop markdown emphasis (``*`` / `` ` `` / ``_``), and collapse
    whitespace, so a prose pin matches the rendered prompt regardless of bold /
    code formatting or line-wrapping — none of which the reviewer reads as
    semantics. Lets the pins target the exact load-bearing clause."""
    return re.sub(r"\s+", " ", re.sub(r"[*`_]", "", text)).lower()


# The load-bearing strong-framing phrases. Each is checked case-insensitively
# so cosmetic capitalisation edits don't break the pin, but a genuine
# weakening (dropping the devil's-advocate stance) trips it.
STRONG_FRAMING_PHRASES = [
    "devil's advocate",
    "assume the work is flawed",
    "rubber-stamp",
]


@pytest.mark.parametrize("phrase", STRONG_FRAMING_PHRASES)
def test_push_template_carries_strong_adversarial_framing(phrase: str):
    """verification.md must use the strong devil's-advocate framing (L-069-2)."""
    assert phrase.lower() in _push_text().lower(), (
        f"push verification template lost the strong-framing phrase {phrase!r}; "
        "a silent weakening below pull's framing would make any push-vs-pull "
        "comparison invalid as RETIRE evidence (L-069-2)."
    )


def test_push_template_no_longer_uses_weak_objective_framing():
    """The pre-Set-070 weak framing ('evaluate it objectively') is gone."""
    assert "evaluate it objectively" not in _push_text().lower()


def test_push_framing_strength_matches_pull():
    """Both surfaces carry the same devil's-advocate stance — framing is held
    EQUAL across arms, the precondition for a valid dual-surface comparison."""
    pull_text = PULL_TEMPLATE.read_text(encoding="utf-8").lower()
    push_text = _push_text().lower()
    for phrase in ("devil's advocate", "assume the work is flawed"):
        assert phrase in pull_text, f"pull template unexpectedly lacks {phrase!r}"
        assert phrase in push_text, f"push template unexpectedly lacks {phrase!r}"


def test_push_template_preserves_machine_placeholders():
    """The placeholders build_verification_prompt substitutes must survive."""
    text = _push_text()
    for placeholder in ("{original_task}", "{task_type}", "{original_response}"):
        assert placeholder in text, f"verification.md lost placeholder {placeholder}"


def test_push_template_preserves_verdict_tokens():
    """parse_verification_response keys off VERIFIED / ISSUES FOUND."""
    text = _push_text()
    assert "VERIFIED" in text
    assert "ISSUES FOUND" in text


def test_upgraded_template_still_parses_verified():
    """A VERIFIED verdict produced under the upgraded template parses clean."""
    prompt = verification.build_verification_prompt(
        original_task="do X",
        original_response="I did X correctly.",
        task_type="session-verification",
        template=_push_text(),
    )
    # The placeholders were substituted (no stray braces left behind).
    assert "{original_task}" not in prompt
    assert "do X" in prompt
    verdict, issues = verification.parse_verification_response(
        "VERIFIED — I tried to break it and could not; checked the X path."
    )
    assert verdict == "VERIFIED"
    assert issues == []


def test_upgraded_template_still_parses_issues():
    """An ISSUES FOUND verdict with the documented shape parses into findings."""
    verdict, issues = verification.parse_verification_response(
        "ISSUES FOUND\n\n"
        "- **Issue 1:** The X path is off by one.\n"
        "  - **Category:** Correctness\n"
        "  - **Severity:** Major\n"
    )
    assert verdict == "ISSUES_FOUND"
    assert len(issues) >= 1


# --- Set 071 (S1): the materiality + anti-nitpick layer ---------------------
#
# The layer is ADDITIVE over the Set 070 strong framing: every pin above must
# still pass, and the materiality language must be present in BOTH reviewer
# templates. These phrases are the load-bearing markers of the "so what?" gate,
# the semantic-equivalence anti-nitpick clause, the merge-impact severity
# anchor, and the plausible-path-to-harm anti-laundering guardrail. Checked
# case-insensitively so cosmetic edits don't break the pin, but dropping the
# materiality discipline trips it.
# Distinctive, multi-word phrases (not generic single words) so a degenerate
# template cannot satisfy the pin by retaining a stray word in unrelated text —
# each phrase is a load-bearing clause of the materiality layer.
# Phrase-presence pins for the materiality layer. The core rules are pinned by
# full, distinctive multi-word clauses (e.g. the triad rule, the semantic-
# equivalence sentence, "is itself a false-positive failure", "when in doubt,
# escalate", "never change the verdict"); the short tokens ('violation',
# 'impact', 'evidence', 'nits') are SUPPLEMENTARY presence checks — the
# load-bearing structural guards for the triad and the NITS section live in the
# section-anchored tests below (test_materiality_triad_is_ordered,
# test_nits_output_section_exists_and_is_non_blocking). Matched after _norm strips
# markdown emphasis and collapses whitespace, so a clause matches the rendered
# prompt regardless of formatting/line-wrapping.
MATERIALITY_PHRASES = [
    'so what?',                                                   # the blocking gate, named
    'a finding that cannot produce all three is a nit, not a blocker',  # full triad rule
    'violation',                                                  # triad label (a)
    'impact',                                                     # triad label (b)
    'evidence',                                                   # triad label (c)
    'should come back verified',                                  # the clean-VERIFIED rule
    'manufacturing a minor',                                       # a manufactured Minor IS a failure
    'is itself a false-positive failure',                          # ...named as such (full clause)
    'judge semantic equivalence, not textual identity',            # full anti-nitpick equivalence rule
    'not a finding',                                               # the pytest example IS not a finding
    'exact text is itself the contract',                           # the textual-identity exception
    'a task that says pytest and',                                 # the pytest-vs-... contrast (both sides)
    'python -m pytest -v',                                         # ...the named worthless-finding example
    "reasonable reviewer's merge decision",                        # Major anchor = changes a merge decision
    'no plausible path',                                           # anti-laundering: Minor only if no harm path
    'when in doubt, escalate',                                     # ...escalate when unsure (inversion-resistant)
    'never change the verdict',                                    # NITS are non-blocking (inversion-resistant)
    'nits',                                                        # the non-blocking output section exists
]


@pytest.mark.parametrize("phrase", MATERIALITY_PHRASES)
def test_push_template_carries_materiality_layer(phrase: str):
    """verification.md must carry the Set 071 materiality + anti-nitpick layer.

    The whole file IS the push template (``build_verification_prompt`` substitutes
    into it verbatim), so the whole-file check is runtime-faithful here.
    """
    assert phrase.lower() in _norm(_push_text()), (
        f"push verification template lost the materiality-layer phrase {phrase!r}; "
        "without the 'so what?' triad / anti-nitpick clause / merge-impact anchor "
        "the strong framing manufactures Minor-finding churn (Set 071)."
    )


@pytest.mark.parametrize("phrase", MATERIALITY_PHRASES)
def test_pull_template_carries_materiality_layer(phrase: str):
    """path-aware-critique.md must carry the same materiality + anti-nitpick layer.

    Checked against the rendered prompt **body** (not the whole file), so a phrase
    parked in the operator preamble — which the real pull reviewer never sees —
    cannot satisfy the pin (Set 071, L-065-1).
    """
    assert phrase.lower() in _norm(_pull_body()), (
        f"pull critique template lost the materiality-layer phrase {phrase!r} from "
        "its rendered prompt body; the layer must be mirrored into both reviewer "
        "surfaces where the reviewer actually reads it (Set 071, L-065-1)."
    )


# Set 090: the "Review scope" section scopes the verifier to pre-close work so it
# stops raising the circular "set-not-closed-at-verify-time" category error (and
# the immutable-artifact "stale" complaint) that blocked Sets 088 and 089. Pins
# are section-anchored (so unrelated prose can't satisfy them) and each survives
# _norm (no underscores/backticks in the pinned substrings).
REVIEW_SCOPE_PHRASES = [
    'before close-out',
    'their absence is never a finding',
    'the set is still open',                 # the exact non-defect it must not flag
    'immutable, append-only raw records',    # the prior-round-artifact carve-out
    'not deliverables under review',
]


@pytest.mark.parametrize("phrase", REVIEW_SCOPE_PHRASES)
def test_push_template_carries_preclose_review_scope(phrase: str):
    """verification.md must scope the verifier to pre-close work (Set 090).

    Anchored to the 'Review scope' section, so the same words elsewhere cannot
    satisfy the pin. Without this carve-out the verifier reads the spec's
    close-out 'Ends with' lines as due deliverables and reliably category-errors
    on small sets (blocked Sets 088 and 089, each needing an operator override).
    """
    section = _norm(_section(_push_text(), "review scope"))
    assert section, "verification.md lost the 'Review scope' section (Set 090)."
    assert phrase.lower() in section, (
        f"'Review scope' section lost the pin {phrase!r}; the pre-close carve-out "
        "must survive or the circular 'set-not-closed-at-verify-time' finding returns."
    )


def test_review_scope_preserves_substantive_rigor():
    """The carve-out must NOT weaken substantive review: the clause keeping a
    genuinely-missing spec deliverable in scope must remain (Set 090)."""
    section = _norm(_section(_push_text(), "review scope"))
    assert "does not lower your bar on the actual work" in section
    assert (
        "genuinely missing spec-promised code, test, or documentation deliverable"
        in section
    )


@pytest.mark.parametrize("phrase", STRONG_FRAMING_PHRASES)
def test_pull_template_carries_strong_adversarial_framing(phrase: str):
    """The pull prompt body must independently pin the strong-framing phrases too.

    The additivity test below only proves ``classify_framing_strength`` still
    returns ADVERSARIAL (which keys off two markers). This pins all three strong
    phrases — including ``rubber-stamp`` — directly on the pull surface, so
    "framing intact" is enforced on BOTH templates, not inferred for pull (L-069-2).
    """
    assert phrase.lower() in _norm(_pull_body()), (
        f"pull critique template lost the strong-framing phrase {phrase!r} from its "
        "rendered prompt body; the materiality layer must not weaken framing (L-069-2)."
    )


def test_materiality_layer_is_additive_push_still_adversarial():
    """The push edits must not disturb classify_framing_strength: still ADVERSARIAL.

    This is the dual-surface equal-framing proof — a materiality bar layered on
    strong framing must leave the _ADVERSARIAL_MARKERS intact (L-069-2).
    """
    assert (
        dual_surface_verify.classify_framing_strength(_push_text())
        == dual_surface_verify.FRAMING_ADVERSARIAL
    )


def test_materiality_layer_is_additive_pull_still_adversarial():
    """The pull edits must leave its prompt body classified ADVERSARIAL too.

    Classified from the same prompt body the dual-surface runner uses
    (``prompt_body_of``), so the equal-framing gate cannot break.
    """
    pull_body = dual_surface_verify.prompt_body_of(_pull_text())
    assert (
        dual_surface_verify.classify_framing_strength(pull_body)
        == dual_surface_verify.FRAMING_ADVERSARIAL
    )


@pytest.mark.parametrize("text_fn", [_push_text, _pull_body], ids=["push", "pull"])
def test_materiality_triad_is_ordered(text_fn):
    """The "so what?" triad must appear in order: violation -> impact -> evidence.

    A structural pin (not a bare substring set), ANCHORED to the Materiality
    section so it cannot be satisfied by the same three words appearing in the
    Output-format 'Details' line: a reordered, renamed, partially-removed, or
    relocated triad trips it, so the three-part blocking test cannot be silently
    gutted (Set 071)."""
    section = _norm(_materiality_section(text_fn()))
    assert section, "the Materiality section is missing entirely"
    i_viol = section.find("violation")
    i_imp = section.find("impact", i_viol + 1)
    i_evid = section.find("evidence", i_imp + 1)
    assert -1 < i_viol < i_imp < i_evid, (
        "the materiality triad (violation -> impact -> evidence) is missing or "
        "out of order within the Materiality section; the three-part 'so what?' "
        "blocking test was weakened."
    )


@pytest.mark.parametrize("text_fn", [_push_text, _pull_body], ids=["push", "pull"])
def test_nits_output_section_exists_and_is_non_blocking(text_fn):
    """Both templates must carry a dedicated NITS output-section HEADING whose body
    states the non-blocking grammar — anchored to the section, so deleting the
    actual subsection trips the pin even if stray 'nits' prose survives elsewhere
    (Set 071). This is the designated home that keeps immaterial observations out
    of blocking findings."""
    section = _norm(_section(text_fn(), "nits"))
    assert section, "the NITS output-section heading is missing entirely"
    assert "never change the verdict" in section, (
        "the NITS section must state it never changes the verdict (non-blocking)"
    )
    assert "remediation round" in section, (
        "the NITS section must state it never justifies another remediation round"
    )


def test_parser_tolerates_verified_with_trailing_nits():
    """A VERIFIED verdict followed by a NITS section parses as clean VERIFIED.

    This is the compatibility invariant the new NITS grammar depends on (S1 makes
    no verification.py change): the materiality layer's whole point is that
    correct-work-plus-immaterial-nits returns VERIFIED with no blocking issues.
    """
    verdict, issues = verification.parse_verification_response(
        "VERIFIED - I genuinely tried to break it and could not; checked the X path.\n\n"
        "NITS (optional, non-blocking)\n"
        "- Nit: the log line could read slightly clearer.\n"
    )
    assert verdict == "VERIFIED"
    assert issues == [], "a trailing NITS block must not become a blocking issue"


def test_parser_issue_set_unchanged_by_trailing_nits():
    """Appending a NITS section to an ISSUES FOUND verdict changes neither the
    verdict nor the SIZE of the parsed issue set — NITS spawns no new issue.

    Proven by baseline comparison (same response with vs. without the NITS block),
    which is the honest "unchanged" invariant: the current parser folds any
    trailing text into the last issue's *description* (a pre-existing,
    behaviour-neutral artifact of its greedy-to-end capture — verification.py is
    intentionally untouched in S1; tightening that capture, if wanted, belongs to
    the S2 parser-adjacent work). So we pin what matters here: the issue COUNT and
    verdict do not move, and the real blocking issue survives."""
    body = (
        "ISSUES FOUND\n\n"
        "- **Issue 1:** The X path is off by one.\n"
        "  - **Category:** Correctness\n"
        "  - **Severity:** Major\n"
    )
    base_verdict, base_issues = verification.parse_verification_response(body)
    nits_verdict, nits_issues = verification.parse_verification_response(
        body + "\nNITS\n- Nit: a variable name is a little terse.\n"
    )
    assert base_verdict == nits_verdict == "ISSUES_FOUND"
    assert len(nits_issues) == len(base_issues), (
        "a trailing NITS block must not grow the parsed issue set"
    )
    assert any("off by one" in i["description"] for i in nits_issues), (
        "the real blocking issue must survive NITS parsing"
    )
