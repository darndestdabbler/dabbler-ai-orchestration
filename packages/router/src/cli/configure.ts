// `dabbler configure` -- what the NEXT session is run with.
//
// The settings a person chooses and the framework cannot work out for
// itself: the VEHICLE each role is reached through, and which model reviews.
// Each is checked against the rules selection already owns before anything is
// written.
//
// **Two layers, and which one a setting lands in is not arbitrary.** A
// VEHICLE is a property of this checkout -- one repository may need the seat
// while another runs on keys -- so `--transport` and `--reviewer-transport`
// go to the machine-local overlay beside the project. An ENGINE and a MODEL
// are properties of the person and their machine, so they go to
// `preferences.json` at the user level, beside the catalog, where a terminal
// in any repository and a pane in any window read one answer. The answer says
// which file it wrote, every time, because a setting whose home is a guess is
// a setting somebody will look for in the wrong place.
//
// **A vehicle belongs to a role.** `--transport` is the machine's own, used
// where no role says otherwise; `--reviewer-transport` is the Primary
// Reviewer's, for the case this framework has stated since the transport
// reading was written and no surface could act on -- a review that needs the
// other transport because provider independence requires it.
//
// **It sets a default and never a session.** Engine identity is recorded per
// session at `session start` and is on the record from that moment; a control
// that appeared to change a session in flight would be offering something the
// ledger will not honour. The engine is not here for the same reason from the
// other side: `session start` takes it as an argument, so the default belongs
// to whichever surface offers to start one.
//
// **Both reviewing roles are set here, through one check.** The Primary
// Reviewer returns the verdict and the Auxiliary Reviewer is the third voice
// at a disputed impasse; what separates them is read at the round -- every
// provider that has already reviewed one -- and cannot be checked against a
// preference written between sessions, so the rule this verb applies is one
// rule and lives here once.
//
// **It offers from the list it checks against.** Both come from
// `projection.roleReading`, the one transport-scoped reading of the
// catalog, so the models this verb accepts are exactly the models the pane
// offered on the same machine. They used to be two lists: this verb walked
// the model registry whatever the transport was, and on a seat -- whose
// models were never in that registry -- it refused every model the pane had
// just listed.
//
// The refusal is read from selection rather than restated, so the operator
// reads the rule's own words and not this file's paraphrase of them.

import {
  ConfigError,
  VALID_TRANSPORTS,
  TRANSPORT_ENV_VAR,
  explainReviewingTransport,
  explainTransport,
  loadConfig,
  writeConfigurationChoice,
  type ConfigurationChoice,
} from "../config.ts";
import { BUILT_IN_ENGINES } from "../engines.ts";
import { repoRootFor } from "../journal.ts";
import { PREFERENCES_FILENAME, selectedModel, writePreferences } from "../preferences.ts";
import { vehicleRefusal } from "../discovery.ts";
import { SETTINGS_RELPATH } from "../settings.ts";
import { workingDirectory } from "../workdir.ts";
import {
  authoringNode,
  orchestratorOf,
  roleReading,
  tryWriteProjection,
  type RoleReading,
} from "../projection.ts";
import {
  ROLE_AUXILIARY_REVIEWER,
  ROLE_PRIMARY_REVIEWER,
  reviewerRefusal,
} from "../selection.ts";
import { normalizeModelToken } from "../contracts/models.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler configure [-h] [--engine E] [--transport T]",
    "                         [--reviewer-transport T] [--authoring-model M]",
    "                         [--reviewer-model M] [--auxiliary-model M]",
    "                         [--repo-root PATH]",
    "",
    "  what the NEXT session is run with",
    "",
    "options:",
    `  --engine E              ${BUILT_IN_ENGINES.join(" | ")}; which engine the`,
    "                          next session is offered. It is written beside the",
    "                          catalog at the USER level -- not into a repository",
    "                          and not into an editor setting -- so a terminal and",
    "                          a pane read one answer. An empty value clears it",
    `  --transport T           ${VALID_TRANSPORTS.join(" | ")}; the machine's own`,
    "                          vehicle -- how a provider is reached where no role",
    `                          says otherwise. Written to ${SETTINGS_RELPATH}`,
    "                          in this checkout, which a --transport flag is the",
    "                          only thing above",
    `  --reviewer-transport T  ${VALID_TRANSPORTS.join(" | ")}; the vehicle BOTH`,
    "                          reviewing roles are dispatched over, where it",
    "                          differs from the machine's. A review may need the",
    "                          other transport when provider independence",
    "                          requires it",
    "  --authoring-model M     the model the engine's CLI is launched on, named",
    "                          as the transport in force lists it. It is what",
    "                          `session start` offers and what the engine is",
    "                          asked for; an empty value clears it",
    "  --reviewer-model M      the model that reviews the next session, named as",
    "                          the reviewer's own transport lists it. The one",
    "                          refusal is the AUTHORING model itself -- which is",
    "                          the engine's, declared at `session start` -- and",
    "                          another model on the same provider is allowed",
    "  --auxiliary-model M     the model that adjudicates a disputed finding,",
    "                          named as the auxiliary role's own transport lists",
    "                          it. Checked by the same rule; the round excludes",
    "                          every provider that has already reviewed it, and a",
    "                          selection it excludes is a stop and never a",
    "                          substitution",
    "  --repo-root PATH        the repository; derived from the cwd when absent",
    "  -h, --help              show this message",
    "",
  ].join("\n");
}

/**
 * Every model the transport in force lists, in the order a role prefers.
 *
 * **`applySelection: false`, and the flag is the whole of this function.**
 * The default applies the selection already stored, which collapses the list
 * to the one model that is pinned -- so the verb that EXISTS to change a
 * selection checked every new name against a list containing only the old
 * one. The first choice was accepted and every choice after it was refused,
 * including plainly-listed models and an empty value, with `It lists: <the
 * model you already chose>`. A selection became unchangeable from every
 * surface the framework offers, and the only way out was hand-editing the
 * preferences file.
 *
 * `roleNode` in `../projection.ts` passes the same flag for the same reason
 * and says so; this is the other half of that sentence. The pane's own pick
 * list is built from that reading, marks the current model `what you chose`,
 * and is documented as "a place to CHANGE a choice" -- so before this, the
 * pane offered the change and the router refused it.
 */
function offered(reading: RoleReading, role: string): Array<readonly [string, string]> {
  return reading.resolve(role, null, { applySelection: false }).candidates;
}

/**
 * The catalog id for what the operator named, or null when it lists nothing
 * by that name.
 *
 * This replaces `aliasFor`, which walked `config["models"]` on every
 * transport -- including the seat, whose models were never in there, so on a
 * seat it refused every model the pane had just offered. There is no alias
 * to resolve any more: the catalog's id is what the surface shows, what this
 * checks, and what goes on the wire, so the name an operator gives is the
 * name that is written.
 */
function offeredId(reading: RoleReading, role: string, named: string): string | null {
  const match = offered(reading, role).find(([modelId]) => modelId === named);
  return match === undefined ? null : match[0];
}

/** How many names to spell before a refusal stops being readable. */
const NAMES_IN_A_REFUSAL = 12;

/**
 * What the transport offers, as a sentence a person can act on.
 *
 * The direct-API path offers 125 models on this machine. Spelling all of them
 * makes the refusal a wall that scrolls the refusal itself off the screen, so
 * the count leads and the names follow up to a limit.
 */
function namesOffered(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  if (sorted.length === 0) return "It offers none.";
  const shown = sorted.slice(0, NAMES_IN_A_REFUSAL);
  const rest = sorted.length - shown.length;
  return (
    `It offers ${sorted.length}: ${shown.join(", ")}` +
    (rest > 0 ? `, and ${rest} more.` : ".")
  );
}


export interface ConfigureOptions {
  readonly repoRoot: string;
  /** The engine the next session is offered; an empty value clears it. */
  readonly engine?: string;
  readonly transport?: string;
  /** The vehicle both reviewing roles are dispatched over. */
  readonly reviewerTransport?: string;
  /** The model the engine's own CLI is launched on. */
  readonly authoringModel?: string;
  readonly reviewerModel?: string;
  /** The Auxiliary Reviewer's model: the third voice at a disputed impasse. */
  readonly auxiliaryModel?: string;
}

export interface ConfigureOutcome {
  readonly refusal: string | null;
  readonly changed: readonly string[];
  readonly path: string | null;
  /** What outranks the file this wrote, when something does. */
  readonly shadowed: string | null;
}

/**
 * Apply one choice: check it, write it, and re-derive the projection the
 * pane renders so the row the operator clicked says the new thing.
 */
export function configure(options: ConfigureOptions): ConfigureOutcome {
  const config = loadConfig(undefined, options.repoRoot);
  const empty = { changed: [], path: null, shadowed: null };
  const choice: ConfigurationChoice = {};
  const named: Record<string, string> = {};
  if (
    options.reviewerTransport !== undefined &&
    !(VALID_TRANSPORTS as readonly string[]).includes(options.reviewerTransport)
  ) {
    return {
      ...empty,
      refusal:
        `'${options.reviewerTransport}' is not a vehicle this framework has. ` +
        `It is one of: ${VALID_TRANSPORTS.join(", ")}.`,
    };
  }
  // **A vehicle this machine cannot reach is a stop, at the moment it is
  // chosen.** Writing it and discovering it at the round would spend a
  // session's setup to learn something knowable now -- and silently using a
  // different one would change which account is billed and make every later
  // account of what ran untrue, which is the shadowing this framework
  // deleted `DABBLER_TRANSPORT` for. The reading is named so the operator
  // knows which file to fix.
  for (const [flag, wanted] of [
    ["--transport", options.transport],
    ["--reviewer-transport", options.reviewerTransport],
  ] as const) {
    if (wanted === undefined) continue;
    const refusal = vehicleRefusal(config, {
      transport: wanted.trim().toLowerCase(),
      decidedBy: `${flag} on this call`,
      layers: [],
    });
    if (refusal !== null) return { ...empty, refusal };
  }
  // Each reviewing role is checked against ITS OWN vehicle, because that is
  // the transport its round will be dispatched over -- ONE reviewing
  // vehicle, shared by both reviewing roles. The machine's own stands in
  // where none is named, and where this same call is SETTING a vehicle it is
  // the one being set that decides: checking the outgoing vehicle would
  // refuse `--reviewer-transport copilot-cli --reviewer-model <a seat
  // model>` for naming a model the transport it is leaving does not list,
  // which is the one pair of flags a person switching machines would type
  // together.
  const transportFor = (roleOverride?: string): string =>
    roleOverride ??
    (options.transport !== undefined
      ? explainTransport(config, options.transport).transport
      : explainReviewingTransport(config).transport);
  const readings = new Map<string, RoleReading>();
  const readingFor = (name: string): RoleReading => {
    const held = readings.get(name);
    if (held !== undefined) return held;
    const made = roleReading(config, name);
    readings.set(name, made);
    return made;
  };
  // The one rule, against the model that ACTUALLY authors: the engine's,
  // declared at `session start` and on the record from that moment. The pane
  // used to filter this list against a role nothing dispatched, so it was
  // checking the choice against the wrong author.
  const author = orchestratorOf(options.repoRoot).model;
  /**
   * One named model, checked for one reviewing role: the catalog id to
   * write, or the refusal to return.
   *
   * Both reviewing roles come through here rather than through two copies of
   * it. They differ in the vehicle their list is read from and in nothing
   * else -- the rule each is held to at this point is the same rule, since
   * what makes the auxiliary a THIRD voice is read from the session's record
   * at the round and cannot be checked against a preference written between
   * sessions.
   */
  const checkedModel = (
    role: string,
    transport: string,
    value: string,
  ): { modelId: string } | { refusal: string } => {
    const reading = readingFor(transport);
    const modelId = offeredId(reading, role, value);
    if (modelId === null) {
      // THREE problems, not two, and each has a different remedy:
      //
      //   - the transport has read nothing, which is free to fix;
      //   - the transport lists this model and no role may draw on it,
      //     because nothing here can place its provider; and
      //   - the name is simply not in the record.
      //
      // The middle one used to be told as the third, so an operator was
      // informed that their seat does not list `grok-4.6` while their seat
      // was listing it. Saying "not a model this registry declares" over the
      // first is what sent an operator looking for a registry that no longer
      // decides anything.
      if (reading.unavailable !== null) {
        return { refusal: `'${value}' cannot be checked: ${reading.unavailable}.` };
      }
      if (reading.listed.has(value)) {
        return {
          refusal:
            `'${value}' is listed by the ${transport} transport and cannot be ` +
            "chosen for a role: nothing here can say which vendor is behind it, " +
            "and an adjudication excludes every provider that has already " +
            "reviewed a round -- an unplaceable one cannot be excluded. It is " +
            "a limit of this framework and not of your seat.",
        };
      }
      return {
        refusal:
          `'${value}' is not a model the ${transport} transport lists. ` +
          namesOffered(offered(reading, role).map(([id]) => id)),
      };
    }
    const refusal = author === null ? null : reviewerRefusal(author, modelId);
    return refusal === null ? { modelId } : { refusal };
  };
  if (options.reviewerModel !== undefined) {
    const checked = checkedModel(
      ROLE_PRIMARY_REVIEWER,
      transportFor(options.reviewerTransport),
      options.reviewerModel,
    );
    if ("refusal" in checked) return { ...empty, refusal: checked.refusal };
    named["reviewerModel"] = checked.modelId;
  }
  if (options.auxiliaryModel !== undefined) {
    const checked = checkedModel(
      ROLE_AUXILIARY_REVIEWER,
      transportFor(options.reviewerTransport),
      options.auxiliaryModel,
    );
    if ("refusal" in checked) return { ...empty, refusal: checked.refusal };
    // **Not the primary either, where the primary is pinned.**
    //
    // The rest of the auxiliary's definition is read at the round -- every
    // provider that has already reviewed -- and cannot be checked against a
    // preference written between sessions. This one part can: "not the
    // primary" is the role's own definition, and the primary's pin is in the
    // same file this command is about to write. Accepting the pair produced a
    // configuration guaranteed to stop: the primary reviews round 1, its
    // provider is excluded at the adjudication, and an auxiliary pinned to its
    // model is excluded with it -- every time, and the operator was told so in
    // the abstract while being allowed to do it.
    const primary =
      named["reviewerModel"] ?? selectedModel(ROLE_PRIMARY_REVIEWER);
    if (
      primary !== null &&
      primary !== undefined &&
      normalizeModelToken(String(primary)) === normalizeModelToken(checked.modelId)
    ) {
      return {
        ...empty,
        refusal:
          `'${checked.modelId}' is already the Primary Reviewer, and the ` +
          "Auxiliary Reviewer is the THIRD voice at an impasse: it is not the " +
          "author and not the primary. An adjudication excludes every provider " +
          "that has already reviewed a round, so this pair would stop every " +
          "adjudication rather than settle one. Choose a different model, or " +
          "change the Primary Reviewer first.",
      };
    }
    named["auxiliaryModel"] = checked.modelId;
  }
  // **The authoring model: checked against what the transport LISTS.**
  //
  // Not against a reviewing role's candidates -- those are narrowed by a
  // reviewing role's preference order, its provider set and its pin, none of
  // which has anything to do with what the engine may be launched on. The
  // undeclared role is the whole enumeration in the order the transport
  // listed it, which is what "a model this machine could author with" means.
  if (options.authoringModel !== undefined) {
    const wanted = options.authoringModel.trim();
    if (wanted !== "") {
      const transport = transportFor();
      // **The list the PANE offers, so the offer and the acceptance cannot
      // disagree.** `authoringNode` narrows the transport's enumeration to
      // the providers this engine's CLI can run -- Claude Code runs Anthropic
      // models and nothing else -- and a verb that checked the whole
      // transport instead would accept a model the launch then refuses.
      // Session 156's first defect was this shape the other way round.
      const listed = (
        authoringNode(options.repoRoot, readingFor(transport))["candidates"] as Array<
          Record<string, unknown>
        >
      ).map((candidate) => String(candidate["model"]));
      const modelId = listed.find((id) => id === wanted) ?? null;
      if (modelId === null) {
        return {
          ...empty,
          refusal:
            `'${wanted}' is not a model this engine could author with on the ` +
            `${transport} transport. ${namesOffered(listed)}`,
        };
      }
      named["authoringModel"] = modelId;
    } else {
      named["authoringModel"] = "";
    }
  }
  if (options.transport !== undefined) {
    Object.assign(choice, { transport: options.transport });
  }
  if (named["authoringModel"] !== undefined) {
    Object.assign(choice, { authoringModel: named["authoringModel"] });
  }
  if (options.reviewerTransport !== undefined) {
    Object.assign(choice, { reviewerTransport: options.reviewerTransport });
  }
  // The engine and the SELECTION go to the USER-level preferences beside the
  // catalog, not to the repository's overlay and not to an editor setting.
  // Both are facts about who is at this keyboard: the engine is what
  // `dabbler session start` is given from any terminal, and which model
  // reviews is a choice about what this machine can reach. A selection that
  // travelled inside a checkout would tell the next clone about somebody
  // else's seat.
  //
  // **Every refusal comes before every write.** One call may set several
  // things, and a call that wrote the acceptable half before refusing the
  // rest would leave the operator's own preferences half-changed by a
  // command that reported failure -- so the checks run first and the writes
  // run only once nothing is left to refuse.
  const engine = options.engine?.trim();
  if (
    engine !== undefined &&
    engine !== "" &&
    !(BUILT_IN_ENGINES as readonly string[]).includes(engine)
  ) {
    return {
      ...empty,
      refusal:
        `'${engine}' is not an engine this framework has a launch for. ` +
        `It is one of: ${BUILT_IN_ENGINES.join(", ")}.`,
    };
  }
  const preferenceLines: string[] = [];
  // The id the catalog lists is what was checked and is what is written:
  // there is no second name for a model to be translated into on the way to
  // the file, which is the round trip `aliasFor` and `modelIdOf` existed for.
  if (named["reviewerModel"] !== undefined) {
    writePreferences({
      role: ROLE_PRIMARY_REVIEWER,
      selected: named["reviewerModel"],
    });
    preferenceLines.push(
      `the Primary Reviewer is '${named["reviewerModel"]}'; it is used and ` +
        "never silently substituted",
    );
  }
  if (named["auxiliaryModel"] !== undefined) {
    writePreferences({
      role: ROLE_AUXILIARY_REVIEWER,
      selected: named["auxiliaryModel"],
    });
    preferenceLines.push(
      `the Auxiliary Reviewer is '${named["auxiliaryModel"]}'; an ` +
        "adjudication still excludes every provider that has already " +
        "reviewed a round, and a selection it excludes stops the round " +
        "rather than being substituted",
    );
  }
  if (engine !== undefined) {
    writePreferences({ engine });
    preferenceLines.push(
      engine === ""
        ? `no engine is chosen; ${PREFERENCES_FILENAME} carries none`
        : `${PREFERENCES_FILENAME} chooses '${engine}' for the next session`,
    );
  }
  if (Object.keys(choice).length === 0 && preferenceLines.length === 0) {
    return { ...empty, refusal: "nothing to set: name an engine, a vehicle or a model." };
  }
  const written =
    Object.keys(choice).length === 0
      ? { path: null, changed: [] as readonly string[] }
      : writeConfigurationChoice(options.repoRoot, choice);
  // The pane reads the projection, and the projection is derived. Without
  // this the operator's own change is the one thing the surface does not
  // show until something unrelated moves a declaration.
  tryWriteProjection(options.repoRoot);
  return {
    refusal: null,
    changed: [...written.changed, ...preferenceLines],
    path: written.path,
    // Not a shadow any more: the variable decides nothing. An operator who
    // exported it is told so anyway, with the one command that replaces it,
    // because someone who believes their shell is choosing the vehicle will
    // otherwise read every later session as having ignored them.
    shadowed:
      process.env[TRANSPORT_ENV_VAR]
        ? `${TRANSPORT_ENV_VAR} is set to '${process.env[TRANSPORT_ENV_VAR]}' in ` +
          "this environment and is OBSOLETE: it is no longer part of how a " +
          "vehicle is resolved. What decides is this checkout's " +
          `${SETTINGS_RELPATH}, which \`dabbler configure --transport\` writes.`
        : null,
  };
}

export async function configureVerb(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  const values = new Map<string, string>();
  const flags = [
    "--engine",
    "--transport",
    "--reviewer-transport",
    "--authoring-model",
    "--reviewer-model",
    "--auxiliary-model",
    "--repo-root",
  ];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (!flags.includes(flag)) {
      writeErr(`dabbler configure: unexpected argument '${flag}'\n\n${usage()}`);
      return EXIT_USAGE;
    }
    const value = argv[index + 1];
    if (value === undefined) {
      writeErr(`dabbler configure: ${flag} needs a value\n\n${usage()}`);
      return EXIT_USAGE;
    }
    values.set(flag, value);
    index += 1;
  }
  // The repository when this is one, and otherwise where we stand: a
  // configuration is a fact about a checkout, and a checkout that is not a
  // git repository still has one.
  const here = workingDirectory();
  const options: ConfigureOptions = {
    repoRoot: values.get("--repo-root") ?? repoRootFor(here) ?? here,
    ...(values.has("--engine") ? { engine: values.get("--engine") as string } : {}),
    ...(values.has("--transport") ? { transport: values.get("--transport") as string } : {}),
    ...(values.has("--reviewer-transport")
      ? { reviewerTransport: values.get("--reviewer-transport") as string }
      : {}),
    ...(values.has("--authoring-model")
      ? { authoringModel: values.get("--authoring-model") as string }
      : {}),
    ...(values.has("--reviewer-model")
      ? { reviewerModel: values.get("--reviewer-model") as string }
      : {}),
    ...(values.has("--auxiliary-model")
      ? { auxiliaryModel: values.get("--auxiliary-model") as string }
      : {}),
  };
  let outcome: ConfigureOutcome;
  try {
    outcome = configure(options);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    writeErr(`dabbler configure: ${error.message}\n`);
    return EXIT_REFUSED;
  }
  if (outcome.refusal !== null) {
    writeErr(`dabbler configure: ${outcome.refusal}\n`);
    return EXIT_REFUSED;
  }
  writeOut(
    [
      ...outcome.changed.map((line) => `configure: ${line}`),
      // Two files, and the line names the one that was actually written:
      // the repository's overlay holds what a repository's session is run
      // with, and the user-level preferences hold what this operator chose.
      outcome.path === null
        ? "configure: written to this machine's preferences; it is the " +
          "default for the NEXT session."
        : `configure: written to ${outcome.path}; it is the default for the NEXT session.`,
      ...(outcome.shadowed === null ? [] : [`configure: ${outcome.shadowed}`]),
      "",
    ].join("\n"),
  );
  return EXIT_OK;
}
