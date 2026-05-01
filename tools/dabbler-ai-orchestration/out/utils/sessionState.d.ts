export type CanonicalStatus = "not-started" | "in-progress" | "complete" | "cancelled";
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
export declare function synthesizeNotStartedState(sessionSetDir: string): string;
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
export declare function ensureSessionStateFile(sessionSetDir: string): string;
export declare function readStatus(sessionSetDir: string): CanonicalStatus | string;
