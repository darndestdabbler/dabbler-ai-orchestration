// Set 060 Session 2: host-side handlers for the Getting Started form's
// `data-gs-action` buttons (spec D4/D5/D7). The webview posts a typed
// `GettingStartedActionMsg`; CustomSessionSetsView forwards it here and
// refreshes its snapshot when the handler resolves, so the form's live
// completion state (D2/D3) repaints right after each action — the
// all-D3-inputs file watcher remains the backstop for work that lands
// outside the form (e.g. an AI writing project-plan.md).
//
// The router (`routeGettingStartedAction`) is pure dispatch + input
// narrowing over an injected handler set, so the validation rules —
// unknown actions ignored, untrusted tier narrowed with a "full"
// default, parallel coerced to a strict boolean — are unit-testable
// without VS Code. `makeGettingStartedHandlers` binds the real
// implementations, each of which reuses an existing engine:
//   - open-folder        → showOpenDialog → vscode.openFolder (D5)
//   - build-structure    → buildProjectStructureNoPrompt (Set 058 writer)
//   - import-plan        → importPlanFromFile (wizard/planImport)
//   - copy-plan-prompt   → copyPlanningPrompt (wizard/planImport)
//   - build-session-sets → copySessionSetGenPrompt (D4 — copies the
//                          decomposition prompt; never an inline router call)

import * as vscode from "vscode";
import { GettingStartedActionMsg } from "../types/sessionSetsWebviewProtocol";
import { asTier, buildProjectStructureNoPrompt } from "./gitScaffold";
import { Tier } from "../utils/consumerBootstrap";
import { copyPlanningPrompt, importPlanFromFile } from "../wizard/planImport";
import { copySessionSetGenPrompt } from "../wizard/sessionGenPrompt";

export interface GettingStartedHandlers {
  openFolder(): Promise<void>;
  buildStructure(tier: Tier): Promise<void>;
  importPlan(): Promise<void>;
  copyPlanPrompt(): Promise<void>;
  buildSessionSets(parallel: boolean, tier: Tier): Promise<void>;
}

/**
 * Narrow an untrusted webview message and dispatch to the matching
 * handler. Returns true when a handler ran (callers refresh the
 * snapshot), false when the message was malformed / unknown (ignored,
 * with a console.warn — same posture as the executeCommand allowlist).
 */
export async function routeGettingStartedAction(
  msg: GettingStartedActionMsg,
  handlers: GettingStartedHandlers,
): Promise<boolean> {
  switch (msg.action) {
    case "open-folder":
      await handlers.openFolder();
      return true;
    case "build-structure": {
      // Untrusted tier rider: narrow, defaulting to "full" (the radio's
      // checked default) when absent or unrecognized.
      const tier = asTier(msg.tier) ?? "full";
      await handlers.buildStructure(tier);
      return true;
    }
    case "import-plan":
      await handlers.importPlan();
      return true;
    case "copy-plan-prompt":
      await handlers.copyPlanPrompt();
      return true;
    case "build-session-sets":
      // Set 060 S4: the tier radio rides this action too (same untrusted
      // narrowing as build-structure) so the copied decomposition prompt
      // steers the planner to the operator's tier.
      await handlers.buildSessionSets(msg.parallel === true, asTier(msg.tier) ?? "full");
      return true;
    default:
      console.warn(
        `[gettingStarted] ignored unknown form action "${String((msg as { action?: unknown })?.action)}"`,
      );
      return false;
  }
}

/** Bind the real VS Code implementations for the five actions. */
export function makeGettingStartedHandlers(
  context: vscode.ExtensionContext,
): GettingStartedHandlers {
  return {
    // D5 no-folder surface: open or create a project folder, then load
    // it. vscode.openFolder reopens the window on that folder; the
    // Getting Started form (now with build steps) renders there.
    async openFolder(): Promise<void> {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Open project folder",
        title: "Open or create a project folder",
      });
      if (!picked?.[0]) return;
      await vscode.commands.executeCommand("vscode.openFolder", picked[0]);
    },

    // Step 1: scaffold into the OPEN workspace folder (D5) with no
    // prompts. Folder-picker fallback when none is open (spec S2 step 1)
    // — pick, scaffold there, then open the folder so the form's live
    // state tracks the scaffolded root.
    async buildStructure(tier: Tier): Promise<void> {
      const openRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (openRoot) {
        await buildProjectStructureNoPrompt(context, openRoot, tier);
        return;
      }
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select project folder",
        title: "Select the folder to build the project structure into",
      });
      if (!picked?.[0]) return;
      await buildProjectStructureNoPrompt(context, picked[0].fsPath, tier);
      await vscode.commands.executeCommand("vscode.openFolder", picked[0]);
    },

    // Step 2: file picker → docs/planning/project-plan.md.
    async importPlan(): Promise<void> {
      await importPlanFromFile();
    },

    // Step 2 alternative: copy the plan-authoring prompt.
    async copyPlanPrompt(): Promise<void> {
      await copyPlanningPrompt();
    },

    // Step 3 (D4): copy the decomposition prompt, honoring the parallel
    // checkbox and the tier radio in the prompt text (S4).
    async buildSessionSets(parallel: boolean, tier: Tier): Promise<void> {
      await copySessionSetGenPrompt(context, { parallel, tier });
    },
  };
}
