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
const sessionSetsProvider_1 = require("../../providers/sessionSetsProvider");
// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the [FORCED]
// description badge surfaces sets that closed via ``close_session
// --force`` / ``mark_session_complete(force=True)``. It reads the
// ``forceClosed`` flag written by ``_flip_state_to_closed(forced=True)``
// in ``ai_router/session_state.py``. The flag is absent or false on
// every snapshot written by a normal close-out.
function fakeLive(over = {}) {
    return {
        currentSession: 1,
        status: "complete",
        orchestrator: null,
        startedAt: null,
        completedAt: null,
        verificationVerdict: "VERIFIED",
        forceClosed: null,
        completedSessions: null,
        ...over,
    };
}
function fakeSet(liveSession) {
    return {
        name: "x",
        dir: "/x",
        specPath: "/x/spec.md",
        activityPath: "/x/activity-log.json",
        changeLogPath: "/x/change-log.md",
        statePath: "/x/session-state.json",
        aiAssignmentPath: "/x/ai-assignment.md",
        uatChecklistPath: "/x/x-uat-checklist.json",
        state: "complete",
        totalSessions: null,
        sessionsCompleted: 0,
        lastTouched: null,
        liveSession,
        config: {
            requiresUAT: false,
            requiresE2E: false,
            uatScope: "none",
        },
        uatSummary: null,
        root: "/x",
        needsMigration: false,
    };
}
suite("SessionSetsProvider — forceClosedBadge", () => {
    test("renders [FORCED] when forceClosed is true", () => {
        assert.strictEqual((0, sessionSetsProvider_1.forceClosedBadge)(fakeSet(fakeLive({ forceClosed: true }))), "[FORCED]");
    });
    test("renders nothing when forceClosed is false", () => {
        assert.strictEqual((0, sessionSetsProvider_1.forceClosedBadge)(fakeSet(fakeLive({ forceClosed: false }))), "");
    });
    test("renders nothing when forceClosed is null (legacy snapshot)", () => {
        // Sets closed before Set 9 Session 3 don't carry the field at all;
        // fileSystem.ts maps the missing field to null. The badge must
        // remain hidden so retroactively triaging a legacy set does not
        // light up the explorer with false [FORCED] markers.
        assert.strictEqual((0, sessionSetsProvider_1.forceClosedBadge)(fakeSet(fakeLive({ forceClosed: null }))), "");
    });
    test("renders nothing when liveSession itself is null", () => {
        // not-started / cancelled sets have liveSession=null. The badge
        // is meaningful only on closed sets, so the null guard short-
        // circuits cleanly to the empty string rather than reading
        // through null.
        assert.strictEqual((0, sessionSetsProvider_1.forceClosedBadge)(fakeSet(null)), "");
    });
});
//# sourceMappingURL=forceClosedBadge.test.js.map