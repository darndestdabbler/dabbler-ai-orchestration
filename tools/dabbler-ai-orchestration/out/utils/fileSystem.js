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
exports.PLAYWRIGHT_REL_DEFAULT = exports.SESSION_SETS_REL = void 0;
exports.discoverRoots = discoverRoots;
exports.hasInProgressEvidence = hasInProgressEvidence;
exports.parseSessionSetConfig = parseSessionSetConfig;
exports.parseUatChecklist = parseUatChecklist;
exports.readSessionSets = readSessionSets;
exports.readAllSessionSets = readAllSessionSets;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const git_1 = require("./git");
const sessionState_1 = require("./sessionState");
const cancelLifecycle_1 = require("./cancelLifecycle");
exports.SESSION_SETS_REL = path.join("docs", "session-sets");
exports.PLAYWRIGHT_REL_DEFAULT = "tests";
// Cancelled sets sort below all other groups in the merge logic — Set 8
// keeps cancelled state as the lowest precedence so a set that exists in
// two roots (one cancelled, one active) prefers the active copy when
// dedup-merging. Within a single root the file-presence rule still wins
// because readSessionSets has already resolved each entry's state.
const STATE_RANK = {
    done: 3,
    "in-progress": 2,
    "not-started": 1,
    cancelled: 0,
};
function discoverRoots() {
    const seen = new Map();
    const order = [];
    const add = (p) => {
        if (!p)
            return;
        const canonical = path.resolve(p);
        const key = canonical.toLowerCase();
        if (seen.has(key) || !fs.existsSync(canonical))
            return;
        seen.set(key, canonical);
        order.push(canonical);
    };
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        add(folder.uri.fsPath);
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const wt of (0, git_1.listGitWorktrees)(folder.uri.fsPath)) {
            add(wt);
        }
    }
    return order;
}
// v0.13.2: positive-evidence check for "in-progress" status. The
// principle is: default Not Started; require positive evidence to
// escalate. Done is already evidence-gated (change-log.md presence
// via close_session); Cancelled is evidence-gated (CANCELLED.md);
// In Progress now joins them.
//
// Two evidence signals, either is sufficient:
//   1. session-events.jsonl exists and contains at least one
//      `work_started` event. This is the strongest signal —
//      `register_session_start` writes the event before flipping
//      session-state.json's status.
//   2. activity-log.json exists with at least one entry. Real
//      session work has been logged.
//
// A session-state.json claiming `in-progress` without either signal
// is treated as not-started. This handles two failure modes the
// user has reported:
//   (a) stale `status: "in-progress"` from past partial work that
//       was abandoned without closing the session.
//   (b) migrations / manual file edits that flipped the status
//       prematurely.
function hasInProgressEvidence(sessionSetDir) {
    // session-events.jsonl is the strongest signal. It's append-only
    // newline-delimited JSON; one `work_started` event per session.
    // We don't need to parse — string-search for the event-type marker.
    const eventsPath = path.join(sessionSetDir, "session-events.jsonl");
    if (fs.existsSync(eventsPath)) {
        try {
            const text = fs.readFileSync(eventsPath, "utf8");
            if (text.includes('"event_type": "work_started"') ||
                text.includes('"event_type":"work_started"')) {
                return true;
            }
        }
        catch {
            /* fall through to the activity-log check */
        }
    }
    // activity-log.json: secondary evidence. Has entries iff actual work
    // was logged via SessionLog.log_step().
    const activityPath = path.join(sessionSetDir, "activity-log.json");
    if (fs.existsSync(activityPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(activityPath, "utf8"));
            if (Array.isArray(data.entries) && data.entries.length > 0) {
                return true;
            }
        }
        catch {
            /* malformed activity log — no evidence */
        }
    }
    return false;
}
function parseSessionSetConfig(specPath) {
    // outsourceMode defaults to "first" — matches the AI router's documented
    // backward-compat default when the spec omits the field.
    const config = {
        requiresUAT: false,
        requiresE2E: false,
        uatScope: "none",
        outsourceMode: "first",
    };
    if (!fs.existsSync(specPath))
        return config;
    let text;
    try {
        text = fs.readFileSync(specPath, "utf8");
    }
    catch {
        return config;
    }
    const headingMatch = text.match(/##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i);
    const block = headingMatch ? headingMatch[1] : text.slice(0, 4000);
    const flagRe = (key) => new RegExp(`^\\s*${key}\\s*:\\s*(true|false)\\s*$`, "im");
    const stringRe = (key) => new RegExp(`^\\s*${key}\\s*:\\s*([\\w-]+)\\s*$`, "im");
    const uat = block.match(flagRe("requiresUAT"));
    if (uat)
        config.requiresUAT = uat[1].toLowerCase() === "true";
    const e2e = block.match(flagRe("requiresE2E"));
    if (e2e)
        config.requiresE2E = e2e[1].toLowerCase() === "true";
    const scope = block.match(stringRe("uatScope"));
    if (scope)
        config.uatScope = scope[1];
    const mode = block.match(stringRe("outsourceMode"));
    if (mode) {
        const v = mode[1].toLowerCase();
        if (v === "first" || v === "last")
            config.outsourceMode = v;
    }
    return config;
}
function parseUatChecklist(checklistPath) {
    if (!fs.existsSync(checklistPath))
        return null;
    let data;
    try {
        data = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
    }
    catch {
        return null;
    }
    const items = [];
    const collect = (node) => {
        if (!node || typeof node !== "object")
            return;
        if (Array.isArray(node)) {
            for (const v of node)
                collect(v);
            return;
        }
        const obj = node;
        if (obj["Result"] !== undefined || obj["result"] !== undefined) {
            items.push(obj);
        }
        for (const v of Object.values(obj))
            collect(v);
    };
    collect(data);
    const e2eRefs = new Set();
    let pending = 0;
    for (const it of items) {
        const r = (it["Result"] ?? it["result"] ?? "");
        if (r === "" || r === null || /^pending$/i.test(String(r)))
            pending++;
        const ref = it["E2ETestReference"] || it["e2eTestReference"];
        if (ref)
            e2eRefs.add(String(ref));
    }
    return { totalItems: items.length, pendingItems: pending, e2eRefs: Array.from(e2eRefs) };
}
function readSessionSets(root) {
    const sessionSetsDir = path.join(root, exports.SESSION_SETS_REL);
    if (!fs.existsSync(sessionSetsDir))
        return [];
    const entries = fs.readdirSync(sessionSetsDir, { withFileTypes: true });
    const sets = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith("_"))
            continue;
        const dir = path.join(sessionSetsDir, entry.name);
        const specPath = path.join(dir, "spec.md");
        if (!fs.existsSync(specPath))
            continue;
        const activityPath = path.join(dir, "activity-log.json");
        const changeLogPath = path.join(dir, "change-log.md");
        const statePath = path.join(dir, "session-state.json");
        const aiAssignmentPath = path.join(dir, "ai-assignment.md");
        const uatChecklistPath = path.join(dir, `${entry.name}-uat-checklist.json`);
        // Set 8: CANCELLED.md presence is the canonical (and only) signal
        // for the cancelled tree state. The spec's detection-rules table in
        // `docs/session-sets/008-cancelled-session-set-status/spec.md` makes
        // the file-presence check the first gate so a partially-completed
        // set that has been cancelled mid-stream renders as Cancelled rather
        // than Done. Once a set is restored, its `RESTORED.md` is "purely
        // an audit artifact" (spec § Detection rules) and the set falls
        // back to whichever of done/in-progress/not-started its other
        // files indicate. The cancelLifecycle helpers keep
        // session-state.json's `status` in lockstep with the markdown file,
        // so we do not consult `status === "cancelled"` as a separate
        // signal — operator manual edits resolve via the file-presence
        // path, matching the spec's "filename presence is what matters"
        // rule.
        let state;
        if ((0, cancelLifecycle_1.isCancelled)(dir)) {
            state = "cancelled";
        }
        else {
            // Set 7 invariant: state is read directly from session-state.json's
            // canonical `status`. v0.13.2 layers an evidence-corroboration
            // rule on top: an `in-progress` status is trusted only when
            // there's a positive corroborating signal (an `activity-log.json`
            // with at least one entry, or a `session-events.jsonl` containing
            // a `work_started` event). Without corroboration, the state
            // decays to `not-started` — which is what the user wants when a
            // session set's `session-state.json` was written eagerly by
            // `register_session_start` but the session never actually
            // produced any work, or when a stale partial-migration leaves an
            // `in-progress` status field with no underlying activity.
            //
            // The principle: default Not Started; require positive evidence
            // to escalate to In Progress / Done / Cancelled. `Done` is
            // already evidence-gated (close_session writes `change-log.md`
            // before flipping the snapshot); `Cancelled` is evidence-gated
            // by the `CANCELLED.md` marker; `In Progress` now joins them.
            const status = (0, sessionState_1.readStatus)(dir);
            if (status === "complete") {
                state = "done";
            }
            else if (status === "in-progress" && hasInProgressEvidence(dir)) {
                state = "in-progress";
            }
            else {
                state = "not-started";
            }
        }
        let totalSessions = null;
        let sessionsCompleted = 0;
        let lastTouched = null;
        let liveSession = null;
        if (fs.existsSync(activityPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(activityPath, "utf8"));
                if (typeof data.totalSessions === "number")
                    totalSessions = data.totalSessions;
                const completedSet = new Set();
                for (const e of data.entries ?? []) {
                    if (typeof e.sessionNumber === "number")
                        completedSet.add(e.sessionNumber);
                    if (e.dateTime && (!lastTouched || e.dateTime > lastTouched))
                        lastTouched = e.dateTime;
                }
                sessionsCompleted = completedSet.size;
            }
            catch { /* ignore */ }
        }
        if (fs.existsSync(statePath)) {
            try {
                const sd = JSON.parse(fs.readFileSync(statePath, "utf8"));
                if (totalSessions === null && typeof sd.totalSessions === "number") {
                    totalSessions = sd.totalSessions;
                }
                const stateTouched = sd.completedAt || sd.startedAt;
                if (stateTouched && (!lastTouched || stateTouched > lastTouched))
                    lastTouched = stateTouched;
                liveSession = {
                    currentSession: sd.currentSession ?? null,
                    status: sd.status ?? null,
                    orchestrator: sd.orchestrator ?? null,
                    startedAt: sd.startedAt ?? null,
                    completedAt: sd.completedAt ?? null,
                    verificationVerdict: sd.verificationVerdict ?? null,
                    forceClosed: sd.forceClosed ?? null,
                };
            }
            catch { /* ignore */ }
        }
        const config = parseSessionSetConfig(specPath);
        const uatSummary = config.requiresUAT ? parseUatChecklist(uatChecklistPath) : null;
        sets.push({
            name: entry.name,
            dir,
            specPath,
            activityPath,
            changeLogPath,
            statePath,
            aiAssignmentPath,
            uatChecklistPath,
            state,
            totalSessions,
            sessionsCompleted,
            lastTouched,
            liveSession,
            config,
            uatSummary,
            root,
        });
    }
    // v0.13.2 diagnostic: one-line summary so the dev console shows what
    // the extension thinks the bucketing should be, independently of how
    // the tree renders. If the user reports "set X showed in In Progress
    // but session-state.json says not-started", the dev console line
    // here will show whether the extension classified set X correctly
    // (a UI/cache bug) or incorrectly (a state-derivation bug).
    if (sets.length > 0) {
        const counts = sets.reduce((acc, s) => {
            acc[s.state] = (acc[s.state] ?? 0) + 1;
            return acc;
        }, {});
        console.log(`[dabbler-ai-orchestration] readSessionSets(${path.basename(root)}): ` +
            `${sets.length} set(s) — ` +
            `done=${counts.done ?? 0}, ` +
            `in-progress=${counts["in-progress"] ?? 0}, ` +
            `not-started=${counts["not-started"] ?? 0}, ` +
            `cancelled=${counts.cancelled ?? 0}`);
    }
    return sets;
}
function readAllSessionSets() {
    const merged = new Map();
    for (const root of discoverRoots()) {
        for (const set of readSessionSets(root)) {
            const prior = merged.get(set.name);
            if (!prior) {
                merged.set(set.name, set);
                continue;
            }
            const newRank = STATE_RANK[set.state] ?? -1;
            const priorRank = STATE_RANK[prior.state] ?? -1;
            if (newRank > priorRank) {
                merged.set(set.name, set);
            }
            else if (newRank === priorRank) {
                if ((set.lastTouched || "") > (prior.lastTouched || ""))
                    merged.set(set.name, set);
            }
        }
    }
    return Array.from(merged.values());
}
//# sourceMappingURL=fileSystem.js.map