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
const ReadOnlyIntentService_1 = require("../../providers/ReadOnlyIntentService");
// Set 036 Session 4 — ReadOnlyIntentService Layer-2 coverage.
//
// The service is a thin Set wrapper with an EventEmitter; the tests
// pin the observable contract (set / clear / membership / change
// events) so future refactors don't drift.
suite("ReadOnlyIntentService", () => {
    let svc;
    setup(() => {
        svc = new ReadOnlyIntentService_1.ReadOnlyIntentService();
    });
    teardown(() => {
        svc.dispose();
    });
    test("isReadOnly returns false on a fresh service", () => {
        assert.strictEqual(svc.isReadOnly("/repo/docs/session-sets/099"), false);
    });
    test("setReadOnly marks the set and isReadOnly reflects it", () => {
        svc.setReadOnly("/repo/docs/session-sets/099");
        assert.strictEqual(svc.isReadOnly("/repo/docs/session-sets/099"), true);
        assert.strictEqual(svc.isReadOnly("/repo/docs/session-sets/100"), false);
    });
    test("clearReadOnly removes the flag", () => {
        svc.setReadOnly("/repo/docs/session-sets/099");
        svc.clearReadOnly("/repo/docs/session-sets/099");
        assert.strictEqual(svc.isReadOnly("/repo/docs/session-sets/099"), false);
    });
    test("setReadOnly is idempotent — second call does not double-fire onDidChange", () => {
        let fires = 0;
        svc.onDidChange(() => {
            fires += 1;
        });
        svc.setReadOnly("/repo/docs/session-sets/099");
        svc.setReadOnly("/repo/docs/session-sets/099");
        assert.strictEqual(fires, 1);
    });
    test("clearReadOnly on an unflagged set does not fire onDidChange", () => {
        let fires = 0;
        svc.onDidChange(() => {
            fires += 1;
        });
        svc.clearReadOnly("/repo/docs/session-sets/099");
        assert.strictEqual(fires, 0);
    });
    test("empty path is ignored on set + clear", () => {
        svc.setReadOnly("");
        assert.strictEqual(svc.intentCount, 0);
        svc.clearReadOnly("");
        assert.strictEqual(svc.intentCount, 0);
    });
    test("dispose() clears all intents", () => {
        svc.setReadOnly("/a");
        svc.setReadOnly("/b");
        assert.strictEqual(svc.intentCount, 2);
        svc.dispose();
        assert.strictEqual(svc.intentCount, 0);
        // Re-create for teardown's dispose to find a clean instance.
        svc = new ReadOnlyIntentService_1.ReadOnlyIntentService();
    });
});
suite("getReadOnlyIntentService — singleton", () => {
    teardown(() => {
        (0, ReadOnlyIntentService_1.resetReadOnlyIntentServiceForTests)();
    });
    test("returns the same instance across calls", () => {
        const a = (0, ReadOnlyIntentService_1.getReadOnlyIntentService)();
        const b = (0, ReadOnlyIntentService_1.getReadOnlyIntentService)();
        assert.strictEqual(a, b);
    });
    test("resetReadOnlyIntentServiceForTests gives a fresh instance", () => {
        const a = (0, ReadOnlyIntentService_1.getReadOnlyIntentService)();
        a.setReadOnly("/repo/docs/session-sets/099");
        (0, ReadOnlyIntentService_1.resetReadOnlyIntentServiceForTests)();
        const b = (0, ReadOnlyIntentService_1.getReadOnlyIntentService)();
        assert.notStrictEqual(a, b);
        assert.strictEqual(b.isReadOnly("/repo/docs/session-sets/099"), false);
    });
});
//# sourceMappingURL=readOnlyIntentService.test.js.map