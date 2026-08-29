// The critique subtree: `.dabbler/runs/s<N>/critique/<change-id>/`.
//
// The frozen layout, one directory per reviewed change:
//
//   review-run.json  review-claims.json  checks.json
//   worker-results.jsonl  dispositions.jsonl  audits.jsonl
//
// Every surface here is machine-only: validate against the frozen schema
// first, then atomic-replace or append. A record that fails validation is
// never partially written and never best-effort skipped -- it is refused
// and a copy is quarantined beside the subtree, so the rejected payload
// survives for diagnosis without ever being mistaken for the record.
//
// It is the same Python module as the round ledger and is split from it
// here because the two answer different readers: the round ledger is read
// by the close gate and the verification loop, and this subtree by the
// code-review loop alone. Nothing is duplicated across the seam -- the
// JSONL primitives, the validators and the atomic write all come from
// `ledger.ts`.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  LedgerError,
  type Row,
  type Validator,
  atomicWriteJsonIndented,
  readJsonl,
  sessionRunDir,
} from "./ledger.ts";
import { platformNewlines } from "./journal.ts";
import { dumps, pythonRepr } from "./pythonJson.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";

export const CRITIQUE_DIRNAME = "critique";
export const QUARANTINE_DIRNAME = "quarantine";

export const REVIEW_RUN_FILENAME = "review-run.json";
export const G0_SUMMARY_FILENAME = "g0-summary.json";
export const REVIEW_CLAIMS_FILENAME = "review-claims.json";
export const REVIEW_CLAIMS_TWIN_FILENAME = "review-claims.md";
export const CHECKS_FILENAME = "checks.json";
export const WORKER_RESULTS_FILENAME = "worker-results.jsonl";
export const DISPOSITIONS_FILENAME = "dispositions.jsonl";
export const AUDITS_FILENAME = "audits.jsonl";

/**
 * A change-id is a digest, so it is lowercase hex and nothing else.
 *
 * The constraint is a path guard as much as a format one: a value that is
 * not a digest never becomes a directory name.
 */
const CHANGE_ID_RE = /^[0-9a-f]{7,64}$/;

function requireChangeId(changeId: unknown): string {
  if (typeof changeId !== "string" || !CHANGE_ID_RE.test(changeId)) {
    throw new LedgerError(
      `change-id ${pythonRepr(changeId)} is not a derived digest (7-64 ` +
        "lowercase hex characters). It is computed from the reviewed tree by " +
        "python -m ai_router.verify prepare; it is never supplied.",
    );
  }
  return changeId;
}

// --- Paths -------------------------------------------------------------------

export function critiqueRoot(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), CRITIQUE_DIRNAME);
}

export function critiqueDir(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return join(critiqueRoot(repoRoot, sessionNumber), requireChangeId(changeId));
}

export function critiquePath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
  filename: string,
): string {
  return join(critiqueDir(repoRoot, sessionNumber, changeId), filename);
}

// --- Validators ---------------------------------------------------------------

function validateAgainst(record: Row, schemaName: string, noun: string): Row {
  const failure = schemaFailure(record, loadSchemaFile(schemaName), `${noun} record`);
  if (failure) throw new LedgerError(failure);
  return record;
}

export function validateReviewRun(record: Row): Row {
  return validateAgainst(record, "review-run.schema.json", "review run");
}

export function validateReviewClaims(record: Row): Row {
  return validateAgainst(record, "review-claims.schema.json", "review claims");
}

export function validateCheck(record: Row): Row {
  return validateAgainst(record, "check-ir.schema.json", "check");
}

export function validateWorkerResult(record: Row): Row {
  return validateAgainst(record, "worker-results.schema.json", "worker result");
}

export function validateDisposition(record: Row): Row {
  return validateAgainst(record, "dispositions.schema.json", "disposition");
}

// --- Quarantine ---------------------------------------------------------------

/**
 * Beside the per-change subtree, never inside it: the frozen layout lists
 * seven files and a rejected payload is none of them.
 */
export function quarantineDir(repoRoot: string, sessionNumber: number): string {
  return join(critiqueRoot(repoRoot, sessionNumber), QUARANTINE_DIRNAME);
}

/** `20260828T141522123456Z` -- the UTC stamp a quarantined file is named by. */
function quarantineStamp(now: Date): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}` +
    // Python's `%f` is microseconds; JavaScript's clock stops at
    // milliseconds, so the last three places are zeros rather than noise.
    `${pad(now.getUTCMilliseconds(), 3)}000Z`
  );
}

function quarantine(
  repoRoot: string,
  sessionNumber: number,
  noun: string,
  record: unknown,
  reason: string,
): string | null {
  const directory = quarantineDir(repoRoot, sessionNumber);
  const slug =
    noun.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "record";
  const path = join(directory, `${slug}-${quarantineStamp(new Date())}.json`);
  try {
    mkdirSync(directory, { recursive: true });
    const payload = { kind: noun, reason, record };
    writeFileSync(path, platformNewlines(dumps(payload, { indent: 2 }) + "\n"), {
      encoding: "utf8",
    });
  } catch {
    return null;
  }
  return path;
}

/**
 * Validate before anything is written.
 *
 * On failure the record is refused *and* preserved: a rejected payload that
 * is silently dropped leaves an operator with a refusal message and no way
 * to see what was rejected, which is how a bad writer gets blamed on a bad
 * reader.
 */
function validatedOrQuarantined(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
  validate: Validator,
  noun: string,
): Row {
  try {
    return validate(record);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    const path = quarantine(repoRoot, sessionNumber, noun, record, error.message);
    const where = path ? ` A copy is quarantined at ${path}.` : "";
    throw new LedgerError(
      `${error.message} Nothing was written to the run directory.${where}`,
    );
  }
}

// --- Whole-file reads ---------------------------------------------------------

function readJson(
  path: string,
  validate: (record: unknown) => unknown,
  noun: string,
): unknown {
  if (!existsSync(path)) return null;
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new LedgerError(`${path} is not valid JSON: ${error.message}`);
    }
    throw new LedgerError(
      `${path} is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof record !== "object" || record === null) {
    throw new LedgerError(`${path} does not hold a ${noun} record`);
  }
  return validate(record);
}

// --- review-run.json ----------------------------------------------------------

export function reviewRunPath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return critiquePath(repoRoot, sessionNumber, changeId, REVIEW_RUN_FILENAME);
}

export function readReviewRun(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): Row | null {
  return readJson(
    reviewRunPath(repoRoot, sessionNumber, changeId),
    (record) => validateReviewRun(record as Row),
    "review run",
  ) as Row | null;
}

/**
 * Every review run recorded for the session, oldest first. A directory that
 * holds no readable review run is not a review run.
 */
export function readReviewRuns(repoRoot: string, sessionNumber: number): Row[] {
  const root = critiqueRoot(repoRoot, sessionNumber);
  if (!isDirectory(root)) return [];
  const runs: Row[] = [];
  for (const name of readdirSync(root).sort()) {
    if (name === QUARANTINE_DIRNAME) continue;
    const child = join(root, name);
    if (!isDirectory(child)) continue;
    const record = readJson(
      join(child, REVIEW_RUN_FILENAME),
      (value) => validateReviewRun(value as Row),
      "review run",
    ) as Row | null;
    if (record !== null) runs.push(record);
  }
  runs.sort((left, right) => {
    const openedAt = compare(left["opened_at"], right["opened_at"]);
    return openedAt !== 0 ? openedAt : compare(left["change_id"], right["change_id"]);
  });
  return runs;
}

function compare(left: unknown, right: unknown): number {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Atomic-replace the run record.
 *
 * Attempts are append-only: a write that shortens or rewrites an earlier
 * attempt is refused, because a remediation's whole point is that the prior
 * attempt's evidence stays exactly as it was recorded.
 */
export function writeReviewRun(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): string {
  validatedOrQuarantined(repoRoot, sessionNumber, record, validateReviewRun, "review run");
  const changeId = requireChangeId(record["change_id"]);
  const path = reviewRunPath(repoRoot, sessionNumber, changeId);
  const existing = readReviewRun(repoRoot, sessionNumber, changeId);
  if (existing !== null) {
    const prior = existing["attempts"] as unknown[];
    const proposed = record["attempts"] as unknown[];
    if (proposed.length < prior.length || !prefixMatches(prior, proposed)) {
      throw new LedgerError(
        `review run ${changeId} already records ${prior.length} attempt(s); ` +
          "attempts are append-only and a recorded attempt is never rewritten. " +
          "A remediation adds a linked attempt.",
      );
    }
  }
  return atomicWriteJsonIndented(path, record);
}

/**
 * Whether `proposed` starts with exactly `prior`.
 *
 * Compared by serialization, because Python compares the decoded lists by
 * value and JavaScript compares object identity -- two structurally equal
 * attempts read from disk and rebuilt in memory are never `===`.
 */
function prefixMatches(prior: readonly unknown[], proposed: readonly unknown[]): boolean {
  return prior.every((item, index) => dumps(item) === dumps(proposed[index]));
}

// --- review-claims.json -------------------------------------------------------

export function reviewClaimsPath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return critiquePath(repoRoot, sessionNumber, changeId, REVIEW_CLAIMS_FILENAME);
}

/**
 * The human-readable rendering. Decorative by construction: no reader in
 * this package opens it, and deleting it changes no behaviour.
 */
export function reviewClaimsTwinPath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return critiquePath(repoRoot, sessionNumber, changeId, REVIEW_CLAIMS_TWIN_FILENAME);
}

export function readReviewClaims(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): Row | null {
  return readJson(
    reviewClaimsPath(repoRoot, sessionNumber, changeId),
    (record) => validateReviewClaims(record as Row),
    "review claims",
  ) as Row | null;
}

/**
 * The writer's own check, without the write.
 *
 * A caller that must not move machine state until author input is
 * known-good gets the identical refusal and the identical quarantine copy
 * -- pre-checking through a plain validator instead would drop the rejected
 * payload on the floor.
 */
export function screenReviewClaims(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  return validatedOrQuarantined(
    repoRoot,
    sessionNumber,
    record,
    validateReviewClaims,
    "review claims",
  );
}

export function writeReviewClaims(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): string {
  screenReviewClaims(repoRoot, sessionNumber, record);
  return atomicWriteJsonIndented(
    reviewClaimsPath(repoRoot, sessionNumber, String(record["change_id"])),
    record,
  );
}

export function writeReviewClaimsTwin(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
  text: string,
): string {
  const path = reviewClaimsTwinPath(repoRoot, sessionNumber, changeId);
  mkdirSync(join(path, ".."), { recursive: true });
  // `Path.write_text` takes the platform default, so the human-readable
  // twin carries CRLF on Windows exactly as the Python router leaves it.
  writeFileSync(path, platformNewlines(text), { encoding: "utf8" });
  return path;
}

// --- checks.json --------------------------------------------------------------

export function checksPath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return critiquePath(repoRoot, sessionNumber, changeId, CHECKS_FILENAME);
}

export function readChecks(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): Row[] {
  const records = readJson(
    checksPath(repoRoot, sessionNumber, changeId),
    (value) => {
      if (!Array.isArray(value)) {
        throw new LedgerError("checks.json does not hold a list of checks");
      }
      for (const record of value) validateCheck(record as Row);
      return value;
    },
    "checks",
  ) as Row[] | null;
  return records ?? [];
}

export function writeChecks(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
  records: readonly Row[],
): string {
  for (const record of records) {
    validatedOrQuarantined(repoRoot, sessionNumber, record, validateCheck, "check");
  }
  return atomicWriteJsonIndented(checksPath(repoRoot, sessionNumber, changeId), [
    ...records,
  ]);
}

// --- worker-results.jsonl and dispositions.jsonl ------------------------------

export function workerResultsPath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return critiquePath(repoRoot, sessionNumber, changeId, WORKER_RESULTS_FILENAME);
}

export function dispositionsPath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return critiquePath(repoRoot, sessionNumber, changeId, DISPOSITIONS_FILENAME);
}

export function auditsPath(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): string {
  return critiquePath(repoRoot, sessionNumber, changeId, AUDITS_FILENAME);
}

function appendValidated(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
  validate: Validator,
  noun: string,
  pathFor: (repoRoot: string, sessionNumber: number, changeId: string) => string,
  precheck?: (record: Row) => void,
): Row {
  validatedOrQuarantined(repoRoot, sessionNumber, record, validate, noun);
  if (precheck) precheck(record);
  const path = pathFor(repoRoot, sessionNumber, String(record["change_id"]));
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, platformNewlines(dumps(record) + "\n"), {
    encoding: "utf8",
    flag: "a",
  });
  return record;
}

export function readWorkerResults(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): Row[] {
  return readJsonl(
    workerResultsPath(repoRoot, sessionNumber, changeId),
    validateWorkerResult,
  );
}

/**
 * One result per check per attempt.
 *
 * A second row for a check already decided in this attempt is not an
 * append, it is a supersession -- and a superseded `blocked` is exactly how
 * "we ran it again with more context" turns into a pass. A remediation
 * records a new attempt.
 */
export function appendWorkerResult(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  const oneResultPerAttempt = (row: Row): void => {
    for (const prior of readWorkerResults(
      repoRoot,
      sessionNumber,
      String(row["change_id"]),
    )) {
      if (
        prior["check_id"] === row["check_id"] &&
        prior["attempt"] === row["attempt"]
      ) {
        throw new LedgerError(
          `check ${String(prior["check_id"])} already has a ` +
            `${pythonRepr(prior["result"])} result for attempt ` +
            `${String(prior["attempt"])}; worker results are append-only and ` +
            "a recorded result is never superseded within an attempt.",
        );
      }
    }
  };
  return appendValidated(
    repoRoot,
    sessionNumber,
    record,
    validateWorkerResult,
    "worker result",
    workerResultsPath,
    oneResultPerAttempt,
  );
}

export function readDispositions(
  repoRoot: string,
  sessionNumber: number,
  changeId: string,
): Row[] {
  return readJsonl(
    dispositionsPath(repoRoot, sessionNumber, changeId),
    validateDisposition,
  );
}

export function appendDisposition(
  repoRoot: string,
  sessionNumber: number,
  record: Row,
): Row {
  return appendValidated(
    repoRoot,
    sessionNumber,
    record,
    validateDisposition,
    "disposition",
    dispositionsPath,
  );
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
