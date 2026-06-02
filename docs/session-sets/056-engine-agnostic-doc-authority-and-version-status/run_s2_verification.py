"""Set 056 S2 cross-provider verification of the version-walk migration
validation.

Verifier: gemini-2.5-pro (google) — a different provider from the
Claude/Opus orchestrator that ran the validation. Feeds the ACTUAL current
repo files plus the S2 validation record and asks the verifier to
independently judge whether: (1) the canonical section is present and
well-formed; (2) the markdown renders clean; and most importantly (3)
whether the straggler set is COMPLETE — i.e. whether the two stragglers S2
found (repository-reference.md:475 file-map row; CONTRIBUTING.md:9
consumer-map citation) are real AND whether any OTHER live straggler exists
that treats an engine file (CLAUDE.md / AGENTS.md / GEMINI.md) as the
canonical source of the version walk / consumer table / release status.

Mirrors the Set 056 S1 / Set 055 S2 call mechanics (direct
providers.call_model; no RouteResult.provider access; provider-scoped
config; 16k tokens + thinking_budget).
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

import yaml
from ai_router import providers

FILES = [
    "docs/session-sets/056-engine-agnostic-doc-authority-and-version-status/s2-validation.md",
    "docs/repository-reference.md",
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    "CONTRIBUTING.md",
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
        "verification of a DOCUMENTATION-VALIDATION session (no code change). "
        "You did NOT write this work. Be skeptical and concrete; cite line-level "
        "evidence from the file contents provided. Your single most important "
        "job is to independently judge COMPLETENESS: did the validation find "
        "every live straggler, or did it miss one? Return ONLY a JSON object "
        "with keys: verdict (one of 'VERIFIED' | 'VERIFIED_WITH_NOTES' | "
        "'ISSUES_FOUND'), critical (array of {title, detail}), important (array "
        "of {title, detail}), nice_to_have (array of {title, detail}), "
        "claim_checks (array of {claim, holds (true|false), evidence}), "
        "additional_stragglers (array of {file, line_or_quote, why}), "
        "summary (string)."
    )

    user_message = f"""## Context

This is Set 056 Session 2 (Validate the version-walk migration) of the
dabbler-ai-orchestration repo. The set's goal: shared operational facts a
future orchestrator needs must live in an engine-agnostic doc or canonical
package metadata, NOT only in an engine-specific bootstrap file
(`CLAUDE.md` = Claude Code only, `AGENTS.md` = Codex/Copilot only,
`GEMINI.md` = Gemini only). The substantive migration was committed out of
band in `e5a3476` and ratified by the Session 1 audit. Session 2 is the
independent validation checkpoint for that migration.

The canonical home for shared facts is
`docs/repository-reference.md` -> the `## Documentation authority and
release status` section (consumer table, release-status table, concise
recent version walk + a guiding principle). Each of the three engine files
should carry only concise bootstrap facts plus a pointer to that section,
with NO independent version walk.

## Session 2 is validation-only

S2 deliberately EDITS NO DOCUMENT. The fixes (consumer-table header drift,
engine-file symmetrization, and the two stragglers found below) are all
handed to Session 3, which re-greps + cross-provider-verifies + closes the
set. So do NOT treat "the stragglers are still present in the files" as a
defect of S2 — judge instead whether S2 correctly IDENTIFIED them and
whether it MISSED any.

## What S2 claims (verify these against the actual files)

1. The canonical `## Documentation authority and release status` section
   exists in `docs/repository-reference.md` and is well-formed: guiding
   principle + consumer table + release-status table + concise recent
   version walk. Its version claims (router 0.15.0, extension 0.27.0) are
   accurate.
2. The edited markdown renders clean (well-formed tables, no broken
   anchors). The three engine-file `Shared repo facts` pointers reference
   the canonical section by prose title (not a clickable anchor link), and
   no live doc uses the `#documentation-authority-and-release-status`
   anchor as a link, so there is no broken-anchor risk.
3. There are EXACTLY TWO live stragglers — i.e. live (non-historical,
   non-consumer-paste) docs that treat an engine file as the canonical
   source of the version walk / consumer table / release status:
   - Finding A (HARD): `docs/repository-reference.md` file-map row for
     CLAUDE.md says shared facts/consumer tables/release-version status
     "live in this doc", contradicting the migration and inconsistent with
     the sibling AGENTS.md / GEMINI.md rows that correctly point to
     `docs/repository-reference.md`.
   - Finding B (SOFT): `CONTRIBUTING.md` cites `CLAUDE.md` for "the
     consumer-repo map".

## Files under review (the actual current repo state + the S2 record)

{blocks}

## Your task

Independently verify, against the file contents above:

1. CLAIM CHECKS — for each S2 claim (1, 2, 3 above), decide whether it
   holds and cite concrete evidence (or counter-evidence).

2. COMPLETENESS (most important) — independently hunt for any OTHER live
   doc that treats an engine file (CLAUDE.md / AGENTS.md / GEMINI.md) as
   the canonical source of the version walk / consumer table / release
   status. List every additional straggler you find in
   `additional_stragglers` (empty array if none). Exclude: historical
   closed-set artifacts under docs/session-sets/*, consumer-repo paste-in
   notices (docs/cross-repo-*-notice.md), design proposals under
   docs/proposals/*, package CHANGELOGs, and this set's own spec.md/files.
   NOTE: you only have the 6 files above in full; if you suspect a
   straggler in a file NOT provided, say so as a nice_to_have rather than a
   confirmed finding.

3. SCOPE JUDGMENT — is it sound for a validation-only checkpoint to RECORD
   these stragglers and hand the fixes to Session 3 (which has its own
   final grep + cross-provider verify + close gate), rather than fixing
   them in S2? Flag as `important` only if you believe a straggler is so
   migration-contradicting that it must be fixed before S2 can close.

Return the JSON verdict. A VERIFIED verdict means the canonical section is
well-formed, the render is clean, the two stragglers are real, and you
found NO additional live straggler the validation missed."""

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
    print("=== VERIFIER RAW OUTPUT ===")
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
