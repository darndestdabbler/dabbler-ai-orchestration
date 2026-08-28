// Shared builders for the unit suite: in-memory SessionsRepository /
// SessionRecord / TaskRecord records shaped exactly as the scan builds
// them, with per-test overrides.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PythonSpawnRouter } from "../../router/pythonSpawnRouter";
import { RunRouterCliDeps } from "../../router/routerCli";
import type {
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
 * A `PythonSpawnRouter` whose spawn settles immediately with the given
 * exit code, recording the argv it was asked to run.
 *
 * It drives the real seam — the argv the router builds, the exit-code
 * mapping it applies — with no subprocess. `argv` is what a caller would
 * have run, so an argv contract is asserted by asking the router for the
 * verb rather than by calling a builder the router does not use.
 */
export function fakeRouter(
  exitCode: number,
  stderr = "",
): { router: PythonSpawnRouter; argv: string[][] } {
  const argv: string[][] = [];
  const deps: RunRouterCliDeps = {
    echo: { append: () => {}, reveal: () => {} },
    resolveInterpreter: () => "python",
    interpreterExists: () => true,
    spawn: ((_exe: string, args: string[]) => {
      argv.push(args);
      const mkStream = (payload: string) => ({
        on: (event: string, cb: (chunk: Buffer) => void) => {
          if (event === "data" && payload) cb(Buffer.from(payload));
        },
      });
      const child = {
        stdout: mkStream(exitCode === 0 ? '{"status":"ok"}' : ""),
        stderr: mkStream(stderr),
        on: (event: string, cb: (arg?: unknown) => void) => {
          if (event === "close") queueMicrotask(() => cb(exitCode));
          return child;
        },
      };
      return child;
    }) as unknown as RunRouterCliDeps["spawn"],
  };
  return { router: new PythonSpawnRouter(deps), argv };
}

/** A router whose spawn must never be reached. */
export function unusableRouter(): PythonSpawnRouter {
  return new PythonSpawnRouter({
    spawn: (() => {
      throw new Error("must not spawn");
    }) as never,
  });
}
