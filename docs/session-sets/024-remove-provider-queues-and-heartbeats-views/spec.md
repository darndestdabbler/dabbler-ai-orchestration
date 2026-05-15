# Remove Provider Queues + Provider Heartbeats views from the extension

> **Purpose:** The Provider Queues and Provider Heartbeats views in
> the Dabbler AI Orchestration extension are scaffolding for the
> `outsourceMode: last` (subscription-CLI verifier daemon) path. No
> session set in this repo has ever declared `outsourceMode: last`
> (31-of-31 sets are outsource-first), and the operator's standing
> "routing surface is a real choice, not a fallback" memory documents
> a preference for API + IDE-agent routing over subscription-CLI
> daemons. The two views currently render persistent yellow-warning
> errors ("Failed to read queue status. queue_status exited 1 …")
> because there is no `provider-queues/` directory on disk for them
> to read, which is worse UX than empty.
>
> **Session Set:** `docs/session-sets/024-remove-provider-queues-and-heartbeats-views/`
> **Created:** 2026-05-15
> **Workflow:** Full
> **Prerequisite:** Set 023 closed (extension v0.13.13 + ai_router
> 0.2.5 shipped 2026-05-15). The deletion presumes no consumer is
> currently relying on the views.

---

## Session Set Configuration

```yaml
totalSessions: 1
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: none
effort: low
```

> Rationale: single-session scoped deletion. Bounded TS + package.json
> surface; the deletion is mechanical and the test surface shrinks
> rather than grows. Risk is unintentional removal of code another
> path imports — the cross-provider verification catches that.

---

## Decisions confirmed with the human (do not re-litigate)

1. **Full removal, not hide-behind-setting.** The operator explicitly
   chose option (A) "Full removal" from the scoping dialog
   (2026-05-15) over option (B) "Hide-only (keep code)" and option
   (C) "Remove outsource-last support end-to-end." The extension
   loses the two views; the Python-side CLI surface
   (`ai_router/queue_status.py`, `ai_router/heartbeat_status.py`)
   **stays** because option (C) was not chosen — operators who run
   outsource-last in other repos can still use those CLI commands
   directly.

2. **The shared activity-bar container stays.** Both removed views
   shared `dabblerSessionSetsContainer` with the main Session Sets
   view; the container is kept because the Session Sets view still
   needs it.

3. **No deprecation grace period.** The views error out today, so
   there is no working behavior to deprecate gracefully. Removal is
   the kindest thing for the operator's UI.

4. **Settings under `dabblerProviderQueues.*` and
   `dabblerProviderHeartbeats.*` are removed.** Six settings total
   (queues: `autoRefreshSeconds`, `pythonPath`, `messageLimit`;
   heartbeats: `autoRefreshSeconds`, `lookbackMinutes`,
   `silentWarningMinutes`). The `dabblerSessionSets.pythonPath`
   description mentions a fallback to `dabblerProviderQueues.pythonPath`
   — that fallback line is removed from the markdown description,
   but the setting itself stays.

5. **Open VSX dual-publish is unchanged.** v0.13.14 ships through
   the same tag-driven workflow as v0.13.13.

---

## Architecture

### What gets deleted

**TypeScript source files** (delete entirely):

- `tools/dabbler-ai-orchestration/src/providers/ProviderQueuesProvider.ts`
- `tools/dabbler-ai-orchestration/src/providers/ProviderHeartbeatsProvider.ts`
- `tools/dabbler-ai-orchestration/src/commands/queueActions.ts`
- `tools/dabbler-ai-orchestration/src/test/suite/providerQueues.test.ts`
- `tools/dabbler-ai-orchestration/src/test/suite/providerHeartbeats.test.ts`

**`package.json` entries removed:**

- Two `views` entries (`dabblerProviderQueues`, `dabblerProviderHeartbeats`).
- Five `commands` entries (`dabblerProviderQueues.refresh`,
  `dabblerProviderQueues.openPayload`,
  `dabblerProviderQueues.markFailed`,
  `dabblerProviderQueues.forceReclaim`,
  `dabblerProviderHeartbeats.refresh`).
- Corresponding `menus/view/title` and `menus/view/item/context`
  entries (4 total).
- Six configuration properties under
  `dabblerProviderQueues.*` and `dabblerProviderHeartbeats.*`.

**`extension.ts` changes:**

- Remove the two `vscode.window.createTreeView(...)` calls for the
  queue / heartbeat views.
- Remove the auto-refresh setInterval wiring tied to the two
  `autoRefreshSeconds` settings.
- Remove imports of the deleted provider classes.
- Remove the `session-events.jsonl` file watcher's call into the
  queue / heartbeat providers (the main Session Sets view's watcher
  call stays).

**`installAiRouterCommands.ts` and supporting helpers:**

- Remove the post-install smoke checks that invoke `queue_status` /
  `heartbeat_status` (if present). The install command still
  installs the Python package; the smoke check loses two probe
  targets and continues to verify the core CLI works (e.g., via
  `ai_router --version` or equivalent).

**`utils/pythonRunner.ts`:**

- Remove the `runQueueStatus` / `runHeartbeatStatus` helpers if
  they exist. Keep generic helpers used by other commands.

**`installAiRouter.test.ts`:**

- Remove the test cases that assert the queue / heartbeat smoke
  checks ran.

### What stays

- `ai_router/queue_status.py` and `ai_router/heartbeat_status.py` —
  Python CLI surface for outsource-last operators in other repos.
  Not removed; their tests stay green.
- `ai_router/docs/two-cli-workflow.md` — operating guide for the
  outsource-last path. Not removed; the extension's UI for the path
  is gone, but the path itself remains documented for operators who
  set up the verifier daemon by hand.
- The shared activity-bar container (`dabblerSessionSetsContainer`).
- Everything related to the Session Sets view and the AI-Router
  install command.

---

## Sessions

### Session 1 of 1: Strip the two views + their settings

**Goal:** Remove the Provider Queues and Provider Heartbeats views
from the extension entirely. Ship as extension v0.13.14.

**Steps:**

1. Delete the five TypeScript source files listed in § Architecture →
   "What gets deleted" → "TypeScript source files."
2. Edit `tools/dabbler-ai-orchestration/package.json`:
   - Remove the two `views` entries for the queue / heartbeat views.
   - Remove the five `commands` entries.
   - Remove the four `menus` entries that gate on the removed views.
   - Remove the six configuration properties under
     `dabblerProviderQueues.*` and `dabblerProviderHeartbeats.*`.
   - Remove the fallback sentence from
     `dabblerSessionSets.pythonPath`'s markdown description (the
     "Falls back to `dabblerProviderQueues.pythonPath` if unset"
     clause).
3. Edit `tools/dabbler-ai-orchestration/src/extension.ts`:
   - Remove imports of `ProviderQueuesProvider` /
     `ProviderHeartbeatsProvider` / `queueActions` (or whatever the
     module exports).
   - Remove the `vscode.window.createTreeView(...)` calls for both
     views.
   - Remove the auto-refresh `setInterval` wiring tied to the two
     `autoRefreshSeconds` settings (and any disposable
     registrations associated with them).
   - Remove the file-watcher fanout that triggers refreshes on the
     two providers.
4. Edit `tools/dabbler-ai-orchestration/src/commands/installAiRouterCommands.ts`
   and `tools/dabbler-ai-orchestration/src/utils/pythonRunner.ts`:
   - Remove `queue_status` / `heartbeat_status` probe calls and
     helpers.
   - The install command still installs `dabbler-ai-router` from
     PyPI (or fallback) and verifies the core CLI works; the two
     daemon-related probes go away.
5. Edit `tools/dabbler-ai-orchestration/src/test/suite/installAiRouter.test.ts`:
   - Remove test cases that asserted the queue / heartbeat smoke
     checks ran.
6. Bump extension to v0.13.14 — `package.json`, `package-lock.json`,
   `CHANGELOG.md` (new `## [0.13.14] — YYYY-MM-DD` section with the
   removal documented), `CLAUDE.md` (Current line).
7. Compile + run the extension's unit test suite (`npm run compile`
   + `npx tsc --outDir out`). Expect a smaller test surface; no new
   tests added by this session (deletion-only).
8. Manual smoke test in a Development Host window:
   - Open the Dabbler activity-bar icon.
   - Confirm the Session Sets view still works (refresh, open spec,
     etc.).
   - Confirm the Provider Queues and Provider Heartbeats panels
     are gone from the side bar.
   - Confirm VS Code Settings → Extensions → Dabbler AI Orchestration
     no longer shows the six removed settings.
9. Cross-provider verification (`session-verification` route).

**Creates:** none

**Touches:**
- Deletes 5 TS files (listed above)
- `tools/dabbler-ai-orchestration/package.json`
- `tools/dabbler-ai-orchestration/package-lock.json`
- `tools/dabbler-ai-orchestration/CHANGELOG.md`
- `tools/dabbler-ai-orchestration/src/extension.ts`
- `tools/dabbler-ai-orchestration/src/commands/installAiRouterCommands.ts`
- `tools/dabbler-ai-orchestration/src/utils/pythonRunner.ts`
- `tools/dabbler-ai-orchestration/src/test/suite/installAiRouter.test.ts`
- `CLAUDE.md`

**Ends with:** Provider Queues and Provider Heartbeats no longer
appear in the extension UI. The persistent "Failed to read queue
status" / "Failed to read heartbeat status" warning triangles are
gone. Six settings disappear from `Settings → Extensions → Dabbler
AI Orchestration`.

**Progress keys:** `session-001/delete-ts-files`,
`session-001/package-json-strip`,
`session-001/extension-ts-strip`,
`session-001/install-commands-strip`,
`session-001/version-bump`,
`session-001/compile-and-smoke-test`,
`session-001/verification`

**Release:** VS Code Marketplace
`DarndestDabbler.dabbler-ai-orchestration` v0.13.14 via the
existing tag-driven workflow (`git tag vsix-v0.13.14 && git push
--tags`; approve the `marketplace` deployment in the GitHub
Actions UI per
`docs/planning/marketplace-release-process.md`).

---

## Risks

- **Consumer surprise.** A consumer who *was* using the views (e.g.,
  `dabbler-platform`'s operator) loses the UI. Mitigation: the views
  have been erroring out persistently for the operator on this repo;
  no consumer is known to be relying on a working version. If
  feedback surfaces post-release, the views are reversible from git
  history (commit before this set + the deletion diff) — restore via
  a `v0.13.15`.

- **Hidden import.** A non-obvious file might import one of the
  deleted modules. Mitigation: `npm run compile` will fail loudly on
  any stranded import; the cross-provider verifier will also flag
  any inconsistent module graph.

- **`installAiRouter` smoke test regresses.** Removing the
  `queue_status` / `heartbeat_status` probes reduces the install
  command's post-install confidence. Mitigation: keep a single core
  CLI check (e.g., `python -m ai_router --version` or an equivalent
  no-op import) so the install command still produces a binary
  yes-no answer about whether the install worked.

- **Open VSX vs. Marketplace divergence.** Both registries get the
  same VSIX; no divergence risk.

---

## Routing notes

- **Effort-low** — single-session, deletion-only, no new algorithms.
- **Session 1** (TypeScript deletion + package.json edits): Claude
  Opus 4.7 — has the surrounding-code context to confirm no
  stranded imports.

---

## Success criteria

After this set closes:

1. The Dabbler AI Orchestration activity-bar icon shows **only**
   the Session Sets view; the Provider Queues and Provider
   Heartbeats panels are gone.
2. `Settings → Extensions → Dabbler AI Orchestration` lists 4
   settings (down from 10): the 5
   `dabblerSessionSets.*` settings and **zero** `dabblerProviderQueues.*`
   / `dabblerProviderHeartbeats.*` settings.
3. `npm run compile` + `npx tsc --outDir out` produce no errors and
   no warnings about unused imports.
4. The unit-test suite passes with a smaller test surface (queue +
   heartbeat suites removed).
5. The persistent warning-triangle UX in the side bar is gone.
6. `ai_router/queue_status.py` and `ai_router/heartbeat_status.py`
   still pass their own Python tests (untouched by this set).
