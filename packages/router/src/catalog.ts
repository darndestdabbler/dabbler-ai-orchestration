// The one record of which models exist, on the machine that will dispatch
// to them.
//
// It lives at the user level and outside every repository, because a catalog
// is a reading of THIS machine -- its seat, its provider keys -- and a copy
// that travels inside a package tells every other machine about somebody
// else's. Reading what exists is free on both transports, so there is nothing
// to seed from: a machine that has never refreshed reads *not read yet*, and
// the first session reads it for real.
//
// **Unknown is null and stays null.** Where a source states no cost and no
// price category -- every vendor model on the direct-API path -- the entry
// carries nulls rather than a guess, because a number nobody stated is a
// number somebody will later read as a measurement.
//
// **A block is believed only for the machine it was read on.** Every block
// records the scope it was read for, and a block whose scope is not the
// current one is unread rather than stale: a seat's catalog says nothing
// about a different seat, and no age makes it say more.
//
// **Reading is total.** A missing file, a torn one, or a block written by a
// schema this router does not know is *not read yet*. This file sits on a
// developer's machine where nothing guards it, and a framework that stops
// over it would be stopping over a record it can rebuild for free.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { VERSION } from "./version.ts";

/** The shape this router writes and the only one it reads. */
export const CATALOG_SCHEMA_VERSION = 1;

export const CATALOG_FILENAME = "ai-model-catalog.json";

/** The directory name under the platform's own per-user data root. */
export const CATALOG_DIR_NAME = "dabbler";

/** The two transports a block can be written for. */
export const TRANSPORT_SEAT = "copilot-cli";
export const TRANSPORT_API = "api";

/** Where a block's models came from, in the words of the read that made it. */
export const SOURCE_SEAT = "acp-session-new";
export const SOURCE_API = "vendor-enumeration";

/**
 * The platform that bills a cost, carried beside the number.
 *
 * A bare multiplier has now been read as premium requests by four engines in
 * a row. The unit travels with the measurement or it does not travel.
 */
export const PLATFORM_COPILOT_USAGE = "copilot-usage-multiplier";

/** What a source said a model costs, never what this framework inferred. */
export interface CatalogCost {
  /** The multiplier as a number, for ordering. */
  readonly usage_multiplier: number;
  /** The source's own text for it, for showing. */
  readonly stated_as: string;
  /** Which billing platform charges it. */
  readonly platform: string;
}

/**
 * One model a transport currently lists.
 *
 * `price_category` is the source's own token, verbatim -- `low`, `medium`,
 * `high`, `very_high` on a seat. It is a price and it is stored under the
 * name the source gives it: calling it a capability would be this framework
 * grading a model it cannot judge.
 */
export interface CatalogModel {
  readonly id: string;
  readonly provider: string | null;
  readonly provider_source: string;
  readonly display_name: string | null;
  readonly enabled: boolean;
  readonly price_category: string | null;
  readonly cost: CatalogCost | null;
  readonly listed_at: string;
}

/**
 * A model a transport used to list.
 *
 * An id and a date and nothing else: nothing in here can go stale, because
 * nothing in here is a claim about a model still being served. It answers
 * "where did that model go?" and refuses to answer anything else.
 */
export interface RetiredModel {
  readonly id: string;
  readonly retired_at: string;
}

/**
 * What a block was read for: the seat and CLI on `copilot-cli`, the set of
 * providers whose keys were present on `api`.
 */
export type CatalogScope = Readonly<Record<string, string | readonly string[]>>;

export interface TransportBlock {
  readonly refreshed_at: string;
  readonly source: string;
  /**
   * The version of whatever produced the reading, where it states one.
   *
   * Provenance and not scope: a CLI upgrade is not a different seat, so it
   * must not make a reading unbelievable. It is here because it is free and
   * because "which build said this" is the first question a surprising
   * listing raises.
   */
  readonly source_version?: string;
  readonly scope: CatalogScope;
  readonly models: readonly CatalogModel[];
  readonly retired: readonly RetiredModel[];
}

export interface Catalog {
  readonly schema_version: number;
  readonly written_by: string;
  readonly written_at: string;
  readonly transports: Readonly<Record<string, TransportBlock>>;
}

/**
 * The per-user data root this platform gives an application.
 *
 * `paths.ts` resolves package-relative locations and nothing else, which is
 * the whole reason the catalog it replaced ended up inside an install
 * directory that the next update overwrote.
 */
export function catalogDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  home: string = homedir(),
): string {
  if (platform === "win32") {
    const local = env["LOCALAPPDATA"];
    const base = local && local.length > 0 ? local : join(home, "AppData", "Local");
    return join(base, CATALOG_DIR_NAME);
  }
  const xdg = env["XDG_DATA_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : join(home, ".local", "share");
  return join(base, CATALOG_DIR_NAME);
}

export function catalogPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  home: string = homedir(),
): string {
  return join(catalogDir(env, platform, home), CATALOG_FILENAME);
}

let configuredPath: string | null = null;

/**
 * The one seam: where this machine's catalog is.
 *
 * A test speaks through it rather than through the environment, because a
 * suite that reads the machine it runs on is a suite that fails on somebody
 * else's -- and a suite that wrote through it would be writing into the
 * operator's own catalog.
 */
export function setCatalogPath(path: string | null): void {
  configuredPath = path;
}

/**
 * Where this process reads and writes the catalog.
 *
 * **Under the test runner the machine's own path is refused.** A suite that
 * reads the machine it runs on passes on one machine and fails on the next,
 * and a suite that WRITES it would be editing the operator's record as a
 * side effect of proving something else -- which is how a fixture seat came
 * to sit in a real catalog the first time this was wired. A test says where
 * its catalog is, or it does not get one.
 */
export function currentCatalogPath(): string {
  if (configuredPath !== null) return configuredPath;
  if (process.env["NODE_TEST_CONTEXT"] !== undefined) {
    throw new Error(
      "no catalog path is set: a test may not read or write this machine's " +
        "own model catalog. Call setCatalogPath() with a path under the " +
        "suite's temp root.",
    );
  }
  return catalogPath();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readCost(value: unknown): CatalogCost | null {
  if (!isRecord(value)) return null;
  const multiplier = value["usage_multiplier"];
  const stated = optionalString(value["stated_as"]);
  const platform = optionalString(value["platform"]);
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier)) return null;
  if (stated === null || platform === null) return null;
  return { usage_multiplier: multiplier, stated_as: stated, platform };
}

function readModel(value: unknown): CatalogModel | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value["id"]);
  const listedAt = optionalString(value["listed_at"]);
  if (id === null || listedAt === null) return null;
  return {
    id,
    provider: optionalString(value["provider"]),
    provider_source: optionalString(value["provider_source"]) ?? "",
    display_name: optionalString(value["display_name"]),
    enabled: value["enabled"] !== false,
    price_category: optionalString(value["price_category"]),
    cost: readCost(value["cost"]),
    listed_at: listedAt,
  };
}

function readRetired(value: unknown): RetiredModel | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value["id"]);
  const retiredAt = optionalString(value["retired_at"]);
  if (id === null || retiredAt === null) return null;
  return { id, retired_at: retiredAt };
}

function readScope(value: unknown): CatalogScope | null {
  if (!isRecord(value)) return null;
  const scope: Record<string, string | readonly string[]> = {};
  for (const [key, held] of Object.entries(value)) {
    if (typeof held === "string") {
      scope[key] = held;
    } else if (Array.isArray(held) && held.every((item) => typeof item === "string")) {
      scope[key] = held as readonly string[];
    } else {
      return null;
    }
  }
  return scope;
}

function readBlockValue(value: unknown): TransportBlock | null {
  if (!isRecord(value)) return null;
  const refreshedAt = optionalString(value["refreshed_at"]);
  const source = optionalString(value["source"]);
  const sourceVersion = optionalString(value["source_version"]);
  const scope = readScope(value["scope"]);
  const models = value["models"];
  const retired = value["retired"];
  if (refreshedAt === null || source === null || scope === null) return null;
  if (!Array.isArray(models) || !Array.isArray(retired)) return null;
  const readModels = models.map(readModel);
  const readRetireds = retired.map(readRetired);
  if (readModels.some((entry) => entry === null)) return null;
  if (readRetireds.some((entry) => entry === null)) return null;
  return {
    refreshed_at: refreshedAt,
    source,
    ...(sourceVersion === null ? {} : { source_version: sourceVersion }),
    scope,
    models: readModels as CatalogModel[],
    retired: readRetireds as RetiredModel[],
  };
}

/**
 * The catalog on disk, or `null` for *not read yet*.
 *
 * Every failure is the same answer, because to a caller they are the same
 * fact: this machine does not have a reading, and the refresh that makes one
 * is free.
 */
export function readCatalog(path: string = currentCatalogPath()): Catalog | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed["schema_version"] !== CATALOG_SCHEMA_VERSION) return null;
  const transports = parsed["transports"];
  if (!isRecord(transports)) return null;
  const blocks: Record<string, TransportBlock> = {};
  for (const [transport, value] of Object.entries(transports)) {
    const block = readBlockValue(value);
    // One torn block is one transport unread, not the whole file lost: the
    // other transport's reading is still a true reading of this machine.
    if (block !== null) blocks[transport] = block;
  }
  return {
    schema_version: CATALOG_SCHEMA_VERSION,
    written_by: optionalString(parsed["written_by"]) ?? "",
    written_at: optionalString(parsed["written_at"]) ?? "",
    transports: blocks,
  };
}

function scopeKey(scope: CatalogScope): string {
  const normalized = Object.keys(scope)
    .sort()
    .map((key): [string, string | readonly string[]] => {
      const held = scope[key] as string | readonly string[];
      return [key, Array.isArray(held) ? [...held].sort() : held];
    });
  return JSON.stringify(normalized);
}

/** Whether two scopes name the same machine, whatever order they were written in. */
export function sameScope(left: CatalogScope, right: CatalogScope): boolean {
  return scopeKey(left) === scopeKey(right);
}

/**
 * The block for one transport, or `null` when this machine has no reading of
 * it that it may believe.
 *
 * **The only way to read a block.** A block read for another scope is unread,
 * not stale, and it is unread to EVERY reader: what routes, what a pane
 * offers, what drift knows about, and how old this machine's reading is. An
 * unscoped reader existed here for one round of session 150 and the verifier
 * was right about it -- it let a mismatched block be scheduled for a later
 * refresh while still being believed in the meantime, so a refresh that
 * failed left another seat's models dispatchable. That is the exact
 * wrong-seat authority this file exists to end, which is why there is no
 * second reading to reach for.
 */
export function blockFor(
  catalog: Catalog | null,
  transport: string,
  scope: CatalogScope,
): TransportBlock | null {
  const block = catalog?.transports[transport];
  if (block === undefined) return null;
  return sameScope(block.scope, scope) ? block : null;
}

export interface FoldResult {
  readonly models: readonly CatalogModel[];
  readonly retired: readonly RetiredModel[];
}

/**
 * A fresh listing folded onto what this transport held before.
 *
 * A model the listing still names keeps the date it was first seen; one it no
 * longer names leaves `models` and gains a retirement date; one that comes
 * back leaves `retired` and is listed again. What an operator opens is what
 * they can use.
 */
export function foldListing(
  previous: TransportBlock | null,
  listing: readonly CatalogModel[],
  at: string,
): FoldResult {
  const held = new Map((previous?.models ?? []).map((entry) => [entry.id, entry]));
  const listedIds = new Set(listing.map((entry) => entry.id));
  const models = listing.map((entry) => ({
    ...entry,
    listed_at: held.get(entry.id)?.listed_at ?? entry.listed_at,
  }));
  const retired: RetiredModel[] = [];
  for (const entry of previous?.retired ?? []) {
    if (!listedIds.has(entry.id)) retired.push(entry);
  }
  for (const entry of previous?.models ?? []) {
    if (!listedIds.has(entry.id)) retired.push({ id: entry.id, retired_at: at });
  }
  return { models, retired };
}

/** Seconds precision, matching every other stamp this framework writes. */
export function catalogNow(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d+Z$/, "Z");
}

export interface WriteBlockOptions {
  readonly path?: string;
  readonly at?: string;
}

/**
 * Replace one transport's block and leave every other block standing.
 *
 * A machine with a seat and no provider keys refreshes the seat and must not
 * empty the `api` block on its way past: the block it did not read is not a
 * block it disproved.
 */
export function writeBlock(
  transport: string,
  block: TransportBlock,
  options: WriteBlockOptions = {},
): Catalog {
  const path = options.path ?? currentCatalogPath();
  const at = options.at ?? catalogNow();
  const existing = readCatalog(path);
  const catalog: Catalog = {
    schema_version: CATALOG_SCHEMA_VERSION,
    written_by: `dabbler-ai-router ${VERSION}`,
    written_at: at,
    transports: { ...(existing?.transports ?? {}), [transport]: block },
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog;
}

/** When this machine last refreshed anything, or `null` for *not read yet*. */
export function lastRefreshedAt(catalog: Catalog | null): string | null {
  const stamps = Object.values(catalog?.transports ?? {})
    .map((block) => block.refreshed_at)
    .filter((stamp) => stamp.length > 0)
    .sort();
  return stamps.length > 0 ? (stamps[stamps.length - 1] as string) : null;
}

/** Whether this machine has a catalog file at all, for a surface that says so. */
export function catalogPresent(path: string = currentCatalogPath()): boolean {
  return existsSync(path);
}
