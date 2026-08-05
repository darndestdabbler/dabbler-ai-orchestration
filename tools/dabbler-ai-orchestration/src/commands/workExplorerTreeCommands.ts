// Set 110 Session 2 — the commands the native Work Explorer tree needs
// that the webview surface did not.
//
// There are only two kinds, and both exist because the native tree
// dispatches differently from the webview:
//
//   1. `dabblerWorkExplorer.activateSet` — the webview's L5 left-click
//      dual-action (open spec.md, and on a non-terminal row also copy
//      "Start the next session of `<slug>`."). In the webview this was a
//      message handled inside `CustomSessionSetsView`; a `TreeItem`
//      needs a real command id to put in `TreeItem.command`. The
//      BEHAVIOUR is unchanged and still decided by the shared pure
//      `planLeftClickActivation`, so the two surfaces cannot drift.
//
//   2. The module-row actions. The webview strip posted a typed
//      `moduleAction` message; a native menu invokes a command with the
//      clicked node. Rather than mint five new command ids, the five
//      EXISTING palette commands each learned to accept an optional
//      module node — invoked from the palette with no argument they
//      behave exactly as before (their own module QuickPick), and
//      invoked from a tree row they target that row's module directly.
//      That is the same explicit-target seam Set 093 established, with
//      no new public surface: see `registerModuleTargetingFromTree`.
//
// Every OTHER row action needs nothing here at all. `ROW_ACTIONS` reads
// its target as `item.set`, and the tree's set/session nodes expose
// exactly that property, so the whole existing action surface accepts a
// tree node unmodified.

import * as vscode from "vscode";
import { planLeftClickActivation } from "../providers/rowMenuHelpers";
import { SetNode } from "../providers/workExplorerTreeModel";

/** Narrow an untrusted command argument to a set-bearing tree node. */
export function asSetNode(arg: unknown): SetNode | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const node = arg as Partial<SetNode>;
  return node.kind === "set" && node.set ? (node as SetNode) : undefined;
}

/**
 * Left-click on a session-set row. Identical to the webview's
 * `handleActivateRow`: spec.md always opens; a non-terminal row also
 * writes the start-next-session prompt to the clipboard and toasts.
 */
export async function activateSetRow(arg: unknown): Promise<void> {
  const node = asSetNode(arg);
  if (!node) return;
  const plan = planLeftClickActivation(node.set.name, node.set.state);
  await vscode.commands.executeCommand(plan.openCommand.commandId, node);
  if (!plan.clipboardWrite) return;
  try {
    await vscode.env.clipboard.writeText(plan.clipboardWrite.text);
    vscode.window.showInformationMessage(plan.clipboardWrite.toast);
  } catch (err) {
    console.warn(
      `[WorkExplorerTree] left-click clipboard write failed for "${node.set.name}"`,
      err,
    );
  }
}

export function registerWorkExplorerTreeCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerWorkExplorer.activateSet",
      (arg: unknown) => activateSetRow(arg),
    ),
  );
}
