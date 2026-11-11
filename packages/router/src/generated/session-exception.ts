// Generated from session-exception.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * The stop advised on, copied from run.json as the framework wrote it: any kind, since a check may be asked of every stop.
 */
export type SessionExceptionStop = {
  kind: string;
  code: string | null;
  step_id: string | null;
  /**
   * What was unmet, in the framework's words.
   */
  reason: string;
  /**
   * When the stop was written; what the loop matches the row to.
   */
  at: string;
};

export type SessionExceptionWaiver = {
  schema_version: 1;
  session_number: number;
  /**
   * The stop waived, copied from run.json as the framework wrote it.
   */
  stop: {
    /**
     * The kinds with something to go past. Every other stop has its own way on, and a waiver cannot make a push or a provider answer.
     */
    kind: "rejected-thrice" | "tests" | "verification" | "close";
    code: string | null;
    step_id: string | null;
    /**
     * What was unmet, in the framework's words.
     */
    reason: string;
    /**
     * When the stop was written; what the loop matches the waiver to.
     */
    at: string;
  };
  /**
   * Why the person authorised going on, in their words. Permanent.
   */
  reason: string;
  /**
   * Who was working, as the session record from 'dabbler session start' says; written by the verb and never typed.
   */
  by: string;
  recorded_at: string;
  /**
   * HEAD when the waiver was given.
   */
  commit: string;
  /**
   * The worktree snapshot when the waiver was given: the tree it lets through, and while the tree is still this one the waiver stands. A waiver is refused when the snapshot cannot be taken.
   */
  tree: string;
  framework_version?: string;
};

export type SessionExceptionAdvice = {
  schema_version: 1;
  session_number: number;
  /**
   * This row is advice: an opinion about the stop, never a decision, and nothing reads it as one.
   */
  advice: true;
  stop: SessionExceptionStop;
  /**
   * Who answered, and the provider they were reached on; null where nobody could be reached.
   */
  adviser: {
    model: string;
    provider: string;
  } | null;
  /**
   * Served by a script rather than a vendor.
   */
  simulated: boolean;
  /**
   * The adviser's answer, as triage.schema.json validated it on arrival; null where the adviser could not be reached.
   */
  answer: Record<string, unknown> | null;
  /**
   * Why no adviser answered, where none did.
   */
  unreachable: string | null;
  recorded_at: string;
};

/**
 * exceptions.jsonl row (a person's waiver of one stop, or advice about one)
 */
export type SessionException = SessionExceptionWaiver | SessionExceptionAdvice;
