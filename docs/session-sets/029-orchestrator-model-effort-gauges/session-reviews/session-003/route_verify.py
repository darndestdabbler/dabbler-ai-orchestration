"""Route Set 029 Session 3 verification — single round.

Bundles: writer source, reader source (focused excerpts), the
SessionSetsModel extraction, plus the marker schema doc and a Playwright
scenario summary. Targets ~1200 LOC total — slightly above the 700 LOC
soft ceiling memory `feedback_split_large_verification_bundles` flags,
but tightly scoped to one concern (S3 per-session-set identity).
If the verifier 429s or returns truncated, split into Round A (writer +
schema doc + tests) and Round B (reader + model + provider).

Per memory `feedback_ai_router_route_result_handling`, the RouteResult
is dumped to JSON before any field is read.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# session-003 -> session-reviews -> 029-... -> session-sets -> docs -> repo
REPO_ROOT = HERE.parents[4]
sys.path.insert(0, str(REPO_ROOT))

import ai_router  # noqa: E402


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    prompt_text = _read(HERE / "prompt.md")

    ext_root = REPO_ROOT / "tools" / "dabbler-ai-orchestration"
    writer_src = _read(ext_root / "scripts" / "write-orchestrator-marker.js")
    reader_src = _read(ext_root / "src" / "providers" / "orchestratorIndicatorProvider.ts")
    model_src = _read(ext_root / "src" / "providers" / "SessionSetsModel.ts")
    provider_src = _read(ext_root / "src" / "providers" / "SessionSetsProvider.ts")
    schema_doc = _read(REPO_ROOT / "docs" / "orchestrator-marker-schema.md")
    changelog = _read(ext_root / "CHANGELOG.md")
    # Bound the changelog excerpt to the [0.15.0] section + a little
    # context. Full file is ~1500 lines.
    changelog_excerpt = changelog.split("## [0.14.2]")[0]

    full_content = (
        prompt_text
        + "\n\n---\n\n## File 1: scripts/write-orchestrator-marker.js\n\n"
        + "```javascript\n" + writer_src + "\n```\n"
        + "\n---\n\n## File 2: src/providers/orchestratorIndicatorProvider.ts (full)\n\n"
        + "```typescript\n" + reader_src + "\n```\n"
        + "\n---\n\n## File 3: src/providers/SessionSetsModel.ts (new)\n\n"
        + "```typescript\n" + model_src + "\n```\n"
        + "\n---\n\n## File 4: src/providers/SessionSetsProvider.ts (refactored)\n\n"
        + "```typescript\n" + provider_src + "\n```\n"
        + "\n---\n\n## File 5: docs/orchestrator-marker-schema.md (new)\n\n"
        + schema_doc + "\n"
        + "\n---\n\n## File 6: CHANGELOG.md ([0.15.0] section + unreleased)\n\n"
        + changelog_excerpt + "\n"
    )

    rendered_path = HERE / "prompt.rendered.md"
    rendered_path.write_text(full_content, encoding="utf-8")
    print(f"rendered prompt size: {len(full_content):,} chars / "
          f"~{full_content.count(chr(10)):,} lines")

    spec_path = (
        REPO_ROOT
        / "docs"
        / "session-sets"
        / "029-orchestrator-model-effort-gauges"
        / "spec.md"
    )
    result = ai_router.query(
        model="gpt-5-4",
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

    out_path = HERE / "verify-result.json"
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
