// Pack Module: the module's committed package, asked for from its row.
//
// The framework packs a changed module itself at the candidate, before the
// run of record; this is the same pack asked for out of band -- so that a
// sibling's next session can consume the package -- which the walkthroughs
// had a person type as `dabbler module pack <slug>`. The row says which
// module; the router builds the package, moves the central pin and writes
// the record, and says so in its own lines: the version, each artefact, the
// pin, the record. The whole answer goes to the Dabbler Commands channel,
// the `packed` line is the message, and a refusal is shown as the router
// wrote it. Nothing is computed here.
//
// Offered only on a module row of a multi-module solution: a single-module
// repository has no sibling to consume a package, and the router refuses
// the pack in its own words if asked anyway.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";

import type { Projection, SolutionNode } from "../providers/solutionTreeModel.ts";
import { routerOutputChannel } from "../router/commandLog";

export interface PackModuleUi {
  showInformationMessage: (message: string) => unknown;
  showWarningMessage: (message: string) => unknown;
  /** Where the whole answer goes, at length. */
  log: (text: string) => void;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): PackModuleUi {
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

/**
 * The line worth a message: the `packed <slug> <version>` line when the
 * router wrote one, else its first line. On a Maven solution the first pack
 * writes the root build files before it packs, and those `wrote` lines
 * belong in the channel, not in the message.
 */
export function packSummary(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return lines.find((line) => line.startsWith("packed ")) ?? lines[0] ?? "The router packed nothing it named.";
}

export async function packModule(
  router: Pick<Router, "module">,
  source: ModuleTargetSource,
  ui: PackModuleUi = defaultUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showWarningMessage("Open a repository first — a module is packed from the one you have open.");
    return;
  }
  const node = source.node;
  if (!node || node.kind !== "module") {
    ui.showWarningMessage("Pick a module in the Solution Explorer first — this packs the module a row names.");
    return;
  }
  const result = await router.module.pack({ workspaceRoot: root, slug: node.slug });
  if (!result.ok) {
    ui.showWarningMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return;
  }
  const stdout = result.value.stdout ?? "";
  ui.log(`pack of ${node.slug}:\n${stdout.trimEnd()}`);
  ui.showInformationMessage(`${node.slug}: ${packSummary(stdout)}`);
}
