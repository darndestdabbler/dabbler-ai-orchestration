// The projection the Solution Explorer reads: the module manifest, joined
// to what the tree and the sibling repositories say.
//
// The extension renders; the router decides. The extension never reads the
// manifest or the sibling repositories itself, because two implementations
// of one rule disagree eventually and the disagreement shows up as a wrong
// row nobody can explain. Everything here is DERIVED: dependency order and
// `usedBy` from `dependsOn`, the contract folder from the disk, the drift
// rows from build files read on every projection.
//
// A single-module solution -- an absent manifest, or one entry -- projects
// one module row and nothing module-shaped beyond it, which is the shape of
// every repository that predates the manifest.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { readModuleSessionMarker } from "./checkout.ts";
import { normalizeModelToken } from "./contracts/models.ts";
import {
  TRANSPORT_API,
  TRANSPORT_COPILOT_CLI,
  explainAuthoringModel,
  explainReviewingTransport,
  explainTransport,
  loadConfig,
  type RouterConfig,
} from "./config.ts";
import {
  CATALOG_REFRESH_COMMAND,
  REFRESH_COST,
  apiBlock,
  apiSelectableModels,
  checkFreshness,
  isStale,
  transportPresence,
  type FreshnessRow,
  type RetiredModel,
} from "./discovery.ts";
import { engineAliases, installedEngines } from "./engines.ts";
import { sessionsDirFor } from "./evidence.ts";
import { readExposure } from "./exposure.ts";
import { platformNewlines } from "./journal.ts";
import { PREFERENCES_FILENAME, chosenEngine } from "./preferences.ts";
import { dumps } from "./pythonJson.ts";
import { readBundleRecords } from "./land.ts";
import { type ModuleEntry, type SolutionShape, consumersOf, ManifestError, solutionShape } from "./modules.ts";
import { readRawSessionState } from "./sessionState.ts";
import {
  OUTCOME_PASSED,
  STAGE_FINAL_FULL,
  type SuiteSpec,
  type TestRunRecord,
  loadSuitesChecked,
  readRecords,
} from "./testEvidence.ts";
import {
  assembleSolution,
  locateProducer,
  type Edge,
  type SolutionMember,
} from "./solutionDeps.ts";
import {
  comparePins,
  configuredFeeds,
  publishedVersions,
  reconcileResolution,
} from "./resolution.ts";
import {
  ROLE_AUXILIARY_REVIEWER,
  ROLE_PRIMARY_REVIEWER,
  type ResolveOptions,
  reviewerRefusal,
  type RoleResolution,
} from "./selection.ts";
import { REFRESH_COMMAND, explainRoleCandidates, seatBlock } from "./transports/copilot.ts";

type Node = Record<string, unknown>;

/**
 * The document the Solution Explorer renders: the module graph and what it
 * is joined to, and nothing about configuration.
 *
 * It was `projection.json`, and 98.4% of it was the configuration block --
 * 50,198 bytes of what a session would be run with, against 804 bytes of
 * the module graph the file exists for. Configuration is now asked for
 * directly, by `configurationNode`, at the moment it is rendered: a reading
 * derived when it is read cannot be an older router's output, and nothing
 * in a workspace can watch the user-level catalog and preferences it
 * depends on anyway. The name follows the contents.
 */
export const PROJECTION_RELPATH = join(".dabbler", "solution", "solution.json");

export function projectionPath(root: string): string {
  return join(root, PROJECTION_RELPATH);
}

/** Where a module's contract bundle lives, relative to the root. */
export function contractDirFor(slug: string): string {
  return `modules/${slug}/contract`;
}

/** What the Explorer reads: the manifest, joined to the tree. */
/**
 * The siblings a grant has widened the in-flight session's checkout to, from
 * that session's exposure manifest in this root. Empty where nothing is in
 * flight, or the session is not a module session, or this is not a clone.
 */
function grantedSiblings(root: string): Set<string> {
  try {
    const raw = readRawSessionState(sessionsDirFor(root));
    const sessions = Array.isArray(raw?.["sessions"]) ? (raw?.["sessions"] as Record<string, unknown>[]) : [];
    const current = sessions.find((row) => row["status"] === "in-progress");
    if (current === undefined || typeof current["number"] !== "number") return new Set();
    return new Set((readExposure(root, current["number"])?.grants ?? []).map((grant) => grant.sibling));
  } catch {
    return new Set();
  }
}

/**
 * The modules the in-flight session names, and which session: from this
 * root's ledger row (`checkout.module` in a module's folder, the declared
 * `modules` in a global session), or -- in the repository while a focused
 * session runs in its module's folder -- from the module-session marker,
 * which is the only record the repository holds of it. Null when nothing
 * is in flight here.
 */
function modulesInSession(root: string): { readonly session: number; readonly modules: ReadonlySet<string> } | null {
  try {
    const raw = readRawSessionState(sessionsDirFor(root));
    const sessions = Array.isArray(raw?.["sessions"]) ? (raw?.["sessions"] as Record<string, unknown>[]) : [];
    const current = sessions.find((row) => row["status"] === "in-progress");
    if (current !== undefined && typeof current["number"] === "number") {
      const checkout = current["checkout"];
      const checkoutModule =
        typeof checkout === "object" && checkout !== null && !Array.isArray(checkout)
          ? (checkout as Record<string, unknown>)["module"]
          : null;
      const named =
        typeof checkoutModule === "string" && checkoutModule.trim() !== ""
          ? [checkoutModule.trim()]
          : Array.isArray(current["modules"])
            ? (current["modules"] as unknown[]).map(String)
            : [];
      return { session: current["number"], modules: new Set(named) };
    }
  } catch {
    // An unreadable ledger marks nothing; the marker below may still.
  }
  const marker = readModuleSessionMarker(root);
  return marker === null ? null : { session: marker.session, modules: new Set([marker.module]) };
}

export type RunOfRecordState = "green" | "red" | "none";

/**
 * Each module's run of record and who it blocks, from the latest final-full
 * record of every suite the module declares. Green when every expensive
 * suite of the module has a passed latest record; red when any latest is
 * not passed; none where a suite has no record, or the module declares no
 * suite. A consumer is blocked by a producer when its consumer-contract
 * suite against that producer is red. Nothing here is declared: it is a
 * reading of the records beside the run.
 */
function runsOfRecord(
  root: string,
  shape: SolutionShape,
): Map<string, { readonly state: RunOfRecordState; readonly blocking: string[] }> {
  const out = new Map<string, { state: RunOfRecordState; blocking: string[] }>();
  for (const entry of shape.modules) out.set(entry.slug, { state: "none", blocking: [] });
  if (!shape.multi) return out;
  let suites: readonly SuiteSpec[];
  let records: readonly TestRunRecord[];
  try {
    suites = loadSuitesChecked(loadConfig(undefined, root), { shape }).suites;
    records = readRecords(root);
  } catch {
    return out;
  }
  const latest = (suite: string): TestRunRecord | null =>
    records.filter((row) => row.suite === suite && row.stage === STAGE_FINAL_FULL).at(-1) ?? null;
  for (const entry of shape.modules) {
    const own = suites.filter((suite) => suite.expensive && suite.module === entry.slug);
    if (own.length === 0) continue;
    const latests = own.map((suite) => latest(suite.name));
    const state: RunOfRecordState = latests.some((row) => row !== null && row.outcome !== OUTCOME_PASSED)
      ? "red"
      : latests.every((row) => row !== null && row.outcome === OUTCOME_PASSED)
        ? "green"
        : "none";
    out.get(entry.slug)!.state = state;
  }
  for (const suite of suites) {
    if (suite.role !== "consumer-contract" || !suite.against || !suite.module) continue;
    const row = latest(suite.name);
    if (row !== null && row.outcome !== OUTCOME_PASSED) out.get(suite.against)?.blocking.push(suite.module);
  }
  for (const value of out.values()) value.blocking.sort();
  return out;
}

// --- What a session is run with ---------------------------------------------
//
// Every decision below is already made somewhere in this router; not one of
// them is reachable from the window an operator has open all day. So the
// reading is assembled here and rendered there, exactly as the module rows
// are: the extension re-derives none of it, because two implementations of
// one rule disagree eventually and the disagreement arrives as a row nobody
// can explain.
//
// **Nothing here reaches a network or spawns a process.** The registry is a
// dated record; freshness is read from it and refreshing it is something the
// operator asks for. A pane that enumerated a vendor when it opened would
// charge a window for being open, and would do it on a sparse clone that
// only wants to draw a tree.

// --- Which enumeration a role resolves over --------------------------------
//
// **The enumeration belongs to the transport.** `selection.ts` has said so in
// its own header since the day it was written -- the model registry on the
// direct-API path, the confirmed seat catalog on the Copilot path, both handed
// to the same `resolveRole` so the rule has one implementation. This pane
// asked the registry on every transport, so a machine with a seat and no
// `DABBLER_*_API_KEY` read "nothing resolves" while its catalog held eighteen
// working models. It shipped in 2.1.0's held build, and it is what held it.
//
// Nothing here enumerates anything: the seat catalog is a dated file, exactly
// as the registry is, and reading a file is all a pane may do.

export const ENUMERATION_API_CATALOG = "api-catalog";
export const ENUMERATION_SEAT_CATALOG = "seat-catalog";

/** Nothing resolved, said as a resolution rather than as an absence. */
const NOTHING_RESOLVES: RoleResolution<readonly [string, string]> = {
  candidates: [],
  preferenceDeclared: false,
  rank: null,
  fellThrough: false,
  removed: [],
  selected: null,
  selectedUnmet: null,
};

/**
 * How a role is resolved on the transport in force, and over what.
 *
 * This is THE reading, and it is exported because the pane is not its only
 * caller: `dabbler configure` checks an operator's choice against the same
 * list the pane offered them. A surface that offers from one enumeration
 * while the verb that accepts the choice reads another is the whole of
 * defect 1 -- `configure` walked the model registry on every transport,
 * including the seat, whose models were never in there, so on a seat it
 * refused every model the pane had just listed.
 */
export interface RoleReading {
  readonly enumeration: string;
  /**
   * How a role resolves here.
   *
   * `options.applySelection` is false for a SURFACE: a pane asks what could
   * answer, so it must see the whole list and merely report the selection --
   * a pane narrowed to the one model already chosen would offer the
   * operator their own choice and no way back out of it.
   */
  readonly resolve: (
    role: string,
    exclude: readonly string[] | null,
    options?: ResolveOptions,
  ) => RoleResolution<readonly [string, string]>;
  readonly retired: ReadonlyMap<string, RetiredModel>;
  /**
   * The price category a model's own source stated, for the models whose
   * source stated one.
   *
   * The seat's own token, verbatim, kept by session 150 after years of being
   * read free and thrown away. It is a PRICE and is labelled as one: a
   * framework that rendered it as capability would be grading models on data
   * it does not have, and a *not recommended* tag on a new frontier model
   * because a price has not landed is how a tool teaches a developer it is
   * brittle. A source that stated none contributes no entry, and the surface
   * shows nothing rather than a guess.
   */
  readonly priceCategory: ReadonlyMap<string, string>;
  /**
   * Every id this transport's block LISTS, offered or not.
   *
   * Not the same question as "what could a role resolve to", and the
   * difference is what a refusal has to be able to say. Five of this seat's
   * twenty-six models carry a provider the name heuristic cannot place, and
   * they are filtered out of every role -- so `'grok-4.6' is not a model the
   * copilot-cli transport lists` was simply untrue: the transport lists it and
   * the framework declines to offer it, which is a different sentence with a
   * different remedy.
   */
  readonly listed: ReadonlySet<string>;
  /** Why this transport can offer nothing, or null when it can. */
  readonly unavailable: string | null;
}

export function roleReading(config: RouterConfig, transport: string): RoleReading {
  const seat = transport === TRANSPORT_COPILOT_CLI;
  const enumeration = seat ? ENUMERATION_SEAT_CATALOG : ENUMERATION_API_CATALOG;
  // Both transports read the same record and differ only in which block of
  // it is theirs, and each block is fetched through its own scoped reading
  // -- `seatBlock` against this machine's seat, `apiBlock` against the set
  // of provider keys present. A block recorded for another seat or another
  // key set comes back null from both, so it reads as UNREAD rather than
  // believed: that is session 150's round-1 finding, and it is the reason
  // neither reading takes an unscoped shortcut to `readCatalog`.
  const block = seat ? seatBlock() : apiBlock(config);
  // What the direct-API path could actually dispatch to, which is what the
  // pane may offer: a provider whose key this machine does not hold is not
  // a candidate, and the seat is not filtered this way because it has none.
  const models = block === null ? [] : seat ? block.models : apiSelectableModels(config, block);
  if (block === null) {
    return {
      enumeration,
      resolve: () => NOTHING_RESOLVES,
      retired: new Map(),
      priceCategory: new Map(),
      listed: new Set<string>(),
      // The reason, not a blank list: "no models" and "this machine has not
      // read its seat yet" are different problems with different remedies,
      // and this one's remedy is free.
      // **Each branch names the verb that fixes ITS transport.** Both used to
      // name `dabbler copilot refresh`, which re-reads the seat's list and
      // touches no provider endpoint -- so the machine with no api reading at
      // all, which is exactly the machine that needs the right answer, was
      // sent to the other transport. A remedy that does not remedy is worse
      // than none: the operator runs it, it succeeds, and nothing changes.
      unavailable: seat
        ? "this machine has not read its seat's model list yet " +
          `(\`${REFRESH_COMMAND}\` reads it, free)`
        : "this machine has not read its providers' model lists yet, or it " +
          "holds a reading taken for a different set of keys " +
          `(\`${CATALOG_REFRESH_COMMAND}\` reads them, free)`,
    };
  }
  // An id and a date and nothing else, which is all the archive holds: the
  // provider a retired model had is not a claim worth keeping about a model
  // nobody can select.
  const retired = new Map<string, RetiredModel>();
  for (const entry of block.retired) {
    retired.set(entry.id, {
      id: entry.id,
      provider: "",
      lastSeenAt: null,
      retiredAt: entry.retired_at,
    });
  }
  return {
    enumeration,
    resolve: (role, exclude, options) => {
      // The catalog has no aliases on either transport: the id a source
      // lists is the id that goes on the wire, so a candidate is that id and
      // its provider and there is no third thing to carry.
      return explainRoleCandidates(config, models, role, exclude, options);
    },
    retired,
    // The source's own token for what a model costs, for the models whose
    // source stated one. Read free on every refresh and, until 150, thrown
    // away; kept verbatim rather than translated, because the seat's word
    // for its own prices is the only word there is for them.
    priceCategory: new Map(
      models
        .filter((entry) => entry.price_category !== null)
        .map((entry) => [entry.id, entry.price_category as string]),
    ),
    // The block's own ids, before any role filters them: what the transport
    // LISTS, which is what a refusal must be able to distinguish from what a
    // role may draw on.
    listed: new Set(models.map((entry) => entry.id)),
    unavailable: null,
  };
}

/**
 * One model a role could resolve to, as this machine's catalog lists it.
 *
 * Three things it carried and no longer does. `alias` was the id a second
 * time -- equal to `model` for every one of 261 entries, because neither
 * source has an alias. `fidelity` was a per-model verdict derived from the
 * rounds already on the record, `not-known` for 259 of 261 and derivable at
 * any time from a round's own `requested_model` against `served_model`,
 * which is where the question is actually asked. `providerRelation` was a
 * label computed from two things the reader already has: this row's
 * `provider` and the authoring participant's, which the authoring node now
 * states once instead of stamping onto every candidate.
 */
function candidateNode(
  candidate: readonly [string, string],
  retired: ReadonlyMap<string, RetiredModel>,
  priceCategory: ReadonlyMap<string, string> = new Map(),
): Node {
  const [modelId, provider] = candidate;
  const withdrawn = retired.get(modelId);
  return {
    model: modelId,
    provider,
    // What the source said this costs, in the source's own word for it, and
    // null where the source said nothing. Never inferred.
    priceCategory: priceCategory.get(modelId) ?? null,
    // Present only on a model the dated record says stopped being served,
    // and it carries when the vendor last had it -- a row that withheld a
    // model without saying since when would read as a bug in the pane.
    retired:
      withdrawn === undefined
        ? null
        : { since: withdrawn.retiredAt, lastSeenAt: withdrawn.lastSeenAt },
  };
}

/**
 * A role's resolution: what it would pick, and what else it could.
 *
 * `excludes` carries the providers the role was resolved AGAINST, which is
 * where the cross-provider invariant becomes visible rather than restated --
 * the reviewing role is resolved with the authoring model's provider
 * excluded, by the same rule that excludes it immediately before the wire.
 */
function roleNode(
  reading: RoleReading,
  role: string,
  exclude: readonly string[] | null,
  /**
   * The authoring model, on a reviewing role: the one model this role may
   * not be, and the whole of what it may not be.
   *
   * It is a MODEL and no longer a provider. Excluding the author's provider
   * withheld every model that vendor serves from the list, which asserted
   * something this framework cannot know -- that two models of one family
   * share a blind spot -- while failing to stop the thing it was named for,
   * since `gpt-5.6-sol` reviewing `gpt-5.6-terra` is very likely one model
   * reviewing itself and passes a provider test only because the two ids
   * differ. What remains is the rule that needs no judgement.
   */
  notThisModel: string | null = null,
): Node {
  const retired = reading.retired;
  // Everything this role COULD be, not the one thing it will be: a pane
  // narrowed to the operator's own selection would offer them the choice
  // they already made and no way back out of it. The selection is reported
  // instead, and the row marks it.
  const resolution = reading.resolve(role, exclude, { applySelection: false });
  // A model the catalog has stopped listing is not a candidate at all: it
  // left the active list for the archive when its source stopped naming it.
  // It is still SHOWN, from the archive, because an operator whose usual
  // reviewer vanished from a list needs to know it was withdrawn rather than
  // wonder what they broke -- and the archive holds an id and a date, which
  // is exactly what that question needs and nothing more.
  // The one rule, applied in the one reading, so what the pane OFFERS and
  // what `configure` ACCEPTS are the same set: the pane cannot show a choice
  // the verb would refuse, and the verb cannot refuse one the pane showed.
  const served = resolution.candidates.filter(
    ([modelId]) =>
      !retired.has(modelId) &&
      (notThisModel === null || reviewerRefusal(notThisModel, modelId) === null),
  );
  // What will actually answer: the operator's selection where they made one
  // and it survives this call, and the head of the preference order where
  // they did not. A row that showed the preference order's pick while a
  // selection stood would be reporting something that does not happen --
  // which is the defect this whole block of work exists to end.
  const chosen =
    resolution.selected === null
      ? served[0]
      : served.find(
          ([modelId]) =>
            normalizeModelToken(modelId) === normalizeModelToken(resolution.selected as string),
        );
  return {
    role,
    chosen: chosen === undefined ? null : candidateNode(chosen, retired, reading.priceCategory),
    candidates: served.map((candidate) =>
      candidateNode(candidate, retired, reading.priceCategory),
    ),
    withheld: [...retired.values()].map((entry) =>
      candidateNode([entry.id, entry.provider], retired, reading.priceCategory),
    ),
    excludes: [...(exclude ?? [])],
    // What the operator chose, or null where nobody chose. Reported rather
    // than applied here, and the two are different facts: a role with no
    // selection resolves by preference, and one with a selection dispatches
    // to it or stops.
    selected: resolution.selected,
    // A role that fell past its own preference order picked a model nobody
    // named. The 364-request session is why that is worth a row.
    fellThrough: resolution.fellThrough,
    // Which record this list came from, and why it is empty when it is. A
    // pane that said "nothing resolves" without saying what it had read is
    // the defect this carries the answer to.
    enumeration: reading.enumeration,
    unavailable: reading.unavailable,
  };
}

/**
 * Which vendors this engine's CLI can actually author with.
 *
 * A provider-specific CLI constraint, and one the code has known since
 * identity was written without a single surface reading it: Claude Code runs
 * Anthropic models and nothing else, the Gemini CLI runs Google's, and a
 * Copilot seat fronts whatever its seat lists. Null means "every provider
 * this transport lists", which is the seat's answer.
 *
 * The VERIFIER is not narrowed by any of this: it is dispatched by the
 * router over its own transport rather than by the engine's CLI, so the
 * engine has no say in what may review the work.
 */
const ENGINE_PROVIDERS: Readonly<Record<string, string>> = {
  "claude-code": "anthropic",
  gemini: "google",
};

/**
 * Which record an engine's own list is read from.
 *
 * **The engine's, not the machine's.** The list was read from whatever
 * transport the machine was set to and then spent at the engine's CLI, and
 * the two spell models differently: of the eight Anthropic ids a Copilot
 * seat lists, Claude Code refuses five (`claude-fable-5.1`,
 * `claude-opus-4.8`, `claude-opus-4.8-fast`, `claude-opus-4.7`,
 * `claude-haiku-4.5`, measured 2026-09-12). Reading for the engine removes
 * that divergence at its source rather than translating between the two
 * spellings, which is a table that goes stale the week a vendor ships
 * anything.
 *
 * A seat's own block is what `copilot --model` accepts by construction --
 * the seat stated it. An engine not named here reads the machine's own
 * vehicle, which is the old behaviour and the honest one for a CLI nobody
 * has measured.
 */
const ENGINE_ENUMERATION: Readonly<Record<string, string>> = {
  "claude-code": TRANSPORT_API,
  codex: TRANSPORT_API,
  copilot: TRANSPORT_COPILOT_CLI,
};

/** The enumeration marker for a list that is the CLI's aliases and no reading. */
export const ENUMERATION_CLI_ALIASES = "cli-aliases";

/**
 * Said once, wherever an authoring list is offered.
 *
 * Claude Code validates against its own bundled catalog and says so when it
 * refuses -- *"isn't described by this version's model catalog"* -- so no
 * enumeration this framework can take proves what the installed CLI
 * supports. The list is a suggestion; the launch is the authority.
 */
export const AUTHORING_LIST_IS_A_SUGGESTION =
  "This list is read from this machine's catalog and is a suggestion: the " +
  "engine's CLI validates against its own bundled catalog and refuses what " +
  "it does not know, which no reading here can predict.";

/**
 * A role name nothing declares, which resolves to the whole enumeration.
 *
 * An undeclared role has no preference order, no provider set and no pin, so
 * `explainRole` returns every candidate in the order the transport listed
 * them -- and that is exactly what "every model this machine could author
 * with" means. Naming it rather than borrowing a reviewing role is the
 * difference between asking a question and asking somebody else's.
 */
export const ROLE_EVERY_MODEL = "every-model";

/**
 * The orchestrator as the ledger records it: the engine that is running this
 * session and the model it declared at `session start`.
 *
 * Read rather than resolved. Nothing here picks an authoring model, because
 * nothing in this framework does: a person names it when they register the
 * session, and every surface that appeared to choose one was offering
 * something the ledger would not honour.
 */
export function orchestratorOf(root: string): {
  engine: string | null;
  model: string | null;
  /**
   * The provider the session in flight declared at `session start`.
   *
   * Read because a SEAT fronts many providers, so the engine cannot supply
   * it and the catalog cannot either until the seat has answered -- and
   * without it the cross-provider label, the whole replacement for three
   * rules session 151 deleted, renders on no row at all. The ledger has
   * carried it since the session was registered.
   */
  provider: string | null;
} {
  try {
    const raw = readRawSessionState(sessionsDirFor(root));
    const sessions = Array.isArray(raw?.["sessions"]) ? (raw?.["sessions"] as Node[]) : [];
    // **The session IN FLIGHT, and no other.** It fell back to the last row,
    // and a completed session's identity is a fact about THAT session rather
    // than about the next one -- so after a close the pane narrowed the
    // authoring list by an engine that had finished running, while the
    // Vehicle leaf directly above it read the operator's own preference.
    // Two leaves of one node, from two places, disagreeing: the exact shape
    // sessions 131 and 132 were about, coming back through another door.
    // Found by driving the pane, where a fixture's finished session named
    // an engine nothing could narrow by and every model was offered to
    // Claude Code.
    const row = sessions.find((entry) => entry["status"] === "in-progress");
    const block: Node =
      row !== undefined && typeof row["orchestrator"] === "object" && row["orchestrator"] !== null
        ? (row["orchestrator"] as Node)
        : {};
    const text = (value: unknown): string | null =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    return {
      engine: text(block["engine"]),
      model: text(block["model"]),
      provider: text(block["provider"]),
    };
  } catch {
    return { engine: null, model: null, provider: null };
  }
}

/**
 * The authoring row: what is authoring, and what this engine could author
 * with instead.
 *
 * `chosen` is the orchestrator's own model and is therefore a REPORT where a
 * session in flight declared one. The candidates are the ENGINE's own list:
 * the record its CLI is spelled by, narrowed to the providers that CLI can
 * run.
 *
 * `readingFor` rather than one reading, because which record is read is the
 * engine's answer and not the caller's. Reading the machine's transport and
 * spending the result at the engine's CLI is the divergence this replaces at
 * its source: a Copilot seat lists eight Anthropic ids and Claude Code
 * refuses five of them.
 */
export function authoringNode(
  root: string,
  readingFor: (transport: string) => RoleReading,
  /**
   * The engine this reading is FOR, where the caller knows it and the record
   * does not yet.
   *
   * `session start` is the case: it is being told which engine to register,
   * and nothing on disk says so until it has written it. Without this the
   * boundary check read the machine's vehicle instead of the engine's own
   * list and refused a perfectly good model on a machine whose seat had
   * simply never been read.
   */
  forEngine: string | null = null,
): Node {
  const { engine: inFlight, model, provider: declaredProvider } = orchestratorOf(root);
  // **The ledger, and where the ledger is silent, the preference.**
  //
  // The ledger names an engine once a session has started here, so a
  // repository on its FIRST day named none and this list was not filtered at
  // all: the Authoring AI node offered every model the transport lists --
  // Gemini and GPT among them -- as models Claude Code could author with,
  // while the Vehicle leaf directly above it read `claude-code` from
  // `preferences.json`. Two leaves of one node, read from two places,
  // disagreeing on exactly the machine sessions 131 and 132 were about.
  // `engineVehicleNode` already reads `inFlight ?? preferred`; this is the
  // same reading, so the two leaves cannot come apart again.
  const engine = forEngine ?? inFlight ?? chosenEngine();
  const vendor = engine === null ? undefined : ENGINE_PROVIDERS[engine];
  // The record THIS engine's CLI is spelled by. An engine nobody has mapped
  // reads the machine's own vehicle, which is where this started and is the
  // honest answer for a CLI whose list has never been measured.
  const reading = readingFor(
    (engine === null ? undefined : ENGINE_ENUMERATION[engine]) ??
      explainTransport(loadConfig(undefined, root), null, root).transport,
  );
  const retired = reading.retired;
  // Resolved through a role NOBODY declares, which is every model the
  // transport lists in the order it listed them. It used to borrow the
  // reviewer's role to mean "the whole catalog", and a role is not a synonym
  // for that: a reviewer pin collapsed this list to one model, and the
  // reviewer's own preferences and provider set reordered and filtered a
  // list they have nothing to do with.
  const enumerated = reading
    .resolve(ROLE_EVERY_MODEL, null)
    .candidates.filter(
      ([modelId, provider]) =>
        !retired.has(modelId) && (vendor === undefined || provider === vendor),
    );
  // **The floor, where nothing could be enumerated for this engine.**
  //
  // A Claude Code login with no Anthropic API key is an ordinary machine:
  // the CLI is signed in and the catalog's Anthropic block cannot be read,
  // because reading it needs a key the operator has no reason to hold. The
  // CLI's own documented aliases are always accepted, and three rows are a
  // choice where an empty list reads as a broken pane. It is marked as the
  // FLOOR and never as an enumeration -- a short list presented as what this
  // machine offers would be a worse claim than an empty one.
  // The engine's own always-accepted names, from the engine's own module: a
  // second copy of "what does `claude` always take" would be one copy too
  // many, and it is the same fact that makes an alias resolving to a dated
  // canonical id a resolution rather than a substitution.
  const floor = engineAliases(engine);
  const onFloor = enumerated.length === 0 && floor.length > 0;
  const listed: Array<readonly [string, string]> = onFloor
    ? floor.map((id) => [id, vendor ?? ""] as const)
    : enumerated;
  // **The ledger for the session in flight; this checkout's own setting for
  // the NEXT one.**
  //
  // `session start` records the model a session actually declared, and that
  // is a REPORT nothing may override. Where no session is in flight -- or
  // where the engine declared none, which is every Claude Code session --
  // the row shows what `dabbler configure --authoring-model` wrote, because
  // a control that wrote a value no reader consumed would be a control that
  // reports success and changes nothing. `declaredAtStart` below says which
  // of the two this is, so a report is never read as a choice.
  // The four-layer order, not one file: this checkout's committed setting
  // outranks this person's own default, exactly as it does for a vehicle.
  const configured = explainAuthoringModel(null, root).transport;
  const declared = model ?? (configured === "" ? null : configured);
  const chosen =
    declared === null
      ? null
      : (listed.find(([id]) => id === declared) ?? ([declared, ""] as const));
  return {
    role: "authoring",
    engine,
    // **The author's PROVIDER, stated once and surviving an engine that
    // declares no model.**
    //
    // Claude Code's `session start` takes no `--model` and the seat's does,
    // so a Claude Code session records `{engine, provider}` and no model at
    // all. A reader taking the provider off `chosen` alone therefore had
    // null for the whole life of every Claude Code session -- and the
    // cross-provider label, the entire replacement for three rules session
    // 151 deleted, rendered on NO row at all on the engine this repository
    // itself runs on. The engine's provider is enough to label every option
    // and is on the ledger from `session start`.
    //
    // It is here and not on each candidate because it is one fact about the
    // author, not 261 facts about the models: a reader that wants the label
    // compares it with the candidate's own `provider`. What it is NOT enough
    // for is the same-model refusal, which needs a model identifier Claude
    // Code does not report -- that stays asserted at the wire.
    // The catalog's word for the chosen model, then the ledger's own -- a
    // SEAT fronts many providers, so the engine below cannot answer for one
    // and the catalog cannot either until the seat has been read -- then the
    // engine's, for a CLI that runs one vendor and nothing else.
    provider:
      chosen !== null && chosen[1] !== ""
        ? chosen[1]
        : (declaredProvider ??
          (engine === null ? null : (ENGINE_PROVIDERS[engine] ?? null))),
    // True while a session is in flight and its engine declared a model:
    // that row REPORTS and cannot be changed, because the ledger already
    // carries it. False means the row shows what this checkout chose for the
    // NEXT session, which is a choice and is settable.
    declaredAtStart: model !== null,
    chosen: chosen === null ? null : candidateNode(chosen, retired, reading.priceCategory),
    candidates: listed.map((candidate) =>
      candidateNode(candidate, retired, reading.priceCategory),
    ),
    // The archive, rendered rather than re-derived: an operator whose usual
    // model vanished from a list needs to know it was withdrawn.
    withheld: [...retired.values()].map((entry) =>
      candidateNode([entry.id, entry.provider], retired, reading.priceCategory),
    ),
    excludes: [],
    fellThrough: false,
    enumeration: onFloor ? ENUMERATION_CLI_ALIASES : reading.enumeration,
    // Said once, wherever an authoring list is offered: what is here is a
    // suggestion, and the CLI is the authority. On the floor the reading's
    // own "this machine has read nothing" sentence goes with it -- the list
    // is no longer empty and that sentence would read as a contradiction --
    // and what replaces it says where these three came from.
    unavailable: onFloor ? null : reading.unavailable,
    note: onFloor
      ? "Nothing could be enumerated for this engine here, so these are the " +
        `CLI's own always-accepted aliases. ${AUTHORING_LIST_IS_A_SUGGESTION}`
      : AUTHORING_LIST_IS_A_SUGGESTION,
  };
}

// --- The vehicle a role is reached through ----------------------------------
//
// **One word in front of a developer, two fields underneath.** A role is
// dispatched through something, and that something is not the same KIND of
// thing for every role: the authoring model runs inside the engine's own
// CLI, and each reviewer is dispatched by the router over a transport. One
// word, *vehicle*, because it is one question -- what carries this role --
// and two fields, because the value sets and the writability differ.
//
// The authoring vehicle is a REPORT for the session in flight. Engine
// identity is recorded at `session start`, so a control that appeared to
// change it would be offering something the ledger will not honour; what a
// person sets here is what the NEXT session is offered, and the row says so.
//
// **A vehicle nothing can reach is not offered.** Presence is read per kind,
// because the three kinds are present for different reasons -- see
// `discovery.transportPresence` and `engines.installedEngines`, each of
// which already answers its own half and neither of which guesses.

export const VEHICLE_ENGINE = "engine";
export const VEHICLE_TRANSPORT = "transport";

/** One option a vehicle row may offer, with what reaching it means. */
function vehicleOption(id: string, means: string): Node {
  return { id, means };
}

/**
 * Why the engine is the engine, when a person chose it.
 *
 * Said once, because a pane and a terminal disagreeing about the same
 * machine is the defect the preferences file exists to end: the choice used
 * to live in a VS Code setting, where `dabbler session start` from a
 * terminal could not read it.
 */
function enginePreferenceReason(engine: string): string {
  return (
    `${engine} is what this machine's ${PREFERENCES_FILENAME} chose. It is ` +
    "read by `dabbler session start` from any terminal, which is why it is a " +
    "file beside the catalog rather than an editor setting."
  );
}

/**
 * The authoring role's vehicle: the engine CLI, as this machine has it.
 *
 * `chosen` is the orchestrator's engine while a session is in flight and the
 * machine's own default otherwise, and `settable` is false either way for
 * the session on the record -- which is the sentence the pane needs, not a
 * control it has to disable for reasons it invents.
 */
function engineVehicleNode(root: string): Node {
  const reading = installedEngines();
  const present = reading.engines.filter((entry) => entry.path !== null);
  const inFlight = orchestratorOf(root).engine;
  const preferred = chosenEngine();
  return {
    kind: VEHICLE_ENGINE,
    // Only what this machine has: an engine with no CLI on PATH is a way to
    // fail rather than a choice, and the engines row beside this one still
    // reports the whole list with what is missing from it.
    options: present.map((entry) => vehicleOption(entry.engine, entry.program)),
    chosen: inFlight ?? preferred ?? reading.chosen,
    // Which of the three the `chosen` above is. A row that could not say
    // would leave a developer unable to tell a report from a choice from a
    // default -- and the whole point of a preferences file is that a choice
    // is a different thing from a machine's default.
    decidedBy:
      inFlight !== null
        ? "session start"
        : preferred !== null
          ? PREFERENCES_FILENAME
          : "installed on PATH",
    // A choice here reaches the NEXT session and never the one on the
    // record: engine identity is stamped when the session is registered.
    appliesTo: "next-session",
    reason: preferred === null ? reading.reason : enginePreferenceReason(preferred),
  };
}

/**
 * The reviewing vehicle: the transport BOTH reviewers are dispatched over,
 * and the transports this machine could put them on instead.
 *
 * One node, read once and rendered on each reviewing row. It was read per
 * role, which put two controls in front of an operator for one value -- and
 * only one of them could be set, so the other was a control that appeared to
 * work and changed nothing. What the two roles differ in is what they may
 * not BE; how they are reached is one question.
 */
function reviewingVehicleNode(config: RouterConfig, root: string): Node {
  // The ROOT this reading was asked about, not wherever this process is
  // standing. `explainTransport` and its reviewing twin fall back to
  // `projectRoot()`, which is the cwd's repository -- so a reading taken for
  // repository B reported repository A's vehicle and named A's layer as the
  // one that decided. Session 157 fixed exactly this shape in the round's
  // ladder; it survived here, in the reading the pane and `dabbler
  // configuration explain` both render.
  const reading = explainReviewingTransport(config, null, root);
  const presence = transportPresence(config);
  return {
    kind: VEHICLE_TRANSPORT,
    options: presence
      .filter((entry) => entry.present)
      .map((entry) => vehicleOption(entry.transport, entry.means)),
    // Why an absent one is absent. "Not offered" with no reason is how an
    // operator comes to believe the pane is broken rather than honest.
    withheld: presence
      .filter((entry) => !entry.present)
      .map((entry) => ({ id: entry.transport, means: entry.means, note: entry.note })),
    chosen: reading.transport,
    decidedBy: reading.decidedBy,
    appliesTo: "next-session",
    layers: reading.layers.map((layer) => ({ ...layer })),
  };
}

/** One dated record, in the words the freshness reading already uses. */
function recordNode(row: FreshnessRow): Node {
  return {
    record: row.record,
    path: row.path,
    present: row.present,
    datedAt: row.dated_at,
    ageHours: row.age_hours,
    thresholdHours: row.threshold_hours,
    command: row.command,
    // What asking for a refresh buys, from where the thresholds are decided.
    cost: REFRESH_COST[row.record] ?? "",
    stale: isStale(row),
    notes: [...row.notes],
  };
}

/**
 * What this session would be run with, and what decided each part of it.
 *
 * Never throws. A configuration this router cannot load is a real state --
 * an unknown key in an overlay, a transport spelled wrong -- and a pane that
 * went blank over it would hide the one sentence that says how to fix it.
 */
/** What a caller knows that the record does not say yet. */
export interface ConfigurationReadingOptions {
  /**
   * The engine this reading is for.
   *
   * `session start` knows which engine it is registering and nothing on disk
   * says so until it has written it, so the boundary check would otherwise
   * read the machine's vehicle in place of the engine's own list. Absent
   * everywhere else, where the ledger and the preference answer it.
   */
  readonly engine?: string | null;
}

export function configurationNode(
  root: string,
  options: ConfigurationReadingOptions = {},
): Node {
  let config: RouterConfig;
  try {
    config = loadConfig(undefined, root);
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
  const engines = installedEngines();
  try {
    const transport = explainTransport(config, null, root);
    // The authoring model runs inside the ENGINE's CLI, so the list it is
    // read from is the engine's own rather than the machine's; the reviewing
    // roles are read through their OWN vehicle. One reading per transport,
    // so two roles on one transport share the one file read rather than
    // repeating it.
    const readings = new Map<string, RoleReading>();
    const readingFor = (name: string): RoleReading => {
      const held = readings.get(name);
      if (held !== undefined) return held;
      const made = roleReading(config, name);
      readings.set(name, made);
      return made;
    };
    // The authoring model is the ENGINE's, declared at `session start` and
    // kept on the record from that moment. It was resolved as a role until
    // now, and that role was dispatched by nothing -- `route()`'s fallback,
    // named by none of its four callers -- so the pane had two authors, one
    // of which changed nothing, and it filtered the reviewer list against
    // the wrong one.
    const authoring = authoringNode(root, readingFor, options.engine ?? null);
    const author = authoring["chosen"] as Node | null;
    const authorModel = author === null ? null : String(author["model"]);
    // ONE reviewing vehicle, read once and carried by both reviewing rows.
    // Two readings put two controls in front of an operator for one value,
    // and only one of them could be set.
    const reviewingVehicle = reviewingVehicleNode(config, root);
    const reviewingTransport = String(reviewingVehicle["chosen"]);
    /** A reviewing role as this machine would resolve it, on the reviewing vehicle. */
    const reviewingNode = (role: string): Node => ({
      ...roleNode(readingFor(reviewingTransport), role, null, authorModel),
      vehicle: reviewingVehicle,
    });
    return {
      transport: {
        effective: transport.transport,
        decidedBy: transport.decidedBy,
        layers: transport.layers.map((layer) => ({ ...layer })),
      },
      engines: {
        // The preference where there is one, the machine's default where
        // there is not. Two answers to "which engine" is how a pane and a
        // terminal come to disagree about the same machine.
        chosen: chosenEngine() ?? engines.chosen,
        reason: chosenEngine() === null ? engines.reason : enginePreferenceReason(chosenEngine() as string),
        installed: engines.engines.map((entry) => ({ ...entry })),
      },
      authoring: { ...authoring, vehicle: engineVehicleNode(root) },
      // Excluded by the author's own MODEL and nothing else. Whether a second
      // model from one vendor is far enough from the first is the developer's
      // judgement, and `authoring.provider` against each option's `provider`
      // is what lets them make it.
      primaryReviewer: reviewingNode(ROLE_PRIMARY_REVIEWER),
      // The third voice, which has been dispatchable since the roles were
      // named and has never had a surface. It is resolved here against the
      // one rule that can be known now -- not the author -- because the rest
      // of its definition is the providers that have already reviewed a
      // round, and there is no round at the time a pane is drawn. The list
      // is therefore what this role COULD be, and the sentence below says
      // what narrows it at the adjudication rather than letting a final-
      // looking list imply that nothing does.
      auxiliaryReviewer: {
        ...reviewingNode(ROLE_AUXILIARY_REVIEWER),
        narrowedAtDispatch:
          "At an adjudication, every provider that has already reviewed a " +
          "round is excluded as well -- read from the session's own record " +
          "at that moment. A selection narrows and never widens, so a model " +
          "chosen here that the round excludes is a stop that names it, " +
          "never a fall to the next candidate.",
      },
      records: checkFreshness(config, Date.now()).map(recordNode),
    };
  } catch (error) {
    return {
      engines: {
        chosen: engines.chosen,
        reason: engines.reason,
        installed: engines.engines.map((entry) => ({ ...entry })),
      },
      unavailable: error instanceof Error ? error.message : String(error),
    };
  }
}

export function project(root: string): Record<string, unknown> {
  const shape = solutionShape(root);
  const name = basename(resolve(root)) || "solution";
  const granted = grantedSiblings(root);
  const inPlay = modulesInSession(root);
  const runs = runsOfRecord(root, shape);
  // What ships: every bundle record under release/, and per module the
  // bundles that pin its package or are its own.
  const bundles = readBundleRecords(root);
  const shippedIn = (entry: ModuleEntry): string[] =>
    bundles
      .filter(
        (bundle) =>
          bundle.bundle === entry.slug ||
          bundle.from.includes(entry.slug) ||
          (entry.package !== null && bundle.dependencies.some((dependency) => dependency.package === entry.package)),
      )
      .map((bundle) => bundle.bundle);
  const modules: Node[] = shape.modules.map((entry) => {
    const contractDir = contractDirFor(entry.slug);
    return {
      slug: entry.slug,
      title: entry.title,
      kind: entry.kind,
      package: entry.package,
      contract: entry.contract,
      codeRoots: [...entry.codeRoots],
      dependsOn: [...entry.dependsOn],
      // Derived on every projection, declared nowhere.
      usedBy: consumersOf(shape.modules, entry.slug),
      // The folder, when the tree has it; the Explorer opens it and says
      // "not written yet" otherwise. Never claimed for a module that has
      // not declared a seam.
      contractDir:
        entry.contract !== null && existsSync(join(root, contractDir)) ? contractDir : null,
      // A grant in force for this module in the in-flight session: the
      // Explorer badges the row, and offers to end it.
      granted: granted.has(entry.slug),
      // The session working in this module right now, or null: the Explorer
      // marks the row in both windows, the module's and the repository's.
      inSession: inPlay !== null && inPlay.modules.has(entry.slug) ? inPlay.session : null,
      // The latest run of record of the module's suites, and the consumers
      // whose contract suite against it is red.
      runOfRecord: runs.get(entry.slug)?.state ?? "none",
      blocking: [...(runs.get(entry.slug)?.blocking ?? [])],
      shippedIn: shippedIn(entry),
    } satisfies Node;
  });
  const doc: Node = {
    solution: {
      name,
      title: name,
      multi: shape.multi,
      implicit: shape.implicit,
      moduleCount: modules.length,
    },
    modules,
    // What the solution says it ships, from the manifest: a declared
    // deployable no module feeds yet is here with an empty `from`, because
    // that is a true statement about the shape of the solution during
    // decomposition and not a gap in it.
    deployables: shape.deployables.map((deployable) => ({
      slug: deployable.slug,
      title: deployable.title,
      kind: deployable.kind,
      from: [...deployable.from],
      runtime: deployable.runtime,
      publish: deployable.publish,
      declared: deployable.declared,
    })),
    // What ships, as the bundle records under release/ say it; recorded,
    // never executed, and read here rather than restated.
    bundles: bundles.map((bundle) => ({
      bundle: bundle.bundle,
      from: [...bundle.from],
      version: bundle.version,
      baseCommit: bundle.baseCommit,
      date: bundle.date,
      session: bundle.session,
      dependencies: bundle.dependencies.map((dependency) => ({ ...dependency })),
    })),
  };
  // One assembly for both halves of the cross-repository graph. It reads
  // sibling directories and every member's build files, and the projection
  // is written on every recorded event -- doing it twice to answer two
  // questions about the same reading is a cost with nothing bought.
  const members = assembleSolution(root);
  doc.external = externalComponents(root, members);
  doc.members = solutionMembers(members);
  // Configuration is NOT here. `configurationNode` is asked for it directly,
  // by the surface about to render it -- see PROJECTION_RELPATH.
  return doc;
}

/** Publish the projection the extension renders. */
export function writeProjection(root: string): string {
  const path = projectionPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    platformNewlines(`${dumps(project(root), { indent: 2 })}\n`),
    { encoding: "utf8" },
  );
  return path;
}

/**
 * Write the projection, or leave the event that was just recorded standing.
 *
 * A manifest problem must not swallow an event that is already on the log;
 * `dabbler modules show` surfaces the manifest error plainly when someone
 * asks for it.
 */
export function tryWriteProjection(root: string): void {
  try {
    writeProjection(root);
  } catch (error) {
    if (error instanceof ManifestError) return;
    throw error;
  }
}

/**
 * The components this solution consumes from OTHER repositories.
 *
 * Derived from `solution-dependencies.json` and from nowhere else. The draft
 * had `solution.yaml` gaining vocabulary for external components too, and two
 * tracked homes for one edge is the drift this codebase already refuses for
 * `usedBy`: the manifest says what this repository builds, the dependency
 * file says what it takes, and neither restates the other.
 *
 * The union spans every repository the declarations reach, each owning only
 * its own edges. A→B declared in A and B→C declared in B are two facts in two
 * files, and both are projected -- reading only this repository's edges would
 * show A→B and lose C, which is the cross-repository half of the point.
 *
 * The graph is the UNION of the dependency files across the repositories they
 * name, so a row can say things one repository cannot know alone -- that the
 * pin is behind a release, or that the producer is not on this machine.
 * Nothing here is authored; every field is read.
 */
export function externalComponents(
  root: string,
  members: SolutionMember[] = assembleSolution(root),
): Node[] {
  const self = members[0];
  // Every member's OWN edges, and only its own. A→B declared in A and B→C
  // declared in B are two owner-specific facts, and the graph is the union of
  // them: projecting only this repository's edges shows A→B and discards C,
  // which is the cross-repository half of the feature missing entirely.
  // Nothing is copied between declarations to make this work -- the union is
  // computed on every projection, so there is still one home per edge.
  const owned: Array<{ owner: string; edge: Edge; from: SolutionMember }> = [];
  for (const member of members) {
    if (member.duplicateOf !== null) continue;
    const owner =
      member === self ? (self.deps?.repositoryId ?? "(this repository)") : member.id;
    for (const edge of member.deps?.consumes ?? []) {
      owned.push({ owner, edge, from: member });
    }
  }
  if (owned.length === 0) return [];

  const feeds = configuredFeeds(root);
  const findings = reconcileResolution(members, feeds);
  const consumed = [...new Set(owned.map((entry) => entry.edge.id))];

  // Pins per repository, read from build files on every projection rather
  // than copied into any declaration.
  const pins = new Map<string, Map<string, string>>();
  for (const member of members) {
    if (member.duplicateOf !== null) continue;
    const owner =
      member === self ? (self.deps?.repositoryId ?? "(this repository)") : member.id;
    for (const ref of member.refs) {
      const byRepo = pins.get(ref.id) ?? new Map<string, string>();
      if (ref.version !== null && !byRepo.has(owner)) byRepo.set(owner, ref.version);
      pins.set(ref.id, byRepo);
    }
  }

  const published = new Map<string, string>();
  for (const member of members.slice(1)) {
    if (member.root === null || member.duplicateOf !== null) continue;
    for (const artifact of publishedVersions(member.root, consumed)) {
      const seen = published.get(artifact.packageId);
      if (seen === undefined || (comparePins(seen, artifact.version) ?? 0) < 0) {
        published.set(artifact.packageId, artifact.version);
      }
    }
  }

  const rows: Node[] = [];
  const me = self.deps?.repositoryId ?? "(this repository)";
  for (const id of consumed) {
    const entries = owned.filter((entry) => entry.edge.id === id);
    const edge = entries[0].edge;
    const where = locateProducer(root, edge.producedBy, self.deps?.solution ?? null);
    const release = published.get(id) ?? null;
    const byRepo = pins.get(id) ?? new Map<string, string>();

    // Pin AND drift live on the consumer that owns them. A sibling's pin
    // rendered beside this repository's name, or a sibling's upgrade shown
    // as this repository's, is worse than no row: it is upgrade guidance
    // pointing at the wrong repository.
    const consumers = entries.map((entry) => {
      const version = byRepo.get(entry.owner) ?? null;
      const behind =
        version !== null && release !== null && (comparePins(version, release) ?? 0) < 0;
      return {
        repository: entry.owner,
        version,
        drift: behind
          ? `${entry.owner} pins ${id} at ${version}, and ${release} is published.`
          : null,
        driftKind: behind ? "behind" : null,
      };
    });

    // Only this repository's declaration can be checked against this
    // machine's feeds, so a feed finding is attributed to it and to nothing
    // else.
    const mine = findings.filter((finding) => finding.id === id);
    const feed = entries.some((entry) => entry.owner === me)
      ? mine.find((finding) => finding.kind === "feed-not-configured")
      : undefined;
    const ahead = mine.find((finding) => finding.kind === "producer-source-ahead");

    // The row states a pin only when every consumer agrees on it. Where they
    // disagree, the row says so and the consumer rows carry the versions --
    // collapsing two pins into one number is how a reader is told to upgrade
    // a repository that is already there.
    const versions = new Set(consumers.map((c) => c.version).filter((v) => v !== null));
    const agreed = versions.size === 1 ? [...versions][0] : null;
    const shared = agreed !== null && consumers.every((c) => c.driftKind === "behind");

    rows.push({
      id,
      producedBy: edge.producedBy.id,
      // DERIVED, never declared. `usedBy` has one implementation in this
      // codebase and it is a reading of who consumes what, which is exactly
      // why no declaration is allowed to state it.
      usedBy: entries.map((entry) => entry.owner),
      pins: consumers,
      pinned: agreed,
      published: release,
      resolve: edge.resolve,
      feed: edge.feed ?? null,
      // Where it is on THIS machine, which is what makes the row navigable.
      // Null is a reported state and not a defect in the declaration.
      root: where.path,
      // The two ways the declaration names the same repository, published
      // beside `root` because "not here" is not one state. A known remote
      // nobody has cloned is a command away; a producer nobody has said
      // anything about needs a person to answer where it lives. Collapsing
      // them into one word asks the person in both cases.
      remote: edge.producedBy.remote ?? null,
      declaredPath: edge.producedBy.path ?? null,
      reason: where.path === null ? where.reason : where.warning,
      // At most one, ordered by what it costs the reader: a pin behind a
      // release is an upgrade to do, a producer ahead of its releases is not
      // one yet, and a feed nobody registered is why a restore is about to
      // fail. Stated at row level only when it is true of every consumer.
      drift: shared
        ? (consumers[0].drift ?? null)
        : versions.size > 1
          ? `${id} is pinned ${[...versions].sort().join(" and ")} across ` +
            `${consumers.length} repositories in this solution.`
          : (ahead?.detail ?? feed?.detail ?? null),
      driftKind: shared
        ? "behind"
        : versions.size > 1
          ? "split"
          : ahead
            ? "ahead"
            : feed
              ? "feed"
              : null,
    } satisfies Node);
  }
  return rows;
}

/**
 * Every repository in this solution, including the ones nothing depends on.
 *
 * This is the upstream direction, and it arrives without a second declared
 * one. The operator asked for placemarkers both ways -- "this depends on
 * these" and "these depend on this" -- and the obvious way to get the second
 * is a `usedBy` somebody writes down, which is exactly what this codebase
 * refuses: two hand-kept directions disagree eventually and the disagreement
 * is silent.
 *
 * So a repository appears here because it declares ITSELF a member: its own
 * `solution-dependencies.json` names this solution. That is one home for one
 * fact, owned by the repository the fact is about, and it needs no
 * permission from anybody -- which is why a repository nothing consumes can
 * appear at all, and why `dabbler deps scaffold` can put the next one in
 * front of the operator before it has any content.
 *
 * Both dependency directions stay DERIVED from the same declarations:
 * `provides` is what this repository's own edges take from that member, and
 * `consumes` is what that member's own edges take from this one. Neither is
 * stated anywhere; each is read from the repository that owns it.
 */
export function solutionMembers(members: SolutionMember[]): Node[] {
  const self = members[0];
  const me = self.deps?.repositoryId ?? null;
  // A remote is declared by whoever names the repository as a producer, so
  // it is read across every member's edges rather than off the member
  // itself: a repository does not declare its own remote anywhere.
  const remotes = new Map<string, string>();
  for (const member of members) {
    for (const edge of member.deps?.consumes ?? []) {
      const remote = edge.producedBy.remote;
      if (remote && !remotes.has(edge.producedBy.id)) remotes.set(edge.producedBy.id, remote);
    }
  }

  const rows: Node[] = [];
  for (const member of members) {
    // A second checkout is one member on two branches, and counting it twice
    // is how a stale clone invents a disagreement nobody has.
    if (member.duplicateOf !== null) continue;
    const id = member === self ? (me ?? "(this repository)") : member.id;
    const theirs = member.deps?.consumes ?? [];
    rows.push({
      id,
      self: member === self,
      root: member.root,
      remote: remotes.get(id) ?? null,
      // What this repository takes from that member, off this repository's
      // own declaration.
      provides:
        member === self
          ? []
          : (self.deps?.consumes ?? [])
              .filter((edge) => edge.producedBy.id === id)
              .map((edge) => edge.id),
      // What that member takes from this repository, off ITS declaration.
      // Empty when this repository states no `repositoryId`: nothing can
      // name a repository that has not said what it is called.
      consumes:
        me === null || member === self
          ? []
          : theirs.filter((edge) => edge.producedBy.id === me).map((edge) => edge.id),
      // A placemarker: it says which solution it is in and nothing else yet.
      // The state `deps scaffold` leaves behind, and the state a repository
      // is in for as long as the plan has not reached it.
      shell: member.deps !== null && theirs.length === 0 && member.refs.length === 0,
      reason: member.reason,
    } satisfies Node);
  }
  return rows;
}
