// Generated from driver-run.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * driver/run.json (where a driven session's loop is, and why it stopped)
 */
export type DriverRun = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the file rather than interpreting it.
   */
  schema_version: 1;
  session_number: number;
  /**
   * The adapter the engine is reached through, by name. A re-run with a different one is refused: one engine's session store carries the run.
   */
  engine: string;
  /**
   * Where the loop is. A re-run enters here; `complete` means the close ran and nothing is left to do.
   */
  phase: "plan" | "steps" | "preverify" | "verify" | "dispositions" | "fix" | "run-of-record" | "land" | "close" | "complete";
  /**
   * The seq of the instruction last issued, so the next one is monotonic across re-runs.
   */
  seq: number;
  /**
   * How many times the engine has been invoked for this session, across re-runs. On a seat each one is a premium request.
   */
  invocations: number;
  /**
   * The bound `invocations` is held under. Reaching it stops the loop and closes nothing; continuing is a re-run with a larger bound, which is a decision to spend more.
   */
  max_invocations: number;
  /**
   * The work-plan steps whose reports were accepted, in order. A re-run skips them.
   */
  accepted_steps: string[];
  /**
   * The tree object the working tree was at after the last accepted step, which is what the next report's `files_changed` is measured against. Null before the first step.
   */
  baseline_tree: string | null;
  /**
   * Null while the loop runs or after it completed. Set when it halted short of the close, with the reason in words; the session stays in flight and this is what the operator reads.
   */
  stop: {
    /**
     * Which bound the loop met: the invocation budget; a step refused three times; the engine reporting `blocked`; the engine failing to run; a test run the framework could not hand back; a verification round that neither passed nor produced findings to dispose; the commit or push; the close's gates; a person asking it to stop (`session interrupt --stop`, with their reason).
     */
    kind: "budget" | "rejected-thrice" | "blocked" | "engine" | "tests" | "verification" | "land" | "close" | "interrupted";
    reason: string;
    at: string;
  } | null;
  /**
   * How many times the outstanding answer has been refused, out of the three a step is allowed. It is here rather than in a local because a pull-mode call -- `dabbler session next` -- ends between the refusal and the answer, and a count a process holds is a count that resets every time the person's CLI comes back.
   */
  rejections?: number;
  /**
   * The one long-running thing the framework has started and has not yet collected, or null. Long work is never awaited inside a call: a verification round, the complete suite and the close each outlast an engine's tool timeout, so they are started detached and the following call reports progress or the result.
   */
  job?: {
    /**
     * What the framework is running, in the words the instruction shows: a verification round, a suite's run of record, the close.
     */
    name: string;
    /**
     * The program and its arguments, spawned with no shell.
     */
    argv: string[];
    pid: number;
    /**
     * Where the job's output is being appended, repository-relative -- the path a `wait` hands back.
     */
    log: string;
    /**
     * The file the runner writes the exit code into when the job ends, repository-relative. Its presence is what tells a finished job from a running one; a pid alone cannot, because pids are reused.
     */
    status: string;
    started_at: string;
    retry_after_seconds: number;
  } | null;
  /**
   * The round cap and transport this session verifies under, as the call that opened the run named them. They belong to the run rather than to a call: under the pull the call that eventually starts verification is not the one the person typed them on -- it is whichever `dabbler session next` happens to reach that phase, following an `answer_command` that names neither. A later call may name them again to change them.
   */
  verification?: {
    max_rounds?: number | null;
    transport?: string | null;
  } | null;
  /**
   * The engine's own conversation, by the id it reported on its first invocation. A resume names it; nothing here asks an engine for its most recent session, because the most recent one in a directory can be somebody else's.
   */
  engine_session_id?: string | null;
  started_at: string;
  updated_at: string;
};
