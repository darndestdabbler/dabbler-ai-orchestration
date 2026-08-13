import * as fs from "fs";
import * as path from "path";

// Set 122 Session 2 trimmed this module to READERS ONLY.
//
// It used to CANCEL and RESTORE session sets in TypeScript, which meant it
// opened `session-state.json` and wrote it — the line the Set 122 spec
// names as "the concrete violation that justified this whole set". Only
// the router's sanctioned writers may touch that file. Both operations now
// run through `python -m ai_router.session_lifecycle`, whose Python
// implementation was already complete and simply had no entry point;
// `utils/sessionLifecycleCli.ts` is how the extension reaches it.
//
// The readers stay in TypeScript on purpose: the Explorer builds its tree
// synchronously and must not spawn a subprocess per row.
//
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

interface SessionStateLike {
  status?: unknown;
  preCancelStatus?: unknown;
  [key: string]: unknown;
}

/**
 * Read `session-state.json` as a plain object, or null when it is absent,
 * unparseable, or not an object.
 *
 * A READER, deliberately — Set 122 S2 removed this module's writer half
 * entirely. The extension may read state files freely; only the router's
 * sanctioned writers may write them, and cancel/restore now goes through
 * `python -m ai_router.session_lifecycle`.
 */
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