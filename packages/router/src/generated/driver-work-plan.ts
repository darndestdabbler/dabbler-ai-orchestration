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
  /**
   * Other repositories of this SOLUTION that the plan needs to exist. Each is placed when the plan is accepted -- created beside this one with a `solution-dependencies.json` declaring which solution it is in and its own id, and nothing else -- so that finishing this repository leaves the next one visible in the Solution Explorer instead of leaving the operator to remember it. One that already declares itself is left exactly as it is. It declares no dependency: what this repository takes is declared on the edge that takes it, and placing a repository never invents one. Optional, and absent in the ordinary single-repository session.
   */
  repositories?: {
    /**
     * Its stable repository id -- the name a `producedBy` uses for it.
     */
    id: string;
    /**
     * Where to place it, relative to this repository's root. Defaults to the first declared search path, which is where the assembly already looks.
     */
    path?: string;
  }[];
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
  /**
   * The module(s) this session works in, by slug from docs/modules.yaml. Judged at acceptance against the solution's shape: in a multi-module solution the plan names at least one declared module and, when it names more than one, says why in `reason`; a single-module solution leaves it out, because its repository is the module. Absent in every session of a single-module repository.
   */
  modules?: string[];
  /**
   * Why this session must change more than one module, recorded verbatim on the declaration. Required exactly when `modules` names two or more: a cross-module session is rare, and the reason is what makes it reviewable.
   */
  reason?: string;
};
