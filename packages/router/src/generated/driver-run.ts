// Generated from driver-run.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

export type DriverRunStopKind = "budget" | "rejected-thrice" | "blocked" | "engine" | "tests" | "verification" | "land" | "publish" | "close" | "interrupted";

/**
 * The work-plan step the loop was on when it halted, or null when it was not on one -- a verification round, the suite, the close. Two stops on different steps are not the same stop however alike their reasons read.
 */
export type DriverRunStopStepId = string | null;

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
   * Where the loop is. A re-run enters here; `complete` means the close ran and nothing is left to do. `publish` sits between the land and the close, and runs only for a session whose plan declared it releasable: packaging asks the close's own gates, and neither `working_tree_clean` nor `pushed_to_remote` passes before the commit and the push, so it cannot run earlier.
   */
  phase: "plan" | "steps" | "preverify" | "verify" | "dispositions" | "fix" | "run-of-record" | "land" | "gate-wait" | "publish" | "close" | "complete";
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
     * Which bound the loop met: the invocation budget; a step refused three times; the engine reporting `blocked`; the engine failing to run; a test run the framework could not hand back; a verification round that neither passed nor produced findings to dispose; the commit or push; packaging refusing or failing to reach the feed; the close's gates; a person asking it to stop (`session interrupt --stop`, with their reason).
     */
    kind: DriverRunStopKind;
    reason: string;
    at: string;
    step_id?: DriverRunStopStepId;
    /**
     * Whether this bound has been met like this before. `deadlock` is the same kind, the same step and the same reason as the stop immediately before it -- the loop is not making progress, and no number of re-runs will change that by itself. It is optional so that a run written before this field is still a run this reader opens; its absence means nothing was classified, not that the stop was a first.
     */
    class?: "first" | "deadlock";
  } | null;
  /**
   * The stops this run has already met, oldest first and capped -- the oldest is dropped rather than the newest, because what a deadlock is read from is the recent end. It is here, and short, because `run.json` is state: the history of a run is its transcripts, and this is only enough of it to see the loop going nowhere.
   */
  stop_history?: {
    kind: DriverRunStopKind;
    /**
     * The stop's own reason as the loop raised it, undecorated. What `stop.reason` shows a person may say more; this is what the next stop is compared against, and a comparison against a decorated reason would never match twice running.
     */
    reason: string;
    at: string;
    step_id?: DriverRunStopStepId;
  }[];
  /**
   * The stop the run resumed past, until the phase moves on. Set by the resume that clears `stop`, and cleared by the first phase change after it -- the one honest 'progress resumed', said exactly once -- or by a new stop landing first, which is spoken as its own pause. On the record rather than in memory because under the pull every `next` is a fresh process, and the process that resumes is never the one that advances. Optional: a run written before this member is a run this reader opens, and its absence means nothing was resumed past.
   */
  resumed_from?: {
    kind: DriverRunStopKind;
    at: string;
    step_id?: DriverRunStopStepId;
    /**
     * The phase the stop stood in, which a resume re-enters. Progress is the loop leaving it.
     */
    phase: string;
  } | null;
  /**
   * What the unattended ladder found, once per impasse. Optional and absent under the pull: an attended engine calls `dabbler triage` itself, and the framework does not spend a provider call on behalf of somebody who is sitting right there.
   */
  triage?: {
    /**
     * The stop reason the ladder was climbed for, undecorated. A re-run that reaches the same impasse does not ask again: the answer would be the same one, and the second call is spent for nothing.
     */
    for_reason: string;
    for_step?: DriverRunStopStepId;
    /**
     * How many advisers were asked before the ladder ended, one per rung. It ends at a classification or at the human; no rung loops.
     */
    rungs: number;
    /**
     * What the adviser called it, or null when none could say -- which is a fact about the ladder and not a missing value.
     */
    classification?: string | null;
    /**
     * The model that classified it and the provider it answered on, for a person deciding how much weight to give the opinion.
     */
    adviser?: string | null;
    /**
     * The change an adviser proposed, kept whole because the option on the owed decision is otherwise a menu item with nothing behind it: the proposal lives in one process and the person who answers is in another. Nothing here is applied by the framework -- it is what a person needs in order to type `dabbler session plan amend` themselves, or to decide not to.
     */
    amendment?: {
      step_id: string;
      files?: string[];
      checks?: {
        argv: string[];
      }[];
      reason: string;
      relaxes_a_gate: boolean;
    } | null;
    at: string;
  } | null;
  /**
   * How many times the outstanding answer has been refused, out of the three a step is allowed. It is here rather than in a local because a pull-mode call -- `dabbler session next` -- ends between the refusal and the answer, and a count a process holds is a count that resets every time the person's CLI comes back.
   */
  rejections?: number;
  /**
   * How many times this run has answered a verify refusal by going back to the pre-verification phase rather than stopping. `verify` refuses when the targeted evidence does not match the tree, and running the affected tests again is exactly what makes that precondition true -- so the driver heals it instead of stopping in a phase it would re-enter forever. It is counted, and on disk rather than in a local, because a gate the preverify phase CANNOT satisfy would otherwise loop between the two: past the bound the driver stops and hands the operator verify's own reason.
   */
  preverify_heals?: number;
  /**
   * Which driver holds this run. Every process that resumes the loop takes the lease by writing epoch+1 before its first move, and every later save is compare-and-swap against the disk: a save whose in-memory epoch is behind the file's is a stale attempt -- on 2026-09-02 two drivers wrote one run and phases were skipped silently -- and it stops instead of advancing state. Absent on records from before the fence; read as epoch 1.
   */
  lease_epoch?: number;
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
