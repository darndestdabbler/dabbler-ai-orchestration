# Set 029 Session 3 spec delta (DRAFT — for operator review)

> **Status:** Authored 2026-05-18 from cross-provider audit findings
> (Gemini Pro + GPT-5.4 manual paste). Replaces the existing
> `### Session 3 of 4` section in
> `docs/session-sets/029-orchestrator-model-effort-gauges/spec.md`
> verbatim. Operator reviews; if approved, I apply directly to
> spec.md (no further audit round needed since the changes track
> the audit verdicts exactly).
>
> **Audit artifacts:**
> - `docs/proposals/2026-05-18-per-workspace-orchestrator-markers/proposal.md`
> - `consensus-gemini-pro.json` + `consensus-gpt-5-4-manual.md`
> - Synthesis in conversation 2026-05-18; GPT-5.4 verdict treated
>   as authoritative for the three divergences (marker list trim,
>   path normalization, empty-state copy).
>
> **Drift fixes folded in:** version-bump target (0.13.18→0.14.0 →
> corrected to 0.14.2→0.14.3 reflecting S2 ship), Playwright path
> (`tests/playwright/...` → `src/test/playwright/...`), and S3
> visual references (DEFAULT pill / operator-icon overlay both
> dropped in S2 round 3/8 polish — references purged below).

---

### Session 3 of 4: Per-workspace markers + non-Claude detection + manual override + session-set awareness

**Goal:** Three substantive additions to the v0.14.2 Claude-only
preview:

1. **Fix the cross-window contamination bug** by moving from a
   single global marker (`~/.dabbler/current-orchestrator.json`)
   to per-workspace markers (`~/.dabbler/orchestrators/<hash>.json`).
   Each VS Code window's gauge reads its own workspace's marker;
   the gauges no longer lie across parallel sessions.
2. **Add the three non-Claude detection paths** per the Session 1
   audit's locked resolutions: Codex auto-detect via
   `~/.codex/config.toml` watcher (configured-default signal);
   Gemini Code Assist and GitHub Copilot manual-only in v1 (no
   documented persisted state). Universal manual-override quickpick
   with MRU + hotkey-bindable args.
3. **Surface which session set the operator is working on** in the
   indicator's bottom display (active set name + current/next
   session number + title).

The per-workspace work is FIRST because it's foundational: the
non-Claude writers (Codex config watcher, manual override) all need
to use the new path-resolution logic. The session-set awareness is
LAST because it's reader-side only and additive.

**Steps:**

1. **Per-workspace marker scheme — writer side.** Update
   `scripts/write-orchestrator-marker.js` to resolve a workspace-
   specific marker path before any read/write/atomic-rename
   operation:

   - **Storage layout:** `~/.dabbler/orchestrators/<hash>.json`,
     where `<hash>` is the first 16 hex characters of
     `SHA-256(normalized_workspace_root)`. Sessions outside any
     workspace fall back to `~/.dabbler/orchestrators/_global.json`.
   - **Workspace-root detection from `cwd`** — STRICTER than the
     initial proposal per GPT-5.4 cross-provider audit finding Q1
     (Gemini's recommendation to expand the marker list was
     rejected — nested language manifests like
     `tools/dabbler-ai-orchestration/package.json` would
     incorrectly classify nested package directories as workspace
     roots, recreating the identity-drift bug in a different form):
     - **Strong markers (primary):** presence of `.git` directory
       OR `.git` file (gitfile worktree case); presence of any
       `.code-workspace` file in the directory.
     - **Weak marker (fallback only):** presence of a `.vscode/`
       directory.
     - **DO NOT use as identity markers:** `package.json`,
       `pyproject.toml`, `Cargo.toml`, `go.mod`, `tsconfig.json`,
       `pom.xml`, `build.gradle`, `*.sln`. These often live in
       nested package directories below the actual VS Code
       workspace root.
     - Walk-up algorithm: start at `cwd`; at each level, check for
       strong markers first; on first match, return that level.
       If reached `/` or `$HOME` without strong markers, walk up
       again only checking for `.vscode/`. If still no match,
       fall back to `_global.json`. The fallback is "best-effort,
       not correctness-grade" — explicitly document this in the
       marker writer's comments + the CHANGELOG.
   - **Canonical path normalization contract** — per GPT-5.4
     audit finding Q7, writer and reader MUST normalize the
     workspace root IDENTICALLY before hashing:
     1. `fs.realpathSync(path)` if the path exists (resolves
        symlinks); otherwise use the raw path.
     2. `path.resolve(...)` to ensure absolute.
     3. Strip trailing path separators (`replace(/[\/\\]+$/, "")`).
     4. On Windows (`process.platform === "win32"`): case-fold to
        lowercase (`.toLowerCase()`) to handle drive-letter casing
        and case-insensitive filesystem identity.
     5. Replace Windows backslashes with forward slashes for hash
        input consistency (`.replace(/\\/g, "/")`).
     The same five-step normalization is implemented in TS in the
     provider so writer and reader arrive at byte-identical input
     to the hash function. Both sides share a tiny unit-tested
     `normalizeWorkspacePath()` helper.
   - **Schema bump to v3** with new `workspaceRoot` field at the
     top level. Per both reviewers (Q6), this is a real semantic
     break and warrants the version bump:
     ```json
     {
       "schemaVersion": 3,
       "workspaceRoot": "/c/users/denmi/source/repos/dabbler-ai-orchestration",
       "updatedAt": "...",
       "signalKind": "current",
       ... (rest of v2 schema unchanged)
     }
     ```
     The reader verifies that the loaded marker's `workspaceRoot`
     matches the candidate folder it was looking up — guards
     against a stale cross-workspace marker accidentally being
     read (defense-in-depth).
   - **Multi-writer precedence + retry-loop + atomic-write semantics
     unchanged** — they now operate on the per-workspace path
     instead of the global one.
   - **Backward compatibility:** the legacy global
     `~/.dabbler/current-orchestrator.json` is no longer read or
     written. v0.14.2 hasn't shipped to Marketplace, so hard
     cutover is acceptable. Operators with the v0.14.2 hook
     installed must re-run "Install Orchestrator Hook (Claude
     Code)" to pick up the new path-resolution logic. Re-install
     is idempotent.

2. **Per-workspace marker scheme — reader side.** Update
   `src/providers/orchestratorIndicatorProvider.ts`:

   - **Path resolution** matches the writer's normalization
     contract above (shared helper).
   - **Multi-root iteration** per both reviewers' Q2 verdict — the
     reader inspects ALL `vscode.workspace.workspaceFolders`,
     hashes each path through the canonical normalization, and
     checks the filesystem for matching `<hash>.json` files.
     Selection is deterministic: pick the marker with the freshest
     `updatedAt` among existing matches. If none of the workspace
     folders has a marker, fall back to `_global.json`.
   - **Identity verification:** after loading a candidate marker,
     verify its `workspaceRoot` field matches the folder it was
     looked up for. Mismatch → discard and try the next candidate.
   - **FileSystemWatcher binds to the resolved per-workspace
     path** so a write from Window A's hook doesn't fire Window B's
     watcher. The poll backstop also re-evaluates the workspace
     resolution (in case the operator opens a different workspace
     in the same window mid-session).
   - **Updated empty-state copy** per GPT-5.4 audit finding Q4 —
     "missing marker" no longer implies "hook not installed":
     - Primary line: `No signal for this workspace yet.`
     - Secondary line: `Start Claude Code here, or install the
       hook if you have not set it up.`
     - "Install hook" remains as an action but is no longer the
       sole diagnosis.
   - **Note on stale-marker cleanup** per GPT-5.4 audit finding Q5
     and architectural principle: **do NOT prune stale per-
     workspace markers from the render path.** UI rendering must
     not have side effects on unrelated workspaces' marker files.
     If cleanup is needed later, it goes in the writer or in an
     explicit maintenance pass — out of scope for v1.

3. **Codex detection (auto).** Read `~/.codex/config.toml` on
   extension activation and via filesystem watcher. Parse `model`
   and `model_reasoning_effort` fields. Resolve the workspace root
   from the currently-active VS Code workspace (NOT from a hook's
   `cwd`, since this watcher fires from the extension, not from a
   shell hook). Write marker via the shared helper with
   `signalKind: "configured-default"`, `confidence: "medium"`,
   `effort.signalKind: "configured-default"`. **Document honestly**
   in the model-table description: `Codex gpt-5-codex (configured
   default), high effort` (no thinking clause — Codex has no
   native thinking concept per S1 audit Q3). Marker writer
   automatically inherits the multi-writer precedence policy — a
   `configured-default` write will be skipped if a fresher
   `current`/`manual`/`last-observed` signal exists.

4. **Gemini Code Assist: manual-only.** Per S1 audit Q2 — no
   documented persisted state. The `Dabbler: Install Orchestrator
   Hook (Gemini Code Assist)` command opens the manual-override
   quickpick with `provider: "google"` pre-selected. No actual
   hook is installed.

5. **GitHub Copilot: manual-only.** Per S1 audit Q4 — old settings
   keys deprecated, no current public key. The `… (GitHub
   Copilot)` command opens the manual-override quickpick with
   `provider: "github"` pre-selected. No actual hook installed.

6. **Manual-override quickpick** (`dabbler.setOrchestrator`):
   - **Top section: MRU tuples**, one row per recent
     `<provider> + <model> + <effort> + <thinking>` combination
     ("Anthropic Opus 4.7 — High effort, Thinking on"), sorted
     most-recent first. Selecting a tuple applies it directly.
     Stored in `~/.dabbler/orchestrator-mru.json` (still global —
     MRU is per-operator, not per-workspace).
   - **Bottom row: "(set new combination…)"** — enters a multi-
     step flow (provider → model → effort → thinking on/off) for
     novel combinations.
   - Both paths write the marker with `signalKind: "manual"`,
     `confidence: "high"` via the shared helper — using the per-
     workspace marker path resolved from the currently-active VS
     Code workspace.
   - **Force-override semantics:** if the helper detects a fresher
     `current`-precedence signal from another writer, the
     quickpick shows a "Override existing live signal from
     <writer>?" confirmation before proceeding.
   - **Command palette args** for hotkey-bindable presets per S1
     audit E4. Example: operator binds `Ctrl+Shift+Alt+O` to
     `dabbler.setOrchestrator` with args
     `{"provider":"anthropic","model":"claude-opus-4-7","effort":"high","thinking":true}`
     for one-keystroke "back to Opus full power."
   - "(create new hotkey binding)" item below the multi-step
     entry: copies the `keybindings.json` snippet to clipboard
     pre-filled with the current selection.

7. **Session-set awareness in the indicator** (Part A from the
   2026-05-18 round-11 design discussion). The indicator's bottom
   display gains an additional section that surfaces the active
   session set for the current workspace:

   - **Source of truth:** reuse the existing `readAllSessionSets()`
     helper (`src/utils/fileSystem.ts`). Filter to in-progress
     sets within the current workspace's discovered roots.
   - **Selection rule:** if exactly one set is in-progress, show
     it. If multiple, show the most-recently-touched
     (`lastTouched` field on `SessionSet`). If none, omit the
     section entirely.
   - **Display format** (matches the existing inverted-band
     section pattern from S2 round 9/10):
     ```
       ACTIVE SET
     029-orchestrator-model-effort-gauges
     Session 3: Per-workspace markers + non-Claude detection
     ```
     The set-name line uses the set's directory name (slug). The
     session line is `Session N: <title>` where N is
     `liveSession.currentSession` if non-null, else
     `max(completedSessions) + 1` (the next-to-start session),
     and the title comes from the v3 `sessions[]` array.
   - **No editing surface** — the indicator only displays;
     changing the active set happens via the existing Session Set
     Explorer tree.
   - **When mismatch is also present** (operator's current
     orchestrator differs from ai-assignment.md recommendation):
     the panel stacks three sections — ACTIVE SET, ACTUAL MODEL,
     SUGGESTED. The inverted-band header pattern handles the
     visual hierarchy.

8. **Smart empty-state CTA.** Webview detects which orchestrator
   extensions/CLIs are installed (presence of Claude Code, Gemini
   Code Assist extension, Codex CLI on PATH, GitHub Copilot
   extension) and surfaces the *right* installer/preset command
   in the empty state's secondary action — not a generic install-
   hook link. The primary copy (`No signal for this workspace
   yet.`) is invariant; the secondary line points at the most-
   likely-relevant install action.

9. **Playwright smoke expansion.** Add scenarios at
   `src/test/playwright/orchestrator-indicator.spec.ts` (NOT
   `tests/playwright/...` — drift correction):
   - **Per-workspace separation:** seed Window A's workspace
     marker with Opus, Window B's with Haiku; assert the indicator
     in each window shows its own workspace's marker. This
     requires the harness to launch two Electron instances OR to
     simulate the multi-workspace scenario within one instance
     by toggling workspaces.
   - **Multi-root reader iteration:** create a multi-root
     workspace with two folders, marker in folder B only; assert
     the reader finds it via iteration.
   - **Path normalization smoke:** verify that writer + reader
     normalize the same input path identically (unit-test the
     `normalizeWorkspacePath()` helper on each side).
   - **Workspace-root field verification:** seed a marker whose
     `workspaceRoot` field doesn't match its filename hash;
     assert the reader discards it and renders the empty state.
   - **Codex `configured-default`** — verify the description
     reads `Codex gpt-5-codex (configured default), high effort`
     in the model-section-text (replaces the dropped DEFAULT pill
     assertion from S2; no `.default-pill` exists post-round-3).
   - **Manual override write** — invoke the quickpick with
     `provider: "google"` preset, assert the marker writes with
     `signalKind: "manual"` and the gauge renders without any
     special manual-only decoration (round-7 simplification —
     manual renders identically to current).
   - **MRU quickpick reordering** — write 3 manual overrides,
     reopen quickpick, assert MRU order.
   - **Force-override prompt** — seed `current` Claude marker,
     invoke manual-override, assert the "Override existing live
     signal from <writer>?" confirmation appears.
   - **Multi-writer precedence skip** — write `current` then
     write `configured-default`, assert the `configured-default`
     write is skipped and a line is appended to
     `orchestrator-writer.log`.
   - **Session-set awareness rendering:** seed a workspace with
     an in-progress session set, assert the ACTIVE SET section
     renders with the correct slug + session number + title.

10. **Version bump:** `0.14.2 → 0.14.3` (drift correction — was
    `0.13.18 → 0.14.0` in the pre-S2 spec, but S2 actually
    shipped 0.14.2). 0.14.3 is a minor patch on the Claude-only
    preview; 0.15.0 (the multi-provider GA) lands in Session 4 if
    S3 closes clean.

11. **CHANGELOG entry** under `[0.14.3]`:
    - Per-workspace markers — fixes cross-window contamination
      bug; lists the strict workspace-root detection rules; notes
      backward-incompatibility (re-install hook required).
    - Path normalization contract — Windows case-fold,
      separator handling, etc.
    - Non-Claude detection (Codex auto, Gemini/Copilot manual).
    - Manual-override quickpick with MRU + hotkey-bindable args.
    - Session-set awareness in the indicator.
    - Updated empty-state copy.
    - Stale-marker cleanup intentionally NOT implemented (per
      audit Q5 — premature optimization).

**Creates:**

- `tools/dabbler-ai-orchestration/src/commands/installOrchestratorHookGemini.ts`
  (opens manual-override quickpick with `provider: "google"`
  pre-selected — no actual hook installed)
- `tools/dabbler-ai-orchestration/src/commands/installOrchestratorHookCopilot.ts`
  (opens manual-override quickpick with `provider: "github"`
  pre-selected — no actual hook installed)
- `tools/dabbler-ai-orchestration/src/commands/setOrchestratorManual.ts`
  (universal manual-override quickpick; replaces the round-3 stub)
- `tools/dabbler-ai-orchestration/src/codex/configWatcher.ts`
  (Codex auto-detect config-watcher shim — activated on extension
  start; no user-facing installer command file per S1 audit Q3)
- `tools/dabbler-ai-orchestration/src/utils/workspaceMarkerPath.ts`
  (new helper module — exports `normalizeWorkspacePath()`,
  `hashWorkspaceRoot()`, `resolveMarkerPath()`, `detectWorkspaceRootFromCwd()`.
  TS implementation; mirrored in JS in `scripts/write-orchestrator-marker.js`
  for the writer side. Unit-tested with golden inputs/outputs)

**Touches:**

- `tools/dabbler-ai-orchestration/scripts/write-orchestrator-marker.js`
  (per-workspace path resolution; bumps schema to v3; emits
  `workspaceRoot` field; gains its own normalization helper that
  must produce byte-identical output to the TS twin)
- `tools/dabbler-ai-orchestration/src/providers/orchestratorIndicatorProvider.ts`
  (per-workspace path resolution; multi-root reader iteration;
  workspaceRoot identity verification; session-set awareness
  section; updated empty-state copy; smart empty-state CTA)
- `tools/dabbler-ai-orchestration/package.json` (**3 new commands**
  — installer-Gemini, installer-Copilot, setOrchestratorManual.
  Codex auto-detection has no command, just a watcher activated
  at extension start)
- `tools/dabbler-ai-orchestration/src/extension.ts` (wire up the
  Codex config-watcher activation + new command registrations)
- `tools/dabbler-ai-orchestration/src/test/playwright/orchestrator-indicator.spec.ts`
  (drift-corrected path)
- `tools/dabbler-ai-orchestration/CHANGELOG.md`

**Ends with:** All four orchestrator surfaces are supported per
their audit-locked detection paths; per-workspace marker
contamination bug fixed; session-set awareness shipped; Layer 3
Playwright smoke green across all scenarios. 0.14.3 packaged but
not published.

**Progress keys:** `session-003/per-workspace-markers-writer`,
`session-003/per-workspace-markers-reader`,
`session-003/codex-detection`,
`session-003/gemini-manual-only`,
`session-003/copilot-manual-only`,
`session-003/manual-override-shipped`,
`session-003/session-set-awareness`,
`session-003/smart-empty-state`,
`session-003/playwright-smoke-expansion`

**Estimated cost:** $0.15–$0.40. Higher than the original
$0.10–$0.30 estimate because:
- One end-of-session verification call (typical $0.10-$0.30).
- Substantially more LOC to verify in S3 than originally scoped
  (per-workspace work adds ~150 LOC across writer + reader +
  shared helper + tests; session-set awareness adds ~30 LOC).
- May need a Round B confirmation pass on the per-workspace
  identity logic if the verifier flags edge cases in the
  normalization or workspace-root detection.

**Open follow-up for Session 4 / future sets (NOT in S3 scope):**

- **Multi-assistant-per-window awareness** (operator
  2026-05-18 round-11): when multiple coding assistants run in
  different VS Code panels of the same window (Claude in panel,
  Copilot in right sidebar, etc.), the indicator can't currently
  tell them apart. Last-writer-wins applies per S3 multi-writer
  precedence, but the operator may want a future "show me which
  assistant is in which panel" view. This is a substantially
  different feature (per-assistant markers + focus-aware
  selection logic) and is reserved for a follow-on session set,
  likely Set 031. Marker schema is forward-compatible — adding
  per-assistant identity later doesn't break the v3 contract.

---

## Audit-trail entries S3 should make in `docs/proposals/2026-05-18-per-workspace-orchestrator-markers/`

When S3 starts, the orchestrator should append a short log to that
proposal directory noting which of the cross-provider verdicts
were applied verbatim, which were modified, and any deltas
discovered during implementation. Mirrors the S1 audit-summary.md
pattern.

---

## Verify before applying

If the operator approves this draft:

1. I'll replace the existing S3 section in
   `docs/session-sets/029-orchestrator-model-effort-gauges/spec.md`
   with the content above (steps + Creates + Touches + Ends-with
   + Progress keys + Estimated cost + Open follow-up).
2. I'll also update spec.md's S4 reference if needed (S4 version
   bump target is currently `0.14.0 → 0.14.1`; should become
   `0.14.3 → 0.15.0` to reflect the multi-provider GA marker).
3. No commit until the operator says go.
