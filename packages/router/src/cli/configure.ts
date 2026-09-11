// `dabbler configure` -- what the NEXT session is run with.
//
// The three settings a person chooses and the framework cannot work out for
// itself: which transport a provider is reached through, and which model
// authors and which one verifies. Each is written to the machine-local
// overlay, which is the layer a machine's choice belongs at, and each is
// checked against the rules selection already owns before anything is
// written.
//
// **It sets a default and never a session.** Engine identity is recorded per
// session at `session start` and is on the record from that moment; a control
// that appeared to change a session in flight would be offering something the
// ledger will not honour. The engine is not here for the same reason from the
// other side: `session start` takes it as an argument, so the default belongs
// to whichever surface offers to start one.
//
// The two refusals are read from selection rather than restated. A verifying
// model on the authoring model's own provider is refused because
// cross-provider review is an invariant of dispatch; one below the authoring
// model's declared tier is refused because a review is worth what the
// reviewer is. Both sentences come back from `verifierRefusal`, so the
// operator reads the rule's own words and not this file's paraphrase of them.

import {
  ConfigError,
  VALID_TRANSPORTS,
  loadConfig,
  writeConfigurationChoice,
  type ConfigurationChoice,
  type RouterConfig,
} from "../config.ts";
import { repoRootFor } from "../journal.ts";
import { workingDirectory } from "../workdir.ts";
import { tryWriteProjection } from "../projection.ts";
import {
  ROLE_GENERATOR,
  ROLE_VERIFIER,
  explainRegistryCandidates,
  verifierRefusal,
} from "../selection.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler configure [-h] [--transport T] [--authoring-model M]",
    "                         [--verifying-model M] [--repo-root PATH]",
    "",
    "  what the NEXT session is run with, written to local-overrides.yaml",
    "",
    "options:",
    `  --transport T           ${VALID_TRANSPORTS.join(" | ")}; how a provider is`,
    "                          reached. An environment variable outranks this file,",
    "                          and the answer says so when one does",
    "  --authoring-model M     the model the generator role tries first, by registry",
    "                          alias or by model id",
    "  --verifying-model M     likewise for the verifier role. Refused on the",
    "                          authoring model's own provider, and refused below its",
    "                          declared capability tier",
    "  --repo-root PATH        the repository; derived from the cwd when absent",
    "  -h, --help              show this message",
    "",
  ].join("\n");
}

/**
 * The registry alias for what the operator named.
 *
 * An alias is the key; a model id is what a role's preference order carries
 * and what a person is likelier to have in front of them. Both are accepted,
 * and neither is guessed at: a name that matches nothing comes back null and
 * is refused with the aliases listed.
 */
export function aliasFor(config: RouterConfig, named: string): string | null {
  const models = config["models"];
  if (typeof models !== "object" || models === null) return null;
  const entries = Object.entries(models as Record<string, unknown>);
  if (entries.some(([alias]) => alias === named)) return named;
  const byId = entries.find(
    ([, entry]) =>
      typeof entry === "object" &&
      entry !== null &&
      String((entry as Record<string, unknown>)["model_id"] ?? "") === named,
  );
  return byId === undefined ? null : byId[0];
}

/** The model id a role's preference order carries for that alias. */
function modelIdOf(config: RouterConfig, alias: string): string {
  const entry = (config["models"] as Record<string, Record<string, unknown>>)[alias];
  return String(entry?.["model_id"] ?? alias);
}

/** The authoring model in force once this choice is applied. */
function effectiveAuthor(config: RouterConfig, chosen: string | null): string | null {
  if (chosen !== null) return chosen;
  const resolved = explainRegistryCandidates(config, ROLE_GENERATOR).candidates[0];
  return resolved === undefined ? null : resolved[2];
}

/**
 * The verifier that would answer for that author today, resolved the way the
 * dispatch resolves it -- with the author's own provider excluded.
 */
function resolvedVerifier(config: RouterConfig, author: string | null): string | null {
  if (author === null) return null;
  const models = config["models"] as Record<string, Record<string, unknown>>;
  const provider = String(models[author]?.["provider"] ?? "");
  const resolved = explainRegistryCandidates(
    config,
    ROLE_VERIFIER,
    provider === "" ? null : [provider],
  ).candidates[0];
  return resolved === undefined ? null : resolved[2];
}

export interface ConfigureOptions {
  readonly repoRoot: string;
  readonly transport?: string;
  readonly authoringModel?: string;
  readonly verifyingModel?: string;
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
  for (const [key, value] of [
    ["authoringModel", options.authoringModel],
    ["verifyingModel", options.verifyingModel],
  ] as const) {
    if (value === undefined) continue;
    const alias = aliasFor(config, value);
    if (alias === null) {
      return {
        ...empty,
        refusal:
          `'${value}' is not a model this registry declares. Its models are: ` +
          `${Object.keys(config["models"] as Record<string, unknown>).sort().join(", ")}.`,
      };
    }
    named[key] = alias;
  }
  // Only a choice of MODEL is checked against the pair rule. A transport is
  // a different setting, and refusing it because two models that were
  // already in force disagree would leave an operator unable to change the
  // one thing they came to change.
  if (named["authoringModel"] || named["verifyingModel"]) {
    const author = effectiveAuthor(config, named["authoringModel"] ?? null);
    // The model being chosen AND the one already in force: raising the
    // authoring model can put a verifier that was fine below the floor, and
    // accepting that silently would be the pane making a promise the
    // dispatch does not keep.
    const verifier = named["verifyingModel"] ?? resolvedVerifier(config, author);
    if (author !== null && verifier !== null) {
      const refusal = verifierRefusal(config, author, verifier);
      if (refusal !== null) {
        return {
          ...empty,
          refusal: named["verifyingModel"]
            ? refusal
            : `${refusal} Choose the verifying model first, or choose both at once.`,
        };
      }
    }
  }
  if (options.transport !== undefined) {
    Object.assign(choice, { transport: options.transport });
  }
  if (named["authoringModel"]) {
    Object.assign(choice, { authoringModel: modelIdOf(config, named["authoringModel"]) });
  }
  if (named["verifyingModel"]) {
    Object.assign(choice, { verifyingModel: modelIdOf(config, named["verifyingModel"]) });
  }
  if (Object.keys(choice).length === 0) {
    return { ...empty, refusal: "nothing to set: name a transport or a model." };
  }
  const written = writeConfigurationChoice(options.repoRoot, choice);
  // The pane reads the projection, and the projection is derived. Without
  // this the operator's own change is the one thing the surface does not
  // show until something unrelated moves a declaration.
  tryWriteProjection(options.repoRoot);
  return {
    refusal: null,
    changed: written.changed,
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
  const flags = ["--transport", "--authoring-model", "--verifying-model", "--repo-root"];
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
    ...(values.has("--transport") ? { transport: values.get("--transport") as string } : {}),
    ...(values.has("--authoring-model")
      ? { authoringModel: values.get("--authoring-model") as string }
      : {}),
    ...(values.has("--verifying-model")
      ? { verifyingModel: values.get("--verifying-model") as string }
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
      `configure: written to ${outcome.path}; it is the default for the NEXT session.`,
      ...(outcome.shadowed === null ? [] : [`configure: ${outcome.shadowed}`]),
      "",
    ].join("\n"),
  );
  return EXIT_OK;
}
