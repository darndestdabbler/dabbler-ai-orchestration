// Set 087 Session 3: the "New module" scaffold flow — append a
// docs/modules.yaml entry and create the module's project-plan stub
// (routed ruling Q1: available BOTH as the `dabbler.newModule` palette
// command — the always-available path for adding module #2..N to a live
// repo — and as a Getting Started form action for declaring modules on
// day one; both invoke this one flow, whose logic lives in the
// unit-testable utils/moduleAuthoring.ts).
//
// `ui` is the injectable VS Code surface (the planImport.ts pattern) so
// the flow is unit-testable under the vscode stub.

import * as vscode from "vscode";
import * as path from "path";
import { validateNewModuleSlug } from "../utils/moduleAuthoring";
import {
  describeCreate,
  describeFailure,
  runCreateModule,
} from "../utils/moduleLifecycleCli";
import { RunRouterCliDeps } from "../utils/routerCli";
import { readModulesManifest } from "../utils/fileSystem";

export interface NewModuleUi {
  showInputBox: typeof vscode.window.showInputBox;
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
  /** Open a file in the editor (absolute path). */
  openFile: (absPath: string) => Thenable<unknown>;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): NewModuleUi {
  return {
    showInputBox: vscode.window.showInputBox,
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    openFile: (absPath) =>
      vscode.commands.executeCommand("vscode.open", vscode.Uri.file(absPath)),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/**
 * Prompt for slug + title, scaffold the module, open the plan stub.
 * Returns true when a module was scaffolded (callers refresh their
 * snapshot), false on cancel / refusal.
 */
export async function runNewModuleFlow(
  ui: NewModuleUi = defaultUi(),
  cliDeps?: RunRouterCliDeps,
): Promise<boolean> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  // Existing slugs for live validation; the CLI re-reads and re-validates
  // at write time (fail-loud), so a stale read here can only make the input
  // box friendlier, never corrupt the manifest.
  const existingSlugs = (readModulesManifest(root) ?? []).map((e) => e.slug);

  const slug = await ui.showInputBox({
    title: "New module (1/2): slug",
    prompt:
      "Machine identity for the module (kebab-case). Session sets declare " +
      "module: <slug> and the Explorer groups them under it.",
    placeHolder: "greeter",
    ignoreFocusOut: true,
    validateInput: (v) => validateNewModuleSlug(v, existingSlugs),
  });
  if (slug === undefined || slug.trim() === "") return false;

  const title = await ui.showInputBox({
    title: "New module (2/2): display title",
    prompt: `Shown as the module's group header in the Session Set Explorer. Press Enter to use "${slug.trim()}".`,
    placeHolder: slug.trim(),
    ignoreFocusOut: true,
  });
  if (title === undefined) return false; // Esc cancels; empty = default to slug

  // Set 122 S2: one call does the manifest entry, the plan stub AND the two
  // lifecycle sets, inside one transaction. The TypeScript version did the
  // scaffold and the lifecycle sets as two separate writes and had to
  // explain, at length, why a failure between them left a module without
  // its sets. That whole failure mode is gone: the CLI rolls the lot back.
  const result = await runCreateModule(
    root,
    { slug: slug.trim(), title: title.trim() },
    cliDeps,
  );
  if (!result.ok) {
    ui.showErrorMessage(describeFailure("New module", result));
    return false;
  }

  const planRel = result.payload?.["planRel"];
  if (typeof planRel === "string" && planRel !== "") {
    await ui.openFile(path.join(root, ...planRel.split("/")));
  }

  ui.showInformationMessage(describeCreate(result.payload));
  return true;
}

export function registerNewModuleCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.newModule", async () => {
      await runNewModuleFlow();
    }),
  );
}
