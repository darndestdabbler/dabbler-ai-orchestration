// Generated from approved-plan.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * approved-plan.json (the pre-registered, hashed step-by-step plan for one session)
 */
export type ApprovedPlan = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the record rather than interpreting it.
   */
  schema_version: 1;
  session_number: number;
  /**
   * The session's authored slug -- the short, hand-picked label the session heading declares beside its number.
   */
  session_slug: string;
  /**
   * At most seven -- refused here, not counted by a reviewer. The lifecycle ceremony around every session (register, affected tests, verification, run of record, close-out) is not a step and never enters this array.
   */
  steps: Array<{
    /**
     * The one identity addressing this step in spec.md, activity-log.json and here.
     */
    step_id: string;
    /**
     * One sentence, imperative.
     */
    intent: string;
    /**
     * The paths this step may create or modify. Nothing else.
     */
    file_envelope: string[];
    /**
     * What will prove this step was done correctly. Empty is invalid -- a step that declares no proof is refused here, not caught later by a reviewer.
     */
    evidence_contract: Array<{
      description: string;
      /**
       * 'deterministic': a test, compile, lint, or analyzer result the framework can execute. 'judgment': needs a model to read something.
       */
      kind: "deterministic" | "judgment";
    }>;
    /**
     * Derived mechanically from the file envelope and the repository manifest -- never declared by the step's own author.
     */
    risk_flags: Array<"public-interface" | "integration-module" | "sensitive-path" | "dependency-change">;
  }>;
  /**
   * The build files whose contract (target framework, language version, JDK, wrapper) this session may move under posture: maintenance, and why. A core field, bound into plan_hash at approval, so no amendment can add it. A record of the change, never the grant: this file is writable by the engine the contract holds, so what releases a file from the contract control is the **Contract change.** paragraph in the session's section of session-plan.md as committed at HEAD, with or without this member.
   */
  contract_change?: {
    /**
     * Repository-relative build files released from the contract control.
     */
    files: string[];
    reason: string;
  };
  approved: boolean;
  approved_at?: string | null;
  /**
   * sha256:<hex> over every field except 'amendments', bound in at approval.
   */
  plan_hash?: string | null;
  /**
   * Append-only. The only legal change to an approved plan. An amendment carries the change itself, not a note about it: 'added_files' widens the amended step's envelope and 'evidence_contract' replaces its proof, and the plan a reader acts on is the core folded with its amendments in order (approved_plan.effective_plan). The core is never rewritten, so plan_hash never moves.
   */
  amendments: Array<{
    recorded_at: string;
    step_id: string;
    reason: string;
    changed_fields?: string[];
    /**
     * Paths this amendment adds to the amended step's file envelope.
     */
    added_files?: string[];
    /**
     * The amended step's replacement proof. Present only when this amendment changes an evidence criterion.
     */
    evidence_contract?: Array<{
      description: string;
      kind: "deterministic" | "judgment";
    }>;
  }>;
};
