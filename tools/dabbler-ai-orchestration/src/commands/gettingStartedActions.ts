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
// unknown actions ignored, untrusted riders narrowed — are unit-testable
// without VS Code. `makeGettingStartedHandlers`
// binds the real implementations, each of which reuses an existing engine:
//   - open-folder     → showOpenDialog → vscode.openFolder (D5)
//   - build-structure → buildProjectStructureNoPrompt (Set 058 writer)
//   - open-modules    → openModulesManifestFlow (Set 094: ensure
//                       docs/modules.yaml from the canonical template on
//                       this explicit action, then open it — adjudication A)
//   - copy-decomposition-prompt → runCopyModuleDecompositionPromptFlow (Set
//                       094 S2 / spec D6: ensure docs/modules.yaml, then copy
//                       the module-decomposition prompt — the FOURTH
//                       ensure-write site; the same flow the palette command
//                       dabbler.copyModuleDecompositionPrompt drives)
//
// Set 094: the plan / session-set actions left the form. The plan flows
// (importPlanFromFile / copyPlanningPrompt), the SESSION-SET decomposition
// prompt (copySessionSetGenPrompt) and the New-module scaffold
// (runNewModuleFlow) still ship — Set 093's per-module row actions + the
// Command Palette own them now — but the Getting Started form no longer
// surfaces them.
//
// Set 112 S2: the tier rider and the Lightweight verification-mode rider
// are gone with the tier. Provider access (the seat-profile sub-choice)
// is the form's first question now, so its rider is the only narrowing
// that shapes the build.

import * as vscode from "vscode";
import { GettingStartedActionMsg } from "../types/sessionSetsWebviewProtocol";
import { buildProjectStructureNoPrompt } from "./gitScaffold";
import { TransportProfile } from "../utils/copilotSeatSetup";
import {
  BudgetChoice,
  asBudgetUsd,
  asZeroBudgetMethod,
} from "../utils/budgetYaml";
import { openModulesManifestFlow } from "./openModulesManifest";
import { runCopyModuleDecompositionPromptFlow } from "./copyModuleDecompositionPrompt";

export interface GettingStartedHandlers {
  openFolder(): Promise<void>;
  buildStructure(
    budget?: BudgetChoice,
    transportProfile?: TransportProfile,
  ): Promise<void>;
  /** Set 094 (spec D1): create docs/modules.yaml if absent, then open it. */
  openModules(): Promise<void>;
  /** Set 094 S2 (spec D6): create docs/modules.yaml if absent, then copy the
   * module-decomposition prompt (the fourth ensure-write site). */
  copyDecompositionPrompt(): Promise<void>;
}

/**
 * Set 079 S2 (Feature 1): narrow the untrusted seat-profile rider.
 * Absent (undefined / null) returns undefined so callers apply the
 * documented default ("api", the seeded transport.profile default); a
 * PRESENT-but-unrecognized value throws (fail-loud — a hostile/buggy
 * webview must not silently launch or suppress the Copilot seat setup).
 */
export function asTransportProfileRider(
  value: unknown,
): TransportProfile | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "api" || v === "copilot-cli") return v;
  }
  throw new Error(
    `Unrecognized transportProfile value ${JSON.stringify(value)} — expected ` +
      `"api" or "copilot-cli".`,
  );
}

/**
 * Resolve the effective seat profile for a build-structure action: the
 * rider when present, the seeded default ("api") otherwise.
 */
export function resolveTransportProfile(
  msg: GettingStartedActionMsg,
): TransportProfile {
  return asTransportProfileRider(msg.transportProfile) ?? "api";
}

/**
 * Set 063 S2 (spec D1): narrow the untrusted budget riders on a
 * build-structure message to a {@link BudgetChoice}, or undefined when
 * the riders are absent / malformed / inapplicable. A $0 budget without
 * the required zero-rule pick narrows to undefined too — the host never
 * invents the operator's choice (the writer would refuse it anyway); the
 * scaffold still runs, just without a budget write.
 *
 * Set 081 S1: the rider is dropped outright under the Copilot seat
 * sub-choice — the budget governs metered provider-API spend, which the
 * copilot-cli profile excludes by design, and a Copilot-seat Build
 * writes no budget.yaml (absence has documented compat defaults in
 * docs/budget-yaml-schema.md).
 */
export function asBudgetChoice(
  msg: GettingStartedActionMsg,
  transportProfile?: TransportProfile,
): BudgetChoice | undefined {
  if (transportProfile === "copilot-cli") return undefined;
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
      // Untrusted seat-profile rider: narrow, defaulting to "api" (the
      // radio's checked default) only when ABSENT. A present-but-
      // unrecognized value fails loud — the action is rejected (same
      // posture as the unknown-action default below) instead of silently
      // launching or suppressing the Copilot seat setup. The Set 063
      // budget riders narrow alongside (see asBudgetChoice).
      let transportProfile: TransportProfile;
      try {
        transportProfile = resolveTransportProfile(msg);
      } catch (err) {
        // Operator-visible (S2 verifier): a rejected action must not
        // look like a silent no-op from the form.
        vscode.window.showErrorMessage(
          `Build project structure was rejected: ${err instanceof Error ? err.message : String(err)}`,
        );
        console.warn(
          `[gettingStarted] rejected build-structure with malformed rider: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
      const budget = asBudgetChoice(msg, transportProfile);
      if (transportProfile !== "copilot-cli" && !budget) {
        // S2 verifier R1 Major (fail-closed): D1 makes the budget
        // REQUIRED on the form path. The webview blocks Build until
        // its riders validate, so an action arriving without a
        // narrowable budget is a hostile/buggy webview — reject it
        // rather than scaffolding a repo with no budget.yaml. The
        // Command-Palette setupNewProject flow (no webview, no budget
        // input) stays the only budgetless entry point. Set 081 S1:
        // scoped to the Direct-API sub-choice — a Copilot-seat Build
        // legitimately carries no budget riders (the block is not
        // rendered) and writes no budget.yaml.
        console.warn(
          "[gettingStarted] rejected build-structure without a valid budget rider",
        );
        return false;
      }
      await handlers.buildStructure(budget, transportProfile);
      return true;
    }
    case "open-modules":
      // Set 094 (spec D1): no riders — the Define-modules button just
      // ensures docs/modules.yaml exists (from the canonical template) and
      // opens it. The ensure-write is idempotent and skip-existing.
      await handlers.openModules();
      return true;
    case "copy-decomposition-prompt":
      // Set 094 S2 (spec D6): no riders — ensure docs/modules.yaml exists
      // (from the canonical template — the fourth ensure-write site) and copy
      // the module-decomposition prompt. Idempotent and skip-existing.
      await handlers.copyDecompositionPrompt();
      return true;
    default:
      console.warn(
        `[gettingStarted] ignored unknown form action "${String((msg as { action?: unknown })?.action)}"`,
      );
      return false;
  }
}

/** Bind the real VS Code implementations for the six actions. */
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
    async buildStructure(
      budget?: BudgetChoice,
      transportProfile?: TransportProfile,
    ): Promise<void> {
      const openRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (openRoot) {
        await buildProjectStructureNoPrompt(
          context,
          openRoot,
          budget,
          transportProfile,
        );
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
      // Set 079 S2: the whole build — INCLUDING the awaited Copilot seat
      // setup on the copilot-cli path — completes inside this call,
      // before the vscode.openFolder below reloads the extension host.
      const result = await buildProjectStructureNoPrompt(
        context,
        picked[0].fsPath,
        budget,
        transportProfile,
      );
      // S3 code-review Major 1: only open the picked folder when the
      // scaffold actually ran. vscode.openFolder reloads the extension
      // host, and toasts do not survive a reload — opening after a
      // pre-flight refusal would land the operator in an empty folder
      // with the missing-Python explainer already discarded.
      if (!result) return;
      await vscode.commands.executeCommand("vscode.openFolder", picked[0]);
    },

    // Set 094 (spec D1 + adjudication A): the Define-modules button —
    // create docs/modules.yaml from the canonical template if it does not
    // exist yet, then open it. Shares the flow the toolbar command drives.
    async openModules(): Promise<void> {
      await openModulesManifestFlow();
    },

    // Set 094 S2 (spec D6 + adjudication A): the Define-modules "Copy AI
    // decomposition prompt" button — ensure docs/modules.yaml from the
    // canonical template (the fourth ensure-write site), then copy the
    // module-decomposition prompt. Shares the flow the palette command
    // (dabbler.copyModuleDecompositionPrompt) drives.
    async copyDecompositionPrompt(): Promise<void> {
      await runCopyModuleDecompositionPromptFlow();
    },
  };
}
