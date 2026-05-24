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
const vscode = __importStar(require("vscode"));
const checkOutOrchestrator_1 = require("../../commands/checkOutOrchestrator");
const ReadOnlyIntentService_1 = require("../../providers/ReadOnlyIntentService");
// Set 036 Session 4 — Round A Minor fix regression test.
//
// The intent-clear used to fire inside the confirm prompt itself,
// so an operator who picked "Clear & Check Out" but then cancelled
// the later force-override modal (or saw the write fail) would have
// silently lost their read-only protection. The two helpers are now
// split: confirmRevertReadOnlyIntent() returns the operator decision
// without mutating state; commitClearReadOnlyIntent() is invoked
// only after dispatchCheckOut() succeeds.
const FIXTURE_SET = {
    slug: "099-fixture",
    setDir: "/repo/docs/session-sets/099-fixture",
    state: {
        status: "in-progress",
        currentSession: 1,
        orchestrator: null,
    },
};
suite("Read-only intent timing (Round A Minor regression)", () => {
    let originalShowWarning;
    teardown(() => {
        (0, ReadOnlyIntentService_1.resetReadOnlyIntentServiceForTests)();
        if (originalShowWarning) {
            vscode.window.showWarningMessage = originalShowWarning;
        }
    });
    function stubWarning(answer) {
        originalShowWarning = vscode.window.showWarningMessage;
        vscode.window.showWarningMessage = (..._args) => Promise.resolve(answer);
    }
    test("no read-only intent => confirm returns true without prompting", async () => {
        let called = 0;
        originalShowWarning = vscode.window.showWarningMessage;
        vscode.window.showWarningMessage = (..._args) => {
            called += 1;
            return Promise.resolve("Clear & Check Out");
        };
        const proceed = await (0, checkOutOrchestrator_1.confirmRevertReadOnlyIntent)(FIXTURE_SET);
        assert.strictEqual(proceed, true);
        assert.strictEqual(called, 0, "no warning should fire when no intent is set");
    });
    test("intent set + operator clicks 'Clear & Check Out' => confirm returns true but intent is NOT yet cleared", async () => {
        (0, ReadOnlyIntentService_1.getReadOnlyIntentService)().setReadOnly(FIXTURE_SET.setDir);
        stubWarning("Clear & Check Out");
        const proceed = await (0, checkOutOrchestrator_1.confirmRevertReadOnlyIntent)(FIXTURE_SET);
        assert.strictEqual(proceed, true);
        // The Round A fix: the intent must still be set after confirm.
        assert.strictEqual((0, ReadOnlyIntentService_1.getReadOnlyIntentService)().isReadOnly(FIXTURE_SET.setDir), true, "intent must persist until commitClearReadOnlyIntent fires");
    });
    test("intent set + operator dismisses warning => confirm returns false AND intent is preserved", async () => {
        (0, ReadOnlyIntentService_1.getReadOnlyIntentService)().setReadOnly(FIXTURE_SET.setDir);
        stubWarning(undefined);
        const proceed = await (0, checkOutOrchestrator_1.confirmRevertReadOnlyIntent)(FIXTURE_SET);
        assert.strictEqual(proceed, false);
        assert.strictEqual((0, ReadOnlyIntentService_1.getReadOnlyIntentService)().isReadOnly(FIXTURE_SET.setDir), true, "intent must NOT be cleared on dismissal");
    });
    test("commitClearReadOnlyIntent clears the intent for the named set only", () => {
        (0, ReadOnlyIntentService_1.getReadOnlyIntentService)().setReadOnly(FIXTURE_SET.setDir);
        (0, ReadOnlyIntentService_1.getReadOnlyIntentService)().setReadOnly("/repo/docs/session-sets/other");
        (0, checkOutOrchestrator_1.commitClearReadOnlyIntent)(FIXTURE_SET);
        assert.strictEqual((0, ReadOnlyIntentService_1.getReadOnlyIntentService)().isReadOnly(FIXTURE_SET.setDir), false);
        assert.strictEqual((0, ReadOnlyIntentService_1.getReadOnlyIntentService)().isReadOnly("/repo/docs/session-sets/other"), true, "unrelated intents must be untouched");
    });
});
//# sourceMappingURL=readOnlyIntentTiming.test.js.map