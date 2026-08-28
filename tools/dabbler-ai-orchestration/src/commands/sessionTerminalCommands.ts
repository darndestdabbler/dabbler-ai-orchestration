// Start / close session as terminal commands.
//
// The commands are PRE-TYPED into a terminal, not executed: start needs
// the operator to declare the engine (and optionally provider/model),
// and close runs the gates — both are actions the operator should see
// and confirm, not side effects of a tree click. The terminal opens at
// the repository root, so the interpreter resolution and the router's
// own sessions-root derivation both match every other invocation.

import * as vscode from "vscode";
import { SessionsRepository } from "../types";
import { resolvePythonInterpreter } from "../utils/pythonInterpreter";
import { quoteForDisplay } from "../utils/routerCli";
import { asRepositoryNode } from "./workExplorerTreeCommands";

const TERMINAL_NAME = "Dabbler Session";

function sessionTerminal(cwd: string): vscode.Terminal {
  const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
  if (existing) return existing;
  return vscode.window.createTerminal({ name: TERMINAL_NAME, cwd });
}

/**
 * Sessions are numbered directly in the repository the terminal opens
 * in, so neither line names one: the router derives the sessions root
 * from where it is standing.
 */
export function startSessionCommandLine(pythonPath: string): string {
  return [
    quoteForDisplay(pythonPath),
    "-m",
    "ai_router.session",
    "start",
    "--engine",
    "human",
  ].join(" ");
}

export function closeSessionCommandLine(pythonPath: string): string {
  return [
    quoteForDisplay(pythonPath),
    "-m",
    "ai_router.session",
    "close",
  ].join(" ");
}

function sendToTerminal(repository: SessionsRepository, commandLine: string): void {
  const terminal = sessionTerminal(repository.root);
  terminal.show();
  // execute=false: the command sits on the prompt for the operator to
  // adjust (engine, --dry-run, --force) and confirm with Enter.
  terminal.sendText(commandLine, false);
}

export function registerSessionTerminalCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.startSession",
      (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        const python = resolvePythonInterpreter(node.repository.root);
        sendToTerminal(node.repository, startSessionCommandLine(python));
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.closeSession",
      (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        const python = resolvePythonInterpreter(node.repository.root);
        sendToTerminal(node.repository, closeSessionCommandLine(python));
      },
    ),
  );
}
