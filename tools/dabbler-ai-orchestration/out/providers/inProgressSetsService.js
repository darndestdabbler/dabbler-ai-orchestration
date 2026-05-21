"use strict";
// In-progress session-set enumeration + ai-assignment recommendation
// parsing. Set 033 Session 2 replaces the Set 029 MarkerWatchService
// per H2 (single source of truth = session-state.json) — the
// `.dabbler/orchestrator.json` per-set marker is retired entirely and
// the orchestrator's check-out record lives on `session-state.json`'s
// `orchestrator` block (Set 033 Session 1 schema).
//
// `resolveActiveSet()` becomes `listInProgressSets()`: the tree
// provider renders N in-progress accordions rather than one resolved-
// set scalar with a "multiple-in-progress" ambiguity banner. The
// banner is gone; multi-in-progress is the supported case.
//
// `extractRecommendation()` is preserved unchanged — ai-assignment.md
// parsing for the Suggested-row mismatch logic is orthogonal to the
// marker retirement.
//
// File watching: extension.ts owns a single workspace-level watcher
// on `**/{session-state.json, …}` that fires `provider.refresh()`.
// That covers every signal `listInProgressSets()` needs, so this
// module exposes no class / lifecycle / emitter of its own.
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
exports.listInProgressSets = listInProgressSets;
exports.extractRecommendation = extractRecommendation;
exports.recommendationFor = recommendationFor;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../utils/fileSystem");
// Return the array of session sets currently in the in-progress
// bucket, sorted by `startedAt` ascending (the older the in-flight
// set, the higher it ranks). Callers pass in the cached scan when
// they already have one; otherwise the function does the full scan.
function listInProgressSets(all) {
    const sets = all ?? (0, fileSystem_1.readAllSessionSets)();
    return sets
        .filter((s) => s.state === "in-progress")
        .sort((a, b) => {
        const aStart = a.liveSession?.startedAt ?? "";
        const bStart = b.liveSession?.startedAt ?? "";
        return aStart.localeCompare(bStart);
    });
}
// Free function — ai-assignment.md recommendation parser, kept
// extracted for direct unit testability. Same regex contract as the
// pre-Set-033 implementation: `## Session N[ of M]: <title>` →
// `### Recommended orchestrator` → first non-empty paragraph parsed
// as `<Provider> <Model> @ effort=<level>`.
function extractRecommendation(text, sessionNumber, setName) {
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
    let recHeadingIdx = -1;
    for (let i = sessionStartIdx + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i]))
            break;
        if (/^###\s+Recommended\s+orchestrator/i.test(lines[i])) {
            recHeadingIdx = i;
            break;
        }
    }
    if (recHeadingIdx === -1)
        return null;
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
    const paragraphLines = [];
    for (let i = paragraphStart; i < lines.length; i++) {
        if (lines[i].trim().length === 0)
            break;
        if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i]))
            break;
        paragraphLines.push(lines[i]);
    }
    const paragraph = paragraphLines.join(" ").trim();
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
// Best-effort recommendation lookup for a single set. Reads
// `set.aiAssignmentPath` and asks `extractRecommendation` for the
// session the set is currently on (`liveSession.currentSession`, or
// fall-back to `max(completedSessions)+1`). Returns null on any
// parse / read failure — the accordion renderer treats null as
// "no mismatch row".
function recommendationFor(set) {
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
    let text;
    try {
        text = fs.readFileSync(set.aiAssignmentPath, "utf8");
    }
    catch {
        return null;
    }
    return extractRecommendation(text, targetSession, path.basename(set.dir));
}
//# sourceMappingURL=inProgressSetsService.js.map