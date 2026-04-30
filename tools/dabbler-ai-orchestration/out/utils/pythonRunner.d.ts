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
export declare function resolvePythonPath(workspaceRoot: string, settingKey: string): string;
/**
 * Spawn ``python -m <module> [args...]`` and resolve once the process exits.
 *
 * Always resolves — non-zero exit codes and timeouts are returned in the
 * result, never thrown — so the tree-view caller can render an error node
 * without try/catch noise around every refresh.
 */
export declare function runPythonModule(opts: PythonRunOptions): Promise<PythonRunResult>;
