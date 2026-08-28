// The commands the native Work Explorer tree needs that a context-menu
// contribution cannot express: the two left-click activations.
//
// Every OTHER row action needs nothing here at all. The registry's
// actions read their target off the clicked node — `item.repository` or
// `item.session` — and the tree's nodes expose exactly those
// properties, so the whole existing action surface accepts a tree node
// unmodified.

import * as vscode from "vscode";
import { planLeftClickActivation } from "../providers/rowMenuHelpers";
import { RepositoryNode, SessionNode } from "../providers/workExplorerTreeModel";

/** Narrow an untrusted command argument to a repository tree node. */
export function asRepositoryNode(arg: unknown): RepositoryNode | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const node = arg as Partial<RepositoryNode>;
  return node.kind === "repository" && node.repository
    ? (node as RepositoryNode)
    : undefined;
}

/**
 * Narrow an untrusted command argument to a session-bearing tree node.
 *
 * Requires BOTH `repository` and `session`: a session node with no
 * repository cannot say which plan it belongs to, and one with no
 * session record cannot say which section — either way the honest answer
 * is to do nothing rather than open an arbitrary file.
 */
export function asSessionNode(arg: unknown): SessionNode | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const node = arg as Partial<SessionNode>;
  return node.kind === "session" && node.repository && node.session
    ? (node as SessionNode)
    : undefined;
}

/**
 * Left-click on a repository row: the session plan always opens, and a
 * repository with work left also writes the start-next-session prompt to
 * the clipboard and toasts.
 */
export async function activateRepositoryRow(arg: unknown): Promise<void> {
  const node = asRepositoryNode(arg);
  if (!node) return;
  const plan = planLeftClickActivation(node.repository);
  await vscode.commands.executeCommand(plan.openCommand.commandId, node);
  if (!plan.clipboardWrite) return;
  try {
    await vscode.env.clipboard.writeText(plan.clipboardWrite.text);
    vscode.window.showInformationMessage(plan.clipboardWrite.toast);
  } catch (err) {
    console.warn(
      `[WorkExplorerTree] left-click clipboard write failed for ` +
        `"${node.repository.label}"`,
      err,
    );
  }
}

/**
 * Left-click on a SESSION row: open the repository's session plan
 * positioned at that session's own block.
 *
 * It dispatches the same `dabblerSessionSets.openSpec` the repository
 * row's activation goes through — the session-level sibling of a
 * behaviour that exists, sharing its "does the file exist" answer and
 * its message wording rather than growing a parallel one. The node
 * itself is the argument, which is what tells `openSpec` a section is
 * wanted; a repository node through the same command opens at the top.
 *
 * No clipboard half. The repository row's shortcut copies "start the
 * NEXT session", which is a repository-level question; the per-session
 * run prompt is a context-menu action.
 */
export async function activateSessionRow(arg: unknown): Promise<void> {
  const node = asSessionNode(arg);
  if (!node) return;
  await vscode.commands.executeCommand("dabblerSessionSets.openSpec", node);
}

export function registerWorkExplorerTreeCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerWorkExplorer.activateRepository",
      (arg: unknown) => activateRepositoryRow(arg),
    ),
    vscode.commands.registerCommand(
      "dabblerWorkExplorer.activateSession",
      (arg: unknown) => activateSessionRow(arg),
    ),
  );
}
