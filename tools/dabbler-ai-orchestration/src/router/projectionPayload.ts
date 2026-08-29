// Narrowing one subprocess's stdout into the projection.
//
// It lives beside `PythonSpawnRouter` because it is a spawn's concern:
// what comes back is untrusted text, and only an implementation that
// reads text has to prove it is a payload. The in-process router of
// session 35 returns a `ProgressProjection` because it built one, and
// takes none of this with it.
//
// The shape is the schema's — `ProgressProjection`, generated — so a
// schema change is a compile error here rather than a field that
// silently stops being read.

import type {
  ProgressProjection,
  ProgressProjectionAgencyOperation,
  ProgressProjectionFinding,
  ProgressProjectionSession,
  ProgressProjectionSessionStatus,
  ProgressProjectionTask,
  ProgressProjectionVerification,
} from "dabbler-ai-router";

const STATUSES: ReadonlySet<string> = new Set([
  "complete",
  "in-progress",
  "not-started",
  "cancelled",
]);

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const count = (v: unknown): number => (typeof v === "number" ? v : 0);

/**
 * Narrow untrusted CLI output to the payload shape. Tolerant of extra
 * FIELDS (the projection schema is additive) and closed to a foreign
 * VERSION, which is a different promise about the shape rather than more
 * of the same one. Fails closed to null on a missing or foreign core
 * shape, so a partial write never renders as truth.
 */
export function parseProjectionPayload(text: string): ProgressProjection | null {
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
  // The generated type says `schemaVersion: 1`, so this reader handles
  // exactly that shape. A payload announcing another one is not a
  // projection this can repeat: rendering it as if it were version 1
  // would be the "partial write renders as truth" failure the rest of
  // this file exists to prevent, and carrying the foreign number through
  // would make the returned value disagree with its own type.
  if (obj.schemaVersion !== 1) return null;
  const sessions = obj.sessions
    .map(narrowSession)
    .filter((x): x is ProgressProjectionSession => x !== null);
  return {
    schemaVersion: 1,
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
          ? (r.orchestrator as ProgressProjection["repository"]["orchestrator"])
          : null,
      invariantViolation:
        typeof r.invariantViolation === "string" ? r.invariantViolation : null,
    },
    sessions,
  };
}

function narrowSession(raw: unknown): ProgressProjectionSession | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const number = o.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    return null;
  }
  const status = String(o.status);
  if (!STATUSES.has(status)) return null;
  const tasks = Array.isArray(o.tasks)
    ? o.tasks.map(narrowTask).filter((x): x is ProgressProjectionTask => x !== null)
    : [];
  return {
    number,
    displayNumber: typeof o.displayNumber === "string" ? o.displayNumber : "",
    title: typeof o.title === "string" && o.title ? o.title : `Session ${number}`,
    status: status as ProgressProjectionSessionStatus,
    iconKey: STATUSES.has(String(o.iconKey))
      ? (o.iconKey as ProgressProjectionSessionStatus)
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

/**
 * The folded rounds ledger. The headline is the one field the view cannot
 * do without — it is Python's statement of the state — so a payload
 * lacking it is not a view the tree can repeat and narrows to null.
 * `clean` fails closed: anything but an explicit true is unclean, so a
 * router that never said "clean" cannot make a stopped session read as
 * verified.
 */
function narrowVerification(raw: unknown): ProgressProjectionVerification | null {
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
            .filter((x): x is ProgressProjectionAgencyOperation => x !== null)
        : [],
    },
    findings: Array.isArray(o.findings)
      ? o.findings
          .map(narrowFinding)
          .filter((x): x is ProgressProjectionFinding => x !== null)
      : [],
    fixPaths: Array.isArray(o.fixPaths)
      ? o.fixPaths.filter((p): p is string => typeof p === "string")
      : [],
  };
}

function narrowOperation(raw: unknown): ProgressProjectionAgencyOperation | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    kind: str(o.kind) ?? "",
    target: str(o.target) ?? "",
    fidelity: str(o.fidelity),
    inScope: o.inScope !== false,
  };
}

function narrowFinding(raw: unknown): ProgressProjectionFinding | null {
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

function narrowTask(raw: unknown): ProgressProjectionTask | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    position: typeof o.position === "number" ? o.position : 0,
    stepId: typeof o.stepId === "string" ? o.stepId : null,
    intent: typeof o.intent === "string" ? o.intent : "",
    state: typeof o.state === "string" ? o.state : "",
    iconKey: STATUSES.has(String(o.iconKey))
      ? (o.iconKey as ProgressProjectionSessionStatus)
      : "not-started",
    isOpen: o.isOpen === true,
    startedAt: typeof o.startedAt === "string" ? o.startedAt : null,
  };
}
