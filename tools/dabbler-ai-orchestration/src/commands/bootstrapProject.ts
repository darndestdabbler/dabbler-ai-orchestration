// Bootstrap a consumer project: one terminal command running
// `python -m ai_router.bootstrap`, which writes the managed
// AGENTS.md/CLAUDE.md instruction blocks and prints the two bootstrap
// prompts (plan, then decomposition). The terminal shows what was
// written; the extension adds no scaffolding logic of its own.

import * as vscode from "vscode";
import { resolvePythonInterpreter } from "../utils/pythonInterpreter";
import { quoteForDisplay } from "../utils/routerCli";

export function bootstrapCommandLine(pythonPath: string, projectDir: string): string {
  return [
    quoteForDisplay(pythonPath),
    "-m",
    "ai_router.bootstrap",
    "--project-dir",
    quoteForDisplay(projectDir),
  ].join(" ");
}

export function registerBootstrapProjectCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.setupNewProject", () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage(
          "Open the project folder first, then run Set Up New Project.",
        );
        return;
      }
      const terminal = vscode.window.createTerminal({
        name: "Dabbler Bootstrap",
        cwd: root,
      });
      terminal.show();
      terminal.sendText(bootstrapCommandLine(resolvePythonInterpreter(root), root), true);
    }),
  );
}
