"use strict";
// Set 030 Session 1 — TS mirror of ai_router/tests/test_progress.py.
//
// Covers v3 happy paths, invariant violations, v2 read synthesis, and
// title extraction. Test groupings mirror the Python tests so a future
// reader can compare them side-by-side and spot drift quickly.
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
const progress_1 = require("../../utils/progress");
function v3State(sessions, topStatus, lifecycleState = null) {
    return {
        schemaVersion: progress_1.SCHEMA_VERSION_V3,
        sessionSetName: "test-set",
        status: topStatus,
        lifecycleState,
        sessions,
    };
}
function sess(number, status, title) {
    return { number, title: title ?? `Session ${number}`, status };
}
function mkTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "progress-test-"));
}
function rmTmpDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch {
        // ignore
    }
}
function expectInvariantError(fn, rule) {
    try {
        fn();
        assert.fail(`expected SessionStateInvariantError(rule=${rule}), got no throw`);
    }
    catch (e) {
        if (!(e instanceof progress_1.SessionStateInvariantError)) {
            throw e;
        }
        assert.strictEqual(e.rule, rule, `expected rule=${rule}, got rule=${e.rule} (message: ${e.message})`);
    }
}
suite("progress — getProgress happy paths", () => {
    test("fresh set: all not-started", () => {
        const view = (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_NOT_STARTED), sess(2, progress_1.SESSION_STATUS_NOT_STARTED)], progress_1.SESSION_STATUS_NOT_STARTED));
        assert.strictEqual(view.totalSessions, 2);
        assert.deepStrictEqual(view.completedSessions, []);
        assert.strictEqual(view.currentSession, null);
        assert.strictEqual(view.nextSession, 1);
        assert.strictEqual(view.isBetweenSessions, false);
    });
    test("in-flight session 2 of 4", () => {
        const view = (0, progress_1.getProgress)(v3State([
            sess(1, progress_1.SESSION_STATUS_COMPLETE),
            sess(2, progress_1.SESSION_STATUS_IN_PROGRESS),
            sess(3, progress_1.SESSION_STATUS_NOT_STARTED),
            sess(4, progress_1.SESSION_STATUS_NOT_STARTED),
        ], progress_1.SESSION_STATUS_IN_PROGRESS, progress_1.LIFECYCLE_STATE_WORK_IN_PROGRESS));
        assert.strictEqual(view.totalSessions, 4);
        assert.deepStrictEqual(view.completedSessions, [1]);
        assert.strictEqual(view.currentSession, 2);
        assert.strictEqual(view.nextSession, 3);
        assert.strictEqual(view.isBetweenSessions, false);
    });
    test("between sessions", () => {
        const view = (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_COMPLETE), sess(2, progress_1.SESSION_STATUS_NOT_STARTED)], progress_1.SESSION_STATUS_IN_PROGRESS, progress_1.LIFECYCLE_STATE_WORK_IN_PROGRESS));
        assert.strictEqual(view.currentSession, null);
        assert.deepStrictEqual(view.completedSessions, [1]);
        assert.strictEqual(view.nextSession, 2);
        assert.strictEqual(view.isBetweenSessions, true);
    });
    test("all complete", () => {
        const view = (0, progress_1.getProgress)(v3State([
            sess(1, progress_1.SESSION_STATUS_COMPLETE),
            sess(2, progress_1.SESSION_STATUS_COMPLETE),
            sess(3, progress_1.SESSION_STATUS_COMPLETE),
        ], progress_1.SESSION_STATUS_COMPLETE, progress_1.LIFECYCLE_STATE_CLOSED));
        assert.strictEqual(view.totalSessions, 3);
        assert.deepStrictEqual(view.completedSessions, [1, 2, 3]);
        assert.strictEqual(view.currentSession, null);
        assert.strictEqual(view.nextSession, null);
        assert.strictEqual(view.isBetweenSessions, false);
    });
    test("cancelled set", () => {
        const view = (0, progress_1.getProgress)(v3State([
            sess(1, progress_1.SESSION_STATUS_COMPLETE),
            sess(2, progress_1.SESSION_STATUS_NOT_STARTED),
            sess(3, progress_1.SESSION_STATUS_NOT_STARTED),
        ], progress_1.SESSION_STATUS_CANCELLED, progress_1.LIFECYCLE_STATE_CLOSED));
        assert.strictEqual(view.totalSessions, 3);
        assert.deepStrictEqual(view.completedSessions, [1]);
        assert.strictEqual(view.currentSession, null);
    });
});
suite("progress — invariant violations", () => {
    test("rule 1: missing sessions[]", () => {
        expectInvariantError(() => (0, progress_1.getProgress)({
            schemaVersion: 3,
            sessionSetName: "x",
            status: "not-started",
        }), 1);
    });
    test("rule 1: empty sessions[]", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([], "not-started")), 1);
    });
    test("rule 2: duplicate numbers", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_NOT_STARTED), sess(1, progress_1.SESSION_STATUS_NOT_STARTED)], "not-started")), 2);
    });
    test("rule 2: non-sorted numbers", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(2, progress_1.SESSION_STATUS_NOT_STARTED), sess(1, progress_1.SESSION_STATUS_NOT_STARTED)], "not-started")), 2);
    });
    test("rule 2: skipped numbers [1, 3] rejected", () => {
        // Spec D12: strict sequential invariant. Earlier draft accepted
        // [1, 3] silently; tightened to contiguous-from-1 after Round A.
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_NOT_STARTED), sess(3, progress_1.SESSION_STATUS_NOT_STARTED)], "not-started")), 2);
    });
    test("rule 2: numbers must start at 1", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(2, progress_1.SESSION_STATUS_NOT_STARTED), sess(3, progress_1.SESSION_STATUS_NOT_STARTED)], "not-started")), 2);
    });
    test("rule 2: session-level cancelled rejected", () => {
        // Per-session 'cancelled' is reserved for a future schema.
        // Top-level 'cancelled' is still accepted (see cancelled set test).
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_CANCELLED)], "in-progress")), 2);
    });
    test("rule 2: unknown top-level status reports rule 2 (not rule 5)", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_NOT_STARTED)], "bogus-top-status")), 2);
    });
    test("rule 2: zero session number", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(0, progress_1.SESSION_STATUS_NOT_STARTED)], "not-started")), 2);
    });
    test("rule 2: unknown status", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, "bogus-status")], "not-started")), 2);
    });
    test("rule 3: multiple in-progress", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([
            sess(1, progress_1.SESSION_STATUS_IN_PROGRESS),
            sess(2, progress_1.SESSION_STATUS_IN_PROGRESS),
        ], "in-progress")), 3);
    });
    test("rule 4: complete after not-started", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_NOT_STARTED), sess(2, progress_1.SESSION_STATUS_COMPLETE)], "in-progress")), 4);
    });
    test("rule 4: complete after in-progress", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_IN_PROGRESS), sess(2, progress_1.SESSION_STATUS_COMPLETE)], "in-progress")), 4);
    });
    test("rule 5: not-started top with started session", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([
            sess(1, progress_1.SESSION_STATUS_IN_PROGRESS),
            sess(2, progress_1.SESSION_STATUS_NOT_STARTED),
        ], "not-started")), 5);
    });
    test("rule 6: in-progress top with no in-flight and no complete", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_NOT_STARTED)], "in-progress")), 6);
    });
    test("rule 7: complete top with not-started session", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([
            sess(1, progress_1.SESSION_STATUS_COMPLETE),
            sess(2, progress_1.SESSION_STATUS_NOT_STARTED),
        ], "complete")), 7);
    });
    test("rule 8: closed lifecycle with in-progress status", () => {
        expectInvariantError(() => (0, progress_1.getProgress)(v3State([sess(1, progress_1.SESSION_STATUS_IN_PROGRESS)], "in-progress", progress_1.LIFECYCLE_STATE_CLOSED)), 8);
    });
    test("rule 8: fires even when top status is null", () => {
        // Earlier draft skipped rules 5-8 when topStatus was null, so
        // lifecycleState='closed' with no top status silently passed.
        // Rule 8 now fires regardless.
        const sessions = [
            { number: 1, title: "a", status: progress_1.SESSION_STATUS_NOT_STARTED },
        ];
        try {
            (0, progress_1.validateInvariants)(sessions, null, progress_1.LIFECYCLE_STATE_CLOSED);
            assert.fail("expected SessionStateInvariantError(rule=8), got no throw");
        }
        catch (e) {
            if (!(e instanceof progress_1.SessionStateInvariantError))
                throw e;
            assert.strictEqual(e.rule, 8);
        }
    });
});
const SPEC_BODY = [
    "# Some session set",
    "",
    "## Sessions",
    "",
    "### Session 1 of 3: First session title",
    "content here",
    "",
    "### Session 2 of 3: Middle session — has unicode dashes",
    "more content",
    "",
    "### Session 3 of 3: Final session",
    "",
].join("\n");
suite("progress — synthesizeV3FromV2", () => {
    let tmp;
    setup(() => {
        tmp = mkTmpDir();
    });
    teardown(() => rmTmpDir(tmp));
    function specPath() {
        const p = path.join(tmp, "spec.md");
        fs.writeFileSync(p, SPEC_BODY, "utf-8");
        return p;
    }
    test("v2 not-started", () => {
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: null,
            totalSessions: 3,
            status: "not-started",
            lifecycleState: null,
            completedSessions: [],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        assert.strictEqual(out.schemaVersion, progress_1.SCHEMA_VERSION_V3);
        assert.strictEqual(out.sessions.length, 3);
        for (const s of out.sessions) {
            assert.strictEqual(s.status, progress_1.SESSION_STATUS_NOT_STARTED);
        }
        assert.strictEqual(out.sessions[0].title, "First session title");
        assert.ok(out.sessions[1].title.includes("unicode dashes"));
        const view = (0, progress_1.getProgress)(out);
        assert.strictEqual(view.nextSession, 1);
    });
    test("v2 in-flight", () => {
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: 2,
            totalSessions: 3,
            status: "in-progress",
            lifecycleState: "work_in_progress",
            completedSessions: [1],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        assert.strictEqual(out.sessions[0].status, progress_1.SESSION_STATUS_COMPLETE);
        assert.strictEqual(out.sessions[1].status, progress_1.SESSION_STATUS_IN_PROGRESS);
        assert.strictEqual(out.sessions[2].status, progress_1.SESSION_STATUS_NOT_STARTED);
        const view = (0, progress_1.getProgress)(out);
        assert.strictEqual(view.currentSession, 2);
        assert.deepStrictEqual(view.completedSessions, [1]);
    });
    test("v2 between sessions", () => {
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: 1,
            totalSessions: 3,
            status: "in-progress",
            lifecycleState: "work_in_progress",
            completedSessions: [1],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        assert.strictEqual(out.sessions[0].status, progress_1.SESSION_STATUS_COMPLETE);
        assert.strictEqual(out.sessions[1].status, progress_1.SESSION_STATUS_NOT_STARTED);
        const view = (0, progress_1.getProgress)(out);
        assert.strictEqual(view.isBetweenSessions, true);
        assert.strictEqual(view.currentSession, null);
        assert.strictEqual(view.nextSession, 2);
    });
    test("v2 complete top-level with consistent completedSessions passes", () => {
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: 3,
            totalSessions: 3,
            status: "complete",
            lifecycleState: "closed",
            completedSessions: [1, 2, 3],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        for (const s of out.sessions) {
            assert.strictEqual(s.status, progress_1.SESSION_STATUS_COMPLETE);
        }
        const view = (0, progress_1.getProgress)(out);
        assert.deepStrictEqual(view.completedSessions, [1, 2, 3]);
    });
    test("v2 complete top-level with missing completedSessions fails loud", () => {
        // Per Round-A verifier fix: synthesizer no longer force-promotes
        // every session when top-level is 'complete'. The contradiction
        // surfaces via rule 7 on the next getProgress() call.
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: 3,
            totalSessions: 3,
            status: "complete",
            lifecycleState: "closed",
            completedSessions: [1, 2], // missing 3
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        // Synthesizer reports the v2 state faithfully (session 3 stays
        // not-started); validator rejects the contradiction.
        assert.strictEqual(out.sessions[0].status, progress_1.SESSION_STATUS_COMPLETE);
        assert.strictEqual(out.sessions[1].status, progress_1.SESSION_STATUS_COMPLETE);
        assert.strictEqual(out.sessions[2].status, progress_1.SESSION_STATUS_NOT_STARTED);
        expectInvariantError(() => (0, progress_1.getProgress)(out), 7);
    });
    test("v2 currentSession=true does not escalate session 1", () => {
        // JavaScript's typeof true is "boolean", not "number", so this is
        // already filtered by the typeof check. But the strict-int helper
        // double-guards (Number.isInteger(true) returns false anyway).
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: true,
            totalSessions: 2,
            status: "in-progress",
            lifecycleState: "work_in_progress",
            completedSessions: [],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        assert.strictEqual(out.sessions[0].status, progress_1.SESSION_STATUS_NOT_STARTED);
        assert.strictEqual(out.sessions[1].status, progress_1.SESSION_STATUS_NOT_STARTED);
    });
    test("v2 completedSessions contains float 1.0 — not treated as int", () => {
        // JavaScript: Number.isInteger(1.0) is TRUE (no float/int
        // distinction at runtime), so 1.0 would otherwise be accepted.
        // The strict-int filter pre-checks typeof !== boolean and
        // isInteger(), so 1.0 passes — this is unavoidable in JS. The
        // test documents the behavior so a future tightening (e.g.,
        // rejecting if Number.isSafeInteger and source had decimals) has
        // an anchor.
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: null,
            totalSessions: 1,
            status: "in-progress",
            lifecycleState: "work_in_progress",
            completedSessions: [1.0],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        // 1.0 IS Number.isInteger() in JS — escalates to complete. This
        // is the known JS/Python divergence; documented, not a regression.
        assert.strictEqual(out.sessions[0].status, progress_1.SESSION_STATUS_COMPLETE);
    });
    test("v2 alias 'done' canonicalized to 'complete'", () => {
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: 3,
            totalSessions: 3,
            status: "done",
            lifecycleState: "closed",
            completedSessions: [1, 2, 3],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        assert.strictEqual(out.status, progress_1.SESSION_STATUS_COMPLETE);
        const view = (0, progress_1.getProgress)(out);
        assert.strictEqual(view.totalSessions, 3);
    });
    test("v2 missing spec.md falls back to generic titles", () => {
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "no-spec-set",
            currentSession: 1,
            totalSessions: 2,
            status: "in-progress",
            lifecycleState: "work_in_progress",
            completedSessions: [],
        };
        const out = (0, progress_1.synthesizeV3FromV2)(v2, path.join(tmp, "missing-spec.md"));
        assert.strictEqual(out.sessions[0].title, "Session 1");
        assert.strictEqual(out.sessions[1].title, "Session 2");
    });
    test("v2 synthesis does not mutate the input state", () => {
        const v2 = {
            schemaVersion: 2,
            sessionSetName: "test-set",
            currentSession: 1,
            totalSessions: 1,
            status: "in-progress",
            lifecycleState: "work_in_progress",
            completedSessions: [],
        };
        const original = JSON.parse(JSON.stringify(v2));
        (0, progress_1.synthesizeV3FromV2)(v2, specPath());
        assert.deepStrictEqual(v2, original);
    });
});
suite("progress — extractSessionTitlesFromSpec", () => {
    let tmp;
    setup(() => {
        tmp = mkTmpDir();
    });
    teardown(() => rmTmpDir(tmp));
    test("parses headings", () => {
        const p = path.join(tmp, "spec.md");
        fs.writeFileSync(p, SPEC_BODY, "utf-8");
        const titles = (0, progress_1.extractSessionTitlesFromSpec)(p);
        assert.deepStrictEqual(titles, [
            { number: 1, title: "First session title" },
            { number: 2, title: "Middle session — has unicode dashes" },
            { number: 3, title: "Final session" },
        ]);
    });
    test("missing file returns empty", () => {
        const titles = (0, progress_1.extractSessionTitlesFromSpec)(path.join(tmp, "no-such.md"));
        assert.deepStrictEqual(titles, []);
    });
    test("no headings returns empty", () => {
        const p = path.join(tmp, "spec.md");
        fs.writeFileSync(p, "# Title only\n\nNo session headings.\n", "utf-8");
        assert.deepStrictEqual((0, progress_1.extractSessionTitlesFromSpec)(p), []);
    });
    test("handles heading without 'of N' segment", () => {
        const p = path.join(tmp, "spec.md");
        fs.writeFileSync(p, "### Session 1: Just a title\n", "utf-8");
        assert.deepStrictEqual((0, progress_1.extractSessionTitlesFromSpec)(p), [
            { number: 1, title: "Just a title" },
        ]);
    });
});
suite("progress — canonicalizeStatus", () => {
    const cases = [
        ["complete", "complete"],
        ["completed", "complete"],
        ["done", "complete"],
        ["in-progress", "in-progress"],
        ["not-started", "not-started"],
        ["cancelled", "cancelled"],
        [null, null],
        ["unknown-future-value", "unknown-future-value"],
    ];
    for (const [raw, canon] of cases) {
        test(`maps ${JSON.stringify(raw)} → ${JSON.stringify(canon)}`, () => {
            assert.strictEqual((0, progress_1.canonicalizeStatus)(raw), canon);
        });
    }
});
suite("progress — validateInvariants directly", () => {
    test("accepts sessions-only when top status is null", () => {
        const sessions = [
            { number: 1, title: "a", status: progress_1.SESSION_STATUS_COMPLETE },
            { number: 2, title: "b", status: progress_1.SESSION_STATUS_IN_PROGRESS },
            { number: 3, title: "c", status: progress_1.SESSION_STATUS_NOT_STARTED },
        ];
        // top_status=null skips rules 5-8; only structural rules 1-4 apply
        (0, progress_1.validateInvariants)(sessions, null, null);
    });
});
suite("progress — readProgress (Set 030 Session 3)", () => {
    // readProgress is the application-reader entry point per D13.
    // Branches v2 vs v3 internally so callers in the tree provider,
    // count derivation, and badge logic never reach into the legacy
    // currentSession / totalSessions / completedSessions triple.
    test("v3 state dispatches to getProgress", () => {
        const dir = mkTmpDir();
        try {
            const state = v3State([
                sess(1, progress_1.SESSION_STATUS_COMPLETE),
                sess(2, progress_1.SESSION_STATUS_IN_PROGRESS),
                sess(3, progress_1.SESSION_STATUS_NOT_STARTED),
            ], "in-progress", progress_1.LIFECYCLE_STATE_WORK_IN_PROGRESS);
            const view = (0, progress_1.readProgress)(state, path.join(dir, "absent-spec.md"));
            assert.strictEqual(view.totalSessions, 3);
            assert.deepStrictEqual(view.completedSessions, [1]);
            assert.strictEqual(view.currentSession, 2);
            assert.strictEqual(view.nextSession, 3);
        }
        finally {
            rmTmpDir(dir);
        }
    });
    test("v2 state synthesizes then validates", () => {
        const dir = mkTmpDir();
        try {
            const specPath = path.join(dir, "spec.md");
            fs.writeFileSync(specPath, "### Session 1 of 3: Alpha\n" +
                "### Session 2 of 3: Beta\n" +
                "### Session 3 of 3: Gamma\n", "utf8");
            const v2 = {
                schemaVersion: 2,
                sessionSetName: "legacy",
                status: "in-progress",
                lifecycleState: "work_in_progress",
                currentSession: 2,
                totalSessions: 3,
                completedSessions: [1],
            };
            const view = (0, progress_1.readProgress)(v2, specPath);
            assert.strictEqual(view.totalSessions, 3);
            assert.deepStrictEqual(view.completedSessions, [1]);
            assert.strictEqual(view.currentSession, 2);
            assert.strictEqual(view.sessions[0].title, "Alpha");
            assert.strictEqual(view.sessions[1].title, "Beta");
        }
        finally {
            rmTmpDir(dir);
        }
    });
    test("v3 state ignores spec.md path (file may be missing)", () => {
        const dir = mkTmpDir();
        try {
            const state = v3State([sess(1, progress_1.SESSION_STATUS_COMPLETE), sess(2, progress_1.SESSION_STATUS_COMPLETE)], "complete", progress_1.LIFECYCLE_STATE_CLOSED);
            const view = (0, progress_1.readProgress)(state, path.join(dir, "does-not-exist.md"));
            assert.strictEqual(view.totalSessions, 2);
            assert.deepStrictEqual(view.completedSessions, [1, 2]);
        }
        finally {
            rmTmpDir(dir);
        }
    });
    test("v2 invariant violation raises (rule 7)", () => {
        const dir = mkTmpDir();
        try {
            // v2 with status=complete but completedSessions=[] synthesizes
            // to all-not-started; rule 7 fail-louds on the contradiction.
            const v2 = {
                schemaVersion: 2,
                status: "complete",
                currentSession: null,
                totalSessions: 3,
                completedSessions: [],
            };
            expectInvariantError(() => (0, progress_1.readProgress)(v2, path.join(dir, "no-spec.md")), 7);
        }
        finally {
            rmTmpDir(dir);
        }
    });
    test("null state raises TypeError", () => {
        assert.throws(() => (0, progress_1.readProgress)(null, "/tmp/spec.md"), TypeError);
    });
});
//# sourceMappingURL=progress.test.js.map