// The driver's ledger: `.dabbler/runs/s<N>/driver/`.
//
// A driven session is a conversation of files. The driver writes
// `instruction.json` -- the one thing it is asking for now -- and the
// engine answers with the file the instruction names: `report.json` for a
// step, `plan.json` for the session's work plan, `dispositions.json` for a
// verifier's findings. Each is a whole-file artifact replaced atomically,
// so a reader never sees half of one, and each is the CURRENT answer: the
// history of a run is its transcripts (one per invocation) and the
// lifecycle's own records, not a stack of superseded answers.
//
// Machine-owned like the rest of `.dabbler/runs/`. The engine reaches this
// directory through `dabbler session report` and never writes it by hand;
// a file that fails schema validation on read is a refusal, not a skip,
// because a hand-written answer is exactly what validation exists to
// catch. A reader is forgiving about ONE thing -- a member it has never
// heard of, which is what a record written by a newer build looks like and
// is not damage. Everything else still refuses, and an unknown member buys
// a smuggler nothing: no reader here looks for one. What is validated here
// is the SHAPE. The substance -- is this the
// outstanding seq, the step that was asked for, do the files exist, does
// the check pass -- is the driver's judgment, and it lives in one place.

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import type {
  DriverDisposition,
  DriverInstruction,
  DriverReport,
  DriverRun,
  DriverWorkPlan,
} from "./generated/index.ts";
import {
  LedgerError,
  type Row,
  appendJsonl,
  atomicWriteJsonIndented,
  readJsonl,
  readRounds,
  sessionRunDir,
} from "./ledger.ts";
import { loadSchemaFile, schemaFailure, tolerantSchemaFailure } from "./schema/validate.ts";

export const DRIVER_DIRNAME = "driver";
export const DRIVER_SCHEMA_VERSION = 1;

export const INSTRUCTION_FILENAME = "instruction.json";
export const REPORT_FILENAME = "report.json";
export const PLAN_FILENAME = "plan.json";
export const DISPOSITIONS_FILENAME = "dispositions.json";

export const RUN_FILENAME = "run.json";
/**
 * Every amendment ever made to this session's work plan, in order.
 *
 * `plan.json` carries the plan as it now stands, because that is what the
 * driver measures the next report against. What changed, why, and who said
 * so belongs where nothing overwrites it -- an amendment whose only trace
 * was the amended plan would be a bar moved by nobody.
 */
export const AMENDMENTS_FILENAME = "amendments.jsonl";
/**
 * A request to end the running invocation, written by `session interrupt`
 * and consumed by the driver -- the one file here that is a message rather
 * than a record, which is why it is removed the moment it is read.
 */
export const INTERRUPT_FILENAME = "interrupt.json";

export const INSTRUCTION_SCHEMA = "driver-instruction.schema.json";
export const REPORT_SCHEMA = "driver-report.schema.json";
export const WORK_PLAN_SCHEMA = "driver-work-plan.schema.json";
export const DISPOSITION_SCHEMA = "driver-disposition.schema.json";
export const RUN_SCHEMA = "driver-run.schema.json";

// --- Paths -------------------------------------------------------------------

export function driverDir(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), DRIVER_DIRNAME);
}

export function instructionPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), INSTRUCTION_FILENAME);
}

export function reportPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), REPORT_FILENAME);
}

export function planPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), PLAN_FILENAME);
}

export function dispositionsPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), DISPOSITIONS_FILENAME);
}

export function runPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), RUN_FILENAME);
}

export function amendmentsPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), AMENDMENTS_FILENAME);
}

export function interruptPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), INTERRUPT_FILENAME);
}

export interface InterruptRequest {
  readonly reason: string;
  readonly requested_at: string;
  /**
   * End the loop as well as the invocation. A plain request is answered by
   * re-invoking the engine with the reason; a stop is answered by halting
   * with `interrupted` on `run.json`, which is what a person pressing Stop
   * means -- and it is honoured wherever the driver next looks, so one that
   * arrives between invocations stops the loop rather than being discarded.
   */
  readonly stop: boolean;
}

/** Ask the driver to end the running invocation; it re-invokes with the reason, or stops. */
export function requestInterrupt(
  repoRoot: string,
  sessionNumber: number,
  reason: string,
  requestedAt: string,
  stop = false,
): InterruptRequest {
  const request: InterruptRequest = { reason, requested_at: requestedAt, stop };
  atomicWriteJsonIndented(interruptPath(repoRoot, sessionNumber), request);
  return request;
}

/** The pending request, removed as it is read; null when there is none. */
export function takeInterrupt(repoRoot: string, sessionNumber: number): InterruptRequest | null {
  const path = interruptPath(repoRoot, sessionNumber);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    unlinkSync(path);
  } catch {
    /* removed between the read and here; the request was still read once */
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const reason = typeof row["reason"] === "string" ? row["reason"].trim() : "";
    return {
      reason: reason === "" ? "no reason was given" : reason,
      requested_at: typeof row["requested_at"] === "string" ? row["requested_at"] : "",
      stop: row["stop"] === true,
    };
  } catch {
    return { reason: "an interrupt request that could not be read", requested_at: "", stop: false };
  }
}

/**
 * One transcript per engine invocation, numbered by invocation rather than
 * by seq: a rejected step and an interrupted one are each re-invoked under
 * a new seq, and a re-run continues the count, so the seq is not the number
 * of times the engine ran.
 */
export function transcriptPath(
  repoRoot: string,
  sessionNumber: number,
  invocation: number,
): string {
  return join(
    driverDir(repoRoot, sessionNumber),
    `engine-${String(Math.trunc(invocation)).padStart(2, "0")}.log`,
  );
}

// --- Validation --------------------------------------------------------------

/**
 * How hard a schema is held to, and which side of the record is asking.
 *
 * `strict` is every WRITER: what this build writes fits the schema exactly,
 * or the reader's forbearance below would be a licence to be sloppy.
 * `tolerant` is every READER: a member this build has never heard of is
 * read past, because a record written by a newer build is not damage and
 * refusing it costs the reader everything the file does say. Nothing else
 * is relaxed -- a wrong type, a missing required member and a file that is
 * not JSON are refusals either way.
 */
export type Strictness = "strict" | "tolerant";

function validateAgainst<T>(
  record: unknown,
  schemaName: string,
  noun: string,
  strictness: Strictness = "strict",
): T {
  const schema = loadSchemaFile(schemaName);
  const failure =
    strictness === "tolerant"
      ? tolerantSchemaFailure(record, schema, noun)
      : schemaFailure(record, schema, noun);
  if (failure) throw new LedgerError(failure);
  return record as T;
}

export function validateInstruction(
  record: unknown,
  strictness: Strictness = "strict",
): DriverInstruction {
  return validateAgainst<DriverInstruction>(
    record,
    INSTRUCTION_SCHEMA,
    "driver instruction",
    strictness,
  );
}

export function validateReport(record: unknown, strictness: Strictness = "strict"): DriverReport {
  return validateAgainst<DriverReport>(record, REPORT_SCHEMA, "driver report", strictness);
}

/**
 * A work plan's step ids are unique, which a schema cannot say of one
 * member across items: two steps with one id would make a report for
 * either one a report for both.
 */
export function validateWorkPlan(
  record: unknown,
  strictness: Strictness = "strict",
): DriverWorkPlan {
  const plan = validateAgainst<DriverWorkPlan>(
    record,
    WORK_PLAN_SCHEMA,
    "driver work plan",
    strictness,
  );
  const seen = new Set<string>();
  for (const step of plan.steps) {
    if (seen.has(step.id)) {
      throw new LedgerError(
        `driver work plan declares step '${step.id}' twice; step ids are unique within a plan`,
      );
    }
    seen.add(step.id);
  }
  return plan;
}

/**
 * A disposition set names each finding once. The schema cannot say that of
 * one member across items; two entries for one finding would leave the
 * driver to choose which the engine meant.
 */
export function validateDispositions(
  record: unknown,
  strictness: Strictness = "strict",
): DriverDisposition {
  const set = validateAgainst<DriverDisposition>(
    record,
    DISPOSITION_SCHEMA,
    "driver disposition",
    strictness,
  );
  const seen = new Set<number>();
  for (const entry of set.dispositions) {
    if (seen.has(entry.finding_index)) {
      throw new LedgerError(
        `driver disposition answers finding ${entry.finding_index} of round ${set.round} twice; ` +
          "a finding is disposed once",
      );
    }
    seen.add(entry.finding_index);
  }
  return set;
}

export function validateRun(record: unknown, strictness: Strictness = "strict"): DriverRun {
  return validateAgainst<DriverRun>(record, RUN_SCHEMA, "driver run", strictness);
}

/**
 * The set held against the round it answers: the round is recorded, every
 * index names one of its findings, and every finding the round marked
 * blocking is answered. A missing answer is how a finding disappears --
 * the engine fixed two of three and the third was never mentioned -- and
 * the record refuses it rather than leaving the driver to notice.
 */
export function holdDispositionsAgainstRound(
  set: DriverDisposition,
  rounds: readonly Row[],
): DriverDisposition {
  const round = rounds.find((row) => row["round"] === set.round);
  if (round === undefined) {
    throw new LedgerError(
      `driver disposition answers round ${set.round}, which the rounds ledger has not recorded`,
    );
  }
  const findings = Array.isArray(round["findings"]) ? (round["findings"] as Row[]) : [];
  for (const entry of set.dispositions) {
    if (entry.finding_index >= findings.length) {
      throw new LedgerError(
        `driver disposition answers finding ${entry.finding_index} of round ${set.round}, ` +
          `which has ${findings.length} finding(s)`,
      );
    }
  }
  const answered = new Set(set.dispositions.map((entry) => entry.finding_index));
  const unanswered = findings
    .map((finding, index) => (finding["blocking"] === true && !answered.has(index) ? index : -1))
    .filter((index) => index >= 0);
  if (unanswered.length > 0) {
    throw new LedgerError(
      `driver disposition leaves blocking finding(s) ${unanswered.join(", ")} of round ` +
        `${set.round} unanswered; every blocking finding is fixed or rejected`,
    );
  }
  return set;
}

// --- Whole-file reads --------------------------------------------------------

/**
 * One artifact, validated. Absent is null -- a legitimate state, before the
 * answer exists. Unparseable or invalid is a refusal: nothing but the
 * framework writes here, so a bad file is a hand in the record.
 *
 * Read TOLERANTLY, and this is the one place that decides it: every
 * whole-file read goes through here, and every writer is elsewhere. A
 * record carrying a member this build does not know is read for what it
 * does carry, which is what an installed extension needs to survive a
 * newer driver -- and it pays from the next driver-changing session on,
 * because the reader it repairs is the reader that ships.
 */
function readArtifact<T>(
  path: string,
  validate: (record: unknown, strictness: Strictness) => T,
): T | null {
  if (!existsSync(path)) return null;
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new LedgerError(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validate(record, "tolerant");
}

export function readInstruction(repoRoot: string, sessionNumber: number): DriverInstruction | null {
  return readArtifact(instructionPath(repoRoot, sessionNumber), validateInstruction);
}

export function readReport(repoRoot: string, sessionNumber: number): DriverReport | null {
  return readArtifact(reportPath(repoRoot, sessionNumber), validateReport);
}

export function readWorkPlan(repoRoot: string, sessionNumber: number): DriverWorkPlan | null {
  return readArtifact(planPath(repoRoot, sessionNumber), validateWorkPlan);
}

export function readDispositions(
  repoRoot: string,
  sessionNumber: number,
): DriverDisposition | null {
  const set = readArtifact(dispositionsPath(repoRoot, sessionNumber), validateDispositions);
  return set === null ? null : holdDispositionsAgainstRound(set, readRounds(repoRoot, sessionNumber));
}

export function readRun(repoRoot: string, sessionNumber: number): DriverRun | null {
  return readArtifact(runPath(repoRoot, sessionNumber), validateRun);
}

// --- Whole-file writes -------------------------------------------------------

// Each writer validates before it writes, so the file on disk is by
// construction one the reader accepts; a writer that trusted its caller
// would be the path by which an invalid answer reached the record.

export function writeInstruction(
  repoRoot: string,
  sessionNumber: number,
  record: unknown,
): DriverInstruction {
  const valid = validateInstruction(record);
  atomicWriteJsonIndented(instructionPath(repoRoot, sessionNumber), valid);
  return valid;
}

export function writeReport(repoRoot: string, sessionNumber: number, record: unknown): DriverReport {
  const valid = validateReport(record);
  atomicWriteJsonIndented(reportPath(repoRoot, sessionNumber), valid);
  return valid;
}

export function writeWorkPlan(
  repoRoot: string,
  sessionNumber: number,
  record: unknown,
): DriverWorkPlan {
  const valid = validateWorkPlan(record);
  atomicWriteJsonIndented(planPath(repoRoot, sessionNumber), valid);
  return valid;
}

export function writeDispositions(
  repoRoot: string,
  sessionNumber: number,
  record: unknown,
): DriverDisposition {
  const valid = holdDispositionsAgainstRound(
    validateDispositions(record),
    readRounds(repoRoot, sessionNumber),
  );
  atomicWriteJsonIndented(dispositionsPath(repoRoot, sessionNumber), valid);
  return valid;
}

export function writeRun(repoRoot: string, sessionNumber: number, record: unknown): DriverRun {
  const valid = validateRun(record);
  atomicWriteJsonIndented(runPath(repoRoot, sessionNumber), valid);
  return valid;
}

// --- Amending a step ---------------------------------------------------------

export interface AmendInput {
  readonly stepId: string;
  /** The step's files as they should now read, whole. Null leaves them alone. */
  readonly files: readonly string[] | null;
  /** The step's checks as they should now read, whole. Null leaves them alone. */
  readonly checks: readonly { readonly argv: readonly string[] }[] | null;
  readonly reason: string;
  readonly approver: string;
}

/**
 * Every amendment made to this session's plan, oldest first.
 *
 * There is no schema over these rows and deliberately not: what an
 * amendment records is the step as it stood and as it now stands, and both
 * halves are already validated -- the before by the reader that accepted
 * the plan, the after by `writeWorkPlan` on the way out.
 */
export function readAmendments(repoRoot: string, sessionNumber: number): Row[] {
  return readJsonl(amendmentsPath(repoRoot, sessionNumber), (record) => record);
}

/**
 * Change what ONE not-yet-accepted step is measured against.
 *
 * Session 62 asked for exactly this and nothing in the framework could do
 * it: an engine that had correctly diagnosed a step it could not satisfy
 * had no way to say so except by failing three times. So the step's `files`
 * and its `checks` are amendable, with a reason and an approver, and the
 * amended plan goes back through `writeWorkPlan` -- an amendment that could
 * write a plan the reader refuses would break the session it meant to save.
 *
 * What is NOT amendable is deliberate. An accepted step's report has been
 * measured; moving its bar afterwards changes what the record says was
 * judged. `task` and `releasable` are the declaration, and a step's `id`
 * and `ask` are the work itself -- a session that wants to do different
 * work replans, and replanning is a thing the record can show.
 */
export function amendPlanStep(
  repoRoot: string,
  sessionNumber: number,
  input: AmendInput,
  acceptedSteps: readonly string[],
  amendedAt: string,
): DriverWorkPlan {
  const reason = input.reason.trim();
  const approver = input.approver.trim();
  if (reason === "" || approver === "") {
    throw new LedgerError(
      "an amendment carries a reason and an approver; a bar moved by nobody, for no " +
        "stated reason, is a bar nobody can hold anyone to",
    );
  }
  if (input.files === null && input.checks === null) {
    throw new LedgerError("an amendment changes the step's files, its checks, or both");
  }
  const plan = readWorkPlan(repoRoot, sessionNumber);
  if (plan === null) {
    throw new LedgerError(
      `session ${sessionNumber} has no work plan; there is no step here to amend`,
    );
  }
  const before = plan.steps.find((step) => step.id === input.stepId);
  if (before === undefined) {
    throw new LedgerError(
      `the work plan declares no step '${input.stepId}'; its steps are ` +
        plan.steps.map((step) => `'${step.id}'`).join(", "),
    );
  }
  if (acceptedSteps.includes(input.stepId)) {
    throw new LedgerError(
      `step '${input.stepId}' has already been accepted; its report was measured against ` +
        "the step as it stood, and amending it now would move that bar afterwards",
    );
  }
  const after = {
    ...before,
    ...(input.files === null ? {} : { files: [...input.files] }),
    ...(input.checks === null ? {} : { checks: input.checks.map((check) => ({ argv: [...check.argv] })) }),
  };
  const amended = writeWorkPlan(repoRoot, sessionNumber, {
    ...plan,
    steps: plan.steps.map((step) => (step.id === input.stepId ? after : step)),
  });
  appendJsonl(amendmentsPath(repoRoot, sessionNumber), {
    schema_version: DRIVER_SCHEMA_VERSION,
    session_number: sessionNumber,
    step_id: input.stepId,
    reason,
    approver,
    amended_at: amendedAt,
    before: { files: [...before.files], checks: before.checks },
    after: { files: after.files, checks: after.checks },
  });
  return amended;
}

// --- Shaping a report --------------------------------------------------------

/**
 * The paths an engine types, made into the paths the schema admits: trimmed,
 * forward slashes, no leading `./`, no blanks, each once. Anything the
 * schema still refuses after this -- an absolute path, a `..` -- is refused
 * with the schema's own sentence rather than repaired, because a path that
 * needs repairing is a path the engine did not mean.
 */
export function normalizeChangedFiles(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const entry of raw) {
    const path = entry.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push(path);
  }
  return files;
}

export interface ReportInput {
  readonly sessionNumber: number;
  readonly seq: number;
  readonly stepId: string;
  readonly status: string;
  readonly files: readonly string[];
  readonly testsRun: string | null;
  readonly notes: string;
}

/** The flags of `dabbler session report`, as the record the schema judges. */
export function shapeReport(input: ReportInput, reportedAt: string): Record<string, unknown> {
  return {
    schema_version: DRIVER_SCHEMA_VERSION,
    seq: input.seq,
    session_number: input.sessionNumber,
    step_id: input.stepId,
    status: input.status,
    files_changed: normalizeChangedFiles(input.files),
    tests_run: input.testsRun,
    notes: input.notes,
    reported_at: reportedAt,
  };
}

// --- Shaping an answer file --------------------------------------------------

/**
 * The engine's answer to a plan or a disposition instruction carries the
 * substance -- the steps, the actions -- and the framework stamps what is its
 * to say: the schema version, the session, the seq and round it answers, the
 * time. An engine that typed one of those and disagreed is refused rather
 * than corrected, because a stamp that can be argued with is not a stamp;
 * one that typed it and agreed is let through, because the record ends up
 * identical either way.
 */
export function stampAnswer(
  answer: unknown,
  stamps: Readonly<Record<string, unknown>>,
  noun: string,
): Record<string, unknown> {
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) {
    throw new LedgerError(`${noun} must be a JSON object`);
  }
  const record = answer as Record<string, unknown>;
  for (const [key, value] of Object.entries(stamps)) {
    if (key in record && JSON.stringify(record[key]) !== JSON.stringify(value)) {
      throw new LedgerError(
        `${noun} carries ${key}=${JSON.stringify(record[key])}, and this session's is ` +
          `${JSON.stringify(value)}; the framework stamps it -- leave it out`,
      );
    }
  }
  return { ...record, ...stamps };
}
