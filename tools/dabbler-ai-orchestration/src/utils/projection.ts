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
import {
  AgencyOperation,
  ProjectionPayload,
  SessionRecord,
  SessionStatus,
  SessionVerification,
  TaskRecord,
  VerificationFinding,
} from "../types";

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
      // Anything that is not the plan is the ledger, including a router
      // too old to say. That default is the safe one: it claims a record
      // exists rather than announcing a repository nothing has run in,
      // and only the plan case unlocks the "nothing has run here" copy.
      sessionsSource: r.sessionsSource === "plan" ? "plan" : "ledger",
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
  const tasks = Array.isArray(o.tasks)
    ? o.tasks.map(narrowTask).filter((x): x is TaskRecord => x !== null)
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
    tasks,
    // A refusal is carried, never inferred from an empty list: the
    // projection distinguishes "this session declared no plan" from "the
    // execution record could not be read", and so must the tree.
    tasksRefused: typeof o.tasksRefused === "string" ? o.tasksRefused : null,
    verification: narrowVerification(o.verification),
    verificationRefused:
      typeof o.verificationRefused === "string" ? o.verificationRefused : null,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const count = (v: unknown): number => (typeof v === "number" ? v : 0);

/**
 * The folded rounds ledger. The headline is the one field the view cannot
 * do without — it is Python's statement of the state — so a payload
 * lacking it is not a view the tree can repeat and narrows to null.
 * `clean` fails closed: anything but an explicit true is unclean, so a
 * router that never said "clean" cannot make a stopped session read as
 * verified.
 */
function narrowVerification(raw: unknown): SessionVerification | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.headline !== "string") return null;
  const agency = (
    o.agency !== null && typeof o.agency === "object" ? o.agency : {}
  ) as Record<string, unknown>;
  return {
    terminal: str(o.terminal),
    headline: o.headline,
    clean: o.clean === true,
    verdict: str(o.verdict),
    rounds: count(o.rounds),
    stoppedAtRound: num(o.stoppedAtRound),
    cap: num(o.cap),
    verifierModel: str(o.verifierModel),
    verifierProvider: str(o.verifierProvider),
    transport: str(o.transport),
    agency: {
      mode: agency.mode === "tools" || agency.mode === "none" ? agency.mode : null,
      reads: count(agency.reads),
      searches: count(agency.searches),
      listings: count(agency.listings),
      transformedReads: count(agency.transformedReads),
      outOfScope: count(agency.outOfScope),
      overBudget: count(agency.overBudget),
      reason: str(agency.reason),
      operations: Array.isArray(agency.operations)
        ? agency.operations
            .map(narrowOperation)
            .filter((x): x is AgencyOperation => x !== null)
        : [],
    },
    findings: Array.isArray(o.findings)
      ? o.findings
          .map(narrowFinding)
          .filter((x): x is VerificationFinding => x !== null)
      : [],
    fixPaths: Array.isArray(o.fixPaths)
      ? o.fixPaths.filter((p): p is string => typeof p === "string")
      : [],
  };
}

function narrowOperation(raw: unknown): AgencyOperation | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    kind: str(o.kind) ?? "",
    target: str(o.target) ?? "",
    fidelity: str(o.fidelity),
    inScope: o.inScope !== false,
  };
}

function narrowFinding(raw: unknown): VerificationFinding | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    round: num(o.round),
    description: str(o.description) ?? "",
    severity: str(o.severity) ?? "",
    category: str(o.category) ?? "",
    failureScenario: str(o.failureScenario) ?? "",
    evidencePaths: Array.isArray(o.evidencePaths)
      ? o.evidencePaths.filter((p): p is string => typeof p === "string")
      : [],
    blocking: o.blocking === true,
    disposition: str(o.disposition) ?? "",
  };
}

function narrowTask(raw: unknown): TaskRecord | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    position: typeof o.position === "number" ? o.position : 0,
    stepId: typeof o.stepId === "string" ? o.stepId : null,
    intent: typeof o.intent === "string" ? o.intent : "",
    state: typeof o.state === "string" ? o.state : "",
    iconKey: STATUSES.has(String(o.iconKey))
      ? (o.iconKey as SessionStatus)
      : "not-started",
    isOpen: o.isOpen === true,
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
    // `cwd` is the repository root — the run records live under it.
    const key = projectionCacheKey(sessionsDir, cwd);
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
