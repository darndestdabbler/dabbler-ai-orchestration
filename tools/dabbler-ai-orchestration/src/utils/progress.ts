// Normalized progress view over session-state.json — v3 + v2 read.
//
// TypeScript mirror of `ai_router/progress.py`. Both helpers are the
// canonical reader path for session-set progress state; every consumer
// in the extension (tree provider, badge logic, count derivation) goes
// through `getProgress()` rather than reading the legacy progress
// triple (currentSession / totalSessions / completedSessions) directly.
// The read-side v2 normalization synthesizes a v3-shaped `sessions[]`
// from a v2 snapshot so callers never branch on schema version.
//
// Background: Set 030 (the proposal at
// `docs/proposals/2026-05-17-session-state-sessions-ledger-v3.md`)
// collapses the v2 progress triple into a single canonical
// `sessions[]` ledger. This module is Session 1 of that migration.
// Reader migration (i.e., extension call-sites moving onto this
// helper) ships in Session 3.

import * as fs from "fs";
import {
  ProgressView,
  SessionRecord,
  SessionStatus,
} from "../types";

export const SCHEMA_VERSION_V3 = 3 as const;
// Set 047 Session 2: v4 schema constant. v4 derives top-level state
// (currentSession, totalSessions, completedSessions, orchestrator,
// startedAt, completedAt, verificationVerdict, lifecycleState) from a
// per-session sessions[] ledger where each entry gains its own
// startedAt / completedAt / orchestrator / verificationVerdict fields.
// The Session-2 reader-first shim (`normalizeToV4Shape`) accepts
// v1/v2/v3/v4 input and returns a normalized v4 read-view object with
// BOTH per-session metadata AND derived top-level fields so existing
// readers (which still consume top-level fields like `sd.orchestrator`,
// `sd.startedAt`, `sd.completedAt`, `sd.verificationVerdict`) work
// transparently against v4 writes from Sessions 4-5. Mirrors the
// Python constant in `ai_router/progress.py`.
export const SCHEMA_VERSION_V4 = 4 as const;

export const SESSION_STATUS_NOT_STARTED: SessionStatus = "not-started";
export const SESSION_STATUS_IN_PROGRESS: SessionStatus = "in-progress";
export const SESSION_STATUS_COMPLETE: SessionStatus = "complete";
export const SESSION_STATUS_CANCELLED: SessionStatus = "cancelled";

// Session-level statuses accepted by validators. NOTE: "cancelled"
// is deliberately excluded — per the proposal and spec decisions
// D11/D12, per-session cancellation is reserved for a future schema.
// Set 030 only exercises set-level cancellation (CANCELLED.md plus
// top-level status="cancelled"). Re-introduce here once a future
// spec defines how cancelled sessions interact with rules 4-7.
export const SESSION_STATUSES: ReadonlyArray<SessionStatus> = [
  SESSION_STATUS_NOT_STARTED,
  SESSION_STATUS_IN_PROGRESS,
  SESSION_STATUS_COMPLETE,
];

// Top-level statuses keep "cancelled" because set-level cancellation
// is a first-class state today (filename-marker driven).
export const TOP_LEVEL_STATUSES: ReadonlyArray<string> = [
  "not-started",
  "in-progress",
  "complete",
  "cancelled",
];

export const LIFECYCLE_STATE_WORK_IN_PROGRESS = "work_in_progress";
export const LIFECYCLE_STATE_CLOSED = "closed";

// Tolerated on read, canonicalized to `complete`. Mirrors
// `_STATUS_ALIASES` in Python and the extension's existing
// `STATUS_ALIASES` in `sessionState.ts` so a hand-written file with a
// past-participle token never trips the validators.
const STATUS_ALIASES: Record<string, SessionStatus> = {
  completed: SESSION_STATUS_COMPLETE,
  done: SESSION_STATUS_COMPLETE,
};

export function canonicalizeStatus(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return STATUS_ALIASES[value] ?? value;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class SessionStateInvariantError extends Error {
  public readonly rule: number;
  constructor(rule: number, message: string) {
    super(`[v3 invariant rule ${rule}] ${message}`);
    this.rule = rule;
    this.name = "SessionStateInvariantError";
  }
}

// ---------------------------------------------------------------------------
// Spec.md title extraction (regex-first)
// ---------------------------------------------------------------------------

// Matches `### Session 1 of 5: Title` (the "of N" segment is
// optional to tolerate older specs that omit it).
const SESSION_HEADING_RE = /^###\s+Session\s+(\d+)(?:\s+of\s+\d+)?\s*:\s*(.+?)\s*$/gm;

export function extractSessionTitlesFromSpec(specMdPath: string): Array<{ number: number; title: string }> {
  let text: string;
  try {
    text = fs.readFileSync(specMdPath, "utf-8");
  } catch {
    return [];
  }
  const out: Array<{ number: number; title: string }> = [];
  let m: RegExpExecArray | null;
  // Reset state because the regex is /g.
  SESSION_HEADING_RE.lastIndex = 0;
  while ((m = SESSION_HEADING_RE.exec(text)) !== null) {
    out.push({ number: parseInt(m[1], 10), title: m[2].trim() });
  }
  out.sort((a, b) => a.number - b.number);
  return out;
}

// ---------------------------------------------------------------------------
// v2 -> v3 read-time synthesis
// ---------------------------------------------------------------------------

// Per memory `feedback_default_not_started_evidence_to_escalate`:
// every session defaults to "not-started". We only escalate to
// "complete" when the v2 completedSessions[] array lists the number
// AS A STRICT POSITIVE INTEGER (not bool, not float), and to
// "in-progress" when currentSession is set AND top-level status is
// "in-progress" AND the session is not already complete.
//
// Round-A verifier fix: do not force-promote sessions when top-level
// status is "complete" — let rule 7 fail loud on the contradiction.
function isStrictPositiveInt(v: any): boolean {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v > 0 &&
    typeof v !== "boolean"
  );
}

export function synthesizeV3FromV2(state: any, specMdPath: string): any {
  if (state === null || state === undefined) {
    throw new TypeError("synthesizeV3FromV2: state is null");
  }

  // Strict positive-int filtering. JavaScript doesn't conflate bool
  // with int the way Python does, but it does treat all numbers as
  // floats — Number.isInteger(1.0) === true so 1.0 looks like 1.
  // Be defensive at the boundary.
  const legacyCurrent = isStrictPositiveInt(state.currentSession)
    ? (state.currentSession as number)
    : null;
  const legacyTotal = isStrictPositiveInt(state.totalSessions)
    ? (state.totalSessions as number)
    : 0;
  const legacyCompleted: number[] = Array.isArray(state.completedSessions)
    ? state.completedSessions.filter((n: any) => isStrictPositiveInt(n))
    : [];
  const topStatusRaw = state.status ?? null;
  const topStatus = canonicalizeStatus(topStatusRaw);

  const titles = extractSessionTitlesFromSpec(specMdPath);
  const titlesByNumber = new Map<number, string>();
  for (const t of titles) {
    titlesByNumber.set(t.number, t.title);
  }

  // Figure out total: prefer explicit, else largest known number, else 0.
  //
  // Set 046 Session 2: ``legacyCurrent`` is intentionally excluded
  // from the candidate set. Including it inflated the synthesized
  // total to 1 for the plan-less in-progress shape the Set 046 writer
  // produces (``totalSessions: null``, ``currentSession: 1``,
  // ``completedSessions: []``, no ``sessions[]``) — which made the
  // Explorer render ``0/1`` instead of the intended ``0/?``. Mirrors
  // the same change in ai_router/progress.py.
  let total = legacyTotal;
  for (const n of titlesByNumber.keys()) {
    if (n > total) total = n;
  }
  for (const n of legacyCompleted) {
    if (n > total) total = n;
  }

  const completedSet = new Set(legacyCompleted);
  const sessions: SessionRecord[] = [];
  for (let n = 1; n <= total; n++) {
    const title = titlesByNumber.get(n) ?? `Session ${n}`;
    let status: SessionStatus;
    if (completedSet.has(n)) {
      status = SESSION_STATUS_COMPLETE;
    } else if (
      legacyCurrent === n &&
      topStatus === "in-progress" &&
      !completedSet.has(n)
    ) {
      status = SESSION_STATUS_IN_PROGRESS;
    } else {
      // Default-to-not-started. Earlier draft force-promoted every
      // session to "complete" when top-level was "complete", which
      // contradicts "fail loud, never silently recover": a v2 file
      // with top-level=complete but completedSessions=[] is
      // internally inconsistent, and the synthesizer should let
      // rule 7 expose that contradiction rather than coerce it.
      status = SESSION_STATUS_NOT_STARTED;
    }
    sessions.push({ number: n, title, status });
  }

  const out: any = { ...state };
  out.schemaVersion = SCHEMA_VERSION_V3;
  out.sessions = sessions;
  if (topStatus !== null && topStatus !== topStatusRaw) {
    out.status = topStatus;
  }
  return out;
}

// ---------------------------------------------------------------------------
// v3/v4 -> v4 read-time normalization (Set 047 Session 2)
// ---------------------------------------------------------------------------

// v4 per-session metadata keys promoted/derived by the normalize shim.
// Centralized so the Python and TypeScript implementations stay in
// lockstep on which fields move from top-level to per-session in v4.
const V4_PER_SESSION_KEYS = [
  "startedAt",
  "completedAt",
  "orchestrator",
  "verificationVerdict",
] as const;

// Return `state` in canonical v4 read-view shape.
//
// Accepts v1/v2/v3/v4 input. Returns a NEW object; does NOT mutate the
// input. The returned object carries:
//
// - `schemaVersion: 4`
// - `sessionSetName` (preserved)
// - `sessions[]` with v4 per-session metadata (each entry gains
//   `startedAt` / `completedAt` / `orchestrator` /
//   `verificationVerdict` defaulted to `null` when absent)
// - `status` (canonicalized)
// - Derived legacy top-level fields (`currentSession`,
//   `totalSessions`, `completedSessions`, `orchestrator`,
//   `startedAt`, `completedAt`, `verificationVerdict`,
//   `lifecycleState`) so existing readers that still consume the
//   top-level fields (most notably the Explorer's `readSessionSets`)
//   work transparently against v4 writes.
//
// The TWO directions of derivation mirror the Python helper in
// `ai_router/progress.py`:
//
// - v3 input → v4: top-level `orchestrator` / `startedAt` /
//   `completedAt` / `verificationVerdict` are promoted to the
//   in-progress session (or, if none, the most-recently-completed
//   session) so per-session metadata is populated. The top-level
//   fields are then re-derived from the per-session ones (no-op on
//   pure v3 input).
// - v4 input → v4: per-session metadata is preserved; top-level
//   fields are derived FROM the per-session metadata. This is what
//   lets a v3-era reader consume a v4 file unchanged.
//
// Per the Session-1 audit verdict (Group A1): the shim is the
// reader-first phase; the migrator (Session 3) and the writer flip
// (Sessions 4-5) both depend on this contract.
export function normalizeToV4Shape(state: any, specMdPath: string): any {
  if (state === null || state === undefined) {
    throw new TypeError("normalizeToV4Shape: state is null");
  }

  // Step 1: ensure sessions[] is present (synthesize from v2 if missing).
  let v3State: any;
  if (state.sessions === undefined || state.sessions === null) {
    v3State = synthesizeV3FromV2(state, specMdPath);
  } else {
    v3State = { ...state };
  }

  const rawSessions = v3State.sessions ?? [];
  if (!Array.isArray(rawSessions)) {
    throw new SessionStateInvariantError(
      1,
      `sessions[] must be an array, got ${typeof rawSessions}`,
    );
  }

  // Step 2: build v4 per-session records. Each entry gets the v4
  // metadata fields defaulted to null when absent so downstream code
  // can rely on key presence. We copy each entry rather than
  // mutating in place.
  const sessionsV4: any[] = [];
  for (const entry of rawSessions) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      // Defer to validator; this branch shouldn't normally fire
      // because getProgress would have rejected earlier. Be permissive
      // here so callers can validate at their own layer.
      sessionsV4.push({ number: null, title: null, status: null });
      continue;
    }
    const sv4: any = { ...entry };
    // Canonicalize per-session status BEFORE downstream derivation
    // reads it. Aliased values (`"completed"` / `"done"`) must
    // collapse to `"complete"` here so the promotion and the
    // legacy-top-level derivation below match those entries against
    // SESSION_STATUS_COMPLETE. Without this, a v3/v4 file authored
    // with the alias form would bypass the derivation entirely (a
    // hand-edited "completed" session would not appear in derived
    // `completedSessions[]`).
    sv4.status = canonicalizeStatus(sv4.status);
    for (const k of V4_PER_SESSION_KEYS) {
      if (sv4[k] === undefined) sv4[k] = null;
    }
    sessionsV4.push(sv4);
  }

  const schemaVersionIn = state.schemaVersion;
  const isV4Input =
    typeof schemaVersionIn === "number" && schemaVersionIn >= SCHEMA_VERSION_V4;

  // Step 3: on non-v4 input, promote top-level fields to per-session
  // records that don't already carry the metadata. v4 inputs skip
  // promotion because their per-session fields are authoritative.
  if (!isV4Input) {
    const topOrchestrator = state.orchestrator ?? null;
    const topStarted = state.startedAt ?? null;
    const topCompleted = state.completedAt ?? null;
    const topVerdict = state.verificationVerdict ?? null;

    const inProgress = sessionsV4.filter((s) => s.status === SESSION_STATUS_IN_PROGRESS);
    const completed = sessionsV4.filter((s) => s.status === SESSION_STATUS_COMPLETE);

    if (inProgress.length > 0) {
      const tgt = inProgress[0];
      if (tgt.orchestrator === null && topOrchestrator !== null) {
        tgt.orchestrator = topOrchestrator;
      }
      if (tgt.startedAt === null && topStarted !== null) {
        tgt.startedAt = topStarted;
      }
    }

    if (completed.length > 0) {
      const lastCompleted = completed[completed.length - 1];
      if (lastCompleted.completedAt === null && topCompleted !== null) {
        lastCompleted.completedAt = topCompleted;
      }
      if (lastCompleted.verificationVerdict === null && topVerdict !== null) {
        lastCompleted.verificationVerdict = topVerdict;
      }
      // When no in-progress session, the orchestrator block on a v3
      // close-out snapshot belongs with the most recent completed
      // session (the orchestrator that closed it). Same goes for
      // `startedAt` — without this branch, a between-sessions or
      // all-complete snapshot would lose the top-level `startedAt`
      // entirely (no in-progress session to receive it, and the v4
      // derivation step has nowhere to re-discover it).
      if (inProgress.length === 0) {
        if (lastCompleted.orchestrator === null && topOrchestrator !== null) {
          lastCompleted.orchestrator = topOrchestrator;
        }
        if (lastCompleted.startedAt === null && topStarted !== null) {
          lastCompleted.startedAt = topStarted;
        }
      }
    }
  }

  // Step 4: derive legacy top-level fields from the per-session
  // ledger. This is the v4 reader contract — top-level fields are
  // DERIVED, never independently maintained.
  const completedNumbers = sessionsV4
    .filter((s) => s.status === SESSION_STATUS_COMPLETE && Number.isInteger(s.number))
    .map((s) => s.number);
  const inProgressList = sessionsV4.filter(
    (s) => s.status === SESSION_STATUS_IN_PROGRESS,
  );
  const currentSession =
    inProgressList.length > 0 && Number.isInteger(inProgressList[0].number)
      ? inProgressList[0].number
      : null;

  let derivedOrchestrator: unknown = null;
  let derivedStarted: unknown = null;
  let derivedCompleted: unknown = null;
  let derivedVerdict: unknown = null;

  if (inProgressList.length > 0) {
    derivedOrchestrator = inProgressList[0].orchestrator ?? null;
    derivedStarted = inProgressList[0].startedAt ?? null;
  }

  const completedV4 = sessionsV4.filter((s) => s.status === SESSION_STATUS_COMPLETE);
  if (completedV4.length > 0) {
    const lastCompleted = completedV4[completedV4.length - 1];
    derivedCompleted = lastCompleted.completedAt ?? null;
    derivedVerdict = lastCompleted.verificationVerdict ?? null;
    if (derivedOrchestrator === null) {
      derivedOrchestrator = lastCompleted.orchestrator ?? null;
    }
    if (derivedStarted === null) {
      // Prefer the most-recently-completed session's startedAt over
      // the earliest session's. Earlier draft scanned `sessionsV4`
      // from the start, which on a v4 between-sessions snapshot
      // would return session 1's startedAt (typically the set's
      // open time, not the active session boundary). Scanning
      // completed sessions in reverse gives the most current
      // boundary timestamp.
      for (let i = completedV4.length - 1; i >= 0; i--) {
        const s = completedV4[i];
        if (s.startedAt) {
          derivedStarted = s.startedAt;
          break;
        }
      }
    }
  }

  const canonicalTopStatus = canonicalizeStatus(state.status ?? null);

  const out: any = {
    schemaVersion: SCHEMA_VERSION_V4,
    sessionSetName: state.sessionSetName ?? null,
    sessions: sessionsV4,
    status: canonicalTopStatus,
    currentSession,
    totalSessions: sessionsV4.length,
    completedSessions: completedNumbers,
    orchestrator: derivedOrchestrator,
    startedAt: derivedStarted,
    completedAt: derivedCompleted,
    verificationVerdict: derivedVerdict,
    lifecycleState: state.lifecycleState ?? null,
  };
  // Preserve passthrough fields that callers (cancellation reader,
  // forceClosed display, Set 035 preCancelStatus) still consume from
  // the top level. These are NOT derived from sessions[]; they ride
  // along as opaque values until a future schema folds them in too.
  for (const passthroughKey of ["preCancelStatus", "forceClosed"]) {
    if (passthroughKey in state) {
      out[passthroughKey] = state[passthroughKey];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// getProgress: the one reader path
// ---------------------------------------------------------------------------

// Single reader entry point for any session-state.json shape.
//
// This is the canonical reader path application code (the tree
// provider, count derivation, badge logic, drift guards) MUST use
// under D13. Branches v2/v3 internally so callers never touch the
// legacy currentSession / totalSessions / completedSessions triple
// directly.
//
// For v3 inputs (`sessions[]` present), calls `getProgress` directly.
// For v2 inputs, runs `synthesizeV3FromV2` first, then validates via
// `getProgress`. The `specMdPath` is only consulted on the v2 branch
// — pass any path on v3 inputs; missing/unreadable spec.md just falls
// back to "Session N" titles.
//
// Raises `SessionStateInvariantError` on invariant violation.
// Application readers that want defensive fallback (e.g. degrade to
// in-progress rather than throw) should wrap the call in try/catch.
//
// Set 047 Session 2: routed through `normalizeToV4Shape` so a
// v4-shaped file (sessions[] entries carrying per-session startedAt /
// completedAt / orchestrator / verificationVerdict) reads identically
// to a v3 file. The normalize shim is invoked even for v3 inputs so
// the v4 per-session enrichment is available to any consumer that
// fetches the normalized object directly.
export function readProgress(state: any, specMdPath: string): ProgressView {
  if (state === null || state === undefined) {
    throw new TypeError("readProgress: state is null");
  }
  const normalized = normalizeToV4Shape(state, specMdPath);
  return getProgress(normalized);
}

export function getProgress(state: any): ProgressView {
  if (state === null || state === undefined) {
    throw new TypeError("getProgress: state is null");
  }

  const rawSessions = state.sessions;
  if (rawSessions === undefined || rawSessions === null) {
    throw new SessionStateInvariantError(
      1,
      "sessions[] is missing; synthesize v3 from v2 first or pass a v3 state",
    );
  }

  const sessions = parseSessions(rawSessions);
  const topStatus = canonicalizeStatus(state.status ?? null);
  const lifecycleState = state.lifecycleState ?? null;

  validateInvariants(sessions, topStatus, lifecycleState);

  const completedNumbers = sessions
    .filter((s) => s.status === SESSION_STATUS_COMPLETE)
    .map((s) => s.number);
  const inProgress = sessions.filter((s) => s.status === SESSION_STATUS_IN_PROGRESS);
  const currentSession = inProgress.length > 0 ? inProgress[0].number : null;
  const notStarted = sessions.filter((s) => s.status === SESSION_STATUS_NOT_STARTED);
  const nextSession = notStarted.length > 0 ? notStarted[0].number : null;
  const isBetweenSessions =
    currentSession === null && completedNumbers.length >= 1 && nextSession !== null;

  return {
    sessions,
    totalSessions: sessions.length,
    completedSessions: completedNumbers,
    currentSession,
    nextSession,
    isBetweenSessions,
  };
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateInvariants(
  sessions: SessionRecord[],
  topStatus: string | null,
  lifecycleState: string | null,
): void {
  // Rule 1: non-empty.
  if (sessions.length === 0) {
    throw new SessionStateInvariantError(1, "sessions[] must be non-empty");
  }

  // Rule 2: positive ints, unique, contiguous starting at 1 (per spec
  // D12 "strict sequential invariant"). Earlier draft only checked
  // ascending, which silently accepted broken ledgers like [1, 3].
  const seen = new Set<number>();
  let expected = 1;
  for (const s of sessions) {
    if (!Number.isInteger(s.number) || typeof s.number === "boolean") {
      throw new SessionStateInvariantError(
        2,
        `session number must be an integer (not bool/float/string); got ${JSON.stringify(s.number)} of type ${typeof s.number}`,
      );
    }
    if (s.number <= 0) {
      throw new SessionStateInvariantError(
        2,
        `session number must be positive, got ${s.number}`,
      );
    }
    if (seen.has(s.number)) {
      throw new SessionStateInvariantError(
        2,
        `duplicate session number: ${s.number}`,
      );
    }
    if (s.number !== expected) {
      throw new SessionStateInvariantError(
        2,
        `session numbers must be contiguous starting at 1; expected ${expected} next, got ${s.number}`,
      );
    }
    seen.add(s.number);
    expected = s.number + 1;
    if (!SESSION_STATUSES.includes(s.status)) {
      throw new SessionStateInvariantError(
        2,
        `session ${s.number} has unknown status ${JSON.stringify(s.status)}; ` +
          `expected one of ${SESSION_STATUSES.join(", ")}`,
      );
    }
  }

  // Rule 3: at most one in-progress.
  const inProgress = sessions.filter((s) => s.status === SESSION_STATUS_IN_PROGRESS);
  if (inProgress.length > 1) {
    throw new SessionStateInvariantError(
      3,
      `only one session may be in-progress at a time; found: ${inProgress.map((s) => s.number).join(", ")}`,
    );
  }

  // Rule 4: complete must form a contiguous prefix.
  let blockerNumber: number | null = null;
  let blockerStatus: SessionStatus | null = null;
  for (const s of sessions) {
    if (s.status === SESSION_STATUS_NOT_STARTED || s.status === SESSION_STATUS_IN_PROGRESS) {
      if (blockerNumber === null) {
        blockerNumber = s.number;
        blockerStatus = s.status;
      }
    } else if (s.status === SESSION_STATUS_COMPLETE && blockerNumber !== null) {
      throw new SessionStateInvariantError(
        4,
        `session ${s.number} is complete but earlier session ${blockerNumber} ` +
          `is ${JSON.stringify(blockerStatus)}; complete sessions must form a contiguous prefix`,
      );
    }
  }

  // Rule 8 ALWAYS applies — even when topStatus is null — because a
  // state with lifecycleState='closed' and missing top-level status
  // is internally inconsistent regardless of whether the caller wants
  // to validate the rest of the top-level rules.
  if (lifecycleState === LIFECYCLE_STATE_CLOSED) {
    if (topStatus !== "complete" && topStatus !== "cancelled") {
      throw new SessionStateInvariantError(
        8,
        `lifecycleState 'closed' requires status 'complete' or 'cancelled', ` +
          `got ${JSON.stringify(topStatus)}`,
      );
    }
  }

  if (topStatus === null) {
    return;
  }

  if (!TOP_LEVEL_STATUSES.includes(topStatus)) {
    // Unknown top-level status is a shape/enum error, not a violation
    // of rules 5/6/7 specifically. Report as rule 2 (structural).
    throw new SessionStateInvariantError(
      2,
      `top-level status must be one of ${TOP_LEVEL_STATUSES.join(", ")}, ` +
        `got ${JSON.stringify(topStatus)}`,
    );
  }

  // Rule 5: not-started top-level → all sessions not-started.
  if (topStatus === "not-started") {
    const offenders = sessions
      .filter((s) => s.status !== SESSION_STATUS_NOT_STARTED)
      .map((s) => s.number);
    if (offenders.length > 0) {
      throw new SessionStateInvariantError(
        5,
        `top-level status 'not-started' but sessions [${offenders.join(", ")}] ` +
          `are not 'not-started'`,
      );
    }
  }

  // Rule 7: complete top-level → all sessions complete.
  if (topStatus === "complete") {
    const offenders = sessions
      .filter((s) => s.status !== SESSION_STATUS_COMPLETE)
      .map((s) => s.number);
    if (offenders.length > 0) {
      throw new SessionStateInvariantError(
        7,
        `top-level status 'complete' but sessions [${offenders.join(", ")}] ` +
          `are not 'complete'`,
      );
    }
  }

  // Rule 6: in-progress top-level → exactly one in-progress OR
  // between-sessions (>=1 complete, >=1 not-started, 0 in-progress).
  if (topStatus === "in-progress") {
    const completeCount = sessions.filter((s) => s.status === SESSION_STATUS_COMPLETE).length;
    const notStartedCount = sessions.filter(
      (s) => s.status === SESSION_STATUS_NOT_STARTED,
    ).length;
    const inProgressCount = inProgress.length;
    const okActive = inProgressCount === 1;
    const okBetween =
      inProgressCount === 0 && completeCount >= 1 && notStartedCount >= 1;
    if (!okActive && !okBetween) {
      throw new SessionStateInvariantError(
        6,
        "top-level status 'in-progress' requires either exactly one in-progress " +
          "session or a between-sessions state (>=1 complete, >=1 not-started, " +
          `0 in-progress); got in_progress=${inProgressCount}, ` +
          `complete=${completeCount}, not_started=${notStartedCount}`,
      );
    }
  }

  // Rule 8 hoisted above the topStatus null-guard so it always fires.
  // No duplicate check needed here.
}

function parseSessions(raw: any): SessionRecord[] {
  if (!Array.isArray(raw)) {
    throw new SessionStateInvariantError(
      1,
      `sessions[] must be an array, got ${typeof raw}`,
    );
  }
  const out: SessionRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new SessionStateInvariantError(
        2,
        `sessions[${i}] must be an object, got ${Array.isArray(entry) ? "array" : typeof entry}`,
      );
    }
    if (!("number" in entry)) {
      throw new SessionStateInvariantError(
        2,
        `sessions[${i}] missing required key 'number'`,
      );
    }
    if (!("status" in entry)) {
      throw new SessionStateInvariantError(
        2,
        `sessions[${i}] missing required key 'status'`,
      );
    }
    const status = canonicalizeStatus(entry.status) ?? entry.status;
    out.push({
      number: entry.number,
      title: entry.title ?? `Session ${entry.number}`,
      status: status as SessionStatus,
    });
  }
  return out;
}
