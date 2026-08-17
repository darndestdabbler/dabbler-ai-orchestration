// Shared builders for the unit suite: in-memory SessionSet /
// SessionRecord / StepRecord records shaped exactly as the scan builds
// them, with per-test overrides.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ProjectionPayload,
  SessionRecord,
  SessionSet,
  StepRecord,
} from "../../types";

export function makeStep(overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    position: 0,
    stepNumber: 1,
    stepKey: "implement",
    description: "Implement the thing",
    status: "not-started",
    state: "not started",
    box: "[ ]",
    iconKey: "not-started",
    isPlanned: true,
    isActive: false,
    startedAt: null,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    number: 1,
    title: "Session one",
    status: "complete",
    iconKey: "complete",
    inFlight: false,
    startedAt: null,
    completedAt: null,
    verificationVerdict: null,
    steps: [],
    ...overrides,
  };
}

export function makeSet(overrides: Partial<SessionSet> = {}): SessionSet {
  const name = overrides.name ?? "001-fixture-set";
  const dir = overrides.dir ?? path.join("D:", "ws", "docs", "session-sets", name);
  return {
    name,
    module: null,
    moduleTitle: null,
    moduleOrder: null,
    dir,
    specPath: path.join(dir, "spec.md"),
    activityPath: path.join(dir, "activity-log.json"),
    changeLogPath: path.join(dir, "change-log.md"),
    statePath: path.join(dir, "session-state.json"),
    root: overrides.root ?? path.join("D:", "ws"),
    state: "not-started",
    totalSessions: null,
    sessionsCompleted: 0,
    currentSession: null,
    verificationVerdict: null,
    forceClosed: false,
    schemaVersionOnDisk: null,
    invariantViolation: null,
    orchestrator: null,
    startedAt: null,
    lastTouched: null,
    config: { module: null },
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    sessions: [],
    ...overrides,
  };
}

export function makeProjection(
  overrides: {
    set?: Partial<ProjectionPayload["set"]>;
    sessions?: SessionRecord[];
  } = {},
): ProjectionPayload {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-17T12:00:00-04:00",
    set: {
      slug: "001-fixture-set",
      status: "complete",
      iconKey: "complete",
      schemaVersionOnDisk: 4,
      totalSessions: 2,
      sessionsCompleted: 2,
      currentSession: null,
      verificationVerdict: "VERIFIED",
      forceClosed: false,
      preCancelStatus: null,
      orchestrator: null,
      invariantViolation: null,
      ...(overrides.set ?? {}),
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
