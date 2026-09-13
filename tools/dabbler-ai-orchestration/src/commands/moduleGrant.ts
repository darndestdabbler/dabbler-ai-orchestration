// End grant: the one thing a developer does to a sibling's row from inside
// a module's focused checkout once a grant is in force.
//
// A grant is asked for by the session itself (`dabbler session next
// --request-grant <sibling> --reason ...`) and answered by the operator on
// the Work Explorer, where it renders on the session that asked. Ending it
// is the router's (`module revoke`), and it refuses while the sibling's
// roots hold changes. This says what the router said, in its own sentence.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";

import type { Projection, SolutionNode } from "../providers/solutionTreeModel.ts";

export interface ModuleGrantUi {
  showInformationMessage: (message: string) => unknown;
  showWarningMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): ModuleGrantUi {
  return {
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
    ui.showWarningMessage("Open a module's focused checkout first — a grant is ended in the checkout you have open.");
    return null;
  }
  if (!source.node || source.node.kind !== "module") {
    ui.showWarningMessage("Pick a module in the Solution Explorer first — this acts on the module a row names.");
    return null;
  }
  return { root, slug: source.node.slug };
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
