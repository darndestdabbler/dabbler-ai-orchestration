import * as cp from "child_process";
import * as path from "path";
import * as vscode from "vscode";

export interface PythonRunOptions {
  /** Path to the workspace root that owns the ai-router/ directory. */
  cwd: string;
  /** Module name passed to ``python -m`` (e.g. ``ai_router.queue_status``). */
  module: string;
  /** Module arguments. */
  args: string[];
  /** Configuration setting key holding the python executable path. */
  pythonPathSetting: string;
  /** Hard cap on the subprocess in ms. */
  timeoutMs?: number;
}

export interface PythonRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** True if the runner killed the process via ``timeoutMs``. */
  timedOut: boolean;
}

/**
 * Resolve the configured Python interpreter for a given setting key.
 *
 * The setting holds a string like ``"python"`` or ``".venv/Scripts/python.exe"``.
 * Relative paths resolve against the workspace root so users can point at a
 * checked-in virtualenv without writing a machine-specific absolute path.
 */
export function resolvePythonPath(workspaceRoot: string, settingKey: string): string {
  const dotIndex = settingKey.indexOf(".");
  if (dotIndex < 0) return "python";
  const section = settingKey.slice(0, dotIndex);
  const key = settingKey.slice(dotIndex + 1);
  const cfg = vscode.workspace.getConfiguration(section);
  const raw = (cfg.get<string>(key) ?? "python").trim();
  if (!raw) return "python";
  if (path.isAbsolute(raw)) return raw;
  if (raw.includes(path.sep) || raw.includes("/")) {
    return path.resolve(workspaceRoot, raw);
  }
  return raw;
}

/**
 * Spawn ``python -m <module> [args...]`` and resolve once the process exits.
 *
 * Always resolves — non-zero exit codes and timeouts are returned in the
 * result, never thrown — so the tree-view caller can render an error node
 * without try/catch noise around every refresh.
 */
export function runPythonModule(opts: PythonRunOptions): Promise<PythonRunResult> {
  const exe = resolvePythonPath(opts.cwd, opts.pythonPathSetting);
  const timeoutMs = opts.timeoutMs ?? 10000;
  return new Promise((resolve) => {
    const child = cp.spawn(exe, ["-m", opts.module, ...opts.args], {
      cwd: opts.cwd,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + (stderr ? "\n" : "") + `spawn error: ${err.message}`,
        exitCode: null,
        signal: null,
        timedOut,
      });
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, signal, timedOut });
    });
  });
}
