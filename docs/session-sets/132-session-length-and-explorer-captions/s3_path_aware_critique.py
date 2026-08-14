"""Set 132 end-of-set path-aware critique, manual flow (the template default).

The automated producer (`python -m ai_router.pull_critique`) refuses on this
machine, and the reason is worth stating precisely because the obvious reading
is wrong. **Path-aware review is not unavailable on this transport** -- it is
arguably more native here: routed children on copilot-cli are dispatched as
agentic CLI processes carrying `--available-tools view,grep,glob`
(`cli_transport.py` READ_ONLY_TOOLS), i.e. real read-only repo access by
construction.

What actually fails is the producer's WIRING. `ai_router/pull_verifier.py`
contains no reference to transports at all; it implements its own tool loop
against provider SDKs and resolves `api_key_env` per provider, so it raises
`missing API key (env 'DABBLER_OPENAI_API_KEY')` on a seat that holds none by
design. The asymmetry is about who supplies the agentic loop: on `api` the
router must build it (which needs direct SDK access), while on `copilot-cli`
the CLI *is* the agent and brings its own tools. The seat that needs a
hand-rolled loop least is the one the producer refuses. Recorded as R4.

So this uses the manual flow that the template calls the default, driven
through routed children. Two distinct providers, forced by exclusion because
prefer_model is ignored on this transport (this set's own R3):

    exclude [anthropic]           -> gpt-5.5                (openai)
    exclude [anthropic, openai]   -> gemini-3.1-pro-preview  (google)

anthropic is excluded from both because it is the orchestrator's own provider.
Raw verdicts are written per provider and never edited; this script does not
assemble the artifact, so no fabricated entry can reach it.
"""
import pathlib

from ai_router import route

SET_DIR = pathlib.Path("docs/session-sets/132-session-length-and-explorer-captions")
PROMPT = (SET_DIR / "s3-critique-prompt.md").read_text(encoding="utf-8")

CRITICS = [("openai", ["anthropic"]), ("google", ["anthropic", "openai"])]

for provider, exclude in CRITICS:
    out = SET_DIR / f"s3-path-aware-critique-{provider}.md"
    if out.exists():
        print(f"[skip] {out} exists")
        continue
    print(f"[route] critic {provider} (exclude {exclude}) ...", flush=True)
    result = route(
        content=PROMPT,
        task_type="code-review",
        context=(
            "You are one of two independent end-of-set critics, each from a "
            "different provider, with read-only access to this repository. "
            "Read the files yourself; do not trust the summary."
        ),
        session_set=str(SET_DIR),
        session_number=3,
        exclude_providers=exclude,
    )
    body = result.content or ""
    out.write_text(
        f"<!-- routed: task_type=code-review, exclude_providers={exclude!r}; "
        f"served by {result.model_name} / {result.model_id}, "
        f"truncated={result.truncated}, {result.elapsed_seconds:.0f}s. "
        "Raw, never edited. -->\n\n" + body,
        encoding="utf-8",
    )
    print(f"[done] {result.model_name} truncated={result.truncated} "
          f"{len(body)} chars -> {out}", flush=True)

print("critique round complete")
