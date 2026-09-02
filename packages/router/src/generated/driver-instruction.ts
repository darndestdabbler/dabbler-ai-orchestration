// Generated from driver-instruction.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * driver/instruction.json (what the framework is asking the engine to do now)
 */
export type DriverInstruction = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the file rather than interpreting it.
   */
  schema_version: 1;
  /**
   * Monotonic per session. An answer names the seq it answers, so a stale answer cannot be mistaken for the current one.
   */
  seq: number;
  kind: "step" | "rejection" | "interrupt" | "wait" | "done";
  session_number: number;
  issued_at: string;
  /**
   * The work-plan step this instruction is about. Required on `step`; a `rejection` or an `interrupt` carries it when the answer it concerns was a step's.
   */
  step_id?: string;
  /**
   * What to do, in words for the engine. Required on `step`.
   */
  ask?: string;
  /**
   * Why the previous answer was refused, or why the invocation was ended. Required on `rejection` and `interrupt`; each entry is one mechanical reason, never a summary.
   */
  reasons?: string[];
  /**
   * On a `rejection` that carries a verifier's findings: the round they came from, so the disposition can name it.
   */
  round?: number;
  /**
   * On a `wait`: how long to leave the framework's work alone before calling `next` again. It is a tool call and not a sleep -- the engine does something else, or nothing, and comes back.
   */
  retry_after_seconds?: number;
  /**
   * On a `wait`: the repository-relative path of the running job's log, so a person watching can read what the framework is doing while it does it.
   */
  log?: string;
  /**
   * Which answer this instruction expects, by the schema it must validate against. Required on `step`, `rejection` and `interrupt`, and refused on `wait` and `done`: an instruction that expects no written answer names no schema.
   */
  answer_schema?: "driver-report.schema.json" | "driver-work-plan.schema.json" | "driver-disposition.schema.json";
  /**
   * The `dabbler session ...` command line that writes the answer -- the engine never writes the ledger directly. Required on every kind but `done`, and refused on `done`. On a `wait` there is nothing to write, and it is the `next` call that collects the framework's work.
   */
  answer_command?: string;
};
