// Generated from packaging.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * packaging.jsonl row (one attempt at step (f))
 */
export type Packaging = {
  /**
   * 'refused' means nothing was run: a gate said no. 'failed' means a declared command ran and did not succeed. 'published' means pack succeeded and every artifact it produced was pushed. The three are kept apart because a session that was never allowed to publish and a session whose push was rejected by the feed are different things to read at planning time.
   */
  outcome: "published" | "refused" | "failed";
  session_number: number;
  /**
   * What the session declared at step (a), read from the activity log rather than decided here. False includes the session that never declared at all: session_is_releasable fails closed.
   */
  releasable: boolean;
  /**
   * Why nothing ran. Present exactly when outcome is 'refused'.
   */
  refusal?: string;
  /**
   * Where the artifacts went, taken from the declaration that was substituted into the push command rather than from a label beside it.
   */
  feed?: string;
  /**
   * The name of the secret that was resolved, never its value. The name is the whole point of the record: it says which credential published this without saying what it is.
   */
  secret_name?: string;
  /**
   * The worktree tree id the artifacts were built from, so a publication binds to a tree the verification record can be checked against.
   */
  tree_digest?: string | null;
  /**
   * The worktree tree id after the last command ran. Recorded whenever it differs from tree_digest, because then the two are the whole finding.
   */
  post_tree_digest?: string | null;
  /**
   * A declared command changed the repository while it ran. This fails the attempt whatever the exit code said, on the same terms as a check that mutates the tree it was measuring: a build that leaves intermediates behind has produced artifacts from a tree nobody verified, and pushing them would record a release against a tree that no longer exists.
   */
  tree_mutated?: boolean;
  /**
   * What pack produced, named relative to the run's own output directory. Absolute paths are deliberately absent: they carry a machine's home directory into a record that gets read elsewhere.
   */
  artifacts?: string[];
  recorded_at: string;
  /**
   * The close gates as they stood when packaging asked them. Recorded because 'the order was satisfied' is a claim, and this is the evidence for it.
   */
  gates?: {
    name: string;
    passed: boolean;
    remediation?: string;
  }[];
  /**
   * Every command that ran, in order: pack once, then push once per artifact.
   */
  steps?: Array<{
    step: "pack" | "push";
    /**
     * The argv that ran, joined for reading, with the secret placeholder left where the resolved value was substituted at spawn.
     */
    command: string;
    artifact?: string;
    /**
     * Null means the command never returned an exit code: it timed out, or it could not be started at all. 'timed_out' tells those two apart.
     */
    exit_code: number | null;
    duration_seconds: number;
    timed_out?: boolean;
    /**
     * Combined stdout and stderr, scrubbed of the resolved secret and truncated to its tail.
     */
    output?: string;
  }>;
};
