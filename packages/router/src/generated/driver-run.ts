// Generated from driver-run.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * driver/run.json (where a driven session's loop is, and why it stopped)
 */
export type DriverRun = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the file rather than interpreting it.
   */
  schema_version: 1;
  session_number: number;
  /**
   * The adapter the engine is reached through, by name. A re-run with a different one is refused: one engine's session store carries the run.
   */
  engine: string;
  /**
   * Where the loop is. A re-run enters here; `complete` means the close ran and nothing is left to do.
   */
  phase: "plan" | "steps" | "preverify" | "verify" | "dispositions" | "fix" | "run-of-record" | "land" | "close" | "complete";
  /**
   * The seq of the instruction last issued, so the next one is monotonic across re-runs.
   */
  seq: number;
  /**
   * How many times the engine has been invoked for this session, across re-runs. On a seat each one is a premium request.
   */
  invocations: number;
  /**
   * The bound `invocations` is held under. Reaching it stops the loop and closes nothing; continuing is a re-run with a larger bound, which is a decision to spend more.
   */
  max_invocations: number;
  /**
   * The work-plan steps whose reports were accepted, in order. A re-run skips them.
   */
  accepted_steps: string[];
  /**
   * The tree object the working tree was at after the last accepted step, which is what the next report's `files_changed` is measured against. Null before the first step.
   */
  baseline_tree: string | null;
  /**
   * Null while the loop runs or after it completed. Set when it halted short of the close, with the reason in words; the session stays in flight and this is what the operator reads.
   */
  stop: {
    /**
     * Which bound the loop met: the invocation budget; a step refused three times; the engine reporting `blocked`; the engine failing to run; a test run the framework could not hand back; a verification round that neither passed nor produced findings to dispose; the commit or push; the close's gates.
     */
    kind: "budget" | "rejected-thrice" | "blocked" | "engine" | "tests" | "verification" | "land" | "close";
    reason: string;
    at: string;
  } | null;
  started_at: string;
  updated_at: string;
};
