// `dabbler session drive` -- the framework runs the session; the engine
// answers.
//
// The typed lifecycle asks an engine to follow nine steps in prose, and a
// less capable engine wanders off them. Here the framework owns the
// control flow and calls the engine once per thing it needs: a work plan,
// then each step, then a disposition of whatever the verifier found. Every
// answer the loop acts on is JSON against a schema (`driver.ts`), judged
// mechanically and refused with reasons; prose the engine writes is for
// people and is never read here; code and tests are compiled and run, never
// interpreted. Every phase that already exists as a verb -- register,
// declare, affected, the evidence record, verify, the run of record, the
// close -- is called as that verb, so the record a driven session leaves is
// the record a typed one leaves, and the task rows move for the same
// reasons.
//
// The engine is reached through one interface, `Engine.invoke`, and the
// adapters behind it -- the three CLIs' measured argv shapes, the operator's
// own command -- are `engines.ts`. What this module owns of the exchange
// is the transcript (every line the engine prints, verbatim, whether or not
// `driver.engine_output` shows it) and the interrupt: a request written to
// the ledger by `session interrupt` ends the running invocation, and the
// same instruction is re-issued as `kind: interrupt` carrying the reason, so
// the engine keeps everything up to its last completed step and reads what
// changed. One path for every interrupter -- a person, a gate, a finding
// that arrived mid-step.
//
// Bounded twice. A step is refused at most three times before the loop
// stops, and the engine is invoked at most `driver.max_invocations` times
// per session -- on a seat every invocation is a premium request, and each
// is reported against the bound as it is spent. A stopped loop closes
// nothing: the session stays in flight, `run.json` says why, and a re-run
// continues from the phase it reached.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  checkRunGreen,
  makeCheck,
  timeoutFor,
  execute as executeCheck,
} from "./checks.ts";
import { divertOut, writeErr, writeOut } from "./output.ts";
import {
  ConfigError,
  type RouterConfig,
  driverEngineOutput,
  driverInvocationCap,
  loadConfig,
  verificationRoundCap,
} from "./config.ts";
import {
  DISPOSITION_SCHEMA,
  DRIVER_DIRNAME,
  DRIVER_SCHEMA_VERSION,
  REPORT_SCHEMA,
  WATCHER_OUTSTANDING,
  WORK_PLAN_SCHEMA,
  instructionPath,
  clearDispositions,
  readDispositions,
  readInstruction,
  readReport,
  readRun,
  readWatcher,
  readWorkPlan,
  takeInterrupt,
  transcriptPath,
  writeInstruction,
  writeRun,
  appendSupervision,
} from "./driver.ts";
import { readRawSessionState } from "./sessionState.ts";
import { repoRootFromSessionsDir } from "./evidence.ts";
import { BUILT_IN_ENGINES, builtInEngine } from "./engines.ts";
import type { Engine, EngineOutput } from "./engines.ts";
import { clip, stripEscapes } from "./engines.ts";
import { SESSION_PLAN_FILENAME } from "./evidence.ts";
import { SET_BOOKKEEPING_COMMIT_BASENAMES, checkVerificationClean } from "./gates.ts";
import type {
  DriverInstruction,
  DriverReport,
  DriverRun,
  DriverWorkPlan,
  Triage,
} from "./generated/index.ts";
import { type Job, endJob, jobLogTail, pollJob, selfArgv, startJob } from "./jobs.ts";
import { SolutionDepsError, placeMember } from "./solutionDeps.ts";
import { tryWriteProjection } from "./workflow/project.ts";
import {
  changedPathsBetween,
  nowIso,
  repoRelativePath,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
} from "./journal.ts";
import {
  LedgerError,
  RUNS_DIRNAME,
  type Row,
  latestRound,
  readDisputes,
  readRounds,
} from "./ledger.ts";
import {
  CLASS_VALUE_TRADEOFF,
  openDecisions,
  raiseOwed,
  supersedeOwed,
} from "./owedDecisions.ts";
import { readSessionState, sessionDisplayNumber, stalledAfterSeconds } from "./progress.ts";
import { TriageError, type TriageOutcome, collectArtifacts, triage } from "./triage.ts";
import {
  EXIT_BOUNDARY,
  EXIT_GATE_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  declare,
  extractSpecExcerpt,
  start,
  acquireLockWithTimeout,
  releaseLock,
} from "./session.ts";
import { loadSuitesChecked } from "./testEvidence.ts";
import { recordDispute, resolveRepoRelative } from "./verify/disputes.ts";
import {
  EXIT_BLOCKING,
  EXIT_OK as VERIFY_OK,
  EXIT_UNRESOLVED,
} from "./verify/errors.ts";
import {
  NO_ROUND_CAP_CLEAN,
  NO_ROUND_TERMINAL,
  noRoundReason,
} from "./verify/rounds.ts";
import { readTaskDeclaration, sessionIsReleasable } from "./writers.ts";

// --- The engine --------------------------------------------------------------

// The interface and the adapters live in `engines.ts`; they are re-exported
// here because the loop is what a caller holds.
export {
  type Engine,
  type EngineInvocation,
  type EngineOutcome,
  type EngineOutput,
  INSTRUCTION_ENV_VAR,
  INSTRUCTION_PLACEHOLDER,
  builtInEngine,
  commandEngine,
} from "./engines.ts";

// --- The run -----------------------------------------------------------------

export interface DriveOptions {
  readonly engine: string;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly effort?: string | null;
  readonly adapter: Engine;
  /** Overrides `driver.engine_output`: show the engine's output as it runs, or only record it. */
  readonly engineOutput?: EngineOutput | null;
  /** Overrides `driver.max_invocations`; a re-run past a budget stop passes a larger one. */
  readonly maxInvocations?: number | null;
  readonly transport?: string | null;
}

/** What `dabbler session next` takes: no adapter, because there is no engine to invoke. */
export interface NextOptions {
  /** Required only when no session is in flight yet; `next` then registers one. */
  readonly engine?: string | null;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly effort?: string | null;
  readonly transport?: string | null;
}

/**
 * The loop's own options. `push` invokes an engine between moves; `pull`
 * returns the instruction and lets the person's own CLI be the engine.
 * There is one loop under both.
 */
interface DriverOptions extends Omit<DriveOptions, "engine" | "adapter"> {
  readonly engine: string | null;
  readonly adapter: Engine | null;
  readonly mode: "push" | "pull";
}

export const MAX_REJECTIONS = 3;

/**
 * Whether this driver still holds the lease on the run it is about to write.
 *
 * Two drivers wrote one run on 2026-09-02 and phases were skipped silently.
 * A save whose in-memory epoch is BEHIND the file's is that second driver:
 * something else took the lease while this process was working, so this
 * process's view of the run is stale and advancing state from it would
 * overwrite what the holder wrote. Equal is the ordinary case -- one driver,
 * saving repeatedly -- and a disk epoch behind the caller's cannot happen
 * without the file having been rewound, which is not this fence's to judge.
 */
export function judgeLease(mine: number, onDisk: number): { readonly refusal: string | null } {
  if (onDisk <= mine) return { refusal: null };
  return {
    refusal:
      `another driver holds the lease (epoch ${onDisk}; this process took ${mine}). ` +
      "A stale attempt does not advance the run; its record ends here.",
  };
}

/**
 * The epoch a driver takes when it registers or resumes: one past whatever
 * stood. Taking the same one would let two processes both believe they hold
 * the run, which is the fence's whole subject.
 */
export function nextLeaseEpoch(existing: number | null | undefined): number {
  return (existing ?? 1) + 1;
}

/**
 * What the tree moved that belongs to a step.
 *
 * The ledger's own bookkeeping is not a step's work: it is written by the
 * lifecycle on the way past, and counting it would make every step's report
 * omit a file it never touched. Canonical on both sides, because git answers
 * with its own spelling of the root while the sessions directory is whatever
 * the caller was handed.
 */
export function stepChangedPaths(
  diff: readonly string[],
  sessionsRel: string,
): string[] {
  return diff.filter((path) => {
    const name = path.split("/").pop() ?? path;
    return !(path.startsWith(`${sessionsRel}/`) && SET_BOOKKEEPING_COMMIT_BASENAMES.includes(name));
  });
}

/**
 * Whether a report answers the instruction it was handed at all.
 *
 * Read before the tree is: a report about something else cannot be measured
 * against this change set, and reading the tree to say so would be work
 * spent on an answer already known to be the wrong one. `"blocked"` is the
 * engine saying the step cannot be done; `"ok"` sends it on to the files.
 */
export function judgeReportShape(
  report: DriverReport | null,
  instruction: DriverInstruction,
  spec: StepSpec,
): string[] | "blocked" | "ok" {
  if (report === null) {
    return [
      refusal(
        RULE.noReport,
        `no report was written for instruction ${instruction.seq}; the answer is ` +
          `\`${instruction.answer_command}\``,
      ),
    ];
  }
  const reasons: string[] = [];
  if (report.seq !== instruction.seq) {
    reasons.push(
      refusal(
        RULE.reportSeq,
        `the report answers seq ${report.seq}; instruction ${instruction.seq} is outstanding`,
      ),
    );
  }
  if (report.step_id !== spec.id) {
    reasons.push(
      refusal(
        RULE.reportStep,
        `the report is for step '${report.step_id}'; the instruction asked for '${spec.id}'`,
      ),
    );
  }
  if (reasons.length > 0) return reasons;
  return report.status === "blocked" ? "blocked" : "ok";
}

/**
 * Whether the report names exactly what the tree moved.
 *
 * `exists` is the one read, passed in: a named file the tree did not change
 * is a different refusal depending on whether it is there at all.
 */
export function judgeReportFiles(
  report: DriverReport,
  changed: readonly string[],
  exists: (file: string) => boolean,
): string[] {
  const reasons: string[] = [];
  for (const file of report.files_changed) {
    if (changed.includes(file)) continue;
    reasons.push(
      exists(file)
        ? refusal(
            RULE.filesChangedUnchanged,
            `files_changed names '${file}', which the tree did not change since the last accepted step`,
          )
        : refusal(RULE.filesChangedMissingFile, `files_changed names '${file}', which does not exist`),
    );
  }
  for (const file of changed) {
    if (report.files_changed.includes(file)) continue;
    // The refusal names the way out, because an engine that cannot see the
    // edge does not have one: a change made while the loop was stopped -- a
    // repair somebody did by hand -- belongs to no step, and reporting it
    // inside one is what this rule refuses. Session 66 met this and folded
    // the repair into a step it was not part of.
    reasons.push(
      refusal(
        RULE.filesChangedOmits,
        `files_changed omits '${file}', which the tree changed. If it was repaired while ` +
          "the run was stopped, it belongs to no step: `dabbler session rebaseline " +
          '--reason "<what was repaired>"` records it and moves the baseline',
      ),
    );
  }
  return reasons;
}

/**
 * The step files the tree left byte-identical, which is not a refusal.
 *
 * The work can be done and the diff empty -- session 62's managed body,
 * where bootstrap rewrote CLAUDE.md and GEMINI.md with content identical to
 * what stood. Refusing made the step unanswerable: omitting the file failed
 * a must-include while naming it failed the unchanged rule. A declared file
 * that DID change and is missing from the report is still refused, and the
 * step's checks remain the gate on the work itself.
 */
export function unchangedStepFiles(
  spec: StepSpec,
  report: DriverReport,
  changed: readonly string[],
): string[] {
  return spec.files.filter(
    (file) => !report.files_changed.includes(file) && !changed.includes(file),
  );
}
/** How often the push loop looks at a running job; a pull call never waits. */
const JOB_POLL_MS = 250;
/** What a `wait` tells the engine to leave the framework's work alone for. */
const VERIFY_RETRY_SECONDS = 60;
const SUITE_RETRY_SECONDS = 60;
const CLOSE_RETRY_SECONDS = 15;
// A pack and a push to a feed are a build and a network call; the suite is
// the nearest thing to either in this file, so this takes the suite's number.
const PUBLISH_RETRY_SECONDS = 60;
/** How often a running invocation looks for an interrupt request. */
const INTERRUPT_POLL_MS = 500;
/** What a deferred Send reads as, first among the next instruction's reasons. */
const SENT_PREFIX = "sent: ";

/**
 * How many stops `run.json` remembers. Enough to see a loop going nowhere
 * and no more: this is state, and the history of a run is its transcripts.
 */
const STOP_HISTORY_CAP = 8;

/**
 * The rules a refusal can come from, by name.
 *
 * Every reason a judge produces says which rule produced it, and the slug
 * is what a person, `dabbler triage` and the `rejected-thrice` stop that
 * quotes the last reasons all work from. They are here, written once each,
 * because a name typed at its use site is a name that drifts from the rule
 * it belongs to -- and a rule nobody can cite is one nobody can dispute.
 */
const RULE = {
  noReport: "no-report",
  reportSeq: "report-seq",
  reportStep: "report-step",
  filesChangedUnchanged: "files-changed-unchanged",
  filesChangedMissingFile: "files-changed-missing-file",
  filesChangedOmits: "files-changed-omits",
  checkFailed: "check-failed",
  noWorkPlan: "no-work-plan",
} as const;

/** One refusal, carrying the name of the rule that refused it. */
function refusal(rule: string, reason: string): string {
  return `[${rule}] ${reason}`;
}

/** How many advisers a deadlock is taken to before it is taken to a person. */
const TRIAGE_RUNGS = 2;

/** The third answer a stopped loop has, when an adviser proposed one. */
const AMEND_CHOICE = "Amend step";

/** One stop, as the history remembers it and the ladder compares against it. */
interface StopEntry {
  readonly kind: StopKind;
  readonly reason: string;
  readonly at: string;
  readonly step_id: string | null;
}

/** How far the ladder got. Null where none was climbed at all. */
interface Ladder {
  readonly advice: Advice | null;
}

/** What an adviser said, ready for the brief a person reads. */
interface Advice {
  readonly answer: Triage;
  readonly adviser: string;
  readonly brief: string;
}

/** The adviser's opinion, marked as one. */
function adviceBrief(outcome: TriageOutcome): string {
  return (
    `A second opinion, from ${outcome.adviser.model} (${outcome.adviser.provider}) -- ` +
    `${outcome.excluded.join(", ")} excluded` +
    (outcome.simulated ? ", SIMULATED (served by a script, not a vendor)" : "") +
    `.
It calls this a ${outcome.answer.classification}: ${outcome.answer.reasoning}
` +
    `It recommends: ${outcome.answer.recommendation}
` +
    "It is an opinion. The framework has applied none of it."
  );
}

/** What a `deadlock` adds to the stop's reason, for a reader who knows no field names. */
const DEADLOCK_NOTE =
  " -- DEADLOCK: the same stop, on the same step, for the same reason as the one before it. " +
  "Running it again unchanged reaches this exact point again.";

type StopKind = NonNullable<DriverRun["stop"]>["kind"];

/** The two answers a stopped loop has, in the words the operator is offered. */
const RESUME_CHOICE = "Run `next` again";
const CANCEL_CHOICE = "Cancel the session";

/**
 * The one decision a stop raises, per session.
 *
 * Keyed on the session rather than on the stop, because `raiseOwed` folds by
 * id: a second stop of the same kind and reason leaves one row, and a stop
 * whose reason has changed supersedes the stale brief instead of stacking a
 * second question about the same session.
 */
function stopDecisionId(sessionNumber: number): string {
  return `driver-stop-s${sessionNumber}`;
}

/**
 * The loop halting short of the close, with the reason a person reads.
 *
 * Written out longhand rather than as a parameter property, and so is the
 * driver below: `selfArgv` re-enters this router on a bare `node`, whose
 * type stripping refuses a parameter property outright. A file the CLI
 * imports may not use one, or the framework cannot start its own work.
 */
class Stop extends Error {
  readonly kind: StopKind;

  constructor(kind: StopKind, reason: string) {
    super(reason);
    this.kind = kind;
    this.name = "Stop";
  }
}

/**
 * The pull's unwind: an instruction has been issued and this call is over.
 *
 * `dabbler session next` advances one move. When a phase reaches the point
 * where it would wait -- for the engine's answer, or for the framework's own
 * long work -- it throws this instead, and the verb prints the instruction
 * it carries. `run.json` holds everything the next call needs to re-enter
 * the same phase at the same place.
 */
class Awaiting extends Error {
  readonly instruction: DriverInstruction;

  constructor(instruction: DriverInstruction) {
    super(`awaiting the answer to instruction ${instruction.seq}`);
    this.instruction = instruction;
    this.name = "Awaiting";
  }
}

/** One step as the loop measures it: a plan step, or a fix round's own. */
export interface StepSpec {
  readonly id: string;
  readonly ask: string;
  readonly files: readonly string[];
  readonly checks: ReadonlyArray<{ readonly argv: readonly string[] }>;
  /** A work-plan step is remembered as accepted; a fix step is not a plan step. */
  readonly fromPlan: boolean;
}

function clock(): string {
  return nowIso("seconds").slice(11, 19);
}

function tail(text: string, limit = 600): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : trimmed.slice(-limit);
}

function describeFinding(index: number, finding: Row): string {
  const cited = Array.isArray(finding["evidencePaths"])
    ? (finding["evidencePaths"] as unknown[]).map(String)
    : [];
  return (
    `[${index}] ${String(finding["severity"] ?? "unknown")}` +
    `${finding["blocking"] === true ? ", blocking" : ""}: ` +
    String(finding["description"] ?? "").trim() +
    (cited.length > 0 ? ` -- cited: ${cited.join(", ")}` : "")
  );
}

class Driver {
  private readonly sessionsDir: string;
  private readonly options: DriverOptions;
  private readonly repoRoot: string;
  private readonly config: RouterConfig;
  private sessionNumber = 0;
  private run!: DriverRun;
  private plan: DriverWorkPlan | null = null;
  /** Sends that arrived with no invocation to end; the next instruction carries them. */
  private deferred: string[] = [];
  /**
   * The step the loop is on, or null between steps.
   *
   * Tracked here rather than passed to `Stop`, because a stop raised inside
   * a step is not always raised by the step's own code: a tree that cannot
   * be snapshotted, an engine that will not run and an interrupt all unwind
   * from underneath it, and each of them is still "the loop was on this
   * step" to whoever reads the record.
   */
  private currentStep: string | null = null;
  /**
   * Pull mode only: whether the outstanding answer has been judged in this
   * call. One call judges one answer; every later call site in the same
   * call issues rather than reading the same answer twice.
   */
  private answered = false;

  constructor(
    sessionsDir: string,
    options: DriverOptions,
    repoRoot: string,
    config: RouterConfig,
  ) {
    this.sessionsDir = sessionsDir;
    this.options = options;
    this.repoRoot = repoRoot;
    this.config = config;
  }

  private get pull(): boolean {
    return this.options.mode === "pull";
  }

  // --- output and state ------------------------------------------------------

  private log(event: string, fields: Record<string, unknown> = {}): void {
    const extra = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join(" ");
    writeOut(`dabbler [${clock()}] ${event}${extra ? ` ${extra}` : ""}\n`);
  }

  private save(): void {
    // Atomic under the lifecycle lock: the fence below is check-then-write,
    // and two drivers hitting the window between them was the whole
    // incident. The lock makes the pair one act.
    let lock: string | null = null;
    try {
      lock = acquireLockWithTimeout(this.sessionsDir, `driver-save/${process.pid}`);
    } catch {
      // Fail CLOSED: a save that cannot take the lock while another writer
      // holds it is exactly the stale attempt the fence exists for. Stopping
      // loses nothing -- the winner drives on.
      appendSupervision(this.repoRoot, this.sessionNumber, {
        event: "stale-save-refused",
        cause: "lifecycle lock contended",
        phase: this.run.phase,
      });
      throw new Stop(
        "interrupted",
        "the lifecycle lock is contended: another driver is writing this run, and a stale attempt does not advance it.",
      );
    }
    try {
    const mine = this.run.lease_epoch ?? 1;
    let disk: number;
    try {
      disk = readRun(this.repoRoot, this.sessionNumber)?.lease_epoch ?? 1;
    } catch {
      disk = mine;
    }
    const lease = judgeLease(mine, disk);
    if (lease.refusal !== null) {
      // The refusal is a supervision event before it is a stop, so the
      // record says which epoch lost.
      appendSupervision(this.repoRoot, this.sessionNumber, {
        event: "stale-save-refused",
        my_epoch: mine,
        disk_epoch: disk,
        phase: this.run.phase,
      });
      throw new Stop("interrupted", lease.refusal);
    }
    this.run = writeRun(this.repoRoot, this.sessionNumber, {
      ...this.run,
      updated_at: nowIso(),
    });
    } finally {
      if (lock !== null) releaseLock(lock);
    }
  }

  private setPhase(phase: DriverRun["phase"]): void {
    this.run = { ...this.run, phase };
    this.save();
    this.log("phase", { phase });
  }

  // --- register --------------------------------------------------------------

  /** The name `run.json` records the engine under, and resumes are held to. */
  private engineName(): string | null {
    return this.options.adapter?.name ?? this.options.engine ?? null;
  }

  /**
   * The session whose close ran but whose result nobody has collected.
   *
   * Only the close takes a session out of flight, and under the pull it does
   * so from a job the call that started it did not wait for. The call that
   * comes back therefore finds nothing in flight and a run still standing at
   * `close`: that run is this session, and it is owed its `done`.
   */
  private uncollectedClose(): number | null {
    const rows = readSessionState(this.sessionsDir)?.["sessions"];
    if (!Array.isArray(rows)) return null;
    const numbers = rows
      .map((row) => (row as Row)["number"])
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => right - left);
    for (const number of numbers) {
      try {
        if (readRun(this.repoRoot, number)?.phase === "close") return number;
      } catch (error) {
        // A run this reader refuses is not the one being collected here;
        // the refusal belongs to whoever opens it deliberately.
        if (!(error instanceof LedgerError)) throw error;
      }
    }
    return null;
  }

  /** Register (or re-register) and load or open the run's state. */
  register(): number {
    // A pull call that names no engine is a person continuing a session
    // already in flight: its identity is on the record, and re-registering
    // would only ask them to repeat it.
    const inFlight = readSessionState(this.sessionsDir)?.["currentSession"];
    const closing = typeof inFlight === "number" || !this.pull ? null : this.uncollectedClose();
    if (this.options.engine === null && typeof inFlight !== "number" && closing === null) {
      writeErr(
        "dabbler: refused -- no session is in flight, and none can be started " +
          "without --engine (and --provider).\n",
      );
      return EXIT_USAGE;
    }
    // Registering here would start the NEXT session while this one's close
    // is still being collected.
    if (this.options.engine !== null && closing === null) {
      const code = start(this.sessionsDir, {
        engine: this.options.engine,
        provider: this.options.provider ?? null,
        model: this.options.model ?? null,
        effort: this.options.effort ?? null,
      });
      if (code !== EXIT_OK) return code;
    }
    const state = readSessionState(this.sessionsDir);
    const current = closing ?? (state ? state["currentSession"] : null);
    if (typeof current !== "number") {
      writeErr("dabbler: refused -- no session is in flight after registration.\n");
      return EXIT_BOUNDARY;
    }
    this.sessionNumber = current;
    // Nothing is cleared here, in either mode. What this guard was reaching
    // for is a request written for a run that has already ended, and the
    // right test for that is whether the request has been READ -- which is
    // what `takeInterrupt` answers wherever the driver next looks. Dropping
    // it on the way in made `session interrupt --stop` unusable against a
    // pulled session and, exactly as much, threw away a Send made between
    // two of a push run's own invocations: one bug, in two modes.

    const existing = readRun(this.repoRoot, current);
    const cap = this.options.maxInvocations ?? driverInvocationCap(this.config);
    if (existing === null) {
      const now = nowIso();
      this.run = {
        schema_version: DRIVER_SCHEMA_VERSION,
        session_number: current,
        engine: this.engineName() ?? "cli",
        phase: "plan",
        seq: 0,
        invocations: 0,
        max_invocations: cap,
        accepted_steps: [],
        baseline_tree: null,
        stop: null,
        verification: this.verificationSettings(null),
        started_at: now,
        updated_at: now,
      };
      this.save();
      this.log("run-started", { session: sessionDisplayNumber(current), engine: this.run.engine, max_invocations: cap });
      return EXIT_OK;
    }
    const named = this.engineName();
    if (named !== null && existing.engine !== named) {
      writeErr(
        `dabbler: refused -- session ${sessionDisplayNumber(current)} is being driven ` +
          `through '${existing.engine}', and this run names '${named}'. ` +
          "One engine's session store carries a run; finish it with the engine it started with.\n",
      );
      return EXIT_BOUNDARY;
    }
    // Three refusals of one answer stopped the loop, and a person asking
    // again is the intervention the bound existed to force. The failed
    // answer is not judged a fourth time: it is left behind, the count
    // starts over, and the phase issues its instruction afresh. Without
    // this the pull cannot resume a `rejected-thrice` stop at all -- every
    // call would rejudge the same answer and stop again on the spot.
    const afterRefusals = existing.stop?.kind === "rejected-thrice";
    if (afterRefusals) this.answered = true;
    this.run = {
      ...existing,
      max_invocations: this.options.maxInvocations ?? existing.max_invocations,
      verification: this.verificationSettings(existing.verification ?? null),
      ...(afterRefusals ? { rejections: 0 } : {}),
      // Taking the lease: this process's first write bumps the epoch, and
      // any driver still holding the old number is refused at its next
      // save. One writer per run, enforced by the record itself.
      lease_epoch: nextLeaseEpoch(existing.lease_epoch),
      stop: null,
    };
    this.save();
    appendSupervision(this.repoRoot, this.sessionNumber, {
      event: "lease-taken",
      lease_epoch: this.run.lease_epoch,
      phase: this.run.phase,
    });
    if (existing.stop) this.settleStopDecision(existing.stop.kind);
    this.log("run-resumed", {
      session: sessionDisplayNumber(current),
      phase: this.run.phase,
      invocations: this.run.invocations,
      max_invocations: this.run.max_invocations,
      ...(existing.stop ? { after: existing.stop.kind } : {}),
      ...(afterRefusals ? { refusals: "reset; the step is asked afresh" } : {}),
    });
    return EXIT_OK;
  }

  /**
   * The round cap and transport this run verifies under.
   *
   * The transport is the run's, not a call's: under the pull the call that
   * reaches verification is whichever `next` happens to get there, following
   * an `answer_command` that names it, so a transport typed once would
   * otherwise be dropped for the round it was typed for.
   *
   * The CAP is not typeable here at all. It came off any `next` call and
   * always won -- so `--max-rounds 1` with four rounds run routed the tree
   * straight to its at-cap branch, a verification-reducing act with no
   * approver anywhere on the record and reachable by anyone who typed a
   * command. It now comes from `verification.settings.max_rounds` and moves
   * only through `dabbler session plan amend --max-rounds`, which states a
   * reason and an approver. What is carried here is what the run already
   * holds, and nothing else may set it.
   */
  private verificationSettings(existing: DriverRun["verification"]): DriverRun["verification"] {
    const maxRounds = existing?.max_rounds ?? null;
    const transport = this.options.transport ?? existing?.transport ?? null;
    if (maxRounds === null && transport === null) return null;
    return { max_rounds: maxRounds, transport };
  }

  /**
   * The stop, as a question the operator can answer where they answer
   * everything else.
   *
   * A halted loop is a decision -- run it again, or give this session up --
   * and until now it was answerable only by whoever thought to read
   * `run.json`. It is raised in a class that does NOT refuse a close: a
   * driver that stopped is not a verification reduction, and a bookkeeping
   * question that could block a close would hold work the verifier passed.
   *
   * A failure to write the question is never allowed to swallow the stop.
   * The reason is on `run.json` and on stderr either way, and a stop
   * reported as a crash would cost more than the row it failed to write.
   */
  private raiseStopDecision(kind: StopKind, reason: string, ladder: Ladder | null = null): void {
    const advice = ladder?.advice ?? null;
    const options = [
      {
        label: RESUME_CHOICE,
        consequence:
          `The session resumes from '${this.run.phase}'. The steps it has ` +
          "already accepted are not asked for again.",
      },
      {
        label: CANCEL_CHOICE,
        consequence:
          "`dabbler session cancel` ends it with a reason on the record. " +
          "What the working tree already carries stays where it is.",
      },
    ];
    // An amendment is an OPTION and never an act. The framework applies
    // nothing an adviser proposed; choosing it is what records it, and where
    // it relaxes a gate that is the first thing the chooser is told.
    const amendment = advice?.answer.amendment ?? null;
    if (amendment) {
      options.push({
        label: `${AMEND_CHOICE} '${amendment.step_id}'`,
        consequence:
          (amendment.relaxes_a_gate
            ? "IT RELAXES A GATE: this weakens what the framework checks. "
            : "It relaxes no gate. ") +
          `${amendment.reason}\n\n${this.amendmentProposal(amendment)}\n\n` +
          "The framework applies no adviser's proposal on its own authority. " +
          "Choosing this records the decision; the command above is how it is made.",
      });
    }
    try {
      raiseOwed(this.repoRoot, {
        id: stopDecisionId(this.sessionNumber),
        decisionClass: CLASS_VALUE_TRADEOFF,
        question:
          `Session ${sessionDisplayNumber(this.sessionNumber)} stopped ` +
          `(${kind}) in phase '${this.run.phase}'. Run it again, or cancel it?`,
        // Three briefs, and which one this is says how much is known. No
        // ladder was climbed: the stop's own reason, which is what an
        // attended session reads. An adviser answered: its opinion, marked
        // as one. Nobody could: the raw artifacts, because "the framework
        // stopped and its advisers could not classify it" is honest and an
        // invented recommendation is not.
        determined:
          ladder === null
            ? reason
            : advice !== null
              ? `${reason}

${advice.brief}`
              : `${reason}

No adviser could classify this. The raw artifacts:
${this.stopArtifacts()}`,
        options,
        recommendation:
          ladder === null
            ? RESUME_CHOICE
            : advice === null
              ? null
              : amendment
                ? `${AMEND_CHOICE} '${amendment.step_id}'`
                : RESUME_CHOICE,
        onNoAnswer:
          "Nothing happens. The session stays in flight and its record stops " +
          "moving until someone resumes it or cancels it.",
        sessionNumber: this.sessionNumber,
      });
    } catch (error) {
      this.log("owed-not-raised", { reason: (error as Error).message });
    }
  }

  /**
   * The ladder a deadlock climbs, unattended, and its floor.
   *
   * Under the PUSH mode only: an attended engine calls `dabbler triage`
   * itself when it is stuck, and spending a provider call on behalf of
   * somebody sitting at the keyboard is the framework deciding for them.
   *
   * Two rungs and then a person. Rung one asks an adviser outside the
   * working engine's provider; rung two asks somebody outside that one too.
   * No rung loops, no rung re-enters a phase, and the run record says what
   * it found -- so a re-run that reaches the same impasse does not pay for
   * the same answer twice.
   */
  private async climbLadder(entry: StopEntry): Promise<Ladder | null> {
    const already = this.run.triage ?? null;
    if (already && already.for_reason === entry.reason && (already.for_step ?? null) === entry.step_id) {
      this.log("triage-skipped", { why: "this impasse has already been triaged", rungs: already.rungs });
      return null;
    }
    const excluded: string[] = [];
    let rungs = 0;
    let advice: Advice | null = null;
    for (let rung = 0; rung < TRIAGE_RUNGS; rung += 1) {
      rungs += 1;
      this.log("triage-asking", { rung: rungs, also_excluding: excluded });
      try {
        const outcome = await triage(this.sessionsDir, {
          sessionNumber: this.sessionNumber,
          alsoExclude: excluded,
          transport: this.options.transport ?? null,
        });
        advice = {
          answer: outcome.answer,
          adviser: `${outcome.adviser.model} (${outcome.adviser.provider})`,
          brief: adviceBrief(outcome),
        };
        this.log("triage-classified", {
          rung: rungs,
          classification: outcome.answer.classification,
          adviser: `${outcome.adviser.model} (${outcome.adviser.provider})`,
        });
        break;
      } catch (error) {
        if (!(error instanceof TriageError)) throw error;
        this.log("triage-failed", { rung: rungs, reason: error.message });
        // An adviser that answered badly has still been asked; the next rung
        // is somebody else. One that never answered leaves nobody to exclude,
        // and asking again would be the same rung twice.
        if (error.provider === null) break;
        excluded.push(error.provider);
      }
    }
    this.run = {
      ...this.run,
      triage: {
        for_reason: entry.reason,
        for_step: entry.step_id,
        rungs,
        classification: advice?.answer.classification ?? null,
        adviser: advice?.adviser ?? null,
        // Kept whole. The proposal lives in this process and the person who
        // answers the decision is in another, so an option offering to amend
        // a step without saying what the amendment is would be a menu item
        // with nothing behind it.
        amendment: advice?.answer.amendment ?? null,
        at: nowIso(),
      },
    };
    return { advice };
  }

  /**
   * What the framework itself knows about the stop, unsummarised.
   *
   * The floor's brief, and deliberately the framework's own facts rather
   * than a model's account of them: the refusals as they were written, the
   * step they were written against, and where the rest of it is on disk.
   */
  private stopArtifacts(): string {
    let artifacts;
    try {
      artifacts = collectArtifacts(this.repoRoot, this.sessionNumber);
    } catch (error) {
      return `(the record could not be read: ${(error as Error).message})`;
    }
    const lines: string[] = [];
    const stop = artifacts.run?.stop ?? null;
    if (stop !== null) {
      lines.push(
        `run.json: phase '${artifacts.run?.phase}', stop '${stop.kind}'` +
          `${stop.class ? ` (${stop.class})` : ""} on step '${stop.step_id ?? "-"}'`,
        `  ${stop.reason}`,
      );
    }
    const history = artifacts.run?.stop_history ?? [];
    if (history.length > 1) {
      lines.push(`the ${history.length} stops before this one, oldest first:`);
      lines.push(...history.map((row) => `  ${row.kind} on ${row.step_id ?? "-"}: ${clip(row.reason, 200)}`));
    }
    const instruction = artifacts.instruction;
    if (instruction !== null) {
      lines.push(
        `instruction.json: seq ${instruction.seq}, ${instruction.kind}` +
          `${instruction.step_id ? ` for step '${instruction.step_id}'` : ""}`,
        `  asked: ${clip(instruction.ask ?? "", 400)}`,
      );
    }
    if (artifacts.reasons.length > 0) {
      lines.push("the refusals, as written:", ...artifacts.reasons.map((row) => `  ${clip(row, 400)}`));
    }
    const report = artifacts.report;
    if (report !== null) {
      lines.push(
        `report.json: seq ${report.seq}, step '${report.step_id}', ${report.status}` +
          `; files ${report.files_changed.join(", ") || "(none)"}`,
        `  notes: ${clip(report.notes, 300)}`,
      );
    }
    if (artifacts.step !== null) {
      lines.push(`the step the plan declares: '${artifacts.step.id}', files ${artifacts.step.files.join(", ")}`);
    }
    if (artifacts.transcriptTail.trim() !== "") {
      // The transcript is engine-derived, so the escapes come out before it
      // is cut: a truncation that takes a colour's reset and leaves its
      // opener is what session 61 watched turn a whole brief green.
      lines.push(
        "the end of the engine's transcript:",
        tail(stripEscapes(artifacts.transcriptTail), 1200),
      );
    }
    const dir = `${RUNS_DIRNAME}/s${this.sessionNumber}/${DRIVER_DIRNAME}`;
    lines.push(`All of it, whole and unclipped, is under ${dir}/.`);
    return lines.join("\n");
  }

  /**
   * An adviser's proposal, as the thing a person would actually type.
   *
   * The framework applies nothing, so the option has to hand over what it
   * would have applied -- otherwise "Amend step 'widget'" asks somebody to
   * agree to a change nobody has shown them.
   */
  private amendmentProposal(amendment: NonNullable<Triage["amendment"]>): string {
    const parts = [
      `dabbler session plan amend --sessions-dir ${relative(this.repoRoot, this.sessionsDir).replace(/\\/g, "/")}`,
      `    --step ${amendment.step_id}`,
    ];
    if (amendment.files) parts.push(`    --files ${amendment.files.join(",")}`);
    if (amendment.checks) {
      parts.push(
        `    --checks-file <a file holding> ${JSON.stringify(amendment.checks)}`,
      );
    }
    parts.push('    --reason "<why>" --approver "<you>"');
    return `The proposal, which is yours to make or to refuse:\n${parts.join("\n")}`;
  }

  /**
   * The question a stop raised, retired the moment it is answered by acting.
   *
   * Resuming IS the answer to "run it again, or cancel it?", and this is the
   * only path that can know it was given -- nobody types `owed answer` to
   * say what they have just done. An answered decision is left alone: it is
   * settled, and superseding it would rewrite what the operator agreed to.
   */
  private settleStopDecision(kind: StopKind): void {
    const id = stopDecisionId(this.sessionNumber);
    try {
      if (!openDecisions(this.repoRoot).some((row) => row["id"] === id)) return;
      supersedeOwed(
        this.repoRoot,
        id,
        `the session was resumed after its '${kind}' stop`,
        this.sessionNumber,
      );
    } catch (error) {
      this.log("owed-not-superseded", { reason: (error as Error).message });
    }
  }

  // --- the conversation ------------------------------------------------------

  /** The answer command, rendered for the seq an instruction is issued under. */
  private answerCommand(kind: "step" | "file", stepId?: string): (seq: number) => string {
    return (seq) => {
      const head = `dabbler session report --sessions-dir ${this.sessionsDir} --seq ${seq}`;
      if (kind === "file") return `${head} --answer-file <path to the JSON you wrote>`;
      return (
        `${head} --step ${stepId} --status done ` +
        "--files <every file you created or changed, comma-separated, repository-relative> " +
        '--notes "<one line>" [--tests "<the test command you ran>"]'
      );
    };
  }

  /** What a `wait` tells the engine to run when the time is up. */
  private nextCommand(): string {
    return `dabbler session next --sessions-dir ${this.sessionsDir}`;
  }

  /**
   * The refusals the outstanding answer has had, out of `MAX_REJECTIONS`.
   *
   * On `run.json` rather than in a phase's local, because a pull call ends
   * between the refusal and the answer to it: a count this process held
   * would start again at zero every time the person's CLI came back, and
   * "refused three times" would never be reached.
   */
  private get rejections(): number {
    return this.run.rejections ?? 0;
  }

  private setRejections(count: number): void {
    this.run = { ...this.run, rejections: count };
    this.save();
  }

  private issue(fields: Record<string, unknown>): DriverInstruction {
    const seq = this.run.seq + 1;
    const command = fields["answer_command"];
    const instruction = writeInstruction(this.repoRoot, this.sessionNumber, {
      schema_version: DRIVER_SCHEMA_VERSION,
      seq,
      session_number: this.sessionNumber,
      issued_at: nowIso(),
      ...fields,
      ...(typeof command === "function" ? { answer_command: command(seq) } : {}),
    });
    this.run = { ...this.run, seq };
    this.save();
    this.log("instruction-issued", {
      seq,
      kind: instruction.kind,
      step: instruction.step_id,
      ...(instruction.reasons ? { reasons: instruction.reasons.length } : {}),
    });
    return instruction;
  }

  /**
   * One invocation of the engine on `instruction`. Returns null when the
   * engine returned on its own, and the interrupt's reason when the driver
   * ended it -- polled from the ledger while the engine runs, because the
   * request is written by another process (`session interrupt`, or the
   * extension's Stop) and this one holds the child.
   */
  private async invoke(instruction: DriverInstruction): Promise<string | null> {
    if (this.run.invocations >= this.run.max_invocations) {
      throw new Stop(
        "budget",
        `the engine has been invoked ${this.run.invocations} time(s), which is ` +
          `driver.max_invocations (${this.run.max_invocations}); re-run with ` +
          "--max-invocations <larger> to continue, which is a decision to spend more",
      );
    }
    const invocation = this.run.invocations + 1;
    const first = this.run.invocations === 0;
    this.run = { ...this.run, invocations: invocation };
    this.save();

    const transcript = transcriptPath(this.repoRoot, this.sessionNumber, invocation);
    mkdirSync(dirname(transcript), { recursive: true });
    const started = Date.now();
    appendFileSync(
      transcript,
      `# engine ${this.run.engine}; instruction ${instruction.seq} (${instruction.kind}` +
        `${instruction.step_id ? `, ${instruction.step_id}` : ""}); invocation ${invocation}; ${nowIso()}\n`,
      "utf8",
    );
    const streaming = this.engineOutput() === "stream";
    this.log("engine-invoked", {
      seq: instruction.seq,
      invocation: `${invocation}/${this.run.max_invocations}`,
      first,
      output: this.engineOutput(),
    });

    const controller = new AbortController();
    let reason: string | null = null;
    let stopRequested = false;
    // The watcher, on the one channel a headless run has. Under the pull the
    // terminal asks the rule itself; here the driver holds the child and
    // this poll is the only thing awake while the engine runs, so it asks
    // the same rule and says the answer in the same words.
    //
    // The elapsed test is done from the instruction in hand, and the rule --
    // whose tree probe costs a git call -- is asked only when a further
    // threshold has actually passed. So the probe runs once per threshold,
    // not once per 500ms poll.
    const threshold = stalledAfterSeconds(this.repoRoot);
    const issued = Date.parse(instruction.issued_at);
    let saidMultiple = 0;
    const poll = setInterval(() => {
      if (reason === null && Number.isFinite(issued) && threshold > 0) {
        const elapsed = Math.trunc((Date.now() - issued) / 1000);
        const multiple = Math.trunc(elapsed / threshold);
        // Strictly past the threshold, matching the rule itself: asking it
        // at exactly the threshold would spend the probe on a `quiet` and
        // then count that multiple as said.
        if (elapsed > threshold && multiple > saidMultiple) {
          saidMultiple = multiple;
          const reading = readWatcher(this.repoRoot, this.sessionNumber, threshold);
          if (reading.state === WATCHER_OUTSTANDING) {
            this.log("watcher", {
              since: `${reading.sinceSeconds}s`,
              state: reading.state,
              ...(reading.clock ? { clock: reading.clock } : {}),
            });
          }
        }
      }
      if (reason !== null) return;
      const request = takeInterrupt(this.repoRoot, this.sessionNumber);
      if (request === null) return;
      reason = request.reason;
      stopRequested = request.stop;
      this.log(request.stop ? "engine-stopping" : "engine-interrupting", {
        seq: instruction.seq,
        invocation,
        reason,
      });
      controller.abort(reason);
    }, INTERRUPT_POLL_MS);
    const adapter = this.options.adapter;
    if (adapter === null) {
      // Unreachable: the pull never invokes anybody. It is here so that a
      // future caller which forgets an adapter is told, rather than
      // silently taking the push path with nothing on the other end.
      throw new Stop("engine", "this run has no engine adapter to invoke");
    }
    appendSupervision(this.repoRoot, this.sessionNumber, {
      event: "continuation-spent",
      invocation,
      of_budget: this.run.max_invocations,
    });
    let outcome;
    try {
      outcome = await adapter.invoke({
        instruction,
        instructionPath: instructionPath(this.repoRoot, this.sessionNumber),
        repoRoot: this.repoRoot,
        sessionsDir: this.sessionsDir,
        sessionNumber: this.sessionNumber,
        invocation,
        first,
        resumeId: this.run.engine_session_id ?? null,
        signal: controller.signal,
        emit: (line: string, display?: string | null) => {
          appendFileSync(transcript, `${line}\n`, "utf8");
          const shown = display === undefined ? line : display;
          if (streaming && shown !== null) writeOut(`  │ ${shown}\n`);
        },
      });
    } finally {
      clearInterval(poll);
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    // The conversation the engine opened, kept so every later invocation --
    // including one after a stop, in another process on another day --
    // names it rather than asking for whatever ran here most recently.
    if (outcome.sessionId && this.run.engine_session_id !== outcome.sessionId) {
      this.run = { ...this.run, engine_session_id: outcome.sessionId };
      this.save();
      this.log("engine-session", { id: outcome.sessionId });
    }
    const interrupted = reason !== null && outcome.interrupted === true;
    appendFileSync(
      transcript,
      (interrupted ? `# interrupted (${reason}); ` : "# ") +
        `exit ${outcome.exitCode === null ? "none" : outcome.exitCode}` +
        `${outcome.error ? ` (${outcome.error})` : ""} after ${seconds}s\n`,
      "utf8",
    );
    this.log(interrupted ? "engine-interrupted" : "engine-returned", {
      seq: instruction.seq,
      exit: outcome.exitCode,
      seconds,
      transcript: relative(this.repoRoot, transcript).replace(/\\/g, "/"),
    });
    if (outcome.error) {
      throw new Stop("engine", `the engine could not be run: ${outcome.error}`);
    }
    if (stopRequested) throw new Stop("interrupted", String(reason));
    // Taken by the poll, but the engine returned on its own before the
    // abort reached it: the request still travels with the next instruction.
    if (reason !== null && !interrupted) this.defer(reason);
    return interrupted ? reason : null;
  }

  /**
   * A request that arrived at a phase boundary. A stop halts the loop here;
   * a plain one is kept for the next instruction (`withPendingRequest`).
   */
  private honourPendingStop(): void {
    const pending = takeInterrupt(this.repoRoot, this.sessionNumber);
    if (pending === null) return;
    if (pending.stop) throw new Stop("interrupted", pending.reason);
    this.defer(pending.reason);
  }

  private engineOutput(): EngineOutput {
    return this.options.engineOutput ?? driverEngineOutput(this.config);
  }

  /**
   * Issue an instruction and invoke the engine on it until the engine
   * returns on its own. An interrupted invocation is followed by the same
   * instruction re-issued as `kind: interrupt` -- a new seq, the reason
   * first among its `reasons`, the answer still owed -- and the engine is
   * invoked again, continuing its own session. The instruction returned is
   * the one the answer must name.
   */
  private async converse(fields: Record<string, unknown>): Promise<DriverInstruction> {
    if (this.pull) return this.pullConverse(fields);
    let instruction = this.issue(this.withPendingRequest(fields));
    for (;;) {
      const reason = await this.invoke(instruction);
      if (reason === null) return instruction;
      const previous = Array.isArray(fields["reasons"]) ? (fields["reasons"] as string[]) : [];
      instruction = this.issue(
        this.withPendingRequest({
          ...fields,
          kind: "interrupt",
          reasons: [`interrupted: ${reason}`, ...previous],
        }),
      );
    }
  }

  /**
   * The same exchange with nobody to invoke: the engine is the person's own
   * CLI, and it has already had its turn.
   *
   * Two answers and no third. The instruction the ledger holds is the one
   * this call site issued -- its seq is the one last issued, and it names
   * the same step and round -- so the answer to it is on disk and the phase
   * judges it exactly as the push loop does. Otherwise there is nothing to
   * judge here yet: issue, and unwind. One call judges one answer, so every
   * later call site in the same call issues, which is what makes `next`
   * advance one move rather than replay the same one.
   */
  private pullConverse(fields: Record<string, unknown>): DriverInstruction {
    const outstanding = readInstruction(this.repoRoot, this.sessionNumber);
    if (!this.answered && outstanding !== null && this.isOutstandingFor(outstanding, fields)) {
      this.answered = true;
      return outstanding;
    }
    throw new Awaiting(this.issue(this.withPendingRequest(fields)));
  }

  /** Whether the ledger's instruction is the one this call site issued. */
  private isOutstandingFor(
    instruction: DriverInstruction,
    fields: Record<string, unknown>,
  ): boolean {
    if (instruction.seq !== this.run.seq) return false;
    // A `wait` owes no written answer and a `done` owes nothing at all.
    if (instruction.kind === "wait" || instruction.kind === "done") return false;
    const step = (fields["step_id"] as string | undefined) ?? null;
    const round = (fields["round"] as number | undefined) ?? null;
    return (instruction.step_id ?? null) === step && (instruction.round ?? null) === round;
  }

  /**
   * A request that arrived while no invocation was running -- a Send made
   * between steps, or while the tests or a verification round ran. A stop
   * halts the loop here. A plain one had nothing to end, and it is not
   * lost: it travels with the next instruction, first among its `reasons`
   * as `sent: <text>`, so the engine reads it exactly as it would have
   * after an interrupt. The person was told "Sent", and it is.
   */
  private withPendingRequest(fields: Record<string, unknown>): Record<string, unknown> {
    const pending = takeInterrupt(this.repoRoot, this.sessionNumber);
    if (pending !== null) {
      if (pending.stop) throw new Stop("interrupted", pending.reason);
      this.defer(pending.reason);
    }
    if (this.deferred.length === 0) return fields;
    const sent = this.deferred.map((reason) => `${SENT_PREFIX}${reason}`);
    this.deferred = [];
    const previous = Array.isArray(fields["reasons"]) ? (fields["reasons"] as string[]) : [];
    return { ...fields, reasons: [...sent, ...previous] };
  }

  private defer(reason: string): void {
    this.deferred.push(reason);
    this.log("interrupt-deferred", { reason, why: "no invocation was running; it travels with the next instruction" });
  }

  // --- plan ------------------------------------------------------------------

  private planAsk(): string {
    let excerpt = "";
    try {
      excerpt = extractSpecExcerpt(
        readFileSync(join(this.sessionsDir, SESSION_PLAN_FILENAME), "utf8"),
        this.sessionNumber,
      );
    } catch {
      excerpt = "";
    }
    const number = sessionDisplayNumber(this.sessionNumber);
    return (
      `Plan session ${number} of this repository. Its section of the session plan ` +
      `(${SESSION_PLAN_FILENAME}) follows between the markers. Read the repository as ` +
      "you need to, but change nothing yet: the declaration comes before the work.\n\n" +
      "--- session plan ---\n" +
      (excerpt.trim() || "(the plan has no section for this session; plan from the repository)") +
      "\n--- end ---\n\n" +
      "Answer with a work plan as JSON, written to a file outside the tracked tree " +
      "(for example .dabbler/scratch/plan.json), then run the answer command. The file " +
      "carries exactly these members and no other:\n" +
      "  task        one paragraph: what this session will do -- it becomes the declaration\n" +
      "  releasable  true only if this session may publish an artifact; otherwise false\n" +
      '  steps       an ordered list; each step is {"id": "<lowercase-slug>", "ask": "<what ' +
      'to do, in words>", "files": ["<every repository-relative file the step creates or ' +
      'changes>"], "checks": [{"argv": ["<program>", "<argument>", ...]}]}\n' +
      "Every step has at least one check, and a check is argv the framework spawns with no " +
      "shell: exit 0 proves the step. A step whose product is prose still has a mechanical " +
      "check. Keep steps small, one concern each; the files a step lists are exactly the " +
      "files it will touch, because its report is measured against them.\n" +
      "One member is optional and is left out of a single-repository session:\n" +
      '  repositories  other repositories of this SOLUTION the plan needs to exist: [{"id": ' +
      '"<repository id>", "path": "<optional, relative to this root>"}]. Each is placed when ' +
      "this plan is accepted -- created beside this one, declaring which solution it is in " +
      "and nothing else -- so finishing this repository leaves the next one visible in the " +
      "Solution Explorer. One that already declares itself is left alone, and placing a " +
      "repository never declares a dependency on it.\n" +
      "Do not include schema_version, session_number or recorded_at: the framework stamps them."
    );
  }

  private async phasePlan(): Promise<void> {
    let plan = readWorkPlan(this.repoRoot, this.sessionNumber);
    let reasons: string[] = [];
    while (plan === null) {
      const instruction = await this.converse({
        // An instruction is a rejection exactly when it carries reasons.
        kind: reasons.length > 0 ? "rejection" : "step",
        step_id: "plan",
        ask: this.planAsk(),
        ...(reasons.length > 0 ? { reasons } : {}),
        answer_schema: WORK_PLAN_SCHEMA,
        answer_command: this.answerCommand("file"),
      });
      plan = readWorkPlan(this.repoRoot, this.sessionNumber);
      if (plan !== null) break;
      reasons = [
        refusal(
          RULE.noWorkPlan,
          `no work plan was written for instruction ${instruction.seq}; the answer is ` +
            `\`${instruction.answer_command}\``,
        ),
      ];
      this.setRejections(this.rejections + 1);
      this.log("plan-rejected", { seq: instruction.seq, rejection: this.rejections, reasons });
      if (this.rejections >= MAX_REJECTIONS) {
        throw new Stop(
          "rejected-thrice",
          refusal(RULE.noWorkPlan, `no work plan was written after ${MAX_REJECTIONS} instructions`),
        );
      }
    }
    this.plan = plan;
    this.setRejections(0);
    this.log("plan-accepted", { steps: plan.steps.map((step) => step.id), releasable: plan.releasable });
    this.placePlannedRepositories(plan);

    if (readTaskDeclaration(this.sessionsDir, this.sessionNumber) === null) {
      const code = declare(this.sessionsDir, {
        task: plan.task,
        releasable: plan.releasable,
        sessionNumber: this.sessionNumber,
      });
      if (code !== EXIT_OK) {
        throw new Stop(
          "engine",
          "the declaration was refused (its reason is above); a plan is answered " +
            "before any file changes",
        );
      }
    }
    this.setPhase("steps");
  }

  /**
   * Put the repositories the plan says it needs on this machine.
   *
   * At plan acceptance, because that is the moment the plan exists and the
   * work has not started: a multi-repository plan that names its next
   * repository only in prose leaves the operator to remember it, which is
   * the thing this answers. Each one is a directory, a `git init` and a
   * declaration of which solution it is in -- no edge, no `produces`, no
   * version -- so what appears in the Solution Explorer is a placemarker and
   * never a claim nobody made.
   *
   * The rule for WHERE it goes and whether this repository's edge points at
   * it is `placeMember`'s, shared with `dabbler deps scaffold`. One that is
   * already declared is left exactly as it stands.
   */
  private placePlannedRepositories(plan: DriverWorkPlan): void {
    const wanted = plan.repositories ?? [];
    if (wanted.length === 0) return;
    for (const entry of wanted) {
      try {
        const placed = placeMember(this.repoRoot, entry.id, entry.path ?? null);
        this.log("repository-placed", {
          repository: entry.id,
          root: placed.root,
          created: placed.created,
          ...(placed.linked ? { edge: "this repository's edge now points there" } : {}),
        });
      } catch (error) {
        if (!(error instanceof SolutionDepsError)) throw error;
        // A plan naming repositories in a repository that declares no
        // solution cannot be honoured, and going on would leave the
        // Explorer saying nothing while the plan says otherwise.
        throw new Stop(
          "engine",
          `the work plan asks for repository '${entry.id}', and it could not be ` +
            `placed: ${error.message}`,
        );
      }
    }
    tryWriteProjection(this.repoRoot);
  }

  // --- steps -----------------------------------------------------------------

  private requirePlan(): DriverWorkPlan {
    if (this.plan === null) {
      this.plan = readWorkPlan(this.repoRoot, this.sessionNumber);
    }
    if (this.plan === null) {
      throw new Stop("engine", "the work plan is missing from the ledger; re-run to plan again");
    }
    return this.plan;
  }

  private async phaseSteps(): Promise<void> {
    const plan = this.requirePlan();
    for (const step of plan.steps) {
      if (this.run.accepted_steps.includes(step.id)) continue;
      await this.runStep({ ...step, fromPlan: true });
    }
    this.setPhase("preverify");
  }

  private stepAsk(spec: StepSpec, rejected: boolean): string {
    return (
      spec.ask +
      "\n\nWhen the step is done, report with the answer command. --files names every " +
      "file you created or changed in this step and nothing else. Use --status blocked " +
      "only if the step cannot be done, and say why in --notes." +
      (rejected
        ? "\n\nThe previous report for this step was refused for the reasons listed under " +
          "`reasons`. Put them right and report again, with THIS instruction's seq."
        : "")
    );
  }

  /** Ask for a step until its report is accepted, refused three times, or blocked. */
  private async runStep(spec: StepSpec): Promise<void> {
    // Cleared on the way out and NOT in a `finally`: a `finally` runs while
    // a `Stop` is still unwinding, so the loop's own handler would read null
    // for every stop raised inside a step -- which is every stop that most
    // wants a step's name on it.
    this.currentStep = spec.id;
    await this.askForStep(spec);
    this.currentStep = null;
  }

  /**
   * The step as the plan on disk now declares it, or the spec as issued.
   *
   * Only a step that came FROM the plan is refreshed: a step the driver
   * synthesised has no entry to be amended, and reading one in would be
   * reading somebody else's step.
   */
  private amendedSpec(spec: StepSpec): StepSpec {
    if (!spec.fromPlan) return spec;
    const plan = readWorkPlan(this.repoRoot, this.sessionNumber);
    const amended = plan?.steps.find((step) => step.id === spec.id);
    if (amended === undefined) return spec;
    this.plan = plan;
    return { ...amended, fromPlan: true };
  }

  private async askForStep(spec: StepSpec): Promise<void> {
    if (this.run.baseline_tree === null) {
      const tree = snapshotWorktreeTree(this.repoRoot);
      if (tree === null) throw new Stop("engine", "could not snapshot the working tree");
      this.run = { ...this.run, baseline_tree: tree };
      this.save();
    }
    let reasons: string[] = [];
    for (;;) {
      // An amendment to THIS step lands here, and nowhere else it could.
      // `session plan amend` writes the plan and says the next instruction
      // is measured against the new step; a loop holding the plan it read
      // when it started made that sentence false in the one mode that
      // needs it -- an unattended `drive` runs for the whole session in one
      // process, so a step amended after a refusal was still judged against
      // the step that was refused, forever. Re-read by id; a step the plan
      // no longer declares keeps the spec it was issued with.
      spec = this.amendedSpec(spec);
      const instruction = await this.converse({
        kind: reasons.length > 0 ? "rejection" : "step",
        step_id: spec.id,
        ask: this.stepAsk(spec, reasons.length > 0),
        ...(reasons.length > 0 ? { reasons } : {}),
        answer_schema: REPORT_SCHEMA,
        answer_command: this.answerCommand("step", spec.id),
      });
      const report = readReport(this.repoRoot, this.sessionNumber);
      const judged = await this.judge(report, instruction, spec);
      if (judged === "blocked") {
        throw new Stop(
          "blocked",
          `the engine reported step '${spec.id}' blocked: ${String(report?.notes ?? "")}`,
        );
      }
      if (judged.length === 0) {
        const tree = snapshotWorktreeTree(this.repoRoot);
        if (tree === null) throw new Stop("engine", "could not snapshot the working tree");
        this.run = {
          ...this.run,
          baseline_tree: tree,
          accepted_steps: spec.fromPlan
            ? [...this.run.accepted_steps, spec.id]
            : this.run.accepted_steps,
        };
        this.setRejections(0);
        this.log("report-accepted", { seq: instruction.seq, step: spec.id, files: report?.files_changed });
        return;
      }
      reasons = judged;
      this.setRejections(this.rejections + 1);
      this.log("report-rejected", { seq: instruction.seq, step: spec.id, rejection: this.rejections, reasons });
      if (this.rejections >= MAX_REJECTIONS) {
        throw new Stop(
          "rejected-thrice",
          `step '${spec.id}' was refused ${MAX_REJECTIONS} times; the last reasons: ` +
            reasons.join(" | "),
        );
      }
    }
  }

  /** The report's substance against the step: [] accepts, reasons refuse. */
  private async judge(
    report: DriverReport | null,
    instruction: DriverInstruction,
    spec: StepSpec,
  ): Promise<string[] | "blocked"> {
    const shape = judgeReportShape(report, instruction, spec);
    if (shape !== "ok") return shape;
    const answered = report as DriverReport;

    const current = snapshotWorktreeTree(this.repoRoot);
    if (current === null) throw new Stop("engine", "could not snapshot the working tree");
    const diff = changedPathsBetween(this.repoRoot, String(this.run.baseline_tree), current);
    if (diff === null) throw new Stop("engine", "could not diff the working tree against the last accepted step");
    const changed = stepChangedPaths(diff, repoRelativePath(this.repoRoot, this.sessionsDir));
    const reasons = judgeReportFiles(answered, changed, (file) =>
      existsSync(join(this.repoRoot, file)),
    );
    for (const file of unchangedStepFiles(spec, answered, changed)) {
      this.log("step-file-unchanged", { step: spec.id, file });
    }
    if (reasons.length > 0) return reasons;

    for (const [index, check] of spec.checks.entries()) {
      const argv = [...check.argv];
      const declared = makeCheck({ name: `${spec.id} check ${index + 1}`, argv, kind: "control" });
      const run = await executeCheck(this.repoRoot, declared, argv.join(" "), {
        stage: "driver",
        treeDigest: current,
        timeoutSeconds: timeoutFor(declared, this.config),
      });
      const green = checkRunGreen(run);
      // The log event and the rule are the same fact, so they are the same
      // string: a log line saying one thing while the refusal says another
      // is two names for one failure.
      this.log(green ? "check-passed" : RULE.checkFailed, { step: spec.id, argv });
      if (!green) {
        reasons.push(
          refusal(
            RULE.checkFailed,
            `check failed: ${argv.join(" ")} -> exit ${run.exitCode === null ? "none (timed out)" : run.exitCode}` +
              (run.treeMutated ? " (the check changed the tree)" : "") +
              (run.output.trim() ? `\n${tail(run.output)}` : ""),
          ),
        );
      }
    }
    return reasons;
  }

  // --- the tests -------------------------------------------------------------

  private expensiveSuites() {
    const loaded = loadSuitesChecked(this.config);
    if (loaded.errors.length > 0) {
      throw new Stop("tests", `testing.suites is malformed: ${loaded.errors.join("; ")}`);
    }
    return loaded.suites.filter((suite) => suite.expensive);
  }

  private allPlanChecks(): StepSpec["checks"] {
    return this.requirePlan().steps.flatMap((step) => step.checks);
  }

  /**
   * No targeted suite runs here any more. Measured over sessions 70-77 the
   * selection cost 353-625 s per session and twice cost MORE than the full
   * suite it approximates; the testing that remains is the verifier's
   * authored tests inside the round and the complete suite as the run of
   * record, which is unchanged. The phase name stays so an old record's
   * `preverify` rows and stops still read as what they were.
   */
  private async phasePreverify(): Promise<void> {
    this.setPhase("verify");
  }

  // --- the framework's own long work -----------------------------------------

  /**
   * Run one of the framework's own verbs and hand back its exit code, from
   * a call that does not wait for it.
   *
   * A verification round, the complete suite and the close each outlast an
   * engine's tool timeout, so none of them may run inside the call that
   * starts them. The job is started detached, its record goes on `run.json`,
   * and the phase is re-entered later: in pull mode by the engine's next
   * `dabbler session next`, in push mode by this loop's own poll, which is
   * free to sit here because nothing is timing it. One mechanism, two
   * cadences.
   *
   * The verb is spawned rather than called: it is the same code either way
   * (`selfArgv` re-enters this router), and a spawned verb can be waited on
   * from a process that has already exited.
   */
  private async longWork(options: {
    readonly name: string;
    readonly argv: readonly string[];
    readonly retryAfterSeconds: number;
    readonly stopKind: StopKind;
  }): Promise<number> {
    // A job outstanding under ANOTHER name is one of two very different
    // things, and sessions 78 and 81 paid for conflating them. Still
    // RUNNING: this call site is behind the walk that started it -- a
    // re-entered phase walks its suites in order, and a site reached while
    // a later one's job runs already finished; EXIT_OK, as always. Already
    // EXITED: that is stale cross-phase state -- an uncollected
    // verification job after an adjudication settled the phase by terminal
    // row -- and treating it as "this site finished" fake-greened
    // run-of-record and the close, twice. Stale is collected, logged and
    // cleared, and this call site starts its own work.
    if (this.run.job !== null && this.run.job !== undefined && this.run.job.name !== options.name) {
      const stale = this.run.job;
      if (staleJobDisposition(stale.name, options.name, pollJob(this.repoRoot, stale).state) === "behind") {
        return EXIT_OK;
      }
      this.run = { ...this.run, job: null };
      this.save();
      this.log("job-finished-stale", { name: stale.name, log: stale.log });
      appendSupervision(this.repoRoot, this.sessionNumber, {
        event: "stale-job-collected",
        name: stale.name,
        collected_by: options.name,
      });
    }
    let job: Job | null = this.run.job ?? null;
    if (job === null) {
      job = startJob(this.repoRoot, this.sessionNumber, {
        name: options.name,
        argv: options.argv,
        retryAfterSeconds: options.retryAfterSeconds,
      });
      this.run = { ...this.run, job };
      this.save();
      this.log("job-started", { name: job.name, pid: job.pid, log: job.log });
    }
    for (;;) {
      const state = pollJob(this.repoRoot, job);
      if (state.state === "exited") {
        this.run = { ...this.run, job: null };
        this.save();
        this.log("job-finished", { name: job.name, exit: state.exitCode, log: job.log });
        if (state.exitCode === null) {
          // No code means the verb was killed or never spawned; whatever it
          // forked before that may still be running, and the runner -- if
          // it is still there to be the root of that tree -- is ended.
          endJob(job);
          throw new Stop(
            options.stopKind,
            `${options.name} ended without an exit code; its log is ${job.log}`,
          );
        }
        return state.exitCode;
      }
      if (state.state === "vanished") {
        this.run = { ...this.run, job: null };
        this.save();
        throw new Stop(
          options.stopKind,
          `${options.name} vanished: nothing is running under pid ${job.pid} and it ` +
            `recorded no result. Its log is ${job.log}; re-run to start it again`,
        );
      }
      if (this.pull) {
        throw new Awaiting(
          this.issue(
            this.withPendingRequest({
              kind: "wait",
              retry_after_seconds: options.retryAfterSeconds,
              log: job.log,
              answer_command: () => this.nextCommand(),
            }),
          ),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
    }
  }

  // --- verification ----------------------------------------------------------

  private async phaseVerify(): Promise<void> {
    // Two of the three reasons a further round cannot open are instructions
    // to ADVANCE, and both are answers the ledger already holds. A terminal
    // row stands, or the cap is reached over a clean round: `verify` would
    // refuse, in words that say "close the session", and the driver's next
    // move is the run of record. Asking first spends no job, and -- before
    // this -- a session whose run of record failed AFTER a clean at-cap
    // verification could never close at all: the fix cycles back through
    // preverify to here, and the refusal is the same one forever.
    //
    // The third, disputes at the cap, is not the driver's to answer:
    // adjudication is a person routing findings to a third provider. It
    // falls through to the job, which refuses, and the stop carries
    // `verify`'s own words -- which say exactly that.
    const noRound = noRoundReason(
      this.repoRoot,
      this.sessionNumber,
      readRounds(this.repoRoot, this.sessionNumber),
      this.run.verification?.max_rounds || verificationRoundCap(this.config),
    );
    if (noRound === NO_ROUND_TERMINAL || noRound === NO_ROUND_CAP_CLEAN) {
      // With one condition, which `verify`'s own message cannot state and
      // the close's own gate already answers: is this still the tree that
      // was reviewed? "There is nothing left to verify" is true of an
      // unmoved tree and false of a repaired one, and routing a repaired
      // tree onward would carry it to a close that refuses it later and
      // more confusingly. The gate is ASKED rather than restated -- there
      // is one rule for "is the tree the verified one" and it lives there.
      const [clean, why] = checkVerificationClean(this.sessionsDir);
      if (clean) {
        this.log("verification-settled", { reason: noRound });
        this.setPhase("run-of-record");
        return;
      }
      throw new Stop(
        "verification",
        `no further verification round may open (${noRound}), and this is not the ` +
          `tree that was verified: ${why} Raising the round cap (\`dabbler session ` +
          'plan amend --max-rounds <larger> --reason "<why>" --approver <who>`) buys ' +
          "the review this change has not had, which is a decision to spend another " +
          "round and is recorded as one; putting the tree back is the other answer.",
      );
    }
    const code = await this.longWork({
      name: "verification",
      argv: [
        ...selfArgv(),
        "verify",
        "--sessions-dir",
        this.sessionsDir,
        // Off the run, not off this call: the call that reaches this phase
        // is rarely the one the person typed the flags on.
        ...(this.run.verification?.max_rounds != null
          ? ["--max-rounds", String(this.run.verification.max_rounds)]
          : []),
        ...(this.run.verification?.transport
          ? ["--transport", this.run.verification.transport]
          : []),
      ],
      retryAfterSeconds: VERIFY_RETRY_SECONDS,
      stopKind: "verification",
    });
    if (code === VERIFY_OK) {
      this.log("verification-passed");
      this.setPhase("run-of-record");
      return;
    }
    if (code === EXIT_BLOCKING) {
      // The loop's own word for the round that did not pass. Without it the
      // only thing the channel says here is `phase phase=dispositions`, which
      // reads exactly like `phase phase=steps` -- the worst outcome a session
      // has, in the colour of ordinary progress. The verb's own verdict line
      // is above this one, and it is the verb's; this is the driver's.
      this.log("verification-blocking");
      this.setPhase("dispositions");
      return;
    }
    // Neither passed nor found anything: verify REFUSED, and its reason is
    // in the log it just wrote. Reading it is the whole of what follows --
    // a refusal the driver can answer, and a stop that says which refusal
    // it was.
    const reason = jobLogTail(this.repoRoot, this.sessionNumber, "verification");

    // The stale-evidence heal that stood here went with the targeted
    // selection and the gate that demanded it; `verify` no longer refuses
    // over missing targeted evidence, so there is nothing left for the
    // loop to answer by re-entering preverify.

    // The cap, reached over findings that cannot be shown remediated. It is
    // terminal by construction and no re-run changes it: the findings and
    // what they cite are in the reason, and the next planning session is
    // where they are read. Said in its own words rather than as one more
    // refusal, because "run it again" is the one thing that will not work.
    if (code === EXIT_UNRESOLVED) {
      throw new Stop(
        "verification",
        "the round cap is reached and blocking findings cannot be shown " +
          `remediated; nothing lands but the record. ${reason}`,
      );
    }

    // A stop, and it says WHICH refusal. The identical sentence two unlike
    // refusals used to arrive in is what made the deadlock classifier -- it
    // compares kind, step and reason -- call a red control and stale
    // evidence the same impasse, and tell the operator that running it again
    // would change nothing when running it again was exactly right.
    throw new Stop(
      "verification",
      `dabbler verify refused (exit ${code}): ` +
        (reason || "it wrote no reason; its log is under the run's jobs directory"),
    );
  }

  private dispositionAsk(round: number): string {
    return (
      `Verification round ${round} found what is listed under \`reasons\`, numbered. Answer ` +
      "with a disposition for every finding marked blocking (and any other you choose), as " +
      "JSON written to a file outside the tracked tree, then run the answer command. The " +
      'file carries exactly: {"dispositions": [{"finding_index": <number>, "action": "fix"} ' +
      'or {"finding_index": <number>, "action": "reject", "reason": "<why the finding is ' +
      'wrong>", "evidence_paths": ["<repository-relative path, optionally path:START-END>"]}]}. ' +
      "A reject becomes a dispute the next round must engage, and a dispute without evidence " +
      "is refused. Change no file now: the fixes are asked for as a step after your answer."
    );
  }

  private async phaseDispositions(): Promise<void> {
    const round = latestRound(this.repoRoot, this.sessionNumber);
    if (round === null || round["blocking"] !== true) {
      this.setPhase("verify");
      return;
    }
    const roundNumber = Number(round["round"]);
    const findings = Array.isArray(round["findings"]) ? (round["findings"] as Row[]) : [];
    let set = readDispositions(this.repoRoot, this.sessionNumber);
    if (set !== null && set.round !== roundNumber) set = null;

    let refusals: string[] = [];
    while (set === null) {
      const instruction = await this.converse({
        kind: "rejection",
        round: roundNumber,
        ask: this.dispositionAsk(roundNumber),
        reasons: [
          ...findings.map((finding, index) => describeFinding(index, finding)),
          ...refusals,
        ],
        answer_schema: DISPOSITION_SCHEMA,
        answer_command: this.answerCommand("file"),
      });
      const answered = readDispositions(this.repoRoot, this.sessionNumber);
      refusals = [];
      if (answered === null || answered.round !== roundNumber || answered.seq !== instruction.seq) {
        refusals.push(
          `no disposition of round ${roundNumber} answered instruction ${instruction.seq}; ` +
            `the answer is \`${instruction.answer_command}\``,
        );
      } else {
        for (const entry of answered.dispositions) {
          if (entry.action !== "reject") continue;
          for (const token of entry.evidence_paths ?? []) {
            const [path] = token.split(":", 1);
            const [rel, problem] = resolveRepoRelative(this.repoRoot, path as string);
            if (rel === null) {
              refusals.push(
                `finding ${entry.finding_index}'s evidence '${token}' is ${problem}; a dispute ` +
                  "cites a file in this repository",
              );
            }
          }
        }
        if (refusals.length === 0) set = answered;
      }
      if (set !== null) break;
      this.setRejections(this.rejections + 1);
      this.log("dispositions-rejected", { seq: instruction.seq, rejection: this.rejections, reasons: refusals });
      if (this.rejections >= MAX_REJECTIONS) {
        throw new Stop(
          "rejected-thrice",
          `round ${roundNumber}'s findings were not dispositioned after ${MAX_REJECTIONS} instructions`,
        );
      }
    }
    this.setRejections(0);
    this.log("dispositions-accepted", {
      round: roundNumber,
      fix: set.dispositions.filter((entry) => entry.action === "fix").map((entry) => entry.finding_index),
      reject: set.dispositions.filter((entry) => entry.action === "reject").map((entry) => entry.finding_index),
    });

    const recorded = readDisputes(this.repoRoot, this.sessionNumber);
    for (const entry of set.dispositions) {
      if (entry.action !== "reject") continue;
      const already = recorded.some(
        (row) => Number(row["round"]) === roundNumber && Number(row["finding_index"]) === entry.finding_index,
      );
      if (already) continue;
      const code = recordDispute(this.sessionsDir, {
        roundNumber,
        findingIndex: entry.finding_index,
        grounds: String(entry.reason),
        evidence: [...(entry.evidence_paths ?? [])],
      });
      if (code !== EXIT_OK) {
        throw new Stop("verification", `the dispute of finding ${entry.finding_index} was refused (exit ${code})`);
      }
      this.log("dispute-recorded", { round: roundNumber, finding: entry.finding_index });
    }
    this.setPhase(set.dispositions.some((entry) => entry.action === "fix") ? "fix" : "verify");
  }

  private async phaseFix(): Promise<void> {
    const round = latestRound(this.repoRoot, this.sessionNumber);
    const set = readDispositions(this.repoRoot, this.sessionNumber);
    if (round === null || set === null || set.round !== Number(round["round"])) {
      this.setPhase("dispositions");
      return;
    }
    const roundNumber = Number(round["round"]);
    const findings = Array.isArray(round["findings"]) ? (round["findings"] as Row[]) : [];
    const chosen = set.dispositions
      .filter((entry) => entry.action === "fix")
      .map((entry) => describeFinding(entry.finding_index, findings[entry.finding_index] ?? {}));
    await this.runStep({
      id: `fix-round-${roundNumber}`,
      ask:
        `Verification round ${roundNumber} found the following, and you chose to fix each ` +
        "of them:\n" +
        chosen.map((line) => `  ${line}`).join("\n") +
        "\n\nMake the fixes. The framework will run the affected tests, every step's checks " +
        "and another verification round on what you changed.",
      files: [],
      checks: this.allPlanChecks(),
      fromPlan: false,
    });
    // Spent. The next pass through dispositions asks the engine rather than
    // re-acting on an answer it has already used -- which is what turned a
    // cap that wrote no round into a loop.
    clearDispositions(this.repoRoot, this.sessionNumber);
    this.setPhase("preverify");
  }

  // --- the run of record, the landing, the close -----------------------------

  private async phaseRunOfRecord(): Promise<void> {
    for (const suite of this.expensiveSuites()) {
      this.log("run-of-record", { suite: suite.name, command: suite.command });
      const code = await this.longWork({
        name: `run of record: ${suite.name}`,
        argv: [
          ...selfArgv(),
          "test-evidence",
          "run",
          "--sessions-dir",
          this.sessionsDir,
          "--suite",
          suite.name,
          "--stage",
          "final-full",
        ],
        retryAfterSeconds: SUITE_RETRY_SECONDS,
        stopKind: "tests",
      });
      if (code === EXIT_OK) continue;
      if (code !== 1) {
        throw new Stop("tests", `the run of record for ${suite.name} could not be recorded (exit ${code})`);
      }
      this.log("tests-failed", { command: suite.command });
      await this.runStep({
        id: "fix-run-of-record",
        ask:
          `The run of record failed: \`${suite.command}\`, the complete ${suite.name} suite ` +
          "against the verified tree. Fix the cause. The framework will run the affected " +
          "tests, verification and the suite again.",
        files: [],
        checks: this.allPlanChecks(),
        fromPlan: false,
      });
      this.setPhase("preverify");
      return;
    }
    this.setPhase("land");
  }

  /**
   * Whether this repository declares the candidate gate: `release.gate:
   * candidate` in `dabbler.yaml`. Read raw and defensively -- an absent or
   * unreadable declaration is today's direct land, so nothing changes under
   * anyone silently.
   */
  private gateIsCandidate(): boolean {
    try {
      const text = readFileSync(join(this.repoRoot, "dabbler.yaml"), "utf8");
      const match = /^release:\s*$[\s\S]*?^\s+gate:\s*candidate\s*$/m.exec(text);
      return match !== null;
    } catch {
      return false;
    }
  }

  private phaseLand(): void {
    const task = this.requirePlan().task.split("\n")[0]?.trim() || "driven session";
    runGit(this.repoRoot, ["add", "-A", "--", "."]);
    const committed = runGit(this.repoRoot, [
      "commit", "-m", `Session ${this.sessionNumber}: ${task}`,
    ]);
    if (committed.code !== 0) {
      // git says "nothing to commit" on stdout and exits 1; that is a session
      // whose work is already committed, which is not a failure to land.
      const output = `${committed.stdout}\n${committed.stderr}`.toLowerCase();
      if (!output.includes("nothing to commit")) {
        throw new Stop("land", `git commit failed: ${tail(committed.stderr || committed.stdout, 300)}`);
      }
    }
    if (!existsSync(join(this.repoRoot, ".dabbler", "local-only"))) {
      // Asked before the push rather than read out of its failure. git
      // answers a repository with no remote with `fatal: No configuration
      // push destination`, and that is two wrong words in one line: nothing
      // was fatal -- the commit landed and the session is intact -- and the
      // problem is not a missing configuration but a repository nobody has
      // given anywhere to push to, which is the ordinary state of a
      // repository on its first day. A session stopped by it should be told
      // what to do, not handed git's diagnosis of its own internals.
      const remotes = runGit(this.repoRoot, ["remote"]);
      if (remotes.code !== 0 || remotes.stdout.trim() === "") {
        throw new Stop(
          "land",
          "this repository has no remote, so there is nowhere to push. The " +
            "commit landed and nothing is lost. Either add a remote (`git " +
            "remote add origin <url>` and push once to set the upstream), " +
            "or say the repository is local by creating the empty file " +
            "`.dabbler/local-only`, which makes the land commit and stop " +
            "there.",
        );
      }
      if (this.gateIsCandidate()) {
        // The merge gate: master only moves to a full-check-green exact
        // SHA, so the land pushes candidate/s<N> at the tested SHA and the
        // gate workflow fast-forwards master on green. The receipt is the
        // record the delegation stands on.
        const tested = runGit(this.repoRoot, ["rev-parse", "HEAD"]).stdout;
        const base = runGit(this.repoRoot, ["rev-parse", "origin/master"]).stdout;
        const branch = `candidate/s${this.sessionNumber}`;
        const pushed = runGit(this.repoRoot, ["push", "origin", `HEAD:refs/heads/${branch}`]);
        if (pushed.code !== 0) {
          throw new Stop("land", `the candidate push was refused: ${tail(pushed.stderr, 300)}`);
        }
        const receipt = {
          mode: "candidate",
          branch,
          base_sha: base,
          tested_sha: tested,
          executor: "ci",
          pushed_at: nowIso(),
        };
        const receiptPath = join(
          this.repoRoot, ".dabbler", "runs", `s${this.sessionNumber}`, "driver", "gate-receipt.json",
        );
        mkdirSync(dirname(receiptPath), { recursive: true });
        writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
        this.log("candidate-pushed", { branch, tested: tested.slice(0, 12) });
        this.setPhase("gate-wait");
        return;
      }
      const pushed = runGit(this.repoRoot, ["push"]);
      if (pushed.code !== 0) {
        // A push that reached a remote and was refused keeps git's own
        // words: a rejected non-fast-forward, a credential, a protected
        // branch. That text IS the diagnosis there, and rewriting it would
        // cost the operator the one string worth searching for.
        throw new Stop("land", `the push was refused: ${tail(pushed.stderr, 300)}`);
      }
    }
    // The local executor's receipt: the same record the candidate mode
    // writes, from the machine that ran the full check itself. One shape,
    // two executors -- which is what makes the delegation auditable in a
    // repository that will never have CI.
    const localTested = runGit(this.repoRoot, ["rev-parse", "HEAD"]).stdout;
    const localReceipt = {
      mode: "local",
      branch: "master",
      base_sha: localTested,
      tested_sha: localTested,
      executor: "local",
      pushed_at: nowIso(),
    };
    const localReceiptPath = join(
      this.repoRoot, ".dabbler", "runs", `s${this.sessionNumber}`, "driver", "gate-receipt.json",
    );
    mkdirSync(dirname(localReceiptPath), { recursive: true });
    writeFileSync(localReceiptPath, `${JSON.stringify(localReceipt, null, 2)}\n`, "utf8");
    this.log("landed", { commit: runGit(this.repoRoot, ["rev-parse", "--short", "HEAD"]).stdout });
    this.setPhase("publish");
  }

  /**
   * Wait for the gate to move master to the tested SHA, then act on it.
   *
   * The poll is git-only -- `merge-base --is-ancestor tested origin/master`
   * needs no CI vendor's API -- so the same wait works against any host the
   * gate workflow runs on. Green pulls master forward and the lifecycle
   * proceeds; a poll that runs out says where to look and stops, which
   * routes the red run's failures into remediation the way every stop does.
   */
  private async phaseGateWait(): Promise<void> {
    const receiptPath = join(
      this.repoRoot, ".dabbler", "runs", `s${this.sessionNumber}`, "driver", "gate-receipt.json",
    );
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { tested_sha: string };
    const script =
      "const {execFileSync}=require('node:child_process');" +
      "const sha=process.argv[1];const until=Date.now()+25*60*1000;" +
      "const tick=()=>{try{execFileSync('git',['fetch','origin','master'],{stdio:'ignore'});" +
      "execFileSync('git',['merge-base','--is-ancestor',sha,'origin/master'],{stdio:'ignore'});" +
      "process.exit(0);}catch{}" +
      "if(Date.now()>until){console.error('the gate did not move master to '+sha+' in 25 minutes; read the candidate-gate run');process.exit(3);}" +
      "setTimeout(tick,30000);};tick();";
    const code = await this.longWork({
      name: "candidate gate",
      argv: [process.execPath, "-e", script, receipt.tested_sha],
      retryAfterSeconds: 60,
      stopKind: "land",
    });
    if (code !== EXIT_OK) {
      throw new Stop(
        "land",
        "the candidate gate did not go green; the run's failure list is the " +
          "remediation input, and the branch is still standing with it.",
      );
    }
    const pulled = runGit(this.repoRoot, ["pull", "--ff-only"]);
    if (pulled.code !== 0) {
      throw new Stop("land", `master moved but the pull was refused: ${tail(pulled.stderr, 300)}`);
    }
    this.log("landed", { commit: runGit(this.repoRoot, ["rev-parse", "--short", "HEAD"]).stdout });
    this.setPhase("publish");
  }

  /**
   * Step (f), for a session that declared it may publish.
   *
   * **Between the land and the close, and it cannot be anywhere else.**
   * `packageSession` asks the close's own gates before it packs, and two of
   * them -- `working_tree_clean` and `pushed_to_remote` -- are false until
   * the commit and the push have happened. The field report from csv-model
   * proposed putting this before the land; there it would refuse every
   * time. After the close is no good either: `packaging` requires a session
   * in flight, and the close ends the flight. One window exists, and this
   * is it.
   *
   * Until now nothing occupied that window under the driven lifecycle. The
   * verb existed, the declaration was accepted, the gates passed, and no
   * phase ever called it -- so a session that declared itself releasable
   * landed, closed `VERIFIED` and shipped nothing, while the guidance told
   * the engine the framework had done the publishing. That is the defect
   * this phase closes, and `published_when_releasable` is what stops it
   * reopening quietly the next time this phase does not run.
   *
   * A session that is not releasable passes straight through, silently:
   * there is nothing to say about a step that does not apply.
   *
   * What the pack writes lands in `.dabbler/runs/s<N>/package/`, which is
   * inside the ignored run directory -- so the artifact cannot dirty the
   * tree the gates just called clean. That is a property of where the
   * output goes rather than of this phase, and it is stated here because
   * this is the phase that would break if it ever changed.
   */
  private async phasePublish(): Promise<void> {
    // The DECLARATION, which is what `packageSession` and the close gate
    // both read. The plan carries a `releasable` too and the engine writes
    // it, and `phasePlan` turns it into a declaration only when there is
    // not one already -- so an operator who declared the session before it
    // was driven can disagree with the plan, and the two disagreeing is
    // worse in both directions: reading the plan here publishes what was
    // declared not-releasable, or skips a publish the close then demands a
    // packaging row for. The plan may PROPOSE it; the declaration decides.
    if (!sessionIsReleasable(this.sessionsDir, this.sessionNumber)) {
      this.setPhase("close");
      return;
    }
    const code = await this.longWork({
      name: "publish",
      argv: [...selfArgv(), "packaging", "--sessions-dir", this.sessionsDir],
      retryAfterSeconds: PUBLISH_RETRY_SECONDS,
      stopKind: "publish",
    });
    if (code !== EXIT_OK) {
      // Every refusal packaging can raise is already written to its own log
      // and to the packaging record, in its own words -- a gate that did not
      // pass, a credential that is not set, a feed that would not take the
      // artifact. Restating it here would be a second, worse copy.
      throw new Stop(
        "publish",
        "the packaging run did not publish; its reasons are in the publish " +
          "job's own log and in the session's packaging record, and nothing " +
          "here can answer them",
      );
    }
    this.log("published", { session: sessionDisplayNumber(this.sessionNumber) });
    this.setPhase("close");
  }

  private async phaseClose(): Promise<void> {
    const code = await this.longWork({
      name: "close",
      argv: [...selfArgv(), "session", "close", "--sessions-dir", this.sessionsDir],
      retryAfterSeconds: CLOSE_RETRY_SECONDS,
      stopKind: "close",
    });
    if (code !== EXIT_OK) {
      throw new Stop(
        "close",
        "the close refused; its gate rows are in the close's own log, and nothing " +
          "here can answer them",
      );
    }
    this.issue({ kind: "done" });
    this.setPhase("complete");
  }

  // --- the loop --------------------------------------------------------------

  /**
   * The one loop, under both modes. It runs phase by phase and ends when
   * the session is over, when a Stop lands, or -- under the pull only --
   * when a phase unwinds with something to ask for.
   */
  private async loop(): Promise<number> {
    try {
      for (;;) {
        // A stop asked for while the framework's own phase was running (a
        // verification round, the suite) takes effect at this boundary.
        if (this.run.phase !== "complete") this.honourPendingStop();
        switch (this.run.phase) {
          case "plan":
            await this.phasePlan();
            break;
          case "steps":
            await this.phaseSteps();
            break;
          case "preverify":
            await this.phasePreverify();
            break;
          case "verify":
            await this.phaseVerify();
            break;
          case "dispositions":
            await this.phaseDispositions();
            break;
          case "fix":
            await this.phaseFix();
            break;
          case "run-of-record":
            await this.phaseRunOfRecord();
            break;
          case "land":
            this.phaseLand();
            break;
          case "gate-wait":
            await this.phaseGateWait();
            break;
          case "publish":
            await this.phasePublish();
            break;
          case "close":
            await this.phaseClose();
            break;
          case "complete":
            this.log("session-complete", {
              session: sessionDisplayNumber(this.sessionNumber),
              invocations: this.run.invocations,
            });
            // The invocation count is the framework's own spending, and
            // under the pull it spent none: the engine was the person's CLI
            // and its bill is theirs. Saying "0 engine invocations" there
            // would read as a session that did nothing.
            writeOut(
              `dabbler: session ${sessionDisplayNumber(this.sessionNumber)} complete` +
                (this.pull ? ".\n" : ` after ${this.run.invocations} engine invocation(s).\n`),
            );
            // Nothing more is expected, and the pull says so in the one
            // shape it says everything: the `done` the close issued.
            if (this.pull) {
              const done =
                readInstruction(this.repoRoot, this.sessionNumber) ??
                this.issue({ kind: "done" });
              throw new Awaiting(done.kind === "done" ? done : this.issue({ kind: "done" }));
            }
            return EXIT_OK;
        }
      }
    } catch (error) {
      if (!(error instanceof Stop)) throw error;
      // A stop abandons the run, and a job still running under it -- the
      // suite, a verification round, the close -- is abandoned with it. It
      // is ended here, in the one place every Stop passes through, rather
      // than at each site that can throw one: a `session interrupt --stop`
      // read while the pull was waiting on the job is the common case, and
      // the job it would otherwise leave behind is exactly the tree found
      // squatting on the operator's machine 38 hours later.
      const abandoned = this.run.job ?? null;
      if (abandoned !== null) {
        endJob(abandoned);
        this.run = { ...this.run, job: null };
        this.log("job-ended", { name: abandoned.name, pid: abandoned.pid, reason: error.message });
      }
      const entry = {
        kind: error.kind,
        reason: error.message,
        at: nowIso(),
        step_id: this.currentStep,
      };
      const history = this.run.stop_history ?? [];
      const previous = history.length > 0 ? history[history.length - 1] : null;
      // The same bound, on the same step, for the same reason as last time:
      // the loop is not making progress, and the next re-run reaches here
      // again. The comparison is against the UNDECORATED reason the history
      // keeps, so a third identical stop is recognised as readily as this
      // one -- a reason that carried its own note would never match again.
      const deadlock =
        previous !== undefined &&
        previous !== null &&
        previous.kind === entry.kind &&
        (previous.step_id ?? null) === entry.step_id &&
        previous.reason === entry.reason;
      const reason = deadlock ? `${error.message}${DEADLOCK_NOTE}` : error.message;
      this.run = {
        ...this.run,
        stop: {
          kind: entry.kind,
          reason,
          at: entry.at,
          step_id: entry.step_id,
          class: deadlock ? "deadlock" : "first",
        },
        stop_history: [...history, entry].slice(-STOP_HISTORY_CAP),
      };
      this.save();
      // A loop going nowhere is asked about before a person is. Only a
      // deadlock, only unattended, and only once per impasse.
      //
      // Whatever happens in there, the human floor is reached: the try is
      // what makes "the ladder always terminates at the human" true rather
      // than aspirational. An outage, an expired key, a bug in the rung
      // itself -- none of them may cost the operator the row that says the
      // session stopped, because that row is the only thing standing
      // between a halted session and nobody finding out.
      let ladder: Ladder | null = null;
      if (deadlock && !this.pull) {
        try {
          ladder = await this.climbLadder(entry);
        } catch (failure) {
          // A ladder that fell over classified nothing, which is the floor's
          // own brief -- not the confident "run it again" that no ladder at
          // all would have earned.
          this.log("triage-abandoned", { reason: (failure as Error).message });
          ladder = { advice: null };
        }
        this.save();
      }
      this.raiseStopDecision(error.kind, reason, ladder);
      writeErr(
        `dabbler: STOPPED (${error.kind}${deadlock ? ", deadlock" : ""}) in phase ` +
          `'${this.run.phase}' after ${this.run.invocations} invocation(s) -- ${reason}\n` +
          `Session ${sessionDisplayNumber(this.sessionNumber)} stays in flight; ` +
          "the same command re-runs from this phase.\n",
      );
      return EXIT_GATE_FAILED;
    }
  }

  /**
   * One move: the loop, run until it has something to ask for, handing back
   * the instruction rather than invoking anybody with it.
   */
  async advance(): Promise<{ code: number; instruction: DriverInstruction | null }> {
    try {
      return { code: await this.loop(), instruction: null };
    } catch (error) {
      if (!(error instanceof Awaiting)) throw error;
      return { code: EXIT_OK, instruction: error.instruction };
    }
  }

  /**
   * Push: the same move, with the engine invoked between phases instead of
   * a person's CLI calling back.
   *
   * There is deliberately nothing to iterate here. The engine's invocation
   * is inside `converse` and a job's poll is inside `longWork`, so under
   * the push a move only ends when the session does -- `drive` is one call
   * of exactly what `next` calls, and that is what makes them one loop
   * rather than two that agree.
   */
  async drive(): Promise<number> {
    return (await this.advance()).code;
  }
}

/** Everything both entry points do before the loop: the repository and its config. */
async function withDriver(
  sessionsDir: string,
  options: DriverOptions,
  run: (driver: Driver) => Promise<number>,
): Promise<number> {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`dabbler: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  let config: RouterConfig;
  try {
    // The repository under `--sessions-dir`, never the one the command was
    // typed in. The driver reads its invocation cap, its engine_output, its
    // check timeouts and -- the one that does damage -- its `testing.suites`
    // from this: a config resolved from the working directory would run
    // another repository's suite against this tree and record it as this
    // session's evidence.
    config = loadConfig(undefined, repoRoot);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    writeErr(`dabbler: ${error.message}\n`);
    return EXIT_USAGE;
  }
  const driver = new Driver(sessionsDir, options, repoRoot, config);
  try {
    const registered = driver.register();
    if (registered !== EXIT_OK) return registered;
    return await run(driver);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`dabbler: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
}

/**
 * Drive the session that is next, from registration to close. The exit
 * code is the close's when the loop reaches it, and a gate failure when it
 * stops short -- the stop is on `run.json`, in words.
 */
export async function driveSession(sessionsDir: string, options: DriveOptions): Promise<number> {
  return withDriver(sessionsDir, { ...options, mode: "push" }, (driver) => driver.drive());
}

/**
 * Advance the session one move and print the instruction to answer.
 *
 * The same loop `driveSession` runs, with the engine on the other side of
 * the call: this returns as soon as it has something to ask for, and the
 * person's own CLI does the work and calls it again. Stdout carries exactly
 * one thing -- the instruction, as `driver-instruction` JSON -- so a
 * parser reads it; everything the verbs on the way there would have printed
 * is diverted to stderr, where the person still sees it.
 *
 * The invocation budget is not counted here. `driver.max_invocations`
 * bounds what the FRAMEWORK spends invoking an engine, and under the pull
 * it is the person's own CLI spending. The three-rejection bound stays:
 * that one is about an answer that is not getting better.
 */
export async function sessionNext(sessionsDir: string, options: NextOptions): Promise<number> {
  let instruction: DriverInstruction | null = null;
  const code = await divertOut(() =>
    withDriver(
      sessionsDir,
      {
        engine: options.engine ?? null,
        provider: options.provider ?? null,
        model: options.model ?? null,
        effort: options.effort ?? null,
        adapter: null,
        transport: options.transport ?? null,
        mode: "pull",
      },
      async (driver) => {
        const outcome = await driver.advance();
        instruction = outcome.instruction;
        return outcome.code;
      },
    ),
  );
  if (instruction !== null) writeOut(`${JSON.stringify(instruction, null, 2)}\n`);
  return code;
}

// --- run: one command, the whole session --------------------------------------

export interface RunCliOptions {
  readonly maxInvocations: number | null;
  readonly showEngine: string | null;
}

/**
 * Drive the in-flight session to `done` in one command, identity from the
 * record. The developer's vocabulary is start, interact, cancel: `run` is
 * what makes the middle word optional. A registered built-in engine is
 * invoked per instruction through the same adapter machinery the push has
 * always had; an engine the framework cannot invoke non-interactively
 * degrades to watcher-only -- the loop waits, renders the clock readings
 * with their recommended actions, and never pretends a liveness it cannot
 * provide.
 */
export async function runWholeSession(
  sessionsDir: string,
  options: RunCliOptions,
): Promise<number> {
  const state = readRawSessionState(sessionsDir);
  const sessions = Array.isArray(state?.["sessions"])
    ? (state?.["sessions"] as Array<Record<string, unknown>>)
    : [];
  const inFlight = sessions.find((row) => row["status"] === "in-progress");
  if (inFlight === undefined) {
    writeErr(
      "run: no session is in flight. Register one first -- `dabbler session " +
        "next --sessions-dir <dir> --engine <engine> --provider <provider>` " +
        "-- and `run` takes it from there.\n",
    );
    return EXIT_BOUNDARY;
  }
  const orchestrator = typeof inFlight["orchestrator"] === "object" && inFlight["orchestrator"] !== null && !Array.isArray(inFlight["orchestrator"])
    ? (inFlight["orchestrator"] as Record<string, unknown>)
    : {};
  const engine = typeof orchestrator["engine"] === "string" ? orchestrator["engine"] : "";
  const sessionNumber = Number(inFlight["number"]);
  const repoRoot = repoRootFromSessionsDir(sessionsDir);


  if ((BUILT_IN_ENGINES as readonly string[]).includes(engine)) {
    const adapter = builtInEngine(
      engine,
      typeof orchestrator["model"] === "string" ? orchestrator["model"] : null,
    );
    if (typeof adapter === "string") {
      writeErr(`run: ${adapter}\n`);
      return EXIT_USAGE;
    }
    appendSupervision(repoRoot, sessionNumber, {
      event: "session-run-started",
      engine,
      mode: "invoke",
      max_invocations: options.maxInvocations ?? null,
    });
    return driveSession(sessionsDir, {
      engine,
      provider: typeof orchestrator["provider"] === "string" ? orchestrator["provider"] : null,
      model: typeof orchestrator["model"] === "string" ? orchestrator["model"] : null,
      effort: typeof orchestrator["effort"] === "string" ? orchestrator["effort"] : null,
      adapter,
      engineOutput:
        options.showEngine === null ? null : (options.showEngine as "stream" | "quiet"),
      maxInvocations: options.maxInvocations,
    });
  }

  // Watcher-only: this engine answers in a CLI the framework does not
  // invoke. The loop still owns the waiting -- wait instructions sleep
  // their own retry, and an outstanding step renders the clock reading so
  // the silence is at least named.
  appendSupervision(repoRoot, sessionNumber, {
    event: "session-run-started",
    engine,
    mode: "watcher-only",
  });
  const threshold = 120;
  for (;;) {
    const code = await sessionNext(sessionsDir, {});
    let instruction;
    try {
      instruction = readInstruction(repoRoot, sessionNumber);
    } catch {
      return code;
    }
    if (instruction === null) return code;
    if (instruction.kind === "done") return EXIT_OK;
    if (instruction.kind === "wait") {
      const retry = Number(instruction.retry_after_seconds ?? 60);
      await new Promise((resolve) => setTimeout(resolve, Math.max(5, retry) * 1000));
      continue;
    }
    const reading = readWatcher(repoRoot, sessionNumber, threshold);
    if (reading.state !== "quiet") {
      writeErr(
        `run: [${reading.clock ?? "watch"}] ${reading.state} for ` +
          `${reading.sinceSeconds}s -- ${reading.recommended_action ?? ""}\n`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, threshold * 1000));
  }
}


/**
 * What a call site does about a standing job under another name.
 *
 * "behind": the job is still running, so this site is earlier in the same
 * walk than the site that started it -- answer EXIT_OK and let the walk
 * catch up. "stale": the job has exited (or vanished) uncollected, which is
 * cross-phase leftover state; collect it, clear it, and do your own work.
 * Pure so the rule is testable without a driver.
 */
export function staleJobDisposition(
  standingName: string,
  requestedName: string,
  polledState: string,
): "behind" | "stale" {
  if (standingName === requestedName) return "behind";
  return polledState === "running" ? "behind" : "stale";
}
