// Measure real Copilot-seat spend from the CLI's local SQLite usage store.
//
// The Copilot CLI reports no dollar cost at dispatch time, but it keeps a
// per-turn usage store at `~/.copilot/session-store.db`. This module prices a
// set of CLI conversation ids against it:
//
//     SUM(assistant_usage_events.total_nano_aiu) / 1e9 = AI credits
//     credits / 100 = US dollars
//
// Attribution is by conversation id, never by wall clock -- a clock window
// cannot attribute at all. The store is opened read-only and nothing else:
// SQLite's `immutable=1` skips the WAL and has been shown to undercount a live
// store by ~7%, so it is not used and the WAL is read.
//
// Statuses (closed vocabulary):
//
// - `measured`   -- every requested id was found; the number is exact.
// - `floor`      -- a real number that is known to be incomplete: some ids
//                   were missing from the store, or the measurement includes
//                   the caller's own still-running conversation (a session
//                   cannot measure itself -- its closing turns are not in the
//                   store yet).
// - `unmeasured` -- no number at all (no store, unrecognized schema, or no
//                   requested id present). `credits` is `null`; an absent
//                   measurement is never 0.0.
//
// `node:sqlite` rather than a bundled driver: session 22 measured it present
// in the extension host, which is what made the native path available at all.
// A JavaScript SQLite would have had to skip the WAL and carry that ~7%
// undercount as a known limitation.

import type { DatabaseSync } from "node:sqlite";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export const NANO_AIU_PER_CREDIT = 1_000_000_000;
export const CREDITS_PER_USD = 100.0;

export const STATUS_MEASURED = "measured";
export const STATUS_FLOOR = "floor";
export const STATUS_UNMEASURED = "unmeasured";
export const STATUSES = [STATUS_MEASURED, STATUS_FLOOR, STATUS_UNMEASURED] as const;

/**
 * Store schema versions this reader has been verified against. Anything else
 * is refused (unmeasured) rather than assumed compatible -- the columns belong
 * to a private store and can change without notice.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [6];

const USAGE_TABLE = "assistant_usage_events";
const SESSIONS_TABLE = "sessions";
const REQUIRED_USAGE_COLUMNS: readonly string[] = ["session_id", "total_nano_aiu"];

const DEFAULT_STORE_RELPATH = join(".copilot", "session-store.db");

/**
 * Exported by the Copilot CLI into every child process: the id of the
 * conversation that spawned it. Presence in a measured set makes the result a
 * floor (self-measurement).
 */
export const SEAT_SESSION_ID_ENV = "COPILOT_AGENT_SESSION_ID";

/** SQLite's parameter ceiling is 999 on older builds; chunk well under it. */
const ID_CHUNK = 400;

/**
 * One measurement. `credits`/`usd` are null iff unmeasured -- never 0.0 to
 * mean "could not tell"; that distinction is the point.
 */
export interface SeatCost {
  readonly status: string;
  readonly credits: number | null;
  readonly event_count: number;
  readonly session_ids: readonly string[];
  readonly measured_session_ids: readonly string[];
  readonly missing_session_ids: readonly string[];
  readonly reason: string | null;
}

export function usd(cost: SeatCost): number | null {
  if (cost.credits === null) return null;
  return cost.credits / CREDITS_PER_USD;
}

export function toDict(cost: SeatCost): Record<string, unknown> {
  return {
    status: cost.status,
    credits: cost.credits,
    usd: usd(cost),
    event_count: cost.event_count,
    session_ids: [...cost.session_ids],
    measured_session_ids: [...cost.measured_session_ids],
    missing_session_ids: [...cost.missing_session_ids],
    reason: cost.reason,
  };
}

function seatCost(fields: Partial<SeatCost> & { status: string }): SeatCost {
  return {
    credits: null,
    event_count: 0,
    session_ids: [],
    measured_session_ids: [],
    missing_session_ids: [],
    reason: null,
    ...fields,
  };
}

/** Python's `Path(...).expanduser()`: a leading `~` is the home directory. */
function expandUser(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Locate the usage store, or null. `explicit` wins; otherwise
 * `<home>/.copilot/session-store.db`.
 */
export function resolveStorePath(
  explicit?: string | null,
  options: { home?: string | null } = {},
): string | null {
  if (explicit) {
    const candidate = expandUser(explicit);
    return isFile(candidate) ? absolute(candidate) : null;
  }
  const base = options.home ? expandUser(options.home) : homedir();
  const candidate = join(base, DEFAULT_STORE_RELPATH);
  return isFile(candidate) ? absolute(candidate) : null;
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(path);
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * `node:sqlite`, fetched rather than imported.
 *
 * It is a `node:`-only builtin -- absent from `module.builtinModules` -- so a
 * static import is a specifier that several tools resolve by dropping the
 * prefix and then looking for a package called `sqlite`. `getBuiltinModule` is
 * the API Node added for exactly this: it answers with the real module and is
 * invisible to static analysis, so nothing downstream has to be told that a
 * builtin is a builtin. The TYPE still comes from a type-only import, which is
 * erased before any of that matters.
 */
type SqliteModule = { DatabaseSync: new (path: string, options?: object) => DatabaseSync };

function sqlite(): SqliteModule {
  const module = process.getBuiltinModule("node:sqlite");
  if (module === undefined) {
    throw new Error(
      "this Node build has no node:sqlite, so the seat's usage store cannot " +
        "be read. The package declares a floor that has it.",
    );
  }
  return module as SqliteModule;
}

/**
 * Read-only, and the WAL is read.
 *
 * `readOnly` is `mode=ro`: the store is another program's and this reader has
 * no business writing to it, but it must still see the write-ahead log, which
 * is where a live seat's most recent turns are. `immutable` would skip the WAL
 * and has been shown to undercount a live store by ~7%.
 */
function connect(path: string): DatabaseSync {
  const { DatabaseSync: Database } = sqlite();
  return new Database(path, { readOnly: true });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Python renders a tuple of one int as `(6,)` and a list of str as `['a']`. */
function renderVersions(versions: readonly number[]): string {
  const body = versions.map((version) => String(version)).join(", ");
  return versions.length === 1 ? `(${body},)` : `(${body})`;
}

function renderColumns(columns: readonly string[]): string {
  return `[${columns.map((column) => `'${column}'`).join(", ")}]`;
}

/**
 * Look at the store before trusting a number out of it: openable, a supported
 * `schema_version`, the usage table present with the columns actually read.
 */
export function checkStoreShape(path: string | null): [boolean, string | null] {
  if (path === null) return [false, "no local usage store found"];
  let conn: DatabaseSync;
  try {
    conn = connect(path);
  } catch (error: unknown) {
    return [false, `store could not be opened: ${message(error)}`];
  }
  try {
    let row: unknown;
    try {
      row = conn.prepare("SELECT version FROM schema_version").get();
    } catch (error: unknown) {
      return [false, `store has no readable schema_version: ${message(error)}`];
    }
    let version: number | null = null;
    if (row !== undefined && row !== null) {
      const raw = (row as Record<string, unknown>)["version"];
      const parsed = typeof raw === "bigint" ? Number(raw) : Number(raw);
      version = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }
    if (version === null) return [false, "store reported no usable schema_version"];
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
      return [
        false,
        `store schema_version ${version} is not one this reader has ` +
          `been verified against ${renderVersions(SUPPORTED_SCHEMA_VERSIONS)}; refusing ` +
          "to price against a shape it may no longer have",
      ];
    }
    let columns: Set<string>;
    try {
      columns = new Set(
        conn
          .prepare(`PRAGMA table_info(${USAGE_TABLE})`)
          .all()
          .map((info) => String((info as Record<string, unknown>)["name"])),
      );
    } catch (error: unknown) {
      return [false, `store has no readable ${USAGE_TABLE}: ${message(error)}`];
    }
    if (columns.size === 0) return [false, `store has no ${USAGE_TABLE} table`];
    const missing = REQUIRED_USAGE_COLUMNS.filter((column) => !columns.has(column)).sort();
    if (missing.length > 0) {
      return [false, `${USAGE_TABLE} is missing column(s) ${renderColumns(missing)}`];
    }
    return [true, null];
  } finally {
    conn.close();
  }
}

function* chunks<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let start = 0; start < items.length; start += size) {
    yield items.slice(start, start + size);
  }
}

/** The requested ids, trimmed, de-duplicated, in the order first seen. */
export function normalizeIds(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const items = typeof value === "string" ? [value] : (value as unknown[]);
  const seen: string[] = [];
  for (const item of items) {
    if (item === null || item === undefined) continue;
    const text = String(item).trim();
    if (text && !seen.includes(text)) seen.push(text);
  }
  return seen;
}

function asNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

/**
 * Price the given CLI conversation ids against the local usage store.
 *
 * A conversation present in `sessions` with no usage rows is a genuine zero,
 * not an absence. An id the store does not know at all makes the result a
 * `floor` (the spend is real but incomplete), as does measuring the caller's
 * own live conversation (`COPILOT_AGENT_SESSION_ID`).
 */
export function measureConversations(
  conversationIds: unknown,
  options: {
    storePath?: string | null;
    home?: string | null;
    env?: NodeJS.ProcessEnv | null;
  } = {},
): SeatCost {
  const ids = normalizeIds(conversationIds);
  if (ids.length === 0) {
    return seatCost({
      status: STATUS_UNMEASURED,
      reason: "no conversation ids to measure",
    });
  }

  const path = resolveStorePath(options.storePath ?? null, { home: options.home ?? null });
  const [ok, reason] = checkStoreShape(path);
  if (!ok) {
    return seatCost({
      status: STATUS_UNMEASURED,
      session_ids: ids,
      missing_session_ids: ids,
      reason,
    });
  }

  let totalNano = 0;
  let eventCount = 0;
  const known = new Set<string>();
  const conn = connect(path!);
  try {
    for (const chunk of chunks(ids, ID_CHUNK)) {
      const marks = chunk.map(() => "?").join(",");
      const rows = conn
        .prepare(
          `SELECT session_id, COALESCE(SUM(total_nano_aiu), 0) AS nano, ` +
            `COUNT(*) AS events FROM ${USAGE_TABLE} ` +
            `WHERE session_id IN (${marks}) GROUP BY session_id`,
        )
        .all(...chunk);
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        totalNano += asNumber(record["nano"]);
        eventCount += asNumber(record["events"]);
        known.add(String(record["session_id"]));
      }
      let present: unknown[] = [];
      try {
        present = conn
          .prepare(`SELECT id FROM ${SESSIONS_TABLE} WHERE id IN (${marks})`)
          .all(...chunk);
      } catch {
        // A store without the sessions table still prices its usage rows; a
        // conversation with no usage is what this second query is for.
        present = [];
      }
      for (const row of present) {
        known.add(String((row as Record<string, unknown>)["id"]));
      }
    }
  } finally {
    conn.close();
  }

  const measured = ids.filter((id) => known.has(id));
  const missing = ids.filter((id) => !known.has(id));
  if (measured.length === 0) {
    return seatCost({
      status: STATUS_UNMEASURED,
      session_ids: ids,
      missing_session_ids: missing,
      reason: "none of the requested conversation ids are in the store",
    });
  }

  const credits = totalNano / NANO_AIU_PER_CREDIT;
  const environ = options.env ?? process.env;
  const ownId = (environ[SEAT_SESSION_ID_ENV] ?? "").trim();
  const selfMeasured = Boolean(ownId) && measured.includes(ownId);

  if (missing.length > 0 || selfMeasured) {
    const reasons: string[] = [];
    if (missing.length > 0) {
      reasons.push(
        `${missing.length} of ${ids.length} conversation id(s) not in the store`,
      );
    }
    if (selfMeasured) {
      reasons.push(
        "includes the caller's own live conversation, whose closing " +
          "turns are not in the store yet",
      );
    }
    return seatCost({
      status: STATUS_FLOOR,
      credits,
      event_count: eventCount,
      session_ids: ids,
      measured_session_ids: measured,
      missing_session_ids: missing,
      reason: reasons.join("; "),
    });
  }

  return seatCost({
    status: STATUS_MEASURED,
    credits,
    event_count: eventCount,
    session_ids: ids,
    measured_session_ids: measured,
  });
}
