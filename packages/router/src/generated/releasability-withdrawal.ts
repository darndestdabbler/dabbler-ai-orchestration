// Generated from releasability-withdrawal.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * releasability-withdrawals.jsonl row (one operator withdrawal of a session's releasability)
 */
export type ReleasabilityWithdrawal = {
  schema_version?: number;
  session_number: number;
  /**
   * Why the artifact this session was declared to ship must not ship. Permanent, and read beside the declaration it withdraws.
   */
  reason: string;
  /**
   * Who withdrew it. Not a verdict and never read as one: this says a person decided nothing would be published, never that anything passed.
   */
  approver: string;
  /**
   * The worktree snapshot when the withdrawal was made, so a reader can see which tree the decision was taken against. Absent when the snapshot could not be taken.
   */
  tree_at_withdrawal?: string;
  recorded_at: string;
  framework_version?: string;
};
