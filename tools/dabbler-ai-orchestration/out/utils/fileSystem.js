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
exports.isMidSetComplete = isMidSetComplete;
exports.countDistinctCloseoutSessions = countDistinctCloseoutSessions;
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
const progress_1 = require("./progress");
exports.SESSION_SETS_REL = path.join("docs", "session-sets");
exports.PLAYWRIGHT_REL_DEFAULT = "tests";
// Cancelled sets sort below all other groups in the merge logic — Set 8
// keeps cancelled state as the lowest precedence so a set that exists in
// two roots (one cancelled, one active) prefers the active copy when
// dedup-merging. Within a single root the file-presence rule still wins
// because readSessionSets has already resolved each entry's state.
const STATE_RANK = {
    complete: 3,
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
// Detect a stale `status: "complete"` snapshot that doesn't actually
// reflect a finished set. Set 030 Session 3 collapses the old Set 022 +
// Set 023 multi-signal guard into a single v3-invariant probe: the v3
// reader (`readProgress`) validates that `sessions[]` matches the
// top-level `status`, and any drift surfaces as a rule-4/7 violation.
// The v2 read path goes through `synthesizeV3FromV2` first; a v2
// snapshot with `status: "complete"` but an empty/short
// `completedSessions[]` synthesizes to a sessions[] that fails rule 7,
// flagging the same drift cases (count mismatch, final-session signal
// gap) without the explicit predicate ladder.
//
// V2-compat: pre-Set-022 snapshots without `completedSessions[]` get
// their array pre-populated from the events ledger before synthesis,
// so a legacy snapshot whose ledger has all closeouts still validates
// cleanly (no false drift downgrade).
//
// Returns false on parse failure — trust the canonical status rather
// than second-guessing on garbled input. Returns true ONLY when the v3
// invariants themselves reject the snapshot.
function isMidSetComplete(statePath) {
    if (!fs.existsSync(statePath))
        return false;
    let sd;
    try {
        sd = JSON.parse(fs.readFileSync(statePath, "utf8"));
    }
    catch {
        return false; // parse error: trust the canonical status
    }
    if (sd === null || typeof sd !== "object" || Array.isArray(sd))
        return false;
    // V2-compat ledger merge: same shape as the readSessionSets path.
    let stateForProgress = sd;
    if (sd.sessions === undefined &&
        (!Array.isArray(sd.completedSessions) || sd.completedSessions.length === 0) // noqa: D13 - v2-compat ledger-merge for synthesizer input
    ) {
        const eventsPath = path.join(path.dirname(statePath), "session-events.jsonl");
        const ledgerSessions = readClosedSessionsFromLedger(eventsPath);
        if (ledgerSessions.length > 0) {
            stateForProgress = { ...sd, completedSessions: ledgerSessions };
        }
    }
    const specPath = path.join(path.dirname(statePath), "spec.md");
    try {
        (0, progress_1.readProgress)(stateForProgress, specPath);
        return false; // invariants hold — snapshot is internally consistent
    }
    catch (e) {
        if (e instanceof progress_1.SessionStateInvariantError) {
            return true; // drift: invariants violated
        }
        return false; // TypeError / other: trust canonical status
    }
}
// Set 030 Session 3: v2-compat helper used to pre-populate
// `completedSessions[]` on a v2 snapshot whose state file lacks the
// field. Returns the sorted, deduplicated list of session numbers the
// events ledger records as closed via `closeout_succeeded`. Empty
// list on any read/parse failure or when the file is absent.
function readClosedSessionsFromLedger(eventsPath) {
    if (!fs.existsSync(eventsPath))
        return [];
    let text;
    try {
        text = fs.readFileSync(eventsPath, "utf8");
    }
    catch {
        return [];
    }
    const seen = new Set();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line)
            continue;
        try {
            const event = JSON.parse(line);
            if (event.event_type === "closeout_succeeded" &&
                typeof event.session_number === "number" &&
                Number.isInteger(event.session_number) &&
                event.session_number > 0) {
                seen.add(event.session_number);
            }
        }
        catch {
            // skip malformed lines — append-only ledger may carry partial writes
        }
    }
    return [...seen].sort((a, b) => a - b);
}
// Set 022 Session 2: events-ledger fallback for `sessionsCompleted`.
// Returns the count of distinct `closeout_succeeded` session numbers
// in `session-events.jsonl`. Used as the v2-compat fallback for
// pre-Set-022 snapshots (and pre-Set-030 consumer-repo snapshots)
// whose state file lacks both v3 sessions[] and v2 completedSessions[]
// — without a snapshot signal, the ledger is the next-best source.
// Returns 0 on any read/parse failure or when the file is absent —
// the caller treats 0 as "no authoritative signal" and falls through
// to the next derivation step rather than asserting "0 sessions done."
function countDistinctCloseoutSessions(eventsPath) {
    if (!fs.existsSync(eventsPath))
        return 0;
    let text;
    try {
        text = fs.readFileSync(eventsPath, "utf8");
    }
    catch {
        return 0;
    }
    const seen = new Set();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line)
            continue;
        try {
            const event = JSON.parse(line);
            if (event.event_type === "closeout_succeeded" &&
                typeof event.session_number === "number") {
                seen.add(event.session_number);
            }
        }
        catch {
            // skip malformed lines — append-only ledger may carry partial writes
        }
    }
    return seen.size;
}
function parseSessionSetConfig(specPath) {
    const config = {
        requiresUAT: false,
        requiresE2E: false,
        uatScope: "none",
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
    const block = headingMatch ? headingMatch[1] : text;
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
        // Set 035: state-file-first cancellation detection. Set 8 originally
        // made `CANCELLED.md` presence the first gate; Set 033 Session 2
        // locked the H2 verdict that `session-state.json` is the single
        // source of truth for session-set state, and Set 035 extends that
        // verdict to the cancellation lifecycle. `readCancellationState`
        // consults the state file's `status` field first; the markdown
        // marker (`CANCELLED.md`) survives as an audit-trail artifact and
        // as the legacy-fallback signal when no usable state file is
        // present (the `"unknown"` branch below). The writer
        // (`cancelLifecycle.ts`) continues to keep both signals in lockstep
        // at every cancel/restore boundary, so the state file's `status`
        // is the authoritative read.
        let state;
        const cancellation = (0, cancelLifecycle_1.readCancellationState)(dir);
        if (cancellation === "cancelled") {
            state = "cancelled";
        }
        else if (cancellation === "unknown" && (0, cancelLifecycle_1.isCancelled)(dir)) {
            // Legacy fallback: no usable state file (v1 snapshot, hand-edited
            // shape, brand-new folder), but `CANCELLED.md` is present. Honor
            // the file-presence signal so a pre-035 set still buckets
            // correctly. A `console.warn` documents the fallback so a
            // diagnostic trail exists if a state-file write bug ever masks
            // a real cancellation behind a "complete" status.
            console.warn(`[dabblerSessionSets] Cancellation detected via legacy file-presence ` +
                `fallback for ${dir} — session-state.json is missing or unparseable. ` +
                `Consider running ensure_state_file to repair.`);
            state = "cancelled";
        }
        else {
            const status = (0, sessionState_1.readStatus)(dir);
            if (status === "complete") {
                // Defensive: a snapshot with status: "complete" that doesn't
                // actually satisfy the v3 invariants (e.g., sessions[] still
                // contains a not-started entry) is a stale mid-set close-out —
                // either a manual edit or a snapshot a consumer repo hasn't
                // refreshed yet. Downgrade so the set doesn't briefly show
                // Complete in the window between sessions.
                state = isMidSetComplete(statePath) ? "in-progress" : "complete";
            }
            else if (status === "in-progress") {
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
        // Set 030 Session 5: v2-detection signal for the migration CTA.
        // Default false (no nag on absent / unreadable state — the rest
        // of the read path already degrades gracefully). Flipped to true
        // only when the parsed state file is an object with either no
        // schemaVersion / a non-3 value, OR schemaVersion === 3 but
        // sessions[] is missing (a broken v3 shape that the bulk migrator
        // refuses to rewrite — see migrate_session_state.py's
        // ACTION_SKIPPED_MALFORMED case for the same heuristic).
        let needsMigration = false;
        const eventsPath = path.join(dir, "session-events.jsonl");
        // Activity log is a step log, not a count source. The activity-log
        // read is retained for two non-count signals: `totalSessions` (which
        // lives at the top level of activity-log.json — a different artifact
        // / different schema from session-state.json, outside D13's scope)
        // and the per-entry `dateTime` for the `lastTouched` display, which
        // is more granular than the state-file's session-boundary timestamps
        // while a session is mid-flight.
        if (fs.existsSync(activityPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(activityPath, "utf8"));
                if (typeof data.totalSessions === "number")
                    totalSessions = data.totalSessions; // noqa: D13 - activity-log.json carrier field, not session-state
                for (const e of data.entries ?? []) {
                    if (e.dateTime && (!lastTouched || e.dateTime > lastTouched))
                        lastTouched = e.dateTime;
                }
            }
            catch { /* ignore */ }
        }
        if (fs.existsSync(statePath)) {
            try {
                const sd = JSON.parse(fs.readFileSync(statePath, "utf8"));
                // Set 030 Session 5: v2 detection. The criteria match the
                // bulk migrator's "would migrate" rule so the badge and the
                // CLI agree set-for-set:
                //   - schemaVersion absent or not the literal 3: legacy v2.
                //   - schemaVersion === 3 but sessions[] missing or not an
                //     array: broken-v3 shape the migrator refuses to rewrite
                //     (operator must hand-repair) — still a needs-attention
                //     signal in the tree.
                // Files with schemaVersion > 3 are future-schema and treated
                // as already-current (the migrator refuses to downgrade them
                // for the same reason).
                if (sd && typeof sd === "object" && !Array.isArray(sd)) {
                    const sv = sd.schemaVersion;
                    if (sv === 3) {
                        if (!Array.isArray(sd.sessions)) {
                            needsMigration = true;
                        }
                    }
                    else if (typeof sv !== "number" || sv < 3) {
                        needsMigration = true;
                    }
                }
                // Set 030 Session 3: route progress reads through the v3
                // helper. `readProgress` branches v2/v3 internally; on a v3
                // file it reads sessions[] directly, and on a v2 file it
                // synthesizes from the legacy triple first. We trap invariant
                // violations and fall through to the v2-compat events-ledger
                // fallback below so a pre-Set-022 snapshot lacking
                // completedSessions[] still derives a sensible count.
                //
                // V2-compat pre-processing: if the snapshot is v2 (no sessions[])
                // and lacks a non-empty completedSessions[], pre-populate it
                // from the events ledger BEFORE synthesizing. This keeps the
                // ledger as a count signal for pre-Set-022 sets that have not
                // yet been healed by the next boundary write. Pure-v3 snapshots
                // skip this entirely — sessions[] is authoritative.
                let progressTotal = null;
                let progressCompleted = null;
                let progressCurrent = null;
                let stateForProgress = sd;
                if (sd.sessions === undefined &&
                    (!Array.isArray(sd.completedSessions) || // noqa: D13 - v2-compat ledger-merge for synthesizer input
                        (sd.completedSessions?.length ?? 0) === 0) // noqa: D13 - v2-compat ledger-merge for synthesizer input
                ) {
                    const ledgerSessions = readClosedSessionsFromLedger(eventsPath);
                    if (ledgerSessions.length > 0) {
                        stateForProgress = { ...sd, completedSessions: ledgerSessions };
                    }
                }
                try {
                    const view = (0, progress_1.readProgress)(stateForProgress, specPath);
                    progressTotal = view.totalSessions;
                    progressCompleted = [...view.completedSessions];
                    progressCurrent = view.currentSession;
                }
                catch (e) {
                    if (!(e instanceof progress_1.SessionStateInvariantError)) {
                        throw e;
                    }
                    // Invariant violation: state is drift-shaped. Leave the
                    // progress-derived signals null and fall through to the
                    // v2-compat heuristics below.
                }
                // State file is authoritative for `totalSessions` when the
                // v3 reader succeeded. The activity-log carries the field at
                // its top level (read above for legacy compatibility), but if
                // both are present the state-file value wins — a Set 022
                // Session 2 round-1 verifier finding caught the inverted
                // preference, which would silently mis-display the fraction
                // whenever a Lightweight-tier set hand-edited one file but
                // not the other.
                if (progressTotal !== null && progressTotal > 0) {
                    totalSessions = progressTotal;
                }
                const stateTouched = sd.completedAt || sd.startedAt;
                if (stateTouched && (!lastTouched || stateTouched > lastTouched))
                    lastTouched = stateTouched;
                liveSession = {
                    currentSession: progressCurrent,
                    status: sd.status ?? null,
                    orchestrator: sd.orchestrator ?? null,
                    startedAt: sd.startedAt ?? null,
                    completedAt: sd.completedAt ?? null,
                    verificationVerdict: sd.verificationVerdict ?? null,
                    forceClosed: sd.forceClosed ?? null,
                    completedSessions: progressCompleted,
                };
                // sessionsCompleted priority (highest first):
                //  1. v3 `readProgress` derivation — authoritative for any
                //     state file whose sessions[] satisfies the invariants
                //     (every Full-tier write since Set 030 Session 2; every
                //     Lightweight-tier file with proper sessions[] entries).
                //  2. Distinct `closeout_succeeded` session numbers in
                //     `session-events.jsonl` — v2-compat fallback for sets
                //     whose snapshot fails the invariants (pre-Set-022 sets
                //     that haven't been healed by their next boundary write
                //     yet, or consumer repos awaiting the bulk migrator).
                //  3. `state === "complete"` plus `totalSessions` — terminal
                //     state with no granular count signal (e.g., a
                //     Lightweight-tier set marked complete without sessions[]
                //     or completedSessions[]). Using the canonicalized
                //     `state` instead of raw `sd.status` keeps this in
                //     lockstep with the bucketing alias map; also naturally
                //     skips the mid-set-complete drift case where `state`
                //     is downgraded to in-progress.
                if (progressCompleted !== null) {
                    sessionsCompleted = progressCompleted.length;
                }
                else {
                    const ledgerCount = countDistinctCloseoutSessions(eventsPath);
                    if (ledgerCount > 0) {
                        sessionsCompleted = ledgerCount;
                    }
                    else if (state === "complete" && typeof totalSessions === "number") {
                        sessionsCompleted = totalSessions;
                    }
                }
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
            needsMigration,
        });
    }
    // Diagnostic: one-line summary in the dev console showing how the
    // extension bucketed each root. Useful for spotting UI/cache bugs vs.
    // state-derivation bugs without needing a breakpoint.
    if (sets.length > 0) {
        const counts = sets.reduce((acc, s) => {
            acc[s.state] = (acc[s.state] ?? 0) + 1;
            return acc;
        }, {});
        console.log(`[dabbler-ai-orchestration] readSessionSets(${path.basename(root)}): ` +
            `${sets.length} set(s) — ` +
            `complete=${counts.complete ?? 0}, ` +
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