// Show Impact: what a change to this module would reach, before making one.
//
// The row says which module; the router plans a hypothetical change under
// its roots (`dabbler affected --path <root>...`), and the plan is shown:
// the modules reached, the candidates to pack, the suites that would run
// and why. The whole answer goes to the Dabbler Commands channel, where a
// developer can read it at length; the message carries its first lines.
// Nothing is computed here -- the plan is the router's, and the Explorer
// shows it.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";

import type { Projection, SolutionNode } from "../providers/solutionTreeModel.ts";
import { routerOutputChannel } from "../router/commandLog";

export interface ShowImpactUi {
  showInformationMessage: (message: string) => unknown;
  showWarningMessage: (message: string) => unknown;
  /** Where the whole answer goes, at length. */
  log: (text: string) => void;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): ShowImpactUi {
  return {
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showWarningMessage: (m) => vscode.window.showWarningMessage(m),
    log: (text) => {
      const channel = routerOutputChannel();
      channel.appendLine(text);
      channel.show(true);
    },
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

export interface ModuleTargetSource {
  readonly node?: SolutionNode;
  readonly projection?: Projection | null;
}

/** The plan's first lines, enough for a message; the channel has the rest. */
export function impactSummary(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("scope:"));
  return lines.slice(0, 4).join(" · ") || "No tests are affected by a change there.";
}

export async function showImpact(
  router: Pick<Router, "affected">,
  source: ModuleTargetSource,
  ui: ShowImpactUi = defaultUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showWarningMessage("Open a repository first — the impact of a change is planned from the one you have open.");
    return;
  }
  const node = source.node;
  if (!node || node.kind !== "module" || !source.projection) {
    ui.showWarningMessage("Pick a module in the Solution Explorer first — this plans a change under the module a row names.");
    return;
  }
  const module = source.projection.modules.find((m) => m.slug === node.slug);
  const paths = module?.codeRoots.filter((codeRoot) => codeRoot !== "." && codeRoot !== "") ?? [];
  if (paths.length === 0) {
    ui.showWarningMessage(`Module ${node.slug} declares no code root to plan a change under.`);
    return;
  }
  const result = await router.affected({ repoRoot: root, paths });
  if (!result.ok) {
    ui.showWarningMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return;
  }
  const stdout = result.value.stdout ?? "";
  ui.log(`impact of a change under ${paths.join(", ")}:\n${stdout.trimEnd()}`);
  ui.showInformationMessage(`${node.slug}: ${impactSummary(stdout)}`);
}
