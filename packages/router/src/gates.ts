// What the working tree says about whether a session's work has begun.
//
// Session 30 ports `gates` whole -- the five gates the close runs, and the
// rows `--dry-run` prints. What is here is the slice `writers` cannot be
// written without: the task declaration refuses to be made after the work
// exists, and this is the question it asks.
//
// The predicate is the same one the close asks in the other direction --
// "is there uncommitted work?" -- so it is written once. Editor noise, the
// run ledger and the session's own lifecycle bookkeeping are not work: the
// ledger is appended after the tree it describes, and the close commits
// its own bookkeeping after the flip.

import { relative } from "node:path";

import { LIFECYCLE_WRITTEN_FILES } from "./ledger.ts";
import { isMachineStatePath, repoRootFor, runGit } from "./journal.ts";

/** Editor and platform droppings, which are nobody's work. */
const IGNORE_BASENAME_PATTERNS: readonly string[] = [
  ".DS_Store",
  "*.swp",
  "*~",
  "Thumbs.db",
  "desktop.ini",
  ".lifecycle.lock",
];

/**
 * Session-directory files the close itself commits after the flip.
 *
 * The lifecycle lock is deliberately absent from the commit list: it is
 * still held during the close commit and deleted on release, so committing
 * it leaves every close behind a tracked-deletion dirty tree.
 */
export const SET_BOOKKEEPING_COMMIT_BASENAMES = LIFECYCLE_WRITTEN_FILES;

/**
 * What may legitimately be dirty in the session directory at close time:
 * the files the close will commit, plus the lock the close is holding.
 */
const SET_BOOKKEEPING_BASENAMES: ReadonlySet<string> = new Set([
  ...SET_BOOKKEEPING_COMMIT_BASENAMES,
  ".lifecycle.lock",
]);

/** `fnmatch` over a basename: `*` and `?`, and nothing else these need. */
function matchesPattern(basename: string, pattern: string): boolean {
  const source =
    "^" +
    pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
    "$";
  return new RegExp(source).test(basename);
}

export interface WorktreeChanges {
  readonly paths: readonly string[];
  /** Empty when the question was answerable; a sentence when it was not. */
  readonly error: string;
}

/**
 * The working-tree changes that are the session's work rather than the
 * record of it.
 *
 * Two callers ask this: the close, which refuses to land uncommitted work,
 * and the task declaration, which refuses to be made after work exists.
 */
export function materialWorktreeChanges(sessionsDir: string): WorktreeChanges {
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    return { paths: [], error: `not inside a git repository: ${sessionsDir}` };
  }
  // `-uall` expands collapsed untracked directories to per-file entries; a
  // single umbrella row would defeat the ignore filter.
  const status = runGit(root, ["status", "--porcelain", "-uall"]);
  if (status.code !== 0) {
    return {
      paths: [],
      error: `git status failed: ${status.stderr || "unknown error"}`,
    };
  }
  let setRel: string;
  try {
    setRel = relative(root, sessionsDir).replace(/\\/g, "/");
  } catch {
    setRel = sessionsDir;
  }

  const blocking: string[] = [];
  for (const line of status.stdout.split("\n")) {
    if (line.length < 4) continue;
    let path = line.slice(3);
    if (path.includes(" -> ")) path = path.split(" -> ", 2)[1];
    // `strip('"')` takes every quote off both ends, not one: git quotes a
    // path that needs escaping, and a name ending in a quote would leave one
    // behind if only the outermost came off.
    path = path.trim().replace(/^"+/, "").replace(/"+$/, "").replace(/\\/g, "/");
    const basename = path.split("/").pop() ?? path;
    if (IGNORE_BASENAME_PATTERNS.some((pattern) => matchesPattern(basename, pattern))) {
      continue;
    }
    if (path.startsWith(`${setRel}/`) && SET_BOOKKEEPING_BASENAMES.has(basename)) {
      continue; // the close commits its own bookkeeping after the flip
    }
    if (isMachineStatePath(path)) {
      continue; // the run ledger is the record, not the work
    }
    blocking.push(path);
  }
  return { paths: blocking, error: "" };
}

/** The first five paths, and how many more there are. */
export function previewPaths(paths: readonly string[]): string {
  const preview = paths.slice(0, 5).join(", ");
  return preview + (paths.length > 5 ? ` (+${paths.length - 5} more)` : "");
}
