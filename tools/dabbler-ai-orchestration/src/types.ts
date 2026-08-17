// The extension's view of one session set, assembled from the Python
// projection (`python -m ai_router.progress --json <set-dir>`) plus the
// few spec-level grouping attributes the tree needs (module, kind,
// prerequisites). TypeScript renders; Python decides — nothing in this
// file may be derived by re-reading session-state.json in TS.

export type SessionState = "complete" | "in-progress" | "not-started" | "cancelled";

// Per-session status vocabulary; must match Python's SESSION_STATUSES in
// ai_router/progress.py.
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

// The set-level half of the projection payload, as progress.py emits it.
export interface ProjectionSet {
  slug: string;
  status: SessionState;
  iconKey: SessionState;
  schemaVersionOnDisk: number | null;
  totalSessions: number | null;
  sessionsCompleted: number;
  currentSession: number | null;
  verificationVerdict: string | null;
  forceClosed: boolean;
  preCancelStatus: string | null;
  orchestrator: OrchestratorInfo | null;
  invariantViolation: string | null;
}

export interface ProjectionPayload {
  schemaVersion: number;
  generatedAt: string;
  set: ProjectionSet;
  sessions: SessionRecord[];
}

// The two module-lifecycle set kinds. Absent means ordinary work set.
export type SessionSetKind = "plan" | "decomposition";

// Spec-declared grouping attributes, parsed from the spec's
// `Session Set Configuration` YAML block. Raw values as authored;
// validation against docs/modules.yaml happens at scan time.
export interface SessionSetConfig {
  module: string | null;
  kind?: string;
}

// The fail-loud duplicate-set-name error attached to the one merged row
// the Explorer shows for a collided name.
export interface DuplicateNameError {
  name: string;
  chosenDir: string;
  conflictingDirs: string[];
}

export interface DuplicateNameCollision extends DuplicateNameError {
  candidates: Array<{
    dir: string;
    familyId: string;
    state: SessionState;
    lastTouched: string | null;
  }>;
}

// One entry of `docs/modules.yaml`. Display order = manifest file order.
export interface ModuleManifestEntry {
  slug: string;
  title: string;
  codeRoots: string[];
  planPath: string | null;
  touches: string[];
}

export interface SessionSetPrerequisite {
  slug: string;
  condition: "complete";
}

// One unsatisfied prerequisite, carried so the blocked marker's tooltip
// can name what the row is waiting on. `targetState` is "unknown" when
// no scanned set matches the slug — a typo still blocks.
export interface UnsatisfiedPrerequisite {
  slug: string;
  condition: "complete";
  targetState: SessionState | "unknown";
}

export interface SessionSet {
  name: string;
  // Validated module attribution: the spec's `module:` key when it names
  // a docs/modules.yaml slug, else null. Grouping only — never identity.
  module: string | null;
  moduleTitle: string | null;
  // The validated module's index in its root's manifest list (display
  // order). Null exactly when `module` is null.
  moduleOrder: number | null;
  // Validated lifecycle-set kind; undefined on ordinary work sets and on
  // declared-but-unknown values (which degrade to ordinary work sets).
  kind?: SessionSetKind;
  dir: string;
  specPath: string;
  activityPath: string;
  changeLogPath: string;
  statePath: string;
  root: string;
  state: SessionState;
  totalSessions: number | null;
  sessionsCompleted: number;
  currentSession: number | null;
  verificationVerdict: string | null;
  forceClosed: boolean;
  schemaVersionOnDisk: number | null;
  invariantViolation: string | null;
  orchestrator: OrchestratorInfo | null;
  startedAt: string | null;
  // Newest artifact mtime, for bucket ordering. Rendering only.
  lastTouched: string | null;
  // Raw declared config; `module`/`kind` above are the validated forms.
  config: SessionSetConfig;
  prerequisites: SessionSetPrerequisite[] | null;
  // Always equals `unsatisfiedPrereqs.length > 0`.
  blockedByPrereqs: boolean;
  unsatisfiedPrereqs: UnsatisfiedPrerequisite[];
  // The normalized sessions ledger, with steps populated on the
  // in-flight session only. Empty when the projection was unavailable
  // (no python, projection error) — the set still renders from its
  // fallback scan, just without session rows.
  sessions: SessionRecord[];
  duplicateNameError?: DuplicateNameError;
}
