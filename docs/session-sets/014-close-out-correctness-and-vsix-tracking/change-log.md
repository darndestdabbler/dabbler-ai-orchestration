# Set 014 — Close-out Correctness and VSIX Tracking (Change Log)

**Status:** complete · 2 of 2 sessions verified
**Started:** 2026-05-04 · **Completed:** 2026-05-04
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — both sessions
**Verifier:** gpt-5-4 (cross-provider, both sessions)

This set closes three pre-existing gaps surfaced during Set 013's
close-out: two close-out workflow correctness fixes that every
multi-session set since Set 010 has worked around manually, and a
README/`.gitignore` conflict where the repo-root README directed users
to a VSIX path that was blocked from ever being committed. After Set
014, future multi-session sets close cleanly via `close_session` alone
(no manual `work_started` event append, no `--repair --apply`
follow-up commit), and the README's "pull this repo so you have the
VSIX locally" adoption promise resolves to a real file.

## Summary of changes

### Session 1 — Close-out workflow correctness (Python)

**Goal:** Land the long-deferred Set 4 wiring (`close_session` success
path flips the snapshot to closed) plus the matching event-emission
fix in `register_session_start` (auto-emit `work_started` so the
close-out gate's idempotency check sees the right lifecycle state on
multi-session sets).

- **`ai_router/session_state.py`** — `register_session_start` now
  appends a `work_started` event to `session-events.jsonl` for the
  registered session before writing the snapshot. Idempotent against
  orchestrator-restart (existing-event check via `read_events`);
  ordering invariant mirrors `mark_session_complete` (event before
  mutation, so a failed event leaves the snapshot un-flipped).
  `os.path.isdir` guard matches the existing `mark_session_complete`
  precedent. Docstring extended with an "Events emission" section.
- **`ai_router/close_session.py`** — success path (after the existing
  `closeout_succeeded` emit, around line 1595) now lazy-imports
  `_flip_state_to_closed` and calls it with `forced=bool(args.force)`.
  The `forced=` propagation is a load-bearing fix: without it,
  `--force` close-outs would silently skip the `forceClosed: true`
  forensic marker that Set 9 Session 3 D-2 contracts to the VS Code
  Session Set Explorer's `[FORCED]` badge. The flip is gate-bypass
  (matches the `--repair --apply` case-2 pattern at lines 1046–1075)
  since the events ledger already records `closeout_succeeded` for
  the session; re-running the gate via `mark_session_complete` would
  either redundantly validate or fail on transient drift. `None`
  return from the helper surfaces a warning message but does not
  fail close-out (events ledger is canonical). Line-35 module
  docstring's stale "Set 4 adds that wiring" forward-reference was
  replaced with a current pointer to `_flip_state_to_closed`.
- **`ai_router/tests/test_session_state_v2.py`** — four new tests for
  `register_session_start`: emits `work_started`; idempotent on
  repeat; `total_sessions` still propagates; emits event before
  snapshot write (monkey-patches `append_event` to raise and asserts
  the snapshot was not created).
- **`ai_router/tests/test_close_session_snapshot_flip.py`** (new file)
  — six integration tests against a real-git-repo + bare-remote
  fixture: happy-path snapshot flip; ordering test for
  `closeout_succeeded` emit before flip; `forceClosed` marker test
  for `--force` close-outs; missing-state-file `None`-branch test;
  no-`--repair`-needed test; multi-session-set end-to-end (the
  regression test for Set 013's papercut).
- **`ai_router/tests/test_mark_session_complete_gate.py`** — one
  assertion in `test_failure_emits_no_event` was narrowed to filter
  out `work_started` (now emitted by `register_session_start` per
  Set 014 (a)). The test's actual intent (no closeout events on
  gate-fail) is preserved.
- **Cross-provider verification:** routed to gpt-5-4 across **two**
  rounds plus one lost attempt. Round 1 attempt 1 ($0.2486) was lost
  to the same `RouteResult` wrapper-crash bug Set 013 Session 2
  documented (orchestrator's Python wrapper read `.cost` instead of
  `.total_cost_usd` before capturing the verdict). Round 1 attempt 2
  ($0.2602) returned `ISSUES_FOUND` with three items; all addressed.
  Round 2 ($0.1264) returned `VERIFIED`. Production fix from Round 1:
  the missing `forced=` propagation to `_flip_state_to_closed` —
  exactly the kind of subtle cross-feature coupling (Set 9 D-2
  marker contract × Set 14 flip-on-success wiring) the cross-provider
  workflow exists to surface.
- **Cost:** $0.6353 across three routed `session-verification` calls
  via gpt-5-4. Spec projected $0.10–$0.30; actual was double the
  upper bound. Drivers: (1) wrapper-crash double-spend ($0.2486 lost)
  — this is now the **second** time the same pattern has cost real
  spend, strengthening the case for the lessons-learned note Set 013
  flagged. (2) Round 2 needed because Round 1 surfaced three real
  issues (one production bug + two missing test invariants), all
  fixed in ~30 lines of test code + 1 line of production code +
  comment block.

### Session 2 — VSIX tracking exception + README accuracy

**Goal:** Carve a narrow `.gitignore` exception for the published
extension's VSIX directory, commit the existing 0.12.1 VSIX (built by
Set 013 Session 2) at the path the repo-root README documents, and
correct three stale `0.12.0.vsix` references plus a misleading
"Older VSIXes for rollback" claim.

- **`.gitignore`** — added `!tools/dabbler-ai-orchestration/*.vsix`
  immediately after the broad `*.vsix` rule. Negative-pattern scope
  is narrow: only direct-child VSIXes in that one directory are
  re-included; sibling directories' VSIXes still ignored under
  `*.vsix`. Verified with `git check-ignore -v` against five paths
  (0.10.0, 0.11.0, 0.12.0, 0.12.1 VSIXes in the carved-out dir all
  resolve as not-ignored; sibling-dir VSIXes still ignored).
- **`tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix`**
  (339,038 bytes) — added as a tracked file via plain `git add`
  (the carve-out made `-f` unnecessary). The VSIX was built by
  Set 013 Session 2; manifest and bundled `extension/package.json`
  were verified byte-identical to the committed
  `tools/dabbler-ai-orchestration/package.json` (provenance:
  `diff` returned exit 0). The older `0.10.0`, `0.11.0`, `0.12.0`
  local-build VSIXes were left untracked per spec — only 0.12.1 is
  the canonical sideload artifact going forward.
- **`README.md`** (repo-root) — three sites updated:
  - Line 388 (installation instructions, "VSIX file locally"):
    `0.12.0.vsix` → `0.12.1.vsix`.
  - Line 395 (installation instructions, "Browse to and select"):
    `0.12.0.vsix` → `0.12.1.vsix`.
  - Line 702 (repo-layout table row): file-anchor and label both
    bumped to 0.12.1; the misleading "Older VSIXes (`-0.10.0.vsix`,
    `-0.11.0.vsix`) are kept alongside for rollback" sentence was
    deleted (those VSIXes have never been in git history; the
    sentence promised a rollback path that did not exist).
- **`tools/dabbler-ai-orchestration/README.md`** — checked, no edit
  needed. The extension README's only VSIX mention is `npm run
  package` (build-from-source); no version-specific path references.
  The spec text said "extension README's Pre-built VSIX entry" but
  the misleading text was actually in the repo-root README — minor
  spec wording drift, no repo-content impact.
- **Sideload smoke test:** clean clone of the committed state into
  a temp directory; confirmed the 0.12.1 VSIX is at the documented
  path, manifest version is `0.12.1`, `package.json` version is
  `0.12.1`, and Set 013's `dabbler.copyAdoptionBootstrapPrompt`
  command is present in `contributes.commands`. The actual VS Code
  "Install from VSIX" UI step was described but not driven (no
  headless VS Code in this repo's test infrastructure) — same
  caveat the spec called out.
- **Set 014 Session 1 fix exercised in production:** Session 2's
  `register_session_start` was called via the standard helper with
  no manual event append. The events ledger immediately afterward
  showed exactly one `work_started` event for `session_number: 2`,
  emitted by the function itself — the first real exercise of
  Session 1's fix, and it worked. Session 2's close-out (which
  generated this `change-log.md`) was the live test of Session 1's
  snapshot-flip wiring.
- **Cross-provider verification:** routed to gpt-5-4, **R1 returned
  VERIFIED** with no blockers. Verifier flagged two minor optional
  hardening items, both addressed inline before close-out: (a) ran
  the broader README scan (`grep -nE '0\.(12\.0|11\.0|10\.0|9\.0)'
  README.md`) — zero hits, all version-path references are 0.12.1;
  (b) ran the VSIX-vs-committed `package.json` provenance diff —
  byte-identical, no drift.
- **Cost:** $0.1028 in a single routed `session-verification` call
  via gpt-5-4. Spec projected $0.05–$0.15; actual landed in the
  middle of the band. Round 1 typically passes for this category
  of mechanical work — confirmed.

## Cumulative cost

- **Session 1:** $0.6353 (3 rounds session-verification via gpt-5-4 — see Session 1 cost note above)
- **Session 2:** $0.1028 (1 round, R1 VERIFIED)
- **Set total:** $0.7381 (vs. spec projection $0.15–$0.45; ~64% over,
  driven entirely by Session 1's wrapper-crash double-spend +
  Round 2 production-bug fixes; Session 2 landed in band as
  projected)

## Files committed in this set

**New:**

- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/spec.md`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/ai-assignment.md`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/disposition.json`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-state.json`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/activity-log.json`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-events.jsonl`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-reviews/session-001-prompt.md` (+r2)
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-reviews/session-001.md` (+r2)
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-reviews/session-002-prompt.md`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-reviews/session-002.md`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-reviews/session-002-raw.json`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/session-reviews/route_session2.py`
- `docs/session-sets/014-close-out-correctness-and-vsix-tracking/change-log.md` (this file)
- `ai_router/tests/test_close_session_snapshot_flip.py`
- `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix`

**Modified:**

- `ai_router/session_state.py` (`register_session_start` event-emission block + docstring)
- `ai_router/close_session.py` (success-path snapshot flip + module docstring line-35 replacement)
- `ai_router/tests/test_session_state_v2.py` (four new register_session_start tests)
- `ai_router/tests/test_mark_session_complete_gate.py` (narrowed one assertion to filter `work_started`)
- `.gitignore` (carve-out for `tools/dabbler-ai-orchestration/*.vsix`)
- `README.md` (three VSIX-path corrections + misleading-rollback-claim deletion)

## Residual notes / follow-ups for next set

1. **`lessons-learned.md` candidate is now overdue.** The
   `RouteResult` wrapper-crash pattern has cost real spend in
   **two consecutive sets** now (Set 013 Session 2: $0.0898 lost
   to `.model` vs `.model_name`; Set 014 Session 1: $0.2486 lost
   to `.cost` vs `.total_cost_usd`). The defensive
   `dump-RouteResult-to-JSON-before-attribute-access` pattern
   (used in Set 014 Session 2's `route_session2.py` — survived
   without crash) is the right shape. Worth promoting to either
   a `lessons-learned.md` note or a small `safe_route()` wrapper
   that materializes the result to a file as part of the call.
2. **Stale `tools/dabbler-ai-orchestration/out/` git tracking.**
   `npm run compile` (and `npm test`, which compiles) produces
   diff churn in committed `out/` artifacts because `out/` is not
   gitignored but has tracked files. A future small set could add
   `tools/dabbler-ai-orchestration/out/` to `.gitignore` and
   untrack the existing files via `git rm --cached`. Out of scope
   for Set 014 (separate concern; not on the recurring-papercut
   list).
3. **Extension test infrastructure on Windows.** `npm test`
   (test-electron path) and `npm run test:unit` (mocha) both fail
   on this host with environment-specific issues (VS Code 1.118.1
   launcher-flag rejection; mocha BDD/TDD UI mismatch). Pre-existing
   and not in Set 014 scope (Session 2 touched no extension source
   files), but the lack of a working extension test runner is a
   real gap for any future extension-source work. Worth a future
   set to either fix the Windows runner config or stand up a
   CI-only test path.
4. **Older local VSIXes (`0.10.0`, `0.11.0`, `0.12.0`) now visible
   to `git status`.** The carve-out re-includes them; the operator
   may want to delete them locally to silence the noise, or commit
   them for actual rollback access (the spec's intent was to keep
   only 0.12.1 as the canonical artifact, but the README no longer
   makes any rollback promise — so delete is the cleanest path).
5. **Spec wording drift.** The spec referenced "the extension
   README's Pre-built VSIX entry" but the actual misleading text
   was in the repo-root README. Audit-precision only — no
   repo-content impact, no fix required, but flagged here for
   future-set spec authors.
6. **Set 012 Sessions 2–3 still queued.** The operator-paused Set
   012 Session 2 (Marketplace publish) remains the next natural
   step; Session 3 (README shrink) follows. Both can proceed with
   confidence now that the close-out workflow lands cleanly without
   manual workarounds.
