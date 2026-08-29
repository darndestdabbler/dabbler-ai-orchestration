// Generated from check-ir.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * Terminal operators. They read the selected content and do not nest.
 */
export type CheckIrLeafOperator = {
  exists?: string;
  equals?: Array<string | number | boolean | null>;
  count?: {
    of: string;
    operator: "eq" | "lte" | "gte";
    value: number;
  };
};

/**
 * Second and final level of nesting. Its operands are terminal.
 */
export type CheckIrConditionL2 = CheckIrLeafOperator | {
  not?: CheckIrLeafOperator;
  all?: CheckIrLeafOperator[];
  any?: CheckIrLeafOperator[];
  for_each?: {
    in: string;
    satisfies: CheckIrLeafOperator;
  };
  if?: {
    condition: CheckIrLeafOperator;
    then: CheckIrLeafOperator;
    else?: CheckIrLeafOperator;
  };
};

/**
 * Top level of the condition tree. Nesting below this point is bounded at one further level, so the deepest legal expression is two levels of operators over terminals.
 */
export type CheckIrConditionL1 = CheckIrLeafOperator | {
  not?: CheckIrConditionL2;
  all?: CheckIrConditionL2[];
  any?: CheckIrConditionL2[];
  for_each?: {
    in: string;
    satisfies: CheckIrConditionL2;
  };
  if?: {
    condition: CheckIrConditionL2;
    then: CheckIrConditionL2;
    else?: CheckIrConditionL2;
  };
};

export type CheckIrEvidenceShape = {
  requires: Array<"quote" | "absence-search" | "g0-fact" | "adjudication-note">;
  min_quotes?: number;
};

/**
 * check IR v1 (one bounded question put to a worker)
 */
export type CheckIr = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the check rather than interpreting it.
   */
  schema_version: 1;
  check_id: string;
  /**
   * What produced this check — a corpus entry, a claim, or a rule id.
   */
  source: string;
  /**
   * A deterministic executor never routes to a model.
   */
  executor: "worker-model" | "g0-deterministic";
  /**
   * Exactly one imperative semantic question. Two questions are two checks.
   */
  objective: string;
  /**
   * One closed source of the things the check ranges over.
   */
  selector: {
    from: "changed-files" | "changed-hunks" | "claims" | "g0-facts" | "manifest-paths";
    /**
     * Globs or fact keys narrowing the selected set. Never a query language.
     */
    filter?: string[];
  };
  condition: CheckIrConditionL1;
  scope: {
    paths: string[];
    /**
     * Whether only changed content is eligible evidence.
     */
    changed_only: boolean;
  };
  /**
   * Named outcomes. Names are the check's vocabulary, not free prose.
   */
  branch: Record<string, {
    when: CheckIrConditionL2;
    outcome: "pass" | "fail" | "blocked";
  }>;
  /**
   * All three shapes are required. A check that cannot say what would satisfy it, what would refute it, and what would block it is not a check.
   */
  evidence: {
    pass: CheckIrEvidenceShape;
    fail: CheckIrEvidenceShape;
    blocked: CheckIrEvidenceShape;
  };
  /**
   * The only paths the worker process may read. Enforced by the execution environment, not asserted in a prompt.
   */
  authorized_pulls: string[];
  bounds: {
    max_files: number;
    max_bytes: number;
    timeout_seconds: number;
  };
};
