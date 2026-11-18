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
import * as vscode from "vscode";
import type { ProgressProjection, Router } from "dabbler-ai-router";
import { RouterUnavailableError, followedPaths } from "dabbler-ai-router";
import { productionRouter } from "../router/host";

/**
 * The modification times of the files the Work Explorer is read from, as
 * the router names them -- for `session` (the run the cached projection
 * named current), or the highest-numbered run when it is null. A step
 * opening or a round landing changes only a run's records, and a key blind
 * to them would serve the stale payload back to the watcher tick the write
 * fired.
 */
export function projectionCacheKey(
  repositoryRoot: string,
  session: number | null = null,
  statFile: (p: string) => number | null = mtimeOrNull,
): string {
  return followedPaths("work-explorer", [repositoryRoot], session)
    .map((f) => `${f}=${statFile(f)}`)
    .join("|");
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
    // The operator's setting reaches the projection that judges against it.
    // A setting in one place and the number that decides in another is worse
    // than no setting: it is a control that looks connected.
    const result = await router.progress({
      repoRoot,
      sessionsDir,
      stalledAfterSeconds: stalledAfterSecondsSetting(),
    });
    return result.ok
      ? { payload: result.value, error: null }
      : { payload: null, error: actionable(result.message.trim()) };
  } catch (err) {
    return {
      payload: null,
      error:
        err instanceof RouterUnavailableError
          ? err.message
          : actionable(err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * A failure the operator can act on, rather than the exception's own words.
 *
 * Survey finding F9: this row read `projection failed: <raw error>`, which
 * says what broke and never what to do -- and it is rendered above the tree,
 * where the operator is already looking for what to do next. The mapping is
 * deliberately small: three states a repository actually reaches, and
 * everything else keeps the underlying sentence, because a message invented
 * for a fault nobody has seen is worse than the fault's own words.
 */
function actionable(message: string): string {
  const text = message.trim();
  if (!text) return "The session record could not be read. Nothing was changed.";
  if (/sessions\.json/i.test(text) && /parse|read|json/i.test(text)) {
    return (
      "The sessions ledger is present but will not parse, so no sessions can " +
      "be listed. Open it from the repository row and fix the JSON, or " +
      "restore it from git -- restore sessions.json ONLY, never the activity " +
      `log. (${text})`
    );
  }
  if (/not (inside )?a git repository/i.test(text)) {
    return (
      "This folder is not a git repository, so there is no record to read. " +
      "Run Set Up New Project, which initialises one."
    );
  }
  if (/no such file|enoent/i.test(text)) {
    return (
      "This repository has not been set up yet. Run Set Up New Project; " +
      `nothing is installed. (${text})`
    );
  }
  return `The session record could not be read: ${text}`;
}

/** The operator's threshold, or undefined to let the repository decide. */
function stalledAfterSecondsSetting(): number | undefined {
  try {
    const value = vscode.workspace
      .getConfiguration("dabbler")
      .get<number>("stalledAfterSeconds");
    return typeof value === "number" && value > 0 ? value : undefined;
  } catch {
    // Reachable from the unit suite, which has no configuration host.
    return undefined;
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
  constructor(runner?: ProjectRepositoryFn, router: Router = productionRouter()) {
    this.runner =
      runner ?? ((sessionsDir, repoRoot) => projectRepository(router, sessionsDir, repoRoot));
  }

  async get(sessionsDir: string, repoRoot: string): Promise<ProjectionResult> {
    const cached = this.entries.get(sessionsDir);
    const current = cached?.result.payload?.repository?.currentSession ?? null;
    const key = projectionCacheKey(repoRoot, current);
    if (cached && cached.key === key) return cached.result;
    const result = await this.runner(sessionsDir, repoRoot);
    // Only an answer is kept. A failure used to be cached as well, so that
    // an uninstallable router was not spawned afresh on every 30 s poll;
    // the router is in-process now and a failed derivation costs a read,
    // while a failure served back under an unchanged key would hold the
    // degraded row until something else moved the files.
    if (result.payload !== null) this.entries.set(sessionsDir, { key, result });
    return result;
  }

  clear(): void {
    this.entries.clear();
  }
}
