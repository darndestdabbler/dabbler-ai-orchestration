// The projection poll: one `Router.progress` call per repository whose
// record changed, cached on the mtimes of the files that derivation
// reads.
//
// The extension never re-derives session state from the ledger — it
// renders what the router answers. Which router that is stopped being
// this file's business when the seam landed: it holds a `Router`, and
// the interpreter, the argv and the subprocess are all on the other side
// of it.

import * as fs from "fs";
import * as path from "path";
import type { ProgressProjection, Router } from "dabbler-ai-router";
import { RouterUnavailableError } from "dabbler-ai-router";
import { PythonSpawnRouter } from "../router/pythonSpawnRouter";

/** The sessions-root files whose mtimes invalidate a cached projection. */
const CACHE_INPUTS = [
  "sessions.json",
  "activity-log.json",
  "session-plan.md",
  "change-log.md",
];

/** Where the machine-owned run records live, relative to the repository root. */
export const RUNS_REL = path.join(".dabbler", "runs");

/**
 * The per-session run artifacts the task level and the verification view
 * are folded from. They sit under the REPOSITORY root, not the sessions
 * root, and they must be in the cache key: a step opening or a round
 * landing changes only these, and a key that ignored them would serve the
 * stale payload back to the watcher tick the write fired.
 */
export function taskRecordInputs(
  repositoryRoot: string,
  listDir: (p: string) => string[] = readdirOrEmpty,
): string[] {
  const runs = path.join(repositoryRoot, RUNS_REL);
  const inputs: string[] = [];
  for (const entry of listDir(runs)) {
    if (!/^s\d+$/.test(entry)) continue;
    inputs.push(path.join(runs, entry, "step-execution.jsonl"));
    inputs.push(path.join(runs, entry, "approved-plan.json"));
    inputs.push(path.join(runs, entry, "rounds.jsonl"));
  }
  return inputs.sort();
}

export function projectionCacheKey(
  sessionsDir: string,
  repositoryRoot: string,
  statFile: (p: string) => number | null = mtimeOrNull,
  listDir: (p: string) => string[] = readdirOrEmpty,
): string {
  const files = [
    ...CACHE_INPUTS.map((f) => path.join(sessionsDir, f)),
    ...taskRecordInputs(repositoryRoot, listDir),
  ];
  return files.map((f) => `${f}=${statFile(f)}`).join("|");
}

function readdirOrEmpty(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function mtimeOrNull(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

export interface ProjectionResult {
  payload: ProgressProjection | null;
  /** Why the payload is null (unreachable router, a refusal, bad JSON). */
  error: string | null;
}

/**
 * Ask the router for one repository's projection, as a value.
 *
 * The contract throws when the router cannot be reached at all, which is
 * the right shape for a caller that can act on it. This one cannot: the
 * scan renders a degraded row and puts the reason in `TreeView.message`,
 * so the absence of an answer becomes the same kind of value as a
 * refusal.
 */
export async function projectRepository(
  router: Router,
  sessionsDir: string,
  repoRoot: string,
): Promise<ProjectionResult> {
  try {
    const result = await router.progress({ repoRoot, sessionsDir });
    return result.ok
      ? { payload: result.value, error: null }
      : { payload: null, error: result.message.trim() || "projection failed" };
  } catch (err) {
    return {
      payload: null,
      error:
        err instanceof RouterUnavailableError
          ? err.message
          : `projection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export type ProjectRepositoryFn = (
  sessionsDir: string,
  repoRoot: string,
) => Promise<ProjectionResult>;

interface CacheEntry {
  key: string;
  result: ProjectionResult;
}

/**
 * Mtime-keyed projection cache. `get` re-projects only when one of the
 * repository's derivation inputs changed since the cached run.
 */
export class ProjectionCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly runner: ProjectRepositoryFn;

  /**
   * One router for the cache's lifetime, not one per poll: it holds the
   * spawn seam's injected dependencies and nothing per-call, so a fresh
   * one every 30 seconds would buy nothing.
   */
  constructor(runner?: ProjectRepositoryFn, router: Router = new PythonSpawnRouter()) {
    this.runner =
      runner ?? ((sessionsDir, repoRoot) => projectRepository(router, sessionsDir, repoRoot));
  }

  async get(sessionsDir: string, repoRoot: string): Promise<ProjectionResult> {
    const key = projectionCacheKey(sessionsDir, repoRoot);
    const cached = this.entries.get(sessionsDir);
    if (cached && cached.key === key) return cached.result;
    const result = await this.runner(sessionsDir, repoRoot);
    // A failed projection is cached too — retrying an uninstallable
    // router on every 30s poll would spawn a failing process forever.
    // The mtime key still re-arms it when the ledger changes, and an
    // explicit refresh clears the cache outright.
    this.entries.set(sessionsDir, { key, result });
    return result;
  }

  clear(): void {
    this.entries.clear();
  }
}
