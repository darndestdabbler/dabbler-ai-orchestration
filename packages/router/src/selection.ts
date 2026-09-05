// Selection by role: the one rule both transports resolve candidates through.
//
// A role declares two things and nothing else -- **the provider set it may
// draw from**, which is a hard filter, and **a preference order**, which is
// ordering only. A model absent from the preference list still qualifies; it
// sorts after the named ones. That is the whole reason the list is not the
// candidate universe: a preference list that has gone stale costs a slightly
// older model and never costs a candidate.
//
// The transports differ only in what they can enumerate -- the model registry
// on the direct-API path, the confirmed seat catalog on the Copilot path.
// Both hand their enumeration to `resolveRole`, so the rule has one
// implementation.
//
// A provider whose key does not resolve is not a candidate anywhere:
// selection can never land on a model the process could not call.

import { truthy, type RouterConfig } from "./config.ts";
import { normalizeModelToken } from "./contracts/models.ts";
import { resolveSecret } from "./secretResolver.ts";

export const ROLE_GENERATOR = "generator";
export const ROLE_VERIFIER = "verifier";

/**
 * A candidate as a transport enumerates it: the model id the preference
 * order names, that model's provider, and anything the transport carries
 * along -- the registry alias, on the direct-API path.
 */
export type Candidate = readonly [string, string, ...unknown[]];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * `entry.get(key, True)` under Python's truthiness.
 *
 * `??` is not this: a key written as `enabled:` with no value loads as null,
 * which Python reads as off and `?? true` would read as on.
 */
function flagOn(entry: Record<string, unknown>, key: string): boolean {
  return truthy(key in entry ? entry[key] : true);
}

/**
 * True when `providerName` is configured, enabled, and its API key resolves.
 * A keyless provider cannot be dispatched to, so it is not a candidate
 * anywhere.
 */
export function providerReachable(
  config: RouterConfig,
  providerName: string,
): boolean {
  const provider = record(config["providers"])[providerName];
  if (!isRecord(provider) || !flagOn(provider, "enabled")) return false;
  const envVar = provider["api_key_env"];
  if (envVar && !resolveSecret(String(envVar))) return false;
  return true;
}

function normalizeProviders(providers: unknown): Set<string> {
  const out = new Set<string>();
  for (const provider of Array.isArray(providers) ? providers : []) {
    if (!provider) continue;
    out.add(String(provider).trim().toLowerCase());
  }
  return out;
}

export interface RoleDeclaration {
  readonly prefer: readonly string[];
  readonly permitted: ReadonlySet<string>;
}

/**
 * The preference order and the permitted providers for `role`.
 *
 * An undeclared role resolves to no preference and no provider restriction,
 * which is every reachable candidate in declared order. Refusing here would
 * make a role a thing that has to be declared before it can be asked for,
 * and the preference order is an optimisation rather than a permission.
 */
export function roleDeclaration(
  config: RouterConfig,
  role: string,
): RoleDeclaration {
  const roleConfig = record(record(config["roles"])[role]);
  const preferRaw = roleConfig["prefer"];
  const prefer = (Array.isArray(preferRaw) ? preferRaw : []).map((id) => String(id));
  return { prefer, permitted: normalizeProviders(roleConfig["require_provider_in"]) };
}

/**
 * Normalized ids the registry does not trust to review another model's
 * output.
 *
 * Trust is a property of the model, not of the path that reaches it. The
 * seat catalog carries no such flag, so without this the seat could verify
 * with a model the registry explicitly marks untrusted -- the exact gap the
 * flag exists to close. A model the registry says nothing about stays
 * eligible: an absent record is unknown, never unsupported, and a hard
 * filter on missing metadata would end cross-vendor verification by
 * accident.
 */
function untrustedAsVerifier(config: RouterConfig): Set<string> {
  const tokens = new Set<string>();
  for (const [alias, entry] of Object.entries(record(config["models"]))) {
    if (!isRecord(entry)) continue;
    if (flagOn(entry, "is_enabled_as_verifier")) continue;
    tokens.add(normalizeModelToken(alias));
    if (entry["model_id"]) tokens.add(normalizeModelToken(String(entry["model_id"])));
  }
  return tokens;
}

/**
 * The candidates that survive `role`, in preference order.
 *
 * Survival is the role's provider set, the caller's exclusion, and -- for
 * the verifier role -- the registry's judgment about which models may review
 * another's work. The preference order only sorts, and the sort is stable,
 * so candidates the order does not name keep the sequence the transport
 * enumerated them in.
 */
export function resolveRole<T extends Candidate>(
  config: RouterConfig,
  role: string,
  candidates: readonly T[],
  excludeProviders: readonly string[] | null = null,
): T[] {
  return explainRole(config, role, candidates, excludeProviders).candidates;
}

/** Why a candidate is not here: the rule that removed it, and nothing else. */
export const REMOVED_EXCLUDED_PROVIDER = "excluded-provider";
export const REMOVED_NOT_PERMITTED = "not-permitted";
export const REMOVED_UNTRUSTED_VERIFIER = "untrusted-verifier";
export const REMOVED_NO_PROVIDER = "no-provider";

export interface RemovedCandidate {
  readonly model: string;
  readonly provider: string;
  readonly rule: string;
}

/**
 * How the chosen candidate was reached.
 *
 * `rank` is its place in the role's `prefer` order. `null` means the order
 * does not name it and it was reached by falling PAST the end of one -- a
 * different fact from "there is no order", which is `preferenceDeclared:
 * false`. The 364-request session is the reason the difference is worth
 * carrying: a weight-14 model no order named verified a session that had
 * named a weight-1 one, and the record could only say which model answered.
 */
export interface RoleResolution<T> {
  readonly candidates: T[];
  readonly preferenceDeclared: boolean;
  /** The chosen candidate's rank, or null when nothing survived or it was unranked. */
  readonly rank: number | null;
  /** True when a preference order is declared and the chosen candidate is outside it. */
  readonly fellThrough: boolean;
  readonly removed: readonly RemovedCandidate[];
}

/**
 * `resolveRole`, with what it discarded on the way.
 *
 * The selection rule is unchanged and lives here once; `resolveRole` is the
 * projection of this for every caller that only wants the list. The removals
 * are recorded per rule rather than counted, because "no trusted verifier
 * was reachable" and "every candidate was on the excluded provider" are
 * different problems with different answers, and a round that says only
 * which model answered can distinguish neither.
 */
export function explainRole<T extends Candidate>(
  config: RouterConfig,
  role: string,
  candidates: readonly T[],
  excludeProviders: readonly string[] | null = null,
): RoleResolution<T> {
  const { prefer, permitted } = roleDeclaration(config, role);
  const exclude = normalizeProviders(excludeProviders);
  const untrusted = role === ROLE_VERIFIER ? untrustedAsVerifier(config) : new Set<string>();
  const removed: RemovedCandidate[] = [];
  const surviving = candidates.filter((candidate) => {
    const provider = candidate[1];
    const model = String(candidate[0]);
    const drop = (rule: string): false => {
      removed.push({ model, provider: String(provider ?? ""), rule });
      return false;
    };
    if (!provider) return drop(REMOVED_NO_PROVIDER);
    if (exclude.has(provider)) return drop(REMOVED_EXCLUDED_PROVIDER);
    if (permitted.size > 0 && !permitted.has(provider)) return drop(REMOVED_NOT_PERMITTED);
    if (untrusted.size > 0 && untrusted.has(normalizeModelToken(model))) {
      return drop(REMOVED_UNTRUSTED_VERIFIER);
    }
    return true;
  });
  const rank = new Map(prefer.map((modelId, index) => [modelId, index]));
  // `Array.prototype.sort` is stable in every engine this runs on, which is
  // what makes an unranked candidate keep its enumerated position -- the
  // same guarantee Python's `sorted` gives.
  const ordered = surviving
    .slice()
    .sort(
      (left, right) =>
        (rank.get(left[0]) ?? prefer.length) - (rank.get(right[0]) ?? prefer.length),
    );
  const chosen = ordered[0];
  const chosenRank = chosen === undefined ? undefined : rank.get(chosen[0]);
  return {
    candidates: ordered,
    preferenceDeclared: prefer.length > 0,
    rank: chosenRank ?? null,
    fellThrough: prefer.length > 0 && chosen !== undefined && chosenRank === undefined,
    removed,
  };
}

/**
 * What to tell the operator when a role fell past its own preference order.
 *
 * Null when nothing needs saying, which is every ordinary round. The
 * sentence names the model that will answer, the order it is not in, and
 * what removed the ones that were -- because "your preference order is
 * stale" and "every model you named is on the provider this round excludes"
 * are different problems and only one of them is worth editing config over.
 *
 * A warning rather than a refusal. A hard filter would end cross-provider
 * verification the first time an order named only excluded providers, which
 * is the ordinary shape of a two-provider repository; and the module's own
 * trust rule already holds that an absent record is unknown rather than
 * unsupported. What was wrong was never that the fall-through happens -- it
 * is that it happened in a sort order nobody could see, and a session was
 * billed 364 premium requests before anyone could ask why.
 */
export function fellThroughWarning<T extends Candidate>(
  resolution: RoleResolution<T>,
  role: string,
): string | null {
  if (!resolution.fellThrough) return null;
  const chosen = resolution.candidates[0];
  if (chosen === undefined) return null;
  const rules = [...new Set(resolution.removed.map((row) => row.rule))];
  const because =
    rules.length === 0
      ? "the order names no reachable model"
      : `the models it names were removed: ${rules.join(", ")}`;
  return (
    `the '${role}' role fell past its preference order and resolved to ` +
    `'${chosen[0]}' (${chosen[1]}), which the order does not name -- ${because}`
  );
}

/**
 * Registry aliases that survive `role`, in preference order.
 *
 * The direct-API path's enumeration. An entry qualifies when it is enabled
 * and its provider is enabled with a resolvable API key; the role itself,
 * including the verifier-trust rule, is applied by `resolveRole`.
 */
export function registryCandidates(
  config: RouterConfig,
  role: string,
  excludeProviders: readonly string[] | null = null,
): string[] {
  return explainRegistryCandidates(config, role, excludeProviders).candidates.map(
    ([, , alias]) => alias,
  );
}

/**
 * Every registry entry a role could draw on, before the role is applied.
 *
 * Enabled, with a named provider, and that provider reachable -- selection
 * can never land on a model the process could not call.
 */
function registryEnumeration(
  config: RouterConfig,
): Array<readonly [string, string, string]> {
  const reachable = new Map<string, boolean>();
  const candidates: Array<readonly [string, string, string]> = [];
  for (const [alias, entry] of Object.entries(record(config["models"]))) {
    if (!isRecord(entry) || !flagOn(entry, "is_enabled")) continue;
    const provider = String(entry["provider"] ?? "").trim().toLowerCase();
    if (!provider) continue;
    if (!reachable.has(provider)) {
      reachable.set(provider, providerReachable(config, provider));
    }
    if (!reachable.get(provider)) continue;
    candidates.push([String(entry["model_id"] ?? alias), provider, alias]);
  }
  return candidates;
}

/**
 * The same enumeration, with how the role resolved over it.
 *
 * Split from `registryCandidates` rather than duplicated: the enumeration
 * rule -- enabled entry, named provider, reachable provider -- has one home,
 * and the caller that wants to WARN about the resolution reads the same list
 * the caller that wants to dispatch reads.
 */
export function explainRegistryCandidates(
  config: RouterConfig,
  role: string,
  excludeProviders: readonly string[] | null = null,
): RoleResolution<readonly [string, string, string]> {
  return explainRole(config, role, registryEnumeration(config), excludeProviders);
}
