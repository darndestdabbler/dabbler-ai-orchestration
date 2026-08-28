// The extension's view of one repository's sessions, assembled from the
// Python projection (`python -m ai_router.progress --json`). TypeScript
// renders; Python decides — nothing in this file may be derived by
// re-reading sessions.json in TS.
//
// Sessions are numbered directly in a repository. There is no level
// above a session that carries a lifecycle state: a repository is never
// "complete", so it has a progress fraction and nothing else.

// The one status vocabulary, shared by sessions and steps; must match
// Python's SESSION_STATUSES in ai_router/progress.py.
export type SessionStatus = "not-started" | "in-progress" | "complete" | "cancelled";

/** One step row of an in-flight session, verbatim from the projection. */
export interface StepRecord {
  position: number;
  stepNumber?: number | null;
  stepKey: string | null;
  description: string;
  status: string | null;
  /** Human-readable state phrase the projection derived. */
  state: string;
  /** The `[x]`-style checklist box, for tooltips. */
  box: string;
  /** Which status glyph the row renders. */
  iconKey: SessionStatus;
  isPlanned: boolean;
  isActive: boolean;
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
  steps: StepRecord[];
}

export interface OrchestratorInfo {
  engine?: string;
  provider?: string;
  model?: string;
  effort?: string;
}

// The repository-level half of the projection payload, as progress.py
// emits it. No `status`: nothing above a session holds one.
export interface ProjectionRepository {
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
  invariantViolation: string | null;
  orchestrator: OrchestratorInfo | null;
  /**
   * The normalized sessions ledger, with steps populated on the
   * in-flight session only. Empty when the projection was unavailable
   * (no python, no router) — the repository row still renders, and the
   * view says the rendering is degraded rather than guessing statuses
   * that only Python decides.
   */
  sessions: SessionRecord[];
}
