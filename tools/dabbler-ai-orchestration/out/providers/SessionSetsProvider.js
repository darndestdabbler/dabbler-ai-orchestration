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
exports.SessionSetsProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../utils/fileSystem");
const ICON_FILES = {
    done: "done.svg",
    "in-progress": "in-progress.svg",
    "not-started": "not-started.svg",
};
function iconUriFor(extensionUri, state) {
    const file = ICON_FILES[state];
    return file ? vscode.Uri.joinPath(extensionUri, "media", file) : undefined;
}
function progressText(set) {
    if (set.state === "done") {
        return set.sessionsCompleted > 0
            ? `${set.sessionsCompleted}/${set.sessionsCompleted}`
            : "";
    }
    if (set.totalSessions && set.totalSessions > 0) {
        return `${set.sessionsCompleted}/${set.totalSessions}`;
    }
    return set.sessionsCompleted > 0 ? `${set.sessionsCompleted} done` : "";
}
function touchedDate(set) {
    if (!set.lastTouched)
        return "";
    return new Date(set.lastTouched).toLocaleDateString("en-CA");
}
function uatBadge(set) {
    if (!set.config?.requiresUAT || !set.uatSummary)
        return "";
    if (set.uatSummary.pendingItems > 0)
        return `[UAT ${set.uatSummary.pendingItems}]`;
    if (set.uatSummary.totalItems > 0)
        return "[UAT done]";
    return "";
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
    return parts.join(":");
}
class SessionSetsProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._cache = null;
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
        if (!this._cache) {
            this._cache = (0, fileSystem_1.readAllSessionSets)();
        }
        const all = this._cache;
        if (!element) {
            const inProgress = all.filter((s) => s.state === "in-progress");
            const notStarted = all.filter((s) => s.state === "not-started");
            const done = all.filter((s) => s.state === "done");
            return [
                this.makeGroup("In Progress", "in-progress", inProgress.length),
                this.makeGroup("Not Started", "not-started", notStarted.length),
                this.makeGroup("Done", "done", done.length),
            ];
        }
        const group = element;
        if (group.contextValue === "group") {
            let subset = all.filter((s) => s.state === group.groupKey);
            if (group.groupKey === "in-progress" || group.groupKey === "done") {
                subset.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
            }
            else {
                subset.sort((a, b) => a.name.localeCompare(b.name));
            }
            return subset.map((s) => this.makeSetItem(s));
        }
        return [];
    }
    makeGroup(label, groupKey, count) {
        const item = new vscode.TreeItem(`${label}  (${count})`, count > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = iconUriFor(this.extensionUri, groupKey);
        item.contextValue = "group";
        item.groupKey = groupKey;
        return item;
    }
    makeSetItem(set) {
        const item = new vscode.TreeItem(set.name, vscode.TreeItemCollapsibleState.None);
        const bits = [progressText(set), touchedDate(set), uatBadge(set)].filter(Boolean);
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
        item.iconPath = iconUriFor(this.extensionUri, set.state);
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