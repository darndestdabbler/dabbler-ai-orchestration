// `dabbler configure` -- what the NEXT session is run with.
//
// The settings a person chooses and the framework cannot work out for
// itself: the VEHICLE each role is reached through, and which model reviews.
// Each is written to the machine-local overlay, which is the layer a
// machine's choice belongs at, and each is checked against the rules
// selection already owns before anything is written.
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
  explainRoleTransport,
  explainTransport,
  loadConfig,
  writeConfigurationChoice,
  type ConfigurationChoice,
} from "../config.ts";
import { BUILT_IN_ENGINES } from "../engines.ts";
import { repoRootFor } from "../journal.ts";
import { PREFERENCES_FILENAME, writePreferences } from "../preferences.ts";
import { workingDirectory } from "../workdir.ts";
import { orchestratorOf, roleReading, tryWriteProjection, type RoleReading } from "../projection.ts";
import { ROLE_PRIMARY_REVIEWER, reviewerRefusal } from "../selection.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler configure [-h] [--engine E] [--transport T]",
    "                         [--reviewer-transport T] [--reviewer-model M]",
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
    "                          says otherwise. An environment variable outranks",
    "                          this file, and the answer says so when one does",
    `  --reviewer-transport T  ${VALID_TRANSPORTS.join(" | ")}; the Primary`,
    "                          Reviewer's OWN vehicle, where it differs from the",
    "                          machine's. A review may need the other transport",
    "                          when provider independence requires it",
    "  --reviewer-model M      the model that reviews the next session, named as",
    "                          the reviewer's own transport lists it. The one",
    "                          refusal is the AUTHORING model itself -- which is",
    "                          the engine's, declared at `session start` -- and",
    "                          another model on the same provider is allowed",
    "  --repo-root PATH        the repository; derived from the cwd when absent",
    "  -h, --help              show this message",
    "",
  ].join("\n");
}

/** Every model the transport in force lists, in the order a role prefers. */
function offered(reading: RoleReading, role: string): Array<readonly [string, string, string]> {
  return reading.resolve(role, null).candidates;
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


export interface ConfigureOptions {
  readonly repoRoot: string;
  /** The engine the next session is offered; an empty value clears it. */
  readonly engine?: string;
  readonly transport?: string;
  /** The Primary Reviewer's own vehicle, where it differs from the machine's. */
  readonly reviewerTransport?: string;
  readonly reviewerModel?: string;
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
  // The reviewer's OWN vehicle decides which catalog block a reviewer model
  // is checked against, because that is the transport the round will be
  // dispatched over. Where this same call is also setting a vehicle, the one
  // being SET is the one to check against: checking the outgoing vehicle
  // would refuse `--reviewer-transport copilot-cli --reviewer-model <a seat
  // model>` for naming a model the transport it is leaving does not list,
  // which is the one pair of flags a person switching machines would type
  // together. The machine's `--transport` stands in where no reviewer
  // vehicle is named, which is how a repository that never wanted two
  // vehicles keeps the behaviour it had.
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
  const transport =
    options.reviewerTransport ??
    (options.transport !== undefined
      ? explainTransport(config, options.transport).transport
      : explainRoleTransport(config, ROLE_PRIMARY_REVIEWER).transport);
  const reading = roleReading(config, transport);
  const value = options.reviewerModel;
  if (value !== undefined) {
    const modelId = offeredId(reading, ROLE_PRIMARY_REVIEWER, value);
    if (modelId === null) {
      // A transport that has read nothing and one that lists other models
      // are different problems: the first has a free remedy and the second
      // needs a different name. Saying "not a model this registry declares"
      // over the first is what sent an operator looking for a registry that
      // no longer decides anything.
      return {
        ...empty,
        refusal:
          reading.unavailable !== null
            ? `'${value}' cannot be checked: ${reading.unavailable}.`
            : `'${value}' is not a model the ${transport} transport lists. ` +
              `It lists: ${offered(reading, ROLE_PRIMARY_REVIEWER)
                .map(([id]) => id)
                .sort()
                .join(", ")}.`,
      };
    }
    // The one rule, against the model that ACTUALLY authors: the engine's,
    // declared at `session start` and on the record from that moment. The
    // pane used to filter this list against a role nothing dispatched, so it
    // was checking the choice against the wrong author.
    const author = orchestratorOf(options.repoRoot).model;
    const refusal = author === null ? null : reviewerRefusal(author, modelId);
    if (refusal !== null) return { ...empty, refusal };
    named["reviewerModel"] = modelId;
  }
  if (options.transport !== undefined) {
    Object.assign(choice, { transport: options.transport });
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
    shadowed:
      choice.transport !== undefined && process.env["DABBLER_TRANSPORT"]
        ? `DABBLER_TRANSPORT is set to '${process.env["DABBLER_TRANSPORT"]}' in ` +
          "this environment and outranks the file, so it is what a session " +
          "started from here will use."
        : null,
  };
}

export async function configureVerb(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  const values = new Map<string, string>();
  const flags = ["--engine", "--transport", "--reviewer-transport", "--reviewer-model", "--repo-root"];
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
    ...(values.has("--reviewer-model")
      ? { reviewerModel: values.get("--reviewer-model") as string }
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
