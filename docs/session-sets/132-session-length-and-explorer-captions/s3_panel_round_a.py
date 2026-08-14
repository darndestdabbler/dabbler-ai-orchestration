"""Round A of the Set 132 S3 causal-design panel.

Two distinct providers, anthropic excluded (the orchestrator's own provider,
so the advice cannot be self-interested). Raw responses are written to
sN-panel-round-a-<provider>.md and never edited afterwards.
"""
import pathlib
import sys

from ai_router import route

SET_DIR = "docs/session-sets/132-session-length-and-explorer-captions"
PROMPT = pathlib.Path(SET_DIR, "s3-panel-prompt-round-a.md").read_text(encoding="utf-8")

PANEL = [("gpt-5-5", "openai"), ("gemini-3-1-pro", "google")]

for alias, provider in PANEL:
    out = pathlib.Path(SET_DIR, f"s3-panel-round-a-{provider}.md")
    if out.exists():
        print(f"[skip] {out} already exists")
        continue
    print(f"[route] {alias} ({provider}) ...", flush=True)
    result = route(
        content=PROMPT,
        task_type="architecture",
        context=(
            "Repo: dabbler-ai-orchestration. You are advisor "
            f"{provider} on a two-provider panel. Attack the design."
        ),
        session_set=SET_DIR,
        session_number=3,
        exclude_providers=["anthropic"],
        prefer_model=alias,
    )
    body = result.content or ""
    out.write_text(
        f"<!-- routed: task_type=architecture, prefer_model={alias}, "
        f"exclude_providers=['anthropic']; served by "
        f"{getattr(result, 'model', '?')} "
        f"({getattr(result, 'provider', '?')}). Raw, never edited. -->\n\n"
        + body,
        encoding="utf-8",
    )
    print(
        f"[done] {alias} -> served by {getattr(result, 'model', '?')} "
        f"({getattr(result, 'provider', '?')}), {len(body)} chars -> {out}",
        flush=True,
    )

print("round A complete")
sys.exit(0)
