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
import {
  BudgetChoice,
  asBudgetUsd,
  asZeroBudgetMethod,
} from "../utils/budgetYaml";
import { copyPlanningPrompt, importPlanFromFile } from "../wizard/planImport";
import { copySessionSetGenPrompt } from "../wizard/sessionGenPrompt";

export interface GettingStartedHandlers {
  openFolder(): Promise<void>;
  buildStructure(tier: Tier, budget?: BudgetChoice): Promise<void>;
  importPlan(): Promise<void>;
  copyPlanPrompt(): Promise<void>;
  buildSessionSets(parallel: boolean, tier: Tier): Promise<void>;
}

/**
 * Set 063 S2 (spec D1): narrow the untrusted budget riders on a
 * build-structure message to a {@link BudgetChoice}, or undefined when
 * the riders are absent / malformed / tier-inapplicable. Lightweight
 * never writes the file, so the rider is dropped outright there. A $0
 * budget without the required zero-rule pick narrows to undefined too —
 * the host never invents the operator's choice (the writer would refuse
 * it anyway); the scaffold still runs, just without a budget write.
 */
export function asBudgetChoice(
  msg: GettingStartedActionMsg,
  tier: Tier,
): BudgetChoice | undefined {
  if (tier !== "full") return undefined;
  const thresholdUsd = asBudgetUsd(msg.budgetUsd);
  if (thresholdUsd === undefined) return undefined;
  if (thresholdUsd === 0) {
    const zeroMethod = asZeroBudgetMethod(msg.zeroBudgetMethod);
    return zeroMethod ? { thresholdUsd, zeroMethod } : undefined;
  }
  return { thresholdUsd };
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
      // checked default) only when ABSENT. Set 077 S2 (A11): a present-
      // but-unrecognized value now fails loud — the action is rejected
      // (same posture as the unknown-action default below) instead of
      // silently scaffolding Full. The Set 063 budget riders narrow
      // alongside (Full only; see asBudgetChoice).
      let tier: Tier;
      try {
        tier = asTier(msg.tier) ?? "full";
      } catch (err) {
        // Operator-visible (S2 verifier): a rejected action must not
        // look like a silent no-op from the form.
        vscode.window.showErrorMessage(
          `Build project structure was rejected: ${err instanceof Error ? err.message : String(err)}`,
        );
        console.warn(
          `[gettingStarted] rejected build-structure with malformed tier rider: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
      const budget = asBudgetChoice(msg, tier);
      if (tier === "full" && !budget) {
        // S2 verifier R1 Major (fail-closed): D1 makes the budget
        // REQUIRED on the Full form path. The webview blocks Build until
        // its riders validate, so a Full action arriving without a
        // narrowable budget is a hostile/buggy webview — reject it
        // rather than scaffolding a Full repo with no budget.yaml. The
        // Command-Palette setupNewProject flow (no webview, no budget
        // input) stays the only budgetless entry point.
        console.warn(
          "[gettingStarted] rejected Full-tier build-structure without a valid budget rider",
        );
        return false;
      }
      await handlers.buildStructure(tier, budget);
      return true;
    }
    case "import-plan":
      await handlers.importPlan();
      return true;
    case "copy-plan-prompt":
      await handlers.copyPlanPrompt();
      return true;
    case "build-session-sets": {
      // Set 060 S4: the tier radio rides this action too (same untrusted
      // narrowing as build-structure) so the copied decomposition prompt
      // steers the planner to the operator's tier. Set 077 S2 (A11):
      // malformed rider ⇒ reject, same as build-structure.
      let genTier: Tier;
      try {
        genTier = asTier(msg.tier) ?? "full";
      } catch (err) {
        vscode.window.showErrorMessage(
          `Copy session-set prompt was rejected: ${err instanceof Error ? err.message : String(err)}`,
        );
        console.warn(
          `[gettingStarted] rejected build-session-sets with malformed tier rider: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
      await handlers.buildSessionSets(msg.parallel === true, genTier);
      return true;
    }
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
    // state tracks the scaffolded root. Set 063 S2 (D1): the narrowed
    // budget pick rides through to the scaffold's budget.yaml write.
    async buildStructure(tier: Tier, budget?: BudgetChoice): Promise<void> {
      const openRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (openRoot) {
        await buildProjectStructureNoPrompt(context, openRoot, tier, budget);
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
      await buildProjectStructureNoPrompt(context, picked[0].fsPath, tier, budget);
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
