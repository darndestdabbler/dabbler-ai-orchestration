// Generated from progress-projection.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * The one status vocabulary, shared by sessions and tasks. It is the LEDGER's vocabulary: every value here is one a writer may put on disk, which is why 'planned' is not among them.
 */
export type ProgressProjectionSessionStatus = "not-started" | "in-progress" | "complete" | "cancelled";

/**
 * What a session row may say, which is one more thing than the ledger may hold. 'planned' is a session the plan declares and the ledger has not reached -- distinct from 'not-started', which already means 'registered, and not begun'. It exists only in a projection: no writer accepts it, and the ledger schema does not list it, so a projected state can never become a recorded one. A planned row's iconKey stays 'not-started' because the two share a glyph; what separates them is the row's words, not its picture.
 */
export type ProgressProjectionProjectedSessionStatus = "not-started" | "in-progress" | "complete" | "cancelled" | "planned";

/**
 * Who ran the sessions, passed through from the ledger's orchestrator block rather than re-shaped. Open, because the block carries more than a reader needs and a closed copy here would be a second declaration of it.
 */
export type ProgressProjectionOrchestrator = {
  [key: string]: unknown;
  engine?: string;
  provider?: string;
  model?: string;
  effort?: string;
};

/**
 * The repository-level half. There is no status: nothing above a session carries a lifecycle state, so a repository has a progress fraction and nothing else.
 */
export type ProgressProjectionRepository = {
  /**
   * Where these sessions came from. 'ledger' is the machine-written record; 'plan' is a repository that has been set up and never run, whose sessions are the ones its plan declares.
   */
  sessionsSource: "ledger" | "plan";
  schemaVersionOnDisk: number | null;
  totalSessions: number | null;
  sessionsCompleted: number;
  currentSession: number | null;
  /**
   * When this repository's record last moved: the latest timestamp across the activity log and the verification rounds. DERIVED, never stamped -- the framework already timestamps every row it writes, and a field written beside them would be a second statement of one fact. Null when nothing has been written yet.
   */
  lastActivityAt: string | null;
  /**
   * A session is in flight and its record has not moved for longer than the declared threshold. It proves the process has stopped WRITING, never that the thinking has stopped being useful, and the row that renders it must say which -- a heartbeat that implied the second would be a liveness signal making a judgment it cannot make.
   */
  possiblyStalled: boolean;
  /**
   * The threshold `possiblyStalled` was judged against, published so a reader never has to guess which number produced the answer. Null when nothing is in flight.
   */
  stalledAfterSeconds: number | null;
  /**
   * How many sessions the plan declares that the ledger has not reached. Zero for a repository whose ledger has caught up. It is published rather than left to be counted from the rows because 'is this project finished' is the question the count answers, and a reader that re-derived it would be a second implementation of the rule.
   */
  plannedSessions: number;
  /**
   * The number that registers on the next `session start`: the lowest open session, whether the ledger already holds a row for it or the plan alone declares it. Null when nothing is left to run. Derived here so the close and the Explorer answer 'what now' identically.
   */
  nextSession: number | null;
  forceClosed: boolean;
  orchestrator: ProgressProjectionOrchestrator | null;
  /**
   * Two sessions in flight, or another state the ledger may not be in. Rendered, never repaired.
   */
  invariantViolation: string | null;
  /**
   * Retired with the focused checkout: nothing projects it now.
   */
  exposure?: ProgressProjectionExposure | null;
  /**
   * Retired with the focused checkout: nothing projects it now.
   */
  checkoutModule?: string | null;
  /**
   * Retired with the focused checkout: nothing projects it now.
   */
  focusedSession?: {
    session: number;
    module: string;
    folder: string;
  } | null;
};

/**
 * One session's exposure manifest, as .dabbler/runs/s<N>/exposure.json carries it. siblings lists every module the session does not name with the implementation bytes its roots hold in the working directory (the contract folder excluded; the target is zero); grants are those in force with the reason each was given; outsideScope is the session's changed paths that its scope does not cover.
 */
export type ProgressProjectionExposure = {
  schema_version: 1;
  session: number;
  modules: string[];
  phase: "start" | "close";
  writtenAt: string;
  siblings: {
    slug: string;
    bytes: number;
    files: string[];
  }[];
  grants: {
    sibling: string;
    reason: string;
    grantedAt: string;
  }[];
  outsideScope: string[];
  /**
   * On the close manifest: the ungranted sibling bytes this checkout held, one sentence each. Recorded and said beside the exposure gate's row; never a refusal, because the changed paths are what measure the work.
   */
  siblingBytes?: string[];
};

/**
 * One step of an in-flight session's approved plan, folded with its execution record. Identity and order are the plan's; state and iconKey come from step-execution.jsonl.
 */
export type ProgressProjectionTask = {
  position: number;
  stepId: string | null;
  intent: string;
  /**
   * The fold's own words: 'pending', 'in flight', 'done'.
   */
  state: string;
  iconKey: ProgressProjectionSessionStatus;
  /**
   * The one step in flight, if this is it. At most one per session.
   */
  isOpen: boolean;
  startedAt: string | null;
};

export type ProgressProjectionAgencyOperation = {
  kind: string;
  target: string;
  /**
   * 'verbatim' / 'transformed' / 'unverified', or null when the row was written before fidelity was recorded.
   */
  fidelity: string | null;
  inScope: boolean;
  /**
   * A read outside the scope that found no file in the checkout: the wall holding.
   */
  refused?: boolean;
};

/**
 * What the verifier looked at in the round that stopped a session, and how faithfully. mode is null for a round recorded before the agency log existed -- unknown, which is not the same as 'none'.
 */
export type ProgressProjectionAgency = {
  mode: "tools" | "none" | null;
  reads: number;
  searches: number;
  listings: number;
  transformedReads: number;
  outOfScope: number;
  /**
   * Of the out-of-scope reads, those the checkout could not deliver: the wall holding, in a focused clone. Zero for a round recorded before the count existed.
   */
  refusedReads?: number;
  overBudget: number;
  reason: string | null;
  operations: ProgressProjectionAgencyOperation[];
};

/**
 * One finding as the record carries it, with the record's own word for how it stands.
 */
export type ProgressProjectionFinding = {
  round: number | null;
  description: string;
  severity: string;
  category: string;
  failureScenario: string;
  evidencePaths: string[];
  blocking: boolean;
  /**
   * 'outstanding' / 'fixed, unreviewed' / 'noted' -- the fold's words, not a reader's.
   */
  disposition: string;
};

/**
 * A session's rounds ledger folded for reading at planning time: which terminal state was reached, how it reads, and whether the row is clean. Carried for every session that has rounds, not only the in-flight one.
 */
export type ProgressProjectionVerification = {
  /**
   * VERIFIED, ISSUES_FOUND (unresolved at the cap) or REMEDIATED_AT_CAP; null while the loop is still open.
   */
  terminal: string | null;
  /**
   * The one sentence every loop reports its state in, written in Python.
   */
  headline: string;
  clean: boolean;
  verdict: string | null;
  rounds: number;
  stoppedAtRound: number | null;
  cap: number | null;
  verifierModel: string | null;
  verifierProvider: string | null;
  transport: string | null;
  agency: ProgressProjectionAgency;
  findings: ProgressProjectionFinding[];
  fixPaths: string[];
  /**
   * The latest round's non-blocking findings outside its NITS section, counted for a surface to show beside the verdict.
   */
  minor?: number;
  /**
   * The latest round's non-blocking findings under its NITS section, counted for a surface to show beside the verdict.
   */
  nits?: number;
};

export type ProgressProjectionSession = {
  number: number;
  /**
   * The number as the projection wrote it -- '015'. Python owns the padding rule; this is its result, not a shape a reader re-derives. Empty when an older router sent no name.
   */
  displayNumber: string;
  title: string;
  status: ProgressProjectionProjectedSessionStatus;
  iconKey: ProgressProjectionSessionStatus;
  inFlight: boolean;
  startedAt: string | null;
  completedAt: string | null;
  verificationVerdict: string | null;
  /**
   * The session closed having changed nothing, so it carries no verdict because there was nothing to verify. Present only on such a session.
   */
  noChange?: boolean;
  /**
   * The module(s) the session's declaration named, by slug. Present only for a session of a multi-module solution; a single-module row carries no member, so nothing changes in what it projects.
   */
  modules?: string[];
  /**
   * Retired with the focused checkout: nothing projects it now, and the Work Explorer lists sessions by status.
   */
  kind?: "focused" | "global";
  /**
   * Retired with the focused checkout's session kind: nothing projects it now.
   */
  module?: string;
  /**
   * Who the stop standing over this session is for, from the router's one reading of it: the engine clears it by answering again, the operator clears it, or -- under the pull, where the framework cannot see the engine -- whoever calls `next` next. Present only while a stop stands on an in-flight session; absent means nothing has stopped, or the run record could not be read (`tasksRefused` says which). A surface offers a person the engine's own command only where this does not say `engine`: two callers on one instruction is what the lease exists to catch and what a button should never invite.
   */
  stopActor?: "engine" | "operator" | "either";
  tasks: ProgressProjectionTask[];
  /**
   * Why the execution record could not be read. A refusal is not an empty task list: the view must say it cannot tell which step is open rather than render the last row it could read.
   */
  tasksRefused: string | null;
  verification: ProgressProjectionVerification | null;
  verificationRefused: string | null;
};

/**
 * python -m ai_router.progress --json (the Work Explorer's projection)
 */
export type ProgressProjection = {
  /**
   * The shape this payload is written in.
   */
  schemaVersion: 1;
  /**
   * When the projection was computed, local time with offset.
   */
  generatedAt: string;
  repository: ProgressProjectionRepository;
  sessions: ProgressProjectionSession[];
};
