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
import { testEvidenceVerb } from "./cli/testEvidence.ts";
import { writeErr, writeOut } from "./cli/output.ts";
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
  close,
  declare,
  extractSpecExcerpt,
  start,
} from "./session.ts";
import { loadSuitesChecked } from "./testEvidence.ts";
import { recordDispute, resolveRepoRelative } from "./verify/disputes.ts";
import { EXIT_BLOCKING, EXIT_OK as VERIFY_OK } from "./verify/errors.ts";
import { runRound } from "./verify/rounds.ts";
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

export const MAX_REJECTIONS = 3;
/** How often a running invocation looks for an interrupt request. */
const INTERRUPT_POLL_MS = 500;
/** What a deferred Send reads as, first among the next instruction's reasons. */
const SENT_PREFIX = "sent: ";

type StopKind = NonNullable<DriverRun["stop"]>["kind"];

/** The loop halting short of the close, with the reason a person reads. */
class Stop extends Error {
  constructor(
    readonly kind: StopKind,
    reason: string,
  ) {
    super(reason);
    this.name = "Stop";
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
  private readonly repoRoot: string;
  private readonly config: RouterConfig;
  private sessionNumber = 0;
  private run!: DriverRun;
  private plan: DriverWorkPlan | null = null;
  /** Sends that arrived with no invocation to end; the next instruction carries them. */
  private deferred: string[] = [];

  constructor(
    private readonly sessionsDir: string,
    private readonly options: DriveOptions,
    repoRoot: string,
    config: RouterConfig,
  ) {
    this.repoRoot = repoRoot;
    this.config = config;
  }

  // --- output and state ------------------------------------------------------

  private log(event: string, fields: Record<string, unknown> = {}): void {
    const extra = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join(" ");
    writeOut(`drive [${clock()}] ${event}${extra ? ` ${extra}` : ""}\n`);
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

  /** Register (or re-register) and load or open the run's state. */
  register(): number {
    const code = start(this.sessionsDir, {
      engine: this.options.engine,
      provider: this.options.provider ?? null,
      model: this.options.model ?? null,
      effort: this.options.effort ?? null,
    });
    if (code !== EXIT_OK) return code;
    const state = readSessionState(this.sessionsDir);
    const current = state ? state["currentSession"] : null;
    if (typeof current !== "number") {
      writeErr("drive: refused -- no session is in flight after registration.\n");
      return EXIT_BOUNDARY;
    }
    this.sessionNumber = current;
    // A request left over from before this run has nothing to interrupt.
    takeInterrupt(this.repoRoot, current);

    const existing = readRun(this.repoRoot, current);
    const cap = this.options.maxInvocations ?? driverInvocationCap(this.config);
    if (existing === null) {
      const now = nowIso();
      this.run = {
        schema_version: DRIVER_SCHEMA_VERSION,
        session_number: current,
        engine: this.options.adapter.name,
        phase: "plan",
        seq: 0,
        invocations: 0,
        max_invocations: cap,
        accepted_steps: [],
        baseline_tree: null,
        stop: null,
        started_at: now,
        updated_at: now,
      };
      this.save();
      this.log("run-started", { session: sessionDisplayNumber(current), engine: this.run.engine, max_invocations: cap });
      return EXIT_OK;
    }
    if (existing.engine !== this.options.adapter.name) {
      writeErr(
        `drive: refused -- session ${sessionDisplayNumber(current)} is being driven ` +
          `through '${existing.engine}', and this run names '${this.options.adapter.name}'. ` +
          "One engine's session store carries a run; finish it with the engine it started with.\n",
      );
      return EXIT_BOUNDARY;
    }
    this.run = {
      ...existing,
      max_invocations: this.options.maxInvocations ?? existing.max_invocations,
      stop: null,
    };
    this.save();
    this.log("run-resumed", {
      session: sessionDisplayNumber(current),
      phase: this.run.phase,
      invocations: this.run.invocations,
      max_invocations: this.run.max_invocations,
      ...(existing.stop ? { after: existing.stop.kind } : {}),
    });
    return EXIT_OK;
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
    let outcome;
    try {
      outcome = await this.options.adapter.invoke({
        instruction,
        instructionPath: instructionPath(this.repoRoot, this.sessionNumber),
        repoRoot: this.repoRoot,
        sessionsDir: this.sessionsDir,
        sessionNumber: this.sessionNumber,
        invocation,
        first,
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
    let rejections = 0;
    while (plan === null) {
      const instruction = await this.converse({
        kind: rejections === 0 ? "step" : "rejection",
        step_id: "plan",
        ask: this.planAsk(),
        ...(rejections > 0 ? { reasons } : {}),
        answer_schema: WORK_PLAN_SCHEMA,
        answer_command: this.answerCommand("file"),
      });
      plan = readWorkPlan(this.repoRoot, this.sessionNumber);
      if (plan !== null) break;
      reasons = [
        `no work plan was written for instruction ${instruction.seq}; the answer is ` +
          `\`${instruction.answer_command}\``,
      ];
      rejections += 1;
      this.log("plan-rejected", { seq: instruction.seq, rejection: rejections, reasons });
      if (rejections >= MAX_REJECTIONS) {
        throw new Stop(
          "rejected-thrice",
          `no work plan was written after ${MAX_REJECTIONS} instructions`,
        );
      }
    }
    this.plan = plan;
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
    let rejections = 0;
    let reasons: string[] = [];
    for (;;) {
      const instruction = await this.converse({
        kind: rejections === 0 ? "step" : "rejection",
        step_id: spec.id,
        ask: this.stepAsk(spec, rejections > 0),
        ...(rejections > 0 ? { reasons } : {}),
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
        this.save();
        this.log("report-accepted", { seq: instruction.seq, step: spec.id, files: report?.files_changed });
        return;
      }
      reasons = judged;
      rejections += 1;
      this.log("report-rejected", { seq: instruction.seq, step: spec.id, rejection: rejections, reasons });
      if (rejections >= MAX_REJECTIONS) {
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
      const code = await testEvidenceVerb([
        "run", "--sessions-dir", this.sessionsDir, "--suite", suite.name,
        "--stage", "preverify-targeted", "--command", command,
      ]);
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

  // --- verification ----------------------------------------------------------

  private async phaseVerify(): Promise<void> {
    const code = await runRound(this.sessionsDir, {
      maxRounds: this.options.maxRounds ?? null,
      transport: this.options.transport ?? null,
    });
    if (code === VERIFY_OK) {
      this.setPhase("run-of-record");
      return;
    }
    if (code === EXIT_BLOCKING) {
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

    let rejections = 0;
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
      rejections += 1;
      this.log("dispositions-rejected", { seq: instruction.seq, rejection: rejections, reasons: refusals });
      if (rejections >= MAX_REJECTIONS) {
        throw new Stop(
          "rejected-thrice",
          `round ${roundNumber}'s findings were not dispositioned after ${MAX_REJECTIONS} instructions`,
        );
      }
    }
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
      const code = await testEvidenceVerb([
        "run", "--sessions-dir", this.sessionsDir, "--suite", suite.name, "--stage", "final-full",
      ]);
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

  private phaseClose(): void {
    const code = close(this.sessionsDir);
    if (code !== EXIT_OK) {
      throw new Stop("close", "the close refused (its gate rows are above); nothing here can answer it");
    }
    this.issue({ kind: "done" });
    this.setPhase("complete");
  }

  // --- the loop --------------------------------------------------------------

  async drive(): Promise<number> {
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
            this.phaseClose();
            break;
          case "complete":
            writeOut(
              `drive: session ${sessionDisplayNumber(this.sessionNumber)} complete after ` +
                `${this.run.invocations} engine invocation(s).\n`,
            );
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
        `drive: STOPPED (${error.kind}) in phase '${this.run.phase}' after ` +
          `${this.run.invocations} invocation(s) -- ${error.message}\n` +
          `Session ${sessionDisplayNumber(this.sessionNumber)} stays in flight; ` +
          "the same command re-runs from this phase.\n",
      );
      return EXIT_GATE_FAILED;
    }
  }
}

/**
 * Drive the session that is next, from registration to close. The exit
 * code is the close's when the loop reaches it, and a gate failure when it
 * stops short -- the stop is on `run.json`, in words.
 */
export async function driveSession(sessionsDir: string, options: DriveOptions): Promise<number> {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`drive: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  let config: RouterConfig;
  try {
    config = loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    writeErr(`drive: ${error.message}\n`);
    return EXIT_USAGE;
  }
  const driver = new Driver(sessionsDir, options, repoRoot, config);
  try {
    const registered = driver.register();
    if (registered !== EXIT_OK) return registered;
    return await driver.drive();
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`drive: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
}
