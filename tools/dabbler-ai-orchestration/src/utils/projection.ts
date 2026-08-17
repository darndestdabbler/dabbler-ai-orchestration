// The one seam between the tree and the Python data layer: every set's
// display state comes from `python -m ai_router.progress --json <dir>`.
// The extension never re-derives session state from the artifact files —
// TypeScript renders, Python decides.
//
// Projections are cached per set directory, keyed on the mtimes of the
// files the derivation reads, so a watcher tick or the 30-second poll
// re-runs Python only for sets that actually changed.

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ProjectionPayload, SessionRecord, SessionState, StepRecord } from "../types";

/** The files whose mtimes invalidate a cached projection. */
const CACHE_INPUTS = [
  "session-state.json",
  "activity-log.json",
  "spec.md",
  "change-log.md",
  "CANCELLED.md",
  "RESTORED.md",
];

export function projectionCacheKey(
  setDir: string,
  statFile: (p: string) => number | null = mtimeOrNull,
): string {
  return CACHE_INPUTS.map((f) => String(statFile(path.join(setDir, f)))).join("|");
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

export type ProjectSetFn = (
  pythonPath: string,
  setDir: string,
  cwd: string,
) => Promise<ProjectionResult>;

/** Spawn the projection CLI for one set. */
export function projectSet(
  pythonPath: string,
  setDir: string,
  cwd: string,
): Promise<ProjectionResult> {
  return new Promise((resolve) => {
    cp.execFile(
      pythonPath,
      ["-m", "ai_router.progress", "--json", setDir],
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

const SET_STATES: ReadonlySet<string> = new Set([
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
  const set = obj.set;
  if (set === null || typeof set !== "object") return null;
  const s = set as Record<string, unknown>;
  if (typeof s.slug !== "string" || !SET_STATES.has(String(s.status))) return null;
  const sessions = Array.isArray(obj.sessions)
    ? obj.sessions.map(narrowSession).filter((x): x is SessionRecord => x !== null)
    : [];
  return {
    schemaVersion: Number(obj.schemaVersion) || 0,
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : "",
    set: {
      slug: s.slug,
      status: s.status as SessionState,
      iconKey: SET_STATES.has(String(s.iconKey))
        ? (s.iconKey as SessionState)
        : (s.status as SessionState),
      schemaVersionOnDisk:
        typeof s.schemaVersionOnDisk === "number" ? s.schemaVersionOnDisk : null,
      totalSessions: typeof s.totalSessions === "number" ? s.totalSessions : null,
      sessionsCompleted:
        typeof s.sessionsCompleted === "number" ? s.sessionsCompleted : 0,
      currentSession: typeof s.currentSession === "number" ? s.currentSession : null,
      verificationVerdict:
        typeof s.verificationVerdict === "string" ? s.verificationVerdict : null,
      forceClosed: s.forceClosed === true,
      preCancelStatus:
        typeof s.preCancelStatus === "string" ? s.preCancelStatus : null,
      orchestrator:
        s.orchestrator !== null && typeof s.orchestrator === "object"
          ? (s.orchestrator as ProjectionPayload["set"]["orchestrator"])
          : null,
      invariantViolation:
        typeof s.invariantViolation === "string" ? s.invariantViolation : null,
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
  if (!SET_STATES.has(status)) return null;
  const steps = Array.isArray(o.steps)
    ? o.steps.map(narrowStep).filter((x): x is StepRecord => x !== null)
    : [];
  return {
    number,
    title: typeof o.title === "string" && o.title ? o.title : `Session ${number}`,
    status: status as SessionRecord["status"],
    iconKey: SET_STATES.has(String(o.iconKey))
      ? (o.iconKey as SessionRecord["iconKey"])
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
    iconKey: SET_STATES.has(String(o.iconKey))
      ? (o.iconKey as StepRecord["iconKey"])
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
 * set's derivation inputs changed since the cached run.
 */
export class ProjectionCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly runner: ProjectSetFn = projectSet) {}

  async get(
    pythonPath: string,
    setDir: string,
    cwd: string,
  ): Promise<ProjectionResult> {
    const key = projectionCacheKey(setDir);
    const cached = this.entries.get(setDir);
    if (cached && cached.key === key) return cached.result;
    const result = await this.runner(pythonPath, setDir, cwd);
    // A failed projection is cached too — retrying an uninstallable
    // python on every 30s poll would spawn a failing process per set
    // forever. The mtime key still re-arms it when the set changes,
    // and an explicit refresh clears the cache outright.
    this.entries.set(setDir, { key, result });
    return result;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Run projections for many sets with bounded concurrency: interpreter
 * startup is the dominant cost, and an unbounded fan-out over a large
 * corpus would spawn one python per set at once.
 */
export async function projectAll(
  cache: ProjectionCache,
  pythonPath: string,
  setDirs: readonly string[],
  cwd: string,
  concurrency = 6,
): Promise<Map<string, ProjectionResult>> {
  const out = new Map<string, ProjectionResult>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < setDirs.length) {
      const dir = setDirs[next++];
      out.set(dir, await cache.get(pythonPath, dir, cwd));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, setDirs.length) }, worker),
  );
  return out;
}
