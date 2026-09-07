// Generated from run-event.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

export type RunEventPolicy = "fast" | "verified";

export type RunEventSelection = {
  selected: {
    path: string;
    reason: string;
    selectedBy: string;
    /**
     * The declared suite whose test_roots and test_glob claim this file. Absent when no suite's declaration claims it -- a path selected by a mapping rule alone, or a repository that declares no test locations. Optional rather than required because rows written before suites declared their own test locations carry no owner and must stay readable.
     */
    suite?: string;
  }[];
  risks: {
    kind: string;
    path: string;
    detail: string;
  }[];
  allTestsAffected: boolean;
  allAffectedReason: string;
  policy?: string;
  policyReason?: string;
};

export type RunEventRunCreated = {
  policy: RunEventPolicy;
  ask: string;
  base_commit: string | null;
  worktree_id: string;
  branch: string | null;
  session_number: number;
  prepared?: boolean;
  /**
   * Only ever set by the version 1 migration, and only on records that belong to a retired session set. Its presence means 'this run is history, not a session of this repository': the projection keeps it visible under runs and never joins it to a plan session, because that set numbered its sessions from 1 and so does this repository. Absent on everything the current machinery writes.
   */
  legacy_set?: string;
};

export type RunEventRunStarted = {
  mode: "wrapped" | "registered";
  engine: string;
  provider: string;
  model: string;
  identity_provenance: string | null;
  identity_source?: string;
};

export type RunEventRunCheckpoint = {
  note: string;
  ack_guidance_through: number | null;
  uncertain?: boolean;
};

export type RunEventRunWaiting = {
  reason?: "operator";
} | {
  reason?: "dependency";
};

export type RunEventRunResumed = {
  probe: RunEventProbe;
  answered_sequence: number | null;
  round_limit?: number;
  dispatch_limit?: number;
  model_usd_budget?: number | null;
  elapsed_minutes_budget?: number | null;
};

export type RunEventProbe = {
  ok: boolean;
  findings: string[];
  worktree_present?: boolean;
  head_commit?: string | null;
  head_matches_base?: boolean;
  last_check?: string | null;
  second_heartbeat?: boolean;
  orphan_commit?: string | null;
  interrupted_check?: string | null;
  interrupted_round?: number | null;
};

export type RunEventRunGuidance = {
  text: string;
  answers_sequence: number | null;
};

export type RunEventCheckStarted = {
  check_id: string;
  stage: "targeted" | "final-full";
  command: string;
  tree_digest: string;
  selection: RunEventSelection;
  kind?: string;
  required?: boolean;
};

export type RunEventCheckCompleted = {
  check_id: string;
  stage: "targeted" | "final-full";
  command: string;
  exit_code: number | null;
  duration_seconds: number;
  outcome: "passed" | "failed";
  timed_out: boolean;
  tree_digest: string;
  post_tree_digest: string | null;
  tree_mutated: boolean;
  selection: RunEventSelection;
  report_ref: string | null;
  kind?: string;
  required?: boolean;
};

export type RunEventVerificationDispatched = {
  request_id: string;
  round: number;
  tree_digest: string;
  excluded_providers: string[];
};

export type RunEventVerificationResultPayload = {
  request_id: string;
  attempt: number;
  tree_digest: string;
  verdict: "VERIFIED" | "ISSUES_FOUND" | null;
  error_class: string | null;
  round?: number;
};

export type RunEventRemediationStarted = {
  round: number;
  finding_count: number;
};

export type RunEventRunCostUpdated = {
  dispatch_id: string;
  cost_usd: number | null;
  pricing_status: "priced" | "unpriced";
  source: string;
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    credits?: number | null;
  };
};

export type RunEventRunFinished = {
  outcome: "completed" | "failed" | "cancelled";
  commit: string | null;
  tree_digest: string | null;
  verdict: "VERIFIED" | "ISSUES_FOUND" | "WAIVED" | "REMEDIATED_AT_CAP" | null;
  unreviewed_findings?: number | null;
  checks_green: boolean;
  pushed?: boolean;
};

export type RunEventOrganizationChange = {
  session_number?: number;
  reason: string;
  /**
   * Only ever set by the version 1 migration, and only on records that belong to a retired session set. Its presence means 'this run is history, not a session of this repository': the projection keeps it visible under runs and never joins it to a plan session, because that set numbered its sessions from 1 and so does this repository. Absent on everything the current machinery writes.
   */
  legacy_set?: string;
};

export type RunEventWorktreeCreated = {
  worktree_id: string;
  branch: string;
  base_commit: string;
};

export type RunEventWorktreeTask = {
  id: string;
  argv: string[];
  shell_command?: string | null;
  exit_code: number | null;
  duration_seconds: number;
  timed_out?: boolean;
  probe: "passed" | "failed" | "not_declared";
  outcome?: "passed" | "failed";
};

export type RunEventWorktreeOutcome = {
  worktree_id: string;
  tasks: RunEventWorktreeTask[];
};

export type RunEventWorktreeFailure = {
  worktree_id: string;
  tasks: RunEventWorktreeTask[];
  failed_task: string;
  detail?: string;
};

export type RunEventEscalationTriggered = {
  trigger: "operator-request" | "sensitive-path" | "no-declared-check" | "selection-unknown" | "repeated-check-failure" | "agent-uncertain" | "diff-limit";
  from_policy: RunEventPolicy;
  to_policy: "verified";
  detail?: string;
};

/**
 * Run journal event (.dabbler/journal.jsonl)
 */
export type RunEvent = {
  event_type?: "run.created";
  payload?: RunEventRunCreated;
} | {
  event_type?: "run.started";
  payload?: RunEventRunStarted;
} | {
  event_type?: "run.checkpoint";
  payload?: RunEventRunCheckpoint;
} | {
  event_type?: "run.waiting";
  payload?: RunEventRunWaiting;
} | {
  event_type?: "run.resumed";
  payload?: RunEventRunResumed;
} | {
  event_type?: "run.guidance";
  payload?: RunEventRunGuidance;
} | {
  event_type?: "check.started";
  payload?: RunEventCheckStarted;
} | {
  event_type?: "check.completed";
  payload?: RunEventCheckCompleted;
} | {
  event_type?: "verification.dispatched";
  payload?: RunEventVerificationDispatched;
} | {
  event_type?: "verification.result";
  payload?: RunEventVerificationResultPayload;
} | {
  event_type?: "remediation.started";
  payload?: RunEventRemediationStarted;
} | {
  event_type?: "run.cost_updated";
  payload?: RunEventRunCostUpdated;
} | {
  event_type?: "run.finished";
  payload?: RunEventRunFinished;
} | {
  event_type?: "organization.cancelled";
  payload?: RunEventOrganizationChange;
} | {
  event_type?: "organization.restored";
  payload?: RunEventOrganizationChange;
} | {
  event_type?: "worktree.created";
  payload?: RunEventWorktreeCreated;
} | {
  event_type?: "worktree.ready";
  payload?: RunEventWorktreeOutcome;
} | {
  event_type?: "worktree.failed";
  payload?: RunEventWorktreeFailure;
} | {
  event_type?: "escalation.triggered";
  payload?: RunEventEscalationTriggered;
};
