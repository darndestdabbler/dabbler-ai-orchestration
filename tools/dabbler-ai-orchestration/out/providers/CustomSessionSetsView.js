"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCurrentSessionInFlight = exports.CustomSessionSetsView = void 0;
const vscode = __importStar(require("vscode"));
const fileSystem_1 = require("../utils/fileSystem");
const SessionSetsModel_1 = require("./SessionSetsModel");
Object.defineProperty(exports, "isCurrentSessionInFlight", { enumerable: true, get: function () { return SessionSetsModel_1.isCurrentSessionInFlight; } });
const inProgressSetsService_1 = require("./inProgressSetsService");
const OrchestratorAccordion_1 = require("./OrchestratorAccordion");
const detectOrchestrators_1 = require("./detectOrchestrators");
const ActionRegistry_1 = require("./ActionRegistry");
const suppressionState_1 = require("./suppressionState");
const SUPPRESSION_KEY = "dabbler.sessionSets.suppressedExpand";
const RENDER_DEBOUNCE_MS = 50;
// Allowlist for executeCommand dispatch from the webview. Defense-
// in-depth: even if a malicious string slipped through the protocol
// type check, only these commands fire. Includes all 14 row-context
// actions + 3 indicator-action buttons.
const COMMAND_ALLOWLIST = new Set([
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
    // Indicator-action buttons (Session 4 + Session 5 multi-provider)
    "dabbler.installOrchestratorHook.claudeCode",
    "dabbler.installOrchestratorHook.gemini",
    "dabbler.installOrchestratorHook.copilot",
    "dabbler.checkOutOrchestrator",
    "dabbler.releaseCheckOut",
    "dabbler.openOrchestratorWriterLog",
]);
function contextValueFor(set) {
    const parts = [`sessionSet:${set.state}`];
    if (set.config?.requiresUAT)
        parts.push("uat");
    if (set.config?.requiresE2E)
        parts.push("e2e");
    if (set.needsMigration)
        parts.push("needs-migration");
    return parts.join(":");
}
function descriptionFor(set) {
    const bits = [
        (0, SessionSetsModel_1.progressText)(set),
        (0, SessionSetsModel_1.touchedDate)(set),
        (0, SessionSetsModel_1.uatBadge)(set),
        (0, SessionSetsModel_1.forceClosedBadge)(set),
        (0, SessionSetsModel_1.needsMigrationBadge)(set),
    ].filter(Boolean);
    return bits.join("  ·  ");
}
class CustomSessionSetsView {
    constructor(context, scanState) {
        this.context = context;
        this.scanState = scanState;
        this.version = 0;
        this.cache = null;
        this.welcomeHtml = this.loadWelcomeHtmlFromPackageJson();
        this.context.subscriptions.push(this.scanState.onDidChange(() => this.postScanState()));
    }
    dispose() {
        if (this.renderTimer) {
            clearTimeout(this.renderTimer);
            this.renderTimer = undefined;
        }
    }
    refresh() {
        this.cache = null;
        this.scheduleRender();
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        const webview = webviewView.webview;
        webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
        };
        webview.onDidReceiveMessage((msg) => this.onMessage(msg));
        webviewView.onDidDispose(() => {
            this.view = undefined;
        });
        webview.html = this.renderShell();
        // First snapshot fires after the ready handshake from client.js
        // (see onMessage("ready") below).
    }
    // ----- Message dispatch (webview → host) -----
    onMessage(msg) {
        if (!msg || typeof msg !== "object")
            return;
        switch (msg.type) {
            case "ready":
                this.postSuppressionEcho();
                this.scheduleRender();
                return;
            case "executeCommand":
                this.dispatchCommand(msg.commandId, msg.args);
                return;
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
    dispatchCommand(commandId, args) {
        if (!COMMAND_ALLOWLIST.has(commandId)) {
            console.warn(`[CustomSessionSetsView] rejected command "${commandId}" — not in allowlist`);
            return;
        }
        void vscode.commands.executeCommand(commandId, ...(args ?? []));
    }
    async showContextMenu(slug) {
        const set = this.findSetBySlug(slug);
        if (!set)
            return;
        const supports = await this.readSupports();
        const actions = (0, ActionRegistry_1.applicableActions)(set, supports);
        if (actions.length === 0)
            return;
        const picked = await vscode.window.showQuickPick(actions.map((a) => ({ label: a.label, id: a.id })), {
            placeHolder: `${set.name} — choose an action`,
            matchOnDescription: false,
        });
        if (!picked)
            return;
        this.dispatchCommand(picked.id, [{ set }]);
    }
    async readSupports() {
        // Context keys live in vscode's contextKeyService which is not
        // directly readable; we re-derive from the configuration +
        // cached sets the same way evaluateSupportContextKeys does.
        const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
        const uatPref = cfg.get("uatSupport.enabled", "auto");
        const e2ePref = cfg.get("e2eSupport.enabled", "auto");
        const all = this.cache ?? (0, fileSystem_1.readAllSessionSets)();
        const anyUat = all.some((s) => s.config?.requiresUAT);
        const anyE2e = all.some((s) => s.config?.requiresE2E);
        return {
            uat: uatPref === "always" || (uatPref === "auto" && anyUat),
            e2e: e2ePref === "always" || (e2ePref === "auto" && anyE2e),
        };
    }
    findSetBySlug(slug) {
        const all = this.cache ?? (0, fileSystem_1.readAllSessionSets)();
        return all.find((s) => s.name === slug);
    }
    // ----- Suppression state -----
    getSuppression() {
        return this.context.workspaceState.get(SUPPRESSION_KEY, {});
    }
    async setSuppression(next) {
        await this.context.workspaceState.update(SUPPRESSION_KEY, next);
    }
    handleToggle(slug, expanded, accordionUpdatedAt) {
        const current = this.getSuppression();
        if (expanded) {
            // Operator manually expanded — clear suppression for this slug.
            const next = (0, suppressionState_1.clearSuppression)(current, slug);
            if (next !== current) {
                void this.setSuppression(next);
                this.postSuppressionEcho();
            }
        }
        else if (accordionUpdatedAt) {
            // Operator manually collapsed — suppress for this occurrence only.
            const next = (0, suppressionState_1.suppress)(current, slug, accordionUpdatedAt);
            void this.setSuppression(next);
            this.postSuppressionEcho();
        }
    }
    // ----- Render scheduling + snapshot fire -----
    scheduleRender() {
        if (this.renderTimer)
            clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => this.postSnapshot(), RENDER_DEBOUNCE_MS);
    }
    postSnapshot() {
        if (!this.view)
            return;
        this.version++;
        if (!this.cache) {
            this.cache = (0, fileSystem_1.readAllSessionSets)();
        }
        const all = this.cache;
        // Prune suppression for slugs that no longer exist.
        const visibleSlugs = new Set(all.map((s) => s.name));
        const current = this.getSuppression();
        const pruned = (0, suppressionState_1.prune)(current, visibleSlugs);
        if (pruned !== current) {
            void this.setSuppression(pruned);
        }
        // Set 033 Session 2: every in-progress row gets its own accordion.
        // Compute the per-row RenderState lazily inside buildRow via the
        // orchestrator block on the set's session-state.json. The empty-
        // state CTA is shared across in-progress rows that have no
        // orchestrator block yet (e.g., a pre-Set-033 in-flight set, or
        // a freshly-started set that hasn't run start_session yet).
        const emptyCta = (0, detectOrchestrators_1.pickEmptyStateCta)();
        const payload = {
            buckets: this.buildBuckets(all, emptyCta),
            hasAnySets: all.length > 0,
            welcomeHtml: this.welcomeHtml,
        };
        const msg = {
            type: "rowsSnapshot",
            version: this.version,
            scanState: this.toProtocolScanState(),
            payload,
        };
        this.view.webview.postMessage(msg);
    }
    postScanState() {
        if (!this.view)
            return;
        this.version++;
        const msg = {
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
    postSuppressionEcho() {
        if (!this.view)
            return;
        this.version++;
        const msg = {
            type: "suppressionEcho",
            version: this.version,
            suppressed: this.getSuppression(),
        };
        this.view.webview.postMessage(msg);
    }
    toProtocolScanState() {
        return this.scanState.phase === "loading" ? "loading" : "ready";
    }
    buildBuckets(all, emptyCta) {
        const buckets = (0, SessionSetsModel_1.bucketSets)(all);
        // Set 033 Session 2: order in-progress sets by `startedAt` ascending
        // (the older the in-flight set, the higher it ranks) — same order
        // as `listInProgressSets()`. SessionSetsModel.sortBucket still
        // sorts by `lastTouched` desc for the visual rows; we apply the
        // in-progress-specific ordering here.
        const inProgressOrdered = (0, inProgressSetsService_1.listInProgressSets)(buckets.inProgress);
        const groups = [
            this.buildBucket("in-progress", "In Progress", inProgressOrdered, emptyCta),
            this.buildBucket("not-started", "Not Started", buckets.notStarted, emptyCta),
            this.buildBucket("complete", "Complete", buckets.complete, emptyCta),
        ];
        if (buckets.cancelled.length > 0) {
            groups.push(this.buildBucket("cancelled", "Cancelled", buckets.cancelled, emptyCta));
        }
        return groups;
    }
    buildBucket(key, label, subset, emptyCta) {
        const sorted = key === "in-progress" ? subset : (0, SessionSetsModel_1.sortBucket)(subset, key);
        const rows = sorted.map((set) => this.buildRow(set, emptyCta));
        return { key, label, count: subset.length, rows };
    }
    buildRow(set, emptyCta) {
        // Set 033 Session 2: every in-progress row gets an accordion body
        // (multi-in-progress is the supported case). The body is computed
        // from this set's `orchestrator` block on session-state.json + its
        // ai-assignment.md recommendation. Non-in-progress rows still
        // skip the accordion entirely per S4 Q3 = a.
        let accordionHtml = null;
        let accordionUpdatedAt = null;
        if (set.state === "in-progress") {
            const block = set.liveSession?.orchestrator ?? null;
            const recommendation = (0, inProgressSetsService_1.recommendationFor)(set);
            let state = (0, OrchestratorAccordion_1.accordionStateFromOrchestratorBlock)(block, recommendation);
            if (state.kind === "empty") {
                state = { kind: "empty", cta: emptyCta };
            }
            else {
                accordionUpdatedAt = state.marker.updatedAt;
            }
            accordionHtml = (0, OrchestratorAccordion_1.renderAccordionBody)(state);
        }
        return {
            slug: set.name,
            name: set.name,
            state: set.state,
            description: descriptionFor(set),
            contextValue: contextValueFor(set),
            iconSlug: SessionSetsModel_1.ICON_FILES[set.state] ?? "",
            needsMigration: set.needsMigration,
            accordionHtml,
            accordionUpdatedAt,
        };
    }
    // ----- Welcome HTML extraction -----
    // Parse package.json `viewsWelcome` contribution for our view id
    // and convert the contents markdown to an HTML fragment the
    // webview can render. Keeps the package.json declaration as the
    // single source of truth (per S4 Q3 = a, GPT M4 cleanliness).
    loadWelcomeHtmlFromPackageJson() {
        try {
            const pkgPath = vscode.Uri.joinPath(this.context.extensionUri, "package.json").fsPath;
            const fs = require("fs");
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
            const entries = pkg?.contributes?.viewsWelcome ?? [];
            const ours = entries.find((e) => e.view === CustomSessionSetsView.viewType);
            if (!ours?.contents)
                return this.escHtml("No welcome content available.");
            return this.renderWelcomeMarkdown(ours.contents);
        }
        catch {
            return this.escHtml("No welcome content available.");
        }
    }
    // Minimal markdown → HTML for the viewsWelcome contents. Supports
    // paragraphs (separated by \n) and the two link forms the actual
    // entry uses: `[label](command:foo)` and `[label](https://...)`.
    // Stays narrow on purpose — we control the source string in
    // package.json, so we don't need a full markdown parser.
    renderWelcomeMarkdown(src) {
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
    renderShell() {
        if (!this.view)
            return "";
        const webview = this.view.webview;
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "session-sets-tree", "tree.css"));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "session-sets-tree", "client.js"));
        const nonce = String(Math.floor(Math.random() * 1e16));
        // The accordion includes inline SVG generated by
        // OrchestratorAccordion.ts; per the existing indicator CSP, the
        // SVG fragments are part of innerHTML (not separate script), so
        // they're covered by style-src + the webview's own document.
        const csp = `default-src 'none'; ` +
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
    escHtml(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
    escAttr(s) {
        return this.escHtml(s).replace(/"/g, "&quot;");
    }
}
exports.CustomSessionSetsView = CustomSessionSetsView;
CustomSessionSetsView.viewType = "dabblerSessionSets";
//# sourceMappingURL=CustomSessionSetsView.js.map