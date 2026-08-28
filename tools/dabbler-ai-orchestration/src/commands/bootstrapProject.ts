// Set Up New Project: the WHOLE first-run sequence in one visible
// terminal — create the workspace venv when it is missing, install (or
// upgrade) the router into the interpreter every later spawn resolves,
// then run the bootstrap. The old single-line form assumed the venv and
// router already existed; on a fresh project the resolver fell back to
// bare `python` and `-m ai_router.bootstrap` died with
// ModuleNotFoundError (two real first-runs, same day). Lines are sent
// separately (`;` semantics, shell-agnostic): a pip upgrade that fails
// offline must not block a bootstrap that can already run.

import * as vscode from "vscode";
import {
  describeMissingPython,
  detectWorkspaceVenvInterpreter,
  explicitPythonPathSetting,
  resolveScaffoldBootstrapPython,
  venvInterpreterCandidate,
} from "../utils/pythonInterpreter";
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

export function bootstrapCommandLine(pythonPath: string, projectDir: string): string {
  return [
    quoteForDisplay(pythonPath),
    "-m",
    "ai_router.bootstrap",
    "--project-dir",
    quoteForDisplay(projectDir),
  ].join(" ");
}

/**
 * The pure setup sequence. `python` is an interpreter to use directly
 * (the operator's explicit setting, or an existing workspace venv);
 * when null, `basePython` creates `.venv` first and the venv
 * interpreter runs the rest. Returns null when no interpreter exists at
 * all — the caller surfaces the missing-Python explainer instead of
 * composing a command destined to fail.
 */
export function setupCommandSequence(opts: {
  projectDir: string;
  python: string | null;
  basePython: string | null;
  runBootstrap: boolean;
}): string[] | null {
  const lines: string[] = [];
  let python = opts.python;
  if (!python) {
    if (!opts.basePython) return null;
    lines.push([quoteForDisplay(opts.basePython), "-m", "venv", ".venv"].join(" "));
    python = venvInterpreterCandidate(opts.projectDir);
  }
  lines.push(installCommandLine(python));
  if (opts.runBootstrap) {
    lines.push(bootstrapCommandLine(python, opts.projectDir));
  }
  return lines;
}

/**
 * Host-facing resolution for the setup sequence:
 *   1. explicit `dabblerSessionSets.pythonPath` (validated; a
 *      configured-but-missing interpreter is an operator error to
 *      surface, and no venv is created around an operator's pin);
 *   2. an existing workspace `.venv` interpreter;
 *   3. a PATH interpreter that creates `.venv` first;
 *   4. null — nothing usable resolves.
 */
export function resolveSetupSequence(
  workspaceRoot: string,
  runBootstrap: boolean,
): string[] | null {
  const explicitSet = explicitPythonPathSetting() !== undefined;
  if (!explicitSet) {
    const venv = detectWorkspaceVenvInterpreter(workspaceRoot);
    if (venv) {
      return setupCommandSequence({
        projectDir: workspaceRoot, python: venv, basePython: null,
        runBootstrap,
      });
    }
  }
  // Explicit-only validation when set; first PATH candidate otherwise.
  const resolved = resolveScaffoldBootstrapPython(workspaceRoot);
  if (!resolved) return null;
  return setupCommandSequence({
    projectDir: workspaceRoot,
    python: explicitSet ? resolved : null,
    basePython: explicitSet ? null : resolved,
    runBootstrap,
  });
}

export function runSetupSequenceInTerminal(
  terminalName: string,
  root: string,
  runBootstrap: boolean,
  actionLabel: string,
): void {
  const lines = resolveSetupSequence(root, runBootstrap);
  if (!lines) {
    vscode.window.showErrorMessage(describeMissingPython(actionLabel));
    return;
  }
  const terminal = vscode.window.createTerminal({ name: terminalName, cwd: root });
  terminal.show();
  for (const line of lines) {
    terminal.sendText(line, true);
  }
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
      runSetupSequenceInTerminal(
        "Dabbler Bootstrap", root, true, "Set Up New Project",
      );
    }),
  );
}
