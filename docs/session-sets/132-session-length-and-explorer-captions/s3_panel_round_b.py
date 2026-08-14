"""Round B of the Set 132 S3 causal-design panel: adversarial cross-critique.

Each advisor sees both round-A answers (anonymised as A and B) and is asked
to attack, to resolve the four live disagreements, and to react to the
observational probe that was run between rounds. Raw responses are written
to s3-panel-round-b-<provider>.md and never edited afterwards.
"""
import pathlib
import re

from ai_router import route

SET_DIR = pathlib.Path("docs/session-sets/132-session-length-and-explorer-captions")
TEMPLATE = (SET_DIR / "s3-panel-prompt-round-b.md").read_text(encoding="utf-8")


def strip_header(text):
    return re.sub(r"^<!--.*?-->\s*", "", text, count=1, flags=re.S).strip()


A = strip_header((SET_DIR / "s3-panel-round-a-openai.md").read_text(encoding="utf-8"))
B = strip_header((SET_DIR / "s3-panel-round-a-google.md").read_text(encoding="utf-8"))
PROMPT = TEMPLATE.replace("{{A}}", A).replace("{{B}}", B)

PANEL = [("gpt-5-5", "openai"), ("gemini-3-1-pro", "google")]

for alias, provider in PANEL:
    out = SET_DIR / f"s3-panel-round-b-{provider}.md"
    if out.exists():
        print(f"[skip] {out} already exists")
        continue
    print(f"[route] {alias} ({provider}) ...", flush=True)
    result = route(
        content=PROMPT,
        task_type="architecture",
        context=(
            f"Repo: dabbler-ai-orchestration. You are advisor {provider} in "
            "round B of a two-provider panel. Attack, then commit to a side."
        ),
        session_set=str(SET_DIR),
        session_number=3,
        exclude_providers=["anthropic"],
        prefer_model=alias,
    )
    body = result.content or ""
    out.write_text(
        f"<!-- routed: task_type=architecture, prefer_model={alias}, "
        f"exclude_providers=['anthropic']; served by {result.model_name} "
        f"({result.model_id}), tier {result.tier}, truncated={result.truncated}, "
        f"${result.total_cost_usd:.4f}, {result.elapsed_seconds:.0f}s. "
        "Raw, never edited. -->\n\n" + body,
        encoding="utf-8",
    )
    print(
        f"[done] {alias} -> {result.model_name}/{result.model_id} "
        f"truncated={result.truncated} ${result.total_cost_usd:.4f} "
        f"{len(body)} chars -> {out}",
        flush=True,
    )

print("round B complete")
