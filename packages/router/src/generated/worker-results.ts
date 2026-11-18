// Generated from worker-results.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

export type WorkerResultsDefectClass = "safety-data-loss" | "boundary-auth" | "contract-compatibility" | "logic-state" | "reliability-performance" | "maintainability-test";

/**
 * worker-results.jsonl row (one check result)
 */
export type WorkerResults = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the row rather than interpreting it.
   */
  schema_version: 1;
  change_id: string;
  check_id: string;
  attempt: number;
  recorded_at: string;
  worker_model?: string;
  worker_provider?: string;
  result: "pass" | "fail" | "blocked";
  /**
   * Required when result is blocked. Naming the reason is what makes a blocked result reviewable instead of a shrug.
   */
  blocked_reason?: "unprovable-absence" | "authorized-pulls-insufficient" | "bounds-exhausted" | "ambiguous-objective" | "tooling-unavailable";
  /**
   * Positive evidence. The framework verifies each hash against the reviewed tree and refuses the row on mismatch.
   */
  quotes?: Array<{
    path: string;
    content_hash: string;
    span: {
      kind: "byte" | "line";
      start: number;
      end: number;
    };
  }>;
  /**
   * Negative evidence, re-executed by the framework. The worker supplies query and scope; tool_version and result are recorded by the framework.
   */
  absence_searches?: Array<{
    query: string;
    query_kind: "literal" | "regex";
    scope: string[];
    tool_version: string;
    matches: number;
  }>;
  /**
   * The existing vocabulary. This pipeline does not fork it.
   */
  severity?: "critical" | "major" | "minor";
  defect_class?: WorkerResultsDefectClass;
};
