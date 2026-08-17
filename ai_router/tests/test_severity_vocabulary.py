"""Set 134 S2 — falsifiers for the closed severity vocabulary.

Session 2 measured the severity field over all 771 committed findings and
found 28 non-canonical values, every one written between 2026-07-02 and
2026-07-10. The vocabulary is now closed at the writer
(:func:`ai_router.verification.require_severity`), with readers left lenient
about the history already on disk.

Per L-112-1, every rule below ships TWO falsifiers: one that plants the
violation and asserts the gate fires, and one that plants the legitimate
look-alike and asserts it does not. The corpus-scan test additionally asserts
its corpus is non-empty, so a gate that matches nothing cannot pass by finding
nothing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_router.verification import (
    ALLOWED_SEVERITIES,
    CANONICAL_SEVERITIES,
    InvalidSeverityError,
    canonical_severity_for_write,
    classify_blocking,
    is_blocking_issue,
    is_valid_severity,
    parse_verification_response,
    require_severity,
    suggest_severity,
    validate_severity,
)
from ai_router.verify_session import write_issues_artifact

REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# The vocabulary itself
# ---------------------------------------------------------------------------

class TestVocabulary:
    def test_the_legal_set_is_exactly_three_tokens(self):
        assert CANONICAL_SEVERITIES == ("Critical", "Major", "Minor")
        assert ALLOWED_SEVERITIES == frozenset(CANONICAL_SEVERITIES)

    @pytest.mark.parametrize("token", CANONICAL_SEVERITIES)
    def test_legitimate_look_alike_every_canonical_token_is_accepted(self, token):
        # The gate must not fire on the values it exists to protect.
        assert is_valid_severity(token) is True
        assert validate_severity(token) is None
        assert require_severity(token) == token

    @pytest.mark.parametrize(
        "token",
        [
            # Every distinct non-canonical value measured in the committed
            # corpus on 2026-08-17. If the writer had existed, none of these
            # would be on disk.
            "unknown",
            "Unspecified (treated as blocking per the anti-laundering rule)",
            "unspecified (blocking per anti-laundering rule)",
            "Medium",
            "Major (reviewer) / adjudicated Minor",
            "Suggestion",
            "Major (claimed)",
        ],
    )
    def test_plant_the_violation_every_measured_drift_value_is_refused(self, token):
        assert is_valid_severity(token) is False
        assert validate_severity(token) is not None
        with pytest.raises(InvalidSeverityError):
            require_severity(token)

    @pytest.mark.parametrize("token", ["major", "MAJOR", " Major", "Major "])
    def test_plant_the_violation_a_near_miss_spelling_is_refused_too(self, token):
        # Exact means exact. is_blocking_issue would read all of these; the
        # writer still refuses them, because a near-miss admitted here is a
        # near-miss on disk forever.
        assert is_valid_severity(token) is False
        with pytest.raises(InvalidSeverityError):
            require_severity(token)

    def test_plant_the_violation_non_strings_and_empties_are_refused(self):
        for bad in (None, 3, ["Major"], "", "   "):
            assert is_valid_severity(bad) is False
            with pytest.raises(InvalidSeverityError):
                require_severity(bad)

    def test_the_refusal_names_the_legal_set_so_it_teaches_the_vocabulary(self):
        message = validate_severity("High")
        assert message is not None
        for token in CANONICAL_SEVERITIES:
            assert f"'{token}'" in message

    def test_prose_in_the_field_is_refused_as_prose_not_as_a_typo(self):
        message = validate_severity(
            "Unspecified (treated as blocking per the anti-laundering rule)"
        )
        assert message is not None
        assert "OMIT the key" in message

    def test_unknown_is_refused_with_the_reason_it_was_removed(self):
        message = validate_severity("unknown")
        assert message is not None
        assert "Set 134" in message
        assert "OMIT the key" in message


class TestSuggestionsAreAdvisoryOnly:
    @pytest.mark.parametrize(
        "given,expected",
        [("major", "Major"), ("HIGH", "Major"), ("nit", "Minor"),
         ("blocker", "Critical"), ("Suggestion", "Minor")],
    )
    def test_a_hint_is_offered_for_an_actionable_refusal(self, given, expected):
        assert suggest_severity(given) == expected

    @pytest.mark.parametrize("given", ["major", "HIGH", "nit", "Suggestion"])
    def test_plant_the_violation_a_hint_never_normalizes_on_the_way_to_disk(
        self, given
    ):
        # The hint exists to make a message actionable. It must never make the
        # value acceptable -- silently rewriting a verifier's "High" into
        # "Major" is laundering in the permissive direction.
        assert suggest_severity(given) is not None
        assert is_valid_severity(given) is False
        with pytest.raises(InvalidSeverityError):
            require_severity(given)

    def test_a_token_refused_for_a_stated_reason_gets_no_near_miss_hint(self):
        # 'unknown' has a real remedy (omit the key), not a near-miss.
        assert suggest_severity("unknown") is None
        assert suggest_severity("unspecified") is None


# ---------------------------------------------------------------------------
# Writer strict, reader lenient -- the property the whole fix rests on
# ---------------------------------------------------------------------------

class TestReadersStayLenient:
    """The 28 non-canonical values are already committed. Every reader must
    keep reading them exactly as it did before Set 134 S2."""

    @pytest.mark.parametrize(
        "token",
        ["unknown", "Medium", "Suggestion", "Major (claimed)",
         "Unspecified (treated as blocking per the anti-laundering rule)"],
    )
    def test_a_non_canonical_severity_still_blocks_on_read(self, token):
        assert is_blocking_issue({"severity": token}) is True

    def test_an_absent_severity_still_blocks_on_read(self):
        assert is_blocking_issue({"description": "x"}) is True

    @pytest.mark.parametrize("token", ["major", "MAJOR", " Major "])
    def test_the_reader_still_folds_case_and_whitespace(self, token):
        # Deliberate asymmetry with is_valid_severity, which refuses these.
        assert is_blocking_issue({"severity": token}) is True

    def test_an_explicit_minor_still_does_not_block(self):
        assert is_blocking_issue({"severity": "Minor"}) is False
        assert is_blocking_issue({"severity": "minor"}) is False


# ---------------------------------------------------------------------------
# The removed sentinel: one spelling per meaning
# ---------------------------------------------------------------------------

class TestUnknownSentinelRemoved:
    def test_an_unparsed_issues_found_body_omits_severity_rather_than_guessing(
        self,
    ):
        verdict, issues = parse_verification_response(
            "ISSUES FOUND\n\nthe reviewer wrote prose with no Issue markers"
        )
        assert verdict == "ISSUES_FOUND"
        assert len(issues) == 1
        assert "severity" not in issues[0], (
            "the machinery must not invent a severity token; an absent key "
            "already means 'the verifier did not say' and already blocks"
        )

    def test_the_omission_changes_no_blocking_decision(self):
        # This is the whole safety argument for the removal: both spellings
        # block, so removing one cannot change an outcome.
        _, issues = parse_verification_response(
            "ISSUES FOUND\n\nprose with no Issue markers"
        )
        assert is_blocking_issue(issues[0]) is True
        assert classify_blocking("ISSUES_FOUND", issues).blocking is True
        # ...and it is identical to what the old sentinel produced.
        assert is_blocking_issue({**issues[0], "severity": "unknown"}) is True

    def test_no_production_module_writes_the_sentinel_any_more(self):
        # Corpus scan with a non-empty assertion (L-112-1 / corpus_scan_guard):
        # a gate that matches nothing must not look like one that finds
        # nothing. Comment lines are stripped first, so the prose that
        # RECORDS the removal does not read as a violation of it.
        production = [
            p
            for p in (REPO_ROOT / "ai_router").glob("*.py")
            if p.is_file()
        ]
        assert len(production) > 20, "corpus is suspiciously small"
        offenders = []
        for path in production:
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.lstrip().startswith("#"):
                    continue
                if '"severity": "unknown"' in line:
                    offenders.append(path.name)
                    break
        assert offenders == [], (
            f"{offenders} still write the removed 'unknown' sentinel; omit "
            f"the severity key instead"
        )


# ---------------------------------------------------------------------------
# The chokepoint, at the sanctioned writer
# ---------------------------------------------------------------------------

class TestEnvelopeWriterRefusesTheTokenNotTheRound:
    """Set 134 S2 verification round 1 (Major, accepted without argument).

    An earlier draft let the writer RAISE on a non-canonical severity. That
    left the raw artifact on disk, no envelope, and no round-ledger entry --
    and because ``resolve_round`` advances on raw-artifact existence while the
    cross-round ledger reads only ``sN-issues*.json``, the next invocation
    skipped the round and a paid blocking finding vanished from the structured
    loop. The writer now refuses the TOKEN and always writes the envelope.
    """

    def _write(self, tmp_path, issues):
        path = tmp_path / "s1-issues.json"
        write_issues_artifact(
            path,
            session_number=1,
            round_number=1,
            verdict="ISSUES_FOUND",
            issues=issues,
        )
        return json.loads(path.read_text(encoding="utf-8"))

    def test_legitimate_look_alike_a_canonical_envelope_is_written(self, tmp_path):
        written = self._write(
            tmp_path, [{"description": "d", "severity": "Major"}]
        )
        assert written["issues"][0]["severity"] == "Major"

    def test_legitimate_look_alike_an_absent_severity_is_written_untouched(
        self, tmp_path
    ):
        # Absence is legal AND blocking: it is the one sanctioned spelling for
        # "the verifier did not say", so the writer must never disturb it.
        written = self._write(tmp_path, [{"description": "d"}])
        assert "severity" not in written["issues"][0]
        assert is_blocking_issue(written["issues"][0]) is True

    @pytest.mark.parametrize(
        "token",
        ["unknown", "High", "Medium", "Suggestion", "major", "MAJOR",
         " Major ", "", "Unspecified (treated as blocking per the "
         "anti-laundering rule)"],
    )
    def test_plant_the_violation_the_token_is_refused_and_the_round_survives(
        self, tmp_path, token
    ):
        written = self._write(
            tmp_path, [{"description": "d", "severity": token}]
        )
        issue = written["issues"][0]
        # The token never reaches disk...
        assert issue.get("severity") != token
        # ...the finding does, and still blocks exactly as it did before.
        assert issue["description"] == "d"
        assert is_blocking_issue(issue) is True
        assert is_blocking_issue({"severity": token}) is True

    @pytest.mark.parametrize("token", ["minor", "MINOR", " Minor "])
    def test_a_reader_nonblocking_token_keeps_its_meaning(self, tmp_path, token):
        # The ONLY value ever rewritten, and it is rewritten to its own
        # canonical spelling. Omitting it instead would silently turn a nit
        # into a blocker and lengthen the loop.
        assert is_blocking_issue({"severity": token}) is False
        written = self._write(
            tmp_path, [{"description": "d", "severity": token}]
        )
        assert written["issues"][0]["severity"] == "Minor"
        assert is_blocking_issue(written["issues"][0]) is False

    def test_the_writer_never_mutates_the_caller_s_issue_list(self, tmp_path):
        # The caller's list is the same list the round's blocking decision
        # and ledger were computed from.
        issues = [{"description": "d", "severity": "major"}]
        self._write(tmp_path, issues)
        assert issues[0]["severity"] == "major"

    def test_the_envelope_is_always_written_so_the_round_can_be_ledgered(
        self, tmp_path
    ):
        path = tmp_path / "s1-issues.json"
        write_issues_artifact(
            path, session_number=1, round_number=1, verdict="ISSUES_FOUND",
            issues=[{"description": "d", "severity": "Severity: totally bogus"}],
        )
        assert path.exists(), (
            "a refused token must never cost the envelope -- without it the "
            "round is unledgered and the next run skips it"
        )


@pytest.mark.parametrize("token", ["minor", "MINOR", " Minor "])
def test_a_reader_nonblocking_token_is_persisted_as_canonical_minor(
    tmp_path, token
):
    # The ONLY value ever rewritten, and it is rewritten to its own canonical
    # spelling. Rewriting it to nothing would silently turn a nit into a
    # blocker and lengthen the loop.
    assert is_blocking_issue({"severity": token}) is False
    path = tmp_path / "s1-issues.json"
    write_issues_artifact(
        path, session_number=1, round_number=1, verdict="ISSUES_FOUND",
        issues=[{"description": "d", "severity": token}],
    )
    issue = json.loads(path.read_text(encoding="utf-8"))["issues"][0]
    assert issue["severity"] == "Minor"
    assert is_blocking_issue(issue) is False


class TestCanonicalSeverityForWriteIsBlockingPreserving:
    """The property the whole remediation rests on: canonicalizing at the
    writer can never change whether a finding opens a round."""

    @pytest.mark.parametrize(
        "token",
        ["Critical", "Major", "Minor", "critical", "major", "minor",
         "MAJOR", " Minor ", "High", "Medium", "Suggestion", "unknown",
         "unspecified", "", "   ", "Major (claimed)",
         "Unspecified (treated as blocking per the anti-laundering rule)",
         None, 3, ["Major"]],
    )
    def test_blocking_is_identical_before_and_after(self, token):
        before = is_blocking_issue({"severity": token})
        canonical = canonical_severity_for_write(token)
        after_issue = (
            {"severity": canonical} if canonical is not None else {}
        )
        assert is_blocking_issue(after_issue) is before, (
            f"{token!r} -> {canonical!r} changed the blocking decision"
        )

    def test_the_output_is_always_canonical_or_none(self):
        for token in ["Critical", "major", "High", "unknown", "", None, 7,
                      "Unspecified (x)", "minor"]:
            out = canonical_severity_for_write(token)
            assert out is None or is_valid_severity(out)

    def test_it_never_raises(self):
        for token in [None, 3, ["x"], {"a": 1}, "", "\n\n"]:
            canonical_severity_for_write(token)


# ---------------------------------------------------------------------------
# The pull surface's tool schema
# ---------------------------------------------------------------------------

class TestSubmitVerdictSchemaIsClosed:
    def test_the_severity_property_declares_the_enum(self):
        from ai_router.pull_verifier import _verdict_tool_schema

        blob = json.dumps(_verdict_tool_schema())
        assert '"enum"' in blob, "severity must be enum-constrained"
        for token in CANONICAL_SEVERITIES:
            assert token in blob

    def test_plant_the_violation_a_removed_token_is_not_offered(self):
        from ai_router.pull_verifier import _verdict_tool_schema

        for flags in (
            {},
            {"allow_evidence": True},
            {"allow_evidence": True, "allow_template_evidence": True},
            {"allow_authored_evidence": True},
        ):
            blob = json.dumps(_verdict_tool_schema(**flags))
            assert '"Suggestion"' not in blob
            assert '"enum": ["Critical", "Major", "Minor"]' in blob


# ---------------------------------------------------------------------------
# The shipped templates
# ---------------------------------------------------------------------------

class TestShippedTemplatesOfferOnlyTheVocabulary:
    def test_no_template_offers_a_token_no_reader_knows(self):
        templates = sorted(
            (REPO_ROOT / "ai_router" / "prompt-templates").glob("*.md")
        )
        assert templates, "corpus is empty -- the scan would pass vacuously"
        for path in templates:
            text = path.read_text(encoding="utf-8")
            for line in text.splitlines():
                if "**Severity:**" not in line:
                    continue
                assert "Suggestion" not in line, (
                    f"{path.name} offers 'Suggestion' as a severity; it is "
                    f"not in {CANONICAL_SEVERITIES} and reached disk as a "
                    f"value in Set 078"
                )


# ---------------------------------------------------------------------------
# The pull surface -- Set 134 S2 verification round 1, finding 2 (Major)
# ---------------------------------------------------------------------------

class TestPullVerifierProducerIsClosedToo:
    """The tool-schema enum is a DECLARATION to the provider, not an
    enforcement. A binding that ignores it could submit anything, and
    ``_parse_verdict`` copied it straight through ``Finding.to_dict()`` onto
    disk -- so the producer surface is closed on the same terms."""

    def _parse(self, severity):
        from ai_router.pull_verifier import _parse_verdict

        return _parse_verdict(
            "openai",
            "gpt-5.5",
            {
                "verdict": "ISSUES_FOUND",
                "summary": "s",
                "findings": [
                    {"description": "off by one", "severity": severity}
                ],
            },
        )

    @pytest.mark.parametrize("token", CANONICAL_SEVERITIES)
    def test_legitimate_look_alike_a_canonical_severity_survives(self, token):
        critique = self._parse(token)
        assert critique.findings[0].severity == token
        assert critique.findings[0].to_dict()["severity"] == token

    @pytest.mark.parametrize(
        "token", ["major", "MAJOR", "High", "Medium", "Suggestion",
                  "unknown", "Major (claimed)"],
    )
    def test_plant_the_violation_a_non_canonical_severity_never_reaches_disk(
        self, token
    ):
        finding = self._parse(token).findings[0]
        emitted = finding.to_dict()
        assert emitted.get("severity") != token
        # The finding itself survives, and its blocking meaning is preserved.
        assert emitted["description"] == "off by one"
        assert is_blocking_issue(emitted) is is_blocking_issue(
            {"severity": token}
        )

    @pytest.mark.parametrize("token", ["minor", "MINOR"])
    def test_a_nonblocking_token_stays_nonblocking_in_canonical_spelling(
        self, token
    ):
        emitted = self._parse(token).findings[0].to_dict()
        assert emitted["severity"] == "Minor"
        assert is_blocking_issue(emitted) is False

    def test_the_parse_never_raises_on_a_bad_severity(self):
        # A paid agentic critique must not be discarded over a token.
        for token in ["High", "", "unknown", 7, None]:
            self._parse(token)
