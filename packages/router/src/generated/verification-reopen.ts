// Generated from verification-reopen.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * verification-reopens.jsonl row (one operator grant of further rounds)
 */
export type VerificationReopen = {
  schema_version?: number;
  session_number: number;
  /**
   * The round this grant reopens past. Every terminal row at or before it is neutralised; a terminal row recorded AFTER it stands again, so a session that reaches the cap a second time is stopped a second time and needs a second grant. That is the point: a grant buys named rounds, never a mode in which the cap no longer applies.
   */
  after_round: number;
  /**
   * Which cap terminal stood when the grant was made, as the record read it. 'adjudication' and 'cap-disputed' are absent by design and refused by the verb.
   */
  terminal: "remediated_at_cap" | "cap-clean";
  /**
   * The absolute round cap this grant sets, which must exceed after_round -- a grant that buys no round is refused rather than recorded. It wins over the configured cap and over --max-rounds for as long as it stands, because it is the more recent and more explicit act, and because a grant whose number could be silently overridden by a config file is not a grant.
   */
  cap: number;
  /**
   * Why the review the cap refused is worth buying. Permanent, and read beside the rounds it authorised.
   */
  reason: string;
  /**
   * Who authorised it. Not a verdict and never read as one: this says a person bought a round, never that anything passed.
   */
  approver: string;
  /**
   * The worktree snapshot when the grant was made, so a reader can see whether the rounds it bought reviewed the tree the operator was looking at. Absent when the snapshot could not be taken.
   */
  tree_at_grant?: string;
  recorded_at: string;
  framework_version?: string;
};
