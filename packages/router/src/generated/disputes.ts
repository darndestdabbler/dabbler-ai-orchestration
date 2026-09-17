// Generated from disputes.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * disputes.jsonl row (one disputed finding)
 */
export type Disputes = {
  round: number;
  finding_index: number;
  filed_after_round: number;
  grounds: string;
  evidence_paths: string[];
  recorded_at: string;
};
