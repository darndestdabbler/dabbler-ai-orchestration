// Generated from review-run.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * review-run.json (one review run for a change-id)
 */
export type ReviewRun = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the record rather than interpreting it.
   */
  schema_version: 1;
  /**
   * Digest of the reviewed tree/diff. Structurally unchoosable by a model.
   */
  change_id: string;
  session_number: number;
  opened_at: string;
  /**
   * Append-only. A remediation adds an attempt linked to its predecessor.
   */
  attempts: Array<{
    attempt: number;
    opened_at: string;
    closed_at?: string | null;
    baseline_tree?: string | null;
    completion_tree: string;
    /**
     * The attempt this one remediates. Null only for the first attempt.
     */
    previous_attempt?: number | null;
    status: "open" | "results-recorded" | "closed";
  }>;
};
