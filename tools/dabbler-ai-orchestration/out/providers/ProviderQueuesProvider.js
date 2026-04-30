"use strict";
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
exports.ProviderQueuesProvider = exports.QUEUE_STATES = void 0;
exports.buildTreeItem = buildTreeItem;
exports.parseFetchResult = parseFetchResult;
const vscode = __importStar(require("vscode"));
const pythonRunner_1 = require("../utils/pythonRunner");
/**
 * Tree view backing the ``Provider Queues`` activity-bar entry.
 *
 * Reads queue state by shelling out to ``python -m ai_router.queue_status
 * --format json`` rather than embedding a SQLite client in the extension.
 * Two reasons to keep the source-of-truth on the Python side:
 *
 * 1. The queue schema lives in :mod:`queue_db`. A second TS reader would
 *    drift the moment the next migration lands.
 * 2. Right-click interventions (Mark Failed, Force Reclaim) need the same
 *    transactional guarantees as the role-loop daemons; reusing the Python
 *    helper inherits them for free.
 *
 * The provider caches the parsed JSON for ``CACHE_TTL_MS`` so a tree
 * expand/collapse cycle doesn't re-spawn Python on every click. The
 * auto-refresh interval (configurable, default 15s) drives the visible
 * refresh cadence.
 */
// Mirrors `ai_router.queue_db.VALID_STATES`. Update both lists together if
// the queue state machine ever grows a new state.
exports.QUEUE_STATES = ["new", "claimed", "completed", "failed", "timed_out"];
const CACHE_TTL_MS = 5000;
// Codicon names by queue state, picked from the built-in product icons so we
// don't have to ship SVGs. The spec calls for state-correlated glyphs; these
// codicons read cleanly in both light and dark themes.
const STATE_ICONS = {
    new: "circle-large-outline",
    claimed: "sync",
    completed: "pass",
    failed: "error",
    timed_out: "watch",
};
const STATE_LABELS = {
    new: "new",
    claimed: "claimed",
    completed: "completed",
    failed: "failed",
    timed_out: "timed_out",
};
class ProviderQueuesProvider {
    constructor(deps) {
        this.deps = deps;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._cache = null;
        this._lastError = null;
        this._inFlight = null;
    }
    refresh() {
        this._cache = null;
        this._onDidChangeTreeData.fire();
    }
    /** Test-only — inject a payload directly and skip the spawn path. */
    _setPayloadForTest(payload) {
        this._cache = { fetchedAt: (this.deps.now?.() ?? Date.now()), payload };
        this._lastError = null;
    }
    // ---------- TreeDataProvider ----------
    getTreeItem(element) {
        return buildTreeItem(element);
    }
    async getChildren(element) {
        const root = this.deps.getWorkspaceRoot();
        if (!root) {
            return [
                { kind: "info", label: "No workspace folder open." },
            ];
        }
        if (!element || element.kind === "root") {
            const payload = await this._getPayload(root);
            if (!payload) {
                const detail = this._lastError ?? "Unknown error.";
                return [
                    { kind: "info", label: "Failed to read queue status.", detail, isError: true },
                ];
            }
            const providers = Object.keys(payload.providers).sort();
            if (providers.length === 0) {
                return [
                    {
                        kind: "info",
                        label: "No provider queues found.",
                        detail: "Looked for queue.db files under provider-queues/. Run a session that routes work to populate this view.",
                    },
                ];
            }
            return providers.map((p) => ({
                kind: "provider",
                provider: p,
                info: payload.providers[p],
            }));
        }
        if (element.kind === "provider") {
            if (!element.info.queue_present) {
                return [
                    {
                        kind: "info",
                        label: "queue.db not present",
                        detail: element.info.queue_path,
                    },
                ];
            }
            // One bucket per state, in queue-db lifecycle order.
            return exports.QUEUE_STATES.map((state) => {
                const count = element.info.states[state] ?? 0;
                const messages = element.info.messages.filter((m) => m.state === state);
                return {
                    kind: "stateGroup",
                    provider: element.provider,
                    state,
                    count,
                    messages,
                };
            });
        }
        if (element.kind === "stateGroup") {
            // The Python helper caps the message list (--limit, default 50). When the
            // count exceeds the messages we got back, surface the gap so the operator
            // doesn't think the queue is shorter than it is.
            const items = element.messages.map((m) => ({
                kind: "message",
                provider: element.provider,
                message: m,
            }));
            if (element.count > element.messages.length) {
                items.push({
                    kind: "info",
                    label: `… ${element.count - element.messages.length} more not shown`,
                    detail: "Increase dabblerProviderQueues.messageLimit to see more.",
                });
            }
            return items;
        }
        return [];
    }
    // ---------- internals ----------
    async _getPayload(root) {
        const now = this.deps.now?.() ?? Date.now();
        if (this._cache && now - this._cache.fetchedAt < CACHE_TTL_MS) {
            return this._cache.payload;
        }
        if (this._inFlight) {
            await this._inFlight;
            return this._cache?.payload ?? null;
        }
        const fetcher = this.deps.fetchPayload ?? defaultFetchPayload;
        this._inFlight = (async () => {
            const result = await fetcher(root);
            if (result.ok) {
                this._cache = { fetchedAt: this.deps.now?.() ?? Date.now(), payload: result.payload };
                this._lastError = null;
            }
            else {
                this._lastError = result.message;
            }
        })();
        try {
            await this._inFlight;
        }
        finally {
            this._inFlight = null;
        }
        return this._cache?.payload ?? null;
    }
}
exports.ProviderQueuesProvider = ProviderQueuesProvider;
// ---------- tree-item rendering ----------
function buildTreeItem(node) {
    switch (node.kind) {
        case "root": {
            const item = new vscode.TreeItem("Provider Queues", vscode.TreeItemCollapsibleState.Expanded);
            item.contextValue = "queueRoot";
            return item;
        }
        case "provider": {
            const item = new vscode.TreeItem(node.provider, vscode.TreeItemCollapsibleState.Expanded);
            const totals = node.info.states;
            const total = exports.QUEUE_STATES.reduce((acc, s) => acc + (totals[s] ?? 0), 0);
            const claimed = totals.claimed ?? 0;
            const failed = totals.failed ?? 0;
            const timedOut = totals.timed_out ?? 0;
            const bits = [`${total} msgs`];
            if (claimed > 0)
                bits.push(`${claimed} claimed`);
            if (failed > 0)
                bits.push(`${failed} failed`);
            if (timedOut > 0)
                bits.push(`${timedOut} timed_out`);
            item.description = bits.join("  ·  ");
            item.iconPath = node.info.queue_present
                ? new vscode.ThemeIcon("database")
                : new vscode.ThemeIcon("circle-slash");
            item.tooltip = new vscode.MarkdownString([
                `**${node.provider}**`,
                `Queue: \`${node.info.queue_path}\``,
                node.info.queue_present ? null : "_queue.db not yet created_",
            ]
                .filter(Boolean)
                .join("\n\n"));
            item.contextValue = `queueProvider:${node.info.queue_present ? "present" : "absent"}`;
            return item;
        }
        case "stateGroup": {
            // Empty buckets collapsed; non-empty expanded. Mirrors how the operator
            // typically wants to scan the view: claimed/failed jump out, completed
            // is usually a long uninteresting list.
            const collapsible = node.count > 0 && node.state !== "completed"
                ? vscode.TreeItemCollapsibleState.Expanded
                : node.count > 0
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;
            const item = new vscode.TreeItem(`${STATE_LABELS[node.state]} (${node.count})`, collapsible);
            item.iconPath = new vscode.ThemeIcon(STATE_ICONS[node.state]);
            item.contextValue = `queueState:${node.state}`;
            return item;
        }
        case "message": {
            const m = node.message;
            const idShort = m.id.length > 8 ? m.id.slice(0, 8) : m.id;
            const ss = m.session_set ?? "-";
            const sn = m.session_number ?? "-";
            const item = new vscode.TreeItem(`${idShort}  ·  ${m.task_type}`, vscode.TreeItemCollapsibleState.None);
            const descBits = [`${ss}/${sn}`];
            if (m.claimed_by)
                descBits.push(`by=${m.claimed_by}`);
            if (m.attempts > 0)
                descBits.push(`try ${m.attempts}/${m.max_attempts}`);
            item.description = descBits.join("  ·  ");
            item.iconPath = new vscode.ThemeIcon(STATE_ICONS[m.state]);
            item.tooltip = buildMessageTooltip(node.provider, m);
            item.contextValue = `queueMessage:${m.state}`;
            // Single-click opens the payload — same as the right-click action.
            item.command = {
                command: "dabblerProviderQueues.openPayload",
                title: "Open Payload",
                arguments: [node],
            };
            return item;
        }
        case "info": {
            const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
            item.description = node.detail;
            item.tooltip = node.detail ? new vscode.MarkdownString(node.detail) : undefined;
            item.iconPath = new vscode.ThemeIcon(node.isError ? "warning" : "info");
            item.contextValue = node.isError ? "queueInfo:error" : "queueInfo";
            return item;
        }
    }
}
function buildMessageTooltip(provider, m) {
    const lines = [
        `**${m.task_type}** · ${m.state}`,
        `Provider: ${provider}`,
        `ID: \`${m.id}\``,
        `Session set: ${m.session_set ?? "—"} / session ${m.session_number ?? "—"}`,
        `From provider: ${m.from_provider}`,
        `Enqueued: ${m.enqueued_at}`,
        `Attempts: ${m.attempts} / ${m.max_attempts}`,
    ];
    if (m.claimed_by)
        lines.push(`Claimed by: ${m.claimed_by}`);
    if (m.lease_expires_at)
        lines.push(`Lease expires: ${m.lease_expires_at}`);
    if (m.completed_at)
        lines.push(`Completed: ${m.completed_at}`);
    return new vscode.MarkdownString(lines.join("\n\n"));
}
// ---------- default fetcher (production path) ----------
async function defaultFetchPayload(workspaceRoot) {
    const cfg = vscode.workspace.getConfiguration("dabblerProviderQueues");
    const limit = cfg.get("messageLimit", 50);
    const result = await (0, pythonRunner_1.runPythonModule)({
        cwd: workspaceRoot,
        module: "ai_router.queue_status",
        args: ["--format", "json", "--limit", String(limit)],
        pythonPathSetting: "dabblerProviderQueues.pythonPath",
    });
    return parseFetchResult(result);
}
function parseFetchResult(result) {
    if (result.timedOut) {
        return { ok: false, message: "queue_status timed out (10s)" };
    }
    if (result.exitCode !== 0) {
        const trimmed = (result.stderr || result.stdout).trim();
        const detail = trimmed ? ` — ${trimmed.split("\n").slice(-3).join(" / ")}` : "";
        return {
            ok: false,
            message: `queue_status exited ${result.exitCode}${detail}`,
        };
    }
    try {
        const parsed = JSON.parse(result.stdout);
        if (!parsed || typeof parsed !== "object" || !parsed.providers) {
            return { ok: false, message: "queue_status returned malformed JSON (missing 'providers')" };
        }
        return { ok: true, payload: parsed };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `Failed to parse queue_status JSON: ${msg}` };
    }
}
//# sourceMappingURL=ProviderQueuesProvider.js.map