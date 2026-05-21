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
export declare function isCancelled(sessionSetDir: string): boolean;
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
export declare function wasRestored(sessionSetDir: string): boolean;
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
export declare function readCancellationState(sessionSetDir: string): CancellationState;
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
export declare function cancelSessionSet(sessionSetDir: string, reason?: string): Promise<void>;
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
export declare function restoreSessionSet(sessionSetDir: string, reason?: string): Promise<void>;
