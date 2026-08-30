// The test run of record: what proves "the suite was green on this code".
//
// Freshness is a content digest over each suite's declared surfaces, never an
// mtime -- checkouts, stash pops and no-op saves rewrite mtimes without
// changing content, and both error directions (stale-looks-fresh,
// fresh-looks-stale) are unacceptable in a gate. Records append to
// `.dabbler/runs/test-runs.jsonl` (machine-side, gitignored), so recording a
// run can never stale the very surfaces it just digested.
//
// Suites are declared by the repository in `dabbler.yaml` under
// `testing.suites`. A suite's `covers` is its complete input allowlist --
// product source, tests, fixtures, lockfiles, test config. The failure
// direction is deliberate: run a suite you did not need rather than skip one
// you did.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// One vocabulary for what a suite may declare, imported rather than
// restated: two lists that disagree make a valid declaration read as a typo
// in whichever module holds the shorter one. The prefix rule comes from the
// same place, for the same reason.
import { SUITE_FIELDS, matchingPrefixes, normaliseRel } from "./checks.ts";
import { isMachineStatePath, nowIso, platformNewlines, repoRootFor, runGit } from "./journal.ts";
import { LIFECYCLE_WRITTEN_FILES, RUNS_DIRNAME } from "./ledger.ts";
import { PythonFloat, dumps, pythonFloatRepr, pythonRepr } from "./pythonJson.ts";

export { matchingPrefixes } from "./checks.ts";

export const OUTCOME_PASSED = "passed";
export const OUTCOME_FAILED = "failed";
export const OUTCOME_ABORTED = "aborted";
export const OUTCOMES: readonly string[] = [
  OUTCOME_PASSED, OUTCOME_FAILED, OUTCOME_ABORTED,
];

/**
 * A run's stage says what it is evidence *of*, and the two are not
 * interchangeable.
 *
 * `preverify-targeted` is the affected-test run that precedes verification;
 * it is never proof that the suite is green. `final-full` is the one complete
 * run, taken against the final verified tree, and it alone can satisfy the
 * close gate. A record with neither stage satisfies nothing -- the safe
 * direction when a row predates the vocabulary.
 */
export const STAGE_PREVERIFY_TARGETED = "preverify-targeted";
export const STAGE_FINAL_FULL = "final-full";
export const STAGES: readonly string[] = [
  STAGE_PREVERIFY_TARGETED, STAGE_FINAL_FULL,
];

// What made a pre-verification command acceptable, or what made it invalid.
// `final-full` runs carry none of these: the complete suite IS the declared
// command, so the vocabulary cannot apply to it.
export const POLICY_TARGETED = "targeted";
export const POLICY_ALL_TESTS_AFFECTED = "all-tests-affected";
export const POLICY_OPERATOR_OVERRIDE = "operator-override";
/**
 * The suite declared it has no targeted form, so its complete run is the
 * smallest honest evidence for this change. Recorded under its own name
 * rather than as `targeted`, because a reader has to be able to tell a run
 * narrowed to the selected tests from one that could not be narrowed.
 */
export const POLICY_SUITE_WHOLE = "suite-runs-whole";
export const POLICY_VIOLATION = "policy_violation";
export const POLICIES: readonly string[] = [
  POLICY_TARGETED, POLICY_ALL_TESTS_AFFECTED, POLICY_OPERATOR_OVERRIDE,
  POLICY_SUITE_WHOLE, POLICY_VIOLATION,
];
/**
 * The four that make a run count as pre-verification evidence. A violation is
 * still written -- the wasted run is exactly what the record is for -- and
 * satisfies nothing.
 */
export const ACCEPTED_POLICIES: readonly string[] = [
  POLICY_TARGETED, POLICY_ALL_TESTS_AFFECTED, POLICY_OPERATOR_OVERRIDE,
  POLICY_SUITE_WHOLE,
];

export const TEST_RUNS_FILENAME = "test-runs.jsonl";

/**
 * What stands between a verified tree and a close.
 *
 * A verified session is not a closeable one: the complete suite has not yet
 * run against the tree that was verified, and nothing has been pushed.
 */
export function runOfRecordRecipe(
  sessionsDir: string,
  suite: string,
  command: string,
): string {
  return (
    "The run of record and the push remain:\n" +
    `  ${command}\n` +
    `  dabbler test-evidence record --sessions-dir ` +
    `${sessionsDir} --suite ${suite} --stage ${STAGE_FINAL_FULL} ` +
    "--outcome passed --duration-seconds <elapsed>\n" +
    "  git commit, then git push -- once, here\n" +
    `  dabbler session close --sessions-dir ${sessionsDir}`
  );
}

/**
 * Sessions-root files the sanctioned writers own; they change during a
 * session and must not count as "the covered surfaces changed".
 */
export const SESSION_BOOKKEEPING_BASENAMES: ReadonlySet<string> = new Set([
  ...LIFECYCLE_WRITTEN_FILES,
  ".lifecycle.lock",
]);

export interface SuiteSpec {
  readonly name: string;
  readonly command: string;
  readonly covers: readonly string[];
  readonly expensive: boolean;
  /** The runner takes no subset, so a run of it is the complete suite. */
  readonly runsWhole: boolean;
}

export interface SuiteLoadResult {
  readonly suites: readonly SuiteSpec[];
  readonly errors: readonly string[];
  readonly ok: boolean;
}

export interface TestRunRecord {
  readonly suite: string;
  readonly command: string;
  readonly outcome: string;
  readonly surfaceDigest: string;
  readonly recordedAt: string;
  readonly stage: string;
  readonly treeDigest: string;
  readonly policy: string;
  readonly policyReason: string;
  readonly selectedTests: ReadonlyArray<readonly [string, string]>;
  readonly sessionNumber: number | null;
  readonly detail: string;
  readonly durationSeconds: number | null;
}

/** The row as it is written, in the key order Python inserts them. */
export function recordToDict(record: TestRunRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {
    suite: record.suite,
    command: record.command,
    outcome: record.outcome,
    surfaceDigest: record.surfaceDigest,
    recordedAt: record.recordedAt,
  };
  if (record.stage) out["stage"] = record.stage;
  if (record.treeDigest) out["treeDigest"] = record.treeDigest;
  if (record.policy) out["policy"] = record.policy;
  if (record.policyReason) out["policyReason"] = record.policyReason;
  if (record.selectedTests.length > 0) {
    out["selectedTests"] = record.selectedTests.map(([path, reason]) => ({
      path,
      reason,
    }));
  }
  if (record.sessionNumber !== null) out["sessionNumber"] = record.sessionNumber;
  if (record.detail) out["detail"] = record.detail;
  if (record.durationSeconds !== null) {
    // The Python twin stores `float(duration_seconds)`, so `1` is written
    // `1.0`; an unmarked number would write `1` and drift on the first row.
    out["durationSeconds"] = new PythonFloat(record.durationSeconds);
  }
  return out;
}

export interface FreshnessVerdict {
  readonly suite: string;
  readonly required: boolean;
  readonly passed: boolean;
  readonly reason: string;
  readonly changedInputs: readonly string[];
}

/** A refusal at the write boundary, or a surface that could not be measured. */
export class RecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Suite declarations ---------------------------------------------------------

/**
 * Suites plus every declaration error.
 *
 * The gate must block on errors: "no expensive suites declared" and "every
 * declared suite was a typo and got silently dropped" must never be
 * indistinguishable.
 *
 * This reader and `checks.loadChecks` share `SUITE_FIELDS` but not their
 * requirements, and that is a real inconsistency carried over from Python:
 * `loadChecks` accepts a suite declaring `argv` and no `command`, and this
 * one refuses it, so such a suite would run under `checks` and be
 * unrecordable here. No repository declares one -- `argv` is used for
 * controls, which this reader never sees -- and resolving it means deciding
 * whether a suite may be argv at all, which is a design question rather than
 * a translation. It is recorded as owed rather than repaired on one side.
 */
export function loadSuitesChecked(config: unknown): SuiteLoadResult {
  const done = (
    suites: readonly SuiteSpec[],
    errors: readonly string[],
  ): SuiteLoadResult => ({ suites, errors, ok: errors.length === 0 });
  if (!isRecord(config)) return done([], []);
  const testing = isRecord(config["testing"]) ? config["testing"] : {};
  const raw = testing["suites"];
  if (raw === null || raw === undefined) return done([], []);
  if (!Array.isArray(raw)) return done([], ["testing.suites must be a list"]);

  const suites: SuiteSpec[] = [];
  const errors: string[] = [];
  raw.forEach((entry, index) => {
    const label = `testing.suites[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${label} must be a mapping`);
      return;
    }
    const unknown = Object.keys(entry)
      .filter((key) => !SUITE_FIELDS.has(key))
      .sort();
    if (unknown.length > 0) {
      errors.push(`${label} has unknown key(s) ${pythonRepr(unknown)}`);
    }
    const name = entry["name"];
    const command = entry["command"];
    const covers = entry["covers"];
    if (typeof name !== "string" || name.trim() === "") {
      errors.push(`${label}.name must be a non-empty string`);
      return;
    }
    if (typeof command !== "string" || command.trim() === "") {
      errors.push(`${label}.command must be a non-empty string`);
      return;
    }
    if (!Array.isArray(covers) || !covers.every((c) => typeof c === "string")) {
      errors.push(`${label}.covers must be a list of path prefixes`);
      return;
    }
    suites.push({
      name: name.trim(),
      command: command.trim(),
      covers: covers as string[],
      expensive: Boolean(entry["expensive"]),
      runsWhole: Boolean(entry["runs_whole"]),
    });
  });
  return done(suites, errors);
}

// --- Digesting the covered surfaces ---------------------------------------------

function gitZ(repoRoot: string, args: readonly string[]): string[] | null {
  const result = runGit(repoRoot, ["-c", "core.quotepath=false", ...args]);
  if (result.code !== 0) return null;
  return result.stdout.split("\0").filter((path) => path !== "");
}

function sessionsRelFor(repoRoot: string, sessionsDir?: string | null): string | null {
  if (sessionsDir === null || sessionsDir === undefined) return null;
  let rel: string;
  try {
    rel = relative(repoRoot, sessionsDir);
  } catch {
    return null;
  }
  const normalized = normaliseRel(rel);
  return normalized.startsWith("..") ? null : normalized;
}

/**
 * Only the sessions root, and only basenames the sanctioned writers own.
 *
 * The session plan is deliberately not here: editing the plan the session is
 * running against still stales its run.
 */
export function isSessionBookkeeping(
  rel: string,
  sessionsRel: string | null,
): boolean {
  if (!sessionsRel) return false;
  const relN = normaliseRel(rel);
  if (!relN.startsWith(sessionsRel + "/")) return false;
  return SESSION_BOOKKEEPING_BASENAMES.has(relN.slice(relN.lastIndexOf("/") + 1));
}

/**
 * SHA-256 over the sorted (path, content-hash) pairs of every tracked or
 * untracked non-ignored file under the covered prefixes. Null when git is
 * unavailable -- an unmeasurable surface is never "unchanged".
 */
export function surfaceDigest(
  repoRoot: string,
  covers: readonly string[],
  options: { sessionsDir?: string | null } = {},
): string | null {
  const tracked = gitZ(repoRoot, ["ls-files", "-z", "--"]);
  const untracked = gitZ(repoRoot, [
    "ls-files", "--others", "--exclude-standard", "-z", "--",
  ]);
  if (tracked === null || untracked === null) return null;
  const sessionsRel = sessionsRelFor(repoRoot, options.sessionsDir);
  const lines: string[] = [];
  for (const rel of [...new Set([...tracked, ...untracked])].sort()) {
    if (matchingPrefixes(rel, covers).length === 0) continue;
    if (isSessionBookkeeping(rel, sessionsRel)) continue;
    if (isMachineStatePath(rel)) {
      // The fifth reader that has to know the run ledger is not work. This
      // function records a digest and then its caller appends a row to
      // `.dabbler/runs/` -- so counting it makes the digest it just stored
      // wrong the instant it is stored, and the freshness gate can never
      // pass. A round is appended after the tree it describes; the ledger is
      // the record, not the work.
      continue;
    }
    let digest: string;
    try {
      digest = createHash("sha256")
        .update(readFileSync(join(repoRoot, ...rel.split("/"))))
        .digest("hex");
    } catch {
      // Omitted, not marked. `ls-files` lists a tracked file that has been
      // deleted but not yet committed, so a marker line here would leave the
      // digest the moment the deletion is committed and `ls-files` stops
      // naming the path -- moving the digest across a commit in which no
      // file's content changed at all, and making the freshness gate demand a
      // second full suite run to prove that nothing happened. Omitting it
      // moves the digest once, when the file actually goes.
      continue;
    }
    lines.push(`${normaliseRel(rel)}\0${digest}`);
  }
  return createHash("sha256").update(Buffer.from(lines.join("\n"), "utf8")).digest("hex");
}

/**
 * The digest of the whole tree a run was taken against.
 *
 * A `final-full` record binds to this, so a suite that ran and was then
 * followed by an edit anywhere -- including outside the suite's own `covers`
 * -- is no longer proof about the tree being closed.
 */
export function treeDigest(
  repoRoot: string,
  options: { sessionsDir?: string | null } = {},
): string | null {
  return surfaceDigest(repoRoot, [""], options);
}

// --- Records ----------------------------------------------------------------------

function runsPath(repoRoot: string): string {
  return join(repoRoot, ...RUNS_DIRNAME.split("/"), TEST_RUNS_FILENAME);
}

/**
 * Lenient by design: one bad line must not blind the gate to the good ones.
 * A missing file is an empty history.
 */
export function readRecords(repoRoot: string): TestRunRecord[] {
  const records: TestRunRecord[] = [];
  let text: string;
  try {
    text = readFileSync(runsPath(repoRoot), "utf8");
  } catch {
    return records;
  }
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(row)) continue;
    const suite = row["suite"];
    const digest = row["surfaceDigest"];
    if (typeof suite !== "string" || typeof digest !== "string") continue;

    const rawSession = row["sessionNumber"];
    const sessionNumber =
      typeof rawSession === "number" && Number.isInteger(rawSession)
        ? rawSession
        : null;
    const rawDuration = row["durationSeconds"];
    const duration =
      typeof rawDuration === "number" && Number.isFinite(rawDuration)
        ? rawDuration
        : null;
    // An unrecognised stage is dropped rather than carried: it must not be
    // mistaken for `final-full` downstream.
    const rawStage = row["stage"];
    const stage = typeof rawStage === "string" && STAGES.includes(rawStage) ? rawStage : "";
    // Same for the policy: an unknown token is no exception at all.
    const rawPolicy = row["policy"];
    const policy =
      typeof rawPolicy === "string" && POLICIES.includes(rawPolicy) ? rawPolicy : "";

    const selected: Array<readonly [string, string]> = [];
    const rawSelected = row["selectedTests"];
    for (const entry of Array.isArray(rawSelected) ? rawSelected : []) {
      if (isRecord(entry) && typeof entry["path"] === "string") {
        selected.push([entry["path"], String(entry["reason"] ?? "")]);
      }
    }

    records.push({
      suite,
      command: String(row["command"] ?? ""),
      outcome: String(row["outcome"] ?? ""),
      surfaceDigest: digest,
      recordedAt: String(row["recordedAt"] ?? ""),
      stage,
      treeDigest: String(row["treeDigest"] ?? ""),
      policy,
      policyReason: String(row["policyReason"] ?? ""),
      selectedTests: selected,
      sessionNumber,
      detail: String(row["detail"] ?? ""),
      durationSeconds: duration,
    });
  }
  return records;
}

export interface RecordRunOptions {
  readonly stage: string;
  readonly durationSeconds: unknown;
  readonly command?: string | null;
  readonly policy?: string;
  readonly policyReason?: string;
  readonly selectedTests?: ReadonlyArray<readonly [string, string]>;
  readonly sessionNumber?: number | null;
  readonly detail?: string;
  readonly repoRoot?: string | null;
}

/**
 * Append one run record.
 *
 * Strict at the write boundary (an optional field never gets populated);
 * `readRecords` stays lenient for old rows. An unrecordable run is an error,
 * not a silently-empty record.
 *
 * `stage` is required and closed: what a run proves depends entirely on when
 * it was taken, so it can never be inferred at read time.
 *
 * A `preverify-targeted` run must name the command that actually ran and the
 * policy that judged it -- the whole point is that the command is evidence,
 * not a formality. A `final-full` run may name neither: it is the declared
 * suite command by definition, and a caller-supplied one would let the run of
 * record be something other than the suite.
 */
export function recordRun(
  sessionsDir: string,
  suite: SuiteSpec,
  outcome: string,
  options: RecordRunOptions,
): TestRunRecord {
  const { stage } = options;
  const command = options.command ?? null;
  const policy = options.policy ?? "";
  if (!OUTCOMES.includes(outcome)) {
    throw new RecordError(
      `outcome must be one of ${pyTuple(OUTCOMES)}, got ${pythonRepr(outcome)}`,
    );
  }
  if (!STAGES.includes(stage)) {
    throw new RecordError(
      `stage must be one of ${pyTuple(STAGES)}, got ${pythonRepr(stage)}`,
    );
  }
  if (stage === STAGE_PREVERIFY_TARGETED) {
    if (String(command ?? "").trim() === "") {
      throw new RecordError(
        "a preverify-targeted record must name the command that ran",
      );
    }
    if (!POLICIES.includes(policy)) {
      throw new RecordError(
        `policy must be one of ${pyTuple(POLICIES)}, got ${pythonRepr(policy)}`,
      );
    }
  } else {
    if (command !== null) {
      throw new RecordError(
        "a final-full run is the declared suite command; a caller-supplied " +
          "command does not apply",
      );
    }
    if (policy) {
      throw new RecordError(
        "the pre-verification policy vocabulary does not apply to a final-full run",
      );
    }
  }
  const duration = options.durationSeconds;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new RecordError(
      "duration_seconds must be a positive finite number, got " +
        // Every command line parses this as a float, and the field is one, so
        // a rejected `0` reads `0.0` here as it does in the Python refusal.
        (typeof duration === "number" ? pythonFloatRepr(duration) : pythonRepr(duration)),
    );
  }
  const root = options.repoRoot ?? repoRootFor(sessionsDir);
  if (root === null || root === undefined) {
    throw new RecordError(`no git repository found above ${sessionsDir}`);
  }
  const digest = surfaceDigest(root, suite.covers, { sessionsDir });
  if (digest === null) throw new RecordError("could not digest the covered surfaces");
  let wholeTree = "";
  if (stage === STAGE_FINAL_FULL) {
    wholeTree = treeDigest(root, { sessionsDir }) ?? "";
    if (!wholeTree) throw new RecordError("could not digest the tree");
  }
  const record: TestRunRecord = {
    suite: suite.name,
    command: String(command || suite.command),
    outcome,
    surfaceDigest: digest,
    recordedAt: nowIso("microseconds"),
    stage,
    treeDigest: wholeTree,
    policy,
    policyReason: options.policyReason ?? "",
    selectedTests: (options.selectedTests ?? []).map(
      ([path, reason]) => [String(path), String(reason)] as const,
    ),
    sessionNumber: options.sessionNumber ?? null,
    detail: options.detail ?? "",
    durationSeconds: duration,
  };
  const path = runsPath(root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    platformNewlines(dumps(recordToDict(record), { ensureAscii: false }) + "\n"),
    { encoding: "utf8" },
  );
  return record;
}

/** Python's `repr` of a tuple of strings, which the refusals interpolate. */
function pyTuple(values: readonly string[]): string {
  const body = values.map((value) => `'${value}'`).join(", ");
  return values.length === 1 ? `(${body},)` : `(${body})`;
}

// --- Judging freshness ------------------------------------------------------------

/**
 * `{suite name: changed inputs}` for suites whose covers intersect the change
 * set, with session bookkeeping dropped from the changes.
 */
export function affectedSuites(
  filesChanged: readonly string[],
  suites: readonly SuiteSpec[],
  options: { sessionsRel?: string | null } = {},
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const suite of suites) {
    const hits = filesChanged.filter(
      (rel) =>
        matchingPrefixes(rel, suite.covers).length > 0 &&
        !isSessionBookkeeping(rel, options.sessionsRel ?? null),
    );
    if (hits.length > 0) out.set(suite.name, hits);
  }
  return out;
}

/**
 * Every expensive suite must have a green record whose digest still matches
 * the covered surfaces.
 *
 * A surface untouched since the last green run digest-matches automatically,
 * so "the session changed nothing here" needs no separate change list; pass
 * `filesChanged` to narrow required suites to the intersection when a change
 * set is known. No timestamps are compared anywhere.
 */
export function evaluateFreshness(
  sessionsDir: string,
  filesChanged: readonly string[] | null,
  suites: readonly SuiteSpec[],
  options: { repoRoot?: string | null } = {},
): FreshnessVerdict[] {
  const root = options.repoRoot ?? repoRootFor(sessionsDir);
  const sessionsRel = root ? sessionsRelFor(root, sessionsDir) : null;
  const affected =
    filesChanged === null ? null : affectedSuites(filesChanged, suites, { sessionsRel });
  const records = root ? readRecords(root) : [];
  const verdicts: FreshnessVerdict[] = [];

  for (const suite of suites) {
    if (!suite.expensive) continue;
    const changed = affected === null ? [] : affected.get(suite.name) ?? [];
    if (root === null || root === undefined) {
      verdicts.push({
        suite: suite.name,
        required: true,
        passed: false,
        reason:
          "no git repository found; cannot digest the covered surfaces " +
          "(failing closed)",
        changedInputs: [],
      });
      continue;
    }
    if (affected !== null && changed.length === 0) {
      verdicts.push({
        suite: suite.name,
        required: false,
        passed: true,
        reason: "session touched none of this suite's surfaces",
        changedInputs: [],
      });
      continue;
    }
    const current = surfaceDigest(root, suite.covers, { sessionsDir });
    if (current === null) {
      verdicts.push({
        suite: suite.name,
        required: true,
        passed: false,
        reason: "could not digest the covered surfaces (failing closed)",
        changedInputs: changed,
      });
      continue;
    }
    const mine = records.filter(
      (row) => row.suite === suite.name && row.stage === STAGE_FINAL_FULL,
    );
    if (mine.length === 0) {
      const targeted = records.filter(
        (row) => row.suite === suite.name && row.stage === STAGE_PREVERIFY_TARGETED,
      );
      let preamble =
        `this session changed ${suite.name}'s covered surfaces but no ` +
        "final-full run of record exists";
      if (targeted.length > 0) {
        preamble +=
          ` (${targeted.length} preverify-targeted record(s) are present; a ` +
          "targeted run precedes verification and never proves the suite is " +
          "green)";
      }
      verdicts.push({
        suite: suite.name,
        required: true,
        passed: false,
        reason:
          `${preamble}; run \`${suite.command}\` after your last code change, ` +
          `then \`dabbler test-evidence record --sessions-dir ` +
          `<dir> --suite ${suite.name} --stage ${STAGE_FINAL_FULL} ` +
          `--outcome passed --duration-seconds <elapsed>\``,
        changedInputs: changed,
      });
      continue;
    }
    const latest = mine[mine.length - 1] as TestRunRecord;
    const currentTree = treeDigest(root, { sessionsDir });
    if (latest.surfaceDigest !== current) {
      verdicts.push({
        suite: suite.name,
        required: true,
        passed: false,
        reason:
          `the ${suite.name} run of record (recorded ` +
          `${latest.recordedAt || "at an unknown time"}) PREDATES a change to ` +
          `the surfaces it covers; re-run \`${suite.command}\` after your last ` +
          "code change and record it again",
        changedInputs: changed,
      });
    } else if (latest.outcome !== OUTCOME_PASSED) {
      verdicts.push({
        suite: suite.name,
        required: true,
        passed: false,
        reason:
          `the ${suite.name} run of record is fresh but its outcome is ` +
          `${pythonRepr(latest.outcome)}; a close needs a green run of record`,
        changedInputs: changed,
      });
    } else if (
      latest.treeDigest &&
      currentTree &&
      latest.treeDigest !== currentTree
    ) {
      verdicts.push({
        suite: suite.name,
        required: true,
        passed: false,
        reason:
          `the ${suite.name} run of record is green but the tree moved under ` +
          "it: a final-full run binds to the tree it ran against, and this one " +
          `does not match. Re-run \`${suite.command}\` against the final tree ` +
          "and record it again",
        changedInputs: changed,
      });
    } else {
      verdicts.push({
        suite: suite.name,
        required: true,
        passed: true,
        reason: `fresh, green, recorded ${latest.recordedAt}`,
        changedInputs: changed,
      });
    }
  }
  return verdicts;
}
