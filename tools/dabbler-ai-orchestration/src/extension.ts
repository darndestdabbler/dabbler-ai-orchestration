import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSetsProvider } from "./providers/sessionSetsProvider";
import { ScanState } from "./providers/scanState";
import { registerMigrateSetCommand } from "./commands/migrateSet";
import { discoverRoots, readAllSessionSets } from "./utils/fileSystem";
import { registerOpenFileCommands } from "./commands/openFile";
import { registerCopyCommands } from "./commands/copyCommand";
import { registerGitScaffoldCommand } from "./commands/gitScaffold";
import { registerCopyAdoptionBootstrapPromptCommand } from "./commands/copyAdoptionBootstrapPrompt";
import { registerTroubleshootCommand } from "./commands/troubleshoot";
import { registerCancelLifecycleCommands } from "./commands/cancelLifecycleCommands";
import { registerInstallAiRouterCommands } from "./commands/installAiRouterCommands";
import { registerWizardCommands } from "./wizard/WizardPanel";
import { registerCostDashboardCommand } from "./dashboard/CostDashboard";
import { registerConfigEditorCommand } from "./configEditor/ConfigEditorPanel";
import { registerFlagDecisionForReview } from "./commands/flagDecisionForReview";
import { registerScanAnnotationsForActiveSet } from "./commands/scanAnnotationsForActiveSet";
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

  // Set 030 Session 5: scanState lifecycle. Flip to "loading" BEFORE
  // we register the tree provider so the very first `getChildren()`
  // sees `phase === "loading"` and returns the sentinel — no
  // welcome-CTA flash window. The async `setImmediate` below flips
  // to "ready" after the synchronous body of `activate` returns,
  // which lets the tree provider's reactive `onDidChange` refresh
  // swap the sentinel for real rows on the next render tick.
  const scanState = new ScanState();
  context.subscriptions.push({ dispose: () => scanState.dispose() });
  scanState.setLoading();

  const provider = new SessionSetsProvider(context.extensionUri, scanState);
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
  // v0.13.2: defensive — `evaluateContextKeys()` calls `readAllSessionSets()`
  // which iterates every session set's session-state.json. A single
  // malformed file would otherwise propagate up and abort activation
  // before any feature commands register. Catch + log instead so the
  // tree may render with stale context-key flags (UAT / E2E menu
  // visibility) but the rest of the extension stays alive.
  try {
    evaluateContextKeys();
  } catch (err) {
    console.error(
      "[dabbler-ai-orchestration] activation: evaluateContextKeys() threw — " +
        "context keys (UAT/E2E support flags) may be stale, but command " +
        "registration continues. Investigate via the dev console stack trace.",
      err,
    );
  }

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
      const pattern = new vscode.RelativePattern(
        sessionSetsAbs,
        "**/{spec.md,session-state.json,session-events.jsonl,activity-log.json,change-log.md,CANCELLED.md,*-uat-checklist.json}"
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

  // Defensive: bindWatchers iterates roots and creates filesystem
  // watchers; a thrown error from createFileSystemWatcher (e.g., a
  // permission issue on a workspace folder) shouldn't kill activation.
  try {
    bindWatchers();
  } catch (err) {
    console.error(
      "[dabbler-ai-orchestration] activation: bindWatchers() threw — " +
        "live tree-refresh on file changes may not work, but command " +
        "registration continues. Manual refresh via " +
        "`Dabbler: Refresh Session Sets` still functions.",
      err,
    );
  }
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshAll));
  const pollHandle = setInterval(refreshAll, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });

  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.refresh", refreshAll)
  );

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
  const safeRegister = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      console.error(
        `[dabbler-ai-orchestration] activation failed in ${name} — ` +
          `subsequent commands still attempt to register; the failed ` +
          `group's commands will not be available until the underlying ` +
          `error is fixed.`,
        err,
      );
    }
  };

  safeRegister("registerOpenFileCommands", () => registerOpenFileCommands(context));
  safeRegister("registerCopyCommands", () => registerCopyCommands(context));
  safeRegister("registerGitScaffoldCommand", () => registerGitScaffoldCommand(context));
  safeRegister("registerCopyAdoptionBootstrapPromptCommand", () =>
    registerCopyAdoptionBootstrapPromptCommand(context),
  );
  safeRegister("registerTroubleshootCommand", () => registerTroubleshootCommand(context));
  safeRegister("registerWizardCommands", () => registerWizardCommands(context));
  safeRegister("registerCostDashboardCommand", () => registerCostDashboardCommand(context));
  safeRegister("registerCancelLifecycleCommands", () =>
    registerCancelLifecycleCommands(context, { refreshView: refreshAll }),
  );
  safeRegister("registerInstallAiRouterCommands", () =>
    registerInstallAiRouterCommands(context),
  );
  safeRegister("registerConfigEditorCommand", () =>
    registerConfigEditorCommand(context),
  );
  safeRegister("registerFlagDecisionForReview", () =>
    registerFlagDecisionForReview(context),
  );
  safeRegister("registerScanAnnotationsForActiveSet", () =>
    registerScanAnnotationsForActiveSet(context),
  );
  safeRegister("registerMigrateSetCommand", () =>
    registerMigrateSetCommand(context, { refreshView: refreshAll }),
  );

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
