// The cancel / restore launchers.
//
// Cancelling is the router's write, never this extension's: the state file
// has one set of sanctioned writers and a second implementation here would
// drift from them. The readers stay in TypeScript because the tree renders
// synchronously and must not spawn a process per row.
//
// What is cancelled is a session. A repository has sessions, not sets of
// them, so these take a session number rather than a directory.

import {
  RouterCliResult,
  RunRouterCliDeps,
  runRouterCli,
} from "./routerCli";

/** The router module both launchers here invoke. */
export const SESSION_LIFECYCLE_CLI = "ai_router.session";

/**
 * `cancel` / `restore` argv.
 *
 * The empty string is a valid reason and is passed through rather than
 * omitted — operators dismiss the reason prompt routinely, and the CLI
 * writes the blank reason line so the timestamp pattern in the history file
 * stays intact.
 *
 * `--force` is added only when the caller says the session cannot close:
 * in flight and unresolved at the cap. The CLI refuses an in-flight cancel
 * without it, and that refusal stands for live work — the flag is never
 * the default, so the refusal keeps protecting everything it did.
 */
export function cancelArgs(
  sessionNumber: number,
  reason: string,
  force = false,
): string[] {
  const args = ["cancel", String(sessionNumber), "--reason", reason];
  if (force) args.push("--force");
  return args;
}

export function restoreArgs(sessionNumber: number, reason: string): string[] {
  return ["restore", String(sessionNumber), "--reason", reason];
}

/**
 * The spawn cwd is the REPO ROOT. The interpreter is resolved from the
 * workspace root (that is where `.venv` lives), and the router derives the
 * one sessions root from the repository it is standing in — there is no
 * directory to name.
 */
function run(
  repoRoot: string,
  args: string[],
  actionLabel: string,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return runRouterCli(
    { module: SESSION_LIFECYCLE_CLI, args, cwd: repoRoot, actionLabel },
    deps,
  );
}

export function runCancelSession(
  repoRoot: string,
  sessionNumber: number,
  reason: string,
  deps?: RunRouterCliDeps,
  force = false,
): Promise<RouterCliResult> {
  return run(
    repoRoot,
    cancelArgs(sessionNumber, reason, force),
    "Cancelling a session",
    deps,
  );
}

export function runRestoreSession(
  repoRoot: string,
  sessionNumber: number,
  reason: string,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return run(
    repoRoot,
    restoreArgs(sessionNumber, reason),
    "Restoring a session",
    deps,
  );
}

/**
 * The failure sentence.
 *
 * `refused` is stated as "nothing was written" because that is the CLI's
 * guarantee for exit 3 — restoring a session that was never cancelled
 * reaches this path, and telling the operator to reconcile from git for a
 * call that wrote nothing would be actively misleading.
 */
export function describeLifecycleFailure(
  verb: string,
  label: string,
  result: RouterCliResult,
): string {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  if (result.outcome === "refused") {
    return `${verb} "${label}" refused — ${detail} Nothing was written.`;
  }
  if (result.outcome === "unavailable") {
    return detail;
  }
  return `Failed to ${verb.toLowerCase()} "${label}": ${detail} Re-run the command to finish.`;
}
