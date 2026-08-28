// Start / close session as terminal commands.
//
// The commands are PRE-TYPED into a terminal, not executed: start needs
// the operator to declare the engine (and optionally provider/model),
// and close runs the gates — both are actions the operator should see
// and confirm, not side effects of a tree click. The terminal opens at
// the repository root, so the interpreter resolution and the router's
// own sessions-root derivation both match every other invocation.

import * as vscode from "vscode";
import type { SessionsRepository } from "../utils/fileSystem";
import { resolvePythonInterpreter } from "../utils/pythonInterpreter";
import { buildCommandLine } from "../utils/routerCli";
import { pythonModuleFor } from "../router/pythonSpawnRouter";
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
 *
 * The module comes from the router's own verb table and the line from
 * the same builder that echoes every spawned command, so what is
 * pre-typed here and what the extension runs itself cannot say different
 * things about the same verb.
 */
function sessionCommandLine(pythonPath: string, args: string[]): string {
  const module = pythonModuleFor("session");
  if (module === null) throw new Error("the session verb has no command line");
  return buildCommandLine(pythonPath, { module, args });
}

export function startSessionCommandLine(pythonPath: string): string {
  return sessionCommandLine(pythonPath, ["start", "--engine", "human"]);
}

export function closeSessionCommandLine(pythonPath: string): string {
  return sessionCommandLine(pythonPath, ["close"]);
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
