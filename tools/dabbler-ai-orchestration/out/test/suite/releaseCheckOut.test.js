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
const releaseCheckOut_1 = require("../../commands/releaseCheckOut");
// Set 033 Session 3 — `dabbler.releaseCheckOut` is the H3-named
// release path (alongside `start_session --force` on the CLI). The
// VS Code-mediated flow is mostly a confirmation prompt + delegation
// to the renamed `dabbler.checkOutOrchestrator` quickpick, so the
// pure-logic surface worth unit-testing is the holder-rendering
// helper that feeds the confirmation modal.
function fakeSet(orchestrator, slug = "033-orchestrator-checkout-checkin-implementation") {
    return {
        slug,
        setDir: `/x/docs/session-sets/${slug}`,
        state: {
            currentSession: 3,
            orchestrator,
        },
    };
}
suite("describeHolder", () => {
    test("renders engine + provider + model when all three present", () => {
        const set = fakeSet({
            engine: "claude",
            provider: "anthropic",
            model: "claude-opus-4-7",
            effort: "high",
        });
        assert.strictEqual((0, releaseCheckOut_1.describeHolder)(set), "claude + anthropic (claude-opus-4-7)");
    });
    test("omits the model parenthetical when model is absent", () => {
        const set = fakeSet({
            engine: "codex",
            provider: "openai",
        });
        assert.strictEqual((0, releaseCheckOut_1.describeHolder)(set), "codex + openai");
    });
    test("renders '?' placeholders when engine or provider is missing", () => {
        const set = fakeSet({
            model: "gpt-5-4",
        });
        assert.strictEqual((0, releaseCheckOut_1.describeHolder)(set), "? + ? (gpt-5-4)");
    });
    test("returns 'no current holder' when orchestrator is null", () => {
        const set = fakeSet(null);
        assert.strictEqual((0, releaseCheckOut_1.describeHolder)(set), "no current holder");
    });
});
//# sourceMappingURL=releaseCheckOut.test.js.map