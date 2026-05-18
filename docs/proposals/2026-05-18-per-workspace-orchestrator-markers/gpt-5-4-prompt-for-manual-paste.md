# GPT-5.4 manual-paste prompt — per-workspace orchestrator markers audit

> **For the operator:** Open this file, select-all + copy, paste into
> GitHub Copilot's chat with the GPT-5.4 model selected. The
> intentional framing tells GPT-5.4 that Gemini Pro already gave a
> verdict (we want truly independent input — DON'T tell GPT-5.4 what
> Gemini said). Save GPT's response to `consensus-gpt-5-4-manual.md`
> in this same directory so I can synthesize both verdicts.

---

You are one of two independent reviewers for a design proposal in
the Dabbler AI Orchestration codebase. The other reviewer (Gemini
Pro) has already given their verdict separately — I am NOT showing
you their response because I want your independent view first.

Review the proposal below and give your verdict on each of the nine
open questions plus an overall recommendation. Structured response
per question — **verdict + reasoning + any must-fix items**. Be
explicit about concrete must-fix items vs. recommendations vs.
nice-to-haves.

The operator wants three-way agreement (operator + Gemini + you)
before this is formalized in spec.md for Session 3 of Set 029
(orchestrator model & effort indicator gauges).

---

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
windows running parallel Claude Code sessions across three repos:

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
- The visual-treatment matrix — unchanged (IBM colorblind-safe palette).
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
  for sessions outside any workspace
- **Deprecation:** the existing `~/.dabbler/current-orchestrator.json`
  is no longer written; v0.14.2 hasn't shipped so hard cutover is OK.

### Writer path resolution (SessionStart hook → write-orchestrator-marker.js)

The hook payload includes `cwd`. The helper resolves the workspace
root from `cwd` using a walk-up algorithm:

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

The marker file's content gains a new top-level field:

```json
{
  "schemaVersion": 3,
  "workspaceRoot": "/c/Users/denmi/source/repos/dabbler-ai-orchestration",
  ...
}
```

### Reader path resolution (webview provider)

```typescript
function resolveWorkspaceMarkerPath(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const root = folders[0].uri.fsPath; // see "Open question: multi-root"
    const hash = sha256(root).slice(0, 16);
    return path.join(MARKER_DIR, `${hash}.json`);
  }
  return path.join(MARKER_DIR, "_global.json");
}
```

The provider's file-system watcher binds to the resolved per-workspace
path. Two windows = two watchers on two different files.

### Backward compatibility

- v0.14.2 hasn't shipped to Marketplace; hard cutover.
- Operators must re-run "Install Orchestrator Hook (Claude Code)" to
  pick up the new helper path-resolution logic.

### Stale marker cleanup

Per-workspace markers accumulate. Three options:
1. Do nothing for v1 (markers are ~500 bytes; accumulate slowly)
2. Prune on every render (markers older than 2 × stalenessMaxSec)
3. Periodic background task

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
elects the newer. Is this acceptable for v1, or should we go further
to per-terminal markers (keyed on `terminal_process_id`)?

**Q4 — The empty-state CTA path.** Currently, when the marker is
missing the gauge shows "No signal — install hook". With per-
workspace markers, the empty state fires when the specific
workspace's marker doesn't exist (operator hasn't started Claude
Code in this workspace yet). The install hook CTA is correct for
that case. Should there be a different CTA when the operator HAS
installed the hook somewhere but not in this workspace?

**Q5 — Cleanup of stale markers.** Two options:
- Do nothing for v1 (markers are tiny; accumulate slowly)
- Prune on every render (markers older than 2 × `stalenessMaxSec`)

Which would you recommend, given that pruning could be added cheaply
later as a follow-on?

**Q6 — Schema version bump.** Should the addition of `workspaceRoot`
warrant a `schemaVersion: 3` bump, or stay at v2 with the field as
optional?

**Q7 — VS Code workspace API considerations.** Is there a more-
canonical VS Code API for "the workspace identity" we should be
using instead of hashing the first folder's fsPath?

**Q8 — Process-id-based markers as an alternative.** Instead of
workspace-based keying, what if each Claude Code session wrote to
`~/.dabbler/orchestrators/<pid>.json` keyed on the SessionStart
hook's reported `session_id`? Pro: every session has a guaranteed-
unique key. Con: the webview reader doesn't know which session_id
to display — would need an additional mapping (session_id → VS Code
window).

**Q9 — Cross-window communication.** Should the per-workspace
markers expose any cross-window awareness (e.g., the indicator in
Window A could optionally show a list of other active sessions in
other windows)? Or is per-window isolation the right scope for v1?

## Implementation surface (S3 scope)

- `scripts/write-orchestrator-marker.js` (~40 LOC added)
- `src/providers/orchestratorIndicatorProvider.ts` (~30 LOC added)
- `src/test/playwright/orchestrator-indicator.spec.ts` (~80 LOC added)
- CHANGELOG entry under [0.14.3]

Estimated total: ~150 LOC of code + ~30 LOC tests.

## What to verify

Please review the proposed solution and the nine open questions
above. Where appropriate, suggest concrete changes; where the
proposal is sound, confirm. Per-question structured verdict + any
must-fix items.
