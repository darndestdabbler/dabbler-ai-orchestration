import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CustomSessionSetsView } from "./providers/CustomSessionSetsView";
import { ScanState } from "./providers/scanState";
import { registerMigrateSetCommand } from "./commands/migrateSet";
import { registerMigrateSetV4Command } from "./commands/migrateSetV4";
import { discoverRoots, readAllSessionSets } from "./utils/fileSystem";
import { registerOpenFileCommands } from "./commands/openFile";
import { registerCopyCommands } from "./commands/copyCommand";
import { registerCopyPromptCommands } from "./commands/copyPromptCommands";
import { registerGitScaffoldCommand } from "./commands/gitScaffold";
import { registerTroubleshootCommand } from "./commands/troubleshoot";
import { registerCancelLifecycleCommands } from "./commands/cancelLifecycleCommands";
import { registerInstallAiRouterCommands } from "./commands/installAiRouterCommands";
import { registerCopilotSeatSetupCommand } from "./commands/copilotSeatSetupCommand";
// Set 060 S3: the Set 021 WizardPanel (webview/wizard.html) is retired.
// `dabbler.getStarted` now focuses the Session Set Explorer (whose
// Getting Started form is the interactive surface, D1) and opens the
// static instructions doc (D8). The plan-import and session-gen-prompt
// commands the wizard module used to register survive as standalone
// registrations.
import { registerGetStartedCommand } from "./commands/gettingStartedDoc";
import { registerNewModuleCommand } from "./commands/newModule";
import { registerOpenModulesManifestCommand } from "./commands/openModulesManifest";
import { registerCopyModuleDecompositionPromptCommand } from "./commands/copyModuleDecompositionPrompt";
import { registerAssignLegacySetsCommand } from "./commands/assignLegacySets";
import { registerPlanImportCommand } from "./wizard/planImport";
import { registerSessionGenPromptCommand } from "./wizard/sessionGenPrompt";
import { registerCostDashboardCommand } from "./dashboard/CostDashboard";
import { registerConfigEditorCommand } from "./configEditor/ConfigEditorPanel";
import { registerFlagDecisionForReview } from "./commands/flagDecisionForReview";
import { registerScanAnnotationsForActiveSet } from "./commands/scanAnnotationsForActiveSet";
import { registerOpenOrchestratorWriterLog } from "./commands/openOrchestratorWriterLog";
import { registerRegenerateNarrationTemplatesCommand } from "./commands/regenerateNarrationTemplates";
import { registerExternalVerificationCommand } from "./commands/externalVerification";
import { registerResolveSetNumberCommand } from "./commands/resolveSetNumber";
import { registerUpgradeOlderSetsCommand } from "./commands/upgradeOlderSets";
import { registerSwitchTierCommand } from "./commands/switchTier";
import { registerSetupVerificationCommand } from "./commands/setupVerification";
import { hasSubCurrentSets } from "./providers/SessionSetsModel";
import { routesCost } from "./utils/routerConfig";
import { SessionSet } from "./types";

const SESSION_SETS_REL = path.join("docs", "session-sets");

// Set 052 S2 (D3 tier gate): project whether ANY open workspace folder
// routes through the AI router (resolvable `ai_router/router-config.yaml`)
// into a context key. The cost icon/command is contributed only when this
// is true — present on Full-tier routing repos, absent on Lightweight.
// Folder existence alone is insufficient; `routesCost` requires the
// config file itself.
function evaluateRouterCapabilityContextKey(): void {
  const folders = vscode.workspace.workspaceFolders ?? [];
  let routes = false;
  try {
    routes = folders.some((f) => routesCost(f.uri.fsPath));
  } catch {
    routes = false;
  }
  vscode.commands.executeCommand("setContext", "dabblerSessionSets.routesCost", routes);
}

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
  // Set 059: activation must NOT bail when no folder is open. The previous
  // `if (!workspaceFolders?.length) return;` guard left the webview view
  // provider AND every command unregistered in exactly the case "Set up a new
  // project" / "Get Started" exist for — a fresh window with no folder — so the
  // Session Sets view hung (no provider) and `dabbler.setupNewProject` /
  // `dabbler.getStarted` were never registered (operator UAT, 0.28.0). Everything
  // below is folder-defensive: `discoverRoots()` / `readAllSessionSets()` return
  // `[]` with no folders, the context-key / watcher blocks are wrapped in
  // try/catch, and `onDidChangeWorkspaceFolders(refreshAll)` re-runs the
  // folder-dependent runtime the moment a folder is added. The view renders its
  // Getting Started surface as the empty state instead of hanging.

  // Set 030 Session 5: scanState lifecycle. Flip to "loading" BEFORE
  // we register the tree provider so the very first `getChildren()`
  // sees `phase === "loading"` and returns the sentinel — no
  // empty-state flash window. The async `setImmediate` below flips
  // to "ready" after the synchronous body of `activate` returns,
  // which lets the tree provider's reactive `onDidChange` refresh
  // swap the sentinel for real rows on the next render tick.
  const scanState = new ScanState();
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
  const provider = new CustomSessionSetsView(context, scanState);
  context.subscriptions.push({ dispose: () => provider.dispose() });
  // Set 077 S2 (Feature 1, A1): `retainContextWhenHidden` was evaluated
  // here as belt-and-braces for the Getting Started tier-leak fix and
  // deliberately NOT enabled. The webview persists its form state via
  // `vscode.setState()` and re-seeds the tier from the durable
  // `.dabbler/tier` marker on every load (client.js / tierMarkerStore),
  // which covers BOTH teardown cases — hide/re-expand AND window reload —
  // whereas retainContextWhenHidden covers only the hide case, at a
  // standing memory cost VS Code's own guidance says to avoid when
  // getState/setState suffices.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CustomSessionSetsView.viewType, provider),
  );

  const evaluateContextKeys = () => {
    evaluateSupportContextKeys(readAllSessionSets());
    evaluateRouterCapabilityContextKey();
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

      // Set 060 Session 1: Getting Started form + module-tree live-progress
      // watcher. It invalidates the view on a change to any of the paths the
      // form and the module tree derive state from — paths the spec.md-scoped
      // session-sets watcher above does NOT cover. The covered inputs:
      //   - Build-section `structureBuilt`: CLAUDE.md / AGENTS.md / GEMINI.md
      //     (engine files) + .venv/**/site-packages/ai_router/** (the
      //     router-importable filesystem proxy);
      //   - docs/modules.yaml (Set 092 S2): edit → invalidate → repair updates
      //     the diagnostics strip + last-known-good tree without the poll;
      //   - docs/planning/project-plan.md: the pseudo-module's Plan node state
      //     (Set 093 — LEGACY_ROOT_PLAN_REL) flips present/missing live.
      // Set 094: the form shrank to two sections, so the retired step-2
      // (planPresent) and step-3 (sessionSetsPresent) inputs left the form.
      // project-plan.md is KEPT — its consumer moved from the form's step-2
      // indicator to the Set 093 pseudo-module Plan node (list mode). The
      // bare `docs/session-sets/*` glob was DROPPED: the getting-started →
      // list flip keys on a MATERIALIZED set (spec.md), which the
      // session-sets watcher above already catches; a bare numbered directory
      // no longer greens any form step, so watching it bought only a no-op
      // refresh (what the watcher contract loses — recorded per spec Step 2).
      // In-workspace globs ride VS Code's existing recursive workspace
      // watcher, so this adds event subscriptions, not a new OS watch —
      // even the .venv glob is cheap (and dead when a user excludes
      // .venv via files.watcherExclude, where the 30s poll backstops).
      const gsPattern = new vscode.RelativePattern(
        root,
        "{CLAUDE.md,AGENTS.md,GEMINI.md,docs/modules.yaml,docs/planning/project-plan.md,.venv/**/site-packages/ai_router/**}",
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
    provider.refresh();
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
  safeRegister("registerCopyPromptCommands", () => registerCopyPromptCommands(context));
  safeRegister("registerGitScaffoldCommand", () => registerGitScaffoldCommand(context));
  safeRegister("registerTroubleshootCommand", () => registerTroubleshootCommand(context));
  safeRegister("registerGetStartedCommand", () => registerGetStartedCommand(context));
  safeRegister("registerPlanImportCommand", () => registerPlanImportCommand(context));
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
  safeRegister("registerSessionGenPromptCommand", () =>
    registerSessionGenPromptCommand(context),
  );
  safeRegister("registerCostDashboardCommand", () => registerCostDashboardCommand(context));
  safeRegister("registerCancelLifecycleCommands", () =>
    registerCancelLifecycleCommands(context, { refreshView: refreshAll }),
  );
  safeRegister("registerInstallAiRouterCommands", () =>
    registerInstallAiRouterCommands(context),
  );
  safeRegister("registerCopilotSeatSetupCommand", () =>
    registerCopilotSeatSetupCommand(context),
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
  // diagnostic surface; the writer log itself is preserved
  // provisionally per Set 049 T5.
  safeRegister("registerOpenOrchestratorWriterLog", () =>
    registerOpenOrchestratorWriterLog(context),
  );
  safeRegister("registerRegenerateNarrationTemplates", () =>
    registerRegenerateNarrationTemplatesCommand(context),
  );
  safeRegister("registerExternalVerificationCommand", () =>
    registerExternalVerificationCommand(context),
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
  // Set 061 S3 (spec D4): tier switch on not-started sets.
  safeRegister("registerSwitchTierCommand", () =>
    registerSwitchTierCommand(context),
  );
  // Set 062 S2 (spec D3): verification-mode seed rewrite on
  // not-started Lightweight sets.
  safeRegister("registerSetupVerificationCommand", () =>
    registerSetupVerificationCommand(context),
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

  // Show onboarding on first activation in a workspace with no session sets.
  // Set 059: gate on having a folder open. `workspaceState` does not persist
  // reliably in an empty (no-folder) window, so without this guard the wizard
  // would auto-pop on EVERY fresh no-folder launch — intrusive when the user
  // opened a blank window for something unrelated. With no folder the user
  // still reaches Get Started via the view's Getting Started surface or the
  // Command Palette; auto-onboarding is reserved for an opened workspace.
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
}

export function deactivate(): void {}
