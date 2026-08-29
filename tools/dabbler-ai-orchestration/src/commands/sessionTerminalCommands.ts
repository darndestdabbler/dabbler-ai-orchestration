// Start / close session as terminal commands.
//
// The commands are PRE-TYPED into a terminal, not executed: start needs
// the operator to declare the engine (and optionally provider/model),
// and close runs the gates — both are actions the operator should see
// and confirm, not side effects of a tree click. The terminal opens at
// the repository root, so the router's own sessions-root derivation
// matches every other invocation.
//
// Nothing here knows what the router is. It asks a `RouterCommands` for
// the line to pre-type; whether that line names a Python interpreter, a
// bundled binary or nothing at all is the router's business.

import * as vscode from "vscode";
import type { SessionsRepository } from "../utils/fileSystem";
import { RouterCommands, productionCommands } from "../router/host";
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
export function startSessionCommandLine(
  cwd: string,
  commands: RouterCommands,
): string | null {
  return commands.commandLine("session", ["start", "--engine", "human"], cwd);
}

export function closeSessionCommandLine(
  cwd: string,
  commands: RouterCommands,
): string | null {
  return commands.commandLine("session", ["close"], cwd);
}

function sendToTerminal(repository: SessionsRepository, commandLine: string): void {
  const terminal = sessionTerminal(repository.root);
  terminal.show();
  // execute=false: the command sits on the prompt for the operator to
  // adjust (engine, --dry-run, --force) and confirm with Enter.
  terminal.sendText(commandLine, false);
}

function launch(
  arg: unknown,
  verb: string,
  line: (cwd: string, commands: RouterCommands) => string | null,
  commands: RouterCommands,
): void {
  const node = asRepositoryNode(arg);
  if (!node) return;
  const commandLine = line(node.repository.root, commands);
  // A router with no command line to pre-type is not an error, but it is
  // also not a no-op: the operator clicked something. It says so, and
  // what these two commands become for such a router is session 35's
  // decision (see `router/host.ts`) — clicking must not fail silently
  // while that decision is outstanding.
  if (commandLine === null) {
    vscode.window.showInformationMessage(
      `The configured router has no terminal command for \`${verb}\`. ` +
        `Run it from the session lifecycle instead.`,
    );
    return;
  }
  sendToTerminal(node.repository, commandLine);
}

export function registerSessionTerminalCommands(
  context: vscode.ExtensionContext,
  commands: RouterCommands = productionCommands(),
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.startSession",
      (arg: unknown) => launch(arg, "session start", startSessionCommandLine, commands),
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.closeSession",
      (arg: unknown) => launch(arg, "session close", closeSessionCommandLine, commands),
    ),
  );
}
