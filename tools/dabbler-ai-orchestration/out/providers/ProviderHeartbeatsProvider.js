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
exports.ProviderHeartbeatsProvider = exports.HEARTBEAT_FOOTER = void 0;
exports.isSilent = isSilent;
exports.formatMinutesAgo = formatMinutesAgo;
exports.buildTreeItem = buildTreeItem;
exports.parseFetchResult = parseFetchResult;
const vscode = __importStar(require("vscode"));
const pythonRunner_1 = require("../utils/pythonRunner");
/**
 * Tree view backing the ``Provider Heartbeats`` activity-bar entry.
 *
 * Shells out to ``python -m ai_router.heartbeat_status --format json``
 * for the same reason :class:`ProviderQueuesProvider` shells out to
 * ``queue_status``: the on-disk format lives in :mod:`ai_router.capacity`
 * and a TS reader would either duplicate or drift from it.
 *
 * **Framing.** Every visible string in this view is backward-looking.
 * The Python helper ships a ``_disclaimer`` field with every payload,
 * and the tree's view-description footer echoes it. The cross-provider
 * v1 review explicitly rejected predictive framings (subscription-window
 * exhaustion, throttle risk, "is this provider healthy") — see the
 * Set 005 spec, Risks section, "Heartbeat misuse".
 */
const CACHE_TTL_MS = 5000;
const DEFAULT_LOOKBACK_MINUTES = 60;
const DEFAULT_SILENT_WARNING_MINUTES = 30;
exports.HEARTBEAT_FOOTER = "Observational only. Subscription windows are not introspectable. Use as a heartbeat signal, not as routing guidance.";
class ProviderHeartbeatsProvider {
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
    /** Test-only — inject a payload and skip the spawn path. */
    _setPayloadForTest(payload, lookback) {
        this._cache = {
            fetchedAt: this.deps.now?.() ?? Date.now(),
            payload,
            lookback,
        };
        this._lastError = null;
    }
    // ---------- TreeDataProvider ----------
    getTreeItem(element) {
        return buildTreeItem(element);
    }
    async getChildren(element) {
        if (element)
            return [];
        const root = this.deps.getWorkspaceRoot();
        if (!root) {
            return [{ kind: "info", label: "No workspace folder open." }];
        }
        const settings = this._readSettings();
        const payload = await this._getPayload(root, settings.lookbackMinutes);
        if (!payload) {
            const detail = this._lastError ?? "Unknown error.";
            return [
                {
                    kind: "info",
                    label: "Failed to read heartbeat status.",
                    detail,
                    isError: true,
                },
            ];
        }
        const providers = Object.keys(payload.providers).sort();
        if (providers.length === 0) {
            return [
                {
                    kind: "info",
                    label: "No provider capacity signals found.",
                    detail: "Looked for capacity_signal.jsonl files under provider-queues/. Run a session that emits work to populate this view.",
                },
            ];
        }
        return providers.map((p) => ({
            kind: "provider",
            provider: p,
            data: payload.providers[p],
            silentWarningMinutes: settings.silentWarningMinutes,
        }));
    }
    // ---------- internals ----------
    _readSettings() {
        if (this.deps.getSettings)
            return this.deps.getSettings();
        const cfg = vscode.workspace.getConfiguration("dabblerProviderHeartbeats");
        return {
            lookbackMinutes: cfg.get("lookbackMinutes", DEFAULT_LOOKBACK_MINUTES),
            silentWarningMinutes: cfg.get("silentWarningMinutes", DEFAULT_SILENT_WARNING_MINUTES),
        };
    }
    async _getPayload(root, lookback) {
        const now = this.deps.now?.() ?? Date.now();
        if (this._cache &&
            this._cache.lookback === lookback &&
            now - this._cache.fetchedAt < CACHE_TTL_MS) {
            return this._cache.payload;
        }
        if (this._inFlight) {
            await this._inFlight;
            return this._cache?.payload ?? null;
        }
        const fetcher = this.deps.fetchPayload ?? defaultFetchPayload;
        this._inFlight = (async () => {
            const result = await fetcher(root, lookback);
            if (result.ok) {
                this._cache = {
                    fetchedAt: this.deps.now?.() ?? Date.now(),
                    payload: result.payload,
                    lookback,
                };
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
exports.ProviderHeartbeatsProvider = ProviderHeartbeatsProvider;
// ---------- tree-item rendering ----------
function isSilent(data, silentMinutes) {
    // No signal file or no completions ever recorded both count as silent —
    // the operator cannot tell the difference between "never ran" and "stopped
    // running" without other context, and either way the provider has not
    // produced anything.
    if (!data.signal_file_present)
        return true;
    if (data.minutes_since_last_completion === null)
        return true;
    return data.minutes_since_last_completion > silentMinutes;
}
function formatMinutesAgo(m) {
    if (m === null)
        return "never";
    if (m < 60)
        return `${m} min ago`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h ago` : `${h}h ${rem}m ago`;
}
function buildTreeItem(node) {
    switch (node.kind) {
        case "provider": {
            const d = node.data;
            const silent = isSilent(d, node.silentWarningMinutes);
            const item = new vscode.TreeItem(node.provider, vscode.TreeItemCollapsibleState.None);
            const lookback = d.lookback_minutes;
            if (!d.signal_file_present) {
                item.description = "no capacity signal yet";
            }
            else if (d.minutes_since_last_completion === null) {
                item.description = `silent · 0 completions / ${lookback}m`;
            }
            else {
                const ago = formatMinutesAgo(d.minutes_since_last_completion);
                item.description = `last seen ${ago} · ${d.completions_in_window} completions / ${lookback}m`;
            }
            item.iconPath = new vscode.ThemeIcon(silent ? "warning" : "pulse", silent
                ? new vscode.ThemeColor("notificationsWarningIcon.foreground")
                : undefined);
            item.tooltip = buildProviderTooltip(node.provider, d, silent);
            item.contextValue = silent ? "heartbeatProvider:silent" : "heartbeatProvider:active";
            return item;
        }
        case "info": {
            const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
            item.description = node.detail;
            item.tooltip = node.detail ? new vscode.MarkdownString(node.detail) : undefined;
            item.iconPath = new vscode.ThemeIcon(node.isError ? "warning" : "info");
            item.contextValue = node.isError ? "heartbeatInfo:error" : "heartbeatInfo";
            return item;
        }
    }
}
function buildProviderTooltip(provider, d, silent) {
    const lines = [
        `**${provider}** ${silent ? "· ⚠️ silent" : ""}`.trim(),
        `Last completion: ${d.last_completion_at ?? "—"}`,
        `Completions in last ${d.lookback_minutes}m: ${d.completions_in_window}`,
        `Tokens in last ${d.lookback_minutes}m: ${d.tokens_in_window}`,
        `Signal file: \`${d.signal_path}\``,
        `_${d.disclaimer}_`,
    ];
    return new vscode.MarkdownString(lines.join("\n\n"));
}
// ---------- default fetcher (production path) ----------
async function defaultFetchPayload(workspaceRoot, lookbackMinutes) {
    const result = await (0, pythonRunner_1.runPythonModule)({
        cwd: workspaceRoot,
        module: "ai_router.heartbeat_status",
        args: [
            "--format",
            "json",
            "--lookback-minutes",
            String(lookbackMinutes),
        ],
        pythonPathSetting: "dabblerProviderQueues.pythonPath",
    });
    return parseFetchResult(result, lookbackMinutes);
}
function parseFetchResult(result, lookbackMinutes) {
    if (result.timedOut) {
        return { ok: false, message: "heartbeat_status timed out (10s)" };
    }
    if (result.exitCode !== 0) {
        const trimmed = (result.stderr || result.stdout).trim();
        const detail = trimmed ? ` — ${trimmed.split("\n").slice(-3).join(" / ")}` : "";
        return {
            ok: false,
            message: `heartbeat_status exited ${result.exitCode}${detail}`,
        };
    }
    try {
        const raw = JSON.parse(result.stdout);
        if (!raw || typeof raw !== "object" || !raw.providers) {
            return { ok: false, message: "heartbeat_status returned malformed JSON (missing 'providers')" };
        }
        const providers = {};
        for (const [name, info] of Object.entries(raw.providers)) {
            providers[name] = normalizeProvider(info, lookbackMinutes);
        }
        return {
            ok: true,
            payload: { providers, disclaimer: String(raw._disclaimer ?? exports.HEARTBEAT_FOOTER) },
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `Failed to parse heartbeat_status JSON: ${msg}` };
    }
}
/**
 * Normalize the Python payload's embedded-N field names
 * (``completions_in_last_60min``) into stable names. Falls back to the
 * default lookback if the payload disagrees with the request — defensive
 * against a future helper-version mismatch where the CLI ignores
 * ``--lookback-minutes`` or rounds it.
 */
function normalizeProvider(info, requestedLookback) {
    const lookback = typeof info.lookback_minutes === "number" ? info.lookback_minutes : requestedLookback;
    const completions = pickNumber(info, `completions_in_last_${lookback}min`) ??
        pickNumber(info, `completions_in_last_${requestedLookback}min`) ??
        0;
    const tokens = pickNumber(info, `tokens_in_last_${lookback}min`) ??
        pickNumber(info, `tokens_in_last_${requestedLookback}min`) ??
        0;
    return {
        signal_path: String(info.signal_path ?? ""),
        signal_file_present: Boolean(info.signal_file_present),
        last_completion_at: typeof info.last_completion_at === "string" ? info.last_completion_at : null,
        minutes_since_last_completion: typeof info.minutes_since_last_completion === "number"
            ? info.minutes_since_last_completion
            : null,
        completions_in_window: completions,
        tokens_in_window: tokens,
        lookback_minutes: lookback,
        disclaimer: String(info._disclaimer ?? exports.HEARTBEAT_FOOTER),
    };
}
function pickNumber(obj, key) {
    const v = obj[key];
    return typeof v === "number" ? v : null;
}
//# sourceMappingURL=ProviderHeartbeatsProvider.js.map