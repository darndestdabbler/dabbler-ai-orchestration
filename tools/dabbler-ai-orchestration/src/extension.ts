import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSetsProvider } from "./providers/SessionSetsProvider";
import { discoverRoots, readAllSessionSets } from "./utils/fileSystem";
import { registerOpenFileCommands } from "./commands/openFile";
import { registerCopyCommands } from "./commands/copyCommand";
import { registerGitScaffoldCommand } from "./commands/gitScaffold";
import { registerTroubleshootCommand } from "./commands/troubleshoot";
import { registerWizardCommands } from "./wizard/WizardPanel";
import { registerCostDashboardCommand } from "./dashboard/CostDashboard";
import { SessionSet } from "./types";

const SESSION_SETS_REL = path.join("docs", "session-sets");

function evaluateSupportContextKeys(allSets: SessionSet[]): void {
  const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
  const uatPref = cfg.get<string>("uatSupport.enabled", "auto");
  const e2ePref = cfg.get<string>("e2eSupport.enabled", "auto");

  const anyUat = allSets.some((s) => s.config?.requiresUAT);
  const anyE2e = allSets.some((s) => s.config?.requiresE2E);

  const uatActive = uatPref === "always" || (uatPref === "auto" && anyUat);
  const e2eActive = e2ePref === "always" || (e2ePref === "auto" && anyE2e);

  vscode.commands.executeCommand("setContext", "dabblerSessionSets.uatSupportActive", uatActive);
  vscode.commands.executeCommand("setContext", "dabblerSessionSets.e2eSupportActive", e2eActive);
}

export function activate(context: vscode.ExtensionContext): void {
  if (!vscode.workspace.workspaceFolders?.length) return;

  const provider = new SessionSetsProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("dabblerSessionSets", provider)
  );

  const evaluateContextKeys = () => {
    evaluateSupportContextKeys(provider._cache ?? readAllSessionSets());
  };

  const originalRefresh = provider.refresh.bind(provider);
  provider.refresh = () => {
    originalRefresh();
    setImmediate(evaluateContextKeys);
  };
  evaluateContextKeys();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("dabblerSessionSets.uatSupport.enabled") ||
        e.affectsConfiguration("dabblerSessionSets.e2eSupport.enabled")
      ) {
        evaluateContextKeys();
      }
    })
  );

  // --- File watchers ---
  let watcherSubs: vscode.Disposable[] = [];
  let boundRoots = new Set<string>();

  function bindWatchers(): void {
    const roots = discoverRoots();
    const want = new Set(roots.map((r) => r.toLowerCase()));
    if (
      want.size === boundRoots.size &&
      [...want].every((r) => boundRoots.has(r))
    ) {
      return;
    }
    for (const sub of watcherSubs) sub.dispose();
    watcherSubs = [];
    boundRoots = want;
    for (const root of roots) {
      const sessionSetsAbs = path.join(root, SESSION_SETS_REL);
      const pattern = new vscode.RelativePattern(
        sessionSetsAbs,
        "**/{spec.md,session-state.json,activity-log.json,change-log.md,*-uat-checklist.json}"
      );
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

  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.refresh", refreshAll)
  );

  // --- Register feature command groups ---
  registerOpenFileCommands(context);
  registerCopyCommands(context);
  registerGitScaffoldCommand(context);
  registerTroubleshootCommand(context);
  registerWizardCommands(context);
  registerCostDashboardCommand(context);

  // Show onboarding on first activation in a workspace with no session sets
  const hasSeenOnboarding = context.workspaceState.get<boolean>("hasSeenOnboarding", false);
  if (!hasSeenOnboarding) {
    const roots = discoverRoots();
    const hasSessionSets = roots.some((r) => {
      try {
        return fs.existsSync(path.join(r, SESSION_SETS_REL));
      } catch {
        return false;
      }
    });
    if (!hasSessionSets) {
      context.workspaceState.update("hasSeenOnboarding", true);
      vscode.commands.executeCommand("dabbler.getStarted");
    }
  }
}

export function deactivate(): void {}
