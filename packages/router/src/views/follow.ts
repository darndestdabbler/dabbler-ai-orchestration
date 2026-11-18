// Which files each view is read from, for a repository.
//
// A view is right only until one of its records moves, so whoever shows it
// -- a watcher in an editor, a cache keyed on modification times, a terminal
// following it -- has to know which records those are. That is a rule about
// the router's own files, so it is stated here, once, and every interface
// builds its watching from it.

import * as fs from "node:fs";
import * as path from "node:path";

import { currentCatalogPath } from "../catalog.ts";
import { PROJECT_CONFIG_FILENAME } from "../config.ts";
import { currentCredentialsPath } from "../credentials.ts";
import { ACTIVITY_LOG_FILENAME, SESSION_PLAN_FILENAME, STATE_FILENAME } from "../evidence.ts";
import { RUNS_DIRNAME } from "../journal.ts";
import { currentPreferencesPath } from "../preferences.ts";
import { SETTINGS_RELPATH } from "../settings.ts";
import { CHANGE_LOG_FILENAME, sessionsDirOf } from "./workExplorer.ts";

export type FollowedView = "work-explorer" | "configuration";

/** A directory and a glob under it: what a file watcher is built from. */
export interface FollowedPattern {
  readonly base: string;
  readonly glob: string;
}

/** The sessions root's files the Work Explorer is read from. */
const SESSIONS_FILES = [STATE_FILENAME, ACTIVITY_LOG_FILENAME, SESSION_PLAN_FILENAME, CHANGE_LOG_FILENAME];

/**
 * One run's records the Work Explorer folds: its task rows, its plan, its
 * verification rounds, and a driven session's state and the engine's steps.
 */
const RUN_FILES = [
  "step-execution.jsonl",
  "approved-plan.json",
  "rounds.jsonl",
  "driver/run.json",
  "driver/plan.json",
];

/** The repository's own files a configuration reading is joined from. */
const REPOSITORY_CONFIGURATION_FILES = [SETTINGS_RELPATH, PROJECT_CONFIG_FILENAME];

function runsDirOf(root: string): string {
  return path.join(root, RUNS_DIRNAME);
}

/** The highest-numbered run under the runs directory, or null where there is none. */
function latestRun(root: string): number | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(runsDirOf(root));
  } catch {
    return null;
  }
  let run: number | null = null;
  for (const entry of entries) {
    const match = /^s(\d+)$/.exec(entry);
    if (match && (run === null || Number(match[1]) > run)) run = Number(match[1]);
  }
  return run;
}

/**
 * The user-level files: the model catalog and this operator's preferences.
 * One that cannot be placed here has nothing at it to follow.
 */
function userConfigurationFiles(): string[] {
  const files: string[] = [];
  // The credentials index too: the API Keys rows say which keys this
  // machine holds, and `dabbler auth set` writes nothing else a view reads.
  for (const placed of [currentCatalogPath, currentPreferencesPath, currentCredentialsPath]) {
    try {
      files.push(placed());
    } catch {
      // Not placeable on this machine, or under a test that named none.
    }
  }
  return [...new Set(files)];
}

/**
 * The files a view is read from, as concrete paths.
 *
 * The runs directory itself is one of the Work Explorer's: a run added or
 * removed moves it. Of the runs, only ONE run's records are named --
 * `session`'s, or the highest-numbered run's where it is null -- because a
 * run that is not the current one moves only together with the ledger or
 * the activity log, and statting every run ever made grows with every close.
 *
 * The Configuration with no repository is the machine's files alone.
 */
export function followedPaths(
  view: FollowedView,
  roots: readonly string[],
  session: number | null = null,
): string[] {
  if (view === "configuration") {
    return [
      ...userConfigurationFiles(),
      ...roots.flatMap((root) => REPOSITORY_CONFIGURATION_FILES.map((file) => path.join(root, file))),
    ];
  }
  return roots.flatMap((root) => {
    const sessionsDir = sessionsDirOf(root);
    const runs = runsDirOf(root);
    const run = session ?? latestRun(root);
    return [
      ...SESSIONS_FILES.map((file) => path.join(sessionsDir, file)),
      runs,
      ...(run === null ? [] : RUN_FILES.map((file) => path.join(runs, `s${run}`, file))),
    ];
  });
}

function oneOf(names: readonly string[]): string {
  return names.length === 1 ? names[0] : `{${names.join(",")}}`;
}

/** Group paths by directory, one pattern per directory naming its files. */
function byDirectory(files: readonly string[]): FollowedPattern[] {
  const grouped = new Map<string, string[]>();
  for (const file of files) {
    const dir = path.dirname(file);
    grouped.set(dir, [...(grouped.get(dir) ?? []), path.basename(file)]);
  }
  return [...grouped].map(([base, names]) => ({ base, glob: oneOf(names) }));
}

/**
 * The same files as directory-and-glob pairs, for a watcher.
 *
 * Unlike `followedPaths`, the runs are every run (`*`), since a watcher is
 * built once and a run that starts after it was built must still fire it.
 */
export function followedPatterns(view: FollowedView, root: string | null): FollowedPattern[] {
  if (view === "configuration") {
    return byDirectory(followedPaths("configuration", root === null ? [] : [root]));
  }
  if (root === null) return [];
  const runs = runsDirOf(root);
  const runPatterns = byDirectory(RUN_FILES).map(({ base, glob }) => ({
    base: runs,
    glob: base === "." ? `*/${glob}` : `*/${base}/${glob}`,
  }));
  return [{ base: sessionsDirOf(root), glob: oneOf(SESSIONS_FILES) }, ...runPatterns];
}

/** How often the files are looked at, and how long a change must be quiet before it is printed. */
export interface FollowTiming {
  readonly pollMs: number;
  readonly settleMs: number;
}

const FOLLOW_TIMING: FollowTiming = { pollMs: 250, settleMs: 300 };

/** What one file looks like now: its modification time and size, or absent. */
function stamp(file: string): string {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "absent";
  }
}

/**
 * Print now, then print again whenever one of `paths()` changes, until the
 * returned function is called.
 *
 * It polls the files' modification times rather than listening for events:
 * a stat of a dozen files four times a second costs nothing, and it behaves
 * the same on every platform, for a file that does not exist yet as for one
 * that does. `paths` is asked again at every poll, so a run that starts
 * while following is followed. Changes close together make one printing:
 * it waits until nothing has moved for `settleMs`.
 */
export function follow(
  paths: () => readonly string[],
  print: () => void,
  timing: FollowTiming = FOLLOW_TIMING,
): () => void {
  const read = (): string => paths().map((file) => `${file}=${stamp(file)}`).join("|");
  let seen = read();
  let settling: ReturnType<typeof setTimeout> | undefined;
  print();
  const poll = setInterval(() => {
    const now = read();
    if (now === seen) return;
    seen = now;
    if (settling !== undefined) clearTimeout(settling);
    settling = setTimeout(() => {
      settling = undefined;
      print();
    }, timing.settleMs);
  }, timing.pollMs);
  return () => {
    clearInterval(poll);
    if (settling !== undefined) clearTimeout(settling);
  };
}
