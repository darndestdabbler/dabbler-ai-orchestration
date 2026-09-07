// Model discovery on the direct-API path: enumeration, freshness, drift.
//
// **A role never depends on the model names it happens to list**, so
// something has to say what currently exists. On the seat that is an
// empirical probe, because the Copilot CLI has no list-models command; on
// the direct-API path each vendor publishes a models endpoint, so the
// framework reads it.
//
// **Enumeration is a metadata request and bills no tokens on any of the
// three vendors.** That is the whole reason the default cadence is 24 hours:
// freshness is free here, so the knob is a preference rather than a budget
// control. The seat keeps its probe-based refresh precisely because a probe
// is not free.
//
// Three rules shape everything below.
//
// **A field a vendor stops reporting degrades to unknown, never to
// unsupported.** Vendors report unequally already -- one returns token
// limits and generation methods, another a display name and a creation date,
// a third little beyond an identifier -- and a hard capability filter would
// disqualify every model from the quietest vendor and end cross-vendor
// verification by accident. Unknown is written by omission, a fresh unknown
// never overwrites a known value, and nothing here filters a candidate on
// metadata.
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

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { parse as parseToml } from "smol-toml";

import { projectRoot, truthy, type RouterConfig } from "./config.ts";
import { STATE_FILENAME, resolveSessionsDir } from "./evidence.ts";
import {
  digestText,
  provenance,
  renderDocument,
  setOrDrop,
  utcNow,
  writeDocument,
  writerId,
  type LockTable,
} from "./lockfile.ts";
import {
  HttpStatusError,
  HttpTimeoutError,
  httpGetJson,
} from "./transports/api.ts";
import { resolveSecret } from "./secretResolver.ts";
import { workingDirectory } from "./workdir.ts";
import { confirmedModels, loadCatalog, resolveLockfilePath } from "./transports/copilot.ts";

export const RECORD_SOURCE = "vendor-enumeration";

// Provider is first-party here, unlike the seat, where it can only be
// guessed from a name prefix. The stamp travels with the entry so the two
// records are never read as equally authoritative about the field a
// same-provider exclusion turns on.
export const PROVIDER_SOURCE_ENUMERATION = "vendor-enumeration";

export const ENUMERATE_COMMAND = "dabbler discovery enumerate";
export const DRIFT_COMMAND = "dabbler discovery drift";
export const SEAT_REFRESH_COMMAND = "dabbler copilot refresh";

export const DEFAULT_RECORD_FILENAME = ".dabbler/api-models.lock";
export const DEFAULT_MAX_AGE_HOURS = 24.0;
// The seat is not on the same clock and must not be: a probe costs premium
// requests, so a 24-hour warning on the seat catalog would fire every day of
// a month for a refresh nobody should run daily -- and a warning that is
// always on is a warning that is always ignored.
export const DEFAULT_SEAT_MAX_AGE_HOURS = 720.0;

export const RECORD_API = "api-enumeration";
export const RECORD_SEAT = "seat-catalog";

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
  readonly enumerated_at: string | null;
  /**
   * Keys this version does not model, in file order, so a writer never
   * silently drops what a future version wrote.
   */
  readonly raw: Record<string, unknown>;
}

/**
 * What the last enumeration attempt against one vendor did.
 *
 * A failed attempt annotates rather than empties: an endpoint that timed out
 * is not a vendor that withdrew its catalog, and deleting the models would
 * turn a network blip into a drift report claiming every role names a model
 * that does not exist.
 */
export interface ProviderStatus {
  readonly name: string;
  readonly enumerated_at: string | null;
  readonly model_count: number | null;
  readonly last_error: string | null;
  readonly last_error_at: string | null;
  readonly raw: Record<string, unknown>;
}

export interface RecordMeta {
  readonly key_set_id: string;
  readonly source: string;
  readonly enumerated_at: string | null;
  readonly written_by: string | null;
  readonly written_at: string | null;
  readonly content_digest: string | null;
  readonly raw: Record<string, unknown>;
}

export interface ModelRecord {
  readonly meta: RecordMeta;
  readonly providers: readonly ProviderStatus[];
  readonly models: readonly ApiModelEntry[];
}

export function emptyRecord(keySetId = "default"): ModelRecord {
  return {
    meta: {
      key_set_id: keySetId,
      source: RECORD_SOURCE,
      enumerated_at: null,
      written_by: null,
      written_at: null,
      content_digest: null,
      raw: {},
    },
    providers: [],
    models: [],
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * A token limit off the wire, or `null` for unknown.
 *
 * A bool, a string, a negative or a non-finite value is not a limit, and
 * unknown is the honest answer for those -- never zero, which would read as
 * a model that accepts no input.
 */
function optionalInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.trunc(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item !== "");
}

/**
 * A count off the wire, or `null` for unknown.
 *
 * Zero is a measurement here and not an absence: a vendor that answered and
 * listed nothing is a fact worth keeping, and folding it into unknown would
 * make an empty catalog indistinguishable from an endpoint never read.
 */
function optionalCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.trunc(value);
}

/**
 * Read an enumeration record.
 *
 * Raw bytes, not `readText`: Python hands this file to `tomllib` in binary,
 * so a CRLF checkout is what its parser sees too.
 */
export function loadRecord(path: string): ModelRecord {
  const data: unknown = parseToml(readFileSync(path, "utf8"));
  const metaRaw = isRecord(data) ? data["meta"] : undefined;
  if (!isRecord(metaRaw)) {
    throw new RecordError(`discovery record '${path}' has no [meta] table`);
  }
  if (!("key_set_id" in metaRaw)) {
    throw new RecordError(
      "discovery record [meta] is missing required key 'key_set_id'",
    );
  }
  const meta: RecordMeta = {
    key_set_id: String(metaRaw["key_set_id"]),
    source: String(metaRaw["source"] ?? RECORD_SOURCE),
    enumerated_at: optionalString(metaRaw["enumerated_at"]),
    written_by: optionalString(metaRaw["written_by"]),
    written_at: optionalString(metaRaw["written_at"]),
    content_digest: optionalString(metaRaw["content_digest"]),
    raw: { ...metaRaw },
  };
  const providers: ProviderStatus[] = [];
  const providerRows =
    isRecord(data) && Array.isArray(data["providers"]) ? data["providers"] : [];
  for (const row of providerRows) {
    if (!isRecord(row) || !("name" in row)) {
      throw new RecordError(
        `discovery record has a malformed [[providers]] entry: ${JSON.stringify(row)}`,
      );
    }
    providers.push({
      name: String(row["name"]),
      enumerated_at: optionalString(row["enumerated_at"]),
      model_count: optionalCount(row["model_count"]),
      last_error: optionalString(row["last_error"]),
      last_error_at: optionalString(row["last_error_at"]),
      raw: { ...row },
    });
  }
  const models: ApiModelEntry[] = [];
  const modelRows = isRecord(data) && Array.isArray(data["models"]) ? data["models"] : [];
  for (const row of modelRows) {
    if (!isRecord(row) || !("id" in row)) {
      throw new RecordError(
        `discovery record has a malformed [[models]] entry: ${JSON.stringify(row)}`,
      );
    }
    models.push({
      id: String(row["id"]),
      provider: String(row["provider"] ?? ""),
      provider_source: String(row["provider_source"] ?? PROVIDER_SOURCE_ENUMERATION),
      display_name: optionalString(row["display_name"]),
      created_at: optionalString(row["created_at"]),
      max_context_tokens: optionalInt(row["max_context_tokens"]),
      max_output_tokens: optionalInt(row["max_output_tokens"]),
      capabilities: stringList(row["capabilities"]),
      enumerated_at: optionalString(row["enumerated_at"]),
      raw: { ...row },
    });
  }
  return { meta, providers, models };
}

/**
 * A table starts from the entry as read, so unmodelled keys keep their
 * original position and an entry nothing touched re-renders byte for byte.
 *
 * The restricted format the lockfile writer accepts is scalars and flat
 * string arrays; a future key holding a nested table would be refused there
 * rather than silently flattened here, which is the writer's contract.
 */
function metaMapping(meta: RecordMeta): LockTable {
  const out = { ...meta.raw } as LockTable;
  out["key_set_id"] = meta.key_set_id;
  out["source"] = meta.source;
  setOrDrop(out, "enumerated_at", meta.enumerated_at);
  setOrDrop(out, "written_by", meta.written_by);
  setOrDrop(out, "written_at", meta.written_at);
  setOrDrop(out, "content_digest", meta.content_digest);
  return out;
}

function providerMapping(status: ProviderStatus): LockTable {
  const out = { ...status.raw } as LockTable;
  out["name"] = status.name;
  setOrDrop(out, "enumerated_at", status.enumerated_at);
  setOrDrop(out, "model_count", status.model_count);
  setOrDrop(out, "last_error", status.last_error);
  setOrDrop(out, "last_error_at", status.last_error_at);
  return out;
}

function entryMapping(entry: ApiModelEntry): LockTable {
  const out = { ...entry.raw } as LockTable;
  out["id"] = entry.id;
  setOrDrop(out, "provider", entry.provider || null);
  setOrDrop(out, "provider_source", entry.provider_source || null);
  setOrDrop(out, "display_name", entry.display_name);
  setOrDrop(out, "created_at", entry.created_at);
  setOrDrop(out, "max_context_tokens", entry.max_context_tokens);
  setOrDrop(out, "max_output_tokens", entry.max_output_tokens);
  setOrDrop(out, "capabilities", entry.capabilities.length > 0 ? [...entry.capabilities] : null);
  setOrDrop(out, "enumerated_at", entry.enumerated_at);
  return out;
}

export function dumpsRecord(recordValue: ModelRecord): string {
  const tables: Array<readonly [string, LockTable]> = [
    ["[meta]", metaMapping(recordValue.meta)],
  ];
  for (const status of recordValue.providers) {
    tables.push(["[[providers]]", providerMapping(status)]);
  }
  for (const entry of recordValue.models) {
    tables.push(["[[models]]", entryMapping(entry)]);
  }
  return renderDocument(tables);
}

/**
 * SHA-256 over the record rendered with the digest key itself elided, so the
 * same content digests the same whether or not it has been stamped.
 */
export function recordDigest(recordValue: ModelRecord): string {
  return digestText(
    dumpsRecord({
      meta: { ...recordValue.meta, content_digest: null },
      providers: recordValue.providers,
      models: recordValue.models,
    }),
  );
}

export function stampRecord(
  recordValue: ModelRecord,
  writtenAt: string | null = null,
): ModelRecord {
  const meta: RecordMeta = {
    ...recordValue.meta,
    written_by: writerId("dabbler.discovery"),
    written_at: writtenAt ?? utcNow(),
    content_digest: null,
  };
  const unstamped: ModelRecord = {
    meta,
    providers: recordValue.providers,
    models: recordValue.models,
  };
  return {
    meta: { ...meta, content_digest: recordDigest(unstamped) },
    providers: recordValue.providers,
    models: recordValue.models,
  };
}

export function recordProvenance(recordValue: ModelRecord): string {
  const meta = recordValue.meta;
  return provenance({
    storedDigest: meta.content_digest,
    recomputedDigest: recordDigest(recordValue),
    writtenBy: meta.written_by,
    writtenAt: meta.written_at,
  });
}

/**
 * Write the record, stamped. The sanctioned writer, and the only one: a
 * record with no writer leaves hand-editing as the sole remedy for
 * staleness, which destroys the empirical signal the file exists to carry.
 */
export function writeRecord(
  path: string,
  recordValue: ModelRecord,
  writtenAt: string | null = null,
): ModelRecord {
  const stamped = stampRecord(recordValue, writtenAt);
  writeDocument(path, dumpsRecord(stamped));
  return stamped;
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
 * Fresh wins where fresh knows something; prior survives where it does not.
 * A vendor that stopped reporting a field leaves the last known value
 * standing rather than blanking it -- and either way the value is never read
 * as an absence of capability.
 */
function mergeEntry(prior: ApiModelEntry, fresh: ApiModelEntry): ApiModelEntry {
  return {
    ...fresh,
    raw: prior.raw,
    display_name: fresh.display_name || prior.display_name,
    created_at: fresh.created_at || prior.created_at,
    max_context_tokens:
      fresh.max_context_tokens !== null ? fresh.max_context_tokens : prior.max_context_tokens,
    max_output_tokens:
      fresh.max_output_tokens !== null ? fresh.max_output_tokens : prior.max_output_tokens,
    capabilities: fresh.capabilities.length > 0 ? fresh.capabilities : prior.capabilities,
  };
}

/**
 * Fold enumeration `results` into `recordValue`, touching nothing else.
 *
 * A vendor that answered is authoritative about which of its models exist,
 * so its list is replaced -- a model the endpoint no longer returns leaves
 * the record and shows up in the drift diff, which is where a role naming a
 * withdrawn model is supposed to become visible. A vendor that failed keeps
 * everything it had and gains the failure beside it.
 */
export function mergeRecord(
  recordValue: ModelRecord,
  results: readonly ProviderResult[],
  enumeratedAt: string | null = null,
): ModelRecord {
  const stamp = enumeratedAt ?? utcNow();
  const answered = new Set(results.filter(resultOk).map((result) => result.provider));

  const models: ApiModelEntry[] = recordValue.models.filter(
    (entry) => !answered.has(entry.provider),
  );
  // Python keys this map on the `(provider, id)` TUPLE; a Map keys on
  // identity, so the pair has to become one string -- and the separator has
  // to be a character neither field can hold, or `("a b", "c")` and
  // `("a", "b c")` would collide on a space. Written as an escape, because a
  // raw NUL in a source file is invisible to a reader and makes every tool
  // that reads it call the file binary.
  const pairKey = (provider: string, id: string): string =>
    `${provider}\u0000${id}`;
  const priorByKey = new Map<string, ApiModelEntry>();
  for (const entry of recordValue.models) {
    priorByKey.set(pairKey(entry.provider, entry.id), entry);
  }
  for (const result of results) {
    if (!resultOk(result)) continue;
    for (const entry of result.entries) {
      const fresh: ApiModelEntry = { ...entry, enumerated_at: stamp };
      const prior = priorByKey.get(pairKey(fresh.provider, fresh.id));
      models.push(prior ? mergeEntry(prior, fresh) : fresh);
    }
  }

  const statuses = new Map<string, ProviderStatus>();
  for (const status of recordValue.providers) statuses.set(status.name, status);
  for (const result of results) {
    const prior = statuses.get(result.provider) ?? {
      name: result.provider,
      enumerated_at: null,
      model_count: null,
      last_error: null,
      last_error_at: null,
      raw: {},
    };
    statuses.set(
      result.provider,
      resultOk(result)
        ? {
            ...prior,
            enumerated_at: stamp,
            model_count: result.entries.length,
            last_error: null,
            last_error_at: null,
          }
        : { ...prior, last_error: result.error, last_error_at: stamp },
    );
  }

  return {
    meta: {
      ...recordValue.meta,
      enumerated_at: answered.size > 0 ? stamp : recordValue.meta.enumerated_at,
    },
    providers: [...statuses.keys()].sort().map((name) => statuses.get(name) as ProviderStatus),
    models,
  };
}

// --- Configuration ----------------------------------------------------------

export interface DiscoverySettings {
  readonly key_set_id: string;
  readonly record: string;
  readonly max_age_hours: number;
  readonly seat_max_age_hours: number;
}

export function discoverySettings(config: RouterConfig): DiscoverySettings {
  const block = record(config["discovery"]);
  return {
    key_set_id: String(block["key_set_id"] || "default"),
    record: String(block["record"] || DEFAULT_RECORD_FILENAME),
    max_age_hours:
      "max_age_hours" in block ? Number(block["max_age_hours"]) : DEFAULT_MAX_AGE_HOURS,
    seat_max_age_hours:
      "seat_max_age_hours" in block
        ? Number(block["seat_max_age_hours"])
        : DEFAULT_SEAT_MAX_AGE_HOURS,
  };
}

/**
 * The record `discovery.record` names, resolved against the project that
 * named it -- one resolution, so a reader and a writer cannot disagree about
 * which file they mean.
 *
 * A relative record path resolves against the PROJECT, never against the
 * package. The seat catalog ships because it is the operator's seat and
 * belongs to the distribution; this record is derived from whichever key set
 * happens to be present, so a build that swept it up would publish one
 * checkout's credentials-shaped view of the world to every consumer.
 */
export function resolveRecordPath(config: RouterConfig): string {
  const value = discoverySettings(config).record;
  if (isAbsolute(value)) return value;
  const root = projectRoot();
  return join(root ?? workingDirectory(), ...value.split("/"));
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
 * Enabled providers this framework can actually enumerate.
 *
 * A provider with no adapter is not a hole in the record; a provider that is
 * enabled and has an adapter and is missing from the record is.
 */
export function enumerableProviders(config: RouterConfig): string[] {
  return Object.entries(record(config["providers"]))
    .filter(
      ([name, cfg]) => isRecord(cfg) && enabledFlag(cfg) && name in ADAPTERS,
    )
    .map(([name]) => name)
    .sort();
}

/**
 * The API record aged against its stalest enabled vendor.
 *
 * `meta.enumerated_at` advances whenever any vendor answers, so reading it
 * alone would report the whole record fresh while one vendor's key is
 * expired and its entries are weeks old. Partial failure is an expected
 * operational path here -- three endpoints this project does not control --
 * so freshness is taken from the oldest per-vendor stamp and every vendor
 * that is missing or last failed is named.
 */
function apiFreshness(
  config: RouterConfig,
  path: string,
  threshold: number,
  now: number,
): FreshnessRow {
  if (!existsSync(path)) {
    return makeRow(RECORD_API, path, threshold, ENUMERATE_COMMAND, null, false, now);
  }
  let recordValue: ModelRecord;
  try {
    recordValue = loadRecord(path);
  } catch {
    // An unreadable record is not a fresh one, and it is also not an outage:
    // the row says so and the invocation that rewrites it is named right
    // there.
    return makeRow(RECORD_API, path, threshold, ENUMERATE_COMMAND, null, true, now);
  }
  const age = apiRecordAge(recordValue, enumerableProviders(config));
  return makeRow(
    RECORD_API, path, threshold, ENUMERATE_COMMAND, age.datedAt, true, now, age.notes,
  );
}

/**
 * How old an API record is, and what the record-level date cannot say.
 *
 * A record is only as current as its stalest ENABLED vendor:
 * `meta.enumerated_at` advances whenever any vendor answers, so reading it
 * alone would report the whole record fresh while one vendor's key is
 * expired and its entries are weeks old. The date returned is the oldest
 * per-vendor stamp, and every vendor that is missing, undated or last failed
 * is named.
 */
export function apiRecordAge(
  recordValue: ModelRecord,
  expected: readonly string[],
): { datedAt: string | null; notes: string[] } {
  const statuses = new Map(recordValue.providers.map((status) => [status.name, status]));
  let oldest: readonly [number, string] | null = null;
  const notes: string[] = [];
  for (const name of expected) {
    const status = statuses.get(name);
    if (status === undefined || !status.enumerated_at) {
      notes.push(`${name} has never been enumerated`);
      continue;
    }
    if (status.last_error) {
      notes.push(
        `${name}'s last attempt failed (${status.last_error}), so its ` +
          "entries are older than this date",
      );
    }
    const parsed = parseTimestamp(status.enumerated_at);
    if (parsed === null) {
      notes.push(`${name} carries an unreadable date`);
      continue;
    }
    if (oldest === null || parsed < oldest[0]) oldest = [parsed, status.enumerated_at];
  }
  // With no enumerable provider configured there is no per-vendor evidence
  // to be conservative about, so the record-level date is all there is.
  const datedAt = oldest
    ? oldest[1]
    : expected.length > 0
      ? null
      : recordValue.meta.enumerated_at;
  return { datedAt, notes };
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
  const settings = discoverySettings(config);
  const rows = [
    apiFreshness(config, resolveRecordPath(config), settings.max_age_hours, now),
  ];

  let seatPath = "(no transports.copilot-cli.lockfile configured)";
  let seatPresent = false;
  let seatDated: string | null = null;
  try {
    const resolved = resolveLockfilePath(config);
    seatPath = resolved;
    seatPresent = existsSync(resolved);
    if (seatPresent) seatDated = loadCatalog(resolved).meta.probed_at;
  } catch {
    // An unconfigured or unreadable seat catalog is reported as a stale
    // record, which is what it is. It is never an error: this check has to
    // be safe to run on a machine that has no seat at all.
  }
  rows.push(
    makeRow(
      RECORD_SEAT, seatPath, settings.seat_max_age_hours, SEAT_REFRESH_COMMAND,
      seatDated, seatPresent, now,
    ),
  );
  return rows;
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

// --- Drift ------------------------------------------------------------------

export interface Drift {
  readonly unnamed: ReadonlyArray<readonly [string, string]>;
  readonly unavailable: ReadonlyArray<readonly [string, string]>;
  readonly freshness: readonly FreshnessRow[];
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

  const recordPath = resolveRecordPath(config);
  if (existsSync(recordPath)) {
    try {
      for (const entry of loadRecord(recordPath).models) add(entry.id, RECORD_API);
    } catch {
      /* an unreadable record contributes nothing, and says so in freshness */
    }
  }

  try {
    const seatPath = resolveLockfilePath(config);
    if (existsSync(seatPath)) {
      for (const entry of confirmedModels(loadCatalog(seatPath))) add(entry.id, RECORD_SEAT);
    }
  } catch {
    /* no seat here, which is a legitimate machine */
  }
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
 * that acts on it; a model may propose an ordering, enumeration or a probe
 * confirms it, and the writer records it. Nothing here enables a model.
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
