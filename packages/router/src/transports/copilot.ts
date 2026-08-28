// The seat transport, as far as this session's modules reach into it.
//
// Session 29 ports the dispatch state machine and the seat catalog this
// belongs to. What is here is what two of this session's modules ask of
// it, and each piece answers a whole question rather than being half of a
// type nobody has finished:
//
// - the timeout contract `config` validates at load: three ceilings, their
//   shipped defaults, and the ordering rule between them;
// - the confirmed entries of the seat catalog, which is the only thing
//   `identity` asks the catalog for.
//
// Both live here rather than in their callers, because a second statement
// of "what a timeouts block may say", or a second reader of the lock file,
// would be a second thing to keep true.

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// --- The seat catalog, as far as identity reads it ---------------------------

/** The providers a seat may front. A name outside this set is not trusted. */
export const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "google",
]);

export const ENABLEMENT_CONFIRMED = "confirmed";
export const ENABLEMENT_UNCONFIRMED = "unconfirmed";

/** The lock the seat catalog is written to, beside the Python package. */
export const CATALOG_LOCK_PATH = join(AI_ROUTER_DIR, "copilot-catalog.lock");

/** A confirmed catalog entry, reduced to what a provider lookup needs. */
export interface ConfirmedCatalogEntry {
  readonly id: string;
  readonly provider: string;
}

/**
 * The catalog's CONFIRMED entries, or an empty list.
 *
 * The whole answer to one question -- which models the seat is known to
 * serve, and for whom -- rather than a partial `Catalog` that would look
 * finished to session 29. An unreadable or malformed lock resolves nothing:
 * a bare, unconfirmed model id has no trustworthy provenance, and this value
 * can drive a same-provider safety exclusion, so callers fail closed.
 */
export function confirmedCatalogEntries(
  path: string = CATALOG_LOCK_PATH,
): ConfirmedCatalogEntry[] {
  let data: unknown;
  try {
    // Raw, not `readText`: Python opens this file in binary and hands the
    // bytes to `tomllib`, so a CRLF file is what its parser sees too.
    data = parseToml(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  const models = isRecord(data) ? data["models"] : undefined;
  if (!Array.isArray(models)) return [];
  const entries: ConfirmedCatalogEntry[] = [];
  for (const entry of models) {
    if (!isRecord(entry) || typeof entry["id"] !== "string") continue;
    const enablement = String(entry["enablement"] ?? ENABLEMENT_UNCONFIRMED);
    if (enablement !== ENABLEMENT_CONFIRMED) continue;
    entries.push({
      id: String(entry["id"]),
      provider: String(entry["provider"] ?? ""),
    });
  }
  return entries;
}
