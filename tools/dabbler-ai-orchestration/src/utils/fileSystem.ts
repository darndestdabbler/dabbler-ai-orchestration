// Workspace discovery and the repository scan.
//
// The scan's job is assembly, not derivation: every session's display
// state comes from the Python projection (utils/projection.ts). This
// module finds the repositories in the window and hands each one's
// sessions root to that projection.
//
// A repository that carries no sessions root contributes no row. It is
// not "a repository with nothing in it" — it is a folder this extension
// has nothing to say about.

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SessionsRepository } from "../types";
import { ProjectionCache, ProjectionResult } from "./projection";
import { resolvePythonInterpreter } from "./pythonInterpreter";

export const SESSIONS_REL = path.join("docs", "sessions");
export const LEDGER_FILENAME = "sessions.json";
export const PLAN_FILENAME = "session-plan.md";
export const ACTIVITY_LOG_FILENAME = "activity-log.json";
export const CHANGE_LOG_FILENAME = "change-log.md";
export const MODULES_MANIFEST_REL = path.join("docs", "modules.yaml");

/** `<root>/docs/sessions`, whether or not it exists. */
export function sessionsDirOf(root: string): string {
  return path.join(root, SESSIONS_REL);
}

/**
 * Whether *root* is a repository this view has anything to say about:
 * it has a sessions root holding the machine-written ledger. The plan
 * alone is not enough — a repository is set up when the router has
 * written to it.
 */
export function hasSessionsRoot(root: string): boolean {
  return fs.existsSync(path.join(sessionsDirOf(root), LEDGER_FILENAME));
}

export function listGitWorktrees(cwd: string): string[] {
  let out: string;
  try {
    out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 5000,
    });
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      const wt = line.slice("worktree ".length).trim();
      if (wt) paths.push(path.resolve(wt));
    }
  }
  return paths;
}

/**
 * Every repository root in the window: the open workspace folders, plus
 * each folder's git worktrees.
 *
 * A worktree is a SEPARATE row, not a duplicate to be merged away. Each
 * checkout carries its own `docs/sessions/sessions.json` at its own
 * commit, so two checkouts of one repository genuinely hold two
 * different ledgers — collapsing them would show one checkout's progress
 * under the other's name.
 */
export function discoverRoots(): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  // Dedup on the filesystem's own canonical form: realpath collapses
  // case variants only where the volume is case-insensitive, and
  // resolves symlinked duplicates as a bonus.
  const canonicalKey = (p: string): string => {
    try {
      return fs.realpathSync.native(p);
    } catch {
      return p;
    }
  };
  const add = (p: string | undefined): void => {
    if (!p) return;
    const canonical = path.resolve(p);
    const key = canonicalKey(canonical);
    if (seen.has(key) || !fs.existsSync(canonical)) return;
    seen.add(key);
    order.push(canonical);
  };
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) =>
    path.resolve(f.uri.fsPath),
  );
  for (const folder of folders) add(folder);
  for (const folder of folders) {
    for (const worktree of listGitWorktrees(folder)) add(worktree);
  }
  return order;
}

function buildRepository(
  root: string,
  projection: ProjectionResult,
): SessionsRepository {
  const sessionsDir = sessionsDirOf(root);
  const p = projection.payload;
  return {
    root,
    sessionsDir,
    label: path.basename(root),
    planPath: path.join(sessionsDir, PLAN_FILENAME),
    activityPath: path.join(sessionsDir, ACTIVITY_LOG_FILENAME),
    changeLogPath: path.join(sessionsDir, CHANGE_LOG_FILENAME),
    ledgerPath: path.join(sessionsDir, LEDGER_FILENAME),
    // Every field below is the projection's answer or nothing. There is
    // no file-presence fallback: which sessions exist and what state
    // they are in is a Python rule, and a second implementation of it
    // here would be a second place for it to be wrong.
    totalSessions: p ? p.repository.totalSessions : null,
    sessionsCompleted: p ? p.repository.sessionsCompleted : 0,
    currentSession: p ? p.repository.currentSession : null,
    forceClosed: p ? p.repository.forceClosed : false,
    schemaVersionOnDisk: p ? p.repository.schemaVersionOnDisk : null,
    invariantViolation: p ? p.repository.invariantViolation : null,
    orchestrator: p ? p.repository.orchestrator : null,
    sessions: p ? p.sessions : [],
  };
}

export interface ScanResult {
  repositories: SessionsRepository[];
  /** One entry per repository whose projection failed; feeds TreeView.message. */
  projectionErrors: Array<{ root: string; error: string }>;
}

/**
 * The full workspace scan: discover roots, project each one that has a
 * sessions root, and assemble the rows.
 */
export async function scanRepositories(
  cache: ProjectionCache,
): Promise<ScanResult> {
  const repositories: SessionsRepository[] = [];
  const projectionErrors: Array<{ root: string; error: string }> = [];
  for (const root of discoverRoots()) {
    if (!hasSessionsRoot(root)) continue;
    const projection = await cache.get(
      resolvePythonInterpreter(root),
      sessionsDirOf(root),
      root,
    );
    if (!projection.payload && projection.error) {
      projectionErrors.push({ root, error: projection.error });
    }
    repositories.push(buildRepository(root, projection));
  }
  return { repositories, projectionErrors };
}
