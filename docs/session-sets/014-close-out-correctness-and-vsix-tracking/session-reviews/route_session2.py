"""One-off verification routing script for Set 014 Session 2.

Defensive against the wrapper-crash pattern documented in
feedback_ai_router_route_result_handling memory: dumps the entire
RouteResult to JSON BEFORE any attribute access, so a follow-up
attribute-name mismatch cannot lose the verifier's response.
"""
import json
import sys
import dataclasses
from pathlib import Path

REVIEW_DIR = Path(__file__).resolve().parent
PROMPT = (REVIEW_DIR / "session-002-prompt.md").read_text(encoding="utf-8")
RAW_DUMP = REVIEW_DIR / "session-002-raw.json"
OUTPUT_MD = REVIEW_DIR / "session-002.md"


def _to_dict(obj):
    """Best-effort conversion of any object to a JSON-serializable dict.

    Dataclass-aware; falls back to vars() then to repr().
    """
    if obj is None:
        return None
    if dataclasses.is_dataclass(obj):
        return {f.name: _to_dict(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, dict):
        return {k: _to_dict(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_dict(x) for x in obj]
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if hasattr(obj, "__dict__"):
        try:
            return {k: _to_dict(v) for k, v in vars(obj).items()}
        except Exception:
            return repr(obj)
    return repr(obj)


def main():
    from ai_router import route

    result = route(
        content=PROMPT,
        task_type="session-verification",
        session_set="docs/session-sets/014-close-out-correctness-and-vsix-tracking",
        session_number=2,
    )

    dump = _to_dict(result)
    RAW_DUMP.write_text(json.dumps(dump, indent=2, default=str), encoding="utf-8")
    print(f"Raw RouteResult dumped to: {RAW_DUMP}")

    keys = sorted(dump.keys()) if isinstance(dump, dict) else []
    print(f"Top-level fields: {keys}")

    response_field = None
    for candidate in ("response", "content", "text", "output", "completion"):
        if isinstance(dump, dict) and candidate in dump and isinstance(dump[candidate], str):
            response_field = candidate
            break

    cost_field = None
    for candidate in ("total_cost_usd", "cost_usd", "cost", "total_cost"):
        if isinstance(dump, dict) and candidate in dump:
            cost_field = candidate
            break

    if response_field:
        OUTPUT_MD.write_text(dump[response_field], encoding="utf-8")
        print(f"Verifier response written to: {OUTPUT_MD}")
    else:
        print("No response field found in RouteResult — inspect the JSON dump.")

    if cost_field:
        print(f"Cost ({cost_field}): ${dump[cost_field]}")
    else:
        print("No cost field found — inspect the JSON dump.")


if __name__ == "__main__":
    main()
