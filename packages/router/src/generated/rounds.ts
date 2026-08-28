// Generated from rounds.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * rounds.jsonl row (one verification round)
 */
export type Rounds = {
  round: number;
  phase?: "full" | "fix-delta";
  verdict: "VERIFIED" | "ISSUES_FOUND" | "WAIVED" | "REMEDIATED_AT_CAP";
  blocking: boolean;
  verifier_model?: string;
  verifier_provider?: string;
  orchestrator_provider?: string;
  findings: Array<{
    description: string;
    severity: "critical" | "major" | "minor";
    category?: string;
    failureScenario?: string;
    evidencePaths?: string[];
    blocking?: boolean;
  }>;
  /**
   * Historical only. Dollars are not computed anywhere in this framework -- tokens are the record and the vendor's console is the reconciliation -- so no writer emits this key; it stays readable because older ledgers carry it.
   */
  cost_usd?: number | null;
  baseline_tree?: string | null;
  completion_tree: string;
  /**
   * The framework-authored commit whose tree is completion_tree, named by refs/dabbler/rounds/s<N>/r<R> from the moment the row was appended. It is what makes the baseline survive garbage collection and travel with a push. Absent on rows written before rounds were anchored, and on a row whose tree the writing store did not hold; verify reanchor is the recovery for both.
   */
  anchor_commit?: string;
  previous_tree?: string;
  /**
   * The commit HEAD stood at when this round was recorded. A baseline recovery places itself by topology when this is present and falls back to committer timestamps when it is not, so rows written before this field existed still resolve. Optional for exactly that reason.
   */
  head_commit?: string | null;
  /**
   * Present only when this round was measured from a substitute baseline because the previous round's snapshot tree was unreachable in this object store (see baseline-reanchors.jsonl). previous_tree still names where the previous round ended; anchor_tree names where this round actually diffed from. A round carrying this key is a weaker record than one without it.
   */
  baseline_reanchor?: {
    recorded_tree: string;
    anchor_tree: string;
  };
  recorded_at: string;
  transport?: string;
  /**
   * The verifier's tool surface for this round: what it was granted, and what it did with it. mode 'none' is a round that could not look at the tree at all (the direct-API path sends no tools) and is never equivalent to one that could. in_scope means the operation was confined to the grant: a read names a path and is placed against the scope, while a search or listing is confined only when it also names a path — a pattern on its own reaches the whole tree and is recorded as unconfined. Each read carries a fidelity: 'verbatim' means the shown lines matched the bytes on disk, 'transformed' means they did not (the credential scrubber rewrites text before a model sees it, and a finding resting on a transformed read is weighable rather than trustable), 'unverified' means the comparison could not be made. 'writes' is the fourth operation and the only one no tool performs: the verifier proposes a test file in its answer and the framework writes the bytes, so a proposal outside the declared test root is refused before anything reaches the filesystem. Every proposal is recorded, applied or refused, because a boundary nobody can see being enforced is indistinguishable from one that is not there.
   */
  agency?: {
    mode: "tools" | "none";
    operations_granted?: Array<"list" | "search" | "read" | "write">;
    read_budget?: number;
    scope?: string[];
    scope_size?: number;
    reads?: number;
    listings?: number;
    searches?: number;
    out_of_scope?: number;
    over_budget?: number;
    transformed_reads?: number;
    reason?: string;
    operations?: Array<{
      kind: "list" | "search" | "read";
      target: string;
      in_scope: boolean;
      fidelity?: "verbatim" | "transformed" | "unverified";
      detail?: string;
    }>;
    writes_applied?: number;
    writes_refused?: number;
    writes?: Array<{
      path: string;
      outcome: "accepted" | "refused";
      action?: "created" | "modified";
      bytes?: number;
      reason?: string;
    }>;
  };
  type?: "adjudication" | "waive" | "remediated_at_cap";
  excluded_providers?: string[];
  outcomes?: Array<{
    finding_index: number;
    outcome: "UPHELD" | "OVERRULED";
    reasons?: string;
  }>;
  attestation?: string;
  remediated?: {
    reviewed_round: number;
    findings: Record<string, unknown>[];
  };
  waived?: {
    exhausted_via: "upheld-adjudication" | "adjudication-unavailable";
    findings: Record<string, unknown>[];
  };
};
