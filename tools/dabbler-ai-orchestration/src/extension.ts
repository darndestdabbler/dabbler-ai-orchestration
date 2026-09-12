import * as vscode from "vscode";
import * as path from "path";
import { registerOpenFileCommands } from "./commands/openFile";
import { registerTroubleshootCommand } from "./commands/troubleshoot";
import { registerCancelLifecycleCommands } from "./commands/cancelLifecycleCommands";
import { registerNewModuleCommand } from "./commands/newModule";
import {
  ENGINES,
  defaultDriveLauncher,
  defaultSessionRunUi,
  nextFocusedModule,
  registerSessionCommands,
  runStartFocusedSession,
  sharedDrives,
  startFromRequest,
} from "./commands/sessionCommands";
import { registerBootstrapProjectCommand } from "./commands/bootstrapProject";
import {
  DecisionAnnouncer,
  badgeFor,
  defaultOwedDecisionUi,
  offerDecision,
  registerOwedDecisionCommands,
} from "./commands/owedDecisionCommands";
import { installTerminalShim } from "./router/terminalShim";
import {
  disposeDabblerTerminals,
  openDabblerTerminal,
  revealDabblerTerminal,
  revealOnSessionStart,
  watchClosedTerminals,
} from "./router/dabblerTerminal";
import {
  asRepositoryNode,
  registerWorkExplorerTreeCommands,
} from "./commands/workExplorerTreeCommands";
import { SESSIONS_REL, type SessionsRepository, discoverRoots, hasSessionsRoot } from "./utils/fileSystem";
import { RUNS_REL } from "./utils/projection";
import { SolutionTreeProvider } from "./providers/SolutionTreeProvider";
import type { SolutionNode } from "./providers/solutionTreeModel";
import {
  cloneRepository,
  createRepository,
  identifyRemote,
  locateRepository,
  openRepository,
  openRepositoryInNewWindow,
  openSolutionWorkspace,
  revealRepository,
} from "./commands/openRepository";
import { openModule } from "./commands/openModule";
import { endGrant } from "./commands/moduleGrant";
import {
  refreshRecord,
  chosenEngineIn,
  setEngine,
  setRoleModel,
  setTransport,
} from "./commands/configurationCommands";
import { showImpact } from "./commands/showImpact";
import { packModule } from "./commands/packModule";
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
  // The repository this window is showing, as the last scan read it: what
  // Start Focused Session starts from, and what the Solution Explorer is
  // told the next session's module is.
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const sameRoot = (a: string, b: string): boolean =>
    path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  let workspaceRepository: SessionsRepository | undefined;
  let startRequestConsumed = false;
  treeProvider.onScan((repositories) => {
    treeView.badge = badgeFor(repositories);
    // A session starting anywhere -- the operator's own CLI, most often --
    // brings the framework's terminal into view. The scan is the reading
    // that knows; the transition rule is the terminal's.
    for (const repository of repositories) {
      revealOnSessionStart(repository.root, repository.currentSession);
    }
    workspaceRepository =
      workspaceRoot === undefined ? undefined : repositories.find((r) => sameRoot(r.root, workspaceRoot));
    // The module row the one-click start sits on: only in the repository's
    // own window, and only for the module the next session's plan names.
    solutionProvider.setNextSessionModule(
      workspaceRepository && workspaceRepository.checkoutModule === null
        ? nextFocusedModule(workspaceRepository)
        : null,
    );
    // A focused start in the repository's window left its choices here and
    // opened this window on them: the AI's terminal opens now, with the
    // sentence typed. Once per activation; a stale request is dropped.
    if (workspaceRepository && !startRequestConsumed) {
      startRequestConsumed = true;
      void startFromRequest(workspaceRepository, defaultSessionRunUi(), defaultDriveLauncher(), sharedDrives());
    }
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
        // row; a step being accepted moves the same file. plan.json is the
        // engine's answer to the plan step and the only file the Work row's
        // nested steps are read from: the report that writes it touches
        // nothing else, so it must fire on its own or the steps wait for
        // the backstop poll. Measured under VS Code (session 126): with
        // run.json alone watched, the steps appeared only at the next
        // `next`, ten seconds later.
        new vscode.RelativePattern(path.join(root, RUNS_REL), "*/driver/{run.json,plan.json}"),
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
  // Start opens (and shows) one for the repository it was pressed on, so a
  // repository bootstrapped after activation, a second folder or a worktree
  // is not left without one.
  context.subscriptions.push(disposeDabblerTerminals(), watchClosedTerminals());
  // The drivers this window started end with it. The registry always had
  // the dispose that kills them; nothing registered it, so a driver -- and
  // the engine, the suite or the verification round under it -- outlived
  // the window that could see and stop it.
  context.subscriptions.push(sharedDrives());
  for (const root of discoverRoots()) {
    if (hasSessionsRoot(root)) openDabblerTerminal(root);
  }

  // The way back to it. Activation creates the terminal and does not show
  // it, which makes closing it the easiest thing in the world to do by
  // accident -- and until this there was nothing that opened another. A
  // session driven from a CLI the person opened themselves could otherwise
  // run with no sight of what the framework was doing at all.
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.showFrameworkTerminal", async (arg: unknown) => {
      const roots = discoverRoots().filter(hasSessionsRoot);
      const asked = asRepositoryNode(arg)?.repository.root;
      const root =
        asked ??
        (roots.length <= 1
          ? roots[0]
          : await vscode.window.showQuickPick(roots, {
              title: "Which repository's Dabbler terminal?",
              ignoreFocusOut: true,
            }));
      if (root === undefined) return;
      revealDabblerTerminal(root);
    }),
  );

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
    // A module row of a multi-module solution: the focused checkout, in a
    // new window. The router makes the clone and names the path.
    vscode.commands.registerCommand(
      "dabblerSolution.openModule",
      (node?: SolutionNode) =>
        openModule(productionRouter(), { node, projection: solutionProvider.currentProjection() }),
    ),
    // The module row the next session's plan names: one click opens the
    // module's folder with its AI in it. The choices are asked here and
    // carried to the window that opens; nothing is typed in this one.
    vscode.commands.registerCommand("dabblerSolution.startFocusedSession", async (node?: SolutionNode) => {
      if (!node || node.kind !== "module" || !workspaceRepository) return;
      await runStartFocusedSession(workspaceRepository, node.slug, defaultSessionRunUi(), productionRouter());
    }),
    // A grant is asked for by the session (`--request-grant`) and answered
    // on the Work Explorer; ending one is the router's refusal to honour
    // while the sibling's roots hold changes. The tree refreshes: the badge
    // moves.
    vscode.commands.registerCommand("dabblerSolution.revokeModule", async (node?: SolutionNode) => {
      await endGrant(productionRouter(), { node, projection: solutionProvider.currentProjection() });
      solutionProvider.refresh();
    }),
    // The Configuration section's three controls. Two settings, two
    // controls, and a third for whichever model row was clicked: the engine
    // every one of them is the router's, because every one of them has to be
    // readable from a terminal as well as from this pane. Each refreshes the
    // tree, because the row the operator just set is the one they are
    // looking at.
    vscode.commands.registerCommand("dabblerSolution.setEngine", async (node?: SolutionNode) => {
      // What Start Session can open is passed IN rather than imported by the
      // command: the pick reads this extension's setting and Start Session
      // reads it back, and a module that imported the other's list would
      // close the loop between the two.
      await setEngine(
        productionRouter(),
        { node, projection: solutionProvider.currentProjection() },
        ENGINES.map((entry) => entry.engine),
        () => solutionProvider.refresh(),
      );
      solutionProvider.refresh();
    }),
    vscode.commands.registerCommand("dabblerSolution.setTransport", (node?: SolutionNode) =>
      setTransport(
        productionRouter(),
        { node, projection: solutionProvider.currentProjection() },
        () => solutionProvider.refresh(),
      ),
    ),
    // The one thing in the Configuration section that reaches a vendor or a
    // seat. It asks first, with the cost in the question -- which is nothing
    // -- and runs in a terminal rather than in-process, because it is work an
    // operator should watch happen.
    vscode.commands.registerCommand("dabblerSolution.refreshRecord", (node?: SolutionNode) =>
      refreshRecord({ node, projection: solutionProvider.currentProjection() }),
    ),
    vscode.commands.registerCommand("dabblerSolution.setRoleModel", (node?: SolutionNode) =>
      setRoleModel(
        productionRouter(),
        { node, projection: solutionProvider.currentProjection() },
        () => solutionProvider.refresh(),
      ),
    ),
    // What a change under the module would reach: the router's impact plan
    // for a hypothetical change, shown rather than computed here.
    vscode.commands.registerCommand("dabblerSolution.showImpact", (node?: SolutionNode) =>
      showImpact(productionRouter(), { node, projection: solutionProvider.currentProjection() }),
    ),
    // The module's committed package, asked for out of band: the same pack
    // the framework runs at the candidate, so a sibling's next session can
    // consume it. The tree refreshes because the pack writes a record.
    vscode.commands.registerCommand("dabblerSolution.packModule", async (node?: SolutionNode) => {
      await packModule(productionRouter(), { node, projection: solutionProvider.currentProjection() });
      solutionProvider.refresh();
    }),
    // The four an ABSENT row has: a row that could only say "not on this
    // machine" is where this journey used to end. Each writes through the
    // router -- the extension never authors the declaration itself -- and
    // each refreshes the tree, because the row the operator just acted on is
    // the one they are looking at.
    ...(
      [
        ["dabblerSolution.identifyRemote", identifyRemote],
        ["dabblerSolution.locateRepository", locateRepository],
        ["dabblerSolution.cloneRepository", cloneRepository],
        ["dabblerSolution.createRepository", createRepository],
      ] as const
    ).map(([name, run]) =>
      vscode.commands.registerCommand(name, (node?: SolutionNode) =>
        run(
          productionRouter(),
          { node, projection: solutionProvider.currentProjection() },
          () => solutionProvider.refresh(),
        ),
      ),
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
    registerSessionCommands(
      context,
      productionRouter(),
      // The engine this machine chose, read off the projection at the moment
      // the pick opens rather than at registration: the projection moves
      // whenever a declaration does, and a default captured once would go
      // stale the first time the operator changed it.
      defaultSessionRunUi(() => chosenEngineIn(solutionProvider.currentProjection())),
    );
  });
  safeRegister("cancelLifecycleCommands", () =>
    registerCancelLifecycleCommands(context, { refreshView: refreshAll }),
  );
  safeRegister("newModuleCommand", () =>
    registerNewModuleCommand(context, { refreshView: refreshAll }),
  );
  safeRegister("bootstrapProjectCommand", () =>
    registerBootstrapProjectCommand(context, { refreshView: refreshAll }),
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
