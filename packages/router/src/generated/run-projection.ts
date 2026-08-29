// Generated from run-projection.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

export type RunProjectionRun = {
  run_id: string;
  policy: "fast" | "verified";
  state: "created" | "running" | "waiting" | "verifying" | "remediating" | "completed" | "failed" | "cancelled";
  waiting_reason: "operator" | "dependency" | null;
  waiting_sequence?: number | null;
  ask: string;
  session_number: number;
  engine: string | null;
  provider: string | null;
  model?: string | null;
  branch: string | null;
  worktree_id?: string | null;
  base_commit?: string | null;
  started_at: string | null;
  last_activity_at: string | null;
  pending_guidance: number;
  attempt: number;
  escalations?: string[];
  tasks: Array<{
    id: string;
    label: string;
    state: "pending" | "in-progress" | "waiting" | "complete" | "failed";
    started_at: string | null;
    last_activity_at: string | null;
  }>;
  checks: Array<{
    check_id: string;
    stage: "targeted" | "final-full";
    outcome: "passed" | "failed";
    duration_seconds: number;
    tree_digest?: string;
    tree_mutated?: boolean;
    required?: boolean;
  }>;
  verification: {
    rounds: number;
    last_verdict: "VERIFIED" | "ISSUES_FOUND" | "WAIVED" | "REMEDIATED_AT_CAP" | null;
    verifier_provider: string | null;
    transport: string | null;
    accepted_tree_digest?: string | null;
    blocking_findings?: number;
    minor_findings?: number;
    round_limit?: number;
    dispatch_limit?: number;
  };
  cost: {
    model_usd: number;
    unpriced_calls: number;
    dispatches?: number;
  };
  commit: string | null;
  outcome: "completed" | "failed" | "cancelled" | null;
  verdict?: "VERIFIED" | "ISSUES_FOUND" | "WAIVED" | "REMEDIATED_AT_CAP" | null;
  checkpoints?: {
    sequence: number;
    note: string;
    occurred_at: string;
    uncertain?: boolean;
  }[];
};

/**
 * run-projection.json (.dabbler/run-projection.json)
 */
export type RunProjection = {
  schema_version: 1;
  projection_revision: number;
  organization_digest: string;
  generated_at: string | null;
  diagnostics?: {
    detail: string;
  }[];
  sessions: Array<{
    number: number;
    title: string;
    policy: "fast" | "verified";
    state: "not-started" | "in-progress" | "complete" | "cancelled";
    run_ids: string[];
    current_run_id?: string | null;
    needs_attention?: boolean;
  }>;
  runs: RunProjectionRun[];
};
