"use strict";
// Coverage for the in-extension v2 → v3 migrator. Mirrors the test
// shape of progress.test.ts (the Python suite under
// ai_router/tests/test_migrate_session_state.py is the wider authority;
// these tests exercise the TS port that the extension calls directly
// post-bug-fix, replacing the previous Python subprocess path).
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
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const migrateSessionState_1 = require("../../utils/migrateSessionState");
const progress_1 = require("../../utils/progress");
function mkTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "migrate-test-"));
}
function rmTmpDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch {
        // ignore
    }
}
function writeState(setDir, state) {
    fs.writeFileSync(path.join(setDir, "session-state.json"), JSON.stringify(state, null, 2), "utf-8");
}
function writeSpec(setDir, body) {
    fs.writeFileSync(path.join(setDir, "spec.md"), body, "utf-8");
}
function readState(setDir) {
    return JSON.parse(fs.readFileSync(path.join(setDir, "session-state.json"), "utf-8"));
}
suite("migrateOneSet", () => {
    test("regex strategy: v2 in-progress set produces v3 sessions[] with spec titles", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                sessionSetName: "test-set",
                totalSessions: 3,
                currentSession: 2,
                completedSessions: [1],
                status: "in-progress",
                lifecycleState: "work_in_progress",
            });
            writeSpec(tmp, "# Spec\n\n" +
                "### Session 1 of 3: Schema delta\n\n" +
                "Notes.\n\n" +
                "### Session 2 of 3: Reader migration\n\n" +
                "More notes.\n\n" +
                "### Session 3 of 3: Close-out and release\n");
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "migrated");
            const out = readState(tmp);
            assert.strictEqual(out.schemaVersion, progress_1.SCHEMA_VERSION_V3);
            const sessions = out.sessions;
            assert.strictEqual(sessions.length, 3);
            assert.deepStrictEqual(sessions[0], {
                number: 1,
                title: "Schema delta",
                status: "complete",
            });
            assert.deepStrictEqual(sessions[1], {
                number: 2,
                title: "Reader migration",
                status: "in-progress",
            });
            assert.deepStrictEqual(sessions[2], {
                number: 3,
                title: "Close-out and release",
                status: "not-started",
            });
            // Legacy triple should be derived from sessions[].
            assert.strictEqual(out.currentSession, 2);
            assert.strictEqual(out.totalSessions, 3);
            assert.deepStrictEqual(out.completedSessions, [1]);
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("generic strategy ignores spec.md and uses Session N titles", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                sessionSetName: "test-set",
                totalSessions: 2,
                currentSession: 1,
                completedSessions: [],
                status: "in-progress",
                lifecycleState: "work_in_progress",
            });
            writeSpec(tmp, "### Session 1 of 2: Schema delta\n");
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp, { strategy: "generic" });
            assert.strictEqual(r.action, "migrated");
            const out = readState(tmp);
            const sessions = out.sessions;
            assert.strictEqual(sessions[0].title, "Session 1");
            assert.strictEqual(sessions[1].title, "Session 2");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("closed-signal force-promotes all sessions when status=complete + currentSession >= legacy total", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                sessionSetName: "test-set",
                totalSessions: 3,
                currentSession: 3,
                completedSessions: [],
                status: "complete",
                lifecycleState: null,
            });
            writeSpec(tmp, "### Session 1 of 3: A\n### Session 2 of 3: B\n### Session 3 of 3: C\n");
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "migrated", r.reason);
            const out = readState(tmp);
            const sessions = out.sessions;
            // All three sessions force-promoted to complete per the
            // closed-signal disjunct (currentSession >= legacy total).
            for (const s of sessions) {
                assert.strictEqual(s.status, "complete");
            }
            assert.strictEqual(out.lifecycleState, "closed");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("skipped-v3 when sessions[] already present", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                schemaVersion: progress_1.SCHEMA_VERSION_V3,
                sessionSetName: "test-set",
                sessions: [
                    { number: 1, title: "x", status: "complete" },
                    { number: 2, title: "y", status: "in-progress" },
                ],
                status: "in-progress",
                lifecycleState: "work_in_progress",
            });
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "skipped-v3");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("skipped-future-schema when schemaVersion > 3", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                schemaVersion: 4,
                sessionSetName: "test-set",
            });
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "skipped-future-schema");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("skipped-malformed for self-identified v3 but missing sessions[]", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                schemaVersion: progress_1.SCHEMA_VERSION_V3,
                sessionSetName: "test-set",
            });
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "skipped-malformed");
            assert.ok(r.reason.includes("sessions[]"));
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("skipped-no-state when session-state.json is absent", () => {
        const tmp = mkTmpDir();
        try {
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "skipped-no-state");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("skipped-malformed for invalid JSON top-level", () => {
        const tmp = mkTmpDir();
        try {
            fs.writeFileSync(path.join(tmp, "session-state.json"), "{not valid json", "utf-8");
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "skipped-malformed");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("would-violate when nothing identifies a session count", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                sessionSetName: "test-set",
                status: "not-started",
                // no totalSessions, currentSession, completedSessions, no spec.md
            });
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "would-violate");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("dryRun=true validates but does NOT write to disk", () => {
        const tmp = mkTmpDir();
        try {
            const before = {
                sessionSetName: "test-set",
                totalSessions: 2,
                currentSession: null,
                completedSessions: [],
                status: "not-started",
                lifecycleState: null,
            };
            writeState(tmp, before);
            writeSpec(tmp, "### Session 1 of 2: A\n### Session 2 of 2: B\n");
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp, { dryRun: true });
            assert.strictEqual(r.action, "migrated");
            // On-disk file unchanged: no schemaVersion / sessions[] keys.
            const onDisk = readState(tmp);
            assert.strictEqual(onDisk.schemaVersion, undefined);
            assert.strictEqual(onDisk.sessions, undefined);
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("idempotent: a migrated file's second migration returns skipped-v3", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                sessionSetName: "test-set",
                totalSessions: 1,
                currentSession: null,
                completedSessions: [],
                status: "not-started",
                lifecycleState: null,
            });
            writeSpec(tmp, "### Session 1 of 1: Only\n");
            const r1 = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r1.action, "migrated");
            const r2 = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r2.action, "skipped-v3");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
    test("status alias 'completed' is canonicalized to 'complete' on the way out", () => {
        const tmp = mkTmpDir();
        try {
            writeState(tmp, {
                sessionSetName: "test-set",
                totalSessions: 1,
                currentSession: 1,
                completedSessions: [1],
                status: "completed", // alias
                lifecycleState: "closed",
            });
            writeSpec(tmp, "### Session 1 of 1: Only\n");
            const r = (0, migrateSessionState_1.migrateOneSet)(tmp);
            assert.strictEqual(r.action, "migrated", r.reason);
            const out = readState(tmp);
            assert.strictEqual(out.status, "complete");
        }
        finally {
            rmTmpDir(tmp);
        }
    });
});
//# sourceMappingURL=migrateSessionState.test.js.map