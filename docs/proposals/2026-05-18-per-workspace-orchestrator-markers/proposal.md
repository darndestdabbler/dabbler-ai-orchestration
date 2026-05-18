# Per-workspace orchestrator markers — design proposal

**Date:** 2026-05-18
**Status:** Authored mid-Set 029 Session 2 polish for cross-provider review
**Target session:** Set 029 Session 3 (scope expansion)
**Reviewers requested:** GPT-5.4, Gemini Pro

---

## Problem statement

The current v0.14.2-preview orchestrator-indicator stores its marker
at a SINGLE global path: `~/.dabbler/current-orchestrator.json`. The
audit (S1) assumed a one-operator-one-orchestrator-one-gauge mental
model. The actual operator workflow involves three parallel VS Code
windows running parallel Claude Code sessions across three repos
(per memory `project_consumer_repos`):

- Window A: `dabbler-ai-orchestration`, Claude Opus 4.7
- Window B: `dabbler-platform`, Claude Sonnet 4.6
- Window C: `dabbler-access-harvester`, Codex

Each window's installed SessionStart hook writes its session's
orchestrator info to the same global marker. The most-recently-
started session's marker wins; the other windows' gauges display
stale, incorrect data. **The gauge actively lies about what model
each window's Claude Code session is running.**

This is the exact failure mode the gauge was designed to prevent
(operator forgets they're on the wrong tier). The gauge causing the
confusion it was supposed to eliminate is a critical bug, not a
nice-to-have improvement.

## Locked context (do not re-litigate)

The S1 audit-locked design is largely sound; only the marker-storage
mechanism needs revision. Specifically these stay unchanged:

- Marker schema v2 with `signalKind`, `confidence`, `effort.signalKind`,
  `effort.observedAt`, `stalenessMaxSec` — schema doesn't change.
- Multi-writer precedence policy (`current` > `manual` > `last-observed`
  > `configured-default`) with re-read-immediately-before-rename
  TOCTOU closure — still applies, just to the per-workspace marker
  instead of the global one.
- Windows-aware retry loop (5 attempts at 50/200/600/1200ms backoff)
  — still applies.
- Confidence-low producer rule — still applies.
- The visual-treatment matrix — unchanged (round-3 IBM palette, etc.).
- The two-section bottom display (Actual Model / Suggested with
  inverted-band headers) — unchanged.
- The four signalKind values + four writer modes (session-start,
  user-prompt-submit, manual, configured-default) — unchanged.

Only the **path-to-marker resolution** changes. Both the writer
(`scripts/write-orchestrator-marker.js`) and the reader
(`orchestratorIndicatorProvider.ts`) compute the path the same way.
The path becomes per-workspace.

## Proposed solution

### Marker storage

- **Per-workspace marker directory:** `~/.dabbler/orchestrators/`
- **Filename:** `<hash>.json` where `<hash>` is a hex digest
  (SHA-256, first 16 chars) of the absolute workspace root path
- **Global fallback:** `~/.dabbler/orchestrators/_global.json`
  for sessions outside any workspace (e.g., Claude Code launched
  in `$HOME` with no VS Code workspace context)
- **Deprecation:** the existing `~/.dabbler/current-orchestrator.json`
  is no longer written. The provider could optionally migrate it on
  first read (move to `_global.json`) but a hard cutover is cleaner
  since v0.14.2 hasn't shipped to Marketplace yet.

### Writer path resolution (SessionStart hook → write-orchestrator-marker.js)

The hook payload includes `cwd` (the working directory at session
start). The helper resolves the workspace root from `cwd` using a
walk-up algorithm:

```
function resolveWorkspaceRoot(cwd):
  current = cwd
  while current != root_of_filesystem:
    for marker in [".git", ".vscode", "pyproject.toml", "package.json",
                   ".code-workspace files", "Cargo.toml", "go.mod"]:
      if marker_exists(current):
        return current
    current = parent(current)
  return null  // no workspace detected
```

- **If a workspace root is found:** hash its absolute path, write to
  `~/.dabbler/orchestrators/<hash>.json`.
- **If no workspace root is found:** write to
  `~/.dabbler/orchestrators/_global.json`.

The marker file's content gains a new top-level field for traceability:

```json
{
  "schemaVersion": 3,
  "workspaceRoot": "/c/Users/denmi/source/repos/dabbler-ai-orchestration",
  ...
}
```

(Bumping schemaVersion to 3 because the new field is part of the
record's identity, not just metadata.)

### Reader path resolution (webview provider)

The provider runs inside a VS Code window. It reads:

```typescript
function resolveWorkspaceMarkerPath(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const root = folders[0].uri.fsPath; // see "Open question: multi-root" below
    const hash = sha256(root).slice(0, 16);
    return path.join(MARKER_DIR, `${hash}.json`);
  }
  return path.join(MARKER_DIR, "_global.json");
}
```

The provider's file-system watcher binds to the resolved per-workspace
path. Two windows = two watchers on two different files. No cross-
window noise.

### Backward compatibility

- The existing `~/.dabbler/current-orchestrator.json` is silently
  ignored after upgrade. The provider doesn't read it.
- Operators with the v0.14.2 hook installed must re-run "Install
  Orchestrator Hook (Claude Code)" to upgrade. The installer is
  idempotent and the helper-script path stays the same, so the
  upgrade is automatic (the helper picks up the new path-resolution
  logic when it runs).
- Acceptable because v0.14.2 has NOT shipped to Marketplace. The
  cutover happens before any external consumer is affected.

### Stale marker cleanup

Per-workspace markers accumulate as operators open/close projects.
A `.dabbler/orchestrators/<hash>.json` left over from a workspace
the operator no longer uses isn't actively harmful (size: ~500 bytes),
but it does grow over time.

Proposed: the provider, on each render, prunes markers older than
`2 × stalenessMaxSec` (i.e., 16h by default) from the directory.
Cheap: one `fs.readdir` + N `fs.stat` calls per render. Bounded:
N is the number of stale markers, typically small. Alternative:
make it a periodic background task (e.g., every hour). Simpler is
"do nothing for v1" — files are small, accumulation is slow.

## Open design questions for the reviewers

**Q1 — Workspace root detection from `cwd`.** The walk-up algorithm
above is the obvious approach. Issues:
- Which markers should trigger a "workspace root" classification?
  My list: `.git`, `.vscode/`, `pyproject.toml`, `package.json`,
  `.code-workspace`, `Cargo.toml`, `go.mod`. Anything missing?
  Anything that should NOT be on the list?
- If the walk-up finds NO workspace root before reaching `/` or
  `$HOME`, what's the right behavior — write to `_global.json` as
  I'm proposing, or skip the write entirely (no marker at all)?
- What if Claude Code is launched from inside `.git/hooks/` or
  some other internal directory? Edge case; the walk-up would still
  find the enclosing repo. Acceptable.

**Q2 — Multi-root VS Code workspaces.** VS Code supports two flavors
of workspace:
- **Single-folder:** one folder opened. `workspaceFolders[0]` is
  that folder.
- **Multi-root (`.code-workspace` file):** N folders opened under a
  single workspace definition. `workspaceFolders` is the list,
  `workspaceFile` is the `.code-workspace` path.

Three possible keying strategies for the reader:
- (a) `workspaceFile` if present, else `workspaceFolders[0].uri.fsPath`
- (b) Always `workspaceFolders[0].uri.fsPath` (ignore workspace file)
- (c) `workspaceFile` if present, else null (no marker for unsaved
   multi-root)

The writer's `cwd` walk-up will typically resolve to ONE folder root,
which won't match a `.code-workspace` file's path. So if the reader
keys on the `.code-workspace` path but the writer keys on a folder
root, the keys mismatch and the gauge stays empty.

Most robust: the writer's `cwd` walk-up returns the matching folder
root, AND the reader checks `workspaceFolders` (plural) for any
folder matching the hash on disk. I.e., reader tries each
`workspaceFolders[i]` and picks the marker file that exists for
any of them. Slight cost: N file existence checks instead of 1.

**Q3 — Concurrent Claude sessions in the same workspace.** Two
terminals in the same VS Code window, both running Claude Code.
Both write the same per-workspace marker; multi-writer precedence
elects the newer. The gauge shows the most-recently-started
session's orchestrator, the other session's actual orchestrator
is invisible.

Is this acceptable for v1, or should we go further to per-terminal
markers (keyed on `terminal_process_id` from the hook payload)?
My take: acceptable. The common case is one session per terminal
per workspace; the multi-session-per-workspace case is uncommon
and the multi-writer policy degrades gracefully.

**Q4 — The empty-state CTA path.** Currently, when the marker is
missing the gauge shows "No signal — install hook". With per-
workspace markers, the empty state fires when the specific
workspace's marker doesn't exist (operator hasn't started Claude
Code in this workspace yet). The install hook CTA is correct for
that case — the operator does need to install or trigger the hook.
But: should there be a different CTA when the operator HAS installed
the hook somewhere but not in this workspace? Probably not — the
hook is per-user (installed in `~/.claude/settings.json`), not per-
workspace, so once installed it works for all workspaces. The empty
state correctly indicates "no Claude session has fired SessionStart
in this workspace yet."

**Q5 — Cleanup of stale markers.** Two options:
- Do nothing for v1 (markers are tiny; accumulate slowly)
- Prune on every render (markers older than 2 × `stalenessMaxSec`)

Tradeoff: do-nothing is simpler but leaves accumulated state. Pruning
is cheap but adds I/O on every render. Which would the reviewers
recommend, given that pruning could be added cheaply later as a
follow-on?

**Q6 — Schema version bump.** Should the addition of `workspaceRoot`
warrant a `schemaVersion: 3` bump, or stay at v2 with the field as
optional? Backward compat: nothing reads v2 markers from the new
location yet; we're cutting over entirely. I'm proposing v3 for
clarity (per-workspace markers are a different shape of data).

**Q7 — VS Code workspace API considerations.** Is there a more-
canonical VS Code API for "the workspace identity" we should be
using instead of hashing the first folder's fsPath? E.g., is there
a stable workspace UUID exposed by the API? (I know about
`vscode.workspace.workspaceFile` and `vscode.workspace.workspaceFolders`
but neither is a stable UUID.)

**Q8 — Process-id-based markers as an alternative.** Instead of
workspace-based keying, what if each Claude Code session wrote to
`~/.dabbler/orchestrators/<pid>.json` keyed on the SessionStart
hook's reported `session_id`? Pro: every session has a guaranteed-
unique key. Con: the webview reader doesn't know which session_id
to display — would need an additional mapping (session_id → VS Code
window). Probably more complex than the workspace-keyed approach
but worth raising in case the reviewers see a clean way to make it
work.

**Q9 — Cross-window communication.** Should the per-workspace
markers expose any cross-window awareness (e.g., the indicator in
Window A could optionally show a list of other active sessions in
other windows)? Or is per-window isolation the right scope for v1?
My take: isolation is correct; cross-window summary is feature
creep.

## Implementation surface (S3 scope)

If the reviewers approve the per-workspace-hash approach:

- `scripts/write-orchestrator-marker.js` (~40 LOC added):
  - Helper function `resolveWorkspaceRoot(cwd)` with the walk-up
    algorithm.
  - Helper function `pathForWorkspace(root)` returning the per-
    workspace marker path.
  - Update `attemptWriteWithPrecedence()` to use the resolved path
    instead of the hard-coded `MARKER_PATH`.
- `src/providers/orchestratorIndicatorProvider.ts` (~30 LOC added):
  - Helper function `resolveMarkerPath()` that hashes the workspace
    folder.
  - Update `setUpWatchers()` to bind to the resolved per-workspace
    path.
  - Update `computeState()` to read from the resolved path.
- `src/test/playwright/orchestrator-indicator.spec.ts` (~80 LOC added):
  - New scenario: two workspaces with separate markers, indicator
    in each window shows its own. (Needs two-launch test setup.)
- No schema validator changes (the marker file format is unchanged
  apart from the optional new `workspaceRoot` field).
- Documentation: CHANGELOG entry under [0.14.3], explicit note that
  the global marker is no longer used.

Estimated total: ~150 LOC of code + ~30 LOC tests. Manageable as an
S3 scope addition alongside the non-Claude provider work (which is
about the same size).

## What to verify in the consensus call

Please review the proposed solution and the nine open questions
above. Where appropriate, suggest concrete changes; where the
proposal is sound, confirm. The operator wants three-way agreement
before formalizing this in spec.md for Session 3.

Per memory `feedback_audit_then_spec_for_substantial_features`, this
audit-then-spec pattern is the operator's preferred path for
substantive design changes. Round A of this audit may flag must-fix
items that a Round B confirmation pass can ratify before S3 begins.
