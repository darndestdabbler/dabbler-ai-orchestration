// Generated from step-execution.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * step-execution.jsonl (one row per step opened and one per step closed)
 */
export type StepExecution = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the record rather than interpreting it.
   */
  schema_version: 1;
  /**
   * Two words, and no third: a step that was neither opened nor closed did not happen.
   */
  event: "opened" | "closed";
  recorded_at: string;
  session_number: number;
  /**
   * A step_id the session's approved plan declares. Nothing else may be opened.
   */
  step_id: string;
  /**
   * HEAD when the step opened. Everything the step is measured against is anchored here, so the close refuses when HEAD has moved: a commit landed mid-step and the diff no longer carries the step's work.
   */
  base_commit?: string;
  /**
   * What the step changed, against what it declared. Present on 'closed'.
   */
  envelope?: {
    inside: string[];
    outside?: string[];
  };
  /**
   * The worktree snapshot this step closed on, and the baseline the next step is measured against. Present on 'closed'. A closed step's work stays in the working tree until the session commits, so without this the next step would be charged for its predecessor's files -- and dropping those paths by name instead would let a later step edit them again, outside its own envelope, unremarked.
   */
  closed_tree?: string;
  /**
   * The controls and the targeted test run, as facts. Present on 'closed'; a step never closes with a red required one.
   */
  deterministic?: Array<{
    kind: string;
    status: "pass" | "fail" | "not_applicable" | "unknown";
    required: boolean;
    command?: string;
    detail?: string;
  }>;
};
