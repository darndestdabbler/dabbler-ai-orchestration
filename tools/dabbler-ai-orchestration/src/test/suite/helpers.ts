// Shared builders for the unit suite: in-memory SessionsRepository /
// SessionRecord / TaskRecord records shaped exactly as the scan builds
// them, with per-test overrides.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ProjectionPayload,
  SessionRecord,
  SessionsRepository,
  TaskRecord,
} from "../../types";

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
