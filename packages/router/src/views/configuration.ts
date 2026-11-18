// The Configuration section's rows, for every interface that shows them.
//
// PURE of any editor: the router's configuration reading in, plain rows out
// -- who authors, who reviews, the vehicle each is reached through, each
// model, the Mechanic and the keys, each with the layer that decided it. The
// rules that decide a row live here once, so a second interface renders them
// rather than working them out again.
//
// This file renders; it never decides. Every value is READ by the router from
// a file and rendered here, and nothing here may go and find out: the model
// catalog is a dated record, and a pane that enumerated a vendor when it
// opened would charge a window for being open.

import { explainMechanic, explainMechanicModel } from "../config.ts";
import type {
  ConfigurationView,
  ConfigurationViewAction,
  ConfigurationViewChoice,
  ConfigurationViewPick,
  ConfigurationViewIcon,
  ConfigurationViewRow,
} from "../generated/configuration-view.ts";
import { configurationNode } from "../projection.ts";

/** Which transport is effective, and which layer decided it. */
export interface ConfigurationTransport {
  effective: string;
  decidedBy: string | null;
  /** Every layer that named one, in precedence order; the first decided. */
  layers: { source: string; value: string }[];
}

/** The engine CLIs this machine has, and what that decides on its own. */
export interface ConfigurationEngines {
  chosen: string | null;
  reason: string;
  /** `shim`: the copilot that answered is the npm package's `copilot.cmd`, not WinGet's `copilot.exe`. */
  installed: { engine: string; program: string; path: string | null; shim?: boolean }[];
}

/** One model, as this machine's catalog lists it. */
export interface ConfigurationModel {
  /** The id the source listed, which is the id that goes on the wire. */
  model: string;
  provider: string;
  /**
   * Present only on a model the dated record says stopped being served,
   * with when it went and when it was last seen. Such a model is in
   * `withheld` and never in `candidates`.
   */
  retired?: { since: string; lastSeenAt: string | null } | null;
  /**
   * The price category the model's own source stated, verbatim, or null
   * where it stated none. A PRICE and never a capability: this framework
   * cannot grade a model, and a tag that implied it could would be teaching
   * a developer to distrust the pane.
   */
  priceCategory?: string | null;
  /**
   * A reviewing candidate only: why it cannot review while today's author's
   * vendor authors, in the router's words, or null. Marked and kept, because
   * the author is chosen at each Start.
   */
  conflict?: string | null;
}

/**
 * Where a choice is kept, as the router's reading says it: this
 * repository's settings, this machine's default, what ships, or nowhere.
 */
export type DecidedLayer = "checkout" | "machine" | "shipped" | "default";

/**
 * Whose a row's choice is, in the words a row says it. Read from the
 * reading and decided nowhere here: a person with two windows open has to
 * be able to see which of the two a value is, and a value alone cannot say.
 */
export function whoseChoice(layer: DecidedLayer | null | undefined): string {
  if (layer === "checkout") return "this repository";
  if (layer === "machine") return "machine default";
  if (layer === "shipped") return "shipped default";
  return "";
}

/** The same, as the sentence a tooltip carries; empty where nobody chose. */
function whoseSentence(layer: DecidedLayer | null | undefined): string {
  if (layer === "checkout") {
    return "This is THIS REPOSITORY's choice, kept in its .vscode/settings.json: another repository open in another window has its own, and a change here reaches neither it nor the machine's default. The file is committed, so the choice travels to the next clone.";
  }
  if (layer === "machine") {
    return "This is the MACHINE's default, which applies here because this repository names no choice of its own. Choosing one on this row makes it this repository's; Keep as Machine Default changes the default instead.";
  }
  if (layer === "shipped") return "Nobody chose this: it is what the distribution ships.";
  return "";
}

/**
 * What a role is dispatched THROUGH.
 *
 * One word in front of a developer and two kinds underneath, because the
 * value sets and the writability differ: the authoring model runs inside the
 * engine's own CLI, and a reviewer is dispatched by the router over a
 * transport. `options` is only what this machine can actually reach -- a
 * vehicle nothing can reach is a way to fail rather than a choice -- and
 * `withheld` says why each absent one is absent, because "not offered" with
 * no reason reads as a broken pane.
 */
export interface ConfigurationVehicle {
  /** "engine" or "transport". */
  kind: string;
  options: Array<{ id: string; means: string }>;
  withheld?: Array<{ id: string; means: string; note: string | null }>;
  chosen: string | null;
  decidedBy?: string | null;
  decidedLayer?: DecidedLayer | null;
  /** Which session a change here reaches. Always the next one. */
  appliesTo?: string;
  reason?: string;
  layers?: Array<{ source: string; value: string }>;
}

/** How a role resolves: what it would pick, and what it was resolved against. */
export interface ConfigurationRole {
  role: string;
  /**
   * The AUTHORING row only: the provider the work is authored by.
   *
   * One fact about the author rather than a label stamped onto every
   * candidate. It survives an engine that declares no model -- Claude Code's
   * `session start` takes none -- because the router reads it from the
   * engine, so the cross-provider word can be said on a row where there is
   * no authoring model at all to compare against.
   */
  provider?: string | null;
  /** A reviewing row only: why the model the operator chose cannot review today's author, or null. */
  conflict?: string | null;
  /** What carries this role: the engine's CLI, or the reviewer's transport. */
  vehicle?: ConfigurationVehicle;
  /**
   * The model the operator CHOSE, or null where nobody chose.
   *
   * Reported and not applied to the list: a pane narrowed to the operator's
   * own selection would offer them the choice they already made and no way
   * back out of it. Where it is set, it is what the round dispatches to --
   * used and never silently substituted.
   */
  selected?: string | null;
  /**
   * The vehicle whose list names neither this choice nor a counterpart of
   * it, or null. The choice is kept; the row says where it will stop.
   */
  notListedBy?: string | null;
  /** Where this role's model is kept for the next session. */
  decidedLayer?: DecidedLayer | null;
  /**
   * The AUTHORING row only: true while a session in flight declared this
   * model at `session start`.
   *
   * It marks the row a REPORT rather than a choice. The ledger carries the
   * identity from the moment a session is registered, so offering to change
   * it would be offering something the record will not honour -- and the
   * refusal has to name that, because a control that silently declines is
   * the shape this section shipped broken in.
   */
  declaredAtStart?: boolean;
  chosen: ConfigurationModel | null;
  candidates: ConfigurationModel[];
  /** Models the record says are no longer served: offered to nobody. */
  withheld?: ConfigurationModel[];
  /** The providers the role was resolved AGAINST -- the invariant, made visible. */
  excludes: string[];
  fellThrough: boolean;
  /**
   * Which record the list came from -- the direct-API registry, or the seat's
   * own catalog. The transport owns the enumeration, and a pane that showed a
   * list without saying which record it read is how a seat came to read
   * "nothing resolves" while its catalog held eighteen models.
   */
  enumeration?: string;
  /** Why this transport can offer nothing, when it cannot. */
  unavailable?: string | null;
  /**
   * What the reading itself says about this list, in the router's words.
   *
   * The authoring row's carries the one sentence that has to travel with
   * every authoring list: it is a suggestion, and the engine's CLI is the
   * authority -- Claude Code validates against its own bundled catalog and
   * says so when it refuses, which no reading here can predict. Rendered
   * rather than restated, so the row and the pick cannot come to say
   * different things about the same list.
   */
  note?: string;
  /**
   * What narrows this role at the dispatch, in the router's words.
   *
   * Only the Auxiliary Reviewer carries one: what makes it a THIRD voice is
   * every provider that has already reviewed a round, read from the
   * session's own record at the adjudication, so a list drawn between
   * sessions cannot be narrowed by it and must not read as though it were.
   */
  narrowedAtDispatch?: string;
}

/** One dated record, in the words the router's own freshness reading uses. */
export interface ConfigurationRecord {
  record: string;
  path: string;
  present: boolean;
  datedAt: string | null;
  ageHours: number | null;
  thresholdHours: number;
  command: string;
  /** What asking for a refresh buys, in the router's own words. */
  cost?: string;
  stale: boolean;
  notes: string[];
}

/**
 * Which credential a provider is reached with, as everything but the key.
 *
 * **No field here can carry a secret, and that is deliberate rather than
 * incidental.** A name, a layer, whether this machine holds one -- not the
 * value, not a prefix of it, not its length: the leading characters of an
 * API key identify the account, and a length distinguishes one vendor's key
 * from another's. The row answers which credential is in force, who chose
 * it, and whether it will work here, and all three are answerable without
 * the secret.
 */
export interface ConfigurationCredential {
  provider: string;
  displayLabel?: string;
  /** The environment variable this provider reads where no credential is named. */
  variable?: string;
  /** True where that variable supplies the key: set, and no credential named. */
  fromEnvironment?: boolean;
  /** The credential's NAME, or null where no layer named one. */
  reference?: string | null;
  decidedBy?: string | null;
  /** True where this machine actually holds a credential of that name. */
  held?: boolean;
  /** Why it cannot be used, in the router's own words, or null. */
  stop?: string | null;
  /** The command that stores one here. */
  store?: string;
  /** The command that names one for this checkout. */
  choose?: string;
}

/** What a session is run with, as the router read it (`configurationNode`). */
export interface ProjectionConfiguration {
  transport?: ConfigurationTransport;
  engines?: ConfigurationEngines;
  authoring?: ConfigurationRole;
  /** The Primary Reviewer: the model that reviews the work, and is not its author. */
  primaryReviewer?: ConfigurationRole;
  /** The Auxiliary Reviewer: the third voice at a disputed impasse. */
  auxiliaryReviewer?: ConfigurationRole;
  records?: ConfigurationRecord[];
  /** The transports this machine can reach and has never read: `copilot-cli`, `api`. */
  unread?: string[];
  /** One per enabled provider: which key it is reached with. */
  credentials?: ConfigurationCredential[];
  /** Why there is nothing to show: a config this router could not load. */
  unavailable?: string;
}

export type ConfigurationIcon = ConfigurationViewIcon;

/** The two participants a session is run with: who writes, and who reviews. */
export type ConfigParticipant = "authoring" | "reviewing";

/** The four model rows, each a role the router resolves. */
export type ConfigRoleName = "authoring" | "mechanic" | "primaryReviewer" | "auxiliaryReviewer";

export type ConfigurationNode =
  | { kind: "configuration" }
  // The two participants, each naming a thing being configured rather than
  // the mechanism that configures it. A developer opening this section had
  // to know that *Engine* meant what the authoring AI runs inside and
  // *Transport* meant how a reviewer is reached before any of it meant
  // anything; these say who, and their leaves say what about them.
  | { kind: "configParticipant"; who: ConfigParticipant }
  | { kind: "configVehicle"; who: ConfigParticipant }
  | { kind: "configRole"; role: ConfigRoleName }
  // Whether the framework may call in the Mechanic on a stop: dabbler.mechanic.
  | { kind: "configMechanic" }
  // Beside the participants rather than under one of them: a credential
  // belongs to a PROVIDER, and whichever participant happens to be on that
  // vendor uses it, so hanging it off a role would draw one fact twice.
  // Grouped, because keys are set about once per machine and a model is
  // what Configuration is usually opened to change.
  | { kind: "configKeys" }
  | { kind: "configCredential"; provider: string };

export interface ConfigurationRowDescriptor {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: ConfigurationIcon;
  /** Collapsed, never Expanded: the tree stays lazy. */
  expandable: boolean;
  contextValue?: string;
  /**
   * What a CLICK on the row does, by command id.
   *
   * Only a row whose whole purpose is one action has one, and the
   * Configuration rows are that: a setting is a thing you click to change.
   * It is deliberately not an inline icon -- the menu registry holds this
   * pane to two of those, and a control that has to be discovered by
   * right-clicking is a control most people never find.
   */
  command?: string;
}

/** What the rows need beside the reading: the Mechanic's two choices, and whose machine this is. */
export interface ConfigurationContext {
  /**
   * The engine chosen for the next session. Null when nobody has chosen and
   * the machine's own reading stands.
   */
  readonly chosenEngine?: string | null;
  /** `dabbler.mechanic` as the router reads it, or null where it could not. */
  readonly mechanic?: string | null;
  /** The Mechanic Model someone chose, or null where it is the Authoring Model's. */
  readonly mechanicModel?: string | null;
  /** No folder is open, so the Configuration is this machine's defaults and nothing else. */
  readonly machineOnly?: boolean;
}

/**
 * The engine the next session is offered, as the router read it.
 *
 * A choice kept beside the catalog rather than in an editor setting, so
 * `dabbler session start` typed in a terminal and every interface read the
 * same one.
 */
export function chosenEngineOf(configuration: ProjectionConfiguration | null | undefined): string | null {
  const chosen = configuration?.engines?.chosen;
  return chosen === undefined || chosen === null || chosen === "" ? null : chosen;
}

/**
 * The Mechanic's delegation and the model someone chose for it, through the
 * router's own reading. The model is null where no Mechanic layer named one,
 * which is the Authoring Model's -- the reading falls to it, and the row says
 * so rather than repeating it. Either is null where the reading refused.
 * A null root is no folder open, and reads this machine's defaults alone.
 */
export function mechanicChoicesOf(root: string | null): { mechanic: string | null; mechanicModel: string | null } {
  const read = <T>(reading: () => T): T | null => {
    try {
      return reading();
    } catch {
      return null;
    }
  };
  const model = read(() => explainMechanicModel(root));
  return {
    mechanic: read(() => explainMechanic(root))?.transport ?? null,
    mechanicModel: model !== null && (model.decidedBy ?? "").includes("mechanic") ? model.transport : null,
  };
}

/** Everything the rows need beside the reading, read for one root (null: the machine alone). */
export function configurationContext(
  root: string | null,
  configuration: ProjectionConfiguration | null | undefined,
): ConfigurationContext {
  return {
    chosenEngine: chosenEngineOf(configuration),
    ...mechanicChoicesOf(root),
    machineOnly: root === null,
  };
}

function configRole(
  config: ProjectionConfiguration,
  which: Exclude<ConfigRoleName, "mechanic">,
): ConfigurationRole | undefined {
  return config[which];
}

/** The vehicle a participant is reached through, off the role that has one. */
function configVehicle(
  config: ProjectionConfiguration,
  who: ConfigParticipant,
): ConfigurationVehicle | undefined {
  // ONE reviewing vehicle, carried identically on both reviewing rows: the
  // auxiliary's own was state that reached dispatch and that no surface
  // could show or set, so the row for it was a control that appeared to work
  // and changed nothing.
  return who === "authoring" ? config.authoring?.vehicle : config.primaryReviewer?.vehicle;
}

/** How old a record is, in the units a person reads it in. */
export function agePhrase(hours: number | null): string {
  if (hours === null) return "no readable date";
  if (hours < 1) return "under an hour old";
  if (hours < 48) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)} days old`;
}

/**
 * Which record a role's list was read from, in words.
 *
 * The router names the enumeration; this only spells it. A name it does not
 * know is printed as it came, because an unknown record is still worth
 * saying and a pane that swallowed it would be back to a list from nowhere.
 */
export const ENUMERATION_WORDS: Record<string, string> = {
  "api-catalog": "vendors' own model lists",
  "seat-catalog": "seat's own catalog",
};

/**
 * How a candidate's provider stands to the author's, in words.
 *
 * DERIVED from two providers the reading already carries -- the authoring
 * row's own, and this candidate's -- rather than read from a field. It was a
 * field on every one of 261 candidates, computed and never stored, which is
 * 261 copies of one comparison; the authoring row states its provider once
 * and the comparison is made where the word is needed.
 *
 * This is the whole of what cross-provider review is now: a LABEL the person
 * choosing can weigh, where there used to be a refusal. A different provider
 * reduces the chance the reviewer shares the author's blind spots -- it does
 * not eliminate it, and the same provider does not guarantee it, which is
 * why the framework states the fact and leaves the judgement where the data
 * to make it actually is.
 *
 * One function, read by the row AND by the pick. Two copies of a vocabulary
 * drift.
 */
export function providerRelationWord(
  author: string | null | undefined,
  provider: string | null | undefined,
): string {
  if (!author || !provider) return "provider unknown";
  return author === provider ? "same provider" : "different provider";
}

/**
 * What each model row is called, under the participant it belongs to.
 *
 * Named for the thing being configured rather than for the mechanism. Under
 * **Authoring AI** and **Reviewing AI** the facts need three words between
 * them. **Auxiliary** is the word `roles.auxiliary-reviewer` uses: a label
 * that disagreed with the role it sets would be the second copy of a
 * vocabulary.
 */
export const ROLE_LABELS: Record<ConfigRoleName, string> = {
  authoring: "Authoring Model",
  mechanic: "Mechanic Model",
  primaryReviewer: "Primary Model",
  auxiliaryReviewer: "Auxiliary Model",
};

/**
 * The command each model row is, one per role.
 *
 * Separate ids and not one, because a `view/item/context` entry carries no
 * arguments: a single command would have to guess which model a right-click
 * on *Reviewing AI* meant, and guessing on the operator's behalf is how a
 * control comes to do something other than what it says.
 */
export const ROLE_COMMANDS: Record<ConfigRoleName, string> = {
  authoring: "dabblerSolution.setAuthoringModel",
  mechanic: "dabblerSolution.setMechanicModel",
  primaryReviewer: "dabblerSolution.setPrimaryReviewerModel",
  auxiliaryReviewer: "dabblerSolution.setAuxiliaryReviewerModel",
};

/** What each role IS, in one sentence, on the row that sets it. */
export const ROLE_HELP: Record<ConfigRoleName, string> = {
  authoring:
    "The model the engine's own CLI is launched on. It is set here for the NEXT session; while a session is in flight this row reports what that session declared, because the ledger carries its identity from the moment it was registered.",
  mechanic:
    "The model the Mechanic is launched on, on the authoring engine's own CLI, when a stop is handed to it. Unset, it is the Authoring Model; it is never the Primary Reviewer's.",
  primaryReviewer:
    "The reviewer of record, never from the authoring model's vendor. A model from that vendor is still listed, marked as not usable while it authors, because the author is chosen at each Start. Its verdict blocks a close.",
  auxiliaryReviewer:
    "The third voice, reached only when the Primary Reviewer's findings are disputed. It is defined as not the author AND not a provider that has already reviewed this session, which is what makes an adjudication a third opinion rather than a repeat one.",
};

const ROLE_ICONS: Record<ConfigRoleName, string> = {
  authoring: "edit",
  mechanic: "tools",
  primaryReviewer: "verified",
  // The third voice at an impasse, which is a judgement and not a review.
  auxiliaryReviewer: "law",
};

/** The one line of help under a list of possible reviewers. */
export const REVIEWER_HELP =
  "A reviewer is never from the authoring model's vendor, so it cannot share the author's blind spots.";

/** What a machine default is, said once for the pane's label and the toast after a write. */
export const MACHINE_DEFAULT_MEANS =
  "A machine default applies wherever a repository has no choice of its own, " +
  "and it does not replace a choice already saved in one.";

/** What each Mechanic delegation means, on its row and in its pick. */
export const MECHANIC_MODES: ReadonlyArray<{ mode: string; means: string }> = [
  { mode: "unattended", means: "the framework calls in the Mechanic on a stop without you" },
  { mode: "attended", means: "a stop names the Mechanic among its ways on, and you open it" },
  { mode: "off", means: "no Mechanic is named or called in" },
];

/**
 * What a model row says it is, or why it says nothing.
 *
 * **"Nothing resolves" and "nobody has chosen" are different facts**, and
 * only one of them is a problem. A reviewing role with no chosen model
 * really has nothing: its preference order ran and picked none. The
 * AUTHORING row has no preference order -- a model there is chosen or it is
 * not -- so a machine holding four models it could author with read
 * "nothing resolves" until this told the two apart.
 */
function modelText(model: ConfigurationModel | null | undefined, offered = 0): string {
  if (model) return `${model.model} (${model.provider})`;
  return offered > 0 ? "not chosen" : "nothing resolves";
}

/** What the word "vehicle" is for, on the kind of vehicle this role has. */
const VEHICLE_MEANS: Record<string, string> = {
  engine: "the engine CLI the work is authored in",
  transport: "the transport the router dispatches this role over",
};

/**
 * What carries this role, said on the row.
 *
 * The alternatives are only what this machine can reach: a vehicle nothing
 * can reach is a way to fail rather than a choice. An absent one is still
 * NAMED, with the reason and the remedy, because a list that silently
 * dropped a transport an operator expects to see reads as a broken pane.
 */
function vehicleText(vehicle: ConfigurationVehicle | null | undefined): string {
  if (!vehicle) return "";
  const kind = VEHICLE_MEANS[vehicle.kind] ?? vehicle.kind;
  const others = vehicle.options.filter((option) => option.id !== vehicle.chosen);
  const withheld = (vehicle.withheld ?? []).filter((entry) => entry.note !== null);
  return [
    `Vehicle: ${vehicle.chosen ?? "nothing chosen"} — ${kind}${
      vehicle.decidedBy ? `, decided by ${vehicle.decidedBy}` : ""
    }. It is the default for the NEXT session; a session in flight keeps what its record says.`,
    others.length > 0
      ? `This machine could also reach: ${others.map((option) => `${option.id} (${option.means})`).join("; ")}.`
      : "Nothing else here can carry it.",
    ...withheld.map((entry) => `${entry.id} is not offered: ${entry.note}.`),
  ].join(" ");
}

/** The section's own children, and each row's beneath it. Only what the reading carries. */
export function configurationChildren(
  node: ConfigurationNode,
  config: ProjectionConfiguration,
): ConfigurationNode[] {
  switch (node.kind) {
    case "configuration": {
      // One node per participant. Only what the reading carries: a section
      // that invented a row for an absent field would be saying something
      // the router never read.
      const own: ConfigurationNode[] = [];
      if (config.authoring) own.push({ kind: "configParticipant", who: "authoring" });
      if (config.primaryReviewer || config.auxiliaryReviewer) {
        own.push({ kind: "configParticipant", who: "reviewing" });
      }
      if ((config.credentials ?? []).length > 0) own.push({ kind: "configKeys" });
      return own;
    }
    case "configKeys":
      return (config.credentials ?? []).map((credential) => ({
        kind: "configCredential" as const,
        provider: credential.provider,
      }));
    case "configParticipant": {
      const own: ConfigurationNode[] = [];
      if (configVehicle(config, node.who)) own.push({ kind: "configVehicle", who: node.who });
      if (node.who === "authoring") {
        if (config.authoring) {
          own.push({ kind: "configRole", role: "authoring" });
          // The Mechanic is launched on the authoring engine, so it sits here.
          own.push({ kind: "configRole", role: "mechanic" }, { kind: "configMechanic" });
        }
        return own;
      }
      if (config.primaryReviewer) own.push({ kind: "configRole", role: "primaryReviewer" });
      if (config.auxiliaryReviewer) own.push({ kind: "configRole", role: "auxiliaryReviewer" });
      return own;
    }
    case "configVehicle":
    case "configRole":
    case "configMechanic":
    case "configCredential":
      return [];
  }
}

/** What one Configuration row says, from the reading and what the context adds. */
export function configurationDescriptor(
  node: ConfigurationNode,
  config: ProjectionConfiguration,
  context: ConfigurationContext = {},
): ConfigurationRowDescriptor {
  switch (node.kind) {
    case "configuration": {
      const bits: string[] = [];
      if (config.engines?.chosen) bits.push(config.engines.chosen);
      // The reviewing vehicle, not the machine's: no row beneath this one is
      // decided by the machine's, so naming it here named nothing that runs.
      const reviewing = configVehicle(config, "reviewing")?.chosen;
      if (reviewing) bits.push(reviewing);
      const stale = (config.records ?? []).filter((row) => row.stale).length;
      return {
        id: "configuration",
        label: context.machineOnly ? "Configuration: this machine's defaults" : "Configuration",
        description: config.unavailable
          ? "cannot be read"
          : bits.length > 0
            ? bits.join(" · ")
            : "what the next session runs with",
        tooltip:
          config.unavailable ??
          [
            // With no folder open there is no repository to choose for, so
            // every row here is the machine's, and the label says so.
            ...(context.machineOnly ? [`No folder is open, so these are this machine's defaults. ${MACHINE_DEFAULT_MEANS}`] : []),
            "What a session is run with, read from files. Nothing here is " +
              "probed: the model catalog is a dated record, and refreshing " +
              "it is something you ask for.",
            // The catalog's own words: how old this machine's reading is,
            // where it lives, and what asking for a new one costs -- which is
            // nothing, said before anybody clicks.
            ...(config.records ?? []).map((row) =>
              [
                `${row.record}: ${row.present ? agePhrase(row.ageHours) : "not read yet"}`,
                row.present
                  ? `last updated ${row.datedAt}, read as stale past ${Math.round(row.thresholdHours)}h`
                  : "this machine has not read its model catalog yet",
                `it lives at ${row.path}`,
              ].join("; "),
            ),
            ...(config.records ?? []).map((row) =>
              `Update the catalog runs \`${row.command}\`. ${row.cost ?? ""}`.trim(),
            ),
          ].join("\n\n"),
        icon: {
          id: "settings-gear",
          ...(config.unavailable || stale > 0 ? { tone: "attention" as const } : {}),
        },
        expandable: configurationChildren(node, config).length > 0,
        contextValue: "dabblerConfiguration",
      };
    }
    case "configParticipant": {
      const authoring = node.who === "authoring";
      const vehicle = configVehicle(config, node.who);
      const model = authoring ? config.authoring?.chosen : config.primaryReviewer?.chosen;
      // What this participant is, at a glance: what carries it and what
      // answers. The leaves say the rest.
      const bits = [vehicle?.chosen ?? null, model?.model ?? null].filter(
        (bit): bit is string => bit !== null && bit !== "",
      );
      return {
        id: `config:${node.who}`,
        label: authoring ? "Authoring AI" : "Reviewing AI",
        description: bits.length > 0 ? bits.join(" · ") : "not read",
        tooltip: authoring
          ? "The AI that writes the work: it runs inside an engine CLI, and the model it authors with is declared when the session is registered."
          : `The AI that reviews the work, and is never its author. ${REVIEWER_HELP}`,
        icon: { id: authoring ? "edit" : "verified" },
        expandable: configurationChildren(node, config).length > 0,
        contextValue: `dabblerConfigParticipant;${node.who}`,
      };
    }
    case "configVehicle": {
      const authoring = node.who === "authoring";
      const vehicle = configVehicle(config, node.who);
      // The tooltip names every layer the choice overrides, so a setting that
      // is not in force never reads as one that is. It is not a fault: one
      // layer overriding the next is how the layers work, and the reviewing
      // vehicle always has the shipped default beneath it, so the row marks
      // nothing for it.
      const shadowed = (vehicle?.layers ?? []).slice(1);
      const engines = config.engines;
      // What the OPERATOR chose outranks what the machine leaves to choose.
      const chosen = authoring
        ? (context.chosenEngine ?? vehicle?.chosen ?? null)
        : (vehicle?.chosen ?? null);
      // An overridden layer says BY WHAT, whichever layer that is.
      const overrider = !authoring && vehicle?.decidedBy ? ` by ${vehicle.decidedBy}` : "";
      // No engine chosen is two different facts: the router declines to
      // default when two CLIs are on PATH and waits for a person, or the
      // machine has none.
      const installed = (engines?.installed ?? []).filter((entry) => entry.path !== null).length;
      // The npm package's `copilot.cmd`, first on PATH where WinGet's
      // `copilot.exe` should be: `cmd.exe` cuts a prompt at its first
      // newline.
      const shim = authoring && (engines?.installed ?? []).some((entry) => entry.engine === "copilot" && entry.shim === true);
      const whose = whoseChoice(vehicle?.decidedLayer);
      const said = chosen
        ? `${chosen}${whose === "" ? "" : ` · ${whose}`}`
        : authoring
          ? installed > 0
            ? `${installed} installed, none chosen`
            : "no engine CLI on PATH"
          : "not read";
      return {
        id: `config:vehicle:${node.who}`,
        label: "Vehicle",
        description: shim ? `${said} · copilot is the npm shim ⚠` : said,
        tooltip: [
          vehicleText(vehicle),
          authoring
            ? "Start Session uses this engine and asks for none; `dabbler session start` typed in a terminal reads the same choice. It reaches the NEXT session: the engine is recorded per session at `session start` and never changes one in flight."
            : "This sets the reviewing vehicle, dabbler.reviewerTransport in this checkout's settings -- the one this row shows.",
          chosen ? whoseSentence(vehicle?.decidedLayer) : "",
          ...shadowed.map((layer) => `${layer.source} says '${layer.value}' and is overridden${overrider}.`),
          authoring && (context.chosenEngine ?? null) === null ? (engines?.reason ?? "") : "",
          authoring && installed === 0
            ? "Install Claude Code or the GitHub Copilot CLI (`winget install GitHub.Copilot`); the extension installs nothing."
            : "",
          shim
            ? "The copilot on PATH is the npm package's `copilot.cmd` shim, and cmd.exe cuts a prompt at its first newline. Replace it with WinGet's: `npm uninstall -g @github/copilot`, then `winget install GitHub.Copilot`."
            : "",
        ]
          .filter((line) => line !== "")
          .join("\n\n"),
        icon: {
          // ONE icon on both Vehicle rows. They answer one question -- what
          // carries this participant.
          id: "plug",
          ...(shim
            ? { tone: "attention" as const }
            : chosen
              ? {}
              : { tone: "muted" as const }),
        },
        expandable: false,
        contextValue: `dabblerConfigVehicle;${node.who}`,
        command: authoring ? "dabblerSolution.setEngine" : "dabblerSolution.setReviewerTransport",
      };
    }
    case "configMechanic": {
      const mode = context.mechanic ?? null;
      const means = MECHANIC_MODES.find((entry) => entry.mode === mode)?.means;
      return {
        id: "config:mechanic",
        label: "Mechanic",
        description: mode ?? "not read",
        tooltip: [
          "Whether the framework may call in the Mechanic -- a fresh engine on the Mechanic Model -- when a session stops. It is this repository's choice, written to its .vscode/settings.json.",
          means ? `${mode}: ${means}.` : "",
        ]
          .filter((line) => line !== "")
          .join("\n\n"),
        icon: { id: "shield", ...(mode === null ? { tone: "muted" as const } : {}) },
        expandable: false,
        contextValue: "dabblerConfigMechanic",
        command: "dabblerSolution.setMechanic",
      };
    }
    case "configRole": {
      if (node.role === "mechanic") {
        // Not in the reading: the router reads it on demand, and unset it is
        // the Authoring Model's, which is the one thing this row says then.
        return {
          id: "config:role:mechanic",
          label: ROLE_LABELS.mechanic,
          description: context.mechanicModel ?? "same as Authoring Model",
          tooltip: ROLE_HELP.mechanic,
          icon: { id: ROLE_ICONS.mechanic },
          expandable: false,
          contextValue: "dabblerConfigRole;mechanic",
          command: ROLE_COMMANDS.mechanic,
        };
      }
      const role = configRole(config, node.role);
      const authoring = node.role === "authoring";
      const unlistedModel = role?.notListedBy ? (role.selected ?? role.chosen?.model ?? "") : null;
      return {
        id: `config:role:${node.role}`,
        label: ROLE_LABELS[node.role],
        description:
          unlistedModel !== null
            ? // Whose it is matters MOST here: the row is telling a person to
              // change a choice, and they have to know which file holds it.
              `${unlistedModel}${whoseChoice(role?.decidedLayer) === "" ? "" : ` · ${whoseChoice(role?.decidedLayer)}`} — not listed by ${role?.notListedBy} ⚠`
            : `${modelText(
                role?.chosen,
                // Only the authoring row: a reviewing role resolves its own head
                // from the preference order, so a null chosen there really is
                // nothing resolving rather than nobody having picked.
                authoring ? (role?.candidates.length ?? 0) : 0,
              )}${role?.chosen && whoseChoice(role?.decidedLayer) !== "" ? ` · ${whoseChoice(role?.decidedLayer)}` : ""}${role?.fellThrough || role?.conflict ? " ⚠" : ""}`,
        tooltip: [
          ROLE_HELP[node.role],
          // Kept, never cleared or substituted: the stop is where it always
          // was, and this row announces it before anyone presses Start.
          unlistedModel !== null
            ? `You chose ${unlistedModel}, which ${role?.notListedBy} does not list. ${
                node.role === "auxiliaryReviewer" ? "The first dispute" : "The next session"
              } will stop on it until you choose another. ${whoseSentence(role?.decidedLayer)}`.trim()
            : "",
          // What narrows this role at the round, in the router's own words.
          role?.narrowedAtDispatch ?? "",
          // The label, in the row, in the same words the pick uses -- DERIVED
          // here from two providers the reading already carries.
          !authoring && role?.chosen
            ? `This one is on a ${providerRelationWord(config.authoring?.provider, role.chosen.provider)}.`
            : "",
          role?.conflict
            ? `'${role.selected}' is ${role.conflict}: a reviewer is never from the authoring model's vendor, so a session with this author would not start.`
            : "",
          role?.chosen?.priceCategory
            ? `Its source states a '${role.chosen.priceCategory}' price category. That is a PRICE and not a capability: this framework does not grade models.`
            : "",
          // Two fields and no third: what the operator CHOSE, and the order
          // tried where they chose nothing. A selection is used and never
          // silently substituted.
          unlistedModel !== null
            ? ""
            : role?.selected
            ? `You chose ${role.selected}. ${whoseSentence(role.decidedLayer)} It is what the round dispatches to, and nothing is substituted for it: if this call cannot reach it, the round stops and says so.`
            : authoring
              ? // A REPORT and a CHOICE look identical on a row that does not
                // say which it is, and only one of the two can be changed.
                role?.declaredAtStart
                  ? "This session declared it at `session start`, so the row reports it. Setting one here reaches the NEXT session."
                  : ""
              : "Nobody has chosen a model here, so the preference order decides and a stale entry in it costs a slightly newer model, never a candidate.",
          role?.fellThrough
            ? "It fell past its own preference order, so what answers is a model nobody named. That is what billed one session 364 premium requests."
            : "",
          // Which record was read, said plainly.
          `${role?.candidates.length ?? 0} model(s) qualify${
            role?.enumeration ? `, from the ${ENUMERATION_WORDS[role.enumeration] ?? role.enumeration}` : ""
          }${role?.vehicle?.chosen ? `, read on \`${role.vehicle.chosen}\`` : ""}.`,
          (role?.withheld ?? []).length > 0
            ? `Withheld, because the record says the vendor stopped serving them: ${(role?.withheld ?? [])
                .map(
                  (model) =>
                    `${model.model} (last seen ${model.retired?.lastSeenAt ?? "unknown"}, gone since ${model.retired?.since ?? "unknown"})`,
                )
                .join(", ")}. The entry is kept, so a model that comes back is offered again.`
            : "",
          // What the reading says about its own list, in the router's words,
          // rendered rather than restated.
          role?.note ?? "",
          role?.unavailable ? `Nothing can be offered here: ${role.unavailable}.` : "",
        ]
          .filter((line) => line !== "")
          .join("\n\n"),
        icon: {
          id: ROLE_ICONS[node.role],
          // Two things here are worth a colour: falling past the preference
          // order, and a chosen reviewer from today's authoring vendor, which
          // a Start would refuse.
          ...(role?.fellThrough || role?.conflict || unlistedModel !== null
            ? { tone: "attention" as const }
            : {}),
        },
        expandable: false,
        contextValue: `dabblerConfigRole;${node.role}`,
        command: ROLE_COMMANDS[node.role],
      };
    }
    case "configKeys": {
      const credentials = config.credentials ?? [];
      const available = credentials.filter((row) => row.fromEnvironment || row.held).length;
      // Collapsed, so the row that needs acting on must still be visible
      // from here.
      const stopped = credentials.some((row) => row.stop);
      return {
        id: "config:keys",
        label: "API Keys",
        description: `${available} of ${credentials.length} available`,
        tooltip:
          "Which key each provider is reached with. A credential this checkout or you named decides; the provider's environment variable supplies the key only where none is named.",
        icon: { id: "key", ...(stopped ? { tone: "attention" as const } : {}) },
        expandable: true,
      };
    }
    case "configCredential": {
      const credential = (config.credentials ?? []).find((row) => row.provider === node.provider);
      const label = `${credential?.displayLabel ?? node.provider} key`;
      // What is in force. `fromEnvironment` is only ever true where no
      // credential is named, because a named one outranks the variable.
      const description = !credential
        ? "not read"
        : credential.fromEnvironment
          ? `${credential.variable ?? "the environment"} is set`
          : !credential.reference
            ? "nothing resolves"
            : credential.held
              ? credential.reference
              : `${credential.reference} — not on this machine`;
      return {
        id: `config:credential:${node.provider}`,
        label,
        description,
        tooltip: [
          "Which credential this provider is reached with. The value is in this machine's own store; what travels in a setting is the NAME.",
          credential?.stop ??
            (credential?.fromEnvironment
              ? `Nothing names a credential, so ${credential.variable}, set in the environment, supplies the key. A credential named here would outrank it.`
              : credential?.reference
                ? `'${credential.reference}' was named by ${credential.decidedBy ?? "a configured layer"}.`
                : `Nothing names a credential, so ${credential?.variable ?? "the provider's environment variable"} is what supplies the key.`),
          `Clicking opens a terminal on \`${credential?.store ?? "dabbler auth set"}\`, which asks for the key with the echo off. It is never typed into this window: what goes into an input box lives in the editor's own buffers.`,
        ].join("\n\n"),
        icon: {
          id: "key",
          ...(credential?.stop ? { tone: "attention" as const } : {}),
        },
        expandable: false,
        contextValue: `dabblerConfigCredential;${node.provider}`,
        command: "dabblerSolution.storeCredential",
      };
    }
  }
}

// ===========================================================================
// The section as data: each row with its value, the layer that decided it,
// and the actions it offers, every level present
// ===========================================================================

/** Each action's title, as every interface shows it. */
export const CONFIGURATION_ACTION_TITLES: Record<string, string> = {
  "dabblerSolution.setEngine": "Set the Authoring Vehicle",
  "dabblerSolution.setReviewerTransport": "Set the Reviewing Vehicle",
  "dabblerSolution.setAuthoringModel": "Set the Authoring Model",
  "dabblerSolution.setPrimaryReviewerModel": "Set the Primary Reviewer's Model",
  "dabblerSolution.setAuxiliaryReviewerModel": "Set the Auxiliary Reviewer's Model",
  "dabblerSolution.setMechanicModel": "Set the Mechanic Model",
  "dabblerSolution.setMechanic": "Set the Mechanic Delegation",
  "dabblerSolution.setAsMyDefault": "Keep as Machine Default",
  "dabblerSolution.refreshRecord": "Update the Catalog",
  "dabblerSolution.storeCredential": "Store a Key on This Machine",
};

/** The control's name, which is also the button that confirms it. */
export const KEEP_AS_MACHINE_DEFAULT = "Keep as Machine Default";

/** Which repository a `configure` writes: the one named, or -- with none -- this machine alone. */
export function configureScope(root: string | null): string[] {
  return root === null ? ["--no-repo"] : ["--repo-root", root];
}

/** The router's own command line as argv; a line that does not name `dabbler` is given it. */
function commandArgv(command: string): string[] {
  const argv = command.trim().split(/\s+/);
  return argv[0] === "dabbler" ? argv : ["dabbler", ...argv];
}

function action(
  id: string,
  over: Partial<Omit<ConfigurationViewAction, "id" | "title">> = {},
): ConfigurationViewAction {
  return {
    id,
    title: CONFIGURATION_ACTION_TITLES[id] ?? id,
    argv: null,
    pick: null,
    confirm: null,
    unavailable: null,
    ...over,
  };
}

/**
 * Keep this row's choice as the MACHINE's default.
 *
 * Every choice is this repository's, and the machine's is only the default a
 * repository that names none falls back to. This makes the row's current
 * value that default, and nothing else. The confirmation says what it
 * reaches: every repository on this machine that names no choice of its own,
 * and nobody else's machine.
 */
function keepAsMachineDefault(
  node: ConfigurationNode,
  config: ProjectionConfiguration,
  root: string | null,
): ConfigurationViewAction {
  const kept = ((): readonly [string, string | null, string] | null => {
    if (node.kind === "configVehicle") {
      return node.who === "authoring"
        ? ["the engine", config.engines?.chosen ?? null, "--engine"]
        : ["the reviewing vehicle", config.primaryReviewer?.vehicle?.chosen ?? null, "--reviewer-transport"];
    }
    if (node.kind !== "configRole") return null;
    if (node.role === "authoring") return ["the authoring model", config.authoring?.chosen?.model ?? null, "--authoring-model"];
    return node.role === "primaryReviewer"
      ? ["the Primary Reviewer's model", config.primaryReviewer?.chosen?.model ?? null, "--reviewer-model"]
      : ["the Auxiliary Reviewer's model", config.auxiliaryReviewer?.chosen?.model ?? null, "--auxiliary-model"];
  })();
  const value = kept?.[1] ?? null;
  if (kept === null || value === null || value === "") {
    return action("dabblerSolution.setAsMyDefault", {
      unavailable: "There is nothing on this row to keep: choose a value first, and then keep it as the machine's default.",
    });
  }
  return action("dabblerSolution.setAsMyDefault", {
    // The machine's default and only that: without `--mine` the same write is
    // this repository's, which is what the row's own control does.
    argv: ["dabbler", "configure", ...configureScope(root), kept[2], value, "--mine"],
    confirm: {
      title: `Keep '${value}' as this machine's default for ${kept[0]}?`,
      detail:
        "It is written to this machine's own preferences, beside your model catalog, and applies in " +
        "every repository here that names no choice of its own -- including one you open for the " +
        "first time. This repository's own choice is left as it is. It is not committed and reaches " +
        "nobody else.",
      accept: KEEP_AS_MACHINE_DEFAULT,
      keep: null,
    },
  });
}

/**
 * Update the catalog: the command the ROUTER named on the record, asked
 * first, and the question carries the cost -- which is nothing, and says so.
 */
function refreshAction(config: ProjectionConfiguration): ConfigurationViewAction | null {
  const row = (config.records ?? [])[0];
  if (!row) return null;
  return action("dabblerSolution.refreshRecord", {
    argv: commandArgv(row.command),
    confirm: {
      title: `Refresh ${row.record}?`,
      detail: [
        row.cost ?? "",
        "",
        `It runs \`${row.command}\` in a terminal, where you can watch it.`,
        "",
        // The one condition under which the answer is no, said before the
        // click rather than in the terminal afterwards.
        "While a session is in flight the refresh is refused, because a session that changes its own verifier pool while running has edited the conditions of its own review. Run it between sessions.",
      ].join("\n"),
      accept: "Refresh",
      keep: null,
    },
  });
}

/**
 * Store a key, in a terminal and never in a window: `dabbler auth set` asks
 * with the echo off. No confirmation -- it writes nothing until the terminal
 * has asked its own question, and closing that terminal is the no.
 */
function storeAction(config: ProjectionConfiguration, provider: string): ConfigurationViewAction | null {
  const credential = (config.credentials ?? []).find((row) => row.provider === provider);
  if (!credential) return null;
  return action("dabblerSolution.storeCredential", {
    argv: [
      "dabbler",
      "auth",
      "set",
      credential.provider,
      ...(credential.reference ? ["--name", credential.reference] : []),
    ],
  });
}

// ---------------------------------------------------------------------------
// What may be chosen
// ---------------------------------------------------------------------------

/**
 * The engines Start Session can actually open. An engine outside it is not
 * offered: persisting a name Start Session has no launch for would be a
 * setting that silently does nothing. `codex` is the live case -- the router
 * recognises it and its CLI's argv has never been measured.
 */
export const LAUNCHABLE_ENGINES: readonly string[] = ["claude-code", "copilot"];

/** The pick item that clears the Mechanic's own model. */
export const SAME_AS_AUTHORING = "same as Authoring Model";

const NEXT_SESSION = "This is the default for the NEXT session; a session in flight keeps what its record says.";

/** The `configure` flag each set action writes. */
const CONFIGURE_FLAGS: Record<string, string> = {
  "dabblerSolution.setEngine": "--engine",
  "dabblerSolution.setReviewerTransport": "--reviewer-transport",
  "dabblerSolution.setAuthoringModel": "--authoring-model",
  "dabblerSolution.setPrimaryReviewerModel": "--reviewer-model",
  "dabblerSolution.setAuxiliaryReviewerModel": "--auxiliary-model",
  "dabblerSolution.setMechanicModel": "--mechanic-model",
  "dabblerSolution.setMechanic": "--mechanic",
};

/**
 * The two commands that set one value: for this repository, and as the
 * machine's default. With no repository the first IS the machine's default.
 */
function setArgv(root: string | null, flag: string, value: string): Pick<ConfigurationViewChoice, "argv" | "mineArgv"> {
  const base = ["dabbler", "configure", ...configureScope(root), flag, value];
  return { argv: root === null ? [...base, "--mine"] : base, mineArgv: [...base, "--mine"] };
}

function choiceOf(
  root: string | null,
  flag: string,
  over: { label: string; description?: string | null; detail?: string | null; value?: string; unreachable?: string | null },
): ConfigurationViewChoice {
  const value = over.value ?? over.label;
  return {
    label: over.label,
    description: over.description ?? null,
    detail: over.detail ?? null,
    value,
    unreachable: over.unreachable ?? null,
    ...setArgv(root, flag, value),
  };
}

/**
 * The words a model choice carries -- the row's own vocabulary, so the pick
 * and the row cannot come to say different things about one model: its
 * provider, how it stands to the author's, the price its source stated, the
 * router's words for a reviewer from today's authoring vendor, and which one
 * is already chosen.
 */
export function modelChoiceWords(
  models: readonly ConfigurationModel[],
  /** The provider the work is authored by, so each model can be labelled against it. */
  authorProvider: string | null | undefined,
  selected: string | null | undefined = null,
): Array<{ label: string; description: string; detail: string | null }> {
  return models.map((model) => ({
    label: model.model,
    description: [
      model.provider,
      authorProvider ? providerRelationWord(authorProvider, model.provider) : null,
      model.priceCategory ? `${model.priceCategory} price` : null,
      model.conflict ?? null,
    ]
      .filter((part) => part !== null && part !== "")
      .join(" · "),
    detail: model.model === selected ? "what you chose" : null,
  }));
}

function modelChoices(
  root: string | null,
  flag: string,
  models: readonly ConfigurationModel[],
  authorProvider: string | null | undefined,
  selected: string | null | undefined,
): ConfigurationViewChoice[] {
  return modelChoiceWords(models, authorProvider, selected).map((words) => choiceOf(root, flag, words));
}

/** What the record withholds from a model list, and why. */
function withheldModels(role: ConfigurationRole | undefined): ConfigurationViewPick["withheld"] {
  return (role?.withheld ?? []).map((model) => ({
    label: model.model,
    reason: `the record says the vendor stopped serving it (last seen ${model.retired?.lastSeenAt ?? "unknown"}, gone since ${model.retired?.since ?? "unknown"})`,
  }));
}

/** Which record a list was read from, said before why it offered nothing. */
function readFrom(role: ConfigurationRole | undefined): string {
  return role?.enumeration
    ? `The list was read from the ${ENUMERATION_WORDS[role.enumeration] ?? role.enumeration}. `
    : "";
}

/** How a model nothing lists is set: typed, with the command it is appended to. */
function typedModel(root: string | null, flag: string, prompt: string): NonNullable<ConfigurationViewPick["typed"]> {
  const base = ["dabbler", "configure", ...configureScope(root), flag];
  return { prompt, argv: root === null ? [...base, "--mine"] : base, mineArgv: [...base, "--mine"] };
}

/** One set action: its pick, or why there is nothing to pick. */
function setAction(
  id: string,
  config: ProjectionConfiguration,
  context: ConfigurationContext,
  root: string | null,
): ConfigurationViewAction {
  const flag = CONFIGURE_FLAGS[id] as string;
  const pick = (
    title: string,
    placeholder: string,
    choices: ConfigurationViewChoice[],
    withheld: ConfigurationViewPick["withheld"] = [],
    typed: ConfigurationViewPick["typed"] = null,
  ): ConfigurationViewPick => ({ title, placeholder, choices, withheld, typed });
  switch (id) {
    case "dabblerSolution.setEngine": {
      // A CLI that is not installed is still offered, and says it is not: a
      // machine that is about to have it is a normal thing.
      const choices = (config.engines?.installed ?? [])
        .filter((entry) => LAUNCHABLE_ENGINES.includes(entry.engine))
        .map((entry) =>
          choiceOf(root, flag, {
            label: entry.engine,
            description: entry.path === null ? `\`${entry.program}\` is not on PATH` : entry.program,
            detail: entry.path,
            unreachable: entry.path === null ? `\`${entry.program}\` is not on PATH` : null,
          }),
        );
      return action(id, {
        pick: pick("Which engine runs the next session?", NEXT_SESSION, choices),
        unavailable:
          choices.length === 0
            ? "There is no engine here that Start Session can open. It offers the CLIs whose launch has been measured, and this machine has none of them on PATH."
            : null,
      });
    }
    case "dabblerSolution.setReviewerTransport": {
      // The Reviewing AI's vehicle is the one the row SHOWS: the Primary
      // Reviewer's, written as dabbler.reviewerTransport.
      const vehicle = config.primaryReviewer?.vehicle;
      const choices = (vehicle?.options ?? []).map((option) =>
        choiceOf(root, flag, {
          label: option.id,
          description: option.means,
          detail: option.id === vehicle?.chosen ? "what carries it now" : null,
        }),
      );
      return action(id, {
        pick: pick(
          "What carries the Reviewing AI?",
          vehicle?.decidedBy
            ? `${vehicle.chosen ?? "nothing"} now, decided by ${vehicle.decidedBy}. ${NEXT_SESSION}`
            : NEXT_SESSION,
          choices,
          (vehicle?.withheld ?? [])
            .filter((entry) => entry.note !== null)
            .map((entry) => ({ label: entry.id, reason: entry.note as string })),
        ),
        unavailable:
          choices.length === 0
            ? "Nothing on this machine can carry the Primary Reviewer, so there is no vehicle to choose."
            : null,
      });
    }
    case "dabblerSolution.setAuthoringModel": {
      const role = config.authoring;
      const choices = modelChoices(root, flag, role?.candidates ?? [], role?.provider, role?.chosen?.model);
      const typed =
        choices.length === 0 ? typedModel(root, flag, "No model is listed for the authoring AI here; type the id the engine's CLI takes.") : null;
      // **A session in flight is REPORTED, never offered**: the ledger
      // carries its identity from `session start`.
      const unavailable = role?.declaredAtStart
        ? `The session in flight declared '${role.chosen?.model ?? "its model"}' at ` +
          "`session start`, and the ledger has carried it since. This row reports " +
          "that. Close the session to choose what the next one authors with."
        : choices.length === 0
          ? `No model is offered for the authoring AI here. ${readFrom(role)}${
              role?.unavailable ? `${role.unavailable}.` : "The engine's own list could not be read on this machine."
            }`
          : null;
      return action(id, {
        pick: pick(
          "Which model authors the next session?",
          // The router's own sentence about the list, not a second one.
          `${role?.note ? `${role.note} ` : ""}${NEXT_SESSION}`,
          choices,
          withheldModels(role),
          typed,
        ),
        unavailable,
      });
    }
    case "dabblerSolution.setPrimaryReviewerModel":
    case "dabblerSolution.setAuxiliaryReviewerModel": {
      const primary = id === "dabblerSolution.setPrimaryReviewerModel";
      const role = primary ? config.primaryReviewer : config.auxiliaryReviewer;
      const choices = modelChoices(root, flag, role?.candidates ?? [], config.authoring?.provider, role?.selected);
      return action(id, {
        pick: pick(
          primary ? "Which model reviews the next session?" : "Which model adjudicates a disputed finding?",
          `${
            primary
              ? REVIEWER_HELP
              : "It is reached only at an impasse, and never from a provider that has already reviewed the session."
          } ${NEXT_SESSION}`,
          choices,
          withheldModels(role),
          choices.length === 0 ? typedModel(root, flag, "No model qualifies for that role here; type the model id to review with.") : null,
        ),
        unavailable:
          choices.length === 0
            ? `No model qualifies for that role here. ${readFrom(role)}${
                role?.unavailable
                  ? `${role.unavailable}.`
                  : role?.enumeration === "seat-catalog"
                    ? "The seat's catalog lists no model for this role."
                    : "A provider with no key resolves to no candidate at all."
              }`
            : null,
      });
    }
    case "dabblerSolution.setMechanicModel": {
      // One of the authoring engine's own models, because the Mechanic is
      // launched on that engine's CLI, or the Authoring Model's by clearing it.
      const role = config.authoring;
      const chosen = context.mechanicModel ?? null;
      return action(id, {
        pick: pick(
          "Which model is the Mechanic launched on?",
          "From the authoring engine's own list. Never the Primary Reviewer's model.",
          [
            choiceOf(root, flag, { label: SAME_AS_AUTHORING, value: "", detail: chosen === null ? "what you chose" : null }),
            ...modelChoices(root, flag, role?.candidates ?? [], role?.provider, chosen),
          ],
          withheldModels(role),
        ),
      });
    }
    default: {
      const chosen = context.mechanic ?? null;
      return action(id, {
        pick: pick(
          "May the framework call in the Mechanic on a stop?",
          root === null ? "This machine's default." : "This repository's choice, committed with its settings.",
          MECHANIC_MODES.map((entry) =>
            choiceOf(root, flag, {
              label: entry.mode,
              description: entry.means,
              detail: entry.mode === chosen ? "what you chose" : null,
            }),
          ),
        ),
      });
    }
  }
}

/** The actions a row offers, in menu order. */
function actionsOf(
  node: ConfigurationNode,
  config: ProjectionConfiguration,
  context: ConfigurationContext,
  root: string | null,
): ConfigurationViewAction[] {
  const set = (id: string) => setAction(id, config, context, root);
  switch (node.kind) {
    case "configuration": {
      const refresh = refreshAction(config);
      return refresh === null ? [] : [refresh];
    }
    case "configParticipant":
      return node.who === "authoring"
        ? [
            set("dabblerSolution.setEngine"),
            set(ROLE_COMMANDS.authoring),
            set(ROLE_COMMANDS.mechanic),
            set("dabblerSolution.setMechanic"),
          ]
        : [
            set("dabblerSolution.setReviewerTransport"),
            set(ROLE_COMMANDS.primaryReviewer),
            set(ROLE_COMMANDS.auxiliaryReviewer),
          ];
    case "configVehicle":
      return [
        set(node.who === "authoring" ? "dabblerSolution.setEngine" : "dabblerSolution.setReviewerTransport"),
        keepAsMachineDefault(node, config, root),
      ];
    case "configRole":
      return node.role === "mechanic"
        ? [set(ROLE_COMMANDS.mechanic)]
        : [set(ROLE_COMMANDS[node.role]), keepAsMachineDefault(node, config, root)];
    case "configMechanic":
      return [set("dabblerSolution.setMechanic")];
    case "configKeys":
      return [];
    case "configCredential": {
      const store = storeAction(config, node.provider);
      return store === null ? [] : [store];
    }
  }
}

/** The value a row holds and the layer that decided it, where it holds one. */
function valueOf(
  node: ConfigurationNode,
  config: ProjectionConfiguration,
  context: ConfigurationContext,
): Pick<ConfigurationViewRow, "value" | "decidedLayer"> {
  const none = { value: null, decidedLayer: null };
  switch (node.kind) {
    case "configVehicle": {
      const vehicle = configVehicle(config, node.who);
      const value = node.who === "authoring"
        ? (context.chosenEngine ?? vehicle?.chosen ?? null)
        : (vehicle?.chosen ?? null);
      return { value, decidedLayer: vehicle?.decidedLayer ?? null };
    }
    case "configRole": {
      if (node.role === "mechanic") return { value: context.mechanicModel ?? null, decidedLayer: null };
      const role = configRole(config, node.role);
      return {
        value: role?.selected ?? role?.chosen?.model ?? null,
        decidedLayer: role?.decidedLayer ?? null,
      };
    }
    case "configMechanic":
      return { value: context.mechanic ?? null, decidedLayer: null };
    case "configCredential": {
      const credential = (config.credentials ?? []).find((row) => row.provider === node.provider);
      return { value: credential?.reference ?? null, decidedLayer: null };
    }
    default:
      return none;
  }
}

function viewRowOf(
  node: ConfigurationNode,
  config: ProjectionConfiguration,
  context: ConfigurationContext,
  root: string | null,
): ConfigurationViewRow {
  const descriptor = configurationDescriptor(node, config, context);
  const actions = actionsOf(node, config, context, root);
  return {
    id: descriptor.id,
    kind: node.kind,
    label: descriptor.label,
    description: descriptor.description ?? null,
    tooltip: descriptor.tooltip ?? null,
    icon: descriptor.icon ?? null,
    collapsible: descriptor.expandable ? "collapsed" : "none",
    contextValue: descriptor.contextValue ?? null,
    ...valueOf(node, config, context),
    click: actions.find((offered) => offered.id === descriptor.command) ?? null,
    actions,
    children: configurationChildren(node, config).map((child) => viewRowOf(child, config, context, root)),
  };
}

/**
 * The whole section, every level present, for one repository root -- or,
 * with none, this machine's defaults alone, as an interface with no folder
 * open shows them.
 */
export function configurationView(
  root: string | null,
  config: ProjectionConfiguration,
  context: ConfigurationContext = configurationContext(root, config),
): ConfigurationView {
  return {
    schemaVersion: 1,
    machineOnly: root === null,
    configuration: viewRowOf({ kind: "configuration" }, config, context, root),
  };
}

/**
 * One set action by its id, as every row offering it carries it: its pick,
 * or why there is nothing to pick. For an interface acting on a click, which
 * needs the one action rather than the whole section.
 */
export function configurationSetAction(
  id: string,
  root: string | null,
  config: ProjectionConfiguration,
  context: ConfigurationContext = configurationContext(root, config),
): ConfigurationViewAction | null {
  return id in CONFIGURE_FLAGS ? setAction(id, config, context, root) : null;
}

/** Keep as Machine Default on one row: its command and confirmation, or why there is nothing to keep. */
export function keepAsMachineDefaultAction(
  node: ConfigurationNode,
  root: string | null,
  config: ProjectionConfiguration,
): ConfigurationViewAction {
  return keepAsMachineDefault(node, config, root);
}

/**
 * Every row that can be set, with the action a click on it runs -- its pick
 * and its choices exactly as the view carries them. What `dabbler
 * configuration options --json` prints.
 */
export function settableRows(
  view: ConfigurationView,
): Array<{ id: string; label: string; action: ConfigurationViewAction }> {
  const rows: Array<{ id: string; label: string; action: ConfigurationViewAction }> = [];
  const walk = (row: ConfigurationViewRow): void => {
    if (row.click?.pick) rows.push({ id: row.id, label: row.label, action: row.click });
    row.children.forEach(walk);
  };
  walk(view.configuration);
  return rows;
}

/**
 * The router's configuration reading for a root, taken in-process. Never
 * throws: a configuration this router cannot load is a real state, and it
 * carries its own sentence saying how to fix it.
 */
export function readConfiguration(root: string | null): ProjectionConfiguration {
  try {
    return configurationNode(root) as ProjectionConfiguration;
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}
