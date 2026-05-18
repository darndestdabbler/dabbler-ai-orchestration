"""Route Set 029 Session 3 verification — Round A (writer + schema doc).

Round A scope: writer source + marker-schema doc + Q1-Q4 prompt.
Round B (separate script) covers the reader, SessionSetsModel, and
SessionSetsProvider. Splitting per memory
`feedback_split_large_verification_bundles` after the single-round
bundle hit gpt-5-4 429.

Per memory `feedback_ai_router_route_result_handling`, the RouteResult
is dumped to JSON before any field is read.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[4]
sys.path.insert(0, str(REPO_ROOT))

import ai_router  # noqa: E402


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    prompt_text = _read(HERE / "prompt-round-a.md")

    ext_root = REPO_ROOT / "tools" / "dabbler-ai-orchestration"
    writer_src = _read(ext_root / "scripts" / "write-orchestrator-marker.js")
    schema_doc = _read(REPO_ROOT / "docs" / "orchestrator-marker-schema.md")

    full_content = (
        prompt_text
        + "\n\n---\n\n## File 1: scripts/write-orchestrator-marker.js\n\n"
        + "```javascript\n" + writer_src + "\n```\n"
        + "\n---\n\n## File 2: docs/orchestrator-marker-schema.md\n\n"
        + schema_doc + "\n"
    )

    rendered_path = HERE / "prompt-round-a.rendered.md"
    rendered_path.write_text(full_content, encoding="utf-8")
    print(f"Round A prompt size: {len(full_content):,} chars / "
          f"~{full_content.count(chr(10)):,} lines")

    spec_path = (
        REPO_ROOT
        / "docs"
        / "session-sets"
        / "029-orchestrator-model-effort-gauges"
        / "spec.md"
    )
    # Pinned to gemini-pro after gpt-5-4 hit 429 twice in a row on
    # the OpenAI Responses endpoint. Cross-provider verification is
    # satisfied by Gemini Pro (separate provider from the Claude
    # orchestrator). Memory `feedback_split_large_verification_bundles`
    # documents this as the standard escape hatch when gpt-5-4 is
    # rate-limited.
    result = ai_router.query(
        model="gemini-pro",
        content=full_content,
        task_type="session-verification",
        session_set=str(spec_path.parent),
        session_number=3,
    )

    if dataclasses.is_dataclass(result):
        result_dict = dataclasses.asdict(result)
    else:
        result_dict = {
            "content": getattr(result, "content", None),
            "model_name": getattr(result, "model_name", None),
            "model_id": getattr(result, "model_id", None),
            "tier": getattr(result, "tier", None),
            "input_tokens": getattr(result, "input_tokens", None),
            "output_tokens": getattr(result, "output_tokens", None),
            "cost_usd": getattr(result, "cost_usd", None),
            "total_cost_usd": getattr(result, "total_cost_usd", None),
            "elapsed_seconds": getattr(result, "elapsed_seconds", None),
        }

    out_path = HERE / "verify-result-round-a.json"
    out_path.write_text(
        json.dumps(result_dict, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )

    cost = result_dict.get("total_cost_usd") or result_dict.get("cost_usd")
    print(f"verifier model: {result_dict.get('model_name')}")
    print(f"cost: ${cost}")
    print(f"input tokens:  {result_dict.get('input_tokens')}")
    print(f"output tokens: {result_dict.get('output_tokens')}")
    print(f"dumped to: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
