// Generated from review-claims.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * review-claims.json (the canonical author claims for a change)
 */
export type ReviewClaims = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the record rather than interpreting it.
   */
  schema_version: 1;
  change_id: string;
  attempt?: number;
  recorded_at: string;
  /**
   * May be empty: a change whose author claims nothing is a valid input, and is not the same as a missing claims file.
   */
  claims: Array<{
    claim_id: string;
    /**
     * One assertion about the change, in the author's words.
     */
    statement: string;
    kind?: "behavior-added" | "behavior-changed" | "behavior-removed" | "refactor-no-behavior-change" | "dependency" | "documentation";
    paths?: string[];
  }>;
};
