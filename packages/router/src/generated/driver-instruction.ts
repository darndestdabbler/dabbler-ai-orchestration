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
  kind: "step" | "rejection" | "interrupt" | "done";
  session_number: number;
  issued_at: string;
  /**
   * The work-plan step this instruction is about. Required on `step` and `rejection`; an `interrupt` carries it when the engine is being pointed back at a step.
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
   * Which answer this instruction expects, by the schema it must validate against. Required on every kind but `done`.
   */
  answer_schema?: "driver-report.schema.json" | "driver-work-plan.schema.json" | "driver-disposition.schema.json";
  /**
   * The `dabbler session ...` command line that writes the answer -- the engine never writes the ledger directly. Required on every kind but `done`.
   */
  answer_command?: string;
};
