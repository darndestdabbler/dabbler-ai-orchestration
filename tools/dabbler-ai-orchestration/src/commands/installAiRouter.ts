// Install the router: the same setup sequence Set Up New Project runs,
// minus the bootstrap — create the workspace venv when it is missing and
// `pip install --upgrade dabbler-ai-router` into the interpreter the
// extension will actually resolve. With no workspace open, a bare
// `python` install is the best available fallback.

import * as vscode from "vscode";
import { runSetupSequenceInTerminal, installCommandLine } from "./bootstrapProject";

export { ROUTER_DISTRIBUTION, installCommandLine } from "./bootstrapProject";

export function registerInstallAiRouterCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.installAiRouter", () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        const terminal = vscode.window.createTerminal({ name: "Dabbler Install" });
        terminal.show();
        terminal.sendText(installCommandLine("python"), true);
        return;
      }
      runSetupSequenceInTerminal(
        "Dabbler Install", root, false, "Install ai-router",
      );
    }),
  );
}
