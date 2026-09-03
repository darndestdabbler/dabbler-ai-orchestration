// The machine-only run ledger: `.dabbler/runs/s<N>/rounds.jsonl` and,
// beside it, `step-execution.jsonl` (one row per step opened and one per
// step closed), `disputes.jsonl` (one row per disputed finding),
// `baseline-reanchors.jsonl`, `packaging.jsonl` and the
// `critique/<change-id>/` subtree of critique artifacts.
//
// One row per completed verification round, appended only by `verify`. The
// close gate reads it. There is no stamp and no backstop: the record is
// trustworthy because nothing else writes it, and a row that fails schema
// validation on read is a refusal, never a skip -- a hand-edited ledger
// blocks the close instead of passing it.
//
// The directory is machine-side, not session work: `bootstrap` writes the
// `.dabbler/` ignore rule into the consumer project, and the evidence
// primitives exclude the directory from every tree snapshot and diff
// regardless -- a round record must never look like a change the session
// made, since it is appended *after* the tree it describes.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { anchorRoundTree } from "./journal.ts";
import { RUNS_DIRNAME, platformNewlines } from "./journal.ts";
import { dumps } from "./pythonJson.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";
import { VERSION } from "./version.ts";

export { MACHINE_DIRNAME, RUNS_DIRNAME } from "./journal.ts";

/**
 * The set-directory files the lifecycle writes *about* a session rather
 * than as part of one.
 *
 * Declared once, because every module that has to tell the record from the
 * work asks the same question -- what a close commits, what an evidence
 * diff drops, what a covered-surface change ignores, and what a plan's file
 * envelope may never declare. The session plan is deliberately absent: a
 * session editing the plan it is running against mid-flight is drift, not
 * ceremony.
 */
export const LIFECYCLE_WRITTEN_FILES: readonly string[] = [
  "sessions.json",
  "activity-log.json",
  "change-log.md",
  "decisions-log.md",
  "project-work-plan.md",
];

/**
 * Row types that end a session: no verification round may open after one,
 * and a session carries at most one.
 *
 * `adjudication` is a third provider's judgment of the recorded disputes;
 * `remediated_at_cap` is the cap terminal where every blocking finding was
 * fixed and the cap left the fix unreviewed. `waive` is retired -- no
 * writer emits it -- but historical ledgers carry it, so readers still
 * recognize it as terminal.
 */
export const ROW_ADJUDICATION = "adjudication";
export const ROW_REMEDIATED_AT_CAP = "remediated_at_cap";
export const ROW_WAIVE = "waive";
export const TERMINAL_ROW_TYPES: ReadonlySet<string> = new Set([
  ROW_ADJUDICATION,
  ROW_REMEDIATED_AT_CAP,
  ROW_WAIVE,
]);

/**
 * The ledger is unreadable or fails validation.
 *
 * Fail closed: the caller must treat the verification record as absent,
 * never guess.
 */
export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export type Row = Record<string, unknown>;
export type Validator = (record: Row) => Row;

// --- Paths -------------------------------------------------------------------

export function sessionRunDir(repoRoot: string, sessionNumber: number): string {
  return join(repoRoot, ...RUNS_DIRNAME.split("/"), `s${Math.trunc(sessionNumber)}`);
}

export function roundsPath(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), "rounds.jsonl");
}

export function rawOutputPath(
  repoRoot: string,
  sessionNumber: number,
  roundNumber: number,
): string {
  return join(
    sessionRunDir(repoRoot, sessionNumber),
    `round-${Math.trunc(roundNumber)}-verifier-output.md`,
  );
}

// --- Validation --------------------------------------------------------------

function validateAgainst(record: Row, schemaName: string, noun: string): Row {
  const failure = schemaFailure(record, loadSchemaFile(schemaName), `${noun} record`);
  if (failure) throw new LedgerError(failure);
  return record;
}

export function validateRound(record: Row): Row {
  return validateAgainst(record, "rounds.schema.json", "round");
}

export function validateDispute(record: Row): Row {
  return validateAgainst(record, "disputes.schema.json", "dispute");
}

export function validateReanchor(record: Row): Row {
  return validateAgainst(record, "baseline-reanchor.schema.json", "baseline re-anchor");
}

export function validateStepEvent(record: Row): Row {
  return validateAgainst(record, "step-execution.schema.json", "step execution");
}

export function validatePackaging(record: Row): Row {
  return validateAgainst(record, "packaging.schema.json", "packaging");
}

// --- JSONL -------------------------------------------------------------------

/**
 * Every row of one JSONL file, validated.
 *
 * A missing file is no rows, which is a legitimate state. An unparseable or
 * schema-invalid line is not: the ledger is machine-written, so a bad line
 * is evidence of tampering or corruption, not noise to skip.
 */
export function readJsonl(path: string, validate: Validator): Row[] {
  if (!existsSync(path)) return [];
  return parseJsonlText(readFileSync(path, "utf8"), validate, path);
}

/**
 * The pure half of `readJsonl`: every row of one JSONL text, validated,
 * with a refusal naming `source` and the file's own line number.
 */
export function parseJsonlText(text: string, validate: Validator, source = "<text>"): Row[] {
  const records: Row[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  // Python's `splitlines()` drops a trailing empty field where `split` keeps
  // one, and a blank line is skipped either way -- so the line numbers below
  // are the file's own, which is what a refusal has to name.
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new LedgerError(
        `${source} line ${index + 1} is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      throw new LedgerError(`${source} line ${index + 1} is not an object`);
    }
    try {
      validate(record as Row);
    } catch (error) {
      throw new LedgerError(
        `${source} line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    records.push(record as Row);
  }
  return records;
}

/**
 * One record on the end of a machine-owned log. Exported because the
 * driver's own append-only records live beside the run rather than here,
 * and a second implementation of "how this repository writes a JSONL line"
 * is how two logs end up with two newline conventions.
 */
export function appendJsonl(path: string, record: Row): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, platformNewlines(dumps(record) + "\n"), { encoding: "utf8" });
}

// --- rounds.jsonl ------------------------------------------------------------

/** Every recorded round, ascending. */
export function readRounds(repoRoot: string, sessionNumber: number): Row[] {
  const rounds = readJsonl(roundsPath(repoRoot, sessionNumber), validateRound);
  rounds.sort((left, right) => Number(left["round"]) - Number(right["round"]));
  return rounds;
}

export function latestRound(repoRoot: string, sessionNumber: number): Row | null {
  const rounds = readRounds(repoRoot, sessionNumber);
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

/**
 * Append one validated round row. Refuses a duplicate round number --
 * rounds are immutable history, never rewritten.
 *
 * The row's `completion_tree` is anchored in the same call: wrapped in a
 * commit that `refs/dabbler/rounds/s<N>/r<R>` names, so the baseline the
 * next round diffs from survives garbage collection and travels with a
 * push. A tree this store does not hold gets no anchor and the row says so
 * by carrying no `anchor_commit`.
 */
export function appendRound(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  roundToAppend(readRounds(repoRoot, sessionNumber), sessionNumber, record);
  const anchor = anchorRoundTree(
    repoRoot,
    sessionNumber,
    Number(record["round"]),
    String(record["completion_tree"]),
  );
  if (anchor) record["anchor_commit"] = anchor;
  appendJsonl(roundsPath(repoRoot, sessionNumber), record);
  return record;
}

/**
 * The pure half of `appendRound`: the row stamped and validated against the
 * rounds already recorded, or a refusal. Mutates and returns `record`.
 */
export function roundToAppend(existing: readonly Row[], sessionNumber: number, record: Row): Row {
  // The framework stamps itself here rather than at each of the three call
  // sites that build a row -- the round, the adjudication, the cap
  // terminal. A stamp a caller can forget is a stamp that is absent on the
  // row that most needed it, and absence already means something else: a
  // row written before the stamp existed.
  record["framework_version"] = VERSION;
  validateRound(record);
  if (existing.some((row) => row["round"] === record["round"])) {
    throw new LedgerError(
      `round ${String(record["round"])} is already recorded for session ` +
        `${sessionNumber}; rounds are append-only and never overwritten`,
    );
  }
  return record;
}

/**
 * Save the verifier's raw response before any parsing or display.
 *
 * The bytes are written exactly as they arrived -- no line-ending
 * translation -- because this file is the evidence, and a Windows rewrite
 * of it would make the record differ from what the verifier said.
 */
export function saveRawOutput(
  repoRoot: string,
  sessionNumber: number,
  roundNumber: number,
  content: string,
): string {
  const path = rawOutputPath(repoRoot, sessionNumber, roundNumber);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { encoding: "utf8" });
  return path;
}

export function nextRoundNumber(repoRoot: string, sessionNumber: number): number {
  const rounds = readRounds(repoRoot, sessionNumber);
  return rounds.length > 0 ? Number(rounds[rounds.length - 1]["round"]) + 1 : 1;
}

// --- baseline-reanchors.jsonl ------------------------------------------------

export const REANCHOR_FILENAME = "baseline-reanchors.jsonl";

export function reanchorsPath(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), REANCHOR_FILENAME);
}

/** Every recorded re-anchor, ascending by round. */
export function readReanchors(repoRoot: string, sessionNumber: number): Row[] {
  const rows = readJsonl(reanchorsPath(repoRoot, sessionNumber), validateReanchor);
  rows.sort((left, right) => Number(left["round"]) - Number(right["round"]));
  return rows;
}

/**
 * Append one validated re-anchor. Refuses a second one for the same round:
 * a baseline is recovered once, and a round whose recovery can be revised
 * is a round whose scope the author chooses.
 */
export function appendReanchor(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  validateReanchor(record);
  for (const existing of readReanchors(repoRoot, sessionNumber)) {
    if (existing["round"] === record["round"]) {
      throw new LedgerError(
        `round ${String(record["round"])} of session ${sessionNumber} is ` +
          `already re-anchored to ${String(existing["anchor_tree"]).slice(0, 12)}; ` +
          "a baseline is recovered once, never revised",
      );
    }
  }
  appendJsonl(reanchorsPath(repoRoot, sessionNumber), record);
  return record;
}

/**
 * The tree a later round actually diffs from: the round's recorded
 * completion tree, or the re-anchored substitute when one was recorded.
 *
 * Callers must use this rather than reading `completion_tree` directly, or
 * a recovered session silently diffs against an object it lacks.
 */
export function effectiveBaseline(
  repoRoot: string,
  sessionNumber: number,
  roundRow: Row | null,
): unknown {
  const recorded = (roundRow ?? {})["completion_tree"];
  if (!recorded) return recorded;
  for (const row of readReanchors(repoRoot, sessionNumber)) {
    if (row["round"] === (roundRow ?? {})["round"]) return row["anchor_tree"];
  }
  return recorded;
}

// --- step-execution.jsonl ----------------------------------------------------

export const STEP_EXECUTION_FILENAME = "step-execution.jsonl";

export const STEP_EVENT_OPENED = "opened";
export const STEP_EVENT_CLOSED = "closed";
export const STEP_SCHEMA_VERSION = 1;

export function stepExecutionPath(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), STEP_EXECUTION_FILENAME);
}

export function readStepEvents(repoRoot: string, sessionNumber: number): Row[] {
  return readJsonl(stepExecutionPath(repoRoot, sessionNumber), validateStepEvent);
}

/**
 * Append one validated step row. Append-only like every other row here: a
 * step's history is what happened, not what it should have.
 */
export function appendStepEvent(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  validateStepEvent(record);
  appendJsonl(stepExecutionPath(repoRoot, sessionNumber), record);
  return record;
}

/**
 * The last opened row with no closed row after it. One at a time is a
 * property of this fold, not a count anybody maintains. Pure over the rows;
 * `openStep` reads them.
 */
export function openStepIn(events: readonly Row[]): Row | null {
  let current: Row | null = null;
  for (const event of events) {
    if (event["event"] === STEP_EVENT_OPENED) current = event;
    else if (event["event"] === STEP_EVENT_CLOSED) current = null;
  }
  return current;
}

/** The step this session has in flight, or null. */
export function openStep(repoRoot: string, sessionNumber: number): Row | null {
  return openStepIn(readStepEvents(repoRoot, sessionNumber));
}

/**
 * The steps this session has already executed, in the order they closed. A
 * step is executed once; re-opening one would put a second commit and a
 * second review against the same declared envelope.
 */
export function closedStepIds(repoRoot: string, sessionNumber: number): unknown[] {
  return readStepEvents(repoRoot, sessionNumber)
    .filter((event) => event["event"] === STEP_EVENT_CLOSED)
    .map((event) => event["step_id"]);
}

/**
 * The worktree snapshot the session's most recent step closed on, or null
 * before the first close.
 *
 * This is where the next step's change set starts. A closed step's work
 * stays in the working tree until the session commits, so measuring the
 * next step against the commit it opened on would charge it for its
 * predecessor's files. Measuring against the snapshot instead charges it
 * for exactly what changed since -- including a second edit to a file an
 * earlier step created, which is the open step's work and nobody else's.
 */
export function lastClosedTree(repoRoot: string, sessionNumber: number): unknown {
  const trees = readStepEvents(repoRoot, sessionNumber)
    .filter((event) => event["event"] === STEP_EVENT_CLOSED)
    .map((event) => event["closed_tree"]);
  return trees.length > 0 ? trees[trees.length - 1] : null;
}

/**
 * Every step open anywhere in this repository.
 *
 * The question a commit guard asks. It is answered from the execution
 * record alone because a hook gets no arguments and must not have to
 * resolve which session is active to know whether a step is in flight:
 * each row names its own session.
 */
export function openStepsInRepo(repoRoot: string): Row[] {
  const runs = join(repoRoot, ...RUNS_DIRNAME.split("/"));
  if (!isDirectory(runs)) return [];
  const openRows: Row[] = [];
  for (const path of sortedStepExecutionFiles(runs)) {
    const row = openStepIn(readJsonl(path, validateStepEvent));
    if (row !== null) openRows.push(row);
  }
  return openRows;
}

/**
 * Each session directory's `step-execution.jsonl`, in Python's glob order --
 * which sorts the paths, so two runs agree on which open step comes first.
 */
function sortedStepExecutionFiles(runs: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(runs).sort()) {
    if (!entry.startsWith("s")) continue;
    const candidate = join(runs, entry, STEP_EXECUTION_FILENAME);
    if (existsSync(candidate)) found.push(candidate);
  }
  return found;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// --- disputes.jsonl ----------------------------------------------------------

export function disputesPath(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), "disputes.jsonl");
}

export function readDisputes(repoRoot: string, sessionNumber: number): Row[] {
  return readJsonl(disputesPath(repoRoot, sessionNumber), validateDispute);
}

/**
 * Append one validated dispute row. One dispute per finding, ever -- a
 * dispute is immutable, and re-arguing a judged point is the loop this
 * channel exists to end.
 */
export function appendDispute(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  validateDispute(record);
  const existing = readDisputes(repoRoot, sessionNumber);
  const clash = existing.some(
    (row) =>
      row["round"] === record["round"] &&
      row["finding_index"] === record["finding_index"],
  );
  if (clash) {
    throw new LedgerError(
      `finding ${String(record["finding_index"])} of round ${String(record["round"])} ` +
        `is already disputed for session ${sessionNumber}; disputes are ` +
        "immutable and a finding is disputed at most once",
    );
  }
  appendJsonl(disputesPath(repoRoot, sessionNumber), record);
  return record;
}

// --- packaging.jsonl ---------------------------------------------------------

export const PACKAGE_DIRNAME = "package";

export function packagingPath(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), "packaging.jsonl");
}

/**
 * Where `pack` writes. Inside the run directory rather than the repository,
 * so the artifact set is by construction what this run built and the tree
 * that was verified stays the tree that was verified.
 */
export function packageOutputDir(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), PACKAGE_DIRNAME);
}

/**
 * The three things a packaging run can have been, as the record spells them.
 *
 * Here rather than in `packaging.ts` because they are the RECORD's
 * vocabulary, and this module owns the record: the close's gate has to ask
 * whether a row says `published`, and `packaging` borrows the close's gates
 * as its own preconditions -- so a token defined in `packaging.ts` and read
 * in `gates.ts` would be a cycle, and a token spelled out in both would be
 * the drift a shared vocabulary exists to prevent. `packaging.ts` re-exports
 * them, so its own callers see no difference.
 */
export const OUTCOME_PUBLISHED = "published";
export const OUTCOME_REFUSED = "refused";
export const OUTCOME_FAILED = "failed";

export function readPackaging(repoRoot: string, sessionNumber: number): Row[] {
  return readJsonl(packagingPath(repoRoot, sessionNumber), validatePackaging);
}

/**
 * Append one validated packaging row.
 *
 * Append-only, and refusals append too. A session may be refused, fixed and
 * published, and a record holding only the last of those reads as if the
 * first two never happened.
 */
export function appendPackaging(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  validatePackaging(record);
  appendJsonl(packagingPath(repoRoot, sessionNumber), record);
  return record;
}

// --- Whole-file artifacts ----------------------------------------------------

/**
 * Replace a whole-file artifact in one step, so a reader never sees a
 * half-written record.
 *
 * The temp file is made in the target's own directory, so the rename is
 * within one filesystem and is therefore atomic.
 */
export function atomicWriteJsonIndented(path: string, payload: unknown): string {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `${basename(path)}.${uniqueSuffix()}`);
  try {
    writeFileSync(temp, platformNewlines(dumps(payload, { indent: 2 }) + "\n"), {
      encoding: "utf8",
    });
    renameSync(temp, path);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // The temp file is gone or was never made; either way there is
      // nothing left to clean up.
    }
    throw error;
  }
  return path;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

let sequence = 0;

function uniqueSuffix(): string {
  sequence += 1;
  return `${process.pid}-${sequence}`;
}
