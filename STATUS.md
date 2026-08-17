# STATUS — after Session 1 (router core)

- Done: `ai_router.route()` end-to-end over both transports; selection with one
  `surviving_candidates` (keyless provider = not a candidate), tiered/dated
  pricing, escalation ladder, metrics ledger (`cost_usd: null` + report that
  never prints $0 for unpriced), seat_cost (3 statuses), Copilot transport
  (3-tier timeouts, JSONL parse, stderr classes, breaker; catalog via tomllib).
- Verified: 160 tests green (`.venv/Scripts/python -m pytest`); live smoke OK on
  all three providers (`smoke.py`) — costs measured, OpenAI served-model
  mismatch note fired as designed.
- Deviations from plan: LOC over budget in copilot.py (835 vs 470) and
  route.py+__init__ (~510 vs 250); total 3,166 vs ~2,400 (+32%). Tests exactly
  at the 160 ceiling. Dropped v1's file-handoff protocol per plan — prompts
  over ~24k chars on the Copilot path will hit the Windows argv limit;
  revisit when Session 2 sends big evidence bundles.
- Config fix found by smoke: gemini-2.5-pro now REJECTS `thinking_budget: 0`
  ("only works in thinking mode") — task_type_params use 128 (its minimum).
- Copilot live state on this machine: CLI is 1.0.75, lock pins 1.0.69 →
  catalog validation fails closed until an operator re-probes (v2 has no
  discovery CLI by design; use v1's `copilot_catalog --refresh` and copy the
  lock). Seat store schema v6 = compatible. A live probe hit a GitHub 503
  (transient), classified auth-class, reprobe + diagnostics recorded.
- Next (Session 2): session lifecycle, five gates, verification loop, machine
  ledger. route() exposes `exclude_providers` as the deferred verify seam.
