"""Routed cross-provider verification for Set 047 Session 2.

Bundles the reader-first phase implementation (Python shim, TS shim,
TS reader routing, tests, perf benchmark) into a single
session-verification call and persists the verifier's verdict +
write-up to disk for the close-out attestation.

Per memory ``feedback_session_verification_gpt54_429_pivot_to_gemini``:
prior sessions hit sustained 429s on gpt-5-4 for verification calls;
this script uses ``task_type='session-verification'`` so the router's
tier-routing config picks the configured verifier (gpt-5-4 per
router-config.yaml, with retry fall-throughs).

Per memory ``feedback_ai_router_route_result_handling``: dump the
RouteResult to JSON before any attribute access so a router shape
surprise does not crash the wrapper and lose the verification spend.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from ai_router import route  # type: ignore  # noqa: E402


SESSION_DIR = Path(__file__).resolve().parent

PROMPT_FILE = SESSION_DIR / "s2-verification-prompt.md"

# Files bundled into the verification payload, in the order the
# verifier should review them.
BUNDLE_FILES = [
    "ai_router/progress.py",
    "tools/dabbler-ai-orchestration/src/utils/progress.ts",
    "tools/dabbler-ai-orchestration/src/utils/fileSystem.ts",
    "ai_router/tests/test_normalize_v4_shape.py",
    "tools/dabbler-ai-orchestration/src/test/suite/normalizeV4Shape.test.ts",
    "tools/dabbler-ai-orchestration/src/test/suite/readSessionSetsPerfBenchmark.test.ts",
]


def build_payload() -> str:
    prompt = PROMPT_FILE.read_text(encoding="utf-8")
    chunks = [prompt, "\n\n---\n\n# Files bundled for review\n"]
    for rel in BUNDLE_FILES:
        path = REPO_ROOT / rel
        if not path.is_file():
            chunks.append(f"\n## {rel}\n\n_NOT FOUND_\n")
            continue
        chunks.append(f"\n## `{rel}`\n\n```\n")
        chunks.append(path.read_text(encoding="utf-8"))
        chunks.append("\n```\n")
    return "".join(chunks)


def main() -> int:
    payload = build_payload()
    payload_chars = len(payload)
    print(f"[verify] payload: {payload_chars} chars", flush=True)

    t0 = time.time()
    result = route(
        content=payload,
        task_type="session-verification",
        session_set="047-state-file-schema-v4-audit",
        session_number=2,
        # Conservative: don't auto-verify the verifier output.
        # Cross-provider on a single call is enough here — the changes
        # are pure-function refactors with strong unit-test coverage.
    )
    dt = time.time() - t0

    # Per feedback memory: dump RouteResult to JSON before attribute
    # access so a wrapper-shape surprise doesn't crash us. The right
    # field names are `content` / `model_name` / `model_id` / `tier`
    # / `input_tokens` / `output_tokens` / `cost_usd` —
    # NOT `text`/`model`/`provider`/`tokens_in`/`tokens_out`.
    result_dict: dict = {}
    for attr in (
        "content",
        "model_name",
        "model_id",
        "tier",
        "input_tokens",
        "output_tokens",
        "cost_usd",
        "total_cost_usd",
        "complexity_score",
        "escalated",
        "elapsed_seconds",
        "truncated",
    ):
        try:
            result_dict[attr] = getattr(result, attr, None)
        except Exception as exc:
            result_dict[attr] = f"<accessor error: {exc}>"

    out_path = SESSION_DIR / "s2-verification-result.json"
    out_path.write_text(
        json.dumps(
            {
                "elapsed_sec": dt,
                "payload_chars": payload_chars,
                "result": {
                    k: v for k, v in result_dict.items() if k != "content"
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    transcript_path = SESSION_DIR / "s2-verification-transcript.md"
    transcript_path.write_text(
        result_dict.get("content") or "<no content returned>",
        encoding="utf-8",
    )

    print(
        f"[verify] done in {dt:.1f}s — "
        f"cost ${result_dict.get('cost_usd')} on "
        f"{result_dict.get('model_name')} (tier {result_dict.get('tier')})",
        flush=True,
    )
    print(f"[verify] transcript: {transcript_path}", flush=True)
    print(f"[verify] result meta: {out_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
