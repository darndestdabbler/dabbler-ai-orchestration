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

import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import type {
  DriverDisposition,
  DriverInstruction,
  DriverReport,
  DriverRun,
  DriverWorkPlan,
} from "./generated/index.ts";
import { MACHINE_DIRNAME, runGit } from "./journal.ts";
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
 * Every repair made to the tree while the run was stopped, in order.
 *
 * The state this file exists for is real and had no edge out of it:
 * *halted, being repaired*. A stop is answered by a person, the answer is
 * often a file, and the next report is measured against a tree the
 * framework snapshotted before that file existed -- so the report omits it
 * and is refused, correctly, forever.
 *
 * It is a record rather than a permission. The tree diff is the framework's
 * strongest edge, and moving the baseline by hand is a hole in it; what
 * makes the hole honest is that the paths and the reason are written down
 * where nothing overwrites them, and that the round and the run of record
 * both still bind to a tree this moves -- so a repair after verification is
 * refused by the same machinery as any other post-verification change.
 */
export const REPAIRS_FILENAME = "repairs.jsonl";
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

export function repairsPath(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), REPAIRS_FILENAME);
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

/**
 * Forget the disposition set, once the driver has acted on it.
 *
 * An answer here is the CURRENT answer, and a set that has already produced
 * its fix step is a spent one. Left in place it is read again the next time
 * the loop passes through dispositions — and if the round it names has not
 * moved, which is exactly the case when the cap refused to write one, the
 * driver re-issues the same fix without asking anybody. That is a cycle
 * costing an engine turn and a suite run per lap, in the colours of ordinary
 * progress.
 *
 * Removing rather than superseding: the file's whole meaning is "what the
 * engine says to do about the round in hand", and there is no such thing as
 * a stale one worth keeping. The history of a run is its transcripts.
 */
export function clearDispositions(repoRoot: string, sessionNumber: number): void {
  try {
    unlinkSync(dispositionsPath(repoRoot, sessionNumber));
  } catch {
    // Never written, or already gone. Both are the state this asks for.
  }
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

export function readRepairs(repoRoot: string, sessionNumber: number): Row[] {
  return readJsonl(repairsPath(repoRoot, sessionNumber), (record) => record);
}

/** What one repair absorbed, and who says why. */
export interface RepairInput {
  readonly reason: string;
  readonly by: string;
  readonly paths: readonly string[];
  readonly baselineTree: string;
  readonly recordedAt: string;
}

/**
 * Move the baseline the next report is measured against, and say so.
 *
 * The whole of the mechanism: `run.json`'s `baseline_tree` becomes the tree
 * as it now stands, and a row goes to `repairs.jsonl` naming what that
 * absorbed. Nothing else changes -- not the phase, not the stop, not a
 * verdict, not a gate. The stop the operator is repairing under is still
 * there to be re-run.
 */
export function recordRepair(
  repoRoot: string,
  sessionNumber: number,
  input: RepairInput,
): Row {
  const run = readRun(repoRoot, sessionNumber);
  if (run === null) {
    throw new LedgerError(`session ${sessionNumber} was never driven; there is no baseline to move`);
  }
  if (!run.stop) {
    throw new LedgerError(
      `session ${sessionNumber}'s run has not stopped. A running loop reports work through ` +
        "its steps, and moving the baseline under one would hide a step's own change from " +
        "the comparison that judges it",
    );
  }
  const row: Row = {
    schema_version: DRIVER_SCHEMA_VERSION,
    session_number: sessionNumber,
    stop_kind: run.stop.kind,
    step_id: run.stop.step_id ?? null,
    reason: input.reason,
    by: input.by,
    paths: [...input.paths],
    from_baseline: run.baseline_tree,
    to_baseline: input.baselineTree,
    recorded_at: input.recordedAt,
  };
  appendJsonl(repairsPath(repoRoot, sessionNumber), row);
  writeRun(repoRoot, sessionNumber, {
    ...run,
    baseline_tree: input.baselineTree,
    updated_at: input.recordedAt,
  });
  return row;
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

export interface RoundCapInput {
  readonly cap: number;
  readonly reason: string;
  readonly approver: string;
}

/**
 * Move the verification round cap this run verifies under.
 *
 * The cap used to come off any `next` call -- `--max-rounds` always won over
 * the persisted value and recorded nothing -- and it moves in BOTH
 * directions: a cap at or below the rounds already run ends the loop on the
 * spot, which is a verification-reducing act. Reachable by anyone who typed
 * a command, attributable to nobody.
 *
 * So it moves here, where the change carries a reason and a name. **This
 * records a claim; it does not prove an authorisation.** The approver is
 * whatever the engine writes, and no gate reads it -- a gate that trusted an
 * engine-written approver would make the authorisation forgeable, which is
 * worse than absent. What the row buys is that the claim EXISTS, next to the
 * rounds already run, reviewable at the close, instead of a bare number
 * appearing on `run.json` with no reason at all.
 */
export function amendRoundCap(
  repoRoot: string,
  sessionNumber: number,
  input: RoundCapInput,
  amendedAt: string,
): DriverRun {
  const reason = input.reason.trim();
  const approver = input.approver.trim();
  if (reason === "" || approver === "") {
    throw new LedgerError(
      "an amendment carries a reason and an approver; a cap moved by nobody, for no " +
        "stated reason, is the bare number this replaces",
    );
  }
  if (!Number.isInteger(input.cap) || input.cap < 1) {
    throw new LedgerError(
      `a round cap is a whole number of rounds, at least one; '${input.cap}' is not`,
    );
  }
  const run = readRun(repoRoot, sessionNumber);
  if (run === null) {
    throw new LedgerError(
      `session ${sessionNumber} was never driven; there is no run whose cap this could move`,
    );
  }
  const before = run.verification?.max_rounds ?? null;
  const amended = writeRun(repoRoot, sessionNumber, {
    ...run,
    verification: {
      max_rounds: input.cap,
      transport: run.verification?.transport ?? null,
    },
    updated_at: amendedAt,
  });
  appendJsonl(amendmentsPath(repoRoot, sessionNumber), {
    schema_version: DRIVER_SCHEMA_VERSION,
    session_number: sessionNumber,
    step_id: null,
    reason,
    approver,
    amended_at: amendedAt,
    // Beside the change, because a cap is only readable against the rounds
    // it is being moved past: 4 after three rounds buys a review, and 1
    // after three ends one.
    rounds_run: readRounds(repoRoot, sessionNumber).length,
    before: { max_rounds: before },
    after: { max_rounds: input.cap },
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

// --- The watcher -------------------------------------------------------------
//
// Two silences look identical from outside: an engine thinking, and an
// engine that has stopped. Nothing here observes the engine -- it is the
// person's own CLI, which is the property the pull was built for -- so the
// rule is read from the three things the conversation of files already
// says: an instruction was issued, nothing answered it, and the tree has
// not moved since. Past the threshold, that is the second silence.
//
// It is stated ONCE, here, and rendered by whoever is watching: the Dabbler
// terminal under the pull, the driver's own log under the push. A second
// statement of it in a renderer is the drift this file's own header
// forbids.

/** The engine is thinking, or nobody is owed anything. Nothing to say. */
/**
 * How many liveness thresholds a job may run, still writing, before the
 * progress clock names it anyway. Five: the configured threshold governs
 * both clocks, and a job five thresholds deep whose only signal is that
 * its log grows is the semantic-spin case the liveness clock is blind to.
 */
export const JOB_SPIN_MULTIPLIER = 5;

export const WATCHER_QUIET = "quiet";
/** An instruction is outstanding, unanswered, over a tree that has not moved. */
export const WATCHER_OUTSTANDING = "instruction-outstanding";
/**
 * A job is running, past the threshold, and writing nothing.
 *
 * The second counterparty, and the one the first rule is structurally blind
 * to: it is quiet whenever `run.job` is set, and under the pull the
 * outstanding instruction during long work is a `wait` re-issued with a
 * fresh stamp on every call — so a wedged verification round reads as the
 * healthiest thing in the record for as long as the engine keeps polling.
 */
export const WATCHER_JOB_OUTSTANDING = "job-outstanding";

export type WatcherState =
  | typeof WATCHER_QUIET
  | typeof WATCHER_OUTSTANDING
  | typeof WATCHER_JOB_OUTSTANDING;

export interface WatcherReading {
  readonly state: WatcherState;
  /** Seconds the instruction or the job has been outstanding; zero when quiet. */
  readonly sinceSeconds: number;
  /** The job being watched, on `job-outstanding` only. */
  readonly job?: string;
  /**
   * Which clock expired: acknowledgment (nothing observed since the
   * instruction), liveness (a job stopped writing), or progress (edits
   * happened, then stopped, and no answer came). Null when quiet.
   * Separate clocks because responsiveness is not progress: an engine can
   * look alive forever while advancing nothing.
   */
  readonly clock?: "acknowledgment" | "liveness" | "progress";
  /** What a supervisor should DO about it, in words the record can carry. */
  readonly recommended_action?: string;
}

export interface WatcherInputs {
  readonly instruction: DriverInstruction | null;
  readonly run: DriverRun | null;
  /**
   * When this conversation was last answered, or null when it never was.
   *
   * The answer FILES, not the run record. `issue` writes the instruction and
   * saves the run a millisecond later, so a run stamped after the issuing is
   * every outstanding instruction there has ever been -- a signal that reads
   * "answered" always is worse than none.
   */
  readonly answeredAt: string | null;
  /**
   * When the working tree was last touched, or null when that is unknown.
   *
   * A thunk rather than a value because it costs a `git status`, and the
   * cheap tests above it settle most polls: a probe run on a poll that could
   * not have used its answer is a git call per 500ms for nothing.
   */
  readonly treeTouchedAt: () => string | null;
  /**
   * Whether the running job's log has grown since the last look, or null
   * when nothing has looked yet.
   *
   * A thunk for the same reason as the tree probe, and the same
   * discrimination: a growing log is a job working, exactly as a moved tree
   * is an engine working. `null` on a first look is not silence — nothing
   * has been compared — so the rule waits for a second one.
   */
  readonly jobLogGrew?: () => boolean | null;
}

/** The instruction kinds that expect an engine answer. `wait` and `done` do not. */
const ANSWERABLE_KINDS: readonly string[] = ["step", "rejection", "interrupt"];

const QUIET: WatcherReading = { state: WATCHER_QUIET, sinceSeconds: 0 };

/**
 * Which silence this is, from the records alone.
 *
 * Quiet through every one of the ordinary ones: nothing asked for; an
 * instruction that expects no answer; a run that has stopped, which is a
 * row of its own and not this one; a job running, which is the framework
 * working rather than the engine; an answer written after the instruction
 * was issued, whether or not the driver has read it yet; a tree touched
 * since, which is the engine editing; and anything inside the threshold.
 */
export function watcherReading(
  inputs: WatcherInputs,
  thresholdSeconds: number,
  now: Date = new Date(),
): WatcherReading {
  const run = inputs.run;
  // A stop is a row of its own and not this one, whichever counterparty is
  // silent behind it.
  if (run?.stop) return QUIET;

  // The framework's own work first, because while a job runs the engine
  // owes nothing: the instruction in hand is a `wait`, which by
  // construction expects no written answer, and under the pull it is
  // re-issued with a fresh stamp on every call. Every test the engine rule
  // makes would read healthy for as long as the operator kept polling a
  // wedged round.
  const job = run?.job ?? null;
  if (job) {
    const started = Date.parse(job.started_at);
    if (!Number.isFinite(started)) return QUIET;
    const running = Math.trunc((now.getTime() - started) / 1000);
    if (running <= thresholdSeconds) return QUIET;
    // A growing log is a job working -- up to a point. JOB_SPIN_MULTIPLIER
    // thresholds past
    // its start, output that only ever grows is the semantic-spin case, and
    // the progress clock names it even while the bytes flow.
    if (inputs.jobLogGrew?.() !== false) {
      if (running <= thresholdSeconds * JOB_SPIN_MULTIPLIER) return QUIET;
      return {
        state: WATCHER_JOB_OUTSTANDING,
        sinceSeconds: running,
        job: job.name,
        clock: "progress",
        recommended_action:
          `the job has run ${Math.trunc(running / Math.max(1, thresholdSeconds))}x past its threshold and is still writing; ` +
          `read ${job.log} -- output that only grows can be a spin, and ending it is the operator's call.`,
      };
    }
    return {
      state: WATCHER_JOB_OUTSTANDING,
      sinceSeconds: running,
      job: job.name,
      clock: "liveness",
      recommended_action:
        `read the tail of ${job.log}; a finished job is collected by the ` +
        "next `session next`, and ending a wedged one is the operator's call.",
    };
  }

  const instruction = inputs.instruction;
  if (instruction === null) return QUIET;
  if (!ANSWERABLE_KINDS.includes(instruction.kind)) return QUIET;
  const issued = Date.parse(instruction.issued_at);
  if (!Number.isFinite(issued)) return QUIET;
  const answered = Date.parse(inputs.answeredAt ?? "");
  if (Number.isFinite(answered) && answered > issued) return QUIET;
  const elapsed = Math.trunc((now.getTime() - issued) / 1000);
  if (elapsed <= thresholdSeconds) return QUIET;
  const touched = Date.parse(inputs.treeTouchedAt() ?? "");
  if (Number.isFinite(touched) && touched > issued) {
    // Edits happened -- responsiveness -- but responsiveness is not
    // progress. Recent edits are an engine working and say nothing; edits
    // that STOPPED, with the answer still owed, are the progress clock,
    // and the old rule read them as healthy forever.
    const sinceTouch = Math.trunc((now.getTime() - touched) / 1000);
    if (sinceTouch <= thresholdSeconds) return QUIET;
    return {
      state: WATCHER_OUTSTANDING,
      sinceSeconds: sinceTouch,
      clock: "progress",
      recommended_action:
        "edits happened and stopped without a report; the outstanding " +
        "instruction's answer_command is what is owed.",
    };
  }
  // Nothing observed at all since the instruction: the acknowledgment
  // clock, and past five thresholds it stops being "slow to start" and
  // becomes the progress clock's problem too.
  return {
    state: WATCHER_OUTSTANDING,
    sinceSeconds: elapsed,
    clock: elapsed > thresholdSeconds * 5 ? "progress" : "acknowledgment",
    recommended_action:
      "nothing has been observed since the instruction was issued; " +
      "re-invoke the engine -- `dabbler session next` prints the " +
      "outstanding instruction again.",
  };
}

/**
 * When the working tree was last touched, or null.
 *
 * The mtime of the newest path `git status --porcelain` names -- the files
 * an engine's edits show up in. A tree with nothing changed answers null,
 * which is not "long ago": it is "this signal has nothing to say", and the
 * rule above treats it as such rather than as evidence of a stall.
 *
 * A path git had to quote is read as it was written, quotes and all, and
 * fails to stat. That costs the probe one path and never the reverse: the
 * watcher speaks one silence too many, it does not miss one.
 *
 * `.dabbler/` is skipped whatever the repository's ignore rules say. The
 * question is whether the ENGINE is editing, and the framework's own record
 * -- this very instruction, written a moment ago -- is not an answer to it.
 * A project that has not ignored the machine directory would otherwise
 * report a tree touched by the act of asking.
 */
export function treeTouchedAt(repoRoot: string): string | null {
  const status = runGit(repoRoot, ["status", "--porcelain"]);
  if (status.code !== 0) return null;
  let newest = 0;
  for (const line of status.stdout.split("\n")) {
    if (line.length < 4) continue;
    const named = line.slice(3);
    // A rename reports `old -> new`; the new name is the one that was written.
    const path = named.includes(" -> ") ? named.slice(named.indexOf(" -> ") + 4) : named;
    if (path === MACHINE_DIRNAME || path.startsWith(`${MACHINE_DIRNAME}/`)) continue;
    try {
      const at = statSync(join(repoRoot, path)).mtimeMs;
      if (at > newest) newest = at;
    } catch {
      // Gone between the status and the stat, or a name git quoted. Either
      // way it contributes nothing rather than failing the probe.
    }
  }
  return newest === 0 ? null : new Date(newest).toISOString();
}

/**
 * The rule, applied to one session's driver directory.
 *
 * A record that will not parse is quiet: the watcher is a courtesy, and a
 * courtesy that threw would take the terminal with it.
 */
export function readWatcher(
  repoRoot: string,
  sessionNumber: number,
  thresholdSeconds: number,
  now: Date = new Date(),
  jobLogGrew?: () => boolean | null,
): WatcherReading {
  let instruction: DriverInstruction | null;
  let run: DriverRun | null;
  let answeredAt: string | null;
  try {
    instruction = readInstruction(repoRoot, sessionNumber);
    run = readRun(repoRoot, sessionNumber);
    answeredAt = lastAnsweredAt(repoRoot, sessionNumber);
  } catch {
    return QUIET;
  }
  return watcherReading(
    {
      instruction,
      run,
      answeredAt,
      treeTouchedAt: () => treeTouchedAt(repoRoot),
      // A caller that has been reading the log already knows whether it
      // grew -- the terminal drains it every 500ms -- so it supplies the
      // answer. One that has not compares sizes itself, here.
      jobLogGrew: jobLogGrew ?? (() => jobLogGrewSince(repoRoot, sessionNumber, run)),
    },
    thresholdSeconds,
    now,
  );
}

/**
 * Whether the running job's log is bigger than the last time this asked.
 *
 * The size is remembered in this process, not on disk: the question is "has
 * it moved since I last looked", and a value on disk would answer a
 * different one and would be a record the machine owns for nobody.
 *
 * Keyed on the job's IDENTITY -- its name, its log path and the moment it
 * started -- rather than on the path alone. A re-run starts a new job under
 * the same name, which truncates and re-uses the same log; compared against
 * the last one's size it would read as "shrunk, therefore silent" on its
 * first look, and warn about a job that had barely begun.
 */
const jobLogSizes = new Map<string, number>();

function jobLogGrewSince(
  repoRoot: string,
  sessionNumber: number,
  run: DriverRun | null,
): boolean | null {
  const job = run?.job;
  const log = job?.log;
  if (!job || !log) return null;
  const path = join(repoRoot, ...log.split("/"));
  const identity = `${sessionNumber}\0${job.name}\0${log}\0${job.started_at}`;
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    // No log yet is not silence: the runner creates it as it starts.
    return null;
  }
  const seen = jobLogSizes.get(identity);
  jobLogSizes.set(identity, size);
  return seen === undefined ? null : size > seen;
}

/**
 * The newest stamp on any of the three files an instruction is answered
 * with, or null when none has been written.
 *
 * All three, because an instruction names one of them and the watcher does
 * not care which: a work plan, a step report and a disposition set are the
 * same event as far as "the engine came back" is concerned.
 */
function lastAnsweredAt(repoRoot: string, sessionNumber: number): string | null {
  const stamps = [
    readReport(repoRoot, sessionNumber)?.reported_at,
    readWorkPlan(repoRoot, sessionNumber)?.recorded_at,
    readDispositions(repoRoot, sessionNumber)?.recorded_at,
  ].filter((at): at is string => typeof at === "string" && at !== "");
  return stamps.length === 0 ? null : stamps.reduce((latest, at) => (at > latest ? at : latest));
}

// --- Rendering a stop for a person -------------------------------------------
//
// The record keeps `kind`, `class`, `reason` and `step_id`, and gates and
// tests read those. A person reads words, and the words are made here and
// nowhere else: the driver's stderr line, the stop's owed decision, the
// `dabbler status` task row and the Dabbler terminal all call this, so none
// of them can word a stop differently from the others.
//
// What the words may say is bounded by what the framework can see. It can
// say the session is paused, which bound the loop met, that the command
// which met it has ended while the session stays in flight, and who is
// expected to act next. It may NOT say the engine is working on it: under
// the pull the framework cannot see the engine at all, and a sentence that
// claimed otherwise would have a person waiting on a process that is gone.

/** The parts of a stop the rendering reads. Every one is on `run.json`. */
export interface StopRecord {
  readonly kind: string;
  readonly reason: string;
  readonly class?: "first" | "deadlock" | null;
  readonly step_id?: string | null;
  readonly at?: string;
}

/** The parts of the run the rendering reads beside the stop. */
export interface StopContext {
  readonly session_number: number;
  readonly phase: string;
  /** The adapter the run names. `cli` is the pull: the framework invokes no engine. */
  readonly engine?: string;
}

export interface StopRendering {
  /** "Session 094 paused (verification, deadlock)". */
  readonly headline: string;
  /** What happened in plain words, then the stop's own reason. */
  readonly happened: string;
  /** That the command which met the stop has ended, and the session has not. */
  readonly ended: string;
  /** Who is expected to act next, and the command that resumes it. */
  readonly next: string;
  /** The four joined, for a surface that renders one string. */
  readonly text: string;
  readonly deadlock: boolean;
}

/** The engine name a pulled run records: nothing invokes the engine. */
export const PULL_ENGINE = "cli";

/** One plain sentence per bound the loop can meet, keyed by the stop's kind. */
const HAPPENED: Readonly<Record<string, string>> = {
  budget: "The loop reached its invocation bound.",
  "rejected-thrice": "An answer was refused three times running.",
  blocked: "The engine reported its step blocked.",
  engine: "The engine could not be run, or what it gave back could not be used.",
  tests: "A test run could not be handed back.",
  verification: "A verification round ended without a verdict the framework could act on.",
  land: "The commit or the push did not go through.",
  publish: "Packaging did not publish.",
  close: "The close's gates refused.",
  interrupted: "Somebody asked it to stop.",
};

/** A reason as a sentence of its own: a capital to start, a stop to end. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/**
 * What a person is told to do about a stop, per kind.
 *
 * The actor is a person for every kind but two. A budget, a blocked step,
 * an engine that would not run, a red suite, a round without a verdict, a
 * refused push, a failed publish or a refused close each need something
 * put right before running again reaches anywhere else. An interruption and
 * a thrice-refused answer are the two a plain re-run answers -- and under
 * the pull the re-run is whoever calls `next`, which the framework cannot
 * see: the engine if its loop is still going, otherwise the person.
 */
function nextMove(stop: StopRecord, run: StopContext): string {
  const pull = (run.engine ?? PULL_ENGINE) === PULL_ENGINE;
  const resume = pull ? "`dabbler session next`" : "`dabbler session drive`";
  const resumes = `${resume} resumes it from '${run.phase}'`;
  const cancel = "`dabbler session cancel` ends it instead";
  const whoever = pull
    ? "whoever calls " + resume + " -- the engine if its loop is still running, otherwise you"
    : "you";
  const step = stop.step_id ? ` '${stop.step_id}'` : "";
  let advice: string;
  switch (stop.kind) {
    case "budget":
      advice =
        "Next: you. Continuing is a decision to spend more: " +
        `${resume} with --max-invocations <larger> resumes it from '${run.phase}', and ${cancel}.`;
      break;
    case "rejected-thrice":
      advice =
        `Next: ${whoever}. Read the last rejection's reasons first; ` +
        `${resume} asks the step${step} afresh, and ${cancel}.`;
      break;
    case "blocked":
      advice =
        `Next: you. Clear what the engine said step${step} is blocked on ` +
        `(an owed item may carry it), then ${resumes}; ${cancel}.`;
      break;
    case "interrupted":
      advice = `Next: ${whoever}. ${resumes}; ${cancel}.`;
      break;
    case "close":
      advice =
        "Next: you. Satisfy the gate the close named -- an owed decision is " +
        `answered with \`dabbler owed answer\` -- then ${resumes}.`;
      break;
    case "land":
      advice = `Next: you. Put right what git refused, then ${resumes}.`;
      break;
    case "publish":
      advice = `Next: you. Read the publish job's log and put it right, then ${resumes}.`;
      break;
    case "tests":
      advice = `Next: you. Read the run's log and put right what stopped it, then ${resumes}.`;
      break;
    case "verification":
      advice = `Next: you. Read the round's reason above and put it right, then ${resumes}.`;
      break;
    default:
      advice = `Next: you. Read the reason above and put it right, then ${resumes}.`;
  }
  if (stop.class === "deadlock") {
    advice +=
      " It is a deadlock: running it again unchanged reaches this exact point again, " +
      "so change something first.";
  }
  return advice;
}

/**
 * A stop, as a person reads it. Pure: the record is the input and words are
 * the output, and nothing here reads a file or decides a lifecycle rule.
 */
export function renderStop(stop: StopRecord, run: StopContext): StopRendering {
  const session = `Session ${String(run.session_number).padStart(3, "0")}`;
  const deadlock = stop.class === "deadlock";
  const headline = `${session} paused (${stop.kind}${deadlock ? ", deadlock" : ""})`;
  const what = HAPPENED[stop.kind] ?? "The loop met a bound it could not pass.";
  const reason = asSentence(stop.reason);
  const happened = reason === "" ? what : `${what} ${reason}`;
  const ended = `The dabbler command that met it has ended; ${session.toLowerCase()} remains in flight.`;
  const next = nextMove(stop, run);
  return {
    headline,
    happened,
    ended,
    next,
    text: `${headline}. ${happened} ${ended} ${next}`,
    deadlock,
  };
}

/**
 * One reading of a run: whether a stop stood (its kind is all the rule
 * needs, so `run.resumed_from` reads here as readily as `run.stop`), and
 * the phase it stood in.
 */
export interface PhaseReading {
  readonly stop: { readonly kind: string } | null | undefined;
  readonly phase: string;
}

/**
 * The first honest green event: a standing stop is gone AND the phase moved
 * on, with nothing standing in its place.
 *
 * A stop merely gone is not progress -- a resume clears it before anything
 * has happened -- and a stop replaced by another is the opposite of
 * progress. Only the phase advancing past the one it paused in says the
 * loop is moving again, and that is the one thing the framework can vouch
 * for from its own record. The driver says it at the phase change; the
 * terminal says it from two polls. One rule, so they cannot disagree.
 */
export function progressResumed(before: PhaseReading, after: PhaseReading): boolean {
  if (!before.stop) return false;
  if (after.stop) return false;
  return after.phase !== before.phase;
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

// --- Supervision --------------------------------------------------------------
//
// The append-only record of every supervision act: a lease taken, a stale
// save refused, a stale report refused, a paid continuation spent. One
// file per session beside the driver's own records, because "who was
// allowed to move the run, and when" is evidence the way a test run is --
// the 2026-09-02 two-driver incident had no record at all, and the repair
// began by admitting that.

import { appendFileSync as supAppend, mkdirSync as supMkdir } from "node:fs";
import { dirname as supDirname } from "node:path";

const SUPERVISION_FILENAME = "supervision.jsonl";

export function appendSupervision(
  repoRoot: string,
  sessionNumber: number,
  event: Record<string, unknown>,
): void {
  const path = join(
    repoRoot, ".dabbler", "runs", `s${sessionNumber}`, "driver", SUPERVISION_FILENAME,
  );
  supMkdir(supDirname(path), { recursive: true });
  supAppend(
    path,
    `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
    "utf8",
  );
}
