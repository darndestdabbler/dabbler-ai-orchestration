from ai_router.route import (
    classify_escalation_reason,
    detect_truncation,
    should_escalate,
)
from ai_router.transports.base import APIResult


def _result(content="a fine, sufficiently long answer " * 4,
            output_tokens=100, stop_reason="end_turn"):
    return APIResult(
        content=content, input_tokens=10, output_tokens=output_tokens,
        stop_reason=stop_reason,
    )


def _cfg(base_config):
    return base_config["escalation"]


class TestShouldEscalate:
    def test_healthy_response_does_not_escalate(self, base_config):
        assert not should_escalate(_result(), _cfg(base_config))

    def test_empty_response_escalates(self, base_config):
        assert should_escalate(_result(content="  \n"), _cfg(base_config))

    def test_max_tokens_escalates(self, base_config):
        assert should_escalate(
            _result(stop_reason="max_tokens"), _cfg(base_config)
        )

    def test_short_response_escalates(self, base_config):
        assert should_escalate(_result(output_tokens=5), _cfg(base_config))

    def test_unreported_token_count_with_content_does_not_escalate(
        self, base_config
    ):
        # The Copilot CLI can omit the count; unmeasured is not "short".
        assert not should_escalate(_result(output_tokens=0), _cfg(base_config))

    def test_refusal_phrase_escalates(self, base_config):
        assert should_escalate(
            _result(content="I can't help with that request here today, sorry"),
            _cfg(base_config),
        )


class TestClassifyEscalationReason:
    def test_reasons(self, base_config):
        cfg = _cfg(base_config)
        assert classify_escalation_reason(_result(content=""), cfg) == "empty_response"
        assert classify_escalation_reason(
            _result(stop_reason="max_tokens"), cfg
        ) == "truncated"
        assert classify_escalation_reason(
            _result(output_tokens=3), cfg
        ) == "too_short"
        assert classify_escalation_reason(
            _result(content="i'm unable to comply with this " * 3), cfg
        ) == "refusal"


class TestDetectTruncation:
    def test_max_tokens_is_authoritative(self):
        assert detect_truncation("complete text.", "max_tokens")

    def test_unclosed_code_fence_flags(self):
        assert detect_truncation("```python\nprint(1)", "end_turn")

    def test_brace_imbalance_flags(self):
        assert detect_truncation('var sql = {"SELECT Reports', "end_turn")

    def test_prose_about_braces_that_ends_cleanly_is_not_truncation(self):
        # A complete review of brace-matching code: unbalanced braces in
        # prose, but it stops at a full sentence.
        assert not detect_truncation(
            "`_opens_a_body` treats any `{` following `):` as a body, but "
            "the file has an inline object return type `{ path: string } "
            "before the real body, so the body is not elided.",
            "end_turn",
        )

    def test_clean_prose_passes(self):
        assert not detect_truncation("All good (really).", "end_turn")

    def test_empty_content_is_not_truncation(self):
        assert not detect_truncation("", "end_turn")
