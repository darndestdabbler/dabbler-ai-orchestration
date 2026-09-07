// Generated from triage.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * the answer `dabbler triage` asks a second provider for
 */
export type Triage = {
  /**
   * Whose the stop is. `engine-error`: the engine did the wrong thing and the framework was right to refuse it -- the next attempt can succeed unchanged. `framework-defect`: the framework refused work that should have passed, or could not carry out its own step; the fix is to the framework. `plan-defect`: the plan asked for something the step cannot satisfy as written -- the files or the checks are wrong, and no amount of engine effort fixes that.
   */
  classification: "engine-error" | "framework-defect" | "plan-defect";
  /**
   * Why, in the adviser's own words, against the artifacts it was given. This is what a person reads when they disagree with the classification.
   */
  reasoning: string;
  /**
   * One sentence naming what should happen next. It is a recommendation to a person, never an instruction to the framework.
   */
  recommendation: string;
  /**
   * The MINIMAL change to the plan step that would let the session continue, or null when no amendment would help. Proposing one is not making one.
   */
  amendment?: {
    /**
     * The step this amends. A step whose report has already been accepted may not be amended: the bar it was measured against does not move afterwards.
     */
    step_id: string;
    /**
     * The step's files as they should read, whole. Absent means the files are right as they stand.
     */
    files?: string[];
    /**
     * The step's checks as they should read, whole. Absent means the checks are right as they stand.
     */
    checks?: {
      argv: string[];
    }[];
    /**
     * Why this change is the minimal one, in a sentence a person can hold the amendment to.
     */
    reason: string;
    /**
     * True when this weakens what the framework checks -- a check dropped or narrowed, a file no longer required. This single member is what lets the ladder refuse to apply it: a gate is relaxed by a person who says so on the record, never by an adviser and never by the framework acting on one.
     */
    relaxes_a_gate: boolean;
  } | null;
};
