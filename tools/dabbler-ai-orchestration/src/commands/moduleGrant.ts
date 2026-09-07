// Widen for debugging, and End grant: the two things a developer does to a
// sibling's row from inside a module's focused checkout.
//
// Widening is asked for, never taken: the router raises the owed decision
// (`dabbler module grant <sibling> --reason ... --debug`), and the operator
// answers it on the Work Explorer, where it renders on the session that
// asked. Ending a grant is the router's too (`module revoke`), and it
// refuses while the sibling's roots hold changes. Both say what the router
// said, in its own sentence.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";

import type { Projection, SolutionNode } from "../providers/solutionTreeModel.ts";

export interface ModuleGrantUi {
  showInputBox: typeof vscode.window.showInputBox;
  showInformationMessage: (message: string) => unknown;
  showWarningMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): ModuleGrantUi {
  return {
    showInputBox: vscode.window.showInputBox,
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showWarningMessage: (m) => vscode.window.showWarningMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

export interface ModuleTargetSource {
  readonly node?: SolutionNode;
  readonly projection?: Projection | null;
}

function target(source: ModuleTargetSource, ui: ModuleGrantUi): { root: string; slug: string } | null {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showWarningMessage("Open a module's focused checkout first — a grant widens the checkout you have open.");
    return null;
  }
  if (!source.node || source.node.kind !== "module") {
    ui.showWarningMessage("Pick a module in the Solution Explorer first — this acts on the module a row names.");
    return null;
  }
  return { root, slug: source.node.slug };
}

/** Ask for the sibling's source, with a reason, as a debugging grant. */
export async function widenForDebugging(
  router: Pick<Router, "module">,
  source: ModuleTargetSource,
  ui: ModuleGrantUi = defaultUi(),
): Promise<void> {
  const picked = target(source, ui);
  if (!picked) return;
  const reason = await ui.showInputBox({
    title: `Widen this checkout to ${picked.slug}'s source`,
    prompt:
      "Why the session needs the sibling's source rather than its package. The reason is " +
      "recorded with the grant, and the operator answers the request on the Work Explorer.",
    placeHolder: "stepping through the mapper with the real model",
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === "" ? "A grant needs a reason; it is recorded." : null),
  });
  if (reason === undefined || reason.trim() === "") return;
  const result = await router.module.grant({ workspaceRoot: picked.root, slug: picked.slug, reason: reason.trim(), debug: true });
  if (!result.ok) {
    ui.showWarningMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return;
  }
  ui.showInformationMessage(
    (result.value.stdout ?? "").trim() ||
      `The request for ${picked.slug}'s source is on the Work Explorer to answer.`,
  );
}

/** End a grant: narrow the checkout again. */
export async function endGrant(
  router: Pick<Router, "module">,
  source: ModuleTargetSource,
  ui: ModuleGrantUi = defaultUi(),
): Promise<void> {
  const picked = target(source, ui);
  if (!picked) return;
  const result = await router.module.revoke({ workspaceRoot: picked.root, slug: picked.slug });
  if (!result.ok) {
    ui.showWarningMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return;
  }
  ui.showInformationMessage((result.value.stdout ?? "").trim() || `${picked.slug}'s source is out of this checkout again.`);
}
