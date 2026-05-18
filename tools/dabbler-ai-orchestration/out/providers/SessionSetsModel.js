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
exports.ICON_FILES = void 0;
exports.needsMigrationBadge = needsMigrationBadge;
exports.iconUriFor = iconUriFor;
exports.isCurrentSessionInFlight = isCurrentSessionInFlight;
exports.progressText = progressText;
exports.touchedDate = touchedDate;
exports.uatBadge = uatBadge;
exports.forceClosedBadge = forceClosedBadge;
exports.modeBadge = modeBadge;
exports.bucketSets = bucketSets;
exports.sortBucket = sortBucket;
const vscode = __importStar(require("vscode"));
// Set 029 Session 3: data-layer extraction from SessionSetsProvider so
// both the existing native `TreeView` (S3 ship) and the future custom
// webview tree (S4) can consume the same scan/bucket/sort/predicates
// without duplicating logic. The exported functions below are PURE —
// they take `SessionSet` records and return TreeItem chrome or text.
// The provider becomes a thin shim that calls into the model and the
// shared `fileSystem.readAllSessionSets()` scan.
// Set 030 Session 5: badge surfaced on any v2 (or broken-v3) state
// file. Tracked separately from the lifecycle-state badges so reviewers
// can see at a glance which sets still need a one-shot v3 migration
// even if they're otherwise healthy.
function needsMigrationBadge(set) {
    return set.needsMigration ? "(needs migration)" : "";
}
exports.ICON_FILES = {
    complete: "done.svg",
    "in-progress": "in-progress.svg",
    "not-started": "not-started.svg",
    cancelled: "cancelled.svg",
};
function iconUriFor(extensionUri, state) {
    const file = exports.ICON_FILES[state];
    return file ? vscode.Uri.joinPath(extensionUri, "media", file) : undefined;
}
// Set 030 Session 3: the v3 "in-flight" predicate is a direct read of
// the canonical `liveSession.currentSession` field, which `fileSystem.ts`
// populates from `readProgress` as the single in-progress session's
// number (or null when no session is in flight). v2's
// "currentSession not in completedSessions[]" predicate is gone — the
// v3 reader resolves the ambiguity at the source rather than letting
// it propagate into a downstream invariant check.
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
    //     really reached terminal state" cue.
    //   * `0/N · session 1 in flight` on rows where session N has
    //     started but not yet closed.
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
// ``--force`` bypass instead of the deterministic gate.
function forceClosedBadge(set) {
    return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}
// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
function modeBadge(_set) {
    return "";
}
function bucketSets(all) {
    return {
        inProgress: all.filter((s) => s.state === "in-progress"),
        notStarted: all.filter((s) => s.state === "not-started"),
        complete: all.filter((s) => s.state === "complete"),
        cancelled: all.filter((s) => s.state === "cancelled"),
    };
}
// Sort within a bucket. In-progress / complete / cancelled rows sort by
// `lastTouched` desc (most recent first); not-started rows sort by name
// asc (operators usually want fresh-state rows in a stable order).
function sortBucket(subset, groupKey) {
    const out = subset.slice();
    if (groupKey === "not-started") {
        out.sort((a, b) => a.name.localeCompare(b.name));
    }
    else {
        out.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
    }
    return out;
}
//# sourceMappingURL=SessionSetsModel.js.map