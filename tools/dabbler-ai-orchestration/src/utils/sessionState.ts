import * as fs from "fs";
import * as path from "path";

import {
  SCHEMA_VERSION_V4,
  healTitle,
  specTitleMapFromText,
} from "./progress";

// Canonical status strings carried by session-state.json under the Set 7
// invariant. The Python side defines the same set in
// ai_router/session_state.py; the two writers must stay in lockstep.
export type CanonicalStatus =
  | "not-started"
  | "in-progress"
  | "complete"
  | "cancelled";

// Set 047 Session 5 (TS) / Session 4 (Python): writers emit canonical
// v4 on-disk shape per spec §3.1. Top-level state (currentSession,
// totalSessions, completedSessions, orchestrator, startedAt,
// completedAt, verificationVerdict, lifecycleState) is dropped on disk
// and derived at read time via normalizeToV4Shape. Each session entry
// carries per-session startedAt / completedAt / orchestrator /
// verificationVerdict.
const SCHEMA_VERSION = SCHEMA_VERSION_V4;
const SESSION_STATE_FILENAME = "session-state.json";

// Per-session ledger entry under the v4 contract. Mirrors the entry
// shape produced by _build_sessions_array + _apply_v4_per_session_metadata
// in ai_router/session_state.py. Per-session metadata fields default
// to null for not-started / freshly-promoted sessions; the writers
// (register_session_start / mark_session_complete on the Python side)
// override them at the boundary they own.
type LazySessionRecord = {
  number: number;
  title: string;
  status: "not-started" | "in-progress" | "complete";
  startedAt: string | null;
  completedAt: string | null;
  orchestrator: Record<string, unknown> | null;
  verificationVerdict: string | null;
};

function buildSessions(
  totalSessions: number | null,
  topStatus: "not-started" | "in-progress" | "complete",
  specTitles: Map<number, string>,
): LazySessionRecord[] | undefined {
  // Mirror of _not_started_payload / _backfill_payload in Python
  // session_state.py. Per rule 1, sessions[] is omitted when
  // totalSessions is unknown — "any set with a known plan" gets the
  // array; an unknown-plan set legitimately has no ledger.
  if (totalSessions === null || totalSessions <= 0) return undefined;
  const out: LazySessionRecord[] = [];
  for (let n = 1; n <= totalSessions; n++) {
    let status: LazySessionRecord["status"] = "not-started";
    if (topStatus === "complete") {
      status = "complete";
    } else if (topStatus === "in-progress" && n === 1) {
      // Conservative inference: when only activity-log.json is present,
      // we know SOME work has begun but not which session. Default
      // session 1 to in-progress so the snapshot satisfies rule 6.
      status = "in-progress";
    }
    // Set 115 S1: the spec heading, resolved through the SAME rule the
    // Python writer uses. This module already computed the title map and
    // then threw it away, hardcoding `Session ${n}` — which is how the
    // generic label reached disk in the first place, and (because title
    // resolution puts the stored ledger first) why it then stuck.
    out.push({
      number: n,
      title: healTitle(null, n, specTitles) ?? `Session ${n}`,
      status,
      startedAt: null,
      completedAt: null,
      orchestrator: null,
      verificationVerdict: null,
    });
  }
  return out;
}

// Tolerant aliases mirroring _STATUS_ALIASES in session_state.py. Pre-Set-7
// state files may carry "completed" or "done" instead of the canonical
// "complete"; we normalize on read so consumers don't regress on existing
// files. Backfill explicitly leaves drifted files untouched, so
// canonicalization happens at the read boundary.
const STATUS_ALIASES: Record<string, string> = {
  completed: "complete",
  done: "complete",
};

function canonicalizeStatus(raw: string): string {
  return STATUS_ALIASES[raw] ?? raw;
}

// Mirror of _read_total_sessions_from_spec in Python. Looser than the
// full YAML parser used in fileSystem.ts:parseSessionSetConfig — that
// function already extracts the configuration block, but we duplicate
// the regex here to keep this module self-contained for the
// lazy-synthesis path (which is only ever exercised when a session
// set has a spec.md but no state file).
//
// Set 047 Session 5 (mirrors Python S4 verifier Critical 2): when the
// Session Set Configuration block has no numeric totalSessions, fall
// back to the highest ``### Session N`` heading in the spec.
//
// Set 115 S1: takes spec TEXT, not a path. The caller reads `spec.md`
// once and derives both the title map and the total from it — the
// round-1 finding was that this path read the same file twice per set,
// on the tree scan.
function totalSessionsFromSpecText(
  text: string,
  specTitles: Map<number, string>,
): number | null {
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text.slice(0, 4000);
  const totalMatch = block.match(/^\s*totalSessions\s*:\s*(\d+)\s*$/im);
  if (totalMatch) {
    const value = Number.parseInt(totalMatch[1], 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  // Headings fallback: max(N) over `### Session N — ...` headings.
  if (specTitles.size === 0) return null;
  const maxN = Math.max(...specTitles.keys());
  return maxN > 0 ? maxN : null;
}

/** The one `spec.md` read this module performs per synthesis. */
function readSpecOnce(sessionSetDir: string): {
  titles: Map<number, string>;
  total: number | null;
} {
  const specPath = path.join(sessionSetDir, "spec.md");
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return { titles: new Map(), total: null };
  }
  const titles = specTitleMapFromText(text);
  return { titles, total: totalSessionsFromSpecText(text, titles) };
}

// Mirror of _not_started_payload in Python. Must produce structurally
// identical content to the Python writer for any folder, since either
// side may be the one that lazy-synthesizes during a sweep.
//
// Set 047 Session 5 (mirrors Python S4): emits canonical v4 on-disk
// shape per spec §3.1. Top-level keys are ``schemaVersion`` /
// ``sessionSetName`` / ``status`` / ``sessions[]``; the dropped v3
// top-level fields (currentSession, totalSessions, completedSessions,
// startedAt, completedAt, orchestrator, verificationVerdict,
// lifecycleState) are derived by the reader via normalizeToV4Shape.
// Each session entry carries per-session metadata defaulted to null.
//
// When totalSessions is unknown (no spec config block, no headings),
// ``sessions[]`` is left absent — a not-started shape without a known
// plan is one of the few cases the invariant rule 1 explicitly allows.
// The next legitimate write (register_session_start) materializes
// ``sessions[]`` when the total is known.
function notStartedPayload(sessionSetDir: string): Record<string, unknown> {
  const { titles, total } = readSpecOnce(sessionSetDir);
  const sessions = buildSessions(total, "not-started", titles);
  const base: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    sessionSetName: path.basename(sessionSetDir.replace(/[\\/]+$/, "")),
    status: "not-started",
  };
  if (sessions !== undefined) {
    base.sessions = sessions;
  }
  return base;
}

// Mirror of _backfill_payload in Python. Used by the lazy-synth
// fallback in readStatus so a legacy folder that slipped through Set 7
// Session 1's backfill is classified by the same inference rules as the
// one-shot backfill instead of regressed to "not-started".
//
// Inference rules:
//   - change-log.md present → status: "complete", lifecycleState: "closed"
//   - activity-log.json present → status: "in-progress", lifecycleState: "work_in_progress"
//   - neither → not-started shape
//
// Timestamps (`completedAt`, `startedAt`) are best-effort: the TS path
// uses `change-log.md`'s mtime for completedAt and the earliest valid
// `dateTime` from the activity log for startedAt, mirroring the Python
// helpers _change_log_mtime_iso and _earliest_activity_log_timestamp.
// Drift between the two writers' timestamp formats would not affect
// correctness — `completedAt` and `startedAt` are observability fields,
// not lifecycle drivers — but we keep them aligned so a folder
// synthesized by either side reads the same way.
/**
 * The state a spec-only folder *would* have, computed in memory.
 *
 * **Set 115 S1 — writer ownership.** Two `ensureSessionStateFile`
 * implementations used to create this file: `ai_router/session_state.py`
 * and this module, the latter reached from `readStatus` — i.e. a *read*
 * that wrote. Because the extension watches `spec.md` and
 * `session-state.json`, its synthesizer routinely won the race and put
 * its own payload on disk first; every later boundary write then carried
 * that payload's titles forward, because title resolution puts the
 * stored ledger first. That is how `Session N` became sticky across the
 * whole Explorer.
 *
 * The ownership rule now: **the router's sanctioned writers own creation
 * of `session-state.json`; the extension writes it only on an explicit
 * operator action (cancel / restore), never on a read.** This function is
 * the read-side replacement — the same inference the Python backfill
 * applies (`change-log.md` → complete; `activity-log.json` →
 * in-progress; neither → not-started), returned rather than written.
 *
 * Consequences that make this a removal rather than a trade: a folder no
 * longer gains an untracked file merely because the Explorer scanned it
 * (Set 099 S2 had already grown a non-mutating mirror,
 * `rawSessionSetStatus`, specifically to dodge that side effect), and
 * there is no longer a second writer to lose a race to.
 */
export function inferStateInMemory(sessionSetDir: string): Record<string, unknown> {
  const changelogPath = path.join(sessionSetDir, "change-log.md");
  if (fs.existsSync(changelogPath)) {
    const base = notStartedPayload(sessionSetDir);
    if (!Array.isArray(base.sessions)) {
      // No spec plan — cannot produce a reader-valid `complete`
      // snapshot. Fall through to the not-started shape; preserves
      // operator intent without an invariant-violating view.
      return base;
    }
    base.status = "complete";
    const sessions = base.sessions as LazySessionRecord[];
    for (const entry of sessions) {
      entry.status = "complete";
    }
    return base;
  }

  const activityPath = path.join(sessionSetDir, "activity-log.json");
  if (fs.existsSync(activityPath)) {
    let entries: Array<{ dateTime?: unknown }> | null = null;
    let readable = true;
    try {
      const data = JSON.parse(fs.readFileSync(activityPath, "utf8"));
      if (Array.isArray(data)) {
        entries = data as Array<{ dateTime?: unknown }>;
      } else if (data && typeof data === "object" && Array.isArray(data.entries)) {
        entries = data.entries as Array<{ dateTime?: unknown }>;
      } else {
        // Unexpected shape: file presence stays the conservative
        // in-progress signal, exactly as the router does.
        readable = false;
      }
    } catch {
      readable = false;
    }
    // Mirror of `_activity_log_has_entries` (Set 077 S4 / A12): an
    // activity log whose entries list is EMPTY is not evidence of
    // progress — the modern authoring flow creates `{"entries": []}` up
    // front, so treating mere file presence as in-progress showed a set
    // in flight nobody started. Unreadable / malformed / unexpected
    // shapes keep the conservative legacy inference. Set 115 S1 round-2
    // finding: the TypeScript side had never mirrored this, so the two
    // sides disagreed about every freshly-authored set.
    if (readable && entries !== null && entries.length === 0) {
      return notStartedPayload(sessionSetDir);
    }
    const base = notStartedPayload(sessionSetDir);
    if (!Array.isArray(base.sessions) || base.sessions.length === 0) {
      // No spec plan — cannot produce a reader-valid `in-progress`
      // view. Fall through to not-started.
      return base;
    }
    base.status = "in-progress";
    const sessions = base.sessions as LazySessionRecord[];
    sessions[0].status = "in-progress";
    const timestamps: string[] = [];
    for (const e of entries ?? []) {
      if (typeof e.dateTime === "string") timestamps.push(e.dateTime);
    }
    timestamps.sort();
    const earliest = timestamps[0];
    if (earliest !== undefined) {
      sessions[0].startedAt = earliest;
    }
    return base;
  }

  return notStartedPayload(sessionSetDir);
}

// Atomic write via unique temp file + rename. Mirrors _atomic_write_json
// in Python: a fixed `path + ".tmp"` would let two concurrent writers
// (the Python backfill, this TS path, two extension instances on the
// same workspace) collide on the temp filename. Per-call uniqueness via
// PID + random suffix avoids that without a cross-process lock.
//
// Set 115 S1: no longer reachable from a READ. The only remaining
// state-file writers in the extension are the explicit operator actions
// in `cancelLifecycle.ts`; see `inferStateInMemory` for why.
function atomicWriteJson(filePath: string, payload: unknown): void {
  const directory = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(
    directory,
    `.${base}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`
  );
  try {
    fs.writeFileSync(
      tmpPath,
      JSON.stringify(payload, null, 2) + "\n",
      { encoding: "utf8" }
    );
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* best-effort cleanup */
      }
    }
    throw err;
  }
}

/**
 * Synthesize a not-started session-state.json for *sessionSetDir*.
 *
 * Idempotent: if a state file already exists, returns its path
 * untouched. The caller should not assume the existing file matches
 * the canonical shape — pre-Set-7 drift (e.g. ``status: "completed"``
 * vs the canonical ``"complete"``) is preserved as-is; canonicalization
 * happens at the read boundary in :func:`readStatus`.
 *
 * **Set 115 S1:** this is now an EXPLICIT-ACTION writer only. It is not
 * reachable from any read; `readStatus` derives in memory via
 * {@link inferStateInMemory} instead. Titles come from `spec.md`
 * through the same `healTitle` rule the router's writer applies, so a
 * file created here is byte-compatible with one created by
 * `ai_router/session_state.py`.
 */
export function synthesizeNotStartedState(sessionSetDir: string): string {
  const filePath = path.join(sessionSetDir, SESSION_STATE_FILENAME);
  if (fs.existsSync(filePath)) return filePath;
  atomicWriteJson(filePath, notStartedPayload(sessionSetDir));
  return filePath;
}

/**
 * Return the canonical ``status`` for *sessionSetDir*.
 *
 * Single entry point for "what state is this set in?" in the extension.
 * Returns one of ``"not-started" | "in-progress" | "complete" |
 * "cancelled"``; pre-Set-7 drift (``"completed"``, ``"done"``) is
 * canonicalized via :data:`STATUS_ALIASES`.
 *
 * **Set 115 S1 — this read no longer writes.** A folder with `spec.md`
 * but no `session-state.json` is inferred in memory by
 * {@link inferStateInMemory} (same rules as the router's backfill:
 * ``change-log.md`` → ``"complete"``; ``activity-log.json`` →
 * ``"in-progress"``; neither → ``"not-started"``). Creating the file is
 * the router's job — `ensure_session_state_file` / `start_session` —
 * and leaving it to one writer is what stops a generic `Session N`
 * ledger from being raced onto disk ahead of the real titles.
 *
 * Parse errors propagate (consistent with the Python side and the
 * spec's risk section: "the fallback only triggers on file-absent,
 * never on parse-error"). A folder without ``spec.md`` is not a
 * session set; callers must filter those out.
 */
// Shared loader for the file-present branch. Mirrors
// `_load_canonical_status` in Python.
function loadCanonicalStatus(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw); // intentional: throws on malformed
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(
      `${filePath}: session-state.json must contain a JSON object`
    );
  }
  const status = (parsed as Record<string, unknown>).status;
  if (typeof status !== "string") {
    throw new Error(
      `${filePath}: session-state.json missing string 'status' field`
    );
  }
  return canonicalizeStatus(status);
}

export function readStatus(sessionSetDir: string): CanonicalStatus | string {
  const filePath = path.join(sessionSetDir, SESSION_STATE_FILENAME);
  if (fs.existsSync(filePath)) {
    return loadCanonicalStatus(filePath);
  }
  const inferred = inferStateInMemory(sessionSetDir).status;
  return typeof inferred === "string" ? canonicalizeStatus(inferred) : "not-started";
}
