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

// Set 048 Session 2: tri-state UAT/E2E enum per audit decision D4.
// `true` blocks close-out until checklist evidence present; `false`
// skips; `"suggested"` triggers an upfront positive-confirmation prompt
// from the AI orchestrator at session start when the session has UX
// scope (per operator override of audit Bias 4), with the choice
// recorded in activity-log as a `suggestion_disposition` entry.
export type TriStateFlag = boolean | "suggested";

// Set 048 Session 2: tier field per audit §3.6. Lightweight tier
// follows the same writer/Explorer/state-file process as Full but
// suppresses AI router runtime calls and auto-verification (per
// operator-locked premises P1-P4). Pre-Set-048 specs default to
// `"full"` when the field is absent.
export type SessionSetTier = "full" | "lightweight";

// Set 061 Session 1 (spec D1): how a Lightweight set's per-set
// verification runs (the Set 057 choice). `out-of-band-or-none` is the
// default — copyable review prompts, no runtime session growth.
// `dedicated-sessions` appends typed verification/remediation sessions
// to the ledger at runtime, which is what makes the Explorer's `N/M+`
// fraction warning meaningful. The spec-config field is the SEED only
// (the durable record is the activity-log `verification_mode` entry);
// the Explorer reads the seed because it is the cheap, always-present
// declarative signal. Inert on Full tier.
export type VerificationMode = "out-of-band-or-none" | "dedicated-sessions";

// Set 062 Session 1 (spec D1): the quiet verification-posture marker on
// Lightweight rows. "v?" = completed Mode-A set the Explorer cannot
// vouch for (no external-verification.md, no typed session); "v+" =
// Mode-B set whose work sessions are done but whose dedicated
// verification is still owed or in flight; "" = no marker (Full rows,
// terminal rows, note-bearing rows, verified rows — quiet is success).
export type VerificationMarkerGlyph = "v?" | "v+" | "";

// Set 062 Session 1 (spec D1): the persisted outcome of a completed
// `type: "verification"` session, lifted off the sessions[] ledger so
// the fraction tooltip can surface it ("Verification: VERIFIED
// (session 4)") without the renderer re-walking the ledger. `verdict`
// is the per-session verificationVerdict string ("VERIFIED" /
// "ISSUES_FOUND" / operator extensions); `sessionNumber` is the typed
// session's 1-indexed ledger number (null when the entry carries a
// malformed number).
export interface CompletedVerificationInfo {
  sessionNumber: number | null;
  verdict: string | null;
}

export interface SessionSetConfig {
  requiresUAT: TriStateFlag;
  requiresE2E: TriStateFlag;
  uatScope: string;
  tier: SessionSetTier;
  verificationMode: VerificationMode;
}

// Set 047 Session 5: prerequisites field schema landed by spec §3.3.
// Authored under the ``Session Set Configuration`` YAML block; the
// reader cross-references each set's prereqs against the target
// set's ``status`` to derive the ``blockedByPrereqs`` flag on
// SessionSet below. ``condition`` is an enum with one value today
// (``"complete"``) but is kept as a string field so a future spec
// can add (e.g.) ``"started"`` without rewriting consumers.
export interface SessionSetPrerequisite {
  slug: string;
  condition: "complete";
}

// Set 061 Session 2 (spec D3): one unsatisfied prerequisite, carried on
// the SessionSet record so the blocked marker's tooltip can name what
// the row is waiting on instead of collapsing to a boolean.
// `targetState` is the prereq target's bucketed state at scan time, or
// "unknown" when no scanned set matches the slug (typo / missing set —
// still blocking, per the Set 047 rule).
export interface UnsatisfiedPrerequisite {
  slug: string;
  condition: "complete";
  targetState: SessionState | "unknown";
}

export interface UatSummary {
  totalItems: number;
  pendingItems: number;
  e2eRefs: string[];
}

export interface OrchestratorInfo {
  engine?: string;
  provider?: string;
  model?: string;
  effort?: string;
  // Set 033 Session 1: check-out / check-in nested timestamps under the
  // orchestrator block. `checkedOutAt` is set on transition to
  // status: in-progress and preserved across same-holder re-attaches
  // (H4 identity = engine + provider). `lastActivityAt` is bumped on
  // every re-attach. Both are `null`able for tolerated reads of pre-S1
  // in-flight files; next same-holder start_session populates them.
  checkedOutAt?: string;
  lastActivityAt?: string;
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
  // Set 030 Session 5: true when this set's session-state.json needs
  // a one-shot migration to the next canonical schema. The tree
  // renders a "(needs migration)" badge and exposes a context-menu
  // migrate command. Default false; absent / broken state files do
  // not flag (the v3 reader's tolerant path already handles
  // missing-file display).
  //
  // Set 047 Session 3: extended to flag v3 → v4 migrations too. The
  // overall `needsMigration` boolean drives the badge (which is the
  // same colored chip regardless of target version); the
  // `migrationTargetSchemaVersion` field tells the ActionRegistry
  // which migrate command to surface in the right-click menu.
  needsMigration: boolean;
  // Set 047 Session 3: which canonical schema version is the
  // migration target. 3 → operator needs to run "Migrate to v3
  // schema" first (v1/v2 source, or broken-v3 with no sessions[]).
  // 4 → "Migrate to v4 schema" (canonical v3 with sessions[]). null
  // → no migration needed (already at v4 or no state file to act on).
  // Reading the badge: `needsMigration === (migrationTargetSchemaVersion !== null)`.
  migrationTargetSchemaVersion: 3 | 4 | null;
  // Set 050 Session 4 (Explorer UX revision): the raw `schemaVersion`
  // the set's state file carries on disk — the version it "ran under" —
  // or null when the field is absent / unreadable. Surfaced ONLY to
  // populate the unobtrusive asterisk's "Ran under schema v<N>" tooltip
  // that replaces the old intrusive "(needs migration)" row label
  // (operator non-goal: old schema is acceptable; no per-row nag). Not
  // a migration signal itself — `needsMigration` remains the driver.
  schemaVersionOnDisk: number | null;
  // Set 047 Session 5 (spec §3.3): prerequisites authored under the
  // set's ``spec.md`` ``Session Set Configuration`` block. `null`
  // when the field is absent (no dependency declared); empty array
  // when the spec wrote `prerequisites: []` explicitly. Carried on
  // the SessionSet record so the renderer can surface the slug list
  // in tooltips / decorations without re-parsing the spec.
  prerequisites: SessionSetPrerequisite[] | null;
  // Set 047 Session 5 (spec §3.3): derived by `readSessionSets` —
  // `true` iff at least one prerequisite's target set has a `status`
  // that does not satisfy the declared `condition`. A `complete`
  // condition is satisfied by `state === "complete"`; everything
  // else is "still blocking". Unknown prereq slugs (typo, missing
  // set) keep `blockedByPrereqs: true` so a typo doesn't silently
  // unblock the row. False when `prerequisites` is null or empty.
  // Set 061 Session 2 (spec D3): kept for compatibility; always equals
  // `unsatisfiedPrereqs.length > 0`.
  blockedByPrereqs: boolean;
  // Set 061 Session 2 (spec D3): the full unsatisfied list behind
  // `blockedByPrereqs` — slug, required condition, and the target's
  // current state ("unknown" for unresolvable slugs). Derived in-memory
  // by the same cross-reference pass; never persisted. Empty when the
  // row is unblocked.
  unsatisfiedPrereqs: UnsatisfiedPrerequisite[];
  // Set 061 Session 1 (spec D1): derived in-memory by `readSessionSets`
  // via `shouldRenderPlusFraction` — true ONLY when the set is
  // `tier: lightweight` AND `verificationMode: dedicated-sessions` AND
  // no `type: "verification"` session exists yet in the sessions[]
  // ledger. Drives the `N/M+` fraction suffix that warns the
  // denominator will grow when typed verification/remediation sessions
  // are appended. Never persisted (spec non-goal: no new state fields).
  plusFraction: boolean;
  // Set 062 Session 1 (spec D1): true iff `external-verification.md`
  // exists in the set directory — the Set 057 sanctioned out-of-band
  // verification record. Suppresses the `v?` marker on completed
  // Mode-A rows (the record exists; quiet is success). Derived at scan
  // time, never persisted. Session 2 also consults it for the
  // `Open external verification note` row action.
  externalVerificationNoteExists: boolean;
  // Set 062 Session 1 (spec D1): the completed `type: "verification"`
  // session's persisted verdict + ledger number (latest completed typed
  // session when more than one exists), or null when no completed
  // verification session is in the ledger. Drives the fraction
  // tooltip's "Verification: <verdict> (session N)" enrichment on
  // verified Mode-B rows. Derived from the normalized ledger, never
  // persisted.
  completedVerification: CompletedVerificationInfo | null;
  // Set 062 Session 1 (spec D1): the derived verification-posture
  // marker glyph for this row ("v?" / "v+" / ""). Computed by
  // `verificationMarkerFor` in utils/tierLegibility.ts at scan time
  // from (tier, verificationMode, ledger, note presence, row state).
  // Never persisted.
  verificationMarker: VerificationMarkerGlyph;
  // Set 077 Session 2 (Feature 1): the workspace's durable tier-choice
  // marker (`.dabbler/tier` under the set's root), or null when absent /
  // unreadable. Read ONCE per root by `readSessionSets` and carried on
  // every set from that root so the renderer can surface the
  // tier-mismatch advisory (marker disagrees with the spec's declared
  // tier — the manual-spec-edit drift the write-through cache cannot
  // cover). Derived at scan time, never persisted per-set.
  workspaceTierMarker: SessionSetTier | null;
}

// Set 052 S2: reconciled with the on-disk schema the router actually
// writes (`ai_router/metrics.py` → `router-metrics.jsonl`). The
// pre-Set-052 shape used `session_num`, a field the router never
// emits — it writes `session_number` — so the CSV export silently
// produced blank columns. `call_type` is carried so the reader can
// drop `adjudication` bookkeeping rows (no model, zero cost). Optional
// fields tolerate older/sparser lines.
export interface MetricsEntry {
  session_set: string;
  session_number: number;
  model: string;
  effort: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  timestamp: string;
  call_type?: string;
}

export interface CostSummary {
  totalCost: number;
  bySessionSet: Record<string, { sessions: number; cost: number; lastRun: string }>;
  byModel: Record<string, number>;
  dailyCosts: Array<{ date: string; cost: number }>;
}
