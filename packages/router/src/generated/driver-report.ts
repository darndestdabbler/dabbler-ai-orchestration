// Generated from driver-report.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * driver/report.json (the engine's answer to one step instruction)
 */
export type DriverReport = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the file rather than interpreting it.
   */
  schema_version: 1;
  /**
   * The seq of the instruction this answers.
   */
  seq: number;
  session_number: number;
  /**
   * The step the instruction named.
   */
  step_id: string;
  /**
   * Two words. `blocked` is the engine saying it could not finish, with `notes` saying why; there is no word for a verdict, because the engine has none to give.
   */
  status: "done" | "blocked";
  /**
   * Every file the engine created or changed for this step.
   */
  files_changed: string[];
  /**
   * The test command the engine ran, or null when it ran none.
   */
  tests_run: string | null;
  /**
   * One line for the log. People read it; the driver does not.
   */
  notes: string;
  reported_at: string;
};
