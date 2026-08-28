// The extension's view of one repository's sessions, assembled from the
// Python projection (`python -m ai_router.progress --json`). TypeScript
// renders; Python decides — nothing in this file may be derived by
// re-reading sessions.json in TS.
//
// Sessions are numbered directly in a repository. There is no level
// above a session that carries a lifecycle state: a repository is never
// "complete", so it has a progress fraction and nothing else.

// The one status vocabulary, shared by sessions and tasks; must match
// Python's SESSION_STATUSES in ai_router/progress.py.
export type SessionStatus = "not-started" | "in-progress" | "complete" | "cancelled";

/**
 * One task row of an in-flight session, verbatim from the projection.
 *
 * Identity and order are the session's approved plan's; `state` and
 * `iconKey` are folded from `step-execution.jsonl`. Nothing here is
 * derived in TypeScript, and nothing here comes from the activity log —
 * that is the layer that drifted.
 */
export interface TaskRecord {
  position: number;
  /** `steps[].step_id` from approved-plan.json. */
  stepId: string | null;
  /** `steps[].intent` — one imperative sentence. */
  intent: string;
  /** The fold's own words: "pending", "in flight", "done". */
  state: string;
  /** Which status glyph the row renders. */
  iconKey: SessionStatus;
  /** The one step in flight, if this is it. At most one per session. */
  isOpen: boolean;
  /** When this step was opened, from its `opened` row. */
  startedAt: string | null;
}

export interface SessionRecord {
  number: number;
  /**
   * The number as the projection WROTE it — "015". Python owns the
   * padding rule (progress.session_display_number); this is its result,
   * not a shape TypeScript re-derives. Empty when an older router sent
   * no name.
   */
  displayNumber: string;
  title: string;
  status: SessionStatus;
  iconKey: SessionStatus;
  inFlight: boolean;
  startedAt: string | null;
  completedAt: string | null;
  verificationVerdict: string | null;
  tasks: TaskRecord[];
  /**
   * Why the execution record could not be read, or null. A refusal is
   * NOT an empty task list: the tree must say it cannot tell which step
   * is open rather than render the last row it could read.
   */
  tasksRefused: string | null;
}

export interface OrchestratorInfo {
  engine?: string;
  provider?: string;
  model?: string;
  effort?: string;
}

/**
 * Where a repository's sessions came from. `ledger` is the
 * machine-written record; `plan` is a repository that has been set up
 * and never run, whose sessions are the ones its plan declares — the
 * two setup sessions bootstrap scaffolds, before the first
 * registration writes anything.
 */
export type SessionsSource = "ledger" | "plan";

// The repository-level half of the projection payload, as progress.py
// emits it. No `status`: nothing above a session holds one.
export interface ProjectionRepository {
  sessionsSource: SessionsSource;
  schemaVersionOnDisk: number | null;
  totalSessions: number | null;
  sessionsCompleted: number;
  currentSession: number | null;
  forceClosed: boolean;
  orchestrator: OrchestratorInfo | null;
  invariantViolation: string | null;
}

export interface ProjectionPayload {
  schemaVersion: number;
  generatedAt: string;
  repository: ProjectionRepository;
  sessions: SessionRecord[];
}

/**
 * One discovered repository and the sessions it holds — the Work
 * Explorer's root row.
 *
 * The four file paths are the sessions root's own artifacts. They are
 * the whole Open File surface: a repository has one plan, one activity
 * log, one change log and one ledger, so there is nothing to select
 * between.
 */
export interface SessionsRepository {
  /** Repository root — the spawn cwd and the interpreter's home. */
  root: string;
  /** `<root>/docs/sessions`. */
  sessionsDir: string;
  /** Display name; `path.basename(root)`. */
  label: string;
  planPath: string;
  activityPath: string;
  changeLogPath: string;
  ledgerPath: string;
  totalSessions: number | null;
  sessionsCompleted: number;
  currentSession: number | null;
  forceClosed: boolean;
  schemaVersionOnDisk: number | null;
  sessionsSource: SessionsSource;
  invariantViolation: string | null;
  orchestrator: OrchestratorInfo | null;
  /**
   * The normalized sessions ledger, with tasks populated on the
   * in-flight session only. Empty when the projection was unavailable
   * (no python, no router) — the repository row still renders, and the
   * view says the rendering is degraded rather than guessing statuses
   * that only Python decides.
   */
  sessions: SessionRecord[];
}
