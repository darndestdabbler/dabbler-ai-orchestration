"""Set 065 S2 spike: a minimal FIRST-PARTY tool-loop critique adapter.

Demonstrates the third integration option from the spec: path-awareness as a
`route()`-style agentic loop we build ourselves, with a *deterministic servant*
(returns raw ground truth -- bytes / grep output / dir listing -- never a
model-summarized view). Metered BYOK via ANTHROPIC_API_KEY.

NOT production code. Single file, no router dependency, ~150 lines. Run:
    .venv/Scripts/python.exe spike_first_party_adapter.py <sandbox_dir> <prompt_file> <out_prefix>
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

MODEL = "claude-sonnet-4-6"
INPUT_PER_1M = 3.00
OUTPUT_PER_1M = 15.00
MAX_TURNS = 12

TOOLS = [
    {"name": "read_file", "description": "Read a file's full raw text.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "grep", "description": "Regex-search files under a path; returns raw matching lines.",
     "input_schema": {"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}}, "required": ["pattern"]}},
    {"name": "list_dir", "description": "List files under a directory.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
]


def _safe(sandbox: Path, p: str) -> Path:
    """Confine every tool to the sandbox -- read-only path discipline."""
    target = (sandbox / p).resolve() if not os.path.isabs(p) else Path(p).resolve()
    if sandbox.resolve() not in target.parents and target != sandbox.resolve():
        raise ValueError(f"path escapes sandbox: {p}")
    return target


# --- Deterministic servant: raw ground truth only, no summarization. ---
def run_tool(name, args, sandbox: Path) -> str:
    try:
        if name == "read_file":
            return _safe(sandbox, args["path"]).read_text(encoding="utf-8", errors="replace")
        if name == "list_dir":
            d = _safe(sandbox, args.get("path", "."))
            return "\n".join(sorted(x.name for x in d.iterdir()))
        if name == "grep":
            root = _safe(sandbox, args.get("path", "."))
            files = [root] if root.is_file() else [f for f in root.rglob("*") if f.is_file()]
            pat = re.compile(args["pattern"])
            out = []
            for f in files:
                for i, ln in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                    if pat.search(ln):
                        out.append(f"{f.name}:{i}:{ln}")
            return "\n".join(out) or "(no matches)"
    except Exception as e:  # servant surfaces errors as raw text, never hides them
        return f"ERROR: {e}"
    return f"ERROR: unknown tool {name}"


def main():
    sandbox = Path(sys.argv[1]).resolve()
    prompt = Path(sys.argv[2]).read_text(encoding="utf-8")
    out_prefix = sys.argv[3]
    key = os.environ["ANTHROPIC_API_KEY"]

    messages = [{"role": "user", "content": prompt}]
    trace = {"tool_calls": [], "api_calls": [], "model": MODEL}
    t0 = time.time()
    in_tok = out_tok = 0

    with httpx.Client(timeout=120) as client:
        for turn in range(MAX_TURNS):
            r = client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": MODEL, "max_tokens": 4096, "tools": TOOLS, "messages": messages},
            )
            r.raise_for_status()
            data = r.json()
            u = data.get("usage", {})
            in_tok += u.get("input_tokens", 0)
            out_tok += u.get("output_tokens", 0)
            trace["api_calls"].append({"turn": turn, "stop_reason": data.get("stop_reason"), "usage": u})
            messages.append({"role": "assistant", "content": data["content"]})

            tool_uses = [b for b in data["content"] if b.get("type") == "tool_use"]
            if not tool_uses:
                final = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
                trace["final_text"] = final
                break
            results = []
            for tu in tool_uses:
                trace["tool_calls"].append({"name": tu["name"], "input": tu["input"]})
                results.append({"type": "tool_result", "tool_use_id": tu["id"],
                                "content": run_tool(tu["name"], tu["input"], sandbox)})
            messages.append({"role": "user", "content": results})

    cost = in_tok / 1e6 * INPUT_PER_1M + out_tok / 1e6 * OUTPUT_PER_1M
    trace["summary"] = {
        "wall_s": round(time.time() - t0, 1),
        "input_tokens": in_tok, "output_tokens": out_tok,
        "metered_cost_usd": round(cost, 5),
        "tool_call_count": len(trace["tool_calls"]),
        "tool_names": [t["name"] for t in trace["tool_calls"]],
    }
    Path(f"{out_prefix}.json").write_text(json.dumps(trace, indent=2), encoding="utf-8")
    print(json.dumps(trace["summary"], indent=2))
    print("\nFINAL:\n", trace.get("final_text", "")[-1500:])


if __name__ == "__main__":
    main()
