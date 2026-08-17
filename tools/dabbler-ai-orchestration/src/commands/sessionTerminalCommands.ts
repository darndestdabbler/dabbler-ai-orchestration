// Start / close session as terminal commands.
//
// The commands are PRE-TYPED into a terminal, not executed: start needs
// the operator to declare the engine (and optionally provider/model),
// and close runs the gates — both are actions the operator should see
// and confirm, not side effects of a tree click. The terminal opens at
// the set's workspace root so the interpreter resolution matches every
// other router invocation.

import * as vscode from "vscode";
import { SessionSet } from "../types";
import { resolvePythonInterpreter } from "../utils/pythonInterpreter";
import { quoteForDisplay } from "../utils/routerCli";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

const TERMINAL_NAME = "Dabbler Session";

function sessionTerminal(cwd: string): vscode.Terminal {
  const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
  if (existing) return existing;
  return vscode.window.createTerminal({ name: TERMINAL_NAME, cwd });
}

export function startSessionCommandLine(pythonPath: string, setDir: string): string {
  return [
    quoteForDisplay(pythonPath),
    "-m",
    "ai_router.session",
    "start",
    "--session-set-dir",
    quoteForDisplay(setDir),
    "--engine",
    "human",
  ].join(" ");
}

export function closeSessionCommandLine(pythonPath: string, setDir: string): string {
  return [
    quoteForDisplay(pythonPath),
    "-m",
    "ai_router.session",
    "close",
    "--session-set-dir",
    quoteForDisplay(setDir),
  ].join(" ");
}

function sendToTerminal(set: SessionSet, commandLine: string): void {
  const terminal = sessionTerminal(set.root);
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
      (item: SetItem) => {
        if (!item?.set) return;
        const python = resolvePythonInterpreter(item.set.root);
        sendToTerminal(item.set, startSessionCommandLine(python, item.set.dir));
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.closeSession",
      (item: SetItem) => {
        if (!item?.set) return;
        const python = resolvePythonInterpreter(item.set.root);
        sendToTerminal(item.set, closeSessionCommandLine(python, item.set.dir));
      },
    ),
  );
}
