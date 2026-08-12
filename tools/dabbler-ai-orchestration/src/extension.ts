import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { registerMigrateSetCommand } from "./commands/migrateSet";
import { registerMigrateSetV4Command } from "./commands/migrateSetV4";
import { discoverRoots, readAllSessionSets } from "./utils/fileSystem";
import { registerOpenFileCommands } from "./commands/openFile";
import { registerCopyCommands } from "./commands/copyCommand";
import { registerCopyPromptCommands } from "./commands/copyPromptCommands";
import { registerGitScaffoldCommand } from "./commands/gitScaffold";
import { registerTrySampleProjectCommand } from "./commands/trySampleProject";
import { registerGitWorkflowCommands } from "./commands/gitWorkflow";
import { registerGitReleaseCommands } from "./commands/gitRelease";
import { registerTroubleshootCommand } from "./commands/troubleshoot";
import { registerCancelLifecycleCommands } from "./commands/cancelLifecycleCommands";
import { registerInstallAiRouterCommands } from "./commands/installAiRouterCommands";
import { registerCopilotSeatSetupCommand } from "./commands/copilotSeatSetupCommand";
// Set 123 S3: the Set 021 WizardPanel and, after it, the Getting Started
// webview form are both retired. Setup is now a terminal step — `python -m
// ai_router.verify_type` resolves what verifies the project and writes
// `project-verify-type.txt` — so `dabbler.getStarted` opens the static
// instructions doc that explains it, and nothing renders a form.
import { registerGetStartedCommand } from "./commands/gettingStartedDoc";
import { registerOpenModulePlanCommand } from "./commands/openModulePlan";
import { registerNewModuleCommand } from "./commands/newModule";
import { registerOpenModulesManifestCommand } from "./commands/openModulesManifest";
import { registerCopyModuleDecompositionPromptCommand } from "./commands/copyModuleDecompositionPrompt";
import { registerAssignLegacySetsCommand } from "./commands/assignLegacySets";
import { registerRenameModuleCommand } from "./commands/renameModule";
import { registerDeleteModuleCommand } from "./commands/deleteModule";
import { registerFlagDecisionForReview } from "./commands/flagDecisionForReview";
import { registerScanAnnotationsForActiveSet } from "./commands/scanAnnotationsForActiveSet";
import { registerRegenerateNarrationTemplatesCommand } from "./commands/regenerateNarrationTemplates";
import { registerResolveSetNumberCommand } from "./commands/resolveSetNumber";
import { registerUpgradeOlderSetsCommand } from "./commands/upgradeOlderSets";
import { hasSubCurrentSets } from "./providers/SessionSetsModel";
import { SessionSet } from "./types";
// Set 123 S3: the native TreeView is the only Work Explorer surface — the
// webview that used to stack above it is deleted.
import { WorkExplorerTreeProvider } from "./providers/WorkExplorerTreeProvider";
import { registerWorkExplorerTreeCommands } from "./commands/workExplorerTreeCommands";
// Set 110 Session 2: host-side startup buckets (S1's assigned residual).
import { markActivateEnd, markActivateStart } from "./utils/startupTiming";

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

  // Set 050 S4 (Explorer UX revision): gate the title-bar "Upgrade older
  // session sets" icon on at least one set being sub-current. Hidden
  // when every set is already on the current schema so the bulk action
  // never appears as a standing nag.
  vscode.commands.executeCommand(
    "setContext",
    "dabblerSessionSets.hasSubCurrentSets",
    hasSubCurrentSets(allSets),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  // Set 110 S2: first statement of activation, last statement below —
  // the `activate()` bucket S1 could only measure against a Node stub.
  markActivateStart();
  // Set 059: activation must NOT bail when no folder is open. The previous
  // `if (!workspaceFolders?.length) return;` guard left every command
  // unregistered in exactly the case "Set up a new project" / "Get Started"
  // exist for — a fresh window with no folder — so `dabbler.setupNewProject` /
  // `dabbler.getStarted` were never registered (operator UAT, 0.28.0). Everything
  // below is folder-defensive: `discoverRoots()` / `readAllSessionSets()` return
  // `[]` with no folders, the context-key / watcher blocks are wrapped in
  // try/catch, and `onDidChangeWorkspaceFolders(refreshAll)` re-runs the
  // folder-dependent runtime the moment a folder is added.

  // Set 123 S3: the native `TreeView` is now the ONLY Work Explorer surface.
  // The webview that used to stack above it — the Getting Started form and
  // the System Status strip — is deleted: setup resolves in the terminal via
  // `python -m ai_router.verify_type`, so there is no form left to render and
  // no `dabblerSessionSets.setupNeeded` presence rule to evaluate.
  //
  // `createTreeView` rather than `registerTreeDataProvider` because the
  // former returns the `TreeView` handle that `TreeView.message`,
  // `TreeView.badge` and `reveal()` live on.
  const treeProvider = new WorkExplorerTreeProvider(context.extensionUri);
  context.subscriptions.push({ dispose: () => treeProvider.dispose() });
  const treeView = vscode.window.createTreeView(WorkExplorerTreeProvider.viewType, {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);
  // Set 110 S3 (Session 2's assigned residual): a broken `docs/modules.yaml`
  // used to leave the tree showing a stale last-known-good module list with
  // NO explanation. `TreeView.message` renders directly above the rows, so
  // the explanation lands where the operator is already looking. The
  // provider reports on every recompute including the clean one, so a
  // repaired manifest clears the message rather than leaving the workspace
  // permanently accused.
  treeProvider.onDiagnostic((message) => {
    treeView.message = message;
  });

  // Set 111 S4: the guided-look walk reveals this view container from the
  // development-only walk companion (`scripts/walk-companion/`), NOT from
  // here. A reveal in this function could never fire: the extension declares
  // no explicit activation events and contributes views, so VS Code activates
  // it when the Dabbler view becomes VISIBLE — the very thing the reveal was
  // supposed to do. The companion carries `onStartupFinished` instead, which
  // keeps this extension's activation profile (the subject of Set 110)
  // unchanged for every real user and leaves no walk-specific code in the
  // product.

  const evaluateContextKeys = () => {
    const allSets = readAllSessionSets();
    evaluateSupportContextKeys(allSets);
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
      //
      // Set 115 S4 added `close-obligations.json` — the close-out
      // projection, which lives one level down in each set's `.dabbler/`
      // directory (hence the leading `**/`, which already covers it).
      // Without it the panel would not move until the 30-second poll
      // after an operator ran `close_preflight --write`, which is the
      // one moment they are watching that row on purpose. The path is
      // git-ignored, not unwatched: an ignored file still raises
      // filesystem events.
      const pattern = new vscode.RelativePattern(
        sessionSetsAbs,
        "**/{spec.md,session-state.json,session-events.jsonl,activity-log.json,change-log.md,CANCELLED.md,*-uat-checklist.json,close-obligations.json}"
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

      // Set 123 S3: the module-tree live-progress watcher. It invalidates the
      // tree on a change to any of the paths the module tier derives state
      // from — paths the spec.md-scoped session-sets watcher above does NOT
      // cover. The covered inputs:
      //   - docs/modules.yaml (Set 092 S2): edit → invalidate → repair updates
      //     the `TreeView.message` diagnostic + last-known-good tree without
      //     waiting for the poll;
      //   - docs/planning/project-plan.md: the pseudo-module's Plan node state
      //     (Set 093 — LEGACY_ROOT_PLAN_REL) flips present/missing live.
      // The engine files (CLAUDE.md / AGENTS.md / GEMINI.md) and the
      // `.venv/**/site-packages/ai_router/**` router-importable proxy were
      // DROPPED with the Getting Started form: they only ever greened that
      // form's Build section, and nothing in the tree derives from them, so
      // watching them now buys a no-op refresh (what the watcher contract
      // loses — recorded per spec Step 2).
      // In-workspace globs ride VS Code's existing recursive workspace
      // watcher, so this adds event subscriptions, not a new OS watch.
      const gsPattern = new vscode.RelativePattern(
        root,
        "{docs/modules.yaml,docs/planning/project-plan.md}",
      );
      const gsWatcher = vscode.workspace.createFileSystemWatcher(gsPattern);
      gsWatcher.onDidCreate(onEvent);
      gsWatcher.onDidDelete(onEvent);
      gsWatcher.onDidChange(onEvent);
      watcherSubs.push(gsWatcher);
      context.subscriptions.push(gsWatcher);
    }
  }

  const refreshAll = () => {
    bindWatchers();
    treeProvider.refresh();
    setImmediate(evaluateContextKeys);
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
  // workspaces some users hit "command not found" because an earlier
  // register call threw and the cascade skipped every registration after
  // it. Defensive logging via console.error means a future
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

  safeRegister("registerWorkExplorerTreeCommands", () =>
    registerWorkExplorerTreeCommands(context),
  );
  safeRegister("registerOpenFileCommands", () => registerOpenFileCommands(context));
  safeRegister("registerCopyCommands", () => registerCopyCommands(context));
  safeRegister("registerCopyPromptCommands", () => registerCopyPromptCommands(context));
  safeRegister("registerGitScaffoldCommand", () => registerGitScaffoldCommand(context));
  // Set 107 S1: the first-run entry point. Also replays the post-openFolder
  // landing (steps 6-7 of the contract) on the activation that follows.
  safeRegister("registerTrySampleProjectCommand", () =>
    registerTrySampleProjectCommand(context),
  );
  safeRegister("registerGitWorkflowCommands", () => registerGitWorkflowCommands(context));
  safeRegister("registerGitReleaseCommands", () => registerGitReleaseCommands(context));
  safeRegister("registerTroubleshootCommand", () => registerTroubleshootCommand(context));
  safeRegister("registerGetStartedCommand", () => registerGetStartedCommand(context));
  safeRegister("registerOpenModulePlanCommand", () =>
    registerOpenModulePlanCommand(context),
  );
  safeRegister("registerNewModuleCommand", () => registerNewModuleCommand(context));
  safeRegister("registerOpenModulesManifestCommand", () =>
    registerOpenModulesManifestCommand(context),
  );
  safeRegister("registerCopyModuleDecompositionPromptCommand", () =>
    registerCopyModuleDecompositionPromptCommand(context),
  );
  safeRegister("registerAssignLegacySetsCommand", () =>
    registerAssignLegacySetsCommand(context),
  );
  safeRegister("registerRenameModuleCommand", () =>
    registerRenameModuleCommand(context),
  );
  safeRegister("registerDeleteModuleCommand", () =>
    registerDeleteModuleCommand(context),
  );
  safeRegister("registerCancelLifecycleCommands", () =>
    registerCancelLifecycleCommands(context, { refreshView: refreshAll }),
  );
  safeRegister("registerInstallAiRouterCommands", () =>
    registerInstallAiRouterCommands(context),
  );
  safeRegister("registerCopilotSeatSetupCommand", () =>
    registerCopilotSeatSetupCommand(context),
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
  safeRegister("registerMigrateSetV4Command", () =>
    registerMigrateSetV4Command(context, { refreshView: refreshAll }),
  );

  // Set 049 S4 (rip-out): the orchestrator check-out / check-in
  // coordination layer is removed. Every engine (Claude, Copilot,
  // Codex, human) writes `engine + provider [+ model + effort]` into
  // `session-state.json`'s orchestrator block by invoking `python -m
  // ai_router.start_session` directly. The standalone Gemini / Copilot
  // / manual-override / release-check-out commands and their backing
  // CheckoutPollService + chatSessionId takeover modal +
  // ReadOnlyIntentService were retired alongside.
  //
  // Set 051 S3 (hook retirement): the Claude-only `SessionStart` hook
  // installer (`installOrchestratorHook.claudeCode`) was removed. Its
  // schema-drift scan duplicated Set 053's lifecycle advisory
  // (`start_session` / `close_session` → `summarize_drift`, which fires
  // for every orchestrator on every host), and its `start_session`
  // invocation was a non-load-bearing Claude-only convenience under the
  // portability rule. Drift coverage now rides the router lifecycle for
  // all engines; there is no editor-hook installer to register.
  //
  // The writer-log opener stays as a Command-Palette / right-click
  safeRegister("registerRegenerateNarrationTemplates", () =>
    registerRegenerateNarrationTemplatesCommand(context),
  );
  // Set 050 S4 (Feature 2 + Explorer UX revision): the number->slug
  // quick-input resolver and the repo-level bulk-upgrade title-bar
  // action.
  safeRegister("registerResolveSetNumberCommand", () =>
    registerResolveSetNumberCommand(context),
  );
  safeRegister("registerUpgradeOlderSetsCommand", () =>
    registerUpgradeOlderSetsCommand(context, { refreshView: refreshAll }),
  );

  // Show onboarding on first activation in a workspace with no session sets.
  // Set 059: gate on having a folder open. `workspaceState` does not persist
  // reliably in an empty (no-folder) window, so without this guard onboarding
  // would auto-pop on EVERY fresh no-folder launch — intrusive when the user
  // opened a blank window for something unrelated. With no folder the user
  // still reaches Get Started from the Command Palette; auto-onboarding is
  // reserved for an opened workspace.
  const hasSeenOnboarding = context.workspaceState.get<boolean>("hasSeenOnboarding", false);
  if (!hasSeenOnboarding && (vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
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

  // Set 110 S2: closes the `activate()` bucket. Deliberately the last
  // statement — everything above is what VS Code charges to activation.
  markActivateEnd();
}

export function deactivate(): void {}
