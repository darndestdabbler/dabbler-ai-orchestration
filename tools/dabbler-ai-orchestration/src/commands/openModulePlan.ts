// `Dabbler: Open Module Plan` — the Work Explorer's `Open Plan` row action
// and its Command Palette mirror.
//
// Set 123 S3: this command's registration used to live in
// `wizard/planImport.ts`, alongside `dabbler.importPlan`. That file was
// deleted with the Import Project Plan feature the operator retired, and the
// FIRST cut of this session deleted this command with it by accident — while
// `package.json` still contributed it and module rows still emitted
// `;can-open-plan;`, so the inline action stayed visible and would have failed
// with command-not-found on the main module workflow. Cross-provider
// verification caught it in round 1 (both lenses, independently). It lives
// here now, in `commands/`, because it was never part of the wizard: opening a
// file an operator already has is not authoring a plan.
//
// WHAT CHANGED IN THE MOVE. The old missing-plan branch offered
// `Import Plan`, which called the importer that no longer exists. Offering a
// retired action is worse than offering nothing, so the branch now NAMES the
// path the plan is expected at and stops. That is the whole behavioural
// delta; target resolution, the module preselect, and the containment guard
// are carried over unchanged.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  ModulePickUi,
  modulePlanRelPath,
  pickModuleForAuthoring,
} from "../utils/moduleAuthoring";
import { ModuleManifestEntry } from "../types";
import { preselectFromTreeNode } from "../providers/workExplorerTreeModel";

/** Repo-level plan destination (forward-slashed, repo-relative). */
const PLAN_DEST_POSIX = "docs/planning/project-plan.md";

export interface OpenModulePlanUi {
  showInformationMessage: typeof vscode.window.showInformationMessage;
  showErrorMessage: typeof vscode.window.showErrorMessage;
  /** Set 087 S3 (ruling Q4): the module picker's QuickPick surface. */
  showQuickPick: ModulePickUi["showQuickPick"];
  executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): OpenModulePlanUi {
  return {
    showInformationMessage: vscode.window.showInformationMessage,
    showErrorMessage: vscode.window.showErrorMessage,
    showQuickPick: (items, opts) => vscode.window.showQuickPick(items, opts),
    executeCommand: (command, ...args) =>
      vscode.commands.executeCommand(command, ...args),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/**
 * Set 093 S2 (routed ruling D1): an explicit module target from a
 * row/context invocation. When present, the picker is bypassed. Absent →
 * interactive behavior (palette QuickPick / auto-select notice).
 */
export interface PlanAuthoringOptions {
  preselectedSlug?: string;
}

/**
 * Resolve which plan this flow targets (Set 087 S3, ruling Q4): the
 * picked module's plan when ``docs/modules.yaml`` names modules (one
 * module auto-selects with a notice; Esc on the picker cancels the whole
 * flow), the repo-level plan otherwise. ``null`` = cancelled.
 *
 * Set 093 S2: with ``opts.preselectedSlug`` the module is implied by the
 * clicked row — no QuickPick, no auto-select notice (`""` → repo-level;
 * a declared slug → that module; an unresolvable slug → abort).
 */
async function resolvePlanTarget(
  root: string | undefined,
  ui: OpenModulePlanUi,
  opts?: PlanAuthoringOptions,
): Promise<{ entry: ModuleManifestEntry | null; destPosix: string } | null> {
  if (!root) return { entry: null, destPosix: PLAN_DEST_POSIX };
  const pick = await pickModuleForAuthoring(
    root,
    {
      showQuickPick: ui.showQuickPick,
      showInformationMessage: ui.showInformationMessage,
      showErrorMessage: ui.showErrorMessage,
    },
    opts && opts.preselectedSlug !== undefined
      ? { preselectedSlug: opts.preselectedSlug }
      : undefined,
  );
  // Set 093 S2 D1: invalid-manifest / unknown-module abort like a cancel
  // (the picker already showed the error) — never the silent repo-level
  // fallback, which would open somebody else's plan.
  if (
    pick.kind === "cancelled" ||
    pick.kind === "invalid-manifest" ||
    pick.kind === "unknown-module"
  ) {
    return null;
  }
  return {
    entry: pick.entry,
    destPosix: pick.entry ? modulePlanRelPath(pick.entry) : PLAN_DEST_POSIX,
  };
}

/**
 * Set 093 S2 (`Open Plan` row action): open the module's plan in an
 * editor. Resolves the target the same way the plan flows did — the
 * declared module's `planPath`, or the repo-level plan for a pseudo row
 * (`opts.preselectedSlug === ""`).
 */
export async function openModulePlan(
  ui: OpenModulePlanUi = defaultUi(),
  opts?: PlanAuthoringOptions,
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) {
    void ui.showErrorMessage("No workspace folder is open.");
    return;
  }
  const target = await resolvePlanTarget(root, ui, opts);
  if (!target) return; // cancelled / invalid-manifest / unknown-module

  const destPath = path.join(root, ...target.destPosix.split("/"));
  // Containment guard: the plan path can derive from repository-controlled
  // manifest config, so refuse any resolved path that escapes the workspace
  // BEFORE any filesystem access.
  const containment = path.relative(path.resolve(root), path.resolve(destPath));
  if (
    containment === "" ||
    containment.startsWith("..") ||
    path.isAbsolute(containment)
  ) {
    void ui.showErrorMessage(
      `Refusing to open outside the workspace: ${target.destPosix}`,
    );
    return;
  }
  if (!fs.existsSync(destPath)) {
    // Set 123 S3: NAME the path rather than offering the retired importer.
    // The plan is an ordinary markdown file the operator writes or drops in;
    // saying where it goes is the whole of the help that is still true.
    void ui.showInformationMessage(
      `No plan yet at ${target.destPosix}. Create that file (or copy an ` +
        `existing plan there) and run this action again.`,
    );
    return;
  }
  await ui.executeCommand("vscode.open", vscode.Uri.file(destPath));
}

export function registerOpenModulePlanCommand(
  context: vscode.ExtensionContext,
): void {
  // Set 093 S2 (verification R2 Major): the `Open Plan` action's Command
  // Palette mirror. Like the other palette commands it keeps the module
  // QuickPick (no preselect) so keyboard-driven use picks the module; the
  // row/context strip supplies the module directly.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.openModulePlan",
      async (arg?: unknown) => {
        await openModulePlan(undefined, preselectFromTreeNode(arg));
      },
    ),
  );
}
