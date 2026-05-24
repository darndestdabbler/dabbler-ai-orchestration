"use strict";
// Set 036 Session 2: the "READMEish snippet" surfaced to operators
// when they invoke the Gemini / Copilot orchestrator-hook installer
// shims. Neither Gemini Code Assist nor GitHub Copilot exposes a
// per-chat session-id surface (Q1 audit), so the Set 036 H4 composite
// identity (engine + provider + chatSessionId) is satisfied via the
// fallback CLI: `python -m ai_router.new_chat_id [--export]`.
//
// The toast is one-time per (workspace, orchestrator) pair. The
// operator dismisses it via a "Don't show again" button that persists
// the suppression to workspaceState; "Copy command" copies the
// canonical export line to the clipboard so the operator can paste it
// straight into their shell.
//
// Shared by `installOrchestratorHookGemini.ts` and
// `installOrchestratorHookCopilot.ts`. If future orchestrators land
// without a native session-id surface, add another suppress-key
// constant rather than reusing an existing one — each orchestrator
// gets its own one-time prompt so operators who set up one
// orchestrator first still see the toast for the second.
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
exports.NEW_CHAT_ID_TOAST_SUPPRESS_KEY_COPILOT = exports.NEW_CHAT_ID_TOAST_SUPPRESS_KEY_GEMINI = void 0;
exports.maybeShowNewChatIdWorkflowToast = maybeShowNewChatIdWorkflowToast;
const vscode = __importStar(require("vscode"));
exports.NEW_CHAT_ID_TOAST_SUPPRESS_KEY_GEMINI = "dabbler.newChatIdWorkflowToast.suppress.gemini";
exports.NEW_CHAT_ID_TOAST_SUPPRESS_KEY_COPILOT = "dabbler.newChatIdWorkflowToast.suppress.copilot";
// Round B Major fix: `... | eval "$(cat)"` runs eval in a pipeline
// subshell on bash, so the resulting export does not persist in the
// operator's shell. The current-shell `eval "$(cmd)"` form runs in the
// caller's process and the export survives. Same shape for fish via
// `source` (no subshell issue since the file-substitution form is
// expanded by the parent shell). PowerShell's `Invoke-Expression` is
// already current-scope when invoked at the top level.
const COPY_COMMAND_BASH = `eval "$(python -m ai_router.new_chat_id --export --shell bash)"`;
const COPY_COMMAND_POWERSHELL = `python -m ai_router.new_chat_id --export --shell powershell | Invoke-Expression`;
const COPY_COMMAND_FISH = `python -m ai_router.new_chat_id --export --shell fish | source`;
async function maybeShowNewChatIdWorkflowToast(context, orchestratorName, suppressKey) {
    if (context.workspaceState.get(suppressKey))
        return;
    const message = `${orchestratorName} has no per-chat session-id surface, so the ` +
        `Dabbler workflow uses a fallback CLI to mint a per-chat ` +
        `identifier. Run ` +
        `\`python -m ai_router.new_chat_id --export\` once per chat ` +
        `(piped through your shell's eval/source primitive) to export ` +
        `CHAT_SESSION_ID, then check out the session set as usual. Skip ` +
        `this step and the writer falls back to its legacy tolerance ` +
        `branch (less precise takeover detection).`;
    const choice = await vscode.window.showInformationMessage(message, "Copy bash command", "Copy PowerShell command", "Copy fish command", "Don't show again");
    if (choice === "Copy bash command") {
        await vscode.env.clipboard.writeText(COPY_COMMAND_BASH);
        vscode.window.setStatusBarMessage("Dabbler: copied new_chat_id bash workflow to clipboard.", 4000);
    }
    else if (choice === "Copy PowerShell command") {
        await vscode.env.clipboard.writeText(COPY_COMMAND_POWERSHELL);
        vscode.window.setStatusBarMessage("Dabbler: copied new_chat_id PowerShell workflow to clipboard.", 4000);
    }
    else if (choice === "Copy fish command") {
        await vscode.env.clipboard.writeText(COPY_COMMAND_FISH);
        vscode.window.setStatusBarMessage("Dabbler: copied new_chat_id fish workflow to clipboard.", 4000);
    }
    else if (choice === "Don't show again") {
        await context.workspaceState.update(suppressKey, true);
    }
}
//# sourceMappingURL=newChatIdWorkflowToast.js.map