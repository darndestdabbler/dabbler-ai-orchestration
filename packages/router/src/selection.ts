// Selection by role: the one rule both transports resolve candidates through.
//
// A role declares two things and nothing else -- **the provider set it may
// draw from**, which is a hard filter, and **a preference order**, which is
// ordering only. A model absent from the preference list still qualifies; it
// sorts after the named ones. That is the whole reason the list is not the
// candidate universe: a preference list that has gone stale costs a slightly
// older model and never costs a candidate.
//
// The transports differ only in which block of this machine's catalog is
// theirs -- the seat's on the Copilot path, the vendors' on the direct-API
// one. Both hand their enumeration to `resolveRole`, so the rule has one
// implementation, and neither has an alias: the id a source lists is the id
// that goes on the wire.
//
// A provider whose key does not resolve is not a candidate anywhere:
// selection can never land on a model the process could not call.

import { truthy, type RouterConfig } from "./config.ts";
import { normalizeModelToken } from "./contracts/models.ts";
import { resolveSecret } from "./secretResolver.ts";

export const ROLE_VERIFIER = "verifier";

/**
 * A candidate as a transport enumerates it: the model id the preference
 * order names, that model's provider, and anything the transport carries
 * along.
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
  /**
   * The one model a person chose for this role, or null where nobody did.
   *
   * A pin is not a preference. `prefer` is an order and a stale entry in it
   * costs a slightly older model; a pin is an instruction, and the runtime
   * either honours it or stops. It exists because the surface used to write
   * a choice to the front of `prefer` while the dispatch resolved the same
   * role with the authoring model's provider excluded -- so a deliberately
   * chosen same-provider verifier was dropped at dispatch, something else
   * answered, and nothing anywhere said so.
   */
  readonly pin: string | null;
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
  const pinRaw = roleConfig["pin"];
  const pin = typeof pinRaw === "string" && pinRaw.trim() !== "" ? pinRaw.trim() : null;
  return { prefer, permitted: normalizeProviders(roleConfig["require_provider_in"]), pin };
}

/**
 * The providers a call may not draw from, once the role's own pin is read.
 *
 * **A default is not an override of a person.** Where nobody pinned, a role
 * resolving on its own still prefers a different provider, and the caller's
 * exclusion is what says so. Where somebody pinned, the exclusion is a
 * default they have already answered, so it is dropped -- and the pin either
 * dispatches or stops visibly, which is the whole difference between an
 * instruction and a preference.
 *
 * One home, because two would disagree: the ladder is built from it and the
 * assertion immediately before the wire re-checks it.
 */
export function effectiveExclusion(
  config: RouterConfig,
  role: string,
  requested: readonly string[] | null,
): string[] {
  if (roleDeclaration(config, role).pin !== null) return [];
  return [...normalizeProviders(requested)].sort();
}

/**
 * The candidates that survive `role`, in preference order.
 *
 * Survival is the role's provider set and the caller's exclusion, and
 * nothing else: which model may review which is a judgement this framework
 * does not make from data it does not have. The preference order only sorts,
 * and the sort is stable, so candidates the order does not name keep the
 * sequence the transport enumerated them in.
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
  /** The model a person chose for this role, or null where nobody did. */
  readonly pin: string | null;
  /** The pinned model, when this machine cannot dispatch to it. */
  readonly pinUnmet: string | null;
}

/**
 * `resolveRole`, with what it discarded on the way.
 *
 * The selection rule is unchanged and lives here once; `resolveRole` is the
 * projection of this for every caller that only wants the list. The removals
 * are recorded per rule rather than counted, because "nothing this machine
 * lists survived" and "every candidate was on the excluded provider" are
 * different problems with different answers, and a round that says only
 * which model answered can distinguish neither.
 */
export function explainRole<T extends Candidate>(
  config: RouterConfig,
  role: string,
  candidates: readonly T[],
  excludeProviders: readonly string[] | null = null,
): RoleResolution<T> {
  const { prefer, permitted, pin } = roleDeclaration(config, role);
  // A pin answers the caller's exclusion rather than being filtered by it.
  const exclude = pin === null ? normalizeProviders(excludeProviders) : new Set<string>();
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
    return true;
  });
  const rank = new Map(prefer.map((modelId, index) => [modelId, index]));
  // `Array.prototype.sort` is stable in every engine this runs on, which is
  // what makes an unranked candidate keep its enumerated position -- the
  // same guarantee Python's `sorted` gives.
  const sorted = surviving
    .slice()
    .sort(
      (left, right) =>
        (rank.get(left[0]) ?? prefer.length) - (rank.get(right[0]) ?? prefer.length),
    );
  // A pin is one model or none. It is NOT the head of a ladder: falling from
  // a pinned model to the next candidate is the silent substitution the pin
  // exists to stop, so an unmet pin resolves to nothing and the caller says
  // so out loud.
  const ordered =
    pin === null
      ? sorted
      : sorted.filter(
          (candidate) => normalizeModelToken(String(candidate[0])) === normalizeModelToken(pin),
        );
  const chosen = ordered[0];
  const chosenRank = chosen === undefined ? undefined : rank.get(chosen[0]);
  return {
    candidates: ordered,
    preferenceDeclared: prefer.length > 0,
    rank: chosenRank ?? null,
    fellThrough: prefer.length > 0 && chosen !== undefined && chosenRank === undefined,
    removed,
    pin,
    // A pin nothing satisfies: the caller turns this into a stop that names
    // the model, rather than dispatching to whatever was next.
    pinUnmet: pin !== null && chosen === undefined ? pin : null,
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

// --- What a verifying model may be -----------------------------------------
//
// One rule survives, and it is the only one that needs no judgement this
// framework cannot make: **the verifying model may not be the authoring
// model.** Two strings compared -- no capability data, no provider
// inference, no registry.
//
// It is stated with its limit, because the limit is the honest part. It
// stops a model reviewing its own literal output, and it does NOT stop
// correlated review: `gpt-5.6-sol` and `gpt-5.6-terra` are different ids and
// very likely the same base model, and a rule that pretended to know
// otherwise would be grading models on data nobody has. That judgement is
// the developer's, and the surface labels the pair rather than refusing it.

/**
 * Why this model may not verify that one, or null when it may.
 *
 * Ids are compared under the framework's one spelling rule, so a dated pin
 * and its alias are the same model here -- which is the case the comparison
 * exists for, since that is how a person picks the same model twice without
 * noticing.
 */
export function verifierRefusal(author: string, verifier: string): string | null {
  if (normalizeModelToken(author) !== normalizeModelToken(verifier)) return null;
  return (
    `'${verifier}' cannot verify '${author}': they are the same model, and a ` +
    "model reviewing its own literal output is the one thing a second " +
    "opinion cannot be. Choosing a different model from the same provider " +
    "is allowed and is labelled as such -- whether two models of one family " +
    "share a blind spot is a judgement this framework has no data to make."
  );
}

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
