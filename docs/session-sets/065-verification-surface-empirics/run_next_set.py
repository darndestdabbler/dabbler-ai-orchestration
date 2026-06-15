"""Set 065 S3 (final) — route the next-session-set recommendation (L-064-6:
never self-opine). Saves raw output to disk first (L-064-3)."""
from pathlib import Path
from ai_router import route

OUT = Path("docs/session-sets/065-verification-surface-empirics/next-set-rec.md")

PROMPT = r"""You are recommending the NEXT session set for the
`dabbler-ai-orchestration` repo (canonical source of shared AI-orchestration
infrastructure; releases ai_router to PyPI and a VS Code extension to the
Marketplace). Set 065 just CLOSED: a research/proposal set ("verification-surface
empirics") that produced a cross-provider-VERIFIED proposal, NOT a production
change. The proposal's own recommended implementation sequencing is:

1. Build the FIRST-PARTY TOOL-LOOP ADAPTER (a route()-based agentic Mode-2 "pull"
   verifier: minimal toolset read_file/grep/list_dir, sandboxed run_test in a
   disposable worktree, deterministic-servant guardrail returning raw ground
   truth, forced sN-issues.json verdict, tool-call-trace instrumentation). This
   adapter is BOTH the production Mode-2 engine AND the execution vehicle for the
   forward A/B. S2 already proved a ~150-LOC httpx-only spike works headless.
2. Run the FORWARD A/B (Experiment A capability on a blind frozen tree + B
   cadence staged-snapshot) — gated on step 1 existing.
3. Ship "Path-Aware Critique" as a per-set attribute (none|advisory|required) +
   close-out gate, blast-radius gated, multi-provider.
4. Decide per-session routed verification's fate from the A/B; ship the
   contract-test gate for fully-encodable functionality (with hole-fixes).

Steps 1-3 are committable now; step 4 is data-gated on the A/B.

Recommend the next session set. Output STRICT JSON only (no prose around it):
{
  "slug": "NNN-short-kebab-slug (omit the number; the orchestrator assigns it)",
  "one_line": "one-sentence description",
  "why_next": "why this should be next vs the alternatives",
  "rough_session_count": <int>,
  "ships_release": true|false,
  "depends_on": "what must exist first, if anything",
  "alternatives_considered": ["..."]
}
Pick the single best next set. Favor the proposal's own sequencing unless there
is a strong reason to deviate; note any sequencing risk (e.g. building the
adapter as production code vs. as an experiment harness first).
"""

r = route(PROMPT, task_type="analysis", complexity_hint=55,
          session_set="065-verification-surface-empirics", session_number=3)
OUT.write_text(
    f"# Set 065 -> next session set recommendation (routed)\n\n"
    f"> route(task_type='analysis'). Model: {r.model_name} ({r.model_id}). "
    f"Cost: ${r.cost_usd:.4f}\n\n---\n\n{r.content}\n",
    encoding="utf-8",
)
print(f"Wrote {OUT} ({len(r.content)} chars); model={r.model_name}; cost=${r.cost_usd:.4f}")
