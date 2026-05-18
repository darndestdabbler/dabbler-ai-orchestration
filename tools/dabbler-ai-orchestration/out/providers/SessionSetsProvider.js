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
exports.SessionSetsProvider = exports.progressText = exports.needsMigrationBadge = exports.modeBadge = exports.isCurrentSessionInFlight = exports.forceClosedBadge = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../utils/fileSystem");
const SessionSetsModel_1 = require("./SessionSetsModel");
Object.defineProperty(exports, "forceClosedBadge", { enumerable: true, get: function () { return SessionSetsModel_1.forceClosedBadge; } });
Object.defineProperty(exports, "isCurrentSessionInFlight", { enumerable: true, get: function () { return SessionSetsModel_1.isCurrentSessionInFlight; } });
Object.defineProperty(exports, "modeBadge", { enumerable: true, get: function () { return SessionSetsModel_1.modeBadge; } });
Object.defineProperty(exports, "needsMigrationBadge", { enumerable: true, get: function () { return SessionSetsModel_1.needsMigrationBadge; } });
Object.defineProperty(exports, "progressText", { enumerable: true, get: function () { return SessionSetsModel_1.progressText; } });
function folderTooltip(set) {
    const roots = (0, fileSystem_1.discoverRoots)();
    const rel = path.relative(set.root, set.dir);
    return roots.length > 1 ? `${path.basename(set.root)} / ${rel}` : rel;
}
function contextValueFor(set) {
    const parts = [`sessionSet:${set.state}`];
    if (set.config?.requiresUAT)
        parts.push("uat");
    if (set.config?.requiresE2E)
        parts.push("e2e");
    // Set 030 Session 5: append a `needs-migration` slug to the
    // contextValue when the set's state file is still v2.
    if (set.needsMigration)
        parts.push("needs-migration");
    return parts.join(":");
}
function liveSessionTooltipLines(set) {
    if (!set.liveSession)
        return [];
    const ls = set.liveSession;
    const lines = [];
    if (typeof ls.currentSession === "number") {
        const total = set.totalSessions ? `/${set.totalSessions}` : "";
        const status = ls.status ? ` (${ls.status})` : "";
        lines.push(`Session: ${ls.currentSession}${total}${status}`);
    }
    if (ls.orchestrator) {
        const o = ls.orchestrator;
        const parts = [o.engine, o.model].filter(Boolean).join(" · ");
        const effort = o.effort && o.effort !== "unknown" ? ` @ effort=${o.effort}` : "";
        if (parts)
            lines.push(`Orchestrator: ${parts}${effort}`);
    }
    if (ls.verificationVerdict) {
        lines.push(`Verifier: ${ls.verificationVerdict}`);
    }
    if (ls.forceClosed === true) {
        lines.push("Force-closed: gate bypassed via --force (incident recovery). " +
            "See closeout_force_used in session-events.jsonl for the operator's reason.");
    }
    return lines;
}
function configTooltipLines(set) {
    if (!set.config)
        return [];
    const flags = [];
    if (set.config.requiresUAT)
        flags.push("UAT");
    if (set.config.requiresE2E)
        flags.push("E2E");
    const lines = [];
    lines.push(`Gates: ${flags.length ? flags.join(" + ") : "none"}`);
    if (set.config.requiresUAT && set.uatSummary) {
        const u = set.uatSummary;
        if (u.totalItems > 0) {
            lines.push(`UAT items: ${u.pendingItems} pending / ${u.totalItems} total`);
        }
        else {
            lines.push("UAT checklist: not yet authored");
        }
    }
    return lines;
}
class SessionSetsProvider {
    constructor(extensionUri, scanState) {
        this.extensionUri = extensionUri;
        this.scanState = scanState;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._cache = null;
        this.scanState?.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    refresh() {
        this._cache = null;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!vscode.workspace.workspaceFolders?.length)
            return [];
        if (!element && this.scanState?.phase === "loading") {
            return [this.makeLoadingSentinel()];
        }
        if (!this._cache) {
            this._cache = (0, fileSystem_1.readAllSessionSets)();
        }
        const all = this._cache;
        if (!element) {
            if (all.length === 0) {
                return [];
            }
            const buckets = (0, SessionSetsModel_1.bucketSets)(all);
            const groups = [
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
        const group = element;
        if (group.contextValue === "group") {
            const buckets = (0, SessionSetsModel_1.bucketSets)(all);
            let subset;
            switch (group.groupKey) {
                case "in-progress":
                    subset = buckets.inProgress;
                    break;
                case "not-started":
                    subset = buckets.notStarted;
                    break;
                case "complete":
                    subset = buckets.complete;
                    break;
                case "cancelled":
                    subset = buckets.cancelled;
                    break;
            }
            return (0, SessionSetsModel_1.sortBucket)(subset, group.groupKey).map((s) => this.makeSetItem(s));
        }
        return [];
    }
    // Set 030 Session 5: the loading sentinel shown while the
    // activation-time scan is in flight.
    makeLoadingSentinel() {
        const item = new vscode.TreeItem("Setting up your project…", vscode.TreeItemCollapsibleState.None);
        item.description = "scanning session sets…";
        item.iconPath = vscode.Uri.joinPath(this.extensionUri, "media", "icon.svg");
        item.contextValue = "loading";
        item.tooltip =
            "Dabbler is scanning `docs/session-sets/` for session sets. " +
                "This usually completes within a frame; longer means a slow " +
                "filesystem or many sets to read.";
        return item;
    }
    makeGroup(label, groupKey, count) {
        const item = new vscode.TreeItem(`${label}  (${count})`, count > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = (0, SessionSetsModel_1.iconUriFor)(this.extensionUri, groupKey);
        item.contextValue = "group";
        item.groupKey = groupKey;
        return item;
    }
    makeSetItem(set) {
        const item = new vscode.TreeItem(set.name, vscode.TreeItemCollapsibleState.None);
        const bits = [
            (0, SessionSetsModel_1.progressText)(set),
            (0, SessionSetsModel_1.touchedDate)(set),
            (0, SessionSetsModel_1.modeBadge)(set),
            (0, SessionSetsModel_1.uatBadge)(set),
            (0, SessionSetsModel_1.forceClosedBadge)(set),
            (0, SessionSetsModel_1.needsMigrationBadge)(set),
        ].filter(Boolean);
        item.description = bits.join("  ·  ");
        item.tooltip = new vscode.MarkdownString([
            `**${set.name}**`,
            `State: ${set.state}`,
            bits.length ? `Progress: ${bits.join(" · ")}` : null,
            ...configTooltipLines(set),
            ...liveSessionTooltipLines(set),
            `Folder: \`${folderTooltip(set)}\``,
        ]
            .filter(Boolean)
            .join("\n\n"));
        item.contextValue = contextValueFor(set);
        item.set = set;
        item.iconPath = (0, SessionSetsModel_1.iconUriFor)(this.extensionUri, set.state);
        item.command = {
            command: "dabblerSessionSets.openSpec",
            title: "Open Spec",
            arguments: [item],
        };
        return item;
    }
}
exports.SessionSetsProvider = SessionSetsProvider;
//# sourceMappingURL=SessionSetsProvider.js.map