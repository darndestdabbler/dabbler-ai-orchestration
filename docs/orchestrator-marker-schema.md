# Orchestrator Marker Schema

> **Authoritative reference** for the orchestrator marker file consumed by
> the Dabbler AI Orchestration "Orchestrator" indicator view. Companion
> to [`session-state-schema.md`](session-state-schema.md) (which
> documents `session-state.json`). Any writer or reader that touches
> the marker without consulting this doc has a high chance of
> producing the wrong-set-attachment or cross-window contamination
> failure modes Set 029 Session 3 was designed to prevent.

**Schema version:** **v3** (Set 029 Session 3, 2026-05-18 — per-session-set identity).

**Path:** `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`.

**Writers:** Claude Code SessionStart + UserPromptSubmit hooks
(via `scripts/write-orchestrator-marker.js`), Codex
config-watcher (Set 029 S5), Gemini/Copilot manual-override commands
(Set 029 S5), and the universal manual-override quickpick.

**Reader:** the Orchestrator Indicator webview provider
(`src/providers/orchestratorIndicatorProvider.ts`).

---

## Why per-session-set, not global

The v2 schema (v0.14.2 preview) used a single global file at
`~/.dabbler/current-orchestrator.json`. Three parallel VS Code windows
on three different consumer repos (a common operator pattern — see
memory `project_consumer_repos`) all wrote to the same file and
clobbered each other's state. The v3 schema solves this by binding
identity to the active session set rather than the user's home
directory:

- Each session set has its own marker file under its own
  `.dabbler/` directory.
- The writer resolves which set to write under by walking up from
  `cwd` looking for `docs/session-sets/<slug>/session-state.json`
  with `status: "in-progress"`.
- The reader runs the same walk-up rooted at the workspace folder.

This means three parallel windows on three repos render their own
correct state without coordination.

---

## v3 marker schema

```json
{
  "schemaVersion": 3,
  "sessionSetSlug": "029-orchestrator-model-effort-gauges",
  "updatedAt": "2026-05-18T17:04:10.471Z",
  "writer": "claude-code-session-start-hook",
  "signalKind": "current",
  "confidence": "high",
  "provider": "anthropic",
  "providerDisplayName": "Claude",
  "model": "claude-opus-4-7",
  "modelDisplayName": "Opus 4.7",
  "tier": "flagship",
  "effort": {
    "normalized": "medium",
    "native": "default",
    "thinking": false,
    "signalKind": "current",
    "confidence": "high"
  },
  "stalenessMaxSec": 28800
}
```

### Field reference

| Field | Type | Purpose |
|---|---|---|
| `schemaVersion` | int | Always `3` for v3 markers. v2 markers (no `sessionSetSlug`) are silently ignored by the v3 reader. |
| `sessionSetSlug` | string | The slug of the session set this marker belongs to. The reader validates this matches the resolved set's slug before rendering; mismatch → empty state. Treated as an **integrity field**, not just metadata. |
| `updatedAt` | ISO-8601 | When the marker was last written. Used for staleness (`stalenessMaxSec`). |
| `writer` | string | Identifies the writer for the writer log: e.g., `claude-code-session-start-hook`, `manual-override`, `codex-config-watcher`. |
| `signalKind` | enum | One of `current`, `manual`, `last-observed`, `configured-default`. Drives the visual treatment matrix per audit-summary §"Visual treatment by signalKind". |
| `confidence` | enum | One of `high`, `medium`, `low`. Used by the tooltip copy. |
| `provider` | string | Provider id: `anthropic`, `google`, `openai`, `github`. |
| `providerDisplayName` | string | Human label: `Claude`, `Gemini`, `Codex`, `Copilot`. |
| `model` | string | Model id (raw, from hook payload). |
| `modelDisplayName` | string | Human label: `Opus 4.7`, `Sonnet 4.6`, etc. |
| `tier` | enum | `low`, `mid`, `flagship`, `unknown`. Drives the Model gauge's needle position. |
| `effort.normalized` | enum | `low`, `medium`, `high`, `extra-high`, `max`. Drives the Effort gauge's needle position. |
| `effort.native` | string | Provider-native effort token: `default`, `/think`, `/megathink`, `/ultrathink`, etc. |
| `effort.thinking` | bool | Binary thinking on/off; drives the LED beside the effort gauge. |
| `effort.signalKind` | enum | Same enum as top-level `signalKind`. The effort gauge can have a different signalKind than the model gauge (e.g., `current` model + `last-observed` effort). |
| `effort.confidence` | enum | Same enum as top-level `confidence`. |
| `effort.observedAt` | ISO-8601 | Optional. Set when `effort.signalKind === "last-observed"`; used to render "(last /think Xm ago)". |
| `stalenessMaxSec` | int | Maximum age before the gauge enters the stale state. Default `28800` (8h). |

---

## Walk-up resolver (writer + reader)

```text
function resolveSessionSet(startCwd):
  current = absolutePath(startCwd)
  while true:
    candidate = current + "/docs/session-sets"
    if isDirectory(candidate):
      sets = readdir(candidate, dirsOnly=True)
      in_progress = []
      for entry in sets:
        statePath = candidate + "/" + entry + "/session-state.json"
        try:
          state = json.load(statePath)
          if state.status == "in-progress":
            in_progress.append(entry)
        except: continue
      if len(in_progress) == 1:
        return { slug, setDir }  // happy path
      if len(in_progress) == 0:
        return { reason: "no-in-progress-set" }
      return { reason: "multiple-in-progress-sets", candidates: in_progress }
    parent = dirname(current)
    if parent == current:
      return { reason: "no-docs-session-sets" }
    current = parent
```

The writer reads `cwd` from `payload.cwd` (Claude SessionStart /
UserPromptSubmit hooks include it), or from `process.cwd()` otherwise.
A `--cwd` CLI flag pins the resolution root for tests.

The reader rooted at `vscode.workspace.workspaceFolders[0]` runs the
same algorithm; it iterates workspace folders in order to support
multi-root workspaces.

---

## Fail-closed posture

Any of the three failure cases — no `docs/session-sets/` reachable,
zero in-progress sets, or more than one — produces:

1. **Writer:** appends a JSON entry to
   `~/.dabbler/orchestrator-writer.log` containing `timestamp`,
   `writer`, `sessionSetSlug` (null), `proposed` (the proposed
   `signalKind` or mode), `reason` (one of `no-docs-session-sets`,
   `no-in-progress-set`, `multiple-in-progress-sets`,
   `weaker-than-existing`, `weaker-than-existing-on-reread`,
   `write-failed-after-retries: <err>`), `candidates` (array for
   the ambiguous case), and `cwd` (the resolved cwd). The writer
   does NOT write a marker file. Exits 0 (semantically a no-op).
2. **Reader:** surfaces the existing empty-state CTA (the same
   "No signal — install hook" path used when no marker file
   exists on the happy path).

No workspace-level orphan marker is ever created. The fail-closed
posture is what prevents "correct-looking data attached to the wrong
work" — the operator sees the empty state and can investigate via
the writer log (`Dabbler: Open Orchestrator Writer Log` command).

---

## `.gitignore` self-protection

On first write, the writer drops a `.gitignore` containing
`*\n!.gitignore\n` into the per-set `.dabbler/` directory. The
`.gitignore` itself IS tracked (so a fresh clone of the workspace
inherits the same protection); everything else in the directory is
ignored. The workspace's root `.gitignore` does NOT need to be
patched for the marker file to stay untracked. This canonical repo's
`.gitignore` also lists `docs/session-sets/*/.dabbler/` as
belt-and-suspenders.

---

## Multi-writer precedence (unchanged from v2)

Per the Set 029 audit §"Multi-writer precedence", the precedence
order is `current` > `manual` > `last-observed` > `configured-default`.
Writers read the existing marker, compare `signalKind` precedence,
re-read immediately before atomic rename to close the TOCTOU race,
and skip the write if the proposed signal is weaker. Skipped writes
are logged. Under v3 the contention surface is much smaller than v2
because each set has at most one Claude session in flight at a time;
the global-marker cross-window race is eliminated by the identity
model change, not by this mitigation.

---

## Windows atomic-write retry loop (unchanged from v2)

Atomic write-and-rename on Windows 11 intermittently throws
`PermissionError` when the VS Code file watcher is active on the
target. All writers implement a retry loop: **5 attempts = initial +
4 retries, 50/200/600/1200ms backoff between attempts, ~2050ms
total ceiling.** Shared helper in
`scripts/write-orchestrator-marker.js`.

---

## Migration from v2

There is no automatic migration. The v0.14.2 preview never shipped to
Marketplace, so no external consumer is affected. Operators who
installed the v0.14.2 Claude Code hook re-run `Dabbler: Install
Orchestrator Hook (Claude Code)` after upgrading to v0.15.0 to pick
up the new walk-up resolver. The installer is idempotent; the
helper-script path is unchanged. The legacy
`~/.dabbler/current-orchestrator.json` file is silently ignored — it
can be deleted at the operator's leisure.
