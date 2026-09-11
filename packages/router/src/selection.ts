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

import { capabilityTiers, truthy, type RouterConfig } from "./config.ts";
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

// --- What a verifying model may be -----------------------------------------
//
// Two constraints, and a surface that offers a person a verifier has to hold
// its offer to both. Neither is invented here: the first is an invariant of
// dispatch already, and this reads it rather than restating it; the second is
// an ORDER declared in the registry, so what "not much weaker" means is data
// a vendor's next release can revise rather than a comparison compiled into a
// function where it would quietly go stale.

/**
 * Where a model sits in the declared order, or null when nothing says.
 *
 * Null is the common answer and it is not a failure: a registry that has
 * ranked nothing, or a model added before anybody ranked it, both land here,
 * and both mean the same thing -- there is no floor to apply.
 */
export function tierRank(config: RouterConfig, alias: string): number | null {
  const entry = record(record(config["models"])[alias]);
  const tier = entry["capability_tier"];
  if (typeof tier !== "string" || tier === "") return null;
  const rank = capabilityTiers(config).indexOf(tier);
  return rank < 0 ? null : rank;
}

/**
 * Why this model may not verify that one, or null when it may.
 *
 * **The cross-provider half is not decided here.** The verifying role is
 * resolved with the authoring model's provider excluded -- the same call the
 * dispatch makes, applying the same exclusion it asserts again immediately
 * before the wire -- and a model that is not among the survivors is refused
 * with the rule that removed it. A second copy of "not the same provider"
 * written in this function is exactly the drift the invariant cannot afford:
 * it is load-bearing, and a copy of it would be the one that goes stale.
 *
 * The tier half is applied only where BOTH models declare one. An absent
 * record is unknown and never unsupported, and a floor that refused over
 * missing metadata would end cross-vendor verification the first week a
 * vendor shipped a model nobody had ranked.
 */
export function verifierRefusal(
  config: RouterConfig,
  authorAlias: string,
  verifierAlias: string,
): string | null {
  const models = record(config["models"]);
  const authorProvider = String(record(models[authorAlias])["provider"] ?? "");
  const resolution = explainRegistryCandidates(
    config,
    ROLE_VERIFIER,
    authorProvider === "" ? null : [authorProvider],
  );
  if (!resolution.candidates.some(([, , alias]) => alias === verifierAlias)) {
    const verifierId = String(record(models[verifierAlias])["model_id"] ?? verifierAlias);
    const removed = resolution.removed.find((row) => row.model === verifierId);
    return (
      `'${verifierAlias}' cannot verify '${authorAlias}': ` +
      (removed === undefined
        ? "it is not a model this configuration can dispatch to -- it is " +
          "absent from the registry, disabled, or its provider has no key."
        : REMOVAL_REASONS[removed.rule] ??
          `the '${ROLE_VERIFIER}' role removed it (${removed.rule}).`)
    );
  }
  const authorRank = tierRank(config, authorAlias);
  const verifierRank = tierRank(config, verifierAlias);
  if (authorRank === null || verifierRank === null) return null;
  if (verifierRank <= authorRank) return null;
  const tiers = capabilityTiers(config);
  return (
    `'${verifierAlias}' cannot verify '${authorAlias}': the registry ranks ` +
    `it '${tiers[verifierRank]}' and the authoring model '${tiers[authorRank]}', ` +
    "and a review is worth what the reviewer is."
  );
}

/** What each removal rule means to the person who chose the model. */
const REMOVAL_REASONS: Record<string, string> = {
  [REMOVED_EXCLUDED_PROVIDER]:
    "it is on the authoring model's own provider, and cross-provider review " +
    "is an invariant of this framework rather than a preference.",
  [REMOVED_UNTRUSTED_VERIFIER]:
    "the registry marks it is_enabled_as_verifier: false, so it is not " +
    "trusted to review another model's output.",
  [REMOVED_NOT_PERMITTED]:
    "its provider is outside the set the verifier role may draw from.",
  [REMOVED_NO_PROVIDER]: "it names no provider.",
};

// --- Whether the model asked for is the model that answered ---------------
//
// A surface that offers a person a list of models is offering something it
// has to have evidence for: an operator who chooses, is shown their choice,
// and pays for a different model has been told something untrue by a screen
// this repository wrote. It has happened once, at fourteen times the price.
//
// The evidence already exists and is not gathered here. A verification round
// records `requested_model` beside `served_model`; the Copilot seat catalog
// records `echoed_model` beside each `id`. What was missing is the reading,
// and `docs/model-fidelity.md` is what the reading currently says.

/** The record shows this model answering as itself. */
export const FIDELITY_HONOURED = "honoured";
/** The record shows this model answering as a DIFFERENT model. */
export const FIDELITY_SUBSTITUTED = "substituted";
/** The record shows nothing either way. Never read as either of the above. */
export const FIDELITY_UNKNOWN = "not-known";

export type Fidelity =
  | typeof FIDELITY_HONOURED
  | typeof FIDELITY_SUBSTITUTED
  | typeof FIDELITY_UNKNOWN;

/**
 * The provider's own statement of what answered, read out of its response
 * body. A provider that served a different model said so itself.
 */
export const EVIDENCE_SERVED = "served";
/**
 * A CLI seat's echo of the model it was asked for. **It is a label**, and a
 * seat label is the one thing this framework has always declined to trust --
 * a seat that ignored `--model` and echoed the request back produces an echo
 * indistinguishable from an honoured one.
 */
export const EVIDENCE_ECHO = "echo";

export type EvidenceKind = typeof EVIDENCE_SERVED | typeof EVIDENCE_ECHO;

/**
 * One observation: what was asked for, what answered, and how that was
 * learned.
 *
 * `served` is null when the source did not say, which is NOT the same fact
 * as "it served what was asked" and never collapses into it.
 *
 * `evidence` is not decoration. The two kinds do not weigh the same and the
 * asymmetry is the whole rule: see `modelFidelity`.
 */
export interface ModelObservation {
  readonly requested: string;
  readonly served: string | null;
  readonly evidence: EvidenceKind;
}

/**
 * Whether a served id is the requested model under a dated pin.
 *
 * A provider answering `<model>-20260901` for `<model>` served the model
 * that was asked for; the transport's own note calls a dated-snapshot pin
 * routine, and a reading that called it a substitution would make the one
 * warning that matters routine too. The remainder has to LOOK like a date --
 * anything else is another model, and `gpt-5.4` against `gpt-5.4-mini` is
 * exactly the case a bare prefix test would get wrong.
 */
function datedPinOf(requested: string, served: string): boolean {
  if (!served.startsWith(requested)) return false;
  // Both spellings vendors actually use, which session 144's probe found out
  // by asking: OpenAI answered `gpt-5.4-mini` with `gpt-5.4-mini-2026-03-17`,
  // and a bare-digit rule would have called that a substitution and put a
  // warning in front of an operator on the most routine thing a provider
  // does. Anything that is not a date is another model.
  const suffix = served.slice(requested.length);
  const shaped = /^[-@](?:(\d{4})-(\d{2})-(\d{2})|(\d{4})(\d{2})(\d{2})|\d{6})$/.exec(suffix);
  if (shaped === null) return false;
  const month = shaped[2] ?? shaped[5];
  const day = shaped[3] ?? shaped[6];
  // Date-SHAPED is not a date. `-2026-99-99` is a suffix no vendor's release
  // calendar can produce, so reading it as a pin would let a model id that
  // merely looks like one pass as the model asked for.
  if (month === undefined || day === undefined) return true;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  return monthNumber >= 1 && monthNumber <= 12 && dayNumber >= 1 && dayNumber <= 31;
}

/**
 * What the record says about one model on one transport: honoured,
 * substituted, or not known.
 *
 * **Three answers, and the third is the reason this exists.** A model nobody
 * has ever asked for and a model that answered as something else are
 * different facts, and a reading that returned a boolean would have to call
 * one of them the other -- which is how a list comes to be shown with a
 * confidence nothing earned.
 *
 * One substitution outweighs any number of matches. A model that has once
 * answered as another is a model that can, and the operator deciding what to
 * spend on it is owed the exception rather than the average.
 *
 * **The two kinds of evidence are asymmetric, and this is the rule that
 * matters.** An echo can establish a SUBSTITUTION and can never establish
 * fidelity. A seat naming a different model than the one asked for is the
 * seat testifying against its own interest, and is believed; a seat naming
 * the model that was asked for is a seat that would print exactly that
 * whether it honoured the flag or ignored it, and a reading that called it
 * `honoured` would hand a later surface a confidence nothing earned. Only a
 * served id -- the provider's own statement, read out of its response body
 * -- establishes that the model asked for is the model that answered.
 */
export function modelFidelity(
  model: string,
  observations: readonly ModelObservation[],
): Fidelity {
  const mine = observations.filter((seen) => seen.requested === model);
  const said = mine.filter((seen) => seen.served !== null && seen.served !== "");
  if (said.length === 0) return FIDELITY_UNKNOWN;
  const substituted = said.some(
    (seen) => seen.served !== model && !datedPinOf(model, seen.served as string),
  );
  if (substituted) return FIDELITY_SUBSTITUTED;
  // Matches only. They are worth something only if a provider said them.
  return said.some((seen) => seen.evidence === EVIDENCE_SERVED)
    ? FIDELITY_HONOURED
    : FIDELITY_UNKNOWN;
}

/**
 * The one transport whose `served_model` is the provider's own word. Named
 * as the allowed case rather than as the excluded one: a transport added
 * later is an echo until somebody shows it is not.
 */
const PROVIDER_STATED_TRANSPORT = "api";

/**
 * A round's requested/served pair as an observation, with the evidence kind
 * its TRANSPORT makes it.
 *
 * **A round's `served_model` is not one kind of fact.** On the direct-API
 * path it is read out of the provider's response body; on a Copilot seat it
 * is the CLI's echo, carried into the same field by the same code path. A
 * reading that called every round's pair a provider's statement would launder
 * an echo into evidence simply by having a round wrapped around it -- which
 * is the very substitution this whole reading exists to refuse, made one
 * level up. Round 2 of session 144 found it doing exactly that.
 *
 * A round that does not say which transport it ran on is treated as a seat's:
 * the weaker reading is the safe one, and an unlabelled round is old rather
 * than trustworthy.
 */
export function roundObservations(
  rounds: readonly {
    readonly requested_model?: unknown;
    readonly served_model?: unknown;
    readonly transport?: unknown;
  }[],
): ModelObservation[] {
  const seen: ModelObservation[] = [];
  for (const round of rounds) {
    if (typeof round.requested_model !== "string" || round.requested_model === "") continue;
    seen.push({
      requested: round.requested_model,
      served: typeof round.served_model === "string" && round.served_model !== ""
        ? round.served_model
        : null,
      evidence:
        round.transport === PROVIDER_STATED_TRANSPORT ? EVIDENCE_SERVED : EVIDENCE_ECHO,
    });
  }
  return seen;
}
