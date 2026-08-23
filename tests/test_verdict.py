import pytest

from ai_router.verdict import (
    VERDICT_ISSUES_FOUND,
    VERDICT_VERIFIED,
    classify_blocking,
    is_blocking_issue,
    is_doc_only_issue,
    normalize_severity,
    parse_verification_response,
    validate_session_verdict,
)

ISSUE_BLOCK = """ISSUES FOUND

- **Issue 1:** the close gate reads the wrong field
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** ai_router/gates.py:42, ai_router/session.py
  - **Failure scenario:** every close on a v3 set fails
- **Issue 2:** typo in the report header
  - **Severity:** Minor
"""


class TestVerdictParsing:
    def test_verified_token(self):
        verdict, issues = parse_verification_response(
            "VERIFIED — I attacked the diff and could not break it."
        )
        assert verdict == VERDICT_VERIFIED
        assert issues == []

    def test_verdict_prefix_and_markdown_noise(self):
        verdict, _ = parse_verification_response("**VERDICT: VERIFIED**\nok")
        assert verdict == VERDICT_VERIFIED

    def test_issues_found_parses_blocks(self):
        verdict, issues = parse_verification_response(ISSUE_BLOCK)
        assert verdict == VERDICT_ISSUES_FOUND
        assert len(issues) == 2
        assert issues[0]["description"] == (
            "the close gate reads the wrong field"  # no leading `**`
        )
        assert issues[0]["severity"] == "major"
        assert issues[0]["category"] == "Correctness"
        assert issues[0]["failureScenario"].startswith("every close")
        assert "ai_router/gates.py" in issues[0]["evidencePaths"]
        assert issues[1]["severity"] == "minor"

    def test_unrecognizable_head_fails_closed(self):
        verdict, issues = parse_verification_response("Looks fine to me!")
        assert verdict == VERDICT_ISSUES_FOUND
        assert issues[0]["severity"] == "unknown"

    def test_issues_found_with_no_blocks_synthesizes_one(self):
        verdict, issues = parse_verification_response(
            "ISSUES FOUND\nSomething is off but I won't structure it."
        )
        assert verdict == VERDICT_ISSUES_FOUND
        assert len(issues) == 1
        assert "Something is off" in issues[0]["description"]

    def test_nits_are_recorded_as_minor(self):
        verdict, issues = parse_verification_response(
            "VERIFIED\n\n#### NITS\n- **Issue 1:** not really an issue\n"
        )
        assert verdict == VERDICT_VERIFIED
        assert len(issues) == 1
        assert issues[0]["severity"] == "minor"
        assert issues[0]["section"] == "nits"
        assert not is_blocking_issue(issues[0])

    def test_nits_prose_bullets_are_recorded(self):
        """Verifiers rarely use ``Issue N:`` form under NITS."""
        verdict, issues = parse_verification_response(
            "VERIFIED\n\n### NITS\n"
            "- the retry loop looks suspicious to me\n"
            "- naming here is inconsistent\n"
        )
        assert verdict == VERDICT_VERIFIED
        assert [i["description"] for i in issues] == [
            "the retry loop looks suspicious to me",
            "naming here is inconsistent",
        ]

    def test_unstructured_nits_section_is_recorded_whole(self):
        _, issues = parse_verification_response(
            "VERIFIED\n\nNITS\nI have a vague worry about the cache.\n"
        )
        assert len(issues) == 1
        assert "vague worry" in issues[0]["description"]

    def test_nits_section_does_not_launder_a_blocking_severity(self):
        _, issues = parse_verification_response(
            "VERIFIED\n\n## NITS\n- **Issue 1:** the fold drops events\n"
            "  - **Severity:** Major\n"
        )
        assert issues[0]["severity"] == "major"
        assert is_blocking_issue(issues[0])

    def test_verified_response_keeps_its_minor_findings(self):
        _, issues = parse_verification_response(
            "VERIFIED\n\n- **Issue 1:** small thing\n"
            "  - **Severity:** Minor\n"
        )
        assert len(issues) == 1  # recorded, though it does not block

    def test_speculative_finding_survives_into_the_record(self):
        """The HL7 study case: the verifier found the real defect, filed it
        under NITS, and called it speculative. It must reach the record."""
        verdict, issues = parse_verification_response(
            "VERIFIED\n\nThe implementation looks correct.\n\n"
            "#### NITS\n"
            "- Segment counting may mis-handle a trailing empty field. "
            "This is speculative rather than blocking.\n"
        )
        classification = classify_blocking(verdict, issues)
        assert not classification.blocking
        assert len(classification.nit_issues) == 1
        assert "trailing empty field" in (
            classification.nit_issues[0]["description"]
        )

    def test_verified_with_major_block_surfaces_contradiction(self):
        text = (
            "VERIFIED\n\n- **Issue 1:** actually broken\n"
            "  - **Severity:** Major\n"
        )
        verdict, issues = parse_verification_response(text)
        assert verdict == VERDICT_VERIFIED
        assert len(issues) == 1  # contradictory evidence is never dropped

    def test_empty_response_fails_closed(self):
        verdict, issues = parse_verification_response("")
        assert verdict == VERDICT_ISSUES_FOUND
        assert len(issues) == 1


class TestSeverityAndBlocking:
    def test_unrecognized_severity_blocks(self):
        assert is_blocking_issue({"description": "x", "severity": "High"})

    def test_minor_does_not_block(self):
        assert not is_blocking_issue({"description": "x", "severity": "minor"})

    def test_normalize_severity_closed_vocabulary(self):
        assert normalize_severity("Critical") == "critical"
        assert normalize_severity("HIGH") == "major"  # unknown -> blocking
        assert normalize_severity(None) == "major"
        assert normalize_severity(" minor ") == "minor"

    def test_doc_only_issue_never_blocks(self):
        issue = {
            "description": "readme typo", "severity": "major",
            "evidencePaths": ["README.md", "docs/notes.txt"],
        }
        assert is_doc_only_issue(issue)
        assert not is_blocking_issue(issue)

    def test_prompt_templates_markdown_stays_in_scope(self):
        issue = {
            "description": "template bug", "severity": "major",
            "evidencePaths": ["ai_router/prompt-templates/verification.md"],
        }
        assert not is_doc_only_issue(issue)
        assert is_blocking_issue(issue)

    def test_classify_blocking_verdict_without_findings(self):
        assert not classify_blocking(VERDICT_VERIFIED, []).blocking
        # A non-VERIFIED verdict with nothing parseable blocks (fail closed).
        assert classify_blocking(VERDICT_ISSUES_FOUND, []).blocking

    def test_classify_partitions(self):
        result = classify_blocking(VERDICT_ISSUES_FOUND, [
            {"description": "a", "severity": "critical"},
            {"description": "b", "severity": "minor"},
            {"description": "c", "severity": "major",
             "evidencePaths": ["README.md"]},
        ])
        assert result.blocking
        assert len(result.blocking_issues) == 1
        assert len(result.nit_issues) == 1
        assert len(result.doc_capped_issues) == 1


class TestSessionVerdictVocabulary:
    @pytest.mark.parametrize("token", ["VERIFIED", "ISSUES_FOUND", "WAIVED"])
    def test_canonical_tokens_pass(self, token):
        assert validate_session_verdict(token) == token

    @pytest.mark.parametrize("token", [
        "manual-override-development",  # the 2026-07-08 incident token
        "VERIFIED_NOT_REALLY",          # prefix look-alike
        "", None, "verified ",
    ])
    def test_invented_tokens_refused(self, token):
        with pytest.raises(ValueError):
            validate_session_verdict(token)


class TestAdjudicationParsing:
    def test_judged_disputes_parsed_ambiguity_fails_closed(self):
        from ai_router.verdict import parse_adjudication_response

        response = (
            "Dispute 1: OVERRULE — the scope file settles it\n"
            "Dispute 3: OVERRULE — fine here\n"
            "Dispute 3: UPHOLD — no wait\n"
            "Dispute 4: OVERRULE\n"
        )
        outcomes = parse_adjudication_response(response, 4)
        assert outcomes[0]["outcome"] == "OVERRULED"
        assert outcomes[0]["reasons"] == "the scope file settles it"
        # Dispute 2 was never judged; dispute 3 was judged both ways;
        # dispute 4 was overruled on no argument at all. Ambiguity never
        # overrules a finding.
        assert outcomes[1]["outcome"] == "UPHELD"
        assert "no parseable judgment" in outcomes[1]["reasons"]
        assert outcomes[2]["outcome"] == "UPHELD"
        assert "contradictory" in outcomes[2]["reasons"]
        assert outcomes[3]["outcome"] == "UPHELD"
        assert "without reasons" in outcomes[3]["reasons"]
