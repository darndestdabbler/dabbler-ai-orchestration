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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const SessionSetsProvider_1 = require("./providers/SessionSetsProvider");
const fileSystem_1 = require("./utils/fileSystem");
const openFile_1 = require("./commands/openFile");
const copyCommand_1 = require("./commands/copyCommand");
const gitScaffold_1 = require("./commands/gitScaffold");
const troubleshoot_1 = require("./commands/troubleshoot");
const WizardPanel_1 = require("./wizard/WizardPanel");
const CostDashboard_1 = require("./dashboard/CostDashboard");
const SESSION_SETS_REL = path.join("docs", "session-sets");
function evaluateSupportContextKeys(allSets) {
    const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
    const uatPref = cfg.get("uatSupport.enabled", "auto");
    const e2ePref = cfg.get("e2eSupport.enabled", "auto");
    const anyUat = allSets.some((s) => s.config?.requiresUAT);
    const anyE2e = allSets.some((s) => s.config?.requiresE2E);
    const uatActive = uatPref === "always" || (uatPref === "auto" && anyUat);
    const e2eActive = e2ePref === "always" || (e2ePref === "auto" && anyE2e);
    vscode.commands.executeCommand("setContext", "dabblerSessionSets.uatSupportActive", uatActive);
    vscode.commands.executeCommand("setContext", "dabblerSessionSets.e2eSupportActive", e2eActive);
}
function activate(context) {
    if (!vscode.workspace.workspaceFolders?.length)
        return;
    const provider = new SessionSetsProvider_1.SessionSetsProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerTreeDataProvider("dabblerSessionSets", provider));
    const evaluateContextKeys = () => {
        evaluateSupportContextKeys(provider._cache ?? (0, fileSystem_1.readAllSessionSets)());
    };
    const originalRefresh = provider.refresh.bind(provider);
    provider.refresh = () => {
        originalRefresh();
        setImmediate(evaluateContextKeys);
    };
    evaluateContextKeys();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("dabblerSessionSets.uatSupport.enabled") ||
            e.affectsConfiguration("dabblerSessionSets.e2eSupport.enabled")) {
            evaluateContextKeys();
        }
    }));
    // --- File watchers ---
    let watcherSubs = [];
    let boundRoots = new Set();
    function bindWatchers() {
        const roots = (0, fileSystem_1.discoverRoots)();
        const want = new Set(roots.map((r) => r.toLowerCase()));
        if (want.size === boundRoots.size &&
            [...want].every((r) => boundRoots.has(r))) {
            return;
        }
        for (const sub of watcherSubs)
            sub.dispose();
        watcherSubs = [];
        boundRoots = want;
        for (const root of roots) {
            const sessionSetsAbs = path.join(root, SESSION_SETS_REL);
            const pattern = new vscode.RelativePattern(sessionSetsAbs, "**/{spec.md,session-state.json,activity-log.json,change-log.md,*-uat-checklist.json}");
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            const onEvent = () => provider.refresh();
            watcher.onDidCreate(onEvent);
            watcher.onDidDelete(onEvent);
            watcher.onDidChange(onEvent);
            watcherSubs.push(watcher);
            context.subscriptions.push(watcher);
        }
    }
    const refreshAll = () => {
        bindWatchers();
        provider.refresh();
    };
    bindWatchers();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshAll));
    const pollHandle = setInterval(refreshAll, 30000);
    context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });
    context.subscriptions.push(vscode.commands.registerCommand("dabblerSessionSets.refresh", refreshAll));
    // --- Register feature command groups ---
    (0, openFile_1.registerOpenFileCommands)(context);
    (0, copyCommand_1.registerCopyCommands)(context);
    (0, gitScaffold_1.registerGitScaffoldCommand)(context);
    (0, troubleshoot_1.registerTroubleshootCommand)(context);
    (0, WizardPanel_1.registerWizardCommands)(context);
    (0, CostDashboard_1.registerCostDashboardCommand)(context);
    // Show onboarding on first activation in a workspace with no session sets
    const hasSeenOnboarding = context.workspaceState.get("hasSeenOnboarding", false);
    if (!hasSeenOnboarding) {
        const roots = (0, fileSystem_1.discoverRoots)();
        const hasSessionSets = roots.some((r) => {
            try {
                const fs = require("fs");
                return fs.existsSync(path.join(r, SESSION_SETS_REL));
            }
            catch {
                return false;
            }
        });
        if (!hasSessionSets) {
            context.workspaceState.update("hasSeenOnboarding", true);
            vscode.commands.executeCommand("dabbler.getStarted");
        }
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map