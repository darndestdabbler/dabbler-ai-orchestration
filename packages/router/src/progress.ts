// The session record: its vocabulary, its derived answers, and the
// invariants that make it readable.
//
// Session 30 ports `progress` whole -- the projection the extension
// renders, the task rows, the CLI. What is here is the slice `writers`
// cannot be written without: `writers` is the only writer of
// `sessions.json`, and it validates what it is about to write by folding
// it through this reader first. Porting the writer without the reader
// would mean a second statement of what a legal record is, in the module
// that produces them, which is the drift the port exists to remove.
//
// Three vocabularies live here and stay distinct: the session lifecycle
// (`not-started` / `in-progress` / `complete` / `cancelled`), the task
// state folded from the execution record, and the extension's icon key.
// Only the first is in this slice.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACTIVITY_LOG_FILENAME, SESSION_PLAN_FILENAME, STATE_FILENAME } from "./evidence.ts";
import { pythonRepr } from "./pythonJson.ts";
import { readText } from "./textfile.ts";

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

/** `str(x)` for the values these records hold. */
function pythonStr(value: unknown): string {
  if (value === null) return "None";
  if (value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
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

// `repr(x)` for the values that reach an invariant message. It lives beside
// `dumps` now that four modules ask for it, and is re-exported here because
// the invariants are where it was first needed.
export { pythonRepr };
