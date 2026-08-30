// The exit codes every verify command answers with, and the one error type
// its refusals are carried on.
//
// They live in their own file because all six seams below `verify/` return
// them and none of the six owns them. A code is not a detail of the loop: an
// orchestrator branches on it, and a refusal that answered 3 where its twin
// answered 2 would be drift the record could not see.

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_STATE = 3;
export const EXIT_BLOCKING = 4;
export const EXIT_CALL_FAILED = 6;
export const EXIT_UNAVAILABLE = 7;

export class VerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyError";
  }
}

/**
 * A caller tried to name the change under review. The identity is derived
 * from the tree, so a supplied value is refused rather than honoured -- an id
 * a model may choose is an id a model may reuse to file fresh evidence
 * against a review it has already passed.
 */
export class ChangeIdSuppliedError extends VerifyError {
  constructor(message: string) {
    super(message);
    this.name = "ChangeIdSuppliedError";
  }
}

/** A step command refused, carrying the exit code the CLI returns. */
export class StepRefusal extends VerifyError {
  readonly code: number;

  constructor(message: string, code: number = EXIT_STATE) {
    super(message);
    this.name = "StepRefusal";
    this.code = code;
  }
}

/**
 * The exit code an error carries, or the state default.
 *
 * Python reads `getattr(exc, "code", EXIT_STATE)` at four call sites, which
 * accepts the code off any exception that happens to have one. This asks the
 * same question of the same shapes and keeps the same default.
 */
export function refusalCode(error: unknown): number {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : EXIT_STATE;
}
