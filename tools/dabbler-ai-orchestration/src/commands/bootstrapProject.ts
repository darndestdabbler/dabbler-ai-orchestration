// Set Up New Project: the whole runway, and the operator types nothing.
//
// It used to be three lines sent to a visible terminal — create the
// workspace venv when it was missing, `pip install --upgrade
// dabbler-ai-router` into the interpreter every later spawn would resolve,
// then run the bootstrap. Each of those existed because the router was a
// Python package the project had to acquire before the extension could ask
// it anything, and two real first-runs died at the second step.
//
// The router is bundled with the extension now, so a project acquires
// nothing. What remained was the other half of the same problem: the flow
// ended by telling the operator to open a terminal and run `dabbler session
// start`, about a project the framework had just finished preparing, and it
// refused outright a folder that was not yet a git repository. Both are the
// framework naming a command it could run itself, which is the one thing
// principle (e) says never to do.
//
// So: it initialises the repository when there is not one, `Router.bootstrap`
// writes and commits the scaffold, and the flow offers to start session 1
// rather than describing how.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";
import { productionRouter } from "../router/host";

export interface SetUpProjectUi {
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
  /** The offer that ends the flow; resolves to the chosen label or undefined. */
  offer?: (message: string, ...actions: string[]) => Thenable<string | undefined>;
  workspaceRoot: () => string | undefined;
  /** `git init` in a folder that is not a repository yet. */
  initRepository?: (root: string) => Promise<string>;
  runCommand?: (command: string) => Thenable<unknown>;
}

/**
 * `git init`, through the extension's own git integration rather than a
 * spawned process.
 *
 * VS Code ships the git extension and its API can initialise a repository,
 * so the flow uses what the editor already has instead of shelling out. A
 * host without it says so and the caller reports that sentence — an
 * unavailable capability is worth a sentence, never a silent no-op.
 */
async function initWithVsCodeGit(root: string): Promise<string> {
  const git = vscode.extensions.getExtension("vscode.git");
  if (!git) return "the built-in Git extension is not available";
  try {
    const api = (await git.activate()) as {
      getAPI?: (version: number) => { init?: (uri: vscode.Uri) => Thenable<unknown> };
    };
    const init = api.getAPI?.(1)?.init;
    if (!init) return "the built-in Git extension exposes no init";
    await init(vscode.Uri.file(root));
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function defaultUi(): SetUpProjectUi {
  return {
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    offer: (message, ...actions) =>
      vscode.window.showInformationMessage(message, ...actions),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    initRepository: initWithVsCodeGit,
    runCommand: (command) => vscode.commands.executeCommand(command),
  };
}

/**
 * Bootstrap one project, and say what happened. Returns true when the
 * project was set up, so a caller can refresh the view.
 *
 * The refusal is shown rather than swallowed: an operator who ran this on
 * the wrong folder needs to read that sentence.
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

  let result = await router.bootstrap({ projectDir: root });
  if (!result.ok && ui.initRepository) {
    // `bootstrap` refuses a directory that is not a git repository. That is
    // a thing the framework can fix, so it fixes it and tries once more
    // rather than reporting a prerequisite at someone.
    const failed = await ui.initRepository(root);
    if (failed) {
      ui.showErrorMessage(
        `Set Up New Project could not initialise a repository here: ${failed}. ` +
          `Then run it again.`,
      );
      return false;
    }
    result = await router.bootstrap({ projectDir: root });
  }
  if (!result.ok) {
    ui.showErrorMessage(
      `Set Up New Project failed: ${result.message.trim() || `exit ${result.exitCode}`}`,
    );
    return false;
  }

  // It used to end here with "Open a terminal and run `dabbler session
  // start`" — survey finding F1. Starting session 1 is a decision, so it is
  // offered; running it is not, so nobody is asked to type it.
  const start = "Start session 1";
  const choice = await (ui.offer
    ? ui.offer(
        "Dabbler: project set up and committed. Session 1 authors the " +
          "project plan; session 2 breaks it into numbered sessions.",
        start,
        "Later",
      )
    : Promise.resolve(undefined));
  if (choice === start && ui.runCommand) {
    await ui.runCommand("dabblerSessionSets.startSession");
  } else if (!ui.offer) {
    ui.showInformationMessage("Dabbler: project set up and committed.");
  }
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
