// Orchestrator Indicator webview view provider.
//
// Renders two side-by-side semi-circle CSS gauges (Model + Effort)
// driven by ~/.dabbler/current-orchestrator.json. Per Set 029 audit
// (audit-summary.md §"Visual treatment by signalKind" REVISED
// 2026-05-18 + §Q6 stale-state policy + §"Multi-writer precedence").
//
// Height budget: ≤150px content (revised 2026-05-18 from the
// original ≤100px audit D3 after operator-on-device feedback that
// 100px was too small for legible labels and gauges). Container
// height cannot be guaranteed if the operator has dragged the
// divider — CSS uses overflow:auto so content scrolls if compressed
// (audit S3).
//
// Watching strategy: vscode.workspace.createFileSystemWatcher on the
// absolute marker path. We do NOT use chokidar or fs.watch — the VS
// Code-managed watcher integrates with the host's file-system events
// and avoids the Windows ENOSPC failure modes raw fs.watch is known
// for. A 60s poll backstops the watcher for the rare case where the
// watcher misses an event under aggressive antivirus (per R5).

import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readAllSessionSets } from "../utils/fileSystem";

const MARKER_DIR = path.join(os.homedir(), ".dabbler");
const MARKER_PATH = path.join(MARKER_DIR, "current-orchestrator.json");
const DEFAULT_STALENESS_MAX_SEC = 28800; // 8h
const POLL_BACKSTOP_MS = 60_000;
const RENDER_DEBOUNCE_MS = 50;

interface OrchestratorMarker {
  schemaVersion: number;
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
  private watcherDisposable: vscode.Disposable | undefined;
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

    this.setUpWatchers();
    this.scheduleRender();
  }

  private setUpWatchers(): void {
    this.tearDownWatchers();

    // VS Code's RelativePattern requires either a workspace folder or an
    // absolute Uri base. We give it the .dabbler dir as the absolute
    // base; the watcher fires for creates/changes/deletes on the marker
    // file regardless of whether the file exists at the time the watcher
    // is created.
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(MARKER_DIR),
      "current-orchestrator.json",
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = () => this.scheduleRender();
    watcher.onDidCreate(trigger);
    watcher.onDidChange(trigger);
    watcher.onDidDelete(trigger);

    // Poll backstop: re-evaluate every 60s so even a watcher miss can't
    // leave the gauge displaying days-stale data without the stale
    // overlay kicking in.
    this.pollHandle = setInterval(trigger, POLL_BACKSTOP_MS);

    this.watcherDisposable = watcher;
  }

  private tearDownWatchers(): void {
    this.watcherDisposable?.dispose();
    this.watcherDisposable = undefined;
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
    let raw: string;
    try {
      raw = fs.readFileSync(MARKER_PATH, "utf8");
    } catch {
      return { kind: "empty" };
    }
    let marker: OrchestratorMarker;
    try {
      marker = JSON.parse(raw) as OrchestratorMarker;
    } catch {
      // Treat a malformed marker as empty so the operator gets the
      // install-CTA path instead of a frozen gauge. The writer log
      // will have the diagnostic if anyone needs to investigate.
      return { kind: "empty" };
    }
    if (!marker || typeof marker !== "object" || !marker.signalKind) {
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
