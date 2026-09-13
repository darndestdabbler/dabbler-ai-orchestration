// Generated from verification-request.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * VerificationRequest (round-<n>-request.json)
 */
export type VerificationRequest = {
  schema_version: 1;
  request_id: string;
  run_id: string;
  round: number;
  tree_digest: string;
  policy_version: "run-core-1";
  orchestrator_identity: {
    engine: string;
    provider: string;
    model: string;
    identityProvenance: string | null;
  };
  excluded_providers: string[];
  evidence_manifest: unknown[];
  output_contract: "verdict-v2";
  timeout_seconds: number;
  budget: {
    max_rounds: number;
    model_dispatches_remaining: number;
    model_usd_remaining: number | null;
    elapsed_seconds_remaining: number | null;
  };
};
