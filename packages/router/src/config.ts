// Load and validate router-config.yaml; resolve transport preference and
// effective generation params.
//
// Structural validation runs through the JSON schema at
// `schemas/router-config.schema.json`. Semantic rules a schema cannot
// express (cross-references between blocks) run here, all at load time so a
// bad config fails at startup rather than mid-call. A role's preference
// order is deliberately not cross-referenced: it is ordering only, so a name
// that matches no model is a stale line rather than an error.
//
// Configuration resolves in three layers, and each one owns a different kind
// of fact:
//
// 1. The bundled `router-config.yaml` is package data and therefore the
//    *published* default: providers, their dispatch settings, roles and
//    transports. WHICH models exist is not among them and never was a
//    property of a repository -- that is read from this machine's own
//    vendors and seat, into its own catalog.
// 2. `dabbler.yaml` at the repository root is **tracked**, and carries what
//    the repository owns -- its suites, its selection rules, how it
//    publishes, which of its paths are sensitive. CI reads these and so does
//    the next machine, which is precisely why they cannot live in a
//    gitignored file.
// 3. `local-overrides.yaml` is machine facts only, deep-merged last and
//    never published. It is refused a key the repository owns, because an
//    overlay nobody can see must not be able to replace a suite command that
//    the run of record will then attribute to the repository.
//
// Config is the only layer that is client-independent, model-independent and
// transport-independent -- an instruction file cannot carry a machine fact
// because which instruction files load at all is a property of the client,
// and an env var reaches only processes started after it was written.
//
// The YAML is parsed as **1.1**, which is the version PyYAML implements:
// under 1.2 an unquoted `off` is the string "off" rather than false, and a
// config that means one thing to each router is the drift the port exists to
// remove.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";

import { parse as parseYaml } from "yaml";

import { ASSET_DIR, SCHEMA_DIR } from "./paths.ts";
import { repoRootFor } from "./journal.ts";
import { schemaFailure } from "./schema/validate.ts";
import { readText } from "./textfile.ts";
import { validateTransportTimeouts } from "./contracts/transports.ts";
import { readPreferences } from "./preferences.ts";
import {
  SETTINGS_RELPATH,
  SETTING_AUTHORING_MODEL,
  SETTING_REVIEWER_TRANSPORT,
  SETTING_TRANSPORT,
  type SettingKey,
  readSettings,
  writeSettings,
} from "./settings.ts";
import { workingDirectory } from "./workdir.ts";

/** The loaded config: schema-shaped data plus the `_`-prefixed provenance. */
export type RouterConfig = Record<string, unknown>;

/** Every refusal this module raises. Python spells them ValueError. */
export class ConfigError extends Error {}

/** The named config does not exist. Python spells it FileNotFoundError. */
export class ConfigNotFoundError extends ConfigError {}

const SCHEMA_PATH = join(SCHEMA_DIR, "router-config.schema.json");
const PROJECT_SCHEMA_PATH = join(SCHEMA_DIR, "dabbler.schema.json");
const BUNDLED_CONFIG_PATH = join(ASSET_DIR, "router-config.yaml");

export const LOCAL_OVERRIDES_FILENAME = "local-overrides.yaml";
export const PROJECT_CONFIG_FILENAME = "dabbler.yaml";

/**
 * The blocks a repository owns. They are declared in the tracked
 * `dabbler.yaml` and refused in the machine-local overlay: the split is what
 * keeps a gitignored file from rewriting a fact the record attributes to the
 * repository.
 */
export const REPOSITORY_OWNED_BLOCKS: ReadonlySet<string> = new Set([
  "testing",
  "packaging",
  "paths",
  // The driver's invocation budget is a spend ceiling, and a ceiling an
  // untracked overlay could raise would be a machine deciding how much of
  // a seat a repository's session may consume.
  "driver",
]);

export const TRANSPORT_API = "api";
export const TRANSPORT_COPILOT_CLI = "copilot-cli";
// Scripted responses from disk: no network, no credentials, no spend. It
// answers from a directory the operator names, so it cannot be reached by
// default or by accident.
export const TRANSPORT_OFFLINE = "offline";
export const VALID_TRANSPORTS = [
  TRANSPORT_API,
  TRANSPORT_COPILOT_CLI,
  TRANSPORT_OFFLINE,
] as const;

/**
 * The variable that used to decide this, kept only so a surface can say it
 * no longer does.
 *
 * **It is not in the resolution order.** A layer that outranked every other
 * and was written by nothing is how the pane came to save a preference the
 * next session ignored: `bootstrap` persisted it at USER scope, so one
 * repository's detection shadowed every repository on the machine, for
 * every later run, invisibly. Read by `configure`, to tell an operator who
 * still exports it that it is ignored and what replaces it; read by nothing
 * that decides anything.
 */
export const TRANSPORT_ENV_VAR = "DABBLER_TRANSPORT";
export const CONFIG_ENV_VAR = "AI_ROUTER_CONFIG";

/** The backstop every review loop shares when the config names no bound. */
export const DEFAULT_VERIFICATION_ROUNDS = 3;

/**
 * The backstop for the test loop. Higher than the review bound because the
 * rounds are different things: a review round buys a vendor's opinion, a test
 * round runs a suite the framework already has. What both bounds stop is an
 * unattended loop that never converges.
 */
export const DEFAULT_TEST_ROUNDS = 7;

export const CRITIQUE_PIPELINE_DEFAULT = "off";
export const CRITIQUE_PIPELINE_SHADOW = "shadow";
export const CRITIQUE_PIPELINE_ENFORCE = "enforce";
// The set that implements enforcement. Named in the refusal so an operator
// who sets 'enforce' early learns what they are waiting for.
export const CRITIQUE_ENFORCE_SET = "145-lite-enforcement-and-projection";

// Keys required in transports.copilot-cli when that transport is selected.
// Roles are not among them: selection is by role on both transports, so the
// declaration is top-level and a seat block does not own it.
// The seat block has no required key: which models the seat has is read
// from the seat, into this machine's own catalog, and never configured.
const COPILOT_CLI_REQUIRED_KEYS: readonly string[] = [];

// --- Small helpers over untyped YAML ----------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * Python's truthiness, for the scalars a config value or a recorded row can
 * hold: `enabled: false`, `enabled: 0`, `enabled:` (null) and an absent key
 * are all "off", and `entry.get(key, True)` is `truthy(entry[key] ?? true)`.
 *
 * Scalars only, deliberately. Python calls `[]` and `{}` falsy where
 * JavaScript calls them truthy, and every caller here reads a flag: a
 * container in one of these positions is a config error, and the one thing
 * this must not do is quietly decide what the operator meant by it.
 */
export function truthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (value === 0 || value === "") return false;
  return true;
}

/** Python's `type(x).__name__`, for a refusal that names what it got. */
function typeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  return "dict";
}

function deepCopy<T>(value: T): T {
  return structuredClone(value);
}

export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out = deepCopy(base);
  for (const [key, value] of Object.entries(override ?? {})) {
    const existing = out[key];
    if (isRecord(existing) && isRecord(value)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = deepCopy(value);
    }
  }
  return out;
}

function readYaml(path: string): unknown {
  // 1.1 is PyYAML's version; see the module header.
  return parseYaml(readText(path), { version: "1.1" }) ?? null;
}

// --- Schemas ----------------------------------------------------------------

let schemaCache: Record<string, unknown> | undefined;
let projectSchemaCache: Record<string, unknown> | undefined;
let overlaySchemaCache: Record<string, unknown> | undefined;

function loadSchema(): Record<string, unknown> {
  schemaCache ??= JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<
    string,
    unknown
  >;
  return schemaCache;
}

function projectSchema(): Record<string, unknown> {
  projectSchemaCache ??= JSON.parse(
    readFileSync(PROJECT_SCHEMA_PATH, "utf8"),
  ) as Record<string, unknown>;
  return projectSchemaCache;
}

/**
 * The vocabulary a machine-local overlay may use: the router-config schema
 * with the repository-owned blocks removed.
 *
 * Removed rather than merely checked, so "the overlay may not say this" is
 * one statement in one place. Anything the schema still declares is a machine
 * fact and stays overridable, including the provider key names that make a
 * checkout its own cost center.
 */
function overlaySchema(): Record<string, unknown> {
  if (overlaySchemaCache === undefined) {
    const schema = deepCopy(loadSchema());
    const properties = record(schema["properties"]);
    for (const block of REPOSITORY_OWNED_BLOCKS) delete properties[block];
    overlaySchemaCache = schema;
  }
  return overlaySchemaCache;
}

function validateAgainst(
  data: unknown,
  schema: Record<string, unknown>,
  subject: string,
): void {
  const failure = schemaFailure(data, schema, subject);
  if (failure) throw new ConfigError(failure);
}

// --- Where the three layers live --------------------------------------------

/** Where the three layers were found. */
export interface ConfigSources {
  readonly base: string;
  readonly project: string | null;
  readonly overrides: string | null;
}

/** The two layer files, in the order they merge. */
export const LAYER_FILENAMES = [
  PROJECT_CONFIG_FILENAME,
  LOCAL_OVERRIDES_FILENAME,
] as const;

/**
 * The base config plus the two layers, the latter null when they do not
 * apply. A decision over facts: which path the caller named, what the env var
 * says, where the project root is, and which layer files that root holds.
 *
 * An explicitly-named config -- by argument or by `AI_ROUTER_CONFIG` -- is the
 * whole answer and takes neither layer: a caller that named a file means that
 * file. The layers apply only over the bundled default, which is the one
 * config nobody on this machine chose. This is also why `AI_ROUTER_CONFIG` is
 * not the way a foreign repository declares itself -- pointing it at a
 * hand-written file forks the provider list and the model registry in order to
 * say how to run a test suite, which is the drift the layering exists to
 * prevent. `dabbler.yaml` is that way.
 */
export function chooseConfigSources(
  explicitPath: string | undefined,
  envPath: string | undefined,
  root: string | null,
  present: ReadonlySet<string>,
): ConfigSources {
  const base = explicitPath ?? (envPath || BUNDLED_CONFIG_PATH);
  if (explicitPath !== undefined || envPath) {
    return { base, project: null, overrides: null };
  }
  const layer = (filename: string): string | null =>
    root !== null && present.has(filename) ? join(root, filename) : null;
  return {
    base,
    project: layer(PROJECT_CONFIG_FILENAME),
    overrides: layer(LOCAL_OVERRIDES_FILENAME),
  };
}

/**
 * The thin reader behind the decision above: which of the layer files the
 * project root actually holds. Nothing here judges anything.
 */
function layerFilesAt(root: string | null): ReadonlySet<string> {
  const present = new Set<string>();
  if (root === null) return present;
  for (const filename of LAYER_FILENAMES) {
    try {
      if (statSync(join(root, filename)).isFile()) present.add(filename);
    } catch {
      // Absent, or not readable from here: the same answer either way.
    }
  }
  return present;
}

function resolveConfigSources(path?: string, projectDir?: string): ConfigSources {
  const root = projectRoot(projectDir);
  return chooseConfigSources(
    path,
    process.env[CONFIG_ENV_VAR],
    root,
    layerFilesAt(root),
  );
}

// Resolved once per working directory: the overlay's location is a property
// of the project, and re-shelling out to git on every config load is not.
const projectRootCache = new Map<string, string | null>();

/**
 * The git toplevel of `projectDir`, or of the working directory when none is
 * named, or null outside a repository. The router already discovers the
 * project this way for evidence and gates; a second notion of "the project"
 * would be a second thing to disagree.
 */
export function projectRoot(projectDir?: string): string | null {
  const start = resolvePath(projectDir ?? workingDirectory());
  if (!projectRootCache.has(start)) {
    projectRootCache.set(start, repoRootFor(start));
  }
  return projectRootCache.get(start) ?? null;
}

/** Discard the memoized project roots. The cache is per-process, and a test
 *  that moves the working directory between repositories needs it gone. */
export function resetProjectRootCache(): void {
  projectRootCache.clear();
}

function rootRelativeFile(
  projectDir: string | undefined,
  filename: string,
): string | null {
  const root = projectRoot(projectDir);
  return layerFilesAt(root).has(filename) ? join(root as string, filename) : null;
}

/** The machine-local overlay, when the project has one. */
export function localOverridesPath(projectDir?: string): string | null {
  return rootRelativeFile(projectDir, LOCAL_OVERRIDES_FILENAME);
}

/** The repository's own tracked config, when it has one. */
export function projectConfigPath(projectDir?: string): string | null {
  return rootRelativeFile(projectDir, PROJECT_CONFIG_FILENAME);
}

// --- The overlay's vocabulary ------------------------------------------------

/**
 * Refuse an overlay key the schema declares no vocabulary for.
 *
 * A dropped override is the failure this file exists to prevent: the operator
 * states a machine fact, the router ignores it, and the symptom surfaces
 * somewhere else entirely. Where the schema names its properties, that list is
 * the vocabulary and a key outside it is refused; where it declares an open
 * object -- a provider or model name, or a block the schema deliberately
 * leaves unstructured -- anything goes and recursion stops. The seat transport
 * block therefore has to be *declared* in the schema rather than left opaque,
 * because it is the block a seat-only machine most needs to override and a
 * typo there would be silent.
 */
function rejectUnknownOverlayKeys(
  overlay: Record<string, unknown>,
  schema: unknown,
  source: string,
  trail: readonly string[] = [],
): void {
  if (!isRecord(schema)) return;
  const properties = isRecord(schema["properties"])
    ? (schema["properties"] as Record<string, unknown>)
    : undefined;
  const additional = schema["additionalProperties"];

  for (const [key, value] of Object.entries(overlay)) {
    let subschema: unknown;
    if (properties !== undefined && key in properties) {
      subschema = properties[key];
    } else if (isRecord(additional)) {
      subschema = additional;
    } else if (properties !== undefined) {
      const dotted = [...trail, key].join(".");
      if (trail.length === 0 && REPOSITORY_OWNED_BLOCKS.has(key)) {
        throw new ConfigError(
          `${source} sets '${dotted}', which the repository owns. ` +
            `Declare it in ${PROJECT_CONFIG_FILENAME} at the ` +
            "repository root, where it is tracked. A suite command " +
            "or a packaging feed coming from a gitignored file " +
            "would be attributed by the run of record to a " +
            "repository that never declared it.",
        );
      }
      throw new ConfigError(
        `${source} sets unknown key '${dotted}': ` +
          "router-config.schema.json declares no such setting. An " +
          "override the router would silently drop is refused instead.",
      );
    } else {
      continue;
    }
    if (isRecord(value)) {
      rejectUnknownOverlayKeys(value, subschema, source, [...trail, key]);
    }
  }
}

// --- Loading ------------------------------------------------------------------

export function loadConfig(path?: string, projectDir?: string): RouterConfig {
  return loadConfigFrom(resolveConfigSources(path, projectDir));
}

/**
 * Everything loading a config decides, once the three layers are known.
 *
 * The split is the whole of what git contributes: `loadConfig` finds the
 * project root and asks what it holds, and this reads exactly the files it is
 * handed. Merge order, both schemas, the overlay's vocabulary, the
 * cross-block rules and the provenance keys live here, so all of it can be
 * exercised from named files in any directory.
 */
export function loadConfigFrom(sources: ConfigSources): RouterConfig {
  if (!existsSync(sources.base)) {
    throw new ConfigNotFoundError(
      `Router config not found: ${sources.base}. Create it from the ` +
        "bundled router-config.yaml."
    );
  }

  let config = record(readYaml(sources.base));

  // Tracked first, machine-local second: a machine may disagree with the
  // distribution, and never with the repository.
  if (sources.project !== null) {
    config = applyProjectConfig(config, sources.project);
  }
  if (sources.overrides !== null) {
    config = applyLocalOverrides(config, sources.overrides);
  }

  validateAgainst(config, loadSchema(), "router-config.yaml");

  for (const provider of Object.values(record(config["providers"]))) {
    if (isRecord(provider) && !("enabled" in provider)) provider["enabled"] = true;
  }

  validateCopilotBlock(config);
  applyRunCoreDefaults(config);
  resolveCritiqueBlock(config);
  loadPromptTemplates(config, dirname(resolvePath(sources.base)));

  config["_config_path"] = resolvePath(sources.base);
  config["_project_config_path"] =
    sources.project === null ? null : resolvePath(sources.project);
  config["_local_overrides_path"] =
    sources.overrides === null ? null : resolvePath(sources.overrides);
  return config;
}

function renderList(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
}

/**
 * Resolve the critique pipeline's authority, refusing a mode no code honours.
 *
 * `enforce` is declared in the schema so the vocabulary lives in one place,
 * and refused here because nothing yet reads critique artifacts to decide
 * anything. Downgrading it silently to `shadow` would leave an operator
 * believing their work is being gated when it is not, which is the failure
 * this refusal exists to prevent.
 */
function resolveCritiqueBlock(config: RouterConfig): void {
  const block = record(config["critique"]);
  const mode = "pipeline" in block ? block["pipeline"] : CRITIQUE_PIPELINE_DEFAULT;
  if (mode === CRITIQUE_PIPELINE_ENFORCE) {
    throw new ConfigError(
      `critique.pipeline: '${CRITIQUE_PIPELINE_ENFORCE}' is refused at ` +
        `load. Enforcement arrives with set ${CRITIQUE_ENFORCE_SET}; ` +
        "until then the accepted values are " +
        `'${CRITIQUE_PIPELINE_DEFAULT}' (the default, which writes ` +
        `nothing) and '${CRITIQUE_PIPELINE_SHADOW}', which records ` +
        "critique artifacts without letting them decide anything.",
    );
  }
  config["critique"] = { ...block, pipeline: mode };
}

/**
 * Merge the repository's own tracked config over the packaged default.
 *
 * The file is validated against its own schema rather than against the
 * router's, because the two declare different things: this one is a short,
 * closed list of what a repository owns, and a key outside that list is a
 * repository trying to fork a distribution fact. `schema_version` is stripped
 * after validation -- it describes the file, not the router.
 */
function applyProjectConfig(
  config: Record<string, unknown>,
  projectPath: string,
): Record<string, unknown> {
  const declared = readYaml(projectPath);
  if (declared === null) {
    throw new ConfigError(
      `${projectPath} is empty. A repository with nothing to declare ` +
        `has no ${PROJECT_CONFIG_FILENAME}; an empty one cannot state ` +
        "its schema_version and so cannot be read at all.",
    );
  }
  if (!isRecord(declared)) {
    throw new ConfigError(
      `${projectPath} must be a mapping of config blocks, got ` +
        typeName(declared),
    );
  }
  validateAgainst(declared, projectSchema(), projectPath);
  const blocks: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(declared)) {
    if (key !== "schema_version") blocks[key] = value;
  }
  return deepMerge(config, blocks);
}

/**
 * Deep-merge the machine-local overlay on last.
 *
 * The overlay is partial -- only the keys it changes -- and the merged result
 * goes through the same schema and semantic checks as any config, so an
 * overlay cannot produce a config the router would have refused. It is refused
 * the blocks the repository owns before anything is merged: it wins over the
 * distribution, never over `dabbler.yaml`.
 */
function applyLocalOverrides(
  config: Record<string, unknown>,
  overridesPath: string,
): Record<string, unknown> {
  const overrides = readYaml(overridesPath);
  if (overrides === null) return config;
  if (!isRecord(overrides)) {
    throw new ConfigError(
      `${overridesPath} must be a mapping of config keys to override, got ` +
        typeName(overrides),
    );
  }
  rejectUnknownOverlayKeys(overrides, overlaySchema(), overridesPath);
  return deepMerge(config, overrides);
}

export const RUN_CORE_DEFAULTS: Record<string, Record<string, unknown>> = {
  run_policy: {
    default: "fast",
    verification_rounds: 3,
    diff_limit_lines: 1500,
    check_timeout_seconds: 1800,
    budgets: {
      // Null, not a figure: dollars are not computed on either transport,
      // so a dollar ceiling could only ever compare against zero and would
      // read as an assurance nothing enforces. The knob survives for a
      // deployment that reintroduces pricing; the dispatch ceiling below is
      // what actually bounds spend.
      model_usd: null,
      model_dispatches: 3,
      elapsed_minutes: 120,
    },
  },
  // A repository fact, so it is declared in dabbler.yaml and defaulted here
  // rather than sitting in run_policy where the machine-local overlay could
  // have quietly emptied it.
  paths: { sensitive_paths: [] },
  git: {
    push_on_finish: false,
    worktree_per_run: false,
    remote: "origin",
  },
  explorer: { stale_after_minutes: 5 },
  worktree: { root: null, init: [] },
};

/**
 * Fill the run-core blocks so every reader sees the same shape.
 *
 * An existing repository needs no new configuration for `fast`: an absent
 * block is the documented default, not an unconfigured feature. The schema has
 * already refused unknown keys and out-of-range limits, so the only rule left
 * here is the one a range check cannot express -- a null dollar ceiling
 * disables the dollar ceiling and nothing else.
 */
function applyRunCoreDefaults(config: RouterConfig): void {
  for (const [block, defaults] of Object.entries(RUN_CORE_DEFAULTS)) {
    config[block] = deepMerge(deepCopy(defaults), record(config[block]));
  }
  const budgets = record(record(config["run_policy"])["budgets"]);
  if (budgets["model_dispatches"] === null || budgets["model_dispatches"] === undefined) {
    throw new ConfigError(
      "run_policy.budgets.model_dispatches has no 'unlimited' value: " +
        "a dispatch ceiling is what bounds framework model calls, " +
        "because no transport reports a dollar figure to cap.",
    );
  }
}

/**
 * When the copilot-cli transport is configured, its block must be complete --
 * selecting the seat transport and silently falling back to a keyless API path
 * is a worse failure than refusing to load.
 */
function validateCopilotBlock(config: RouterConfig): void {
  const transports = record(config["transports"]);
  if (!(TRANSPORT_COPILOT_CLI in transports)) return;
  const block = transports[TRANSPORT_COPILOT_CLI];
  if (block === null || block === undefined) return;
  if (!isRecord(block)) {
    throw new ConfigError("transports.copilot-cli must be a mapping");
  }
  const missing = COPILOT_CLI_REQUIRED_KEYS.filter((key) => !(key in block)).sort();
  if (missing.length > 0) {
    throw new ConfigError(
      `transports.copilot-cli is missing required key(s): ${renderList(missing)}`,
    );
  }
  try {
    validateTransportTimeouts(block["timeouts"]);
  } catch (error) {
    throw new ConfigError(error instanceof Error ? error.message : String(error));
  }
}

// --- Round caps ---------------------------------------------------------------

/**
 * A loop bound from `verification.settings`, or the shipped default.
 *
 * A missing, unparseable or non-positive setting falls back to the default
 * rather than to no cap -- a bound that a malformed config can switch off is
 * not a bound.
 */
function roundCap(config: RouterConfig, key: string, fallback: number): number {
  const settings = record(record(config["verification"])["settings"]);
  const raw = key in settings ? settings[key] : fallback;
  const cap = toInteger(raw);
  if (cap === null) return fallback;
  return cap >= 1 ? cap : fallback;
}

/** Python's `int(x)`: exact for numbers and numeric strings, else nothing. */
function toInteger(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return null;
    return Number.parseInt(trimmed, 10);
  }
  return null;
}

/**
 * How many review rounds any loop may open before it must terminate.
 *
 * One resolver for every loop that calls a vendor per round, because a cap
 * read through two code paths is a cap two loops eventually disagree about.
 * The closed severity vocabulary is the primary control and this is the
 * backstop: an unattended loop that never converges still stops calling
 * vendors.
 */
export function verificationRoundCap(config: RouterConfig): number {
  return roundCap(config, "max_rounds", DEFAULT_VERIFICATION_ROUNDS);
}

/**
 * How many times the framework runs the authored tests before the loop must
 * terminate.
 *
 * Separate from the review bound because the two loops meter different things
 * -- a review round buys a vendor's opinion and a test round runs a suite --
 * and one number serving both would tune each against the other's cost.
 */
export function runRoundCap(config: RouterConfig): number {
  return roundCap(config, "max_test_rounds", DEFAULT_TEST_ROUNDS);
}

export const DEFAULT_DRIVER_INVOCATIONS = 24;

/**
 * How many times one driven session may invoke the engine, from
 * `driver.max_invocations` in the repository's `dabbler.yaml`, or the
 * shipped default.
 *
 * Its own bound rather than a third key under `verification.settings`: a
 * verification round buys a reviewer's opinion and an invocation buys an
 * authoring engine's turn -- on a seat, one premium request each -- and
 * the two are spent by different loops. The fallback rule is the round
 * caps' own: a malformed or non-positive value is the default, never no
 * bound at all.
 */
export function driverInvocationCap(config: RouterConfig): number {
  const block = record(config["driver"]);
  const cap = toInteger("max_invocations" in block ? block["max_invocations"] : null);
  if (cap === null) return DEFAULT_DRIVER_INVOCATIONS;
  return cap >= 1 ? cap : DEFAULT_DRIVER_INVOCATIONS;
}

export const ENGINE_OUTPUT_MODES = ["stream", "quiet"] as const;
export type EngineOutput = (typeof ENGINE_OUTPUT_MODES)[number];
export const DEFAULT_ENGINE_OUTPUT: EngineOutput = "stream";

/**
 * What a person sees of the engine while `session drive` runs it, from
 * `driver.engine_output`: `stream` renders its output as it happens,
 * `quiet` records it only. The transcript is the same either way -- this
 * is a knob about the terminal, never about the record -- which is why an
 * unrecognised value falls to `stream` rather than refusing the run.
 */
export function driverEngineOutput(config: RouterConfig): EngineOutput {
  const block = record(config["driver"]);
  const value = block["engine_output"];
  return typeof value === "string" && (ENGINE_OUTPUT_MODES as readonly string[]).includes(value)
    ? (value as EngineOutput)
    : DEFAULT_ENGINE_OUTPUT;
}

// --- Transport and generation params -----------------------------------------

/** The names of the three layers a transport can be set at, in precedence order. */
export const TRANSPORT_SOURCE_FLAG = "--transport flag";
/** This CHECKOUT's own answer: committed, shared, and the solution's policy. */
export const TRANSPORT_SOURCE_SETTINGS = SETTINGS_RELPATH;
/** This PERSON's answer, where the checkout does not give one. */
export const TRANSPORT_SOURCE_PREFERENCES = "preferences.json";
/** The same two layers, for the vehicle the reviewing roles share. */
export const REVIEWING_SOURCE_SETTINGS = SETTING_REVIEWER_TRANSPORT;
export const REVIEWING_SOURCE_PREFERENCES = `preferences.json ${SETTING_REVIEWER_TRANSPORT.slice(
  "dabbler.".length,
)}`;

/**
 * Every layer a PERSON puts a vehicle in force at.
 *
 * Stated once, as one list, because it is read by the gate that refuses an
 * unreachable vehicle at a session's start -- and a gate whose list was
 * missing the two reviewing layers checked a rule it did not apply, which
 * is worse than not having it. What is deliberately NOT here is the
 * shipped configuration: a machine with no seat and no keys yet is a
 * first-run machine, and refusing it would refuse the setup that fixes it.
 */
export const CHOSEN_VEHICLE_LAYERS: readonly string[] = [
  TRANSPORT_SOURCE_FLAG,
  TRANSPORT_SOURCE_SETTINGS,
  TRANSPORT_SOURCE_PREFERENCES,
  REVIEWING_SOURCE_SETTINGS,
  REVIEWING_SOURCE_PREFERENCES,
];
export const TRANSPORT_SOURCE_CONFIG = "transport.profile";

/** One layer that named a transport: where it was set, and to what. */
export interface TransportLayer {
  readonly source: string;
  /** As it was written, before normalisation -- the operator has to recognise it. */
  readonly value: string;
}

/**
 * Which transport is effective, and which layer decided it.
 *
 * `layers` is every layer that named one, in precedence order, so the first
 * of them is the one that decided; `decidedBy` is null when none did and the
 * default stands. A surface that shows a person a transport control needs
 * both halves: a value alone cannot say that the setting they are looking at
 * is being shadowed by one above it, and that is the failure this repository
 * has already had -- a persisted `DABBLER_TRANSPORT` deciding the cost of
 * every session while the config said otherwise.
 */
export interface TransportReading {
  readonly transport: string;
  readonly decidedBy: string | null;
  readonly layers: readonly TransportLayer[];
}

/**
 * The effective transport for routine dispatch, with the layers that named
 * one.
 *
 * **Precedence: a typed flag, then this CHECKOUT, then this PERSON, then
 * what the distribution ships.** A `--transport` flag is what the operator
 * said at this call; `<repo>/.vscode/settings.json` is the solution's own
 * policy, committed and shared, and outranks a personal default because a
 * repository that needs the seat needs it for everyone who opens it; the
 * user-level `preferences.json` is what this person chose where the
 * solution said nothing; and `transport.profile` in the loaded config is
 * the distribution's answer, which may come from the bundled
 * `router-config.yaml` or from a project-local `local-overrides.yaml`
 * merged over it -- the overlay is a config SOURCE, not a precedence tier,
 * so nothing above it changes its answer. Nothing named at all is `api`.
 *
 * **`DABBLER_TRANSPORT` is not one of these layers and cannot become one.**
 * Every layer above is something a surface can show and a verb can write;
 * an environment variable is neither, and this one was persisted at user
 * scope by `bootstrap` -- so it outranked every file, for every repository
 * on the machine, while the only thing that could change it was a shell
 * nobody was looking at.
 *
 * `root` is which checkout's settings file is read. It defaults to the
 * project the router is standing in, so a caller that does not care does
 * not have to say; a caller drawing a pane for a named repository does.
 *
 * An unknown value fails loud at whichever level supplied it. Only the
 * DECIDING layer is validated, which is what `resolveTransport` has always
 * done: a layer nothing reads has never been able to fail a call, and a
 * reading that started refusing over a shadowed value would refuse calls
 * that work today.
 */
/**
 * The overlay's own `transport.profile`, which no longer decides anything.
 *
 * **It was a fifth input, and the fifth input is the whole problem.** The
 * replaced `bootstrap --transport` and `dabbler configure --transport` wrote
 * exactly this key, so every checkout made before this session carries one --
 * and it now sits BELOW the user-level preferences, which means a personal
 * default would silently override the checkout file an operator deliberately
 * wrote. That is the same shadowing `DABBLER_TRANSPORT` was deleted for,
 * pointing the other way.
 *
 * So it is a stop, in the same shape as the stale auxiliary key: the
 * document says something that does not happen, and nothing may choose on
 * the operator's behalf which of the two readings is real. One command
 * clears it, and the refusal names that command.
 *
 * Only the OVERLAY is read here. `transport.profile` in the distribution's
 * own `router-config.yaml` is the built-in default and is untouched: that is
 * the bottom tier of the order, not a fifth input.
 */
function overlayTransport(projectDir: string | undefined): string | null {
  const path = localOverridesPath(projectDir);
  if (path === null) return null;
  try {
    const parsed: unknown = parseYaml(readText(path));
    const transport = record(record(parsed as Record<string, unknown>)["transport"])["profile"];
    return typeof transport === "string" && transport.trim() !== "" ? transport.trim() : null;
  } catch {
    // An unreadable overlay is refused by the loader with its own sentence;
    // this reading is not the place to say it a second way.
    return null;
  }
}

function refuseObsoleteOverlayTransport(projectDir: string | null): void {
  const declared = overlayTransport(projectDir ?? undefined);
  if (declared === null) return;
  throw new ConfigError(
    `${LOCAL_OVERRIDES_FILENAME} still says transport.profile: '${declared}', and ` +
      "that key no longer decides anything -- a vehicle is chosen by a " +
      `--transport flag, then ${SETTINGS_RELPATH}, then the user-level ` +
      "preferences.json. Leaving it readable would let a personal default " +
      "silently override the checkout file you wrote. Run `dabbler configure " +
      `--transport ${declared}` +
      "` to put it where it is read, then delete transport.profile from " +
      `${LOCAL_OVERRIDES_FILENAME}.`,
  );
}

/**
 * This checkout's own settings, or a refusal naming the file.
 *
 * **A settings file this parser cannot read is a stop, not silence.** A
 * half-typed `dabbler.transport` an operator can plainly see, ignored while
 * a lower layer decides, is the same invisibility `DABBLER_TRANSPORT` was
 * deleted for -- with the value and the behaviour differing and nothing
 * saying so. The refusal names the file, so the fix is where the operator
 * is already looking.
 */
function checkoutSettings(root: string | null): Readonly<Partial<Record<SettingKey, string>>> {
  if (root === null) return {};
  const reading = readSettings(root);
  if (reading.malformed !== null) {
    throw new ConfigError(
      `${SETTINGS_RELPATH} could not be read (${reading.malformed}), so nothing ` +
        "in it decides anything. Fix the file: a setting you can see being " +
        "ignored is worse than one that is not there.",
    );
  }
  return reading.values;
}

/**
 * What this person chose on this machine, or null.
 *
 * Total, like every other reading of the preferences file: a missing file, a
 * torn one, or a suite that has not pointed the reader anywhere is *nobody
 * chose*, which is exactly what a layer that did not speak means here. A
 * config load that threw because a preference could not be read would take
 * out every verb over a file that is defined as optional.
 */
function personalTransport(key: "transport" | "reviewer_transport" = "transport"): string | null {
  try {
    return readPreferences()[key] ?? null;
  } catch {
    return null;
  }
}

export function explainTransport(
  config: RouterConfig,
  cliFlag?: string | null,
  root?: string | null,
): TransportReading {
  const checkout = root ?? projectRoot();
  refuseObsoleteOverlayTransport(checkout);
  const candidates: ReadonlyArray<readonly [string, unknown]> = [
    [TRANSPORT_SOURCE_FLAG, cliFlag ?? null],
    [TRANSPORT_SOURCE_SETTINGS, checkoutSettings(checkout)[SETTING_TRANSPORT] ?? null],
    [TRANSPORT_SOURCE_PREFERENCES, personalTransport()],
    [TRANSPORT_SOURCE_CONFIG, record(config["transport"])["profile"] ?? null],
  ];
  const layers: TransportLayer[] = candidates
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([source, value]) => ({ source, value: String(value) }));
  const decided = layers[0];
  if (decided === undefined) {
    return { transport: TRANSPORT_API, decidedBy: null, layers };
  }
  const normalized = decided.value.trim().toLowerCase();
  if (!(VALID_TRANSPORTS as readonly string[]).includes(normalized)) {
    throw new ConfigError(
      `${decided.source} must be one of ${renderList(VALID_TRANSPORTS)}, ` +
        `got '${decided.value}'`,
    );
  }
  return { transport: normalized, decidedBy: decided.source, layers };
}

/** The effective transport, which is `explainTransport` with the reasons dropped. */
export function resolveTransport(
  config: RouterConfig,
  cliFlag?: string | null,
  root?: string | null,
): string {
  return explainTransport(config, cliFlag, root).transport;
}

/**
 * Where the reviewing vehicle is stated in a configuration document, and
 * where it USED to be stated for the third voice.
 *
 * These are config PATHS, not role identities -- `selection.ts` owns what a
 * role is, and this module owns the shape of the file. `reviewer` is the one
 * reviewing vehicle; `auxiliary-reviewer` is the key that is now stale, kept
 * only so a document that still carries it can be recognised and named.
 */
export const REVIEWING_TRANSPORT_KEY = "roles.reviewer.transport";
export const STALE_AUXILIARY_TRANSPORT_KEY = "roles.auxiliary-reviewer.transport";

/** The layer name the reviewing vehicle is set at in the loaded config. */
export const TRANSPORT_SOURCE_ROLE = REVIEWING_TRANSPORT_KEY;

function declaredTransport(config: RouterConfig, role: string): string | null {
  const declared = record(record(config["roles"])[role])["transport"];
  if (declared === undefined || declared === null || String(declared).trim() === "") return null;
  return String(declared);
}

/**
 * The vehicle one NON-reviewing role is dispatched over.
 *
 * The reviewing pair does not come through here -- they share one vehicle,
 * read by `explainReviewingTransport`, which is the whole of this step. What
 * is left is the generic config-tier answer: a role that declares its own
 * `transport` is dispatched over it, and a role that declares none resolves
 * exactly as the machine does. That is a CONFIG-layer value, so it outranks
 * the global `transport.profile` and is outranked by everything above it.
 */
export function explainRoleTransport(
  config: RouterConfig,
  role: string,
  cliFlag?: string | null,
  root?: string | null,
): TransportReading {
  const declared = declaredTransport(config, role);
  const global = explainTransport(config, cliFlag, root);
  if (declared === null) return global;
  const own: TransportLayer = {
    source: `roles.${role}.transport`,
    value: declared,
  };
  const above = global.layers.filter((layer) => layer.source === TRANSPORT_SOURCE_FLAG);
  const layers = [...above, own, ...global.layers.filter((layer) => !above.includes(layer))];
  const decided = layers[0] as TransportLayer;
  const normalized = decided.value.trim().toLowerCase();
  if (!(VALID_TRANSPORTS as readonly string[]).includes(normalized)) {
    throw new ConfigError(
      `${decided.source} must be one of ${renderList(VALID_TRANSPORTS)}, ` +
        `got '${decided.value}'`,
    );
  }
  return { transport: normalized, decidedBy: decided.source, layers };
}

/**
 * The vehicle BOTH reviewing roles are dispatched over, and which layer
 * decided it.
 *
 * **One reviewing vehicle, not one per reviewing role.** The auxiliary had
 * its own from the day the roles were named: state that existed, reached
 * dispatch, and that no surface could show or set -- so the one thing it
 * could reliably do was differ from what an operator believed without any
 * way for them to find out. The two reviewers differ in what they may not
 * BE, which is the whole of their definition; how they are reached is one
 * question with one answer.
 *
 * The layers are the machine's, one tier in: this CHECKOUT's committed
 * setting, then this PERSON's default, then `roles.reviewer.transport` in
 * the loaded config -- a CONFIG-layer value, so it outranks the global
 * `transport.profile` and is outranked by everything above it. Nothing
 * naming a reviewing vehicle resolves exactly as the machine does, which is
 * what keeps a repository that never wanted two vehicles from acquiring one.
 *
 * **A stale auxiliary key with a DIFFERENT value is a stop.** Collapsing two
 * live values by picking one is how state stops matching the record: the
 * round would be dispatched over a vehicle the document does not say, and
 * nothing would ever say which. Where the two agree there is nothing to
 * decide and the old key is simply ignored.
 */
export function explainReviewingTransport(
  config: RouterConfig,
  cliFlag?: string | null,
  root?: string | null,
): TransportReading {
  const reviewing = declaredTransport(config, "reviewer");
  const auxiliary = declaredTransport(config, "auxiliary-reviewer");
  if (
    auxiliary !== null &&
    auxiliary.trim().toLowerCase() !== (reviewing ?? "").trim().toLowerCase()
  ) {
    throw new ConfigError(
      `${STALE_AUXILIARY_TRANSPORT_KEY} says '${auxiliary}' and ` +
        (reviewing === null
          ? `${REVIEWING_TRANSPORT_KEY} says nothing`
          : `${REVIEWING_TRANSPORT_KEY} says '${reviewing}'`) +
        ". There is one reviewing vehicle now, and nothing may choose between " +
        "two live values on your behalf. Delete " +
        `${STALE_AUXILIARY_TRANSPORT_KEY}, or set both to the same value.`,
    );
  }
  const checkout = root ?? projectRoot();
  const named: Array<readonly [string, string | null]> = [
    [REVIEWING_SOURCE_SETTINGS, checkoutSettings(checkout)[SETTING_REVIEWER_TRANSPORT] ?? null],
    [REVIEWING_SOURCE_PREFERENCES, personalTransport("reviewer_transport")],
    [REVIEWING_TRANSPORT_KEY, reviewing],
  ];
  const own = named
    .filter(([, value]) => value !== null)
    .map(([source, value]) => ({ source, value: value as string }));
  const global = explainTransport(config, cliFlag, root);
  if (own.length === 0) return global;
  // The flag is still above every one of them: a reviewing vehicle is a
  // configured default, not an override of what the operator typed at this
  // call.
  const above = global.layers.filter((layer) => layer.source === TRANSPORT_SOURCE_FLAG);
  const layers = [...above, ...own, ...global.layers.filter((layer) => !above.includes(layer))];
  const decided = layers[0] as TransportLayer;
  const normalized = decided.value.trim().toLowerCase();
  if (!(VALID_TRANSPORTS as readonly string[]).includes(normalized)) {
    throw new ConfigError(
      `${decided.source} must be one of ${renderList(VALID_TRANSPORTS)}, ` +
        `got '${decided.value}'`,
    );
  }
  return { transport: normalized, decidedBy: decided.source, layers };
}

// --- Writing what the operator chose ----------------------------------------
//
// One writer, and it is here because this module is what decides what a
// choice MEANS -- a second writer somewhere else would eventually write a
// key this reader refuses, or write it at a layer that something above
// silently overrides.
//
// **It writes the CHECKOUT's settings file, at the top of the file layers.**
// It used to write `local-overrides.yaml`, which is where a machine's choice
// belonged while that was the only file below a flag. It is not any more:
// a personal default in `preferences.json` now sits above the overlay, so a
// verb that kept writing the overlay would report success and change
// nothing -- which is the exact shape of the shadowing this session exists
// to delete. The overlay stays a config SOURCE and is still read; it is no
// longer what a control writes.

/** What the operator chose; an absent member is a thing they did not touch. */
export interface ConfigurationChoice {
  /** The machine's own vehicle. */
  readonly transport?: string;
  /** The vehicle the reviewing roles are dispatched over. */
  readonly reviewerTransport?: string;
  /** The model the engine's own CLI is launched on; "" clears it. */
  readonly authoringModel?: string;
}

/** What was written, and where. */
export interface ConfigurationWrite {
  readonly path: string;
  /** One line per setting changed, in the words a person reads. */
  readonly changed: readonly string[];
}

/**
 * Write the operator's choice into this checkout's own settings file,
 * keeping whatever else that file says.
 *
 * The document is EDITED rather than re-serialised from a parse: it is
 * shared with every other extension the operator has configured, and a
 * writer that dropped their comments and their unrelated settings would be
 * charging them for using a control. `settings.ts` owns that, and refuses a
 * file it cannot read rather than replacing it.
 *
 * This validates shape and nothing else. Whether a chosen reviewer may
 * review a chosen author is a question about selection, and it is asked
 * before this is called -- config.ts knowing about roles' semantics would
 * be an import cycle and, worse, a second home for a rule selection owns.
 */
export function writeConfigurationChoice(
  root: string,
  choice: ConfigurationChoice,
): ConfigurationWrite {
  const values: Partial<Record<SettingKey, string>> = {};
  if (choice.transport !== undefined) {
    values[SETTING_TRANSPORT] = normalizedTransport(choice.transport);
  }
  if (choice.reviewerTransport !== undefined) {
    values[SETTING_REVIEWER_TRANSPORT] = normalizedTransport(choice.reviewerTransport);
  }
  // A model id goes in as it was given: the catalog's id is what the caller
  // checked it against and what goes on the wire, and normalising it here
  // would drop the date suffix that makes a pin a pin.
  if (choice.authoringModel !== undefined) {
    values[SETTING_AUTHORING_MODEL] = choice.authoringModel.trim();
  }
  return writeSettings(root, values);
}

/** One transport name, as this framework spells it, or a refusal naming both. */
function normalizedTransport(value: string): string {
  const transport = value.trim().toLowerCase();
  if (transport !== "" && !(VALID_TRANSPORTS as readonly string[]).includes(transport)) {
    throw new ConfigError(
      `transport must be one of ${renderList(VALID_TRANSPORTS)}, got '${value}'`,
    );
  }
  return transport;
}

/**
 * Effective generation_params for a (model, task_type) pair: model-level
 * defaults overlaid by `task_type_params[task_type][model_name]`.
 */
export function resolveGenerationParams(
  provider: string,
  taskType: string,
  config: RouterConfig,
): Record<string, unknown> {
  const defaults = record(record(config["provider_defaults"])[provider]);
  const params = deepCopy(record(defaults["generation_params"]));
  const taskBlock = record(record(config["task_type_params"])[taskType]);
  const overrides = record(taskBlock[provider]);
  return deepMerge(params, overrides);
}

/**
 * What a direct-API dispatch needs that the catalog does not state.
 *
 * Keyed by provider and by nothing else: the catalog's id is what goes on the
 * wire, and everything here is a property of how this framework talks to that
 * vendor rather than of which model answers.
 */
export function providerDefaults(
  config: RouterConfig,
  provider: string,
): Record<string, unknown> {
  return record(record(config["provider_defaults"])[provider]);
}

// --- Prompt templates ---------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT =
  "You are an expert software engineer. Be direct and precise.";

/**
 * Resolve prompt templates relative to the config file's directory.
 *
 * System prompts: one consolidated file (`system_prompt_file` per model) with
 * an H2 section per provider slug. Task templates:
 * `prompt-templates/task-prompts.md` with an H1 section per task type (H1
 * because template bodies contain their own H2 headers). Verification
 * template: `verification.settings.prompt_template_file`.
 */
function loadPromptTemplates(config: RouterConfig, configDir: string): void {
  const sectionsCache = new Map<string, Record<string, string>>();

  const resolveRelative = (relative: string): string | null => {
    const candidate = join(configDir, relative);
    return existsSync(candidate) ? candidate : null;
  };

  const sectionsOf = (path: string, level: number): Record<string, string> => {
    const key = resolvePath(path);
    let sections = sectionsCache.get(key);
    if (!sections) {
      sections = splitSections(readText(path), level);
      sectionsCache.set(key, sections);
    }
    return sections;
  };

  // The system prompt file was always split by PROVIDER -- one H2 section per
  // provider slug -- and every model entry named the same file. Reading it
  // per provider is what it was already doing; it just used to store the
  // answer thirteen times, once per model.
  for (const [provider, defaults] of Object.entries(record(config["provider_defaults"]))) {
    if (!isRecord(defaults)) continue;
    const promptFile = defaults["system_prompt_file"];
    if (!promptFile || typeof promptFile !== "string") continue;
    const fullPath = resolveRelative(promptFile);
    if (fullPath === null) {
      defaults["_system_prompt"] = DEFAULT_SYSTEM_PROMPT;
      continue;
    }
    const sections = sectionsOf(fullPath, 2);
    if (Object.keys(sections).length === 0) {
      defaults["_system_prompt"] = readText(fullPath).trim();
      continue;
    }
    defaults["_system_prompt"] = sections[provider.trim().toLowerCase()] ?? DEFAULT_SYSTEM_PROMPT;
  }

  config["_task_templates"] = {};
  const taskFile = join(configDir, "prompt-templates", "task-prompts.md");
  if (existsSync(taskFile)) {
    config["_task_templates"] = sectionsOf(taskFile, 1);
  }

  const templateFile = record(record(config["verification"])["settings"])[
    "prompt_template_file"
  ];
  config["_verification_template"] = "";
  if (templateFile && typeof templateFile === "string") {
    const path = resolveRelative(templateFile);
    if (path !== null) {
      config["_verification_template"] = readText(path).trim();
    }
  }
}

/**
 * Split markdown by `#`-headers of exactly the given level, mapping slugified
 * header text to section body. Content before the first header is preamble and
 * discarded; deeper headers stay inside their section.
 */
export function splitSections(
  text: string,
  headerLevel: number,
): Record<string, string> {
  const prefix = "#".repeat(headerLevel) + " ";
  const sections: Record<string, string> = {};
  let currentSlug: string | null = null;
  let currentLines: string[] = [];

  // Python splits on any line boundary; the callers hand this universal
  // newlines already, and a caller that does not still gets Python's answer.
  for (const line of text.split(/\r\n|[\n\r]/)) {
    if (line.startsWith(prefix)) {
      if (currentSlug !== null) {
        sections[currentSlug] = currentLines.join("\n").trim();
      }
      const headerText = line.slice(prefix.length).trim();
      currentSlug = headerText.toLowerCase().replace(/ /g, "-").replace(/_/g, "-");
      currentLines = [];
    } else if (currentSlug !== null) {
      currentLines.push(line);
    }
  }
  if (currentSlug !== null) {
    sections[currentSlug] = currentLines.join("\n").trim();
  }
  return sections;
}
