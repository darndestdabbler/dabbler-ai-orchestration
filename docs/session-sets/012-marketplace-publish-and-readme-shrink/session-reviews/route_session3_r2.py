"""Round 2 verification routing script for Set 012 Session 3.

Same defensive shape as the prior route scripts: dump RouteResult to
JSON BEFORE any attribute access.
"""
import json
import sys
import dataclasses
from pathlib import Path

REVIEW_DIR = Path(__file__).resolve().parent
PROMPT = (REVIEW_DIR / "session-003-prompt-r2.md").read_text(encoding="utf-8")
RAW_DUMP = REVIEW_DIR / "session-003-r2-raw.json"
OUTPUT_MD = REVIEW_DIR / "session-003-r2.md"

_REPO_ROOT = REVIEW_DIR.parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _to_dict(obj):
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
        session_set="docs/session-sets/012-marketplace-publish-and-readme-shrink",
        session_number=3,
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
