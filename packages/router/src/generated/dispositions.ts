// Generated from dispositions.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * dispositions.jsonl row (what was decided about one finding)
 */
export type Dispositions = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the row rather than interpreting it.
   */
  schema_version: 1;
  change_id: string;
  check_id: string;
  attempt: number;
  recorded_at: string;
  disposition: "fixed" | "accepted" | "disputed" | "escalated";
  severity: "critical" | "major" | "minor";
  defect_class: "safety-data-loss" | "boundary-auth" | "contract-compatibility" | "logic-state" | "reliability-performance" | "maintainability-test";
  rationale?: string;
  /**
   * Recorded by the router at an interactive prompt. Its presence in a file is not self-certifying; the writer validates before it is ever written.
   */
  human_approval?: {
    approver: string;
    approved_at: string;
  };
};
