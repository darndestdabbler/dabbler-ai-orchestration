"use strict";
// Normalized progress view over session-state.json — v3 + v2 read.
//
// TypeScript mirror of `ai_router/progress.py`. Both helpers are the
// canonical reader path for session-set progress state; every consumer
// in the extension (tree provider, badge logic, count derivation) goes
// through `getProgress()` rather than reading the legacy progress
// triple (currentSession / totalSessions / completedSessions) directly.
// The read-side v2 normalization synthesizes a v3-shaped `sessions[]`
// from a v2 snapshot so callers never branch on schema version.
//
// Background: Set 030 (the proposal at
// `docs/proposals/2026-05-17-session-state-sessions-ledger-v3.md`)
// collapses the v2 progress triple into a single canonical
// `sessions[]` ledger. This module is Session 1 of that migration.
// Reader migration (i.e., extension call-sites moving onto this
// helper) ships in Session 3.
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
exports.SessionStateInvariantError = exports.LIFECYCLE_STATE_CLOSED = exports.LIFECYCLE_STATE_WORK_IN_PROGRESS = exports.TOP_LEVEL_STATUSES = exports.SESSION_STATUSES = exports.SESSION_STATUS_CANCELLED = exports.SESSION_STATUS_COMPLETE = exports.SESSION_STATUS_IN_PROGRESS = exports.SESSION_STATUS_NOT_STARTED = exports.SCHEMA_VERSION_V3 = void 0;
exports.canonicalizeStatus = canonicalizeStatus;
exports.extractSessionTitlesFromSpec = extractSessionTitlesFromSpec;
exports.synthesizeV3FromV2 = synthesizeV3FromV2;
exports.readProgress = readProgress;
exports.getProgress = getProgress;
exports.validateInvariants = validateInvariants;
const fs = __importStar(require("fs"));
exports.SCHEMA_VERSION_V3 = 3;
exports.SESSION_STATUS_NOT_STARTED = "not-started";
exports.SESSION_STATUS_IN_PROGRESS = "in-progress";
exports.SESSION_STATUS_COMPLETE = "complete";
exports.SESSION_STATUS_CANCELLED = "cancelled";
// Session-level statuses accepted by validators. NOTE: "cancelled"
// is deliberately excluded — per the proposal and spec decisions
// D11/D12, per-session cancellation is reserved for a future schema.
// Set 030 only exercises set-level cancellation (CANCELLED.md plus
// top-level status="cancelled"). Re-introduce here once a future
// spec defines how cancelled sessions interact with rules 4-7.
exports.SESSION_STATUSES = [
    exports.SESSION_STATUS_NOT_STARTED,
    exports.SESSION_STATUS_IN_PROGRESS,
    exports.SESSION_STATUS_COMPLETE,
];
// Top-level statuses keep "cancelled" because set-level cancellation
// is a first-class state today (filename-marker driven).
exports.TOP_LEVEL_STATUSES = [
    "not-started",
    "in-progress",
    "complete",
    "cancelled",
];
exports.LIFECYCLE_STATE_WORK_IN_PROGRESS = "work_in_progress";
exports.LIFECYCLE_STATE_CLOSED = "closed";
// Tolerated on read, canonicalized to `complete`. Mirrors
// `_STATUS_ALIASES` in Python and the extension's existing
// `STATUS_ALIASES` in `sessionState.ts` so a hand-written file with a
// past-participle token never trips the validators.
const STATUS_ALIASES = {
    completed: exports.SESSION_STATUS_COMPLETE,
    done: exports.SESSION_STATUS_COMPLETE,
};
function canonicalizeStatus(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return STATUS_ALIASES[value] ?? value;
}
// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------
class SessionStateInvariantError extends Error {
    constructor(rule, message) {
        super(`[v3 invariant rule ${rule}] ${message}`);
        this.rule = rule;
        this.name = "SessionStateInvariantError";
    }
}
exports.SessionStateInvariantError = SessionStateInvariantError;
// ---------------------------------------------------------------------------
// Spec.md title extraction (regex-first)
// ---------------------------------------------------------------------------
// Matches `### Session 1 of 5: Title` (the "of N" segment is
// optional to tolerate older specs that omit it).
const SESSION_HEADING_RE = /^###\s+Session\s+(\d+)(?:\s+of\s+\d+)?\s*:\s*(.+?)\s*$/gm;
function extractSessionTitlesFromSpec(specMdPath) {
    let text;
    try {
        text = fs.readFileSync(specMdPath, "utf-8");
    }
    catch {
        return [];
    }
    const out = [];
    let m;
    // Reset state because the regex is /g.
    SESSION_HEADING_RE.lastIndex = 0;
    while ((m = SESSION_HEADING_RE.exec(text)) !== null) {
        out.push({ number: parseInt(m[1], 10), title: m[2].trim() });
    }
    out.sort((a, b) => a.number - b.number);
    return out;
}
// ---------------------------------------------------------------------------
// v2 -> v3 read-time synthesis
// ---------------------------------------------------------------------------
// Per memory `feedback_default_not_started_evidence_to_escalate`:
// every session defaults to "not-started". We only escalate to
// "complete" when the v2 completedSessions[] array lists the number
// AS A STRICT POSITIVE INTEGER (not bool, not float), and to
// "in-progress" when currentSession is set AND top-level status is
// "in-progress" AND the session is not already complete.
//
// Round-A verifier fix: do not force-promote sessions when top-level
// status is "complete" — let rule 7 fail loud on the contradiction.
function isStrictPositiveInt(v) {
    return (typeof v === "number" &&
        Number.isInteger(v) &&
        v > 0 &&
        typeof v !== "boolean");
}
function synthesizeV3FromV2(state, specMdPath) {
    if (state === null || state === undefined) {
        throw new TypeError("synthesizeV3FromV2: state is null");
    }
    // Strict positive-int filtering. JavaScript doesn't conflate bool
    // with int the way Python does, but it does treat all numbers as
    // floats — Number.isInteger(1.0) === true so 1.0 looks like 1.
    // Be defensive at the boundary.
    const legacyCurrent = isStrictPositiveInt(state.currentSession)
        ? state.currentSession
        : null;
    const legacyTotal = isStrictPositiveInt(state.totalSessions)
        ? state.totalSessions
        : 0;
    const legacyCompleted = Array.isArray(state.completedSessions)
        ? state.completedSessions.filter((n) => isStrictPositiveInt(n))
        : [];
    const topStatusRaw = state.status ?? null;
    const topStatus = canonicalizeStatus(topStatusRaw);
    const titles = extractSessionTitlesFromSpec(specMdPath);
    const titlesByNumber = new Map();
    for (const t of titles) {
        titlesByNumber.set(t.number, t.title);
    }
    // Figure out total: prefer explicit, else largest known number, else 0.
    let total = legacyTotal;
    for (const n of titlesByNumber.keys()) {
        if (n > total)
            total = n;
    }
    for (const n of legacyCompleted) {
        if (n > total)
            total = n;
    }
    if (legacyCurrent !== null && legacyCurrent > total) {
        total = legacyCurrent;
    }
    const completedSet = new Set(legacyCompleted);
    const sessions = [];
    for (let n = 1; n <= total; n++) {
        const title = titlesByNumber.get(n) ?? `Session ${n}`;
        let status;
        if (completedSet.has(n)) {
            status = exports.SESSION_STATUS_COMPLETE;
        }
        else if (legacyCurrent === n &&
            topStatus === "in-progress" &&
            !completedSet.has(n)) {
            status = exports.SESSION_STATUS_IN_PROGRESS;
        }
        else {
            // Default-to-not-started. Earlier draft force-promoted every
            // session to "complete" when top-level was "complete", which
            // contradicts "fail loud, never silently recover": a v2 file
            // with top-level=complete but completedSessions=[] is
            // internally inconsistent, and the synthesizer should let
            // rule 7 expose that contradiction rather than coerce it.
            status = exports.SESSION_STATUS_NOT_STARTED;
        }
        sessions.push({ number: n, title, status });
    }
    const out = { ...state };
    out.schemaVersion = exports.SCHEMA_VERSION_V3;
    out.sessions = sessions;
    if (topStatus !== null && topStatus !== topStatusRaw) {
        out.status = topStatus;
    }
    return out;
}
// ---------------------------------------------------------------------------
// getProgress: the one reader path
// ---------------------------------------------------------------------------
// Single reader entry point for any session-state.json shape.
//
// This is the canonical reader path application code (the tree
// provider, count derivation, badge logic, drift guards) MUST use
// under D13. Branches v2/v3 internally so callers never touch the
// legacy currentSession / totalSessions / completedSessions triple
// directly.
//
// For v3 inputs (`sessions[]` present), calls `getProgress` directly.
// For v2 inputs, runs `synthesizeV3FromV2` first, then validates via
// `getProgress`. The `specMdPath` is only consulted on the v2 branch
// — pass any path on v3 inputs; missing/unreadable spec.md just falls
// back to "Session N" titles.
//
// Raises `SessionStateInvariantError` on invariant violation.
// Application readers that want defensive fallback (e.g. degrade to
// in-progress rather than throw) should wrap the call in try/catch.
function readProgress(state, specMdPath) {
    if (state === null || state === undefined) {
        throw new TypeError("readProgress: state is null");
    }
    if (state.sessions !== undefined && state.sessions !== null) {
        return getProgress(state);
    }
    return getProgress(synthesizeV3FromV2(state, specMdPath));
}
function getProgress(state) {
    if (state === null || state === undefined) {
        throw new TypeError("getProgress: state is null");
    }
    const rawSessions = state.sessions;
    if (rawSessions === undefined || rawSessions === null) {
        throw new SessionStateInvariantError(1, "sessions[] is missing; synthesize v3 from v2 first or pass a v3 state");
    }
    const sessions = parseSessions(rawSessions);
    const topStatus = canonicalizeStatus(state.status ?? null);
    const lifecycleState = state.lifecycleState ?? null;
    validateInvariants(sessions, topStatus, lifecycleState);
    const completedNumbers = sessions
        .filter((s) => s.status === exports.SESSION_STATUS_COMPLETE)
        .map((s) => s.number);
    const inProgress = sessions.filter((s) => s.status === exports.SESSION_STATUS_IN_PROGRESS);
    const currentSession = inProgress.length > 0 ? inProgress[0].number : null;
    const notStarted = sessions.filter((s) => s.status === exports.SESSION_STATUS_NOT_STARTED);
    const nextSession = notStarted.length > 0 ? notStarted[0].number : null;
    const isBetweenSessions = currentSession === null && completedNumbers.length >= 1 && nextSession !== null;
    return {
        sessions,
        totalSessions: sessions.length,
        completedSessions: completedNumbers,
        currentSession,
        nextSession,
        isBetweenSessions,
    };
}
// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
function validateInvariants(sessions, topStatus, lifecycleState) {
    // Rule 1: non-empty.
    if (sessions.length === 0) {
        throw new SessionStateInvariantError(1, "sessions[] must be non-empty");
    }
    // Rule 2: positive ints, unique, contiguous starting at 1 (per spec
    // D12 "strict sequential invariant"). Earlier draft only checked
    // ascending, which silently accepted broken ledgers like [1, 3].
    const seen = new Set();
    let expected = 1;
    for (const s of sessions) {
        if (!Number.isInteger(s.number) || typeof s.number === "boolean") {
            throw new SessionStateInvariantError(2, `session number must be an integer (not bool/float/string); got ${JSON.stringify(s.number)} of type ${typeof s.number}`);
        }
        if (s.number <= 0) {
            throw new SessionStateInvariantError(2, `session number must be positive, got ${s.number}`);
        }
        if (seen.has(s.number)) {
            throw new SessionStateInvariantError(2, `duplicate session number: ${s.number}`);
        }
        if (s.number !== expected) {
            throw new SessionStateInvariantError(2, `session numbers must be contiguous starting at 1; expected ${expected} next, got ${s.number}`);
        }
        seen.add(s.number);
        expected = s.number + 1;
        if (!exports.SESSION_STATUSES.includes(s.status)) {
            throw new SessionStateInvariantError(2, `session ${s.number} has unknown status ${JSON.stringify(s.status)}; ` +
                `expected one of ${exports.SESSION_STATUSES.join(", ")}`);
        }
    }
    // Rule 3: at most one in-progress.
    const inProgress = sessions.filter((s) => s.status === exports.SESSION_STATUS_IN_PROGRESS);
    if (inProgress.length > 1) {
        throw new SessionStateInvariantError(3, `only one session may be in-progress at a time; found: ${inProgress.map((s) => s.number).join(", ")}`);
    }
    // Rule 4: complete must form a contiguous prefix.
    let blockerNumber = null;
    let blockerStatus = null;
    for (const s of sessions) {
        if (s.status === exports.SESSION_STATUS_NOT_STARTED || s.status === exports.SESSION_STATUS_IN_PROGRESS) {
            if (blockerNumber === null) {
                blockerNumber = s.number;
                blockerStatus = s.status;
            }
        }
        else if (s.status === exports.SESSION_STATUS_COMPLETE && blockerNumber !== null) {
            throw new SessionStateInvariantError(4, `session ${s.number} is complete but earlier session ${blockerNumber} ` +
                `is ${JSON.stringify(blockerStatus)}; complete sessions must form a contiguous prefix`);
        }
    }
    // Rule 8 ALWAYS applies — even when topStatus is null — because a
    // state with lifecycleState='closed' and missing top-level status
    // is internally inconsistent regardless of whether the caller wants
    // to validate the rest of the top-level rules.
    if (lifecycleState === exports.LIFECYCLE_STATE_CLOSED) {
        if (topStatus !== "complete" && topStatus !== "cancelled") {
            throw new SessionStateInvariantError(8, `lifecycleState 'closed' requires status 'complete' or 'cancelled', ` +
                `got ${JSON.stringify(topStatus)}`);
        }
    }
    if (topStatus === null) {
        return;
    }
    if (!exports.TOP_LEVEL_STATUSES.includes(topStatus)) {
        // Unknown top-level status is a shape/enum error, not a violation
        // of rules 5/6/7 specifically. Report as rule 2 (structural).
        throw new SessionStateInvariantError(2, `top-level status must be one of ${exports.TOP_LEVEL_STATUSES.join(", ")}, ` +
            `got ${JSON.stringify(topStatus)}`);
    }
    // Rule 5: not-started top-level → all sessions not-started.
    if (topStatus === "not-started") {
        const offenders = sessions
            .filter((s) => s.status !== exports.SESSION_STATUS_NOT_STARTED)
            .map((s) => s.number);
        if (offenders.length > 0) {
            throw new SessionStateInvariantError(5, `top-level status 'not-started' but sessions [${offenders.join(", ")}] ` +
                `are not 'not-started'`);
        }
    }
    // Rule 7: complete top-level → all sessions complete.
    if (topStatus === "complete") {
        const offenders = sessions
            .filter((s) => s.status !== exports.SESSION_STATUS_COMPLETE)
            .map((s) => s.number);
        if (offenders.length > 0) {
            throw new SessionStateInvariantError(7, `top-level status 'complete' but sessions [${offenders.join(", ")}] ` +
                `are not 'complete'`);
        }
    }
    // Rule 6: in-progress top-level → exactly one in-progress OR
    // between-sessions (>=1 complete, >=1 not-started, 0 in-progress).
    if (topStatus === "in-progress") {
        const completeCount = sessions.filter((s) => s.status === exports.SESSION_STATUS_COMPLETE).length;
        const notStartedCount = sessions.filter((s) => s.status === exports.SESSION_STATUS_NOT_STARTED).length;
        const inProgressCount = inProgress.length;
        const okActive = inProgressCount === 1;
        const okBetween = inProgressCount === 0 && completeCount >= 1 && notStartedCount >= 1;
        if (!okActive && !okBetween) {
            throw new SessionStateInvariantError(6, "top-level status 'in-progress' requires either exactly one in-progress " +
                "session or a between-sessions state (>=1 complete, >=1 not-started, " +
                `0 in-progress); got in_progress=${inProgressCount}, ` +
                `complete=${completeCount}, not_started=${notStartedCount}`);
        }
    }
    // Rule 8 hoisted above the topStatus null-guard so it always fires.
    // No duplicate check needed here.
}
function parseSessions(raw) {
    if (!Array.isArray(raw)) {
        throw new SessionStateInvariantError(1, `sessions[] must be an array, got ${typeof raw}`);
    }
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
            throw new SessionStateInvariantError(2, `sessions[${i}] must be an object, got ${Array.isArray(entry) ? "array" : typeof entry}`);
        }
        if (!("number" in entry)) {
            throw new SessionStateInvariantError(2, `sessions[${i}] missing required key 'number'`);
        }
        if (!("status" in entry)) {
            throw new SessionStateInvariantError(2, `sessions[${i}] missing required key 'status'`);
        }
        const status = canonicalizeStatus(entry.status) ?? entry.status;
        out.push({
            number: entry.number,
            title: entry.title ?? `Session ${entry.number}`,
            status: status,
        });
    }
    return out;
}
//# sourceMappingURL=progress.js.map