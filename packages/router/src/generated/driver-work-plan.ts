// Generated from driver-work-plan.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * driver/plan.json (the engine's answer to "plan this session")
 */
export type DriverWorkPlan = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the file rather than interpreting it.
   */
  schema_version: 1;
  session_number: number;
  /**
   * What this session will do -- the text `session declare` records.
   */
  task: string;
  /**
   * Whether the session may publish, decided here before any edit -- the same rule `session declare` enforces on a typed session.
   */
  releasable: boolean;
  steps: {
    /**
     * Unique within the plan; the reader refuses a duplicate.
     */
    id: string;
    /**
     * What the step does, in words the driver hands back as the instruction's `ask`.
     */
    ask: string;
    /**
     * The files the step expects to create or change, repository-relative. A report for the step must list each of them.
     */
    files: string[];
    /**
     * What proves the step, and at least one: a step with no check is a step the driver would close on the engine's word. A step whose product is prose still has a mechanical check -- that the file exists and is not empty, that a link resolves, that a generator agrees.
     */
    checks: {
      /**
       * The program and its arguments, spawned with no shell. Exit 0 proves the step.
       */
      argv: string[];
    }[];
  }[];
  recorded_at: string;
};
