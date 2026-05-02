import * as fs from "fs";
import * as path from "path";

// Filenames for the cancel/restore audit-trail markdown files. The
// filename signals the *current* lifecycle state; the body is the same
// accumulated history regardless of which name the file currently uses.
const CANCELLED_FILENAME = "CANCELLED.md";
const RESTORED_FILENAME = "RESTORED.md";
const SESSION_STATE_FILENAME = "session-state.json";

const HISTORY_HEADER = "# Cancellation history";

// Canonical text written by both this writer and the Python mirror in
// ai_router/session_lifecycle.py. The two writers must agree
// byte-for-byte on the on-disk shape so a set cancelled on one platform
// reads identically when the same repo is opened on another. Pin both
// writers to LF newlines and UTF-8 (no BOM) — the spec's Risks section
// calls this out explicitly.

/**
 * Format a Date as a local-time ISO-8601 string with timezone offset and
 * second precision (e.g., ``2026-05-14T11:23:07-04:00``).
 *
 * The native ``Date.prototype.toISOString`` returns UTC with millisecond
 * precision, which neither matches the spec's example shape nor the
 * Python writer's ``datetime.now().astimezone()...isoformat(timespec="seconds")``
 * output. Mirror the Python format here.
 */
function formatLocalIsoSeconds(d: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const HH = pad(d.getHours());
  const MM = pad(d.getMinutes());
  const SS = pad(d.getSeconds());
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}${sign}${offH}:${offM}`;
}

/**
 * Returns ``true`` iff *sessionSetDir* currently has a ``CANCELLED.md``
 * file. Per the spec's detection rules, this signal takes precedence
 * over every other state indicator (change-log, activity-log,
 * session-state.json status). Session 2 wires this into the explorer's
 * state-detection function ahead of the ``readStatus`` call.
 */
export function isCancelled(sessionSetDir: string): boolean {
  return fs.existsSync(path.join(sessionSetDir, CANCELLED_FILENAME));
}

/**
 * Returns ``true`` iff *sessionSetDir* has a ``RESTORED.md`` file AND
 * does not currently have a ``CANCELLED.md`` file. ``RESTORED.md`` is
 * an audit-only artifact: once restored, the set falls back to whatever
 * its other files indicate (done / in-progress / not-started). The
 * ``CANCELLED.md``-absent guard means a re-cancelled set (which renames
 * ``RESTORED.md`` back to ``CANCELLED.md``) does not also report
 * "wasRestored".
 */
export function wasRestored(sessionSetDir: string): boolean {
  return (
    fs.existsSync(path.join(sessionSetDir, RESTORED_FILENAME)) &&
    !fs.existsSync(path.join(sessionSetDir, CANCELLED_FILENAME))
  );
}

/**
 * Atomic write via unique temp file + rename. Mirrors
 * ``_atomic_write_json`` in ai_router/session_state.py and the same
 * pattern in src/utils/sessionState.ts. The temp filename is uniquified
 * with PID + a short random suffix so two concurrent writers (e.g.
 * two VS Code windows on the same workspace) cannot collide on the
 * temp file itself. Cross-process atomicity is best-effort: ``rename``
 * is atomic on a single filesystem, and both writers produce the same
 * shape, so last-rename-wins is benign.
 */
function atomicWriteFile(filePath: string, content: string): void {
  const directory = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(
    directory,
    `.${base}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`
  );
  try {
    fs.writeFileSync(tmpPath, content, { encoding: "utf8" });
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
 * Build the file body with *verb*'s new entry prepended above any
 * existing entries. Tolerates malformed prior content (manual edits)
 * by keeping it verbatim below the new entry — the spec's risk section
 * calls out that "filename presence is what matters" and the prepend
 * logic must not break detection.
 *
 * The entry block is self-terminating: each entry ends with the
 * blank-line separator (``\n\n``) that the spec's Session-1 prepend
 * formula calls for. This keeps every cancel/restore write
 * symmetrical regardless of whether prior entries follow.
 *
 * Output shape (first cancel, no prior file):
 *
 *     # Cancellation history
 *
 *     Cancelled on 2026-05-14T11:23:07-04:00
 *     <reason>
 *
 * (with one trailing blank line after the reason)
 *
 * Output shape (cancel after restore):
 *
 *     # Cancellation history
 *
 *     Cancelled on 2026-05-14T11:23:07-04:00
 *     <new reason>
 *
 *     Restored on 2026-05-10T09:00:00-04:00
 *     <prior reason>
 *
 * (each entry self-terminates with a trailing blank line)
 */
function prependEntry(
  existing: string | null,
  verb: "Cancelled" | "Restored",
  reason: string,
  when: string
): string {
  // Per the spec's prepend formula `<verb-line>\n<reason>\n\n`, each
  // entry self-terminates with the blank-line separator. On a fresh
  // file the trailing blank line is just a single trailing blank line
  // after the only entry; once subsequent entries are added it acts as
  // the separator between entries without needing a join step.
  const newEntry = `${verb} on ${when}\n${reason}\n\n`;
  if (existing == null) {
    return `${HISTORY_HEADER}\n\n${newEntry}`;
  }
  if (existing.startsWith(HISTORY_HEADER)) {
    const afterHeader = existing.slice(HISTORY_HEADER.length).replace(/^\n+/, "");
    return `${HISTORY_HEADER}\n\n${newEntry}${afterHeader}`;
  }
  // Malformed: prepend a fresh header + new entry; preserve manual edits
  // verbatim below. Detection (filename presence) is unaffected.
  return `${HISTORY_HEADER}\n\n${newEntry}${existing}`;
}

interface SessionStateLike {
  status?: unknown;
  preCancelStatus?: unknown;
  [key: string]: unknown;
}

function readSessionState(sessionSetDir: string): SessionStateLike | null {
  const statePath = path.join(sessionSetDir, SESSION_STATE_FILENAME);
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as SessionStateLike;
    }
  } catch {
    /* fall through to null — caller treats as "no usable state" */
  }
  return null;
}

function writeSessionState(sessionSetDir: string, state: SessionStateLike): void {
  const statePath = path.join(sessionSetDir, SESSION_STATE_FILENAME);
  atomicWriteFile(statePath, JSON.stringify(state, null, 2) + "\n");
}

/**
 * Return the inferred status from current file presence — same rules as
 * the Set 7 backfill payload. Used as the restore fallback when
 * ``preCancelStatus`` is missing (e.g., a manually edited state file).
 */
function inferStatusFromFiles(sessionSetDir: string): string {
  if (fs.existsSync(path.join(sessionSetDir, "change-log.md"))) {
    return "complete";
  }
  if (fs.existsSync(path.join(sessionSetDir, "activity-log.json"))) {
    return "in-progress";
  }
  return "not-started";
}

/**
 * Cancel *sessionSetDir*: rename ``RESTORED.md`` to ``CANCELLED.md`` if
 * present (preserving accumulated history), prepend a new
 * ``Cancelled on <iso>\n<reason>`` entry, and update
 * ``session-state.json`` so its ``status`` becomes ``"cancelled"`` with
 * the prior status captured into ``preCancelStatus``.
 *
 * Idempotent for the markdown side in the sense that re-cancelling an
 * already-cancelled set just prepends another entry; it does not
 * rewrite the history. The session-state.json update is a no-op rebind
 * if ``status`` is already ``"cancelled"`` (``preCancelStatus`` is
 * preserved as-is rather than overwritten with ``"cancelled"``, which
 * would lose the original status across a restore).
 *
 * The empty string is a valid *reason* — operators may dismiss the
 * input dialog without typing anything. The prepend logic writes the
 * blank reason line so the timestamp pattern stays intact.
 */
export async function cancelSessionSet(
  sessionSetDir: string,
  reason: string = ""
): Promise<void> {
  const cancelledPath = path.join(sessionSetDir, CANCELLED_FILENAME);
  const restoredPath = path.join(sessionSetDir, RESTORED_FILENAME);

  // If a RESTORED.md is sitting around from a prior restore, rename it
  // to CANCELLED.md first so its accumulated history is preserved.
  if (fs.existsSync(restoredPath) && !fs.existsSync(cancelledPath)) {
    fs.renameSync(restoredPath, cancelledPath);
  }

  const existing = fs.existsSync(cancelledPath)
    ? fs.readFileSync(cancelledPath, "utf8")
    : null;
  const updated = prependEntry(existing, "Cancelled", reason, formatLocalIsoSeconds(new Date()));
  atomicWriteFile(cancelledPath, updated);

  const state = readSessionState(sessionSetDir);
  if (state !== null) {
    if (state.status !== "cancelled") {
      state.preCancelStatus = state.status ?? null;
    }
    state.status = "cancelled";
    writeSessionState(sessionSetDir, state);
  }
}

/**
 * Restore *sessionSetDir*: rename ``CANCELLED.md`` to ``RESTORED.md``,
 * prepend a new ``Restored on <iso>\n<reason>`` entry, and update
 * ``session-state.json`` so ``status`` is restored from
 * ``preCancelStatus`` (with ``preCancelStatus`` then cleared). If
 * ``preCancelStatus`` is missing (e.g., a manually-edited state file),
 * fall back to file-presence inference — change-log → ``"complete"``;
 * activity-log → ``"in-progress"``; neither → ``"not-started"`` —
 * mirroring the Set 7 backfill rules.
 *
 * Throws if ``CANCELLED.md`` does not exist; the caller should check
 * via :func:`isCancelled` first. Restoring a never-cancelled set is
 * an operator error, not a no-op.
 */
export async function restoreSessionSet(
  sessionSetDir: string,
  reason: string = ""
): Promise<void> {
  const cancelledPath = path.join(sessionSetDir, CANCELLED_FILENAME);
  const restoredPath = path.join(sessionSetDir, RESTORED_FILENAME);

  if (!fs.existsSync(cancelledPath)) {
    throw new Error(
      `restoreSessionSet: ${cancelledPath} does not exist; nothing to restore`
    );
  }

  const existing = fs.readFileSync(cancelledPath, "utf8");
  const updated = prependEntry(existing, "Restored", reason, formatLocalIsoSeconds(new Date()));
  // Sequence: write RESTORED.md, then update session-state.json, then
  // unlink CANCELLED.md. CANCELLED.md is the highest-precedence state
  // signal, so it stays in place until everything else is consistent —
  // a crash before the unlink leaves the set looking cancelled (sticky
  // and correct), and the operator can simply re-run restore. The
  // alternative (unlink first, then update JSON) would briefly show
  // the set as restored to the explorer while session-state.json still
  // reported `status: "cancelled"` to any other reader.
  atomicWriteFile(restoredPath, updated);

  const state = readSessionState(sessionSetDir);
  if (state !== null) {
    let restored: unknown = state.preCancelStatus;
    if (typeof restored !== "string" || restored.length === 0 || restored === "cancelled") {
      restored = inferStatusFromFiles(sessionSetDir);
    }
    state.status = restored;
    delete state.preCancelStatus;
    writeSessionState(sessionSetDir, state);
  }

  try {
    fs.unlinkSync(cancelledPath);
  } catch {
    /* best-effort: target write + JSON update succeeded; source removal
       is the last step. A lingering CANCELLED.md leaves the set looking
       cancelled until the operator re-runs restore, which then unlinks
       it and leaves only RESTORED.md as the canonical state. */
  }
}
