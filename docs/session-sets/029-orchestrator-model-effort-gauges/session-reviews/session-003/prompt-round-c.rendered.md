# Set 029 Session 3 verification — Round C (Round-B MUST-FIX confirmation)

## Context

Round A (writer + schema doc) VERIFIED clean.
Round B (reader + model + provider) returned MUST-FIX (3):
- **Q5:** slug validation truthiness bug (`marker.sessionSetSlug && ...`
  let null / empty-string through as "absent" instead of "mismatch")
- **Q6:** state watcher never binds if `workspaceFolders` is empty at
  `resolveWebviewView` time
- **Q8:** spec says reader "logs" on slug mismatch; implementation
  was falling silent

Round C re-verifies that the three fixes were applied correctly. The
suggest item ("end-to-end ambiguous test launching VS Code with two
in-progress sets") is deferred to S4 — the helper-side scenario J
already exercises the writer behavior, and the reader's
empty-state-on-unresolved is covered by scenarios G + I.

Per memory `feedback_split_large_verification_bundles`, this round
bundles ONLY the reader source (the file all three fixes touch).
Pinned to gemini-pro to dodge the gpt-5-4 429s observed earlier.

## What you're being asked to verify

For each of the three fixes, answer with **VERIFIED / MUST-FIX /
SUGGEST**. The Round-B suggest (no end-to-end ambiguous test) is
acknowledged as deferred; do not re-flag it.

### F1. Q5 fix — stricter slug-presence check

The slug-validation expression in `computeState()` changed from:

```ts
if (marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug) {
  return { kind: "empty" };
}
```

to:

```ts
if (marker.sessionSetSlug !== undefined && marker.sessionSetSlug !== res.resolved.slug) {
  this.getOutputChannel().appendLine(`...`); // F3 logging
  return { kind: "empty" };
}
```

Verify:
- The `!== undefined` guard correctly treats `null`, `""`, and any
  truthy non-matching string as MISMATCH (→ empty state, fail closed).
- Only an actually-omitted `sessionSetSlug` field (literally
  `undefined` at property-access time) passes through — the
  forward-compat path for a hypothetical v4 marker that drops the
  field.
- An empty-string slug `""` no longer leaks the "absent" semantics:
  with the old guard `"" && ...` short-circuited; the new guard
  `"" !== undefined && ...` passes the first check and proceeds to
  the mismatch comparison, which correctly returns true (`"" !==
  "real-slug"`) and routes to empty state.

### F2. Q6 fix — `onDidChangeWorkspaceFolders` listener

A new instance field `workspaceFoldersListener: vscode.Disposable | undefined`
was added. `resolveWebviewView()` now subscribes to
`vscode.workspace.onDidChangeWorkspaceFolders`. The callback
disposes the stale state watcher, re-runs `setUpStateWatcher()`,
re-runs `rebindMarkerWatcher()`, and schedules a render.

`tearDownWatchers()` now also disposes the
`workspaceFoldersListener`.

Verify:
- The listener is wired BEFORE the initial `setUpStateWatcher()` call
  so that even if a folder opens during the synchronous tail of
  `resolveWebviewView`, the listener catches it.
- The callback's order (dispose → setUp → rebind → render) is right:
  the state watcher MUST be recreated before `rebindMarkerWatcher`
  computes a new resolution against the new folder set.
- Disposal is leak-free: `tearDownWatchers()` covers the listener,
  and `tearDownWatchers()` is called from the view's `onDidDispose`
  handler.
- Edge case: an operator opens then closes a folder. The listener
  fires on both events; on close, `workspaceFolders` is empty,
  `setUpStateWatcher()` early-returns (its guard:
  `if (!folders || folders.length === 0) return;`), and the marker
  watcher rebinds to null. The render shows empty state. ✓

### F3. Q8 fix — slug-mismatch log to output channel

A lazy `getOutputChannel()` helper creates an output channel
"Dabbler Orchestrator Indicator" on first use. The slug-mismatch
branch in `computeState()` now appends a timestamped line with the
mismatched slug, the resolved slug, and the resolved marker path
before returning `{ kind: "empty" }`.

Verify:
- Channel creation is lazy: installations that never hit slug
  mismatch don't get a spurious output-channel entry.
- The log line carries enough detail to diagnose: timestamp,
  marker file path, both slugs (the marker's claimed slug, the
  reader's resolved slug). The `String(...)` wrapper around
  `marker.sessionSetSlug` is correct for cases where the value is
  `null` (which prints as `"null"` rather than crashing).
- The log is purely informational — operators can find it via VS
  Code's "Output" pane, dropdown set to "Dabbler Orchestrator
  Indicator". No popup, no toast, no console.error (which would
  surface in the extension host log indiscriminately).

---

## Final verdict (Round C)

Emit one summary line at the end:

`VERDICT: VERIFIED` if F1–F3 all pass without must-fix items
`VERDICT: MUST-FIX (<count>)` if any F has a must-fix
`VERDICT: SUGGEST (<count>)` if no must-fix but ≥1 suggest items

Followed by a 2–3-sentence overall summary.


---

## File 1: src/providers/orchestratorIndicatorProvider.ts (post-fix)

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
  // Listener for workspace-folder changes — covers the case where the
  // view activates before any folder is open (operator pinned the
  // indicator while at the welcome page) and then a folder opens
  // later. Without this, the state watcher would never bind and the
  // 60s poll would be the only signal for set transitions.
  private workspaceFoldersListener: vscode.Disposable | undefined;
  private currentMarkerPath: string | null = null;
  private pollHandle: NodeJS.Timeout | undefined;
  private renderTimer: NodeJS.Timeout | undefined;
  // Diagnostic channel for slug-mismatch fallbacks (and any other
  // reader-side fallback the operator may want to investigate). Lazy:
  // created on first append so we don't spawn an output-pane entry
  // for installations that never hit the fallback.
  private outputChannel: vscode.OutputChannel | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  private getOutputChannel(): vscode.OutputChannel {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel("Dabbler Orchestrator Indicator");
    }
    return this.outputChannel;
  }

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

    // Round-B verifier fix (Q6): listen to workspace-folder changes so
    // the indicator wires up cleanly even when the view activates
    // before any folder is open. Without this, the state watcher
    // would never bind (it depends on `workspaceFolders[0]`), and
    // the 60s poll backstop would be the only signal for set
    // transitions until the operator manually closed/reopened the view.
    this.workspaceFoldersListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      // Re-create the state watcher (its RelativePattern is rooted
      // at `folders[0]`, which is now stale or freshly available).
      this.stateWatcherDisposable?.dispose();
      this.stateWatcherDisposable = undefined;
      this.setUpStateWatcher();
      this.rebindMarkerWatcher();
      this.scheduleRender();
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
    this.workspaceFoldersListener?.dispose();
    this.workspaceFoldersListener = undefined;
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
    // Round-B verifier fix (Q5): use `!== undefined` rather than the
    // truthiness guard so null / empty-string slugs are correctly
    // treated as MISMATCH (fail closed) rather than ABSENT (permissive).
    // Only an actually-omitted `sessionSetSlug` field passes through
    // unchecked, which is the intended forward-compat path for a
    // hypothetical v4 marker that drops the field.
    if (marker.sessionSetSlug !== undefined && marker.sessionSetSlug !== res.resolved.slug) {
      // Round-B verifier fix (Q8): log to the output channel on
      // mismatch so an operator investigating "why does my gauge show
      // empty?" can find the diagnostic without grepping the
      // orchestrator-writer.log (which is writer-side and won't carry
      // a reader-side mismatch).
      this.getOutputChannel().appendLine(
        `[${new Date().toISOString()}] Slug mismatch at ${res.resolved.markerPath}: ` +
        `marker has '${String(marker.sessionSetSlug)}', resolved set is '${res.resolved.slug}'. ` +
        `Falling back to empty state.`,
      );
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
