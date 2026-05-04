# Close-out workflow correctness + VSIX tracking exception

> **Purpose:** Close out three pre-existing close-out / distribution gaps surfaced during Set 013's close-out. (1) `register_session_start` writes the snapshot but does not emit a `work_started` event to the session-events ledger, so for any session N>1 the close-out gate's idempotency check sees the prior session's `CLOSED` lifecycle state on the highest-numbered session and short-circuits with `noop_already_closed`. The orchestrator currently has to hand-append the event before close-out will run — every multi-session set hits this. (2) `close_session`'s success path emits `closeout_succeeded` but never calls `mark_session_complete` / `_flip_state_to_closed`, so `session-state.json` is left at `lifecycleState: work_in_progress` even though the events ledger says the session closed. The orchestrator currently has to run `close_session --repair --apply` as a separate corrective step. The script's own docstring (line 35) says "Set 4 adds that wiring" but Set 4 never delivered it; Set 010's close-out and every multi-session set since hit the same drift and used `--repair` as a workaround. (3) Repo-root README directs users to "Pull this repo so you have the VSIX file locally," but `.gitignore` blocks `*.vsix` and no VSIX has ever been tracked in git history — so the README's promise is currently false and Set 013's spec instruction to commit the 0.12.1 VSIX "alongside source, matching the existing 0.12.0.vsix artifact pattern" was uncommittable as written.
> **Created:** 2026-05-04
> **Session Set:** `docs/session-sets/014-close-out-correctness-and-vsix-tracking/`
> **Prerequisite:** Set 013 (adoption-bootstrap-prompt) — closed, on master at this set's creation time. The 0.12.1 VSIX exists locally (`tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix`, 331 KB) from Set 013 Session 2's build; Session 2 of this set commits it under the new `.gitignore` exception.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: two distinct concerns, each focused. Session 1 is Python correctness work in `ai_router/` (event emission + snapshot-flip wiring) with unit tests. Session 2 is a `.gitignore` carve-out + an `git add -f` of the existing VSIX + a tiny README cleanup. Splitting them keeps Session 1's verification surface focused on Python behavior and Session 2's on file-tracking + doc accuracy, neither of which is mechanically tied to the other. No UAT — both sessions ship Python / configuration changes the workflow's existing tests cover. No E2E — the close-out flow's behavior is exercised by Set 014 itself (Session 2 closes the set using the Session 1 fixes; if those fixes regress, Session 2's own close-out is the test).

---

## Project Overview

### What the set delivers

**Session 1 — close-out workflow correctness** (the recurring orchestrator papercuts):

**(a)** `register_session_start` in `ai_router/session_state.py` appends a `work_started` event to `session-events.jsonl` for the session being registered. Idempotent: if a `work_started` event for that session number already exists in the ledger, do not append a second one (covers the orchestrator-restart case where `register_session_start` is called twice). Best-effort: a write failure raises out of `append_event` and `register_session_start` propagates it — the snapshot write happens AFTER the event append, so a failed event leaves the snapshot un-flipped and the next call retries cleanly.

**(b)** `close_session.py`'s success path (the existing `_run_main_flow` / `_finalize_success` path that already emits `closeout_succeeded`) calls `_flip_state_to_closed` after the `closeout_succeeded` event is appended. This is the long-deferred Set 4 wiring promised at line 35 of `close_session.py`'s module docstring. The flip is gated on the same conditions that guard the `--repair` case-2 path: only flip when the events ledger's lifecycle state for the most recent session is `CLOSED` and the snapshot disagrees. The `_flip_state_to_closed` import is the same lazy-import pattern the `--repair` path uses today (line 1063). Update the module docstring to remove the "Set 4 adds that wiring" forward-reference; replace with a one-line "snapshot flip lives in `_flip_state_to_closed`" cross-reference.

**(c)** Tests for both new behaviors. `register_session_start` tests: append-on-first-call; idempotent-on-second-call; `total_sessions` propagation still works; the work_started event carries the session number. `close_session` happy-path test: a one-session set whose disposition is set, change-log present, gates pass — after `close_session` runs, `session-state.json` has `lifecycleState: closed` and `status: complete` without needing `--repair`. Multi-session set test: session 1 closes cleanly (snapshot flipped); session 2 starts (work_started event appears, snapshot back to in_progress); session 2 closes cleanly (snapshot flipped to closed). The latter exercises both fixes end-to-end.

**(d)** Docstring touch-ups in `register_session_start` (mention the work_started emission) and `close_session.py` line 35 (remove stale Set-4-pending forward reference).

**Session 2 — VSIX tracking exception** (the README ↔ .gitignore conflict):

**(e)** `.gitignore`: keep the broad `*.vsix` rule (extension repos in general should not commit build artifacts), and add an explicit exception:

```
*.vsix
!tools/dabbler-ai-orchestration/*.vsix
```

The exception is narrow — only the published extension's VSIX directory — so a future Python wheel build, a developer's stray local VSIX from a fork-test, etc., still gets ignored. Negative-pattern semantics in `.gitignore` only re-include files whose containing directory is not itself ignored, so this is safe.

**(f)** Force-add the existing `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix` (331 KB, built by Set 013 Session 2). With the gitignore exception in place, this is `git add` not `git add -f`. The VSIX becomes the canonical sideload artifact.

**(g)** Repo-root README and extension README cross-checks: the existing line `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.0.vsix` (referenced in the install-from-VSIX section) is updated to `0.12.1` so the path users follow matches what's actually in the repo. Also remove the older `-0.10.0.vsix` / `-0.11.0.vsix` references in the extension README's "Pre-built VSIX" entry — those VSIXes never existed in git either, and now that the path is honest, calling out non-existent rollback files just confuses readers.

**(h)** Verify the README's "pull and sideload" promise actually works post-fix: check out the master branch into a clean directory, confirm `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix` is present, and confirm `code --install-extension <path-to-vsix>` (or the Extensions-view "Install from VSIX" path) succeeds against the committed file. The smoke test is a clean-clone walk-through; the actual VS Code install side is described but not driven (no headless-VS-Code in this repo).

### Motivation

Every multi-session set going forward will hit Session 1's two papercuts unless they're fixed at the source. Set 013 spent ~10 minutes of Session 2 on the manual append + manual --repair workaround, and the close-out instructions for future maintainers either need to document the workaround forever or fix it once. The fix is small (probably ~15 lines of Python + tests) and the workflow contract is already documented — the implementation just hasn't caught up.

The README ↔ .gitignore conflict for the VSIX is a separate concern but lands well alongside the close-out fixes: same maintainer attention, same close-out flow exercises both. Without the fix, the README's adoption-flow promise is broken — a new user pulling the repo and following the install instructions would hit a 404 at the path the README names. That's the exact opposite of what Set 013 was trying to achieve (smooth adoption onboarding), so it's worth landing as a follow-on cleanup.

### Non-goals

- **No restructure of the close-out workflow itself.** The fix wires `close_session`'s success path into the existing `_flip_state_to_closed` helper. We do not rewrite the gate, the verification-wait, or the lifecycle-state derivation.
- **No deletion of `--repair --apply`.** The repair path remains useful for incident recovery (a crash mid-flip leaves the same drift Set 014 Session 1 is fixing in the steady-state path; `--repair` still cleans up after a crash). Session 1 fixes the steady-state path; the diagnostic / repair path is unchanged.
- **No backward compat shims for older `session-events.jsonl` files** that lack `work_started` events for prior sessions. The events ledger is append-only and the lifecycle-state derivation already handles missing-`work_started` (returns `None` for empty event log; treats highest-numbered session's events as authoritative). New sets get `work_started` from registration onward; legacy sets keep working under the existing derivation rules.
- **No changes to `mark_session_complete`'s public surface.** Session 1 wires `close_session` into `_flip_state_to_closed` (the internal gate-bypass helper) directly, matching the `--repair` path's choice for the same reason (the events ledger already records `closeout_succeeded` — re-running the gate would either redundantly validate or fail on transient drift the gate would surface).
- **No removal of the `*.vsix` gitignore rule.** The carve-out is narrow on purpose: only `tools/dabbler-ai-orchestration/*.vsix` is re-included. Other repo directories and forks still ignore VSIXes by default.
- **No automated VSIX-version-vs-package.json sanity check.** A future set could add a CI step that verifies the committed VSIX's manifest version matches `package.json`'s version, but that's a CI scope and out of band for this set.
- **No Marketplace publish.** Set 012 Session 2 still owns the publish.
- **No `0.12.2` release.** The committed VSIX is 0.12.1 (Set 013's build); this set commits the existing artifact, not a new one.

---

## Naming decisions

- **Set slug:** `014-close-out-correctness-and-vsix-tracking`. Inserted after Set 013, ahead of any Set 012 follow-up.
- **No version bump for the extension.** Session 2 commits the existing 0.12.1 VSIX; `package.json` already says 0.12.1 from Set 013.
- **No new public API symbol from `ai_router`.** Session 1 modifies the existing `register_session_start` and `close_session` flow; nothing new is exported.

---

## Session Plan

### Session 1 of 2: Close-out workflow correctness

**Goal:** Land work blocks (a)–(d) — `register_session_start` emits `work_started`; `close_session`'s main success path flips the snapshot via `_flip_state_to_closed`; tests; docstring touch-ups. End state: future multi-session sets close cleanly via `close_session` alone, with no manual event appends and no `--repair --apply` workaround.

**Steps:**

1. **Read prerequisites.** `ai_router/session_state.py` (`register_session_start`, `_flip_state_to_closed`, `_propagate_total_sessions`). `ai_router/session_events.py` (`append_event`, `current_lifecycle_state`, `EVENT_TYPES`). `ai_router/close_session.py` (especially the success path around `closeout_succeeded` emission, lines ~1480–1540, and the `--repair` case-2 path around lines 1045–1075 that already does the flip Session 1 promotes to the main path). `ai_router/docs/close-out.md` (Section 1 ownership contract; if the wiring change affects the contract's "close-out does idempotent state writes" line, the doc gets a one-line cross-reference update). The existing tests in `ai_router/tests/test_close_session_*.py` and `ai_router/tests/test_session_state.py` for shape and naming conventions.
2. **Register session start.** Standard `register_session_start()` call (currentSession=1, totalSessions=2). Note: the call uses the *current* (un-fixed) version of `register_session_start` that does NOT emit `work_started` — Session 1 has to manually append the event to its own ledger after the registration so that close-out works at the end. The fix lands in this session but does not retroactively apply to this session's own start; that's acceptable since the orchestrator emits the event by hand exactly once. (Alternative: the orchestrator does a quick monkey-patch / direct append before calling `register_session_start`. Either way, the last hand-append for this set lives here.)
3. **Author `ai-assignment.md`.** Direct authoring per standing operator constraint (router suspended mid-session).
4. **Implement work block (a) — `register_session_start` emits `work_started`.** In `ai_router/session_state.py`, after the snapshot file is written and before `_propagate_total_sessions` is called, check the existing events ledger for an existing `work_started` event with this session number (read via `read_events`); if absent, call `append_event(session_set, "work_started", session_number)`. Idempotency-on-retry is the load-bearing piece — orchestrator restarts must not double-emit. The append is best-effort with respect to a missing session-set directory (the same `os.path.isdir` guard the existing `mark_session_complete` event-emission uses).
5. **Implement work block (b) — `close_session` happy path flips the snapshot.** In `ai_router/close_session.py`, after `closeout_succeeded` is emitted on the success path (the existing `_emit_event(..., "closeout_succeeded", ...)` call), import `_flip_state_to_closed` lazily (matching the `--repair` case-2 import pattern) and call it. The call mirrors what `--repair --apply` case-2 does today: `_flip_state_to_closed(session_set_dir)`. Append a `messages` line so the human-readable / JSON output reports the flip explicitly. If the flip helper returns `None` (no state file to flip), surface a warning message but do not fail close-out — the events ledger is the canonical record.
6. **Implement work block (c) — tests.**
   - `test_session_state.py::test_register_session_start_emits_work_started` — fresh session set, call `register_session_start(...)`, assert `read_events(...)` contains exactly one `work_started` event with the right session number.
   - `test_session_state.py::test_register_session_start_idempotent_on_repeat` — call twice; assert exactly one `work_started` event.
   - `test_session_state.py::test_register_session_start_total_sessions_still_propagates` — guard against regression of the existing `_propagate_total_sessions` behavior.
   - `test_close_session_*.py::test_close_session_happy_path_flips_snapshot` — set up a one-session set, run `close_session` end-to-end, assert `session-state.json` shows `lifecycleState: closed` / `status: complete` post-close (no `--repair` invocation).
   - `test_close_session_*.py::test_close_session_multi_session_set_clean` — two-session set where session 1 closes, session 2 starts (via `register_session_start` with the new event emission), session 2 closes — assert no manual event appends or `--repair` calls were needed. This is the regression test that proves Set 014 fixes Set 013's papercut end-to-end.
7. **Implement work block (d) — docstring touch-ups.** `register_session_start`'s docstring mentions the new event-emission behavior (one extra paragraph). `close_session.py` line 35 — replace "This script does not yet wire into mark_session_complete. Set 4 adds that wiring." with "Snapshot-flip lives in `_flip_state_to_closed`, called from the success path after `closeout_succeeded` is appended."
8. **Run the full Python test suite.** Confirm no regressions in pre-existing tests. The new tests bring the close-out test count up by ~5.
9. **End-of-session cross-provider verification.** Verifier reviews:
   - **`register_session_start` event-emission correctness.** Idempotency on repeat call; correct session number; correct event type; ordering (event appended before snapshot write means an event-write failure leaves the snapshot un-flipped — verify the code does this in the right order, mirroring the `mark_session_complete` precedent).
   - **`close_session` success-path flip correctness.** Does the flip happen on the correct branch (the one that emits `closeout_succeeded`, not the `closeout_failed` branch)? Is the lazy-import correct for both `import session_state` and `from .session_state import` paths? Does the call site handle a `None` return (no state file) gracefully?
   - **Test coverage.** Are the test assertions specific (event type, session number, event count) rather than incidental? Does the multi-session-set test exercise both fixes end-to-end as advertised?
   - **Docstring updates.** Are they accurate post-fix? Does line 35's replacement avoid creating a new stale forward-reference?
   - **Idempotency / repair-path interaction.** With the main path now flipping, does `--repair --apply` case-2 still work for the legacy-drift case (an old set whose Session 4 / Set 010 flip happened separately)? Verify the `--repair` path still triggers when called explicitly even if there's no main-path-driven drift to repair.
10. **Commit, push, run close-out.** Standard close-out via the new code path. The first multi-session run of the new code is THIS very session set, but Session 1's close is the *first* session of a 2-session set, so it doesn't exercise the multi-session-handoff fix yet (Session 2's start does). Session 2's close exercises both fixes end-to-end.

**Creates (Session 1):** `docs/session-sets/014-close-out-correctness-and-vsix-tracking/ai-assignment.md`. New tests under `ai_router/tests/`.

**Touches (Session 1):** `ai_router/session_state.py` (`register_session_start` event emission), `ai_router/close_session.py` (success-path flip + line-35 docstring), `ai_router/docs/close-out.md` (one-line cross-reference if Section 1's ownership contract needs it — likely not, since the snapshot flip stays inside close-out's "idempotent state writes" responsibility).

**Ends with:** `register_session_start` emits a `work_started` event idempotently; `close_session` happy path flips the snapshot to closed without `--repair`; tests for both pass; the full Python test suite passes; cross-provider verification returns `VERIFIED` (or clean after at most one fix round); Session 1 closes via the new code path.

**Progress keys (Session 1):** the new tests pass; running `close_session` on a fresh test set transitions `session-state.json` to `lifecycleState: closed` in a single invocation; calling `register_session_start` twice on the same session writes exactly one `work_started` event.

---

### Session 2 of 2: VSIX tracking exception + README accuracy

**Goal:** Land work blocks (e)–(h) — `.gitignore` carve-out, force-add the existing 0.12.1 VSIX, README path corrections, post-fix sideload smoke test. End state: a fresh clone of master contains the 0.12.1 VSIX at the path the repo-root README names; the README's adoption-flow promise actually works.

**Steps:**

1. **Read prerequisites.** Current `.gitignore` (the `*.vsix` rule lives at line 6). Repo-root `README.md` (the section that names the VSIX path — currently `dabbler-ai-orchestration-0.12.0.vsix`). Extension `README.md` (the "Pre-built VSIX" reference and any older-version rollback bullets). Confirm `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix` exists locally (Set 013 Session 2 build artifact, gitignored).
2. **Register session start.** Standard `register_session_start()` call (currentSession=2, totalSessions=2). Now using the Set 014 Session 1 code, this call also appends the `work_started` event automatically — first real exercise of the fix.
3. **Author Session 2 block in `ai-assignment.md`.** Direct authoring per standing operator constraint. Backfill Session 1 actuals from close-out.
4. **Update `.gitignore`** with the carve-out:
   ```
   *.vsix
   !tools/dabbler-ai-orchestration/*.vsix
   ```
   Verify with `git check-ignore -v tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix` — should return no match (file no longer ignored).
5. **`git add` the existing 0.12.1 VSIX.** With the carve-out in place, this is a normal add, not `--force`. Confirm via `git status` that the VSIX shows up as a tracked new file.
6. **Update repo-root `README.md` VSIX path references** from `dabbler-ai-orchestration-0.12.0.vsix` to `dabbler-ai-orchestration-0.12.1.vsix` so the path users follow matches what's actually in the repo. Any reference to "Older VSIXes (-0.10.0.vsix, -0.11.0.vsix) are kept alongside for rollback" gets removed — those VSIXes have never been in git history, so naming them as available is misleading.
7. **Update extension `README.md`** if the same path / older-VSIX language appears there (per Session 2's prerequisite read).
8. **Run extension test suite.** No code changes in this session, but the test suite is the cheapest sanity check that nothing accidentally got staged.
9. **Sideload smoke test.** A clean-clone walk-through of the README's adoption section:
   - `git clone <repo URL> /tmp/dabbler-test-clone` (or PowerShell equivalent).
   - Confirm the named VSIX file is present at the README's documented path.
   - Confirm `npx vsce ls` (or the equivalent VSIX-manifest extractor) on the cloned VSIX prints version `0.12.1` and includes the `dabbler.copyAdoptionBootstrapPrompt` command from Set 013.
   - The actual VS Code "Install from VSIX" step is documented but not driven (no headless VS Code in this repo's test infrastructure). The smoke test stops at "the VSIX is at the path and has the right manifest."
10. **End-of-session cross-provider verification.** Verifier reviews:
    - **`.gitignore` semantics.** Does the carve-out re-include only `tools/dabbler-ai-orchestration/*.vsix` and nothing else? Test with `git check-ignore` against representative paths (the existing VSIX, a hypothetical sibling fork's VSIX, a hypothetical Python wheel — only the first should resolve as "tracked").
    - **README path accuracy.** Does every VSIX-path reference in both READMEs match what's actually in the repo post-commit? Are the older-version rollback claims removed if they were misleading?
    - **VSIX manifest sanity.** Does the committed VSIX's manifest match `package.json`'s 0.12.1 version + the new command + the new keywords? (This is the same check Set 013's smoke test ran.)
    - **No stray gitignore exceptions.** The carve-out is narrow; verify it doesn't accidentally re-include other artifacts (Python wheels, test-output VSIXes from a fork-test, etc.).
    - **End-to-end flow.** Does Session 1's close-out flow run cleanly on Session 2's close (the multi-session-set regression test in production)? Is the `work_started` event for session 2 in the events ledger? Did `session-state.json` flip on close without `--repair`?
11. **Commit, push, run close-out.** This **is** the last session — `change-log.md` is written and summarizes both sessions. The close-out is the live test of Session 1's fixes; the cross-provider verification call above also reviews whether the close-out shape actually worked.

**Creates (Session 2):** `docs/session-sets/014-close-out-correctness-and-vsix-tracking/change-log.md` (close-out, summarizes both sessions). The 0.12.1 VSIX as a tracked file.

**Touches (Session 2):** `.gitignore` (carve-out), repo-root `README.md` (path corrections), `tools/dabbler-ai-orchestration/README.md` (if needed), `docs/session-sets/014-close-out-correctness-and-vsix-tracking/ai-assignment.md` (Session 2 block).

**Ends with:** the carved-out VSIX is tracked in git; the README's documented path resolves to a real file in a fresh clone; cross-provider verification confirms that Session 1's close-out fixes worked on Session 2's actual close; `change-log.md` summarizes both sessions; the set is closed.

**Progress keys (Session 2):** `git ls-files tools/dabbler-ai-orchestration/*.vsix` returns the 0.12.1 file; `git check-ignore` against unrelated `.vsix` paths still ignores; the README's path text matches the committed file; Session 1's fixes drove Session 2's close-out without manual workarounds.

---

## Acceptance criteria for the set

- [ ] `register_session_start` appends a `work_started` event to `session-events.jsonl` for the registered session, idempotent against repeat calls.
- [ ] `close_session`'s success path flips `session-state.json` to `complete` / `closed` via `_flip_state_to_closed` after the `closeout_succeeded` event is emitted.
- [ ] `close_session.py` line-35 docstring no longer claims "Set 4 adds that wiring"; replacement points to the now-implemented flip.
- [ ] New tests cover: register_session_start emits/once/idempotent + total_sessions still propagates; close_session happy path flips snapshot; multi-session-set end-to-end flow runs cleanly without manual event appends or `--repair`.
- [ ] Full Python test suite passes; no regressions in pre-existing tests.
- [ ] `.gitignore` exempts `tools/dabbler-ai-orchestration/*.vsix` while preserving the broad `*.vsix` rule.
- [ ] `tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix` is a tracked file on master.
- [ ] Repo-root and extension README VSIX-path references all match what's actually in the repo (0.12.1, no spurious older-version rollback claims).
- [ ] Sideload smoke test (clean clone + manifest inspection) confirms the README's adoption-flow promise works post-fix.
- [ ] Cross-provider verification returns `VERIFIED` on both sessions; verifier explicitly confirms (a) the event-emission idempotency invariant; (b) the snapshot-flip happens on the correct (closeout_succeeded, not closeout_failed) path; (c) the `.gitignore` carve-out scope is narrow as intended.
- [ ] `change-log.md` summarizes the set in the standard close-out format.
- [ ] Session 2's own close-out runs cleanly via Session 1's new code path with no manual workarounds — the regression test in production.

---

## Risks

- **`register_session_start` event-emission ordering subtly wrong.** If the event is emitted before the snapshot write and the event write succeeds but the snapshot write fails, the events ledger says "session N is in progress" but no snapshot exists. Mitigation: match the existing `mark_session_complete` ordering (event before flip — the event is the audit trail, the snapshot is the consumer-readable cache; if the snapshot is missing on next read, regenerate from the events). This is the documented invariant; we're following the same shape.
- **`close_session` success-path flip introduces a snapshot/ledger crash window.** If `_flip_state_to_closed` is called after `closeout_succeeded` is emitted and the flip itself crashes (disk full mid-write, lock contention), the events ledger will say closed and the snapshot will say in-progress — exactly the drift state Set 014 is fixing. Mitigation: this is the same drift `--repair --apply` already handles; the next close_session call (or `--repair`) cleans it up. The new code is no worse than the status quo on crash.
- **The `.gitignore` carve-out re-includes more than intended.** Negative patterns in `.gitignore` are subtle; an over-broad exception could re-include forks' build artifacts, sibling-directory VSIXes, etc. Mitigation: the exception is anchored to a single absolute-from-repo-root directory (`tools/dabbler-ai-orchestration/`), not a glob like `**/*.vsix`. Tested with `git check-ignore` against multiple paths in Session 2 step 4.
- **Committing a 331 KB binary into the repo bloats history and adds churn for every future VSIX.** Each new release adds ~330 KB. Across the next 20 versions that's ~7 MB of immutable git history, which is not nothing for a small repo. Acceptable trade-off for now — the README's adoption-flow promise is load-bearing for the bootstrap entry point Set 013 just shipped, and a 7 MB history at the rate of one VSIX per release is fine. A future set could move to GitHub Releases artifacts (which is the actual VS Code Marketplace pattern) and relink the README; deferred until adoption volume justifies the migration cost.
- **Set 014 Session 1's own start hits the bug it's fixing.** The close_session for Session 1 will need the same hand-append + `--repair` workaround Set 013 used, until Session 2's start exercises the fix. This is acceptable — the orchestrator pays the workaround cost one more time, and Session 2 onward never does. Alternative would be doing Session 1 against a temp branch and merging post-fix; not worth the complexity.
- **README VSIX-version drift.** Future releases bump the version but might forget to update the README's `0.12.1` path reference. This is a manual-discipline risk regardless of Set 014. A future CI step could validate the README references match `package.json`'s version; deferred per non-goals.
- **The carved-out VSIX path doesn't survive a Marketplace publish.** Once Set 012 Session 2 ships the extension to the Marketplace, the recommended install path becomes "search Marketplace" rather than "pull repo + install VSIX." The README will need a path-change anyway (Set 012 Session 2 / 3's scope). Set 014's tracked-VSIX pattern still works for users without Marketplace access (offline, fork-trackers, pre-release testing); Set 012's README shrink reframes the VSIX as a fallback.

---

## References

- Set 013 (`013-adoption-bootstrap-prompt`) — the close-out flow that surfaced all three follow-ups; `change-log.md`'s "Residual notes / follow-ups for next set" lists them.
- Set 010 (`010-pypi-publish-and-installer`) — close-out commit `05a927c` ("Session 3 close-out: events + flip snapshot to complete/closed (set 010 final)") is the most recent prior workaround for follow-up 3, applied as an explicit additional commit after the close-out succeeded.
- `ai_router/docs/close-out.md` — Section 1's ownership contract names "idempotent state writes" as close-out's responsibility; the snapshot flip falls under that line.
- `ai_router/close_session.py` line 35 — module docstring's "Set 4 adds that wiring" forward-reference, removed by Session 1.
- `ai_router/close_session.py` lines 1045–1075 — the `--repair` case-2 path that Session 1 promotes to the main success path.
- `ai_router/session_state.py` `register_session_start` (line 139) and `mark_session_complete` (line 267) — the two functions Session 1 modifies (the latter is a precedent for ordering: event before snapshot mutation).

---

## Cost projection

Per-session estimates (single end-of-session cross-provider route; no analysis routes per the standing operator cost-containment rule):

| Session | Estimated cost | Notes |
|---|---|---|
| 1 — Close-out workflow correctness | $0.10–$0.30 | Python correctness work with tests; verifier walks the event-emission idempotency invariant, the snapshot-flip ordering, the test assertions, and the docstring updates. Modest verification surface (~3 source files + 2 test files). Round 1 likely passes; Round 2 possible if test assertions or docstring updates need tightening. |
| 2 — VSIX tracking + README accuracy | $0.05–$0.15 | Light verification: gitignore semantics, README path accuracy, manifest version match. Mostly mechanical; Round 1 typically passes for this category of work. |
| **Set total** | **$0.15–$0.45** | Two sessions; about one half of Set 013's $0.72 actual, since neither session has the "doc-as-runtime-instruction-set" verification density that drove Set 013 Session 1's four rounds. |
