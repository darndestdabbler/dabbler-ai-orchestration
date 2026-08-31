// Shared builders for the unit suite: in-memory SessionsRepository /
// SessionRecord / TaskRecord records shaped exactly as the scan builds
// them, with per-test overrides.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { outcomeForExitCode } from "dabbler-ai-router";
import type {
  BootstrapOptions,
  Router,
  RouterResult,
  ProgressProjection as ProjectionPayload,
  ProgressProjectionSession as SessionRecord,
  ProgressProjectionVerification as SessionVerification,
  ProgressProjectionTask as TaskRecord,
  ProgressProjectionFinding as VerificationFinding,
} from "dabbler-ai-router";
import type { SessionsRepository } from "../../utils/fileSystem";

export function makeFinding(
  overrides: Partial<VerificationFinding> = {},
): VerificationFinding {
  return {
    round: 3,
    description: "the suite command is guessed rather than declared",
    severity: "major",
    category: "Correctness",
    failureScenario: "A Java repository gets `python -m pytest`.",
    evidencePaths: ["ai_router/affected.py"],
    blocking: true,
    disposition: "outstanding",
    ...overrides,
  };
}

/** A session unresolved at the cap, as the projection folds one. */
export function makeVerification(
  overrides: Partial<SessionVerification> = {},
): SessionVerification {
  return {
    terminal: "ISSUES_FOUND",
    headline: "unresolved at the cap",
    clean: false,
    verdict: "ISSUES_FOUND",
    rounds: 3,
    stoppedAtRound: 3,
    cap: 3,
    verifierModel: "gpt-5-6-sol",
    verifierProvider: "openai",
    transport: "api",
    agency: {
      mode: "none",
      reads: 0,
      searches: 0,
      listings: 0,
      transformedReads: 0,
      outOfScope: 0,
      overBudget: 0,
      reason: "this transport sends no tools",
      operations: [],
    },
    findings: [makeFinding()],
    fixPaths: [],
    ...overrides,
  };
}

export function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    position: 0,
    stepId: "implement",
    intent: "Implement the thing.",
    state: "pending",
    iconKey: "not-started",
    isOpen: false,
    startedAt: null,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const number = overrides.number ?? 1;
  return {
    number,
    displayNumber: String(number).padStart(3, "0"),
    title: "Session one",
    status: "complete",
    iconKey: "complete",
    inFlight: false,
    startedAt: null,
    completedAt: null,
    verificationVerdict: null,
    tasks: [],
    tasksRefused: null,
    verification: null,
    verificationRefused: null,
    ...overrides,
  };
}

export function makeRepository(
  overrides: Partial<SessionsRepository> = {},
): SessionsRepository {
  const root = overrides.root ?? path.join("D:", "ws");
  const sessionsDir = path.join(root, "docs", "sessions");
  return {
    root,
    sessionsDir,
    label: path.basename(root),
    planPath: path.join(sessionsDir, "session-plan.md"),
    activityPath: path.join(sessionsDir, "activity-log.json"),
    changeLogPath: path.join(sessionsDir, "change-log.md"),
    ledgerPath: path.join(sessionsDir, "sessions.json"),
    totalSessions: null,
    sessionsCompleted: 0,
    currentSession: null,
    forceClosed: false,
    schemaVersionOnDisk: null,
    sessionsSource: "ledger",
    invariantViolation: null,
    lastActivityAt: null,
    possiblyStalled: false,
    owedDecisions: [],
    orchestrator: null,
    sessions: [],
    ...overrides,
  };
}

export function makeProjection(
  overrides: {
    repository?: Partial<ProjectionPayload["repository"]>;
    sessions?: SessionRecord[];
  } = {},
): ProjectionPayload {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-17T12:00:00-04:00",
    repository: {
      sessionsSource: "ledger",
      schemaVersionOnDisk: 5,
      totalSessions: 2,
      sessionsCompleted: 2,
      currentSession: null,
      plannedSessions: 0,
      nextSession: null,
      lastActivityAt: null,
      possiblyStalled: false,
      stalledAfterSeconds: null,
      owedDecisions: [],
      forceClosed: false,
      orchestrator: null,
      invariantViolation: null,
      ...(overrides.repository ?? {}),
    },
    sessions: overrides.sessions ?? [
      makeSession({ number: 1 }),
      makeSession({ number: 2, title: "Session two" }),
    ],
  };
}

/** A throwaway directory tree; removed by the caller's teardown. */
export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeFileTree(
  root: string,
  files: Record<string, string>,
): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
}

export function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * A `Router` that answers every verb the same way, recording which was
 * asked.
 *
 * The router it replaces was the real `PythonSpawnRouter` with an injected
 * spawn, which let a flow test assert the argv as well as the outcome.
 * There is no spawn to inject now, and the argv is no longer the
 * extension's to assert: `InProcessRouter` builds it and the router
 * package's own suite drives it against real repositories. What is left
 * here is what these tests were ever about -- a flow, given an answer.
 */
export function fakeRouter(
  exitCode: number,
  message = "",
): { router: Router; asked: string[]; bootstrapOptions: BootstrapOptions[] } {
  const asked: string[] = [];
  // Recorded, because what bootstrap is ASKED to do is the behaviour some
  // callers care about: setting up one project must not carry a machine-wide
  // side effect, and only the options say whether it does.
  const bootstrapOptions: BootstrapOptions[] = [];
  const answer = <T,>(verb: string, value: T): Promise<RouterResult<T>> => {
    asked.push(verb);
    const outcome = outcomeForExitCode(exitCode);
    return Promise.resolve(
      outcome === "ok"
        ? ({ ok: true, outcome, value } as RouterResult<T>)
        : ({ ok: false, outcome, exitCode, message } as RouterResult<T>),
    );
  };
  const text = (verb: string) => () => answer(verb, { stdout: message });
  return {
    bootstrapOptions,
    router: {
      session: {
        start: text("session start"),
        declare: text("session declare"),
        close: text("session close"),
        cancel: text("session cancel"),
        restore: text("session restore"),
        decision: text("session decision"),
        interrupt: text("session interrupt"),
      },
      modules: { create: text("modules create") },
      verify: {
        round: text("verify"),
        dispute: text("verify dispute"),
        adjudicate: text("verify adjudicate"),
        reanchor: text("verify reanchor"),
        stepOpen: text("verify step open"),
        stepClose: text("verify step close"),
        stepStatus: text("verify step status"),
        stepAmend: text("verify step amend"),
      },
      workflow: {
        enter: text("workflow enter"),
        review: text("workflow review"),
        approve: text("workflow approve"),
        authorTests: text("workflow author-tests"),
        test: text("workflow test"),
        suite: text("workflow suite"),
        fix: text("workflow fix"),
        sendBack: text("workflow send-back"),
        status: text("workflow status"),
      },
      ledger: { latestRound: () => answer("ledger latestRound", null) },
      testEvidence: { record: text("test-evidence record") },
      approvedPlan: {
        read: () => answer("approved-plan read", {} as never),
      },
      progress: () => answer("progress", makeProjection()),
      workspace: text("workspace"),
      bootstrap: (options: BootstrapOptions) => {
        bootstrapOptions.push(options);
        return answer("bootstrap", { stdout: message });
      },
      affected: text("affected"),
    },
    asked,
  };
}

/** A router no flow under test may reach. */
export function unusableRouter(): Router {
  const never = (): never => {
    throw new Error("the router must not be reached");
  };
  return new Proxy({} as Router, {
    get: () =>
      new Proxy(never, { get: () => never, apply: never }) as unknown,
  });
}
