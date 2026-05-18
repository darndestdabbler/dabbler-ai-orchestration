export type SessionState = "complete" | "in-progress" | "not-started" | "cancelled";

// Set 030 Session 1 — session-state.json schema v3 ledger.
// The set-level `SessionState` above is the extension's bucketing
// state (Cancelled / Complete / Active / Not Started). Set 030
// Session 3 unified the bucketing literal with the per-session
// status under the canonical name `complete`, retiring the older
// `done` label so JSON and display vocabulary match.
// The union below is the per-session status used in v3's
// `sessions[]` ledger and must match Python's `SESSION_STATUSES` in
// `ai_router/progress.py`.
export type SessionStatus = "not-started" | "in-progress" | "complete" | "cancelled";

export interface SessionRecord {
  number: number;
  title: string;
  status: SessionStatus;
}

export interface ProgressView {
  sessions: SessionRecord[];
  totalSessions: number;
  completedSessions: number[];
  currentSession: number | null;
  nextSession: number | null;
  isBetweenSessions: boolean;
}

// v3 session-state.json shape. Top-level fields mirror v2 except
// the legacy progress triple (currentSession / totalSessions /
// completedSessions) is replaced by the `sessions[]` ledger.
// Set 030 Session 2's dual-write writers emit BOTH shapes on disk
// so legacy readers keep working; this interface describes the v3
// canonical fields only.
export interface SessionStateV3 {
  schemaVersion: 3;
  sessionSetName: string;
  status: "not-started" | "in-progress" | "complete" | "cancelled";
  lifecycleState: "work_in_progress" | "closed" | null;
  startedAt: string | null;
  completedAt: string | null;
  verificationVerdict: string | null;
  orchestrator: OrchestratorInfo | null;
  sessions: SessionRecord[];
}

export interface SessionSetConfig {
  requiresUAT: boolean;
  requiresE2E: boolean;
  uatScope: string;
}

export interface UatSummary {
  totalItems: number;
  pendingItems: number;
  e2eRefs: string[];
}

export interface OrchestratorInfo {
  engine?: string;
  model?: string;
  effort?: string;
}

export interface LiveSession {
  currentSession: number | null;
  status: string | null;
  orchestrator: OrchestratorInfo | null;
  startedAt: string | null;
  completedAt: string | null;
  verificationVerdict: string | null;
  // Set 9 Session 3 (D-2 hard-scoping): true when the close-out path
  // was bypassed via ``--force`` / ``mark_session_complete(force=True)``.
  // Surfaced as a ``[FORCED]`` badge on the Session Set Explorer row so
  // reviewers can spot emergency-bypass close-outs at a glance. Absent
  // or false on every snapshot written by a normal close-out.
  forceClosed: boolean | null;
  // Set 022 Session 2: completedSessions[] is the authoritative
  // progress ledger under the state-first lifecycle protocol. Surfaced
  // here so the tree-view can compute the "currentSession is in flight"
  // predicate (currentSession not in completedSessions[]) without
  // re-reading the state file. Null when the snapshot pre-dates the
  // array (legacy sets); empty array when the protocol has been
  // applied but no session has closed yet.
  completedSessions: number[] | null;
}

export interface SessionSet {
  name: string;
  dir: string;
  specPath: string;
  activityPath: string;
  changeLogPath: string;
  statePath: string;
  aiAssignmentPath: string;
  uatChecklistPath: string;
  state: SessionState;
  totalSessions: number | null;
  sessionsCompleted: number;
  lastTouched: string | null;
  liveSession: LiveSession | null;
  config: SessionSetConfig;
  uatSummary: UatSummary | null;
  root: string;
  // Set 030 Session 5: true when this set's session-state.json is
  // v2 (schemaVersion missing or != 3, OR schemaVersion == 3 but
  // sessions[] absent). The tree renders a "(needs migration)" badge
  // and exposes a context-menu "Migrate to v3 schema" command. Default
  // false; absent / broken state files do not flag (the v3 reader's
  // tolerant path already handles missing-file display).
  needsMigration: boolean;
}

export interface MetricsEntry {
  session_set: string;
  session_num: number;
  model: string;
  effort: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  timestamp: string;
}

export interface CostSummary {
  totalCost: number;
  bySessionSet: Record<string, { sessions: number; cost: number; lastRun: string }>;
  byModel: Record<string, number>;
  dailyCosts: Array<{ date: string; cost: number }>;
}
