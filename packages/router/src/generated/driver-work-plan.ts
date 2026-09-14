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
   * An older plan's member, read as it was recorded and never written now: a plan says `hold_release` or nothing, and a session ships unless held.
   */
  releasable?: boolean;
  /**
   * The one reason this session publishes nothing: the later session, sibling module or first release's go-live the work waits on. Absent, the session ships -- once new or fixed functionality can be delivered, it is delivered. Declared here, before the work, and never decided afterwards.
   */
  hold_release?: string;
  /**
   * What this session will NOT do: the exclusions its section of the session plan states, or the nearest concrete boundary of the task where it states none. Judged at acceptance, where a plan without at least one is refused naming the member -- an engine that cannot name one has not understood the scope -- and the reviewer holds the work to the list. Optional here so that a plan recorded before the member existed is read as it was recorded: the record is never refused after the fact.
   */
  non_goals?: string[];
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
   * Read by nothing. A plan recorded while docs/modules.yaml was read may name the module(s) it worked in; it is accepted and the member ignored, and the plan ask no longer mentions it.
   */
  modules?: string[];
  /**
   * Read by nothing. The member stays so a plan recorded while it was asked for is still read.
   */
  reason?: string;
};
