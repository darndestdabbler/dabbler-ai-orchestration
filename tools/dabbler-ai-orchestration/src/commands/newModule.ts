// The "New module" flow — append a docs/modules.yaml entry via
// `python -m ai_router.modules create`. `ui` is the injectable VS Code
// surface so the flow is unit-testable under the vscode stub.

import * as vscode from "vscode";
import { validateNewModuleSlug } from "../utils/moduleAuthoring";
import { runCreateModule } from "../utils/moduleLifecycleCli";
import { RouterCliResult, RunRouterCliDeps } from "../utils/routerCli";
import { readModulesManifest } from "../utils/fileSystem";

export interface NewModuleUi {
  showInputBox: typeof vscode.window.showInputBox;
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): NewModuleUi {
  return {
    showInputBox: vscode.window.showInputBox,
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

export function describeCreateFailure(result: RouterCliResult): string {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  return `New module failed: ${detail}`;
}

/**
 * Prompt for slug + title, create the manifest entry. Returns true when
 * a module was created (callers refresh), false on cancel / refusal.
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
  // at write time (fail-loud), so a stale read here can only make the
  // input box friendlier, never corrupt the manifest.
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
    prompt: `Shown as the module's group header in the Work Explorer. Press Enter to use "${slug.trim()}".`,
    placeHolder: slug.trim(),
    ignoreFocusOut: true,
  });
  if (title === undefined) return false; // Esc cancels; empty = default to slug

  const result = await runCreateModule(
    root,
    { slug: slug.trim(), title: title.trim() },
    cliDeps,
  );
  if (!result.ok) {
    ui.showErrorMessage(describeCreateFailure(result));
    return false;
  }

  ui.showInformationMessage(
    `Module "${slug.trim()}" added to docs/modules.yaml. Declare ` +
      `module: ${slug.trim()} in a set's spec.md to group it here.`,
  );
  return true;
}

export function registerNewModuleCommand(
  context: vscode.ExtensionContext,
  deps: { refreshView: () => void },
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.newModule", async () => {
      if (await runNewModuleFlow()) deps.refreshView();
    }),
  );
}
