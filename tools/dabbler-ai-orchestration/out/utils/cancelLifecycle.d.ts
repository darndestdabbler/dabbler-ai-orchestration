/**
 * Returns ``true`` iff *sessionSetDir* currently has a ``CANCELLED.md``
 * file. Per the spec's detection rules, this signal takes precedence
 * over every other state indicator (change-log, activity-log,
 * session-state.json status). Session 2 wires this into the explorer's
 * state-detection function ahead of the ``readStatus`` call.
 */
export declare function isCancelled(sessionSetDir: string): boolean;
/**
 * Returns ``true`` iff *sessionSetDir* has a ``RESTORED.md`` file AND
 * does not currently have a ``CANCELLED.md`` file. ``RESTORED.md`` is
 * an audit-only artifact: once restored, the set falls back to whatever
 * its other files indicate (done / in-progress / not-started). The
 * ``CANCELLED.md``-absent guard means a re-cancelled set (which renames
 * ``RESTORED.md`` back to ``CANCELLED.md``) does not also report
 * "wasRestored".
 */
export declare function wasRestored(sessionSetDir: string): boolean;
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
 * via :func:`isCancelled` first. Restoring a never-cancelled set is
 * an operator error, not a no-op.
 */
export declare function restoreSessionSet(sessionSetDir: string, reason?: string): Promise<void>;
