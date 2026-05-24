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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const CustomSessionSetsView_1 = require("./providers/CustomSessionSetsView");
const scanState_1 = require("./providers/scanState");
const migrateSet_1 = require("./commands/migrateSet");
const fileSystem_1 = require("./utils/fileSystem");
const openFile_1 = require("./commands/openFile");
const copyCommand_1 = require("./commands/copyCommand");
const gitScaffold_1 = require("./commands/gitScaffold");
const copyAdoptionBootstrapPrompt_1 = require("./commands/copyAdoptionBootstrapPrompt");
const troubleshoot_1 = require("./commands/troubleshoot");
const cancelLifecycleCommands_1 = require("./commands/cancelLifecycleCommands");
const installAiRouterCommands_1 = require("./commands/installAiRouterCommands");
const WizardPanel_1 = require("./wizard/WizardPanel");
const CostDashboard_1 = require("./dashboard/CostDashboard");
const ConfigEditorPanel_1 = require("./configEditor/ConfigEditorPanel");
const flagDecisionForReview_1 = require("./commands/flagDecisionForReview");
const scanAnnotationsForActiveSet_1 = require("./commands/scanAnnotationsForActiveSet");
const installOrchestratorHookClaudeCode_1 = require("./commands/installOrchestratorHookClaudeCode");
const installOrchestratorHookGemini_1 = require("./commands/installOrchestratorHookGemini");
const installOrchestratorHookCopilot_1 = require("./commands/installOrchestratorHookCopilot");
const checkOutOrchestrator_1 = require("./commands/checkOutOrchestrator");
const releaseCheckOut_1 = require("./commands/releaseCheckOut");
const openOrchestratorWriterLog_1 = require("./commands/openOrchestratorWriterLog");
const regenerateNarrationTemplates_1 = require("./commands/regenerateNarrationTemplates");
const CheckoutPollService_1 = require("./providers/CheckoutPollService");
const ReadOnlyIntentService_1 = require("./providers/ReadOnlyIntentService");
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
    // Set 030 Session 5: scanState lifecycle. Flip to "loading" BEFORE
    // we register the tree provider so the very first `getChildren()`
    // sees `phase === "loading"` and returns the sentinel — no
    // welcome-CTA flash window. The async `setImmediate` below flips
    // to "ready" after the synchronous body of `activate` returns,
    // which lets the tree provider's reactive `onDidChange` refresh
    // swap the sentinel for real rows on the next render tick.
    const scanState = new scanState_1.ScanState();
    context.subscriptions.push({ dispose: () => scanState.dispose() });
    scanState.setLoading();
    // Set 029 Session 4: replaced the native TreeView with a custom
    // webview tree. CustomSessionSetsView owns rendering, the typed
    // message protocol with monotonic version, and the QuickPick-based
    // row-context menu (per S4 audit Q6 = a). The per-row accordion-body
    // was retired in Set 034 (accordionHtml ships as null on every row)
    // and the source modules deleted in Set 036 Session 6.
    //
    // Set 033 Session 2: MarkerWatchService retired (H2). The
    // workspace-level file-watcher below (which already watches
    // session-state.json) covers every signal the view needs.
    const provider = new CustomSessionSetsView_1.CustomSessionSetsView(context, scanState);
    context.subscriptions.push({ dispose: () => provider.dispose() });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(CustomSessionSetsView_1.CustomSessionSetsView.viewType, provider));
    const evaluateContextKeys = () => {
        evaluateSupportContextKeys((0, fileSystem_1.readAllSessionSets)());
    };
    // v0.13.2: defensive — `evaluateContextKeys()` calls `readAllSessionSets()`
    // which iterates every session set's session-state.json. A single
    // malformed file would otherwise propagate up and abort activation
    // before any feature commands register. Catch + log instead so the
    // tree may render with stale context-key flags (UAT / E2E menu
    // visibility) but the rest of the extension stays alive.
    try {
        evaluateContextKeys();
    }
    catch (err) {
        console.error("[dabbler-ai-orchestration] activation: evaluateContextKeys() threw — " +
            "context keys (UAT/E2E support flags) may be stale, but command " +
            "registration continues. Investigate via the dev console stack trace.", err);
    }
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
            // Set 022 Session 2 added `session-events.jsonl` and
            // `CANCELLED.md` to the watch list. The events ledger drives
            // the new Full-tier sessionsCompleted fallback when
            // `completedSessions[]` is absent, and the boundary writes from
            // `start_session` / `close_session` only touch the ledger and
            // the state file (not the activity-log) — without the ledger in
            // the watch list, a Not Started → In Progress bucket-flip on
            // session 1 of a fresh set would wait for the 30s poll loop
            // instead of triggering the immediate watcher debounce.
            // `CANCELLED.md` is the canonical signal for the cancelled
            // tree-state (Set 8 spec § Detection rules); the cancelled
            // commands write it directly, so the watcher must see it to
            // refresh the bucket the moment a set is cancelled / restored.
            const pattern = new vscode.RelativePattern(sessionSetsAbs, "**/{spec.md,session-state.json,session-events.jsonl,activity-log.json,change-log.md,CANCELLED.md,*-uat-checklist.json}");
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
        setImmediate(evaluateContextKeys);
    };
    // Defensive: bindWatchers iterates roots and creates filesystem
    // watchers; a thrown error from createFileSystemWatcher (e.g., a
    // permission issue on a workspace folder) shouldn't kill activation.
    try {
        bindWatchers();
    }
    catch (err) {
        console.error("[dabbler-ai-orchestration] activation: bindWatchers() threw — " +
            "live tree-refresh on file changes may not work, but command " +
            "registration continues. Manual refresh via " +
            "`Dabbler: Refresh Session Sets` still functions.", err);
    }
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshAll));
    const pollHandle = setInterval(refreshAll, 30000);
    context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });
    context.subscriptions.push(vscode.commands.registerCommand("dabblerSessionSets.refresh", refreshAll));
    // --- Register feature command groups ---
    //
    // Each register*Commands call is wrapped in its own try/catch so a
    // throw in one group does not silently skip the registrations that
    // follow. v0.13.1 shipped without these wrappers; in dabbler-platform
    // workspaces some users hit "command 'dabbler.showCostDashboard' not
    // found" because an earlier register call threw and the cascade
    // skipped the cost-dashboard + wizard + install-ai-router
    // registrations. Defensive logging via console.error means a future
    // similar failure surfaces in `Help → Toggle Developer Tools →
    // Console` with the exact group name, instead of presenting as
    // an opaque command-not-found at click time.
    const safeRegister = (name, fn) => {
        try {
            fn();
        }
        catch (err) {
            console.error(`[dabbler-ai-orchestration] activation failed in ${name} — ` +
                `subsequent commands still attempt to register; the failed ` +
                `group's commands will not be available until the underlying ` +
                `error is fixed.`, err);
        }
    };
    safeRegister("registerOpenFileCommands", () => (0, openFile_1.registerOpenFileCommands)(context));
    safeRegister("registerCopyCommands", () => (0, copyCommand_1.registerCopyCommands)(context));
    safeRegister("registerGitScaffoldCommand", () => (0, gitScaffold_1.registerGitScaffoldCommand)(context));
    safeRegister("registerCopyAdoptionBootstrapPromptCommand", () => (0, copyAdoptionBootstrapPrompt_1.registerCopyAdoptionBootstrapPromptCommand)(context));
    safeRegister("registerTroubleshootCommand", () => (0, troubleshoot_1.registerTroubleshootCommand)(context));
    safeRegister("registerWizardCommands", () => (0, WizardPanel_1.registerWizardCommands)(context));
    safeRegister("registerCostDashboardCommand", () => (0, CostDashboard_1.registerCostDashboardCommand)(context));
    safeRegister("registerCancelLifecycleCommands", () => (0, cancelLifecycleCommands_1.registerCancelLifecycleCommands)(context, { refreshView: refreshAll }));
    safeRegister("registerInstallAiRouterCommands", () => (0, installAiRouterCommands_1.registerInstallAiRouterCommands)(context));
    safeRegister("registerConfigEditorCommand", () => (0, ConfigEditorPanel_1.registerConfigEditorCommand)(context));
    safeRegister("registerFlagDecisionForReview", () => (0, flagDecisionForReview_1.registerFlagDecisionForReview)(context));
    safeRegister("registerScanAnnotationsForActiveSet", () => (0, scanAnnotationsForActiveSet_1.registerScanAnnotationsForActiveSet)(context));
    safeRegister("registerMigrateSetCommand", () => (0, migrateSet_1.registerMigrateSetCommand)(context, { refreshView: refreshAll }));
    // Set 029 Session 4: the dedicated dabblerOrchestratorIndicator view
    // is retired in v0.16.0. Set 034 then retired the per-row gauges in
    // CustomSessionSetsView; Set 036 Session 6 deleted the source.
    // Hook installer + manual-override stub + writer-log opener remain
    // as standalone Command Palette / right-click context-menu actions.
    //
    // Set 029 Session 5: full multi-provider surface — Gemini + Copilot
    // manual-only shim commands that delegate to the universal
    // manual-override quickpick. Manual stub from S2 is retired in favor
    // of the real implementation.
    //
    // Set 036 Session 3 (D1 watcher-scope discipline): the Codex
    // config.toml auto-detect watcher is retired. Codex joins Gemini
    // and Copilot as a manual-only orchestrator; operators claim a
    // Codex check-out via "Check Out As…" (the canonical writer path)
    // instead of via filesystem inference.
    safeRegister("registerInstallOrchestratorHookClaudeCode", () => (0, installOrchestratorHookClaudeCode_1.registerInstallOrchestratorHookClaudeCodeCommand)(context));
    safeRegister("registerInstallOrchestratorHookGemini", () => (0, installOrchestratorHookGemini_1.registerInstallOrchestratorHookGeminiCommand)(context));
    safeRegister("registerInstallOrchestratorHookCopilot", () => (0, installOrchestratorHookCopilot_1.registerInstallOrchestratorHookCopilotCommand)(context));
    safeRegister("registerCheckOutOrchestrator", () => (0, checkOutOrchestrator_1.registerCheckOutOrchestrator)(context));
    safeRegister("registerReleaseCheckOut", () => (0, releaseCheckOut_1.registerReleaseCheckOut)(context));
    safeRegister("registerOpenOrchestratorWriterLog", () => (0, openOrchestratorWriterLog_1.registerOpenOrchestratorWriterLog)(context));
    safeRegister("registerRegenerateNarrationTemplates", () => (0, regenerateNarrationTemplates_1.registerRegenerateNarrationTemplatesCommand)(context));
    // Set 036 Session 4: ReadOnlyIntentService is the in-memory map of
    // session sets the operator picked "Open in Read-Only Mode" on via
    // the chatSessionMismatchModal. checkOutOrchestrator reads it to
    // prompt-before-write; lifetime ends when the extension host
    // deactivates.
    context.subscriptions.push({ dispose: () => (0, ReadOnlyIntentService_1.getReadOnlyIntentService)().dispose() });
    // Set 033 Session 5: CheckoutPollService watches
    // ~/.dabbler/checkout-conflicts/ for structured conflict records
    // emitted by the Claude SessionStart invoker on
    // EXIT_CHECKOUT_CONFLICT (H3 refusal). For each record, it surfaces
    // a poll/force/dismiss prompt; "poll" watches the held set's
    // session-state.json (5s debounce) and auto-retries start_session
    // when the slot becomes free (H4 identity gate). The pythonPath
    // resolver mirrors the one in checkOutOrchestrator.ts so both paths
    // share the operator's dabblerSessionSets.pythonPath setting.
    safeRegister("CheckoutPollService", () => {
        const pollService = new CheckoutPollService_1.CheckoutPollService({
            pythonPathResolver: (cwd) => {
                const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
                const inspected = cfg.inspect("pythonPath");
                const explicit = inspected?.workspaceFolderValue ??
                    inspected?.workspaceValue ??
                    inspected?.globalValue;
                const raw = (explicit ?? "python").trim();
                if (!raw)
                    return "python";
                if (path.isAbsolute(raw))
                    return raw;
                if (raw.includes(path.sep) || raw.includes("/")) {
                    return path.resolve(cwd, raw);
                }
                return raw;
            },
            timeoutMinutesResolver: () => {
                const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
                const value = cfg.get("checkoutPollTimeoutMinutes", CheckoutPollService_1.DEFAULT_TIMEOUT_MINUTES);
                if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
                    return CheckoutPollService_1.DEFAULT_TIMEOUT_MINUTES;
                }
                return Math.min(value, 1440);
            },
        });
        pollService.start();
        context.subscriptions.push(pollService);
    });
    // Set 030 Session 5: flip scanState to "ready" once activation
    // finishes. `setImmediate` yields the event loop one tick so the
    // synchronous body of activate() returns first (VS Code measures
    // extension-activation time; we don't want the scan in that
    // metric). The tree provider's `onDidChange` subscription on
    // scanState triggers a re-render the moment the phase flips, so
    // the loading sentinel is replaced by real rows the same frame.
    setImmediate(() => {
        scanState.setReady();
    });
    // Show onboarding on first activation in a workspace with no session sets
    const hasSeenOnboarding = context.workspaceState.get("hasSeenOnboarding", false);
    if (!hasSeenOnboarding) {
        const roots = (0, fileSystem_1.discoverRoots)();
        const hasSessionSets = roots.some((r) => {
            try {
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