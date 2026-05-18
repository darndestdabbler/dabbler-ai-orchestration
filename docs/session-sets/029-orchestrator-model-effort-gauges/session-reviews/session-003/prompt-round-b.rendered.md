# Set 029 Session 3 verification — Round B (reader + model + provider + tests)

## Context

Set 029 Session 3 moves the orchestrator-marker identity from a single
global file to per-session-set markers under
`<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`.
**Round A** (already VERIFIED) covered the writer
(`scripts/write-orchestrator-marker.js`) and the marker schema doc.
**Round B** (this round) covers the reader-side changes, the data-layer
extraction, and the test rewrite.

Splitting per memory `feedback_split_large_verification_bundles` after
the all-in-one ~101k-char bundle hit gpt-5-4 429. Each round stays
under the ~700 LOC ceiling.

## What you're being asked to verify

Answer Q5–Q9 with **VERIFIED / MUST-FIX / SUGGEST** verdicts plus 1–3
sentences of reasoning each.

### Q5. Reader-side resolver + slug validation

The reader's `resolveActiveSet()` runs the same walk-up algorithm as
the writer (verified VERIFIED in Round A), rooted at
`vscode.workspace.workspaceFolders[0]`. Returns either
`{ kind: "resolved", resolved: { workspaceRoot, slug, setDir, markerPath } }`
or `{ kind: "unresolved", reason: ..., candidates?: [...] }`.

`computeState()` reads the marker file via `fs.readFileSync` (no async
delay between resolve and read — both are synchronous), then runs the
slug-integrity check:
```ts
if (marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug) {
  return { kind: "empty" };
}
```

Verify:
- The resolver returns `unresolved` on any failure path (no
  workspace, no `docs/session-sets/`, zero in-progress, multiple
  in-progress). `computeState()` translates `unresolved` to
  `{ kind: "empty" }`, which renders the existing empty-state CTA. ✓
- Slug validation is permissive on missing `sessionSetSlug`
  (treats absence as a v2-shape marker, which the spec step 8 says
  is "silently ignored" — but in the per-set path, no v2 writer
  would ever drop a marker there, so the permissive treatment is
  forward-compat for a hypothetical v4 marker that omits the field).
  Is the permissive treatment defensible, or should the slug check
  be strict (mandatory presence)?
- The slug check is `marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug`
  — note the truthiness guard catches `null` and `""` as well as
  `undefined`. Empty-string slug is treated as "no field" rather
  than "mismatch". Is that defensible?

### Q6. Watcher re-binding on session-set transitions

Two watchers:
1. **State watcher** (`SESSION_STATE_GLOB = "docs/session-sets/*/session-state.json"`)
   on the workspace folder. Fires on close-out flips, start_session,
   cancellation, restore — anything that changes a set's `status`.
   Trigger callback: `rebindMarkerWatcher()` + `scheduleRender()`.
2. **Marker watcher** on the resolved per-set marker file (absolute
   path). Re-bound whenever resolution changes.

`rebindMarkerWatcher()` is idempotent: if `nextPath === this.currentMarkerPath`
AND a watcher exists, returns early. Otherwise disposes the old
watcher and binds a fresh one rooted at `path.dirname(nextPath)`.

Verify:
- The state watcher uses
  `new vscode.RelativePattern(folders[0], SESSION_STATE_GLOB)` — this
  matches `docs/session-sets/*/session-state.json` paths within the
  first workspace folder. ✓
- The marker watcher uses
  `new vscode.RelativePattern(vscode.Uri.file(markerDir), "orchestrator.json")` —
  absolute base for cross-workspace-folder safety. ✓
- A close-out flip on the active set fires the state watcher, which
  re-resolves (now `unresolved`), disposes the old marker watcher,
  and re-renders to empty state. ✓
- A start_session on a new set fires the state watcher, which
  re-resolves to the new set's marker path, binds a fresh marker
  watcher there, and re-renders. ✓
- The poll backstop (`POLL_BACKSTOP_MS = 60_000`) calls both
  `rebindMarkerWatcher()` AND `scheduleRender()` so even a missed
  watcher event can't leave the gauge stuck on the wrong set. ✓

Edge case: what if `vscode.workspace.workspaceFolders` is empty at
`resolveWebviewView` time but populated later (operator opens a
folder after activating the side panel)? The state watcher is set
up once at `resolveWebviewView` time; if folders are empty then, no
state watcher is bound. The poll backstop re-runs
`rebindMarkerWatcher()` every 60s, which DOES re-resolve, but never
re-runs `setUpStateWatcher()`. Is this a hole?

### Q7. `SessionSetsModel` data-layer extraction

`src/providers/SessionSetsModel.ts` is a NEW file extracting:
- Pure helpers: `needsMigrationBadge`, `iconUriFor`,
  `isCurrentSessionInFlight`, `progressText`, `touchedDate`,
  `uatBadge`, `forceClosedBadge`, `modeBadge`
- Bucketing: `bucketSets(all)` returns
  `{ inProgress, notStarted, complete, cancelled }`
- Sorting: `sortBucket(subset, groupKey)` with the existing rules
  (in-progress / complete / cancelled by `lastTouched` desc;
  not-started by name asc)
- `ICON_FILES` map

`SessionSetsProvider` re-imports these and re-exports a subset
(`forceClosedBadge`, `isCurrentSessionInFlight`, `modeBadge`,
`needsMigrationBadge`, `progressText`) so callers that import from
the provider module continue to work without breakage:
- `cancelTreeView.test.ts` (no specific helper imports listed)
- `forceClosedBadge.test.ts` imports `forceClosedBadge`
- `sessionSetsProvider.test.ts` (Layer-2) was REPOINTED to import
  directly from `SessionSetsModel` to track the canonical home

Verify:
- All helper bodies are byte-for-byte equivalent to the
  pre-extraction inline definitions (no behavioral drift). The
  in-flight predicate, progress text, badge logic, bucket+sort
  rules all match what was in the provider before. ✓
- `getChildren()` correctly delegates to `bucketSets` + `sortBucket`
  rather than inlining the filter+sort. ✓
- The Cancelled-group-only-renders-when-non-empty rule (`if
  (buckets.cancelled.length > 0)` before pushing the group) is
  preserved. ✓
- The loading sentinel + scan-state gating + welcome-view trigger
  (`return [];` when `all.length === 0`) are preserved unchanged. ✓
- The future custom webview tree (Set 029 S4) can consume the same
  exports without further refactor.

### Q8. Playwright coverage

12 scenarios total (A–L). New for S3:
- **I**: mismatched `sessionSetSlug` → reader falls back to empty state
- **J**: helper-script ambiguous (2 in-progress sets) → write skipped,
  log entry with `reason: "multiple-in-progress-sets"` + `candidates`
- **K**: helper-script writes to per-set path on single in-progress
  set; verifies schema v3, slug match, AND self-protect `.gitignore`
  presence + content (`*` + `!.gitignore`)
- **L**: helper-script invoked outside any `docs/session-sets/` →
  skip, log entry with `reason: "no-docs-session-sets"`, no legacy
  global marker

Existing A–H scenarios were updated to:
- seed markers at per-set path (writes inside `seed.set_dir`)
- call `startSession(seed, 1)` so the seed set is `in-progress`
  (otherwise the resolver returns `no-in-progress-set`)
- declare `schemaVersion: 3` and `sessionSetSlug: seed.slug`

Scenario H (helper-precedence) now exercises the per-set path; the
final assertion verifies the marker landed under
`seed.set_dir/.dabbler/`, NOT under the legacy global path
(explicitly checked to NOT exist).

Verify coverage is sufficient for the S3 spec's step 9 acceptance:
- "Two in-progress sets in one workspace → writer skips,
  orchestrator-writer.log carries the ambiguity entry, indicator
  shows empty-state CTA." → Scenario J (writer + log) + Scenario G/I
  (reader empty state). Coverage is split across helper + reader
  scenarios — adequate or does an end-to-end ambiguous-with-VS-Code
  launch scenario need to be added?
- "Schema-v3 marker with mismatched `sessionSetSlug` → reader falls
  back to empty state and logs." → Scenario I covers the empty-state
  fallback; the reader does NOT currently emit a log entry on slug
  mismatch (the spec text says "logs", but the implementation falls
  silent). Is this gap a must-fix?
- "`cwd` outside any `docs/session-sets/` directory → writer skips,
  no orphan marker written." → Scenario L. ✓
- "Single in-progress set → writer writes to per-set path,
  indicator renders the gauges." → Scenario K (writer) + A–F
  (reader). ✓

### Q9. CHANGELOG + version bump

Version 0.14.2 → 0.15.0 (minor). v0.14.2 never shipped to
Marketplace; no external consumer is affected. The minor bump is
the audit consensus (Q9 in synthesis) because the schema/identity
change would be breaking IF anyone had been depending on v0.14.2's
preview shape.

CHANGELOG [0.15.0] section claims:
- Marker schema v3 with `sessionSetSlug` integrity field
- Per-set marker path; legacy global retired
- Walk-up resolver in writer + reader (same algorithm)
- Fail-closed (skip + log) on zero/many in-progress sets and
  no-docs-session-sets reachable
- Watcher re-binding on set transitions
- `.gitignore` self-protection in the per-set `.dabbler/` directory
- `SessionSetsModel` data-layer extraction
- Two known limitations: R8 wrong-set attachment, R9 gitignore
  not auto-patched at workspace-root

Verify:
- CHANGELOG accuracy against the implementation. Any drift?
- "Re-run `Dabbler: Install Orchestrator Hook (Claude Code)` after
  upgrade" — the installer is unchanged; the helper-script path
  resolution is internal. Is the operator-facing copy honest? (The
  hook entry in `~/.claude/settings.json` is unchanged; what
  changes is the resolver behavior INSIDE the helper.)
- Is 0.15.0 the right bump per semver intent, or should it be
  0.14.3 (patch) since no external consumer was ever affected?

---

## Final verdict (Round B)

Emit one summary line at the end:

`VERDICT: VERIFIED` if Q5–Q9 all pass without must-fix items
`VERDICT: MUST-FIX (<count>)` if any Q has a must-fix
`VERDICT: SUGGEST (<count>)` if no must-fix but ≥1 suggest items

Followed by a 2–3-sentence overall summary.


---

## File 1: src/providers/orchestratorIndicatorProvider.ts

```typescript
// Orchestrator Indicator webview view provider.
//
// Renders two side-by-side semi-circle CSS gauges (Model + Effort)
// driven by the active session set's per-set marker file —
// `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`
// (schema v3, Set 029 Session 3 custom-tree-pivot identity model). Per
// Set 029 audit (audit-summary.md §"Visual treatment by signalKind"
// REVISED 2026-05-18 + §Q6 stale-state policy + §"Multi-writer
// precedence") + 2026-05-18 custom-tree-pivot synthesis (per-set
// identity replaces the legacy global `~/.dabbler/current-orchestrator.json`).
//
// Height budget: ≤150px content (revised 2026-05-18 from the
// original ≤100px audit D3 after operator-on-device feedback that
// 100px was too small for legible labels and gauges). Container
// height cannot be guaranteed if the operator has dragged the
// divider — CSS uses overflow:auto so content scrolls if compressed
// (audit S3).
//
// Watching strategy: vscode.workspace.createFileSystemWatcher on the
// resolved per-set marker path PLUS a second watcher on the workspace's
// `docs/session-sets/**/session-state.json` files so the resolution
// re-runs when the active set transitions (e.g., on close-out of the
// current set or start of the next). A 60s poll backstops the watcher
// for the rare case where it misses an event under aggressive antivirus
// (per R5).

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { readAllSessionSets } from "../utils/fileSystem";

const DEFAULT_STALENESS_MAX_SEC = 28800; // 8h
const POLL_BACKSTOP_MS = 60_000;
const RENDER_DEBOUNCE_MS = 50;
const SESSION_STATE_GLOB = "docs/session-sets/*/session-state.json";

// Resolution of the active session set in the current workspace.
//
// Returns the slug + marker path on success, or a reason on failure
// (no workspace, no docs/session-sets/, no in-progress set, multiple
// in-progress sets). The renderer's empty-state path uses the
// failure reason to compose a diagnostic tooltip without leaking
// filesystem detail into the visible gauges.
interface ResolvedSet {
  workspaceRoot: string;
  slug: string;
  setDir: string;
  markerPath: string;
}
type SetResolution =
  | { kind: "resolved"; resolved: ResolvedSet }
  | { kind: "unresolved"; reason: "no-workspace" | "no-docs-session-sets" | "no-in-progress-set" | "multiple-in-progress-sets"; candidates?: string[] };

function resolveActiveSet(): SetResolution {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return { kind: "unresolved", reason: "no-workspace" };
  }
  // Walk the workspace folders in order; the FIRST folder with a
  // docs/session-sets/ directory is the canonical resolution root.
  // Multi-root workspaces with multiple session-set-bearing folders
  // are rare; when they exist, the canonical SessionSetsProvider's
  // discoverRoots() preserves the same ordering.
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const candidate = path.join(root, "docs", "session-sets");
    let candidateIsDir = false;
    try {
      candidateIsDir = fs.statSync(candidate).isDirectory();
    } catch {
      candidateIsDir = false;
    }
    if (!candidateIsDir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(candidate, { withFileTypes: true });
    } catch {
      continue;
    }
    const inProgress: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const statePath = path.join(candidate, entry.name, "session-state.json");
      let state: { status?: unknown } | null = null;
      try {
        state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      } catch {
        continue;
      }
      if (state && (state as { status?: unknown }).status === "in-progress") {
        inProgress.push(entry.name);
      }
    }
    if (inProgress.length === 1) {
      const slug = inProgress[0];
      const setDir = path.join(candidate, slug);
      return {
        kind: "resolved",
        resolved: {
          workspaceRoot: root,
          slug,
          setDir,
          markerPath: path.join(setDir, ".dabbler", "orchestrator.json"),
        },
      };
    }
    if (inProgress.length === 0) {
      return { kind: "unresolved", reason: "no-in-progress-set" };
    }
    return { kind: "unresolved", reason: "multiple-in-progress-sets", candidates: inProgress };
  }
  return { kind: "unresolved", reason: "no-docs-session-sets" };
}

interface OrchestratorMarker {
  schemaVersion: number;
  // Schema v3 (Set 029 Session 3): identity field — the slug of the
  // session set this marker belongs to. Optional in the type so older
  // v2 markers (which lack the field) don't crash the parser; the
  // reader treats `undefined` as a permissive match.
  sessionSetSlug?: string;
  updatedAt: string;
  writer: string;
  signalKind: "current" | "configured-default" | "last-observed" | "manual";
  confidence: "high" | "medium" | "low";
  provider: string;
  providerDisplayName: string;
  model: string;
  modelDisplayName: string;
  tier: "low" | "mid" | "flagship" | "unknown";
  effort: {
    normalized: "low" | "medium" | "high" | "extra-high" | "max";
    native: string;
    thinking: boolean;
    signalKind: "current" | "configured-default" | "last-observed" | "manual";
    confidence: "high" | "medium" | "low";
    observedAt?: string;
  };
  stalenessMaxSec: number;
}

interface Recommendation {
  rawText: string;        // the full paragraph, for the tooltip
  providerName: string;   // e.g., "Claude"
  modelName: string;      // e.g., "Opus 4.7"
  effort: string;         // e.g., "high"
  sessionLabel: string;   // e.g., "Session 3 of 4"
  setName: string;        // e.g., "029-orchestrator-model-effort-gauges"
}

interface Mismatch {
  recommendation: Recommendation;  // the parsed ai-assignment.md entry, used to format the Suggested row
  reason: string;                  // tooltip text with axis-by-axis specifics
}

type RenderState =
  | { kind: "empty" }
  | { kind: "loaded"; marker: OrchestratorMarker; stale: boolean; ageSec: number; mismatch: Mismatch | null };

// Tier rank for the < / > than-suggested direction calculation.
// low<mid<flagship within any provider's ladder. flagship-of-Claude
// and flagship-of-Codex are treated as the same rank — providers are
// distinct but their tier ladders map onto a common 3-level scale.
function tierRank(tier: string | undefined): number {
  switch ((tier || "").toLowerCase()) {
    case "low":      return 0;
    case "mid":      return 1;
    case "flagship": return 2;
    default:         return -1;
  }
}

function effortRank(effort: string | undefined): number {
  switch ((effort || "").toLowerCase()) {
    case "low":        return 0;
    case "medium":     return 1;
    case "high":       return 2;
    case "extra-high": return 3;
    case "max":        return 4;
    default:           return -1;
  }
}

// File-scope twin of the class's fmtAge (kept lean so the capacity
// helper can call it without a class instance).
function fmtAgeStandalone(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "?";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// Providers with at least one extra-capacity parameter (thinking,
// extended reasoning, etc.). The "thinking" clause in the model
// description is shown only for these. Codex/Copilot have no native
// extra-capacity parameter per audit Q3/Q4.
function providerHasExtraCapacity(provider: string): boolean {
  const p = (provider || "").toLowerCase();
  return p === "anthropic" || p === "google" || p.includes("claude") || p.includes("gemini");
}

// Compose the full "Actual Model" description from a marker. This
// is the canonical textual description shown in the model table.
// Future-proof: new capacity parameters (extended thinking, adaptive
// reasoning, etc.) become extra clauses appended here. No new UI
// elements needed.
function describeMarker(marker: OrchestratorMarker): string {
  const provider = marker.providerDisplayName || "";
  const modelIsUnknown = !marker.model || marker.model === "unknown";
  const modelText = modelIsUnknown ? "(model unknown)" : (marker.modelDisplayName || "");
  const effortText = effortDisplayNameStandalone(marker.effort.normalized).toLowerCase();

  // Configured-default is a parenthetical modifier on the model name.
  const modelClause = marker.signalKind === "configured-default"
    ? `${provider} ${modelText} (configured default)`
    : `${provider} ${modelText}`;

  let desc = `${modelClause}, ${effortText} effort`;

  // Thinking clause — only for providers that have the capability.
  if (providerHasExtraCapacity(marker.provider)) {
    const thinkingOn = marker.effort.thinking === true;
    if (thinkingOn && marker.effort.signalKind === "last-observed" && marker.effort.observedAt) {
      const ageSec = (Date.now() - Date.parse(marker.effort.observedAt)) / 1000;
      const native = marker.effort.native || "/think";
      desc += `, thinking on (last ${native} ${fmtAgeStandalone(ageSec)} ago)`;
    } else if (thinkingOn) {
      desc += `, thinking on`;
    } else {
      desc += `, thinking off`;
    }
  }

  return desc.trim().replace(/\s+/g, " ");
}

// Compose the suggested-model description from an ai-assignment.md
// recommendation. Format mirrors describeMarker() so the two table
// rows are visually parallel.
function describeRecommendation(rec: Recommendation): string {
  return `${rec.providerName} ${rec.modelName}, ${rec.effort.toLowerCase()} effort`.replace(/\s+/g, " ");
}

// File-scope twin of the class's effortDisplayName.
function effortDisplayNameStandalone(effort: string): string {
  switch (effort) {
    case "low":        return "Low";
    case "medium":     return "Medium";
    case "high":       return "High";
    case "extra-high": return "Extra-high";
    case "max":        return "Max";
    default:           return "Unknown";
  }
}

// Mirror the producer's classifyTier logic for parsing
// recommendation strings out of ai-assignment.md. The recommendation
// carries human-readable "Provider" + "Model" text (e.g., "Claude" +
// "Opus 4.7"); we classify those into the same low/mid/flagship
// buckets the marker uses, so the < / > direction is computed off a
// common rank scale.
function classifyRecommendationTier(providerName: string, modelName: string): string {
  const p = (providerName || "").toLowerCase();
  const m = (modelName || "").toLowerCase();
  if (p.includes("claude") || m.includes("claude")) {
    if (m.includes("opus")) return "flagship";
    if (m.includes("sonnet")) return "mid";
    if (m.includes("haiku")) return "low";
  }
  if (p.includes("gemini") || m.includes("gemini")) {
    if (m.includes("pro")) return "flagship";
    if (m.includes("flash 2") || m.includes("2.5")) return "mid";
    if (m.includes("flash")) return "low";
  }
  if (p.includes("codex") || p.includes("openai") || m.startsWith("gpt-") || m.includes("codex") || m.startsWith("o1") || m.startsWith("o3")) {
    if (m.includes("mini")) return "low";
    if (m.startsWith("o1") || m.startsWith("o3") || m.includes("5") || (m.includes("4o") && !m.includes("mini"))) return "flagship";
    return "mid";
  }
  if (p.includes("copilot") || m.includes("copilot")) return "mid";
  return "unknown";
}

export class OrchestratorIndicatorProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "dabblerOrchestratorIndicator";

  private view: vscode.WebviewView | undefined;
  // Two watchers: one on the resolved per-set marker file (binds when
  // a set is in-progress), and one on every workspace `session-state.json`
  // so the resolution re-runs when sets transition (start/close-out).
  private markerWatcherDisposable: vscode.Disposable | undefined;
  private stateWatcherDisposable: vscode.Disposable | undefined;
  private currentMarkerPath: string | null = null;
  private pollHandle: NodeJS.Timeout | undefined;
  private renderTimer: NodeJS.Timeout | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.command === "installHookClaudeCode") {
        vscode.commands.executeCommand("dabbler.installOrchestratorHook.claudeCode");
      } else if (msg.command === "setOrchestrator") {
        vscode.commands.executeCommand("dabbler.setOrchestrator");
      } else if (msg.command === "openWriterLog") {
        vscode.commands.executeCommand("dabbler.openOrchestratorWriterLog");
      }
    });

    webviewView.onDidDispose(() => {
      this.tearDownWatchers();
      this.view = undefined;
    });

    this.setUpStateWatcher();
    this.rebindMarkerWatcher();
    this.scheduleRender();
  }

  // Watcher on every workspace session-state.json file. Fires when the
  // active in-progress set changes (close-out flip, start_session,
  // cancellation, restore). On fire we re-run the resolver, re-bind the
  // marker watcher if the resolved path moved, and re-render.
  private setUpStateWatcher(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const pattern = new vscode.RelativePattern(folders[0], SESSION_STATE_GLOB);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = () => {
      this.rebindMarkerWatcher();
      this.scheduleRender();
    };
    watcher.onDidCreate(trigger);
    watcher.onDidChange(trigger);
    watcher.onDidDelete(trigger);
    this.stateWatcherDisposable = watcher;
  }

  // (Re-)bind the per-set marker watcher to the currently-resolved
  // marker path. Idempotent — if the resolved path hasn't changed, the
  // existing watcher is kept; if it has, the old watcher is disposed
  // and a fresh one is bound.
  private rebindMarkerWatcher(): void {
    const res = resolveActiveSet();
    const nextPath = res.kind === "resolved" ? res.resolved.markerPath : null;
    if (nextPath === this.currentMarkerPath && this.markerWatcherDisposable) {
      return;
    }
    this.markerWatcherDisposable?.dispose();
    this.markerWatcherDisposable = undefined;
    this.currentMarkerPath = nextPath;
    if (!nextPath) {
      this.ensurePollBackstop();
      return;
    }
    // Watch the file by name within its parent directory. The watcher
    // fires on create/change/delete regardless of whether the file
    // exists at the time the watcher is created — important because
    // the marker file may not be written until the first hook fire
    // after the per-set .dabbler/ directory is created.
    const markerDir = path.dirname(nextPath);
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(markerDir),
      "orchestrator.json",
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = () => this.scheduleRender();
    watcher.onDidCreate(trigger);
    watcher.onDidChange(trigger);
    watcher.onDidDelete(trigger);
    this.markerWatcherDisposable = watcher;
    this.ensurePollBackstop();
  }

  private ensurePollBackstop(): void {
    if (this.pollHandle) return;
    this.pollHandle = setInterval(() => {
      this.rebindMarkerWatcher();
      this.scheduleRender();
    }, POLL_BACKSTOP_MS);
  }

  private tearDownWatchers(): void {
    this.markerWatcherDisposable?.dispose();
    this.markerWatcherDisposable = undefined;
    this.stateWatcherDisposable?.dispose();
    this.stateWatcherDisposable = undefined;
    this.currentMarkerPath = null;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
  }

  private scheduleRender(): void {
    // Atomic writes on Windows can fire create+delete+create in quick
    // succession; debounce so we render once per coalesced burst.
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), RENDER_DEBOUNCE_MS);
  }

  public render(): void {
    if (!this.view) return;
    const state = this.computeState();
    this.view.webview.html = this.renderHtml(state);
  }

  private computeState(): RenderState {
    const res = resolveActiveSet();
    if (res.kind === "unresolved") {
      // Fail-closed: surface the existing empty-state CTA. The reason
      // detail isn't displayed inline (the gauges stay simple) — it's
      // available via the writer-log command for diagnostics.
      return { kind: "empty" };
    }
    let raw: string;
    try {
      raw = fs.readFileSync(res.resolved.markerPath, "utf8");
    } catch {
      return { kind: "empty" };
    }
    let marker: OrchestratorMarker;
    try {
      marker = JSON.parse(raw) as OrchestratorMarker;
    } catch {
      return { kind: "empty" };
    }
    if (!marker || typeof marker !== "object" || !marker.signalKind) {
      return { kind: "empty" };
    }
    // Slug-integrity check (Set 029 Session 3 schema-v3 requirement):
    // a marker whose `sessionSetSlug` doesn't match the resolved set's
    // slug is treated as orphaned/stale (e.g., a marker file that
    // survived a slug rename or a cross-set copy-paste). Fall back to
    // the empty state rather than render data attached to the wrong work.
    if (marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug) {
      return { kind: "empty" };
    }
    const ageSec = (Date.now() - Date.parse(marker.updatedAt)) / 1000;
    const stalenessMaxSec =
      typeof marker.stalenessMaxSec === "number"
        ? marker.stalenessMaxSec
        : DEFAULT_STALENESS_MAX_SEC;
    const stale = ageSec > stalenessMaxSec;

    // Compute mismatch against the active session set's ai-assignment.md
    // recommendation. Operator-revised design 2026-05-18 round 2:
    // valence-neutral badge — surfaces the difference, doesn't judge it.
    // (Higher-than-recommended IS sometimes intentional — operator has
    // credits, or task is harder than the recommendation anticipated.)
    let mismatch: Mismatch | null = null;
    try {
      const rec = this.findActiveRecommendation();
      if (rec) {
        mismatch = this.computeMismatch(marker, rec);
      }
    } catch {
      // Defensive — recommendation reading is best-effort. Any error
      // (workspace not initialized, ai-assignment.md unparseable,
      // permissions) silently falls back to "no badge". The gauges
      // themselves keep working.
      mismatch = null;
    }
    return { kind: "loaded", marker, stale, ageSec, mismatch };
  }

  // Find the recommendation from the active session set's
  // ai-assignment.md. "Active" = the in-progress session set; "the
  // recommended session" = currentSession if non-null, else the
  // next-to-start (max(completedSessions) + 1) if any sessions
  // remain. If neither applies, returns null.
  private findActiveRecommendation(): Recommendation | null {
    let sets;
    try {
      sets = readAllSessionSets();
    } catch {
      return null;
    }
    // Prefer in-progress sets; among them, prefer one whose state file
    // says lifecycleState === "work_in_progress" (set 030 schema). We
    // don't have direct visibility into lifecycleState from SessionSet,
    // but the `state === "in-progress"` filter is close enough — the
    // SessionSet type's `state` field is derived from session-state.json.
    const inProgress = sets.filter((s) => s.state === "in-progress");
    if (inProgress.length === 0) return null;
    // If multiple in-progress sets, pick the most recently touched.
    inProgress.sort((a, b) => (b.lastTouched ?? "").localeCompare(a.lastTouched ?? ""));
    const set = inProgress[0];

    // Determine which session number's recommendation to compare against.
    const live = set.liveSession;
    let targetSession: number | null = null;
    if (live && typeof live.currentSession === "number") {
      targetSession = live.currentSession;
    } else if (
      live &&
      Array.isArray(live.completedSessions) &&
      typeof set.totalSessions === "number" &&
      live.completedSessions.length < set.totalSessions
    ) {
      const maxCompleted = live.completedSessions.length === 0
        ? 0
        : Math.max(...live.completedSessions);
      targetSession = maxCompleted + 1;
    }
    if (targetSession === null) return null;

    // Read + parse ai-assignment.md.
    let text: string;
    try {
      text = fs.readFileSync(set.aiAssignmentPath, "utf8");
    } catch {
      return null;
    }
    return this.extractRecommendation(text, targetSession, set.name);
  }

  // Parse ai-assignment.md to extract the recommendation for a
  // specific session number. Format (per the workflow doc § Step 3.5):
  //   ## Session N: <title>           (or "## Session N of M: <title>")
  //   ### Recommended orchestrator
  //   <Provider> <Model> @ effort=<level>. <Optional rationale...>
  //
  // We grep for the session heading, then for the next
  // "### Recommended orchestrator" within that block, then the next
  // non-blank paragraph. Defensive — returns null on any parse failure
  // rather than guessing.
  private extractRecommendation(
    text: string,
    sessionNumber: number,
    setName: string,
  ): Recommendation | null {
    const lines = text.split(/\r?\n/);
    const headingRe = new RegExp(
      `^##\\s+Session\\s+${sessionNumber}(?:\\s+of\\s+\\d+)?\\s*:\\s*(.*)$`,
      "i",
    );
    let sessionStartIdx = -1;
    let sessionTitle = "";
    for (let i = 0; i < lines.length; i++) {
      const m = headingRe.exec(lines[i]);
      if (m) {
        sessionStartIdx = i;
        sessionTitle = m[1].trim();
        break;
      }
    }
    if (sessionStartIdx === -1) return null;

    // Find the next ### Recommended orchestrator before the next ## block.
    let recHeadingIdx = -1;
    for (let i = sessionStartIdx + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) break; // next session block — stop
      if (/^###\s+Recommended\s+orchestrator/i.test(lines[i])) {
        recHeadingIdx = i;
        break;
      }
    }
    if (recHeadingIdx === -1) return null;

    // Find the next non-blank paragraph after the heading.
    let paragraphStart = -1;
    for (let i = recHeadingIdx + 1; i < lines.length; i++) {
      if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i])) break;
      if (lines[i].trim().length > 0) {
        paragraphStart = i;
        break;
      }
    }
    if (paragraphStart === -1) return null;

    // Read until blank line or next heading.
    const paragraphLines: string[] = [];
    for (let i = paragraphStart; i < lines.length; i++) {
      if (lines[i].trim().length === 0) break;
      if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i])) break;
      paragraphLines.push(lines[i]);
    }
    const paragraph = paragraphLines.join(" ").trim();

    // Parse "Provider Model @ effort=level."
    const recRe = /^([A-Z][A-Za-z]+)\s+([^@]+?)\s*@\s*effort\s*=\s*([a-z-]+)/i;
    const m = recRe.exec(paragraph);
    if (!m) return null;

    return {
      rawText: paragraph,
      providerName: m[1].trim(),
      modelName: m[2].trim().replace(/[.,;]+$/, ""),
      effort: m[3].trim().toLowerCase(),
      sessionLabel: `Session ${sessionNumber}: ${sessionTitle}`,
      setName,
    };
  }

  // Compare a marker to a recommendation. Returns a Mismatch with a
  // formatted "Suggested:" line if any axis differs, else null.
  //
  // Operator feedback 2026-05-18 round 4: replaced the directional
  // "< / > than suggested" badge with a yellow-bold-italic prose line
  // stating the actual recommendation. Rationale: shows the operator
  // exactly what was suggested (so they don't need to hover/think to
  // compute the diff), wraps gracefully on narrow panels, and feels
  // less visually heavy than a pill badge. Any axis mismatch
  // (provider OR model OR effort) triggers the suggestion line —
  // including cross-provider same-level cases (Codex active when
  // Claude was recommended is information worth surfacing, even if
  // the tier rank happens to match).
  private computeMismatch(marker: OrchestratorMarker, rec: Recommendation): Mismatch | null {
    const norm = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

    const providerOk = norm(marker.providerDisplayName).includes(norm(rec.providerName)) ||
                       norm(rec.providerName).includes(norm(marker.providerDisplayName));
    const modelOk = norm(marker.modelDisplayName).includes(norm(rec.modelName)) ||
                    norm(rec.modelName).includes(norm(marker.modelDisplayName));
    const effortOk = norm(marker.effort.normalized) === norm(rec.effort);

    if (providerOk && modelOk && effortOk) return null;

    // Round 7: the recommendation itself rides on the Mismatch
    // object so the renderer can format the "Suggested" row of the
    // model table from it directly (describeRecommendation()).

    const diffs: string[] = [];
    if (!providerOk || !modelOk) {
      diffs.push(
        `model: actual "${marker.providerDisplayName} ${marker.modelDisplayName}", recommended "${rec.providerName} ${rec.modelName}"`,
      );
    }
    if (!effortOk) {
      diffs.push(`effort: actual "${marker.effort.normalized}", recommended "${rec.effort}"`);
    }
    if (!providerOk && diffs.length === 0) {
      diffs.push(`provider: actual "${marker.providerDisplayName}", recommended "${rec.providerName}"`);
    }

    return {
      recommendation: rec,
      reason:
        `Current orchestrator differs from ${rec.setName} ${rec.sessionLabel} recommendation. ` +
        diffs.join("; ") +
        ". This may be intentional (e.g., extra credits, task harder or simpler than anticipated) — " +
        `the Suggested row surfaces the recommendation; you decide. ` +
        `Switch via "Dabbler: Set Orchestrator Model & Effort".`,
    };
  }

  // ------- rendering helpers -------

  private renderHtml(state: RenderState): string {
    const cssUri = this.view!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "orchestrator-indicator", "indicator.css"),
    );
    const nonce = String(Math.floor(Math.random() * 1e16));
    const csp =
      `default-src 'none'; ` +
      `style-src ${this.view!.webview.cspSource}; ` +
      `script-src 'nonce-${nonce}';`;

    const body = state.kind === "empty"
      ? this.renderEmpty()
      : this.renderLoaded(state.marker, state.stale, state.ageSec, state.mismatch);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${cssUri}">
  <title>Orchestrator</title>
</head>
<body>
  <div class="container">${body}</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((el) => {
      el.addEventListener('click', () => {
        vscode.postMessage({ command: el.getAttribute('data-command') });
      });
    });
  </script>
</body>
</html>`;
  }

  private renderEmpty(): string {
    return `<div class="empty-state">
  <div class="grey-gauges">
    <div class="gauge-svg-wrap">${this.renderGaugeSvg("unknown", "current", 0)}</div>
    <div class="gauge-svg-wrap">${this.renderGaugeSvg("unknown", "current", 0)}</div>
  </div>
  <span>No signal — </span><span class="install-cta" data-command="installHookClaudeCode">install hook</span>
</div>`;
  }

  private renderLoaded(marker: OrchestratorMarker, stale: boolean, ageSec: number, mismatch: Mismatch | null): string {
    const modelClasses = [
      "gauge-cell",
      `tier-${marker.tier || "unknown"}`,
      `signal-${marker.signalKind}`,
    ].join(" ");
    const effortClasses = [
      "gauge-cell",
      `effort-${marker.effort.normalized || "unknown"}`,
      `signal-${marker.effort.signalKind || "current"}`,
    ].join(" ");

    const modelNeedle = this.tierToNeedleAngle(marker.tier);
    const effortNeedle = this.effortToNeedleAngle(marker.effort.normalized);

    // Model sublabel — provider name + model name on one line, or
    // just provider name when model is unknown (the table below
    // carries the "(model unknown)" detail in the description).
    const modelIsUnknown = !marker.model || marker.model === "unknown";
    const modelSublabelText = modelIsUnknown
      ? this.escHtml(marker.providerDisplayName)
      : `${this.escHtml(marker.providerDisplayName)} ${this.escHtml(marker.modelDisplayName)}`;

    // Clock overlay (top-left of the gauge wrapper) — visual cue that
    // the gauge's signalKind is last-observed. The table description
    // also says "(last /think Xm ago)" — clock overlay is the
    // associated visual.
    const modelOverlay = marker.signalKind === "last-observed"
      ? `<span class="clock-overlay" title="last observed signal">⏱</span>`
      : "";
    const effortOverlay = marker.effort.signalKind === "last-observed"
      ? `<span class="clock-overlay" title="last observed signal">⏱</span>`
      : "";

    const modelTooltip = this.modelTooltip(marker);
    const effortTooltip = this.effortTooltip(marker);

    const staleClass = stale ? "stale" : "";
    const staleAnnotation = stale
      ? `<div class="last-updated">last updated ${this.fmtAge(ageSec)} ago — stale</div>`
      : `<div class="last-updated">updated ${this.fmtAge(ageSec)} ago</div>`;

    // Model description sections — vertical stack at the bottom.
    // Round 9: replaces the round-7 table. When no mismatch, only
    // the description is rendered (no header, no rule — avoids
    // redundant chrome). When a mismatch exists, both sections get
    // the full header + rule + description treatment.
    const actualDescription = describeMarker(marker);
    const actualSection = mismatch
      ? `<div class="model-section">
      <div class="model-section-header">Actual Model</div>
      <div class="model-section-text">${this.escHtml(actualDescription)}</div>
    </div>`
      : `<div class="model-section">
      <div class="model-section-text">${this.escHtml(actualDescription)}</div>
    </div>`;
    const suggestedSection = mismatch
      ? `<div class="model-section model-section-suggested" title="${this.escAttr(mismatch.reason)}">
      <div class="model-section-header">Suggested</div>
      <div class="model-section-text">${this.escHtml(describeRecommendation(mismatch.recommendation))}</div>
    </div>`
      : "";
    const modelSections = `<div class="model-sections">${actualSection}${suggestedSection}</div>`;

    return `<div class="gauges ${staleClass}">
  <div class="${modelClasses}" title="${this.escAttr(modelTooltip)}">
    <div class="gauge-svg-wrap">
      ${this.renderGaugeSvg(marker.tier, marker.signalKind, modelNeedle)}
      ${modelOverlay}
    </div>
    <div class="gauge-sublabel">${modelSublabelText}</div>
  </div>
  <div class="${effortClasses}" title="${this.escAttr(effortTooltip)}">
    <div class="gauge-svg-wrap">
      ${this.renderGaugeSvg(this.effortColorBucket(marker.effort.normalized), marker.effort.signalKind, effortNeedle)}
      ${effortOverlay}
    </div>
    <div class="gauge-sublabel">${this.escHtml(this.effortDisplayName(marker.effort.normalized))}</div>
  </div>
</div>
${staleAnnotation}
${modelSections}`;
  }

  private renderGaugeSvg(tier: string, signalKind: string, needleAngleDeg: number): string {
    // 70×38 semi-circle. cx=35, cy=35 puts the needle pivot at the
    // bottom-mid; the arc spans from leftmost (7,35) through top (35,7)
    // to rightmost (63,35). Needle origin is (35,35); rotating by
    // needleAngleDeg, where -90° points up (top center), -180° points
    // left (low zone), 0° points right (flagship zone).
    //
    // Round B verifier finding 2026-05-18 (Q4): the prior implementation
    // used a `180 + angle` adjustment that inverted the y-axis,
    // sending -90° DOWN instead of UP and pushing all needle/fill
    // endpoints below the visible viewBox. Corrected by using the angle
    // directly (no offset). In SVG, y increases downward, so for
    // `needleAngleDeg = -90` (intended: up), Math.sin(-90°) = -1, and
    // `cy + radius * (-1) = cy - radius` correctly places the endpoint
    // at (cx, cy-radius) = top-center.
    const cx = 35;
    const cy = 35;
    const radius = 28;
    const arcBg = `M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${cx + radius},${cy}`;

    // Clamp the angle to the upper semicircle (-180..0). Compute the
    // fill arc's endpoint and the needle tip from that.
    const fillAngleDeg = Math.max(-180, Math.min(0, needleAngleDeg));
    const fillAngleRad = (fillAngleDeg * Math.PI) / 180;
    const fillEndX = cx + radius * Math.cos(fillAngleRad);
    const fillEndY = cy + radius * Math.sin(fillAngleRad);
    // All upper-semicircle arcs from leftmost (-180°) clockwise to any
    // angle in [-180, 0] traverse ≤180° → largeArc=0 always.
    const arcFill = `M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${fillEndX.toFixed(2)},${fillEndY.toFixed(2)}`;

    const needleAngleRad = (needleAngleDeg * Math.PI) / 180;
    const needleLength = radius - 4;
    const needleTipX = cx + needleLength * Math.cos(needleAngleRad);
    const needleTipY = cy + needleLength * Math.sin(needleAngleRad);

    return `<svg class="gauge-svg" viewBox="0 0 70 38" data-tier="${this.escAttr(tier)}" data-signal="${this.escAttr(signalKind)}">
  <path class="gauge-arc-bg" d="${arcBg}" />
  <path class="gauge-arc-fill" d="${arcFill}" />
  <path class="gauge-rim" d="${arcBg}" />
  <line class="gauge-needle" x1="${cx}" y1="${cy}" x2="${needleTipX.toFixed(2)}" y2="${needleTipY.toFixed(2)}" />
  <circle class="gauge-needle-pivot" cx="${cx}" cy="${cy}" r="1.6" />
</svg>`;
  }

  private tierToNeedleAngle(tier: string): number {
    // -180° = leftmost (low), -90° = top-center, 0° = rightmost (flagship).
    switch (tier) {
      case "low":      return -150;
      case "mid":      return -90;
      case "flagship": return -30;
      case "unknown":  return -90;
      default:         return -90;
    }
  }

  private effortToNeedleAngle(effort: string): number {
    // 5-level effort scale where Medium is the operator-facing
    // "default" (audit D6). Place Medium at the gauge center (-90°)
    // so the default state reads as "neutral" (half-filled arc), and
    // spread the escalations Low / High / Extra-High / Max around it.
    // Operator feedback 2026-05-18: Medium at -120° rendered with a
    // too-short color arc that looked "low" against the Model gauge's
    // longer arc — re-centering Medium fixes the visual imbalance
    // while preserving the red→green polarity.
    switch (effort) {
      case "low":        return -150;
      case "medium":     return -90;
      case "high":       return -60;
      case "extra-high": return -35;
      case "max":        return -15;
      default:           return -90;
    }
  }

  private effortColorBucket(effort: string): string {
    // Reuse tier color classes for the effort gauge: map normalized
    // effort → tier-class for the stroke color.
    switch (effort) {
      case "low":        return "low";
      case "medium":     return "mid";
      case "high":       return "mid";
      case "extra-high": return "flagship";
      case "max":        return "flagship";
      default:           return "unknown";
    }
  }

  private effortDisplayName(effort: string): string {
    switch (effort) {
      case "low":        return "Low";
      case "medium":     return "Medium";
      case "high":       return "High";
      case "extra-high": return "Extra-High";
      case "max":        return "Max";
      default:           return "Unknown";
    }
  }

  private modelTooltip(marker: OrchestratorMarker): string {
    const conf = marker.confidence;
    switch (marker.signalKind) {
      case "current":
        return conf === "low"
          ? "live signal (low confidence — hook payload missing model)"
          : `live signal (${conf} confidence)`;
      case "configured-default":
        return "configured default (medium confidence — does not track runtime changes)";
      case "last-observed":
        return "last observed via /think (high confidence in detection, but may not reflect current message)";
      case "manual":
        return "set manually (high confidence)";
      default:
        return "";
    }
  }

  private effortTooltip(marker: OrchestratorMarker): string {
    const eSig = marker.effort.signalKind;
    if (eSig === "last-observed" && marker.effort.observedAt) {
      const age = this.fmtAge((Date.now() - Date.parse(marker.effort.observedAt)) / 1000);
      return `last observed ${age} ago via ${marker.effort.native || "/think"} (high confidence in detection, but may not reflect current message)`;
    }
    if (eSig === "configured-default") {
      return "configured default effort (medium confidence — does not track runtime changes)";
    }
    if (eSig === "manual") {
      return "set manually (high confidence)";
    }
    return `effort: ${this.effortDisplayName(marker.effort.normalized)} (${marker.effort.confidence} confidence)`;
  }

  private fmtAge(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "?";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  }

  private escHtml(s: string): string {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private escAttr(s: string): string {
    return this.escHtml(s).replace(/"/g, "&quot;");
  }
}

```

---

## File 2: src/providers/SessionSetsModel.ts (new)

```typescript
import * as vscode from "vscode";
import { SessionSet, SessionState } from "../types";

// Set 029 Session 3: data-layer extraction from SessionSetsProvider so
// both the existing native `TreeView` (S3 ship) and the future custom
// webview tree (S4) can consume the same scan/bucket/sort/predicates
// without duplicating logic. The exported functions below are PURE —
// they take `SessionSet` records and return TreeItem chrome or text.
// The provider becomes a thin shim that calls into the model and the
// shared `fileSystem.readAllSessionSets()` scan.

// Set 030 Session 5: badge surfaced on any v2 (or broken-v3) state
// file. Tracked separately from the lifecycle-state badges so reviewers
// can see at a glance which sets still need a one-shot v3 migration
// even if they're otherwise healthy.
export function needsMigrationBadge(set: SessionSet): string {
  return set.needsMigration ? "(needs migration)" : "";
}

export const ICON_FILES: Record<SessionState, string> = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg",
};

export function iconUriFor(
  extensionUri: vscode.Uri,
  state: SessionState,
): vscode.Uri | undefined {
  const file = ICON_FILES[state];
  return file ? vscode.Uri.joinPath(extensionUri, "media", file) : undefined;
}

// Set 030 Session 3: the v3 "in-flight" predicate is a direct read of
// the canonical `liveSession.currentSession` field, which `fileSystem.ts`
// populates from `readProgress` as the single in-progress session's
// number (or null when no session is in flight). v2's
// "currentSession not in completedSessions[]" predicate is gone — the
// v3 reader resolves the ambiguity at the source rather than letting
// it propagate into a downstream invariant check.
export function isCurrentSessionInFlight(set: SessionSet): boolean {
  return set.liveSession?.currentSession != null;
}

export function progressText(set: SessionSet): string {
  // Always show X/total. The earlier "X/X" shape on done sets assumed
  // completed === total, which masks bugs like a SET-level flip to
  // "complete" that fires before all sessions ran. Truthful display
  // surfaces the discrepancy at a glance.
  //
  // Set 022 Session 2 added two annotations to disambiguate the row.
  // Set 030 Session 3 renamed the terminal annotation to "Complete"
  // so the display vocabulary matches the JSON status glossary:
  //   * `N/N Complete` on complete rows — operator-facing "yes this
  //     really reached terminal state" cue.
  //   * `0/N · session 1 in flight` on rows where session N has
  //     started but not yet closed.
  const base = set.totalSessions && set.totalSessions > 0
    ? `${set.sessionsCompleted}/${set.totalSessions}`
    : set.sessionsCompleted > 0
      ? `${set.sessionsCompleted} complete`
      : "";

  if (set.state === "complete" && base) {
    return `${base} Complete`;
  }
  if (set.state === "in-progress" && isCurrentSessionInFlight(set)) {
    const n = set.liveSession?.currentSession;
    const annotation = `session ${n} in flight`;
    return base ? `${base} · ${annotation}` : annotation;
  }
  return base;
}

export function touchedDate(set: SessionSet): string {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

export function uatBadge(set: SessionSet): string {
  if (!set.config?.requiresUAT || !set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0) return "[UAT done]";
  return "";
}

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the badge surfaces
// the rare case where a session set was closed via the hard-scoped
// ``--force`` bypass instead of the deterministic gate.
export function forceClosedBadge(set: SessionSet): string {
  return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}

// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
export function modeBadge(_set: SessionSet): string {
  return "";
}

// Bucket the scanned sets into the four lifecycle groups. The custom
// tree (S4) and the native tree (S3 ship) both consume this.
export interface BucketedSets {
  inProgress: SessionSet[];
  notStarted: SessionSet[];
  complete: SessionSet[];
  cancelled: SessionSet[];
}

export function bucketSets(all: SessionSet[]): BucketedSets {
  return {
    inProgress: all.filter((s) => s.state === "in-progress"),
    notStarted: all.filter((s) => s.state === "not-started"),
    complete: all.filter((s) => s.state === "complete"),
    cancelled: all.filter((s) => s.state === "cancelled"),
  };
}

// Sort within a bucket. In-progress / complete / cancelled rows sort by
// `lastTouched` desc (most recent first); not-started rows sort by name
// asc (operators usually want fresh-state rows in a stable order).
export function sortBucket(subset: SessionSet[], groupKey: SessionState): SessionSet[] {
  const out = subset.slice();
  if (groupKey === "not-started") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
  }
  return out;
}

```

---

## File 3: src/providers/SessionSetsProvider.ts (refactored)

```typescript
import * as vscode from "vscode";
import * as path from "path";
import { readAllSessionSets, discoverRoots } from "../utils/fileSystem";
import { SessionSet, SessionState } from "../types";
import { ScanState } from "./scanState";
import {
  bucketSets,
  forceClosedBadge,
  iconUriFor,
  isCurrentSessionInFlight,
  modeBadge,
  needsMigrationBadge,
  progressText,
  sortBucket,
  touchedDate,
  uatBadge,
} from "./SessionSetsModel";

// Set 029 Session 3: the data-layer extraction moved scan/bucket/sort
// helpers + the row-text predicates to `SessionSetsModel.ts`. This file
// is now a thin VS Code adapter — it owns the `TreeDataProvider`
// surface (refresh signaling, loading sentinel, TreeItem construction)
// and delegates every data decision to the model. The future custom
// webview tree (Set 029 S4) will consume the same model directly.
//
// Existing call sites (cancelTreeView.test.ts, forceClosedBadge.test.ts,
// sessionSetsProvider.test.ts) import named helpers from this file —
// the re-exports below preserve those imports verbatim.

export {
  forceClosedBadge,
  isCurrentSessionInFlight,
  modeBadge,
  needsMigrationBadge,
  progressText,
};

function folderTooltip(set: SessionSet): string {
  const roots = discoverRoots();
  const rel = path.relative(set.root, set.dir);
  return roots.length > 1 ? `${path.basename(set.root)} / ${rel}` : rel;
}

function contextValueFor(set: SessionSet): string {
  const parts = [`sessionSet:${set.state}`];
  if (set.config?.requiresUAT) parts.push("uat");
  if (set.config?.requiresE2E) parts.push("e2e");
  // Set 030 Session 5: append a `needs-migration` slug to the
  // contextValue when the set's state file is still v2.
  if (set.needsMigration) parts.push("needs-migration");
  return parts.join(":");
}

function liveSessionTooltipLines(set: SessionSet): string[] {
  if (!set.liveSession) return [];
  const ls = set.liveSession;
  const lines: string[] = [];
  if (typeof ls.currentSession === "number") {
    const total = set.totalSessions ? `/${set.totalSessions}` : "";
    const status = ls.status ? ` (${ls.status})` : "";
    lines.push(`Session: ${ls.currentSession}${total}${status}`);
  }
  if (ls.orchestrator) {
    const o = ls.orchestrator;
    const parts = [o.engine, o.model].filter(Boolean).join(" · ");
    const effort = o.effort && o.effort !== "unknown" ? ` @ effort=${o.effort}` : "";
    if (parts) lines.push(`Orchestrator: ${parts}${effort}`);
  }
  if (ls.verificationVerdict) {
    lines.push(`Verifier: ${ls.verificationVerdict}`);
  }
  if (ls.forceClosed === true) {
    lines.push(
      "Force-closed: gate bypassed via --force (incident recovery). " +
        "See closeout_force_used in session-events.jsonl for the operator's reason.",
    );
  }
  return lines;
}

function configTooltipLines(set: SessionSet): string[] {
  if (!set.config) return [];
  const flags: string[] = [];
  if (set.config.requiresUAT) flags.push("UAT");
  if (set.config.requiresE2E) flags.push("E2E");
  const lines: string[] = [];
  lines.push(`Gates: ${flags.length ? flags.join(" + ") : "none"}`);
  if (set.config.requiresUAT && set.uatSummary) {
    const u = set.uatSummary;
    if (u.totalItems > 0) {
      lines.push(`UAT items: ${u.pendingItems} pending / ${u.totalItems} total`);
    } else {
      lines.push("UAT checklist: not yet authored");
    }
  }
  return lines;
}

interface GroupItem extends vscode.TreeItem {
  contextValue: "group";
  groupKey: SessionState;
}

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

export class SessionSetsProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  _cache: SessionSet[] | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly scanState?: ScanState,
  ) {
    this.scanState?.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  refresh(): void {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!vscode.workspace.workspaceFolders?.length) return [];

    if (!element && this.scanState?.phase === "loading") {
      return [this.makeLoadingSentinel()];
    }

    if (!this._cache) {
      this._cache = readAllSessionSets();
    }
    const all = this._cache;

    if (!element) {
      if (all.length === 0) {
        return [];
      }
      const buckets = bucketSets(all);
      const groups: GroupItem[] = [
        this.makeGroup("In Progress", "in-progress", buckets.inProgress.length),
        this.makeGroup("Not Started", "not-started", buckets.notStarted.length),
        this.makeGroup("Complete", "complete", buckets.complete.length),
      ];
      // Set 8: the Cancelled group only renders when ≥ 1 cancelled set
      // exists. A repo that never cancels a set should not see the group.
      if (buckets.cancelled.length > 0) {
        groups.push(this.makeGroup("Cancelled", "cancelled", buckets.cancelled.length));
      }
      return groups;
    }

    const group = element as GroupItem;
    if (group.contextValue === "group") {
      const buckets = bucketSets(all);
      let subset: SessionSet[];
      switch (group.groupKey) {
        case "in-progress": subset = buckets.inProgress; break;
        case "not-started": subset = buckets.notStarted; break;
        case "complete":    subset = buckets.complete;    break;
        case "cancelled":   subset = buckets.cancelled;   break;
      }
      return sortBucket(subset, group.groupKey).map((s) => this.makeSetItem(s));
    }

    return [];
  }

  // Set 030 Session 5: the loading sentinel shown while the
  // activation-time scan is in flight.
  private makeLoadingSentinel(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      "Setting up your project…",
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = "scanning session sets…";
    item.iconPath = vscode.Uri.joinPath(this.extensionUri, "media", "icon.svg");
    item.contextValue = "loading";
    item.tooltip =
      "Dabbler is scanning `docs/session-sets/` for session sets. " +
      "This usually completes within a frame; longer means a slow " +
      "filesystem or many sets to read.";
    return item;
  }

  private makeGroup(label: string, groupKey: SessionState, count: number): GroupItem {
    const item = new vscode.TreeItem(
      `${label}  (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    ) as GroupItem;
    item.iconPath = iconUriFor(this.extensionUri, groupKey);
    item.contextValue = "group";
    item.groupKey = groupKey;
    return item;
  }

  private makeSetItem(set: SessionSet): SetItem {
    const item = new vscode.TreeItem(
      set.name,
      vscode.TreeItemCollapsibleState.None,
    ) as SetItem;
    const bits = [
      progressText(set),
      touchedDate(set),
      modeBadge(set),
      uatBadge(set),
      forceClosedBadge(set),
      needsMigrationBadge(set),
    ].filter(Boolean);
    item.description = bits.join("  ·  ");
    item.tooltip = new vscode.MarkdownString(
      [
        `**${set.name}**`,
        `State: ${set.state}`,
        bits.length ? `Progress: ${bits.join(" · ")}` : null,
        ...configTooltipLines(set),
        ...liveSessionTooltipLines(set),
        `Folder: \`${folderTooltip(set)}\``,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    item.contextValue = contextValueFor(set);
    item.set = set;
    item.iconPath = iconUriFor(this.extensionUri, set.state);
    item.command = {
      command: "dabblerSessionSets.openSpec",
      title: "Open Spec",
      arguments: [item],
    };
    return item;
  }
}

```

---

## File 4: src/test/playwright/orchestrator-indicator.spec.ts

```typescript
// Layer 3 rendering smoke for the orchestrator indicator gauges
// (Set 029, schema v3 / per-session-set identity model — Session 3).
//
// Strategy: every test materializes a tmpdir workspace with at least
// one session set, flips that set to in-progress via the harness, then
// seeds the marker file at the per-set path
//   <workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json
// and asserts on the rendered indicator. We redirect USERPROFILE /
// HOME to a per-test tmpdir so the writer-log file (still global at
// ~/.dabbler/orchestrator-writer.log) lives under our control for the
// fail-closed scenarios.
//
// Webview content lives in a nested iframe rendered by VS Code; we
// reach it via page.frameLocator and assert on the inner HTML's
// rendered text + CSS class hooks. We deliberately don't pixel-diff —
// gauge color is a function of the theme and isn't worth the maintenance.
//
// Scenarios:
//   A. seed Opus current → flagship needle + solid fill + provider/model label
//   B. seed Haiku current → low-tier needle position
//   C. seed model=unknown confidence=low → "low confidence" tooltip phrasing
//   D. seed effort.signalKind=last-observed → clock-icon + "(last /think Xm ago)"
//   E. seed signalKind=configured-default → "(configured default)" suffix line
//   F. seed updatedAt 9h ago → stale class on .gauges + "last updated 9h ago"
//   G. empty (no marker) → "No signal — install hook" CTA
//   H. helper-script multi-writer precedence (non-Electron)
//   I. mismatched sessionSetSlug → empty-state CTA (slug-integrity check)
//   J. helper-script ambiguous (2 in-progress sets) → write skipped, log entry
//   K. helper-script writes to per-set path on single in-progress set
//   L. helper-script invoked outside docs/session-sets/ → skip, no orphan

import { expect, test } from "@playwright/test";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeSet,
  makeTmpDir,
  startSession,
} from "./electronLaunch";

interface PerTest {
  workspaceTmp?: string;
  fakeHome?: string;
  launch?: LaunchedVSCode;
  prevUserprofile?: string | undefined;
  prevHome?: string | undefined;
}

// Seed a v3 marker at the per-set path. Assumes the seed set has
// already been flipped to in-progress so the reader's resolver finds
// it. The marker file's content drives the gauges.
function seedPerSetMarker(setDir: string, marker: Record<string, unknown>): void {
  const dir = path.join(setDir, ".dabbler");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "orchestrator.json"),
    JSON.stringify(marker, null, 2) + "\n",
    "utf8",
  );
}

function setHomeEnv(fakeHome: string, per: PerTest): void {
  per.prevUserprofile = process.env.USERPROFILE;
  per.prevHome = process.env.HOME;
  process.env.USERPROFILE = fakeHome;
  process.env.HOME = fakeHome;
}

function restoreHomeEnv(per: PerTest): void {
  if (per.prevUserprofile === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = per.prevUserprofile;
  }
  if (per.prevHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = per.prevHome;
  }
}

// Set up a workspace with one in-progress session set. Returns the
// FixtureHandle so the test can write into the resolved set's
// `.dabbler/orchestrator.json`.
function makeInProgressWorkspace(per: PerTest, slug: string = "orchestrator-seed") {
  per.workspaceTmp = makeTmpDir("dabbler-pw-orchestrator");
  const seed = makeSet(per.workspaceTmp, slug, 1);
  startSession(seed, 1); // flip seed to in-progress
  return seed;
}

async function openIndicatorFrame(launch: LaunchedVSCode): Promise<import("@playwright/test").Frame> {
  const page = launch.page;
  const activityIcon = page.locator(
    '.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]',
  );
  await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
  await activityIcon.click();
  // VS Code's webview view layout: outer `iframe.webview` host with a
  // programmatic child frame loading `vscode-webview://.../fake.html`.
  // Use the Frame API to grab the child frame and wait for .container.
  const deadline = Date.now() + 30_000;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const outerHandle = await page.locator("iframe.webview").first().elementHandle();
      if (outerHandle) {
        const outerFrame = await outerHandle.contentFrame();
        if (outerFrame) {
          const children = outerFrame.childFrames();
          for (const child of children) {
            try {
              await child.locator(".container").waitFor({ timeout: 1000 });
              return child;
            } catch {
              // not this one — fall through
            }
          }
        }
      }
    } catch (err) {
      lastErr = err;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `openIndicatorFrame timed out waiting for .container in any child frame of iframe.webview. ` +
    `Last error: ${(lastErr as Error | null)?.message ?? "none"}`,
  );
}

async function teardown(per: PerTest): Promise<void> {
  if (per.launch) {
    try { await closeVSCode(per.launch); } catch { /* best effort */ }
  }
  if (per.workspaceTmp) {
    try { cleanupTmpDir(per.workspaceTmp); } catch { /* best effort */ }
  }
  if (per.fakeHome) {
    try { fs.rmSync(per.fakeHome, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  restoreHomeEnv(per);
}

// -----------------------------------------------------------------------
// Scenario A: current Claude Opus → flagship gauge classes + label.
// -----------------------------------------------------------------------
test("renders current Opus marker with flagship tier classes + label", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-A");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    seedPerSetMarker(seed.set_dir, {
      schemaVersion: 3,
      sessionSetSlug: seed.slug,
      updatedAt: new Date().toISOString(),
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-opus-4-7",
      modelDisplayName: "Opus 4.7",
      tier: "flagship",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "high",
      },
      stalenessMaxSec: 28800,
    });
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauge-cell.tier-flagship.signal-current")).toBeVisible();
    await expect(frame.locator(".gauge-cell.tier-flagship .gauge-sublabel")).toContainText(/Claude\s+Opus 4\.7/);
    await expect(frame.locator(".gauges.stale")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario B: low-tier Haiku marker → low-tier classes + Haiku label.
// -----------------------------------------------------------------------
test("renders Haiku marker with low-tier classes", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-B");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    seedPerSetMarker(seed.set_dir, {
      schemaVersion: 3,
      sessionSetSlug: seed.slug,
      updatedAt: new Date().toISOString(),
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-haiku-4-5-20251001",
      modelDisplayName: "Haiku 4.5",
      tier: "low",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "high",
      },
      stalenessMaxSec: 28800,
    });
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauge-cell.tier-low.signal-current")).toBeVisible();
    await expect(frame.locator(".gauge-cell.tier-low .gauge-sublabel")).toContainText(/Claude\s+Haiku 4\.5/);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario C: low-confidence marker → tooltip phrasing reflects it.
// -----------------------------------------------------------------------
test("renders confidence-low marker with explicit low-confidence tooltip", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-C");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    seedPerSetMarker(seed.set_dir, {
      schemaVersion: 3,
      sessionSetSlug: seed.slug,
      updatedAt: new Date().toISOString(),
      writer: "claude-code-session-start-hook",
      signalKind: "current",
      confidence: "low",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "unknown",
      modelDisplayName: "Claude (model unknown)",
      tier: "unknown",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "low",
      },
      stalenessMaxSec: 28800,
    });
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    const cell = frame.locator(".gauge-cell.tier-unknown.signal-current").first();
    await expect(cell).toBeVisible();
    const tip = await cell.getAttribute("title");
    expect(tip || "").toContain("low confidence");
    expect(tip || "").toContain("hook payload missing model");
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario D: effort.signalKind = last-observed → clock overlay + suffix.
// -----------------------------------------------------------------------
test("renders last-observed effort with clock overlay and elapsed time suffix", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-D");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    const observed = new Date(Date.now() - 12 * 60 * 1000).toISOString();
    seedPerSetMarker(seed.set_dir, {
      schemaVersion: 3,
      sessionSetSlug: seed.slug,
      updatedAt: new Date().toISOString(),
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-opus-4-7",
      modelDisplayName: "Opus 4.7",
      tier: "flagship",
      effort: {
        normalized: "high",
        native: "/think",
        thinking: true,
        signalKind: "last-observed",
        confidence: "high",
        observedAt: observed,
      },
      stalenessMaxSec: 28800,
    });
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    const effortCell = frame.locator(".gauge-cell.signal-last-observed").first();
    await expect(effortCell).toBeVisible();
    await expect(effortCell.locator(".clock-overlay")).toBeVisible();
    await expect(frame.locator(".model-section-text").first()).toContainText(/last \/think 12m ago/);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario E: signalKind=configured-default → "(configured default)" suffix.
// -----------------------------------------------------------------------
test("renders configured-default marker with (default) suffix (no stripes)", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-E");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    seedPerSetMarker(seed.set_dir, {
      schemaVersion: 3,
      sessionSetSlug: seed.slug,
      updatedAt: new Date().toISOString(),
      writer: "codex-config-watcher",
      signalKind: "configured-default",
      confidence: "medium",
      provider: "openai",
      providerDisplayName: "Codex",
      model: "gpt-5-codex",
      modelDisplayName: "gpt-5-codex",
      tier: "flagship",
      effort: {
        normalized: "high",
        native: "high",
        thinking: false,
        signalKind: "configured-default",
        confidence: "medium",
      },
      stalenessMaxSec: 28800,
    });
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauge-cell.signal-configured-default").first()).toBeVisible();
    await expect(frame.locator(".model-section-text").first()).toContainText("configured default");
    await expect(frame.locator(".gauges.stale")).toHaveCount(0);
    await expect(frame.locator(".default-pill")).toHaveCount(0);
    await expect(frame.locator(".gauge-suffix")).toHaveCount(0);
    await expect(frame.locator(".model-table")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario F: 9h-old marker → stale class + "last updated 9h ago".
// -----------------------------------------------------------------------
test("renders stale state with diagonal-stripe class and last-updated annotation", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-F");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    seedPerSetMarker(seed.set_dir, {
      schemaVersion: 3,
      sessionSetSlug: seed.slug,
      updatedAt: nineHoursAgo,
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-opus-4-7",
      modelDisplayName: "Opus 4.7",
      tier: "flagship",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "high",
      },
      stalenessMaxSec: 28800,
    });
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauges.stale")).toBeVisible();
    await expect(frame.getByText(/last updated 9h ago — stale/)).toBeVisible();
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario G: no marker → "No signal — install hook" CTA.
// -----------------------------------------------------------------------
test("renders empty-state CTA when marker file is absent", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-G");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    // Do NOT seed the marker — the per-set path is empty.
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".empty-state")).toBeVisible();
    await expect(frame.getByText(/No signal/)).toBeVisible();
    await expect(frame.locator(".install-cta")).toContainText(/install hook/);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario H: helper-script multi-writer precedence (non-Electron).
//             Tests the helper directly because the precedence skip is
//             a marker-writer concern, not a rendering concern. Under
//             v3 the helper writes to a per-set path resolved by walk-
//             up; we build a tmpdir workspace with a single in-progress
//             set and point the helper at it via --cwd.
// -----------------------------------------------------------------------
test("helper script skips configured-default write when current signal exists", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-H");
    const helper = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "scripts",
      "write-orchestrator-marker.js",
    );
    expect(fs.existsSync(helper)).toBe(true);

    const seed = makeInProgressWorkspace(per, "helper-precedence-set");

    function runHelper(modeArgs: string[], payload: Record<string, unknown>): { exit: number; logEntries: number } {
      const result = cp.spawnSync(
        process.execPath,
        [helper, ...modeArgs, "--cwd", seed.repo_root],
        {
          input: JSON.stringify(payload),
          env: {
            ...process.env,
            USERPROFILE: per.fakeHome,
            HOME: per.fakeHome,
          },
          encoding: "utf8",
        },
      );
      const logPath = path.join(per.fakeHome!, ".dabbler", "orchestrator-writer.log");
      const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
      return {
        exit: result.status ?? -1,
        logEntries: log.split("\n").filter((l) => l.trim().length > 0).length,
      };
    }

    // Write a current Claude marker.
    let r = runHelper(["--mode", "session-start"], {
      hook_event_name: "SessionStart",
      source: "startup",
      model: "claude-opus-4-7",
    });
    expect(r.exit).toBe(0);
    expect(r.logEntries).toBe(0);

    // Try to write a configured-default Codex marker — should be skipped.
    r = runHelper(["--mode", "configured-default", "--writer", "codex-config-watcher"], {
      provider: "openai",
      model: "gpt-5-codex",
      effort: { normalized: "high", native: "high" },
    });
    expect(r.exit).toBe(0);
    expect(r.logEntries).toBe(1);

    // Marker should still be the Claude current signal, at the per-set
    // path — not anywhere under the fake-home directory.
    const markerPath = path.join(seed.set_dir, ".dabbler", "orchestrator.json");
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    expect(marker.signalKind).toBe("current");
    expect(marker.model).toBe("claude-opus-4-7");
    expect(marker.schemaVersion).toBe(3);
    expect(marker.sessionSetSlug).toBe(seed.slug);
  } finally {
    if (per.fakeHome) {
      try { fs.rmSync(per.fakeHome, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    if (per.workspaceTmp) {
      try { cleanupTmpDir(per.workspaceTmp); } catch { /* best effort */ }
    }
  }
});

// -----------------------------------------------------------------------
// Scenario I: marker whose sessionSetSlug doesn't match the resolved
// set falls back to empty state (slug-integrity check, schema-v3).
// -----------------------------------------------------------------------
test("renders empty-state when marker's sessionSetSlug mismatches the resolved set", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-I");
    setHomeEnv(per.fakeHome, per);
    const seed = makeInProgressWorkspace(per);
    seedPerSetMarker(seed.set_dir, {
      schemaVersion: 3,
      // Deliberately MISMATCHED slug — should trigger the empty-state fallback.
      sessionSetSlug: "some-other-slug-that-does-not-match",
      updatedAt: new Date().toISOString(),
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-opus-4-7",
      modelDisplayName: "Opus 4.7",
      tier: "flagship",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "high",
      },
      stalenessMaxSec: 28800,
    });
    per.launch = await launchVSCode(seed.repo_root);
    const frame = await openIndicatorFrame(per.launch);
    // Slug integrity check fails → empty-state CTA, not the gauges.
    await expect(frame.locator(".empty-state")).toBeVisible();
    await expect(frame.getByText(/No signal/)).toBeVisible();
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario J: helper-script ambiguous resolution (2 in-progress sets) —
// writer skips, log carries the ambiguity entry, no marker is written.
// -----------------------------------------------------------------------
test("helper script skips write when multiple in-progress sets are resolvable", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-J");
    const helper = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "scripts",
      "write-orchestrator-marker.js",
    );

    // Materialize TWO in-progress sets in one workspace.
    per.workspaceTmp = makeTmpDir("dabbler-pw-ambiguous");
    const seedA = makeSet(per.workspaceTmp, "ambiguous-set-a", 1);
    startSession(seedA, 1);
    // Tack a second set into the same repo by carving the directory
    // shape directly — the harness's make-set creates its own repo so
    // we can't reuse it for a sibling set. Drop a minimal
    // session-state.json with status: "in-progress" alongside the first.
    const sessionSetsDir = path.dirname(seedA.set_dir);
    const setBDir = path.join(sessionSetsDir, "ambiguous-set-b");
    fs.mkdirSync(setBDir, { recursive: true });
    fs.writeFileSync(
      path.join(setBDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 3,
        sessionSetName: "ambiguous-set-b",
        currentSession: 1,
        totalSessions: 1,
        completedSessions: [],
        status: "in-progress",
        lifecycleState: "work_in_progress",
      }, null, 2),
      "utf8",
    );

    const result = cp.spawnSync(
      process.execPath,
      [helper, "--mode", "session-start", "--cwd", seedA.repo_root],
      {
        input: JSON.stringify({
          hook_event_name: "SessionStart",
          source: "startup",
          model: "claude-opus-4-7",
        }),
        env: {
          ...process.env,
          USERPROFILE: per.fakeHome,
          HOME: per.fakeHome,
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0); // fail-closed is a successful no-op

    // Neither set should have a marker file.
    const markerA = path.join(seedA.set_dir, ".dabbler", "orchestrator.json");
    const markerB = path.join(setBDir, ".dabbler", "orchestrator.json");
    expect(fs.existsSync(markerA)).toBe(false);
    expect(fs.existsSync(markerB)).toBe(false);

    // Writer log should carry the ambiguity entry.
    const logPath = path.join(per.fakeHome, ".dabbler", "orchestrator-writer.log");
    expect(fs.existsSync(logPath)).toBe(true);
    const logLines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter((l) => l.length > 0);
    expect(logLines.length).toBeGreaterThanOrEqual(1);
    const lastEntry = JSON.parse(logLines[logLines.length - 1]);
    expect(lastEntry.reason).toBe("multiple-in-progress-sets");
    expect(Array.isArray(lastEntry.candidates)).toBe(true);
    expect(lastEntry.candidates).toEqual(expect.arrayContaining(["ambiguous-set-a", "ambiguous-set-b"]));
  } finally {
    if (per.fakeHome) {
      try { fs.rmSync(per.fakeHome, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    if (per.workspaceTmp) {
      try { cleanupTmpDir(per.workspaceTmp); } catch { /* best effort */ }
    }
  }
});

// -----------------------------------------------------------------------
// Scenario K: helper-script writes to per-set path on single in-progress.
// Validates the happy path of the walk-up resolver end-to-end.
// -----------------------------------------------------------------------
test("helper script writes marker to per-set path on single in-progress set", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-K");
    const helper = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "scripts",
      "write-orchestrator-marker.js",
    );

    const seed = makeInProgressWorkspace(per, "per-set-write-target");
    const result = cp.spawnSync(
      process.execPath,
      [helper, "--mode", "session-start", "--cwd", seed.repo_root],
      {
        input: JSON.stringify({
          hook_event_name: "SessionStart",
          source: "startup",
          model: "claude-opus-4-7",
        }),
        env: {
          ...process.env,
          USERPROFILE: per.fakeHome,
          HOME: per.fakeHome,
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);

    const markerPath = path.join(seed.set_dir, ".dabbler", "orchestrator.json");
    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    expect(marker.schemaVersion).toBe(3);
    expect(marker.sessionSetSlug).toBe(seed.slug);
    expect(marker.signalKind).toBe("current");
    expect(marker.model).toBe("claude-opus-4-7");

    // Self-protecting .gitignore was dropped alongside the marker.
    const ignorePath = path.join(seed.set_dir, ".dabbler", ".gitignore");
    expect(fs.existsSync(ignorePath)).toBe(true);
    const ignoreContent = fs.readFileSync(ignorePath, "utf8");
    expect(ignoreContent).toContain("*");
    expect(ignoreContent).toContain("!.gitignore");

    // No global marker at ~/.dabbler/current-orchestrator.json — the v2
    // global path is fully retired.
    const legacyMarker = path.join(per.fakeHome, ".dabbler", "current-orchestrator.json");
    expect(fs.existsSync(legacyMarker)).toBe(false);
  } finally {
    if (per.fakeHome) {
      try { fs.rmSync(per.fakeHome, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    if (per.workspaceTmp) {
      try { cleanupTmpDir(per.workspaceTmp); } catch { /* best effort */ }
    }
  }
});

// -----------------------------------------------------------------------
// Scenario L: helper-script invoked outside any docs/session-sets/
// directory — write is skipped, no orphan marker is created anywhere.
// -----------------------------------------------------------------------
test("helper script skips write when cwd is outside any docs/session-sets/", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-L");
    const helper = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "scripts",
      "write-orchestrator-marker.js",
    );

    // Bare tmpdir with no `docs/session-sets/` anywhere on the walk-up.
    const cwd = makeTmpDir("dabbler-pw-no-sets");

    const result = cp.spawnSync(
      process.execPath,
      [helper, "--mode", "session-start", "--cwd", cwd],
      {
        input: JSON.stringify({
          hook_event_name: "SessionStart",
          source: "startup",
          model: "claude-opus-4-7",
        }),
        env: {
          ...process.env,
          USERPROFILE: per.fakeHome,
          HOME: per.fakeHome,
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0); // fail-closed is a no-op

    // The writer log records the reason; no marker is anywhere.
    const logPath = path.join(per.fakeHome, ".dabbler", "orchestrator-writer.log");
    expect(fs.existsSync(logPath)).toBe(true);
    const lastEntry = JSON.parse(
      fs.readFileSync(logPath, "utf8").trim().split("\n").pop()!,
    );
    expect(lastEntry.reason).toBe("no-docs-session-sets");

    // No global v2 marker was created either.
    const legacyMarker = path.join(per.fakeHome, ".dabbler", "current-orchestrator.json");
    expect(fs.existsSync(legacyMarker)).toBe(false);

    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* best effort */ }
  } finally {
    if (per.fakeHome) {
      try { fs.rmSync(per.fakeHome, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

```

---

## File 5: CHANGELOG.md ([0.15.0] section + unreleased)

# Changelog

All notable changes to Dabbler AI Orchestration are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.15.0] — 2026-05-18 (Set 029 Session 3 — per-session-set identity)

### Changed — orchestrator-marker identity model (BREAKING within the v0.14.2 preview)

- **Marker schema bumped to v3.** New top-level `sessionSetSlug` field
  carries the slug of the session set the marker belongs to. The
  reader validates `sessionSetSlug` against the resolved set before
  rendering; a mismatch falls back to the empty-state CTA (treats the
  marker as orphaned).
- **Per-session-set marker path.** Markers now live at
  `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`
  instead of the legacy global `~/.dabbler/current-orchestrator.json`.
  Three parallel VS Code windows on three different consumer repos
  now render their own correct orchestrator state — the cross-window
  contamination bug from the v0.14.2 preview is eliminated.
- **Walk-up resolver in `scripts/write-orchestrator-marker.js`.** The
  writer walks up from `cwd` looking for `docs/session-sets/`, then
  scans subdirectories for the single set whose `session-state.json`
  reports `status: "in-progress"`. The reader runs the same algorithm
  rooted at the workspace folder.
- **Fail-closed posture.** When zero or more than one in-progress
  sets are resolvable (or no `docs/session-sets/` directory is reachable
  from `cwd`), the writer SKIPS the write and appends a diagnostic
  line to `~/.dabbler/orchestrator-writer.log` (which stays global so
  one log captures every writer attempt across every session set).
  No workspace-level orphan marker is created. The renderer surfaces
  its existing empty-state CTA on the same conditions.
- **Watcher re-binding on set transitions.** The indicator now watches
  every workspace `docs/session-sets/*/session-state.json` file in
  addition to the resolved per-set marker, so close-out flips and
  start_session events trigger an immediate re-resolution + re-render.
- **`.gitignore` self-protection.** On first write, the writer drops
  a `.gitignore` containing `*\n!.gitignore\n` into the per-set
  `.dabbler/` directory. The workspace's root `.gitignore` does not
  need to be patched for the marker file to stay untracked —
  consumer repos inherit the protection automatically. This canonical
  repo's `.gitignore` also lists `docs/session-sets/*/.dabbler/` as
  belt-and-suspenders.
- **`SessionSetsModel` data-layer extraction.** Pulled `progressText`,
  `isCurrentSessionInFlight`, `iconUriFor`, `needsMigrationBadge`,
  `forceClosedBadge`, `bucketSets`, `sortBucket`, and friends out of
  `SessionSetsProvider.ts` into `src/providers/SessionSetsModel.ts`.
  The provider is now a thin VS Code adapter; the model is the
  canonical home and is what the Set 029 S4 custom webview tree will
  consume. Existing callers continue to import from
  `SessionSetsProvider` via re-exports — no breakage.

### Removed

- **Legacy global marker path.** `~/.dabbler/current-orchestrator.json`
  is no longer read or written. Operators who installed the v0.14.2
  Claude Code hook must re-run `Dabbler: Install Orchestrator Hook
  (Claude Code)` to pick up the new walk-up resolver in the helper
  script (the installer is idempotent; helper-script path unchanged).
  Acceptable because v0.14.2 never shipped to Marketplace — no
  external consumer is affected.

### Known limitations

- **Wrong-set attachment (R8).** A stale `session-state.json` that
  lingers as `in-progress` after a forgotten close-out causes the
  walk-up resolver to attach the marker to the wrong work. Mitigation
  in this release: the indicator's hover tooltip surfaces the
  resolved set slug so the operator can spot the mismatch. Set 029 S4
  may add a small "attached to: \<slug\>" badge in the gauge frame.
- **`.gitignore` auto-patch (R9).** Workspaces that haven't been
  re-initialized still have their root `.gitignore` un-patched. The
  per-set `.dabbler/.gitignore` self-protection covers this case —
  the marker file stays untracked even without the root patch.

### Documentation

- **`docs/orchestrator-marker-schema.md`** — new file documenting the
  v3 marker shape, the per-set path, the walk-up resolver algorithm,
  the fail-closed posture, and the migration from the legacy v2
  global marker.

### Set 029 mid-set pivot (2026-05-18, S3 spec basis)

Cross-provider audit reshaped Set 029 from 4 → 6 sessions. Audit +
decisions:
[`docs/proposals/2026-05-18-custom-tree-pivot/`](../../docs/proposals/2026-05-18-custom-tree-pivot/)
(proposal.md, GPT-5.4 + Gemini Pro consensus, synthesis.md,
s3-spec-delta.md). The custom-tree pivot (replacing the native
`dabblerSessionSets` TreeView with a webview-rendered accordion that
embeds the gauges into each in-progress set's row) is S4 with its own
pre-session audit. Non-Claude provider detection is S5; README +
Marketplace publish is S6.


