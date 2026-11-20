// Workspace discovery and the repository scan.
//
// The scan's job is assembly, not derivation: every session's display
// state comes from the router's projection (utils/projection.ts). This
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
import { hasSessionsRoot, sessionsDirOf, workExplorerRepository, type SessionsRepository } from "dabbler-ai-router";
import { ProjectionCache } from "./projection";

// The repository a row is built from, which sessions root counts as one,
// and how one is assembled from the progress reading are the router's
// (`views/workExplorer.ts`), so `dabbler view work-explorer` and this view
// cannot disagree; they are re-exported for this extension's other readers.
export { hasSessionsRoot, sessionsDirOf, type SessionsRepository };
export type { SessionsSource } from "dabbler-ai-router";

export const SESSIONS_REL = path.join("docs", "sessions");
export const LEDGER_FILENAME = "sessions.json";
export const PLAN_FILENAME = "session-plan.md";
export const ACTIVITY_LOG_FILENAME = "activity-log.json";
export const CHANGE_LOG_FILENAME = "change-log.md";

/**
 * The worktrees of the repository at *cwd*, or [] where git cannot say.
 * Asynchronous: this runs on the extension host's one thread, and a
 * blocking git spawn there froze every window on every poll.
 */
export async function listGitWorktrees(cwd: string): Promise<string[]> {
  const out = await new Promise<string | null>((resolve) => {
    cp.execFile(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024, timeout: 5000 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
  if (out === null) return [];
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
 *
 * Discovered once per poll tick, workspace-folder change or explicit
 * refresh, and handed to the scan and the watchers alike.
 */
export async function discoverRoots(): Promise<string[]> {
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
  const worktrees = await Promise.all(folders.map((folder) => listGitWorktrees(folder)));
  for (const list of worktrees) for (const worktree of list) add(worktree);
  return order;
}

export interface ScanResult {
  repositories: SessionsRepository[];
  /** One entry per repository whose projection failed; feeds TreeView.message. */
  projectionErrors: Array<{ root: string; error: string }>;
}

/**
 * The full workspace scan: project each of *roots* that has a sessions
 * root, and assemble the rows. The roots are the caller's, discovered by
 * `discoverRoots`; the scan starts no process of its own.
 */
export async function scanRepositories(
  cache: ProjectionCache,
  roots: readonly string[],
): Promise<ScanResult> {
  const repositories: SessionsRepository[] = [];
  const projectionErrors: Array<{ root: string; error: string }> = [];
  for (const root of roots) {
    if (!hasSessionsRoot(root)) continue;
    const projection = await cache.get(sessionsDirOf(root), root);
    if (!projection.payload && projection.error) {
      projectionErrors.push({ root, error: projection.error });
    }
    repositories.push(workExplorerRepository(root, projection.payload));
  }
  return { repositories, projectionErrors };
}
