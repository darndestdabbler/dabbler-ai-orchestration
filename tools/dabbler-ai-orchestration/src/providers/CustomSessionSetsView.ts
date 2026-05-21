// Custom-tree WebviewViewProvider for `dabblerSessionSets`. Set 029
// Session 4 ship — replaces the v0.15.0 native TreeView. Consumes:
//   - SessionSetsModel (pure scan/bucket/sort/text helpers)
//   - inProgressSetsService (listInProgressSets + ai-assignment recommendation)
//   - OrchestratorAccordion (pure render helpers + orchestrator-block adapter)
//   - ActionRegistry (typed action-applicability predicates per row)
//   - suppressionState (manual-collapse persistence reducer)
//   - ScanState (loading/ready phase from extension.ts)
//   - sessionSetsWebviewProtocol (typed messages with monotonic version)
//
// Per S4 audit GPT-5.4 M4: this file owns lifecycle + message
// protocol + snapshot serialization. It does NOT own kbd nav (that's
// in media/session-sets-tree/client.js). It does NOT own gauge
// rendering (that's in OrchestratorAccordion).
//
// Per S4 audit GPT-5.4 M3: every render message carries a monotonic
// version. Out-of-order messages are dropped by the webview client.
//
// Set 033 Session 2: per H2, the `.dabbler/orchestrator.json` per-set
// marker is retired. Each in-progress row's accordion body is now
// computed from that set's `orchestrator` block on session-state.json
// (Set 033 Session 1 schema) plus its ai-assignment.md recommendation.
// The single-active-set ambiguity banner is gone — multi-in-progress
// is the supported case and every in-progress row gets its own
// accordion.

import * as vscode from "vscode";
import { readAllSessionSets } from "../utils/fileSystem";
import { SessionSet } from "../types";
import { ScanState } from "./scanState";
import {
  bucketSets,
  forceClosedBadge,
  ICON_FILES,
  isCurrentSessionInFlight,
  needsMigrationBadge,
  sortBucket,
  touchedDate,
  uatBadge,
} from "./SessionSetsModel";
// Set 034: the per-row orchestrator-tracking accordion (gauges + model
// description) is retired from the UI. The OrchestratorAccordion +
// detectOrchestrators modules are still present in the source for
// possible future re-enable; this view no longer imports them. The
// in-progress ordering helper still ships from inProgressSetsService.
import { listInProgressSets } from "./inProgressSetsService";
import {
  applicableActions,
  ActionSupports,
} from "./ActionRegistry";
import {
  SuppressionState,
  clearSuppression,
  prune,
  suppress,
} from "./suppressionState";
import {
  BucketPayload,
  HostToWebview,
  RowPayload,
  ScanState as ProtocolScanState,
  SnapshotPayload,
  WebviewToHost,
} from "../types/sessionSetsWebviewProtocol";

const SUPPRESSION_KEY = "dabbler.sessionSets.suppressedExpand";
const RENDER_DEBOUNCE_MS = 50;

// Allowlist for executeCommand dispatch from the webview. Defense-
// in-depth: even if a malicious string slipped through the protocol
// type check, only these commands fire. Includes all 14 row-context
// actions + 3 indicator-action buttons.
const COMMAND_ALLOWLIST: ReadonlySet<string> = new Set([
  // 14 row-context actions
  "dabblerSessionSets.openSpec",
  "dabblerSessionSets.openActivityLog",
  "dabblerSessionSets.openChangeLog",
  "dabblerSessionSets.openAiAssignment",
  "dabblerSessionSets.openUatChecklist",
  "dabblerSessionSets.revealPlaywrightTests",
  "dabblerSessionSets.openSessionState",
  "dabblerSessionSets.openFolder",
  "dabblerSessionSets.copyStartCommand.default",
  "dabblerSessionSets.copyStartCommand.parallel",
  "dabblerSessionSets.copySlug",
  "dabblerSessionSets.migrate",
  "dabblerSessionSets.cancel",
  "dabblerSessionSets.restore",
  // Set 034: the orchestrator-control commands (checkOutOrchestrator /
  // releaseCheckOut / openOrchestratorWriterLog / installOrchestratorHook.*)
  // are no longer dispatched from the webview — they're removed from
  // both ActionRegistry (right-click menu) and the empty-state CTA
  // (which itself is gone). The commands remain registered in
  // extension.ts and are still accessible via the Command Palette.
]);

function contextValueFor(set: SessionSet): string {
  const parts = [`sessionSet:${set.state}`];
  if (set.config?.requiresUAT) parts.push("uat");
  if (set.config?.requiresE2E) parts.push("e2e");
  if (set.needsMigration) parts.push("needs-migration");
  return parts.join(":");
}

// Set 034: row description drops the fraction prefix (which now lives
// in the right-aligned fraction list-icon column) and the trailing
// "Complete" word. For in-progress rows: just "session N in flight".
// For not-started / complete / cancelled rows: empty (the fraction
// IS the signal). UAT / force-closed / needs-migration / touched-date
// badges still tack on if present.
function descriptionFor(set: SessionSet): string {
  const bits: string[] = [];
  if (set.state === "in-progress" && set.liveSession?.currentSession != null) {
    bits.push(`session ${set.liveSession.currentSession} in flight`);
  }
  const extras = [
    touchedDate(set),
    uatBadge(set),
    forceClosedBadge(set),
    needsMigrationBadge(set),
  ].filter(Boolean);
  bits.push(...extras);
  return bits.join("  ·  ");
}

// Set 034: right-aligned bold colored progress fraction now lives in
// its own list-icon column. Compute once here instead of embedding in
// the description string.
function fractionFor(set: SessionSet): string {
  if (set.totalSessions && set.totalSessions > 0) {
    return `${set.sessionsCompleted}/${set.totalSessions}`;
  }
  if (set.sessionsCompleted > 0) {
    return `${set.sessionsCompleted}`;
  }
  return "";
}

export class CustomSessionSetsView implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "dabblerSessionSets";

  private view: vscode.WebviewView | undefined;
  private version = 0;
  private renderTimer: NodeJS.Timeout | undefined;
  private cache: SessionSet[] | null = null;
  private welcomeHtml: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly scanState: ScanState,
  ) {
    this.welcomeHtml = this.loadWelcomeHtmlFromPackageJson();
    this.context.subscriptions.push(
      this.scanState.onDidChange(() => this.postScanState()),
    );
  }

  public dispose(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
  }

  public refresh(): void {
    this.cache = null;
    this.scheduleRender();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    webview.html = this.renderShell();
    // First snapshot fires after the ready handshake from client.js
    // (see onMessage("ready") below).
  }

  // ----- Message dispatch (webview → host) -----

  private onMessage(msg: WebviewToHost): void {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "ready":
        this.postSuppressionEcho();
        this.scheduleRender();
        return;
      case "executeCommand":
        this.dispatchCommand(msg.commandId, msg.args);
        return;
      case "executeRowCommand": {
        // Set 034: cursor-anchored context-menu item selection. Look
        // up the set by slug and dispatch the command with [{ set }].
        const set = this.findSetBySlug(msg.slug);
        if (!set) return;
        this.dispatchCommand(msg.commandId, [{ set }]);
        return;
      }
      case "showRowContextMenu":
        void this.showContextMenu(msg.slug);
        return;
      case "toggleRow":
        this.handleToggle(msg.slug, msg.expanded, msg.accordionUpdatedAt);
        return;
      case "activateRow":
        // Default activation: openSpec (per S4 step 3 / GPT M3).
        this.dispatchCommand("dabblerSessionSets.openSpec", [{ set: this.findSetBySlug(msg.slug) }]);
        return;
    }
  }

  private dispatchCommand(commandId: string, args?: unknown[]): void {
    if (!COMMAND_ALLOWLIST.has(commandId)) {
      console.warn(`[CustomSessionSetsView] rejected command "${commandId}" — not in allowlist`);
      return;
    }
    void vscode.commands.executeCommand(commandId, ...(args ?? []));
  }

  // Set 034: replaced the v0.18.1 showQuickPick-at-top-of-window flow
  // with a cursor-anchored popup rendered by the webview. The host
  // computes applicable actions and posts them back as a flat
  // `renderContextMenu` message; the webview paints the popup at the
  // cursor position it captured on the contextmenu event.
  private async showContextMenu(slug: string): Promise<void> {
    if (!this.view) return;
    const set = this.findSetBySlug(slug);
    if (!set) return;
    const supports: ActionSupports = await this.readSupports();
    const actions = applicableActions(set, supports);
    if (actions.length === 0) return;
    const msg: HostToWebview = {
      type: "renderContextMenu",
      slug,
      items: actions.map((a) => ({ label: a.label, commandId: a.id })),
    };
    this.view.webview.postMessage(msg);
  }

  private async readSupports(): Promise<ActionSupports> {
    // Context keys live in vscode's contextKeyService which is not
    // directly readable; we re-derive from the configuration +
    // cached sets the same way evaluateSupportContextKeys does.
    const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
    const uatPref = cfg.get<string>("uatSupport.enabled", "auto");
    const e2ePref = cfg.get<string>("e2eSupport.enabled", "auto");
    const all = this.cache ?? readAllSessionSets();
    const anyUat = all.some((s) => s.config?.requiresUAT);
    const anyE2e = all.some((s) => s.config?.requiresE2E);
    return {
      uat: uatPref === "always" || (uatPref === "auto" && anyUat),
      e2e: e2ePref === "always" || (e2ePref === "auto" && anyE2e),
    };
  }

  private findSetBySlug(slug: string): SessionSet | undefined {
    const all = this.cache ?? readAllSessionSets();
    return all.find((s) => s.name === slug);
  }

  // ----- Suppression state -----

  private getSuppression(): SuppressionState {
    return this.context.workspaceState.get<SuppressionState>(SUPPRESSION_KEY, {});
  }

  private async setSuppression(next: SuppressionState): Promise<void> {
    await this.context.workspaceState.update(SUPPRESSION_KEY, next);
  }

  private handleToggle(slug: string, expanded: boolean, accordionUpdatedAt: string | null): void {
    const current = this.getSuppression();
    if (expanded) {
      // Operator manually expanded — clear suppression for this slug.
      const next = clearSuppression(current, slug);
      if (next !== current) {
        void this.setSuppression(next);
        this.postSuppressionEcho();
      }
    } else if (accordionUpdatedAt) {
      // Operator manually collapsed — suppress for this occurrence only.
      const next = suppress(current, slug, accordionUpdatedAt);
      void this.setSuppression(next);
      this.postSuppressionEcho();
    }
  }

  // ----- Render scheduling + snapshot fire -----

  private scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.postSnapshot(), RENDER_DEBOUNCE_MS);
  }

  private postSnapshot(): void {
    if (!this.view) return;
    this.version++;
    if (!this.cache) {
      this.cache = readAllSessionSets();
    }
    const all = this.cache;

    // Prune suppression for slugs that no longer exist.
    const visibleSlugs = new Set(all.map((s) => s.name));
    const current = this.getSuppression();
    const pruned = prune(current, visibleSlugs);
    if (pruned !== current) {
      void this.setSuppression(pruned);
    }

    // Set 033 Session 2: every in-progress row gets its own accordion.
    // Compute the per-row RenderState lazily inside buildRow via the
    // orchestrator block on the set's session-state.json. The empty-
    // state CTA is shared across in-progress rows that have no
    // orchestrator block yet (e.g., a pre-Set-033 in-flight set, or
    // a freshly-started set that hasn't run start_session yet).
    const payload: SnapshotPayload = {
      buckets: this.buildBuckets(all),
      hasAnySets: all.length > 0,
      welcomeHtml: this.welcomeHtml,
    };

    const msg: HostToWebview = {
      type: "rowsSnapshot",
      version: this.version,
      scanState: this.toProtocolScanState(),
      payload,
    };
    this.view.webview.postMessage(msg);
  }

  private postScanState(): void {
    if (!this.view) return;
    this.version++;
    const msg: HostToWebview = {
      type: "scanStateChanged",
      version: this.version,
      state: this.toProtocolScanState(),
    };
    this.view.webview.postMessage(msg);
    // A scan-state flip to "ready" also warrants a fresh row snapshot.
    if (this.scanState.phase === "ready") {
      this.scheduleRender();
    }
  }

  private postSuppressionEcho(): void {
    if (!this.view) return;
    this.version++;
    const msg: HostToWebview = {
      type: "suppressionEcho",
      version: this.version,
      suppressed: this.getSuppression(),
    };
    this.view.webview.postMessage(msg);
  }

  private toProtocolScanState(): ProtocolScanState {
    return this.scanState.phase === "loading" ? "loading" : "ready";
  }

  private buildBuckets(all: SessionSet[]): BucketPayload[] {
    const buckets = bucketSets(all);
    const inProgressOrdered = listInProgressSets(buckets.inProgress);
    const groups: BucketPayload[] = [
      this.buildBucket("in-progress", "In Progress", inProgressOrdered),
      this.buildBucket("not-started", "Not Started", buckets.notStarted),
      this.buildBucket("complete", "Complete", buckets.complete),
    ];
    if (buckets.cancelled.length > 0) {
      groups.push(this.buildBucket("cancelled", "Cancelled", buckets.cancelled));
    }
    return groups;
  }

  private buildBucket(
    key: BucketPayload["key"],
    label: string,
    subset: SessionSet[],
  ): BucketPayload {
    const sorted = key === "in-progress" ? subset : sortBucket(subset, key);
    const rows = sorted.map((set) => this.buildRow(set));
    return { key, label, count: subset.length, rows };
  }

  private buildRow(set: SessionSet): RowPayload {
    // Set 034: the per-row accordion is GONE. Operator feedback
    // 2026-05-21 (mid-Set-034 Session 1) — the gauges and the
    // orchestrator-info text below them read as more authoritative
    // than the underlying signal warrants: signalKind is always
    // "current" under the Set 033 adapter regardless of how stale
    // the recorded check-out is, effort tracking via /think_* slash
    // commands was retired in Set 033 H2 (no longer observed), and
    // for orchestrators without a hook path (Copilot, Gemini) the
    // gauge area was either empty or whatever the last manual
    // checkout claimed. Rather than try to honestly caveat all of
    // that visually, retire the entire orchestrator-tracking display
    // surface until Set 036+ delivers a real signal. Rows now show
    // just name + fraction + description.
    //
    // Net effect: accordionHtml is null on every row; client.js no
    // longer renders any accordion body. The `orchestrator` block on
    // session-state.json continues to be written by start_session /
    // close_session (the check-out semantics still serve coordination
    // and audit-log purposes); only the UI surface retires.
    return {
      slug: set.name,
      name: set.name,
      state: set.state,
      fraction: fractionFor(set),
      description: descriptionFor(set),
      contextValue: contextValueFor(set),
      iconSlug: ICON_FILES[set.state] ?? "",
      needsMigration: set.needsMigration,
      accordionHtml: null,
      accordionUpdatedAt: null,
    };
  }

  // ----- Welcome HTML extraction -----

  // Parse package.json `viewsWelcome` contribution for our view id
  // and convert the contents markdown to an HTML fragment the
  // webview can render. Keeps the package.json declaration as the
  // single source of truth (per S4 Q3 = a, GPT M4 cleanliness).
  private loadWelcomeHtmlFromPackageJson(): string {
    try {
      const pkgPath = vscode.Uri.joinPath(this.context.extensionUri, "package.json").fsPath;
      const fs = require("fs") as typeof import("fs");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const entries: Array<{ view?: string; contents?: string }> = pkg?.contributes?.viewsWelcome ?? [];
      const ours = entries.find((e) => e.view === CustomSessionSetsView.viewType);
      if (!ours?.contents) return this.escHtml("No welcome content available.");
      return this.renderWelcomeMarkdown(ours.contents);
    } catch {
      return this.escHtml("No welcome content available.");
    }
  }

  // Minimal markdown → HTML for the viewsWelcome contents. Supports
  // paragraphs (separated by \n) and the two link forms the actual
  // entry uses: `[label](command:foo)` and `[label](https://...)`.
  // Stays narrow on purpose — we control the source string in
  // package.json, so we don't need a full markdown parser.
  private renderWelcomeMarkdown(src: string): string {
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
    const paragraphs = src.split(/\n+/);
    const out = paragraphs.map((p) => {
      const escapedTextWithPlaceholders = this.escHtml(p);
      // Re-find link patterns in the ESCAPED text since escHtml
      // doesn't touch `[`, `]`, `(`, `)`.
      const withLinks = escapedTextWithPlaceholders.replace(linkRe, (_m, label, href) => {
        const safeHref = this.escAttr(href);
        const safeLabel = this.escHtml(label);
        return `<a href="${safeHref}">${safeLabel}</a>`;
      });
      return `<p>${withLinks}</p>`;
    });
    return out.join("\n");
  }

  // ----- Webview shell HTML -----

  // The host-side webview HTML only sets up the document chrome +
  // CSP + the empty <main> the client.js mounts into. Snapshot
  // messages drive all subsequent rendering — keeps the protocol
  // single-source-of-truth and avoids host/webview state divergence.
  private renderShell(): string {
    if (!this.view) return "";
    const webview = this.view.webview;
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "session-sets-tree", "tree.css"),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "session-sets-tree", "client.js"),
    );
    const nonce = String(Math.floor(Math.random() * 1e16));
    // The accordion includes inline SVG generated by
    // OrchestratorAccordion.ts; per the existing indicator CSP, the
    // SVG fragments are part of innerHTML (not separate script), so
    // they're covered by style-src + the webview's own document.
    const csp =
      `default-src 'none'; ` +
      `style-src ${webview.cspSource} 'unsafe-inline'; ` +
      `script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${cssUri}">
  <title>Session Sets</title>
</head>
<body>
  <main id="root" role="presentation"></main>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  // ----- Local escape helpers (welcome path; renderShell only) -----

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

// Silence the unused-import warning for `isCurrentSessionInFlight`
// without removing it — kept as a re-export for any test that
// imports the predicate via this module path.
export { isCurrentSessionInFlight };
