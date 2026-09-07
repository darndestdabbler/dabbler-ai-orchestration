// Open Module: one module of a multi-module solution, in its own window.
//
// The row says which module; the router makes the focused checkout --
// `dabbler module open <slug>`, a blob-filtered sparse clone that holds the
// module and never a sibling's source -- and answers with the clone's path
// as JSON; this opens a new window there. The extension never derives the
// path itself: the router's answer is the path the clone was made at, and a
// second derivation would eventually disagree with the first.
//
// Offered only on a module row of a multi-module solution. A single-module
// repository IS its module, and this window is already its checkout.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";

import type { Projection, SolutionNode } from "../providers/solutionTreeModel.ts";

/** The injectable surface, so the flow is unit-testable under the vscode stub. */
export interface OpenModuleUi {
  /** Open `path` in a new window, keeping this one. */
  openFolder: (path: string) => Thenable<unknown>;
  showWarningMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): OpenModuleUi {
  return {
    openFolder: (path) => vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(path), true),
    showWarningMessage: (m) => vscode.window.showWarningMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/** What the command receives: the tree's node, or nothing when run from the palette. */
export interface ModuleTargetSource {
  readonly node?: SolutionNode;
  readonly projection?: Projection | null;
}

/** The clone's path out of `module open`'s JSON answer, or null when the answer is not one. */
export function clonePathIn(stdout: string): string | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed !== null && typeof parsed === "object" && typeof (parsed as { path?: unknown }).path === "string") {
      return (parsed as { path: string }).path;
    }
  } catch {
    // Not JSON: the router said something else, and the caller shows it.
  }
  return null;
}

/**
 * Make (or find) the module's focused checkout and open it in a new window.
 *
 * The router's refusals arrive as its own sentence -- a single-module
 * solution, a clone that already exists, an origin that is missing -- and
 * are shown as written: they are the sentences that know why.
 */
export async function openModule(
  router: Pick<Router, "module">,
  source: ModuleTargetSource,
  ui: OpenModuleUi = defaultUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showWarningMessage("Open a repository first — a module's focused checkout is made from the one you have open.");
    return;
  }
  if (!source.node || source.node.kind !== "module") {
    ui.showWarningMessage("Pick a module in the Solution Explorer first — this opens the module a row names, so it needs the row.");
    return;
  }
  if (source.projection && !source.projection.solution.multi) {
    ui.showWarningMessage("The repository is the module, and this window is its checkout. A second entry in docs/modules.yaml is what makes a focused checkout.");
    return;
  }
  const result = await router.module.open({ workspaceRoot: root, slug: source.node.slug });
  if (!result.ok) {
    ui.showWarningMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return;
  }
  const path = clonePathIn(result.value.stdout ?? "");
  if (path === null) {
    ui.showWarningMessage((result.value.stdout ?? "").trim() || "The router answered without a path to open.");
    return;
  }
  await ui.openFolder(path);
}
