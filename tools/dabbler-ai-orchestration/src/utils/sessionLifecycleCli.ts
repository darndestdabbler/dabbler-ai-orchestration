// Set 122 Session 2: the cancel / restore launchers.
//
// Why these exist at all
// ----------------------
//
// `src/utils/cancelLifecycle.ts` used to CANCEL and RESTORE session sets in
// TypeScript, which meant it opened `session-state.json` and wrote it —
// `writeSessionState`, the line the Set 122 spec names as "the concrete
// violation that justified this whole set". Only the router's sanctioned
// writers may touch that file.
//
// `ai_router/session_lifecycle.py` already carried a complete port of the
// same behaviour (same filenames, same history header, same v4 on-disk
// shape); it simply had no entry point. Session 2 added one and deleted the
// TypeScript writer, so there is now exactly one implementation. The
// readers (`isCancelled`, `readCancellationState`, `wasRestored`) stay in
// TypeScript: the tree renders synchronously and must not spawn a process
// per row.
//
// Operator decision, 2026-08-13 (`decisions.jsonl`): the alternative —
// severing only the module-delete path and leaving the standalone
// Cancel/Restore commands on the TypeScript writer — was considered and
// rejected, because it leaves a second writer shipping and the two
// implementations drifting.

import {
  RouterCliResult,
  RunRouterCliDeps,
  runRouterCli,
} from "./routerCli";

/** The router module both launchers here invoke. */
export const SESSION_LIFECYCLE_CLI = "ai_router.session_lifecycle";

/**
 * `cancel` / `restore` argv.
 *
 * The empty string is a valid reason and is passed through rather than
 * omitted — operators dismiss the reason prompt routinely, and the CLI
 * writes the blank reason line so the timestamp pattern in the history file
 * stays intact.
 */
export function cancelArgs(sessionSetDir: string, reason: string): string[] {
  return ["--json", "cancel", "--session-set-dir", sessionSetDir, "--reason", reason];
}

export function restoreArgs(sessionSetDir: string, reason: string): string[] {
  return ["--json", "restore", "--session-set-dir", sessionSetDir, "--reason", reason];
}

/**
 * The spawn cwd is the REPO ROOT, not the session-set directory, while the
 * target is passed as an explicit `--session-set-dir`. Two reasons: the
 * interpreter is resolved from the workspace root (that is where `.venv`
 * lives), and a target derived from an explicit argument cannot drift when
 * a caller's cwd changes.
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

export function runCancelSessionSet(
  repoRoot: string,
  sessionSetDir: string,
  reason: string,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return run(
    repoRoot,
    cancelArgs(sessionSetDir, reason),
    "Cancelling a session set",
    deps,
  );
}

export function runRestoreSessionSet(
  repoRoot: string,
  sessionSetDir: string,
  reason: string,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return run(
    repoRoot,
    restoreArgs(sessionSetDir, reason),
    "Restoring a session set",
    deps,
  );
}

/**
 * The failure sentence.
 *
 * `refused` is stated as "nothing was written" because that is the CLI's
 * guarantee for exit 3 — restoring a set that was never cancelled reaches
 * this path, and telling the operator to reconcile from git for a call that
 * wrote nothing would be actively misleading.
 */
export function describeLifecycleFailure(
  verb: string,
  setName: string,
  result: RouterCliResult,
): string {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  if (result.outcome === "refused") {
    return `${verb} "${setName}" refused — ${detail} Nothing was written.`;
  }
  if (result.outcome === "unavailable") {
    return detail;
  }
  return `Failed to ${verb.toLowerCase()} "${setName}": ${detail} Re-run the command to finish.`;
}
