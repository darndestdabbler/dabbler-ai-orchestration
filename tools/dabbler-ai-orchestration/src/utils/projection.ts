// The one seam between the tree and the Python data layer: every
// repository's display state comes from `python -m ai_router.progress
// --json`. The extension never re-derives session state from the ledger
// — TypeScript renders, Python decides.
//
// Projections are cached per sessions root, keyed on the mtimes of the
// files the derivation reads, so a watcher tick or the 30-second poll
// re-runs Python only for repositories that actually changed.

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ProjectionPayload, SessionRecord, SessionStatus, StepRecord } from "../types";

/** The files whose mtimes invalidate a cached projection. */
const CACHE_INPUTS = [
  "sessions.json",
  "activity-log.json",
  "session-plan.md",
  "change-log.md",
];

export function projectionCacheKey(
  sessionsDir: string,
  statFile: (p: string) => number | null = mtimeOrNull,
): string {
  return CACHE_INPUTS.map((f) => String(statFile(path.join(sessionsDir, f)))).join("|");
}

function mtimeOrNull(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

export interface ProjectionResult {
  payload: ProjectionPayload | null;
  /** Why the payload is null (spawn failure, non-zero exit, bad JSON). */
  error: string | null;
}

export type ProjectRepositoryFn = (
  pythonPath: string,
  sessionsDir: string,
  cwd: string,
) => Promise<ProjectionResult>;

/**
 * Spawn the projection CLI for one repository.
 *
 * `--sessions-dir` is passed even though the router derives it from the
 * working directory: the extension is a caller standing outside the
 * tree, and naming the root it scanned keeps the projection bound to
 * that root rather than to whatever cwd resolution finds.
 */
export function projectRepository(
  pythonPath: string,
  sessionsDir: string,
  cwd: string,
): Promise<ProjectionResult> {
  return new Promise((resolve) => {
    cp.execFile(
      pythonPath,
      ["-m", "ai_router.progress", "--json", "--sessions-dir", sessionsDir],
      { cwd, windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            payload: null,
            error: (stderr || err.message || "projection failed").trim(),
          });
          return;
        }
        const parsed = parseProjectionPayload(stdout);
        resolve(
          parsed
            ? { payload: parsed, error: null }
            : { payload: null, error: "projection emitted unreadable JSON" },
        );
      },
    );
  });
}

const STATUSES: ReadonlySet<string> = new Set([
  "complete",
  "in-progress",
  "not-started",
  "cancelled",
]);

/**
 * Narrow untrusted CLI output to the payload shape. Tolerant of extra
 * fields (the projection schema is additive); fails closed to null on a
 * missing/foreign core shape so a partial write never renders as truth.
 */
export function parseProjectionPayload(text: string): ProjectionPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const repository = obj.repository;
  if (repository === null || typeof repository !== "object") return null;
  const r = repository as Record<string, unknown>;
  if (!Array.isArray(obj.sessions)) return null;
  const sessions = obj.sessions
    .map(narrowSession)
    .filter((x): x is SessionRecord => x !== null);
  return {
    schemaVersion: Number(obj.schemaVersion) || 0,
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : "",
    repository: {
      schemaVersionOnDisk:
        typeof r.schemaVersionOnDisk === "number" ? r.schemaVersionOnDisk : null,
      totalSessions: typeof r.totalSessions === "number" ? r.totalSessions : null,
      sessionsCompleted:
        typeof r.sessionsCompleted === "number" ? r.sessionsCompleted : 0,
      currentSession: typeof r.currentSession === "number" ? r.currentSession : null,
      forceClosed: r.forceClosed === true,
      orchestrator:
        r.orchestrator !== null && typeof r.orchestrator === "object"
          ? (r.orchestrator as ProjectionPayload["repository"]["orchestrator"])
          : null,
      invariantViolation:
        typeof r.invariantViolation === "string" ? r.invariantViolation : null,
    },
    sessions,
  };
}

function narrowSession(raw: unknown): SessionRecord | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const number = o.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    return null;
  }
  const status = String(o.status);
  if (!STATUSES.has(status)) return null;
  const steps = Array.isArray(o.steps)
    ? o.steps.map(narrowStep).filter((x): x is StepRecord => x !== null)
    : [];
  return {
    number,
    displayNumber: typeof o.displayNumber === "string" ? o.displayNumber : "",
    title: typeof o.title === "string" && o.title ? o.title : `Session ${number}`,
    status: status as SessionStatus,
    iconKey: STATUSES.has(String(o.iconKey))
      ? (o.iconKey as SessionStatus)
      : "not-started",
    inFlight: o.inFlight === true,
    startedAt: typeof o.startedAt === "string" ? o.startedAt : null,
    completedAt: typeof o.completedAt === "string" ? o.completedAt : null,
    verificationVerdict:
      typeof o.verificationVerdict === "string" ? o.verificationVerdict : null,
    steps,
  };
}

function narrowStep(raw: unknown): StepRecord | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    position: typeof o.position === "number" ? o.position : 0,
    stepNumber: typeof o.stepNumber === "number" ? o.stepNumber : null,
    stepKey: typeof o.stepKey === "string" ? o.stepKey : null,
    description: typeof o.description === "string" ? o.description : "",
    status: typeof o.status === "string" ? o.status : null,
    state: typeof o.state === "string" ? o.state : "",
    box: typeof o.box === "string" ? o.box : "[ ]",
    iconKey: STATUSES.has(String(o.iconKey))
      ? (o.iconKey as SessionStatus)
      : "not-started",
    isPlanned: o.isPlanned === true,
    isActive: o.isActive === true,
    startedAt: typeof o.startedAt === "string" ? o.startedAt : null,
  };
}

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

  constructor(private readonly runner: ProjectRepositoryFn = projectRepository) {}

  async get(
    pythonPath: string,
    sessionsDir: string,
    cwd: string,
  ): Promise<ProjectionResult> {
    const key = projectionCacheKey(sessionsDir);
    const cached = this.entries.get(sessionsDir);
    if (cached && cached.key === key) return cached.result;
    const result = await this.runner(pythonPath, sessionsDir, cwd);
    // A failed projection is cached too — retrying an uninstallable
    // python on every 30s poll would spawn a failing process forever.
    // The mtime key still re-arms it when the ledger changes, and an
    // explicit refresh clears the cache outright.
    this.entries.set(sessionsDir, { key, result });
    return result;
  }

  clear(): void {
    this.entries.clear();
  }
}
