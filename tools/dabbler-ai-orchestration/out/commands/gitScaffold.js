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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGitScaffoldCommand = registerGitScaffoldCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const simple_git_1 = __importDefault(require("simple-git"));
const SCAFFOLD_DIRS = [
    path.join("docs", "session-sets"),
    path.join("docs", "planning"),
    "ai-router",
];
async function pickDirectory() {
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select project folder",
    });
    return picked?.[0]?.fsPath;
}
function registerGitScaffoldCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.setupNewProject", async () => {
        // Step 1: pick folder
        const projectDir = await pickDirectory();
        if (!projectDir)
            return;
        // Step 2: git init (skip if already a repo)
        const git = (0, simple_git_1.default)(projectDir);
        const isRepo = await git.checkIsRepo().catch(() => false);
        if (!isRepo) {
            const confirm = await vscode.window.showWarningMessage(`Initialize a new git repository in ${path.basename(projectDir)}?`, { modal: true }, "Initialize");
            if (confirm !== "Initialize")
                return;
            await git.init();
            vscode.window.showInformationMessage("Git repository initialized.");
        }
        // Step 3: create folder skeleton
        for (const rel of SCAFFOLD_DIRS) {
            const full = path.join(projectDir, rel);
            if (!fs.existsSync(full))
                fs.mkdirSync(full, { recursive: true });
        }
        vscode.window.showInformationMessage("Folder skeleton created.");
        // Step 4: worktree opt-in
        const worktreeAnswer = await vscode.window.showInformationMessage("Set up git worktrees for parallel session sets? (Recommended for large projects)", { modal: true }, "Yes — set up worktrees", "No — keep it simple");
        if (worktreeAnswer === "Yes — set up worktrees") {
            try {
                // Need at least one commit before adding worktrees
                const status = await git.status();
                if (status.files.length > 0 || !(await git.log().catch(() => null))) {
                    await git.commit("init", { "--allow-empty": null });
                }
                const worktreesDir = path.join(projectDir, "worktrees");
                if (!fs.existsSync(worktreesDir))
                    fs.mkdirSync(worktreesDir, { recursive: true });
                await git.raw(["worktree", "add", path.join(worktreesDir, "main"), "HEAD"]);
                vscode.window.showInformationMessage("Worktrees set up. Work from worktrees/main/ for parallel sessions.");
            }
            catch (err) {
                vscode.window.showWarningMessage(`Worktree setup skipped: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        // Step 5: open folder and launch wizard
        const openFolder = await vscode.window.showInformationMessage("Project scaffolded. Open the folder now?", "Open Folder");
        if (openFolder === "Open Folder") {
            vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectDir));
        }
        else {
            vscode.commands.executeCommand("dabbler.getStarted");
        }
    }));
}
//# sourceMappingURL=gitScaffold.js.map