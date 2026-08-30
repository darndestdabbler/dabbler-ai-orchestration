// Generated from plan-review.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * one round of plan review (a row of plan-review.jsonl)
 */
export type PlanReview = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the record rather than interpreting it.
   */
  schema_version: 1;
  round: number;
  recorded_at: string;
  /**
   * sha256:<hex> over the plan's core content (approved_plan.compute_plan_hash), which is defined before approval as well as after -- a review round happens while the plan is still rewritable, so it cannot bind to plan_hash.
   */
  plan_core_hash: string;
  /**
   * 'bounced': the revision did not touch the fields the previous round objected to, so it was refused without a model call.
   */
  outcome: "approved" | "amend" | "human" | "bounced";
  /**
   * False when the free checks or the anti-grind bounce settled the round. The free checks run first precisely so this can be false.
   */
  model_called: boolean;
  /**
   * Findings from the mechanical checks that cost nothing. Non-empty means no model was called this round.
   */
  free_findings: Array<{
    check: "schema" | "goal-without-step" | "step-without-goal" | "envelope-omits-named-file" | "risk-flags-not-derived";
    step_id?: string | null;
    detail: string;
  }>;
  /**
   * One entry per step the reviewer answered. Empty when no model was called.
   */
  step_verdicts: Array<{
    step_id: string;
    verdict: "approve" | "amend" | "human";
    objected_fields: Array<"intent" | "file_envelope" | "evidence_contract">;
    reason: string;
  }>;
  /**
   * Which trigger routed this round to the premium model. Empty means the cheap reviewer was used. Recorded as a list because both triggers can fire at once and a precedence rule would hide one of them.
   */
  escalation_triggers: Array<"high-risk-flag" | "repeat-objection">;
  /**
   * The steps this round judged, when it judged only some of them -- an amendment re-checks the step it changes and nothing else. Absent means the round covered the whole plan.
   */
  reviewed_steps?: string[];
  /**
   * Null when no model was called.
   */
  reviewer?: {
    model?: string;
    provider?: string;
    role?: string;
    transport?: string;
  } | null;
  /**
   * step_id -> field -> sha256 of that field's value as this round saw it. The next round recomputes these to decide whether a revision actually touched what was objected to, which is what makes the anti-grind bounce free.
   */
  objected_field_digests: Record<string, Record<string, string>>;
};
