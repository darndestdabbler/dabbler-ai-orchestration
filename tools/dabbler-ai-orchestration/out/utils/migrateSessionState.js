"use strict";
// In-extension v2 → v3 session-state.json migrator.
//
// Replaces the previous Python subprocess path (which spawned
// `python -m ai_router.migrate_session_state` and required the
// `ai_router` package to be installed even for the deterministic
// strategies). Lightweight-tier consumer repos that never install
// ai-router can now migrate too.
//
// Two strategies — both deterministic, no routing:
//
//   * "regex"   — read `### Session N of M: <title>` headings from
//                 spec.md (regex parse); fall back to "Session N" if
//                 a heading is absent. Recommended default.
//   * "generic" — every session titled "Session N". Used when
//                 spec.md headings are malformed / missing / not
//                 desired.
//
// The pre-existing AI strategy is retired here. Any orchestrator
// (Claude, Codex, Gemini, GitHub Copilot, etc.) can perform AI-style
// title refinement in-line as a chat task if the operator wants it —
// outsourcing this through the router is overkill for a few-token
// extraction and prevents Lightweight repos from migrating at all.
//
// TypeScript mirror of the deterministic surface of
// `ai_router/migrate_session_state.py`. Building blocks
// (canonicalizeStatus, extractSessionTitlesFromSpec,
// validateInvariants, SessionStateInvariantError) live in
// `utils/progress.ts` and are shared with the read-time synthesizer.
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
exports.migrateOneSet = migrateOneSet;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const progress_1 = require("./progress");
const SESSION_STATE_FILENAME = "session-state.json";
function isStrictPositiveInt(v) {
    return (typeof v === "number" &&
        Number.isInteger(v) &&
        v > 0 &&
        !Number.isNaN(v));
}
function stripLegacyCompleted(raw, total) {
    if (!Array.isArray(raw))
        return [];
    const seen = new Set();
    const out = [];
    for (const n of raw) {
        if (isStrictPositiveInt(n) && n >= 1 && n <= total && !seen.has(n)) {
            out.push(n);
            seen.add(n);
        }
    }
    out.sort((a, b) => a - b);
    return out;
}
function resolveTotal(state, specTitles) {
    const candidates = [];
    if (isStrictPositiveInt(state.totalSessions))
        candidates.push(state.totalSessions);
    if (specTitles.size > 0)
        candidates.push(Math.max(...specTitles.keys()));
    if (isStrictPositiveInt(state.currentSession))
        candidates.push(state.currentSession);
    if (Array.isArray(state.completedSessions)) {
        for (const n of state.completedSessions) {
            if (isStrictPositiveInt(n))
                candidates.push(n);
        }
    }
    return candidates.length > 0 ? Math.max(...candidates) : 0;
}
function resolveLifecycleState(topStatus, raw) {
    if (topStatus === progress_1.SESSION_STATUS_COMPLETE)
        return progress_1.LIFECYCLE_STATE_CLOSED;
    if (topStatus === "cancelled") {
        return typeof raw === "string" && raw.length > 0 ? raw : progress_1.LIFECYCLE_STATE_CLOSED;
    }
    if (topStatus === progress_1.SESSION_STATUS_IN_PROGRESS) {
        return typeof raw === "string" && raw.length > 0
            ? raw
            : progress_1.LIFECYCLE_STATE_WORK_IN_PROGRESS;
    }
    // not-started: keep operator's explicit value (often null).
    return typeof raw === "string" ? raw : null;
}
// Build the v3 sessions[] from a v2 state dict.
//
// Closed-signal path mirrors the Python migrator's Round-A fix: when
// `status: complete` AND (`lifecycleState: closed` OR
// `currentSession >= LEGACY totalSessions`), force-promote every
// session to "complete" so rule 7 holds. The disjunct compares
// against the LEGACY totalSessions field (not the resolved total) —
// a v2 file marked complete against a 3-session plan that spec.md
// later widened to 4 must still close out under the operator's
// original signal.
function buildV3Sessions(state, specTitles, total, useGenericTitles) {
    const topStatus = (0, progress_1.canonicalizeStatus)(state.status);
    const lifecycle = state.lifecycleState;
    const currentInt = isStrictPositiveInt(state.currentSession)
        ? state.currentSession
        : null;
    const legacyTotalInt = isStrictPositiveInt(state.totalSessions)
        ? state.totalSessions
        : null;
    const closedSignal = topStatus === progress_1.SESSION_STATUS_COMPLETE &&
        (lifecycle === progress_1.LIFECYCLE_STATE_CLOSED ||
            (legacyTotalInt !== null &&
                currentInt !== null &&
                currentInt >= legacyTotalInt));
    const completedLegacy = stripLegacyCompleted(state.completedSessions, total);
    const completedSet = closedSignal
        ? new Set(Array.from({ length: total }, (_, i) => i + 1))
        : new Set(completedLegacy);
    let inProgressNumber = null;
    if (topStatus === progress_1.SESSION_STATUS_IN_PROGRESS &&
        currentInt !== null &&
        currentInt >= 1 &&
        currentInt <= total &&
        !completedSet.has(currentInt)) {
        inProgressNumber = currentInt;
    }
    const sessions = [];
    for (let n = 1; n <= total; n++) {
        const title = useGenericTitles || !specTitles.has(n)
            ? `Session ${n}`
            : specTitles.get(n);
        let status;
        if (inProgressNumber !== null && n === inProgressNumber) {
            status = progress_1.SESSION_STATUS_IN_PROGRESS;
        }
        else if (completedSet.has(n)) {
            status = progress_1.SESSION_STATUS_COMPLETE;
        }
        else {
            status = progress_1.SESSION_STATUS_NOT_STARTED;
        }
        sessions.push({ number: n, title, status });
    }
    return sessions;
}
function deriveLegacyTriple(sessions) {
    let current = null;
    const completed = [];
    for (const s of sessions) {
        if (s.status === progress_1.SESSION_STATUS_IN_PROGRESS) {
            current = s.number;
        }
        else if (s.status === progress_1.SESSION_STATUS_COMPLETE) {
            completed.push(s.number);
        }
    }
    completed.sort((a, b) => a - b);
    return { current, total: sessions.length, completed };
}
// Write JSON to *filePath* atomically: write to a sibling tempfile,
// fsync, rename. Survives crash mid-write — readers see either the
// old content or the new content, never a half-written file.
function atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const tmp = path.join(dir, `${base}.tmp.${process.pid}.${Date.now()}`);
    const fd = fs.openSync(tmp, "w");
    try {
        fs.writeSync(fd, JSON.stringify(data, null, 2) + "\n", null, "utf-8");
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    }
    fs.renameSync(tmp, filePath);
}
// Migrate one session-set directory's session-state.json to v3.
//
// Idempotent: a v3 file with sessions[] returns "skipped-v3" without
// touching disk. A missing or malformed state file returns a skip
// action with a human-readable reason. This function NEVER throws
// for normal failure cases — structured MigrationResult records are
// returned so the UI can surface them.
function migrateOneSet(setDir, options = {}) {
    const strategy = options.strategy ?? "regex";
    const dryRun = options.dryRun ?? false;
    const statePath = path.join(setDir, SESSION_STATE_FILENAME);
    if (!fs.existsSync(statePath)) {
        return {
            setDir,
            action: "skipped-no-state",
            reason: `${SESSION_STATE_FILENAME} not found`,
        };
    }
    let raw;
    try {
        raw = fs.readFileSync(statePath, "utf-8");
    }
    catch (exc) {
        const msg = exc instanceof Error ? exc.message : String(exc);
        return {
            setDir,
            action: "skipped-malformed",
            reason: `failed to read: ${msg}`,
            error: msg,
        };
    }
    let state;
    try {
        state = JSON.parse(raw);
    }
    catch (exc) {
        const msg = exc instanceof Error ? exc.message : String(exc);
        return {
            setDir,
            action: "skipped-malformed",
            reason: `failed to parse: ${msg}`,
            error: msg,
        };
    }
    if (state === null ||
        typeof state !== "object" ||
        Array.isArray(state)) {
        const t = Array.isArray(state) ? "array" : typeof state;
        return {
            setDir,
            action: "skipped-malformed",
            reason: `top-level JSON is ${t}, expected object`,
        };
    }
    const stateObj = state;
    const schemaVersion = stateObj.schemaVersion;
    if (typeof schemaVersion === "number" && schemaVersion > progress_1.SCHEMA_VERSION_V3) {
        return {
            setDir,
            action: "skipped-future-schema",
            reason: `schemaVersion=${schemaVersion} is newer than this migrator ` +
                `(v${progress_1.SCHEMA_VERSION_V3}); refusing to downgrade. Upgrade the ` +
                "migrator or hand-edit the file.",
        };
    }
    if (schemaVersion === progress_1.SCHEMA_VERSION_V3) {
        if (Array.isArray(stateObj.sessions)) {
            return {
                setDir,
                action: "skipped-v3",
                reason: "already v3 (sessions[] present)",
            };
        }
        // Self-identified v3 but missing/broken sessions[] — refuse to
        // rewrite by re-running v2 inference (which would treat the
        // missing array as a default-not-started signal and obliterate
        // any operator intent recorded by the v3 writer that produced
        // this file).
        return {
            setDir,
            action: "skipped-malformed",
            reason: "schemaVersion=3 but sessions[] is missing or not a list; this is " +
                "a broken v3 file, not a v2 file. Hand-repair or restore from git.",
        };
    }
    const specMdPath = path.join(setDir, "spec.md");
    const specTitlesArr = (0, progress_1.extractSessionTitlesFromSpec)(specMdPath);
    const specTitles = new Map(specTitlesArr.map((t) => [t.number, t.title]));
    const total = resolveTotal(stateObj, specTitles);
    if (total < 1) {
        return {
            setDir,
            action: "would-violate",
            reason: "cannot determine totalSessions: no spec.md headings, no legacy " +
                "totalSessions, no completedSessions, no currentSession",
        };
    }
    const sessions = buildV3Sessions(stateObj, specTitles, total, strategy === "generic");
    const topStatusRaw = stateObj.status;
    const topStatus = (0, progress_1.canonicalizeStatus)(topStatusRaw);
    const lifecycleState = resolveLifecycleState(topStatus, stateObj.lifecycleState);
    try {
        (0, progress_1.validateInvariants)(sessions, topStatus, lifecycleState);
    }
    catch (exc) {
        if (exc instanceof progress_1.SessionStateInvariantError) {
            return {
                setDir,
                action: "would-violate",
                reason: exc.message,
                error: exc.message,
            };
        }
        throw exc;
    }
    const { current, total: derivedTotal, completed } = deriveLegacyTriple(sessions);
    const out = { ...stateObj };
    out.schemaVersion = progress_1.SCHEMA_VERSION_V3;
    out.sessions = sessions;
    if (topStatus !== null && topStatus !== topStatusRaw) {
        out.status = topStatus;
    }
    if (lifecycleState !== null || "lifecycleState" in out) {
        out.lifecycleState = lifecycleState;
    }
    out.currentSession = current;
    out.totalSessions = derivedTotal;
    out.completedSessions = completed;
    if (!dryRun) {
        atomicWriteJson(statePath, out);
    }
    return {
        setDir,
        action: "migrated",
        reason: `migrated using ${strategy} strategy`,
    };
}
//# sourceMappingURL=migrateSessionState.js.map