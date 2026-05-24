"use strict";
// Set 036 Session 4 (Q3): chatSessionId-mismatch takeover modal.
//
// The H4 identity composite (Set 036 Session 1) is
// engine + provider + chatSessionId. When start_session refuses with
// EXIT_CHECKOUT_CONFLICT because the same engine+provider is already
// held by a different chatSessionId — typically a stale Claude chat
// that left the slot claimed — the existing "Poll for release"
// prompt's assumption ("the other holder may release naturally") is
// wrong: the same engine is sitting there. This module surfaces a
// modal with the three Q3-locked actions so the operator can take
// over, observe in read-only mode, or cancel.
//
// Pure helper: the showInformationMessage surface is injectable so
// the Layer-2 test in chatSessionMismatchModal.test.ts can drive
// each branch without booting the VS Code window. The CheckoutPoll
// integration point (CheckoutPollService.handleConflict) constructs
// the live surface from vscode.window.showInformationMessage with
// `{ modal: true }`.
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
exports.MODAL_CANCEL = exports.MODAL_READ_ONLY = exports.MODAL_TAKE_OVER = void 0;
exports.truncateChatSessionId = truncateChatSessionId;
exports.formatHolderLabel = formatHolderLabel;
exports.buildModalMessage = buildModalMessage;
exports.resolveChoice = resolveChoice;
exports.chatSessionMismatchModal = chatSessionMismatchModal;
const vscode = __importStar(require("vscode"));
// The three button labels surfaced in the modal. Exported so callers
// (and tests) can pattern-match the user's choice without re-deriving
// the label strings. The order in showInformationMessage call sites
// is take-over → read-only → cancel; "Cancel" is also the implicit
// dismiss choice (closing the modal via the X) so undefined collapses
// to "cancel" in resolveChoice().
exports.MODAL_TAKE_OVER = "Take Over";
exports.MODAL_READ_ONLY = "Open in Read-Only Mode";
exports.MODAL_CANCEL = "Cancel";
// Truncate a chatSessionId to 8 chars (or render a placeholder when
// the field is missing/null). 8 chars is enough to disambiguate the
// chat for the operator without surfacing the full UUID. Matches the
// `_identity_label` Python helper's contract on the CLI side.
function truncateChatSessionId(value) {
    if (typeof value !== "string" || value.length === 0)
        return "<none>";
    if (value.length <= 8)
        return value;
    return value.slice(0, 8) + "…";
}
function formatHolderLabel(engine, provider, chatSessionId) {
    const cid = truncateChatSessionId(chatSessionId);
    return `${engine} + ${provider} + chat ${cid}`;
}
function buildModalMessage(copy) {
    return {
        message: `Another chat already checked out "${copy.sessionSetSlug}".`,
        detail: `Held by: ${copy.heldByLabel}\n` +
            `This chat: ${copy.wouldBeLabel}\n\n` +
            `Take Over forces the check-out to this chat (audit-logged). ` +
            `Open in Read-Only Mode keeps the other chat's check-out intact ` +
            `and prevents this chat's extension commands from writing state. ` +
            `Cancel aborts the start.`,
    };
}
function resolveChoice(label) {
    switch (label) {
        case exports.MODAL_TAKE_OVER:
            return "take-over";
        case exports.MODAL_READ_ONLY:
            return "read-only";
        default:
            return "cancel";
    }
}
// Drive the modal. Default surface is the live vscode one; tests pass
// their own. The promise resolves to the locked choice — never throws.
async function chatSessionMismatchModal(copy, show) {
    const surface = show ??
        ((m, o, ...items) => vscode.window.showInformationMessage(m, o, ...items));
    const { message, detail } = buildModalMessage(copy);
    const choice = await surface(message, { modal: true, detail }, exports.MODAL_TAKE_OVER, exports.MODAL_READ_ONLY, exports.MODAL_CANCEL);
    return resolveChoice(choice);
}
//# sourceMappingURL=chatSessionMismatchModal.js.map