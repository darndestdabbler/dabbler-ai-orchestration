// The canonical session reader and the Work Explorer projection.
//
// One reader for every consumer: the gates, the CLI, and the VS Code
// extension, which renders the JSON this module emits and re-implements
// nothing. `writers` is the only writer of `sessions.json` and validates
// what it is about to write by folding it through this reader first, so a
// second statement of what a legal record is cannot exist.
//
// The live path reads v5 only; `normalizeLegacyState` exists for the
// migration, which is the last reader a v4 file ever gets.
//
// Three vocabularies, deliberately distinct:
// - session lifecycle: `not-started` / `in-progress` / `complete` /
//   `cancelled`;
// - task state, folded from the execution record: `pending` / `in flight` /
//   `done`, and no fourth -- a step was opened, or closed, or neither;
// - the icon key the extension maps to its four SVG assets: `complete` /
//   `in-progress` / `not-started` / `cancelled`.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadConfig, verificationRoundCap } from "./config.ts";
import {
  ACTIVITY_LOG_FILENAME,
  SESSION_PLAN_FILENAME,
  STATE_FILENAME,
  repoRootFromSessionsDir,
} from "./evidence.ts";
import { nowIso } from "./journal.ts";
import {
  LedgerError,
  ROW_REMEDIATED_AT_CAP,
  STEP_EVENT_OPENED,
  closedStepIds,
  openStep,
  readRounds,
  readStepEvents,
  sessionRunDir,
} from "./ledger.ts";
import { pythonRepr, pythonStr } from "./pythonJson.ts";
import { readText } from "./textfile.ts";
import {
  BLOCKING_SEVERITIES,
  SESSION_VERDICTS,
  TERMINAL_HEADLINES,
  VERDICT_ISSUES_FOUND,
  VERDICT_REMEDIATED_AT_CAP,
  VERDICT_VERIFIED,
} from "./verdict.ts";

export const SCHEMA_VERSION = 5;

export const STATUS_NOT_STARTED = "not-started";
export const STATUS_IN_PROGRESS = "in-progress";
export const STATUS_COMPLETE = "complete";
export const STATUS_CANCELLED = "cancelled";

export const SESSION_STATUSES: readonly string[] = [
  STATUS_NOT_STARTED,
  STATUS_IN_PROGRESS,
  STATUS_COMPLETE,
  STATUS_CANCELLED,
];

/** A session that is cancelled or complete is closed; the rest are open. */
export const CLOSED_STATUSES: readonly string[] = [STATUS_COMPLETE, STATUS_CANCELLED];

/**
 * The complete alias map. `null` stays `null`; an unknown value passes
 * through for the validators to reject -- canonicalization never invents a
 * status.
 */
const STATUS_ALIASES: Record<string, string> = {
  completed: STATUS_COMPLETE,
  done: STATUS_COMPLETE,
};

export function canonicalizeStatus(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value in STATUS_ALIASES) {
    return STATUS_ALIASES[value];
  }
  return value;
}

/** A record that cannot be a legal session state, and which rule says so. */
export class SessionStateInvariantError extends Error {
  readonly rule: number;

  constructor(rule: number, message: string) {
    super(`[v4 invariant rule ${rule}] ${message}`);
    this.name = "SessionStateInvariantError";
    this.rule = rule;
  }
}

// --- How a session number is WRITTEN ----------------------------------------

const SESSION_NUMBER_WIDTH = 3;

/**
 * `15` -> `"015"`: the three-digit, zero-padded shape staff read session
 * numbers in.
 *
 * The ONE owner of that padding, so a tree row, a status line and a
 * terminal message cannot disagree about how a session is named.
 * Presentation only: the plan's headings, `sessions.json`'s `number`, the
 * `.dabbler/runs/s<N>/` ledger and every `--session` argument keep the
 * plain integer, and nothing parses a padded string back into one.
 *
 * A number wider than the pad is not truncated to fit it, and a value that
 * is not a positive integer is rendered as-is rather than invented into one.
 */
export function sessionDisplayNumber(number: unknown): string {
  if (!isPositiveInt(number)) return pythonStr(number);
  return String(number).padStart(SESSION_NUMBER_WIDTH, "0");
}

/**
 * Python's `type(x) is int` -- which `True` fails, because a bool is an int
 * subclass and `type()` is not `isinstance()`. JavaScript has no such
 * conflation, so the test is only "an integer, and positive".
 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Python's `str(x or "")`: a falsy value -- `0`, `False`, `None`, `""` --
 * reads as absent.
 */
function pyStr(value: unknown): string {
  return value ? String(value) : "";
}

// --- Spec titles and title heal ---------------------------------------------

// `\s`, not `[ \t]`: the Python twin uses `\s+` under `re.MULTILINE`, and
// `session.ts`'s plan grammar matches the same headings. Two readers of one
// heading that disagreed on its shape is exactly the drift the port removes.
const SESSION_HEADING_RE =
  /^###\s+Session\s+(\d+)(?:\s+of\s+\d+)?\s*:\s*(.+?)\s*$/gm;
const GENERIC_TITLE_RE = /^Session\s+(\d+)$/;

/**
 * `[[number, title], ...]` sorted; empty on a missing or unreadable plan --
 * titles are a nicety, never a gate.
 */
export function extractSessionTitlesFromPlan(
  planPath: string,
): Array<[number, string]> {
  let text: string;
  try {
    text = readText(planPath);
  } catch {
    return [];
  }
  const pairs: Array<[number, string]> = [];
  for (const match of text.matchAll(SESSION_HEADING_RE)) {
    pairs.push([Number.parseInt(match[1], 10), match[2].trim()]);
  }
  // Python sorts the (number, title) tuples, so a repeated number orders by
  // title after it. Ties are broken the same way here.
  return pairs.sort((left, right) =>
    left[0] === right[0]
      ? left[1] < right[1]
        ? -1
        : left[1] > right[1]
          ? 1
          : 0
      : left[0] - right[0],
  );
}

/**
 * A title that carries no information: missing, blank, or exactly
 * `Session <its own number>`. `Session 5` stored on session 3 is drift or
 * operator words -- never healed.
 */
export function isGenericTitle(title: unknown, number: number): boolean {
  if (typeof title !== "string" || !title.trim()) return true;
  const match = GENERIC_TITLE_RE.exec(title.trim());
  return Boolean(match) && Number.parseInt(match![1], 10) === number;
}

/**
 * The metadata that makes a session record a statement about something that
 * happened, rather than a placeholder for something that has not.
 */
const HISTORY_KEYS = [
  "startedAt",
  "completedAt",
  "verificationVerdict",
  "orchestrator",
  "verification",
] as const;

/**
 * Whether the record says anything about this session having run.
 *
 * A session is historyless when it is still `not-started` and carries no
 * start, no close, no verdict and no orchestrator. Anything else -- in
 * flight, complete, cancelled, or merely stamped -- is history.
 */
export function sessionHasHistory(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  const status = canonicalizeStatus(entry["status"]);
  if (status !== null && status !== STATUS_NOT_STARTED) return true;
  return HISTORY_KEYS.some((key) => Boolean(entry[key]));
}

/**
 * The title a session record should carry.
 *
 * Two cases where the plan wins over what is stored. A **generic** title
 * (blank, or `Session <n>`) carries no information, so any plan title beats
 * it. A **historyless** session -- not started, never stamped -- has no
 * claim of its own to protect: re-cutting a plan moves sessions between
 * numbers, and the title left behind at a number describes whatever used to
 * sit there. Once a session has run, its stored title is what actually
 * happened and the plan does not get to rewrite it.
 */
export function healTitle(
  storedTitle: unknown,
  number: number,
  specTitles?: ReadonlyMap<number, string> | null,
  options: { readonly hasHistory?: boolean } = {},
): string | null {
  const hasHistory = options.hasHistory ?? true;
  if (!isGenericTitle(storedTitle, number) && hasHistory) {
    return storedTitle as string;
  }
  const specTitle = specTitles?.get(number);
  if (specTitle) return specTitle;
  if (typeof storedTitle === "string" && storedTitle.trim()) return storedTitle;
  return null;
}

// --- Reading ----------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The raw on-disk record, or null when no usable state exists.
 *
 * A read error other than "not there" propagates, as Python's does: a
 * locked file is not an absent one, and treating it as absent invites
 * writers to clobber real state.
 */
export function readRawSessionState(
  sessionsDir: string,
): Record<string, unknown> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(sessionsDir, STATE_FILENAME), "utf8"));
  } catch (error) {
    // Absent and malformed are both "no usable state"; anything else -- a
    // permission denial, a directory where the file should be -- propagates,
    // because a locked file is not an absent one and treating it as absent
    // invites writers to clobber real state.
    //
    // Asked of the file rather than of a prior `existsSync`: between that
    // question and this read the file can go, and a caller that then saw
    // ENOENT thrown would get an error where Python returns null.
    if (error instanceof SyntaxError) return null;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return isRecord(raw) ? raw : null;
}

/**
 * The v5 record with the derived fields every caller asks for.
 *
 * The derived keys are computed, never stored: a stored `currentSession` is a
 * second place for the answer to be wrong.
 */
export function readSessionState(
  sessionsDir: string,
): Record<string, unknown> | null {
  const raw = readRawSessionState(sessionsDir);
  return raw === null ? null : derivedView(raw);
}

export function readActivityLog(
  sessionsDir: string,
): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(sessionsDir, ACTIVITY_LOG_FILENAME), "utf8"),
    );
    return isRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * A real logged step carries no `kind` at all; plan rows and bookkeeping
 * records always name theirs.
 */
export function isLoggedStep(entry: Record<string, unknown>): boolean {
  return !pyStr(entry["kind"]);
}

/** The session-plan path a sessions directory implies. */
export function sessionPlanPath(sessionsDir: string): string {
  return join(sessionsDir, SESSION_PLAN_FILENAME);
}

/** `{number -> title}` from the plan, in the shape `healTitle` takes. */
export function specTitleMap(sessionsDir: string): Map<number, string> {
  return new Map(extractSessionTitlesFromPlan(sessionPlanPath(sessionsDir)));
}

const PER_SESSION_METADATA = [
  "startedAt",
  "completedAt",
  "orchestrator",
  "verificationVerdict",
] as const;

/**
 * The record plus the answers that follow from it.
 *
 * The derived keys are computed and never stored: a stored
 * `currentSession` is a second place for the answer to be wrong. It
 * mutates the session objects in place exactly as Python does -- callers
 * rely on the canonicalized status and the filled-in metadata reaching the
 * array they passed.
 */
export function derivedView(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const sessions = (
    Array.isArray(state["sessions"]) ? state["sessions"] : []
  ).filter(isRecord);
  for (const entry of sessions) {
    entry["status"] = canonicalizeStatus(entry["status"]);
    for (const key of PER_SESSION_METADATA) {
      if (!(key in entry)) entry[key] = null;
    }
  }
  const current =
    sessions.find((s) => s["status"] === STATUS_IN_PROGRESS)?.["number"] ?? null;
  const completed = sessions
    .filter(
      (s) => s["status"] === STATUS_COMPLETE && Number.isInteger(s["number"]),
    )
    .map((s) => s["number"]);
  const lastCompleted =
    [...sessions].reverse().find((s) => s["status"] === STATUS_COMPLETE) ?? null;
  const inFlight =
    sessions.find((s) => s["status"] === STATUS_IN_PROGRESS) ?? null;
  const source = inFlight ?? lastCompleted;

  return {
    ...state,
    schemaVersion: state["schemaVersion"] ?? null,
    sessions,
    currentSession: current,
    totalSessions: sessions.length,
    completedSessions: completed,
    orchestrator: source?.["orchestrator"] ?? null,
    startedAt: source?.["startedAt"] ?? null,
    completedAt: lastCompleted?.["completedAt"] ?? null,
    verificationVerdict: lastCompleted?.["verificationVerdict"] ?? null,
    lifecycleState: current !== null ? "work_in_progress" : "closed",
  };
}

// --- Progress view and invariants -------------------------------------------

export interface SessionRecordView {
  readonly number: unknown;
  readonly title: string;
  readonly status: unknown;
}

export interface ProgressView {
  readonly sessions: readonly SessionRecordView[];
  readonly totalSessions: number;
  readonly completedSessions: readonly number[];
  readonly currentSession: number | null;
  readonly nextSession: number | null;
  readonly isBetweenSessions: boolean;
}

function parseSessions(raw: unknown): SessionRecordView[] {
  if (!Array.isArray(raw)) {
    throw new SessionStateInvariantError(1, "sessions must be a list");
  }
  return raw.map((entry) => {
    if (!isRecord(entry)) {
      throw new SessionStateInvariantError(
        2,
        `session entry must be an object, got ${pythonRepr(entry)}`,
      );
    }
    if (!("number" in entry) || !("status" in entry)) {
      throw new SessionStateInvariantError(
        2,
        `session entry needs number and status: ${pythonRepr(entry)}`,
      );
    }
    return {
      number: entry["number"],
      title: (entry["title"] as string) || `Session ${String(entry["number"])}`,
      status: canonicalizeStatus(entry["status"]) ?? entry["status"],
    };
  });
}

export function validateInvariants(
  sessions: readonly SessionRecordView[],
  options: { readonly lifecycleState?: unknown } = {},
): void {
  if (sessions.length === 0) {
    throw new SessionStateInvariantError(1, "sessions[] is empty");
  }
  const numbers: number[] = [];
  for (const session of sessions) {
    if (!isPositiveInt(session.number)) {
      throw new SessionStateInvariantError(
        2,
        `session number must be a positive int, got ${pythonRepr(session.number)}`,
      );
    }
    if (
      typeof session.status !== "string" ||
      !SESSION_STATUSES.includes(session.status)
    ) {
      throw new SessionStateInvariantError(
        2,
        `session ${session.number} has unknown status ${pythonRepr(session.status)}`,
      );
    }
    numbers.push(session.number);
  }
  const sorted = [...numbers].sort((left, right) => left - right);
  const contiguous = sorted.every((value, index) => value === index + 1);
  if (!contiguous) {
    throw new SessionStateInvariantError(
      2,
      `session numbers must be contiguous from 1, got [${numbers.join(", ")}]`,
    );
  }
  const inProgress = sessions.filter((s) => s.status === STATUS_IN_PROGRESS);
  if (inProgress.length > 1) {
    throw new SessionStateInvariantError(
      3,
      `more than one in-progress session: [${inProgress
        .map((s) => String(s.number))
        .join(", ")}]`,
    );
  }
  if (options.lifecycleState === "closed" && inProgress.length > 0) {
    throw new SessionStateInvariantError(
      8,
      `lifecycleState 'closed' with session ${String(inProgress[0].number)} in flight`,
    );
  }
  // Work is done in order: a closed session never sits behind an open one.
  // Cancelled counts as closed -- it is a session that will not run, not one
  // still waiting its turn.
  let seenOpen = false;
  for (const session of sessions) {
    if (typeof session.status !== "string" || !CLOSED_STATUSES.includes(session.status)) {
      seenOpen = true;
    } else if (seenOpen && session.status === STATUS_COMPLETE) {
      throw new SessionStateInvariantError(
        4,
        `complete session ${String(session.number)} follows an open one`,
      );
    }
  }
}

export function getProgress(state: Record<string, unknown>): ProgressView {
  const sessions = parseSessions(state["sessions"]);
  validateInvariants(sessions, { lifecycleState: state["lifecycleState"] });
  const completed = sessions
    .filter((s) => s.status === STATUS_COMPLETE)
    .map((s) => s.number as number);
  const current =
    (sessions.find((s) => s.status === STATUS_IN_PROGRESS)?.number as number) ?? null;
  const next =
    (sessions.find((s) => s.status === STATUS_NOT_STARTED)?.number as number) ?? null;
  return {
    sessions,
    totalSessions: sessions.length,
    completedSessions: completed,
    currentSession: current,
    nextSession: next,
    isBetweenSessions: current === null && completed.length >= 1 && next !== null,
  };
}

// --- Title heal over a whole ledger -------------------------------------------

/** Whether any record in this ledger has a title the plan could improve. */
export function needsTitleHeal(sessions: readonly unknown[]): boolean {
  for (const entry of sessions) {
    if (!isRecord(entry)) continue;
    const number = entry["number"];
    if (!isPositiveInt(number)) continue;
    if (isGenericTitle(entry["title"], number)) return true;
    if (!sessionHasHistory(entry)) return true;
  }
  return false;
}

/** Heal in place; the count is how many titles moved. */
export function healStaleTitles(
  sessions: readonly unknown[],
  specTitles: ReadonlyMap<number, string>,
): number {
  let healed = 0;
  for (const entry of sessions) {
    if (!isRecord(entry)) continue;
    const number = entry["number"];
    if (!isPositiveInt(number)) continue;
    const replacement = healTitle(entry["title"], number, specTitles, {
      hasHistory: sessionHasHistory(entry),
    });
    if (replacement !== null && replacement !== entry["title"]) {
      entry["title"] = replacement;
      healed += 1;
    }
  }
  return healed;
}

// --- v2/v3 -> v4 normalization ------------------------------------------------

export const SCHEMA_VERSION_V4 = 4;

const PER_SESSION_METADATA_KEYS = PER_SESSION_METADATA;

/**
 * Build `sessions[]` for a v2-shaped file (bare counters, no ledger).
 *
 * `currentSession` is deliberately excluded from the count derivation --
 * including it once inflated a plan-less set to 0/1.
 */
export function synthesizeV3FromV2(
  state: Record<string, unknown>,
  specMdPath: string,
): Record<string, unknown> {
  const completedRaw = state["completedSessions"];
  const completed = (Array.isArray(completedRaw) ? completedRaw : []).filter(
    isPositiveInt,
  );
  const currentRaw = state["currentSession"];
  const current = isPositiveInt(currentRaw) ? currentRaw : null;
  const totalRaw = state["totalSessions"];
  const total = isPositiveInt(totalRaw) ? totalRaw : 0;

  const specTitles = new Map(extractSessionTitlesFromPlan(specMdPath));
  const count = Math.max(0, total, ...specTitles.keys(), ...completed);

  const topStatus = canonicalizeStatus(state["status"]);
  const sessions: Record<string, unknown>[] = [];
  for (let number = 1; number <= count; number += 1) {
    let status: string;
    if (completed.includes(number)) {
      status = STATUS_COMPLETE;
    } else if (current === number && topStatus === STATUS_IN_PROGRESS) {
      status = STATUS_IN_PROGRESS;
    } else {
      status = STATUS_NOT_STARTED;
    }
    sessions.push({
      number,
      title: specTitles.get(number) || `Session ${number}`,
      status,
    });
  }

  const out: Record<string, unknown> = { ...state };
  out["sessions"] = sessions;
  out["schemaVersion"] = 3;
  if (topStatus !== state["status"]) out["status"] = topStatus;
  return out;
}

/**
 * The migration's reader: any pre-v5 shape in, the v4 read view out.
 *
 * Nothing on the live path calls this. It exists so a repository still
 * holding set-scoped state can be carried forward exactly once, which is
 * the only moment a v4 file is read.
 */
export function normalizeLegacyState(
  state: Record<string, unknown>,
  specMdPath: string,
  specTitles?: ReadonlyMap<number, string> | null,
): Record<string, unknown> {
  const sessionsPresent =
    state["sessions"] !== null && state["sessions"] !== undefined;
  let source = state;
  if (!sessionsPresent) source = synthesizeV3FromV2(state, specMdPath);

  const schemaVersionIn = source["schemaVersion"];
  const isV4Input =
    Number.isInteger(schemaVersionIn) && (schemaVersionIn as number) >= SCHEMA_VERSION_V4;

  const sessionsV4: Record<string, unknown>[] = [];
  for (const entry of Array.isArray(source["sessions"]) ? source["sessions"] : []) {
    if (!isRecord(entry)) {
      sessionsV4.push({ number: null, title: null, status: null });
      continue;
    }
    const record: Record<string, unknown> = { ...entry };
    record["status"] = canonicalizeStatus(record["status"]);
    for (const key of PER_SESSION_METADATA_KEYS) {
      if (!(key in record)) record[key] = null;
    }
    sessionsV4.push(record);
  }

  if (needsTitleHeal(sessionsV4)) {
    const titles =
      specTitles ?? new Map(extractSessionTitlesFromPlan(specMdPath));
    if (titles.size > 0) healStaleTitles(sessionsV4, titles);
  }

  const topStatus = canonicalizeStatus(source["status"]);

  if (!isV4Input) {
    // Promote v3's single-valued top-level lifecycle metadata onto the
    // sessions it belongs to.
    const inProgress =
      sessionsV4.find((s) => s["status"] === STATUS_IN_PROGRESS) ?? null;
    const completed = sessionsV4.filter((s) => s["status"] === STATUS_COMPLETE);
    const lastCompleted = completed.length > 0 ? completed[completed.length - 1] : null;
    if (inProgress !== null) {
      for (const key of ["orchestrator", "startedAt"]) {
        if (
          (inProgress[key] === null || inProgress[key] === undefined) &&
          source[key] !== null &&
          source[key] !== undefined
        ) {
          inProgress[key] = source[key];
        }
      }
    }
    if (lastCompleted !== null) {
      for (const key of ["completedAt", "verificationVerdict"]) {
        if (
          (lastCompleted[key] === null || lastCompleted[key] === undefined) &&
          source[key] !== null &&
          source[key] !== undefined
        ) {
          lastCompleted[key] = source[key];
        }
      }
      if (inProgress === null) {
        // A between-sessions v3 snapshot must not lose these.
        for (const key of ["orchestrator", "startedAt"]) {
          if (
            (lastCompleted[key] === null || lastCompleted[key] === undefined) &&
            source[key] !== null &&
            source[key] !== undefined
          ) {
            lastCompleted[key] = source[key];
          }
        }
      }
    }
  }

  const currentSession =
    sessionsV4.find((s) => s["status"] === STATUS_IN_PROGRESS)?.["number"] ?? null;
  const completedNumbers = sessionsV4
    .filter((s) => s["status"] === STATUS_COMPLETE && Number.isInteger(s["number"]))
    .map((s) => s["number"]);
  let total: number | null = sessionsV4.length;
  if (!sessionsPresent && total === 0) total = null;

  const fromInProgress = (key: string): unknown => {
    for (const session of sessionsV4) {
      if (session["status"] === STATUS_IN_PROGRESS) return session[key] ?? null;
    }
    return null;
  };

  let startedAt = fromInProgress("startedAt");
  if (startedAt === null || startedAt === undefined) {
    startedAt = null;
    for (const session of [...sessionsV4].reverse()) {
      if (session["status"] === STATUS_COMPLETE && session["startedAt"]) {
        startedAt = session["startedAt"];
        break;
      }
    }
  }
  let orchestrator = fromInProgress("orchestrator");
  const lastCompletedEntry =
    [...sessionsV4].reverse().find((s) => s["status"] === STATUS_COMPLETE) ?? null;
  const completedAt =
    lastCompletedEntry !== null && topStatus === STATUS_COMPLETE
      ? lastCompletedEntry["completedAt"] ?? null
      : null;
  const verdict =
    lastCompletedEntry !== null ? lastCompletedEntry["verificationVerdict"] ?? null : null;

  if (sessionsV4.length === 0 && topStatus === STATUS_IN_PROGRESS) {
    // Plan-less carve-out: top-level passthroughs stand in.
    orchestrator = orchestrator || source["orchestrator"] || null;
    startedAt = startedAt || source["startedAt"] || null;
  }

  let lifecycle = source["lifecycleState"] ?? null;
  if (lifecycle === null || lifecycle === undefined) {
    lifecycle =
      topStatus === STATUS_IN_PROGRESS
        ? "work_in_progress"
        : topStatus === STATUS_COMPLETE
          ? "closed"
          : null;
  }

  const out: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION_V4,
    sessionSetName: source["sessionSetName"] ?? null,
    status: topStatus,
    sessions: sessionsV4,
    currentSession,
    totalSessions: total,
    completedSessions: completedNumbers,
    orchestrator,
    startedAt,
    completedAt,
    verificationVerdict: verdict,
    lifecycleState: lifecycle,
  };
  for (const passthrough of ["preCancelStatus", "forceClosed", "nextOrchestrator"]) {
    if (passthrough in source) out[passthrough] = source[passthrough];
  }
  return out;
}

/**
 * The migration's reader for a set-scoped `session-state.json`.
 *
 * Nothing else reads this file: after the migration it does not exist.
 */
export function readRawLegacyState(setDir: string): Record<string, unknown> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readText(join(setDir, "session-state.json")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return isRecord(raw) ? raw : null;
}

// --- Where a projection's sessions come from ----------------------------------

/**
 * Source of the sessions in a projection. `ledger` is the machine-written
 * record; `plan` is a repository that has been set up and never run, whose
 * sessions are the ones its plan declares.
 */
export const SOURCE_LEDGER = "ledger";
export const SOURCE_PLAN = "plan";

/**
 * Whether the machine has written this repository's record.
 *
 * The distinction the projection turns on: a MISSING ledger is a repository
 * nothing has run in yet, and an unreadable one is a fault. Reading the plan
 * in the first case is rendering a declaration; doing it in the second would
 * replace a broken record with a cheerful guess.
 */
export function ledgerExists(sessionsDir: string): boolean {
  try {
    return statSync(join(sessionsDir, STATE_FILENAME)).isFile();
  } catch {
    return false;
  }
}

/**
 * The sessions a set-up-but-never-run repository declares, as ledger entries
 * would look before anything ran.
 *
 * Bootstrap scaffolds two of them -- author the project plan, then break it
 * into numbered sessions -- and until the first `session start` they exist
 * only in the plan. Rendering them is what makes project setup visible to a
 * repository that is not this one; nothing here writes, so the ledger still
 * begins at registration.
 */
export function sessionsFromPlan(sessionsDir: string): Record<string, unknown>[] {
  return extractSessionTitlesFromPlan(sessionPlanPath(sessionsDir)).map(
    ([number, title]) => ({ number, title, status: STATUS_NOT_STARTED }),
  );
}

// --- The task level -----------------------------------------------------------

export const STEP_STATE_PENDING = "pending";
export const STEP_STATE_IN_FLIGHT = "in flight";
export const STEP_STATE_DONE = "done";

/**
 * The plan or the execution record could not be read.
 *
 * A refusal is not a skip: a framework that cannot tell which step is open
 * must say so, never render the last row it could read as if it were
 * current.
 */
export class TaskRowsRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskRowsRefused";
  }
}

/** What `buildTaskRows` needs from the approved plan, and nothing more. */
export interface ApprovedPlanReader {
  readonly planFilename: string;
  /** The plan as its amendments leave it, or a throw the caller reports. */
  readonly effectivePlan: (runDir: string) => Record<string, unknown>;
}

let approvedPlanReader: ApprovedPlanReader | null = null;

/**
 * Register the approved-plan reader the task rows fold against.
 *
 * The same seam `writers.usePlanParser` uses, for the same reason: the
 * projection is ported before the plan artifact it reads, and a reader that
 * returned an empty step list until then would render "this session has no
 * tasks" over a session that has seven. Unregistered, the fold refuses and
 * the projection says so out loud.
 */
export function useApprovedPlanReader(reader: ApprovedPlanReader): void {
  approvedPlanReader = reader;
}

/**
 * The session's approved-plan steps, in plan order, each folded against the
 * execution record.
 *
 * The invariant that at most one step is open is the fold's, not this
 * function's: `ledger.openStep` returns the last `opened` row with no
 * `closed` row after it, and there is nothing here to disagree with it. Two
 * rows in flight would be a defect in that fold rather than a state this
 * record can hold.
 *
 * Throws `TaskRowsRefused` when either artifact is unreadable. A session
 * with no plan at all has no tasks and is not a refusal -- the lifecycle
 * does not require one.
 */
export function buildTaskRows(
  repoRoot: string,
  sessionNumber: number,
): Record<string, unknown>[] {
  const runDir = sessionRunDir(repoRoot, sessionNumber);
  const reader = approvedPlanReader;
  const filename = reader?.planFilename ?? "approved-plan.json";
  if (!existsSync(join(runDir, filename))) return [];
  if (reader === null) {
    throw new TaskRowsRefused(
      "approved plan: no reader is registered, so the plan on disk cannot " +
        "be folded; the projection will not guess at a session's steps",
    );
  }
  let plan: Record<string, unknown>;
  try {
    plan = reader.effectivePlan(runDir);
  } catch (error) {
    throw new TaskRowsRefused(
      `approved plan: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let events: Record<string, unknown>[];
  let openRow: Record<string, unknown> | null;
  let closed: Set<unknown>;
  try {
    events = readStepEvents(repoRoot, sessionNumber);
    openRow = openStep(repoRoot, sessionNumber);
    closed = new Set(closedStepIds(repoRoot, sessionNumber));
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    throw new TaskRowsRefused(`execution record: ${error.message}`);
  }

  const openedAt = new Map<unknown, unknown>();
  for (const event of events) {
    if (event["event"] === STEP_EVENT_OPENED) {
      openedAt.set(event["step_id"], event["recorded_at"] ?? null);
    }
  }
  const openId = openRow ? openRow["step_id"] : null;

  const rows: Record<string, unknown>[] = [];
  const steps = Array.isArray(plan["steps"]) ? plan["steps"] : [];
  for (const [position, step] of steps.entries()) {
    const record = isRecord(step) ? step : {};
    const stepId = record["step_id"];
    let state: string;
    let icon: string;
    if (closed.has(stepId)) {
      state = STEP_STATE_DONE;
      icon = STATUS_COMPLETE;
    } else if (openRow !== null && stepId === openId) {
      state = STEP_STATE_IN_FLIGHT;
      icon = STATUS_IN_PROGRESS;
    } else {
      state = STEP_STATE_PENDING;
      icon = STATUS_NOT_STARTED;
    }
    rows.push({
      position,
      stepId,
      intent: pyStr(record["intent"]),
      state,
      iconKey: icon,
      isOpen: openRow !== null && stepId === openId,
      startedAt: openedAt.get(stepId) ?? null,
    });
  }
  return rows;
}

// --- The verification view ----------------------------------------------------

/**
 * The rounds ledger could not be read.
 *
 * A refusal, not a skip: the view must say it cannot tell what stopped a
 * session rather than render the last round that did parse as if it were the
 * one that stopped it.
 */
export class VerificationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationRefused";
  }
}

/**
 * How a finding stands, in the record's own terms. `outstanding` is a
 * blocking finding the latest round left unanswered; `fixed, unreviewed` is
 * one the cap terminal shows remediated and nobody reviewed; `noted` is a
 * finding that never blocked and was left standing.
 */
export const FINDING_OUTSTANDING = "outstanding";
export const FINDING_FIXED_UNREVIEWED = "fixed, unreviewed";
export const FINDING_NOTED = "noted";

/**
 * The round cap the repository's configuration declares, or null when no
 * configuration can be read.
 *
 * Unknown stays unknown: without the cap a blocking round is *outstanding*,
 * and is never called unresolved, because "the cap is reached" is a claim
 * about a number this call did not get.
 */
export function verificationCap(repoRoot: string): number | null {
  try {
    return verificationRoundCap(loadConfig(undefined, repoRoot));
  } catch {
    // A config fault is an unknown cap, not a crash.
    return null;
  }
}

/**
 * What the verifier looked at in one round, and how faithfully.
 *
 * A row that predates the agency record carries `mode: null` -- unknown is
 * not the same as none, and the view must not claim the round looked at
 * nothing when the record says nothing either way.
 */
function agencyView(roundRow: Record<string, unknown>): Record<string, unknown> {
  const agency = isRecord(roundRow["agency"]) ? roundRow["agency"] : {};
  const operations: Record<string, unknown>[] = [];
  const raw = agency["operations"];
  for (const operation of Array.isArray(raw) ? raw : []) {
    if (!isRecord(operation)) continue;
    operations.push({
      kind: operation["kind"] ?? null,
      target: pyStr(operation["target"]),
      fidelity: operation["fidelity"] ?? null,
      inScope: Boolean(operation["in_scope"] ?? true),
    });
  }
  return {
    mode: agency["mode"] ?? null,
    reads: pyInt(agency["reads"]),
    searches: pyInt(agency["searches"]),
    listings: pyInt(agency["listings"]),
    transformedReads: pyInt(agency["transformed_reads"]),
    outOfScope: pyInt(agency["out_of_scope"]),
    overBudget: pyInt(agency["over_budget"]),
    reason: pyStr(agency["reason"]) || null,
    operations,
  };
}

/** `int(x or 0)` over a counter the record may not carry. */
function pyInt(value: unknown): number {
  if (!value) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function findingView(
  finding: Record<string, unknown>,
  roundNumber: unknown,
  disposition: string,
): Record<string, unknown> {
  const severity = pyStr(finding["severity"]);
  let blocking = finding["blocking"];
  if (typeof blocking !== "boolean") blocking = BLOCKING_SEVERITIES.has(severity);
  const evidencePaths = finding["evidencePaths"];
  return {
    round: roundNumber ?? null,
    description: pyStr(finding["description"]),
    severity,
    category: pyStr(finding["category"]),
    failureScenario: pyStr(finding["failureScenario"]),
    evidencePaths: (Array.isArray(evidencePaths) ? evidencePaths : []).map((path) =>
      pythonStr(path),
    ),
    blocking,
    disposition,
  };
}

/**
 * One session's rounds ledger, folded into what is read at planning time:
 * what stopped it and at which round, the findings with vendor and severity,
 * what the verifier looked at and how faithfully, and which of the three
 * terminal states it reached.
 *
 * Which state is the record's answer, never a person's. A `remediated_at_cap`
 * row is that state, carrying the findings it shows fixed and the paths the
 * fix touched. A blocking latest round at the cap is unresolved; a blocking
 * round below it is a loop still open, and is said to be exactly that. A
 * non-blocking latest round is verified. The headline for each is
 * `TERMINAL_HEADLINES`, the one vocabulary every loop reports in.
 *
 * Null for a session with no rounds; throws `VerificationRefused` when the
 * ledger cannot be read.
 */
export function buildVerificationView(
  repoRoot: string,
  sessionNumber: number,
  cap: number | null,
): Record<string, unknown> | null {
  let rounds: Record<string, unknown>[];
  try {
    rounds = readRounds(repoRoot, sessionNumber);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    throw new VerificationRefused(`rounds ledger: ${error.message}`);
  }
  if (rounds.length === 0) return null;

  const latest = rounds[rounds.length - 1];
  // The verifier's own rounds. A terminal row (remediated at the cap, an
  // adjudication) is the record's disposition of the last one of these, so
  // the vendor, the transport and the agency log are read from the round
  // that actually stopped the session.
  const reviewed = rounds.filter((row) => !row["type"]);
  const stopped = reviewed.length > 0 ? reviewed[reviewed.length - 1] : latest;
  const verdict = latest["verdict"] ?? null;
  let fixPaths: string[] = [];
  let terminal: string | null;
  let findings: Record<string, unknown>[];

  if (latest["type"] === ROW_REMEDIATED_AT_CAP) {
    const remediated = isRecord(latest["remediated"]) ? latest["remediated"] : {};
    terminal = VERDICT_REMEDIATED_AT_CAP;
    const rows = remediated["findings"];
    findings = (Array.isArray(rows) ? rows : [])
      .filter(isRecord)
      .map((finding) =>
        findingView(finding, remediated["reviewed_round"], FINDING_FIXED_UNREVIEWED),
      );
    const paths = remediated["fix_paths"];
    fixPaths = (Array.isArray(paths) ? paths : []).map((path) => pythonStr(path));
  } else {
    const blockingRound = Boolean(latest["blocking"]);
    if (blockingRound) {
      terminal =
        cap !== null && (latest["round"] as number) >= cap ? VERDICT_ISSUES_FOUND : null;
    } else {
      terminal =
        typeof verdict === "string" && SESSION_VERDICTS.has(verdict) ? verdict : null;
    }
    findings = [];
    const rows = latest["findings"];
    for (const finding of (Array.isArray(rows) ? rows : []).filter(isRecord)) {
      const view = findingView(finding, latest["round"], FINDING_NOTED);
      if (blockingRound && view["blocking"]) view["disposition"] = FINDING_OUTSTANDING;
      findings.push(view);
    }
  }

  let headline: string;
  if (terminal !== null) {
    headline = TERMINAL_HEADLINES[terminal];
  } else if (latest["blocking"]) {
    headline =
      `blocking findings outstanding after round ${pythonStr(latest["round"])}` +
      (cap !== null ? ` of ${cap}` : "");
  } else {
    // A verdict the vocabulary no longer issues (a historical waiver).
    // Rendered as itself: laundering it into a live state is the one thing a
    // reader of a retired token must not do.
    headline = `${pythonStr(verdict).toLowerCase()} (a retired verdict)`;
  }

  return {
    terminal,
    headline,
    clean: terminal === VERDICT_VERIFIED,
    verdict,
    rounds: reviewed.length,
    stoppedAtRound: stopped["round"] ?? null,
    cap,
    verifierModel: stopped["verifier_model"] ?? null,
    verifierProvider: stopped["verifier_provider"] ?? null,
    transport: stopped["transport"] ?? null,
    agency: agencyView(stopped),
    findings,
    fixPaths,
  };
}

// --- The projection -----------------------------------------------------------

/**
 * Everything the Work Explorer renders for this repository, in one pass.
 *
 * Computed fresh on every call -- a cache would need a freshness protocol,
 * and the v1 one (digests plus stale states) cost more than recomputing.
 */
export function buildProjection(sessionsDir: string): Record<string, unknown> {
  // The task level lives under the repository root, not the sessions root:
  // `.dabbler/runs/s<N>/`. The inverse of the one rule that places the
  // sessions root is `evidence.repoRootFromSessionsDir`.
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  let raw = readRawSessionState(sessionsDir);

  // A repository that has been set up and never run has no ledger, and its
  // sessions are the ones its plan declares. Keyed on the file being ABSENT
  // rather than on the read returning null: an unreadable ledger comes back
  // null too, and answering that with the plan would report a fresh
  // repository where there is a broken record.
  let source = SOURCE_LEDGER;
  if (raw === null && !ledgerExists(sessionsDir)) {
    const planned = sessionsFromPlan(sessionsDir);
    if (planned.length > 0) {
      source = SOURCE_PLAN;
      raw = { schemaVersion: null, sessions: planned };
    }
  }

  let invariantViolation: string | null = null;
  let view: Record<string, unknown>;
  if (raw === null) {
    view = derivedView({ schemaVersion: null, sessions: [] });
    if (ledgerExists(sessionsDir)) {
      // The file is there and did not parse. Rendering that as an empty
      // repository says the same thing as a repository with no sessions, and
      // the operator would have no reason to look at the one file that needs
      // looking at.
      invariantViolation =
        `${STATE_FILENAME} is present but could not be read; no ` +
        "sessions can be listed until it parses";
    }
  } else {
    view = derivedView(raw);
    try {
      getProgress(view);
    } catch (error) {
      if (!(error instanceof SessionStateInvariantError)) throw error;
      invariantViolation = error.message;
    }
  }

  // Render the plan's title for a session that has none of its own. The
  // ledger is written at registration, so a plan re-cut between two
  // registrations leaves the moved sessions carrying whatever used to sit at
  // their numbers; the next `session start` writes the same correction this
  // render is making. `view` is a fresh parse of the file on every call, so
  // healing it here changes nothing on disk.
  const viewSessions = Array.isArray(view["sessions"]) ? view["sessions"] : [];
  if (needsTitleHeal(viewSessions)) {
    const titles = specTitleMap(sessionsDir);
    if (titles.size > 0) healStaleTitles(viewSessions, titles);
  }

  // Read once per projection: the cap is the repository's, not the session's,
  // and it is what turns a blocking round into "unresolved".
  const cap = verificationCap(repoRoot);

  const sessionsOut: Record<string, unknown>[] = [];
  for (const entry of viewSessions) {
    if (!isRecord(entry)) continue;
    const number = entry["number"];
    const sessionStatus = entry["status"];
    const inFlight = sessionStatus === STATUS_IN_PROGRESS;
    const sessionOut: Record<string, unknown> = {
      number: number ?? null,
      // The name, beside the number. The extension renders this rather than
      // padding for itself, so the padding rule has one owner across both
      // languages.
      displayNumber: sessionDisplayNumber(number),
      title: entry["title"] || `Session ${pythonStr(number)}`,
      status: sessionStatus ?? null,
      iconKey:
        typeof sessionStatus === "string" && SESSION_STATUSES.includes(sessionStatus)
          ? sessionStatus
          : STATUS_NOT_STARTED,
      inFlight,
      startedAt: entry["startedAt"] ?? null,
      completedAt: entry["completedAt"] ?? null,
      verificationVerdict: entry["verificationVerdict"] ?? null,
      tasks: [] as unknown[],
      tasksRefused: null as string | null,
      // The rounds ledger folded for reading at planning time, for every
      // session that has one -- a session that stopped at the cap is closed
      // or cancelled by the time anyone plans against it, so this is not an
      // in-flight-only fact like the tasks.
      verification: null as unknown,
      verificationRefused: null as string | null,
    };
    if (inFlight && Number.isInteger(number)) {
      try {
        sessionOut["tasks"] = buildTaskRows(repoRoot, number as number);
      } catch (error) {
        if (!(error instanceof TaskRowsRefused)) throw error;
        sessionOut["tasksRefused"] = error.message;
      }
    }
    if (Number.isInteger(number)) {
      try {
        sessionOut["verification"] = buildVerificationView(
          repoRoot,
          number as number,
          cap,
        );
      } catch (error) {
        if (!(error instanceof VerificationRefused)) throw error;
        sessionOut["verificationRefused"] = error.message;
      }
    }
    sessionsOut.push(sessionOut);
  }

  return {
    schemaVersion: 1,
    generatedAt: nowIso("microseconds"),
    repository: {
      // Where these sessions came from, so the view can say that nothing has
      // run here rather than implying that it has.
      sessionsSource: source,
      schemaVersionOnDisk: raw?.["schemaVersion"] ?? null,
      totalSessions: view["totalSessions"] ?? null,
      sessionsCompleted: (view["completedSessions"] as unknown[] | null)?.length ?? 0,
      currentSession: view["currentSession"] ?? null,
      forceClosed: Boolean(view["forceClosed"]),
      orchestrator: view["orchestrator"] ?? null,
      invariantViolation,
    },
    sessions: sessionsOut,
  };
}

// `repr(x)` for the values that reach an invariant message. It lives beside
// `dumps` now that four modules ask for it, and is re-exported here because
// the invariants are where it was first needed.
export { pythonRepr };
