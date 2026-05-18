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
exports.needsMigrationBadge = needsMigrationBadge;
exports.isCurrentSessionInFlight = isCurrentSessionInFlight;
exports.progressText = progressText;
exports.forceClosedBadge = forceClosedBadge;
exports.modeBadge = modeBadge;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../utils/fileSystem");
// Set 030 Session 5: badge surfaced on any v2 (or broken-v3) state
// file. Tracked separately from the lifecycle-state badges so reviewers
// can see at a glance which sets still need a one-shot v3 migration
// even if they're otherwise healthy. Migration is invoked via the
// `dabblerSessionSets.migrate` command (context menu on the row).
function needsMigrationBadge(set) {
    return set.needsMigration ? "(needs migration)" : "";
}
const ICON_FILES = {
    complete: "done.svg",
    "in-progress": "in-progress.svg",
    "not-started": "not-started.svg",
    cancelled: "cancelled.svg",
};
function iconUriFor(extensionUri, state) {
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
// Exported for unit-test reuse.
function isCurrentSessionInFlight(set) {
    return set.liveSession?.currentSession != null;
}
function progressText(set) {
    // Always show X/total. The earlier "X/X" shape on done sets assumed
    // completed === total, which masks bugs like a SET-level flip to
    // "complete" that fires before all sessions ran. Truthful display
    // surfaces the discrepancy at a glance.
    //
    // Set 022 Session 2 added two annotations to disambiguate the row.
    // Set 030 Session 3 renamed the terminal annotation to "Complete"
    // so the display vocabulary matches the JSON status glossary:
    //   * `N/N Complete` on complete rows — operator-facing "yes this
    //     really reached terminal state" cue. Distinguishes a healthy
    //     final close from a stale `N/N` snapshot that's about to be
    //     downgraded by isMidSetComplete.
    //   * `0/N · session 1 in flight` on rows where session N has
    //     started but not yet closed. Removes the operator confusion
    //     of "I started session 1 — why does it still say 0/4?"
    //     Both lifecycle endpoints (0/N at start of session 1; N/N
    //     between session N's start and its close on the final
    //     session) used to be indistinguishable from their "no work
    //     started yet" / "set is complete" siblings.
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
// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the badge surfaces
// the rare case where a session set was closed via the hard-scoped
// ``--force`` bypass instead of the deterministic gate. The flag is
// written by ``_flip_state_to_closed(forced=True)`` in
// ``ai_router/session_state.py``; absent or false on every snapshot
// written by a normal close-out, so the badge never appears for
// healthy sets.
function forceClosedBadge(set) {
    return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}
// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
function modeBadge(_set) {
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
    // contextValue when the set's state file is still v2. The package.json
    // `view/item/context` menu uses this to gate the "Migrate to v3
    // schema" entry — only rows that actually need it see the command.
    if (set.needsMigration)
        parts.push("needs-migration");
    return parts.join(":");
}
class SessionSetsProvider {
    constructor(extensionUri, scanState) {
        this.extensionUri = extensionUri;
        this.scanState = scanState;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._cache = null;
        // When the scan transitions from "loading" → "ready" the tree
        // needs to refresh so the loading sentinel is replaced by real
        // rows. Subscribe once; the constructor instance lives for the
        // lifetime of the extension so no dispose tracking needed.
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
        // Set 030 Session 5: while the activation-time scan is in flight,
        // render a single loading sentinel TreeItem instead of "[]". The
        // welcome view's `when` clause (in package.json) suppresses the
        // CTA content until scanState == "ready", so this is what the
        // operator sees during the loading window. Once `onDidChange`
        // fires "ready", the tree re-renders normally below.
        if (!element && this.scanState?.phase === "loading") {
            return [this.makeLoadingSentinel()];
        }
        if (!this._cache) {
            this._cache = (0, fileSystem_1.readAllSessionSets)();
        }
        const all = this._cache;
        if (!element) {
            // v0.13.1 / Set 030 S5: when the workspace has no session sets
            // at all AND the scan has completed, return an empty array so VS
            // Code renders the `viewsWelcome` content. The welcome view's
            // `when` clause now requires `dabblerSessionSets.scanState ==
            // ready` so the content no longer flashes during the loading
            // window — only after the scan finishes and confirms the
            // workspace is genuinely empty does the welcome CTA appear.
            if (all.length === 0) {
                return [];
            }
            const inProgress = all.filter((s) => s.state === "in-progress");
            const notStarted = all.filter((s) => s.state === "not-started");
            const complete = all.filter((s) => s.state === "complete");
            const cancelled = all.filter((s) => s.state === "cancelled");
            const groups = [
                this.makeGroup("In Progress", "in-progress", inProgress.length),
                this.makeGroup("Not Started", "not-started", notStarted.length),
                this.makeGroup("Complete", "complete", complete.length),
            ];
            // Set 8: the Cancelled group only renders when ≥ 1 cancelled set
            // exists (parallels the existing spec rule for not-emitting empty
            // groups noted in spec.md scope). A repo that never cancels a set
            // should not see the group at all.
            if (cancelled.length > 0) {
                groups.push(this.makeGroup("Cancelled", "cancelled", cancelled.length));
            }
            return groups;
        }
        const group = element;
        if (group.contextValue === "group") {
            const subset = all.filter((s) => s.state === group.groupKey);
            if (group.groupKey === "in-progress" ||
                group.groupKey === "complete" ||
                group.groupKey === "cancelled") {
                subset.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
            }
            else {
                subset.sort((a, b) => a.name.localeCompare(b.name));
            }
            return subset.map((s) => this.makeSetItem(s));
        }
        return [];
    }
    // Set 030 Session 5: the loading sentinel shown while the
    // activation-time scan is in flight. Uses the Dabbler brand icon
    // (already shipped under `media/icon.svg` for the activity-bar
    // viewsContainer) so the operator sees the same visual identifier
    // they're about to interact with. `description` carries the
    // "scanning…" hint — VS Code renders it dimmer than the label, which
    // matches the "transient activity" cue.
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
        item.iconPath = iconUriFor(this.extensionUri, groupKey);
        item.contextValue = "group";
        item.groupKey = groupKey;
        return item;
    }
    makeSetItem(set) {
        const item = new vscode.TreeItem(set.name, vscode.TreeItemCollapsibleState.None);
        const bits = [
            progressText(set),
            touchedDate(set),
            modeBadge(set),
            uatBadge(set),
            forceClosedBadge(set),
            needsMigrationBadge(set),
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
//# sourceMappingURL=sessionSetsProvider.js.map