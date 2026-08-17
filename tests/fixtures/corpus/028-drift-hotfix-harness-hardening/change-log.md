# Set 028: Drift-Class Hotfixes + Harness Hardening

**Status:** Complete (3 of 3 sessions, FINAL)  
**Duration:** ~55 minutes wall-clock (2026-05-16)  
**Cost:** ~$0.40 estimated (routing negligible; no cross-provider verification)

---

## Context

Set 027 shipped the three-layer orchestrator e2e harness and received cross-provider feedback (Gemini Pro + GPT-5-4). Three architectural issues were flagged as follow-up work suitable for a 3-session hotfix set:

1. **Fresh-set `completedSessions[]` omission** — `register_session_start()` intentionally skipped the key when no prior sessions were closed, creating schema inconsistency for Lightweight-tier orchestrators that manually maintain this array.

2. **Electron environment blocklist brittleness** — `_electronEnv()` blocked only known VS Code IPC vars. If new IDE vars (APPCODE_*, CURSOR_*, etc.) emerge without the `VSCODE_` prefix, they slip through silently. Allowlist is more maintainable.

3. **No CI test pipeline** — Only tag-triggered release workflows existed; no push/PR CI to catch regressions between releases.

---

## Session 1: Fix Fresh-Set `completedSessions[]` Schema

**Goal:** Always emit `completedSessions: []` on fresh-set first-session starts.

**Changes:**
- **ai_router/session_state.py (lines 237–242):** Removed `if prior_completed:` guard. Now unconditionally writes `state["completedSessions"] = prior_completed`, even when empty.
- **ai_router/tests/test_session_state_v2.py:** Added assertion that `completedSessions == []` in the fresh-set test.
- **ai_router/tests/e2e/test_register_session_start_regression.py:** Added new test `test_fresh_set_has_empty_completed_sessions()` that explicitly asserts the key is present and empty.
- **ai_router/tests/e2e/test_happy_3session.py:** Updated assertion to expect the new schema (removed "absent key = none closed" special case).
- **ai_router/CHANGELOG.md:** Added 0.3.2 entry explaining the schema normalization.
- **pyproject.toml:** Bumped 0.3.1 → 0.3.2.

**Backwards compatibility:** Existing readers that treat `completedSessions` as optional (defaulting to 0 done) are unaffected. Adding an explicit `[]` is a semantic no-op for those consumers.

**Test results:** All 40 pytest tests pass (8 e2e harness, 32 session_state tests).

---

## Session 2: Electron Environment Allowlist Refactor

**Goal:** Replace blocklist with explicit allowlist, future-proofing against IDE host pollution.

**Changes:**
- **tools/dabbler-ai-orchestration/src/test/playwright/electronLaunch.ts:**
  - Replaced `_ELECTRON_VAR_BLOCKLIST` + `_ELECTRON_PREFIX_BLOCKLIST` with three allowlists:
    - `_ELECTRON_VAR_ALLOWLIST_UNIVERSAL` — PATH, HOME, TEMP, LANG, TERM, COLORTERM
    - `_ELECTRON_VAR_ALLOWLIST_WINDOWS` — SYSTEMROOT, APPDATA, LOCALAPPDATA
    - `_ELECTRON_VAR_ALLOWLIST_GUI` — DISPLAY, WAYLAND_DISPLAY, XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS (Linux/macOS)
  - Refactored `_electronEnv()` to build allowed set from platform-specific sources, then copy only those vars from `process.env`.
- **tools/dabbler-ai-orchestration/CHANGELOG.md:** Added 0.13.17 entry describing the allowlist approach.
- **tools/dabbler-ai-orchestration/package.json:** Bumped 0.13.16 → 0.13.17.
- **dist/ + out/:** Recompiled (npm run compile && npx tsc).

**Rationale:** Blocklists require knowing all bad inputs in advance. If Microsoft or Cursor introduce new IPC vars without a known prefix, they pass through silently. Allowlists are invertible: only explicitly safe vars forward, reducing surface area and future-proofing against unknown IDE additions.

**Test results:** All 5 Playwright scenarios pass in ~90s (1m30s total).

---

## Session 3: GitHub Actions CI Matrix

**Goal:** Automate test execution on every push/PR across platforms.

**Changes:**
- **.github/workflows/test.yml (NEW):**
  - Matrix runs on ubuntu-latest, macos-latest, windows-latest for all pushes to master and PRs.
  - **Python tests:** `pip install -e .[tests] && python -m pytest` (Layer 1 + e2e).
  - **Playwright tests:** `npm run test:playwright` (Layer 3).
    - Linux: wrapped in `xvfb-run` (headless X11 framebuffer).
    - Windows/macOS: run directly.
    - Artifacts uploaded on failure (test-results/).
  - **Layer 2 intentionally skipped** — known broken on Windows 11 + VS Code 1.120 (@vscode/test-electron arg incompatibility), untested on macOS/Linux.
- **CLAUDE.md:** Added "Continuous Integration (Set 028 Session 3)" section documenting the workflow with platform-specific notes.
- **CLAUDE.md:** Updated extension version reference (0.13.16 → 0.13.17).

**CI readiness:** Workflow is ready to run on first push; all tests pass locally.

---

## Key Metrics

| Session | Focus | Test Coverage | Duration |
|---------|-------|----------------|----------|
| 1 | Python schema fix | 40 pytest tests (all pass) | ~20 min |
| 2 | Electron env allowlist | 5 Playwright tests (all pass, 1m30s) | ~20 min |
| 3 | GitHub Actions CI | Workflow scaffolded; tests verified locally | ~15 min |
| **Total** | | **45 tests verified** | **~55 min wall** |

---

## Cost Analysis

- **Development:** ~$0.00 (no ai_router routing during implementation)
- **Verification:** ~$0.00 (manual local testing; no cross-provider review needed)
- **Total Set 028 cost:** ~$0.40 estimated (within $4.00 NTE, <5% utilization)

---

## Drift Classes & Future Work

**Now fixed:**
- Fresh-set `completedSessions[]` omission (was Drift Class #1 from Set 027)
- Electron env blocklist brittleness (architectural hardening, not a bug)

**Unfixed, deferred:**
- **Force-closed mid-set downgrade** — Sets force-closed mid-flight stay in "In Progress" pending architectural decision on bucket assignment. Candidate for Set 029+ with targeted reader/writer work.

**CI gaps:**
- Layer 2 (@vscode/test-electron) not covered in CI due to upstream Windows breakage. If upstream fixes the arg incompatibility, Layer 2 CI is a candidate for Set 029+ follow-up.
- Playwright layer validated on Windows locally; macOS/Linux will get empirical coverage on first CI run.

---

## Git Commits

- **bb42d72** — Set 028 Session 1: Fix fresh-set completedSessions[] schema initialization
- **7baa92f** — Set 028 Session 2: Electron environment allowlist refactor
- **fd7cecd** — Set 028 Session 3: GitHub Actions CI matrix for test automation

---

## Handoff

All three sessions complete and committed to master. Release tags (v0.3.2, vsix-v0.13.17) can be cut per standard workflow. No outstanding blockers or follow-up orchestration dependency.
