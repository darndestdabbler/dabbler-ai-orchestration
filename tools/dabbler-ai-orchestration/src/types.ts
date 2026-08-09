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

// Set 098 Session 1 (module-lifecycle verdict decision 5): the two
// module-lifecycle set kinds. `kind` is a small, optional,
// machine-readable identity for scaffolded plan/decomposition sets —
// set numbers are global and carry no meaning, so the attribute, never
// a magic number, is what tooling reads. Exactly two sanctioned
// consumers: Set 099's delete removal rule (only an unstarted
// plan/decomposition set with no execution artifacts may be removed
// outright) and human/tooling legibility. It must NOT grow into a
// workflow/state schema. Absent means ordinary work set — every
// pre-098 spec is untouched and valid.
export type SessionSetKind = "plan" | "decomposition";

export interface SessionSetConfig {
  requiresUAT: TriStateFlag;
  requiresE2E: TriStateFlag;
  uatScope: string;
  // Set 087 Session 1: the spec's declared `module:` key — the RAW value
  // as authored, before validation against `docs/modules.yaml`. A
  // grouping attribute only, never part of set identity (the Set 087
  // invariant: names stay globally unique; `RowPayload.slug` and
  // `findSetBySlug` are unchanged on purpose). Null when the spec
  // declares no module. The validated result lives on
  // `SessionSet.module` / `SessionSet.moduleTitle`; the raw value is
  // kept here so later sessions can surface a declared-but-unknown slug
  // instead of silently reading it as "no module".
  module: string | null;
  // Set 098 Session 1: the spec's declared `kind:` key — the RAW value
  // as authored (the `module` posture above), kept so later surfaces
  // can show a declared-but-unknown kind instead of silently reading it
  // as an ordinary work set. Undefined when the spec declares no kind
  // (every pre-098 spec). The validated enum lives on `SessionSet.kind`.
  kind?: string;
}

// Set 087 Session 1 (routed architecture ruling, saved raw at
// docs/session-sets/087-.../s1-collision-check-architecture.json): the
// fail-loud duplicate-set-name error attached to the one merged row the
// Explorer shows for a collided name. Undefined on every non-collided
// set, so a workspace with globally-unique names renders byte-identically
// to pre-087. Session 2 renders the affordance (badge/tooltip); Session 1
// ships the data only.
export interface DuplicateNameError {
  name: string;
  // The winning copy's dir — always a member of `conflictingDirs`.
  chosenDir: string;
  // One dir per DISTINCT logical set sharing the name (legitimate
  // main-checkout/worktree copies of the same set collapse to one
  // entry), sorted.
  conflictingDirs: string[];
}

// The diagnostics-level record for one collided name, returned by
// `readAllSessionSetsWithDiagnostics().collisions` so a future surface
// (throttled notification, status item) can report without re-scanning.
export interface DuplicateNameCollision extends DuplicateNameError {
  candidates: Array<{
    dir: string;
    familyId: string;
    state: SessionState;
    lastTouched: string | null;
  }>;
}

// Set 087 Session 1: one entry of `docs/modules.yaml` (the module
// manifest — recommendation §2.4). `slug` is the machine identity of the
// module; `title` is what the Explorer displays (defaults to the slug);
// `codeRoots` are the code paths the module owns (ownership enforcement
// is later-phase machinery — carried, not enforced, in Phase 1);
// `planPath` locates the module's project plan; `touches` names the
// modules an integration module is sanctioned to edit across. Display
// order in the Explorer = manifest file order.
export interface ModuleManifestEntry {
  slug: string;
  title: string;
  codeRoots: string[];
  planPath: string | null;
  touches: string[];
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
  // Set 087 Session 1: the VALIDATED module attribution — the spec's
  // `module:` key when it names a `docs/modules.yaml` slug, else null
  // (the implicit module: absent manifest, absent key, or a declared
  // slug the manifest doesn't know). `moduleTitle` is the manifest
  // entry's display title (null exactly when `module` is null). Grouping
  // attributes only — never identity; every name-keyed lookup
  // (`findSetBySlug`, prerequisite resolution, the cross-root merge)
  // stays keyed on `name` alone.
  module: string | null;
  moduleTitle: string | null;
  // Set 087 Session 2 (routed ruling Q3, saved raw at
  // s2-explorer-render-architecture.json): the validated module's index
  // in its root's docs/modules.yaml `modules:` list — the Explorer's
  // module DISPLAY order (manifest file order). Stamped at scan time so
  // the view-model's `groupByModule(all)` stays pure and multi-root
  // merges carry their ordering with the data. Null exactly when
  // `module` is null (the implicit module, which always sorts last).
  moduleOrder: number | null;
  // Set 098 Session 1: the VALIDATED lifecycle-set kind — the spec's
  // `kind:` key when it names a `SessionSetKind` member, else undefined
  // (absent key, or a declared-but-unknown value that warned at scan
  // time and degrades to an ordinary work set). Undefined on every
  // ordinary work set, so a workspace with no lifecycle sets renders
  // byte-identically to pre-098 — no rendering change ships in this
  // set (Set 100 owns kind-aware rows).
  kind?: SessionSetKind;
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
  // Set 110 Session 2 (operator ask 1, 2026-08-04): the normalized
  // `sessions[]` ledger, surfaced so the Work Explorer's FOURTH tree
  // level (the sessions inside a set) can be built from memory. The
  // scanner already parses and normalizes this array while reading the
  // state file and then discards it — carrying it costs **no additional
  // disk read**, which is what keeps the fourth level off the startup
  // path S1 measured. Empty array when the state file is unreadable or
  // carries no usable ledger. A set with NO state file is not one of
  // those cases: `ensureSessionStateFile` lazily synthesizes a
  // not-started state from the spec, so such a set lists its PLANNED
  // sessions, all `not-started`. Entries are narrowed to
  // the three display fields; per-session extras the ledger carries
  // (`type`, `verificationVerdict`, …) are deliberately NOT lifted here
  // — their consumers read the ledger through `tierLegibility`.
  //
  // Optional for the same reason `workflowState` and `duplicateNameError`
  // are: fixture-shaped records built by the Layer-2 suite need no update,
  // and absent reads identically to empty (no session rows). The single
  // production construction site — `readSessionSets` in `fileSystem.ts` —
  // always populates it.
  sessions?: SessionRecord[];
  // Set 087 Session 1: the fail-loud duplicate-set-name flag, set by
  // `readAllSessionSetsWithDiagnostics` on the ONE merged row shown for
  // a collided name. Undefined everywhere else (and always on the
  // per-root `readSessionSets` output — collisions are a cross-root
  // property). Optional so the no-collision path stays byte-identical
  // to pre-087 and fixture-shaped records need no update.
  duplicateNameError?: DuplicateNameError;
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
