import * as vscode from "vscode";
import * as path from "path";
import { registerOpenFileCommands } from "./commands/openFile";
import { registerCopyPromptCommands } from "./commands/copyPromptCommands";
import { registerTroubleshootCommand } from "./commands/troubleshoot";
import { registerCancelLifecycleCommands } from "./commands/cancelLifecycleCommands";
import { registerNewModuleCommand } from "./commands/newModule";
import { registerSessionTerminalCommands } from "./commands/sessionTerminalCommands";
import { registerBootstrapProjectCommand } from "./commands/bootstrapProject";
import { registerInstallAiRouterCommand } from "./commands/installAiRouter";
import { registerWorkExplorerTreeCommands } from "./commands/workExplorerTreeCommands";
import { discoverRoots, listSessionSetDirNames } from "./utils/fileSystem";
import { WorkExplorerTreeProvider } from "./providers/WorkExplorerTreeProvider";

const SESSION_SETS_REL = path.join("docs", "session-sets");

export function activate(context: vscode.ExtensionContext): void {
  // Activation must NOT bail when no folder is open: the bootstrap and
  // install commands exist for exactly that fresh-window case.
  // Everything below is folder-defensive — discoverRoots() returns []
  // with no folders, and onDidChangeWorkspaceFolders re-binds the
  // folder-dependent runtime the moment a folder is added.

  // createTreeView rather than registerTreeDataProvider because the
  // former returns the TreeView handle that .message and reveal() live on.
  const treeProvider = new WorkExplorerTreeProvider(context.extensionUri);
  context.subscriptions.push({ dispose: () => treeProvider.dispose() });
  const treeView = vscode.window.createTreeView(WorkExplorerTreeProvider.viewType, {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);
  // Scan faults (invalid manifest, projections that failed) render
  // directly above the rows, where the operator is already looking; the
  // provider reports on every recompute including the clean one, so a
  // repaired workspace clears the message.
  treeProvider.onDiagnostic((message) => {
    treeView.message = message;
  });

  // First-run on-ramp: the first time the view becomes visible in a
  // workspace with no session sets at all, offer to run Set Up New
  // Project — one confirmation prompt, once per window, never silently.
  // A declined offer stays declined for this window; the command remains
  // in the palette.
  let setupOffered = false;
  const maybeOfferSetup = async (): Promise<void> => {
    if (setupOffered || !treeView.visible) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root || listSessionSetDirNames(root).length > 0) return;
    setupOffered = true;
    const choice = await vscode.window.showInformationMessage(
      "This workspace has no Dabbler session sets yet. Set it up now? " +
        "This creates the workspace .venv, installs the ai-router into " +
        "it, and scaffolds the plan and decomposition session sets.",
      "Set Up New Project",
      "Not Now",
    );
    if (choice === "Set Up New Project") {
      void vscode.commands.executeCommand("dabbler.setupNewProject");
    }
  };
  context.subscriptions.push(
    treeView.onDidChangeVisibility(() => void maybeOfferSetup()),
  );
  // The view can already be visible at activation (restored layout).
  void maybeOfferSetup();

  // --- File watchers ---
  let watcherSubs: vscode.Disposable[] = [];
  let boundRoots = new Set<string>();

  function bindWatchers(): void {
    const roots = discoverRoots();
    const want = new Set(roots.map((r) => r.toLowerCase()));
    if (want.size === boundRoots.size && [...want].every((r) => boundRoots.has(r))) {
      return;
    }
    for (const sub of watcherSubs) sub.dispose();
    watcherSubs = [];
    boundRoots = want;
    for (const root of roots) {
      const sessionSetsAbs = path.join(root, SESSION_SETS_REL);
      // Exactly the artifact set the projection derives from (plus the
      // cancel/restore markers). The projection cache is mtime-keyed on
      // the same files, so a watcher tick re-projects only changed sets.
      const pattern = new vscode.RelativePattern(
        sessionSetsAbs,
        "**/{spec.md,session-state.json,activity-log.json,change-log.md,CANCELLED.md,RESTORED.md}",
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onEvent = () => {
        treeProvider.refresh();
      };
      watcher.onDidCreate(onEvent);
      watcher.onDidDelete(onEvent);
      watcher.onDidChange(onEvent);
      watcherSubs.push(watcher);
      context.subscriptions.push(watcher);

      // The module-tree watcher: docs/modules.yaml drives grouping and
      // the manifest diagnostic; the legacy root plan flips the
      // pseudo-module's visibility. In-workspace globs ride VS Code's
      // existing recursive watcher — event subscriptions, not a new OS
      // watch.
      const modulesPattern = new vscode.RelativePattern(
        root,
        "{docs/modules.yaml,docs/planning/project-plan.md}",
      );
      const modulesWatcher = vscode.workspace.createFileSystemWatcher(modulesPattern);
      modulesWatcher.onDidCreate(onEvent);
      modulesWatcher.onDidDelete(onEvent);
      modulesWatcher.onDidChange(onEvent);
      watcherSubs.push(modulesWatcher);
      context.subscriptions.push(modulesWatcher);
    }
  }

  const refreshAll = () => {
    bindWatchers();
    treeProvider.refresh();
  };

  // Defensive: a thrown error from createFileSystemWatcher (e.g. a
  // permission issue on a workspace folder) shouldn't kill activation.
  try {
    bindWatchers();
  } catch (err) {
    console.error(
      "[dabbler-ai-orchestration] activation: bindWatchers() threw — " +
        "live refresh may not work; manual refresh still functions.",
      err,
    );
  }
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshAll));
  const pollHandle = setInterval(refreshAll, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });

  context.subscriptions.push(
    // The explicit refresh is HARD: it also drops the mtime-keyed
    // projection cache, so it recovers from anything (a projection
    // failure cached against an unchanged set, a python install that
    // just finished).
    vscode.commands.registerCommand("dabblerSessionSets.refresh", () => {
      bindWatchers();
      treeProvider.refresh(true);
    }),
  );

  // --- Feature command groups ---
  // Each register call is wrapped so a throw in one group does not
  // silently skip the registrations that follow.
  const safeRegister = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      console.error(
        `[dabbler-ai-orchestration] activation failed in ${name} — ` +
          `subsequent command groups still register.`,
        err,
      );
    }
  };

  safeRegister("workExplorerTreeCommands", () =>
    registerWorkExplorerTreeCommands(context),
  );
  safeRegister("openFileCommands", () => registerOpenFileCommands(context));
  safeRegister("copyPromptCommands", () => registerCopyPromptCommands(context));
  safeRegister("sessionTerminalCommands", () =>
    registerSessionTerminalCommands(context),
  );
  safeRegister("cancelLifecycleCommands", () =>
    registerCancelLifecycleCommands(context, { refreshView: refreshAll }),
  );
  safeRegister("newModuleCommand", () =>
    registerNewModuleCommand(context, { refreshView: refreshAll }),
  );
  safeRegister("bootstrapProjectCommand", () =>
    registerBootstrapProjectCommand(context),
  );
  safeRegister("installAiRouterCommand", () =>
    registerInstallAiRouterCommand(context),
  );
  safeRegister("troubleshootCommand", () => registerTroubleshootCommand(context));
}

export function deactivate(): void {}
