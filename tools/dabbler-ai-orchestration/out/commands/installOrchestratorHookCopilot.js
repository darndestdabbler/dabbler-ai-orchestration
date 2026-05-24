"use strict";
// GitHub Copilot orchestrator-hook installer.
//
// Per Set 029 audit Q4: GitHub Copilot's old settings keys for the
// active chat model were deprecated and no current public key replaces
// them. Auto-detection isn't viable in v1. The "install hook" command
// opens the manual-override quickpick with `provider: "github"`
// pre-selected so the operator gets one click to a working Copilot
// check-out. No actual hook is installed.
//
// Set 036 Session 3 (D1 watcher-scope discipline): Codex now joins
// Copilot and Gemini as a manual-only orchestrator — its config.toml
// auto-detect watcher was retired, leaving Claude Code as the sole
// orchestrator with an auto-detect path. Operators of every other
// engine claim via "Check Out As…" (which dispatches the canonical
// `python -m ai_router.start_session` writer).
//
// Set 033 S3: command id of the manual-override quickpick renamed
// from `dabbler.setOrchestrator` to `dabbler.checkOutOrchestrator`
// alongside the H1+H3+H4 check-out model.
//
// Set 036 Session 2 (chatSessionId): the Q1 audit confirmed GitHub
// Copilot exposes no per-chat session-id surface either. The Set 036
// H4 composite identity (engine + provider + chatSessionId) is
// therefore satisfied via the fallback CLI rather than any native
// signal — operators run `python -m ai_router.new_chat_id` once per
// chat session, export the printed UUID as CHAT_SESSION_ID, and the
// subsequent `start_session` invocation pins that UUID into the
// orchestrator block. A one-time informational toast surfaces the
// workflow when this command is invoked so first-time operators
// learn about the fallback before they hit a takeover modal.
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
exports.registerInstallOrchestratorHookCopilotCommand = registerInstallOrchestratorHookCopilotCommand;
const vscode = __importStar(require("vscode"));
const newChatIdWorkflowToast_1 = require("./newChatIdWorkflowToast");
function registerInstallOrchestratorHookCopilotCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.installOrchestratorHook.copilot", async () => {
        await (0, newChatIdWorkflowToast_1.maybeShowNewChatIdWorkflowToast)(context, "GitHub Copilot", newChatIdWorkflowToast_1.NEW_CHAT_ID_TOAST_SUPPRESS_KEY_COPILOT);
        await vscode.commands.executeCommand("dabbler.checkOutOrchestrator", { prefillProvider: "github" });
    }));
}
//# sourceMappingURL=installOrchestratorHookCopilot.js.map