// Generated from verification-result.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

export type VerificationResultFindings = Array<{
  description: string;
  category: string;
  severity: string;
  failureScenario?: string;
  evidencePaths?: string[];
  raw?: string;
  section?: "body" | "nits";
}>;

/**
 * VerificationResult (round-<n>-attempt-<k>-result.json)
 */
export type VerificationResult = {
  schema_version: 1;
  request_id: string;
  attempt: number;
  tree_digest: string;
  effective_provider: string | null;
  requested_model: string | null;
  served_model_id: string | null;
  transport: string | null;
  verdict: "VERIFIED" | "ISSUES_FOUND" | null;
  blocking_findings: VerificationResultFindings;
  minor_findings: VerificationResultFindings;
  /**
   * Retired: no writer emits this. Findings are blocking or minor on severity alone, because a verifier that picks its own evidence paths could otherwise exempt its own finding. Kept readable so historical rows still validate.
   */
  doc_capped_findings?: VerificationResultFindings;
  usage: {
    input_tokens: number;
    output_tokens: number;
    model_usd: number | null;
    priced: boolean;
  };
  raw_output_ref: string | null;
  raw_output_digest: string | null;
  error_class: string | null;
  round?: number;
  dispatch_id?: string;
};
