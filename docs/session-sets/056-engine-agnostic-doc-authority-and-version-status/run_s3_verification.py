"""Set 056 S3 cross-provider verification of the complete-centralization pass.

Verifier: gemini-2.5-pro (google) — a different provider from the
Claude/Opus orchestrator that did the centralization. Feeds the ACTUAL
current repo files (the three engine files post-rewrite, CONTRIBUTING.md,
the full repository-reference.md), the LOCKED S1 contract (s1-audit-record.md
— fed this time so the verifier judges against the right standard, unlike
S2 where withholding it caused a context-gap false positive), the S3
consensus decision, and the S3 validation record.

It asks the verifier to independently judge:
  1. SYMMETRY — do CLAUDE.md / AGENTS.md / GEMINI.md differ ONLY in their
     header (H1 + audience) and their final engine-specific bootstrap
     section? (The shared body must be identical.)
  2. SOLE-SOURCING — is ANY shared operational fact still recoverable only
     from one engine file (i.e. present in an engine file but with no
     engine-agnostic canonical home)? This is the core charter.
  3. STRAGGLERS — are Finding A (repository-reference.md file-map CLAUDE.md
     row) and Finding B (CONTRIBUTING.md consumer-map citation) actually
     fixed, and were any NEW stragglers introduced by the edits?
  4. RELOCATION — does the router-config-editor walkthrough now have an
     engine-agnostic home (repository-reference.md file map)?
  5. REGRESSION — did thinning the engine files drop any fact that has NO
     engine-agnostic home (i.e. lost content, not relocated content)?

Mirrors the S1 / S2 call mechanics (direct providers.call_model;
provider-scoped config; 16k tokens + thinking_budget).
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

import yaml
from ai_router import providers

SET = "docs/session-sets/056-engine-agnostic-doc-authority-and-version-status"
FILES = [
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    "CONTRIBUTING.md",
    "docs/repository-reference.md",
    f"{SET}/s1-audit-record.md",
    f"{SET}/s3-consensus.md",
    f"{SET}/s3-validation.md",
]


def read(rel):
    return (REPO / rel).read_text(encoding="utf-8")


def main():
    cfg = yaml.safe_load(
        (REPO / "ai_router" / "router-config.yaml").read_text(encoding="utf-8")
    )
    gcfg = cfg["providers"]["google"]
    model = next(
        m for m in cfg["models"].values() if m.get("model_id") == "gemini-2.5-pro"
    )

    blocks = "\n\n".join(f"=== FILE: {rel} ===\n{read(rel)}" for rel in FILES)

    system_prompt = (
        "You are a senior reviewer performing an independent cross-provider "
        "verification of a DOCUMENTATION-CENTRALIZATION session (docs only, "
        "no code change). You did NOT write this work. Be skeptical and "
        "concrete; cite line-level evidence from the file contents provided. "
        "The change set's CORE CHARTER: no shared operational fact may be "
        "recoverable ONLY from one engine-specific bootstrap file "
        "(CLAUDE.md = Claude Code, AGENTS.md = Codex/Copilot, GEMINI.md = "
        "Gemini); every such fact must have an engine-agnostic canonical home "
        "(a docs/* file, CONTRIBUTING.md, or package metadata) and the three "
        "engine files must be SYMMETRIC: identical shared body, differing only "
        "in their header (H1 + audience line) and their final "
        "engine-specific bootstrap section. The locked contract says relocate "
        "inline-only content to an engine-agnostic doc and leave a pointer — "
        "do NOT mirror prose into all three engine files. Return ONLY a JSON "
        "object with keys: verdict (one of 'VERIFIED' | 'VERIFIED_WITH_NOTES' "
        "| 'ISSUES_FOUND'), critical (array of {title, detail}), important "
        "(array of {title, detail}), nice_to_have (array of {title, detail}), "
        "claim_checks (array of {claim, holds (true|false), evidence}), "
        "sole_sourced_facts (array of {fact, engine_file, why} — facts STILL "
        "recoverable only from one engine file; empty if none), "
        "lost_facts (array of {fact, why} — facts dropped from an engine file "
        "that have NO engine-agnostic home anywhere; empty if none), "
        "new_stragglers (array of {file, line_or_quote, why}), summary "
        "(string)."
    )

    user_message = f"""## Context

Set 056 Session 3 (final session) of the dabbler-ai-orchestration repo. The
substantive version-walk migration landed earlier (Set 056 S1/S2). Session 3
completes centralization: it (a) decided via cross-provider consensus to drop
the duplicated `## Consumer repos` table from all three engine files in favor
of the existing `## Shared repo facts` pointer; (b) fixed two stragglers
(Finding A: repository-reference.md file-map CLAUDE.md row; Finding B:
CONTRIBUTING.md consumer-map citation); (c) relocated the one genuinely
sole-sourced engine-file fact — the router-config-editor walkthrough — into
repository-reference.md's extension file map; (d) thinned CLAUDE.md's inline
shared content (orchestrator-block contract, e2e harness, CI, session-state
schema) to pointers, since each already has an engine-agnostic canonical home
(session-state-schema.md, ai-led-session-workflow.md, CONTRIBUTING.md); and
(e) symmetrized the three engine files.

The LOCKED S1 contract is in the s1-audit-record.md file below (read its §3
before judging). Note §3.3 permitted a duplicated consumer table "for
convenience"; S3's consensus decision went stricter (pointer-only) — that is
an ALLOWED tightening, not a contract violation, so do NOT flag the table's
removal as a defect.

## Files under review (actual current repo state + the S3 records)

{blocks}

## Your task — verify independently against the file contents above

1. CLAIM CHECKS — for each claim, decide holds true/false with evidence:
   - C1: The three engine files differ ONLY in (i) the H1 title + the
     `> **Audience:**` blockquote and (ii) the final
     `## Engine-specific bootstrap` section. Everything from `## Quick start`
     through `## Decision-time consensus` is identical across all three.
   - C2: No engine file still contains a `## Consumer repos` table, an
     independent version walk, an `## Orchestrator-block contract` section,
     or the vestigial `ai_router copy` header.
   - C3: Finding A is fixed — the repository-reference.md file-map CLAUDE.md
     row now says shared facts live in `docs/repository-reference.md`, not
     "in this doc"/"in CLAUDE.md", consistent with the AGENTS.md/GEMINI.md
     sibling rows.
   - C4: Finding B is fixed — CONTRIBUTING.md points to CLAUDE.md only for
     role + portability rule, and to repository-reference.md for the
     canonical consumer-repo map / release status.
   - C5: The router-config-editor walkthrough now has an engine-agnostic home
     (a `src/configEditor/` row in repository-reference.md's extension file
     map) carrying the command, the 3 YAML files, and the key source files.

2. SOLE-SOURCING (CORE CHARTER, most important) — independently scan the
   three engine files. For every shared operational fact each still asserts,
   confirm it ALSO has an engine-agnostic canonical home (pointer target).
   List in `sole_sourced_facts` any fact that is present in an engine file
   but recoverable ONLY from that engine file (no engine-agnostic home).
   Empty array if the charter is fully met.

3. LOST FACTS — the thinning removed inline detail from CLAUDE.md (e.g. the
   orchestrator-block contract, e2e harness layers, router-config-editor
   walkthrough). For each, confirm the detail survives in an engine-agnostic
   home (session-state-schema.md / ai-led-session-workflow.md / CONTRIBUTING.md
   / repository-reference.md). List in `lost_facts` any detail that was
   dropped and now has NO home anywhere (genuine information loss). NOTE: you
   are given CONTRIBUTING.md and repository-reference.md in full; for
   session-state-schema.md and ai-led-session-workflow.md you are NOT given
   the full text — if you suspect a lost fact lives only in one of those,
   judge by whether the pointer NAMES the right doc/section and flag as
   nice_to_have rather than a confirmed lost_fact.

4. NEW STRAGGLERS / REGRESSIONS — did any edit introduce a NEW live reference
   that treats an engine file as canonical for version/consumer/release
   facts, or a broken link / broken table / broken anchor? List in
   `new_stragglers`.

Return the JSON verdict. VERIFIED means: the three engine files are
symmetric (C1), no shared fact is sole-sourced in an engine file
(sole_sourced_facts empty), both stragglers are fixed (C3, C4), the
relocation landed (C5), and no fact was lost and no new straggler
introduced."""

    result = providers.call_model(
        provider_name="google",
        model_id="gemini-2.5-pro",
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=16000,
        config=gcfg,
        generation_params={"thinking_budget": 8000},
    )

    in_cost = model["input_cost_per_1m"] / 1_000_000 * result.input_tokens
    out_cost = model["output_cost_per_1m"] / 1_000_000 * result.output_tokens
    usage = {
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": round(in_cost + out_cost, 6),
        "stop_reason": result.stop_reason,
    }
    # Write raw output to a UTF-8 file (stdout is cp1252 on this host and the
    # verifier emits non-ASCII glyphs like -> ; printing it directly crashes).
    out_path = Path(__file__).resolve().parent / "s3-verification-raw.md"
    out_path.write_text(
        "=== VERIFIER RAW OUTPUT ===\n"
        + result.content
        + "\n\n=== USAGE ===\n"
        + json.dumps(usage, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print("wrote raw verifier output to", out_path.name)
    print("USAGE:", json.dumps(usage))


if __name__ == "__main__":
    main()
