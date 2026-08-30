// The sanctioned writers for the session record.
//
// Every byte written to `sessions.json`, `activity-log.json`,
// `change-log.md`, `decisions-log.md` and `project-work-plan.md` goes
// through this module. The writers validate against the schema, enforce the
// closed verdict and step vocabularies, and record a content hash so an
// out-of-band edit is detectable. Lifecycle FLOW logic -- the boundary
// triad, locking, gates, the CLI -- lives in `session.ts`; this module owns
// the write discipline and nothing else.
//
// The two prose files are projections, not records. `activity-log.json`
// holds the decision and declaration rows; the markdown is folded from it
// on every append and may be deleted and rebuilt at any time. That is what
// lets a model supply content while the framework keeps structure,
// filename, ordering and identity out of its reach.

import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { classifyIdentityProvenance } from "./identity.ts";
import {
  ACTIVITY_LOG_FILENAME,
  SESSION_PLAN_FILENAME,
  STATE_FILENAME,
  recordStateWrite,
} from "./evidence.ts";
import { materialWorktreeChanges, previewPaths } from "./gates.ts";
import { nowIso, platformNewlines } from "./journal.ts";
import {
  SCHEMA_VERSION,
  STATUS_CANCELLED,
  STATUS_COMPLETE,
  STATUS_IN_PROGRESS,
  STATUS_NOT_STARTED,
  SessionStateInvariantError,
  canonicalizeStatus,
  derivedView,
  extractSessionTitlesFromPlan,
  getProgress,
  healTitle,
  isRecord,
  pythonRepr,
  readRawSessionState,
  sessionHasHistory,
} from "./progress.ts";
import { dumps } from "./pythonJson.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";
import { validateSessionVerdict } from "./verdict.ts";
import { VERSION } from "./version.ts";

export { SCHEMA_VERSION } from "./progress.ts";

export const STEP_STATUSES: readonly string[] = [
  "pending",
  "in-progress",
  "complete",
  "blocked",
];

/**
 * The two files of the specification. The names are constants because the
 * model that supplies their content never chooses where it lands.
 */
export const DECISIONS_LOG_FILENAME = "decisions-log.md";
export const WORK_PLAN_FILENAME = "project-work-plan.md";

/**
 * Activity-log row kinds. `plan-step` predates these three and is written
 * by `seedSessionPlan` / `logStep`.
 */
export const KIND_DECISION = "decision";
export const KIND_TASK_DECLARATION = "task-declaration";
export const KIND_PROJECT_PLAN = "project-plan";

/**
 * Who decided. Closed, because "who made it" is only answerable against a
 * fixed set of roles -- a free-text author lets a model attribute its own
 * decision to a human.
 */
export const DECIDER_OPERATOR = "operator";
export const DECIDER_ORCHESTRATOR = "orchestrator";
export const DECIDER_VERIFIER = "verifier";
export const DECIDER_FRAMEWORK = "framework";
export const DECIDERS: readonly string[] = [
  DECIDER_OPERATOR,
  DECIDER_ORCHESTRATOR,
  DECIDER_VERIFIER,
  DECIDER_FRAMEWORK,
];

type Entry = Record<string, unknown>;
type Log = Record<string, unknown>;

/**
 * A caller reached for something the framework owns.
 *
 * Identity, ordering, timestamps, filenames and layout are not content.
 * Refusing here rather than at the CLI means a direct API caller -- an
 * engine importing the module -- hits the same wall an operator does.
 */
export class SanctionedWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SanctionedWriteError";
  }
}

// --- Clocks ------------------------------------------------------------------

/** `datetime.now().astimezone().isoformat()` -- microsecond precision. */
function nowIsoFull(): string {
  return nowIso("microseconds");
}

/**
 * Second precision with timezone -- the marker-file timestamp shape legacy
 * readers parse.
 */
export function nowIsoSeconds(): string {
  return nowIso("seconds");
}

// --- sessions.json -----------------------------------------------------------

/**
 * Replace the state file in one step.
 *
 * The retry is not decoration: on Windows a virus scanner or an editor can
 * hold the target open for a few milliseconds after another process touched
 * it, and a rename that lost to that race would leave the record unwritten
 * while the caller believed it had landed.
 *
 * Text mode, deliberately: the Python twin opens with the platform default,
 * so `sessions.json` carries CRLF on Windows and the two routers must write
 * the same bytes.
 */
function atomicWriteStateJson(path: string, payload: unknown): void {
  // The directory is NOT created here. Python's `mkstemp(dir=...)` fails
  // when it does not exist, and a writer that quietly built a sessions root
  // would turn "you pointed me at the wrong place" into a second, empty
  // record beside the real one.
  const temp = join(dirname(path), `${basename(path)}.${process.pid}-${nextSequence()}`);
  const body = platformNewlines(dumps(payload, { indent: 2 }) + "\n");
  writeFileSync(temp, body, { encoding: "utf8" });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temp, path);
        return;
      } catch (error) {
        if (attempt === 2) throw error;
        sleepBriefly();
      }
    }
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // Already gone, or never made; there is nothing left to clean up.
    }
    throw error;
  }
}

let sequence = 0;

function nextSequence(): number {
  sequence += 1;
  return sequence;
}

/** 50 ms, the way `time.sleep(0.05)` blocks -- this path is synchronous. */
function sleepBriefly(): void {
  const buffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buffer, 0, 0, 50);
}

/**
 * Omit-null: missing keys are valid, null placeholders are not.
 * `identityProvenance` is derived from the engine, never a free choice.
 */
export function buildOrchestratorBlock(
  engine: string,
  provider?: string | null,
  model?: string | null,
  effort?: string | null,
): Record<string, unknown> {
  const block: Record<string, unknown> = { engine };
  for (const [key, value] of [
    ["provider", provider],
    ["model", model],
    ["effort", effort],
  ] as const) {
    if (typeof value === "string" && value.trim()) block[key] = value.trim();
  }
  const provenance = classifyIdentityProvenance(engine);
  if (provenance) block["identityProvenance"] = provenance;
  return block;
}

/**
 * The one write path for `sessions.json`: schema, then invariants, then the
 * atomic replace and its ledger row.
 *
 * Exported because `cancel`, `restore` and `migrate` each edit a record in
 * place and must land it the same way a registration does -- a second write
 * path is a second chance for an unsanctioned write to look sanctioned.
 */
export function validateAndWriteState(
  sessionsDir: string,
  state: Record<string, unknown>,
): void {
  const failure = schemaFailure(
    state,
    loadSchemaFile("sessions.schema.json"),
    "session-state",
  );
  if (failure) {
    // The Python twin words this one itself rather than reusing the shared
    // sentence, because it is the refusal an operator meets most often.
    const at = failure.slice(failure.indexOf(" at ") + 4);
    throw new SessionStateInvariantError(
      2,
      `refusing to write invalid session-state at ${at}`,
    );
  }
  if ("sessions" in state) getProgress(state); // invariants, fail loud before I/O
  atomicWriteStateJson(join(sessionsDir, STATE_FILENAME), state);
  recordStateWrite(sessionsDir);
}

function buildSessionsArray(
  total: number,
  completed: ReadonlySet<number>,
  inProgressNumber: number | null,
  priorSessions: readonly unknown[] | null,
  specTitles: ReadonlyMap<number, string>,
): Array<Record<string, unknown>> {
  const priorByNumber = new Map<unknown, Record<string, unknown>>();
  for (const session of priorSessions ?? []) {
    if (isRecord(session)) priorByNumber.set(session["number"], session);
  }

  const sessions: Array<Record<string, unknown>> = [];
  for (let n = 1; n <= total; n += 1) {
    const prior = priorByNumber.get(n) ?? {};
    const title =
      healTitle(prior["title"], n, specTitles, {
        hasHistory: sessionHasHistory(prior),
      }) ?? `Session ${n}`;
    const priorStatus = canonicalizeStatus(prior["status"]);

    let status: string;
    if (n === inProgressNumber) {
      status = STATUS_IN_PROGRESS;
    } else if (completed.has(n)) {
      status = STATUS_COMPLETE;
    } else if (priorStatus === STATUS_CANCELLED) {
      // A cancellation is a decision about that session, not a gap in the
      // numbering. Rebuilding it as not-started would silently return
      // abandoned work to the queue and drop the reason it was abandoned.
      status = STATUS_CANCELLED;
    } else {
      status = STATUS_NOT_STARTED;
    }

    const record: Record<string, unknown> = { number: n, title, status };
    // `verification` -- the summary block: verifier identity, rounds, cost
    // -- must ride along with the verdict. Dropping it here erased every
    // earlier session's summary at each registration.
    for (const key of [
      "startedAt",
      "completedAt",
      "orchestrator",
      "verificationVerdict",
      "verification",
      // Carried like the rest: a rebuild must not restamp an earlier
      // session with the version running today, which would make every
      // row claim the framework that last touched the file.
      "frameworkVersion",
    ]) {
      if (prior[key] !== null && prior[key] !== undefined) record[key] = prior[key];
    }
    if (status === STATUS_CANCELLED) {
      for (const key of ["preCancelStatus", "cancelledReason", "cancelledAt"]) {
        if (prior[key] !== null && prior[key] !== undefined) record[key] = prior[key];
      }
    }
    for (const key of ["startedAt", "completedAt", "orchestrator", "verificationVerdict"]) {
      if (!(key in record)) record[key] = null;
    }
    if (prior["type"] === "verification" || prior["type"] === "remediation") {
      record["type"] = prior["type"];
    }
    sessions.push(record);
  }
  return sessions;
}

function numbersWithStatus(
  state: Record<string, unknown> | null,
  wanted: string,
  canonicalize: boolean,
): Set<number> {
  const found = new Set<number>();
  if (!state) return found;
  const sessions = Array.isArray(state["sessions"]) ? state["sessions"] : [];
  for (const session of sessions) {
    if (!isRecord(session)) continue;
    const status = canonicalize ? canonicalizeStatus(session["status"]) : session["status"];
    if (status === wanted && Number.isInteger(session["number"])) {
      found.add(session["number"] as number);
    }
  }
  return found;
}

export function cancelledNumbers(state: Record<string, unknown> | null): Set<number> {
  return numbersWithStatus(state, STATUS_CANCELLED, true);
}

export function completedNumbers(state: Record<string, unknown> | null): Set<number> {
  return numbersWithStatus(state, STATUS_COMPLETE, false);
}

export interface RegisterOptions {
  readonly engine: string;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly effort?: string | null;
  readonly totalSessions?: number | null;
}

/**
 * The one writer for a session start.
 *
 * Re-opening a closed session is refused HERE, not only at the CLI -- a
 * direct API caller must hit the same wall.
 */
export function registerSessionStart(
  sessionsDir: string,
  sessionNumber: number,
  options: RegisterOptions,
): Record<string, unknown> {
  const raw = readRawSessionState(sessionsDir);
  const normalized = raw ? derivedView(raw) : null;
  const completed = completedNumbers(normalized);
  if (completed.has(sessionNumber)) {
    throw new SessionStateInvariantError(
      4,
      `register_session_start refused: session ${sessionNumber} is already in ` +
        `completedSessions ${sortedRepr(completed)}. Re-opening a closed ` +
        "session would erase its close-out record; start the next session instead.",
    );
  }

  const specTitles = new Map(
    extractSessionTitlesFromPlan(join(sessionsDir, SESSION_PLAN_FILENAME)),
  );
  // The ledger never shrinks -- dropping a session would drop its record --
  // but it does grow to the plan. A plan re-cut from seventeen sessions to
  // twenty is a declaration that three more exist; leaving the ledger at
  // seventeen would make them unstartable and say so nowhere.
  let total = options.totalSessions ?? 0;
  if (!total) {
    const priorLength = Array.isArray(normalized?.["sessions"])
      ? (normalized["sessions"] as unknown[]).length
      : 0;
    total = Math.max(
      priorLength,
      specTitles.size > 0 ? Math.max(...specTitles.keys()) : 0,
      sessionNumber,
      completed.size > 0 ? Math.max(...completed) : 0,
    );
  }

  const priorSessions = Array.isArray(normalized?.["sessions"])
    ? (normalized["sessions"] as unknown[])
    : null;
  const sessions = buildSessionsArray(
    total,
    completed,
    sessionNumber,
    priorSessions,
    specTitles,
  );
  const now = nowIsoFull();
  for (const record of sessions) {
    if (record["number"] !== sessionNumber) continue;
    record["startedAt"] = record["startedAt"] || now;
    record["completedAt"] = null;
    record["orchestrator"] = buildOrchestratorBlock(
      options.engine,
      options.provider,
      options.model,
      options.effort,
    );
    record["verificationVerdict"] = null;
    // Stamped at the start, where the session's identity is settled, and
    // never afterwards: it says which framework REGISTERED this session,
    // which is a fact about the row and not about the reader.
    record["frameworkVersion"] = VERSION;
    // The session being (re)started owes fresh verification; a leftover
    // summary beside a null verdict would be a lie.
    delete record["verification"];
  }

  const state: Record<string, unknown> = { schemaVersion: SCHEMA_VERSION, sessions };
  if (raw && "forceClosed" in raw) state["forceClosed"] = raw["forceClosed"];
  validateAndWriteState(sessionsDir, state);
  return state;
}

/** `sorted(set)` as Python prints it, for a refusal an operator reads. */
function sortedRepr(numbers: ReadonlySet<number>): string {
  return `[${[...numbers].sort((left, right) => left - right).join(", ")}]`;
}

/**
 * Stamp the final verdict (closed vocabulary, exact allowlist) and an
 * additive verification summary onto the session record.
 */
export function recordSessionVerification(
  sessionsDir: string,
  sessionNumber: number,
  verdict: string,
  summary?: Record<string, unknown> | null,
): void {
  const stamped = validateSessionVerdict(String(verdict).trim().toUpperCase());
  const raw = readRawSessionState(sessionsDir);
  if (!raw || !Array.isArray(raw["sessions"])) {
    throw new SessionStateInvariantError(
      1,
      `no writable v4 session-state under ${sessionsDir}`,
    );
  }
  let hit = false;
  for (const record of raw["sessions"]) {
    if (!isRecord(record) || record["number"] !== sessionNumber) continue;
    record["verificationVerdict"] = stamped;
    if (summary) record["verification"] = summary;
    hit = true;
  }
  if (!hit) {
    throw new SessionStateInvariantError(
      2,
      `session ${sessionNumber} not present in ${sessionsDir}`,
    );
  }
  validateAndWriteState(sessionsDir, raw);
}

/**
 * Close the in-flight session: complete it and stamp the verdict.
 *
 * `forced` promotes every open session -- a forensic marker, not a
 * shortcut.
 */
export function flipStateToClosed(
  sessionsDir: string,
  options: { readonly verdict?: string | null; readonly forced?: boolean } = {},
): Record<string, unknown> {
  const forced = options.forced ?? false;
  const verdict =
    options.verdict === null || options.verdict === undefined
      ? null
      : validateSessionVerdict(String(options.verdict).trim().toUpperCase());

  const raw = readRawSessionState(sessionsDir);
  const normalized = raw ? derivedView(raw) : null;
  if (!normalized) {
    throw new SessionStateInvariantError(
      1,
      `no readable session record under ${sessionsDir}`,
    );
  }
  const current = normalized["currentSession"];
  if (current === null || current === undefined) {
    throw new SessionStateInvariantError(
      3,
      `no session is in flight under ${sessionsDir}`,
    );
  }

  const now = nowIsoFull();
  const newSessions: Array<Record<string, unknown>> = [];
  for (const original of (normalized["sessions"] as unknown[]) ?? []) {
    const record: Record<string, unknown> = { ...(original as Record<string, unknown>) };
    if (record["number"] === current) {
      record["status"] = STATUS_COMPLETE;
      record["completedAt"] = now;
      if (verdict !== null) record["verificationVerdict"] = verdict;
    } else if (
      forced &&
      record["status"] !== STATUS_COMPLETE &&
      record["status"] !== STATUS_CANCELLED
    ) {
      record["status"] = STATUS_COMPLETE;
      if (record["completedAt"] === null || record["completedAt"] === undefined) {
        record["completedAt"] = now;
      }
    }
    for (const key of ["startedAt", "completedAt", "orchestrator", "verificationVerdict"]) {
      if (!(key in record)) record[key] = null;
    }
    newSessions.push(record);
  }

  const state: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    sessions: newSessions,
  };
  if (forced) state["forceClosed"] = true;
  else if (raw && "forceClosed" in raw) state["forceClosed"] = raw["forceClosed"];
  validateAndWriteState(sessionsDir, state);
  return state;
}

/**
 * The canonical v5 write shape: the ledger as recorded, derived keys
 * dropped, passthroughs preserved.
 */
export function onDiskState(raw: Record<string, unknown>): Record<string, unknown> {
  const sessions = (Array.isArray(raw["sessions"]) ? raw["sessions"] : [])
    .filter(isRecord)
    .map((session) => ({ ...session }));
  const state: Record<string, unknown> = { schemaVersion: SCHEMA_VERSION, sessions };
  for (const key of ["forceClosed", "nextOrchestrator"]) {
    if (key in raw) state[key] = raw[key];
  }
  return state;
}

// --- activity-log.json -------------------------------------------------------

const PLAN_KEY_MAX_WORDS = 6;
const PLAN_KEY_MAX_CHARS = 48;

export function planStepKey(text: string, ordinal: number): string {
  let head = text.split(/[.:;]/, 1)[0];
  head = head.replace(/[*`_]/g, "").toLowerCase();
  const words = head.split(/[^a-z0-9]+/).filter((word) => word !== "");
  let key = words.join("-").slice(0, PLAN_KEY_MAX_CHARS).replace(/^-+|-+$/g, "");
  key = key.split("-").slice(0, PLAN_KEY_MAX_WORDS).join("-");
  return key || `step-${ordinal}`;
}

function readOrCreateActivityLog(sessionsDir: string, totalSessions?: number | null): Log {
  try {
    const log: unknown = JSON.parse(
      readFileSync(join(sessionsDir, ACTIVITY_LOG_FILENAME), "utf8"),
    );
    if (isRecord(log)) return log;
  } catch {
    // No log, or an unreadable one: a fresh log is the right answer for
    // both, because this file is a projection source and not a claim.
  }
  return {
    createdDate: nowIsoFull(),
    totalSessions: totalSessions ?? 0,
    entries: [],
  };
}

function writeActivityLog(sessionsDir: string, log: Log): void {
  atomicWriteStateJson(join(sessionsDir, ACTIVITY_LOG_FILENAME), log);
}

function entriesOf(log: Log): Entry[] {
  return (Array.isArray(log["entries"]) ? log["entries"] : []).filter(isRecord);
}

function entriesOfKind(log: Log, kind: string): Entry[] {
  return entriesOf(log).filter((entry) => entry["kind"] === kind);
}

function pushEntry(log: Log, entry: Entry): void {
  if (!Array.isArray(log["entries"])) log["entries"] = [];
  (log["entries"] as unknown[]).push(entry);
}

/**
 * Seed plan steps as rows -- once per session, never re-applied. A plan
 * edited mid-flight shows new work only when it is logged.
 */
export function seedSessionPlan(
  sessionsDir: string,
  sessionNumber: number,
  totalSessions?: number | null,
  parse?: PlanParser,
): number {
  const parser = parse ?? requirePlanParser();
  let planText: string;
  try {
    planText = readFileSync(join(sessionsDir, SESSION_PLAN_FILENAME), "utf8").replace(
      /\r\n?/g,
      "\n",
    );
  } catch {
    return 0;
  }
  const plan = parser
    .parseSessionPlans(planText)
    .find((entry) => entry.number === sessionNumber);
  if (!plan || plan.steps.length === 0) return 0;

  const log = readOrCreateActivityLog(sessionsDir, totalSessions);
  const already = entriesOf(log).some(
    (entry) => entry["sessionNumber"] === sessionNumber && entry["kind"] === "plan-step",
  );
  if (already) return 0;

  // Resolve every step's key before writing anything: an authored
  // `(slug: xxx)` marker is the step's one identity, shared with the plan's
  // step_id, and declaring the same one twice is refused rather than
  // silently renamed. The six-word truncation is only the fallback for a
  // step that declares none.
  const resolved: Array<[string, string]> = [];
  const seenAuthored = new Set<string>();
  const seenKeys = new Set<string>();
  plan.steps.forEach((text, index) => {
    const ordinal = index + 1;
    const [cleanText, slug] = parser.splitSlugMarker(text);
    let key: string;
    if (slug !== null) {
      if (seenAuthored.has(slug)) {
        throw new parser.DuplicateSlugError(
          `${sessionsDir}: step slug '${slug}' is declared more than once in ` +
            `session ${sessionNumber}`,
        );
      }
      seenAuthored.add(slug);
      key = slug;
    } else {
      key = planStepKey(cleanText, ordinal);
      if (seenKeys.has(key)) key = `${key}-${ordinal}`;
    }
    seenKeys.add(key);
    resolved.push([key, cleanText]);
  });

  const now = nowIsoFull();
  resolved.forEach(([key, cleanText], index) => {
    pushEntry(log, {
      sessionNumber,
      stepNumber: index + 1,
      stepKey: key,
      dateTime: now,
      description: cleanText,
      status: "pending",
      kind: "plan-step",
    });
  });
  writeActivityLog(sessionsDir, log);
  return plan.steps.length;
}

/**
 * The plan parser this module needs, supplied by its caller.
 *
 * `session.ts` owns the plan grammar, and `session.ts` calls these writers:
 * taking the parser as an argument is how the cycle stays a call rather
 * than an import edge. The Python twin imports it lazily inside the
 * function for exactly the same reason.
 */
export interface PlanParser {
  parseSessionPlans(text: string): Array<{ number: number; steps: string[] }>;
  splitSlugMarker(text: string): [string, string | null];
  DuplicateSlugError: new (message: string) => Error;
}

let planParser: PlanParser | null = null;

/** Registered once by `session.ts` when it loads. */
export function usePlanParser(parser: PlanParser): void {
  planParser = parser;
}

function requirePlanParser(): PlanParser {
  if (!planParser) {
    throw new SanctionedWriteError(
      "no plan parser is registered; the session module supplies it, and " +
        "seeding a plan without one would invent the step identities the " +
        "plan declares",
    );
  }
  return planParser;
}

/**
 * Closed step vocabulary at the writer; drifted synonyms are read-tolerated
 * but never written.
 */
export function logStep(
  sessionsDir: string,
  sessionNumber: number,
  stepKey: string,
  description: string,
  status: string,
  stepNumber?: number | null,
): void {
  if (!STEP_STATUSES.includes(status)) {
    throw new Error(
      `step status must be one of ('${STEP_STATUSES.join("', '")}'), got '${status}'`,
    );
  }
  const log = readOrCreateActivityLog(sessionsDir);
  pushEntry(log, {
    sessionNumber,
    stepNumber: stepNumber ?? null,
    stepKey,
    dateTime: nowIsoFull(),
    description,
    status,
  });
  writeActivityLog(sessionsDir, log);
}

// --- change-log.md -----------------------------------------------------------

export function appendChangeLogBlock(sessionsDir: string, text: string): void {
  const path = join(sessionsDir, "change-log.md");
  let existing = "";
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    // A change log that does not exist yet is the first block's job to make.
  }
  const body = existing
    ? `${trimTrailingNewlines(existing)}\n\n${trimTrailingNewlines(text)}\n`
    : `${trimTrailingNewlines(text)}\n`;
  writeTextLf(path, body);
}

function trimTrailingNewlines(text: string): string {
  return text.replace(/\n+$/, "");
}

// --- the two files: decisions-log.md and project-work-plan.md ----------------

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SanctionedWriteError(`${field} must be non-empty text`);
  }
  return value.trim();
}

function requireSessionNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new SanctionedWriteError(
      `sessionNumber must be a positive integer, got ${pythonRepr(value)}`,
    );
  }
  return value;
}

/**
 * `number -> {title, status}` from the state file, or empty when there is
 * none yet. The state owns titles; the log never restates them.
 */
function sessionRecords(
  sessionsDir: string,
): Map<number, { title: string; status: unknown }> {
  const raw = readRawSessionState(sessionsDir);
  const records = new Map<number, { title: string; status: unknown }>();
  if (!isRecord(raw)) return records;
  for (const entry of Array.isArray(raw["sessions"]) ? raw["sessions"] : []) {
    if (!isRecord(entry) || !Number.isInteger(entry["number"])) continue;
    const number = entry["number"] as number;
    records.set(number, {
      title: (entry["title"] as string) || `Session ${number}`,
      status: canonicalizeStatus(entry["status"]),
    });
  }
  return records;
}

export interface DecisionOptions {
  readonly sessionNumber: number;
  readonly decider: string;
  readonly headline: string;
  readonly body: string;
  readonly model?: string | null;
  readonly provider?: string | null;
  readonly decidedOn?: string | null;
  readonly backfillReason?: string | null;
}

/**
 * Append one decision and re-render the log.
 *
 * The caller supplies what was decided and why. The writer supplies the
 * identifier, the position in the sequence and the time -- so a decision
 * cannot be renumbered, backdated, or slipped in between two others.
 *
 * A historical entry is possible and is never silent: `decidedOn` and
 * `backfillReason` are required together, and the rendered entry says it
 * was transcribed. Without that pair a backdated decision would be
 * indistinguishable from one recorded as it happened, which is the only
 * claim this file makes.
 */
export function appendDecision(sessionsDir: string, options: DecisionOptions): Entry {
  const number = requireSessionNumber(options.sessionNumber);
  if (!DECIDERS.includes(options.decider)) {
    throw new SanctionedWriteError(
      `decider must be one of ('${DECIDERS.join("', '")}'), got '${options.decider}'`,
    );
  }
  const headline = requireText(options.headline, "headline");
  const body = requireText(options.body, "body");

  const hasDecidedOn = options.decidedOn !== null && options.decidedOn !== undefined;
  const hasReason =
    options.backfillReason !== null && options.backfillReason !== undefined;
  if (hasDecidedOn !== hasReason) {
    throw new SanctionedWriteError(
      "decided_on and backfill_reason are supplied together or not at all: a " +
        "decision dated by its author without saying it is a transcription " +
        "reads exactly like one recorded as it happened.",
    );
  }

  const recordedAt = nowIsoFull();
  let decided: string;
  let reason: string | null;
  if (!hasDecidedOn) {
    decided = recordedAt.slice(0, 10);
    reason = null;
  } else {
    decided = requireText(options.decidedOn, "decided_on");
    if (!isIsoDate(decided)) {
      throw new SanctionedWriteError(
        `decided_on must be an ISO date (YYYY-MM-DD), got ` +
          `'${String(options.decidedOn)}'`,
      );
    }
    reason = requireText(options.backfillReason, "backfill_reason");
  }

  const log = readOrCreateActivityLog(sessionsDir);
  const ordinal = entriesOfKind(log, KIND_DECISION).length + 1;
  const entry: Entry = {
    kind: KIND_DECISION,
    decisionId: `D${ordinal}`,
    ordinal,
    sessionNumber: number,
    decidedOn: decided,
    recordedAt,
    decider: options.decider,
    headline,
    body,
  };
  for (const [key, value] of [
    ["model", options.model],
    ["provider", options.provider],
  ] as const) {
    if (typeof value === "string" && value.trim()) entry[key] = value.trim();
  }
  if (reason !== null) entry["backfillReason"] = reason;
  pushEntry(log, entry);
  writeActivityLog(sessionsDir, log);
  renderDecisionsLog(sessionsDir);
  return entry;
}

/** `date.fromisoformat` for the `YYYY-MM-DD` shape a decision may carry. */
function isIsoDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map((part) => Number.parseInt(part, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Declare what a session will do, and whether it may publish.
 *
 * Spec §3.a puts this before development, and the framework enforces the
 * order rather than asking for it: the declaration is refused once the
 * working tree carries the session's work, refused a second time, and
 * refused after the session closes. A declaration made after the code
 * exists is a model deciding in hindsight what may be published.
 */
export function declareSessionTask(
  sessionsDir: string,
  options: {
    readonly sessionNumber: number;
    readonly task: string;
    readonly releasable: boolean;
  },
): Entry {
  const number = requireSessionNumber(options.sessionNumber);
  const task = requireText(options.task, "task");
  if (typeof options.releasable !== "boolean") {
    throw new SanctionedWriteError(
      "releasable must be True or False -- an undeclared session is not " +
        "releasable, and no third value means anything here",
    );
  }
  const log = readOrCreateActivityLog(sessionsDir);
  const declared = entriesOfKind(log, KIND_TASK_DECLARATION).some(
    (entry) => entry["sessionNumber"] === number,
  );
  if (declared) {
    throw new SanctionedWriteError(
      `session ${number} has already declared its task list; a declaration is ` +
        "made once, before the work",
    );
  }
  const record = sessionRecords(sessionsDir).get(number);
  if (record && record.status === STATUS_COMPLETE) {
    throw new SanctionedWriteError(
      `session ${number} is complete; its task list can no longer be declared, ` +
        "because the declaration is what the work is measured against",
    );
  }

  const { paths, error } = materialWorktreeChanges(sessionsDir);
  if (error) {
    throw new SanctionedWriteError(
      `cannot tell whether session ${number}'s work has begun: ${error}`,
    );
  }
  if (paths.length > 0) {
    throw new SanctionedWriteError(
      `session ${number} cannot declare its task list now: the working tree ` +
        `already carries ${paths.length} change(s) (${previewPaths(paths)}). ` +
        "The declaration comes before the work -- one made after it is a model " +
        "deciding in hindsight what may be published. Commit or revert, then declare.",
    );
  }

  const entry: Entry = {
    kind: KIND_TASK_DECLARATION,
    sessionNumber: number,
    dateTime: nowIsoFull(),
    task,
    releasable: options.releasable,
  };
  pushEntry(log, entry);
  writeActivityLog(sessionsDir, log);
  renderProjectWorkPlan(sessionsDir);
  return entry;
}

/**
 * Record the plan prose the session list hangs off. Appended, not
 * overwritten -- the newest is rendered and the earlier ones stay in the
 * log, so a plan that changed can be seen to have changed.
 */
export function recordProjectPlan(sessionsDir: string, body: string): Entry {
  const entry: Entry = {
    kind: KIND_PROJECT_PLAN,
    dateTime: nowIsoFull(),
    body: requireText(body, "body"),
  };
  const log = readOrCreateActivityLog(sessionsDir);
  pushEntry(log, entry);
  writeActivityLog(sessionsDir, log);
  renderProjectWorkPlan(sessionsDir);
  return entry;
}

/**
 * The session's declaration, or null.
 *
 * Null is the answer for a session that never declared, and callers must
 * read it as "not releasable" rather than as "unknown".
 */
export function readTaskDeclaration(
  sessionsDir: string,
  sessionNumber: number,
): Entry | null {
  const log = readOrCreateActivityLog(sessionsDir);
  for (const entry of entriesOfKind(log, KIND_TASK_DECLARATION)) {
    if (entry["sessionNumber"] === sessionNumber) return entry;
  }
  return null;
}

/**
 * Fails closed. Packaging asks this question, and the absence of a
 * declaration is a refusal, never a default yes.
 */
export function sessionIsReleasable(
  sessionsDir: string,
  sessionNumber: number,
): boolean {
  const declaration = readTaskDeclaration(sessionsDir, sessionNumber);
  return Boolean(declaration && declaration["releasable"] === true);
}

// --- The two rendered files ---------------------------------------------------

function deciderLabel(entry: Entry): string {
  const raw = String(entry["decider"] ?? "");
  const label = capitalize(raw) || "Unknown";
  const model = entry["model"];
  const provider = entry["provider"];
  if (model && provider) return `${label} (${String(model)}/${String(provider)})`;
  if (model) return `${label} (${String(model)})`;
  if (provider) return `${label} (${String(provider)})`;
  return label;
}

/** Python's `str.capitalize()`: first character up, the rest DOWN. */
function capitalize(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1).toLowerCase();
}

const PROJECTION_NOTE =
  "**Written by `ai_router.writers` as a fold of `activity-log.json`.**\n" +
  "Hand edits are overwritten by the next append. The record is the log;\n" +
  "this page is one view of it.";

/**
 * Fold the decision rows into `decisions-log.md`, strictly in the order
 * they were appended.
 *
 * Session headings are emitted where the session changes rather than used
 * to group, so a session that receives a later decision appears again
 * further down. Grouping would have read better and would have put D38
 * above D10; the file's whole claim is "in order".
 */
export function renderDecisionsLog(sessionsDir: string): string {
  const log = readOrCreateActivityLog(sessionsDir);
  const decisions = [...entriesOfKind(log, KIND_DECISION)].sort(
    (left, right) => Number(left["ordinal"] ?? 0) - Number(right["ordinal"] ?? 0),
  );
  const records = sessionRecords(sessionsDir);
  const lines: string[] = [
    `# Decisions log — ${basename(sessionsDir)}`,
    "",
    "Every decision, human or AI, in order, with who made it and what it was.",
    "",
    PROJECTION_NOTE,
    "",
    "---",
  ];
  if (decisions.length === 0) lines.push("", "_No decisions recorded yet._");

  let current: number | null = null;
  const seen = new Set<number>();
  for (const entry of decisions) {
    const number = (entry["sessionNumber"] as number) || 0;
    if (number !== current) {
      const title = records.get(number)?.title || `Session ${number}`;
      const suffix = seen.has(number) ? " (continued)" : "";
      lines.push("", `## Session ${number} — ${title}${suffix}`);
      seen.add(number);
      current = number;
    }
    lines.push(
      "",
      `### ${String(entry["decisionId"])} · ${String(entry["decidedOn"])} · ` +
        `${deciderLabel(entry)} · ${String(entry["headline"])}`,
      "",
      String(entry["body"] ?? "").trim(),
    );
    if (entry["backfillReason"]) {
      lines.push(
        "",
        `*Backfilled on ${String(entry["recordedAt"] ?? "").slice(0, 10)} — ` +
          `${String(entry["backfillReason"])}*`,
      );
    }
  }
  const text = trimTrailingNewlines(lines.join("\n")) + "\n";
  writeTextLf(join(sessionsDir, DECISIONS_LOG_FILENAME), text);
  return text;
}

/**
 * Fold the plan prose and the task declarations into
 * `project-work-plan.md`: the plan, then every numbered session beside what
 * it declared and whether it may publish.
 */
export function renderProjectWorkPlan(sessionsDir: string): string {
  const log = readOrCreateActivityLog(sessionsDir);
  const plans = entriesOfKind(log, KIND_PROJECT_PLAN);
  const declarations = new Map<unknown, Entry>();
  for (const entry of entriesOfKind(log, KIND_TASK_DECLARATION)) {
    declarations.set(entry["sessionNumber"], entry);
  }
  const records = sessionRecords(sessionsDir);
  const numbers = [
    ...new Set<unknown>([...records.keys(), ...declarations.keys()]),
  ]
    .filter((value): value is number => Number.isInteger(value))
    .sort((left, right) => left - right);

  const lines: string[] = [
    `# Project work plan — ${basename(sessionsDir)}`,
    "",
    PROJECTION_NOTE,
    "",
    "---",
    "",
    "## The plan",
    "",
    plans.length > 0
      ? String(plans[plans.length - 1]["body"]).trim()
      : "_No plan recorded yet._",
    "",
    "## Sessions",
    "",
    "| # | Session | Releasable | Declared |",
    "| ---: | --- | --- | --- |",
  ];
  if (numbers.length === 0) lines.push("| — | _no sessions yet_ | — | — |");
  for (const number of numbers) {
    const title = records.get(number)?.title || `Session ${number}`;
    const declared = declarations.get(number);
    const releasable =
      declared === undefined ? "—" : declared["releasable"] ? "yes" : "no";
    const when =
      declared === undefined
        ? "not declared"
        : String(declared["dateTime"] ?? "").slice(0, 10);
    lines.push(`| ${number} | ${title} | ${releasable} | ${when} |`);
  }
  for (const number of numbers) {
    const declared = declarations.get(number);
    if (declared === undefined) continue;
    const title = records.get(number)?.title || `Session ${number}`;
    lines.push(
      "",
      `### Session ${number} — ${title}`,
      "",
      `**Releasable: ${declared["releasable"] ? "yes" : "no"}.**`,
      "",
      String(declared["task"] ?? "").trim(),
    );
  }
  const text = trimTrailingNewlines(lines.join("\n")) + "\n";
  writeTextLf(join(sessionsDir, WORK_PLAN_FILENAME), text);
  return text;
}

/**
 * The rendered files carry LF on every platform: the Python twin opens them
 * with `newline=""`, which writes `\n` through untranslated. `sessions.json`
 * and the activity log do NOT go through here -- their writer takes the
 * platform default and therefore CRLF on Windows.
 */
function writeTextLf(path: string, content: string): void {
  writeFileSync(path, content, { encoding: "utf8" });
}
