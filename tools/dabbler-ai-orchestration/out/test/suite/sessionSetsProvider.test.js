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
const assert = __importStar(require("assert"));
const SessionSetsProvider_1 = require("../../providers/SessionSetsProvider");
function fakeLive(over = {}) {
    return {
        currentSession: null,
        status: null,
        orchestrator: null,
        startedAt: null,
        completedAt: null,
        verificationVerdict: null,
        forceClosed: null,
        completedSessions: null,
        ...over,
    };
}
function fakeSet(over = {}) {
    return {
        name: "x",
        dir: "/x",
        specPath: "/x/spec.md",
        activityPath: "/x/activity-log.json",
        changeLogPath: "/x/change-log.md",
        statePath: "/x/session-state.json",
        aiAssignmentPath: "/x/ai-assignment.md",
        uatChecklistPath: "/x/x-uat-checklist.json",
        state: "not-started",
        totalSessions: null,
        sessionsCompleted: 0,
        lastTouched: null,
        liveSession: null,
        config: {
            requiresUAT: false,
            requiresE2E: false,
            uatScope: "none",
        },
        uatSummary: null,
        root: "/x",
        ...over,
    };
}
suite("SessionSetsProvider — isCurrentSessionInFlight", () => {
    // Set 030 Session 3: the v3 in-flight predicate is a direct read of
    // the canonical `liveSession.currentSession` field, which fileSystem.ts
    // populates from `readProgress` as the single in-progress session's
    // number (or null when no session is in flight). The v2-era predicate
    // (`currentSession not in completedSessions[]`) is gone — the v3
    // reader resolves the ambiguity at source so the downstream check is
    // a simple null-check.
    test("returns false when liveSession is null", () => {
        assert.strictEqual((0, SessionSetsProvider_1.isCurrentSessionInFlight)(fakeSet({ liveSession: null })), false);
    });
    test("returns false when currentSession is null (between sessions or complete)", () => {
        // The v3 reader sets currentSession=null when no session is
        // in-progress. This is the canonical signal for "between sessions"
        // OR "set complete"; both render without the in-flight annotation.
        assert.strictEqual((0, SessionSetsProvider_1.isCurrentSessionInFlight)(fakeSet({
            liveSession: fakeLive({ currentSession: null, completedSessions: [1] }),
        })), false);
    });
    test("returns true when currentSession is a number (session in-progress)", () => {
        assert.strictEqual((0, SessionSetsProvider_1.isCurrentSessionInFlight)(fakeSet({
            liveSession: fakeLive({ currentSession: 2, completedSessions: [1] }),
        })), true);
    });
    test("returns true for session 1 of a fresh set", () => {
        // The endpoint the Set 022 spec called out specifically: "0/4
        // stuck displayed while session 1 is in flight." With v3, the
        // currentSession=1 signal directly drives the annotation — no
        // dependence on the legacy completedSessions[] array.
        assert.strictEqual((0, SessionSetsProvider_1.isCurrentSessionInFlight)(fakeSet({
            liveSession: fakeLive({ currentSession: 1, completedSessions: [] }),
        })), true);
    });
});
suite("SessionSetsProvider — progressText", () => {
    // Set 022 Session 2: the two new annotations make the lifecycle
    // visible at a glance without operator hover.
    test("renders 'N/total' for an in-progress row between sessions (no annotation)", () => {
        // Just-closed session 1; session 2 not yet started. Under v3,
        // between-sessions state means currentSession=null and
        // completedSessions=[1]. No in-flight annotation.
        const text = (0, SessionSetsProvider_1.progressText)(fakeSet({
            state: "in-progress",
            sessionsCompleted: 1,
            totalSessions: 4,
            liveSession: fakeLive({ currentSession: null, completedSessions: [1], status: "in-progress" }),
        }));
        assert.strictEqual(text, "1/4");
    });
    test("appends 'session N in flight' annotation when currentSession not in completedSessions[]", () => {
        const text = (0, SessionSetsProvider_1.progressText)(fakeSet({
            state: "in-progress",
            sessionsCompleted: 0,
            totalSessions: 4,
            liveSession: fakeLive({ currentSession: 1, completedSessions: [], status: "in-progress" }),
        }));
        assert.strictEqual(text, "0/4 · session 1 in flight");
    });
    test("appends 'session N in flight' on a mid-set in-flight row", () => {
        // Sessions 1-2 closed, session 3 in flight.
        const text = (0, SessionSetsProvider_1.progressText)(fakeSet({
            state: "in-progress",
            sessionsCompleted: 2,
            totalSessions: 4,
            liveSession: fakeLive({ currentSession: 3, completedSessions: [1, 2], status: "in-progress" }),
        }));
        assert.strictEqual(text, "2/4 · session 3 in flight");
    });
    test("appends 'Complete' annotation on a complete row", () => {
        const text = (0, SessionSetsProvider_1.progressText)(fakeSet({
            state: "complete",
            sessionsCompleted: 4,
            totalSessions: 4,
            liveSession: fakeLive({
                currentSession: null,
                completedSessions: [1, 2, 3, 4],
                status: "complete",
            }),
        }));
        assert.strictEqual(text, "4/4 Complete");
    });
    test("not-started rows render as '0/N' with no annotation", () => {
        const text = (0, SessionSetsProvider_1.progressText)(fakeSet({
            state: "not-started",
            sessionsCompleted: 0,
            totalSessions: 4,
            liveSession: null,
        }));
        assert.strictEqual(text, "0/4");
    });
    test("renders empty string when totalSessions is missing and no progress", () => {
        const text = (0, SessionSetsProvider_1.progressText)(fakeSet({
            state: "not-started",
            sessionsCompleted: 0,
            totalSessions: null,
            liveSession: null,
        }));
        assert.strictEqual(text, "");
    });
    test("v2-shape liveSession (currentSession set, completedSessions null) still renders the annotation", () => {
        // Set 030 Session 3: under v3, currentSession is strictly the
        // in-progress session's number, so a non-null value unambiguously
        // means "in flight" regardless of whether completedSessions[] was
        // populated. This replaces the v2-era "no array → no annotation"
        // guard, which existed only because v2's currentSession could
        // also mean "most recently closed."
        const text = (0, SessionSetsProvider_1.progressText)(fakeSet({
            state: "in-progress",
            sessionsCompleted: 1,
            totalSessions: 3,
            liveSession: fakeLive({
                currentSession: 2,
                completedSessions: null,
                status: "in-progress",
            }),
        }));
        assert.strictEqual(text, "1/3 · session 2 in flight");
    });
});
//# sourceMappingURL=sessionSetsProvider.test.js.map