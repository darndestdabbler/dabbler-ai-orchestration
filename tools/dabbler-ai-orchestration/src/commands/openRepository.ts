// Getting from one repository of a solution to another.
//
// This journey did not exist. The Solution Explorer contributed no context
// menu at all, so a developer who could SEE that `Dabbler.Csv.Model` is built
// by the repository beside them had no way to go there from the row saying
// so -- they went to the file manager and found it by name. Three commands
// close that, and the third is the one that always works: revealing a folder
// needs nothing of VS Code but the folder.
//
// Every one of them is offered only for a repository that is actually on this
// machine. A menu entry that fails when it is used costs more trust than a
// menu entry that is not there.

import * as vscode from "vscode";

import type { Projection, SolutionNode } from "../providers/solutionTreeModel.ts";
import { repositoryPathOf } from "../providers/solutionTreeModel.ts";

/** What a command receives: the tree's node, or nothing when run from the palette. */
export interface RepositoryTargetSource {
  readonly node?: SolutionNode;
  readonly projection?: Projection | null;
}

/**
 * The folder a command should act on, or the sentence explaining why none.
 *
 * Resolved through the tree model, so the path a command opens is the path
 * the row the operator clicked was describing. A command that recomputed it
 * would eventually disagree, and "Open Repository" opening a different
 * repository than the one named is worse than the command not existing.
 */
export function repositoryTarget(
  source: RepositoryTargetSource,
): { readonly path: string | null; readonly reason: string } {
  if (!source.node || !source.projection) {
    return {
      path: null,
      reason:
        "Pick a repository in the Solution Explorer first — this opens the " +
        "repository a row names, so it needs the row.",
    };
  }
  const path = repositoryPathOf(source.node, source.projection);
  if (path === null) {
    return {
      path: null,
      reason:
        "That repository is not on this machine. The solution graph is a " +
        "declaration about a solution, not about one laptop — clone it " +
        "beside this one and the row becomes navigable.",
    };
  }
  return { path, reason: "" };
}

async function act(
  source: RepositoryTargetSource,
  run: (uri: vscode.Uri) => Thenable<unknown>,
): Promise<void> {
  const target = repositoryTarget(source);
  if (target.path === null) {
    void vscode.window.showWarningMessage(target.reason);
    return;
  }
  await run(vscode.Uri.file(target.path));
}

/**
 * Open the producing repository, replacing this window.
 *
 * VS Code closes and reopens the window, which ends this extension host. That
 * is the ordinary cost of `openFolder` and the reason the new-window form
 * exists beside it: a developer comparing two repositories wants both.
 */
export function openRepository(source: RepositoryTargetSource): Promise<void> {
  return act(source, (uri) =>
    vscode.commands.executeCommand("vscode.openFolder", uri, false),
  );
}

/** Open it beside this one, keeping both. */
export function openRepositoryInNewWindow(
  source: RepositoryTargetSource,
): Promise<void> {
  return act(source, (uri) =>
    vscode.commands.executeCommand("vscode.openFolder", uri, true),
  );
}

/**
 * Show the folder in the operating system's file manager.
 *
 * The one that cannot fail for a reason inside VS Code, and the fallback the
 * plan named: whatever else is going on, a developer who can see the folder
 * can get to it.
 */
export function revealRepository(source: RepositoryTargetSource): Promise<void> {
  return act(source, (uri) => vscode.commands.executeCommand("revealFileInOS", uri));
}
