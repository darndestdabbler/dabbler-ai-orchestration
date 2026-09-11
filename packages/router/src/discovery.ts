// Model discovery on the direct-API path: enumeration, freshness, drift.
//
// **A role never depends on the model names it happens to list**, so
// something has to say what currently exists. Each vendor publishes a models
// endpoint and the framework reads it; the seat states its own list over its
// protocol, which `transports/copilot.ts` reads.
//
// **Enumeration is free on every surface** -- a metadata request here, a
// protocol reply on the seat, and neither bills a token. That is the whole
// reason the default cadence is 24 hours: freshness costs nothing, so the
// knob is a preference rather than a budget control. Nothing in this path
// can dispatch to a model, at any age, which is what makes "is a refresh
// expensive" a question nobody has to answer again.
//
// Three rules shape everything below.
//
// **A field a vendor does not report is unknown, never unsupported.**
// Vendors report unequally -- one returns token limits and generation
// methods, another a display name, a third little beyond an identifier -- and
// a hard capability filter would disqualify every model from the quietest
// vendor and end cross-vendor verification by accident. The catalog records
// what a source stated and nothing else, and nothing here filters a
// candidate on metadata.
//
// **The framework reports the gap between the record and the roles; it does
// not close it silently.** Enumeration keeps the record fresh on its own,
// but ranking one model above another is a judgment metadata cannot make:
// newest is not most capable, and no reported field separates a flagship
// from a mini. So the gap comes out as a diff and the diff names the
// invocation that acts on it.
//
// **Refresh never happens inside a session.** A session that changes its own
// verifier pool while running has edited the conditions of its own review,
// so `enumerate` refuses while any session is in flight. Staleness, by
// contrast, only ever warns: a stale record with confirmed entries still
// verifies correctly, and turning a maintenance signal into an outage is how
// maintenance signals get suppressed.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  SOURCE_API,
  TRANSPORT_API,
  TRANSPORT_SEAT,
  blockFor,
  catalogNow,
  catalogPresent,
  currentCatalogPath,
  foldListing,
  readCatalog,
  writeBlock,
  type CatalogModel,
  type CatalogScope,
  type TransportBlock,
} from "./catalog.ts";
import { truthy, type RouterConfig } from "./config.ts";
import { STATE_FILENAME, resolveSessionsDir } from "./evidence.ts";
import {
  HttpStatusError,
  HttpTimeoutError,
  httpGetJson,
} from "./transports/api.ts";
import { resolveSecret } from "./secretResolver.ts";
import {
  PLATFORM_AI_CREDITS,
  SEAT_COST_COMMAND,
  costUnit,
} from "./seatCost.ts";
import {
  enumerateSeatModels,
  readSeatIdentity,
  recordSeatEnumeration,
  seatBlock,
  type SeatEnumeration,
  type SeatIdentity,
} from "./transports/copilot.ts";

export const RECORD_SOURCE = "vendor-enumeration";

// Provider is first-party here, unlike the seat, where it can only be
// guessed from a name prefix. The stamp travels with the entry so the two
// records are never read as equally authoritative about the field a
// same-provider exclusion turns on.
export const PROVIDER_SOURCE_ENUMERATION = "vendor-enumeration";

export const DRIFT_COMMAND = "dabbler discovery drift";
export const SEAT_REFRESH_COMMAND = "dabbler copilot refresh";

export const DEFAULT_MAX_AGE_HOURS = 24.0;

/**
 * The one dated record, and the one row an operator reads.
 *
 * It was three -- `api-enumeration`, `seat-catalog` and `seat-list` -- and
 * each was named for its implementation rather than for what it holds. Two
 * of them were two dates on one file, and the third was a file that never
 * exists on a machine without provider keys, so it read stale forever on
 * every seat-only laptop. There is one catalog now, so there is one row.
 */
export const RECORD_CATALOG = "ai-model-catalog";

/** The one verb that brings it up to date, whatever transports are here. */
export const CATALOG_REFRESH_COMMAND = "dabbler discovery refresh";

/**
 * What re-reading the catalog costs, said before anybody asks for one.
 *
 * One entry, because there is one refresh and one answer: nothing. The
 * sentence stays because the question keeps being asked -- four engines in a
 * row have reasoned their way to "finding out what exists is expensive" --
 * and because a pane that said it itself would be a second statement of
 * something this module already knows.
 */
export const REFRESH_COST: Readonly<Record<string, string>> = {
  [RECORD_CATALOG]:
    "Nothing. One metadata request per enabled vendor, and the seat states " +
    "its own models in the reply to opening a conversation -- no prompt is " +
    "sent on either path and no token is billed. What a session actually " +
    `spends on a seat is billed in ${costUnit(PLATFORM_AI_CREDITS)} per ` +
    `token, which \`${SEAT_COST_COMMAND}\` measures, and reading this list ` +
    "is not part of it.",
};

// --- What a failed enumeration is called -------------------------------------
//
// One vocabulary, written by both routers. The name of the exception is the
// name of whichever HTTP library raised it -- `httpx` on the Python side,
// `fetch` here -- so recording it directly put a different word in the same
// record for the same event, on a field whose whole job is to say what
// happened. These terms belong to the framework instead, and the mapping
// below is the one place this router decides which term applies.
//
// The list is CLOSED. A failure nothing maps becomes `unknown-error` rather
// than contributing its class name, because an open mapping breaks the
// moment a library throws something neither side anticipated -- and it
// breaks in a committed file, silently, on whichever machine hit it first.

export const ERROR_NO_API_KEY = "no-api-key";
export const ERROR_PROVIDER_DISABLED = "provider-disabled";
export const ERROR_PROVIDER_UNSUPPORTED = "no-enumeration-adapter";

/**
 * The request outlived the ceiling the provider block configured. The remedy
 * is a bigger ceiling or a slower expectation.
 */
export const ERROR_TIMEOUT = "timeout";
/**
 * The endpoint was never reached: DNS, refused, TLS, no route. Kept apart
 * from a timeout because the remedy is different -- a URL, a proxy, a
 * firewall -- and folding the two together would make the field say less
 * than the reader needs to act.
 */
export const ERROR_NETWORK = "network-error";
/** The vendor answered, with a 4xx or 5xx. */
export const ERROR_HTTP_STATUS = "http-error";
/** The vendor answered with something this router could not read as JSON. */
export const ERROR_PARSE = "parse-error";
/** Anything the mapping does not name. */
export const ERROR_UNKNOWN = "unknown-error";

/** Every value `last_error` may hold, for a reader and for a test. */
export const ENUMERATION_ERRORS: readonly string[] = [
  ERROR_NO_API_KEY,
  ERROR_PROVIDER_DISABLED,
  ERROR_PROVIDER_UNSUPPORTED,
  ERROR_TIMEOUT,
  ERROR_NETWORK,
  ERROR_HTTP_STATUS,
  ERROR_PARSE,
  ERROR_UNKNOWN,
];

// A vendor that paginated forever would turn a free metadata call into an
// unbounded loop; every endpoint here returns its whole catalog well inside
// one page at this size.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const TIMESTAMP_FORMAT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A string off the wire or `null`; anything else is not a string and must
 * not become one by coercion.
 */
function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** A positive count off the wire, or `null` for unknown. */
function optionalInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.trunc(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item !== "");
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * `cfg.get("enabled", True)` under Python's truthiness.
 *
 * `??` is not this: a key written as `enabled:` with no value loads as
 * null, which Python reads as off and `?? true` would read as on.
 */
function enabledFlag(cfg: Record<string, unknown>): boolean {
  return truthy("enabled" in cfg ? cfg["enabled"] : true);
}

/** A malformed record. Python raises `ValueError` at each of these. */
export class RecordError extends Error {}

// --- The record -------------------------------------------------------------

/**
 * One model a vendor reported, with everything it did not report absent.
 *
 * `null` and `[]` mean the vendor said nothing, which is unknown. They never
 * mean the model lacks the capability, and no code path may read them that
 * way.
 */
export interface ApiModelEntry {
  readonly id: string;
  readonly provider: string;
  readonly provider_source: string;
  readonly display_name: string | null;
  readonly created_at: string | null;
  readonly max_context_tokens: number | null;
  readonly max_output_tokens: number | null;
  readonly capabilities: readonly string[];
  /** When a vendor last returned this model: its last-seen date. */
  readonly enumerated_at: string | null;
  /**
   * When an enumeration the vendor ANSWERED stopped returning this model, or
   * null while it is still served.
   *
   * Marked, never deleted. A vendor's answer used to replace what the record
   * held for it, so one bad enumeration could remove the only verifier a
   * role had and leave nothing able to say the model was ever there. The
   * entry stays, keeps its last-seen date, and stops being offered.
   */
  readonly retired_at: string | null;
  /**
   * Keys this version does not model, in file order, so a writer never
   * silently drops what a future version wrote.
   */
  readonly raw: Record<string, unknown>;
}

// --- Enumeration ------------------------------------------------------------

export interface ProviderResult {
  readonly provider: string;
  readonly entries: readonly ApiModelEntry[];
  readonly error: string | null;
}

export function resultOk(result: ProviderResult): boolean {
  return result.error === null;
}

/** The GET an adapter is handed, so a test can answer without a network. */
export type HttpGet = (
  url: string,
  headers: Record<string, string>,
  params: Record<string, string | number> | null,
  timeout: number,
) => Promise<Record<string, unknown>>;

const httpGet: HttpGet = (url, headers, params, timeout) => {
  const query =
    params === null
      ? ""
      : "?" +
        Object.entries(params)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          .join("&");
  return httpGetJson(url + query, headers, timeout);
};

/**
 * The models endpoint's base, derived from the chat endpoint the provider
 * block already names.
 *
 * A provider declares one base URL and it points at the operation the router
 * dispatches with; enumeration is a sibling of that operation, so a trailing
 * operation segment is dropped rather than a second URL being configured and
 * left to drift out of agreement with the first.
 */
function modelsBase(baseUrl: unknown, fallback: string): string {
  const base = String(baseUrl || fallback).replace(/\/+$/, "");
  for (const suffix of ["/messages", "/responses", "/chat/completions"]) {
    if (base.endsWith(suffix)) return base.slice(0, base.length - suffix.length);
  }
  return base;
}

function epochToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString().replace(/\.\d+Z$/, "Z");
}

function freshEntry(fields: Partial<ApiModelEntry> & { id: string; provider: string }): ApiModelEntry {
  return {
    provider_source: PROVIDER_SOURCE_ENUMERATION,
    display_name: null,
    created_at: null,
    // A model the vendor just returned is served, whatever the record said
    // before: an entry that comes back has its mark cleared by the merge.
    retired_at: null,
    max_context_tokens: null,
    max_output_tokens: null,
    capabilities: [],
    enumerated_at: null,
    raw: {},
    ...fields,
  };
}

type Adapter = (
  cfg: Record<string, unknown>,
  apiKey: string,
  get: HttpGet,
  timeout: number,
) => Promise<ApiModelEntry[]>;

const enumerateAnthropic: Adapter = async (cfg, apiKey, get, timeout) => {
  const base = modelsBase(cfg["base_url"], "https://api.anthropic.com/v1");
  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": String(cfg["api_version"] ?? "2023-06-01"),
  };
  const entries: ApiModelEntry[] = [];
  let params: Record<string, string | number> = { limit: PAGE_SIZE };
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await get(`${base}/models`, headers, params, timeout);
    for (const item of Array.isArray(payload["data"]) ? payload["data"] : []) {
      const modelId = optionalString(record(item)["id"]);
      if (!modelId) continue;
      entries.push(
        freshEntry({
          id: modelId,
          provider: "anthropic",
          display_name: optionalString(record(item)["display_name"]),
          created_at: optionalString(record(item)["created_at"]),
        }),
      );
    }
    const lastId = optionalString(payload["last_id"]);
    if (!payload["has_more"] || !lastId) break;
    params = { limit: PAGE_SIZE, after_id: lastId };
  }
  return entries;
};

const enumerateOpenai: Adapter = async (cfg, apiKey, get, timeout) => {
  const base = modelsBase(cfg["base_url"], "https://api.openai.com/v1");
  const payload = await get(
    `${base}/models`,
    { Authorization: `Bearer ${apiKey}` },
    null,
    timeout,
  );
  const entries: ApiModelEntry[] = [];
  for (const item of Array.isArray(payload["data"]) ? payload["data"] : []) {
    const modelId = optionalString(record(item)["id"]);
    if (!modelId) continue;
    entries.push(
      freshEntry({
        id: modelId,
        provider: "openai",
        created_at: epochToIso(record(item)["created"]),
      }),
    );
  }
  return entries;
};

const enumerateGoogle: Adapter = async (cfg, apiKey, get, timeout) => {
  const base = modelsBase(
    cfg["base_url"],
    "https://generativelanguage.googleapis.com/v1beta",
  );
  // The key travels in a header and never the query string: an error renders
  // the full URL into operator-visible output, and a `?key=` URL would leak
  // a live credential into a log.
  const headers = { "x-goog-api-key": apiKey };
  const entries: ApiModelEntry[] = [];
  let params: Record<string, string | number> = { pageSize: PAGE_SIZE };
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await get(`${base}/models`, headers, params, timeout);
    for (const item of Array.isArray(payload["models"]) ? payload["models"] : []) {
      const name = optionalString(record(item)["name"]);
      if (!name) continue;
      entries.push(
        freshEntry({
          id: name.startsWith("models/") ? name.slice("models/".length) : name,
          provider: "google",
          display_name: optionalString(record(item)["displayName"]),
          max_context_tokens: optionalInt(record(item)["inputTokenLimit"]),
          max_output_tokens: optionalInt(record(item)["outputTokenLimit"]),
          capabilities: stringList(record(item)["supportedGenerationMethods"]),
        }),
      );
    }
    const token = optionalString(payload["nextPageToken"]);
    if (!token) break;
    params = { pageSize: PAGE_SIZE, pageToken: token };
  }
  return entries;
};

const ADAPTERS: Readonly<Record<string, Adapter>> = {
  anthropic: enumerateAnthropic,
  openai: enumerateOpenai,
  google: enumerateGoogle,
};

/**
 * Which vocabulary term an enumeration failure is recorded under.
 *
 * Read on the failure's SHAPE and never on its message: a vendor error body
 * can echo the request headers back, and the result is written to a
 * committed record.
 *
 * The two classes `transports/api` raises deliberately carry the two
 * distinctions the field needs, so they are matched first. Below them Node
 * reports transport failures as a `TypeError` whose `cause` holds the real
 * syscall error -- `ECONNREFUSED`, `ENOTFOUND`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`
 * -- which is why the cause is unwrapped rather than the outer class trusted.
 * Everything else falls to `unknown-error` by design: a bucket that guessed
 * would be a committed record making up what happened.
 */
export function classifyEnumerationError(error: unknown): string {
  if (error instanceof HttpTimeoutError) return ERROR_TIMEOUT;
  if (error instanceof HttpStatusError) return ERROR_HTTP_STATUS;
  // `AbortSignal.timeout` fires a `TimeoutError` that never reached the
  // wrapper -- a caller may pass its own signal.
  if (error instanceof Error && error.name === "TimeoutError") return ERROR_TIMEOUT;
  // A body that could not be read as JSON. `Response.json()` rejects with a
  // SyntaxError, and a mis-encoded body with a TypeError from the decoder.
  if (error instanceof SyntaxError) return ERROR_PARSE;
  if (error instanceof Error && isNetworkFailure(error)) return ERROR_NETWORK;
  return ERROR_UNKNOWN;
}

/**
 * A `fetch` rejection that never got an answer.
 *
 * Node wraps the syscall failure in a `TypeError` with `cause` set, so the
 * chain is walked for a `code`. The message is a last resort and is matched
 * only against the one phrase Node uses for this, never against a vendor's
 * text -- nothing a vendor sends reaches here.
 */
function isNetworkFailure(error: Error): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string" && code !== "") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return error.message.toLowerCase().includes("fetch failed");
}


/**
 * Read one vendor's models endpoint. Never throws for an operational failure
 * -- the failure is the result, and the merge decides what it does to the
 * record.
 */
export async function enumerateProvider(
  config: RouterConfig,
  name: string,
  get: HttpGet = httpGet,
): Promise<ProviderResult> {
  const cfg = record(config["providers"])[name];
  if (!isRecord(cfg) || !enabledFlag(cfg)) {
    return { provider: name, entries: [], error: ERROR_PROVIDER_DISABLED };
  }
  const adapter = ADAPTERS[name];
  if (adapter === undefined) {
    return { provider: name, entries: [], error: ERROR_PROVIDER_UNSUPPORTED };
  }
  const apiKey = resolveSecret(String(cfg["api_key_env"] ?? ""));
  if (!apiKey) return { provider: name, entries: [], error: ERROR_NO_API_KEY };
  try {
    const entries = await adapter(
      cfg,
      apiKey,
      get,
      Number(cfg["timeout_seconds"] ?? 60),
    );
    return { provider: name, entries, error: null };
  } catch (error) {
    return { provider: name, entries: [], error: classifyEnumerationError(error) };
  }
}

export async function enumerateAll(
  config: RouterConfig,
  providers: readonly string[] | null = null,
  get: HttpGet = httpGet,
): Promise<ProviderResult[]> {
  const names =
    providers && providers.length > 0
      ? [...providers]
      : Object.keys(record(config["providers"])).sort();
  const results: ProviderResult[] = [];
  for (const name of names) {
    results.push(await enumerateProvider(config, name, get));
  }
  return results;
}

/**
 * Which providers this machine holds a key for.
 *
 * The scope an `api` block was read for. A provider whose endpoint timed out
 * is still in scope -- the key is present and the block is this machine's --
 * while one with no key, or one this build cannot enumerate, is not part of
 * what was asked.
 */
export function apiScope(results: readonly ProviderResult[]): CatalogScope {
  const absent: ReadonlySet<string> = new Set([
    ERROR_NO_API_KEY,
    ERROR_PROVIDER_DISABLED,
    ERROR_PROVIDER_UNSUPPORTED,
  ]);
  const providers = results
    .filter((result) => result.error === null || !absent.has(result.error))
    .map((result) => result.provider)
    .sort();
  return { providers };
}

/**
 * One vendor model as the catalog records it.
 *
 * No vendor states a cost or a price band in the metadata this enumeration
 * reads, so both are null and stay null: the catalog repeats what a source
 * said and holds no opinion where the source was silent.
 */
export function apiCatalogModel(entry: ApiModelEntry, at: string): CatalogModel {
  return {
    id: entry.id,
    provider: entry.provider === "" ? null : entry.provider,
    provider_source: entry.provider_source,
    display_name: entry.display_name,
    enabled: true,
    price_category: null,
    cost: null,
    listed_at: entry.enumerated_at ?? at,
  };
}

/**
 * The vendor enumeration as the catalog's `api` block, or `null` when no
 * vendor answered.
 *
 * A vendor that answered is authoritative about its own models and nobody
 * else's, so what a vendor that failed had stands: its models stay listed
 * rather than being retired by an outage at the other end. No vendor
 * answering at all writes no block, because that is a machine that read
 * nothing rather than a machine whose models are gone.
 */
export function apiCatalogBlock(
  results: readonly ProviderResult[],
  previous: TransportBlock | null,
  at: string,
): TransportBlock | null {
  const answered = new Set(results.filter(resultOk).map((result) => result.provider));
  if (answered.size === 0) return null;
  const listing: CatalogModel[] = [
    ...(previous?.models ?? []).filter((entry) => !answered.has(entry.provider ?? "")),
    ...results
      .filter(resultOk)
      .flatMap((result) => result.entries.map((entry) => apiCatalogModel(entry, at))),
  ];
  const folded = foldListing(previous, listing, at);
  return {
    refreshed_at: at,
    source: SOURCE_API,
    scope: apiScope(results),
    models: folded.models,
    retired: folded.retired,
  };
}

/**
 * Write what the vendors answered into this machine's catalog.
 *
 * The previous block is read for the scope this read was taken under, so a
 * block recorded for another key set is folded onto nothing rather than
 * having another machine's models retired into it.
 */
export function recordApiEnumeration(
  results: readonly ProviderResult[],
  at: string = catalogNow(),
): TransportBlock | null {
  const scope = apiScope(results);
  const previous = blockFor(readCatalog(), TRANSPORT_API, scope);
  const block = apiCatalogBlock(results, previous, at);
  if (block !== null) writeBlock(TRANSPORT_API, block, { at });
  return block;
}

// --- Configuration ----------------------------------------------------------

export interface DiscoverySettings {
  readonly key_set_id: string;
  readonly max_age_hours: number;
}

export function discoverySettings(config: RouterConfig): DiscoverySettings {
  const block = record(config["discovery"]);
  return {
    key_set_id: String(block["key_set_id"] || "default"),
    max_age_hours:
      "max_age_hours" in block ? Number(block["max_age_hours"]) : DEFAULT_MAX_AGE_HOURS,
  };
}

// --- Freshness --------------------------------------------------------------

const ISO_LOOSE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?([+-]\d{2}:?\d{2})?$/;

/**
 * A recorded timestamp as epoch milliseconds, or `null`.
 *
 * The strict `%Y-%m-%dT%H:%M:%SZ` spelling first, as Python tries it; then
 * the ISO-8601 subset `datetime.fromisoformat` accepts, with `Z` read as
 * `+00:00`. A naive value is UTC, because every writer here stamps UTC.
 */
export function parseTimestamp(value: unknown): number | null {
  const text = optionalString(value);
  if (text === null) return null;
  const strict = TIMESTAMP_FORMAT.exec(text);
  if (strict !== null) {
    return Date.UTC(
      Number(strict[1]), Number(strict[2]) - 1, Number(strict[3]),
      Number(strict[4]), Number(strict[5]), Number(strict[6]),
    );
  }
  const loose = ISO_LOOSE.exec(text.split("Z").join("+00:00"));
  if (loose === null) return null;
  const micro = (loose[7] ?? "").padEnd(6, "0");
  const utc = Date.UTC(
    Number(loose[1]), Number(loose[2]) - 1, Number(loose[3]),
    Number(loose[4] ?? 0), Number(loose[5] ?? 0), Number(loose[6] ?? 0),
    Math.trunc(Number(micro) / 1000),
  );
  const offset = loose[8];
  if (offset === undefined) return utc;
  const sign = offset.startsWith("-") ? -1 : 1;
  const digits = offset.slice(1).split(":").join("");
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
  return utc - sign * minutes * 60_000;
}

export interface FreshnessRow {
  readonly record: string;
  readonly path: string;
  readonly threshold_hours: number;
  readonly command: string;
  readonly present: boolean;
  readonly dated_at: string | null;
  readonly age_hours: number | null;
  /**
   * Per-vendor problems the record-level date cannot express. A record is
   * only as current as its stalest enabled vendor, and one vendor's success
   * must never date the whole file.
   */
  readonly notes: readonly string[];
}

/**
 * Absent, undated, overdue and partial are all stale, because all four mean
 * the same thing to a reader: the record does not currently establish what
 * exists.
 */
export function isStale(row: FreshnessRow): boolean {
  return (
    !row.present ||
    row.age_hours === null ||
    row.age_hours > row.threshold_hours ||
    row.notes.length > 0
  );
}

/** Python's `f"{value:.0f}"`: round half to even, and keep a signed zero. */
function fixed0(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const floor = Math.floor(value);
  const remainder = value - floor;
  let rounded: number;
  if (remainder > 0.5) rounded = floor + 1;
  else if (remainder < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded === 0 && value < 0 ? "-0" : String(rounded);
}

/** Python's `repr` of a string or None, for the undated-record message. */
function repr(value: string | null): string {
  return value === null ? "None" : `'${value.split("\\").join("\\\\").split("'").join("\\'")}'`;
}

export function freshnessMessage(row: FreshnessRow): string {
  let head: string;
  if (!row.present) {
    // What is LOST, not just what is missing. A bare "no record, run this"
    // told an operator to run a command without saying what it buys, at
    // every session start of every session, forever -- and a warning
    // nobody can weigh is a warning everybody learns to scroll past.
    head =
      `${row.record}: no record at ${row.path}, so drift cannot be ` +
      "reported: nothing can tell you when a model your roles name stops " +
      "being served, or when a vendor ships one worth naming. Nothing is " +
      "blocked by this.";
  } else if (row.age_hours === null) {
    head =
      `${row.record}: ${row.path} carries no readable date ` +
      `(${repr(row.dated_at)}), so its age cannot be established.`;
  } else {
    head =
      `${row.record}: ${fixed0(row.age_hours)}h old ` +
      `(threshold ${fixed0(row.threshold_hours)}h), oldest entry ` +
      `dated ${row.dated_at}.`;
  }
  const detail = row.notes.map((note) => ` ${note}.`).join("");
  return `${head}${detail} Run: ${row.command}`;
}

function makeRow(
  recordName: string,
  path: string,
  threshold: number,
  command: string,
  datedAt: unknown,
  present: boolean,
  now: number,
  notes: readonly string[] = [],
): FreshnessRow {
  const parsed = present ? parseTimestamp(datedAt) : null;
  return {
    record: recordName,
    path,
    threshold_hours: threshold,
    command,
    present,
    dated_at: optionalString(datedAt),
    age_hours: parsed === null ? null : (now - parsed) / 3_600_000,
    notes: [...notes],
  };
}


/**
 * Both records' ages against their thresholds.
 *
 * One check over both, because there is one question -- does the framework
 * currently know what exists -- and answering it in two places is how the
 * two answers come to disagree. This warns and never blocks: it returns
 * rows, throws nothing, and calls no vendor.
 */
export function checkFreshness(
  config: RouterConfig,
  now: number = Date.now(),
): FreshnessRow[] {
  const path = currentCatalogPath();
  const catalog = readCatalog(path);
  // The oldest block this machine holds. A machine with one transport is
  // aged against that transport, and one with neither is *not read yet*:
  // there is no reading to be old.
  const stamps = Object.values(catalog?.transports ?? {})
    .map((block) => block.refreshed_at)
    .filter((stamp) => stamp.length > 0)
    .sort();
  // No notes. A note makes a row stale -- that is what the field is for, and
  // it is how a partially-read record says so -- and which transports this
  // machine has is not a defect in the reading.
  return [
    makeRow(
      RECORD_CATALOG,
      path,
      discoverySettings(config).max_age_hours,
      CATALOG_REFRESH_COMMAND,
      stamps[0] ?? null,
      catalogPresent(path),
      now,
    ),
  ];
}

/** The warning lines for the stale records, and nothing for the fresh ones. */
/**
 * The stale records, as lines, for whoever is reporting them.
 *
 * `includeAbsent` is what separates the two callers, and it is the whole of
 * this record's ownership question. A record that EXISTS and has gone stale
 * is a thing the operator once had and let age: worth saying every time,
 * because it is one command away from being current. A record that was
 * never made is a repository that has never run discovery, which is the
 * ordinary state of a repository on its first day -- and saying so at every
 * session start, forever, is a nag that nothing in the framework ever
 * answers. It belongs where a project is set up, said once, and that is
 * `dabbler bootstrap`.
 *
 * Neither caller reaches a vendor. Enumeration is a network call and a
 * lifecycle registration is not the place for one: a `session start` that
 * blocked on a provider outage would be worse than every warning this
 * function has ever printed.
 */
export function freshnessWarnings(
  config: RouterConfig,
  now: number = Date.now(),
  includeAbsent = true,
): string[] {
  return checkFreshness(config, now)
    .filter(isStale)
    .filter((row) => includeAbsent || row.present)
    .map((row) => `discovery: ${freshnessMessage(row)}`);
}

/**
 * Bring the API record up to date before a session starts, because it is
 * free.
 *
 * **This is the knob finally being acted on.** `discovery.max_age_hours` has
 * declared 24 since it was written and nothing has ever read it as an
 * instruction: staleness was reported and left, and a session ran against
 * whatever the record last happened to say. A vendor's models endpoint is a
 * metadata request -- three vendors, 195 models, 2.4 seconds, no tokens
 * billed -- so there is nothing to weigh: an out-of-date record and a current
 * one cost the same.
 *
 * **What is never in this path is a priced call.** The seat's other half is
 * a real turn per model, so the seat catalog is not refreshed here at any
 * age; its own row keeps saying what a refresh of it would buy, and a person
 * asks for that one. Nothing here dispatches to a model.
 *
 * Never blocks and never throws. A vendor that could not be reached leaves
 * the record exactly as it was and says so in a line -- a registration that
 * failed because a provider was down would be a maintenance signal capable of
 * causing an outage, which is how maintenance signals come to be suppressed.
 *
 * A record that was never made is left alone, and that is deliberate: a first
 * enumeration is part of setting a project up, `bootstrap` says so once, and
 * a session start that silently created the record would hide the one moment
 * where an operator finds out the record exists.
 */
export async function refreshStaleRecords(
  config: RouterConfig,
  options: {
    readonly now?: number;
    readonly get?: HttpGet;
    /** The seat's own list, as a seam a test speaks through. */
    readonly enumerateSeat?: () => Promise<SeatEnumeration>;
    /** Which seat this machine is on, for the scope check. */
    readonly identity?: SeatIdentity | null;
  } = {},
): Promise<string[]> {
  const now = options.now ?? Date.now();
  if (!refreshDue(config, now, options.identity)) return [];
  return refreshCatalog(config, options);
}

/**
 * Which providers this machine holds a usable key for, from configuration
 * alone.
 *
 * The `api` block's scope, computed without calling anybody: it is the
 * question "what was this reading taken for", and asking a vendor to answer
 * it would make the check cost what the check is guarding.
 */
/**
 * This machine's `api` block, or `null` when it has none it may believe.
 *
 * Scoped, like every reading of a block: a block recorded when a different
 * set of provider keys was present is a reading of a machine this is not,
 * and a refresh that has not happened yet -- or could not reach a vendor --
 * must not leave those models offered in the meantime.
 */
export function apiBlock(config: RouterConfig): TransportBlock | null {
  return blockFor(readCatalog(), TRANSPORT_API, currentApiScope(config));
}

export function currentApiScope(config: RouterConfig): CatalogScope {
  const providers = Object.entries(record(config["providers"]))
    .filter(([name, cfg]) => {
      if (!isRecord(cfg) || !enabledFlag(cfg)) return false;
      if (ADAPTERS[name] === undefined) return false;
      return Boolean(resolveSecret(String(cfg["api_key_env"] ?? "")));
    })
    .map(([name]) => name)
    .sort();
  return { providers };
}

/** The calendar day a stamp falls on, in the machine's own reckoning. */
function dayOf(value: string | number): string {
  return new Date(value).toDateString();
}

/**
 * Whether the first session of today has yet to read the catalog.
 *
 * The operator's own cadence: once at the beginning of the first session run
 * on any given day. A day and not an age, because an age makes the refresh
 * land at a different hour every day -- twenty-five hours after the last one,
 * then fifty, then seventy-five -- while a developer's question is "is this
 * today's reading".
 *
 * A block read for a scope that is not this machine's current one is unread
 * whatever the date says: a catalog carried over from another seat, or from
 * a key set that has since changed, is not a reading of this machine.
 */
export function refreshDue(
  config: RouterConfig,
  now: number = Date.now(),
  identity: SeatIdentity | null = readSeatIdentity(),
): boolean {
  // Only the transports this machine HAS. A seat it is not logged in to and
  // a vendor set it holds no key for are not readings that have gone stale;
  // they are transports to be silent about. Asking for them would reopen the
  // seat at every session start of a keyless machine, because a refresh that
  // reaches no vendor cannot replace the block whose scope no longer
  // matches -- which is the cadence defect round 1 caught.
  const due = (block: TransportBlock | null): boolean =>
    block === null || dayOf(block.refreshed_at) !== dayOf(now);
  const seated = identity !== null;
  const keyed = (currentApiScope(config)["providers"] ?? []).length > 0;
  if (!seated && !keyed) return false;
  return (seated && due(seatBlock(identity))) || (keyed && due(apiBlock(config)));
}

/**
 * Read every transport this machine has, and record what each one said.
 *
 * Whichever transports are here: a seat with no provider keys refreshes the
 * seat block and leaves the `api` block standing, and keys with no seat do
 * the converse. A transport that could not be read leaves its block exactly
 * as it was -- an outage at one end is not a withdrawal at the other -- and
 * says which one and why.
 *
 * Nothing here can dispatch to a model, so there is no age at which this
 * becomes expensive and no reason to ask an operator first.
 */
export async function refreshCatalog(
  config: RouterConfig,
  options: {
    readonly get?: HttpGet;
    readonly enumerateSeat?: () => Promise<SeatEnumeration>;
  } = {},
): Promise<string[]> {
  const lines: string[] = [...(await refreshSeat(options.enumerateSeat))];
  try {
    const results = options.get === undefined
      ? await enumerateAll(config)
      : await enumerateAll(config, null, options.get);
    const block = recordApiEnumeration(results);
    if (block === null) {
      lines.push(
        "discovery: no vendor answered, so the api block stands as it was " +
          `-- \`${CATALOG_REFRESH_COMMAND}\` when one is reachable again`,
      );
      return lines;
    }
    lines.push(
      `discovery: the api block has been re-read -- ${block.models.length} ` +
        "model(s) recorded, no tokens billed",
    );
    for (const result of results.filter((candidate) => !resultOk(candidate))) {
      lines.push(
        `discovery: ${result.provider} could not be read ` +
          `(${String(result.error)}); what the catalog already held stands`,
      );
    }
    return lines;
  } catch (error) {
    lines.push(
      "discovery: the api block could not be re-read " +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        `the catalog stands as it was -- \`${CATALOG_REFRESH_COMMAND}\` ` +
        "when the vendor is reachable again",
    );
    return lines;
  }
}

/**
 * Re-read what the seat lists, which costs nothing.
 *
 * It opens a conversation, takes the list from the reply and closes -- no
 * prompt, no token, no credit. There is no second, priced half to leave
 * alone any more: what this writes is what the seat said it has, with a
 * model it has stopped listing moved to the archive rather than dropped.
 *
 * A seat that could not be read leaves the block exactly as it was and says
 * so, like every other reading here.
 */
let seatSource: (() => Promise<SeatEnumeration>) | null = null;

/**
 * The seam the seat's own list is read through when no caller supplies one.
 *
 * `session start` refreshes the catalog for itself, so the seat is opened by
 * a path with no arguments to pass a stand-in through -- and a suite whose
 * machine happens to have the CLI installed would then spawn it. Production
 * leaves this null and opens the real seat.
 */
export function setSeatSource(source: (() => Promise<SeatEnumeration>) | null): void {
  seatSource = source;
}

async function refreshSeat(
  enumerateSeat?: () => Promise<SeatEnumeration>,
): Promise<string[]> {
  const read = enumerateSeat ?? seatSource ?? enumerateSeatModels;
  try {
    const seat = await read();
    if (!seat.known) {
      return [
        "discovery: the seat could not be read " +
          `(${seat.reason ?? "no reason given"}); the catalog stands as it ` +
          "was, and nothing was spent",
      ];
    }
    const block = recordSeatEnumeration(seat);
    return [
      `discovery: the seat block has been re-read -- ${block?.models.length ?? 0} ` +
        "model(s) the seat lists, free, no prompt sent",
    ];
  } catch (error) {
    return [
      "discovery: the seat block could not be re-read " +
        `(${error instanceof Error ? error.message : String(error)}); the ` +
        `catalog stands as it was -- \`${SEAT_REFRESH_COMMAND}\` when the ` +
        "seat is reachable again",
    ];
  }
}

// --- Drift ------------------------------------------------------------------

export interface Drift {
  readonly unnamed: ReadonlyArray<readonly [string, string]>;
  readonly unavailable: ReadonlyArray<readonly [string, string]>;
  readonly freshness: readonly FreshnessRow[];
}

/** A model the record still carries and the vendor has stopped serving. */
export interface RetiredModel {
  readonly id: string;
  readonly provider: string;
  /** When the vendor last returned it. */
  readonly lastSeenAt: string | null;
  readonly retiredAt: string;
}

/**
 * What the dated record says is no longer served, by model id.
 *
 * **One reading, two consumers.** The drift diff reports a role naming a
 * model the record cannot vouch for, and a surface offering a model has to
 * withhold the same one -- and two predicates for that would disagree the
 * first time either moved. A retired entry is therefore not "known" to
 * drift and not offered by the pane, from here.
 *
 * Best-effort by design: a repository with no record, or an unreadable one,
 * retires nothing. Absent evidence is not evidence of withdrawal.
 */
export function retiredModels(config: RouterConfig): Map<string, RetiredModel> {
  const out = new Map<string, RetiredModel>();
  // An id and a date and nothing else, which is the whole of what the
  // archive holds: it answers "where did that model go?" and refuses to
  // answer anything else, so nothing in it can go stale. Scoped, like every
  // reading of a block: another key set's archive is not this machine's.
  for (const entry of apiBlock(config)?.retired ?? []) {
    out.set(entry.id, { id: entry.id, provider: "", lastSeenAt: null, retiredAt: entry.retired_at });
  }
  return out;
}

/** `model id -> the roles that name it`, over every role's preference order. */
export function roleNames(config: RouterConfig): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [role, block] of Object.entries(record(config["roles"]))) {
    if (!isRecord(block)) continue;
    const prefer = block["prefer"];
    for (const modelId of Array.isArray(prefer) ? prefer : []) {
      const key = String(modelId);
      const existing = out.get(key);
      if (existing) existing.push(String(role));
      else out.set(key, [String(role)]);
    }
  }
  return out;
}

/**
 * `model id -> the records that carry it`, over both records.
 *
 * Both, because a role's preference order names ids as each transport puts
 * them on the wire: a name that exists only on the seat is inert on the API
 * path rather than missing, and reporting it as missing would train the
 * reader to ignore the report.
 */
function knownModels(config: RouterConfig): Map<string, string[]> {
  const known = new Map<string, string[]>();
  const add = (id: string, source: string): void => {
    const existing = known.get(id);
    if (existing) existing.push(source);
    else known.set(id, [source]);
  };

  // Only what a transport currently lists. A retired id is the catalog
  // saying the model stopped being served, which is exactly what a role
  // still naming it needs to hear, so it is not knowledge that it exists.
  for (const entry of apiBlock(config)?.models ?? []) add(entry.id, TRANSPORT_API);
  for (const entry of seatBlock()?.models ?? []) add(entry.id, TRANSPORT_SEAT);
  return known;
}

/** Sorted, de-duplicated, comma-joined -- Python's `",".join(sorted(set(x)))`. */
function joinUnique(values: readonly string[]): string {
  return [...new Set(values)].sort().join(",");
}

/**
 * The diff: what exists and is unranked, what is ranked and does not exist,
 * and how old the evidence for both statements is.
 *
 * Reported, never closed. Ranking one model above another is a judgment
 * metadata cannot make, so this produces the gap and names the invocation
 * that acts on it; a model may propose an ordering and the enumeration
 * records what exists. Nothing here enables a model.
 */
export function computeDrift(config: RouterConfig, now: number = Date.now()): Drift {
  return driftBetween(roleNames(config), knownModels(config), checkFreshness(config, now));
}

/**
 * The diff itself, over what the roles name and what the records carry.
 *
 * Both records feed `known`, because a role's preference order names ids as
 * each transport puts them on the wire: a name that exists only on the seat
 * is inert on the API path rather than missing, and reporting it as missing
 * would train the reader to ignore the report.
 */
export function driftBetween(
  roles: ReadonlyMap<string, readonly string[]>,
  known: ReadonlyMap<string, readonly string[]>,
  freshness: readonly FreshnessRow[],
): Drift {
  const byId = (
    [left]: readonly [string, unknown],
    [right]: readonly [string, unknown],
  ): number => (left < right ? -1 : left > right ? 1 : 0);
  const unnamed = [...known.entries()]
    .sort(byId)
    .filter(([modelId]) => !roles.has(modelId))
    .map(([modelId, records]) => [modelId, joinUnique(records)] as const);
  const unavailable = [...roles.entries()]
    .sort(byId)
    .filter(([modelId]) => !known.has(modelId))
    .map(([modelId, roleList]) => [modelId, joinUnique(roleList)] as const);
  return { unnamed, unavailable, freshness: [...freshness] };
}

export function formatDrift(drift: Drift): string {
  const lines = ["drift: record against roles"];
  lines.push(
    `  named in a role, in no record (${drift.unavailable.length}) -- ` +
      "these roles fall through to whatever else survives:",
  );
  for (const [modelId, roles] of drift.unavailable) {
    lines.push(`    ${modelId}  [${roles}]`);
  }
  if (drift.unavailable.length === 0) lines.push("    (none)");
  lines.push(
    `  in a record, named in no role (${drift.unnamed.length}) -- ` +
      "these still qualify and simply sort last:",
  );
  for (const [modelId, records] of drift.unnamed) {
    lines.push(`    ${modelId}  [${records}]`);
  }
  if (drift.unnamed.length === 0) lines.push("    (none)");
  lines.push("  record age:");
  for (const row of drift.freshness) {
    lines.push(`    ${isStale(row) ? "STALE" : "fresh"}  ${freshnessMessage(row)}`);
  }
  return lines.join("\n");
}

// --- Refresh never happens inside a session ---------------------------------

/**
 * The sessions that have started and not closed.
 *
 * Read from the machine-written state and from nothing else -- the presence
 * of a lock file or a run directory is not the record.
 */
export function sessionsInFlight(sessionsDir?: string | null): string[] {
  let root: string;
  try {
    root = sessionsDir ?? resolveSessionsDir();
  } catch {
    return [];
  }
  const statePath = join(root, STATE_FILENAME);
  try {
    if (!statSync(statePath).isFile()) return [];
  } catch {
    return [];
  }
  let state: unknown;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8").replace(/\r\n?/g, "\n"));
  } catch {
    return [];
  }
  return inFlightSessions(state);
}

/** The in-flight sessions a state record names, in order and without repeats. */
export function inFlightSessions(state: unknown): string[] {
  const sessions = record(state)["sessions"];
  const numbers: number[] = [];
  if (Array.isArray(sessions)) {
    for (const session of sessions) {
      if (!isRecord(session) || session["status"] !== "in-progress") continue;
      const number = session["number"];
      if (number === undefined || number === null) continue;
      numbers.push(Number(number));
    }
  }
  return [...new Set(numbers)].sort((a, b) => a - b).map((number) => `session ${number}`);
}

/** How many vendor endpoints a full enumeration would read. */
export const ADAPTER_COUNT = Object.keys(ADAPTERS).length;
