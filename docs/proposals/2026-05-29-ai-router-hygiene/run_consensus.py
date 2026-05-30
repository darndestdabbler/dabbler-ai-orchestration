"""Set 051 S1 cross-provider consensus on the CONTESTED hygiene calls.
Two independent reviewers (gemini-pro=google, gpt-5-4=openai) evaluate AND
adversarially attack the load-bearing dispositions. call_model gets the
PROVIDER-SCOPED config; gemini gets thinking_budget; gpt-5-4 falls back to
gpt-5-4-mini on error. Artifacts saved to consensus-output.md; this script
is kept in the proposal dir for the record."""
import json
import os
import sys
# Running this file by path puts the proposal dir on sys.path[0], not the
# repo root, so ai_router isn't importable. Prepend the cwd (repo root).
sys.path.insert(0, os.getcwd())
from ai_router.config import load_config
from ai_router import providers

cfg = load_config()

SYSTEM = (
    "You are an independent reviewer on a cross-provider code-hygiene panel. "
    "You did NOT write this audit. Evaluate it, then ADVERSARIALLY attack its "
    "load-bearing choices -- do not just agree. Respond ONLY as JSON with keys: "
    "per_question (object mapping Q-id -> {'verdict':'agree'|'disagree'|'modify', "
    "'why': short string}), d3_writer_bypass_verdict (string -- is deleting the "
    "D3 writer-bypass detector along with the dead joiner island correct, or "
    "should it be salvaged into a live module first? be specific), "
    "delete_vs_archive_verdict (string -- for ~3700 LOC of proven-dead code, is "
    "outright deletion right, or is an _archived/ dir or git-tag worth the "
    "clutter?), migrator_naming_verdict (string -- is a single `migrate --from "
    "vN --to vM` front door with deprecated aliases worth the churn vs just a "
    "doc/docstring fix that explains the 3-step v2->v4 sequence?), "
    "strongest_objection (string), missing (list of strings)."
)

USER = r"""
Review this dead-code / packaging hygiene audit for a Python package
(`ai_router`) that ships to PyPI as `dabbler-ai-router` and is consumed by
3 sibling repos. Goal: remove demonstrably-unreachable code + fix packaging,
WITHOUT touching any live code path. Audit-first: nothing deleted without a
proven zero-live-caller finding.

EMPIRICAL FINDINGS (just scanned, trust them):

F1 -- ORPHANED ISLAND (proven dead). `ai_router/joiner/` (7 files: __init__,
__main__, cli, conflicts, coverage, parsers, schema; ~1610 LOC) +
`ai_router/dabbler_launch.py` (259 LOC) were the reader/writer halves of a
Set-044/045 "log-harvest" feature. Their ONLY live consumer was a VS Code
extension service `HarvestService`, DELETED in Set 049 when that UI was
reverted. Zero-live-caller evidence: (a) no ai_router module imports
`ai_router.joiner` or `ai_router.dabbler_launch` except the island itself +
its own tests; (b) no [project.scripts] / toml / yaml entry point references
them (only ever invoked as `python -m ai_router.joiner`, which nothing calls);
(c) extension source has only 2 stale doc-COMMENT mentions, no live import;
(d) in all 3 consumer repos they appear ONLY inside .venv site-packages (the
installed pkg itself), never in consumer source. Plus 7 dead test files
(~1828 LOC: test_joiner_* x5, test_dabbler_launch* x2) die with them.
TOTAL removable: 15 files, ~3734 LOC.

  D3 CAVEAT (load-bearing): `joiner/conflicts.py` contains the "writer-bypass"
  detector (D3). Set 049 EXPLICITLY chose to KEEP D3 as "a general
  writer-discipline check, decoupled from the coordination layer" -- but it
  ALSO has no live caller today (its caller was in the deleted island's CLI).
  Deleting the island deletes D3. D3 compares session-state.json mtime against
  the session-events.jsonl ledger to flag out-of-band writes. It is
  recoverable from git history.

F2 -- BROKEN ENTRY POINT. pyproject declares
`backfill_session_state = "ai_router.backfill_session_state:main"` but the
module lives at `ai_router/scripts/backfill_session_state.py` (has a main()).
Installed console script would ModuleNotFoundError. (The library function
`backfill_session_state_files` in session_state.py is live + unaffected.)

F3 -- TESTS SHIP IN WHEEL. `ai_router/scripts/` holds 2 test_*.py; the wheel
exclude only covers `ai_router.tests*`, so these ship to PyPI consumers.

F4 -- FOUR MIGRATORS, all live + distinct, names inconsistent:
`migrate_session_state` (actually v2->v3), `migrate_v3_to_v4`,
`migrate_lightweight_to_canonical_v4`, `migrate_router_config`. The names do
NOT encode that migrating v2->v4 requires running THREE of them IN SEQUENCE
(an empirically-confirmed Set-050 finding -- a v2 file is skipped by both v4
migrators and needs the v2->v3 step first). Consumer repos may call the
`python -m` entry points directly.

RECOMMENDED DISPOSITIONS:
- Q1 (joiner delete vs archive): DELETE outright. Git history is the archive;
  an _archived/ dir would just be re-flagged by the next hygiene set; a
  launch-adapter revival (Sets 037-041, never built) would re-spec anyway.
- Q2 (backfill entry point): REPOINT to
  ai_router.scripts.backfill_session_state:main (module already there w/
  main(); least churn; preserves documented `python -m` usage).
- Q3 (scripts/ tests): MOVE the 2 test_*.py to tests/; KEEP the 2 utilities
  in scripts/ (intentionally archived-but-packaged); wheel ships no test_*.
- Q4 (migrator LOGIC consolidation): KEEP the 4-way split -- each handles a
  genuinely distinct shape; a shared "normalize core" merge risks the exact
  regressions Sets 047/050 fought.
- Q5 (wheel-contents assertion): YES -- add a test asserting the built wheel
  contains no test_* and none of the removed dead modules (regrowth guard).
- Q6 (migrator NAMING/discoverability): add a single `migrate --from vN --to
  vM` front door that sequences the right steps, keeping current `python -m`
  entry points as DEPRECATED ALIASES (consumers may call them).

KEY TENSIONS TO ATTACK:
1. Is deleting D3 along with the island correct, or should D3 be salvaged into
   a live module (or a test) FIRST, given Set 049 deliberately preserved it?
2. Is outright deletion of ~3700 LOC right, or is archive/tag worth it?
3. Is the `migrate` front-door (Q6) worth the churn of new public surface +
   alias maintenance, or is the real fix just a docstring/doc note explaining
   the 3-step sequence (cheaper, no new API)? Attack the over-engineering risk.
JSON only.
"""


def call(engine, provider):
    mid = cfg["models"][engine]["model_id"]
    gp = {"thinking_budget": 6000} if provider == "google" else None
    res = providers.call_model(
        provider_name=provider, model_id=mid, system_prompt=SYSTEM,
        user_message=USER, max_tokens=16000,
        config=cfg["providers"][provider], generation_params=gp,
    )
    m = cfg["models"][engine]
    cost = (res.input_tokens / 1e6) * m["input_cost_per_1m"] + (
        res.output_tokens / 1e6) * m["output_cost_per_1m"]
    return res, round(cost, 4)


total = 0.0
for engine, provider in [("gemini-pro", "google"), ("gpt-5-4", "openai")]:
    try:
        res, cost = call(engine, provider)
    except Exception as e:
        print(f"\n### {engine} FAILED: {type(e).__name__}: {e}")
        if engine == "gpt-5-4":
            try:
                res, cost = call("gpt-5-4-mini", "openai")
                engine = "gpt-5-4-mini (fallback)"
            except Exception as e2:
                print(f"### fallback also failed: {e2}")
                continue
        else:
            continue
    total += cost
    print(f"\n{'='*70}\n### {engine} ({provider})  cost=${cost}  "
          f"in={res.input_tokens} out={res.output_tokens}\n{'='*70}")
    print(res.content)

print(f"\n\n### TOTAL CONSENSUS COST: ${round(total, 4)}")
