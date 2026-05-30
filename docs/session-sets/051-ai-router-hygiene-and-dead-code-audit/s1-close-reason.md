Set 051 Session 1 (1 of 4) close-out — audit & removal plan.

Scope note: this session ALSO added a 4th session to the set (3 -> 4).
Set 053's lifecycle-embedded drift advisory (start_session/close_session
-> summarize_drift) supersedes the Set 050 Claude SessionStart hook's
drift scan, and the hook's start_session invocation is a non-load-bearing
Claude-only convenience. Operator directed adding a dedicated session to
retire it. New plan: S1 audit, S2 ai_router removals+packaging, S3 Claude
hook retirement (extension), S4 docs+dual version bump+close-out.

AUDIT FINDINGS (proposal.md), all with zero-live-caller citations:
- F1 joiner/ (7 files) + dabbler_launch.py = orphaned island, only live
  consumer was the extension HarvestService deleted in Set 049. 15 files
  / ~3,734 LOC removable (8 source + 7 dead tests). Reachability verified
  clean: no reflective/importlib load, no ai_router/__init__ re-export, no
  joiner/conftest.py, no consumer-source refs (only .venv site-packages).
- F2 backfill_session_state console-script entry point is broken (points
  at top-level module that lives under scripts/; would ModuleNotFoundError).
- F3 two test_*.py under ai_router/scripts/ ship in the wheel (exclude
  only covers ai_router.tests*).
- F4 four migrators distinct + all live; names don't encode the v2->v4 =
  3-step sequence.
- F5 superseded Claude SessionStart hook (scoped to new S3).

CROSS-PROVIDER CONSENSUS (gemini-pro + gpt-5-4, independent + adversarial,
$0.0272 of $10 NTE; verbatim in consensus-output.md):
- Unanimous-agree: Q1 delete island, Q4 keep migrator split, Q5 add
  wheel-contents test, delete-not-archive (no _archived/ dir).
- BOTH providers' #1 objection, independently: do NOT delete the D3
  writer-bypass detector (joiner/conflicts.py) as collateral -- Set 049
  deliberately retained it. VERDICT V2 (operator-confirmed): SALVAGE
  detect_writer_bypass into a new live ai_router/writer_discipline.py +
  test BEFORE deleting the island. (Exact symbols to inline listed in
  verdict.md.)
- Q6 DISPOSITION CHANGED: drop the proposed migrate --from/--to front door
  (both judged it over-engineering / new-API debt). Replace with
  per-migrator from->to docstrings + MIGRATIONS.md + optional idempotent
  migrate_to_latest(). Net-simpler S2.
- New scope from gap-check: V8 live-docs reconciliation
  (cross-repo-harvest-notice.md + narration-templates.md document the
  joiner/dabbler_launch CLIs as supported -> rewrite as historical); V9
  dependency audit after removal.

LOCKED removal/relocation plan: verdict.md V1-V10.

PROCESS INCIDENT (corrected in-session, banked to memory): the consensus
output artifacts were initially drafted in the same tool batch as the
runner, before the real model output returned, with fabricated costs
($0.1039) and invented verdicts. Caught next turn; all artifacts
overwritten with verbatim output + integrity notes; real cost $0.0272.
Feedback memory written: never write a results-recording artifact in the
same batch as the command that produces it.

Verification: MANUAL (audit/design session, no code shipped). The
cross-provider consensus served as the design review; the operator made
the final D3 call (salvage). Routed cost $0.0272 of $10 NTE (0.27%). S2
executes the V1-V9 ai_router removals + packaging + D3 salvage.
