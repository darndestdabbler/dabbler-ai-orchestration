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
// Set 033 S3: command id of the manual-override quickpick renamed
// from `dabbler.setOrchestrator` to `dabbler.checkOutOrchestrator`
// alongside the H1+H3+H4 check-out model.
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
function registerInstallOrchestratorHookCopilotCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.installOrchestratorHook.copilot", () => vscode.commands.executeCommand("dabbler.checkOutOrchestrator", {
        prefillProvider: "github",
    })));
}
//# sourceMappingURL=installOrchestratorHookCopilot.js.map