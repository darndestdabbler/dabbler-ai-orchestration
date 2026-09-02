// The approved plan: a machine-owned, schema-validated, hashed artifact for
// one session's own steps, under `.dabbler/runs/<set>/s<N>/approved-plan.json`.
//
// A plan is written and rewritten freely before approval. `approvePlan` binds
// a hash into the record, computed over every field except `amendments`;
// after that, `readPlan` recomputes the same hash on every read and refuses a
// plan whose core content no longer matches it. Appending an amendment never
// touches a core field, so it never disturbs the hash -- which is what makes
// "the only legal change is an appended amendment" a structural fact instead
// of a policy nobody checks.
//
// Risk flags are never declared by a step's own author. They are derived
// here, mechanically, from the file envelope and (for the integration-module
// flag) the repository's own module manifest (`docs/modules.yaml`, read
// through `modules`) -- a step does not get to say its own work is low-risk.
//
// Whether the work stayed inside its plan is decided the same way:
// `compareToEnvelope` diffs the working tree against the declared envelope. A
// path outside it is an amendment, and an amendment carries the change it
// makes rather than a note about it.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { workingTreeChanges } from "./affected.ts";
import { hashBytes } from "./evidence.ts";
import { nowIso, platformNewlines, repoRelativePath } from "./journal.ts";
import {
  LIFECYCLE_WRITTEN_FILES,
  atomicWriteJsonIndented,
  sessionRunDir,
} from "./ledger.ts";
import { loadEntries } from "./modules.ts";
import { dumps } from "./pythonJson.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";
import { readText } from "./textfile.ts";

export const SCHEMA_VERSION = 1;
export const PLAN_FILENAME = "approved-plan.json";

export const RISK_PUBLIC_INTERFACE = "public-interface";
export const RISK_INTEGRATION_MODULE = "integration-module";
export const RISK_SENSITIVE_PATH = "sensitive-path";
export const RISK_DEPENDENCY_CHANGE = "dependency-change";

// Paths whose mere presence in an envelope is sensitive regardless of what
// module they belong to: the router's own machine state, its schemas, and the
// config/lockfiles that decide what a session is allowed to do.
const SENSITIVE_PREFIXES: readonly string[] = [".dabbler/", "packages/router/schemas/"];
const SENSITIVE_BASENAMES: ReadonlySet<string> = new Set([
  "router-config.yaml",
  "local-overrides.yaml",
  "copilot-catalog.lock",
  "session-state.json",
]);
const DEPENDENCY_BASENAMES: ReadonlySet<string> = new Set([
  "pyproject.toml",
  "requirements.txt",
  "package.json",
  "package-lock.json",
  "poetry.lock",
  "setup.py",
  "setup.cfg",
]);
// A file directly in the router's source root is a verb or a seam every
// verb reaches through -- the framework's own public surface. It is a
// self-reference and always was: no consumer repository has this path, so
// the flag fires in the repository that builds the router and nowhere else.
const TOP_LEVEL_MODULE = /^packages\/router\/src\/[^/]+\.ts$/;

/**
 * The plan's core content does not match its bound hash: an edit happened
 * that was not an appended amendment.
 */
export class PlanIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanIntegrityError";
  }
}

/**
 * A caller tried to rewrite an approved plan's core content instead of
 * appending an amendment.
 */
export class PlanImmutableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanImmutableError";
  }
}

export type Plan = Record<string, unknown>;

function schema(): Record<string, unknown> {
  return loadSchemaFile("approved-plan.schema.json");
}

function normalizePath(path: unknown): string {
  return String(path).replace(/\\/g, "/").replace(/^\/+/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The plan's `steps`, as records, however malformed the document is. */
function stepsOf(plan: Plan): Record<string, unknown>[] {
  const raw = plan["steps"];
  if (!Array.isArray(raw)) return [];
  return raw.map((step) => (isRecord(step) ? step : {}));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function planPath(repoRoot: string, sessionNumber: number): string {
  return join(sessionRunDir(repoRoot, sessionNumber), PLAN_FILENAME);
}

function validateSchema(plan: Plan): void {
  const failure = schemaFailure(plan, schema(), PLAN_FILENAME);
  if (failure !== null) throw new Error(failure);
  const seen = new Set<unknown>();
  for (const step of stepsOf(plan)) {
    const stepId = step["step_id"];
    if (seen.has(stepId)) {
      throw new Error(
        `${PLAN_FILENAME}: duplicate step_id ${JSON.stringify(stepId)} -- a ` +
          "step_id must be unique within its session",
      );
    }
    seen.add(stepId);
  }
}

// --- Hashing and immutability ------------------------------------------------

const CORE_FIELDS: readonly string[] = [
  "schema_version",
  "session_number",
  "session_slug",
  "steps",
  "approved",
];
const WRITES_LEDGER_FILENAME = "approved-plan-writes.jsonl";

/** `json.dumps(core, sort_keys=True, separators=(",", ":"))`, as bytes. */
function coreBytes(plan: Plan): Buffer {
  const core: Record<string, unknown> = {};
  for (const key of CORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(plan, key)) core[key] = plan[key];
  }
  return Buffer.from(dumps(core, { sortKeys: true, separators: [",", ":"] }), "utf8");
}

/**
 * The hash bound into an approved plan: every field except `amendments` (and
 * the hash/timestamp fields the approval itself writes). Appending an
 * amendment can never change this value.
 */
export function computePlanHash(plan: Plan): string {
  return hashBytes(coreBytes(plan));
}

function fullContentHash(plan: Plan): string {
  return hashBytes(
    Buffer.from(dumps(plan, { sortKeys: true, separators: [",", ":"] }), "utf8"),
  );
}

function writesLedgerPath(runDir: string): string {
  return join(runDir, WRITES_LEDGER_FILENAME);
}

/**
 * Append the whole-file content hash of what was just written.
 *
 * This is what makes an out-of-band edit, delete, or reorder of an *existing*
 * amendment detectable: `plan_hash` alone only proves the core is untouched,
 * and the core deliberately excludes `amendments` so that field can grow. A
 * true append always advances this ledger together with the file; nothing
 * else does.
 */
function recordWrite(runDir: string, plan: Plan): void {
  const path = writesLedgerPath(runDir);
  mkdirSync(dirname(path), { recursive: true });
  // Python appends through a text-mode stream, so the line ending is the
  // platform's on both sides; this file is compared byte for byte.
  appendFileSync(path, platformNewlines(`${dumps({ hash: fullContentHash(plan) })}\n`), {
    encoding: "utf8",
  });
}

function lastRecordedWriteHash(runDir: string): string | null {
  let lines: string[];
  try {
    lines = readText(writesLedgerPath(runDir)).split("\n");
  } catch {
    return null;
  }
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (isRecord(row) && typeof row["hash"] === "string") return row["hash"];
  }
  return null;
}

/**
 * The one place a plan's bytes reach disk: atomic replace, then the write
 * recorded to the ledger that `readPlan` checks.
 */
function write(runDir: string, plan: Plan): void {
  atomicWriteJsonIndented(join(runDir, PLAN_FILENAME), plan);
  recordWrite(runDir, plan);
}

/** A deep copy through JSON, as the Python writers take one. */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A fresh, unapproved plan -- valid to write repeatedly until `approvePlan` is
 * called on it. Each step's `risk_flags` may be left empty here: `writePlan`
 * derives and overwrites it, since a supervisor does not declare its own risk.
 */
export function newPlan(
  sessionNumber: number,
  sessionSlug: string,
  steps: readonly unknown[],
): Plan {
  return {
    schema_version: SCHEMA_VERSION,
    session_number: sessionNumber,
    session_slug: sessionSlug,
    steps: [...steps],
    approved: false,
    amendments: [],
  };
}

/**
 * Validate and atomically replace the plan.
 *
 * Every step's `risk_flags` is recomputed from its `file_envelope` (and, for
 * integration-module, `workspaceRoot`'s manifest) and overwrites whatever the
 * caller supplied -- a step's own author never gets the last word on its own
 * risk. Refused once the plan on disk is approved: `appendAmendment` is the
 * only legal change after that point.
 */
export function writePlan(
  runDir: string,
  plan: Plan,
  workspaceRoot: string | null = null,
): Plan {
  const copy = deepCopy(plan);
  for (const step of stepsOf(copy)) {
    step["risk_flags"] = deriveRiskFlags(stringList(step["file_envelope"]), workspaceRoot);
  }
  validateSchema(copy);
  const path = join(runDir, PLAN_FILENAME);
  if (existsSync(path)) {
    const existing = readPlan(runDir);
    if (existing["approved"]) {
      throw new PlanImmutableError(
        `${path} is already approved; only append_amendment may change it further`,
      );
    }
  }
  write(runDir, copy);
  return copy;
}

/**
 * The plan, schema-validated.
 *
 * A plan whose current full-file content is not backed by a sanctioned write
 * -- including a hand-written file that was never through `writePlan` at all,
 * where the ledger is simply absent -- fails closed with
 * `PlanIntegrityError`, the same way every other machine-owned artifact under
 * the run directory does. This also catches an edit, deletion, or reorder of
 * an *existing* amendment, since only a true append advances the ledger.
 */
export function readPlan(runDir: string): Plan {
  const path = join(runDir, PLAN_FILENAME);
  const raw = JSON.parse(readText(path)) as Plan;
  validateSchema(raw);
  const lastWritten = lastRecordedWriteHash(runDir);
  if (lastWritten === null || fullContentHash(raw) !== lastWritten) {
    throw new PlanIntegrityError(
      `${path}: content is not backed by a sanctioned write -- it is ` +
        "hand-written, copied, or was edited outside " +
        "write_plan/approve_plan/append_amendment",
    );
  }
  if (raw["approved"]) {
    if (raw["plan_hash"] !== computePlanHash(raw)) {
      throw new PlanIntegrityError(
        `${path}: approved plan's content does not match its bound ` +
          "plan_hash -- it was edited outside an appended amendment",
      );
    }
  }
  return raw;
}

/**
 * Bind a hash into the plan and mark it immutable. Refused if the plan is
 * already approved -- re-approving is not a legal operation, only appending
 * an amendment is.
 */
export function approvePlan(runDir: string, now: Date = new Date()): Plan {
  const plan = readPlan(runDir);
  if (plan["approved"]) {
    throw new PlanImmutableError(`${runDir}: plan is already approved`);
  }
  plan["approved"] = true;
  plan["approved_at"] = nowIso("microseconds", now);
  plan["plan_hash"] = computePlanHash(plan);
  validateSchema(plan);
  write(runDir, plan);
  return plan;
}

export interface AmendmentInput {
  readonly stepId: string;
  readonly reason: string;
  readonly changedFields?: readonly string[];
  readonly addedFiles?: readonly string[];
  readonly evidenceContract?: readonly unknown[];
}

/**
 * Append one amendment row.
 *
 * Legal only against an approved plan and only for a `step_id` the plan
 * actually declares; never touches a core field, so the plan's `plan_hash`
 * never moves -- but the write ledger advances, which is what lets `readPlan`
 * tell a true append apart from a rewritten history.
 *
 * The amendment carries the change, not a note about it: `addedFiles` widens
 * the step's envelope and `evidenceContract` replaces its proof, both
 * readable through `effectivePlan`. `changedFields` is derived from what was
 * actually carried and never taken on the caller's word -- an amendment that
 * says it changed the evidence and carries none would otherwise read as a
 * proof that moved.
 */
export function appendAmendment(
  runDir: string,
  input: AmendmentInput,
  now: Date = new Date(),
): Plan {
  const plan = readPlan(runDir);
  if (!plan["approved"]) {
    throw new PlanImmutableError(
      `${runDir}: cannot amend a plan that has not been approved`,
    );
  }
  if (!stepsOf(plan).some((step) => step["step_id"] === input.stepId)) {
    throw new Error(
      `${runDir}: step_id ${JSON.stringify(input.stepId)} is not declared in this plan`,
    );
  }
  const amendment: Record<string, unknown> = {
    recorded_at: nowIso("microseconds", now),
    step_id: input.stepId,
    reason: input.reason,
  };
  const carried: string[] = [];
  if (input.addedFiles && input.addedFiles.length > 0) {
    amendment["added_files"] = input.addedFiles.map(normalizePath);
    carried.push("file_envelope");
  }
  if (input.evidenceContract && input.evidenceContract.length > 0) {
    amendment["evidence_contract"] = deepCopy([...input.evidenceContract]);
    carried.push("evidence_contract");
  }
  const fields = [...carried];
  for (const name of input.changedFields ?? []) {
    if (!fields.includes(name)) fields.push(name);
  }
  if (fields.length > 0) amendment["changed_fields"] = fields;
  const amendments = Array.isArray(plan["amendments"]) ? plan["amendments"] : [];
  plan["amendments"] = [...amendments, amendment];
  validateSchema(plan);
  write(runDir, plan);
  return plan;
}

/**
 * The plan as its amendments leave it: the immutable core, folded with each
 * amendment in the order it was appended.
 *
 * A pure function, never written back. Writing the fold would rewrite the
 * core the `plan_hash` is bound to, which is the one thing an approved plan
 * does not permit -- so the fold is computed on every read instead, and the
 * artifact on disk stays the thing that was approved. Risk flags are
 * re-derived from the widened envelope: an amendment that reaches a sensitive
 * path raises the flag for it, or a supervisor could amend its way out of the
 * review its own risk earns.
 */
export function effectivePlan(plan: Plan, workspaceRoot: string | null = null): Plan {
  const folded = deepCopy(plan);
  const byId = new Map<unknown, Record<string, unknown>>();
  for (const step of stepsOf(folded)) {
    if (step["step_id"]) byId.set(step["step_id"], step);
  }
  const touched = new Set<unknown>();
  const amendments = Array.isArray(folded["amendments"]) ? folded["amendments"] : [];
  for (const raw of amendments) {
    if (!isRecord(raw)) continue;
    const step = byId.get(raw["step_id"]);
    if (step === undefined) continue;
    for (const path of stringList(raw["added_files"])) {
      const envelope = stringList(step["file_envelope"]);
      if (!envelope.includes(path)) step["file_envelope"] = [...envelope, path];
      touched.add(step["step_id"]);
    }
    const contract = raw["evidence_contract"];
    if (Array.isArray(contract) && contract.length > 0) {
      step["evidence_contract"] = deepCopy(contract);
      touched.add(step["step_id"]);
    }
  }
  for (const stepId of touched) {
    const step = byId.get(stepId)!;
    step["risk_flags"] = deriveRiskFlags(stringList(step["file_envelope"]), workspaceRoot);
  }
  return folded;
}

/**
 * The steps this plan's amendments changed, in first-amended order -- the
 * only steps an amendment round has any reason to re-check.
 */
export function amendedStepIds(plan: Plan): string[] {
  const out: string[] = [];
  const amendments = Array.isArray(plan["amendments"]) ? plan["amendments"] : [];
  for (const raw of amendments) {
    if (!isRecord(raw)) continue;
    const stepId = raw["step_id"];
    if (typeof stepId === "string" && stepId && !out.includes(stepId)) out.push(stepId);
  }
  return out;
}

// --- The envelope, and what falls outside it ---------------------------------

/**
 * Repo-relative paths the lifecycle writes for this session set.
 *
 * A step envelope can never declare these: the lifecycle steps that write
 * them -- the router's own registration and logging, and the close -- are not
 * plan steps and never enter a plan.
 */
export function lifecycleWrittenPaths(
  sessionsDir: string,
  repoRoot: string | null = null,
): string[] {
  let directory = sessionsDir;
  if (repoRoot !== null) {
    const relative = relativeTo(resolve(repoRoot), resolve(sessionsDir));
    if (relative !== null) directory = relative;
  }
  const prefix = normalizePath(directory).replace(/\/+$/, "");
  return LIFECYCLE_WRITTEN_FILES.map((name) => `${prefix}/${name}`);
}

/**
 * `child` as `root` sees it, or null when it is not underneath -- the throw
 * `Path.relative_to` makes and the `except ValueError` that catches it.
 *
 * `relative` answers for any two paths, including with `..` segments, so the
 * escape is what has to be detected rather than the containment.
 */
function relativeTo(root: string, child: string): string | null {
  // Both sides canonical: this decides whether a path is inside the plan's
  // envelope at all, and Windows spells one directory several ways (an 8.3
  // short name, a junction, a mapped drive). Two spellings compared raw
  // answer `..\alias\...`, which reads as "outside" for a path that is not.
  const step = repoRelativePath(root, child);
  if (step.startsWith("..") || isAbsolute(step)) return null;
  return step;
}

/**
 * Every path the plan's steps may touch, amendments included -- or only the
 * ones `stepId` declares, which is the envelope a single step in flight is
 * measured against. A step does not inherit the reach of the steps beside it:
 * that would make a seven-step plan one envelope with seven names.
 */
export function envelopePaths(plan: Plan, stepId: string | null = null): string[] {
  const paths: string[] = [];
  for (const step of stepsOf(effectivePlan(plan))) {
    if (stepId !== null && step["step_id"] !== stepId) continue;
    for (const path of stringList(step["file_envelope"])) {
      const normalized = normalizePath(path);
      if (!paths.includes(normalized)) paths.push(normalized);
    }
  }
  return paths;
}

/** The step `stepId` names, as its amendments leave it, or null. */
export function findStep(plan: Plan, stepId: string): Record<string, unknown> | null {
  for (const step of stepsOf(effectivePlan(plan))) {
    if (step["step_id"] === stepId) return step;
  }
  return null;
}

/**
 * Whether `path` is covered by `envelope`, by exact match or by a declared
 * directory containing it. Nothing wider: a declared file covers itself, and
 * a declared directory covers what is under it.
 */
export function pathInEnvelope(path: string, envelope: readonly string[]): boolean {
  const normalized = normalizePath(path);
  for (const raw of envelope) {
    const declared = normalizePath(raw).replace(/\/+$/, "");
    if (!declared) continue;
    if (normalized === declared || normalized.startsWith(`${declared}/`)) return true;
  }
  return false;
}

export interface OutsidePath {
  readonly path: string;
  readonly reason: string;
}

/** What the working tree changed, against what the plan declared. */
export interface EnvelopeComparison {
  readonly inside: readonly string[];
  readonly outside: readonly OutsidePath[];
  readonly measured: boolean;
  readonly unmeasuredReason: string;
}

/**
 * An unmeasurable change set is never "inside the plan". Git failing to
 * answer is the one case where saying nothing is wrong would let a change the
 * plan never declared through unremarked.
 */
export function needsAmendment(comparison: EnvelopeComparison): boolean {
  return comparison.outside.length > 0 || !comparison.measured;
}

export const REASON_OUTSIDE_ENVELOPE = "outside-envelope";
export const REASON_NEW_DEPENDENCY = "new-dependency";

/**
 * Compare the working tree against the plan's approved envelope, or against
 * the envelope of the single step `stepId` declares.
 *
 * Mechanical from end to end: git says what changed, the envelope says what
 * was declared, and set difference decides. No model is asked whether a
 * supervisor stayed inside its own plan, because a question nobody is asked
 * cannot be answered convincingly and wrongly.
 *
 * The files the lifecycle writes for `sessionsDir` are dropped first. A step
 * envelope cannot declare them -- the lifecycle steps that write them never
 * enter a plan -- so counting them would refuse every session for doing
 * exactly what the lifecycle told it to.
 */
export function compareToEnvelope(
  repoRoot: string,
  plan: Plan,
  sessionsDir: string,
  baselineTree: string | null = null,
  stepId: string | null = null,
): EnvelopeComparison {
  const changed = workingTreeChanges(repoRoot, baselineTree);
  if (changed === null) {
    return {
      inside: [],
      outside: [],
      measured: false,
      unmeasuredReason: "git could not report what this working tree changed",
    };
  }
  const envelope = envelopePaths(plan, stepId);
  const ceremony = new Set(lifecycleWrittenPaths(sessionsDir, repoRoot));
  const inside: string[] = [];
  const outside: OutsidePath[] = [];
  for (const path of [...changed].sort()) {
    const normalized = normalizePath(path);
    if (ceremony.has(normalized)) continue;
    if (pathInEnvelope(normalized, envelope)) {
      inside.push(normalized);
      continue;
    }
    outside.push({
      path: normalized,
      reason: isDependencyPath(normalized)
        ? REASON_NEW_DEPENDENCY
        : REASON_OUTSIDE_ENVELOPE,
    });
  }
  return { inside, outside, measured: true, unmeasuredReason: "" };
}

// --- Risk flags --------------------------------------------------------------

function isSensitivePath(path: string): boolean {
  const normalized = normalizePath(path);
  if (SENSITIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  return SENSITIVE_BASENAMES.has(basename(normalized));
}

function isDependencyPath(path: string): boolean {
  return DEPENDENCY_BASENAMES.has(basename(normalizePath(path)));
}

function isPublicInterfacePath(path: string): boolean {
  return TOP_LEVEL_MODULE.test(normalizePath(path));
}

function touchesIntegrationModule(path: string, workspaceRoot: string | null): boolean {
  if (workspaceRoot === null) return false;
  let entries;
  try {
    entries = loadEntries(workspaceRoot);
  } catch {
    // A manifest this router cannot read says nothing about integration,
    // which is the same answer Python's `except ValueError` gives.
    return false;
  }
  const normalized = normalizePath(path);
  for (const entry of entries) {
    if (entry.touches.length === 0) continue;
    for (const root of entry.codeRoots) {
      const rootNorm = `${normalizePath(root).replace(/\/+$/, "")}/`;
      if (normalized.startsWith(rootNorm) || normalized === normalizePath(root)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Risk flags derived mechanically from `fileEnvelope` (repo-relative paths)
 * and, for the integration-module flag, the repository manifest at
 * `workspaceRoot`. Order is fixed so the result is stable.
 */
export function deriveRiskFlags(
  fileEnvelope: readonly string[],
  workspaceRoot: string | null = null,
): string[] {
  const flags = new Set<string>();
  for (const path of fileEnvelope) {
    if (isPublicInterfacePath(path)) flags.add(RISK_PUBLIC_INTERFACE);
    if (isSensitivePath(path)) flags.add(RISK_SENSITIVE_PATH);
    if (isDependencyPath(path)) flags.add(RISK_DEPENDENCY_CHANGE);
    if (touchesIntegrationModule(path, workspaceRoot)) flags.add(RISK_INTEGRATION_MODULE);
  }
  const order = [
    RISK_PUBLIC_INTERFACE,
    RISK_INTEGRATION_MODULE,
    RISK_SENSITIVE_PATH,
    RISK_DEPENDENCY_CHANGE,
  ];
  return order.filter((flag) => flags.has(flag));
}

