"""Captured provider model-list responses for the Set 109 S1 tests.

Every payload below is a VERBATIM subset of a real response, captured from the
live endpoints on 2026-08-04 during Set 109 Session 1. Entries were dropped to
keep the fixture readable; no field was reshaped, renamed, or invented, so a
parser that passes against these passes against the wire format the router
actually meets. The two ``*_PAGE_1``/``*_PAGE_2`` pairs are the exception and
say so: those providers' catalogs fit in one page today, so the multi-page
shapes are constructed from the documented cursor fields.

Shared with the tests by bare-filename import, matching ``stamp_fixtures.py``.
"""

# ---------------------------------------------------------------------------
# OpenAI — GET /v1/models. One page, no cursor field of any kind.
# The three gpt-5.6 variants are here and bare `gpt-5.6` is NOT: that absence
# is the specimen the drift gate exists to catch.
# ---------------------------------------------------------------------------

OPENAI_MODELS_PAGE = {
    "object": "list",
    "data": [
        {"id": "text-embedding-3-small", "object": "model",
         "created": 1705948997, "owned_by": "system"},
        {"id": "gpt-5.4", "object": "model",
         "created": 1772691852, "owned_by": "system"},
        {"id": "gpt-5.4-mini", "object": "model",
         "created": 1773451123, "owned_by": "system"},
        {"id": "gpt-5.5", "object": "model",
         "created": 1776824847, "owned_by": "system"},
        {"id": "gpt-5.6-sol", "object": "model",
         "created": 1782228018, "owned_by": "system"},
        {"id": "gpt-5.6-terra", "object": "model",
         "created": 1782228459, "owned_by": "system"},
        {"id": "gpt-5.6-luna", "object": "model",
         "created": 1782228658, "owned_by": "system"},
    ],
}

# ---------------------------------------------------------------------------
# Anthropic — GET /v1/models. Cursor-paginated: `has_more` plus `last_id`,
# with the next request passing `after_id`. The live catalog returned
# has_more=false in one page; the two-page pair below is constructed.
# ---------------------------------------------------------------------------

ANTHROPIC_MODELS_PAGE = {
    "data": [
        {"type": "model", "id": "claude-opus-5",
         "display_name": "Claude Opus 5", "created_at": "2026-07-24T00:00:00Z"},
        {"type": "model", "id": "claude-sonnet-5",
         "display_name": "Claude Sonnet 5", "created_at": "2026-06-29T00:00:00Z"},
        {"type": "model", "id": "claude-fable-5",
         "display_name": "Claude Fable 5", "created_at": "2026-06-07T00:00:00Z"},
        {"type": "model", "id": "claude-opus-4-8",
         "display_name": "Claude Opus 4.8", "created_at": "2026-04-30T00:00:00Z"},
        {"type": "model", "id": "claude-sonnet-4-6",
         "display_name": "Claude Sonnet 4.6", "created_at": "2026-02-05T00:00:00Z"},
    ],
    "has_more": False,
    "first_id": "claude-opus-5",
    "last_id": "claude-sonnet-4-6",
}

ANTHROPIC_MODELS_PAGE_1 = {
    "data": [
        {"type": "model", "id": "claude-opus-5",
         "display_name": "Claude Opus 5", "created_at": "2026-07-24T00:00:00Z"},
    ],
    "has_more": True,
    "first_id": "claude-opus-5",
    "last_id": "claude-opus-5",
}

ANTHROPIC_MODELS_PAGE_2 = {
    "data": [
        {"type": "model", "id": "claude-sonnet-4-6",
         "display_name": "Claude Sonnet 4.6", "created_at": "2026-02-05T00:00:00Z"},
    ],
    "has_more": False,
    "first_id": "claude-sonnet-4-6",
    "last_id": "claude-sonnet-4-6",
}

# ---------------------------------------------------------------------------
# Google — GET /v1beta/models. Every `name` carries a `models/` prefix that the
# router never sends on the wire; `nextPageToken` drives pagination.
# ---------------------------------------------------------------------------

GOOGLE_MODELS_PAGE = {
    "models": [
        {"name": "models/gemini-2.5-flash", "version": "001",
         "displayName": "Gemini 2.5 Flash", "inputTokenLimit": 1048576,
         "outputTokenLimit": 65536,
         "supportedGenerationMethods": ["generateContent", "countTokens"]},
        {"name": "models/gemini-2.5-pro", "version": "2.5",
         "displayName": "Gemini 2.5 Pro", "inputTokenLimit": 1048576,
         "outputTokenLimit": 65536,
         "supportedGenerationMethods": ["generateContent", "countTokens"]},
        {"name": "models/gemini-3.1-pro-preview",
         "version": "3.1-pro-preview-01-2026",
         "displayName": "Gemini 3.1 Pro Preview", "inputTokenLimit": 1048576,
         "outputTokenLimit": 65536,
         "supportedGenerationMethods": ["generateContent", "countTokens"]},
    ],
}

GOOGLE_MODELS_PAGE_1 = {
    "models": [
        {"name": "models/gemini-2.5-flash", "version": "001",
         "displayName": "Gemini 2.5 Flash"},
    ],
    "nextPageToken": "page-2-token",
}

GOOGLE_MODELS_PAGE_2 = {
    "models": [
        {"name": "models/gemini-2.5-pro", "version": "2.5",
         "displayName": "Gemini 2.5 Pro"},
    ],
}

# ---------------------------------------------------------------------------
# Completion-response fragments, for the served-model tests. Trimmed captures
# from the same 2026-08-04 probe. The OpenAI one is the important specimen:
# a plain `gpt-5.4-mini` request came back served as a DATED SNAPSHOT, so a
# requested-vs-served difference is routine on that provider, not an alarm.
# ---------------------------------------------------------------------------

ANTHROPIC_MESSAGE_RESPONSE = {
    "model": "claude-sonnet-4-6",
    "id": "msg_fixture",
    "type": "message",
    "role": "assistant",
    "content": [{"type": "text", "text": "OK"}],
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 9, "output_tokens": 3},
}

GOOGLE_GENERATE_RESPONSE = {
    "candidates": [
        {"content": {"parts": [{"text": "OK"}]}, "finishReason": "STOP"},
    ],
    "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 2},
    "modelVersion": "gemini-2.5-pro",
    "responseId": "fixture-response-id",
}

OPENAI_RESPONSES_RESPONSE = {
    "id": "resp_fixture",
    "object": "response",
    "status": "completed",
    "model": "gpt-5.4-mini-2026-03-17",
    "output_text": "OK",
    "usage": {"input_tokens": 7, "output_tokens": 2},
}
