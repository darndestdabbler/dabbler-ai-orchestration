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

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { preverifyBaseline, workingTreeChanges } from "./affected.ts";
import {
  checkRunGreen,
  loadSelectionConfig,
  makeCheck,
  selectTests,
  targetedCommand,
  timeoutFor,
  execute as executeCheck,
} from "./checks.ts";
import { divertOut, writeErr, writeOut } from "./cli/output.ts";
import {
  ConfigError,
  type RouterConfig,
  driverEngineOutput,
  driverInvocationCap,
  loadConfig,
} from "./config.ts";
import {
  DISPOSITION_SCHEMA,
  DRIVER_SCHEMA_VERSION,
  REPORT_SCHEMA,
  WORK_PLAN_SCHEMA,
  instructionPath,
  readDispositions,
  readInstruction,
  readReport,
  readRun,
  readWorkPlan,
  takeInterrupt,
  transcriptPath,
  writeInstruction,
  writeRun,
} from "./driver.ts";
import type { Engine, EngineOutput } from "./engines.ts";
import { SESSION_PLAN_FILENAME } from "./evidence.ts";
import { SET_BOOKKEEPING_COMMIT_BASENAMES } from "./gates.ts";
import type {
  DriverInstruction,
  DriverReport,
  DriverRun,
  DriverWorkPlan,
} from "./generated/index.ts";
import { type Job, pollJob, selfArgv, startJob } from "./jobs.ts";
import {
  changedPathsBetween,
  nowIso,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
} from "./journal.ts";
import { LedgerError, type Row, latestRound, readDisputes } from "./ledger.ts";
import { readSessionState, sessionDisplayNumber } from "./progress.ts";
import {
  EXIT_BOUNDARY,
  EXIT_GATE_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  declare,
  extractSpecExcerpt,
  start,
} from "./session.ts";
import { loadSuitesChecked } from "./testEvidence.ts";
import { recordDispute, resolveRepoRelative } from "./verify/disputes.ts";
import { EXIT_BLOCKING, EXIT_OK as VERIFY_OK } from "./verify/errors.ts";
import { readTaskDeclaration } from "./writers.ts";

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
  readonly maxRounds?: number | null;
  readonly transport?: string | null;
}

/** What `dabbler session next` takes: no adapter, because there is no engine to invoke. */
export interface NextOptions {
  /** Required only when no session is in flight yet; `next` then registers one. */
  readonly engine?: string | null;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly effort?: string | null;
  readonly maxRounds?: number | null;
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
/** How often the push loop looks at a running job; a pull call never waits. */
const JOB_POLL_MS = 250;
/** What a `wait` tells the engine to leave the framework's work alone for. */
const VERIFY_RETRY_SECONDS = 60;
const SUITE_RETRY_SECONDS = 60;
const CLOSE_RETRY_SECONDS = 15;
/** How often a running invocation looks for an interrupt request. */
const INTERRUPT_POLL_MS = 500;
/** What a deferred Send reads as, first among the next instruction's reasons. */
const SENT_PREFIX = "sent: ";

type StopKind = NonNullable<DriverRun["stop"]>["kind"];

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

interface StepSpec {
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
    this.run = writeRun(this.repoRoot, this.sessionNumber, {
      ...this.run,
      updated_at: nowIso(),
    });
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
    // A request left over from before this run has nothing to interrupt --
    // but under the pull every call IS a new run, and a request written
    // between two of them is exactly the one meant for the next. Dropping it
    // here would make `session interrupt --stop` unusable against a pulled
    // session, which is the one place a person has nothing else to press.
    if (!this.pull) takeInterrupt(this.repoRoot, current);

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
      stop: null,
    };
    this.save();
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
   * The round cap and transport this run verifies under: what this call
   * named, or what the run already carries.
   *
   * They are the run's, not a call's. Under the pull the call that reaches
   * verification is whichever `next` happens to get there, following an
   * `answer_command` that names neither -- so a cap or a transport typed
   * once would otherwise be silently dropped for the round it was typed for.
   */
  private verificationSettings(existing: DriverRun["verification"]): DriverRun["verification"] {
    const maxRounds = this.options.maxRounds ?? existing?.max_rounds ?? null;
    const transport = this.options.transport ?? existing?.transport ?? null;
    if (maxRounds === null && transport === null) return null;
    return { max_rounds: maxRounds, transport };
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
    const poll = setInterval(() => {
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
      "files it will touch, because its report is measured against them. Do not include " +
      "schema_version, session_number or recorded_at: the framework stamps them."
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
        `no work plan was written for instruction ${instruction.seq}; the answer is ` +
          `\`${instruction.answer_command}\``,
      ];
      this.setRejections(this.rejections + 1);
      this.log("plan-rejected", { seq: instruction.seq, rejection: this.rejections, reasons });
      if (this.rejections >= MAX_REJECTIONS) {
        throw new Stop(
          "rejected-thrice",
          `no work plan was written after ${MAX_REJECTIONS} instructions`,
        );
      }
    }
    this.plan = plan;
    this.setRejections(0);
    this.log("plan-accepted", { steps: plan.steps.map((step) => step.id), releasable: plan.releasable });

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
    if (this.run.baseline_tree === null) {
      const tree = snapshotWorktreeTree(this.repoRoot);
      if (tree === null) throw new Stop("engine", "could not snapshot the working tree");
      this.run = { ...this.run, baseline_tree: tree };
      this.save();
    }
    let reasons: string[] = [];
    for (;;) {
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
    if (report === null) {
      return [
        `no report was written for instruction ${instruction.seq}; the answer is ` +
          `\`${instruction.answer_command}\``,
      ];
    }
    const reasons: string[] = [];
    if (report.seq !== instruction.seq) {
      reasons.push(`the report answers seq ${report.seq}; instruction ${instruction.seq} is outstanding`);
    }
    if (report.step_id !== spec.id) {
      reasons.push(`the report is for step '${report.step_id}'; the instruction asked for '${spec.id}'`);
    }
    if (reasons.length > 0) return reasons;
    if (report.status === "blocked") return "blocked";

    const current = snapshotWorktreeTree(this.repoRoot);
    if (current === null) throw new Stop("engine", "could not snapshot the working tree");
    const diff = changedPathsBetween(this.repoRoot, String(this.run.baseline_tree), current);
    if (diff === null) throw new Stop("engine", "could not diff the working tree against the last accepted step");
    const setRel = relative(this.repoRoot, this.sessionsDir).replace(/\\/g, "/");
    const changed = diff.filter((path) => {
      const name = path.split("/").pop() ?? path;
      return !(path.startsWith(`${setRel}/`) && SET_BOOKKEEPING_COMMIT_BASENAMES.includes(name));
    });
    for (const file of report.files_changed) {
      if (changed.includes(file)) continue;
      reasons.push(
        existsSync(join(this.repoRoot, file))
          ? `files_changed names '${file}', which the tree did not change since the last accepted step`
          : `files_changed names '${file}', which does not exist`,
      );
    }
    for (const file of changed) {
      if (!report.files_changed.includes(file)) {
        reasons.push(`files_changed omits '${file}', which the tree changed`);
      }
    }
    for (const file of spec.files) {
      if (!report.files_changed.includes(file)) {
        reasons.push(`files_changed must include '${file}', which the step expected to change`);
      }
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
      this.log(green ? "check-passed" : "check-failed", { step: spec.id, argv });
      if (!green) {
        reasons.push(
          `check failed: ${argv.join(" ")} -> exit ${run.exitCode === null ? "none (timed out)" : run.exitCode}` +
            (run.treeMutated ? " (the check changed the tree)" : "") +
            (run.output.trim() ? `\n${tail(run.output)}` : ""),
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

  /** The affected tests, run and recorded; the failing command when one fails. */
  private async preverify(): Promise<string | null> {
    const selection = loadSelectionConfig(this.config);
    if (!selection.ok) {
      throw new Stop("tests", `testing.selection is malformed: ${selection.errors.join("; ")}`);
    }
    const changed = workingTreeChanges(
      this.repoRoot,
      preverifyBaseline(this.repoRoot, this.sessionsDir),
    );
    if (changed === null) throw new Stop("tests", "the change set could not be determined");
    const result = selectTests(this.repoRoot, changed, selection.config);
    for (const suite of this.expensiveSuites()) {
      const command = targetedCommand(suite.command, result.forSuite(suite.name), {
        runsWhole: suite.runsWhole,
      });
      if (command === "") continue;
      this.log("preverify", { suite: suite.name, command });
      // Behind a job like the rest of the framework's own work. A targeted
      // run is short until the day it is not, and `test-evidence run` hands
      // the suite this process's own stdout -- which under the pull is the
      // one channel the instruction has to itself.
      const code = await this.longWork({
        name: `affected tests: ${suite.name}`,
        argv: [
          ...selfArgv(),
          "test-evidence",
          "run",
          "--sessions-dir",
          this.sessionsDir,
          "--suite",
          suite.name,
          "--stage",
          "preverify-targeted",
          "--command",
          command,
        ],
        retryAfterSeconds: SUITE_RETRY_SECONDS,
        stopKind: "tests",
      });
      if (code === 1) return command;
      if (code !== EXIT_OK) {
        throw new Stop("tests", `the pre-verification run for ${suite.name} could not be recorded (exit ${code})`);
      }
    }
    return null;
  }

  private allPlanChecks(): StepSpec["checks"] {
    return this.requirePlan().steps.flatMap((step) => step.checks);
  }

  private async phasePreverify(): Promise<void> {
    for (;;) {
      const failed = await this.preverify();
      if (failed === null) break;
      this.log("tests-failed", { command: failed });
      await this.runStep({
        id: "fix-tests",
        ask:
          `The tests this change affects failed when the framework ran them: \`${failed}\`. ` +
          "Fix the cause. The framework will run them again after your report, and every " +
          "step's checks with them.",
        files: [],
        checks: this.allPlanChecks(),
        fromPlan: false,
      });
    }
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
    // A job outstanding under ANOTHER name means this call site is behind
    // the one that unwound: a phase re-entered from the top walks its suites
    // in the same order, and a call site reached before the outstanding job
    // is one that already finished -- had it failed, the phase would have
    // branched away instead of reaching here.
    if (this.run.job !== null && this.run.job !== undefined && this.run.job.name !== options.name) {
      return EXIT_OK;
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
    throw new Stop(
      "verification",
      `dabbler verify exited ${code} (its reason is above); nothing here can answer it`,
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
      const pushed = runGit(this.repoRoot, ["push"]);
      if (pushed.code !== 0) {
        throw new Stop("land", `git push failed: ${tail(pushed.stderr, 300)}`);
      }
    }
    this.log("landed", { commit: runGit(this.repoRoot, ["rev-parse", "--short", "HEAD"]).stdout });
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
      this.run = {
        ...this.run,
        stop: { kind: error.kind, reason: error.message, at: nowIso() },
      };
      this.save();
      writeErr(
        `dabbler: STOPPED (${error.kind}) in phase '${this.run.phase}' after ` +
          `${this.run.invocations} invocation(s) -- ${error.message}\n` +
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
        maxRounds: options.maxRounds ?? null,
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
