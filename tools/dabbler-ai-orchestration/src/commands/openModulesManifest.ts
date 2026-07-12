// Set 094 Session 1 (spec D1 + adjudication A): the shared "Open
// modules.yaml" flow — create docs/modules.yaml from the canonical
// template if it does not exist yet, then open it in the editor. One
// unit-testable flow invoked by BOTH the Getting Started form's
// Define-modules button (the `open-modules` gettingStartedAction) and the
// Work Explorer toolbar command (`dabbler.openModulesManifest`).
//
// Adjudication A: the ensure-write happens ONLY on this explicit user
// action — never on activation or a passive tree refresh. A PRESENT-but-
// invalid manifest is opened untouched (ensureModulesManifest's exclusive
// create fails EEXIST and reports created:false), so the operator can fix
// it by hand while the Set 092 diagnostics strip reports the fault — the
// file is never auto-overwritten.
//
// `ui` is the injectable VS Code surface (the newModule.ts / planImport.ts
// pattern) so the flow is unit-testable under the vscode stub.

import * as vscode from "vscode";
import * as path from "path";
import { MODULES_MANIFEST_REL } from "../utils/fileSystem";
import {
  MODULES_MANIFEST_DISPLAY,
  ensureModulesManifest,
} from "../utils/moduleAuthoring";

export interface OpenModulesManifestUi {
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
  /** Open a file in the editor (absolute path). */
  openFile: (absPath: string) => Thenable<unknown>;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): OpenModulesManifestUi {
  return {
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    openFile: (absPath) =>
      vscode.commands.executeCommand("vscode.open", vscode.Uri.file(absPath)),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/**
 * Create-if-absent, then open `docs/modules.yaml`. Returns true when the
 * flow ran (callers refresh their snapshot), false when there was no
 * workspace or the ensure-write failed. A newly-created manifest gets a
 * one-line "define your modules and SAVE the file" toast (spec D1: the
 * section copy instructs the human to save); an already-present manifest
 * just opens quietly.
 */
export async function openModulesManifestFlow(
  ui: OpenModulesManifestUi = defaultUi(),
): Promise<boolean> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  let created: boolean;
  try {
    created = ensureModulesManifest(root).created;
  } catch (err) {
    ui.showErrorMessage(
      `Could not create ${MODULES_MANIFEST_DISPLAY}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  const abs = path.join(root, MODULES_MANIFEST_REL);
  try {
    await ui.openFile(abs);
  } catch (err) {
    // A dangling-symlink manifest reports created:false above and then
    // cannot be opened — degrade to a readable error, never an unhandled
    // rejection (routed ruling Q1 Minor).
    ui.showErrorMessage(
      `Could not open ${MODULES_MANIFEST_DISPLAY}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  if (created) {
    ui.showInformationMessage(
      `Created ${MODULES_MANIFEST_DISPLAY}. Define your modules (or ask an AI ` +
        `assistant to decompose the project), then SAVE the file — the Work ` +
        `Explorer groups your session sets by module.`,
    );
  }
  return true;
}

/** Register the Work Explorer toolbar command (spec S1 step 3). */
export function registerOpenModulesManifestCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.openModulesManifest", async () => {
      await openModulesManifestFlow();
    }),
  );
}
