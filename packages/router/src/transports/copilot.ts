// The seat transport, as far as the ported modules reach into it.
//
// Session 29 ports the dispatch state machine, the catalog writer and the
// probe. What is here is what the modules ported before it ask of the seat,
// and each piece answers a whole question rather than being half of a type
// nobody has finished:
//
// - the timeout contract `config` validates at load: three ceilings, their
//   shipped defaults, and the ordering rule between them;
// - the seat catalog as a READER sees it -- which file it is, and what it
//   says -- because `identity` resolves a provider through it and
//   `discovery` dates its own record against it.
//
// Both live here rather than in their callers, because a second statement
// of "what a timeouts block may say", or a second reader of the lock file,
// would be a second thing to keep true. The catalog WRITER stays in session
// 29 with the probe that fills it: nothing ported yet writes this file, and
// a renderer with no caller is a guarantee nobody is holding.

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

import { AI_ROUTER_DIR } from "../paths.ts";

export const DEFAULT_SPAWN_TIMEOUT_SECONDS = 10.0;
export const DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS = 30.0;
export const DEFAULT_TOTAL_TIMEOUT_SECONDS = 1200.0;

export interface TransportTimeouts {
  readonly spawn_seconds: number;
  readonly first_byte_seconds: number;
  readonly total_seconds: number;
}

export const TIMEOUT_FIELD_DEFAULTS: ReadonlyArray<
  readonly [keyof TransportTimeouts, number]
> = [
  ["spawn_seconds", DEFAULT_SPAWN_TIMEOUT_SECONDS],
  ["first_byte_seconds", DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS],
  ["total_seconds", DEFAULT_TOTAL_TIMEOUT_SECONDS],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python's `type(x).__name__` for the values a YAML load can produce. */
export function typeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  return "dict";
}

/**
 * Effective timeouts for a `transports.copilot-cli` block; each field falls
 * back to its shipped default.
 */
export function resolveTransportTimeouts(cliConfig: unknown): TransportTimeouts {
  const raw = isRecord(cliConfig) ? cliConfig["timeouts"] : undefined;
  const block = isRecord(raw) ? raw : {};
  const values: Record<string, number> = {};
  for (const [name, fallback] of TIMEOUT_FIELD_DEFAULTS) {
    const candidate = name in block ? block[name] : fallback;
    const parsed =
      typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : Number(candidate);
    values[name] = Number.isFinite(parsed) ? parsed : fallback;
  }
  return values as unknown as TransportTimeouts;
}

/**
 * Throw unless `block` is a valid `timeouts:` mapping.
 *
 * Unknown keys are rejected rather than ignored: a typo'd `total_second`
 * silently keeping the default is exactly the failure this exists to end.
 * The trio must satisfy spawn < first_byte < total, or an inner ceiling can
 * never fire and a stall is misclassified at the outer one.
 */
export function validateTransportTimeouts(block: unknown): void {
  if (block === null || block === undefined) return;
  if (!isRecord(block)) {
    throw new Error(
      `transports.copilot-cli.timeouts must be a mapping, got ${typeName(block)}`,
    );
  }
  const known = TIMEOUT_FIELD_DEFAULTS.map(([name]) => String(name));
  const unknown = Object.keys(block)
    .filter((key) => !known.includes(key))
    .sort();
  if (unknown.length > 0) {
    throw new Error(
      `transports.copilot-cli.timeouts has unknown key(s): ${render(unknown)}. ` +
        `Known: ${render([...known].sort())}`,
    );
  }
  for (const [name] of TIMEOUT_FIELD_DEFAULTS) {
    if (!(name in block)) continue;
    const value = block[name];
    // A boolean is an int in Python; `true` here is a config error, not 1s.
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `transports.copilot-cli.timeouts.${name} must be a number, ` +
          `got ${typeName(value)}`,
      );
    }
    if (value <= 0) {
      throw new Error(
        `transports.copilot-cli.timeouts.${name} must be > 0, got ${value}`,
      );
    }
  }
  const resolved = resolveTransportTimeouts({ timeouts: block });
  if (
    !(
      resolved.spawn_seconds < resolved.first_byte_seconds &&
      resolved.first_byte_seconds < resolved.total_seconds
    )
  ) {
    throw new Error(
      "transports.copilot-cli.timeouts must satisfy spawn_seconds < " +
        "first_byte_seconds < total_seconds; got " +
        `${resolved.spawn_seconds} / ${resolved.first_byte_seconds} / ` +
        `${resolved.total_seconds}`,
    );
  }
}

/** Python renders a list of strings as `['a', 'b']`. */
function render(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
}

// --- The seat catalog, as a reader sees it -----------------------------------

/** The providers a seat may front. A name outside this set is not trusted. */
export const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "google",
]);

export const ENABLEMENT_CONFIRMED = "confirmed";
export const ENABLEMENT_UNCONFIRMED = "unconfirmed";

/** The lock the seat catalog ships in, beside the Python package. */
export const CATALOG_LOCK_PATH = join(AI_ROUTER_DIR, "copilot-catalog.lock");

const LEGACY_PROBE_PREMIUM_KEY = "premium_request_weight";
const PROBE_PREMIUM_KEY = "probe_premium_requests";

/** A malformed lock file. Python raises `ValueError` at each of these. */
export class CatalogError extends Error {}

export interface ModelEntry {
  readonly id: string;
  readonly provider: string;
  readonly enablement: string;
  /**
   * A one-call sample of what this model cost, which the seat reports as an
   * integer for premium models and a fraction for sub-premium ones. Not a
   * price, never fed to selection; `null` is unknown and never free.
   */
  readonly probe_premium_requests: number | null;
  readonly echoed_model: unknown;
  readonly provider_source: string;
  readonly confirmed_at: string | null;
  readonly confirmed_on_cli_version: string | null;
  /**
   * The most recent probe that FAILED, with the failure's own error class.
   * A failed probe is not a withdrawn model, so it annotates rather than
   * replaces the confirmation above it.
   */
  readonly last_probe_error: string | null;
  readonly last_probe_at: string | null;
  /**
   * Keys this version does not model, in file order, so a writer never
   * silently drops what a future version wrote.
   */
  readonly raw: Record<string, unknown>;
}

export interface CatalogMeta {
  readonly cli_version: string;
  readonly cli_version_pin_required: boolean;
  readonly seat_id: string;
  readonly seat_label: string;
  readonly probed_at: string | null;
  /**
   * The candidate universe lives in the file, not in code: the CLI cannot
   * enumerate its models, so this is a maintained list and adding a model
   * must be a data edit that leaves the file the whole truth about the seat.
   */
  readonly candidate_universe: readonly string[];
  readonly written_by: string | null;
  readonly written_at: string | null;
  readonly content_digest: string | null;
  readonly raw: Record<string, unknown>;
}

export interface Catalog {
  readonly meta: CatalogMeta;
  readonly models: readonly ModelEntry[];
}

export function confirmedModels(catalog: Catalog): ModelEntry[] {
  return catalog.models.filter((entry) => entry.enablement === ENABLEMENT_CONFIRMED);
}

/**
 * A string off the wire or `null`; anything else is not a string and must
 * not become one by coercion.
 */
function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * A request-count sample off the wire, or `null` for unknown.
 *
 * The seat reports `usage.premiumRequests` as `0` for included models and as
 * a FRACTION for sub-premium ones -- 0.33 measured on `claude-haiku-4.5` --
 * so a float here is a measurement, not noise, and discarding it would file
 * the cheapest models on the seat as the most uncertain. A bool, a string, a
 * list, a negative or a non-finite value is not a count, and unknown is the
 * honest answer for those -- never zero, which would read as free.
 */
function coerceProbePremiumRequests(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function readCandidateUniverse(
  metaRaw: Record<string, unknown>,
  path: string,
): string[] {
  const declared = metaRaw["candidate_universe"];
  if (declared === undefined || declared === null) return [];
  if (
    !Array.isArray(declared) ||
    !declared.every((item) => typeof item === "string" && item !== "")
  ) {
    throw new CatalogError(
      `catalog lockfile '${path}' declares a malformed ` +
        "[meta].candidate_universe: it must be an array of model id strings",
    );
  }
  return declared as string[];
}

/**
 * Read a seat catalog lockfile.
 *
 * Raw bytes, not `readText`: Python hands this file to `tomllib` in binary,
 * so a CRLF checkout is what its parser sees too.
 */
export function loadCatalog(path: string): Catalog {
  const data: unknown = parseToml(readFileSync(path, "utf8"));
  const metaRaw = isRecord(data) ? data["meta"] : undefined;
  if (!isRecord(metaRaw)) {
    throw new CatalogError(`catalog lockfile '${path}' has no [meta] table`);
  }
  for (const required of ["cli_version", "seat_id"]) {
    if (!(required in metaRaw)) {
      throw new CatalogError(
        `catalog lockfile [meta] is missing required key '${required}'`,
      );
    }
  }
  const meta: CatalogMeta = {
    cli_version: String(metaRaw["cli_version"]),
    // Default off: the seat CLI updates itself, so a pin that defaulted to
    // strict would turn every routine auto-update into a dead seat.
    cli_version_pin_required: Boolean(metaRaw["cli_version_pin_required"] ?? false),
    seat_id: String(metaRaw["seat_id"]),
    seat_label: String(metaRaw["seat_label"] ?? ""),
    probed_at: optionalString(metaRaw["probed_at"]),
    candidate_universe: readCandidateUniverse(metaRaw, path),
    written_by: optionalString(metaRaw["written_by"]),
    written_at: optionalString(metaRaw["written_at"]),
    content_digest: optionalString(metaRaw["content_digest"]),
    raw: { ...metaRaw },
  };
  const models: ModelEntry[] = [];
  const rows = isRecord(data) && Array.isArray(data["models"]) ? data["models"] : [];
  for (const row of rows) {
    if (!isRecord(row) || !("id" in row)) {
      throw new CatalogError(
        `catalog lockfile has a malformed [[models]] entry: ${JSON.stringify(row)}`,
      );
    }
    const rawProbe =
      PROBE_PREMIUM_KEY in row ? row[PROBE_PREMIUM_KEY] : row[LEGACY_PROBE_PREMIUM_KEY];
    models.push({
      id: String(row["id"]),
      provider: String(row["provider"] ?? ""),
      enablement: String(row["enablement"] ?? ENABLEMENT_UNCONFIRMED),
      probe_premium_requests: coerceProbePremiumRequests(rawProbe),
      echoed_model: row["echoed_model"] ?? null,
      provider_source: String(row["provider_source"] ?? ""),
      confirmed_at: optionalString(row["confirmed_at"]),
      confirmed_on_cli_version: optionalString(row["confirmed_on_cli_version"]),
      last_probe_error: optionalString(row["last_probe_error"]),
      last_probe_at: optionalString(row["last_probe_at"]),
      raw: { ...row },
    });
  }
  return { meta, models };
}

/**
 * The lockfile `transports.copilot-cli.lockfile` names, resolved relative to
 * the config that named it.
 *
 * One resolution, in the module that owns the file: a reader and a writer
 * that disagreed about which file they mean would let a refresh spend real
 * requests updating a lockfile nothing dispatches from.
 */
export function resolveLockfilePath(config: Record<string, unknown>): string {
  const transports = isRecord(config["transports"]) ? config["transports"] : {};
  const cliConfig = transports["copilot-cli"];
  if (!isRecord(cliConfig) || !cliConfig["lockfile"]) {
    throw new CatalogError(
      "router-config.yaml has no transports.copilot-cli.lockfile, so no " +
        "seat catalog is named",
    );
  }
  const lockfile = String(cliConfig["lockfile"]);
  if (isAbsolute(lockfile)) return lockfile;
  const configPath = config["_config_path"];
  const base = configPath ? dirname(String(configPath)) : resolve(".");
  return join(base, lockfile);
}

/** A confirmed catalog entry, reduced to what a provider lookup needs. */
export interface ConfirmedCatalogEntry {
  readonly id: string;
  readonly provider: string;
}

/**
 * The shipped catalog's CONFIRMED entries, or an empty list.
 *
 * Best-effort by design, and the only reader that is: an unreadable or
 * malformed lock resolves nothing rather than stopping identity resolution,
 * because a bare model id with no trustworthy provenance is exactly what its
 * caller must fail closed on. Everything it knows still comes from
 * `loadCatalog`, so the lock file has one parser and one set of rules about
 * what a malformed entry is.
 */
export function confirmedCatalogEntries(
  path: string = CATALOG_LOCK_PATH,
): ConfirmedCatalogEntry[] {
  try {
    return confirmedModels(loadCatalog(path));
  } catch {
    return [];
  }
}
