// Generated from baseline-reanchor.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * baseline-reanchors.jsonl row (one recovered round baseline)
 */
export type BaselineReanchor = {
  /**
   * The round whose completion_tree is unreachable.
   */
  round: number;
  session_number?: number;
  /**
   * The tree the round recorded and this object store does not have.
   */
  recorded_tree: string;
  /**
   * The tree to diff from instead. Must be the tree of anchor_commit, and anchor_commit must be the single commit made last at or before the round's recorded_at. Every later commit is refused, including the first one after the round: remediation normally begins the moment a round reports, so a post-round commit is at least as likely to contain fixes as to materialize the reviewed tree, and no timestamp can tell those apart. The baseline therefore lands before the round and the next round re-reviews work already reviewed -- deliberately, because on a path taken only when a session changes machines, a wider review is the right trade against a silently narrowed one.
   */
  anchor_tree: string;
  /**
   * The commit anchor_tree belongs to. Reachable from a ref, so the baseline now survives gc and a push.
   */
  anchor_commit: string;
  reason: string;
  recorded_at: string;
};
