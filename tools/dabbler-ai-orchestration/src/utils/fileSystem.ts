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
import type {
  ProgressProjectionOrchestrator as OrchestratorInfo,
  ProgressProjectionRepository,
  ProgressProjectionSession as SessionRecord,
} from "dabbler-ai-router";
import { ProjectionCache, ProjectionResult } from "./projection";
import { type Activity, currentActivity, uncollectedWords } from "../router/dabblerTerminal";

/**
 * Where a repository's sessions came from. `ledger` is the
 * machine-written record; `plan` is a repository that has been set up
 * and never run, whose sessions are the ones its plan declares — the
 * two setup sessions bootstrap scaffolds, before the first registration
 * writes anything.
 */
export type SessionsSource = ProgressProjectionRepository["sessionsSource"];

/**
 * One discovered repository and the sessions it holds — the Work
 * Explorer's root row.
 *
 * This is the extension's own shape, not the projection's: it is what
 * `buildRepository` below assembles, and it lives here because this is
 * the only place that assembles one. Everything it carries about
 * SESSIONS is the projection's answer, typed by the projection's
 * generated types.
 *
 * The four file paths are the sessions root's own artifacts. They are
 * the whole Open File surface: a repository has one plan, one activity
 * log, one change log and one ledger, so there is nothing to select
 * between.
 */
export interface SessionsRepository {
  /** Repository root — the spawn cwd and the interpreter's home. */
  root: string;
  /** `<root>/docs/sessions`. */
  sessionsDir: string;
  /** Display name; `path.basename(root)`. */
  label: string;
  planPath: string;
  activityPath: string;
  changeLogPath: string;
  ledgerPath: string;
  totalSessions: number | null;
  sessionsCompleted: number;
  currentSession: number | null;
  /**
   * What the next `session start` would register, by the router's own rule.
   *
   * Carried rather than recomputed: the rule is "the session in flight if
   * there is one, else the lowest-numbered row that has not run", it spans
   * the ledger AND the plan's rows, and a second reading of it here would
   * offer to start a session the framework would refuse to start.
   */
  nextSession: number | null;
  forceClosed: boolean;
  schemaVersionOnDisk: number | null;
  sessionsSource: SessionsSource;
  invariantViolation: string | null;
  /** Derived liveness: when the record last moved, and whether it stopped. */
  lastActivityAt: string | null;
  possiblyStalled: boolean;
  /** What the repository is waiting on a person for, as the attention view reads it. */
  owedDecisions: ProgressProjectionRepository["owedDecisions"];
  /**
   * Whether the framework is running something right now.
   *
   * Read from the driven run record through the one rule that answers it,
   * so the Explorer's liveness row and the Dabbler terminal's indicator
   * cannot disagree. Optional because a repository built by hand -- a test,
   * a fixture -- has no run to read.
   */
  activity?: Activity;
  /**
   * The router's words for a job that finished and nobody collected, when
   * `activity` is `uncollected`; the row's detail is these and no wording
   * of the Explorer's own.
   */
  uncollected?: string | null;
  orchestrator: OrchestratorInfo | null;
  /**
   * The projection's sessions, with tasks populated on the in-flight
   * session only. Empty when the projection was unavailable (no
   * interpreter, no router) — the repository row still renders, and the
   * view says the rendering is degraded rather than guessing statuses
   * that only the router decides.
   */
  sessions: SessionRecord[];
}

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
 * its sessions root holds a machine-written ledger, or a session plan.
 *
 * The plan counts because a bootstrapped repository has one and nothing
 * else — its two setup sessions exist there until the first
 * registration writes a ledger — and a view that showed nothing until
 * then would hide project setup from every repository that most needs
 * it.
 *
 * This is not the file-presence state guessing that was deleted with
 * the set level. Presence decides only whether to ASK the projection;
 * which sessions exist, what state each is in, and whether they came
 * from the ledger or the plan are all Python's answers.
 */
export function hasSessionsRoot(root: string): boolean {
  const dir = sessionsDirOf(root);
  return (
    fs.existsSync(path.join(dir, LEDGER_FILENAME)) ||
    fs.existsSync(path.join(dir, PLAN_FILENAME))
  );
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
    nextSession: p ? p.repository.nextSession : null,
    lastActivityAt: p ? p.repository.lastActivityAt : null,
    possiblyStalled: p ? p.repository.possiblyStalled : false,
    owedDecisions: p ? p.repository.owedDecisions : [],
    activity: currentActivity(root),
    uncollected: uncollectedWords(root),
    forceClosed: p ? p.repository.forceClosed : false,
    schemaVersionOnDisk: p ? p.repository.schemaVersionOnDisk : null,
    // A failed projection is not a fresh repository. "ledger" is what a
    // row with no payload claims, so the never-run copy is only ever
    // shown on a projection that actually said so.
    sessionsSource: p ? p.repository.sessionsSource : "ledger",
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
    const projection = await cache.get(sessionsDirOf(root), root);
    if (!projection.payload && projection.error) {
      projectionErrors.push({ root, error: projection.error });
    }
    repositories.push(buildRepository(root, projection));
  }
  return { repositories, projectionErrors };
}
