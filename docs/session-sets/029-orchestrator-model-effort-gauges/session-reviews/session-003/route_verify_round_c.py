"""Route Set 029 Session 3 verification — Round C (Round-B fix confirmation).

Round B returned MUST-FIX (3). All three fixes were applied to
`src/providers/orchestratorIndicatorProvider.ts`. Round C bundles
ONLY the reader source for a tight re-verification of F1/F2/F3.
Pinned to gemini-pro per Round A/B precedent.
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
    prompt_text = _read(HERE / "prompt-round-c.md")

    ext_root = REPO_ROOT / "tools" / "dabbler-ai-orchestration"
    reader_src = _read(ext_root / "src" / "providers" / "orchestratorIndicatorProvider.ts")

    full_content = (
        prompt_text
        + "\n\n---\n\n## File 1: src/providers/orchestratorIndicatorProvider.ts (post-fix)\n\n"
        + "```typescript\n" + reader_src + "\n```\n"
    )

    rendered_path = HERE / "prompt-round-c.rendered.md"
    rendered_path.write_text(full_content, encoding="utf-8")
    print(f"Round C prompt size: {len(full_content):,} chars / "
          f"~{full_content.count(chr(10)):,} lines")

    spec_path = (
        REPO_ROOT
        / "docs"
        / "session-sets"
        / "029-orchestrator-model-effort-gauges"
        / "spec.md"
    )
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

    out_path = HERE / "verify-result-round-c.json"
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
