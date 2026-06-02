"""Set 056 S3 decision-time cross-provider consensus.

ONE decision: the engine-file consumer-repo table (punch-list item 3 in
s2-validation.md s5). The `## Consumer repos` 3-row table is currently
duplicated in CLAUDE.md / AGENTS.md / GEMINI.md *and* canonical in
docs/repository-reference.md (4 copies, with a header drift: CLAUDE.md uses
`ai_router`; AGENTS.md / GEMINI.md use the vestigial `ai_router copy`).

The locked S1 contract (s1-audit-record.md s3.3) PERMITS a duplicated
consumer table for convenience but names repository-reference.md the
canonical copy. The S2 cross-provider verifier (gemini-2.5-pro)
independently argued the table should be REMOVED from the engine files.
Operator directive grew the set to "complete centralization, period."

Option A: KEEP the permitted duplicate in all three engine files; only fix
  the `ai_router copy` -> `ai_router` header drift.
Option B: DROP the table from all three engine files; rely on the existing
  `## Shared repo facts` pointer to repository-reference.md ->
  `Documentation authority and release status` (which already carries the
  canonical consumer table). Maximally centralized; permanently kills the
  header-drift vector.

Independent provider: gemini-2.5-pro (google), different from the
Claude/Opus orchestrator. Mirrors the S1/S2 call mechanics.
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

import yaml
from ai_router import providers

# Excerpt the relevant surfaces (not whole files) to keep the prompt tight.
CONTEXT = r"""
=== Locked S1 contract, s1-audit-record.md s3.3 (verbatim) ===
"Root-engine-file scope. The three engine files carry only concise, stable
bootstrap facts and a pointer to the canonical section. They do NOT carry an
independent version history. A short consumer table may be duplicated in the
engine files for convenience, but the canonical copy is the one in
repository-reference.md, and any divergence is resolved in favor of the
canonical copy."

=== Spec non-goal (spec.md) ===
"Centralization is the goal, not triplication. 'Complete centralization'
means the canonical copy of every shared fact lives in an engine-agnostic
doc (or package metadata) and the three engine files *point* to it - NOT
that the same prose is copied into all three engine files (that would create
exactly the three-way drift this set exists to kill)."

=== Spec Session 3 charter (spec.md) ===
"Reduce CLAUDE.md, AGENTS.md, and GEMINI.md so each carries only (a)
engine-specific bootstrap (API-key export syntax, router import snippet) and
(b) the *same* pointer set into the engine-agnostic docs. Fix the
consumer-table header drift (ai_router vs ai_router copy) as part of this."

=== Current engine-file consumer table (all three carry this) ===
CLAUDE.md:    | Repo | ai_router | Extension |
AGENTS.md:    | Repo | ai_router copy | Extension |   <- vestigial "copy" header
GEMINI.md:    | Repo | ai_router copy | Extension |   <- vestigial "copy" header
(3 data rows, identical content: access-harvester / platform = pip install
dabbler-ai-router; homehealthcare-accessdb = not used (Lightweight).)

=== The pointer that already exists in all three engine files ===
"## Shared repo facts
Current consumer repos, canonical release status, and the shared version
walk live in docs/repository-reference.md -> Documentation authority and
release status."
(That canonical section in repository-reference.md DOES contain the consumer
table.)

=== The canonical copy (repository-reference.md s Documentation authority) ===
### Current consumer repos
| Repo | `ai_router` | Extension |  (3 rows, same content)
"""

system_prompt = (
    "You are a senior documentation architect giving an independent "
    "second opinion on ONE narrow design decision for an AI-orchestration "
    "repo. You did not author this work. The repo's whole point in this "
    "change set is to KILL three-way drift between three engine-specific "
    "bootstrap files (CLAUDE.md = Claude Code, AGENTS.md = Codex/Copilot, "
    "GEMINI.md = Gemini) by centralizing shared facts into engine-agnostic "
    "docs. Be concrete and decisive. Return ONLY a JSON object with keys: "
    "recommendation (exactly 'A' or 'B'), confidence (one of 'low' | "
    "'medium' | 'high'), rationale (string), risks_of_choice (string), "
    "dissent (string: the strongest argument for the option you did NOT "
    "pick)."
)

user_message = f"""## The decision

A 3-row consumer-repo table is currently duplicated in all three
engine-specific bootstrap files AND canonical in an engine-agnostic doc
(4 copies total), and the engine-file copies have already drifted (header
reads `ai_router` in one file, `ai_router copy` in the other two).

The locked contract PERMITS the duplicate "for convenience." The set's
operator directive is "complete centralization, period." An independent
prior verifier recommended removing the engine-file copies.

**Option A** - KEEP the duplicate table in all three engine files; only
align the drifted header (`ai_router copy` -> `ai_router`).

**Option B** - DROP the table from all three engine files; rely on the
already-present `## Shared repo facts` pointer into the canonical
engine-agnostic section (which already contains the table). This removes
3 of the 4 copies and permanently eliminates the header-drift vector.

## Context (contract text, spec text, current state)
{CONTEXT}

## Your task

Pick A or B for THIS repo given its stated anti-drift goal. Weigh: the
convenience of an inline table a reader sees without a click (favors A)
against the fact that the table has already drifted and the set exists
specifically to end such drift, and a one-line pointer to the canonical
copy already exists in every engine file (favors B). The contract permits
A but does not require it. Return the JSON object."""


def main():
    cfg = yaml.safe_load(
        (REPO / "ai_router" / "router-config.yaml").read_text(encoding="utf-8")
    )
    gcfg = cfg["providers"]["google"]
    model = next(
        m for m in cfg["models"].values() if m.get("model_id") == "gemini-2.5-pro"
    )

    result = providers.call_model(
        provider_name="google",
        model_id="gemini-2.5-pro",
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=16000,
        config=gcfg,
        generation_params={"thinking_budget": 6000},
    )

    in_cost = model["input_cost_per_1m"] / 1_000_000 * result.input_tokens
    out_cost = model["output_cost_per_1m"] / 1_000_000 * result.output_tokens
    print("=== CONSENSUS RAW OUTPUT ===")
    print(result.content)
    print("=== USAGE ===")
    print(json.dumps({
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": round(in_cost + out_cost, 6),
        "stop_reason": result.stop_reason,
    }, indent=2))


if __name__ == "__main__":
    main()
