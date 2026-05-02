import * as fs from "fs";
import * as path from "path";

// Canonical status strings carried by session-state.json under the Set 7
// invariant. The Python side defines the same set in
// ai_router/session_state.py; the two writers must stay in lockstep.
export type CanonicalStatus =
  | "not-started"
  | "in-progress"
  | "complete"
  | "cancelled";

const SCHEMA_VERSION = 2;
const SESSION_STATE_FILENAME = "session-state.json";

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
function readTotalSessionsFromSpec(sessionSetDir: string): number | null {
  const specPath = path.join(sessionSetDir, "spec.md");
  if (!fs.existsSync(specPath)) return null;
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return null;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text.slice(0, 4000);
  const totalMatch = block.match(/^\s*totalSessions\s*:\s*(\d+)\s*$/im);
  if (!totalMatch) return null;
  const value = Number.parseInt(totalMatch[1], 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

// Mirror of _not_started_payload in Python. Must produce byte-identical
// content to the Python writer for any folder, since either side may be
// the one that lazy-synthesizes during a sweep.
function notStartedPayload(sessionSetDir: string): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionSetName: path.basename(sessionSetDir.replace(/[\\/]+$/, "")),
    currentSession: null,
    totalSessions: readTotalSessionsFromSpec(sessionSetDir),
    status: "not-started",
    lifecycleState: null,
    startedAt: null,
    completedAt: null,
    verificationVerdict: null,
    orchestrator: null,
  };
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
function backfillPayload(sessionSetDir: string): Record<string, unknown> {
  const base = notStartedPayload(sessionSetDir);

  const changelogPath = path.join(sessionSetDir, "change-log.md");
  if (fs.existsSync(changelogPath)) {
    base.status = "complete";
    base.lifecycleState = "closed";
    try {
      const stat = fs.statSync(changelogPath);
      base.completedAt = new Date(stat.mtime).toISOString();
    } catch {
      base.completedAt = null;
    }
    return base;
  }

  const activityPath = path.join(sessionSetDir, "activity-log.json");
  if (fs.existsSync(activityPath)) {
    base.status = "in-progress";
    base.lifecycleState = "work_in_progress";
    try {
      const data = JSON.parse(fs.readFileSync(activityPath, "utf8")) as {
        entries?: Array<{ dateTime?: unknown }>;
      };
      const timestamps: string[] = [];
      for (const e of data.entries ?? []) {
        if (typeof e.dateTime === "string") timestamps.push(e.dateTime);
      }
      timestamps.sort();
      base.startedAt = timestamps[0] ?? null;
    } catch {
      base.startedAt = null;
    }
    return base;
  }

  return base;
}

// Atomic write via unique temp file + rename. Mirrors _atomic_write_json
// in Python: a fixed `path + ".tmp"` would let two concurrent writers
// (the Python backfill, this TS path, two extension instances on the
// same workspace) collide on the temp filename. Per-call uniqueness via
// PID + random suffix avoids that without a cross-process lock; both
// writers produce the same not-started shape so last-rename-wins is
// benign.
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
 * Mirrors :func:`synthesize_not_started_state` in Python — both writers
 * must produce structurally identical content so a folder can be
 * synthesized by either side without confusing the other.
 *
 * Used at session-set bootstrap time when the caller knows the set
 * truly has not started. Lazy-synth fallback uses
 * :func:`ensureSessionStateFile` instead so a legacy folder is
 * inferred from current file presence rather than regressed to
 * not-started.
 */
export function synthesizeNotStartedState(sessionSetDir: string): string {
  const filePath = path.join(sessionSetDir, SESSION_STATE_FILENAME);
  if (fs.existsSync(filePath)) return filePath;
  atomicWriteJson(filePath, notStartedPayload(sessionSetDir));
  return filePath;
}

/**
 * Idempotently write the inferred ``session-state.json`` for a folder.
 *
 * Differs from :func:`synthesizeNotStartedState` in that the file-absent
 * path uses :func:`backfillPayload` to infer the right shape from
 * current file presence (change-log → complete; activity-log →
 * in-progress; neither → not-started), matching the Python one-shot
 * backfill's behavior. Verifier round 2 (Set 7 / Session 2) flagged
 * the regression: a legacy folder with change-log.md but no
 * session-state.json was being misclassified as "not-started" on
 * first read.
 *
 * Mirrors :func:`ensure_session_state_file` in Python.
 */
export function ensureSessionStateFile(sessionSetDir: string): string {
  const filePath = path.join(sessionSetDir, SESSION_STATE_FILENAME);
  if (fs.existsSync(filePath)) return filePath;
  atomicWriteJson(filePath, backfillPayload(sessionSetDir));
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
 * Lazy-synthesis fallback: a folder with ``spec.md`` but no
 * ``session-state.json`` triggers :func:`ensureSessionStateFile`,
 * which infers the right initial status from current file presence
 * (``change-log.md`` → ``"complete"``; ``activity-log.json`` →
 * ``"in-progress"``; neither → ``"not-started"``) — same rules as
 * the Python one-shot backfill. The atomic-write pattern keeps
 * concurrent fallback synthesis benign — both Python and TS writers
 * produce the same shape and the last rename wins.
 *
 * Parse errors propagate (consistent with the Python side and the
 * spec's risk section: "the fallback only triggers on file-absent,
 * never on parse-error"). A folder without ``spec.md`` is not a
 * session set; callers must filter those out.
 */
// Shared loader for the file-present branch and the post-synthesis
// re-read in readStatus. Without this, a race where another process
// creates the file between the existence check and the re-read could
// return a raw aliased value or skip the dict / string-status
// validations applied above. Mirrors `_load_canonical_status` in
// Python.
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

  // File absent. Use ensureSessionStateFile (not synthesizeNotStarted)
  // so a legacy folder that slipped through Set 7 Session 1's backfill
  // is inferred from current file presence — change-log.md →
  // "complete", activity-log.json → "in-progress" — rather than being
  // regressed to "not-started". Then re-read through the same loader
  // so validation and alias canonicalization apply uniformly under
  // races.
  ensureSessionStateFile(sessionSetDir);
  return loadCanonicalStatus(filePath);
}
