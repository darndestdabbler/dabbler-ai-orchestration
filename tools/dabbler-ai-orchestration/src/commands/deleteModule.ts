// Set 099 Session 2 (operator's adjudicated disposition rule): the
// `Delete Module…` flow — pick a declared module, show a two-step confirm
// that enumerates exactly what will be cancelled / removed / left untouched,
// then run the `deleteModule` writer in utils/moduleAuthoring.ts.
// Palette-only here (`dabbler.deleteModule`); the module-row management
// action is Set 100's.
//
// `ui` is the injectable VS Code surface (the renameModule.ts pattern) so
// the flow is unit-testable under the vscode stub. The writer's
// classification + preflights are authoritative — this flow only gathers
// the target, shows the SAME classification the writer will act on, and
// reports; a refusal leaves every file untouched.

import * as vscode from "vscode";
import {
  MODULES_MANIFEST_DISPLAY,
  INVALID_MANIFEST_MESSAGE,
  classifyModulesManifest,
  classifyModuleSetsForDeletion,
  deleteModule,
} from "../utils/moduleAuthoring";
import { ModuleManifestEntry } from "../types";

export interface DeleteModuleUi {
  /** Pick the module to delete (a QuickPick of declared modules). */
  pickModule(entries: ModuleManifestEntry[]): Thenable<ModuleManifestEntry | undefined>;
  /** Two-step confirm (modal). Returns true only on the affirmative click. */
  confirm(summary: string, detail: string): Thenable<boolean>;
  showInformationMessage(message: string): unknown;
  showErrorMessage(message: string): unknown;
  workspaceRoot(): string | undefined;
}

function defaultUi(): DeleteModuleUi {
  return {
    pickModule: async (entries) => {
      const picked = await vscode.window.showQuickPick(
        entries.map((e) => ({
          label: e.title,
          description: e.slug,
          entry: e,
        })),
        { placeHolder: "Which module do you want to delete?", ignoreFocusOut: true },
      );
      return picked?.entry;
    },
    confirm: async (summary, detail) => {
      const choice = await vscode.window.showWarningMessage(
        summary,
        { modal: true, detail },
        "Delete Module",
      );
      return choice === "Delete Module";
    },
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

function summarizeGroup(label: string, names: string[]): string {
  return names.length > 0
    ? `${label} (${names.length}): ${names.join(", ")}`
    : `${label}: none`;
}

/**
 * Run the delete-module flow. Returns true when the writer changed at least
 * one file (so callers refresh the Explorer). Gathers a declared module,
 * classifies its sets with the SAME function the writer uses (so the
 * confirm dialog's enumeration is guaranteed truthful), shows an
 * affirmative confirm, then runs the writer.
 */
export async function runDeleteModuleFlow(
  ui: DeleteModuleUi = defaultUi(),
): Promise<boolean> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return false;
  }
  const entries = classified.kind === "present" ? classified.entries : [];
  if (entries.length === 0) {
    ui.showInformationMessage(
      `No modules are declared in ${MODULES_MANIFEST_DISPLAY} yet.`,
    );
    return false;
  }

  const target = await ui.pickModule(entries);
  if (!target) return false; // cancelled

  const classification = classifyModuleSetsForDeletion(root, target.slug);
  const toCancel = classification
    .filter((c) => c.disposition === "cancel")
    .map((c) => c.name)
    .sort();
  const toRemove = classification
    .filter((c) => c.disposition === "remove")
    .map((c) => c.name)
    .sort();
  const terminal = classification
    .filter((c) => c.disposition === "terminal")
    .map((c) => c.name)
    .sort();

  const detailLines = [
    summarizeGroup("Cancelled", toCancel),
    summarizeGroup("Removed outright", toRemove),
    summarizeGroup("Left untouched (completed / already cancelled)", terminal),
  ];

  const confirmed = await ui.confirm(
    `Delete module "${target.slug}"?`,
    `Removes the ${MODULES_MANIFEST_DISPLAY} entry.\n\n${detailLines.join("\n")}\n\n` +
      `Re-declaring "${target.slug}" later restores this grouping for any ` +
      `untouched history.`,
  );
  if (!confirmed) return false;

  const report = await deleteModule(root, target.slug);

  if (report.refused) {
    ui.showErrorMessage(
      `Delete refused — ${report.refused.reason} Every file was left untouched.`,
    );
    return false;
  }
  if (report.partialFailure) {
    ui.showErrorMessage(
      `Delete stopped partway: ${report.partialFailure.reason} ` +
        `${report.cancelled.length} set(s) cancelled and ${report.removed.length} ` +
        `scaffold(s) removed so far — re-run "Dabbler: Delete Module" to finish ` +
        `(already-applied steps are skipped on retry).`,
    );
    return report.cancelled.length > 0 || report.removed.length > 0;
  }

  ui.showInformationMessage(
    `Deleted module "${target.slug}" — ${report.cancelled.length} set(s) cancelled, ` +
      `${report.removed.length} scaffold(s) removed, ${report.terminal.length} left untouched.`,
  );
  return true;
}

export function registerDeleteModuleCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.deleteModule", async () => {
      await runDeleteModuleFlow();
    }),
  );
}
