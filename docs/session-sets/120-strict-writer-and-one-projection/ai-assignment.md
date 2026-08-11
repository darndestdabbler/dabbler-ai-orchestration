# AI assignment log — Set 120

Per-session orchestrator assignment and the next-session recommendation.
Under the temporary verification-only routing policy (2026-08-05), the
active orchestrator records these directly rather than routing the
analysis; only `session-verification` goes through `route()`.

---

## Session 1 — The writer refuses what it cannot mean

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5`, effort `high`
(Copilot CLI transport — this seat carries no provider API keys by design,
and their absence is not an error).

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**The measurement was reproduced, not inherited.** The spec's token counts
came from a one-off query on 2026-08-11; this session re-ran the count over
every `activity-log.json` before drawing the vocabulary from it. The
canonical five are confirmed (`complete` 2,417 / `pending` 55 /
`in-progress` 31 / `blocked` 3 / `skipped` 1) and nothing was invented. The
drift totals moved slightly against the spec — `complete` 2,417 vs 2,412,
`pending` 55 vs 45, nine prose blobs vs "~6" — because Set 119 kept writing
after the spec was authored and this session's own registration seeded five
plan rows. **Session 2 owns the precise inventory and must say whether a
discrepancy is a fact about the query or about the spec**; this session
only needed the *set* of canonical tokens, which is stable under those
deltas.

**The sibling audit found four bypass writers, and all four were routed.**
`contract_gate`, `path_aware_critique`, `dual_surface_verify` and
`suggestion_disposition` each do their own read-modify-write of
`activity-log.json` rather than going through `SessionLog`. Every one
already hard-coded `"complete"`, so none could drift at runtime today —
but an allowlist at one entry point is worthless if another path writes
the file directly (`L-069-1`), and "it happens to be a literal right now"
is not a guarantee. Each now spells the token from the shared
`STEP_STATUS_COMPLETE` constant and passes it through
`require_step_status`, so a future edit that parameterises the status
fails closed instead of quietly widening the vocabulary. A structural AST
scan over every production module enforces the same rule for a writer
nobody has written yet.

**Two doc files outside the spec's Touches list were updated, and why it
is not scope creep.** `docs/repository-reference.md` described
`session_log.py` as a *"legacy compatibility helper for older scripts"* —
which was tolerable prose while the module accepted anything, and is
actively wrong now that it is the strict writer and the home of the
vocabulary (`L-064-8`). `docs/ai-led-session-workflow.md` is where an
orchestrator learns to call `log_step`; a doc that shows the call without
naming the closed vocabulary guarantees the next session discovers the
constraint by crashing mid-flight. Both are one-paragraph corrections to
the surfaces that would otherwise teach the retired contract.

**Readers were not touched**, per standing decision 1, and one falsifier
asserts it: `session_checklist.STATUS_BOXES` still renders `done` as
`[x]`, still renders `completed` as `[?]`, and still refuses to crash on a
1,000-character prose status. History stays readable.

**What Session 2 inherits:**

1. **The strict writer does not fix the ~281 entries already on disk** —
   it only stops new ones. Session 2's ruling is still live and the
   inventory command is still owed. Note that the drift is concentrated:
   `completed` appears in 18 sets, `done` in 5, and eight of the nine
   prose blobs are in Set 110 alone (the ninth, 111 characters, is in
   Set 068).
2. **Absence is deliberately still allowed through `append_entry`.** A
   status-less bookkeeping entry is accepted, because "no status
   recorded" is a different defect from "a status no reader can name",
   and Session 3 owns it explicitly (`unknown` / `stale` /
   `unreadable`). Four such entries exist on disk, all in Set 028. If
   Session 3 wants absence refused at the writer too, that is a
   vocabulary decision to make on purpose, not a gap to patch quietly.
3. **The plan seeder swallows `ValueError`.** `session_checklist`'s
   `seed_plan_steps` wraps its `append_entry` loop in
   `except (OSError, ValueError, KeyError, TypeError, ImportError):
   return []`, and `InvalidStepStatusError` is a `ValueError`. The
   status it writes is a module constant that the vocabulary test locks,
   so there is no runtime path to a silent failure today — but a future
   change that makes the seeded status dynamic would fail open. Named
   here so it is a decision, not an oversight.
4. **Near-miss spellings are refused, not normalised.** `"Complete"` and
   `" complete"` raise, and the message names the token they meant. If
   Session 2's ruling turns out to want a normalising writer, that
   reverses a deliberate choice made here and should be journaled as
   such.

**Test budget:** the set's irony budget is 40 new test functions across
all three sessions. This session shipped **19** (50 parametrised cases) in
one module, `ai_router/tests/test_step_status_vocabulary.py`, leaving 21
for Sessions 2 and 3.
