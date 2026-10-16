// The verification protocol's exit codes: what an orchestrator branches on.
//
// A table, not a detail of any loop -- every seam below `verify/` returns
// these, and callers OUTSIDE verify (the driver, bootstrap's guidance)
// branch on them too, which is what makes them contract rather than
// internals. `verify/errors.ts` re-exports the table beside the error
// classes that stay its own.

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_STATE = 3;
export const EXIT_BLOCKING = 4;
/**
 * The cap is reached and blocking findings cannot be shown remediated.
 *
 * Distinct from `EXIT_BLOCKING`, which means "a round was recorded and its
 * findings are yours to dispose of". This one records NO round, and there
 * is nothing to dispose of: the orchestrator that read it as blocking sent
 * the engine back to a disposition set it had already acted on, then to the
 * same fix, the same suite and the same refusal -- a cycle that reads as
 * ordinary progress and never terminates, because a finding citing no
 * evidence path can never be shown remediated by any amount of work.
 */
export const EXIT_UNRESOLVED = 5;
export const EXIT_CALL_FAILED = 6;
export const EXIT_UNAVAILABLE = 7;
