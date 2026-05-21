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
const suppressionState_1 = require("../../providers/suppressionState");
// Set 029 Session 4 — Auto-expand suppression keyed by the
// (slug, marker.updatedAt) tuple per audit Q2(a) + GPT-5.4 M7. Pure
// reducer; suite verifies aging behavior + manual-clear semantics +
// stale-key pruning.
suite("suppressionState", () => {
    test("isSuppressed returns false when no entry exists for slug", () => {
        const state = {};
        assert.strictEqual((0, suppressionState_1.isSuppressed)(state, "foo", "2026-05-18T00:00:00Z"), false);
    });
    test("isSuppressed returns true only when slug AND updatedAt match", () => {
        const state = { foo: "2026-05-18T00:00:00Z" };
        assert.strictEqual((0, suppressionState_1.isSuppressed)(state, "foo", "2026-05-18T00:00:00Z"), true);
        assert.strictEqual((0, suppressionState_1.isSuppressed)(state, "foo", "2026-05-18T01:00:00Z"), false, "different updatedAt = different occurrence, must NOT be suppressed");
        assert.strictEqual((0, suppressionState_1.isSuppressed)(state, "bar", "2026-05-18T00:00:00Z"), false);
    });
    test("isSuppressed returns false for null marker.updatedAt", () => {
        const state = { foo: "2026-05-18T00:00:00Z" };
        assert.strictEqual((0, suppressionState_1.isSuppressed)(state, "foo", null), false);
    });
    test("suppress sets the tuple-key entry", () => {
        const before = {};
        const after = (0, suppressionState_1.suppress)(before, "foo", "2026-05-18T00:00:00Z");
        assert.deepStrictEqual(after, { foo: "2026-05-18T00:00:00Z" });
        assert.notStrictEqual(after, before, "must return a new object (immutability)");
    });
    test("suppress overwrites with a fresher updatedAt for the same slug", () => {
        const before = { foo: "2026-05-18T00:00:00Z" };
        const after = (0, suppressionState_1.suppress)(before, "foo", "2026-05-18T01:00:00Z");
        assert.deepStrictEqual(after, { foo: "2026-05-18T01:00:00Z" });
    });
    test("clearSuppression removes the slug entry entirely", () => {
        const before = { foo: "2026-05-18T00:00:00Z", bar: "2026-05-18T01:00:00Z" };
        const after = (0, suppressionState_1.clearSuppression)(before, "foo");
        assert.deepStrictEqual(after, { bar: "2026-05-18T01:00:00Z" });
    });
    test("clearSuppression is a no-op + returns the same instance when slug not present", () => {
        const before = { bar: "2026-05-18T01:00:00Z" };
        const after = (0, suppressionState_1.clearSuppression)(before, "foo");
        assert.strictEqual(after, before, "no-op path should not allocate");
    });
    test("prune drops entries whose slug is no longer visible", () => {
        const before = {
            foo: "2026-05-18T00:00:00Z",
            bar: "2026-05-18T01:00:00Z",
            baz: "2026-05-18T02:00:00Z",
        };
        const visible = new Set(["foo", "baz"]);
        const after = (0, suppressionState_1.prune)(before, visible);
        assert.deepStrictEqual(after, {
            foo: "2026-05-18T00:00:00Z",
            baz: "2026-05-18T02:00:00Z",
        });
    });
    test("prune returns the same instance when nothing changes", () => {
        const before = { foo: "2026-05-18T00:00:00Z" };
        const after = (0, suppressionState_1.prune)(before, new Set(["foo"]));
        assert.strictEqual(after, before);
    });
    test("aging: SessionStart writes a fresh marker → suppression naturally lifts", () => {
        // Occurrence 1: marker updatedAt = T0, operator collapses manually.
        let state = {};
        state = (0, suppressionState_1.suppress)(state, "foo", "T0");
        assert.strictEqual((0, suppressionState_1.isSuppressed)(state, "foo", "T0"), true);
        // Next SessionStart: marker updatedAt advances to T1. The new
        // occurrence is NOT suppressed because the key tuple no longer
        // matches — the auto-expand fires normally.
        assert.strictEqual((0, suppressionState_1.isSuppressed)(state, "foo", "T1"), false);
    });
});
//# sourceMappingURL=suppressionState.test.js.map