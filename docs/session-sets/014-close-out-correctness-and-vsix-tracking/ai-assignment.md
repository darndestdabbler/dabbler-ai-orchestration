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
claude-code claude-opus-4-7 @ effort=high

### Rationale
Session 2 is mechanical — `.gitignore` carve-out + `git add` of an
existing VSIX + two README path corrections + a sideload smoke test.
Verification surface is narrow: gitignore semantics (negative-pattern
re-include scope), README path accuracy across two files, VSIX
manifest version match. Sonnet at medium effort would handle this
cleanly; Opus at high effort is overkill for the volume but matches
Session 1's choice for handoff consistency and matches the
operator's typical preference recorded in Session 1's actuals. The
load-bearing piece is also the live regression test of Set 014
Session 1's fixes: Session 2's own `register_session_start` already
exercised the new `work_started` auto-emission (verified by the
events ledger before this block was authored), and Session 2's
close-out will exercise the new snapshot-flip wiring. If those
fixes regress, Session 2's close fails or requires `--repair` —
the multi-session set test in production. The operator's standing
constraint (router restricted to end-of-session verification) is
in force; per-session orchestrator-recommendation routing remains
suspended.

### Estimated routed cost
$0.05–$0.15 — single end-of-session `session-verification` route.
Round 1 typically passes for this category of work (gitignore +
README + manifest). Round 2 unlikely but possible if the verifier
finds a subtle gitignore-semantic edge case or a stale README
reference the orchestrator missed. Defensive `RouteResult`
dump-to-file before any attribute access, per the wrapper-crash
pattern Session 1 documented in actuals (cost the orchestrator
$0.2486 on a single attempt). No analysis routes per the standing
operator constraint.

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Register Session 2 start (exercises Set 014 Session 1's `work_started` auto-emission) | Direct (file-write helper; no manual append needed — first real exercise of the fix) |
| 2 | Author this Session 2 block in `ai-assignment.md` | Direct (router suspended per operator) |
| 3 | Edit `.gitignore`: keep `*.vsix`, add `!tools/dabbler-ai-orchestration/*.vsix` carve-out | Direct (one-line config edit) |
| 4 | Verify carve-out scope with `git check-ignore -v` (0.12.1 VSIX should resolve as not-ignored; sibling paths still ignored) | Direct (CLI invocation) |
| 5 | `git add tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix` | Direct (CLI invocation) |
| 6 | Edit repo-root `README.md` at three sites: lines 388, 395, 702 — bump `0.12.0.vsix` → `0.12.1.vsix`; delete misleading "Older VSIXes ... rollback" sentence on line 702 | Direct (mechanical edit) |
| 7 | Confirm extension `tools/dabbler-ai-orchestration/README.md` has no stale version-specific VSIX path; edit only if needed | Direct (read + edit) |
| 8 | Run extension test suite (`npm test`) as a sanity check | Direct (CLI invocation) |
| 9 | Sideload smoke test: clone master into temp dir; confirm 0.12.1 VSIX present at the path the README names; extract manifest and confirm version `0.12.1` + Set 013's `dabbler.copyAdoptionBootstrapPrompt` command + new keywords | Direct (CLI invocation) |
| 10 | End-of-session cross-provider verification (`session-verification` route) | Routed: single API call this session |
| 11 | Handle verification result; address issues if any (≤2 retries) | Mixed: fixes are direct; re-verify is routed |
| 12 | Author `change-log.md`; commit, push, run `python -m ai_router.close_session` (live regression test of Session 1's snapshot-flip fix — should close cleanly without `--repair`) | Direct (CLI invocation) |

### Actuals (filled after the session)
*(to be backfilled at close-out)*
