"""Route the per-workspace orchestrator marker design proposal
through GPT-5.4 + Gemini Pro for cross-provider consensus.

Per memory `feedback_prefer_ai_consensus_over_human_prompt`: design
judgment calls route through GPT-5.4 + Gemini Pro before any
substantive implementation work. Operator explicitly authorized
this call 2026-05-18 for Set 029 Session 3 scope expansion
(per-workspace markers).

Per memory `feedback_ai_router_route_result_handling`: RouteResult
is dumped to JSON before any attribute access.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# proposal dir -> proposals -> docs -> repo
REPO_ROOT = HERE.parents[2]
sys.path.insert(0, str(REPO_ROOT))

import ai_router  # noqa: E402


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _dump_result(result, out_path: Path) -> dict:
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
    out_path.write_text(
        json.dumps(result_dict, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    return result_dict


def main() -> int:
    proposal_text = _read(HERE / "proposal.md")

    full_content_template = (
        "# Cross-provider review request: per-workspace orchestrator markers\n\n"
        "You are one of two reviewers (the other is __OTHER__). Review the "
        "design proposal below and give your independent verdict on each "
        "of the nine open questions plus an overall recommendation. "
        "Structured response per question — verdict + reasoning + any "
        "must-fix items. The operator wants three-way agreement before "
        "this is formalized in spec.md for Session 3.\n\n"
        "---\n\n"
        + proposal_text
    )

    spec_path = (
        REPO_ROOT
        / "docs"
        / "session-sets"
        / "029-orchestrator-model-effort-gauges"
        / "spec.md"
    )

    # GPT-5.4
    gpt_content = full_content_template.replace("__OTHER__", "Gemini Pro")
    print(f"GPT-5.4 prompt size: {len(gpt_content):,} chars")
    gpt_result = ai_router.query(
        model="gpt-5-4",
        content=gpt_content,
        task_type="cross-provider-audit",
        session_set=str(spec_path.parent),
        session_number=3,
    )
    gpt_dict = _dump_result(gpt_result, HERE / "consensus-gpt-5-4.json")
    gpt_cost = gpt_dict.get("total_cost_usd") or gpt_dict.get("cost_usd")
    print(f"GPT-5.4: cost ${gpt_cost} / {gpt_dict.get('input_tokens')} in / {gpt_dict.get('output_tokens')} out")

    # Gemini Pro
    gemini_content = full_content_template.replace("__OTHER__", "GPT-5.4")
    print(f"Gemini Pro prompt size: {len(gemini_content):,} chars")
    gemini_result = ai_router.query(
        model="gemini-pro",
        content=gemini_content,
        task_type="cross-provider-audit",
        session_set=str(spec_path.parent),
        session_number=3,
    )
    gemini_dict = _dump_result(gemini_result, HERE / "consensus-gemini-pro.json")
    gemini_cost = gemini_dict.get("total_cost_usd") or gemini_dict.get("cost_usd")
    print(f"Gemini Pro: cost ${gemini_cost} / {gemini_dict.get('input_tokens')} in / {gemini_dict.get('output_tokens')} out")

    total = (gpt_cost or 0) + (gemini_cost or 0)
    print(f"Total consensus call cost: ${total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
