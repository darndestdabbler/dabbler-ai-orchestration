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
// - task state, folded from what was logged against a declared step:
//   `pending` / `in flight` / `done` / `blocked`, which is the writer's
//   vocabulary rendered in the reader's words;
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
  readRounds,
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

/**
 * A session the plan declares and the ledger has not reached.
 *
 * Deliberately absent from `SESSION_STATUSES`, which is the vocabulary a
 * writer may put on disk. `not-started` already means "registered, and not
 * begun"; this means "declared, and not registered", and the difference is
 * the whole of what this state exists to say. A projected state that a writer
 * accepted would stop being a projection.
 */
export const STATUS_PLANNED = "planned";

/**
 * The sessions the plan declares beyond the ledger, in plan order.
 *
 * `session start` grows the ledger to the plan, so this is empty for most of
 * a session's life. The window it exists for is the one that cost `csv-model`
 * its bearings: a planning session whose whole deliverable is new headings
 * closes, and until the NEXT registration the ledger knows nothing about
 * them. The projection read the plan only when the ledger was absent, so for
 * that whole window every indicator said the project was finished.
 *
 * Reconciliation is defined rather than assumed, because a plan is
 * hand-edited and the interesting cases are all reachable:
 *
 * - **A number the ledger already holds is never re-emitted.** The ledger is
 *   the record; a heading is a declaration, and a declaration does not get to
 *   restate a registered session. Title drift is already healed elsewhere.
 * - **A duplicate number in the plan contributes once.** The parser sorts
 *   `(number, title)`, so the first is taken and the rest are dropped -- the
 *   same tie-break `session start` reads them with.
 * - **Gaps are not errors.** A plan that declares 37 and 39 and no 38 yields
 *   exactly those two rows. Nothing here invents the missing number, because
 *   a projection that filled gaps would be asserting sessions nobody wrote.
 * - **A plan shorter than the ledger yields nothing.** The ledger never
 *   shrinks, and a heading deleted after its session ran does not un-run it.
 * - **A malformed heading contributes nothing at all**, because the parser
 *   does not match it. That is a silence rather than a refusal: titles were
 *   always "a nicety, never a gate", and a repository whose plan will not
 *   parse still has a ledger worth rendering.
 */
export function plannedSessions(
  sessionsDir: string,
  ledgerNumbers: ReadonlySet<number>,
): Record<string, unknown>[] {
  const seen = new Set<number>();
  const rows: Record<string, unknown>[] = [];
  for (const [number, title] of extractSessionTitlesFromPlan(
    sessionPlanPath(sessionsDir),
  )) {
    if (!Number.isInteger(number)) continue;
    if (ledgerNumbers.has(number) || seen.has(number)) continue;
    seen.add(number);
    rows.push({ number, title, status: STATUS_PLANNED });
  }
  return rows;
}

// --- The task level -----------------------------------------------------------

export const STEP_STATE_PENDING = "pending";
export const STEP_STATE_IN_FLIGHT = "in flight";
export const STEP_STATE_DONE = "done";
export const STEP_STATE_BLOCKED = "blocked";

/** The activity-log row kind `session start` seeds one of per planned step. */
export const KIND_PLAN_STEP = "plan-step";

/**
 * The statuses `session log` accepts, which are the writer's vocabulary and
 * not this reader's. Imported as constants rather than restated as strings so
 * a status the writer gains cannot silently render as its own name.
 */
export const STEP_STATUS_PENDING = "pending";
export const STEP_STATUS_IN_PROGRESS = "in-progress";
export const STEP_STATUS_COMPLETE = "complete";
export const STEP_STATUS_BLOCKED = "blocked";

/** The logged status, in the words a task row says. */
export const TASK_STATE_OF_STATUS: Readonly<Record<string, string>> = {
  [STEP_STATUS_PENDING]: STEP_STATE_PENDING,
  [STEP_STATUS_IN_PROGRESS]: STEP_STATE_IN_FLIGHT,
  [STEP_STATUS_COMPLETE]: STEP_STATE_DONE,
  [STEP_STATUS_BLOCKED]: STEP_STATE_BLOCKED,
};

/**
 * The logged status, as one of the four glyphs the extension ships.
 *
 * `blocked` takes the cancelled glyph: there is no fifth asset, and a step
 * that stopped reads far closer to cancelled than to any of the other three.
 * The row's own word is what distinguishes them.
 */
export const TASK_ICON_OF_STATUS: Readonly<Record<string, string>> = {
  [STEP_STATUS_PENDING]: STATUS_NOT_STARTED,
  [STEP_STATUS_IN_PROGRESS]: STATUS_IN_PROGRESS,
  [STEP_STATUS_COMPLETE]: STATUS_COMPLETE,
  [STEP_STATUS_BLOCKED]: STATUS_CANCELLED,
};

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

/**
 * The session's declared steps, folded against what was logged against them.
 *
 * Both halves come from `activity-log.json` and both are already written by
 * the lifecycle. `session start` seeds one `plan-step` row per step in the
 * plan -- number, stable key, description -- and `session log` appends a
 * kind-less row naming the same step with a new status. So the declared list
 * is the plan's, the execution is the log's, and the fold takes the last
 * status logged against each step.
 *
 * It used to fold `approved-plan.json` against `step-execution.jsonl`, and
 * nothing in the lifecycle writes either, so it returned an empty list at its
 * first line and no session ever rendered a task. Two mechanisms existed for
 * one purpose and the tree read the one nobody wrote. `approved-plan.json`
 * keeps its own job -- the file envelope, the risk flags and the amendment
 * ledger that verification scope reads -- and stops being this projection's
 * source.
 *
 * At most one step is in flight, and that is the log's invariant rather than
 * this function's: a second step logged `in-progress` supersedes the first,
 * because the last row logged against a step is the one that is true.
 */
export function buildTaskRows(
  sessionsDir: string,
  sessionNumber: number,
): Record<string, unknown>[] {
  const log = readActivityLog(sessionsDir);
  if (log === null) {
    // Absent is a legitimate state -- a repository nothing has run in yet has
    // no tasks. Present-but-unreadable is a fault, and rendering it as "no
    // tasks" would say the same thing as a session that has none.
    if (!existsSync(join(sessionsDir, ACTIVITY_LOG_FILENAME))) return [];
    throw new TaskRowsRefused(
      `${ACTIVITY_LOG_FILENAME} is present but could not be read; no steps ` +
        "can be folded until it parses",
    );
  }
  const entries = (Array.isArray(log["entries"]) ? log["entries"] : []).filter(
    isRecord,
  );

  const mine = entries.filter(
    (entry) => entry["sessionNumber"] === sessionNumber,
  );
  const declared = mine
    .filter((entry) => entry["kind"] === KIND_PLAN_STEP)
    .sort((left, right) => Number(left["stepNumber"]) - Number(right["stepNumber"]));
  if (declared.length === 0) return [];

  // The last status logged against each step. Keyed on the step key where
  // there is one and the number otherwise, because `session log --step 3`
  // is as legitimate as `--step affected` and both name the same row.
  const logged = new Map<string, string>();
  const startedAt = new Map<string, unknown>();
  // At most one step is open, and it is the one most recently logged
  // `in-progress` that has not since moved. Two steps left sitting at
  // `in-progress` is a bookkeeping artifact rather than two steps in flight,
  // so the later one is the open one and the earlier merely says so.
  let openKey: string | null = null;
  for (const entry of mine) {
    if (!isLoggedStep(entry)) continue;
    const key = pyStr(entry["stepKey"]) || pythonStr(entry["stepNumber"]);
    const status = pyStr(entry["status"]);
    if (!status) continue;
    logged.set(key, status);
    if (status === STEP_STATUS_IN_PROGRESS) {
      openKey = key;
      if (!startedAt.has(key)) startedAt.set(key, entry["dateTime"] ?? null);
    } else if (openKey === key) {
      openKey = null;
    }
  }

  return declared.map((step, position) => {
    const key = pyStr(step["stepKey"]) || pythonStr(step["stepNumber"]);
    const status = logged.get(key) ?? STEP_STATUS_PENDING;
    const state = TASK_STATE_OF_STATUS[status] ?? status;
    return {
      position,
      stepId: pyStr(step["stepKey"]) || null,
      intent: pyStr(step["description"]),
      state,
      iconKey: TASK_ICON_OF_STATUS[status] ?? STATUS_NOT_STARTED,
      isOpen: key === openKey,
      startedAt: startedAt.get(key) ?? null,
    };
  });
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
  // Read once per projection, beside the cap and for the same reason: the
  // threshold is the repository's, not a session's.
  const threshold = stalledAfterSeconds(repoRoot);
  const movedAt = lastActivityAt(sessionsDir, repoRoot, view["currentSession"]);

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
      // A plan-sourced row is BY DEFINITION one the ledger has not reached:
      // there is no ledger. `sessionsFromPlan` stamps `not-started` because
      // that is the only status the invariants accept, and the invariants run
      // over the derived view above -- so the projected state is set here,
      // after validation, where a value the ledger may not hold is legal.
      status: source === SOURCE_PLAN ? STATUS_PLANNED : sessionStatus ?? null,
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
        sessionOut["tasks"] = buildTaskRows(sessionsDir, number as number);
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

  // The plan, on every projection rather than only when the ledger is absent.
  // A row here has no run artifacts to fold by definition -- it has never been
  // registered -- so tasks and verification are empty rather than refused, and
  // `iconKey` is the glyph `not-started` already owns. What separates the two
  // states is the row's words.
  const ledgerNumbers = new Set<number>(
    sessionsOut
      .map((s) => s["number"])
      .filter((n): n is number => Number.isInteger(n)),
  );
  // Merged only over a ledger that actually read. The plan already IS the
  // sessions when there is no ledger, and a ledger that is present and
  // unparseable is a fault: answering it with the plan would replace a broken
  // record with a cheerful guess, which is the distinction `ledgerExists`
  // was introduced to keep.
  const planned =
    source === SOURCE_LEDGER && raw !== null
      ? plannedSessions(sessionsDir, ledgerNumbers)
      : [];
  for (const row of planned) {
    sessionsOut.push({
      number: row["number"],
      displayNumber: sessionDisplayNumber(row["number"]),
      title: row["title"] || `Session ${pythonStr(row["number"])}`,
      status: STATUS_PLANNED,
      iconKey: STATUS_NOT_STARTED,
      inFlight: false,
      startedAt: null,
      completedAt: null,
      verificationVerdict: null,
      tasks: [] as unknown[],
      tasksRefused: null,
      verification: null,
      verificationRefused: null,
    });
  }

  // "Is this project finished" is answered here or it is answered wrongly.
  // `derivedView` counts the ledger's rows, which is the true size of the
  // record and NOT the size of the work: a repository whose plan declares
  // more is not complete, however tidy its ledger looks.
  const ledgerTotal = view["totalSessions"];
  const totalSessions =
    typeof ledgerTotal === "number" ? ledgerTotal + planned.length : ledgerTotal ?? null;

  // What registers on the next `session start`, resolved by the rule the
  // lifecycle already states: the session in flight if there is one, and
  // otherwise the lowest-numbered session that has not run. This is NOT
  // `getProgress().nextSession`, which answers the same question over the
  // ledger alone and is used for the ledger's own invariants; the difference
  // is the planned rows, and it is the difference this session exists for.
  const openNumbers = sessionsOut
    .filter(
      (s) =>
        Number.isInteger(s["number"]) &&
        (s["status"] === STATUS_NOT_STARTED || s["status"] === STATUS_PLANNED),
    )
    .map((s) => s["number"] as number)
    .sort((a, b) => a - b);
  const inFlightNumber = sessionsOut.find(
    (s) => s["status"] === STATUS_IN_PROGRESS && Number.isInteger(s["number"]),
  )?.["number"] as number | undefined;
  const nextSession = inFlightNumber ?? openNumbers[0] ?? null;

  return {
    schemaVersion: 1,
    generatedAt: nowIso("microseconds"),
    repository: {
      // Where these sessions came from, so the view can say that nothing has
      // run here rather than implying that it has.
      sessionsSource: source,
      schemaVersionOnDisk: raw?.["schemaVersion"] ?? null,
      totalSessions,
      sessionsCompleted: (view["completedSessions"] as unknown[] | null)?.length ?? 0,
      currentSession: view["currentSession"] ?? null,
      lastActivityAt: movedAt,
      possiblyStalled: possiblyStalled(movedAt, view["currentSession"] ?? null, threshold),
      stalledAfterSeconds: view["currentSession"] ? threshold : null,
      // Counted off the rows rather than off `planned`, so the two ways a row
      // can be planned -- merged over a ledger, or sourced from the plan
      // because there is no ledger -- are counted once each and by one rule.
      plannedSessions: sessionsOut.filter((s) => s["status"] === STATUS_PLANNED)
        .length,
      nextSession,
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

// --- Liveness -----------------------------------------------------------------

/**
 * How long a session's record may sit still before the projection says so.
 *
 * A default rather than a guess: verification rounds routinely take ten
 * minutes, so anything shorter would call every ordinary round a stall, and
 * a liveness signal that cries wolf is one people learn to ignore -- which
 * is the failure mode that matters, because it is silent.
 */
export const DEFAULT_STALLED_AFTER_SECONDS = 1800;

/**
 * When this repository's record last moved.
 *
 * Derived from the timestamps the framework already writes -- every activity
 * log entry is stamped and every verification round carries `recorded_at` --
 * rather than stamped again beside them. A second statement of "when did
 * this last move" is a second thing to keep in sync, and the answer is
 * already on disk twice over.
 *
 * The agent writes neither this nor the judgment below, which is the
 * property worth protecting: an engine that reports its own liveness reports
 * it right up until the moment it cannot.
 */
export function lastActivityAt(
  sessionsDir: string,
  repoRoot: string | null,
  sessionNumber: unknown,
): string | null {
  const stamps: string[] = [];
  const log = readActivityLog(sessionsDir);
  const entries = log && Array.isArray(log["entries"]) ? log["entries"] : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const at = entry["dateTime"];
    if (typeof at === "string" && at) stamps.push(at);
  }
  if (repoRoot !== null && Number.isInteger(sessionNumber)) {
    try {
      for (const round of readRounds(repoRoot, sessionNumber as number)) {
        const at = round["recorded_at"];
        if (typeof at === "string" && at) stamps.push(at);
      }
    } catch {
      // An unreadable ledger is `verification_clean`'s to refuse. Liveness
      // does not get to fail a projection over it.
    }
  }
  if (stamps.length === 0) return null;
  // String comparison, because every writer here emits ISO-8601 with an
  // offset and lexical order is chronological within one. Parsing to compare
  // would introduce a timezone question the records do not have.
  return stamps.reduce((latest, at) => (at > latest ? at : latest));
}

/**
 * Whether the in-flight session's record has stopped moving.
 *
 * False whenever nothing is in flight: a repository between sessions is not
 * stalled, it is finished with the last one. And false when nothing has been
 * written at all, because "no activity yet" and "activity that stopped" are
 * different states and only the second is worth a row.
 */
export function possiblyStalled(
  at: string | null,
  currentSession: unknown,
  thresholdSeconds: number,
  now: Date = new Date(),
): boolean {
  if (currentSession === null || currentSession === undefined) return false;
  if (at === null) return false;
  const moved = Date.parse(at);
  if (!Number.isFinite(moved)) return false;
  return (now.getTime() - moved) / 1000 > thresholdSeconds;
}

/**
 * The threshold this repository judges a stall against, in seconds.
 *
 * Configurable because a repository whose sessions are minutes long and one
 * whose rounds take ten of them cannot share a number, and a signal tuned
 * for neither is one nobody reads.
 */
export function stalledAfterSeconds(repoRoot: string): number {
  try {
    const config = loadConfig(undefined, repoRoot) as Record<string, unknown>;
    const declared = (config["verification"] as Record<string, unknown> | undefined)
      ?.["stalled_after_seconds"];
    if (typeof declared === "number" && Number.isFinite(declared) && declared > 0) {
      return Math.trunc(declared);
    }
  } catch {
    // An unreadable config gets the default, never a failed projection.
  }
  return DEFAULT_STALLED_AFTER_SECONDS;
}
