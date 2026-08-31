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
// catch. What is validated here is the SHAPE. The substance -- is this the
// outstanding seq, the step that was asked for, do the files exist, does
// the check pass -- is the driver's judgment, and it lives in one place.

import { existsSync, readFileSync } from "node:fs";
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
  atomicWriteJsonIndented,
  readRounds,
  sessionRunDir,
} from "./ledger.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";

export const DRIVER_DIRNAME = "driver";
export const DRIVER_SCHEMA_VERSION = 1;

export const INSTRUCTION_FILENAME = "instruction.json";
export const REPORT_FILENAME = "report.json";
export const PLAN_FILENAME = "plan.json";
export const DISPOSITIONS_FILENAME = "dispositions.json";

export const RUN_FILENAME = "run.json";

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

/**
 * One transcript per engine invocation, numbered by invocation rather than
 * by seq: a rejected step is re-invoked under a new seq, and an interrupt
 * re-invokes under the same one, so neither number is the count of times
 * the engine ran.
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

function validateAgainst<T>(record: unknown, schemaName: string, noun: string): T {
  const failure = schemaFailure(record, loadSchemaFile(schemaName), noun);
  if (failure) throw new LedgerError(failure);
  return record as T;
}

export function validateInstruction(record: unknown): DriverInstruction {
  return validateAgainst<DriverInstruction>(record, INSTRUCTION_SCHEMA, "driver instruction");
}

export function validateReport(record: unknown): DriverReport {
  return validateAgainst<DriverReport>(record, REPORT_SCHEMA, "driver report");
}

/**
 * A work plan's step ids are unique, which a schema cannot say of one
 * member across items: two steps with one id would make a report for
 * either one a report for both.
 */
export function validateWorkPlan(record: unknown): DriverWorkPlan {
  const plan = validateAgainst<DriverWorkPlan>(record, WORK_PLAN_SCHEMA, "driver work plan");
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
export function validateDispositions(record: unknown): DriverDisposition {
  const set = validateAgainst<DriverDisposition>(record, DISPOSITION_SCHEMA, "driver disposition");
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

export function validateRun(record: unknown): DriverRun {
  return validateAgainst<DriverRun>(record, RUN_SCHEMA, "driver run");
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
 */
function readArtifact<T>(path: string, validate: (record: unknown) => T): T | null {
  if (!existsSync(path)) return null;
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new LedgerError(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validate(record);
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
