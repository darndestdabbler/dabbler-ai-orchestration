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
// "Exists" here means "is an existing regular FILE": every path this
// module probes (pyvenv.cfg, interpreter binaries, PATH candidates) is
// a file, and a bare existsSync would let a DIRECTORY-valued
// `dabblerSessionSets.pythonPath` (e.g. `C:\Python311` instead of
// `...\python.exe`) pass the Set 077 S3 pre-flight and fail later,
// mid-scaffold, after durable writes (S3 code-review verifier Major).
const realExists: FileExists = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

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

// ---------- Set 077 S3 (A10): Python-presence probe ----------

/**
 * Find a bare command on `env.PATH`. Pure (env + fs injected) so the
 * Layer-2 suite can pin the semantics without touching the real PATH.
 *
 * Windows specifics:
 *   - `<dir>/<cmd>.exe` is probed (plus `<cmd>` verbatim when it already
 *     carries an extension).
 *   - Entries under `Microsoft\WindowsApps` are SKIPPED: the Store's
 *     `python.exe` there is an app-execution alias that exists on disk
 *     but opens the Microsoft Store instead of running Python — counting
 *     it as present would suppress the missing-Python warning for
 *     exactly the operators the Troubleshooting doc warns about.
 *
 * POSIX probes `<dir>/<cmd>` as-is.
 */
export function findCommandOnPath(
  cmd: string,
  env: Record<string, string | undefined> = process.env,
  fileExists: FileExists = realExists,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const rawPath = env.PATH ?? env.Path ?? "";
  if (!rawPath) return null;
  const isWin = platform === "win32";
  // Path semantics follow the `platform` PARAMETER, not the process —
  // so the Layer-2 suite can pin win32 behavior from a POSIX runner
  // (and vice versa) with plain string fixtures.
  const p = isWin ? path.win32 : path.posix;
  const delimiter = isWin ? ";" : ":";
  for (const dir of rawPath.split(delimiter)) {
    const entry = dir.trim();
    if (!entry) continue;
    if (isWin && /\\Microsoft\\WindowsApps\\?$/i.test(entry)) continue;
    const candidates = isWin
      ? /\.[^\\/.]+$/.test(cmd)
        ? [p.join(entry, cmd)]
        : [p.join(entry, `${cmd}.exe`)]
      : [p.join(entry, cmd)];
    for (const candidate of candidates) {
      if (fileExists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Pure core of the scaffold-bootstrap resolution (S3 verification round
 * 1, Major 1): the ONE list of interpreters the scaffold path will
 * actually invoke, so the pre-flight probe and the spawn can never
 * disagree. Returns the command/path to spawn, or null when nothing the
 * scaffold would use resolves:
 *   - an explicit setting decides alone (a configured-but-missing
 *     interpreter is an operator error to surface, never silently
 *     bypassed);
 *   - otherwise `python3` then `python` on POSIX (python3 is the
 *     canonical modern name; bare `python` may be Python 2), and
 *     `python` only on Windows (the `py` launcher is deliberately
 *     excluded — see the probe's coupled-limitation note).
 */
export function resolveBootstrapPythonCore(
  explicitSetting: string | undefined,
  workspaceRoot: string,
  env: Record<string, string | undefined> = process.env,
  fileExists: FileExists = realExists,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (explicitSetting) {
    const normalized = normalizeExplicit(explicitSetting, workspaceRoot);
    if (p.isAbsolute(normalized)) {
      return fileExists(normalized) ? normalized : null;
    }
    return findCommandOnPath(normalized, env, fileExists, platform) !== null
      ? normalized
      : null;
  }
  const commands = platform === "win32" ? ["python"] : ["python3", "python"];
  for (const cmd of commands) {
    if (findCommandOnPath(cmd, env, fileExists, platform) !== null) return cmd;
  }
  return null;
}

/**
 * Host-facing bootstrap resolver for the scaffold path: the explicit
 * `dabblerSessionSets.pythonPath` (validated), else the first of the
 * platform's bootstrap commands actually on PATH. Null when nothing
 * resolves — the caller's pre-flight refuses before any durable write.
 */
export function resolveScaffoldBootstrapPython(
  workspaceRoot: string,
  fileExists: FileExists = realExists,
): string | null {
  return resolveBootstrapPythonCore(
    explicitPythonPathSetting(),
    workspaceRoot,
    process.env,
    fileExists,
  );
}

/**
 * Pure core of the A10 probe: is there ANY usable Python signal for this
 * workspace? True when one of:
 *   1. an explicit interpreter setting resolves to an existing file
 *      (absolute / workspace-relative), or names a bare command found on
 *      PATH;
 *   2. the dabbler-standard workspace venv interpreter exists (a venv
 *      implies a working base interpreter built it, and every spawn path
 *      prefers the venv anyway);
 *   3. a bootstrap command the scaffold would actually invoke is on PATH
 *      (`python3`/`python` on POSIX, `python` on Windows) — shared with
 *      {@link resolveBootstrapPythonCore} so probe and spawn cannot
 *      disagree (S3 verification round 1, Major 1).
 *
 * A filesystem probe, not an execution probe — it cannot prove the
 * interpreter RUNS, only that something plausibly runnable is installed.
 * That is the right bar for a form warning + scaffold pre-flight: false
 * ("nothing resolves at all") is a high-confidence "install Python
 * first" signal, while execution-level failures still surface through
 * the install/spawn error paths.
 *
 * Coupled limitation, deliberate (S3 code-review Minor 6): the probe
 * checks only what the SPAWN paths would actually use — the explicit
 * setting, the venv, or bare `python`/`python3` on PATH. It does NOT
 * honor `PATHEXT` variants or the Windows `py` launcher, because the
 * spawn paths don't either: a probe that counted `py.exe` as present
 * would suppress the warning on exactly the machines where the spawn
 * then dies with ENOENT (the A10 bug class this probe exists to
 * prevent). A py-launcher-only machine gets the warning, whose
 * remedies (Add-to-PATH or set `dabblerSessionSets.pythonPath`) both
 * fix the spawn paths too.
 */
export function probePythonPresenceCore(
  explicitSetting: string | undefined,
  workspaceRoot: string,
  env: Record<string, string | undefined> = process.env,
  fileExists: FileExists = realExists,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (explicitSetting) {
    return (
      resolveBootstrapPythonCore(
        explicitSetting,
        workspaceRoot,
        env,
        fileExists,
        platform,
      ) !== null
    );
  }
  if (detectWorkspaceVenvInterpreter(workspaceRoot, fileExists) !== null) {
    return true;
  }
  return (
    resolveBootstrapPythonCore(
      undefined,
      workspaceRoot,
      env,
      fileExists,
      platform,
    ) !== null
  );
}

/**
 * True when an already-RESOLVED interpreter path/command plausibly
 * exists: an absolute path must exist on disk; a bare command must be
 * findable on PATH. The pre-spawn check for call sites that already
 * hold a resolved interpreter (e.g. the blessed-writer spawn) — a
 * cheaper, earlier, friendlier failure than `spawn ... ENOENT`.
 */
export function interpreterResolves(
  pythonPath: string,
  env: Record<string, string | undefined> = process.env,
  fileExists: FileExists = realExists,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!pythonPath) return false;
  const p = platform === "win32" ? path.win32 : path.posix;
  if (p.isAbsolute(pythonPath)) return fileExists(pythonPath);
  if (pythonPath.includes("\\") || pythonPath.includes("/")) {
    return fileExists(path.resolve(pythonPath));
  }
  return findCommandOnPath(pythonPath, env, fileExists, platform) !== null;
}

/**
 * Host-facing A10 probe: reads the operator's explicit
 * `dabblerSessionSets.pythonPath` (if any) and runs the pure core
 * against the real environment. Feeds the Getting Started form's
 * `pythonPresent` payload flag and the scaffold pre-flight.
 */
export function probePythonPresence(
  workspaceRoot: string,
  fileExists: FileExists = realExists,
): boolean {
  return probePythonPresenceCore(
    explicitPythonPathSetting(),
    workspaceRoot,
    process.env,
    fileExists,
  );
}

/**
 * The friendly missing-interpreter explainer (A10 — the
 * `describeAiRouterImportFailure` pattern): name the problem class
 * precisely and the three remedies, so neither an operator nor an AI
 * orchestrator mis-reads a missing base interpreter as a missing-keys
 * or extension problem. Shared by the scaffold pre-flight and the
 * blessed-writer spawn pre-check.
 */
export function describeMissingPython(actionLabel: string): string {
  return (
    `${actionLabel} needs a Python interpreter, but none was found — ` +
    `no Python is installed, or it is not on PATH. This is a missing ` +
    `Python installation, NOT an extension or API-key problem. Install ` +
    `Python from https://www.python.org/downloads/ (tick "Add python.exe ` +
    `to PATH"; avoid the Microsoft Store build), or point the ` +
    `'dabblerSessionSets.pythonPath' setting at an installed interpreter, ` +
    `then reload the VS Code window and try again.`
  );
}
