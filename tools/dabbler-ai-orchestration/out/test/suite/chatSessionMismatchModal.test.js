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
const chatSessionMismatchModal_1 = require("../../providers/chatSessionMismatchModal");
// Set 036 Session 4 — chatSessionMismatchModal Layer-2 coverage.
//
// Pure helpers cover the deterministic copy / truncation / choice
// mapping; the showModal seam exercises the round-trip from the
// modal's button labels through resolveChoice() to the typed
// ChatSessionMismatchChoice union.
suite("truncateChatSessionId", () => {
    test("short ID returns as-is", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.truncateChatSessionId)("abc"), "abc");
    });
    test("8-char ID returns as-is (boundary)", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.truncateChatSessionId)("12345678"), "12345678");
    });
    test("longer ID is truncated to 8 chars + ellipsis", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.truncateChatSessionId)("550e8400-e29b-41d4-a716-446655440000"), "550e8400…");
    });
    test("null renders as <none>", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.truncateChatSessionId)(null), "<none>");
    });
    test("undefined renders as <none>", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.truncateChatSessionId)(undefined), "<none>");
    });
    test("empty string renders as <none>", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.truncateChatSessionId)(""), "<none>");
    });
});
suite("formatHolderLabel", () => {
    test("formats with truncated chatSessionId", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.formatHolderLabel)("claude", "anthropic", "550e8400-e29b-41d4-a716-446655440000"), "claude + anthropic + chat 550e8400…");
    });
    test("null chatSessionId renders the <none> placeholder", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.formatHolderLabel)("claude", "anthropic", null), "claude + anthropic + chat <none>");
    });
});
suite("buildModalMessage", () => {
    const copy = {
        sessionSetSlug: "099-fixture",
        heldByLabel: "claude + anthropic + chat aaaaaaaa…",
        wouldBeLabel: "claude + anthropic + chat bbbbbbbb…",
    };
    test("message names the session set", () => {
        const built = (0, chatSessionMismatchModal_1.buildModalMessage)(copy);
        assert.ok(built.message.includes("099-fixture"));
    });
    test("detail names both holders + describes all three actions", () => {
        const built = (0, chatSessionMismatchModal_1.buildModalMessage)(copy);
        assert.ok(built.detail.includes("aaaaaaaa…"));
        assert.ok(built.detail.includes("bbbbbbbb…"));
        assert.ok(/Take Over/i.test(built.detail));
        assert.ok(/Read-Only/i.test(built.detail));
        assert.ok(/Cancel/i.test(built.detail));
    });
});
suite("resolveChoice", () => {
    test("Take Over label maps to take-over", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.resolveChoice)(chatSessionMismatchModal_1.MODAL_TAKE_OVER), "take-over");
    });
    test("Open in Read-Only Mode label maps to read-only", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.resolveChoice)(chatSessionMismatchModal_1.MODAL_READ_ONLY), "read-only");
    });
    test("Cancel label maps to cancel", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.resolveChoice)(chatSessionMismatchModal_1.MODAL_CANCEL), "cancel");
    });
    test("undefined (modal dismissed) collapses to cancel", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.resolveChoice)(undefined), "cancel");
    });
    test("unknown label collapses to cancel (safe default)", () => {
        assert.strictEqual((0, chatSessionMismatchModal_1.resolveChoice)("Other Mystery Action"), "cancel");
    });
});
suite("chatSessionMismatchModal — showModal injection", () => {
    function fixtureCopy() {
        return {
            sessionSetSlug: "099-fixture",
            heldByLabel: "claude + anthropic + chat aaaaaaaa…",
            wouldBeLabel: "claude + anthropic + chat bbbbbbbb…",
        };
    }
    test("modal: true is requested (operator must dismiss explicitly)", async () => {
        let modalFlag = false;
        const show = (_m, options) => {
            modalFlag = options.modal;
            return Promise.resolve(chatSessionMismatchModal_1.MODAL_CANCEL);
        };
        await (0, chatSessionMismatchModal_1.chatSessionMismatchModal)(fixtureCopy(), show);
        assert.strictEqual(modalFlag, true);
    });
    test("Take Over label returns take-over choice", async () => {
        const show = () => Promise.resolve(chatSessionMismatchModal_1.MODAL_TAKE_OVER);
        const choice = await (0, chatSessionMismatchModal_1.chatSessionMismatchModal)(fixtureCopy(), show);
        assert.strictEqual(choice, "take-over");
    });
    test("Read-Only label returns read-only choice", async () => {
        const show = () => Promise.resolve(chatSessionMismatchModal_1.MODAL_READ_ONLY);
        const choice = await (0, chatSessionMismatchModal_1.chatSessionMismatchModal)(fixtureCopy(), show);
        assert.strictEqual(choice, "read-only");
    });
    test("dismissed modal (undefined) returns cancel", async () => {
        const show = () => Promise.resolve(undefined);
        const choice = await (0, chatSessionMismatchModal_1.chatSessionMismatchModal)(fixtureCopy(), show);
        assert.strictEqual(choice, "cancel");
    });
    test("three buttons are passed to the surface in the locked order", async () => {
        let capturedItems = [];
        const show = (_m, _o, ...items) => {
            capturedItems = items;
            return Promise.resolve(chatSessionMismatchModal_1.MODAL_CANCEL);
        };
        await (0, chatSessionMismatchModal_1.chatSessionMismatchModal)(fixtureCopy(), show);
        assert.deepStrictEqual(capturedItems, [
            chatSessionMismatchModal_1.MODAL_TAKE_OVER,
            chatSessionMismatchModal_1.MODAL_READ_ONLY,
            chatSessionMismatchModal_1.MODAL_CANCEL,
        ]);
    });
});
//# sourceMappingURL=chatSessionMismatchModal.test.js.map