"""The google half of the Set 132 S3 panel, dispatched correctly.

Why this file exists: the first attempt pinned providers with ``prefer_model``,
which ``route()`` honours on the **api** transport and silently DROPS on
``copilot-cli`` -- ``_route_via_copilot_cli`` does not take the parameter at
all, because that profile resolves exactly one generator ROLE from the seat
catalog rather than walking a tier ladder. All four of the first attempt's
generations were therefore served by gpt-5.5, and the two files naming google
have been relabelled ``-openai-sample-2``.

The sanctioned lever on this transport is ``exclude_providers``, which the
copilot-cli path DOES apply, against the catalog's confirmed entries:

    exclude []                        -> claude-sonnet-4.6 (anthropic)
    exclude [anthropic]               -> gpt-5.5           (openai)
    exclude [anthropic, openai]       -> gemini-3.1-pro-preview (google)

anthropic is excluded because it is the orchestrator's own provider; openai
because it already answered. What remains is the genuine second provider.
"""
import pathlib
import re

from ai_router import route

SET_DIR = pathlib.Path("docs/session-sets/132-session-length-and-explorer-captions")
EXCLUDE = ["anthropic", "openai"]


def strip_header(text):
    return re.sub(r"^<!--.*?-->\s*", "", text, count=1, flags=re.S).strip()


def dispatch(prompt, out_name, note):
    out = SET_DIR / out_name
    if out.exists():
        print(f"[skip] {out} exists")
        return strip_header(out.read_text(encoding="utf-8"))
    print(f"[route] {note} ...", flush=True)
    result = route(
        content=prompt,
        task_type="architecture",
        context=(
            "Repo: dabbler-ai-orchestration. You are the second advisor on a "
            "two-provider panel; the first is from another provider."
        ),
        session_set=str(SET_DIR),
        session_number=3,
        exclude_providers=EXCLUDE,
    )
    body = result.content or ""
    out.write_text(
        f"<!-- routed: task_type=architecture, "
        f"exclude_providers={EXCLUDE!r} (orchestrator provider + the provider "
        f"that already answered); served by {result.model_name} / "
        f"{result.model_id}, truncated={result.truncated}, "
        f"{result.elapsed_seconds:.0f}s. Raw, never edited. -->\n\n" + body,
        encoding="utf-8",
    )
    print(f"[done] {result.model_name} truncated={result.truncated} "
          f"{len(body)} chars -> {out}", flush=True)
    return body


round_a = dispatch(
    (SET_DIR / "s3-panel-prompt-round-a.md").read_text(encoding="utf-8"),
    "s3-panel-round-a-google.md",
    "round A (google)",
)

template = (SET_DIR / "s3-panel-prompt-round-b.md").read_text(encoding="utf-8")
openai_a = strip_header((SET_DIR / "s3-panel-round-a-openai.md").read_text(encoding="utf-8"))
prompt_b = template.replace("{{A}}", openai_a).replace("{{B}}", strip_header(round_a))
dispatch(prompt_b, "s3-panel-round-b-google.md", "round B (google)")

print("google half complete")
