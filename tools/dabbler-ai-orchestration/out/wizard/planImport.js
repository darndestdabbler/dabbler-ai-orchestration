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
exports.registerPlanImportCommand = registerPlanImportCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const PLAN_DEST = path.join("docs", "planning", "project-plan.md");
const PLAN_AUTHORING_PROMPT = `You are a project planning assistant for an AI-led development workflow.

Help me create a project plan in Markdown format for my software project.

The plan should include:
1. Project overview (2-3 sentences)
2. Goals and success criteria
3. High-level phases or feature areas
4. For each phase: a brief description and the key deliverables

Keep it concise and focused — this plan will be used to generate AI session sets, so each
distinct feature area or phase should be something that can be implemented in 2-6 focused AI
sessions.

Format as a clean Markdown document I can save as docs/planning/project-plan.md.`;
function registerPlanImportCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.importPlan", async () => {
        const action = await vscode.window.showQuickPick([
            { label: "$(file) Import existing plan from file", value: "file" },
            { label: "$(clippy) Get a prompt to create a plan with AI", value: "prompt" },
        ], { placeHolder: "How would you like to add a project plan?" });
        if (!action)
            return;
        if (action.value === "prompt") {
            await vscode.env.clipboard.writeText(PLAN_AUTHORING_PROMPT);
            vscode.window.showInformationMessage("Plan-authoring prompt copied to clipboard. Paste it into your AI assistant, " +
                "then save the result as docs/planning/project-plan.md and run " +
                "'Dabbler: Import Project Plan' again to import it.");
            return;
        }
        // File import
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { "Markdown": ["md"] },
            openLabel: "Import Plan",
        });
        if (!picked?.[0])
            return;
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return;
        }
        const destPath = path.join(root, PLAN_DEST);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir))
            fs.mkdirSync(destDir, { recursive: true });
        if (fs.existsSync(destPath)) {
            const overwrite = await vscode.window.showWarningMessage(`${PLAN_DEST} already exists. Overwrite it?`, { modal: true }, "Overwrite");
            if (overwrite !== "Overwrite")
                return;
        }
        fs.copyFileSync(picked[0].fsPath, destPath);
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(destPath));
        vscode.window.showInformationMessage(`Plan imported to ${PLAN_DEST}. Run 'Dabbler: Generate Session-Set Prompt' to translate it into session sets.`);
    }));
}
//# sourceMappingURL=planImport.js.map