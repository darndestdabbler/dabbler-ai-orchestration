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

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";
import type { SessionsRepository } from "../utils/fileSystem";
import { productionRouter } from "../router/host";
import { defaultSessionRunUi, runStartSession } from "./sessionTerminalCommands";

export interface SetUpProjectUi {
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
  /** The offer that ends the flow; resolves to the chosen label or undefined. */
  offer?: (message: string, ...actions: string[]) => Thenable<string | undefined>;
  workspaceRoot: () => string | undefined;
  /** `git init` in a folder that is not a repository yet. */
  initRepository?: (root: string) => Promise<string>;
  /**
   * Where to put a project when VS Code has no folder open at all, and what
   * to call it. Undefined at either step cancels, which is what cancelling
   * a question should do.
   */
  chooseNewProjectFolder?: () => Promise<string | undefined>;
  /** Start session 1 in the project just prepared. */
  startSession?: (root: string) => Promise<unknown>;
  openFolder?: (root: string) => Thenable<unknown>;
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
    chooseNewProjectFolder: chooseNewProjectFolder,
    startSession: startSessionIn,
    openFolder: (root) =>
      vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(root)),
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
  // No folder open at all is the ONE onboarding path this command exists
  // for, and it used to be the one it refused. It creates the project.
  let root = ui.workspaceRoot();
  let created = false;
  if (!root) {
    if (!ui.chooseNewProjectFolder) {
      ui.showErrorMessage(
        "Open the project folder first, then run Set Up New Project.",
      );
      return false;
    }
    const chosen = await ui.chooseNewProjectFolder();
    if (!chosen) return false;
    root = chosen;
    created = true;
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
  // Called directly with the project it just prepared. Dispatching the tree
  // command instead sent no repository argument, and its handler derives the
  // repository from that argument alone -- so the offered start reached
  // nothing at all.
  if (choice === start && ui.startSession) {
    await ui.startSession(root);
  } else if (!ui.offer) {
    ui.showInformationMessage("Dabbler: project set up and committed.");
  }
  // A folder this command created is not open yet, and a project nobody can
  // see is not set up in any sense the operator cares about.
  if (created && ui.openFolder) await ui.openFolder(root);
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

/**
 * Ask where a new project goes, and make the folder.
 *
 * Two questions, because they are two decisions: which parent directory, and
 * what the project is called. Cancelling either cancels the command.
 */
async function chooseNewProjectFolder(): Promise<string | undefined> {
  const parent = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Create the project here",
    title: "New Dabbler project — where should it go?",
  });
  if (!parent || parent.length === 0) return undefined;
  const name = await vscode.window.showInputBox({
    title: "New Dabbler project — what is it called?",
    prompt: "A folder of this name is created, initialised and set up.",
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === "" ? "The project needs a name." : undefined,
  });
  if (name === undefined) return undefined;
  const root = path.join(parent[0].fsPath, name.trim());
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (error) {
    vscode.window.showErrorMessage(
      `Could not create ${root}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
  return root;
}

/**
 * Start session 1 in the project just prepared.
 *
 * It calls the flow directly with the repository it knows, rather than
 * dispatching the tree's command: that handler reads its repository off the
 * node it is invoked with, so an argument-less dispatch reaches nothing.
 */
async function startSessionIn(root: string): Promise<unknown> {
  return runStartSession(
    {
      root,
      sessionsDir: path.join(root, "docs", "sessions"),
    } as SessionsRepository,
    defaultSessionRunUi(),
    productionRouter(),
  );
}
