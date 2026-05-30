// Centralized Python-interpreter resolution for every extension spawn site.
//
// Before this module, four commands each carried their own copy of a
// `resolvePythonPath()` helper that read `dabblerSessionSets.pythonPath`
// and fell back to a bare `"python"` on PATH. On a host where bare
// `python` resolves to a system interpreter that has no `ai_router`
// installed (the common Windows `C:\PythonXY` case), every
// `python -m ai_router.<x>` spawn died with "No module named ai_router…"
// — which an AI orchestrator downstream mis-read as "missing API keys".
//
// The fix is one shared resolver that, when the operator has NOT pinned
// an interpreter, auto-detects the dabbler-standard workspace venv at
// `<root>/.venv` before falling back to bare `python`. Router-running
// commands call `resolvePythonInterpreter`; the installer (whose python
// is a *bootstrap* that builds the venv) calls `resolveExplicitPythonPath`
// to keep its original semantics.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export type FileExists = (p: string) => boolean;
const realExists: FileExists = (p) => fs.existsSync(p);

/**
 * The candidate interpreter path inside a dabbler-standard `<root>/.venv`.
 * Windows venvs put the interpreter under `Scripts/`, POSIX under `bin/`.
 */
export function venvInterpreterCandidate(workspaceRoot: string): string {
  return process.platform === "win32"
    ? path.join(workspaceRoot, ".venv", "Scripts", "python.exe")
    : path.join(workspaceRoot, ".venv", "bin", "python");
}

/**
 * Detect a usable workspace venv interpreter at `<workspaceRoot>/.venv`.
 *
 * A directory named `.venv` is not enough — the `pyvenv.cfg` marker is the
 * standard signature of a real virtual environment, and the interpreter
 * binary must actually exist. Returns the absolute interpreter path, or
 * `null` when no valid venv is present (so the caller falls through to its
 * next option).
 */
export function detectWorkspaceVenvInterpreter(
  workspaceRoot: string,
  fileExists: FileExists = realExists,
): string | null {
  if (!workspaceRoot) return null;
  const venvRoot = path.join(workspaceRoot, ".venv");
  if (!fileExists(path.join(venvRoot, "pyvenv.cfg"))) return null;
  const interp = venvInterpreterCandidate(workspaceRoot);
  return fileExists(interp) ? interp : null;
}

/**
 * Read the operator's explicitly-set `dabblerSessionSets.pythonPath`
 * (workspace-folder > workspace > global). Returns `undefined` when only
 * the contributed default is in effect.
 *
 * `inspect()` is required here: `getConfiguration().get()` cannot
 * distinguish "operator set it" from "the default fired", so a naive
 * `?? next` chain would never reach the venv-autodetect / bare fallback.
 */
function explicitPythonPathSetting(): string | undefined {
  const inspected = vscode.workspace
    .getConfiguration("dabblerSessionSets")
    .inspect<string>("pythonPath");
  if (!inspected) return undefined;
  const value =
    inspected.workspaceFolderValue ??
    inspected.workspaceValue ??
    inspected.globalValue;
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Normalize an explicit pythonPath value against the workspace root. */
function normalizeExplicit(value: string, workspaceRoot: string): string {
  if (path.isAbsolute(value)) return value;
  if (value.includes(path.sep) || value.includes("/")) {
    return path.resolve(workspaceRoot, value);
  }
  return value; // bare command on PATH
}

/**
 * Resolve the interpreter using ONLY the explicit setting, falling back to
 * bare `"python"`. This is the legacy behavior — used by the install
 * command, whose interpreter is the *bootstrap* that creates `.venv`
 * (auto-detecting an existing venv would defeat the bootstrap on a fresh
 * install).
 */
export function resolveExplicitPythonPath(workspaceRoot: string): string {
  const explicit = explicitPythonPathSetting();
  return explicit ? normalizeExplicit(explicit, workspaceRoot) : "python";
}

/**
 * Resolve the interpreter for a command that *runs* an `ai_router` module
 * and therefore needs an interpreter that already has the router on its
 * `sys.path`.
 *
 * Precedence:
 *   1. Explicit `dabblerSessionSets.pythonPath`.
 *   2. Auto-detected `<workspaceRoot>/.venv` interpreter (dabbler standard).
 *   3. Bare `"python"` on PATH (last resort).
 */
export function resolvePythonInterpreter(
  workspaceRoot: string,
  fileExists: FileExists = realExists,
): string {
  const explicit = explicitPythonPathSetting();
  if (explicit) return normalizeExplicit(explicit, workspaceRoot);
  return detectWorkspaceVenvInterpreter(workspaceRoot, fileExists) ?? "python";
}
