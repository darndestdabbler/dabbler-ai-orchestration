// Install the router: ONE command, one terminal, `pip install
// dabbler-ai-router`. The interpreter comes from the same resolution
// every router invocation uses (explicit setting, workspace .venv, bare
// python), so the install lands where the extension will look for it.

import * as vscode from "vscode";
import { resolvePythonInterpreter } from "../utils/pythonInterpreter";
import { quoteForDisplay } from "../utils/routerCli";

export const ROUTER_DISTRIBUTION = "dabbler-ai-router";

export function installCommandLine(pythonPath: string): string {
  return [
    quoteForDisplay(pythonPath),
    "-m",
    "pip",
    "install",
    "--upgrade",
    ROUTER_DISTRIBUTION,
  ].join(" ");
}

export function registerInstallAiRouterCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.installAiRouter", () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? undefined;
      const python = root ? resolvePythonInterpreter(root) : "python";
      const terminal = vscode.window.createTerminal({
        name: "Dabbler Install",
        ...(root ? { cwd: root } : {}),
      });
      terminal.show();
      terminal.sendText(installCommandLine(python), true);
    }),
  );
}
