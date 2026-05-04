# AI Assignment Ledger — 014-close-out-correctness-and-vsix-tracking

> **Note on routing for this set.** Standing operator instruction
> (recorded in orchestrator memory, 2026-05-01) restricts ai-router
> usage to end-of-session cross-provider verification only. The
> "always route, never self-opine" rule (workflow Rule 17) is
> deliberately suspended for the duration of this constraint, and the
> per-session `Recommended orchestrator`, `Rationale`, and
> `Next-session orchestrator recommendation` blocks below were
> authored directly by the orchestrator without a routed
> `task_type="analysis"` call. The deviation is recorded in the
> actuals on each session's block.

---

## Session 1: Close-out workflow correctness

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Session 1 lands two small Python correctness fixes against
`ai_router/session_state.py` and `ai_router/close_session.py` plus
five new tests covering the event-emission idempotency invariant and
the snapshot-flip ordering. The implementation surface is small
(~15 lines of production code, ~150 lines of tests) but the
correctness invariants are load-bearing: every multi-session set
going forward depends on `register_session_start` emitting
`work_started` exactly once and on `close_session`'s success path
flipping the snapshot to `closed` without needing `--repair`. Opus
at effort=high is overkill on volume but matches the precision
needed for the ordering invariant (event-before-flip mirrors
`mark_session_complete`'s precedent) and the lazy-import pattern
that has to match the existing `--repair` case-2 path. Sonnet at
medium would suffice but the verifier surface (idempotency,
ordering, lazy-import correctness, `None`-return handling, repair-
path interaction) tips the call to Opus for round-1 cleanliness.

### Estimated routed cost
$0.10–$0.30 — single end-of-session `session-verification` route.
Round 1 likely passes; round 2 possible if a test assertion or
docstring update needs tightening. No analysis routes per the
standing operator constraint.

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (`session_state.py`, `session_events.py`, `close_session.py`, existing tests) | Direct (orchestrator) |
| 2 | Register Session 1 start + manual `work_started` append (last hand-append) | Direct (file-write helper + manual `append_event`) |
| 3 | Author this `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | Implement (a): `register_session_start` emits `work_started` idempotently | Direct (Python edit) |
| 5 | Implement (b): `close_session` success-path snapshot flip via `_flip_state_to_closed` | Direct (Python edit) |
| 6 | Implement (c): five new tests (register_session_start: emits/idempotent/total_sessions; close_session: happy-path flip + multi-session-set end-to-end) | Direct (test authoring) |
| 7 | Implement (d): docstring touch-ups (`register_session_start` + `close_session.py` line 35) | Direct (mechanical edit) |
| 8 | Run full Python test suite (`python -m pytest`) | Direct (CLI invocation) |
| 9 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 10 | Handle verification result (fix issues if any; re-verify, max 2 retries) | Mixed: fixes are direct; re-verify is routed |
| 11 | Commit, push, run `close_session.py` | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high (matches recommendation)
- Total routed cost: $0.6353 — three `session-verification` calls via
  gpt-5-4. Round 1 attempt 1 ($0.2486) was lost because the
  orchestrator's Python wrapper crashed reading the wrong RouteResult
  attribute (`.cost` vs the actual `.total_cost_usd`) before the
  verdict was captured to a file — same bug Set 013 Session 2
  documented as a candidate `lessons-learned.md` note. Round 1
  attempt 2 ($0.2602) was the recovery call with defensive
  attribute-dump-first handling and returned ISSUES_FOUND with three
  items. Round 2 ($0.1264) returned VERIFIED with no issues after the
  three Round 1 fixes (production code: propagate `forced=` to
  `_flip_state_to_closed`; tests: ordering invariant test +
  forceClosed marker test + None-branch test). No analysis routes per
  the standing operator constraint.
- Deviations from recommendation: cost ran double the projected
  $0.10–$0.30 upper bound (actual $0.6353). Drivers:
  (1) Round 1 wrapper crash double-spend ($0.2486 lost) — the same
      pattern Set 013 Session 2 already flagged for a
      `lessons-learned.md` note. The fact that this still happens in
      Set 014 strengthens the case for actually writing that note +
      possibly a small `safe_route()` wrapper that materializes the
      RouteResult to a file *before* any attribute access.
  (2) Round 2 was needed because Round 1 surfaced three real issues —
      one production bug (the missing `forced=` propagation, which is
      a load-bearing fix for the `--force` forensic marker
      contract from Set 9 Session 3 D-2) and two missing test
      assertions (the ordering invariant and the None-branch). All
      three fixes were small (~30 lines of test code + 1 line +
      comment block of production code), but the verifier was right
      to flag them — without them the regression surface for future
      refactors would have been wider than acceptable.
- Notes for next-session calibration: the verifier's Round 1 was
  thorough enough to find a real production bug (Issue 2) that
  neither the spec nor the tests caught — confirming the "verifier
  finds production bugs the orchestrator missed" pattern that the
  cross-provider workflow exists to surface. The `forceClosed` marker
  bug is exactly the kind of subtle coupling between independent
  features (Set 9 Session 3's D-2 marker contract + Set 14 Session 1's
  flip-on-success wiring) that single-provider development tends to
  miss because both pieces feel "obviously correct" in isolation.
  Session 2's surface is much narrower (gitignore semantics + README
  text + sideload smoke test), so the projected $0.05–$0.15 cost
  shape should hold; one round, no production-code surprises expected.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Session 2 is mechanical — `.gitignore` carve-out + force-add
of an existing VSIX + two README path corrections + a sideload
smoke test. Verification surface is narrow:
gitignore semantics (negative patterns), README path accuracy, VSIX
manifest version match. Sonnet at medium effort would handle this
cleanly. Opus at high effort is overkill for the volume but matches
Session 1's choice for handoff consistency and matches the
operator's typical preference. Cost projection: $0.05–$0.15, single
end-of-session verification call, Round 1 typically passes for this
category of mechanical work. (Pessimistic upside: if the verifier
finds a subtle gitignore-semantic edge case, Round 2 might be
needed; that would push the cost toward the upper bound but not
beyond it.)

---

## Session 2: VSIX tracking exception + README accuracy

### Recommended orchestrator
*(to be authored at the start of Session 2)*

### Rationale
*(to be authored at the start of Session 2)*

### Estimated routed cost
*(to be authored at the start of Session 2)*

### Actuals (filled after the session)
*(to be backfilled at close-out)*
