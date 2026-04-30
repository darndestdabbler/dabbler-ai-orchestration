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
exports.registerTroubleshootCommand = registerTroubleshootCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cp = __importStar(require("child_process"));
const fileSystem_1 = require("../utils/fileSystem");
function workspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function outputChannel() {
    return vscode.window.createOutputChannel("Dabbler Diagnostics");
}
function checkActivation() {
    const ch = outputChannel();
    const root = workspaceRoot();
    if (!root) {
        ch.appendLine("No workspace folder is open.");
        ch.show();
        return;
    }
    const dir = path.join(root, fileSystem_1.SESSION_SETS_REL);
    const exists = fs.existsSync(dir);
    ch.appendLine(`docs/session-sets/ exists: ${exists}`);
    ch.appendLine(`Expected path: ${dir}`);
    if (!exists) {
        ch.appendLine("");
        ch.appendLine("The extension activates on 'workspaceContains:docs/session-sets'. " +
            "Create this folder (and at least one session-set subdirectory with a spec.md) to activate.");
        ch.appendLine("Run 'Dabbler: Set Up New Project' to scaffold the folder.");
    }
    else {
        ch.appendLine("Activation condition is met. If the view is still empty, try 'Dabbler: Refresh'.");
    }
    ch.show();
}
function checkStateStuck() {
    const ch = outputChannel();
    ch.appendLine("Session-set state machine:");
    ch.appendLine("  not-started  →  only spec.md exists");
    ch.appendLine("  in-progress  →  activity-log.json OR session-state.json exists");
    ch.appendLine("  done         →  change-log.md exists");
    ch.appendLine("");
    ch.appendLine("If a session appears stuck, check that the AI router wrote the expected files. " +
        "Open 'Activity Log' from the context menu to inspect the raw log.");
    ch.show();
}
function checkWorktrees() {
    const ch = outputChannel();
    const root = workspaceRoot();
    if (!root) {
        ch.appendLine("No workspace folder open.");
        ch.show();
        return;
    }
    try {
        const out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
            cwd: root, encoding: "utf8", windowsHide: true, timeout: 5000,
        });
        ch.appendLine("git worktree list --porcelain output:");
        ch.appendLine(out || "(no output)");
        ch.appendLine("");
        ch.appendLine("The extension scans all listed worktrees for docs/session-sets/ and merges results.");
    }
    catch (err) {
        ch.appendLine(`git worktree list failed: ${err instanceof Error ? err.message : String(err)}`);
        ch.appendLine("Is this folder inside a git repository?");
    }
    ch.show();
}
function checkApiKeys() {
    const ch = outputChannel();
    ch.appendLine("The ai-router reads API keys from environment variables at session start.");
    ch.appendLine("");
    ch.appendLine("Keys used (depending on configured providers):");
    ch.appendLine("  ANTHROPIC_API_KEY  — Claude (claude.ai)");
    ch.appendLine("  OPENAI_API_KEY     — OpenAI (GPT models)");
    ch.appendLine("  GEMINI_API_KEY     — Google Gemini");
    ch.appendLine("");
    ch.appendLine("Export them in your shell profile (~/.bashrc, ~/.zshrc, or $PROFILE on Windows).");
    ch.appendLine("After editing, restart VS Code or open a new terminal.");
    ch.show();
}
function checkHighCost() {
    const ch = outputChannel();
    ch.appendLine("Cost guidance:");
    ch.appendLine("  Opus 4.x   → ~$1–5 per session (highest quality, highest cost)");
    ch.appendLine("  Sonnet 4.x → ~$0.10–0.50 per session (good quality, moderate cost)");
    ch.appendLine("  Haiku 4.x  → ~$0.01–0.05 per session (fast, lowest cost)");
    ch.appendLine("");
    ch.appendLine("Run 'Dabbler: Show Cost Dashboard' to see cumulative totals and a daily chart.");
    ch.appendLine("Set effort=low in spec.md Session Set Configuration to reduce token spend.");
    ch.show();
}
function checkLayout() {
    const ch = outputChannel();
    const root = workspaceRoot();
    if (!root) {
        ch.appendLine("No workspace folder open.");
        ch.show();
        return;
    }
    const dirs = [
        path.join("docs", "session-sets"),
        path.join("docs", "planning"),
        "ai-router",
    ];
    ch.appendLine(`Expected layout under: ${root}`);
    ch.appendLine("");
    for (const d of dirs) {
        const full = path.join(root, d);
        const exists = fs.existsSync(full);
        ch.appendLine(`  ${exists ? "✓" : "✗"} ${d}`);
    }
    ch.appendLine("");
    ch.appendLine("Missing folders? Run 'Dabbler: Set Up New Project' to scaffold them.");
    ch.show();
}
function registerTroubleshootCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.troubleshoot", async () => {
        const items = [
            {
                label: "$(warning) Extension not activating",
                detail: "Check for docs/session-sets/ and explain the activation trigger",
                run: checkActivation,
            },
            {
                label: "$(sync) Session stuck in 'In Progress'",
                detail: "Explain the file-presence state machine",
                run: checkStateStuck,
            },
            {
                label: "$(git-branch) Worktrees not showing",
                detail: "Run git worktree list and show the output",
                run: checkWorktrees,
            },
            {
                label: "$(key) API key not found",
                detail: "Show which environment variables the ai-router expects",
                run: checkApiKeys,
            },
            {
                label: "$(graph) Cost seems high",
                detail: "Show cost estimates by model and point to the dashboard",
                run: checkHighCost,
            },
            {
                label: "$(folder) File/folder layout wrong",
                detail: "Compare expected layout vs. actual workspace state",
                run: checkLayout,
            },
        ];
        const picked = await vscode.window.showQuickPick(items.map((i) => ({ label: i.label, detail: i.detail, _run: i.run })), { placeHolder: "Select a troubleshooting topic" });
        if (picked)
            picked._run();
    }));
}
//# sourceMappingURL=troubleshoot.js.map