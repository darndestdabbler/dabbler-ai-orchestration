"use strict";
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
exports.OrchestratorIndicatorProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../utils/fileSystem");
const DEFAULT_STALENESS_MAX_SEC = 28800; // 8h
const POLL_BACKSTOP_MS = 60000;
const RENDER_DEBOUNCE_MS = 50;
const SESSION_STATE_GLOB = "docs/session-sets/*/session-state.json";
function resolveActiveSet() {
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
        }
        catch {
            candidateIsDir = false;
        }
        if (!candidateIsDir)
            continue;
        let entries;
        try {
            entries = fs.readdirSync(candidate, { withFileTypes: true });
        }
        catch {
            continue;
        }
        const inProgress = [];
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const statePath = path.join(candidate, entry.name, "session-state.json");
            let state = null;
            try {
                state = JSON.parse(fs.readFileSync(statePath, "utf8"));
            }
            catch {
                continue;
            }
            if (state && state.status === "in-progress") {
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
// Tier rank for the < / > than-suggested direction calculation.
// low<mid<flagship within any provider's ladder. flagship-of-Claude
// and flagship-of-Codex are treated as the same rank — providers are
// distinct but their tier ladders map onto a common 3-level scale.
function tierRank(tier) {
    switch ((tier || "").toLowerCase()) {
        case "low": return 0;
        case "mid": return 1;
        case "flagship": return 2;
        default: return -1;
    }
}
function effortRank(effort) {
    switch ((effort || "").toLowerCase()) {
        case "low": return 0;
        case "medium": return 1;
        case "high": return 2;
        case "extra-high": return 3;
        case "max": return 4;
        default: return -1;
    }
}
// File-scope twin of the class's fmtAge (kept lean so the capacity
// helper can call it without a class instance).
function fmtAgeStandalone(seconds) {
    if (!isFinite(seconds) || seconds < 0)
        return "?";
    if (seconds < 60)
        return `${Math.round(seconds)}s`;
    if (seconds < 3600)
        return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400)
        return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}
// Providers with at least one extra-capacity parameter (thinking,
// extended reasoning, etc.). The "thinking" clause in the model
// description is shown only for these. Codex/Copilot have no native
// extra-capacity parameter per audit Q3/Q4.
function providerHasExtraCapacity(provider) {
    const p = (provider || "").toLowerCase();
    return p === "anthropic" || p === "google" || p.includes("claude") || p.includes("gemini");
}
// Compose the full "Actual Model" description from a marker. This
// is the canonical textual description shown in the model table.
// Future-proof: new capacity parameters (extended thinking, adaptive
// reasoning, etc.) become extra clauses appended here. No new UI
// elements needed.
function describeMarker(marker) {
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
        }
        else if (thinkingOn) {
            desc += `, thinking on`;
        }
        else {
            desc += `, thinking off`;
        }
    }
    return desc.trim().replace(/\s+/g, " ");
}
// Compose the suggested-model description from an ai-assignment.md
// recommendation. Format mirrors describeMarker() so the two table
// rows are visually parallel.
function describeRecommendation(rec) {
    return `${rec.providerName} ${rec.modelName}, ${rec.effort.toLowerCase()} effort`.replace(/\s+/g, " ");
}
// File-scope twin of the class's effortDisplayName.
function effortDisplayNameStandalone(effort) {
    switch (effort) {
        case "low": return "Low";
        case "medium": return "Medium";
        case "high": return "High";
        case "extra-high": return "Extra-high";
        case "max": return "Max";
        default: return "Unknown";
    }
}
// Mirror the producer's classifyTier logic for parsing
// recommendation strings out of ai-assignment.md. The recommendation
// carries human-readable "Provider" + "Model" text (e.g., "Claude" +
// "Opus 4.7"); we classify those into the same low/mid/flagship
// buckets the marker uses, so the < / > direction is computed off a
// common rank scale.
function classifyRecommendationTier(providerName, modelName) {
    const p = (providerName || "").toLowerCase();
    const m = (modelName || "").toLowerCase();
    if (p.includes("claude") || m.includes("claude")) {
        if (m.includes("opus"))
            return "flagship";
        if (m.includes("sonnet"))
            return "mid";
        if (m.includes("haiku"))
            return "low";
    }
    if (p.includes("gemini") || m.includes("gemini")) {
        if (m.includes("pro"))
            return "flagship";
        if (m.includes("flash 2") || m.includes("2.5"))
            return "mid";
        if (m.includes("flash"))
            return "low";
    }
    if (p.includes("codex") || p.includes("openai") || m.startsWith("gpt-") || m.includes("codex") || m.startsWith("o1") || m.startsWith("o3")) {
        if (m.includes("mini"))
            return "low";
        if (m.startsWith("o1") || m.startsWith("o3") || m.includes("5") || (m.includes("4o") && !m.includes("mini")))
            return "flagship";
        return "mid";
    }
    if (p.includes("copilot") || m.includes("copilot"))
        return "mid";
    return "unknown";
}
class OrchestratorIndicatorProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.currentMarkerPath = null;
    }
    getOutputChannel() {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel("Dabbler Orchestrator Indicator");
        }
        return this.outputChannel;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
        };
        webviewView.webview.onDidReceiveMessage((msg) => {
            if (!msg || typeof msg !== "object")
                return;
            if (msg.command === "installHookClaudeCode") {
                vscode.commands.executeCommand("dabbler.installOrchestratorHook.claudeCode");
            }
            else if (msg.command === "setOrchestrator") {
                vscode.commands.executeCommand("dabbler.setOrchestrator");
            }
            else if (msg.command === "openWriterLog") {
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
    setUpStateWatcher() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0)
            return;
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
    rebindMarkerWatcher() {
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
        const pattern = new vscode.RelativePattern(vscode.Uri.file(markerDir), "orchestrator.json");
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const trigger = () => this.scheduleRender();
        watcher.onDidCreate(trigger);
        watcher.onDidChange(trigger);
        watcher.onDidDelete(trigger);
        this.markerWatcherDisposable = watcher;
        this.ensurePollBackstop();
    }
    ensurePollBackstop() {
        if (this.pollHandle)
            return;
        this.pollHandle = setInterval(() => {
            this.rebindMarkerWatcher();
            this.scheduleRender();
        }, POLL_BACKSTOP_MS);
    }
    tearDownWatchers() {
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
    scheduleRender() {
        // Atomic writes on Windows can fire create+delete+create in quick
        // succession; debounce so we render once per coalesced burst.
        if (this.renderTimer)
            clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => this.render(), RENDER_DEBOUNCE_MS);
    }
    render() {
        if (!this.view)
            return;
        const state = this.computeState();
        this.view.webview.html = this.renderHtml(state);
    }
    computeState() {
        const res = resolveActiveSet();
        if (res.kind === "unresolved") {
            // Fail-closed: surface the existing empty-state CTA. The reason
            // detail isn't displayed inline (the gauges stay simple) — it's
            // available via the writer-log command for diagnostics.
            return { kind: "empty" };
        }
        let raw;
        try {
            raw = fs.readFileSync(res.resolved.markerPath, "utf8");
        }
        catch {
            return { kind: "empty" };
        }
        let marker;
        try {
            marker = JSON.parse(raw);
        }
        catch {
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
            this.getOutputChannel().appendLine(`[${new Date().toISOString()}] Slug mismatch at ${res.resolved.markerPath}: ` +
                `marker has '${String(marker.sessionSetSlug)}', resolved set is '${res.resolved.slug}'. ` +
                `Falling back to empty state.`);
            return { kind: "empty" };
        }
        const ageSec = (Date.now() - Date.parse(marker.updatedAt)) / 1000;
        const stalenessMaxSec = typeof marker.stalenessMaxSec === "number"
            ? marker.stalenessMaxSec
            : DEFAULT_STALENESS_MAX_SEC;
        const stale = ageSec > stalenessMaxSec;
        // Compute mismatch against the active session set's ai-assignment.md
        // recommendation. Operator-revised design 2026-05-18 round 2:
        // valence-neutral badge — surfaces the difference, doesn't judge it.
        // (Higher-than-recommended IS sometimes intentional — operator has
        // credits, or task is harder than the recommendation anticipated.)
        let mismatch = null;
        try {
            const rec = this.findActiveRecommendation();
            if (rec) {
                mismatch = this.computeMismatch(marker, rec);
            }
        }
        catch {
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
    findActiveRecommendation() {
        let sets;
        try {
            sets = (0, fileSystem_1.readAllSessionSets)();
        }
        catch {
            return null;
        }
        // Prefer in-progress sets; among them, prefer one whose state file
        // says lifecycleState === "work_in_progress" (set 030 schema). We
        // don't have direct visibility into lifecycleState from SessionSet,
        // but the `state === "in-progress"` filter is close enough — the
        // SessionSet type's `state` field is derived from session-state.json.
        const inProgress = sets.filter((s) => s.state === "in-progress");
        if (inProgress.length === 0)
            return null;
        // If multiple in-progress sets, pick the most recently touched.
        inProgress.sort((a, b) => (b.lastTouched ?? "").localeCompare(a.lastTouched ?? ""));
        const set = inProgress[0];
        // Determine which session number's recommendation to compare against.
        const live = set.liveSession;
        let targetSession = null;
        if (live && typeof live.currentSession === "number") {
            targetSession = live.currentSession;
        }
        else if (live &&
            Array.isArray(live.completedSessions) &&
            typeof set.totalSessions === "number" &&
            live.completedSessions.length < set.totalSessions) {
            const maxCompleted = live.completedSessions.length === 0
                ? 0
                : Math.max(...live.completedSessions);
            targetSession = maxCompleted + 1;
        }
        if (targetSession === null)
            return null;
        // Read + parse ai-assignment.md.
        let text;
        try {
            text = fs.readFileSync(set.aiAssignmentPath, "utf8");
        }
        catch {
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
    extractRecommendation(text, sessionNumber, setName) {
        const lines = text.split(/\r?\n/);
        const headingRe = new RegExp(`^##\\s+Session\\s+${sessionNumber}(?:\\s+of\\s+\\d+)?\\s*:\\s*(.*)$`, "i");
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
        if (sessionStartIdx === -1)
            return null;
        // Find the next ### Recommended orchestrator before the next ## block.
        let recHeadingIdx = -1;
        for (let i = sessionStartIdx + 1; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i]))
                break; // next session block — stop
            if (/^###\s+Recommended\s+orchestrator/i.test(lines[i])) {
                recHeadingIdx = i;
                break;
            }
        }
        if (recHeadingIdx === -1)
            return null;
        // Find the next non-blank paragraph after the heading.
        let paragraphStart = -1;
        for (let i = recHeadingIdx + 1; i < lines.length; i++) {
            if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i]))
                break;
            if (lines[i].trim().length > 0) {
                paragraphStart = i;
                break;
            }
        }
        if (paragraphStart === -1)
            return null;
        // Read until blank line or next heading.
        const paragraphLines = [];
        for (let i = paragraphStart; i < lines.length; i++) {
            if (lines[i].trim().length === 0)
                break;
            if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i]))
                break;
            paragraphLines.push(lines[i]);
        }
        const paragraph = paragraphLines.join(" ").trim();
        // Parse "Provider Model @ effort=level."
        const recRe = /^([A-Z][A-Za-z]+)\s+([^@]+?)\s*@\s*effort\s*=\s*([a-z-]+)/i;
        const m = recRe.exec(paragraph);
        if (!m)
            return null;
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
    computeMismatch(marker, rec) {
        const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        const providerOk = norm(marker.providerDisplayName).includes(norm(rec.providerName)) ||
            norm(rec.providerName).includes(norm(marker.providerDisplayName));
        const modelOk = norm(marker.modelDisplayName).includes(norm(rec.modelName)) ||
            norm(rec.modelName).includes(norm(marker.modelDisplayName));
        const effortOk = norm(marker.effort.normalized) === norm(rec.effort);
        if (providerOk && modelOk && effortOk)
            return null;
        // Round 7: the recommendation itself rides on the Mismatch
        // object so the renderer can format the "Suggested" row of the
        // model table from it directly (describeRecommendation()).
        const diffs = [];
        if (!providerOk || !modelOk) {
            diffs.push(`model: actual "${marker.providerDisplayName} ${marker.modelDisplayName}", recommended "${rec.providerName} ${rec.modelName}"`);
        }
        if (!effortOk) {
            diffs.push(`effort: actual "${marker.effort.normalized}", recommended "${rec.effort}"`);
        }
        if (!providerOk && diffs.length === 0) {
            diffs.push(`provider: actual "${marker.providerDisplayName}", recommended "${rec.providerName}"`);
        }
        return {
            recommendation: rec,
            reason: `Current orchestrator differs from ${rec.setName} ${rec.sessionLabel} recommendation. ` +
                diffs.join("; ") +
                ". This may be intentional (e.g., extra credits, task harder or simpler than anticipated) — " +
                `the Suggested row surfaces the recommendation; you decide. ` +
                `Switch via "Dabbler: Set Orchestrator Model & Effort".`,
        };
    }
    // ------- rendering helpers -------
    renderHtml(state) {
        const cssUri = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "orchestrator-indicator", "indicator.css"));
        const nonce = String(Math.floor(Math.random() * 1e16));
        const csp = `default-src 'none'; ` +
            `style-src ${this.view.webview.cspSource}; ` +
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
    renderEmpty() {
        return `<div class="empty-state">
  <div class="grey-gauges">
    <div class="gauge-svg-wrap">${this.renderGaugeSvg("unknown", "current", 0)}</div>
    <div class="gauge-svg-wrap">${this.renderGaugeSvg("unknown", "current", 0)}</div>
  </div>
  <span>No signal — </span><span class="install-cta" data-command="installHookClaudeCode">install hook</span>
</div>`;
    }
    renderLoaded(marker, stale, ageSec, mismatch) {
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
    renderGaugeSvg(tier, signalKind, needleAngleDeg) {
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
    tierToNeedleAngle(tier) {
        // -180° = leftmost (low), -90° = top-center, 0° = rightmost (flagship).
        switch (tier) {
            case "low": return -150;
            case "mid": return -90;
            case "flagship": return -30;
            case "unknown": return -90;
            default: return -90;
        }
    }
    effortToNeedleAngle(effort) {
        // 5-level effort scale where Medium is the operator-facing
        // "default" (audit D6). Place Medium at the gauge center (-90°)
        // so the default state reads as "neutral" (half-filled arc), and
        // spread the escalations Low / High / Extra-High / Max around it.
        // Operator feedback 2026-05-18: Medium at -120° rendered with a
        // too-short color arc that looked "low" against the Model gauge's
        // longer arc — re-centering Medium fixes the visual imbalance
        // while preserving the red→green polarity.
        switch (effort) {
            case "low": return -150;
            case "medium": return -90;
            case "high": return -60;
            case "extra-high": return -35;
            case "max": return -15;
            default: return -90;
        }
    }
    effortColorBucket(effort) {
        // Reuse tier color classes for the effort gauge: map normalized
        // effort → tier-class for the stroke color.
        switch (effort) {
            case "low": return "low";
            case "medium": return "mid";
            case "high": return "mid";
            case "extra-high": return "flagship";
            case "max": return "flagship";
            default: return "unknown";
        }
    }
    effortDisplayName(effort) {
        switch (effort) {
            case "low": return "Low";
            case "medium": return "Medium";
            case "high": return "High";
            case "extra-high": return "Extra-High";
            case "max": return "Max";
            default: return "Unknown";
        }
    }
    modelTooltip(marker) {
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
    effortTooltip(marker) {
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
    fmtAge(seconds) {
        if (!isFinite(seconds) || seconds < 0)
            return "?";
        if (seconds < 60)
            return `${Math.round(seconds)}s`;
        if (seconds < 3600)
            return `${Math.round(seconds / 60)}m`;
        if (seconds < 86400)
            return `${Math.round(seconds / 3600)}h`;
        return `${Math.round(seconds / 86400)}d`;
    }
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
exports.OrchestratorIndicatorProvider = OrchestratorIndicatorProvider;
OrchestratorIndicatorProvider.viewType = "dabblerOrchestratorIndicator";
//# sourceMappingURL=orchestratorIndicatorProvider.js.map