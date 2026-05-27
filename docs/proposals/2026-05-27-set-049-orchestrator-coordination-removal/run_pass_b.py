"""Re-run Pass B only with a model that's actually responsive.

gpt-5-4 timed out (memory: feedback_session_verification_gpt54_429_pivot_to_gemini).
Trying gpt-5-4-mini first (still OpenAI, cheaper, less loaded). If that also
times out, fall back to a second gemini-pro pass with the devil's-advocate
framing — same-provider coverage is weaker but a working pass beats no pass.
"""
import json
from pathlib import Path

from ai_router import query

HERE = Path(__file__).parent
# Import PASS_B_FRAMING + PROPOSAL from run_audit.py to avoid drift
import sys
sys.path.insert(0, str(HERE))
from run_audit import PASS_B_FRAMING, PROPOSAL  # noqa: E402


def try_call(model: str) -> dict | None:
    prompt = PASS_B_FRAMING + "\n\n---\n\n# PROPOSAL\n\n" + PROPOSAL
    try:
        result = query(
            model=model,
            content=prompt,
            task_type="architecture",
            session_set="049-orchestrator-coordination-removal",
            session_number=1,
        )
    except Exception as exc:
        print(f"  [{model}] failed: {exc}")
        return None
    raw = json.dumps(result, default=lambda o: o.__dict__, indent=2)
    parsed = json.loads(raw)
    (HERE / f"pass-b.raw.json").write_text(raw, encoding="utf-8")
    return parsed


def main():
    for model in ["gpt-5-4-mini", "gpt-5-4", "gemini-pro"]:
        print(f"Trying Pass B with {model}...")
        parsed = try_call(model)
        if parsed is None:
            continue
        content = parsed.get("content", "")
        if not isinstance(content, str) or not content.strip():
            print(f"  [{model}] empty content; trying next")
            continue
        (HERE / "pass-b.md").write_text(content, encoding="utf-8")
        print(f"  Pass B success on {model}, cost ${parsed.get('cost_usd', '?')}")
        return
    raise SystemExit("All Pass B fallbacks failed.")


if __name__ == "__main__":
    main()
