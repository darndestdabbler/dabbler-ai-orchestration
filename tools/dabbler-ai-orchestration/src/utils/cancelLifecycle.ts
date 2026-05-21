import * as fs from "fs";
import * as path from "path";

// Filenames for the cancel/restore audit-trail markdown files. Pre-
// Set-035 the filename signalled the *current* lifecycle state and
// drove the Explorer's bucketing read; post-Set-035 the canonical
// signal is ``session-state.json``'s ``status`` field (H2 verdict
// from Set 033 Session 2, extended to cancellation by Set 035) and
// these files are durable audit-history artifacts. The body
// accumulates the same prepend-formatted entries across cancel /
// restore toggles regardless of which name the file currently uses.
const CANCELLED_FILENAME = "CANCELLED.md";
const RESTORED_FILENAME = "RESTORED.md";
const SESSION_STATE_FILENAME = "session-state.json";

const HISTORY_HEADER = "# Cancellation history";

// Canonical text written by both this writer and the Python mirror in
// ai_router/session_lifecycle.py. The two writers must agree
// byte-for-byte on the on-disk shape so a set cancelled on one platform
// reads identically when the same repo is opened on another. Pin both
// writers to LF newlines and UTF-8 (no BOM) — the spec's Risks section
// calls this out explicitly. Set 035 Session 2 confirmed parity across
// the 10 rows that matter (filename constants, history header,
// timestamp shape, atomic write, prepend semantics, state-file flip,
// restore inference, JSON serialization).

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
 * Legacy file-presence predicate. Returns ``true`` iff *sessionSetDir*
 * currently has a ``CANCELLED.md`` file.
 *
 * **Set 035 retired this as the primary bucketing signal** in favor of
 * :func:`readCancellationState`, which consults ``session-state.json``
 * first (the H2 single-source-of-truth verdict from Set 033 Session 2,
 * extended to cancellation by Set 035). This helper remains exported
 * for two purposes:
 *
 * 1. The legacy-fallback path inside :func:`readCancellationState` —
 *    invoked when the state file is missing/unparseable (legacy v1
 *    snapshots, hand-edited files, brand-new folders).
 * 2. Cross-engine parity comparisons against the Python writer in
 *    ``ai_router/session_lifecycle.py`` and unit-test scaffolding.
 *
 * Do not introduce new production call sites that branch on this
 * predicate alone — route through :func:`readCancellationState`
 * instead so the state-file-first contract holds uniformly.
 */
export function isCancelled(sessionSetDir: string): boolean {
  return fs.existsSync(path.join(sessionSetDir, CANCELLED_FILENAME));
}

/**
 * Legacy file-presence predicate. Returns ``true`` iff *sessionSetDir*
 * has a ``RESTORED.md`` file AND does not currently have a
 * ``CANCELLED.md`` file. ``RESTORED.md`` is an audit-only artifact:
 * once restored, the set falls back to whatever its other files
 * indicate (done / in-progress / not-started). The
 * ``CANCELLED.md``-absent guard means a re-cancelled set (which renames
 * ``RESTORED.md`` back to ``CANCELLED.md``) does not also report
 * "wasRestored".
 *
 * As of Set 035 this predicate is no longer consulted by the reader's
 * bucketing path; the canonical signal is ``state.status``. Kept
 * exported for test scaffolding and the legacy-fallback branch inside
 * :func:`readCancellationState`.
 */
export function wasRestored(sessionSetDir: string): boolean {
  return (
    fs.existsSync(path.join(sessionSetDir, RESTORED_FILENAME)) &&
    !fs.existsSync(path.join(sessionSetDir, CANCELLED_FILENAME))
  );
}

/**
 * Discrete return values for :func:`readCancellationState`.
 *
 * - ``"cancelled"`` — the state file declares ``status: "cancelled"``.
 * - ``"restored"`` — the state file declares a non-cancelled status
 *   AND ``RESTORED.md`` exists on disk (history-aware bucketing —
 *   the set is live, but has been cancelled and restored in the past).
 * - ``"active"`` — the state file declares a non-cancelled status
 *   AND no ``RESTORED.md`` is present (the common case — never
 *   cancelled).
 * - ``"unknown"`` — no state file, unparseable JSON, or a state file
 *   with no usable ``status`` field. The caller must fall back to
 *   the legacy file-presence predicates (:func:`isCancelled` /
 *   :func:`wasRestored`) for these inputs.
 */
export type CancellationState = "cancelled" | "restored" | "active" | "unknown";

/**
 * State-file-first cancellation/restoration reader.
 *
 * Set 035 retires the file-presence-first bucketing rule that
 * :func:`isCancelled` codified. The canonical signal for cancellation
 * is now ``session-state.json``'s ``status`` field; the markdown
 * markers (``CANCELLED.md`` / ``RESTORED.md``) remain on disk as
 * audit-history artifacts and as the legacy-fallback signal when no
 * usable state file is present.
 *
 * Resolution order:
 *
 * 1. If ``session-state.json`` exists and parses to an object with a
 *    string ``status`` field, the field's value selects between
 *    ``"cancelled"``, ``"restored"`` (status is non-cancelled and
 *    ``RESTORED.md`` is present on disk), and ``"active"`` (status is
 *    non-cancelled and ``RESTORED.md`` is absent).
 * 2. If the state file is missing, malformed, or carries no usable
 *    ``status``, returns ``"unknown"``. The caller is expected to
 *    consult :func:`isCancelled` / :func:`wasRestored` for legacy
 *    bucketing in that branch.
 *
 * The state-file-first contract intentionally does NOT consult
 * ``CANCELLED.md`` presence when the state file declares
 * ``status: "complete"`` (or any other non-cancelled value): the
 * writer keeps both signals in lockstep at every cancel/restore
 * boundary, so a state-file value of ``"complete"`` paired with a
 * stray ``CANCELLED.md`` represents either (a) a manually edited file
 * the operator needs to reconcile, or (b) a legacy snapshot — both of
 * which are handled via the ``"unknown"`` fallback when ``status``
 * is missing, not by silently letting the markdown file win.
 */
export function readCancellationState(sessionSetDir: string): CancellationState {
  const state = readSessionState(sessionSetDir);
  if (state === null) return "unknown";
  if (typeof state.status !== "string" || state.status.length === 0) {
    return "unknown";
  }
  if (state.status === "cancelled") return "cancelled";
  if (fs.existsSync(path.join(sessionSetDir, RESTORED_FILENAME))) {
    return "restored";
  }
  return "active";
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
 * by keeping it verbatim below the new entry — the original cancel-
 * lifecycle spec called out that the prepend logic must not break
 * detection, and post-Set-035 the audit-history file remains the
 * durable record of *what happened and when* even though
 * ``session-state.json``'s ``status`` is now the bucketing signal.
 * Preserving prior content unchanged keeps the operator-readable
 * history intact across hand-edits.
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
 * Both writes happen on every cancel: post-Set-035 the state file's
 * ``status`` is the canonical bucketing signal (consulted by
 * :func:`readCancellationState`), and ``CANCELLED.md`` is the durable
 * audit-history artifact. Keeping the two writes paired is the
 * symmetry that :func:`readCancellationState` relies on — a stray
 * ``CANCELLED.md`` paired with a non-cancelled ``status`` is the
 * operator-resolvable inconsistency case, not a routine output of
 * this writer.
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
 * via :func:`isCancelled` first. :func:`readCancellationState`'s
 * ``"cancelled"`` return is the canonical bucketing signal, but the
 * writer needs the *file* present to rename it into ``RESTORED.md``,
 * so the file-presence predicate is the right precondition here even
 * post-Set-035. Restoring a never-cancelled set is an operator
 * error, not a no-op.
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
  // unlink CANCELLED.md. Post-Set-035 the state file's `status` is
  // the canonical bucketing signal (a `"cancelled"` status wins over
  // any marker on disk), so the writer's job is just to keep both
  // signals consistent. The "rename last" ordering means a crash
  // partway through leaves the set looking *cancelled* to both the
  // state-file-first reader (`status` still `"cancelled"` until the
  // JSON write lands) and the legacy-fallback reader (`CANCELLED.md`
  // still on disk) — sticky and correct. The operator can simply
  // re-run restore. The alternative (unlink first, then update JSON)
  // would briefly show the set as restored to the legacy-fallback
  // reader while the canonical reader still saw `status:
  // "cancelled"`.
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
