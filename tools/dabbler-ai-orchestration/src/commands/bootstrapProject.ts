// Set Up New Project: the whole first-run sequence, which is now one call.
//
// It used to be three lines sent to a visible terminal — create the
// workspace venv when it was missing, `pip install --upgrade
// dabbler-ai-router` into the interpreter every later spawn would resolve,
// then run the bootstrap. Each of those existed because the router was a
// Python package the project had to acquire before the extension could ask
// it anything, and two real first-runs died at the second step.
//
// The router is bundled with the extension now, so a project acquires
// nothing: there is no venv, no install, and no interpreter to resolve.
// `Router.bootstrap` writes the managed guidance, the pre-commit guard and
// the ignore rule, and the operator sees what it ran in the command log
// like every other verb. This is the zero-install claim the port was for.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";
import { productionRouter } from "../router/host";

export interface SetUpProjectUi {
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): SetUpProjectUi {
  return {
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/**
 * Bootstrap one project, and say what happened. Returns true when the
 * project was set up, so a caller can refresh the view.
 *
 * The refusal is shown rather than swallowed: `bootstrap` refuses a
 * directory that is not a git repository, and an operator who clicked Set
 * Up New Project on the wrong folder needs to read that sentence.
 */
export async function runSetUpProjectFlow(
  ui: SetUpProjectUi = defaultUi(),
  router: Router = productionRouter(),
): Promise<boolean> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage(
      "Open the project folder first, then run Set Up New Project.",
    );
    return false;
  }
  const result = await router.bootstrap({ projectDir: root });
  if (!result.ok) {
    ui.showErrorMessage(
      `Set Up New Project failed: ${result.message.trim() || `exit ${result.exitCode}`}`,
    );
    return false;
  }
  ui.showInformationMessage(
    "Dabbler: project set up. Open a terminal and run `dabbler session start`.",
  );
  return true;
}

export function registerBootstrapProjectCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.setupNewProject", () =>
      runSetUpProjectFlow(),
    ),
  );
}
