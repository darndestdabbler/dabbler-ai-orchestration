// Generated from session-exception.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * exceptions.jsonl row (one person's waiver of one stop)
 */
export type SessionException = {
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
   * The worktree snapshot when the waiver was given, so a reader can see which tree was let through. Absent when the snapshot could not be taken.
   */
  tree?: string;
  framework_version?: string;
};
