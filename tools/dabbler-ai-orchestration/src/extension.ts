import * as vscode from "vscode";
import * as path from "path";
import { registerOpenFileCommands } from "./commands/openFile";
import { registerTroubleshootCommand } from "./commands/troubleshoot";
import { registerCancelLifecycleCommands } from "./commands/cancelLifecycleCommands";
import { registerNewModuleCommand } from "./commands/newModule";
import { registerSessionCommands } from "./commands/sessionCommands";
import { registerBootstrapProjectCommand } from "./commands/bootstrapProject";
import {
  DecisionAnnouncer,
  badgeFor,
  defaultOwedDecisionUi,
  offerDecision,
  registerOwedDecisionCommands,
} from "./commands/owedDecisionCommands";
import { installTerminalShim } from "./router/terminalShim";
import { openDabblerTerminal } from "./router/dabblerTerminal";
import { registerWorkExplorerTreeCommands } from "./commands/workExplorerTreeCommands";
import { SESSIONS_REL, discoverRoots, hasSessionsRoot } from "./utils/fileSystem";
import { RUNS_REL } from "./utils/projection";
import { SolutionTreeProvider } from "./providers/SolutionTreeProvider";
import type { SolutionNode } from "./providers/solutionTreeModel";
import {
  openRepository,
  openRepositoryInNewWindow,
  openSolutionWorkspace,
  revealRepository,
} from "./commands/openRepository";
import { WorkExplorerTreeProvider } from "./providers/WorkExplorerTreeProvider";
import { productionRouter } from "./router/host";

export function activate(context: vscode.ExtensionContext): void {
  // Activation must NOT bail when no folder is open: the bootstrap and
  // install commands exist for exactly that fresh-window case.
  // Everything below is folder-defensive — discoverRoots() returns []
  // with no folders, and onDidChangeWorkspaceFolders re-binds the
  // folder-dependent runtime the moment a folder is added.

  // createTreeView rather than registerTreeDataProvider because the
  // former returns the TreeView handle that .message and reveal() live on.
  const solutionProvider = new SolutionTreeProvider(
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  );
  context.subscriptions.push(
    solutionProvider,
    vscode.window.createTreeView(SolutionTreeProvider.viewType, {
      treeDataProvider: solutionProvider,
      showCollapseAll: true,
    }),
  );

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
  // What the framework is waiting on a person for, said in the three places
  // a person might be looking: the badge on the activity bar, a toast for
  // one that is newly open, and the row itself (which carries the brief and
  // the command to answer it).
  registerOwedDecisionCommands(context);
  const announcer = new DecisionAnnouncer();
  treeProvider.onScan((repositories) => {
    treeView.badge = badgeFor(repositories);
    for (const target of announcer.fresh(repositories)) {
      void offerDecision(target, defaultOwedDecisionUi(), productionRouter()).then(
        (answered) => {
          if (answered) treeProvider.refresh();
        },
      );
    }
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
    if (!root || hasSessionsRoot(root)) return;
    setupOffered = true;
    const choice = await vscode.window.showInformationMessage(
      // Survey finding F2, and a correctness fix rather than copy: this
      // claimed setup creates a .venv and installs the router, which it has
      // not done since the cutover bundled the router into the extension.
      // It is the first sentence a new operator reads.
      "This workspace has no Dabbler sessions yet. Set it up now? " +
        "Nothing is installed: this writes the guidance files, the ignore " +
        "rule and the first two sessions, and commits them.",
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
      // Exactly the artifacts the projection derives from. The
      // projection cache is mtime-keyed on the same files, so a watcher
      // tick re-projects only repositories that actually changed.
      //
      // The run records are watched as well as the sessions root, and
      // that is a requirement rather than a nicety: the task level folds
      // step-execution.jsonl, and a task row up to 30 seconds behind the
      // step it describes is the untrustworthy surface this view exists
      // to replace. A step opening or closing must move the row on the
      // event.
      const patterns = [
        new vscode.RelativePattern(
          path.join(root, SESSIONS_REL),
          "{sessions.json,activity-log.json,session-plan.md,change-log.md}",
        ),
        // rounds.jsonl for the same reason: a round landing, or the cap
        // terminal being recorded, is what the verification row folds,
        // and it has to move on the event too.
        new vscode.RelativePattern(
          path.join(root, RUNS_REL),
          "*/{step-execution.jsonl,approved-plan.json,rounds.jsonl}",
        ),
        // A driven session's stop lands on run.json and is the attention
        // row; a step being accepted moves the same file.
        new vscode.RelativePattern(path.join(root, RUNS_REL), "*/driver/run.json"),
      ];
      const onEvent = () => {
        treeProvider.refresh();
      };
      for (const pattern of patterns) {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate(onEvent);
        watcher.onDidDelete(onEvent);
        watcher.onDidChange(onEvent);
        watcherSubs.push(watcher);
        context.subscriptions.push(watcher);
      }
    }
  }

  // The *Dabbler* terminal, for the repository this window is showing: the
  // framework's background work, beside the engine's own CLI and never
  // carrying a word of what it says. One per window, disposed with the
  // extension, and not shown on creation -- it is something the operator
  // looks at, not something that takes focus while they are typing.
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot && hasSessionsRoot(workspaceRoot)) {
    context.subscriptions.push(openDabblerTerminal(workspaceRoot));
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
  // The backstop behind the file watchers, and now a declared number rather
  // than a literal: a repository whose sessions are minutes long and one
  // whose rounds take ten of them cannot share a refresh rate.
  const pollHandle = setInterval(
    refreshAll,
    Math.max(
      5,
      vscode.workspace
        .getConfiguration("dabbler")
        .get<number>("refreshSeconds", 30),
    ) * 1000,
  );
  context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });

  context.subscriptions.push(
    // The explicit refresh is HARD: it also drops the mtime-keyed
    // projection cache, so it recovers from anything (a projection
    // failure cached against an unchanged set, a python install that
    // just finished).
    vscode.commands.registerCommand("dabblerSolution.openWorkspace", () =>
      openSolutionWorkspace(
        productionRouter(),
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      ),
    ),
    vscode.commands.registerCommand(
      "dabblerSolution.openRepository",
      (node?: SolutionNode) =>
        openRepository({ node, projection: solutionProvider.currentProjection() }),
    ),
    vscode.commands.registerCommand(
      "dabblerSolution.openRepositoryInNewWindow",
      (node?: SolutionNode) =>
        openRepositoryInNewWindow({
          node,
          projection: solutionProvider.currentProjection(),
        }),
    ),
    vscode.commands.registerCommand(
      "dabblerSolution.revealRepository",
      (node?: SolutionNode) =>
        revealRepository({ node, projection: solutionProvider.currentProjection() }),
    ),
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
  // Start launches the driver, Stop and Send interrupt it, Close runs the
  // gates. The drives registry is a subscription, so a driver this window
  // started dies with the window rather than running on unseen.
  safeRegister("sessionCommands", () => {
    registerSessionCommands(context);
  });
  safeRegister("cancelLifecycleCommands", () =>
    registerCancelLifecycleCommands(context, { refreshView: refreshAll }),
  );
  safeRegister("newModuleCommand", () =>
    registerNewModuleCommand(context, { refreshView: refreshAll }),
  );
  safeRegister("bootstrapProjectCommand", () =>
    registerBootstrapProjectCommand(context),
  );
  safeRegister("troubleshootCommand", () => registerTroubleshootCommand(context));
  // The integrated terminal gets `dabbler` on PATH, run on the extension
  // host's own Node. It is registered like a command because it can fail the
  // same way one can, and for the same reason it must not take activation
  // down with it: the extension's own router calls do not go through the
  // shim, so a failure here costs the terminal convenience and nothing else.
  safeRegister("terminalShim", () => {
    installTerminalShim(context);
  });
}

export function deactivate(): void {}
